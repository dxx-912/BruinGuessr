# BruinGuessr progress

Read SPEC.md first, then this file.

## Where things stand

**Phase 0 (campus boundary): done and approved 2026-11-15.**

- Approved boundary: main campus and the Hill, with the medical center, Drake Stadium and Sunset Canyon Rec kept in; Southwest campus (Weyburn Terrace) and the five Westwood Village buildings left out. **D = 2,297.5 m.**
- `npm run campus:build` rebuilds `data/campus-areas.geojson` and `data/campus.geojson` from OpenStreetMap relation 7493269. Which flagged areas are in is set in `data/campus-selection.json`.
- `npm run campus:probe` writes photo positions to `.cache/review/photo-dots.json` (gitignored) for the review page.
- Review page: `npm run dev`, then http://localhost:3000/dev/boundary (development only, 404 in production).

**Phase 1 (image pipeline): built, 160 photos live, waiting for Daniel's review of the last Wikimedia batch and his own photos (2026-11-15).**

- Database: `supabase/migrations/20261115000100_images.sql` is applied (table `images`, public bucket `photos`). Apply new migrations with `supabase db push --yes` (the CLI is linked and needs no password).
- Three sources feed one local catalog in `.cache/pipeline/` (gitignored). Commands are listed in README.md.
- Live in Supabase: **124 Mapillary (117 inside + 7 buffer) + 36 Wikimedia = 160 photos**.
- Review tool: `npm run dev`, then http://localhost:3000/dev/photos (development only).
- `npm run photos:report` prints the pool, coverage and live anti-cheat checks. All six checks pass.
- `npm test`: 68 tests.

### Decided by Daniel (2026-11-15)

- The 7 buffer photos that show campus are approved and live. **The buffer is dropped as a source**: the Mapillary script now keeps a buffer photo only if it already has an approval.
- The Wikimedia "UCLA Guest House" photo (wrong location tag) is rejected.
- Wikimedia requests identify themselves with `WIKIMEDIA_USER_AGENT` in `.env.local` (his UCLA address). With it, all 99 Wikimedia candidates downloaded.
- HEIC check: a real HEIC file (made with macOS `sips`, portrait orientation, GPS, heading, accuracy) imports correctly. A photo straight off an iPhone has not been tried yet.

### Waiting on Daniel

1. **35 newly downloaded Wikimedia photos** are "waiting" on `/dev/photos` (Source: Wikimedia, Status: Waiting). He asked to review these himself. Nothing from them is live.
2. **His own photos** of the Hill and the northwest: see "Adding your own photos" in README.md.

### Coverage (153 inside-campus photos; the 7 buffer photos are not in this grid, 7 × 7 grid, north up, `·` is outside campus)

```
        A    B    C    D    E    F    G
  1     0    ·    ·    ·    0    0    0
  2     0    0    ·    ·    1   13    3
  3     0    0    3    0    2   20    7
  4     1    0   12   10   15    7    7
  5     ·    ·    2    6    5   12    1
  6     ·    ·    ·    5    6   14    ·
  7     ·    ·    ·    0    1    0    ·
```

- Strong: the core from Bruin Walk to Royce and Powell, the east side down Portola Plaza and Charles E. Young Dr East, the Court of Sciences.
- Thin or empty: **the whole Hill (columns A and B)**, Sunset Canyon Rec, Drake Stadium, the north edge along Sunset (row 1), the Anderson and northwest corner (D3), and the south edge at Le Conte (row 7).

## Key decisions

- Plan review decisions (2026-11-15) are folded into SPEC.md: Wikimedia required, own photos as a third source (`original`), about 40 m eligibility buffer, Google sign in only, perfect radius of 10 m in the score formula, reports counted per account.
- Architecture: server-authoritative. All tables get RLS with no client policies; the browser talks to `/api` routes; game transitions are Postgres functions using the database clock. Realtime Broadcast is only a "something changed" ping in versus.
- MapLibre GL JS v6 needs its worker file served by us: `scripts/copy-maplibre-worker.mjs` copies it to `public/vendor/` after `npm install`. Load MapLibre through `loadMapLibre()` in `src/lib/map/maplibre.ts`.
- MapLibre sets `position: relative` on its container element, which overrides an `absolute` class and collapses the map to zero height. Always size a wrapper and give the map container `h-full w-full`.
- `src/lib/geo/boundary.ts` (`composeBoundary`) is the single place the boundary is assembled; the build script and the review page both use it.
- The medical area is cut along Charles E. Young Dr South and Tiverton Dr (coordinates in `scripts/build-campus.ts`); the botanical garden stays in the core.
- The repo is public. Never commit anything that maps a photo to a location or source ID (`.cache/`, `photos-inbox/`, manifests are gitignored).

### Phase 1 decisions

- Every candidate starts as "waiting". Nothing is uploaded without an explicit approval (contact sheet plus `photos:decide`, or the review page). Decisions live in `.cache/pipeline/decisions.json`, separate from the candidate lists, so re-running a source script never loses them.
- A rejected photo stays in the candidate list and its near duplicates are not promoted, because what was wrong with it (glare, car hood) is usually wrong with its neighbours.
- Filters (all in `src/lib/pipeline/config.ts`): Mapillary quality ≥ 0.5; near duplicates are photos within 22 m facing within 40° of each other; buffer photos must have campus ground within 70 m inside a ±30° field of view. I reviewed all 142 inside candidates and rejected 25 (glare, dark, car hood, bare wall). Lowest sharpness among kept photos is still clearly sharp, so the blur filter never fired.
- Served file: WebP, 1600 px long edge, quality 80, about 270 KB. sharp re-encodes from pixels, so no metadata survives; a test and the publish step both verify that.
- Storage filenames are 32 random hex characters, unrelated to our ID or the source ID. The bucket is public (fetch by exact URL) with no policies (no listing, no uploads).
- Wikimedia: only CC0, CC BY and CC BY-SA; "Public domain" and FAL were refused (5 files). Commons serves only its standard thumbnail widths freely, so the script asks for 1920 px and never the original. Commons camera coordinates were sanity-checked against the building each title names.
- Own photos are keyed by a hash of the file contents, start as "waiting", and are placed or corrected on `/dev/photos`. HEIC is converted with macOS `sips`. Publishing also pushes moved pins and withdraws rejected photos (`hidden_reason = 'withdrawn in review'`), and never un-hides a photo that players reported.
- The Supabase project uses the new-style keys (`sb_publishable_…`, `sb_secret_…`) under the old env names. `adminClient()` in `src/lib/pipeline/publish.ts` is the script-side client; Phase 2 needs a `server-only` version for the app.

## Photo supply (measured 2026-11-15)

- Mapillary: 2,753 images in and around campus → 866 beyond the buffer, 259 buffer photos without campus in frame, 132 below the quality threshold, 1,143 near duplicates → 353 candidates (142 inside, 211 buffer) → 117 inside approved after review. Zero panoramas exist here.
- Wikimedia Commons: 168 geotagged files inside the boundary → 99 after license, size, shape, date and crowding filters → 64 downloaded so far → 36 approved after review (the rest were portraits, interiors, events, wildfire shots).
- Nothing on the Hill or at Sunset Canyon Rec. Daniel will shoot the Hill and the northwest.

## Things Daniel needs to do by hand

1. ~~Log the Supabase CLI into the account that owns project `waezvtzepdxiisefivmu`.~~ Done 2026-11-15 (project "UCLA-GeoGuessr", us-east-1).
2. Before Phase 2: turn off the Email provider. Supabase dashboard → project → Authentication → Sign In / Providers → Email → switch off → Save.
3. ~~Add a Wikimedia contact to `.env.local`.~~ Done 2026-11-15.
