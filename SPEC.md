# BruinGuessr Spec

BruinGuessr is a GeoGuessr style game for UCLA's campus. Players see a photo taken somewhere on campus, get 30 seconds to drop a pin on a campus map, and score more the closer they land. It has solo play, a leaderboard, and live versus matches for 2 to 5 players.

This file is the source of truth. Anything marked FIXED is a hard requirement. Anything not specified here, especially visual design and UX, is your call.

## How to work

- Build in the phases below, in order. Stop at the end of each phase, tell me how to test it, and wait for my approval before starting the next.
- Keep a short PROGRESS.md in the repo root: what's done, key decisions, and anything I need to do manually. At the start of every session, read SPEC.md and PROGRESS.md first.
- If something here is impossible, or you see a clearly better approach, tell me before building instead of quietly deviating.
- Commit at the end of each phase with a clear message and push to origin main.
- When you need me to do something by hand (Supabase dashboard, Vercel settings, CLI login), give me exact click by click steps.

## Environment (already set up)

- The repo folder is named "UCLA GeoGuessr" (spaces and capitals). Name the package `bruinguessr`. The folder already contains `.git` (remote: github.com/dxx-912/UCLA-GeoGuessr), `.gitignore`, and `.env.local`. Do not overwrite `.env.local`. Extend `.gitignore` as needed but keep `.env*.local` in it.
- `.env.local` contains: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MAPILLARY_TOKEN`. The service role key and Mapillary token are server only. Never expose them to the client or commit them.
- Supabase project exists (project ref `waezvtzepdxiisefivmu`). Google sign in is configured, Site URL is `http://localhost:3000`, and `http://localhost:3000/**` is an allowed redirect. Sign in is Google only for v1, so the Email provider gets turned off in the Supabase dashboard (steps in PROGRESS.md).
- The GitHub repo is public. `/reference`, `/photos-inbox`, and all pipeline caches and manifests are gitignored. Nothing that maps a stored photo to its location or source ID may ever be committed.
- Vercel is linked to the GitHub repo and deploys on push to main. At deploy time, tell me which env vars to add in Vercel.
- Node 24 is installed.
- Keep the database schema in SQL migration files in the repo.

## Stack

Next.js (App Router, TypeScript), Supabase (Auth, Postgres, Storage, Realtime), MapLibre GL with OpenFreeMap tiles (no API key needed), Vercel. Other libraries are your choice.

## Phase 0: Campus boundary

- Build `data/campus.geojson` from UCLA's campus outline in OpenStreetMap. It should cover main campus and the residential Hill.
- Flag edge areas that might or might not belong (for example the medical center, Drake Stadium, Sunset Canyon Recreation Center, the Westwood Village edge) so I can decide.
- Render the boundary on a simple map page and wait for my approval.
- The boundary sets the scoring constant D below and, together with the Phase 1 eligibility buffer, decides which images are eligible. The game map should be framed to campus.

## Game rules (FIXED)

- A game is 5 rounds. Each round shows one photo and gives 30 seconds to place a pin.
- A pin placed when the timer hits zero counts as the guess. No pin means 0 points.
- Score per round = round(5000 × e^(−10 × max(0, d − 10) / D)), where d is the haversine distance in meters from guess to true location, and D is the diagonal of the campus.geojson bounding box in meters. A guess within 10 m is a perfect 5,000 and gets a bullseye celebration. Max 25,000 per game.
- After each round, reveal the true location, a line from guess to answer, the distance, and the points. After round 5, show a summary of all five rounds.
- The 5 images in a game are all different. Where possible, avoid repeating images the player has seen in their recent games.

## Anti cheat (FIXED)

The player must never be able to learn an image's location before guessing.

- Serve photos from our own Supabase Storage under random filenames with all metadata stripped. Never expose the Mapillary image ID, Mapillary URLs, or coordinates to the client before the guess is locked.
- The images table is not readable by clients. Clients get images only through server routes.
- Round start times, deadlines, and scoring are handled on the server. Guesses submitted after the deadline (plus a small grace period for latency) are rejected.

## Phase 1: Image pipeline

- Write a script that pulls every Mapillary image inside campus.geojson. Use the API v4 image radius search on a grid, the vector tiles, or both, whichever gives the most complete coverage.
- Fetch for each image: id, computed_geometry, captured_at, quality_score, is_pano, on_foot, creator, compass angle, and a 2048px thumbnail.
- Keep only flat images (no panoramas) inside the polygon. Filter by quality_score. Thin out near duplicates (same spot, same direction).
- Eligibility buffer: also consider images up to about 40 m outside the polygon (the streets bordering campus), keeping only those where campus is clearly visible. Show me a sample of buffer images before committing to the buffer.
- Copy survivors to Storage and record each in an images table: our own ID, storage path, lat, lng, source (mapillary, wikimedia, or original), source ID (server only), photographer, license, captured_at, report count, hidden flag.
- Then look at a random sample of 30 to 40 kept images yourself and tune the filters until nearly all are clearly playable: outdoors, recognizable, not blurry, not just pavement or a car hood. Report the final image count and how coverage is spread across campus, including any thin areas.
- Write a second script (required, Mapillary alone is too thin) for Wikimedia Commons geotagged photos inside the polygon. Accept only CC0, CC BY, and CC BY SA licenses.
- Write a third script that imports my own phone photos from a gitignored `/photos-inbox` folder. It reads GPS, and compass heading if present, from EXIF, strips all metadata, and runs the photos through the same pipeline and filters with source `original`. I will shoot the Hill and the northwest, where open imagery has no coverage.

## Phase 2: Single player

- Bare Google sign in comes first, so every game has an owner from day one. Usernames and the leaderboard stay in Phase 3.
- The full game loop following the rules above.
- A "report image" button on the reveal screen. An image reported by 3 different accounts is hidden from rotation. Each account has a daily report cap, and hidden images are kept for my review, not deleted.
- Show the photographer credit on each reveal screen, never before the guess.

## Phase 3: Accounts and leaderboard

- Open signup with Google via Supabase Auth. Google is the only sign in method for v1. Players must be signed in to play.
- New players pick a unique username, with a basic profanity filter.
- Leaderboard: one row per account, ranked by that account's best single game score (solo or versus), showing username and score. Ties go to whoever reached the score first. Completed solo games and completed versus games both count (a player's versus score is their own 5 round total). Abandoned games do not count.
- Show the signed in player's own rank even when they're off the visible page.

## Phase 4: Versus mode

- A signed in player hosts a game and gets a short room code (no ambiguous characters like 0/O or 1/I) plus a shareable link.
- 2 to 5 players join a lobby. The host starts the game once at least 2 players are in. The room locks once the game starts.
- Everyone gets the same 5 images in the same order, with a server synced 30 second timer.
- A round ends when everyone has guessed or time runs out. The reveal shows every player's pin, distance, and points, plus a running scoreboard.
- End with final standings and a rematch option that keeps the same group.
- If the host leaves, host passes to the next player. A player who disconnects can rejoin the same room and gets 0 for any rounds they missed.
- Each player's versus score counts toward the leaderboard the same way a solo game does, so it shows up only if it beats their best.

## Phase 5: Polish and deploy

- A credits page listing Mapillary and Wikimedia photographers with their license notices. It lists names and licenses only and never links to individual photos, because a source link reveals the location. Credit OpenFreeMap and OpenStreetMap on the map itself.
- Mobile support, loading states, empty states, error states.
- Deploy to Vercel. Tell me which env vars to add there, and remind me to add the production URL to Supabase's Site URL and redirect URLs.

## Design (your call)

You have full creative control over UI, UX, layout, motion, typography, and sound. The vibe should evoke GeoGuessr: bold, chunky, game show energy, satisfying reveals.

Reference screenshots in `/reference` come from two games:
- GeoGuessr: the overall energy, polish, and game feel.
- WatGuessr (watguessr.io): a campus guessing game for the University of Waterloo. It's the closest thing to what we're building, so use it as inspiration for the campus specific experience. You can also visit the site directly.

Hard limits:
- The color palette is built on UCLA Blue #2774AE and UCLA Gold #FFD100. The rest of the palette is up to you.
- Do not copy GeoGuessr's or WatGuessr's names, logos, or assets.
- Do not use official UCLA logos or the Bruin bear.
- The game's name is BruinGuessr.

## Out of scope for v1

Do not build these, but don't make them hard to add later:
- Daily challenge (same 5 images for everyone each day)
- Host settings in versus (round count, timer length)
- Guest play without an account
- Email sign up (to be added later with custom SMTP)
- Profiles, stats history, friends
- Panoramas
- Difficulty levels or zone filters (for example "Hill only")
