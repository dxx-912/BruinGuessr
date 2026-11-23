-- Photo contributions: no more per-account limits.
--
-- Removes the 10-a-day and 30-waiting limits. Every other check in
-- submit_contribution (account, username, accuracy, blur boxes) is unchanged;
-- the server's file and position checks are untouched.

-- ---------------------------------------------------------------------------
-- 1. Submitting: no limit checks, so no per-account lock either
-- ---------------------------------------------------------------------------
create or replace function public.submit_contribution(
  p_user uuid,
  p_storage_path text,
  p_gps_lat double precision,
  p_gps_lng double precision,
  p_accuracy_m real,
  p_heading real,
  p_position_at timestamptz,
  p_captured_at timestamptz,
  p_capture_width integer,
  p_capture_height integer,
  p_width integer,
  p_height integer,
  p_sharpness real,
  p_people boolean,
  p_suggested_blur jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_blur jsonb := coalesce(p_suggested_blur, '[]'::jsonb);
  v_id uuid;
begin
  select * into v_profile from public.profiles where id = p_user;
  if not found or v_profile.is_guest then
    return jsonb_build_object('error', 'account_required');
  end if;
  if v_profile.username is null then
    return jsonb_build_object('error', 'no_username');
  end if;
  if p_accuracy_m is null or p_accuracy_m <= 0 or p_accuracy_m > 40 then
    return jsonb_build_object('error', 'bad_accuracy');
  end if;
  if jsonb_typeof(v_blur) <> 'array' or jsonb_array_length(v_blur) > 100 then
    return jsonb_build_object('error', 'bad_request');
  end if;

  insert into public.contributions (
    contributor_id, storage_path, gps_lat, gps_lng, accuracy_m, heading, position_at, captured_at,
    capture_width, capture_height, width, height, sharpness, people_answer, faces_detected, suggested_blur
  ) values (
    p_user, p_storage_path, p_gps_lat, p_gps_lng, p_accuracy_m, p_heading, p_position_at, p_captured_at,
    p_capture_width, p_capture_height, p_width, p_height, p_sharpness, p_people, jsonb_array_length(v_blur), v_blur
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The quota function and the limit settings go
-- ---------------------------------------------------------------------------
drop function public.contribution_quota(uuid);

alter table public.settings
  drop column contribution_daily_limit,
  drop column contribution_waiting_limit;
