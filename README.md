# BruinGuessr

A GeoGuessr-style game for UCLA's campus. You see a photo taken somewhere on campus, get 30 seconds to drop a pin on the map, and score more the closer you land. Play solo, or race two to five players in a versus room.

`SPEC.md` is the source of truth for what is being built. `PROGRESS.md` records what is done, key decisions and manual steps.

## Running it

```
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests
npm run test:live    # game rules against the real database (see "Tests" below)
npm run typecheck
npm run lint
npm run icons:build  # redraw the favicon and app icons (only when the mark changes)
```

`.env.local` (not committed) holds `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `MAPILLARY_TOKEN`.

## How the game works

Sign in is Google only (Supabase Auth), through one page, `/login` ("Log in" and "Sign up" both lead there). On the first sign in a player picks a username (`/welcome`). Anyone can press Solo and play five rounds; signed out, that is a guest game (see "Guests" below).

Every page except a game and a versus lobby shares one layout (`src/app/(site)/layout.tsx`): a side bar on screens 1024 px and wider, a bottom tab bar below that (Play, Leaderboard, Profile, Settings), and the account corner at top right.

- **The server runs the game.** Every rule, deadline and score is a Postgres function in `supabase/migrations/` that uses the database clock. The browser only calls `/api/games/...` routes; it never talks to the database, and every table refuses the public key.
- **Each round's photo has a per-round address**: `/api/games/<game>/rounds/<n>/photo`. It works only for the player in that game and only while that round is open. Once the round is scored it answers 404 for good. The photo's real filename in Storage never reaches the browser, and the Storage bucket is private.
- **The pin is saved every time it moves**, so when the clock hits zero the guess is already on the server. Guesses are accepted up to 1.5 seconds after the deadline to allow for network delay.
- **A round opens 2.5 seconds before its clock starts.** The photo loads behind the "Round N" card, so the player gets the full 30 seconds.
- **Reporting.** The reveal screen has "Report photo". A photo reported by three different accounts leaves rotation (it is hidden, never deleted). Each account can file 10 reports in 24 hours. Review them with `npm run photos:reports`.
- **Usernames** are 3 to 16 letters, numbers or underscores, unique ignoring case, and picked once. A basic profanity filter (the `obscenity` package, plus a short list of official-looking names) runs on the server. If one slips through, `npm run usernames -- reset <name>` clears it and the player picks again on their next visit.
- **Guests.** A signed-out visitor can play solo. The guest is a random token in an http-only cookie; the database keeps only its hash, beside a guest profile with no account. Guest games use exactly the same functions and anti-cheat path as every other game. Guests never get a username, so they never reach the leaderboard; they cannot report photos; versus needs an account. Signing in forgets the guest, and guest games are never moved onto an account. Guests not seen for 7 days are deleted with their games. Rate limits (columns in `settings`): 30 new guests an hour per network, and 20 guest games an hour per guest, 60 per network, 1,500 across all guests. The network is the visitor's IP address as Vercel reports it, stored only as an HMAC.
- **Profiles** (`/profile/<username>`, public): join date, rank, best game, games played, average per round, bullseyes, versus played and won, and recent games with each round's distance and points. Never the email, never a photo's location.
- **Settings** (`/settings`): change the username (same rules as the first pick, once every 30 days), see the Google email (shown to its owner only), log out, delete the account (type the username to confirm). Deleting removes the profile, solo games, reports and leaderboard entry; versus games stay for the other players.
- **Leaderboard** (`/leaderboard`, open to everyone): one row per account, its best completed game, ties to whoever got there first. It is computed from `game_players` joined to `games`, so a completed versus game counts the same way as a solo game. Signed-in players see their own rank above the table, and their row pinned under it when it is on another page.

### Versus

A versus game is the same game with more than one player in it: the same round clock, scoring, per-round photo address and leaderboard. What versus adds is the room.

- **Rooms.** "Play versus" → "Create a room" gives a five-letter code (no vowels, so no words, and none of 0, O, 1, I) and a link, `/versus/<CODE>`. The link is built from the address the site is being visited at, so it is right on localhost and on the deployed site. A room holds 2 to 5 players and locks when the host starts.
- **One clock, one photo.** The server opens each round once, for everyone. A versus round opens 5 seconds before its clock starts, so every screen has the photo in time.
- **A round ends when everyone still in the game has guessed, or on the clock.** While it is open, players see who has guessed, never where: other pins and the answer are sent only after the round is scored.
- **Between rounds** the next round opens by itself 20 seconds after the reveal, for everyone at once. The host can open it sooner.
- **Dropping off.** Each browser asks the server about its room every 2 to 2.5 seconds; a player not heard from for 10 seconds counts as away, and rounds stop waiting for them (a pin they had already placed is still scored). They come back through the room link, or "Rejoin" on the versus page, and get 0 only for rounds they missed entirely.
- **The host.** If the host leaves or drops off, the player who joined next becomes the host.
- **Rematch.** When a game ends the room is a lobby again. Players who press Rematch are in the next game; anyone who does not is left out when the host starts.
- **Realtime** carries only an empty "something changed" message per room, so screens update at once instead of at their next check. No game data travels over it, and the game works without it.
- **Leaderboard.** A finished versus game counts for each player like a solo game: their own five-round total, and only if it beats their best. A game everyone left does not count.

The numbers above (5 s, 20 s, 10 s, 2 to 5 players) are columns in the `settings` table.

The visual direction is written up in `DESIGN.md`.

### Link previews, icons, credits

- **Link previews.** Every page sets a title, a description and a share image for chats and social apps. The images are drawn in code (`src/lib/share-image.tsx`, fonts in `assets/fonts/`). A room link (`/versus/<CODE>`) previews as "Join my BruinGuessr game" with the room code. Someone who opens a room link signed out sees the invitation and a "Sign in with Google to join" button, then lands in the room.
- **The site's address** inside previews comes from Vercel's production domain. If the site moves to its own domain, set `NEXT_PUBLIC_SITE_URL` (for example `https://bruinguessr.com`) in Vercel.
- **In-app browsers.** Google refuses sign in from the browsers built into Instagram, TikTok, Facebook and similar apps. The sign-in button detects them and tells the player to open the page in Safari or Chrome.
- **Credits** (`/credits`): photographers and licenses, read from the database when the page is opened. Names and licenses only, no links to photos.
- **Icons.** `npm run icons:build` draws `src/app/icon.svg`, `favicon.ico`, `apple-icon.png` and `public/icons/*` from one description of the mark.

### Testing without Google

In development only, `http://localhost:3000/api/dev/login?as=1` signs the browser in as a test account ("Dev Player 1"; `as` can be 1 to 9). The first time, it goes to the username page like a real first sign in. It returns 404 on the deployed site. To try versus alone, sign in as a different test player in each of several private windows (or browsers) and join the same room.

The live site uses the same database, so test accounts are flagged (`profiles.is_test`) and never appear on the leaderboard. They end in `@bruinguessr.test`; delete them when you are done.

## Tests

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | Scoring, geometry, the photo pipeline, formatting, username rules and the profanity filter, room codes | nothing |
| `npm run test:live` | The game rules in the real database: scoring matches the reference, deadlines, the per-round photo address, reports, usernames, leaderboard ranking, versus (five players, guesses at the same moment, dropping off and rejoining, the host leaving, rematch, versus scores on the leaderboard), guests and their rate limits, profiles, username changes, account deletion, and that the public key can read and call nothing | `.env.local`; for the HTTP checks, `npm run dev` running in another terminal |
| `npm run photos:report` | Photo pool and live anti-cheat checks | `.env.local` |

The live tests create throwaway accounts and games and delete them when they finish.

## Campus boundary

`data/campus.geojson` is the approved boundary, built from OpenStreetMap by `npm run campus:build`. Its bounding-box diagonal is the scoring constant D (2,297.5 m), which the database holds in its `settings` table. The same build writes `src/lib/map/campus-outline.json`, the copy the app draws. Review page (development only): `/dev/boundary`.

## Photo pipeline

Photos come from three sources. Each script writes candidates into `.cache/pipeline/` (gitignored, because it ties photos to locations).

| Command | What it does |
|---|---|
| `npm run photos:mapillary` | Mapillary photos in and around campus: filter, thin near duplicates, download, strip |
| `npm run photos:wikimedia` | Geotagged Wikimedia Commons photos with CC0 / CC BY / CC BY-SA licenses |
| `npm run photos:import -- --credit "Name"` | Your own photos from `/photos-inbox` (reads GPS and heading from EXIF) |
| `npm run photos:sheets -- --source mapillary` | Numbered contact sheets for reviewing by eye |
| `npm run photos:decide -- --sheet NAME --reject 3,7-9` | Record decisions by contact-sheet number |
| `npm run photos:publish` | Upload approved photos to Supabase; update moved pins; withdraw rejected ones |
| `npm run photos:report` | Pool size, coverage across campus, and live anti-cheat checks |
| `npm run photos:rotate` | Give every stored photo a new random filename (run when nobody is playing) |
| `npm run photos:reports` | Photos that players reported; `-- keep <id>` or `-- remove <id>` to decide |

Review page (development only): `/dev/photos`. Approve or reject photos, drag a pin to correct a location, then publish.

### Adding your own photos

1. Put photos (JPEG, HEIC or PNG) in `/photos-inbox`. Keep Location Services on for the camera so they carry GPS.
2. `npm run photos:import -- --credit "Your Name"` (the name is remembered after the first time).
3. `npm run dev`, open http://localhost:3000/dev/photos. Your photos are listed as "waiting".
4. For each: check the gold pin is where you stood and drag it if not. Photos without GPS are placed by clicking the map. Press `A` to approve or `R` to reject.
5. Click "Publish to the game".

Nothing from the inbox is live until it has been approved there.

## Never commit

The repo is public and the game depends on photo locations staying secret. `.cache/`, `/photos-inbox/` and anything else that links a stored photo to a location or source ID must stay out of git. They are in `.gitignore`.

## Credits

Map data © OpenStreetMap contributors (ODbL). Map tiles by OpenFreeMap. Photos from Mapillary contributors (CC BY-SA 4.0), Wikimedia Commons contributors (CC0, CC BY, CC BY-SA) and original photography.
