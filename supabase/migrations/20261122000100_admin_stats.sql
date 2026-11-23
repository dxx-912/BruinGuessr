-- Admin stats tab, and "brokeurgame" off the leaderboard.

-- Test accounts never appear on the leaderboard (the view already filters them).
update public.profiles set is_test = true where lower(username) = 'brokeurgame';

-- Everything the admin Stats tab shows, in one call. Server only.
-- Guests and test accounts are left out of player counts and averages.
create or replace function public.admin_stats(p_admin uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.is_admin(p_admin) then return null; end if;

  with real_players as (
    select id from public.profiles where not is_guest and not is_test
  ),
  done as (
    select g.id, g.mode, g.completed_at, g.created_at
    from public.games g
    where g.status = 'completed'
      and exists (select 1 from public.game_players gp join real_players r on r.id = gp.user_id where gp.game_id = g.id)
  ),
  scores as (
    select gp.game_id, gp.user_id, gp.total_score, d.mode
    from public.game_players gp
    join done d on d.id = gp.game_id
    join real_players r on r.id = gp.user_id
  ),
  per_image as (
    select i.id, i.lat, i.lng, i.report_count, i.hidden,
      count(gu.score) as guesses,
      round(avg(gu.score))::int as avg_score,
      round((avg(gu.distance_m))::numeric)::int as avg_distance_m
    from public.images i
    join public.game_rounds r on r.image_id = i.id
    join public.guesses gu on gu.game_id = r.game_id and gu.round_no = r.round_no
    join real_players rp on rp.id = gu.user_id
    where gu.score is not null
    group by i.id
    having count(gu.score) >= 3
  )
  select jsonb_build_object(
    'signups', (select count(*) from public.profiles where not is_guest and not is_test and username is not null),
    'signupsWeek', (select count(*) from public.profiles where not is_guest and not is_test and username is not null and created_at > now() - interval '7 days'),
    'signupsToday', (select count(*) from public.profiles where not is_guest and not is_test and username is not null and created_at > now() - interval '1 day'),
    'guestsNow', (select count(*) from public.profiles where is_guest),
    'gamesPlayed', (select count(*) from done),
    'gamesWeek', (select count(*) from done where completed_at > now() - interval '7 days'),
    'gamesToday', (select count(*) from done where completed_at > now() - interval '1 day'),
    'soloGames', (select count(*) from done where mode = 'solo'),
    'versusGames', (select count(*) from done where mode = 'versus'),
    'abandoned', (select count(*) from public.games where status = 'abandoned'),
    'inProgress', (select count(*) from public.games where status = 'active'),
    'avgScore', (select round(avg(total_score))::int from scores),
    'avgSoloScore', (select round(avg(total_score))::int from scores where mode = 'solo'),
    'avgVersusScore', (select round(avg(total_score))::int from scores where mode = 'versus'),
    'highScore', (select max(total_score) from scores where mode = 'solo'),
    'perfectRounds', (select count(*) from public.guesses gu join real_players r on r.id = gu.user_id where gu.score >= 5000),
    'noPinRounds', (select count(*) from public.guesses gu join real_players r on r.id = gu.user_id where gu.locked_at is not null and gu.lat is null),
    'medianDistanceM', (select round((percentile_cont(0.5) within group (order by gu.distance_m))::numeric)::int
                        from public.guesses gu join real_players r on r.id = gu.user_id where gu.distance_m is not null),
    'activePlayersWeek', (select count(distinct s.user_id) from scores s join done d on d.id = s.game_id where d.completed_at > now() - interval '7 days'),
    'repeatPlayers', (select count(*) from (select user_id from scores group by user_id having count(*) >= 2) x),
    'gamesPerPlayer', (select round(avg(n)::numeric, 1) from (select count(*) n from scores group by user_id) x),
    'contributionsWaiting', (select count(*) from public.contributions where status = 'waiting'),
    'contributionsApproved', (select count(*) from public.contributions where status = 'approved'),
    'contributionsRejected', (select count(*) from public.contributions where status = 'rejected'),
    'photos', (select count(*) from public.images where not hidden),
    'photosHidden', (select count(*) from public.images where hidden),
    'openReports', (select count(*) from public.images where report_count > 0),
    'gamesByDay', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'games', n) order by d)
      from (
        select (completed_at at time zone 'America/Los_Angeles')::date as d, count(*) as n
        from done where completed_at > now() - interval '14 days' group by 1
      ) x
    ), '[]'::jsonb),
    'signupsByDay', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'signups', n) order by d)
      from (
        select (created_at at time zone 'America/Los_Angeles')::date as d, count(*) as n
        from public.profiles where not is_guest and not is_test and username is not null and created_at > now() - interval '14 days' group by 1
      ) x
    ), '[]'::jsonb),
    'bestImages', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.avg_score desc)
      from (select id, lat, lng, guesses, avg_score, avg_distance_m from per_image order by avg_score desc, guesses desc limit 8) t
    ), '[]'::jsonb),
    'worstImages', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.avg_score asc)
      from (select id, lat, lng, guesses, avg_score, avg_distance_m from per_image order by avg_score asc, guesses desc limit 8) t
    ), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

revoke all on function public.admin_stats(uuid) from public, anon, authenticated;
grant execute on function public.admin_stats(uuid) to service_role;
