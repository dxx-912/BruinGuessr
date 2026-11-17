-- Phase 6b: versus becomes a health battle.
--
--   * Every player starts with versus_start_health (6,000).
--   * Each round is scored as before. Each player then loses
--     (the round's best score − their score) × the round's multiplier.
--     The round's best scorer loses nothing.
--   * The multiplier is versus_multiplier_base (1.0) until round
--     versus_multiplier_from_round (5), where it starts rising by
--     versus_multiplier_step (0.5) a round: 1, 1, 1, 1, 1.5, 2, 2.5, …
--   * A player at 0 health is out and watches the rest. The game ends when one
--     player is left. If the last players all reach 0 in the same round, the
--     one with the most health left after that round's damage wins.
--   * The first guess in a round cuts everyone's remaining time to
--     versus_first_lock_seconds (10), if they had more than that.
--   * A versus game has no fixed number of rounds (games.round_count is null).
--     Each round's photo is picked when the round opens, never one already used
--     in the game. If the photos run out, the most health wins.
--   * The leaderboard counts solo games only.
--
-- Same rules as before: every table is server only (RLS on, no client
-- policies, no grants), every function is callable with the secret key alone,
-- and a versus request locks the room row first and the game row second.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
alter table public.settings
  add column versus_start_health integer not null default 6000 check (versus_start_health > 0),
  add column versus_multiplier_base numeric(6, 2) not null default 1.0 check (versus_multiplier_base > 0),
  add column versus_multiplier_from_round integer not null default 5 check (versus_multiplier_from_round >= 1),
  add column versus_multiplier_step numeric(6, 2) not null default 0.5 check (versus_multiplier_step >= 0),
  add column versus_first_lock_seconds integer not null default 10 check (versus_first_lock_seconds between 1 and 600);

comment on column public.settings.versus_start_health is 'Versus: the health every player starts with.';
comment on column public.settings.versus_multiplier_from_round is 'Versus: the first round whose damage multiplier is above the base (base + step).';
comment on column public.settings.versus_first_lock_seconds is 'Versus: once someone locks in, everyone else has at most this long left.';

-- ---------------------------------------------------------------------------
-- 2. Columns for health
-- ---------------------------------------------------------------------------
-- A versus game runs until one player is left: no fixed number of rounds.
alter table public.games
  alter column round_count drop not null,
  add column start_health integer check (start_health is null or start_health > 0);
comment on column public.games.round_count is 'Rounds in the game. Null for versus: it runs until one player is left.';

alter table public.game_players
  -- Versus only. Health left (never below 0), the round the player was knocked
  -- out in, and where they finished (1 is the winner; set when they are out or
  -- the game ends).
  add column health integer check (health is null or health >= 0),
  add column eliminated_round integer check (eliminated_round is null or eliminated_round >= 1),
  add column final_place integer check (final_place is null or final_place >= 1);

alter table public.game_rounds
  -- Versus: the damage multiplier, fixed when the round opens.
  add column multiplier numeric(8, 2) check (multiplier is null or multiplier > 0),
  -- Versus: when the first guess cut everyone's remaining time (null if it did not).
  add column cut_at timestamptz;

alter table public.guesses
  -- Versus: health lost this round, and health after it. health_after is not
  -- clamped at 0, so players knocked out in the same round can be ranked.
  add column damage integer check (damage is null or damage >= 0),
  add column health_after integer;

-- ---------------------------------------------------------------------------
-- 3. The multiplier for a round
-- ---------------------------------------------------------------------------
create function public._versus_multiplier(p_round integer)
returns numeric
language sql
stable
set search_path = ''
as $$
  select s.versus_multiplier_base
    + s.versus_multiplier_step * greatest(0, p_round - s.versus_multiplier_from_round + 1)
  from public.settings s;
$$;

-- ---------------------------------------------------------------------------
-- 4. Picking photos never repeats one already in the game
-- ---------------------------------------------------------------------------
-- As before, plus: a photo already used in p_exclude_game is never picked, so a
-- versus game can ask for one more photo each round.
create or replace function public._pick_images(p_users uuid[], p_count integer, p_exclude_game uuid)
returns uuid[]
language sql
volatile
set search_path = ''
as $$
  with recent_games as (
    select t.game_id
    from (
      select gp.game_id, row_number() over (partition by gp.user_id order by g.created_at desc) as n
      from public.game_players gp
      join public.games g on g.id = gp.game_id
      where gp.user_id = any (p_users) and g.id <> p_exclude_game
    ) t
    cross join public.settings s
    where t.n <= s.avoid_recent_games
  ),
  seen as (
    select gr.image_id, max(gr.opened_at) as last_seen
    from public.game_rounds gr
    where gr.game_id in (select game_id from recent_games) and gr.opened_at is not null
    group by gr.image_id
  )
  select array_agg(t.id)
  from (
    select i.id
    from public.images i
    left join seen on seen.image_id = i.id
    where not i.hidden
      and not exists (select 1 from public.game_rounds used where used.game_id = p_exclude_game and used.image_id = i.id)
    order by
      exists (select 1 from public.image_reports ir where ir.image_id = i.id and ir.user_id = any (p_users)),
      seen.image_id is not null,
      seen.last_seen asc nulls first,
      random()
    limit p_count
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- 5. Ending a versus game
-- ---------------------------------------------------------------------------
-- Ends the game with the players still standing ranked by health (level
-- health shares a place). Used when the photos run out; normally a game ends
-- in _resolve_round when one player is left.
create function public._versus_finish(p_game uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.game_players gp
  set final_place = 1 + (
    select count(*) from public.game_players o
    where o.game_id = gp.game_id and o.eliminated_round is null and o.health > gp.health
  )
  where gp.game_id = p_game and gp.eliminated_round is null;

  update public.games
  set status = 'completed', completed_at = now()
  where id = p_game and status = 'active';
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Scoring a round
-- ---------------------------------------------------------------------------
-- Scores every pin for one round and closes it. Solo: finishes the game after
-- the last round. Versus: takes the damage, knocks out anyone at 0, and
-- finishes the game when one player (or none) is left. Callers hold the lock
-- on the game row.
create or replace function public._resolve_round(p_game uuid, p_round integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lng double precision;
  v_mode text;
  v_mult numeric;
  v_best integer;
  v_standing integer;
begin
  select i.lat, i.lng, g.mode, coalesce(gr.multiplier, public._versus_multiplier(p_round))
  into strict v_lat, v_lng, v_mode, v_mult
  from public.game_rounds gr
  join public.images i on i.id = gr.image_id
  join public.games g on g.id = gr.game_id
  where gr.game_id = p_game and gr.round_no = p_round and gr.resolved_at is null;

  -- Every player still in the game gets a row; no pin means no distance and 0
  -- points. Players already knocked out are watching and get no row.
  insert into public.guesses (game_id, round_no, user_id)
  select gp.game_id, p_round, gp.user_id
  from public.game_players gp
  where gp.game_id = p_game and gp.eliminated_round is null
  on conflict (game_id, round_no, user_id) do nothing;

  update public.guesses gu
  set locked_at = coalesce(gu.locked_at, now()),
      distance_m = case when gu.lat is null then null
                        else public.haversine_m(gu.lat, gu.lng, v_lat, v_lng) end,
      score = case when gu.lat is null then 0
                   else public.score_for_distance(public.haversine_m(gu.lat, gu.lng, v_lat, v_lng)) end
  where gu.game_id = p_game and gu.round_no = p_round;

  update public.game_rounds
  set resolved_at = now()
  where game_id = p_game and round_no = p_round;

  update public.game_players gp
  set total_score = (
    select coalesce(sum(gu.score), 0)
    from public.guesses gu
    where gu.game_id = gp.game_id and gu.user_id = gp.user_id
  )
  where gp.game_id = p_game;

  if v_mode <> 'versus' then
    update public.games
    set status = 'completed', completed_at = now()
    where id = p_game and status = 'active' and current_round = round_count and p_round = round_count;
    return;
  end if;

  -- Damage: (the round's best score − this player's score) × the multiplier,
  -- rounded half up. The best scorer loses nothing.
  select max(gu.score) into v_best
  from public.guesses gu
  join public.game_players gp on gp.game_id = gu.game_id and gp.user_id = gu.user_id
  where gu.game_id = p_game and gu.round_no = p_round and gp.eliminated_round is null;

  update public.guesses gu
  set damage = floor((v_best - gu.score) * v_mult + 0.5)::integer,
      health_after = gp.health - floor((v_best - gu.score) * v_mult + 0.5)::integer
  from public.game_players gp
  where gp.game_id = gu.game_id and gp.user_id = gu.user_id
    and gu.game_id = p_game and gu.round_no = p_round
    and gp.eliminated_round is null;

  update public.game_players gp
  set health = greatest(0, gu.health_after),
      eliminated_round = case when gu.health_after <= 0 then p_round end
  from public.guesses gu
  where gu.game_id = gp.game_id and gu.user_id = gp.user_id
    and gp.game_id = p_game and gu.round_no = p_round
    and gp.eliminated_round is null;

  select count(*) into v_standing
  from public.game_players
  where game_id = p_game and eliminated_round is null;

  -- Players knocked out this round finish behind everyone still standing,
  -- ranked among themselves by the health they were left with (most first;
  -- level shares a place). If nobody is left standing, the best of them wins.
  update public.game_players gp
  set final_place = v_standing + 1 + (
    select count(*)
    from public.guesses o
    where o.game_id = p_game and o.round_no = p_round
      and o.health_after <= 0 and o.health_after > gu.health_after
  )
  from public.guesses gu
  where gu.game_id = gp.game_id and gu.user_id = gp.user_id
    and gp.game_id = p_game and gu.round_no = p_round
    and gp.eliminated_round = p_round;

  if v_standing <= 1 then
    update public.game_players
    set final_place = 1
    where game_id = p_game and eliminated_round is null;

    update public.games
    set status = 'completed', completed_at = now()
    where id = p_game and status = 'active';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Who the round waits for
-- ---------------------------------------------------------------------------
-- True when nobody who is still playing and still here has a guess to make.
-- Players who are out are watching, and are never waited for.
create or replace function public._everyone_in(p_game uuid, p_round integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (
    select 1
    from public.game_players gp
    join public.games g on g.id = gp.game_id
    cross join public.settings s
    left join public.guesses gu
      on gu.game_id = gp.game_id and gu.user_id = gp.user_id and gu.round_no = p_round
    left join public.room_members m
      on m.room_id = g.room_id and m.user_id = gp.user_id
    where gp.game_id = p_game
      and gp.eliminated_round is null
      and gu.locked_at is null
      and (
        g.room_id is null
        or (m.left_at is null and m.last_seen_at > now() - make_interval(secs => s.presence_ms / 1000.0))
      )
  );
$$;

-- Scores the current round if its clock (plus grace) has run out, or, in a
-- versus game, if everyone still here has guessed. A versus round nobody has
-- guessed in yet runs on its clock, so a room where only knocked-out players
-- are watching does not race through rounds.
create or replace function public._settle_game(p_game uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_round integer;
  v_expired boolean;
  v_versus boolean;
begin
  select gr.round_no,
         gr.deadline_at + make_interval(secs => s.guess_grace_ms / 1000.0) <= now(),
         g.mode = 'versus'
  into v_round, v_expired, v_versus
  from public.games g
  join public.game_rounds gr on gr.game_id = g.id and gr.round_no = g.current_round
  cross join public.settings s
  where g.id = p_game
    and g.status = 'active'
    and gr.opened_at is not null
    and gr.resolved_at is null;

  if found and (
    v_expired
    or (
      v_versus
      and exists (
        select 1 from public.guesses gu
        where gu.game_id = p_game and gu.round_no = v_round and gu.locked_at is not null
      )
      and public._everyone_in(p_game, v_round)
    )
  ) then
    perform public._resolve_round(p_game, v_round);
  end if;
end;
$$;

-- Why a pin was not accepted, or null if the round is open for this player.
-- New: a versus player who is out may watch but not guess.
create or replace function public._round_closed_reason(p_game public.games, p_user uuid, p_round integer)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_round public.game_rounds;
  v_grace_ms integer;
begin
  if p_game.status <> 'active' or p_round is distinct from p_game.current_round then
    return 'round_closed';
  end if;
  select * into v_round from public.game_rounds where game_id = p_game.id and round_no = p_round;
  if not found or v_round.opened_at is null or v_round.resolved_at is not null then
    return 'round_closed';
  end if;
  if exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game.id and gp.user_id = p_user and gp.eliminated_round is not null
  ) then
    return 'eliminated';
  end if;
  select guess_grace_ms into v_grace_ms from public.settings;
  if now() > v_round.deadline_at + make_interval(secs => v_grace_ms / 1000.0) then
    return 'too_late';
  end if;
  if exists (
    select 1 from public.guesses gu
    where gu.game_id = p_game.id and gu.round_no = p_round and gu.user_id = p_user and gu.locked_at is not null
  ) then
    return 'locked';
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Locking a guess cuts everyone else's time
-- ---------------------------------------------------------------------------
create or replace function public.lock_guess(
  p_game uuid, p_user uuid, p_round integer,
  p_lat double precision default null, p_lng double precision default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games;
  v_reason text;
  v_has_pin boolean;
begin
  if (p_lat is null) <> (p_lng is null)
     or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('error', 'bad_pin');
  end if;

  v_game := public._lock_game(p_game, p_user);
  if v_game.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  v_reason := public._round_closed_reason(v_game, p_user, p_round);
  if v_reason = 'eliminated' then
    return jsonb_build_object('error', 'eliminated');
  end if;
  if v_reason is not null then
    perform public._settle_game(p_game);
    if v_game.room_id is not null then
      perform public._room_upkeep(v_game.room_id);
    end if;
    return public._build_state(p_game, p_user);
  end if;

  if p_lat is not null then
    insert into public.guesses (game_id, round_no, user_id, lat, lng, placed_at)
    values (p_game, p_round, p_user, p_lat, p_lng, now())
    on conflict (game_id, round_no, user_id)
    do update set lat = excluded.lat, lng = excluded.lng, placed_at = excluded.placed_at;
  end if;

  select exists (
    select 1 from public.guesses gu
    where gu.game_id = p_game and gu.round_no = p_round and gu.user_id = p_user and gu.lat is not null
  ) into v_has_pin;
  if not v_has_pin then
    return jsonb_build_object('error', 'no_pin');
  end if;

  update public.guesses
  set locked_at = now()
  where game_id = p_game and round_no = p_round and user_id = p_user;

  -- Versus: the first guess leaves everyone else at most versus_first_lock_seconds,
  -- counted from now or from when the clock starts, whichever is later. least()
  -- makes later guesses (and two guesses at the same moment) change nothing more.
  if v_game.mode = 'versus' then
    update public.game_rounds gr
    set cut_at = case when cut.deadline < gr.deadline_at then coalesce(gr.cut_at, now()) else gr.cut_at end,
        deadline_at = least(gr.deadline_at, cut.deadline)
    from (
      select greatest(now(), r.started_at) + make_interval(secs => s.versus_first_lock_seconds) as deadline
      from public.game_rounds r
      cross join public.settings s
      where r.game_id = p_game and r.round_no = p_round
    ) cut
    where gr.game_id = p_game and gr.round_no = p_round;
  end if;

  if public._everyone_in(p_game, p_round) then
    perform public._resolve_round(p_game, p_round);
  end if;
  if v_game.room_id is not null then
    perform public._room_upkeep(v_game.room_id);
  end if;

  return public._build_state(p_game, p_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Starting a versus game
-- ---------------------------------------------------------------------------
-- As in Phase 4, but: no fixed round count, everyone starts with full health,
-- and only round one's photo is picked now (the rest as each round opens).
create or replace function public.start_room_game(p_code text, p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.settings;
  v_room public.rooms;
  v_game public.games;
  v_players uuid[];
  v_picked uuid[];
  v_start timestamptz;
begin
  select * into strict v_settings from public.settings;
  select * into v_room from public.rooms where code = upper(p_code) and status <> 'closed' for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  update public.room_members
  set last_seen_at = now(), left_at = null
  where room_id = v_room.id and user_id = p_user;
  perform public._room_upkeep(v_room.id);
  select * into v_room from public.rooms where id = v_room.id;

  if not exists (select 1 from public.room_members where room_id = v_room.id and user_id = p_user) then
    return jsonb_build_object('error', 'not_in_room');
  end if;
  if v_room.status = 'playing' then
    return public._room_state(v_room.id, p_user);
  end if;
  if v_room.host_id is distinct from p_user then
    return jsonb_build_object('error', 'not_host');
  end if;
  update public.room_members set ready = true where room_id = v_room.id and user_id = p_user;

  select array_agg(m.user_id order by m.seat) into v_players
  from public.room_members m
  where m.room_id = v_room.id and m.ready;
  if coalesce(array_length(v_players, 1), 0) < v_settings.versus_min_players then
    return jsonb_build_object('error', 'need_players');
  end if;

  delete from public.room_members where room_id = v_room.id and not ready;

  insert into public.games (mode, created_by, room_id, round_count, start_health)
  values ('versus', p_user, v_room.id, null, v_settings.versus_start_health)
  returning * into v_game;

  insert into public.game_players (game_id, user_id, seat, health)
  select v_game.id, m.user_id, m.seat, v_settings.versus_start_health
  from public.room_members m
  where m.room_id = v_room.id;

  v_picked := public._pick_images(v_players, 1, v_game.id);
  if coalesce(array_length(v_picked, 1), 0) < 1 then
    raise exception 'no photos in rotation to start a game';
  end if;

  v_start := now() + make_interval(secs => v_settings.versus_intro_ms / 1000.0);
  insert into public.game_rounds (game_id, round_no, image_id, opened_at, started_at, deadline_at, multiplier)
  values (
    v_game.id, 1, v_picked[1], now(), v_start,
    v_start + make_interval(secs => v_game.round_seconds),
    public._versus_multiplier(1)
  );
  update public.games set current_round = 1 where id = v_game.id;

  update public.rooms
  set status = 'playing', game_id = v_game.id, games_played = games_played + 1
  where id = v_room.id;

  return public._room_state(v_room.id, p_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Opening the next round
-- ---------------------------------------------------------------------------
-- As in Phase 4. A versus game also picks the new round's photo here (none
-- already used in the game) and fixes its multiplier; with no photo left, the
-- game ends and the most health wins.
create or replace function public.start_round(p_game uuid, p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.settings;
  v_game public.games;
  v_current public.game_rounds;
  v_may_open boolean;
  v_next integer;
  v_start timestamptz;
  v_players uuid[];
  v_picked uuid[];
begin
  select * into strict v_settings from public.settings;
  v_game := public._lock_game(p_game, p_user);
  if v_game.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  perform public._settle_game(p_game);
  if v_game.room_id is not null then
    perform public._room_upkeep(v_game.room_id);
  end if;
  select * into v_game from public.games where id = p_game;

  if v_game.status = 'active' and (v_game.round_count is null or v_game.current_round < v_game.round_count) then
    select * into v_current
    from public.game_rounds gr
    where gr.game_id = p_game and gr.round_no = v_game.current_round;

    if v_game.current_round = 0 then
      v_may_open := true;
    elsif v_current.resolved_at is null then
      v_may_open := false;
    elsif v_game.mode = 'versus' then
      v_may_open :=
        now() >= v_current.resolved_at + make_interval(secs => v_settings.versus_reveal_ms / 1000.0)
        or exists (select 1 from public.rooms r where r.id = v_game.room_id and r.host_id = p_user);
    else
      v_may_open := true;
    end if;

    if v_may_open then
      v_next := v_game.current_round + 1;

      if v_game.mode = 'versus'
         and not exists (select 1 from public.game_rounds where game_id = p_game and round_no = v_next) then
        select array_agg(gp.user_id) into v_players from public.game_players gp where gp.game_id = p_game;
        v_picked := public._pick_images(v_players, 1, p_game);
        if coalesce(array_length(v_picked, 1), 0) < 1 then
          perform public._versus_finish(p_game);
          if v_game.room_id is not null then
            perform public._room_upkeep(v_game.room_id);
          end if;
          return public._build_state(p_game, p_user);
        end if;
        insert into public.game_rounds (game_id, round_no, image_id) values (p_game, v_next, v_picked[1]);
      end if;

      v_start := now() + make_interval(
        secs => (case when v_game.mode = 'versus' then v_settings.versus_intro_ms else v_settings.intro_ms end) / 1000.0
      );
      update public.game_rounds
      set opened_at = now(),
          started_at = v_start,
          deadline_at = v_start + make_interval(secs => v_game.round_seconds),
          multiplier = case when v_game.mode = 'versus' then public._versus_multiplier(v_next) end
      where game_id = p_game and round_no = v_next;
      update public.games set current_round = v_next where id = p_game;
    end if;
  end if;

  return public._build_state(p_game, p_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. What a player may know about their game right now
-- ---------------------------------------------------------------------------
-- As before (nothing about a photo until its round is scored), plus health:
--   round:   the multiplier, and whether the first guess cut the clock;
--   results: per player, the damage taken and the health left;
--   versus:  each player's health, the round they were knocked out in, and
--            their place once it is decided.
create or replace function public._build_state(p_game uuid, p_user uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', g.id,
    'mode', g.mode,
    'status', g.status,
    'roundCount', g.round_count,
    'roundSeconds', g.round_seconds,
    'currentRound', g.current_round,
    'serverNow', public._ms(clock_timestamp()),
    'totalScore', gp.total_score,
    'round', (
      select jsonb_build_object(
        'number', gr.round_no,
        'startsAt', public._ms(gr.started_at),
        'deadlineAt', public._ms(gr.deadline_at),
        'graceMs', s.guess_grace_ms,
        'pin', (
          select jsonb_build_object('lat', gu.lat, 'lng', gu.lng)
          from public.guesses gu
          where gu.game_id = g.id and gu.round_no = gr.round_no and gu.user_id = p_user and gu.lat is not null
        ),
        'locked', exists (
          select 1 from public.guesses gu
          where gu.game_id = g.id and gu.round_no = gr.round_no and gu.user_id = p_user and gu.locked_at is not null
        ),
        'multiplier', gr.multiplier,
        'shortened', gr.cut_at is not null
      )
      from public.game_rounds gr
      where g.status = 'active'
        and gr.game_id = g.id
        and gr.round_no = g.current_round
        and gr.opened_at is not null
        and gr.resolved_at is null
    ),
    'results', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'round', gr.round_no,
          'guess', case when gu.lat is null then null else jsonb_build_object('lat', gu.lat, 'lng', gu.lng) end,
          'answer', jsonb_build_object('lat', i.lat, 'lng', i.lng),
          'distanceM', gu.distance_m,
          'score', coalesce(gu.score, 0),
          'credit', jsonb_build_object(
            'photographer', i.photographer,
            'source', i.source,
            'license', i.license,
            'licenseUrl', i.license_url
          ),
          'reported', exists (
            select 1 from public.image_reports ir where ir.image_id = i.id and ir.user_id = p_user
          ),
          'multiplier', gr.multiplier,
          -- Versus: every player who played this round (not those already out), by seat.
          'players', case when g.mode = 'versus' then (
            select jsonb_agg(
              jsonb_build_object(
                'seat', gp2.seat,
                'guess', case when gu2.lat is null then null else jsonb_build_object('lat', gu2.lat, 'lng', gu2.lng) end,
                'distanceM', gu2.distance_m,
                'score', coalesce(gu2.score, 0),
                'damage', gu2.damage,
                'health', case when gu2.health_after is not null then greatest(0, gu2.health_after) end,
                'eliminated', coalesce(gu2.health_after <= 0, false)
              )
              order by gp2.seat
            )
            from public.game_players gp2
            join public.guesses gu2
              on gu2.game_id = gp2.game_id and gu2.round_no = gr.round_no and gu2.user_id = gp2.user_id
            where gp2.game_id = g.id
          ) end
        )
        order by gr.round_no
      )
      from public.game_rounds gr
      join public.images i on i.id = gr.image_id
      left join public.guesses gu
        on gu.game_id = gr.game_id and gu.round_no = gr.round_no and gu.user_id = p_user
      where gr.game_id = g.id and gr.resolved_at is not null
    ), '[]'::jsonb),
    'versus', case when g.mode = 'versus' then (
      select jsonb_build_object(
        'code', case when r.status <> 'closed' then r.code end,
        'channel', 'room-' || r.id,
        'seat', gp.seat,
        'isHost', coalesce(r.game_id = g.id and r.host_id = p_user, false),
        -- Null for a game played before health (Phase 4).
        'startHealth', g.start_health,
        -- When the next round opens by itself, and its multiplier: only between rounds.
        'nextRoundAt', (
          select public._ms(gr.resolved_at + make_interval(secs => s.versus_reveal_ms / 1000.0))
          from public.game_rounds gr
          where g.status = 'active' and (g.round_count is null or g.current_round < g.round_count)
            and gr.game_id = g.id and gr.round_no = g.current_round and gr.resolved_at is not null
        ),
        'nextMultiplier', case when g.status = 'active' then public._versus_multiplier(g.current_round + 1) end,
        'rematch', jsonb_build_object(
          'state', case
            when r.id is null or r.status = 'closed' then 'closed'
            when r.status = 'lobby' then 'open'
            when r.game_id = g.id then 'playing'
            when exists (select 1 from public.game_players x where x.game_id = r.game_id and x.user_id = p_user) then 'open'
            else 'started'
          end,
          'ready', (select count(*) from public.room_members m where m.room_id = r.id and m.ready and r.status = 'lobby')
        ),
        'players', (
          select jsonb_agg(
            jsonb_build_object(
              'seat', gp2.seat,
              'username', coalesce(p.username, 'Player ' || gp2.seat),
              'total', gp2.total_score,
              'health', gp2.health,
              'eliminatedRound', gp2.eliminated_round,
              'place', gp2.final_place,
              'isYou', gp2.user_id = p_user,
              'isHost', coalesce(r.game_id = g.id and r.host_id = gp2.user_id, false),
              'away', g.status = 'active' and (
                m.user_id is null
                or m.left_at is not null
                or m.last_seen_at <= now() - make_interval(secs => s.presence_ms / 1000.0)
              ),
              'locked', exists (
                select 1 from public.guesses gu
                where gu.game_id = g.id and gu.round_no = g.current_round
                  and gu.user_id = gp2.user_id and gu.locked_at is not null
              )
            )
            order by gp2.seat
          )
          from public.game_players gp2
          join public.profiles p on p.id = gp2.user_id
          left join public.room_members m on m.room_id = r.id and m.user_id = gp2.user_id
          where gp2.game_id = g.id
        )
      )
      from (select 1) as one
      left join public.rooms r on r.id = g.room_id
    ) end
  )
  from public.games g
  join public.game_players gp on gp.game_id = g.id and gp.user_id = p_user
  cross join public.settings s
  where g.id = p_game;
$$;

-- ---------------------------------------------------------------------------
-- 12. The leaderboard counts solo games only
-- ---------------------------------------------------------------------------
create or replace view public.leaderboard_entries
with (security_invoker = true)
as
with best as (
  select distinct on (gp.user_id)
    gp.user_id,
    gp.game_id,
    gp.total_score as score,
    g.completed_at as reached_at,
    g.mode
  from public.game_players gp
  join public.games g on g.id = gp.game_id
  where g.status = 'completed' and g.completed_at is not null and g.mode = 'solo'
  order by gp.user_id, gp.total_score desc, g.completed_at asc, gp.game_id
)
select
  row_number() over (order by b.score desc, b.reached_at asc, b.user_id) as rank,
  b.user_id,
  p.username,
  b.score,
  b.reached_at,
  b.game_id,
  b.mode
from best b
join public.profiles p on p.id = b.user_id
where p.username is not null and not p.is_test and not p.is_guest;

revoke all on table public.leaderboard_entries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 13. Profiles: best game is solo only; a versus place is where they finished
-- ---------------------------------------------------------------------------
create or replace function public.player_profile(p_username text, p_viewer uuid, p_recent integer default 10)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with p as (
    select * from public.profiles
    where lower(username) = lower(p_username) and not is_guest
  ),
  played as (
    select g.id, g.mode, g.completed_at, g.round_count, gp.total_score, gp.final_place
    from p
    join public.game_players gp on gp.user_id = p.id
    join public.games g on g.id = gp.game_id
    where g.status = 'completed' and g.completed_at is not null
  ),
  versus as (
    select pl.id,
      coalesce(
        pl.final_place,
        1 + (select count(*) from public.game_players o where o.game_id = pl.id and o.total_score > pl.total_score)
      ) as place,
      (select count(*) from public.game_players o where o.game_id = pl.id) as players
    from played pl
    where pl.mode = 'versus'
  ),
  rounds as (
    select gu.score, gu.distance_m
    from p
    join public.guesses gu on gu.user_id = p.id
    join played pl on pl.id = gu.game_id
    where gu.score is not null
  ),
  recent as (
    select * from played order by completed_at desc limit greatest(0, least(p_recent, 30))
  )
  select jsonb_build_object(
    'username', p.username,
    'joinedAt', public._ms(p.created_at),
    'isYou', p_viewer is not null and p.id = p_viewer,
    'rank', (select le.rank from public.leaderboard_entries le where le.user_id = p.id),
    'stats', jsonb_build_object(
      'bestScore', (select max(total_score) from played where mode = 'solo'),
      'gamesPlayed', (select count(*) from played),
      'roundsPlayed', (select count(*) from rounds),
      'averageRound', (select round(avg(score))::integer from rounds),
      'bullseyes', (select count(*) from rounds r cross join public.settings s where r.score >= s.max_round_score),
      'versusPlayed', (select count(*) from versus),
      'versusWon', (select count(*) from versus where place = 1)
    ),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'mode', r.mode,
        'completedAt', public._ms(r.completed_at),
        'total', r.total_score,
        'roundCount', r.round_count,
        'place', v.place,
        'players', v.players,
        'rounds', coalesce((
          select jsonb_agg(jsonb_build_object('round', gu.round_no, 'distanceM', gu.distance_m, 'score', coalesce(gu.score, 0)) order by gu.round_no)
          from public.guesses gu
          where gu.game_id = r.id and gu.user_id = p.id
        ), '[]'::jsonb)
      ) order by r.completed_at desc)
      from recent r
      left join versus v on v.id = r.id
    ), '[]'::jsonb)
  )
  from p;
$$;

-- ---------------------------------------------------------------------------
-- 14. Games already in the database
-- ---------------------------------------------------------------------------
-- Finished Phase 4 games: places by total, as they were decided then.
update public.game_players gp
set final_place = 1 + (
  select count(*) from public.game_players o where o.game_id = gp.game_id and o.total_score > gp.total_score
)
from public.games g
where g.id = gp.game_id and g.mode = 'versus' and g.status = 'completed' and gp.final_place is null;

-- Versus games still in progress carry on under the new rules: full health,
-- no round limit, and a multiplier on every round (damage counts from the next
-- round scored).
update public.games g
set round_count = null, start_health = s.versus_start_health
from public.settings s
where g.mode = 'versus' and g.status = 'active';

update public.game_players gp
set health = g.start_health
from public.games g
where g.id = gp.game_id and g.mode = 'versus' and g.status = 'active' and gp.health is null;

update public.game_rounds gr
set multiplier = public._versus_multiplier(gr.round_no)
from public.games g
where g.id = gr.game_id and g.mode = 'versus' and g.status = 'active' and gr.multiplier is null;

-- ---------------------------------------------------------------------------
-- 15. Only the server may call any of this
-- ---------------------------------------------------------------------------
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        '_versus_multiplier', '_pick_images', '_versus_finish', '_resolve_round', '_everyone_in',
        '_settle_game', '_round_closed_reason', 'lock_guess', 'start_room_game', 'start_round',
        '_build_state', 'player_profile'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
