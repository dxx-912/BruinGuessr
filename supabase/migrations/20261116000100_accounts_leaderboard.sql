-- Phase 3: usernames and the leaderboard.
--
-- Same rules as before: every table is server only (RLS on, no client
-- policies, no grants), and every function here can be called only with the
-- secret key, from our own API routes and pages.
--
-- The leaderboard is computed from game_players joined to games, so any
-- completed game counts, whatever its mode. Versus games (Phase 4) already
-- write one game_players row per player with that player's own five-round
-- total, so they will count with no schema change.

-- ---------------------------------------------------------------------------
-- 1. Usernames
-- ---------------------------------------------------------------------------
-- Picked once, on first sign in. 3 to 16 letters, digits or underscores.
-- Shown with the capitals the player typed; unique ignoring case. The
-- profanity filter runs in the API route (src/lib/server/username.ts) before
-- this is called; the format check here is the last line of defence.
alter table public.profiles
  add column username text,
  add column username_set_at timestamptz,
  add constraint profiles_username_format
    check (username is null or username ~ '^[A-Za-z0-9_]{3,16}$');

create unique index profiles_username_lower_idx on public.profiles (lower(username));

comment on column public.profiles.username is 'Public name on the leaderboard. Null until the player picks one.';

-- Sets the username if the player has none yet.
create function public.set_username(p_user uuid, p_username text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_current text;
begin
  if p_username is null or p_username !~ '^[A-Za-z0-9_]{3,16}$' then
    return jsonb_build_object('error', 'bad_username');
  end if;

  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;
  select username into v_current from public.profiles where id = p_user for update;
  if v_current is not null then
    return jsonb_build_object('error', 'username_locked');
  end if;

  begin
    update public.profiles
    set username = p_username, username_set_at = now()
    where id = p_user;
  exception when unique_violation then
    return jsonb_build_object('error', 'username_taken');
  end;

  return jsonb_build_object('ok', true, 'username', p_username);
end;
$$;

create function public.username_available(p_username text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;

-- ---------------------------------------------------------------------------
-- 2. Leaderboard
-- ---------------------------------------------------------------------------
-- One row per account: its best completed game. Equal scores rank by who got
-- there first (the earliest game that reached it, by completion time).
-- Abandoned and unfinished games never count. Accounts without a username are
-- left out.
create index game_players_best_idx on public.game_players (user_id, total_score desc);
create index games_completed_idx on public.games (completed_at) where status = 'completed';

create view public.leaderboard_entries
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
where p.username is not null;

comment on view public.leaderboard_entries is 'Each account''s best completed game, ranked. Server only.';

revoke all on table public.leaderboard_entries from anon, authenticated;

-- One page of the leaderboard, plus the asking player's own row wherever it
-- is. Account IDs never leave the database: rows say only whether they are "you".
create function public.leaderboard(p_user uuid, p_limit integer, p_offset integer)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with e as materialized (
    select * from public.leaderboard_entries
  ),
  page as (
    select * from e order by rank limit greatest(1, least(p_limit, 100)) offset greatest(0, p_offset)
  )
  select jsonb_build_object(
    'total', (select count(*) from e),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', page.rank,
        'username', page.username,
        'score', page.score,
        'reachedAt', public._ms(page.reached_at),
        'mode', page.mode,
        'isYou', p_user is not null and page.user_id = p_user
      ) order by page.rank)
      from page
    ), '[]'::jsonb),
    'you', (
      select jsonb_build_object(
        'rank', e.rank,
        'username', e.username,
        'score', e.score,
        'reachedAt', public._ms(e.reached_at),
        'mode', e.mode,
        'isYou', true,
        'gameId', e.game_id
      )
      from e
      where p_user is not null and e.user_id = p_user
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Only the server may call any of this
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
      and p.proname in ('set_username', 'username_available', 'leaderboard')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
