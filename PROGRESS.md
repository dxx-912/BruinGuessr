# BruinGuessr progress

Read SPEC.md first, then this file.

## Where things stand

**Phase 0 (campus boundary): done and approved 2026-11-15.**

- Approved boundary: main campus and the Hill, with the medical center, Drake Stadium and Sunset Canyon Rec kept in; Southwest campus (Weyburn Terrace) and the five Westwood Village buildings left out. **D = 2,297.5 m.**
- `npm run campus:build` rebuilds `data/campus-areas.geojson` and `data/campus.geojson` from OpenStreetMap relation 7493269. Which flagged areas are in is set in `data/campus-selection.json`.
- `npm run campus:probe` writes photo positions to `.cache/review/photo-dots.json` (gitignored) for the review page.
- Review page: `npm run dev`, then http://localhost:3000/dev/boundary (development only, 404 in production).

**Phase 1 (image pipeline): built, 160 photos live, waiting for Daniel's review of the last Wikimedia batch and his own photos (2026-11-15).**

- Database: `supabase/migrations/20261115000100_images.sql` is applied (table `images`, bucket `photos`, private since Phase 2). Apply new migrations with `supabase db push --yes` (the CLI is linked and needs no password).
- Three sources feed one local catalog in `.cache/pipeline/` (gitignored). Commands are listed in README.md.
- Live in Supabase: **124 Mapillary (117 inside + 7 buffer) + 36 Wikimedia = 160 photos**.
- Review tool: `npm run dev`, then http://localhost:3000/dev/photos (development only).
- `npm run photos:report` prints the pool, coverage and live anti-cheat checks. All nine pass (since 2026-11-16).
- `npm test`: 80 tests. `npm run test:live`: 19 tests against the real database.

### Decided by Daniel (2026-11-15)

- The 7 buffer photos that show campus are approved and live. **The buffer is dropped as a source**: the Mapillary script now keeps a buffer photo only if it already has an approval.
- The Wikimedia "UCLA Guest House" photo (wrong location tag) is rejected.
- Wikimedia requests identify themselves with `WIKIMEDIA_USER_AGENT` in `.env.local` (his UCLA address). With it, all 99 Wikimedia candidates downloaded.
- HEIC check: a real HEIC file (made with macOS `sips`, portrait orientation, GPS, heading, accuracy) imports correctly. A photo straight off an iPhone has not been tried yet.

### Waiting on Daniel

1. **35 newly downloaded Wikimedia photos** are "waiting" on `/dev/photos` (Source: Wikimedia, Status: Waiting). He asked to review these himself. Nothing from them is live.
2. **His own photos** of the Hill and the northwest: see "Adding your own photos" in README.md.

**Phase 2 (single player): done 2026-11-15. Daniel moved on to Phase 3 on 2026-11-16.**

- Google sign in, the full five-round game, the per-round photo address, photo reports and the photographer credit on the reveal are all in. How it works is in README.md ("How the game works"); the look is in DESIGN.md.
- Database: migrations `20261115000200_single_player.sql` and `20261115000300_score_far_guess.sql` are applied. The `photos` bucket is now **private**.
- Checks run at the end of the phase: `npm test` (80 passed), `npm run test:live` (19 passed), type-check, lint, production build, and a full game played in headless Chrome at desktop and phone size (a normal guess, a bullseye, time running out with a pin, time running out with no pin, summary, reload on the summary). No console errors.
- Not tested by me: the real Google sign in. It needs a person at a browser. Everything after sign in was tested through the development-only test login.

### Resolved: old photo filenames were still reachable through the CDN

- In Phase 1 the bucket was public, and Supabase's CDN cached 30 photos under their old filenames for a year. Purging the CDN is not available on this plan.
- Fixed 2026-11-16: Daniel ran `npm run photos:rotate` (all 160 photos renamed to new random filenames; nothing deleted; `.cache/pipeline/published.before-rotate.json` is the backup). `npm run photos:report` now passes all nine anti-cheat checks.
- Run `photos:rotate` again any time a filename might have leaked, when nobody is mid-game.

### How to test Phase 2

1. `npm run dev`, open http://localhost:3000, click "Sign in with Google to play", pick an account. You should land back on the home page with your name at top right.
2. "Play solo". Play five rounds: try a normal guess, try letting the clock run out with a pin on the map (it should count), and once with no pin (0 points).
3. On a reveal: check the photographer credit, click the photo thumbnail, try "Report photo".
4. During a round, open the browser's Network tab: the photo comes from `/api/games/…/rounds/N/photo`. Copy that address and open it after the round ends: it should say "Not found".
5. To test without Google or with several accounts: http://localhost:3000/api/dev/login?as=1 (1 to 9, development only).
6. Reported photos: `npm run photos:reports`.

### Decisions made in Phase 2 (say so if you want any changed)

- A round opens 2.5 s before its clock starts. The photo loads behind a "Round N" card, so the player gets the full 30 s. The server still sets every time.
- Guesses are accepted up to 1.5 s after the deadline (the "small grace period" in the spec).
- Report cap: 10 per account per 24 hours. One report per account per photo. Reports carry a reason.
- Photos from a player's last 10 games are avoided; photos a player reported are avoided for that player.
- Starting a new solo game ends an unfinished one ("abandoned"); a player has at most one solo game in progress.
- A reload during the reveal or summary shows the result without the photo, because the photo's address has stopped working by design. The copy in memory is what the reveal and summary use.
- All of these are columns in the one-row `settings` table, changeable without a code change.

**Phase 3 (accounts and leaderboard): done and approved by Daniel 2026-11-16. Phase 4 (versus) has not started; wait for Daniel to ask for it.**

- Usernames: picked once, on the first sign in (`/welcome`). 3 to 16 letters, numbers or underscores; unique ignoring case; shown as typed. The Google callback, the dev login, the home page, the game page and `POST /api/games` all send a player without a username to `/welcome` first (the API answers 403 `no_username`).
- Profanity filter: the `obscenity` package (catches "sh1t", "fuuuck", leaves "assassin" and "Scunthorpe" alone), also checked with underscores removed, plus a short reserved list (admin, moderator, BruinGuessr, UCLA, Joe Bruin…). Server only; the word list is not in the browser bundle (checked).
- Leaderboard: `/leaderboard`, 50 a page, open to anyone. One row per account: its best completed game. Ties go to the game that finished first. Abandoned and unfinished games never count; accounts without a username are left out. Signed-in players see "You're 4th of 120 with 21,345" above the table, and their own row pinned under the table when it is on another page.
- Versus without a schema change: the leaderboard is a view over `game_players` joined to `games` (any mode, `status = 'completed'`). A versus game already writes one `game_players` row per player with that player's own five-round total. A live test inserts a completed versus game and checks it ranks.
- Game summary: "New personal best" badge and "4th of 120 on the leaderboard" (a link to that page of the board), from `GET /api/me/standing`.
- Home: a "Leaderboard" button in the header (a trophy icon on phones); the account chip shows the username.
- Admin: `npm run usernames` lists usernames; `npm run usernames -- reset <name>` clears one so that player picks again (games and scores kept).
- Database: migration `20261116000100_accounts_leaderboard.sql` is applied (`profiles.username`, `set_username`, `username_available`, the `leaderboard_entries` view, `leaderboard`). All server only; a live test checks the public key can't read or call any of it, and that no account ID is ever sent.
- Checks run at the end of the phase: `npm test` (90 passed), `npm run test:live` (33 passed, including the HTTP checks with `npm run dev` running), type-check, lint, production build (dev routes 404, no secret and no profanity list in the browser bundle), and in headless Chrome at desktop and phone size: picking a username (bad name refused, short name refused, free name accepted), a full five-round game (normal guess, bullseye, time out with a pin, time out without, summary, reload), the summary's standing line, and the leaderboard. No console errors. Phone layout fixes made along the way: header overflow on the home page, and the summary buttons.
- All test accounts were deleted afterwards; the leaderboard is empty. Two games belonging to a real account (probably Daniel's, from testing Phase 2) were left alone; that account will be asked for a username on its next visit.

### How to test Phase 3

1. `npm run dev`, open http://localhost:3000 and sign in with Google. You should land on "Pick your name", with a suggestion made from your Google name.
2. Try a rude name, a name with a space, a two-letter name, and "admin": each is refused with a reason. Pick a real one.
3. Play a game. The summary should say "New personal best" and your rank; click the rank to go to the leaderboard.
4. Open http://localhost:3000/api/dev/login?as=1 in a private window, pick a second name, and play. Both should be on `/leaderboard`, best score first.
5. Try taking your own name again with the test account, in different capitals: "Someone already has that name."
6. `npm run usernames` lists the names. Delete the test accounts before real players arrive (or ask me to).

### Decisions made in Phase 3 (say so if you want any changed)

- Usernames can't be changed by the player (the spec says "pick"; no profile page in v1). `npm run usernames -- reset` is the escape hatch.
- Reserved names include Joe Bruin and Josie Bruin, since they are the mascots' names.
- The leaderboard is public, including to visitors who are not signed in. It shows username, best score and the date it was reached; versus records are marked "versus".
- "Ties go to whoever reached the score first" uses the time the game finished. In a versus game every player finishes at the same moment, so two players tied in the same versus game are ordered arbitrarily but consistently.
- A completed game with 0 points still counts (it is a completed game).

### Notes for Phase 4

- Tables already shaped for versus: `games.mode`, `game_players` (one row per player with `total_score`), `guesses` keyed by player. Scoring a round scores every player in the game and gives 0 to anyone without a pin. Not built yet: `rooms`, `room_members`.
- The leaderboard already counts versus games: just finish them with `status = 'completed'` and `completed_at`, with each player's `game_players.total_score` filled in. Players who miss rounds get 0 for them, as `_resolve_round` already does.
- Versus room screens should show usernames (`profiles.username`), never Google names.
- The development test login creates accounts named `dev-player-N@bruinguessr.test`. Delete them before the leaderboard goes live (all were deleted at the end of Phase 2).
- Deploy (Phase 5): Vercel needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, and Supabase needs the production URL in Site URL and redirect URLs. Until then the deployed site cannot sign anyone in.

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

### Working notes (tooling)

- Stack as installed: Next.js 16.4 (Turbopack, Cache Components on), React 19.3, Tailwind 4, MapLibre GL 6, supabase-js 2, sharp, vitest 5, Node 24. `AGENTS.md` says to read `node_modules/next/dist/docs/` before writing Next code; do that, several conventions differ from older versions.
- With Cache Components, an async file or database read in a page must sit under `<Suspense>` (or in a `use cache` function). Route handlers that touch the request or do async I/O are dynamic automatically.
- `npm run typecheck` runs `next typegen` first; plain `tsc` fails on `LayoutProps` without it.
- The app was scaffolded in a temp folder named `bruinguessr` and copied in, because the repo folder name has spaces and capitals.
- Dev-only pages and APIs (`/dev/*`, `/api/dev/*`) return 404 unless `NODE_ENV` is `development`. Checked against a production build.
- Phase 2 tooling: with Cache Components, anything that reads the session must call `await connection()` first (`currentUser()` does), or Next reports "Date.now() while prerendering". A redirect from a page that streams arrives in the page body with status 200, not as an HTTP redirect. Postgres `exp()` raises on underflow, and a `float8` loses a little precision when put in `jsonb` (about 14 digits).
- Looking at pages: the Claude in Chrome extension did not respond in this session. What worked was driving the installed Chrome headlessly with `puppeteer-core` (flags `--enable-unsafe-swiftshader --use-angle=swiftshader`), waiting for `.maplibregl-canvas`, then screenshotting. That is how both review pages were verified, including dragging a pin.
- Overpass API mirrors were flaky; the boundary build uses the main OSM API by object ID instead, with downloads cached in `.cache/osm/`.
- Mapillary: `on_foot` and `quality_score` are real API fields. Thumbnail URLs expire, so the script asks for a fresh one right before each download.
- Supabase: `supabase db push --yes` works without the database password (login role). Docker is not installed, so there is no local Supabase; migrations go straight to the real project.

### Phase 1 decisions

- Every candidate starts as "waiting". Nothing is uploaded without an explicit approval (contact sheet plus `photos:decide`, or the review page). Decisions live in `.cache/pipeline/decisions.json`, separate from the candidate lists, so re-running a source script never loses them.
- A rejected photo stays in the candidate list and its near duplicates are not promoted, because what was wrong with it (glare, car hood) is usually wrong with its neighbours.
- Filters (all in `src/lib/pipeline/config.ts`): Mapillary quality ≥ 0.5; near duplicates are photos within 22 m facing within 40° of each other; buffer photos must have campus ground within 70 m inside a ±30° field of view. I reviewed all 142 inside candidates and rejected 25 (glare, dark, car hood, bare wall). Lowest sharpness among kept photos is still clearly sharp, so the blur filter never fired.
- Served file: WebP, 1600 px long edge, quality 80, about 270 KB. sharp re-encodes from pixels, so no metadata survives; a test and the publish step both verify that.
- Storage filenames are 32 random hex characters, unrelated to our ID or the source ID. The bucket was public in Phase 1 and is private since Phase 2; it has no policies (no listing, no uploads).
- Wikimedia: only CC0, CC BY and CC BY-SA; "Public domain" and FAL were refused (5 files). Commons serves only its standard thumbnail widths freely, so the script asks for 1920 px and never the original. Commons camera coordinates were sanity-checked against the building each title names.
- Own photos are keyed by a hash of the file contents, start as "waiting", and are placed or corrected on `/dev/photos`. HEIC is converted with macOS `sips`. Publishing also pushes moved pins and withdraws rejected photos (`hidden_reason = 'withdrawn in review'`), and never un-hides a photo that players reported.
- The Supabase project uses the new-style keys (`sb_publishable_…`, `sb_secret_…`) under the old env names. `adminClient()` in `src/lib/pipeline/publish.ts` is the script-side client; the app's `server-only` clients are in `src/lib/server/supabase.ts`.

## Photo supply (measured 2026-11-15)

- Mapillary: 2,753 images in and around campus → 866 beyond the buffer, 259 buffer photos without campus in frame, 132 below the quality threshold, 1,143 near duplicates → 353 candidates (142 inside, 211 buffer) → 117 inside and 7 buffer approved after review. Zero panoramas exist here.
- Wikimedia Commons: 168 geotagged files inside the boundary → 99 after license, size, shape, date and crowding filters → all 99 downloaded → 64 reviewed by me (36 approved; the rest were portraits, interiors, events, wildfire shots) and 35 waiting for Daniel.
- Nothing on the Hill or at Sunset Canyon Rec. Daniel will shoot the Hill and the northwest.

## Things Daniel needs to do by hand

1. ~~Log the Supabase CLI into the account that owns project `waezvtzepdxiisefivmu`.~~ Done 2026-11-15 (project "UCLA-GeoGuessr", us-east-1).
2. ~~Turn off the Email provider.~~ Already off when Phase 2 started (checked 2026-11-15).
3. ~~Add a Wikimedia contact to `.env.local`.~~ Done 2026-11-15.
4. ~~Run `npm run photos:rotate`.~~ Done 2026-11-16; all anti-cheat checks pass.
