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
| `alarm` | `#FF5A4D` | Last five seconds of the timer, errors |

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

**Home.** Navy field, the campus outline large and faint in gold line behind the content, one gold pin dropped on it. Wordmark "BRUIN" in white, "GUESSR" in gold. One line of explanation. A large gold "Play solo" tile; a muted "Versus" tile marked as coming later. Account chip at top right. Signed out, the main button is "Sign in with Google to play".

**Round.** The photo fills the screen (`contain` over a blurred copy of itself, so nothing is cropped). Scroll to zoom, drag to pan.
- Top left: small wordmark and a quit control.
- Top centre: timer pill with seconds and a draining bar. Gold in the last ten seconds, red and ticking in the last five.
- Top right: round tracker (five pips with each round's score filled in as it is earned) and the running total.
- Bottom right: the campus map. Small at rest, large on hover or focus. Under it one gold button: "Place your pin" (disabled) then "Guess".
- Narrow screens: photo on top, map on the bottom half, button pinned under the map.
- Before the clock starts, a short "Round 3" card covers the photo while it loads.

**Reveal.** The map takes the whole screen. The player's pin and the gold flag, a dashed line drawn between them, the camera fitted to both. A panel slides up from the bottom: distance in words ("84 m away"), the points counting up beside a bar that fills toward 5,000, the photo as a thumbnail, the photographer credit and license, a quiet "Report photo" control, and the gold "Next round" button. Within 10 m: "BULLSEYE" stamp and a burst of blue and gold confetti.

**Summary.** The map with all five pairs. A table of rounds (thumbnail, distance, points), the total out of 25,000 counted up large in gold, "Play again" and "Home".

## Motion and sound

- Things arrive with a short overshoot (about 250 ms). Scores count up over about 900 ms. The reveal line draws from guess to answer.
- Sound is synthesised in the browser (no audio files): a soft tick for the last five seconds, a thud when a pin lands, a rising tally on the reveal, a short fanfare for a bullseye. A mute button sits in the top bar and the choice is remembered.
- With "reduce motion" on, count-ups and confetti are skipped and transitions are instant.

## Words

Plain and short. "Guess", "Next round", "Play again", "84 m away", "No guess", "Time's up". Never "Submit".
