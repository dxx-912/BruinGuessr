-- Phase 6a: guest play, public profiles, username changes, account deletion.
--
-- Same rules as before: every table is server only (RLS on, no client
-- policies, no grants), and every function can be called only with the secret
-- key, from our own API routes and pages.

-- ---------------------------------------------------------------------------
-- 1. Settings for this phase
-- ---------------------------------------------------------------------------
alter table public.settings
  -- Guest play limits. A guest is a browser with a guest cookie; clearing the
  -- cookie makes a new guest, so the per-network limits are what really hold.
  add column guest_games_per_hour integer not null default 20 check (guest_games_per_hour > 0),
  add column guest_games_per_ip_hour integer not null default 60 check (guest_games_per_ip_hour > 0),
  add column guest_new_per_ip_hour integer not null default 30 check (guest_new_per_ip_hour > 0),
  add column guest_games_global_hour integer not null default 1500 check (guest_games_global_hour > 0),
  -- A guest not seen for this long is deleted with its games.
  add column guest_keep_days integer not null default 7 check (guest_keep_days > 0),
  -- A player may change their username once in this many days.
  add column username_change_days integer not null default 30 check (username_change_days >= 0);

-- ---------------------------------------------------------------------------
-- 2. Profiles: accounts and guests
-- ---------------------------------------------------------------------------
-- Until now every profile was an account (its id was an auth.users id). A guest
-- is a profile with no account behind it, so the foreign key goes. Deleting an
-- account still deletes its profile, now through a trigger.
do $$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.profiles'::regclass
    and c.contype = 'f'
    and c.confrelid = 'auth.users'::regclass;
  if v_name is not null then
    execute format('alter table public.profiles drop constraint %I', v_name);
  end if;
end;
$$;

alter table public.profiles
  add column is_guest boolean not null default false,
  -- When the player last changed their username (not the first pick).
  add column username_changed_at timestamptz,
  -- A guest never has a username, so it can never reach the leaderboard.
  add constraint profiles_guest_no_username check (not is_guest or username is null);

comment on column public.profiles.is_guest is 'A signed-out visitor playing solo. No account, never on the leaderboard, deleted after a week away.';

create function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$$;

create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_deleted_user();

-- What the foreign key used to promise, kept for accounts: a profile that is
-- not a guest must belong to an existing account. A sign-in token outlives a
-- deleted account by up to an hour; this stops it from bringing a profile back.
create function public.check_profile_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_guest and not exists (select 1 from auth.users u where u.id = new.id) then
    raise exception 'profile % has no account', new.id using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_check_account
  before insert or update of id, is_guest on public.profiles
  for each row execute function public.check_profile_account();

-- Accounts deleted before this migration left nothing behind (the old foreign
-- key cascaded), so there is nothing to clean up here.

-- ---------------------------------------------------------------------------
-- 3. Games outlive the player who started them
-- ---------------------------------------------------------------------------
-- A versus game belongs to everyone in it, so deleting the host's account must
-- not delete the game for the others. Solo games are removed with the profile
-- by the trigger below.
do $$
declare
  v_name text;
begin
  select c.conname into v_name
  from pg_constraint c
  where c.conrelid = 'public.games'::regclass
    and c.contype = 'f'
    and c.confrelid = 'public.profiles'::regclass;
  if v_name is not null then
    execute format('alter table public.games drop constraint %I', v_name);
  end if;
end;
$$;

alter table public.games
  alter column created_by drop not null,
  add constraint games_created_by_fkey foreign key (created_by) references public.profiles (id) on delete set null;

create function public.handle_deleted_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The player's own solo games go with them. Their rows in versus games go
  -- through the game_players cascade; the games stay for the other players.
  delete from public.games where created_by = old.id and mode = 'solo';
  return old;
end;
$$;

create trigger profiles_before_delete
  before delete on public.profiles
  for each row execute function public.handle_deleted_profile();

-- ---------------------------------------------------------------------------
-- 4. Guests
-- ---------------------------------------------------------------------------
-- The browser holds a random token in an http-only cookie; only its SHA-256
-- is stored. Network addresses are stored only as a keyed hash (HMAC, key on
-- the server), never as the address itself.
create table public.guests (
  id uuid primary key references public.profiles (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
comment on table public.guests is 'Guest players and the hash of their cookie. Server only.';

create index guests_ip_idx on public.guests (ip_hash, created_at desc);
create index guests_last_seen_idx on public.guests (last_seen_at);

-- One row per guest game started, kept a day, for the rate limits.
create table public.guest_game_starts (
  id bigint generated always as identity primary key,
  guest_id uuid not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
comment on table public.guest_game_starts is 'When guest games were started, for rate limiting. Server only.';

create index guest_game_starts_guest_idx on public.guest_game_starts (guest_id, created_at desc);
create index guest_game_starts_ip_idx on public.guest_game_starts (ip_hash, created_at desc);
create index guest_game_starts_time_idx on public.guest_game_starts (created_at);

alter table public.guests enable row level security;
alter table public.guest_game_starts enable row level security;
revoke all on table public.guests, public.guest_game_starts from anon, authenticated;

-- The guest behind a cookie, or null. Also notes that the guest is still around.
create function public.guest_from_token(p_token_hash text)
returns uuid
language sql
volatile
set search_path = ''
as $$
  update public.guests
  set last_seen_at = now()
  where token_hash = p_token_hash
  returning id;
$$;

-- Deletes guests not seen for a while, with their games, and old rate-limit rows.
create function public._guest_upkeep()
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_keep integer;
begin
  select guest_keep_days into strict v_keep from public.settings;
  delete from public.profiles p
  using public.guests g
  where g.id = p.id
    and p.is_guest
    and g.last_seen_at < now() - make_interval(days => v_keep);
  delete from public.guest_game_starts where created_at < now() - interval '1 day';
end;
$$;

-- Makes a new guest for a browser that has none. Refused when this network
-- has made too many guests in the last hour.
create function public.create_guest(p_token_hash text, p_ip_hash text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.settings;
  v_id uuid := gen_random_uuid();
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or coalesce(p_ip_hash, '') = '' then
    return jsonb_build_object('error', 'bad_request');
  end if;
  select * into strict v_settings from public.settings;

  -- One at a time per network, so the count below cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('guest-ip:' || p_ip_hash, 0));

  if (
    select count(*) from public.guests
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= v_settings.guest_new_per_ip_hour then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  perform public._guest_upkeep();

  insert into public.profiles (id, is_guest) values (v_id, true);
  insert into public.guests (id, token_hash, ip_hash) values (v_id, p_token_hash, p_ip_hash);
  return jsonb_build_object('id', v_id);
end;
$$;

-- Starts a solo game for a guest, within the limits: per guest, per network,
-- and for all guests together. Otherwise exactly the signed-in solo game.
create function public.start_guest_game(p_guest uuid, p_ip_hash text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.settings;
begin
  if coalesce(p_ip_hash, '') = '' then
    return jsonb_build_object('error', 'bad_request');
  end if;
  if not exists (select 1 from public.profiles where id = p_guest and is_guest) then
    return jsonb_build_object('error', 'unauthorized');
  end if;
  select * into strict v_settings from public.settings;

  -- The same lock start_game takes for this player, then the network's.
  perform pg_advisory_xact_lock(hashtextextended('game:' || p_guest::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('guest-ip:' || p_ip_hash, 0));

  if (
    select count(*) from public.guest_game_starts
    where guest_id = p_guest and created_at > now() - interval '1 hour'
  ) >= v_settings.guest_games_per_hour
  or (
    select count(*) from public.guest_game_starts
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
  ) >= v_settings.guest_games_per_ip_hour
  or (
    select count(*) from public.guest_game_starts
    where created_at > now() - interval '1 hour'
  ) >= v_settings.guest_games_global_hour then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  insert into public.guest_game_starts (guest_id, ip_hash) values (p_guest, p_ip_hash);
  update public.guests set last_seen_at = now() where id = p_guest;
  return public.start_game(p_guest);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Guests cannot report photos
-- ---------------------------------------------------------------------------
-- A photo leaves rotation after reports from three different accounts. A
-- guest is free to make, so a guest report would let one person hide any photo.
create or replace function public.report_image(p_game uuid, p_user uuid, p_round integer, p_reason text default 'other')
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

  if exists (select 1 from public.profiles where id = p_user and is_guest) then
    return jsonb_build_object('error', 'account_required');
  end if;

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
-- 6. The leaderboard leaves guests out (they have no username either)
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
where p.username is not null and not p.is_test and not p.is_guest;

revoke all on table public.leaderboard_entries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Changing a username
-- ---------------------------------------------------------------------------
-- Same name rules as the first pick (the profanity and reserved-name filter
-- runs in the API route first). The first change can be made at any time after
-- the first pick; after that, once per username_change_days.
create function public.change_username(p_user uuid, p_username text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_days integer;
  v_profile public.profiles;
  v_next timestamptz;
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,16}$' then
    return jsonb_build_object('error', 'bad_username');
  end if;
  select username_change_days into strict v_days from public.settings;

  select * into v_profile from public.profiles where id = p_user and not is_guest for update;
  if not found or v_profile.username is null then
    return jsonb_build_object('error', 'no_username');
  end if;
  if v_profile.username = p_username then
    return jsonb_build_object('error', 'same_name');
  end if;

  v_next := v_profile.username_changed_at + make_interval(days => v_days);
  if v_next is not null and v_next > now() then
    return jsonb_build_object('error', 'too_soon', 'nextChangeAt', public._ms(v_next));
  end if;

  begin
    update public.profiles
    set username = p_username, username_changed_at = now()
    where id = p_user;
  exception when unique_violation then
    return jsonb_build_object('error', 'username_taken');
  end;

  return jsonb_build_object(
    'ok', true,
    'username', p_username,
    'nextChangeAt', public._ms(now() + make_interval(days => v_days))
  );
end;
$$;

-- When the player may next change their name: null means now.
create function public.username_next_change(p_user uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select case
    when p.username_changed_at + make_interval(days => s.username_change_days) > now()
      then public._ms(p.username_changed_at + make_interval(days => s.username_change_days))
  end
  from public.profiles p
  cross join public.settings s
  where p.id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- 8. Profiles
-- ---------------------------------------------------------------------------
-- A player's public page, found by username (ignoring case). Says nothing
-- that is not already public: no account ID, no email, no game ID, and no
-- photo or answer location, only each round's distance and points.
-- Only completed games count, as on the leaderboard.
create index game_players_user_game_idx on public.game_players (user_id, game_id);

create function public.player_profile(p_username text, p_viewer uuid, p_recent integer default 10)
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
    select g.id, g.mode, g.completed_at, g.round_count, gp.total_score
    from p
    join public.game_players gp on gp.user_id = p.id
    join public.games g on g.id = gp.game_id
    where g.status = 'completed' and g.completed_at is not null
  ),
  versus as (
    select pl.id,
      1 + (select count(*) from public.game_players o where o.game_id = pl.id and o.total_score > pl.total_score) as place,
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
      'bestScore', (select max(total_score) from played),
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
        'handle_deleted_user', 'handle_deleted_profile', 'check_profile_account', 'guest_from_token', '_guest_upkeep',
        'create_guest', 'start_guest_game', 'report_image', 'change_username',
        'username_next_change', 'player_profile'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
