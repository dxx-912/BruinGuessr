# BruinGuessr design direction

Written from the screenshots in `/reference` (gitignored); last looked at for Phase 6c, including WatGuessr's Leaderboard, Profile and Settings pages. Work from this file, not the images.

## What the references do well

- **GeoGuessr**: the photo fills the whole screen and the interface floats over it. Heavy italic display type. A pill timer at top centre, a round tracker with the running total at top right, a small map at bottom right that grows when you reach for it, and one fat "Guess" button under the map. Buttons look physical: rounded, with a darker lip underneath.
- **WatGuessr**: proof that a campus version works with flat photos. A big round label, a single submit button, a home page with one large "Solo" tile and one "Party" tile, and gold as the accent on a dark surface. Its home page puts a painted campus landscape behind everything, and the other pages keep that landscape as a dimmed backdrop with the content in dark panels over it.
- **WatGuessr Leaderboard**: a centred title, a search and sort row, then one panel holding the table. Each player is a rounded row of its own inside the panel, not a stripe. Ranks sit in small coloured discs (gold, silver, bronze, then grey), the score is the coloured number, and small helper figures (games, win rate) are quiet text with a thin bar. Previous / Page N / Next sit centred under the panel.
- **WatGuessr Profile**: one card at the top with the avatar circle, the name large and a coloured pill under it, small stat tiles beside it, and a second tile with a ring chart. Match history is its own card underneath.
- **WatGuessr Settings**: a single centred column. A header with an icon, a card with avatar, name, email and "Member since", then one card per topic with a hairline under its title, each row a label with a line of grey help text on the left and a small outlined button on the right. The last card is a red "Danger Zone".

What we do not take: GeoGuessr's purple starfield and 3D mascots, WatGuessr's low-poly landscape and its artwork, either logo or name.

## The idea: game day at dusk

BruinGuessr looks like a stadium scoreboard on an evening game: deep navy, UCLA Blue panels, gold for anything you press or win. Type is condensed, heavy and slanted, like numbers on a jersey. Shapes are chunky with hard edges and solid drop lips, like enamel pins. No gradients on text. Light and depth (gradients, glow, haze, soft shadows) belong to the Play page: its sky and scene, its enamel tiles, and the frosted "How it plays" cards, the only glass blur on the site. The side bar has a quiet top-to-bottom gradient; everything else stays flat with solid lips.

Phase 6c adds the campus around the scoreboard: the terracotta brick of Royce Hall and Powell, the green of the lawns, the warm sky at sunset. Blue and gold still lead; brick and green are the supporting cast; health, damage and knock-outs each get their own colour so versus reads at a glance.

The image that belongs only to this game is the **campus scene**: Royce Hall at dusk from the quad (see "Illustration"). The campus outline from `data/campus.geojson` stays as the loading mark, the 404 and the share images.

## Color

Base:

| Token | Value | Use |
| --- | --- | --- |
| `night` | `#06182B` | Page background, the top of the illustration's sky |
| `navy` | `#0B2742` | Panels over the photo, map and illustration |
| `navy-line` | `#1C4467` | Panel borders, dividers |
| `ucla-blue` | `#2774AE` | Brand surfaces, the player's pin, progress fills, the Versus tile |
| `sky` | `#8BB8E8` | Secondary text on dark, quiet accents |
| `ucla-gold` | `#FFD100` | Primary buttons, scores, the answer flag, rank 1, the wordmark's second half |
| `gold-deep` | `#B38F00` | The lip under gold buttons |
| `paper` | `#F4F8FC` | Primary text on dark |

Campus (new in 6c):

| Token | Value | Use |
| --- | --- | --- |
| `brick` | `#B9472A` | Royce Hall terracotta. Surfaces that carry `paper` text: the Pin feature chip, the bronze medal's lip, illustration walls |
| `brick-deep` | `#7E2E19` | Lip under brick surfaces |
| `brick-light` | `#F28B6C` | Brick as text or an accent on dark: rank 3 (bronze), "far" round scores |
| `green` | `#237A4B` | Lawn green. Surfaces that carry `paper` text: the Score feature chip, success notes |
| `green-deep` | `#164F30` | Lip under green surfaces |
| `leaf` | `#7FD48B` | Green as text or an accent on dark: "close" round scores, a saved setting |
| `sand` | `#F3D9A4` | Royce's cast-stone trim. Rank 2 is silver (`#C9D6E2`), not sand; sand is only for small warm accents and the illustration |

Game states:

| Token | Value | Use |
| --- | --- | --- |
| `health` | `#3ED68A` | Versus health above half (bar and number) |
| `hurt` | `#FF9F43` | Health between a half and a fifth. Orange, so gold keeps meaning "the answer / you won" |
| `alarm` | `#FF5A4D` | Damage ("−1,234"), health below a fifth, the last five seconds, errors, a multiplier above ×1, deleting |
| `out` | `#8496AB` | Knocked-out players: their name, "Out in round N", their empty bar, their greyscale mark |

Text pairs and their contrast (WCAG ratio, 4.5 needed for small text, 3 for large display type):

- `paper` on `night` 16.8, on `navy` 14.2, on `ucla-blue` 4.7, on `brick` 4.9, on `green` 5.0, on `navy-line` 9.5.
- `night` on `ucla-gold` 12.3, on `brick-light` 7.4, on `leaf` 10.0, on `health` 9.5, on `hurt` 8.8, on `alarm` 5.8, on silver 12.1.
- On `navy`: `sky` 7.3, `ucla-gold` 10.4, `brick-light` 6.3, `leaf` 8.5, `health` 8.1, `hurt` 7.4, `alarm` 4.9, `out` 5.0.
- Never: `paper` on `leaf`, `health`, `hurt` or `ucla-gold`; `brick` or `green` as text on dark (both under 3). Use their light twins.

Gold, leaf, health, hurt and brick-light surfaces carry dark text (`night`). Blue, brick, green and navy carry `paper` text.

**Round score tones.** A round's points are coloured by how good they were, wherever a round result appears (reveal bar, summary table, profile rounds): 5,000 `ucla-gold` (bullseye), 4,000 and up `leaf`, 1,500 and up `sky`, under 1,500 `brick-light`, no guess `out`. Totals and the big score stay gold.

## Illustration

`public/art/campus-scene.svg`, 1600 × 720, generated by `scripts/build-campus-scene.py` (`npm run art:build`); edit the script, not the SVG.

- **Subject and viewpoint.** Royce Hall's east facade straight on, from the middle of the quad walkway, traced from a straight-on photo (the script maps photo pixels into the scene, so proportions follow the building: the centre block is about 2.3 tower-widths wide, the wings reach about half the towers' height). What makes it Royce: two square brick towers with stone quoins, corbel tables, a cornice and a low tile cap; between them a gable with a corbelled rake over a three-arch upper loggia (the middle arch springs highest) with a tall window in each; a cream stone band (the inscription); three equal arched portals in a cream ground floor, up a wide flight of steps; wings with tall arched windows in deeper arched recesses above a cream arcade, a tile roof showing. In front: the cream walkway with its brick inlay lines running to the doors, lawns, rounded shrubs at each tower's foot, lamp posts with blue and gold banners. The Dickson fountain sits front left, where it is from that spot: a low, wide stone basin with a short jet and two veils of spray, smaller than the trees beside it. A neighbouring Romanesque hall's gable is cut off at the right edge. Powell is behind the viewer, so it is not in the picture.
- **The towers are not twins.** Royce is famously asymmetric, and the drawing keeps the differences you can see from the quad:
  - Belfry: three arched openings on the left tower, two on the right.
  - Bays: thin stone strips split the left tower's face into three bays and the right tower's into two, all the way down.
  - Slit windows: the left tower has a pair high up on its inner side and a pair low on its outer side; the right tower only a low pair on its inner side.
  - A round medallion on the left tower only.
  - The patterned panel low on each tower: a big diamond and a checker on the left, a triangle on the right.
- **Light.** Evening. The sky runs from `night` at the top through navy and blue to lavender at the horizon, with angular pink cloud streaks. The doors, a few windows and the lamps are lit. One gold BruinGuessr pin is pushed into the lawn.
- **Style: flat geometric.** Solid fills, no gradients, no outlines except the pin's, no texture. Everything is built from straight-edged shapes: buildings are flat planes (a lit face, a shaded side strip, `sand` stone trim, dark arches), trees are low-poly canopies (a fan of triangles shaded lighter on the side facing the upper left), clouds and stars are angular shards, the fountain is a flat basin with a few angular sprays, the lawns are flat wedges. Detail is kept to what reads at phone width.
- **Palette.** Only the tokens above plus a handful of in-between shades (darker brick and green for shade, the dusk blues, lavender and pink). The bottom edge is a jagged `night` band so the scene sinks into the page.
- **Cropping.** Royce is centred so the scene can be cropped to any width (`xMidYMax slice`): a phone sees both towers, the gable, the portals and the walkway.
- **The relit hero version (2026-11-17).** `npm run art:build` also writes `public/art/campus-hero.svg`: the same drawing at golden hour (`gold` grade in the script). Every shape's colour is passed through the grade (desaturated a little and pulled toward a dusky violet, and toward a warm haze the further back it is). The sky is a smooth gradient from `night` to a warm afterglow low behind the hall (no sun); the clouds are soft streaks that fade at both ends; stars stay out of the middle of the sky. Haze sits between the far trees and Royce and mist at the building's foot; the hall is shaded darker toward the ground with warm uplight on the towers (masked to its outline); the lit openings and lamps glow; the trees cast soft shadows. There is no pin, and the bottom fades into `night` instead of the jagged band. The geometry is unchanged, and `campus-scene.svg` is byte-for-byte the same. The script also has `blue` (blue hour) and `night` (floodlit) grades, tried for the hero and not used.
- **Where it appears.** The Play page hero: the relit version on the right, beside the headline and tiles (see "Play page"). Every other site page (Leaderboard, Profile, Settings, Versus, Login, Credits) and the versus lobby: the flat scene as a fixed backdrop at the bottom of the window, dimmed under a `night` veil, with the content in panels over it (WatGuessr's arrangement). Never behind a round, a reveal or a summary, where the photo and map need all the attention.

## Type

Three voices, so the slanted display type stands out because it is rare (changed 2026-11-17: before, one slanted style was on the headline, tiles, nav and buttons alike).

- Display (`.display`): **Barlow Condensed** 800, italic, uppercase. Only the moments: the Play headline, page titles (h1), scores and big numbers, the timer, round cards, stamps, the room code, the wordmark.
- Heading (`.heading`): Barlow Condensed 700, **upright, sentence case**. Section and card titles ("Top players", "Recent games", settings cards, feature titles, tile titles), dialog titles, loading labels.
- Button labels (`.btn`, `.btn-outline`): Barlow Condensed 700, upright, uppercase, tracked 0.035em. Physical buttons keep their lip.
- Body: **Barlow**, 500 and 600. Sentences, credits, small print, and the navigation. Sentence case.
- Numbers use tabular figures so the timer and score do not jiggle.

## Shape and depth

- Radius: 14 px on buttons, 20 px on panels, 14 px on rows inside a panel, full pills for the timer and chips.
- Depth is a solid lip, not a blur: buttons have `box-shadow: 0 5px 0 <darker>` and sink 3 px when pressed. Panels have a 2 px `navy-line` border and a soft dark shadow only so they separate from a busy photo or the illustration.
- Over the illustration a panel is `navy` at 92% so a hint of the scene shows at its edges but never behind text enough to lower contrast.
- Pins are drawn as SVG: the player's pin is a blue teardrop with a white ring; the answer is a gold flag on a dark pole.
- Icon chips: a 44 px rounded square in a campus colour with a white line icon, used on stat tiles and settings headers, so each section has its own colour. The Play page's three steps use them too: Look blue, Pin brick, Score green.

## Screens

**Site layout (Phase 6a, restyled in 6c).** Every page but a game and a versus lobby. From 1024 px wide: a navy side bar (240 px) with the mark and wordmark at the top and five items, Play, Leaderboard, Profile, Settings, Contribute (a camera icon; Phase 7a), each an icon and a Barlow 600 label in `sky`, sentence case. The bar is a quiet gradient (a little lighter navy at the top, with a faint blue glow in the top corner, a little darker at the foot). Pointing at an item gives it a faint white fill and hairline, `paper` text, a nudge of the icon and a faint `sky` edge bar. The current one is lit, not loud: `paper` text, a gold icon, a faint blue fill and a 4 px gold bar on the bar's left edge. In the bar's empty middle, a "Join with a code" box (a night card, the code field and a gold arrow button, "The 5 letters a friend sent you.") that goes straight to the room. At the foot of the bar, a card: signed in, "Your best", the best solo score in gold display type and the rank ("12th of 214" with its rank disc), linking to that page of the leaderboard; signed in with no finished game, "No score yet"; signed out, "Get on the board", one line on what an account gives, and a gold "Sign up". Narrower: the same five as a bottom tab bar (icon over a small label, 56 px tall; the labels drop to 11 px below 360 px wide so "Leaderboard" fits a 64 px tab; the current one has `paper` text, a gold icon and a short gold line along the top of its tab) above the home bar, and the mark at top left (the wordmark from 400 px wide). Top right on every page: signed in, a pill with the avatar, the username and a chevron that opens a small panel (Profile, Settings, Log out); signed out, "Log in" as plain `sky` text and a small gold "Sign up". The footer is one centred line: "A student project, not affiliated with UCLA", the credits link, "Built by Daniel Xing" (linking to his LinkedIn), Privacy and Terms (in development only, links to the review pages; a production build leaves them out).

**Play page (2026-11-17, picked from four variants as "B2"; polished the same day and again on 2026-11-17 evening).** Golden hour, split in two. From 768 px wide the hero's content is top-aligned under the header with fixed padding (3rem, 3.5rem from 1024 px), not centred in a full-screen hero, so "How it plays" rises into view on the first screen. A left column (47% of the 72rem column, 50% from 1280 px; on screens wider than the column, the column sits a quarter of the spare width from the left, not half, so the group is balanced against Royce bleeding off the right edge) holds everything you read and press: "KNOW UCLA?" large (UCLA in gold, the only slanted display type in the hero; it scales with the hero's width up to 7rem, which still fits the column on one line), the line under it ("Real Bruins know campus inside out. Five rounds to prove you actually go to class.", the spec's subheading) in a pale blue, then the two tiles, then the guest note ("Sign up to save your scores and play versus.").

The sky runs across the whole hero and up behind the header: night at the top, a deep blue low down, with a soft UCLA Blue glow behind the headline and a breath of gold where "UCLA?" sits. On the right, the drawing's own sky (the hero SVG's gradient, stop for stop down to the wings' roofline, then a softer afterglow) lies behind Royce, so the drawing melts into it with no seam; it gives way to the calmer blue at the text's end, so no text sits on the warm part. Royce (`campus-hero.svg`) stands between the text's end and the right edge of the page, sized so a fixed window of the drawing fits there: both towers whole, a bay of wing beyond the left tower that dissolves into the sky, and the right wing cut by the page edge about a tower's width past the right tower (x 400 to 1260 of the 1600-unit drawing from 1536 px, so more right wing shows and the building sits further left; 420 to 1120 from 1280 px; 430 to 1110 below). Royce hangs from the tiles, not from the hero's edge: the foot of its steps is level with the bottom of the tiles, so the building rises beside them to about the line under the headline, however tall the window is. Its top third and the end of the walkway melt into the sky. The tiles grow a little on tall windows (18 to 22rem from 1280 px). On a phone the page is too narrow to split: the headline and line, then the scene (its height follows the screen's, about a third, so the Solo tile is on the first screen even on an iPhone SE), then the tiles.

**Where is this?** Real photos from the game pool, as a teaser: from 768 px a tilted stack of polaroid-style prints (cream border, deeper at the foot) in the sky just above Royce's right tower, or over the right wing from 1536 px, where Royce is drawn larger and rises higher; it is placed in the drawing's own units, so it never covers a tower. A gold "Where is this?" tag with a pin sits on its corner. Every 4.2 s the front print slides to the back (paused while pointed at). On a phone, the same prints as a strip under the tiles, drifting slowly sideways. With "reduce motion" on, the stack stands still and the strip is a row to swipe. Five photos at a time, a new set every six hours. They are served by `/api/showcase/[slot]?b=<batch>`: the address names a slot and a batch, never a photo, and the bytes are a re-cut, re-encoded 560 × 400 copy, so they never match the file a round serves. No location, credit or source goes with them.

**Pins in the sky.** Three or four small gold map pins (the header's mark, with a soft gold glow) float in the sky around Royce: beside the left tower, over the gable, high and faint, beside the right tower. Each bobs about 9 px on its own six-second beat; with "reduce motion" on they stand still.

The tiles are enamel pins: Solo a gold gradient face with dark text, Versus a blue one (`#2774ae` to `#195385`) with `paper` text; a sheen across the top half, a solid lip, a long soft shadow (Solo also a faint gold glow), the icon in a 64 px disc (night on gold, paper on blue) and the same icon large and faint running off the corner. From 1280 px they stand side by side as tall tiles (at least 18rem) with the title (heading style, about 3rem), the sentence, and an arrow disc along the bottom. Solo's foot says where the player stands: "Your best" with the best solo score in display type and the rank in a night pill ("12th"); "Play as a guest" when signed out; "Play now" when signed in without a finished game. Versus's foot is a "Have a code?" field (gold letters on night) with a paper arrow button that joins that room directly; the rest of the tile goes to the versus page (its title link is stretched over the tile, and the form sits above it). Narrower, each is a compact row: disc, title and sentence (with Solo's standing as a line under it), arrow; Versus puts the code field on a second row. The whole tile is the control.

Below the hero: "How it plays" as three frosted cards (translucent navy, a strong background blur, a hairline border and a soft shadow), each with its icon chip (Look blue with an eye, Pin brick with a pin, Score green with a target), a heading-style title and a pale blue sentence. They sit just under the hero; side by side from 640 px.

Then "Top players", centred in a 48rem column: the title large, "Each player's best solo game." under it, then a podium. Second, first, third from left to right; each spot has the player's initial in a blue circle with a ring in its medal colour (a gold crown over first), the name and the score in gold display type, standing on an enamel pedestal: gold (tallest, with a faint gold glow), silver (`#c9d6e2`), bronze (`brick-light`, with a `brick` lip), each with its rank large in night. Then ranks 4 to 10 as rounded rows in one panel (rank disc, name, gold score; the player's own row blue with a "You" pill). An empty place keeps its pedestal or row and reads "Your name here" in `out` slate with a dash for the score (a dashed circle on the podium, a dashed row below). An outlined gold "Full leaderboard" sits centred under it.

**Leaderboard.** Over the dimmed scene. A centred "Leaderboard" title and one line of explanation. A "your rank" strip (signed in). Then one panel holding the table: a header row (Rank, Player, Reached, Best) in small `sky` text, then each player as a rounded row on `night`: a rank disc (gold, silver, bronze with dark numbers, then navy-line with white), the name (links to the profile), the date reached (wide screens) and the score in gold display type. The player's own row is blue with a "You" pill. Previous / Page N of M / Next centred under the panel.

**Contribute** (`/contribute`, Phase 7a). Over the dimmed scene, one column (about 640 px), two panels. The first panel changes with each step; it is built for a phone held upright:
- *Start*: a green camera chip and "ADD A PHOTO" (display type, "photo" in gold), a line on why (the Hill, the northwest, the edges), three numbered steps in blue discs, and one gold "Start" button. On a computer (no touch screen) the button is replaced by a row: "Open this page on your phone".
- *Camera*: the live picture in a black rounded frame (its own aspect ratio, at most 62% of the screen height, never cropped, so what you see is what is taken). Over its top: the GPS chip (a pill: green at 25 m or better, gold to 40 m, alarm red when not usable, "±12 m", "· off campus") and, once there is a reading, a compass pill ("ENE 75°") on translucent night. Over its foot: the tip, "Wait for people to pass. Shoot places, not people." Under it, a status line in leaf, hurt or alarm ("Ready.", "Location is ±52 m. Needs 40 m or better", "You're outside the campus boundary") with a quiet "Turn on compass" where the browser needs a tap, and the shutter: an 80 px gold disc with a paper ring, a gold lip and a dark camera icon, slate and flat while it cannot fire.
- *Checking for faces*: a heading and a gold progress bar.
- *Your photo*: the shot as taken, any faces found outlined in gold (not blurred), a line on what was found ("We marked 3 possible faces." / "We didn't find any faces.") and that only the contributor and reviewers see it until it is accepted, and reviewers blur faces before it goes live; "Are there people in this photo?" as two big toggle buttons (gold when picked); the license as a checkbox row (CC BY-SA 4.0 in gold, credited to the username); gold Submit (off until both are answered) and a quiet Retake; the capture and upload sizes and the accuracy in small print.
- *Sent*: a green check chip, "Sent. Thank you!", gold "Take another".
The second panel, "Your photos", lists the player's submissions as rows: a small thumbnail (or a slate camera for ones without a file), a status pill (Waiting gold, Live leaf, Not accepted brick-light with the reason after it, Removed slate) and the date. "3 of 10 today · 2 waiting" sits on the title row.

**Review** (`/admin/contributions`, admins only). A working tool, not a page for players: full screen on night, no side bar or tab bar. A navy header ("Contributions · 4 waiting", who is signed in, Refresh, Site). Three columns from 1024 px (stacked below): the queue (thumbnail, username, alarm "People" and hurt "Pin check" flags; the current one outlined in gold), the photo with the blur tool, pre-filled with the detector's suggestions (dashed gold boxes; the reviewer's own are solid gold; each blurred in the preview, clear on hover, with a small gold × to remove it; drag a rectangle to add one; "Clear N boxes" and "Back to the suggestions" under it) and "Photos already near here, facing the same way" as a grid of small cards, and on the right the pin map (the shared PinEditor: gold draggable pin, dark heading arrow, a dashed blue accuracy circle at the GPS fix, a white ghost dot where GPS put it once the pin moves, brick dots and arrows for nearby photos), the details (contributor, camera resolution, stored size, GPS accuracy and age, heading, time, the people answer and the boxes the detector suggested), then the decision: the pin check ("Confirm pin", or "Pin moved"), "Faces checked" (marked required when flagged), gold "Approve and publish", and a reject box (a list of ready reasons or your own words, red "Reject"). Success shows a green strip, problems an alarm one.

**Privacy and Terms** (`/privacy`, `/terms`). Over the dimmed scene, the Credits page's column: a display title with its second half in gold, "Last updated", a `sky` intro, then one panel of sections with heading-style titles. The privacy page is written from what the code and database really keep; change it whenever that changes.

**Profile.** Over the dimmed scene. A top card: the initial in a blue circle (never the Google photo), the name large, a gold outlined pill with the rank ("2nd on the leaderboard", linking to that page of the board) or a quiet "Not on the leaderboard yet", and the join date; under them two stat tiles, best game (gold chip, gold number) and games played (blue chip). Beside them (under them on a phone) a ring tile: average per round as a ring out of 5,000, in the round score tone, with the share in the middle. Then a row of three stat tiles: bullseyes (green), versus played (brick), versus won (gold). Then "Recent games" as its own card, with an outlined gold "Settings" on your own profile: each game a row that opens to its rounds (round, distance, points in the score tone). A stat tile is a row with a coloured icon chip, a label and the number; on a phone the chip sits above the label. Gold chips carry a dark icon (white on gold is too faint).

**Settings.** Over the dimmed scene, one centred column (about 640 px). A header: a gear chip and "Settings". A card with the avatar, the username, the Google email (owner only) and "Member since". Then cards with a title and a hairline under it: "Username" (the current name, a line of help text, the change form, when the next change is allowed), "Account" ("Signed in with Google", who can see the email, an outlined "Log out"). Last, "Danger zone" with a red title, a red border and the delete form with its red button.

**Game screens in 6c.** The layout below stays; colour comes in through meaning rather than decoration:
- The round tracker's pips fill in the round's score tone, so a game's five rounds read as a row of colours.
- The "Round N" card has a band in the scene's sunset colours behind the number.
- Reveal: the points bar fills in the round's score tone; the distance is a pill in the same tone; "Bullseye" stays gold.
- Summary: each round's points in its tone, the total in gold, "Play again" gold and "Home" blue.
- Versus: health in green / orange / red, damage red, knocked-out players slate, seat colours as below. The lobby's empty seats are dashed `navy-line`, filled seats carry their seat colour as a 4 px left edge.

**Home (Phases 1 to 5, replaced by the Play page above).** Navy field, the campus outline large and faint in gold line behind the content, one gold pin dropped on it. Wordmark "BRUIN" in white, "GUESSR" in gold. One line of explanation. A large gold "Play solo" tile; under it a navy "Versus" tile with a blue "Play versus" button. Account chip at top right. Signed out, the main button is "Sign in with Google to play".

**Round.** The photo fills the screen (`contain` over a blurred copy of itself, so nothing is cropped). Scroll to zoom, drag to pan.
- Top left: small wordmark and a quit control.
- Top centre: timer pill with seconds and a draining bar. Gold in the last ten seconds, red and ticking in the last five.
- Top right: round tracker (five pips with each round's score filled in as it is earned) and the running total.
- Bottom right: the campus map. Small at rest, large on hover or focus. Under it one gold button: "Place your pin" (disabled) then "Guess".
- Phones: photo on top, map on the lower half, button pinned under the map. A button in the map's corner gives the map three quarters of the screen for placing the pin, and back. Touch targets are at least 40 px. The mark at top left asks before leaving a game in progress. A phone on its side shows "Turn your phone upright".
- Before the clock starts, a short "Round 3" card covers the photo while it loads.

**Reveal.** The map takes the whole screen. The player's pin and the gold flag, a dashed line drawn between them, the camera fitted to both. A panel slides up from the bottom: distance in words ("84 m away"), the points counting up beside a bar that fills toward 5,000, the photo as a thumbnail, the photographer credit and license, a quiet "Report photo" control, and the gold "Next round" button. Within 10 m: "BULLSEYE" stamp and a burst of blue and gold confetti.

**Summary.** The map with all five pairs. A table of rounds (thumbnail, distance, points), the total out of 25,000 counted up large in gold, "Play again" and "Home".

## Versus

Versus uses the same screens as solo. Gold stays the one colour for the main action and for winning; blue is for the second choice.

**Seat colours.** Each player gets one colour for the whole room, by seat. It is on their mark in the lobby (a circle with their initial), their pin on the map and their row on the scoreboard, so a colour always means the same person. Gold is never a seat colour: it belongs to the answer.

| Seat | Value |
| --- | --- |
| 1 | `#2774AE` (UCLA Blue) |
| 2 | `#C2387F` (raspberry) |
| 3 | `#0B7F8C` (teal) |
| 4 | `#7650D0` (violet) |
| 5 | `#B9472A` (brick) |

Phase 6c moved seats off red, green and orange, so a seat colour is never mistaken for damage, health or "hurt". White letters on every seat colour are at least 4.7:1.

Marks and pins carry white letters and a white ring. A player's own pin is a little larger and sits on top.

**Versus page.** "Play versus" as the headline, then two panels side by side: "Host a game" with a gold "Create a room", and "Join a game" with a five-letter code field and a blue "Join".

**Lobby.** The room code as five scoreboard tiles (gold letters on navy, with a lip). Under it the link with "Copy link" and, where the device has one, "Share". Five seats in a grid: filled seats show the mark, the name and a gold "Host" pill; open seats are dashed. The host has one wide gold "Start game"; everyone else reads "Waiting for NAME to start the game…". On a phone the start area stays pinned to the bottom.

**Health (Phase 6b).** Versus is a health battle, so health is the number that matters on every versus screen; points are what causes damage. A health bar is a thin pill on `night` with a 1 px `navy-line` ring that drains from the right: `health` green above half, `hurt` orange to a fifth, `alarm` red below. Damage is always alarm red with a minus sign ("−1,234"). A player who is out is in `out` slate: their mark in greyscale, name struck through in the strip, an empty slate bar, and "Out" or "Out in round 7". Multipliers read "×1.5" and turn alarm red once above ×1.

**Round.** As solo, plus:
- Top left, under the bar: a player strip. Phone: every mark with a gold tick once they have guessed and a thin health bar under it. Wide screens: name, health bar and number, and "Guessing / Guessed / Away / Out".
- Top right, instead of the five round pips: the round number, its multiplier and this player's health ("Watching / Out" once knocked out). On a phone it is one narrow column ("Round 6 · ×2" over the health) so the clock keeps the middle.
- The "Round N" card says "Damage ×1.5" instead of "of 5".
- When someone locks in and the server cuts the clock, the timer jumps to 0:10 (its bar keeps the 30 second scale, so it drops to a third), a short double beep plays, and a red pill reads "Mia locked in. Hurry!": under the timer on wide screens, at the top of the map on a phone.
- After guessing, the button reads "Locked in. Waiting for 2 players". Knocked out, it reads "You're out. Watching this round" and the map takes no pin.

**Reveal.** The map shows every pin in its seat colour, each with a dashed line in the same colour drawn to the gold flag. The panel holds this player's points with the damage they took ("−182 health" or "no damage"), then the scoreboard, best standing first: rank, mark, name, distance (wide screens), points this round, damage, and the health bar with its number (number only on a phone). A player knocked out this round reads "Out!" in red; one out earlier is dimmed with "Out in round N". Then what comes next: a gold "Next round" for the host, a countdown for everyone else, with the next round's multiplier under it. Stamps: "Bullseye!" (gold), "Knocked out" (red, with a falling tone), "Winner!" (gold, with confetti).

**Final standings.** The summary screen, versus version: the headline is the place ("1st", gold for the winner) "of 4 players · 9 rounds", with "You won the room" or "Knocked out in round 7" above it, never a points total or a leaderboard line. Then the standings in finishing order: the winner's row has a gold border, a "Winner" pill and the health they finished with; everyone else reads "Out in round N", most recent knock-out first. Then "Your rounds" (only the rounds this player played), each with its points and the damage it cost. Pointing at a round shows everyone's pins for it on the map. Buttons: gold "Rematch", blue "Home".

**Lobby rules line.** Under the seats, one short paragraph: "Last one standing wins." and how damage works, for players who arrive by link and never see the versus page.

## Icon, share images, 404

- **Icon.** The header's gold pin, with its dark outline and a solid lip under it, on a UCLA Blue tile. One drawing for every size (`npm run icons:build`): favicon, Apple touch icon, home-screen icons, and the square logos in `public/brand/` (120 px for Google's sign-in branding, 512 px).
- **Share images** (1200 × 630, drawn in code by `src/lib/share-image.tsx`). Night background, a gold rule along the bottom edge. The site image: the wordmark stacked large, "Where on campus was this photo taken?", three scoreboard chips, and the campus drawing with pin, flag and dashed line. A room link: "JOIN MY GAME" and the room code as five scoreboard tiles.
- **404.** "Off the map": the campus outline with a pin dropped outside it, and the reveal panel's score line reading 0 points.
- **Loading.** The campus outline with a gold pin hopping on it, and a short label ("Setting up your game…").

## Motion and sound

- Things arrive with a short overshoot (about 250 ms). Scores count up over about 900 ms. The reveal line draws from guess to answer.
- Sound is synthesised in the browser (no audio files): a soft tick for the last five seconds, a thud when a pin lands, a rising tally on the reveal, a short fanfare for a bullseye. A mute button sits in the top bar and the choice is remembered.
- With "reduce motion" on, count-ups and confetti are skipped and transitions are instant.

## Words

Plain and short. "Guess", "Next round", "Play again", "84 m away", "No guess", "Time's up". Never "Submit". In versus: "Create a room", "Join", "Start game", "Locked in", "Final standings", "Rematch", "Leave room".
