-- Phase 1: the photo pool.
--
-- Anti-cheat rule (SPEC.md): clients can never read this table. Row level security
-- is on and there are no policies, so only the server (secret key, which bypasses
-- RLS) can read or write. Photos reach players only through server routes.

create table public.images (
  id uuid primary key default gen_random_uuid(),

  -- Random filename in the "photos" storage bucket. Tells nothing about the photo.
  storage_path text not null unique,

  -- True location. Never sent to a client before that client's guess is locked.
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),

  -- Where the photo came from. source_id and source_url identify the original
  -- (and so its location), which makes them server only until the reveal.
  source text not null check (source in ('mapillary', 'wikimedia', 'original')),
  source_id text not null,
  source_url text,

  -- Credit shown on the reveal screen and the credits page.
  photographer text not null,
  photographer_url text,
  license text not null,
  license_url text,

  captured_at timestamptz,
  -- Compass direction the camera faced, degrees clockwise from north, if known.
  heading real check (heading is null or (heading >= 0 and heading < 360)),
  width integer not null check (width > 0),
  height integer not null check (height > 0),

  -- 'inside' the campus boundary, or in the 'buffer' ring just outside it.
  zone text not null default 'inside' check (zone in ('inside', 'buffer')),

  -- Moderation. A hidden photo is out of rotation but kept for review.
  report_count integer not null default 0 check (report_count >= 0),
  hidden boolean not null default false,
  hidden_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source, source_id)
);

comment on table public.images is
  'Photo pool. Server only: RLS is on with no policies. Never expose lat, lng, source_id or source_url before a guess is locked.';

alter table public.images enable row level security;
revoke all on table public.images from anon, authenticated;

-- Picking photos for a game only ever looks at the ones in rotation.
create index images_in_rotation_idx on public.images (id) where not hidden;

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger images_touch_updated_at
  before update on public.images
  for each row execute function public.touch_updated_at();

-- Photos are served straight from Storage under random filenames. The bucket is
-- public so a file can be fetched by its exact URL, but there are no policies on
-- storage.objects, so clients cannot list the bucket or upload to it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 1048576, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
