-- Phase 4: versus mode.
--
-- A versus game is the same game as a solo one, with more than one row in
-- game_players. The round clock, scoring, the per-round photo and the
-- leaderboard are the functions from the single player migration; this file
-- adds rooms (the lobby and who is in it) and teaches those functions the few
-- things that differ with several players:
--
--   * a round ends early when everyone who is still here has guessed,
--   * after a reveal the next round opens for everybody at the same moment
--     (the host can open it sooner),
--   * the game state lists the other players, and a finished round shows
--     every player's pin.
--
-- Same rules as before: every table is server only (RLS on, no client
-- policies, no grants), and every function is callable with the secret key
-- alone.
--
-- Locks: a versus request locks the room row first and the game row second,
-- everywhere, so two requests can never wait on each other.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
alter table public.settings
  add column versus_min_players integer not null default 2 check (versus_min_players >= 2),
  -- Five seats, five pin colours.
  add column versus_max_players integer not null default 5 check (versus_max_players between 2 and 5),
  -- A versus round opens this long before its clock starts. Longer than solo,
  -- so every player's screen has the photo before the clock runs.
  add column versus_intro_ms integer not null default 5000 check (versus_intro_ms between 0 and 15000),
  -- After a reveal, the next round opens by itself this long later.
  add column versus_reveal_ms integer not null default 20000 check (versus_reveal_ms between 3000 and 120000),
  -- A player not heard from for this long counts as away.
  add column presence_ms integer not null default 10000 check (presence_ms between 3000 and 120000),
  -- A player away from the lobby this long loses their seat (and, if they were
  -- the host, the host's chair), once someone else is in the room.
  add column lobby_idle_ms integer not null default 120000 check (lobby_idle_ms between 10000 and 3600000);

-- ---------------------------------------------------------------------------
-- 2. Test accounts stay off the leaderboard
-- ---------------------------------------------------------------------------
-- The development login creates test accounts in this same database, which
-- the live site also uses. Their games must never show on the public board.
alter table public.profiles add column is_test boolean not null default false;
comment on column public.profiles.is_test is 'Set by the development login. Test accounts never appear on the leaderboard.';

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
  where g.status = 'completed' and g.completed_at is not null
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
where p.username is not null and not p.is_test;

revoke all on table public.leaderboard_entries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rooms
-- ---------------------------------------------------------------------------
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  -- Five letters. No vowels (so no words), and none of 0 O 1 I.
  code text not null check (code ~ '^[BCDFGHJKLMNPQRSTVWXZ]{5}$'),
  -- lobby: open, waiting for the host to start. playing: locked, a game is on.
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'closed')),
  host_id uuid references public.profiles (id) on delete set null,
  -- The game being played, or the last one played.
  game_id uuid references public.games (id) on delete set null,
  games_played integer not null default 0,
  -- When the room last became a lobby (created, or a game ended).
  lobby_since timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
comment on table public.rooms is 'Versus rooms: a code, a host, and the game being played. Server only.';

-- A code is unique among rooms that are still open.
create unique index rooms_open_code_idx on public.rooms (code) where status <> 'closed';
create index rooms_game_idx on public.rooms (game_id);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- 1 to 5. Decides the player's colour, and stays theirs for the whole room.
  seat integer not null check (seat between 1 and 5),
  -- In the lobby and waiting for the next game. False after a game, until the
  -- player presses Rematch.
  ready boolean not null default true,
  joined_at timestamptz not null default now(),
  -- Updated every time this player's browser asks about the room or its game.
  last_seen_at timestamptz not null default now(),
  -- Set when the player leaves during a game. They keep their seat and can come back.
  left_at timestamptz,
  primary key (room_id, user_id),
  unique (room_id, seat)
);
comment on table public.room_members is 'Who is in each versus room. Server only.';

create index room_members_user_idx on public.room_members (user_id);

alter table public.games add column room_id uuid references public.rooms (id) on delete set null;
alter table public.game_players add column seat integer not null default 1 check (seat between 1 and 5);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
revoke all on table public.rooms, public.room_members from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Picking photos, for one player or several
-- ---------------------------------------------------------------------------
-- Preference order:
--   1. photos none of these players has reported,
--   2. photos not shown to any of them in their last few games,
--   3. among photos they have seen, the ones seen longest ago,
-- and random within each group.
create function public._pick_images(p_users uuid[], p_count integer, p_exclude_game uuid)
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
    order by
      exists (select 1 from public.image_reports ir where ir.image_id = i.id and ir.user_id = any (p_users)),
      seen.image_id is not null,
      seen.last_seen asc nulls first,
      random()
    limit p_count
  ) t;
$$;

-- The solo start, unchanged except that it picks photos through the function above.
create or replace function public.start_game(p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games;
  v_picked uuid[];
begin
  -- One at a time per player, so two quick clicks cannot both create a game.
  perform pg_advisory_xact_lock(hashtextextended('game:' || p_user::text, 0));

  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;

  update public.games
  set status = 'abandoned', abandoned_at = now()
  where created_by = p_user and mode = 'solo' and status = 'active';

  insert into public.games (created_by) values (p_user) returning * into v_game;
  insert into public.game_players (game_id, user_id) values (v_game.id, p_user);

  v_picked := public._pick_images(array[p_user], v_game.round_count, v_game.id);
  if coalesce(array_length(v_picked, 1), 0) < v_game.round_count then
    raise exception 'not enough photos in rotation to start a game (need %, have %)',
      v_game.round_count, coalesce(array_length(v_picked, 1), 0);
  end if;

  insert into public.game_rounds (game_id, round_no, image_id)
  select v_game.id, row_number() over (order by random()), picked.id
  from unnest(v_picked) as picked (id);

  return jsonb_build_object('id', v_game.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Keeping a room in order
-- ---------------------------------------------------------------------------
create function public._room_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('BCDFGHJKLMNPQRSTVWXZ', 1 + get_byte(u.bytes, i) % 20, 1), '')
  from (select uuid_send(gen_random_uuid()) as bytes) u, generate_series(0, 4) as i;
$$;

-- Run on every request that touches a room, by a caller holding the room's lock.
-- There is no background job: a game ending, a player drifting away and the
-- host changing are all noticed the next time anyone in the room asks.
create function public._room_upkeep(p_room uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.settings;
  v_room public.rooms;
  v_presence interval;
  v_someone_here boolean;
  v_host public.room_members;
  v_host_ok boolean;
  v_next uuid;
begin
  select * into strict v_settings from public.settings;
  select * into v_room from public.rooms where id = p_room;
  if not found or v_room.status = 'closed' then
    return;
  end if;
  v_presence := make_interval(secs => v_settings.presence_ms / 1000.0);

  -- The game is over: the room is a lobby again, and nobody is in the next
  -- game until they press Rematch. Players who left during the game are gone.
  if v_room.status = 'playing'
     and not exists (select 1 from public.games g where g.id = v_room.game_id and g.status = 'active') then
    delete from public.room_members where room_id = p_room and left_at is not null;
    update public.room_members set ready = false where room_id = p_room;
    update public.rooms set status = 'lobby', lobby_since = now() where id = p_room;
    v_room.status := 'lobby';
    v_room.lobby_since := now();
  end if;

  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room and m.left_at is null and m.last_seen_at > now() - v_presence
  ) into v_someone_here;

  -- Lobby: a player who has been away a long time loses their seat. Only while
  -- someone else is here, so a room is never emptied just by waiting.
  if v_room.status = 'lobby' and v_someone_here then
    delete from public.room_members
    where room_id = p_room
      and last_seen_at < now() - make_interval(secs => v_settings.lobby_idle_ms / 1000.0);
  end if;

  -- Everyone has left: the room closes, and a game nobody is playing is abandoned.
  if not exists (select 1 from public.room_members where room_id = p_room and left_at is null) then
    update public.rooms set status = 'closed', closed_at = now(), host_id = null where id = p_room;
    update public.games set status = 'abandoned', abandoned_at = now()
    where id = v_room.game_id and status = 'active';
    return;
  end if;

  -- The host. During a game the host has to be here. In the lobby the host has
  -- to be in the room, and after a game has to come back for the rematch
  -- within the time a reveal lasts once somebody else is waiting.
  select * into v_host from public.room_members where room_id = p_room and user_id = v_room.host_id;
  if v_host.user_id is null or v_host.left_at is not null then
    v_host_ok := false;
  elsif v_room.status = 'playing' then
    v_host_ok := v_host.last_seen_at > now() - v_presence;
  else
    v_host_ok := v_host.ready
      or now() < v_room.lobby_since + make_interval(secs => v_settings.versus_reveal_ms / 1000.0)
      or not exists (
        select 1 from public.room_members m
        where m.room_id = p_room and m.ready and m.last_seen_at > now() - v_presence
      );
  end if;

  if not v_host_ok then
    -- The next player: whoever joined earliest among those here now (in the
    -- lobby, those waiting for the next game first). If nobody is here, the
    -- host stays until somebody is.
    select m.user_id into v_next
    from public.room_members m
    where m.room_id = p_room and m.left_at is null and m.last_seen_at > now() - v_presence
      and m.user_id is distinct from v_room.host_id
    order by (v_room.status = 'lobby' and m.ready) desc, m.joined_at, m.seat
    limit 1;
    if v_next is not null then
      update public.rooms set host_id = v_next where id = p_room;
    end if;
  end if;
end;
$$;

-- What a member may know about their room.
create function public._room_state(p_room uuid, p_user uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'code', r.code,
    'status', r.status,
    'channel', 'room-' || r.id,
    'serverNow', public._ms(clock_timestamp()),
    'minPlayers', s.versus_min_players,
    'maxPlayers', s.versus_max_players,
    'gamesPlayed', r.games_played,
    'isHost', coalesce(r.host_id = p_user, false),
    'seat', me.seat,
    'ready', me.ready,
    -- The game to go to: only while one is on, and only for a player in it.
    'gameId', case when r.status = 'playing' and exists (
      select 1 from public.game_players gp where gp.game_id = r.game_id and gp.user_id = p_user
    ) then r.game_id end,
    'canStart', r.status = 'lobby' and coalesce(r.host_id = p_user, false) and (
      select count(*) from public.room_members m where m.room_id = r.id and m.ready
    ) >= s.versus_min_players,
    'members', (
      select jsonb_agg(
        jsonb_build_object(
          'seat', m.seat,
          'username', coalesce(p.username, 'Player ' || m.seat),
          'isHost', coalesce(m.user_id = r.host_id, false),
          'isYou', m.user_id = p_user,
          'ready', m.ready,
          'away', m.left_at is not null
            or m.last_seen_at <= now() - make_interval(secs => s.presence_ms / 1000.0)
        )
        order by m.seat
      )
      from public.room_members m
      join public.profiles p on p.id = m.user_id
      where m.room_id = r.id
    )
  )
  from public.rooms r
  join public.room_members me on me.room_id = r.id and me.user_id = p_user
  cross join public.settings s
  where r.id = p_room;
$$;

-- ---------------------------------------------------------------------------
-- 6. Hosting, joining, leaving
-- ---------------------------------------------------------------------------
create function public.create_room(p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_room uuid;
begin
  -- One at a time per player, so two quick clicks make one room.
  perform pg_advisory_xact_lock(hashtextextended('room:' || p_user::text, 0));
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;

  -- Housekeeping: rooms nobody has been in for six hours are closed, and their
  -- unfinished games abandoned.
  with stale as (
    update public.rooms r
    set status = 'closed', closed_at = now(), host_id = null
    where r.id in (
      select old.id
      from public.rooms old
      where old.status <> 'closed'
        and old.created_at < now() - interval '6 hours'
        and not exists (
          select 1 from public.room_members m
          where m.room_id = old.id and m.last_seen_at > now() - interval '6 hours'
        )
      for update skip locked
    )
    returning r.game_id
  )
  update public.games g
  set status = 'abandoned', abandoned_at = now()
  from stale
  where g.id = stale.game_id and g.status = 'active';

  loop
    begin
      insert into public.rooms (code, host_id, created_by)
      values (public._room_code(), p_user, p_user)
      returning id into v_room;
      exit;
    exception when unique_violation then
      -- That code is in use. Try another.
      null;
    end;
  end loop;

  insert into public.room_members (room_id, user_id, seat) values (v_room, p_user, 1);
  return public._room_state(v_room, p_user);
end;
$$;

-- Joins the room, comes back to it after a disconnect, or says "I'm in" for a
-- rematch: the same call for all three.
create function public.join_room(p_code text, p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.settings;
  v_room public.rooms;
  v_seat integer;
begin
  select * into strict v_settings from public.settings;
  select * into v_room from public.rooms where code = upper(p_code) and status <> 'closed' for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- Already in the room: they are here now.
  update public.room_members
  set last_seen_at = now(), left_at = null
  where room_id = v_room.id and user_id = p_user;

  perform public._room_upkeep(v_room.id);
  select * into v_room from public.rooms where id = v_room.id;
  if v_room.status = 'closed' then
    return jsonb_build_object('error', 'not_found');
  end if;

  if exists (select 1 from public.room_members where room_id = v_room.id and user_id = p_user) then
    if v_room.status = 'lobby' then
      update public.room_members set ready = true where room_id = v_room.id and user_id = p_user;
    end if;
  else
    -- The room locks once the game starts.
    if v_room.status = 'playing' then
      return jsonb_build_object('error', 'room_locked');
    end if;
    select min(s.seat) into v_seat
    from generate_series(1, v_settings.versus_max_players) as s (seat)
    where not exists (select 1 from public.room_members m where m.room_id = v_room.id and m.seat = s.seat);
    if v_seat is null then
      return jsonb_build_object('error', 'room_full');
    end if;
    insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
    insert into public.room_members (room_id, user_id, seat) values (v_room.id, p_user, v_seat);
  end if;

  perform public._room_upkeep(v_room.id);
  return public._room_state(v_room.id, p_user);
end;
$$;

-- Where the room stands. Also the heartbeat: asking is how the server knows a
-- player is still in the lobby.
create function public.room_state(p_code text, p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
  v_state jsonb;
begin
  select * into v_room from public.rooms where code = upper(p_code) and status <> 'closed' for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  update public.room_members
  set last_seen_at = now(), left_at = null
  where room_id = v_room.id and user_id = p_user;

  perform public._room_upkeep(v_room.id);
  v_state := public._room_state(v_room.id, p_user);
  if v_state is null then
    return jsonb_build_object('error', 'not_in_room');
  end if;
  return v_state;
end;
$$;

create function public.leave_room(p_code text, p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_room public.rooms;
begin
  select * into v_room from public.rooms where code = upper(p_code) and status <> 'closed' for update;
  if not found then
    return jsonb_build_object('ok', true);
  end if;

  -- If the game just ended, the room is a lobby by now.
  perform public._room_upkeep(v_room.id);
  select * into v_room from public.rooms where id = v_room.id;

  if v_room.status = 'playing' then
    -- Mid-game: keep the seat so the player can come back. Rounds they miss score 0.
    update public.room_members set left_at = now() where room_id = v_room.id and user_id = p_user;
  else
    delete from public.room_members where room_id = v_room.id and user_id = p_user;
  end if;

  perform public._room_upkeep(v_room.id);
  return jsonb_build_object('ok', true, 'channel', 'room-' || v_room.id);
end;
$$;

-- The room a player is in the middle of a game in, if any, so they can find
-- their way back after closing the tab.
create function public.active_room(p_user uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select r.code
  from public.room_members m
  join public.rooms r on r.id = m.room_id and r.status = 'playing'
  join public.games g on g.id = r.game_id and g.status = 'active'
  where m.user_id = p_user and m.last_seen_at > now() - interval '15 minutes'
  order by m.last_seen_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 7. Starting a versus game
-- ---------------------------------------------------------------------------
-- The host starts once enough players are waiting. Everyone waiting is in the
-- game; the first round opens at once, with the same clock for all of them.
create function public.start_room_game(p_code text, p_user uuid)
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
  -- A second click, or a click just after the game began: nothing to do.
  if v_room.status = 'playing' then
    return public._room_state(v_room.id, p_user);
  end if;
  if v_room.host_id is distinct from p_user then
    return jsonb_build_object('error', 'not_host');
  end if;
  -- The host is starting it, so the host is in it.
  update public.room_members set ready = true where room_id = v_room.id and user_id = p_user;

  select array_agg(m.user_id order by m.seat) into v_players
  from public.room_members m
  where m.room_id = v_room.id and m.ready;
  if coalesce(array_length(v_players, 1), 0) < v_settings.versus_min_players then
    return jsonb_build_object('error', 'need_players');
  end if;

  -- Anyone who has not come back for the rematch is not in it.
  delete from public.room_members where room_id = v_room.id and not ready;

  insert into public.games (mode, created_by, room_id)
  values ('versus', p_user, v_room.id)
  returning * into v_game;

  insert into public.game_players (game_id, user_id, seat)
  select v_game.id, m.user_id, m.seat
  from public.room_members m
  where m.room_id = v_room.id;

  v_picked := public._pick_images(v_players, v_game.round_count, v_game.id);
  if coalesce(array_length(v_picked, 1), 0) < v_game.round_count then
    raise exception 'not enough photos in rotation to start a game (need %, have %)',
      v_game.round_count, coalesce(array_length(v_picked, 1), 0);
  end if;

  insert into public.game_rounds (game_id, round_no, image_id)
  select v_game.id, row_number() over (order by random()), picked.id
  from unnest(v_picked) as picked (id);

  v_start := now() + make_interval(secs => v_settings.versus_intro_ms / 1000.0);
  update public.game_rounds
  set opened_at = now(),
      started_at = v_start,
      deadline_at = v_start + make_interval(secs => v_game.round_seconds)
  where game_id = v_game.id and round_no = 1;
  update public.games set current_round = 1 where id = v_game.id;

  update public.rooms
  set status = 'playing', game_id = v_game.id, games_played = games_played + 1
  where id = v_room.id;

  return public._room_state(v_room.id, p_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. The game functions, with several players
-- ---------------------------------------------------------------------------
-- Locks the game row and checks the caller is a player in it. For a versus
-- game the room is locked first, and the player is marked as here.
create or replace function public._lock_game(p_game uuid, p_user uuid)
returns public.games
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games;
  v_room uuid;
begin
  select g.room_id into v_room from public.games g where g.id = p_game;
  if v_room is not null then
    perform 1 from public.rooms r where r.id = v_room for update;
  end if;

  select g.* into v_game
  from public.games g
  where g.id = p_game
    and exists (
      select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = p_user
    )
  for update of g;

  if v_game.id is not null and v_room is not null then
    update public.room_members
    set last_seen_at = now(), left_at = null
    where room_id = v_room and user_id = p_user;
  end if;
  return v_game;
end;
$$;

-- True when nobody who is still here has a guess to make. In a solo game that
-- is the one player. In a versus game, players who left or dropped off are not
-- waited for: their pin, if they placed one, is scored as it stands.
create function public._everyone_in(p_game uuid, p_round integer)
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
      and gu.locked_at is null
      and (
        g.room_id is null
        or (m.left_at is null and m.last_seen_at > now() - make_interval(secs => s.presence_ms / 1000.0))
      )
  );
$$;

-- Scores the current round if its clock (plus grace) has run out, or, in a
-- versus game, if everyone still here has guessed.
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

  if found and (v_expired or (v_versus and public._everyone_in(p_game, v_round))) then
    perform public._resolve_round(p_game, v_round);
  end if;
end;
$$;

-- What a player may know about their game right now. As before, the answer,
-- distances, scores and the credit appear only for rounds that have been
-- scored. In a versus game an open round says who has guessed, never where.
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
        )
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
          -- Versus: every player's pin for this round, by seat.
          'players', case when g.mode = 'versus' then (
            select jsonb_agg(
              jsonb_build_object(
                'seat', gp2.seat,
                'guess', case when gu2.lat is null then null else jsonb_build_object('lat', gu2.lat, 'lng', gu2.lng) end,
                'distanceM', gu2.distance_m,
                'score', coalesce(gu2.score, 0)
              )
              order by gp2.seat
            )
            from public.game_players gp2
            left join public.guesses gu2
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
        -- A closed room's code may belong to someone else's room by now.
        'code', case when r.status <> 'closed' then r.code end,
        'channel', 'room-' || r.id,
        'seat', gp.seat,
        'isHost', coalesce(r.game_id = g.id and r.host_id = p_user, false),
        -- When the next round opens by itself: only between rounds.
        'nextRoundAt', (
          select public._ms(gr.resolved_at + make_interval(secs => s.versus_reveal_ms / 1000.0))
          from public.game_rounds gr
          where g.status = 'active' and g.current_round < g.round_count
            and gr.game_id = g.id and gr.round_no = g.current_round and gr.resolved_at is not null
        ),
        -- After the game: can this group play again?
        --   open     the room is a lobby; press Rematch to be in the next game
        --   started  the next game began without this player
        --   closed   the room is gone
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
              'isYou', gp2.user_id = p_user,
              'isHost', coalesce(r.game_id = g.id and r.host_id = gp2.user_id, false),
              -- Away: left, or not heard from lately. Only means something while the game is on.
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

create or replace function public.game_state(p_game uuid, p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games;
begin
  v_game := public._lock_game(p_game, p_user);
  if v_game.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  perform public._settle_game(p_game);
  if v_game.room_id is not null then
    perform public._room_upkeep(v_game.room_id);
  end if;
  return public._build_state(p_game, p_user);
end;
$$;

-- Opens the next round. Safe to call twice: if a round is already running it
-- changes nothing. In a versus game the host may open it at any time after the
-- reveal; anyone else's call opens it only once the reveal time is up, which
-- is how the game moves on by itself.
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

  if v_game.status = 'active' and v_game.current_round < v_game.round_count then
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
      v_start := now() + make_interval(
        secs => (case when v_game.mode = 'versus' then v_settings.versus_intro_ms else v_settings.intro_ms end) / 1000.0
      );
      update public.game_rounds
      set opened_at = now(),
          started_at = v_start,
          deadline_at = v_start + make_interval(secs => v_game.round_seconds)
      where game_id = p_game and round_no = v_next;
      update public.games set current_round = v_next where id = p_game;
    end if;
  end if;

  return public._build_state(p_game, p_user);
end;
$$;

-- The player pressed Guess. Optionally carries the final pin position. When
-- everyone still in the game has locked in, the round is scored straight away.
-- Always returns the game state; if the request came too late, the state shows
-- the round scored with whatever pin was saved in time.
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
-- 9. Only the server may call any of this
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
        '_pick_images', 'start_game', '_room_code', '_room_upkeep', '_room_state',
        'create_room', 'join_room', 'room_state', 'leave_room', 'active_room',
        'start_room_game', '_lock_game', '_everyone_in', '_settle_game', '_build_state',
        'game_state', 'start_round', 'lock_guess'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
