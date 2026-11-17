# BruinGuessr design direction

Written once from the screenshots in `/reference` (gitignored). Work from this file, not the images.

## What the references do well

- **GeoGuessr**: the photo fills the whole screen and the interface floats over it. Heavy italic display type. A pill timer at top centre, a round tracker with the running total at top right, a small map at bottom right that grows when you reach for it, and one fat "Guess" button under the map. Buttons look physical: rounded, with a darker lip underneath.
- **WatGuessr**: proof that a campus version works with flat photos. A big round label, a single submit button, a home page with one large "Solo" tile and one "Party" tile, and gold as the accent on a dark surface.

What we do not take: GeoGuessr's purple starfield and 3D mascots, WatGuessr's low-poly landscape, either logo or name.

## The idea: game day scoreboard

BruinGuessr looks like a stadium scoreboard on a night game: deep navy, UCLA Blue panels, gold for anything you press or win. Type is condensed, heavy and slanted, like numbers on a jersey. Shapes are chunky with hard edges and solid drop lips, like enamel pins. No glows, no gradients on text, no glass blur.

The one image that belongs only to this game is the **campus outline** (drawn from `data/campus.geojson`). It is the home page hero and the loading mark.

## Color

| Token | Value | Use |
| --- | --- | --- |
| `night` | `#06182B` | Page background |
| `navy` | `#0B2742` | Panels over the photo and map |
| `navy-line` | `#1C4467` | Panel borders, dividers |
| `ucla-blue` | `#2774AE` | Brand surfaces, the player's pin, progress fills |
| `sky` | `#8BB8E8` | Secondary text on dark, quiet accents |
| `ucla-gold` | `#FFD100` | Primary buttons, scores, the answer flag, the wordmark's second half |
| `gold-deep` | `#B38F00` | The lip under gold buttons |
| `paper` | `#F4F8FC` | Primary text on dark |
| `alarm` | `#FF5A4D` | Last five seconds of the timer, errors, versus damage and knock-outs, a multiplier above ×1 |
| `health` | `#3ED68A` | Versus health (bars and numbers) while above half. Gold below half, alarm below a fifth. Phase 6c revisits it. |

Gold always carries dark text (`night`). Blue and navy carry `paper` text.

## Type

- Display: **Barlow Condensed**, 700 to 800, italic, uppercase. Headings, round labels, button labels, scores, the timer.
- Body: **Barlow**, 500 and 600. Sentences, credits, small print. Sentence case.
- Numbers use tabular figures so the timer and score do not jiggle.

## Shape and depth

- Radius: 14 px on buttons, 20 px on panels, full pills for the timer and chips.
- Depth is a solid lip, not a blur: buttons have `box-shadow: 0 5px 0 <darker>` and sink 3 px when pressed. Panels have a 2 px `navy-line` border and a soft dark shadow only so they separate from a busy photo.
- Pins are drawn as SVG: the player's pin is a blue teardrop with a white ring; the answer is a gold flag on a dark pole.

## Screens

**Site layout (Phase 6a; Phase 6c restyles it).** Every page but a game and a versus lobby. From 1024 px wide: a navy side bar (240 px) with the mark and wordmark at the top and four items, Play, Leaderboard, Profile, Settings, each an icon and a display-type label; the current one is a gold pill with dark text. Narrower: the same four as a bottom tab bar (icon over a small label, 56 px tall, gold for the current one) above the home bar, and the mark at top left (the wordmark from 400 px wide). Top right on every page: signed in, a pill with the avatar, the username and a chevron that opens a small panel (Profile, Settings, Log out); signed out, a quiet "Log in" and a gold "Sign up". The footer is one line: "A student project, not affiliated with UCLA" and the credits link.

**Play page (Phase 6a).** "KNOW UCLA?" with UCLA in gold, the subheading, then two big tiles side by side (stacked on a phone): gold Solo and blue Versus, each a big display word with one sentence under it. Below: three Look / Pin / Score panels and a "Top players" row of five.

**Profile and settings (Phase 6a).** Profile: an initial in a blue circle (never the Google photo), the name large, a row of six stat panels, then recent games as panels that open to their rounds. Settings: three panels (Username, Account, Delete account, the last with a red border and a red button). The red button (`btn-red`, alarm red with a dark lip) is only for deleting.

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
| 2 | `#E5484D` |
| 3 | `#1E9E62` |
| 4 | `#8B5CD6` |
| 5 | `#DD7A12` |

Marks and pins carry white letters and a white ring. A player's own pin is a little larger and sits on top.

**Versus page.** "Play versus" as the headline, then two panels side by side: "Host a game" with a gold "Create a room", and "Join a game" with a five-letter code field and a blue "Join".

**Lobby.** The room code as five scoreboard tiles (gold letters on navy, with a lip). Under it the link with "Copy link" and, where the device has one, "Share". Five seats in a grid: filled seats show the mark, the name and a gold "Host" pill; open seats are dashed. The host has one wide gold "Start game"; everyone else reads "Waiting for NAME to start the game…". On a phone the start area stays pinned to the bottom.

**Health (Phase 6b).** Versus is a health battle, so health is the number that matters on every versus screen; points are what causes damage. A health bar is a thin pill on `night` with a 1 px `navy-line` ring that drains from the right: `health` green above half, gold to a fifth, alarm red below. Damage is always alarm red with a minus sign ("−1,234"). A player who is out is greyed (their mark in greyscale, name struck through in the strip) and says "Out" or "Out in round 7". Multipliers read "×1.5" and turn alarm red once above ×1.

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
