# BruinGuessr progress

Read SPEC.md first, then this file.

## Where things stand

**Phase 0 (campus boundary): built, waiting for Daniel's boundary decision. Not yet pushed.**

- `npm run campus:build` builds `data/campus-areas.geojson` (every candidate area) and `data/campus.geojson` (the boundary) from OpenStreetMap relation 7493269. Which flagged areas are in is set in `data/campus-selection.json`; edit it and re-run.
- `npm run campus:probe` writes photo positions to `.cache/review/photo-dots.json` (gitignored) for the review page.
- Review page: `npm run dev`, then http://localhost:3000/dev/boundary (development only, 404 in production).
- Current provisional boundary: main campus and the Hill, with medical center, Drake Stadium and Sunset Canyon Rec kept in; Southwest campus (Weyburn Terrace) and the five Westwood Village buildings left out. D = 2,297.5 m.
- `npm test` (27 tests), `npm run typecheck` and `npx eslint` all pass.

- The review page is verified in headless Chrome at desktop and phone widths: the map renders, the toggles (panel and map click) update the boundary, D, the score table and the photo counts, and the console is clean.

### Left before Phase 0 is done

- After Daniel decides: update `data/campus-selection.json` (set `approved: true`), re-run `npm run campus:build`, commit and push.

## Key decisions

- Plan review decisions (2026-11-15) are folded into SPEC.md: Wikimedia required, own photos as a third source (`original`), about 40 m eligibility buffer, Google sign in only, perfect radius of 10 m in the score formula, reports counted per account.
- Architecture: server-authoritative. All tables get RLS with no client policies; the browser talks to `/api` routes; game transitions are Postgres functions using the database clock. Realtime Broadcast is only a "something changed" ping in versus.
- MapLibre GL JS v6 needs its worker file served by us: `scripts/copy-maplibre-worker.mjs` copies it to `public/vendor/` after `npm install`. Load MapLibre through `loadMapLibre()` in `src/lib/map/maplibre.ts`.
- MapLibre sets `position: relative` on its container element, which overrides an `absolute` class and collapses the map to zero height. Always size a wrapper and give the map container `h-full w-full`.
- `src/lib/geo/boundary.ts` (`composeBoundary`) is the single place the boundary is assembled; the build script and the review page both use it.
- The medical area is cut along Charles E. Young Dr South and Tiverton Dr (coordinates in `scripts/build-campus.ts`); the botanical garden stays in the core.
- The repo is public. Never commit anything that maps a photo to a location or source ID (`.cache/`, `photos-inbox/`, manifests are gitignored).

## Photo supply (measured 2026-11-15, before any filtering)

- Mapillary inside the provisional boundary: 713 (457 on foot), zero panoramas. Wikimedia Commons: 168.
- In a 40 m ring outside the boundary: 1,174 Mapillary (98 on foot), 17 Wikimedia.
- Nothing on the Hill or at Sunset Canyon Rec. Daniel will shoot the Hill and the northwest.

## Things Daniel needs to do by hand

1. Before Phase 1: log the Supabase CLI into the account that owns project `waezvtzepdxiisefivmu` (`supabase logout`, then `supabase login`).
2. Before Phase 2: turn off the Email provider. Supabase dashboard → project → Authentication → Sign In / Providers → Email → switch off → Save.
