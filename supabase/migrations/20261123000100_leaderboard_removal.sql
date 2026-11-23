-- Admins can take a player off the leaderboard, with a short reason the
-- player sees when they sign in again. Removal is on the profile: the player
-- stays off the board until an admin restores them. Their games are untouched.

alter table public.profiles
  add column leaderboard_removed_at timestamptz,
  add column leaderboard_removed_reason text check (leaderboard_removed_reason is null or char_length(leaderboard_removed_reason) between 1 and 300),
  add constraint profiles_removal_pair check ((leaderboard_removed_at is null) = (leaderboard_removed_reason is null));

comment on column public.profiles.leaderboard_removed_reason is 'Set by an admin from the player''s profile page. The player sees it on the leaderboard and on their own profile.';

-- Same view as before, without removed players. Everything that ranks players
-- (the leaderboard, a profile's rank) reads this view.
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
where p.username is not null and not p.is_test and not p.is_guest and p.leaderboard_removed_at is null;

revoke all on table public.leaderboard_entries from anon, authenticated;
