-- Phase 7a: photo contributions.
--
-- Signed-in players send campus photos from their phone. Each one waits in a
-- private bucket until an admin approves it, which puts it in the pool with
-- source 'community', or rejects it, which deletes the file at once.
--
-- Same rules as before: every table is server only (RLS on, no client
-- policies, no grants), and every function can be called only with the secret
-- key, from our own API routes. Admin functions also check the caller's role
-- themselves, from profiles.role, on every call.

-- ---------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------
alter table public.settings
  -- Per account: submissions in any rolling 24 hours, and waiting at once.
  add column contribution_daily_limit integer not null default 10 check (contribution_daily_limit > 0),
  add column contribution_waiting_limit integer not null default 30 check (contribution_waiting_limit > 0);

comment on column public.settings.contribution_daily_limit is 'Photo contributions one account may send in any 24 hours.';
comment on column public.settings.contribution_waiting_limit is 'Photo contributions one account may have waiting for review at once.';

-- ---------------------------------------------------------------------------
-- 2. Roles
-- ---------------------------------------------------------------------------
-- No function or API changes this column. It is set from the command line
-- (npm run admin -- grant <username>) with the secret key. It is never read
-- from the session token, whose user metadata the player can edit.
alter table public.profiles
  add column role text not null default 'player' check (role in ('player', 'admin')),
  add constraint profiles_guest_is_player check (not is_guest or role = 'player');

comment on column public.profiles.role is 'player or admin. Changed only from the command line (npm run admin).';

-- True when this account is an admin right now. Every admin function and API
-- asks this on each request, so revoking takes effect at once.
create function public.is_admin(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user and p.role = 'admin' and not p.is_guest
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Contributed photos in the pool
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.images'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%mapillary%'
  loop
    execute format('alter table public.images drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.images
  add constraint images_source_check check (source in ('mapillary', 'wikimedia', 'original', 'community')),
  -- The player who contributed the photo. Set only for source 'community'.
  -- That player never gets the photo in a game, and neither does anyone in a
  -- versus game with them.
  add column contributor_id uuid references public.profiles (id) on delete set null,
  -- Phone compass headings are rough, so they are marked as such.
  add column heading_approximate boolean not null default false;

create index images_contributor_idx on public.images (contributor_id) where contributor_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Submissions
-- ---------------------------------------------------------------------------
create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'rejected')),
  -- Random filename in the private "contributions" bucket while waiting. The
  -- file is deleted once the submission is decided.
  storage_path text unique check (storage_path is null or storage_path ~ '^[0-9a-f]{32}\.jpg$'),

  -- What the phone reported at the shutter. GPS accuracy is the radius in
  -- metres; anything worse than 40 m is refused before it gets here.
  gps_lat double precision not null check (gps_lat between -90 and 90),
  gps_lng double precision not null check (gps_lng between -180 and 180),
  accuracy_m real not null check (accuracy_m > 0 and accuracy_m <= 40),
  -- Degrees clockwise from true north (corrected from magnetic), approximate.
  heading real check (heading is null or (heading >= 0 and heading < 360)),
  -- Device clock: when the position was read and when the shutter was pressed.
  position_at timestamptz not null,
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),

  -- The camera frame's actual size, and the stored file's (at most 2048 px).
  capture_width integer not null check (capture_width > 0),
  capture_height integer not null check (capture_height > 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sharpness real not null check (sharpness >= 0),

  -- "Are there people in this photo?", and what the browser's detector found.
  people_answer boolean not null,
  faces_detected integer not null default 0 check (faces_detected >= 0),
  flag_people boolean generated always as (people_answer or faces_detected > 0) stored,
  -- A fix worse than 25 m needs a reviewer to confirm or move the pin.
  flag_pin_check boolean generated always as (accuracy_m > 25) stored,

  license text not null default 'CC BY-SA 4.0' check (license = 'CC BY-SA 4.0'),
  license_accepted_at timestamptz not null default now(),

  -- The review. lat and lng are the pin as approved (moved or not).
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text check (reject_reason is null or char_length(reject_reason) between 1 and 300),
  image_id uuid references public.images (id) on delete set null,

  -- A waiting submission has its file; a decided one never does.
  check ((status = 'waiting') = (storage_path is not null)),
  check (status <> 'rejected' or reject_reason is not null)
);
comment on table public.contributions is 'Photos sent by players, waiting for review or decided. Server only.';

create index contributions_contributor_idx on public.contributions (contributor_id, received_at desc);
create index contributions_waiting_idx on public.contributions (received_at) where status = 'waiting';

-- Who approved, rejected, moved or blurred what, and when. Kept when the
-- submission or the admin's account is gone.
create table public.admin_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_id uuid references public.profiles (id) on delete set null,
  admin_username text,
  action text not null check (action in ('approve', 'reject', 'move_pin', 'confirm_pin', 'blur', 'faces_checked')),
  contribution_id uuid,
  image_id uuid,
  details jsonb not null default '{}'::jsonb
);
comment on table public.admin_audit is 'Admin actions on contributions. Server only.';

create index admin_audit_at_idx on public.admin_audit (at desc);
create index admin_audit_contribution_idx on public.admin_audit (contribution_id);

alter table public.contributions enable row level security;
alter table public.admin_audit enable row level security;
revoke all on table public.contributions, public.admin_audit from anon, authenticated;

-- The waiting files. Private, no policies: only the secret key reads or writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contributions', 'contributions', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 5. Sending a photo
-- ---------------------------------------------------------------------------
-- How many this account has sent in the last 24 hours and has waiting, against
-- the limits. A cheap check before the upload; submit_contribution checks again
-- under the lock.
create function public.contribution_quota(p_user uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'last24h', (select count(*) from public.contributions c where c.contributor_id = p_user and c.received_at > now() - interval '24 hours'),
    'waiting', (select count(*) from public.contributions c where c.contributor_id = p_user and c.status = 'waiting'),
    'dailyLimit', s.contribution_daily_limit,
    'waitingLimit', s.contribution_waiting_limit
  )
  from public.settings s;
$$;

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
  p_faces integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_settings public.settings;
  v_profile public.profiles;
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
    capture_width, capture_height, width, height, sharpness, people_answer, faces_detected
  ) values (
    p_user, p_storage_path, p_gps_lat, p_gps_lng, p_accuracy_m, p_heading, p_position_at, p_captured_at,
    p_capture_width, p_capture_height, p_width, p_height, p_sharpness, p_people, greatest(coalesce(p_faces, 0), 0)
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- The player's own submissions, newest first. Only the contributor sees this
-- list. No positions: they took the photos, and nothing else needs them.
create function public.my_contributions(p_user uuid, p_limit integer default 60)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(t.j order by t.received_at desc), '[]'::jsonb)
  from (
    select c.received_at, jsonb_build_object(
      'id', c.id,
      -- Live means approved and still in rotation.
      'status', case
        when c.status = 'approved' and i.id is not null and not i.hidden then 'live'
        when c.status = 'approved' then 'removed'
        else c.status
      end,
      'receivedAt', (extract(epoch from c.received_at) * 1000)::bigint,
      'reason', c.reject_reason
    ) as j
    from public.contributions c
    left join public.images i on i.id = c.image_id
    where c.contributor_id = p_user
    order by c.received_at desc
    limit greatest(1, least(p_limit, 200))
  ) t;
$$;

-- Where the bytes for one of the player's own submissions are, to draw a small
-- copy in their list: the waiting file, or the live photo once approved.
-- Null for anyone else's, and for rejected ones (their file is gone).
create function public.my_contribution_file(p_user uuid, p_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when c.status = 'waiting' then jsonb_build_object('bucket', 'contributions', 'path', c.storage_path)
    when c.status = 'approved' and i.id is not null and not i.hidden then jsonb_build_object('bucket', 'photos', 'path', i.storage_path)
  end
  from public.contributions c
  left join public.images i on i.id = c.image_id
  where c.id = p_id and c.contributor_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- 6. Review (admins only)
-- ---------------------------------------------------------------------------
-- The queue: people first, then pin checks, then oldest first.
create function public.contribution_queue(p_admin uuid)
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

-- The waiting file of one submission, for the review page.
create function public.contribution_file(p_admin uuid, p_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select c.storage_path
  from public.contributions c
  where c.id = p_id and c.status = 'waiting' and public.is_admin(p_admin);
$$;

-- Photos in rotation within p_radius_m of a spot and facing within
-- p_heading_deg of p_heading (a photo with no heading, or no heading given,
-- counts as facing the same way): the pipeline's near-duplicate rule.
create function public.nearby_images(
  p_admin uuid,
  p_lat double precision,
  p_lng double precision,
  p_heading real,
  p_radius_m double precision default 22,
  p_heading_deg double precision default 40
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_dlat double precision := p_radius_m / 111320.0;
  v_dlng double precision := p_radius_m / (111320.0 * cos(radians(p_lat)));
begin
  if not public.is_admin(p_admin) then
    return jsonb_build_object('error', 'not_found');
  end if;
  return (
    select coalesce(jsonb_agg(t.j order by t.d), '[]'::jsonb)
    from (
      select d, jsonb_build_object('id', i.id, 'lat', i.lat, 'lng', i.lng, 'heading', i.heading, 'source', i.source, 'distanceM', round(d::numeric, 1)) as j
      from public.images i
      cross join lateral (select public.haversine_m(p_lat, p_lng, i.lat, i.lng) as d) dist
      where not i.hidden
        and i.lat between p_lat - v_dlat and p_lat + v_dlat
        and i.lng between p_lng - v_dlng and p_lng + v_dlng
        and d <= p_radius_m
        and (
          p_heading is null or i.heading is null
          or least(abs(i.heading - p_heading), 360 - abs(i.heading - p_heading)) < p_heading_deg
        )
    ) t
  );
end;
$$;

-- The stored file of a photo in the pool, for the review page's look at
-- nearby photos. Admins only.
create function public.admin_image_file(p_admin uuid, p_image uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select i.storage_path from public.images i where i.id = p_image and public.is_admin(p_admin);
$$;

create function public._audit(p_admin uuid, p_action text, p_contribution uuid, p_image uuid, p_details jsonb default '{}'::jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into public.admin_audit (admin_id, admin_username, action, contribution_id, image_id, details)
  select p_admin, (select username from public.profiles where id = p_admin), p_action, p_contribution, p_image, coalesce(p_details, '{}'::jsonb);
$$;

-- Publishes a submission. The server has already applied the blur boxes,
-- made the 1600 px WebP, checked it for metadata, checked the pin is inside
-- the boundary, and uploaded it to "photos" as p_storage_path. Returns the
-- waiting file's path for the server to delete.
create function public.approve_contribution(
  p_admin uuid,
  p_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_pin_confirmed boolean,
  p_faces_checked boolean,
  p_blur jsonb,
  p_storage_path text,
  p_width integer,
  p_height integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contributions;
  v_name text;
  v_moved_m double precision;
  v_image uuid;
  v_blur jsonb := coalesce(p_blur, '[]'::jsonb);
begin
  if not public.is_admin(p_admin) then
    return jsonb_build_object('error', 'not_found');
  end if;
  select * into v_c from public.contributions where id = p_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_c.status <> 'waiting' then
    return jsonb_build_object('error', 'already_decided');
  end if;
  if p_lat is null or p_lng is null then
    return jsonb_build_object('error', 'bad_pin');
  end if;
  if v_c.flag_people and not coalesce(p_faces_checked, false) then
    return jsonb_build_object('error', 'faces_unchecked');
  end if;

  v_moved_m := public.haversine_m(v_c.gps_lat, v_c.gps_lng, p_lat, p_lng);
  if v_c.flag_pin_check and not coalesce(p_pin_confirmed, false) and v_moved_m < 0.5 then
    return jsonb_build_object('error', 'pin_unchecked');
  end if;

  -- The credit is the contributor's username, kept in step by a trigger.
  select coalesce(username, 'A BruinGuessr player') into v_name from public.profiles where id = v_c.contributor_id;

  insert into public.images (
    storage_path, lat, lng, source, source_id, photographer, license, license_url,
    captured_at, heading, heading_approximate, width, height, zone, contributor_id
  ) values (
    p_storage_path, p_lat, p_lng, 'community', v_c.id::text, v_name, 'CC BY-SA 4.0',
    'https://creativecommons.org/licenses/by-sa/4.0/',
    v_c.captured_at, v_c.heading, v_c.heading is not null, p_width, p_height, 'inside', v_c.contributor_id
  )
  returning id into v_image;

  update public.contributions
  set status = 'approved', storage_path = null, lat = p_lat, lng = p_lng, image_id = v_image,
      reviewed_by = p_admin, reviewed_at = now()
  where id = p_id;

  perform public._audit(p_admin, 'approve', p_id, v_image);
  if v_moved_m >= 0.5 then
    perform public._audit(p_admin, 'move_pin', p_id, v_image, jsonb_build_object(
      'from', jsonb_build_array(v_c.gps_lat, v_c.gps_lng), 'to', jsonb_build_array(p_lat, p_lng), 'meters', round(v_moved_m::numeric, 1)));
  elsif coalesce(p_pin_confirmed, false) then
    perform public._audit(p_admin, 'confirm_pin', p_id, v_image);
  end if;
  if jsonb_typeof(v_blur) = 'array' and jsonb_array_length(v_blur) > 0 then
    perform public._audit(p_admin, 'blur', p_id, v_image, jsonb_build_object('boxes', v_blur));
  end if;
  if coalesce(p_faces_checked, false) then
    perform public._audit(p_admin, 'faces_checked', p_id, v_image);
  end if;

  return jsonb_build_object('ok', true, 'imageId', v_image, 'oldPath', v_c.storage_path);
end;
$$;

-- Turns a submission down with a reason. Returns the waiting file's path for
-- the server to delete at once.
create function public.reject_contribution(p_admin uuid, p_id uuid, p_reason text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_c public.contributions;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_admin(p_admin) then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_reason is null or char_length(v_reason) > 300 then
    return jsonb_build_object('error', 'bad_reason');
  end if;
  select * into v_c from public.contributions where id = p_id for update;
  if not found then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_c.status <> 'waiting' then
    return jsonb_build_object('error', 'already_decided');
  end if;

  update public.contributions
  set status = 'rejected', storage_path = null, reject_reason = v_reason, reviewed_by = p_admin, reviewed_at = now()
  where id = p_id;
  perform public._audit(p_admin, 'reject', p_id, null, jsonb_build_object('reason', v_reason));

  return jsonb_build_object('ok', true, 'oldPath', v_c.storage_path);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The credit follows the username
-- ---------------------------------------------------------------------------
create function public.sync_contributor_credit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.images
  set photographer = coalesce(new.username, 'A BruinGuessr player')
  where contributor_id = new.id and source = 'community' and photographer is distinct from coalesce(new.username, 'A BruinGuessr player');
  return new;
end;
$$;

create trigger profiles_sync_contributor_credit
  after update of username on public.profiles
  for each row
  when (old.username is distinct from new.username)
  execute function public.sync_contributor_credit();

-- ---------------------------------------------------------------------------
-- 8. Deleting an account takes its photos with it
-- ---------------------------------------------------------------------------
-- Live photos leave rotation for good, losing their credit and their link to
-- the account; waiting submissions are deleted. The rows of past rounds that
-- used a photo stay, so their scores stay. Returns the files for the server to
-- delete from Storage. Safe to call twice.
create function public.withdraw_contributions(p_user uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_live text[];
  v_waiting text[];
begin
  select coalesce(array_agg(storage_path), '{}') into v_live
  from public.images where contributor_id = p_user;
  update public.images
  set hidden = true, hidden_reason = 'contributor account deleted', photographer = '', contributor_id = null
  where contributor_id = p_user;

  select coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}') into v_waiting
  from public.contributions where contributor_id = p_user;
  delete from public.contributions where contributor_id = p_user;

  return jsonb_build_object('live', to_jsonb(v_live), 'waiting', to_jsonb(v_waiting));
end;
$$;

-- As in Phase 6a (the player's solo games go with them), plus their photos.
-- The account deletion API calls withdraw_contributions first so it can delete
-- the files; this is the backstop for an account deleted any other way.
create or replace function public.handle_deleted_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.withdraw_contributions(old.id);
  delete from public.games where created_by = old.id and mode = 'solo';
  return old;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Nobody gets their own photo
-- ---------------------------------------------------------------------------
-- As in Phase 6b, plus: a photo contributed by any of p_users is never picked.
-- Solo passes the one player; versus passes everyone in the game, because the
-- contributor would know the answer.
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
      and (i.contributor_id is null or not (i.contributor_id = any (p_users)))
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
-- 10. Only the server may call any of this
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
        'is_admin', 'contribution_quota', 'submit_contribution', 'my_contributions', 'my_contribution_file',
        'contribution_queue', 'contribution_file', 'nearby_images', 'admin_image_file', '_audit',
        'approve_contribution', 'reject_contribution', 'sync_contributor_credit', 'withdraw_contributions',
        'handle_deleted_profile', '_pick_images'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
