-- Phase 7a follow-up: faces are no longer blurred on the phone.
--
-- The phone sends the photo as taken, with the face detector's finds as
-- suggested blur boxes. The original waits in the private "contributions"
-- bucket (secret key only; the review page is admins only) and is deleted at
-- once on rejection, or once the published copy is made on approval. The
-- review page shows the suggestions as pre-filled boxes the reviewer keeps,
-- removes or adds to; the server blurs only the boxes the reviewer sends with
-- Approve (approve_contribution's p_blur, unchanged), and the audit log
-- records them.

-- ---------------------------------------------------------------------------
-- 1. The detector's boxes, stored with the submission
-- ---------------------------------------------------------------------------
-- Fractions of the stored photo ({x, y, w, h}, 0..1), already grown to blur
-- size. The server checks and clips them before they get here.
alter table public.contributions
  add column suggested_blur jsonb not null default '[]'::jsonb
    check (jsonb_typeof(suggested_blur) = 'array' and jsonb_array_length(suggested_blur) <= 100);

comment on column public.contributions.faces_detected is
  'How many faces the browser''s detector found: the number of suggested_blur boxes. Nothing is blurred until approval.';
comment on column public.contributions.suggested_blur is
  'The detector''s finds as suggested blur boxes (fractions of the photo). Suggestions only: approval blurs the boxes the reviewer confirms.';

-- ---------------------------------------------------------------------------
-- 2. Submitting: the face count comes from the boxes
-- ---------------------------------------------------------------------------
drop function public.submit_contribution(
  uuid, text, double precision, double precision, real, real, timestamptz, timestamptz,
  integer, integer, integer, integer, real, boolean, integer
);

-- Records a submission whose file the server has already checked and stored.
-- The limits are checked under a per-account lock, so two uploads at the same
-- moment cannot both slip under them.
create function public.submit_contribution(
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
  v_settings public.settings;
  v_profile public.profiles;
  v_blur jsonb := coalesce(p_suggested_blur, '[]'::jsonb);
  v_id uuid;
begin
  select * into strict v_settings from public.settings;
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

  perform pg_advisory_xact_lock(hashtextextended('contribute:' || p_user::text, 0));

  if (
    select count(*) from public.contributions
    where contributor_id = p_user and received_at > now() - interval '24 hours'
  ) >= v_settings.contribution_daily_limit then
    return jsonb_build_object('error', 'daily_limit');
  end if;
  if (
    select count(*) from public.contributions
    where contributor_id = p_user and status = 'waiting'
  ) >= v_settings.contribution_waiting_limit then
    return jsonb_build_object('error', 'waiting_limit');
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
-- 3. The queue carries the suggestions to the review page
-- ---------------------------------------------------------------------------
-- The queue: people first, then pin checks, then oldest first.
create or replace function public.contribution_queue(p_admin uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin(p_admin) then
    return jsonb_build_object('error', 'not_found');
  end if;
  return (
    select coalesce(jsonb_agg(t.j order by t.flag_people desc, t.flag_pin_check desc, t.received_at), '[]'::jsonb)
    from (
      select c.flag_people, c.flag_pin_check, c.received_at, jsonb_build_object(
        'id', c.id,
        'contributor', p.username,
        'gpsLat', c.gps_lat,
        'gpsLng', c.gps_lng,
        'accuracyM', c.accuracy_m,
        'heading', c.heading,
        'positionAt', (extract(epoch from c.position_at) * 1000)::bigint,
        'capturedAt', (extract(epoch from c.captured_at) * 1000)::bigint,
        'receivedAt', (extract(epoch from c.received_at) * 1000)::bigint,
        'captureWidth', c.capture_width,
        'captureHeight', c.capture_height,
        'width', c.width,
        'height', c.height,
        'sharpness', c.sharpness,
        'peopleAnswer', c.people_answer,
        'facesDetected', c.faces_detected,
        'suggestedBlur', c.suggested_blur,
        'flagPeople', c.flag_people,
        'flagPinCheck', c.flag_pin_check
      ) as j
      from public.contributions c
      join public.profiles p on p.id = c.contributor_id
      where c.status = 'waiting'
    ) t
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Secret key only, as for every function in the Phase 7a migration
-- ---------------------------------------------------------------------------
revoke all on function public.submit_contribution(
  uuid, text, double precision, double precision, real, real, timestamptz, timestamptz,
  integer, integer, integer, integer, real, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.submit_contribution(
  uuid, text, double precision, double precision, real, real, timestamptz, timestamptz,
  integer, integer, integer, integer, real, boolean, jsonb
) to service_role;
revoke all on function public.contribution_queue(uuid) from public, anon, authenticated;
grant execute on function public.contribution_queue(uuid) to service_role;
