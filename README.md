# BruinGuessr

A GeoGuessr-style game for UCLA's campus. You see a photo taken somewhere on campus, get 30 seconds to drop a pin on the map, and score more the closer you land.

`SPEC.md` is the source of truth for what is being built. `PROGRESS.md` records what is done, key decisions and manual steps.

## Running it

```
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests
npm run typecheck
```

`.env.local` (not committed) holds `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `MAPILLARY_TOKEN`.

## Campus boundary

`data/campus.geojson` is the approved boundary, built from OpenStreetMap by `npm run campus:build`. Its bounding-box diagonal is the scoring constant D. Review page (development only): `/dev/boundary`.

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
