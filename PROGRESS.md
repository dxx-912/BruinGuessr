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
- `npm test`: 119 tests. `npm run test:live`: 90 tests against the real database (counts as of Phase 6c).

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

**Phase 3 (accounts and leaderboard): done and approved by Daniel 2026-11-16.**

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

**Phase 4 (versus): done and approved by Daniel 2026-11-16.**

**Phase 5 (polish and deploy): built 2026-11-16. Daniel moved on to Iteration 2 on 2026-11-17.** Details in "Phase 5" below.

**Iteration 2 (SPEC.md "Iteration 2"), Phase 6a (site structure and accounts): done and approved by Daniel 2026-11-17.** Details in "Phase 6a" below. Daniel pushes it himself.

**Phase 6b (versus health battle): done and approved by Daniel 2026-11-17** (he moved on to 6c). Details in "Phase 6b" below. The migration is applied (shared database), so the live site already plays versus by the new rules and the leaderboard is already solo only.

**Google sign in on our own domain: done and live 2026-11-18.** Google's screen names bruinguessr.com instead of the Supabase project. Details in "Google sign in on our own domain" below.

**Photo contributions (SPEC.md, Phases 7a and 7b): specified 2026-11-18, not started.** 7a is next.

**Phase 6c (visual pass): done and approved by Daniel 2026-11-17**, with one follow-up he asked for (the fountain, below), committed, not pushed. Details in "Phase 6c" below. No database change.

The site is live at https://bruinguessr.com (`www.bruinguessr.com` and `ucla-geoguessr.vercel.app` redirect there) with Google sign in working on our own domain (Daniel, 2026-11-18). **The live site and `npm run dev` use the same Supabase database.** Migrations and test data land in production the moment they are applied or created.

- Versus is the solo engine with more than one row in `game_players`. The round clock, scoring, per-round photo address and leaderboard are the same functions. Migration `20261116000200_versus.sql` (applied) adds `rooms` and `room_members`, and teaches the existing functions three things: a round ends early when everyone still here has guessed; after a reveal the next round opens for everybody at once; the state lists the other players, and a scored round shows every pin. Solo behaves as before (its live tests pass unchanged).
- Screens: `/versus` (host or join), `/versus/<CODE>` (lobby; also the link players share and the way back in after a disconnect), and the existing `/game/<id>` for play, reveal and final standings. How it works is in README.md ("Versus"); the look is in DESIGN.md ("Versus").
- Room links are built in the browser from the address the site is being visited at, so they are correct on localhost and on the live site. Nothing in the browser bundle mentions localhost (checked against a production build).
- Realtime: Supabase Broadcast carries one empty "changed" message per room, sent by the server after a guess, a round opening, a join, a leave or a start. Browsers then ask our API for the state. Every versus screen also asks on a timer (2 s in the lobby, 2.5 s in a game), which is also how the server knows who is still there, so the game works if Realtime is unreachable. No new env vars: the browser uses the two `NEXT_PUBLIC_` values Vercel already has.
- Leaderboard: confirmed that it holds with no change to how it ranks. A live test plays a versus game through the real functions and checks each player's row (their own five-round total, mode "versus"), that a better solo game replaces it, that a worse rematch does not, and that a game everyone left never counts.
- Test accounts: the development login now flags its accounts (`profiles.is_test`), and the leaderboard leaves flagged accounts out, because test games would otherwise show on the live board. This is the one change to the leaderboard view.

### Checks run at the end of Phase 4

- `npm test` (101 passed), `npm run test:live` (60 passed, with `npm run dev` running; 27 are new: 26 versus checks against the real database and 1 that drives the room API over HTTP), type-check, lint, production build.
- Production build, run locally: dev routes 404; room API answers 401 signed out and 400 to another site's request; no secret key, Mapillary token, database function name, profanity list or "localhost" in the browser files; a full two-player game and a rematch played on it.
- Headless Chrome, five test accounts in five separate browser sessions (four desktop, one phone size), all passing with no console errors:
  - five players in one room; a sixth is told it is full; a seventh arriving after the start is told the game already started;
  - everyone guesses early: the reveal was on all five screens about 1 second after the last guess, well before the timer;
  - two players pressing Guess at the same moment: one result, the same totals on every screen, each round counted once;
  - a player closing the tab mid-round: the others were not made to wait out the clock, the dropped player's saved pin was scored, and the room link brought them back into the same game; a rejoin within the same round keeps the pin and the time left;
  - the host leaving mid-round: 0 for that round, the next player became host and could open the next round; the old host came back through "Rejoin" on the versus page as an ordinary player;
  - the next round opening by itself after 20 seconds; the clock running out with a pin on the map (counted) and with none (0);
  - final standings, rematch with three of the five, and the two left behind being told the rematch started without them.
- Also checked in the browser: a signed-out visitor following a room link is asked to sign in and comes back to the room; a solo game still plays through; the lobby when a guest or the host leaves; phone layouts for the lobby, round, reveal and standings.
- On the live site after the push (commit `ea58842`, 2026-11-16): the same five-player run passed against https://ucla-geoguessr.vercel.app, every check, including the room link reading `ucla-geoguessr.vercel.app/versus/<CODE>` and the reveal reaching all five screens about 1 second after the last guess. Signed out, the room API answers 401, the test login answers 404, and a room link asks for sign in and returns to the room.
- **Not tested by me: versus between real Google accounts.** The live run used the five test accounts, signed in on the dev server with their session carried over to the live address. Everything after sign in is the same code path, but two people with two Google accounts have not played each other yet. That is step 1 to 5 of "How to test" below.
- Afterwards all test accounts and their rooms and games were deleted. The leaderboard holds only real accounts. A room Daniel created on the live site during testing (`HLVKM`) was left alone.

### How to test Phase 4

1. Open https://ucla-geoguessr.vercel.app (or `npm run dev` and http://localhost:3000), sign in, click "Play versus", then "Create a room". You get a five-letter code and a link that starts with the site you are on.
2. On a second device or a private window, sign in with a different Google account and open the link (or type the code under "Join a game"). The lobby shows both of you. Start needs two players, and only the host has the button.
3. Play: both screens show the same photo and the same clock. When one of you guesses, the other sees a gold tick by that name, not the pin. When both have guessed the reveal comes at once, with both pins and the scoreboard.
4. Try the hard cases: close one tab mid-round and reopen the room link; have the host click the wordmark to leave mid-game (the other becomes host); let the clock run out; leave the reveal alone for 20 seconds (the next round opens by itself).
5. After round five: "Final standings", then "Rematch" on both, and the host starts again.
6. `/leaderboard`: a versus total shows only if it beats that account's best, marked "versus".
7. Without a second Google account, locally: http://localhost:3000/api/dev/login?as=1 in one private window and `?as=2` in another browser (test accounts never appear on the leaderboard). Delete them afterwards, or ask me to.

### Decisions made in Phase 4 (say so if you want any changed)

- Room codes are five letters with no vowels (no accidental words) and no digits (no keyboard switch on a phone), which also rules out 0/O and 1/I. About 3.2 million codes.
- Between rounds the next round opens by itself 20 seconds after the reveal; the host can open it sooner. The spec does not say who moves the game on, and this way a host who walks away cannot stall it.
- A versus round opens 5 seconds before its clock starts (solo: 2.5), so every screen has the photo before the clock runs.
- "Everyone has guessed" means everyone still here. A player not heard from for 10 seconds (or who left) is not waited for; a pin they had already placed is still scored.
- Host passes on: at once when the host leaves; after 10 seconds without a word from them during a game; after 2 minutes away from the lobby, and only if someone else is there (a host alone in the lobby can put the phone down as long as they like). The next host is whoever joined earliest.
- A player away from the lobby for 2 minutes loses their seat while others are there, and gets one back by returning (if the game has not started).
- Rematch: when a game ends the room is a lobby again with the same code. Players press Rematch to be in the next game; whoever has not by the time the host starts is left out. If the old host does not come back within 20 seconds of someone else waiting, that someone becomes the host. New players can join the lobby by code while seats are free.
- Leaving a versus game mid-way (the wordmark, top left) keeps the seat: the player can come back and gets 0 only for rounds missed. If everyone leaves, the game is abandoned and does not count.
- A room nobody has been in for six hours is closed the next time anyone creates a room.
- Seat colours are fixed by seat (blue, red, green, violet, orange); see DESIGN.md.
- All of the timings and the 2 to 5 limit are columns in `settings`.

### Notes for Phase 5

- Vercel already has the three env vars and Supabase has the production URL (sign in works on the live site). Nothing new is needed for versus.
- Not built, and worth considering in polish: a host "remove player" control in the lobby; a confirm before leaving a versus game; sound when another player locks in.
- The credits page, loading/empty/error states and a mobile pass over solo are still Phase 5.

## Phase 5 (polish and deploy)

What was added:

- **Credits page** (`/credits`): photographers by source with their licenses, read live from the database (15 photographers today). Names and licenses only; license links go to creativecommons.org, never to a photo. Also credits OpenStreetMap, OpenFreeMap, OpenMapTiles, MapLibre and the Barlow typeface. Linked from the footer of every plain page. The map itself carries the OpenFreeMap / OpenStreetMap credit (MapLibre's attribution control), as before.
- **Link previews**: title, description and a share image on every page. Room links read "Join my BruinGuessr game" with the room code on the image. Images are drawn in code with `next/og`; the two font files are in `assets/fonts/` (SIL Open Font License, license file alongside).
- **Room links for signed-out visitors** now show an invitation page with the room code and "Sign in with Google to join" instead of bouncing to the home page. This is also what lets a chat app read the room's preview.
- **Favicon and app icon**: one drawing (`npm run icons:build`), in `src/app/` and `public/icons/`, plus a web manifest.
- **404 page** ("Off the map"), an **error page** for a page that fails to load, and a last-resort error page.
- **Loading mark**: the campus outline with a hopping pin, on the game and room loading screens.
- **Error states**: the round's photo retries three times, then says "The photo could not load" with "Try again"; the map offers "Reload" if it has not loaded after 20 seconds.
- **Phone pass** (see "Decisions" and "Checks").

### Decisions made in Phase 5 (say so if you want any changed)

- On a phone the map gets a corner button that enlarges it to about three quarters of the screen. With a mouse the map still grows when pointed at.
- The mark at top left now asks "Leave this game?" while a game is in progress, in solo and versus.
- A phone held sideways shows "Turn your phone upright" over the game. Landscape play on phones is not supported.
- The manifest says `display: browser`: a home-screen icon opens the site in the normal browser. A full-screen home-screen app was left out because Google sign in inside one could not be tried on a real phone.
- The sign-in button warns inside Instagram, TikTok, Facebook, Snapchat, LinkedIn, WeChat and LINE's built-in browsers, where Google refuses sign in.
- The credits page does not link to photographers' profiles either: a profile lists that person's photos with their locations.
- No new env var is needed. `NEXT_PUBLIC_SITE_URL` is optional, for a custom domain later.

### Checks run at the end of Phase 5

- `npm test` (107 passed, 6 new: credits grouping, license links, in-app browser detection), `npm run test:live` (60 passed, with `npm run dev` running), type-check, lint, production build.
- Production build, run locally: every page answers 200 and an unknown address answers 404 with the "Off the map" page; dev routes still 404; favicon, Apple icon, manifest and the three share images are served; the font files are in the share-image functions' file lists; no secret and no "localhost" in the browser files. Fetched as a chat app would (Facebook's and Messages' fetchers) and as a plain browser, a room link gives "Join my BruinGuessr game", the room's description and the room's image in the page head, with status 200 while signed out.
- Phone pass, headless Chrome with touch emulation, a full five-round solo game at each of 375 × 548 (iPhone SE with Safari's bars), 360 × 612 (small Android), 390 × 664 (iPhone 12 to 16), 430 × 746 (Pro Max) and 320 × 454 (the first iPhone SE). A script measured each screen: the top bar and timer do not overlap, the Guess button is on screen, a tap places the pin, the map-size button works, on the reveal no pin is under a panel, the summary's buttons are on screen. All pass from 360 wide up. A two-player versus game (lobby, round, reveal) at 375 × 548 and 360 × 612 plays through with no sideways scrolling.
- The same solo and versus runs pass against the production build, and a five-round solo game at desktop size with a mouse (the map still grows when pointed at). No console errors anywhere.
- **Known limits.** On the first iPhone SE (320 × 454) the reveal leaves only a thin strip of map. On the smallest current phone, a versus reveal with pins far apart can leave a pin partly under a panel: the map cannot zoom out past the campus.
- **Not tested by me:** a real phone. Everything above is Chrome's phone emulation. Safari's own behaviour (the notch and home-bar spacing, the hold-to-save menu, pull to refresh) is written to the documented rules but unverified, and so is the Instagram in-app browser warning and how each chat app draws the preview.

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

## Phase 6a (site structure and accounts)

What was added:

- **Navigation.** Every page except a game and a versus lobby sits in one layout (`src/app/(site)/layout.tsx`, a route group, so no address changed): a side bar from 1024 px wide (Play, Leaderboard, Profile, Settings), a bottom tab bar below that, the account corner at top right on every page, and a one-line footer with Credits. 1024 px is wider than any phone held sideways, so a phone never gets the side bar.
- **Account corner.** Signed in: avatar and username, opening Profile, Settings, Log out. Signed out: "Log in" and "Sign up".
- **One sign-in page**, `/login`. "Sign up" goes to `/login?mode=signup`; the heading and text follow the mode, the button is "Continue with Google" either way. `?reason=versus|profile|settings` adds one line saying why. Sign-in failures land back here. The home page no longer has a Google button.
- **Play page** (`/`): "Know UCLA?", the subheading, Solo and Versus tiles with the spec's wording, Look / Pin / Score, and the top 5 from the leaderboard. Signed out, a line under the tiles says solo needs no account.
- **Guest play.** Signed out, Solo starts a guest game. Details and rate limits below.
- **Profile** (`/profile/<username>`, any capitals; `/profile` goes to your own): username, join date, leaderboard rank, best game, games played, average per round, bullseyes, versus played and won, and the last 10 games, each opening to its rounds (distance and points). Usernames on the leaderboard and Top players link to profiles.
- **Settings** (`/settings`): change username, the Google email (only here, only to the owner), log out, delete account.
- **Room invitation** (a room link opened signed out) now offers "Sign up to join" and "Log in" instead of a Google button.
- Database: migrations `20261117000100_guests_profiles.sql` and `20261117000200_profile_check_existing.sql` (a fix to a trigger in the first, found by the live tests), both applied with Daniel's approval.

### Guest play and its rate limits

- A guest is a random 32-byte token in an http-only, SameSite=Lax cookie (`bg_guest`, 7 days). The database stores only its SHA-256, next to a guest profile with no account behind it (`profiles.is_guest`, table `guests`). Nothing about it is readable by page scripts.
- Guest games are ordinary solo games: the same database functions, server clock, deadlines, per-round photo address and scoring. A guest can see only its own game, exactly as a player can. Checked by the live tests (database and HTTP).
- Never on the leaderboard: guests can never have a username (a check constraint), and the leaderboard view also leaves `is_guest` out.
- Never attached to an account: signing in (Google or the dev login) deletes the guest cookie, and nothing in the database links a guest to an account. Guest profiles and their games are deleted after 7 days without a visit.
- Guests cannot report photos (the server answers 403 `account_required`; the button is hidden). A guest costs nothing to make, so guest reports would let one person hide any photo.
- Versus, profile and settings need an account: the room API only accepts a real Supabase session, which a guest does not have.
- **Rate limits**, checked in the database under a lock so they cannot be raced, all columns in `settings`:
  - new guests: 150 an hour per network (`guest_new_per_ip_hour`),
  - guest games: 20 an hour per guest (`guest_games_per_hour`), 300 an hour per network (`guest_games_per_ip_hour`), 1,500 an hour for all guests together (`guest_games_global_hour`).
  - "Network" is the visitor's IP address from Vercel's `x-real-ip` / `x-forwarded-for` (Vercel sets these itself; a client cannot). Only an HMAC of it is stored, keyed with the service key, so the stored value cannot be turned back into an address. Rate-limit rows are kept one day.
  - When a limit is hit, the Solo tile says "That's a lot of guest games from here. Sign up to keep playing, or try again in a little while." Signed-in players are never limited.
  - The per-network limit is what stops someone clearing cookies to get a fresh guest. It is set high because many students can share one campus Wi-Fi address.
  - Daniel raised the two per-network limits on approval (2026-11-17), from 30 new guests and 60 games an hour. The new values are set in the live `settings` row; the migration's column defaults still say 30 and 60, so a database rebuilt from the migrations would need the row set again. The live tests read the limits from `settings`, so they hold whatever the values are.

### Decisions made in Phase 6a (say so if you want any changed)

- Profile stats count completed games only, as the leaderboard does. "Games played" counts solo and versus; "Versus played / won" is the versus part of it. A versus win is finishing with no one above you (a tie for first counts as a win for both). "Best game" follows the leaderboard (solo or versus) until Phase 6b makes the board solo only.
- Public profiles show an initial in a circle, not the Google photo: profiles are public and nobody chose to publish that photo. The Google photo still shows in your own account corner.
- Rounds on a profile show distance and points only, never the photo or where it was.
- Username changes: the first change after picking a name can be made at any time; after that, once every 30 days (`username_change_days`). Changing only the capitals counts as a change. The old name is free for others at once.
- Deleting an account removes its profile, solo games, reports and leaderboard entry. Versus games stay for the other players without that player in them (games no longer cascade-delete with their creator). The confirmation accepts the username in any capitals. A sign-in token from another device can outlive the account by up to an hour; every page treats it as signed out, and the database refuses to bring the profile back.
- A versus lobby and a game keep their own full-screen layouts (no side bar or tab bar): the lobby's Start button is pinned to the bottom on phones, where the tab bar would sit.
- The profile tab title is "Profile" rather than the username: reading the address in the page title made Next.js report "did not produce a static shell" in development.
- The home page's campus drawing (`CampusHero`) is no longer used; Phase 6c brings the new illustration.

### Checks run at the end of Phase 6a

- `npm test` (111 passed; new: guest network hashing, profile formatting), `npm run test:live` (80 passed, with `npm run dev` running; new: 16 database checks in `tests/live/accounts.live.ts` and 5 HTTP checks), type-check, lint, production build, `npm run photos:report` (all nine anti-cheat checks pass). No secret key and none of the new database function names in the browser files.
- Live tests cover: a guest's full game never reaching the leaderboard; guest anti-cheat (no photo before the round, none after, none for another guest, no answer in an open round); guest reports refused; each rate limit (per guest, per network, new guests per network; the all-guests limit is not tested because hitting it would block real guests for an hour); guest clean-up after 7 days; the guest cookie being http-only and forgotten on sign in; a made-up cookie being refused; profile stats against known games, lookup in any capitals, no account ID, email, game ID or location in the profile; username change rules and the 30 days; deleting an account (profile, solo games and board entry gone, a versus game kept for the other player) over HTTP with the typed confirmation, and the old session cookie being treated as signed out.
- Browser pass, headless Chrome (290 checks, no console errors) at 1280 × 800, 820 × 1100 (tablet), 844 × 390 (phone on its side), 375 × 548, 360 × 612, 430 × 746 and 320 × 454: side bar only at 1024+, tab bar otherwise, never both; no sideways scrolling; footer clear of the tab bar; tab targets 56 px tall; the account corner at top right, signed in and out; the account menu fitting on screen at 320; the current page marked in the nav; Log in / Sign up wording; signed-out Versus going to the login page with its reason; a full guest game on a phone and on desktop (no report button, the sign-up invitation on the summary); a signed-in game, profile with a game opened to its rounds, settings with the email; then on a phone a username change and an account deletion through the settings page, landing signed out on "Your account and everything in it has been deleted."
- Account changes were tested only on development test accounts (`dev-player-7/8/9`, created and deleted by the tests) and throwaway accounts. One slip: the first browser run signed in as the existing test account `dev-player-6` (P5_Tester6, left from Phase 5) and renamed it; its name and change date were put back. Guests made during testing were deleted afterwards. The Phase 5 test accounts `dev-player-1` to `6` are still there.
- **Not tested by me:** real Google sign up and log in through the new page (it posts to the same `/auth/sign-in` as before), and a real phone.
- **Not pushed to the live site in this check.** The database migrations are applied (shared database), so the live site already has the new tables; the old live code does not use them.

### How to test Phase 6a

1. `npm run dev`, open http://localhost:3000 signed out (a private window). Check the side bar on a wide window and the tab bar when you narrow it below 1024 px. Top right: Log in and Sign up; each opens `/login` with its own wording.
2. Press Solo signed out: a full game as a guest. The reveal has no Report button; the summary invites you to sign up. Check `/leaderboard`: the guest score is not there.
3. Press Versus signed out: the login page says versus needs an account.
4. Sign in (Continue with Google). The top right shows your avatar and name; its menu has Profile, Settings, Log out. Your guest game is not in your profile.
5. Profile: stats, recent games (click one to see its rounds). Open someone else's from the leaderboard: no email anywhere.
6. Settings: your email; change your username (try a rude or taken one first); the form then shows the date of your next allowed change.
7. Delete account: only with a dev test account. Open http://localhost:3000/api/dev/login?as=9 in a private window, pick a name, go to Settings → Delete account, type the name. You land on the home page, signed out.

## Phase 6b (versus health battle)

What was added:

- **Rules, all in the database** (migration `20261117000300_versus_health.sql`, applied with Daniel's approval). Everyone starts with `versus_start_health` (6,000). After each round, each player loses (best score − own score) × the round's multiplier, rounded half up; the best scorer loses nothing. Multiplier = `versus_multiplier_base` (1.0) + `versus_multiplier_step` (0.5) × max(0, round − `versus_multiplier_from_round` (5) + 1): 1, 1, 1, 1, 1.5, 2, 2.5, … A round's multiplier is fixed when it opens. A player at 0 is out. The game ends when one player is left.
- **The 10 second countdown is set by the server.** `lock_guess` moves the round's `deadline_at` to `greatest(now, clock start) + versus_first_lock_seconds` with `least()`, so only the first guess can move it and two guesses at the same moment cut it once. The round row records `cut_at`. The browser just shows the deadline it is sent; the per-round photo address and the deadline check use the same `deadline_at`.
- **No round limit.** Versus games have `round_count` null. Each round's photo is picked when the round opens (`_pick_images` now never returns a photo already used in that game). If the pool runs out, `_versus_finish` ends the game on health.
- **Places.** `game_players` gets `health`, `eliminated_round`, `final_place`; `guesses` gets `damage` and `health_after` (not clamped, so players knocked out in the same round can be ranked by how far below 0 they went).
- **Knocked-out players watch.** They get the photo, clock and reveals; `place_pin` and `lock_guess` answer `eliminated` (409); rounds never wait for them.
- **Leaderboard: solo only.** The view filters `mode = 'solo'`. On the live board, 5 of the 6 rows were versus scores before the migration; afterwards it had 2 rows, both solo (DanielXing now shows his best solo game, 17,891, in place of a versus 18,195). A live test checks the view has no versus rows at all. The profile's "Best game" is solo only too.
- **Screens.** Top right in versus: round, multiplier, your health (one narrow column on a phone). Player strip: health bars, "Out". Round card: "Damage ×1.5". The first guess: the timer drops to 0:10 (bar keeps the 30 s scale), a double beep, a red "NAME locked in. Hurry!" pill. Reveal: distance, points, damage, health bar per player, "Out!", stamps for Knocked out / Winner. Final standings: place as the headline, winner with health left, then knock-out order, your rounds with damage. Lobby: a short rules line. Versus page, room invitation and share images reworded (no more "five photos"). Leaderboard copy says solo. DESIGN.md has the look; README.md the rules.

### Decisions made in Phase 6b (say so if you want any changed)

- **"Everyone reaches 0 in the same round" cannot happen under the damage rule**: the round's best scorer always loses nothing, so at least one player is still standing after every round. The tiebreak is built anyway (most health left after the damage wins; level shares first place) and tested by forcing everyone to 0 health first. Two or more players knocked out in the same round does happen and is ranked the same way.
- A guess during the "Round N" card counts the 10 seconds from when the clock starts, so nobody's round can be shortened below 10 seconds of play.
- A versus round in which nobody has guessed yet runs on its clock even if every player still in has dropped off. Without that, a room with only knocked-out players watching would race through rounds.
- A player who is away still takes damage for the rounds they miss (they score 0), which is what knocks out someone who has left for good.
- A knocked-out host stays host (they can still open the next round). Host handover is unchanged.
- Old (Phase 4) finished versus games keep the places they had by total; the 6 versus games that were stuck at round 1 were switched to the health rules. A versus win on a profile is finishing 1st.
- The colours for health are interim: `health` green (`#3ED68A`), gold below half, alarm red below a fifth; damage in alarm red. (Phase 6c made the middle band orange, `hurt`, and knocked-out players slate, `out`.)

### Checks run at the end of Phase 6b

- Before asking to push, the migration was dry-run on an in-memory Postgres (PGlite, in the scratchpad, with stand-ins for Supabase's `auth` and `storage` schemas): all migrations applied, and scripted games covered damage, the cut, knock-outs, spectators, 25 rounds, the all-out tiebreak and running out of photos.
- `npm test` (117 passed; new: multiplier labels, health bar tones, finishing order), `npm run test:live` (90 passed, with `npm run dev` running; 10 new health-battle checks, the Phase 4 versus checks reworked for games that go past round 5, leaderboard checks flipped to solo only), type-check, lint, production build, `npm run photos:report` (all nine anti-cheat checks pass). No secret and no database function name in the browser files.
- The edge cases asked for, each a live test against the real database: two players locking in at the same moment as the first guess (one cut, the same deadline on every screen, the third player can still pin until it runs out); a first guess with under 10 seconds left (deadline unchanged); a guess during the round card (10 s from the clock's start); a player disconnecting during the countdown, with a pin (scored, not waited for) and without (0, full damage), and one coming back mid-countdown (keeps the cut clock); two players knocked out in the same round (ranked by health left, then they can see the photo but not pin or guess, and the next round does not wait for them); everyone at 0 in the same round (forced, see above); a 23-round game (multipliers 1 → 10.5, no photo repeated, a 150 m miss in round 23 costs more than 6,000); and a game that used every photo in the pool (160 rounds, ends on health).
- Browser pass, headless Chrome against the production build, three players signed in as `dev-player-7/8/9` (two desktop, one at 375 × 548 with touch): lobby rules line; "Damage ×1" on the round card; the first guess dropping the other two clocks from 0:24 to 0:10 with the hurry pill on desktop and phone; "Locked in. Waiting for 2 players"; the reveal with damage, health and "Out!"; the Knocked out stamp; the knocked-out phone player watching round 2 ("You're out. Watching this round", tracker "Out"); the Winner stamp; final standings on all three (1st / Knocked out in round 2 / Knocked out in round 1, in knock-out order, no leaderboard line); no sideways scrolling on the phone; no console errors. Fixed along the way: the tracker ran under the timer on a phone, and the phone hurry pill covered the map's zoom buttons.
- Test data: the live tests' accounts, rooms and versus games were deleted by the tests. The browser pass's 5 versus games were deleted by ID, and `dev-player-7/8/9` were deleted by the HTTP test's own clean-up.
- **Note on the running dev server:** the `next dev` on port 3000 (started before this session) kept serving its old stylesheet without the new `health` colour, so health bars look empty there. Stopping it, `rm -rf .next/dev`, and `npm run dev` again fixes it. The production build is correct.
- **Not tested by me:** a real phone, and versus between real Google accounts.

### How to test Phase 6b

1. Restart the dev server first (see the note above): stop it, `rm -rf .next/dev`, `npm run dev`.
2. Open http://localhost:3000/api/dev/login?as=7 in one browser, `?as=8` in a private window, and `?as=9` in another browser or profile. Pick names. Host a room with 7, join with 8 and 9, start.
3. The round card says "Damage ×1"; top right shows the round, ×1 and 6,000 health. Guess with one player: the other two clocks drop to 0:10 with a red "… locked in. Hurry!" pill and a beep.
4. The reveal shows each player's distance, points, damage and health. Play on: from round 5 the multiplier is ×1.5 and shows red. To get a knock-out quickly, let one player not guess for a few rounds.
5. A knocked-out player sees "Knocked out", then watches: the photo and clock run, the map takes no pin, the button says "You're out. Watching this round".
6. The last one standing gets "Winner!"; "Final standings" lists the winner, then everyone in the order they went out.
7. `/leaderboard`: no versus scores, and the text says solo. A versus game shows on the profile under recent games with its place and number of rounds.
8. To tune the game: change `versus_start_health`, `versus_multiplier_base`, `versus_multiplier_from_round`, `versus_multiplier_step` or `versus_first_lock_seconds` in the `settings` row (Supabase dashboard → Table Editor → settings). Changes apply from the next round or game.
9. Delete the test accounts afterwards (or ask me to).

## Phase 6c (visual pass)

What was added (the look is written up in DESIGN.md, which was updated first):

- **Palette.** UCLA Blue and Gold still lead. New tokens in `globals.css`: `brick` / `brick-deep` / `brick-light` (Royce Hall's terracotta), `green` / `green-deep` / `leaf` (the lawns), `sand`, `silver`, and game-state colours `hurt` (orange, health between a half and a fifth, so gold keeps meaning "the answer") and `out` (slate, knocked-out players). DESIGN.md lists every text pair with its contrast ratio.
- **Round score colours** (`src/lib/game/tone.ts`): a round's points are coloured by how good they were wherever a round appears: gold bullseye, green 4,000+, sky 1,500+, light brick below, slate for no guess. Round pips, the reveal (number, bar, a distance pill), the summary and profile rounds. Totals stay gold.
- **The campus scene** (`public/art/campus-scene.svg`, generated by `scripts/build-campus-scene.py`, `npm run art:build`). Royce Hall's east facade at dusk from the quad walkway, flat geometric style, traced from a straight-on photo Daniel supplied so the proportions follow the building, with the visible differences between the towers (three belfry openings and bays on the left tower, two on the right; different slit windows; the medallion; diamond versus triangle panels). The Dickson fountain front left (a low, wide basin with a short spray), the striped walkway, lamp posts with blue and gold banners, one gold pin in the lawn. Daniel reviewed it on its own in three rounds before the pages were restyled.
- **Play page.** Headline in the scene's night sky, the scene full width, the Solo and Versus tiles standing on its lawn (with icons), Look / Pin / Score bubbles with blue, brick and green icon chips, Top players with gold / silver / bronze rank discs.
- **Leaderboard, Profile, Settings** restyled after WatGuessr's pages: the scene as a dimmed backdrop fixed to the bottom of the window (`CampusBackdrop`), content in panels with rounded rows. Leaderboard: centred title, rank discs, gold scores, Previous / Page / Next centred. Profile: a top card (name, rank pill, join date, best game, games played) beside a ring of average points per round, three more stat tiles, recent games as a card. Settings: one column, a profile summary (with "Member since"), Username, Account, and a red Danger zone.
- **The backdrop also on** Versus, Login, Welcome, Credits, the 404 and error pages, a room invitation and the versus lobby. Never behind a round, a reveal or a summary.
- **Game screens.** The "Round N" card has a slanted band in the scene's dusk colours. Versus: seat colours moved off red, green and orange (now blue, raspberry, teal, violet, brick) so a seat never reads as damage or health; health bars green / orange / red; damage red; knocked-out players slate. Lobby seats carry their seat colour as a left edge; the rules line is a panel.

### Follow-up after approval (2026-11-17)

- Daniel: the fountain read as a tall ice shard. It is now a low, wide stone basin (rim, front wall, water) with a short jet that splashes into a crown and two veils of spray falling back into the basin. The spray is under half the height of the small tree beside it. Only `scripts/build-campus-scene.py` and the generated `public/art/campus-scene.svg` changed (plus the wording in DESIGN.md). The rest of the scene is unchanged.
- Checks: rebuilt with `npm run art:build`, then looked at the scene at full width, at a phone crop (390 px, as the Play page crops it) and close up. No code changed, so the test suites were not rerun.

### Decisions made in Phase 6c (say so if you want any changed)

- The scene is drawn from the straight-on view (the quad walkway), not across Dickson Plaza at an angle: it is the view people recognise, and it keeps Royce symmetrical enough to crop for any screen while still showing the towers' differences. From there the fountain is front left, and Powell is behind the viewer, so it is not in the picture.
- Gold chips carry a dark icon: a white icon on dark gold measured under 3:1.
- The profile's "Average per round" is the ring, not a separate tile, so the stats are not shown twice.
- The leaderboard keeps its columns (rank, player, date reached, best). WatGuessr's search and sort are not added: nothing in the spec asks for them.
- The old Phase 1–5 `CampusHero` (campus outline drawing) is still in the repo, unused, as noted in 6a.

### Checks run at the end of Phase 6c

- `npm test` (119 passed; new: round score tones), type-check, lint, production build, `npm run test:live` (90 passed, with `npm run dev` running), `npm run photos:report` (all nine anti-cheat checks pass). No secret key in the browser files.
- **Contrast**, measured in the browser, not just from the palette: every visible piece of text on every site page, signed in and out, at seven sizes, against the background it actually sits on. 0 pairs under 4.5:1 (3:1 for large text). Deliberately dimmed text (disabled buttons, away players) is left out of the count.
- **Browser pass, headless Chrome against the production build:** 98 page views (Play, Leaderboard, Profile, Settings, Versus, Credits, Login, Sign up, 404, room invitation) at 1280 × 800, 820 × 1100, 844 × 390, 430 × 746, 375 × 548, 360 × 612 and 320 × 454: no sideways scrolling, side bar only from 1024 px and tab bar below it, no console errors. A full guest solo game on desktop and on a phone (375 × 548, touch). A three-player versus game (`dev-player-7/8/9`, one on a phone) played to a winner: lobby, round card, hurry pill, reveal with damage, a knock-out, watching, final standings.
- Test data: the browser passes' accounts (`dev-player-7/8/9`), their 3 versus games and rooms, and 9 local guests were deleted afterwards; the live tests made and removed their own.
- **Known, not new:** in development only, opening a room link logs a Next.js "did not produce a static shell" error for `/versus/[code]`. It happens with the Phase 6b code too, and not in the production build.
- **Not tested by me:** a real phone, real Google accounts.

### How to test Phase 6c

1. `npm run dev` (if a dev server is already running, restart it and `rm -rf .next/dev` first: `globals.css` changed). Open http://localhost:3000.
2. Play page: the Royce scene under the headline, the tiles on the lawn. Narrow the window to a phone width: Royce stays centred.
3. Leaderboard, Profile (yours and someone else's), Settings: the dimmed scene behind, panels over it.
4. Play a solo game: coloured round pips, the reveal's points, bar and distance pill change colour with the score; the summary lists rounds in colour.
5. Versus with test accounts (http://localhost:3000/api/dev/login?as=7, `?as=8` in a private window): the new seat colours, green / orange / red health, slate for players who are out.
6. To change the illustration: edit `scripts/build-campus-scene.py`, run `npm run art:build`.

## Play page hero rework (2026-11-17, done: Daniel picked "B2")

Daniel's brief: the Play hero felt flat (no depth or light; art colliding with the interface; empty tile slabs; one display style everywhere and a loud nav; too many saturated colours). I built four variants on a development-only `/dev/hero` page (A blue hour panorama, B golden hour through an arch, B2 B without the arch, C floodlit night). Daniel picked B2 with the headline and both tiles on the left and Royce on the right. The variants and `/dev/hero` are deleted; the history is in git (`cf783f9`, `512ea4c`, `8018799`).

- **Play page now** (DESIGN.md "Play page"): golden-hour Royce on the right as part of the background, dissolving into the night on its left; headline, line and enamel Solo / Versus tiles in a left column from 768 px; on a phone, text, then the scene (sized to about a third of the screen height so Solo is on the first screen), then the tiles. Tiles are compact rows below 1280 px, tall side-by-side tiles from there, each with a call to action ("Play now", "Host or join", new copy). The Look / Pin / Score chips became numbered steps. The gold pin is gone from the hero art.
- **Art:** `npm run art:build` writes `public/art/campus-scene.svg` (flat, the other pages' backdrop, byte-for-byte unchanged) and `public/art/campus-hero.svg` (the same drawing relit, `gold` grade). The script keeps the `blue` and `night` grades.
- **Site-wide type and nav** (also from this brief): an upright `.heading` style for section and card titles; buttons upright and tracked; slanted display type only for headlines, page titles, scores and stamps. The nav is quiet Barlow, sentence case, with a lit current page (gold icon, gold edge bar or tab line). "Log in" is plain text. DESIGN.md "Type" and "Site layout".
- **Code:** `src/app/(site)/page.tsx` (layout), `src/components/home/PlayButton.tsx` (the tiles and the solo start logic), `src/components/art/CampusScene.tsx` (`CampusHero` for the relit scene, `CampusScene` / `CampusBackdrop` for the flat one). CSS Modules do not work in this project (the Turbopack rule in `next.config.ts` sends every `*.css` file through Tailwind as global CSS), so the scene's masks are inline styles.
- **Checks:** `npm test` (119 passed), type-check, lint, production build. Headless Chrome at 375 × 548, 390 × 780, 768 × 1000, 1024 × 768, 1280 × 860 and 1680 × 950: no sideways scrolling, no console errors, both towers in view, nothing in the art under a tile or the text. Contrast measured in the browser for every piece of hero and step text against the pixels behind it (worst pixel, at all six sizes): all pass; the Versus tile's blue was darkened a step for this (its sentence went from 4.0 to 5.6:1). Live tests were not rerun (no server or database code changed).
- **Not tested by me:** a real phone.

## Play page and side bar polish (2026-11-17)

Daniel's brief: the Play page was better but still bland. Done (DESIGN.md "Play page", "Site layout" and "Shape and depth" updated to match):

- **Hero** fills the screen under the header from 768 px (and stops above the tab bar below 1024 px), content centred top to bottom, so there is no empty band before the next section. Bigger headline (up to 7rem, always one line) and tiles (64 px icon discs, 3rem titles, tall tiles at least 18rem from 1280 px).
- **Sky across the whole hero:** a deep blue dusk under the text with a soft blue glow (and a breath of gold) behind the headline; behind Royce, the drawing's own sky stop for stop, so the art melts in with no seam. The warm part stays off the text column.
- **Royce, cropped on purpose:** sized so a fixed window of the drawing fits between the text and the page edge: both towers whole, the right wing cut by the page edge about a tower's width past the right tower. Measured at 768 to 2560 px: the left tower is always at least 90 px clear of the tiles and the right tower always ends before the edge. Its foot hangs below the hero under the step cards.
- **How it plays:** three frosted cards (translucent navy, background blur) with the blue / brick / green icon chips back in place of the 1 / 2 / 3 numerals, over the foot of the scene. DESIGN.md now allows this one glass effect.
- **Top players:** centred, a podium for the top three (second, first, third; gold tallest with a crown, silver, bronze), then ranks 4 to 10 as rows; empty places read "Your name here". The player's own row is marked "You". Full leaderboard is an outlined gold button under it.
- **Footer** centred. The Development links are already development only (`process.env.NODE_ENV === "development"`, replaced at build time): confirmed against `npm run build` + `next start` (no mention on /, /leaderboard, /credits, /login, /settings; the footer's server chunk has none; /dev/boundary 404s).
- **Side bar:** a quiet gradient instead of flat navy, hover states on the items (faint fill and hairline, paper text, a nudge of the icon, a faint edge bar), and a card at its foot (`src/components/shell/SidebarStanding.tsx`): best solo score and rank ("12th of 214", linking to that page of the board), "No score yet" when signed in without a finished game, or "Get on the board" with Sign up for guests. It costs one leaderboard call per page view for signed-in players (the same database function the Play page already uses).
- **Follow-up (Daniel's screenshot, a 1710 × 1033 window):** the layout fell apart on tall windows. The text was centred in the full-height hero but Royce was pinned to the hero's bottom edge, so the building sank to the fold while the text floated mid-screen, with an empty band above the headline. Royce is now anchored to the tiles (the foot of its steps level with their bottom), its bottom edge fades out too, and the tiles grow a little with the window's height. The frosted cards no longer sit over the walkway. Rechecked at 1710 × 1033, 1280 × 800, 1024 × 768, 768 × 1000 and 390 × 844 (contrast all pass), type-check and lint; the production build was not rerun (the disk was down to about 400 MB free).
- **Checks:** type-check, lint on the changed files, production build. Headless Chrome against the dev server and the production build at 375 × 548, 390 × 844, 768 × 1000, 1024 × 768, 1280 × 800, 1440 × 900, 1920 × 1080: no sideways scroll, no console errors (production). Text contrast measured in the browser against the real pixels behind every piece of text on the Play page and side bar at six sizes: all pass (the closest is 1.2 times the requirement); this caught the scene's afterglow reaching under the guest note, fixed. The signed-in side bar card was checked with its data stubbed for one screenshot (no test accounts or games were made). `npm test` and the live tests were not run: no game, server or database code changed.
- **Not tested by me:** a real phone; the signed-in card against a real account's data.

## Play page: less empty space, real photos, useful tiles (2026-11-17 evening)

Daniel's brief: the Play page still felt bland, with lots of empty space. Done (DESIGN.md "Play page" and "Site layout" updated to match):

- **Hero top-aligned** with fixed padding under the header (3rem, 3.5rem from 1024 px) instead of centred in a full-screen hero, so "How it plays" is on the first screen at 1440 × 900, 1920 × 1080 and 1440 × 1300.
- **Subheading** back to the spec's line: "Real Bruins know campus inside out. Five rounds to prove you actually go to class."
- **"Where is this?" photos** (`src/components/home/Showcase.tsx`, `src/lib/server/showcase.ts`, `/api/showcase/[slot]`). Five photos from the pool (in rotation, never reported, landscape), a new set every six hours. From 768 px a tilted stack of prints above Royce's right tower (over the right wing from 1536 px), placed in the drawing's units so it never covers a tower; the front print slides to the back every 4.2 s. On a phone, a slowly drifting strip under the tiles. Anti-cheat: the address names only a slot and a batch (`/api/showcase/2?b=83100`), only the current or previous batch is served (no paging back through old sets), and the bytes are a re-cut 560 × 400 WebP re-encoded by sharp (no metadata), so they never match a round's photo file. No location, credit or source is sent.
- **Solo tile** shows "Your best" with the best solo score and rank ("12th"), "Play as a guest" when signed out, "Play now" when signed in without a finished game. **Versus tile** has a "Have a code?" field that goes straight to the room (the tile's title link is stretched over the tile so the form can sit inside it).
- **Side bar:** a "Join with a code" box in its empty middle (`src/components/JoinCodeForm.tsx`, shared with the Versus tile). Same rules as the versus page's field (no vowels, five letters); the room page handles signed-out visitors and dead codes.
- **Gold pins** floating in the sky around Royce, bobbing gently (`animate-float`); still with "reduce motion" on.
- **Play item lit again.** On the live site a fresh load of `/` lit no nav item. Cause: with a Proxy in front, `usePathname()` during the prerender differs from the browser's, and React keeps the server's attributes on hydration (Next.js docs, `usePathname`, "Avoid hydration mismatch with rewrites"). `NavLinks` now hydrates with nothing marked and marks the browser's path right after. Confirmed on a production build (`/` → Play, `/leaderboard` → Leaderboard).
- **Small things:** `sharp` moved from devDependencies to dependencies (the showcase route uses it at runtime). The side bar card, the Solo tile and Top players share one cached read of the player's standing per request (`myStanding()` in `src/lib/server/profile.ts`).
- **Checks:** `npm test` (130 passed; new: showcase picks), type-check, lint, production build. Headless Chrome against the production build at 1440 × 900, 1920 × 1080, 1440 × 1300, 1024 × 768, 768 × 1000, 390 × 844 and 375 × 548: no sideways scroll, no console errors. Contrast measured against the real pixels at all seven sizes: all pass (closest 1.12 times the requirement); the checker flags the tilted "Where is this?" tag only because the tilted text's box spills past the pill, and it passes with the tilt removed. Interactions: typing a code in the tile does not leave the page and Enter joins; the side bar box joins; a vowel shows the hint and disables Join; clicking the tile elsewhere opens Versus; the stack cycles; with reduced motion the stack and pins stay still and the strip is a row to swipe. The signed-in Solo tile was checked with its standing stubbed for one screenshot (no accounts or games were made). Live tests were not run: no game or database code changed.
- **Not tested by me:** a real phone; the signed-in tile against a real account.

## Google sign in on our own domain (2026-11-18, done and live)

Daniel's brief: Google's account screen said "continue to waezvtzepdxiisefivmu.supabase.co"; it should name the site. Google names the host the sign in returns to, and with Supabase's own Google flow that is the Supabase project.

- **Flow** (`src/lib/google-oauth.ts`, `src/lib/server/google.ts`, `src/app/auth/sign-in/route.ts`, `src/app/auth/google/callback/route.ts`): `POST /auth/sign-in` sends the browser straight to Google with `redirect_uri` = this site's `/auth/google/callback`, plus a random state, the SHA-256 of a random nonce and a PKCE challenge. The raw values sit in a 10-minute http-only cookie (`bg_google_flow`, sent only to the callback, cleared on first use). The callback checks the state, trades the code for an ID token with the client secret and the PKCE verifier, and signs in to Supabase with `signInWithIdToken` and the raw nonce (Supabase checks the token's signature, audience and nonce). Then the same landing as before (`/welcome` for a first sign in). `/auth/callback` (Supabase's code exchange) is gone.
- Pressing Cancel on Google's screen goes back to `/login` without an error.
- **New env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (server only), the same Web client Supabase's Google provider is set up with.
- **The domain shown is whatever host the visitor is on.** For it to read "bruinguessr.com", the apex must be the primary domain in Vercel, with `www` and `ucla-geoguessr.vercel.app` redirecting to it (on 2026-11-18 the apex redirected to `www`, and the vercel.app address served the site itself). Vercel preview deployments cannot sign in (their addresses are not registered with Google), as before.
- **Checks:** `npm test` (130 passed; 7 are the sign-in flow), type-check, lint. Over HTTP on a dev server with placeholder Google keys: the sign-in POST answers 303 to Google with every parameter and sets the cookie (HttpOnly, SameSite=Lax, path limited to the callback, 10 minutes); the callback refuses a missing cookie and a wrong state, sends Cancel back to `/login` quietly, clears the cookie after use, and logs Google's refusal of a made-up code; an off-site `next` (`//evil.example`) becomes `/`.
- **Real Google sign in:** confirmed working by Daniel on localhost, then pushed (`af489fc`) and live on 2026-11-18. On the live site, `POST /auth/sign-in` on bruinguessr.com sends the browser to Google with `redirect_uri=https://bruinguessr.com/auth/google/callback` (so the Google keys are set in Vercel), and `www` and the vercel.app address redirect to bruinguessr.com.

Setup (by hand, done by Daniel 2026-11-18):

1. **Client ID and secret.** Google Cloud Console → APIs & Services → Credentials → the "Web application" OAuth client whose ID matches Supabase → Authentication → Sign In / Providers → Google. Copy the Client ID. Google shows a secret only when it is made, so if it can't be copied, "Add secret" makes a new one (the old one keeps working, so Supabase is unaffected). Put both in `.env.local` as `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=`.
2. **Redirect addresses.** Same client page → Authorized redirect URIs → add `http://localhost:3000/auth/google/callback`, `https://bruinguessr.com/auth/google/callback`, `https://www.bruinguessr.com/auth/google/callback`, `https://ucla-geoguessr.vercel.app/auth/google/callback`. Keep the Supabase one. Save.
3. **Supabase.** Authentication → Sign In / Providers → Google: the same Client ID is listed, and "Skip nonce checks" is off.
4. **Vercel domain.** Project → Settings → Domains: on `bruinguessr.com`, remove the redirect so it serves the site; set `www.bruinguessr.com` to redirect (308) to `bruinguessr.com`; on `ucla-geoguessr.vercel.app`, set a redirect to `bruinguessr.com`.
5. **Vercel env vars.** Project → Settings → Environment Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (secret marked Sensitive), and `NEXT_PUBLIC_SITE_URL=https://bruinguessr.com`, all for Production. They apply from the next deploy.
6. **Supabase URLs.** Authentication → URL Configuration: Site URL `https://bruinguessr.com`; keep `http://localhost:3000/**` and add `https://bruinguessr.com/**` to the redirect URLs.

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
- **Next.js keeps a page's state after you navigate away** (Cache Components uses React `<Activity>`; up to 3 routes). Coming back to a route with `router.push` or the Back button shows it with its old state, and its effects run again. Two bugs came from this in Phase 4: the lobby bounced players to a finished game, and "Starting…" buttons stayed disabled. Rules that fixed them: navigate on a fresh server answer, never from remembered state in an effect; reset transient state in a `useLayoutEffect` cleanup. Guide: `node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md`.
- Browser testing in development: the dev server reloads a page several times the first time it compiles it, so visit each route once before a scripted run, and wait for `domcontentloaded` rather than network idle.
- Browser testing with several players: one browser context per player, each signed in through `/api/dev/login?as=N`. To test the production build (`npm run build`, `PORT=3100 npm run start`) or the live site, sign in on the dev server and reuse the `sb-…` session cookie on the other address; it is the same Supabase project, so the session is valid there.
- Looking at pages: the Claude in Chrome extension did not respond in this session. What worked was driving the installed Chrome headlessly with `puppeteer-core` (flags `--enable-unsafe-swiftshader --use-angle=swiftshader`), waiting for `.maplibregl-canvas`, then screenshotting. That is how both review pages were verified, including dragging a pin.
- Overpass API mirrors were flaky; the boundary build uses the main OSM API by object ID instead, with downloads cached in `.cache/osm/`.
- Mapillary: `on_foot` and `quality_score` are real API fields. Thumbnail URLs expire, so the script asks for a fresh one right before each download.
- Phase 5 tooling: after many files were added or `globals.css` was edited several times, `next dev` got stuck twice: once reloading every page in a loop, once serving an old stylesheet. Stopping it, deleting `.next/dev` and starting again fixed both. Phone testing used headless Chrome with touch emulation at the size a page really gets with the browser's bars showing (for example 375 × 548 for an iPhone SE, not 375 × 667).
- Supabase: `supabase db push --yes` works without the database password (login role). Docker is not installed, so there is no local Supabase; migrations go straight to the real project. To dry-run one first, `@electric-sql/pglite` (installed in the scratchpad, never in the repo) can apply every migration in memory with stub `auth.users`, `storage.buckets` and the three Supabase roles, then call the game functions; that is how the Phase 6b migration was checked before the push.
- Browser testing: display text is uppercase by CSS, and `innerText` returns it uppercased, so compare text case-insensitively. Puppeteer's `page.click` on a phone-size page can land on the bottom tab bar; click through the DOM instead. The browser pass gives `dev-player-7/8/9` usernames, and the HTTP live test expects `dev-player-7` to have none, so delete 7–9 (and their versus games, which outlive the accounts) after a browser pass.

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
5. ~~Google sign in on our own domain: add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env.local` and Vercel, register the `/auth/google/callback` addresses in Google Cloud, and make `bruinguessr.com` the primary domain in Vercel.~~ Done 2026-11-18; sign in is live on bruinguessr.com.
