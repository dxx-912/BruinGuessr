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

- Store photos in our own Supabase Storage under random filenames with all metadata stripped. Never expose the Mapillary image ID, Mapillary URLs, or coordinates to the client before the guess is locked.
- Players never see a photo's permanent storage address. Each round's photo is served through a per-round URL that stops working once the round ends, so nobody can build a table of photo addresses and their answers.
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
- The photo import includes a dev-only page that shows each of my imported photos pinned on the map, so I can drag a pin to correct the location before the photo goes live. Phone GPS is unreliable near the Hill towers. Imported photos stay out of the game until I have reviewed them there.

## Phase 2: Single player

- Bare Google sign in comes first, so every game has an owner from day one. Usernames and the leaderboard stay in Phase 3.
- The full game loop following the rules above.
- Serve each round's photo through a per-round URL that stops working once the round ends (see Anti cheat). The permanent storage address is never sent to a player.
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

## Iteration 2

Phases 0 to 5 are done and live. Iteration 2 comes from the first round of feedback. Where anything in this section conflicts with an earlier section, this section wins. Build it as three phases, 6a, 6b and 6c, with the same stop and approve rhythm as before.

### Phase 6a: Site structure and accounts

Navigation
- A persistent side navigation bar on desktop with: Play (the default home page), Leaderboard, Profile, Settings. Credits stays in the footer.
- On phones the side bar becomes a bottom tab bar with the same items. Never a side bar on a phone.
- Top right of every page: when signed in, the player's avatar and username with a small menu (Profile, Settings, Log out). When signed out, "Log in" and "Sign up" buttons, like any other website.

Sign in (FIXED)
- Google is still the only sign in method. Email sign up stays out of scope.
- No "Sign in with Google to play" button on the homepage. "Log in" and "Sign up" lead to one auth page that offers "Continue with Google". The page wording follows which button was pressed.

Guest play (FIXED)
- A signed out visitor can play solo games as a guest so they can try the game before signing up.
- Guest games never count toward the leaderboard and are never attached to an account later.
- After a guest game, the summary invites them to sign up to save scores and get on the leaderboard.
- Versus requires an account.
- All anti cheat rules apply to guests exactly as to signed in players. Rate limit guest game creation so it can't be abused.

Play page (home)
- Headline: "Know UCLA?"
- Subheading: "Real Bruins know campus inside out. Five rounds to prove you actually go to class."
- Two large buttons, the main focus of the page:
  - Solo, with "See how high you can score on the leaderboard."
  - Versus, with "Join or host a lobby to play with friends!"
- Three feature bubbles below them covering Look, Pin and Score (or similar short selling points).
- A "Top players" strip showing the top few players from the leaderboard.
- A much smaller footer than now.

Profile page
- Username, join date, and stats: best game score, games played, average score per round, bullseyes, versus games played and won.
- Recent games, each expandable to show its rounds with distance and points.
- Profiles are visible to other players by username. Never show a player's email to anyone but themselves.

Settings page
- Change username: same rules as picking one (unique, profanity filtered, reserved names), at most once every 30 days. Show when the next change is allowed.
- Account: the signed in Google email, shown only to the account owner.
- Delete account: confirm by typing the username. Removes the account and its leaderboard entry.

### Phase 6b: Versus becomes a health battle (FIXED)

- Every player starts with 6,000 health.
- Each round is scored with the normal per round formula. Each player then loses health equal to (the round's best score minus their own score) × the round multiplier. The round's best scorer loses nothing.
- The multiplier is 1.0 for rounds 1 to 4, then rises by 0.5 each round from round 5, so games always end.
- A player at 0 health is eliminated and can keep watching the rest of the game. Play continues until one player is left. If the last remaining players all reach 0 in the same round, the one with the most health left after that round's damage wins.
- Timer: 30 seconds per round, but as soon as the first player locks in a guess, everyone else's remaining time drops to 10 seconds (if they had more than 10 left).
- Rounds are no longer capped at 5. Photos must still not repeat within a game.
- The reveal shows each player's distance, round score, damage taken and remaining health. The end screen shows the winner and the elimination order.
- Versus games no longer count toward the leaderboard. The leaderboard ranks solo games only, and existing versus entries drop off it.
- Starting health, the multiplier schedule and the 10 second countdown are values in the settings table so I can tune them after playtesting.

### Phase 6c: Visual pass

- Much more colour. UCLA Blue and Gold stay the main colours but stop being the only ones. Suggested supporting colours: the terracotta red brick of Royce Hall and Powell Library, and campus greens. Add clear colours for health, damage and elimination.
- A rough, stylized 2D illustration of campus on the Play page, in the spirit of WatGuessr's homepage art: for example Dickson Plaza with Royce Hall and the fountain seen from a distance. Flat and clean, drawn as SVG. Do not copy WatGuessr's artwork.
- Restyle the Leaderboard, Profile and Settings pages using the WatGuessr screenshots in `/reference` as the guide for layout and feel.
- Update DESIGN.md with the new palette and illustration style.

## Photo contributions

Signed-in players contribute campus photos from their phone, to fill the places open imagery misses (the Hill, the northwest, the edges). Where anything in this section conflicts with an earlier section, this section wins. Build it as two phases, 7a and 7b, with the same stop and approve rhythm as before.

All anti cheat rules apply to contributed photos exactly as to the rest of the pool. No contributed photo reaches a game without a person reviewing it.

### Phase 7a: Capture, review queue, admin, own photos excluded

Contribute page
- A fifth navigation item, **Contribute**: in the side bar after Settings, and in the bottom tab bar on phones. It leads to `/contribute`. Signed out, it goes to the login page with a line saying contributing needs an account. Guests cannot contribute.
- On a desktop without a rear camera, the page says to open it on a phone.
- Flow, in order: ask for location, then open the rear camera inside the page (`getUserMedia` with `facingMode: environment`, not the phone's camera app, so the photo is provably taken at the moment and place its position was read). Capture the photo plus GPS position, accuracy and compass heading if available.
- Camera resolution: request the highest resolution the device supports (from the camera track's capabilities where the browser reports them, otherwise a high ideal such as 4032 × 3024). The capture records the frame's actual width and height, and the review queue shows them. Report the actual output resolution on iPhone Safari in PROGRESS.md after the first real iPhone capture.
- Before upload, the browser scales the capture to at most 2048 px on the long edge and encodes it as JPEG. Served photos are 1600 px, and Vercel refuses request bodies over 4.5 MB.
- Location: a live accuracy readout, with the shutter disabled until the position is accurate enough and inside the boundary. A position older than about 10 seconds does not count.
- Compass: on iPhone, a tap grants motion and orientation access. Headings are corrected from magnetic to true north (about 11.5° east at UCLA) and stored as approximate. A capture without a heading is fine.
- After the shot: a preview with any automatic blur applied, the question "Are there people in this photo?" (yes / no), the license checkbox, then Submit. A tip on the camera screen: "Wait for people to pass. Shoot places, not people."
- A "Your photos" list on the page shows the player's own submissions: waiting, live, or not accepted (with the reason). Only the contributor sees it.

Acceptance rules (FIXED, checked again on the server)
- GPS accuracy up to **40 m** is accepted; anything worse is rejected. A capture with accuracy worse than **25 m** is flagged for a pin check in review.
- The position must be inside `campus.geojson`. No buffer ring for contributions.
- File checks: JPEG or WebP only, size and dimension limits, a minimum sharpness (the pipeline's measure). The server re-encodes with sharp, which strips all metadata, and runs the existing metadata check before storing anything.
- Rate limits, per account: **10 submissions per rolling 24 hours** and **at most 30 waiting** at once. Both are columns in `settings`, checked in the database under a lock.

License (FIXED)
- Contributors tick a checkbox licensing the photo under **CC BY-SA 4.0**, credited by their username. The time of acceptance is stored with the submission.
- The credit follows username changes. The credits page gets a "Players" group (usernames and license only, no links to photos).

Faces and people
- Automatic blur in the browser is a best effort, not a guarantee. Face detectors that run in the browser are tuned for close faces; campus photos have small, distant faces, which they miss most. Before relying on it, measure the detector on the existing pool and on crowd shots, and report its recall.
- In the browser, before upload: run the detector on the capture and blur what it finds, so detected faces never reach the server unblurred.
- A photo is flagged for people when the contributor answers yes or the detector finds anything. Flagged photos come first in the queue, and cannot be approved until the reviewer ticks "Faces checked".
- The review page has a manual blur tool (drag boxes); the server applies the boxes with sharp when the photo is approved.

Storage
- Submissions wait in a new private bucket, `contributions`, under random filenames. On approval the photo is processed exactly like the pipeline's (WebP, 1600 px, metadata stripped and checked), uploaded to `photos` under a new random filename, and added to `images` with source `community` and the contributor's account. The waiting file is then deleted. A rejected submission's file is deleted at once.

Admin access (FIXED)
- A role on the profile (`player` or `admin`). No page or API can change it; it is granted and revoked from the command line (`npm run admin -- grant <username>` / `revoke`).
- Never read the role from the session token's user metadata, which players can edit. Every admin page and API looks the role up in the database on each request, through one helper, and answers 404 to anyone who is not an admin. Revoking takes effect at once.
- Admin writes also pass the same-site request check. Admin pages and photos are never cached.
- An audit log records who approved, rejected, moved or blurred what, and when.

Review page (production, admin only)
- `/admin/contributions`: the queue, flagged photos first (people, then pin checks).
- For each submission: the photo with the blur tool; the existing pin-correction map (extracted from `/dev/photos` into a shared component, so the dev tool keeps working) with the accuracy circle and heading arrow; existing photos within 22 m facing the same way (the pipeline's near-duplicate rule); the contributor's username; the capture's actual resolution; Approve and Reject with a reason.
- A photo flagged for a pin check cannot be approved until the reviewer confirms or moves the pin.
- Approving publishes at once.

Own photos excluded (FIXED)
- A player never gets their own contributed photos in their games.
- In versus, a game never uses a photo contributed by any player in it, because the contributor would know the answer.

Deleted accounts
- Deleting an account deletes its contributed photos, live and waiting: waiting files are deleted, live photos are taken out of rotation and their files deleted from Storage, and the credit and the link to the account are removed. Past rounds that used them keep their scores.
- The delete confirmation says this, and the privacy page is updated to match.

Also in 7a
- Privacy and Terms pages: camera and location use, what a submission stores (position, accuracy, heading, time, the photo) and for how long, the CC BY-SA license.
- DESIGN.md: the Contribute page, the review page, the fifth nav item.

### Phase 7b: Wanted map, profile count, badge

Wanted map (on the Contribute page)
- A map of thin-coverage areas: a grid of cells about 75 m across over campus, built ahead of time (the grid holds no photo data). A cell is **wanted when it has fewer than 2 photos** (live and waiting both count).
- It shows gaps only, never existing photo locations (FIXED). The server sends only the outlines of wanted cells: no counts, no photo positions.
- Recomputed at most once a day, not on each approval, so comparing two versions of the map does not reveal where a new photo is.
- The player's own position is shown as a dot, computed in the browser only.

Profiles
- A "Photos contributed" stat tile counting the player's live photos.
- A "Photographer" badge once the first photo is live.
- A one-time "Your photo is live" notice, shown only to the contributor.

## Out of scope

Do not build these, but don't make them hard to add later:
- Daily challenge (same 5 images for everyone each day)
- Host settings in versus (round count, timer length, starting health)
- Email sign up (to be added later with custom SMTP)
- Friends and following
- Panoramas
- Difficulty levels or zone filters (for example "Hill only")
