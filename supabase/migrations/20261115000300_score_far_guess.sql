-- A pin dropped very far from campus (another continent) made e^(−10 × d / D)
-- too small for Postgres to represent, and the scoring call failed with
-- "value out of range: underflow". The exponent is now floored at −700
-- (e^−700 is about 10^−304), which still rounds to 0 points.
create or replace function public.score_for_distance(p_distance_m double precision)
returns integer
language sql
stable
set search_path = ''
as $$
  select floor(
    s.max_round_score
    * exp(greatest(-700, -s.score_decay * greatest(0, p_distance_m - s.perfect_radius_m) / s.campus_diagonal_m))
    + 0.5
  )::integer
  from public.settings s;
$$;

revoke all on function public.score_for_distance(double precision) from public, anon, authenticated;
grant execute on function public.score_for_distance(double precision) to service_role;
