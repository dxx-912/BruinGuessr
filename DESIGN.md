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

BruinGuessr looks like a stadium scoreboard on an evening game: deep navy, UCLA Blue panels, gold for anything you press or win. Type is condensed, heavy and slanted, like numbers on a jersey. Shapes are chunky with hard edges and solid drop lips, like enamel pins. No glows, no gradients on text, no glass blur.

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
- **Where it appears.** The Play page hero, large and in full colour, with the headline in the sky and the tiles overlapping its foot. Every other site page (Leaderboard, Profile, Settings, Versus, Login, Credits) and the versus lobby: the same scene as a fixed backdrop at the bottom of the window, dimmed under a `night` veil, with the content in panels over it (WatGuessr's arrangement). Never behind a round, a reveal or a summary, where the photo and map need all the attention.

## Type

- Display: **Barlow Condensed**, 700 to 800, italic, uppercase. Headings, round labels, button labels, scores, the timer.
- Body: **Barlow**, 500 and 600. Sentences, credits, small print. Sentence case.
- Numbers use tabular figures so the timer and score do not jiggle.

## Shape and depth

- Radius: 14 px on buttons, 20 px on panels, 14 px on rows inside a panel, full pills for the timer and chips.
- Depth is a solid lip, not a blur: buttons have `box-shadow: 0 5px 0 <darker>` and sink 3 px when pressed. Panels have a 2 px `navy-line` border and a soft dark shadow only so they separate from a busy photo or the illustration.
- Over the illustration a panel is `navy` at 92% so a hint of the scene shows at its edges but never behind text enough to lower contrast.
- Pins are drawn as SVG: the player's pin is a blue teardrop with a white ring; the answer is a gold flag on a dark pole.
- Icon chips: a 44 px rounded square in a campus colour with a white line icon, used on feature bubbles, stat tiles and settings headers, so each section has its own colour.

## Screens

**Site layout (Phase 6a, restyled in 6c).** Every page but a game and a versus lobby. From 1024 px wide: a navy side bar (240 px) with the mark and wordmark at the top and four items, Play, Leaderboard, Profile, Settings, each an icon and a display-type label; the current one is a gold pill with dark text. Narrower: the same four as a bottom tab bar (icon over a small label, 56 px tall, gold for the current one) above the home bar, and the mark at top left (the wordmark from 400 px wide). Top right on every page: signed in, a pill with the avatar, the username and a chevron that opens a small panel (Profile, Settings, Log out); signed out, a quiet "Log in" and a gold "Sign up". The footer is one line: "A student project, not affiliated with UCLA" and the credits link.

**Play page.** The campus scene fills the top of the page edge to edge (behind the header). "KNOW UCLA?" (UCLA in gold) and the subheading sit in its night sky. The two big tiles, gold Solo and blue Versus, overlap the scene's foot (stacked on a phone). Below: three feature bubbles, Look (blue chip, an eye), Pin (brick chip, a pin), Score (green chip, a target), each a panel with the chip, a display title and one sentence. Then "Top players": five cards, ranks 1 to 3 in gold, silver and bronze discs.

**Leaderboard.** Over the dimmed scene. A centred "Leaderboard" title and one line of explanation. A "your rank" strip (signed in). Then one panel holding the table: a header row (Rank, Player, Reached, Best) in small `sky` text, then each player as a rounded row on `night`: a rank disc (gold, silver, bronze with dark numbers, then navy-line with white), the name (links to the profile), the date reached (wide screens) and the score in gold display type. The player's own row is blue with a "You" pill. Previous / Page N of M / Next centred under the panel.

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

- **Icon.** The header's gold pin, with its dark outline and a solid lip under it, on a UCLA Blue tile. One drawing for every size (`npm run icons:build`): favicon, Apple touch icon, home-screen icons.
- **Share images** (1200 × 630, drawn in code by `src/lib/share-image.tsx`). Night background, a gold rule along the bottom edge. The site image: the wordmark stacked large, "Where on campus was this photo taken?", three scoreboard chips, and the campus drawing with pin, flag and dashed line. A room link: "JOIN MY GAME" and the room code as five scoreboard tiles.
- **404.** "Off the map": the campus outline with a pin dropped outside it, and the reveal panel's score line reading 0 points.
- **Loading.** The campus outline with a gold pin hopping on it, and a short label ("Setting up your game…").

## Motion and sound

- Things arrive with a short overshoot (about 250 ms). Scores count up over about 900 ms. The reveal line draws from guess to answer.
- Sound is synthesised in the browser (no audio files): a soft tick for the last five seconds, a thud when a pin lands, a rising tally on the reveal, a short fanfare for a bullseye. A mute button sits in the top bar and the choice is remembered.
- With "reduce motion" on, count-ups and confetti are skipped and transitions are instant.

## Words

Plain and short. "Guess", "Next round", "Play again", "84 m away", "No guess", "Time's up". Never "Submit". In versus: "Create a room", "Join", "Start game", "Locked in", "Final standings", "Rematch", "Leave room".
