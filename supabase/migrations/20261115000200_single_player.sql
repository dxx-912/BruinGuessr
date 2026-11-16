-- Phase 2: single player.
--
-- Everything here is server only. Row level security is on for every table with
-- no policies, and every function is callable by the secret key alone. The
-- browser talks to /api routes; those routes call these functions.
--
-- All game timing uses the database clock, and every state change for a game
-- happens while holding a lock on that game's row, so two requests for the same
-- game can never interleave.

-- ---------------------------------------------------------------------------
-- 1. Photos are no longer fetchable by filename.
-- ---------------------------------------------------------------------------
-- Until now the bucket was public (a file could be fetched by its exact URL).
-- From here on, photos reach players only through the per-round route, which
-- reads from Storage with the secret key. A leaked filename is useless.
update storage.buckets set public = false where id = 'photos';

-- ---------------------------------------------------------------------------
-- 2. Settings (one row)
-- ---------------------------------------------------------------------------
create table public.settings (
  id boolean primary key default true check (id),
  -- D in the score formula: the diagonal of the campus.geojson bounding box.
  campus_diagonal_m double precision not null check (campus_diagonal_m > 0),
  -- Score = round(max_round_score × e^(−score_decay × max(0, d − perfect_radius_m) / D)).
  perfect_radius_m double precision not null default 10 check (perfect_radius_m >= 0),
  max_round_score integer not null default 5000 check (max_round_score > 0),
  score_decay double precision not null default 10 check (score_decay > 0),
  -- A round opens this long before its clock starts, so the photo can load
  -- behind the "Round 3" card and the player still gets the full time.
  intro_ms integer not null default 2500 check (intro_ms between 0 and 10000),
  -- Guesses are accepted this long after the deadline, to allow for network delay.
  guess_grace_ms integer not null default 1500 check (guess_grace_ms between 0 and 10000),
  -- A photo reported by this many different accounts leaves rotation.
  report_hide_threshold integer not null default 3 check (report_hide_threshold > 0),
  -- Reports one account may file in any 24 hours.
  daily_report_cap integer not null default 10 check (daily_report_cap > 0),
  -- Photos from a player's last N games are avoided when picking a new game.
  avoid_recent_games integer not null default 10 check (avoid_recent_games >= 0),
  updated_at timestamptz not null default now()
);
comment on table public.settings is 'Game constants. One row. Server only.';

insert into public.settings (campus_diagonal_m) values (2297.5);

create trigger settings_touch_updated_at
  before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Profiles: one row per signed-in account
-- ---------------------------------------------------------------------------
-- Usernames arrive in Phase 3. For now a profile only says "this account exists".
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'One row per account. Server only.';

insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. Games
-- ---------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  mode text not null default 'solo' check (mode in ('solo', 'versus')),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  -- Fixed at 5 and 30 for v1. Columns, so host settings can be added later.
  round_count integer not null default 5 check (round_count between 1 and 20),
  round_seconds integer not null default 30 check (round_seconds between 5 and 600),
  -- 0 until the first round opens.
  current_round integer not null default 0,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  abandoned_at timestamptz,
  check (current_round between 0 and round_count)
);
comment on table public.games is 'One row per game, solo or versus. Server only.';

create index games_created_by_idx on public.games (created_by, created_at desc);
-- A player has at most one solo game in progress. Starting another ends the first.
create unique index games_one_active_solo_idx on public.games (created_by) where status = 'active' and mode = 'solo';

create table public.game_players (
  game_id uuid not null references public.games (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Sum of this player's round scores so far. The leaderboard reads this.
  total_score integer not null default 0 check (total_score >= 0),
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
comment on table public.game_players is 'Who is in each game, with their running total. Server only.';

create index game_players_user_idx on public.game_players (user_id, joined_at desc);

create table public.game_rounds (
  game_id uuid not null references public.games (id) on delete cascade,
  round_no integer not null check (round_no >= 1),
  image_id uuid not null references public.images (id) on delete restrict,
  -- opened_at: the server opened the round and the photo became fetchable.
  -- started_at: the 30 second clock starts (opened_at plus the intro).
  -- deadline_at: the clock hits zero.
  -- resolved_at: guesses were scored and the photo stopped being fetchable.
  opened_at timestamptz,
  started_at timestamptz,
  deadline_at timestamptz,
  resolved_at timestamptz,
  primary key (game_id, round_no),
  -- The photos in one game are all different.
  unique (game_id, image_id)
);
comment on table public.game_rounds is 'The photo for each round and its server-side timing. Server only: image_id is the answer.';

create index game_rounds_image_idx on public.game_rounds (image_id);

create table public.guesses (
  game_id uuid not null,
  round_no integer not null,
  user_id uuid not null,
  -- The pin. Saved every time the player moves it, so it already exists when the
  -- clock hits zero. Null lat and lng means the player never placed one.
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  placed_at timestamptz,
  -- Set when the player presses Guess, or when the round is scored.
  locked_at timestamptz,
  -- Filled in when the round is scored.
  distance_m double precision check (distance_m is null or distance_m >= 0),
  score integer check (score is null or score >= 0),
  primary key (game_id, round_no, user_id),
  foreign key (game_id, round_no) references public.game_rounds (game_id, round_no) on delete cascade,
  foreign key (game_id, user_id) references public.game_players (game_id, user_id) on delete cascade,
  check ((lat is null) = (lng is null))
);
comment on table public.guesses is 'One row per player per round: the pin, then the result. Server only.';

-- ---------------------------------------------------------------------------
-- 5. Photo reports
-- ---------------------------------------------------------------------------
create table public.image_reports (
  image_id uuid not null references public.images (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid references public.games (id) on delete set null,
  round_no integer,
  reason text not null default 'other'
    check (reason in ('wrong_location', 'unclear', 'not_campus', 'inappropriate', 'other')),
  created_at timestamptz not null default now(),
  -- One report per account per photo, so three reports means three accounts.
  primary key (image_id, user_id)
);
comment on table public.image_reports is 'Player reports of bad photos. Server only.';

create index image_reports_user_idx on public.image_reports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Lock every table down
-- ---------------------------------------------------------------------------
alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_rounds enable row level security;
alter table public.guesses enable row level security;
alter table public.image_reports enable row level security;

revoke all on table
  public.settings, public.profiles, public.games, public.game_players,
  public.game_rounds, public.guesses, public.image_reports
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Distance and score
-- ---------------------------------------------------------------------------
-- Same formula and Earth radius as src/lib/geo/distance.ts.
create function public.haversine_m(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 2 * 6371008.8 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- Same formula as src/lib/geo/scoring.ts. floor(x + 0.5) rounds halves up, the
-- way JavaScript's Math.round does; Postgres round() on a double rounds halves to even.
create function public.score_for_distance(p_distance_m double precision)
returns integer
language sql
stable
set search_path = ''
as $$
  select floor(
    s.max_round_score
    * exp(-s.score_decay * greatest(0, p_distance_m - s.perfect_radius_m) / s.campus_diagonal_m)
    + 0.5
  )::integer
  from public.settings s;
$$;

create function public._ms(p_time timestamptz)
returns bigint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select floor(extract(epoch from p_time) * 1000)::bigint;
$$;

-- ---------------------------------------------------------------------------
-- 8. Scoring a round
-- ---------------------------------------------------------------------------
-- Scores every player's pin for one round, closes the round, and finishes the
-- game if that was the last round. Callers hold the lock on the game row.
create function public._resolve_round(p_game uuid, p_round integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lat double precision;
  v_lng double precision;
begin
  select i.lat, i.lng into strict v_lat, v_lng
  from public.game_rounds gr
  join public.images i on i.id = gr.image_id
  where gr.game_id = p_game and gr.round_no = p_round and gr.resolved_at is null;

  -- Every player gets a row. No pin means no distance and 0 points.
  insert into public.guesses (game_id, round_no, user_id)
  select gp.game_id, p_round, gp.user_id
  from public.game_players gp
  where gp.game_id = p_game
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

  update public.games
  set status = 'completed', completed_at = now()
  where id = p_game and status = 'active' and current_round = round_count and p_round = round_count;
end;
$$;

-- If the current round's clock (plus grace) has run out and nobody has scored
-- it yet, score it now. There is no background job: every request for a game
-- calls this first, so time running out is noticed the next time anyone asks.
create function public._settle_game(p_game uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_round integer;
begin
  select gr.round_no into v_round
  from public.games g
  join public.game_rounds gr on gr.game_id = g.id and gr.round_no = g.current_round
  cross join public.settings s
  where g.id = p_game
    and g.status = 'active'
    and gr.opened_at is not null
    and gr.resolved_at is null
    and gr.deadline_at + make_interval(secs => s.guess_grace_ms / 1000.0) <= now();

  if found then
    perform public._resolve_round(p_game, v_round);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. What a player may know about their game right now
-- ---------------------------------------------------------------------------
-- The answer, the distance, the score and the photographer credit appear only
-- for rounds that have been scored. An open round shows its timing and the
-- player's own pin, nothing about the photo.
create function public._build_state(p_game uuid, p_user uuid)
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
          )
        )
        order by gr.round_no
      )
      from public.game_rounds gr
      join public.images i on i.id = gr.image_id
      left join public.guesses gu
        on gu.game_id = gr.game_id and gu.round_no = gr.round_no and gu.user_id = p_user
      where gr.game_id = g.id and gr.resolved_at is not null
    ), '[]'::jsonb)
  )
  from public.games g
  join public.game_players gp on gp.game_id = g.id and gp.user_id = p_user
  cross join public.settings s
  where g.id = p_game;
$$;

-- Locks the game row and checks the caller is a player in it.
create function public._lock_game(p_game uuid, p_user uuid)
returns public.games
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games;
begin
  select g.* into v_game
  from public.games g
  where g.id = p_game
    and exists (
      select 1 from public.game_players gp where gp.game_id = g.id and gp.user_id = p_user
    )
  for update of g;
  return v_game;
end;
$$;

create function public.game_state(p_game uuid, p_user uuid)
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
  return public._build_state(p_game, p_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Starting a game
-- ---------------------------------------------------------------------------
create function public.start_game(p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.settings;
  v_game public.games;
  v_picked uuid[];
begin
  select * into strict v_settings from public.settings;

  -- One at a time per player, so two quick clicks cannot both create a game.
  perform pg_advisory_xact_lock(hashtextextended('game:' || p_user::text, 0));

  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;

  update public.games
  set status = 'abandoned', abandoned_at = now()
  where created_by = p_user and mode = 'solo' and status = 'active';

  insert into public.games (created_by) values (p_user) returning * into v_game;
  insert into public.game_players (game_id, user_id) values (v_game.id, p_user);

  -- Pick the photos. Preference order:
  --   1. photos this player has not reported,
  --   2. photos not shown to them in their last few games,
  --   3. among photos they have seen, the ones seen longest ago,
  -- and random within each group.
  with recent_games as (
    select gp.game_id
    from public.game_players gp
    join public.games g on g.id = gp.game_id
    where gp.user_id = p_user and g.id <> v_game.id
    order by g.created_at desc
    limit v_settings.avoid_recent_games
  ),
  seen as (
    select gr.image_id, max(gr.opened_at) as last_seen
    from public.game_rounds gr
    where gr.game_id in (select game_id from recent_games) and gr.opened_at is not null
    group by gr.image_id
  )
  select array_agg(t.id) into v_picked
  from (
    select i.id
    from public.images i
    left join seen on seen.image_id = i.id
    where not i.hidden
    order by
      exists (select 1 from public.image_reports ir where ir.image_id = i.id and ir.user_id = p_user),
      seen.image_id is not null,
      seen.last_seen asc nulls first,
      random()
    limit v_game.round_count
  ) t;

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
-- 11. Opening the next round
-- ---------------------------------------------------------------------------
-- Safe to call twice: if a round is already running it changes nothing.
create function public.start_round(p_game uuid, p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.settings;
  v_game public.games;
  v_open boolean;
  v_next integer;
  v_start timestamptz;
begin
  select * into strict v_settings from public.settings;
  v_game := public._lock_game(p_game, p_user);
  if v_game.id is null then
    return jsonb_build_object('error', 'not_found');
  end if;

  perform public._settle_game(p_game);
  select * into v_game from public.games where id = p_game;

  if v_game.status = 'active' and v_game.current_round < v_game.round_count then
    select exists (
      select 1 from public.game_rounds gr
      where gr.game_id = p_game and gr.round_no = v_game.current_round and gr.resolved_at is null
    ) into v_open;

    if not v_open then
      v_next := v_game.current_round + 1;
      v_start := now() + make_interval(secs => v_settings.intro_ms / 1000.0);
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

-- ---------------------------------------------------------------------------
-- 12. Pins and guesses
-- ---------------------------------------------------------------------------
-- Why a pin was not accepted, or null if the round is open for this player.
create function public._round_closed_reason(p_game public.games, p_user uuid, p_round integer)
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

-- Saves where the player's pin is right now. Called on every pin move.
create function public.place_pin(
  p_game uuid, p_user uuid, p_round integer,
  p_lat double precision, p_lng double precision
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_game public.games;
  v_reason text;
begin
  if p_lat is null or p_lng is null
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
    return jsonb_build_object('error', v_reason);
  end if;

  insert into public.guesses (game_id, round_no, user_id, lat, lng, placed_at)
  values (p_game, p_round, p_user, p_lat, p_lng, now())
  on conflict (game_id, round_no, user_id)
  do update set lat = excluded.lat, lng = excluded.lng, placed_at = excluded.placed_at;

  return jsonb_build_object('ok', true);
end;
$$;

-- The player pressed Guess. Optionally carries the final pin position. When
-- every player in the game has locked in, the round is scored straight away.
-- Always returns the game state; if the request came too late, the state shows
-- the round scored with whatever pin was saved in time.
create function public.lock_guess(
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

  if not exists (
    select 1
    from public.game_players gp
    left join public.guesses gu
      on gu.game_id = gp.game_id and gu.user_id = gp.user_id and gu.round_no = p_round
    where gp.game_id = p_game and gu.locked_at is null
  ) then
    perform public._resolve_round(p_game, p_round);
  end if;

  return public._build_state(p_game, p_user);
end;
$$;

-- ---------------------------------------------------------------------------
-- 13. The per-round photo
-- ---------------------------------------------------------------------------
-- The storage filename for a round's photo, but only for a player in that game
-- and only while that round is open. Once the round is scored, or its time is
-- up, this returns null and the photo route answers 404.
create function public.round_photo_path(p_game uuid, p_user uuid, p_round integer)
returns text
language sql
stable
set search_path = ''
as $$
  select i.storage_path
  from public.games g
  join public.game_players gp on gp.game_id = g.id and gp.user_id = p_user
  join public.game_rounds gr on gr.game_id = g.id and gr.round_no = g.current_round
  join public.images i on i.id = gr.image_id
  cross join public.settings s
  where g.id = p_game
    and g.status = 'active'
    and gr.round_no = p_round
    and gr.opened_at is not null
    and gr.resolved_at is null
    and now() <= gr.deadline_at + make_interval(secs => s.guess_grace_ms / 1000.0);
$$;

-- ---------------------------------------------------------------------------
-- 14. Reporting a photo
-- ---------------------------------------------------------------------------
-- Only from a round the player has finished (the reveal screen). One report per
-- account per photo, with a cap per account per 24 hours. A photo reported by
-- enough different accounts is hidden from rotation, never deleted.
create function public.report_image(p_game uuid, p_user uuid, p_round integer, p_reason text default 'other')
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.settings;
  v_image uuid;
  v_reports integer;
begin
  select * into strict v_settings from public.settings;

  if p_reason is null
     or p_reason not in ('wrong_location', 'unclear', 'not_campus', 'inappropriate', 'other') then
    return jsonb_build_object('error', 'bad_reason');
  end if;

  select gr.image_id into v_image
  from public.game_rounds gr
  join public.game_players gp on gp.game_id = gr.game_id and gp.user_id = p_user
  where gr.game_id = p_game and gr.round_no = p_round and gr.resolved_at is not null;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;

  -- One at a time per account, so the daily cap cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('report:' || p_user::text, 0));

  if exists (select 1 from public.image_reports where image_id = v_image and user_id = p_user) then
    return jsonb_build_object('ok', true);
  end if;

  if (
    select count(*) from public.image_reports
    where user_id = p_user and created_at > now() - interval '24 hours'
  ) >= v_settings.daily_report_cap then
    return jsonb_build_object('error', 'daily_cap');
  end if;

  -- Lock the photo so two reports arriving together both get counted.
  perform 1 from public.images where id = v_image for update;

  insert into public.image_reports (image_id, user_id, game_id, round_no, reason)
  values (v_image, p_user, p_game, p_round, p_reason);

  select count(*) into v_reports from public.image_reports where image_id = v_image;

  update public.images
  set report_count = v_reports,
      hidden_reason = case
        when not hidden and v_reports >= v_settings.report_hide_threshold then 'reported by players'
        else hidden_reason
      end,
      hidden = hidden or v_reports >= v_settings.report_hide_threshold
  where id = v_image;

  return jsonb_build_object('ok', true);
end;
$$;

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
        'haversine_m', 'score_for_distance', '_ms', '_resolve_round', '_settle_game',
        '_build_state', '_lock_game', 'game_state', 'start_game', 'start_round',
        '_round_closed_reason', 'place_pin', 'lock_guess', 'round_photo_path',
        'report_image', 'handle_new_user', 'touch_updated_at'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
