# BruinGuessr

A GeoGuessr-style game for UCLA's campus. You see a photo taken somewhere on campus, get 30 seconds to drop a pin on the map, and score more the closer you land.

`SPEC.md` is the source of truth for what is being built. `PROGRESS.md` records what is done, key decisions and manual steps.

## Running it

```
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests
npm run test:live    # game rules against the real database (see "Tests" below)
npm run typecheck
npm run lint
```

`.env.local` (not committed) holds `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `MAPILLARY_TOKEN`.

## How the game works

Sign in is Google only (Supabase Auth). A signed-in player presses "Play solo" and plays five rounds.

- **The server runs the game.** Every rule, deadline and score is a Postgres function in `supabase/migrations/` that uses the database clock. The browser only calls `/api/games/...` routes; it never talks to the database, and every table refuses the public key.
- **Each round's photo has a per-round address**: `/api/games/<game>/rounds/<n>/photo`. It works only for the player in that game and only while that round is open. Once the round is scored it answers 404 for good. The photo's real filename in Storage never reaches the browser, and the Storage bucket is private.
- **The pin is saved every time it moves**, so when the clock hits zero the guess is already on the server. Guesses are accepted up to 1.5 seconds after the deadline to allow for network delay.
- **A round opens 2.5 seconds before its clock starts.** The photo loads behind the "Round N" card, so the player gets the full 30 seconds.
- **Reporting.** The reveal screen has "Report photo". A photo reported by three different accounts leaves rotation (it is hidden, never deleted). Each account can file 10 reports in 24 hours. Review them with `npm run photos:reports`.

The visual direction is written up in `DESIGN.md`.

### Testing without Google

In development only, `http://localhost:3000/api/dev/login?as=1` signs the browser in as a test account ("Dev Player 1"; `as` can be 1 to 9). It returns 404 on the deployed site.

## Tests

| Command | What it checks | Needs |
|---|---|---|
| `npm test` | Scoring, geometry, the photo pipeline, formatting | nothing |
| `npm run test:live` | The game rules in the real database: scoring matches the reference, deadlines, the per-round photo address, reports, and that the public key can read and call nothing | `.env.local`; for the HTTP checks, `npm run dev` running in another terminal |
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
