"""Generates the campus scene: Royce Hall from the quad walkway.

    python3 build-campus-scene.py out.svg            flat geometric (public/art/campus-scene.svg)
    python3 build-campus-scene.py out.svg <grade>    the same drawing relit: gradient sky, haze between
                                                     the depth planes, glow from the lit openings, soft
                                                     shadows, a fade into the page. Grades: blue, gold, night.

The geometry is identical in every version; a grade only changes colour and light.
"""
import math, random, sys

random.seed(7)
W, H = 1600, 720
GROUND = 585
out = []
add = out.append
defs = []

# ---------- Grades (lit versions only) ----------
GRADES = {
    # Blue hour: cool and quiet, the campus colours pulled toward the sky, gold only where light is.
    "blue": dict(
        sky=[(0, "#06182B"), (0.2, "#08203B"), (0.42, "#0F335D"), (0.6, "#1B4E88"), (0.73, "#3368A8"), (0.83, "#5E84C0"), (0.9, "#93A2D2")],
        horizon=("#AFC3EE", 0.42), clouds=("#6F86C4", "#A2AEDD", 0.42), stars=0.75,
        desat=0.42, tint=("#1E3F73", 0.24), haze=("#8197CC", 0.55), shade=0.42, uplight=0.3, glow=1.0, mist=0.36,
    ),
    # Golden hour: the last warm light low in the sky behind the hall, deep blue above.
    "gold": dict(
        sky=[(0, "#06182B"), (0.24, "#0B2747"), (0.46, "#173F70"), (0.62, "#3A63A2"), (0.74, "#8A86BC"), (0.84, "#E0A196"), (0.9, "#F7C27C")],
        horizon=("#FFC979", 0.5), clouds=("#C9879F", "#F6B98A", 0.5), stars=0.55,
        desat=0.24, tint=("#3B2F5E", 0.12), haze=("#D9A48F", 0.42), shade=0.32, uplight=0.2, glow=0.85, mist=0.28,
    ),
    # Night game: dark sky, the hall floodlit from below like a stadium.
    "night": dict(
        sky=[(0, "#040F1D"), (0.3, "#06182B"), (0.55, "#0B2A4E"), (0.75, "#143E6C"), (0.9, "#1F5088")],
        horizon=("#3D6CAB", 0.35), clouds=("#18365F", "#24497A", 0.38), stars=1.0,
        desat=0.5, tint=("#0B2342", 0.42), haze=("#2B4B7C", 0.5), shade=0.5, uplight=0.62, glow=1.15, mist=0.3, beams=0.16,
    ),
}
GRADE = sys.argv[2] if len(sys.argv) > 2 else None
G = GRADES[GRADE] if GRADE else None
DEPTH = 0.0  # how far back the shapes being drawn are: 1 = the far trees, 0 = the foreground

def _rgb(h): return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
def _hex(c): return "#%02X%02X%02X" % tuple(max(0, min(255, round(v))) for v in c)
def _mix(a, b, t): return tuple(x + (y - x) * t for x, y in zip(a, b))

# Lights and the game's own colours keep their value under a grade.
LIGHTS = {"#FFC75A", "#F2B655", "#FFD100", "#2774AE", "#CFE6F7", "#06182B"}

def col(fill):
    if not G or not fill.startswith("#") or fill.upper() in LIGHTS:
        return fill
    c = _rgb(fill)
    grey = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
    c = _mix(c, (grey,) * 3, G["desat"])
    c = _mix(c, _rgb(G["tint"][0]), G["tint"][1])
    c = _mix(c, _rgb(G["haze"][0]), G["haze"][1] * DEPTH)
    return _hex(c)

def poly(pts, fill, extra=""):
    add(f'<path d="M{" L".join(f"{x:.1f} {y:.1f}" for x, y in pts)}Z" fill="{col(fill)}"{extra}/>')

def rect(x, y, w, h, fill, extra=""):
    add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{col(fill)}"{extra}/>')

def arch(x, y, w, h, fill):
    """Round-headed opening: x,y top-left of its box."""
    r = w / 2
    add(f'<path d="M{x:.1f} {y+h:.1f}V{y+r:.1f}A{r:.1f} {r:.1f} 0 0 1 {x+w:.1f} {y+r:.1f}V{y+h:.1f}Z" fill="{col(fill)}"/>')

def vgrad(gid, stops, y0, y1):
    """A vertical gradient in scene coordinates. stops: (offset, colour, opacity)."""
    s = "".join(f'<stop offset="{o}" stop-color="{c}" stop-opacity="{a}"/>' for o, c, a in stops)
    defs.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="0" y1="{y0}" x2="0" y2="{y1}">{s}</linearGradient>')

def glow(cx, cy, r, strength=1.0, gid="glow"):
    """A soft pool of warm light, added on top (screen) so it brightens what is under it."""
    a = min(1.0, 0.8 * strength * G["glow"])
    add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="url(#{gid})" opacity="{a:.2f}" style="mix-blend-mode:screen"/>')

# Palette (DESIGN.md)
NIGHT = "#06182B"
BRICK_LIT, BRICK, BRICK_WING, BRICK_SHADE, BRICK_DARK = "#CB6440", "#B9472A", "#C25A37", "#963D23", "#A84A2C"
OPEN = "#3A1A12"
STONE, STONE_SHADE = "#EBD3A3", "#CDB07E"
GLOW = "#FFC75A"
TILE = "#B5502E"

# ---------- Sky ----------
if G:
    defs.append('<filter id="soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>')
    defs.append('<filter id="blur12" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>')
    defs.append('<filter id="white" filterUnits="userSpaceOnUse" x="0" y="0" width="1600" height="720">'
                '<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter>')
    defs.append('<radialGradient id="glow"><stop offset="0" stop-color="#FFD98A" stop-opacity="1"/>'
                '<stop offset="0.35" stop-color="#FFC75A" stop-opacity="0.45"/><stop offset="1" stop-color="#FFC75A" stop-opacity="0"/></radialGradient>')
    defs.append('<radialGradient id="uplight"><stop offset="0" stop-color="#FFD27A" stop-opacity="1"/>'
                '<stop offset="0.45" stop-color="#FFC75A" stop-opacity="0.35"/><stop offset="1" stop-color="#FFC75A" stop-opacity="0"/></radialGradient>')
    defs.append(f'<radialGradient id="horizon"><stop offset="0" stop-color="{G["horizon"][0]}" stop-opacity="{G["horizon"][1]}"/>'
                f'<stop offset="1" stop-color="{G["horizon"][0]}" stop-opacity="0"/></radialGradient>')
    vgrad("sky", [(o, c, 1) for o, c in G["sky"]], 0, 600)
    rect(0, 0, W, H, "url(#sky)")
    add(f'<ellipse cx="800" cy="560" rx="980" ry="250" fill="url(#horizon)"/>')
    # Clouds: the same long streaks, but soft, fading out at both ends
    for gid, c in (("cloudA", G["clouds"][0]), ("cloudB", G["clouds"][1])):
        defs.append(f'<linearGradient id="{gid}"><stop offset="0" stop-color="{c}" stop-opacity="0"/>'
                    f'<stop offset="0.4" stop-color="{c}" stop-opacity="1"/><stop offset="0.7" stop-color="{c}" stop-opacity="0.85"/>'
                    f'<stop offset="1" stop-color="{c}" stop-opacity="0"/></linearGradient>')
    clouds = [
        ([(930, 330), (1080, 250), (1260, 210), (1180, 262), (1010, 318)], "A"),
        ([(1010, 318), (1180, 262), (1420, 236), (1330, 270), (1110, 330)], "B"),
        ([(1150, 360), (1330, 300), (1560, 290), (1440, 330), (1230, 372)], "B"),
        ([(1230, 372), (1440, 330), (1600, 334), (1600, 352), (1380, 380)], "A"),
        ([(220, 330), (360, 296), (470, 300), (380, 322), (260, 342)], "A"),
        ([(110, 400), (260, 372), (380, 378), (300, 396), (150, 412)], "B"),
    ]
    add(f'<g opacity="{G["clouds"][2]}" filter="url(#soft)">')
    for pts, k in clouds:
        poly(pts, f"url(#cloud{k})")
    add("</g>")
    # Stars: small and quiet, and none in the middle of the sky where the headline goes
    rs = random.Random(11)
    add(f'<g fill="#F3D9A4" opacity="{G["stars"]}">')
    placed = 0
    while placed < 46:
        x, y = rs.uniform(10, W - 10), rs.uniform(8, 300) ** 1.0
        if 380 < x < 1220 or y > 330 - abs(x - 800) * 0.1:
            continue
        r = rs.choice((0.8, 1.0, 1.2, 1.6))
        add(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" opacity="{rs.uniform(0.35, 1):.2f}"/>')
        placed += 1
    add("</g>")
else:
    rect(0, 0, W, H, NIGHT)
    for y, c in [(150, "#0B2742"), (235, "#123660"), (305, "#1B4C82"), (365, "#2A62A0"), (420, "#4A74B4"), (470, "#7B86C2"), (515, "#A795C6")]:
        rect(0, y, W, H - y, c)

# Pink cloud shards streaking up to the right, as on an evening over the quad
for pts, c in [] if G else [
    ([(930, 330), (1080, 250), (1260, 210), (1180, 262), (1010, 318)], "#C77DB0"),
    ([(1010, 318), (1180, 262), (1420, 236), (1330, 270), (1110, 330)], "#E58FA6"),
    ([(1150, 360), (1330, 300), (1560, 290), (1440, 330), (1230, 372)], "#E58FA6"),
    ([(1230, 372), (1440, 330), (1600, 334), (1600, 352), (1380, 380)], "#F2B1A0"),
    ([(220, 330), (360, 296), (470, 300), (380, 322), (260, 342)], "#C77DB0"),
    ([(110, 400), (260, 372), (380, 378), (300, 396), (150, 412)], "#E58FA6"),
]:
    poly(pts, c)

add('<g fill="#F3D9A4">') if not G else None
for x, y, r in [] if G else [(140, 60, 2.5), (330, 120, 2), (520, 44, 3), (690, 150, 2), (1010, 70, 2.5), (1180, 140, 2), (1350, 52, 3),
                (1500, 118, 2), (60, 190, 2), (1560, 210, 2), (880, 34, 2), (760, 96, 1.6), (260, 220, 1.6), (1440, 180, 1.6)]:
    add(f'<path d="M{x} {y-r*1.6}L{x+r} {y}L{x} {y+r*1.6}L{x-r} {y}Z"/>')
add('</g>') if not G else None

# ---------- Faceted trees ----------
def tree(cx, cy, r, n=9, greens=("#2F8F55", "#237A4B", "#1D6A40", "#175A36"), squash=1.0, trunk=True):
    if trunk:
        poly([(cx - 7, cy + r * 0.5), (cx + 7, cy + r * 0.5), (cx + 9, GROUND + 30), (cx - 9, GROUND + 30)], "#4E3324")
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n + random.uniform(-0.15, 0.15)
        rr = r * random.uniform(0.82, 1.08)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a) * squash))
    c = (cx + r * 0.1, cy + r * 0.05)
    for i in range(n):
        p, q = pts[i], pts[(i + 1) % n]
        mid = math.atan2((p[1] + q[1]) / 2 - c[1], (p[0] + q[0]) / 2 - c[0])
        # Light from the upper left: facets facing that way are lighter.
        light = math.cos(mid - math.radians(-130))
        shade = greens[0] if light > 0.45 else greens[1] if light > -0.1 else greens[2] if light > -0.6 else greens[3]
        poly([c, p, q], shade)

if G and G.get("beams"):
    # Floodlight beams rising from behind the towers into the night sky, fading as they climb
    vgrad("beam", [(0, "#FFE2A8", 0), (0.35, "#FFE2A8", 0.55), (1, "#FFE2A8", 1)], 0, 300)
    add(f'<g opacity="{G["beams"]}" filter="url(#soft)" style="mix-blend-mode:screen">')
    for bx, lean in ((632, -150), (968, 150)):
        poly([(bx - 10, 300), (bx + 10, 300), (bx + lean + 60, -20), (bx + lean - 30, -20)], "url(#beam)")
    add("</g>")

# Background trees behind the wings
DEPTH = 1.0
tree(1235, 470, 70, greens=("#246E48", "#1D6040", "#175236", "#12462E"), trunk=False)
tree(1305, 500, 58, greens=("#246E48", "#1D6040", "#175236", "#12462E"), trunk=False)
tree(395, 480, 62, greens=("#246E48", "#1D6040", "#175236", "#12462E"), trunk=False)

# ---------- A neighbouring Romanesque hall at the right edge (as seen beside Royce) ----------
NB, NB_SHADE = "#A8553A", "#8C4530"
DEPTH = 0.8
rect(1380, 470, 220, 125, NB)
poly([(1372, 472), (1470, 410), (1568, 472)], NB)
poly([(1470, 410), (1568, 472), (1470, 472)], NB_SHADE)
poly([(1372, 472), (1470, 410), (1476, 414), (1382, 474)], STONE_SHADE)
poly([(1470, 410), (1568, 472), (1558, 474), (1464, 414)], STONE_SHADE)
add(f'<circle cx="1470" cy="446" r="11" fill="{col(STONE)}"/><circle cx="1470" cy="446" r="7" fill="{col(OPEN)}"/>')
for i, x in enumerate([1396, 1426, 1500, 1530, 1560]):
    arch(x, 488, 14, 30, GLOW if i == 3 else OPEN)
    arch(x, 538, 14, 34, OPEN)
rect(1380, 528, 220, 4, STONE_SHADE)

if G:
    # Haze between the far plane (trees, the neighbouring hall) and Royce: atmospheric depth
    hz = G["haze"][0]
    vgrad("haze", [(0, hz, 0), (0.55, hz, 0.42), (1, hz, 0.18)], 380, 600)
    rect(0, 380, W, 220, "url(#haze)")
    glow(1537, 500, 16, 0.7)

# Royce Hall is traced from a straight-on photo of the east facade (photo pixels, 2310 wide).
# X()/Y() map photo coordinates into the scene: the axis of the building to x = 800, the base of the steps to GROUND.
S = 0.314
def X(xp): return (xp - 1125) * S + 800
def Y(yp): return GROUND - (1405 - yp) * S
LT, RT_END = X(445), X(1800)          # outer edges of the two towers
TOPY = GROUND + 20
# ---------- The quad: lawns and the striped walkway ----------
DEPTH = 0.12
rect(0, GROUND, W, H - GROUND, "#3E9A55")
poly([(0, GROUND + 4), (LT - 20, TOPY), (0, 660)], "#4FB46A")
poly([(W, GROUND + 4), (RT_END + 20, TOPY), (W, 660)], "#348C4C")
poly([(0, 690), (380, 720), (0, 720)], "#348C4C")

def half(y):
    return 112 + (y - TOPY) * (330 / (H - TOPY))

poly([(800 - half(TOPY), TOPY), (800 + half(TOPY), TOPY), (800 + half(H), H), (800 - half(H), H)], "#E8CFA0")
poly([(800, TOPY), (800 + half(TOPY), TOPY), (800 + half(H), H), (800, H)], "#DFC594")
# Brick inlay lines: lengthwise ones run to the centre door; crosswise ones close up as they recede
for f, wdt in ((-0.94, 2.5), (-0.6, 2), (-0.06, 2.2), (0.06, 2.2), (0.6, 2), (0.94, 2.5)):
    t0, t1 = 800 + f * half(TOPY), 800 + f * half(H)
    poly([(t0 - wdt * 0.4, TOPY), (t0 + wdt * 0.4, TOPY), (t1 + wdt * 1.6, H), (t1 - wdt * 1.6, H)], BRICK)
for y in (612, 623, 638, 657, 682, 712):
    th = 1 + (y - TOPY) / 40
    poly([(800 - half(y), y), (800 + half(y), y), (800 + half(y + th), y + th), (800 - half(y + th), y + th)], BRICK)

# ---------- Royce Hall ----------
def R(x0, y0, x1, y1, fill): rect(X(x0), Y(y0), (x1 - x0) * S, (y1 - y0) * S, fill)
def A(x0, y0, x1, y1, fill): arch(X(x0), Y(y0), (x1 - x0) * S, (y1 - y0) * S, fill)
def P(pts, fill): poly([(X(a), Y(b)) for a, b in pts], fill)

def corbels(x0, x1, y, fill=STONE):
    """A corbel table: a stone band with a row of small round arches under it."""
    R(x0, y, x1, y + 22, fill)
    n = max(1, round((x1 - x0) / 34))
    step = (x1 - x0) / n
    for i in range(n):
        A(x0 + i * step + 7, y + 8, x0 + (i + 1) * step - 7, y + 22, BRICK_DARK)

def wing(x0, x1, windows, end_x):
    R(x0, 822, x1, 872, TILE)
    for y in (836, 852):
        R(x0, y, x1, y + 3, "#9A4126")
    R(x0, 868, x1, 878, STONE_SHADE)
    R(x0, 878, x1, 1100, BRICK_WING)
    for cx in windows:  # tall arched windows, each set in a deeper arched recess
        A(cx - 72, 940, cx + 72, 1100, BRICK_SHADE)
        A(cx - 32, 972, cx + 32, 1098, GLOW if cx in (200, 2030) else OPEN)
        R(cx - 2, 990, cx + 2, 1098, "#6B3A20")
    R(x0, 1100, x1, 1110, STONE)
    R(x0, 1110, x1, 1135, BRICK_DARK)
    R(x0, 1135, x1, 1195, BRICK_WING)
    for cx in windows:
        for dx in (-45, 45):
            R(cx + dx - 14, 1150, cx + dx + 14, 1188, OPEN)
    # Cream ground-floor arcade with brick banding
    R(x0, 1195, x1, 1405, STONE_SHADE)
    R(x0, 1218, x1, 1228, BRICK)
    n = int(abs(x1 - x0) // 68)
    for i in range(n):
        ax = x0 + 14 + i * 68
        A(ax, 1262, ax + 50, 1388, OPEN)
    # A plain end bay so the wing finishes cleanly behind the trees
    R(end_x - 40, 800, end_x + 40, 1405, BRICK_SHADE)
    P([(end_x - 46, 802), (end_x, 770), (end_x + 46, 802)], TILE)

DEPTH = 0.42
if G:
    add('<g id="royce">')
wing(-530, 445, (405, 200, 0, -200, -400), -530)
wing(1800, 2780, (1835, 2030, 2230, 2430, 2630), 2780)

def tower(x0, x1, side0, side1, bays, belfry, slits, outer):
    """x0..x1 is the front face; side0..side1 the side face seen beside it."""
    lo, hi = min(x0, side0), max(x1, side1)
    P([(lo - 16, 204), (lo + 6, 178), (hi - 6, 178), (hi + 16, 204)], TILE)
    R(lo - 10, 200, hi + 10, 222, STONE)
    R(side0, 222, side1, 1405, BRICK_SHADE)
    R(x0, 222, x1, 1405, BRICK_LIT)
    # Quoins: cream blocks alternating long and short up both corners
    for i, y in enumerate(range(232, 1380, 58)):
        w = 46 if i % 2 else 26
        R(x0, y, x0 + w, y + 30, STONE)
        R(x1 - w, y, x1, y + 30, STONE)
    for y in (235, 468, 628, 818):
        corbels(x0, x1, y)
    # Lesenes: thin stone strips that split the face into bays (three on the left tower, two on the right)
    for b in bays:
        R(b - 4, 257, b + 4, 1065, STONE_SHADE)
    for xa, xb in belfry:
        A(xa - 12, 282, xb + 12, 428, STONE)
        A(xa, 296, xb, 422, OPEN)
    for cx, ya, yb in slits:
        A(cx - 9, ya, cx + 9, yb, OPEN)
    # Patterned panels low on the tower
    R(x0, 1062, x1, 1074, STONE)
    R(x0, 1098, x1, 1106, STONE)
    R(x0, 1178, x1, 1196, STONE)
    corbels(x0 + 50, x1 - 50, 1200)
    # Two-arch arcade at the foot, framed in stone
    R(outer[0] - 18, 1238, outer[3] + 18, 1405, STONE_SHADE)
    A(outer[0], 1258, outer[1], 1386, OPEN)
    A(outer[2], 1258, outer[3], 1386, OPEN)

# Centre block: the roof behind the gable and its two little chimneys
R(790, 618, 1460, 720, TILE)
for y in (640, 664, 688):
    R(790, y, 1460, y + 4, "#9A4126")
for cx in (1022, 1228):
    R(cx - 18, 596, cx + 18, 626, BRICK_DARK)
    R(cx - 24, 590, cx + 24, 598, STONE_SHADE)

# Left tower: three belfry openings, three bays, slits high on the inner side and low on the outer side, a medallion
tower(445, 735, 735, 800, (490, 570, 650, 730), ((520, 555), (600, 635), (680, 715)),
      ((690, 515, 590), (690, 675, 750), (535, 880, 960), (535, 998, 1062)), (550, 605, 620, 675))
add(f'<circle cx="{X(690):.1f}" cy="{Y(860):.1f}" r="{22 * S:.1f}" fill="{col(STONE)}"/>')
add(f'<circle cx="{X(690):.1f}" cy="{Y(860):.1f}" r="{12 * S:.1f}" fill="{col(BRICK_DARK)}"/>')
P([(690, 1110), (722, 1140), (690, 1170), (658, 1140)], STONE)          # the big diamond
for i in range(4):
    for j in range(2):
        if (i + j) % 2 == 0:
            R(505 + i * 20, 1112 + j * 28, 525 + i * 20, 1140 + j * 28, STONE)  # checker panel

# Right tower: two belfry openings, two bays, slits only low on the inner side, a triangle panel
tower(1520, 1800, 1450, 1520, (1530, 1630, 1750), ((1545, 1592), (1668, 1715)),
      ((1570, 868, 942), (1570, 998, 1066)), (1575, 1630, 1645, 1700))
P([(1660, 1170), (1700, 1112), (1740, 1170)], STONE)                  # the triangle

# Gable with a stone rake and a corbel table under it
P([(782, 728), (1125, 596), (1468, 728)], BRICK)
P([(772, 724), (1125, 586), (1478, 724), (1478, 742), (1125, 604), (772, 742)], STONE)
R(790, 728, 1460, 1040, BRICK)
for i in range(1, 10):
    t = i / 10
    for side in (-1, 1):
        cx = 1125 + side * (343 * t)
        cy = 604 + 132 * t + 10
        A(cx - 10, cy, cx + 10, cy + 16, BRICK_DARK)

# Upper loggia: three big arches, the middle one springing higher; a tall window inside each
for (ox0, ox1, top), wx in (((808, 1002, 790), 922), ((1028, 1222, 712), 1125), ((1248, 1442, 790), 1328)):
    A(ox0, top, ox1, 1040, STONE)
    A(ox0 + 16, top + 18, ox1 - 16, 1040, OPEN)
    A(wx - 42, 888, wx + 42, 1036, "#F2B655")
    R(wx - 2, 900, wx + 2, 1036, OPEN)
    R(wx - 42, 960, wx + 42, 964, OPEN)
for x0, x1 in ((788, 812), (998, 1032), (1218, 1252), (1438, 1462)):
    R(x0, 800, x1, 1040, STONE)

# The band between the floors, with the corbel table and the inscription
R(790, 1040, 1460, 1125, STONE)
corbels(800, 1450, 1044, STONE_SHADE)
R(1052, 1074, 1198, 1082, STONE_SHADE)

# Ground floor: cream stone with light brick banding, three equal arched portals
R(790, 1125, 1460, 1405, STONE)
for y in (1180, 1250, 1320):
    R(790, y, 1460, y + 10, "#D9B98C")
for x0 in (808, 1032, 1258):
    x1 = x0 + 186
    A(x0 - 6, 1122, x1 + 6, 1405, STONE_SHADE)
    A(x0 + 16, 1142, x1 - 16, 1405, OPEN)
    cx = (x0 + x1) / 2
    for dx in (-30, 0, 30):
        A(cx + dx - 10, 1172, cx + dx + 10, 1226, GLOW)
    P([(cx - 46, 1300), (cx, 1262), (cx + 46, 1300)], STONE_SHADE)
    R(cx - 38, 1300, cx + 38, 1405, STONE_SHADE)
    R(cx - 28, 1312, cx + 28, 1405, "#7A4524")
    add(f'<circle cx="{X(cx):.1f}" cy="{Y(1250):.1f}" r="{9 * S:.1f}" fill="{GLOW}"/>')

# Wide steps
R(762, 1405, 1488, 1416, STONE)
R(752, 1416, 1498, 1430, STONE_SHADE)
R(742, 1430, 1508, 1446, "#DCC08C")

if G:
    add("</g>")
    # Light on the hall: cooler and darker toward the ground (the facade faces away from the sunset),
    # warm uplight washing up the towers and the centre from below. Clipped to the building's shape.
    defs.append('<mask id="m-royce" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="720">'
                '<use href="#royce" filter="url(#white)"/></mask>')
    vgrad("royce-shade", [(0, "#9DB4E6", 0.16), (0.45, NIGHT, G["shade"] * 0.35), (1, NIGHT, G["shade"])], 190, 590)
    add('<g mask="url(#m-royce)">')
    rect(0, 180, W, 420, "url(#royce-shade)")
    for cx, rx, ry, k in ((X(590), 120, 420, 1.0), (X(1660), 120, 420, 1.0), (800, 240, 230, 0.8), (X(0), 200, 110, 0.45), (X(2250), 200, 110, 0.45)):
        add(f'<ellipse cx="{cx:.1f}" cy="590" rx="{rx}" ry="{ry}" fill="url(#uplight)" opacity="{min(1, G["uplight"] * k):.2f}" style="mix-blend-mode:screen"/>')
    add("</g>")
    # Glow from the lit openings
    for cx in (901, 1125, 1351):
        glow(X(cx), Y(1205), 30)
    for wx in (922, 1125, 1328):
        glow(X(wx), Y(962), 26, 0.85)
    for cx in (200, 2030):
        glow(X(cx), Y(1035), 20, 0.7)
    # Warm spill from the doors across the steps and down the walkway
    add(f'<ellipse cx="800" cy="{GROUND + 8}" rx="250" ry="26" fill="url(#glow)" opacity="{0.4 * G["glow"]:.2f}" style="mix-blend-mode:screen"/>')
DEPTH = 0.25

# Low hedges along the wings, and the rounded shrubs in front of each tower
for x0, x1 in ((-530, 380), (1880, 2780)):
    P([(x0, 1440), (x0 + 10, 1385), (x1 - 10, 1385), (x1, 1440)], "#1F6B40")
    P([(x0 + 10, 1385), (x1 - 10, 1385), (x1 - 16, 1400), (x0 + 16, 1400)], "#2E8B57")
for x0, x1 in ((390, 735), (1520, 1870)):
    m = (x0 + x1) / 2
    P([(x0, 1445), (x0 + 30, 1395), (m - 60, 1368), (m + 60, 1368), (x1 - 30, 1395), (x1, 1445)], "#2B7A4A")
    P([(x0 + 30, 1395), (m - 60, 1368), (m, 1380), (x0 + 60, 1410)], "#3E9A55")

if G:
    # Low mist lying on the lawn at the foot of the building
    vgrad("mist", [(0, G["haze"][0], 0), (0.5, G["haze"][0], G["mist"]), (1, G["haze"][0], 0)], 555, 618)
    rect(0, 555, W, 63, "url(#mist)")
DEPTH = 0.1
# Lamp posts with blue and gold banners, either side of the walkway
for x, flip in ((X(128), -1), (X(2065), 1)):
    rect(x - 2.5, 520, 5, TOPY + 4 - 520, "#1B2A3A")
    add(f'<circle cx="{x}" cy="516" r="7" fill="{GLOW}"/>')
    if G:
        glow(x, 516, 30)
    rect(x - 5, 508, 10, 3, "#1B2A3A")
    bx = x + (3 if flip > 0 else -17)
    rect(bx, 532, 14, 30, "#2774AE")
    rect(bx, 552, 14, 6, "#FFD100")

# ---------- The Dickson fountain, front left ----------
FX, FY = 330, 632
DEPTH = 0.0
if G:
    # Soft shadows of the trees, falling away from the light (upper left)
    add(f'<g fill="{NIGHT}" opacity="0.38" filter="url(#blur12)">')
    for cx, r in ((120, 120), (250, 64), (1318, 64), (1452, 92)):
        add(f'<ellipse cx="{cx + r * 0.45:.0f}" cy="{GROUND + 30}" rx="{r * 0.95:.0f}" ry="11"/>')
    add("</g>")
tree(120, 452, 120, n=11)
tree(250, 520, 64)
# A low, wide basin: front wall, rim, water
poly([(FX - 92, FY - 6), (FX + 92, FY - 6), (FX + 84, FY + 14), (FX - 84, FY + 14)], STONE_SHADE)
poly([(FX - 96, FY - 6), (FX - 72, FY - 15), (FX + 72, FY - 15), (FX + 96, FY - 6), (FX + 72, FY + 3), (FX - 72, FY + 3)], STONE)
poly([(FX - 80, FY - 6), (FX - 60, FY - 12), (FX + 60, FY - 12), (FX + 80, FY - 6), (FX + 60, FY), (FX - 60, FY)], "#5FA3D9")
poly([(FX - 80, FY - 6), (FX + 80, FY - 6), (FX + 60, FY), (FX - 60, FY)], "#4F93CB")
# A modest spray, well under the height of the trees beside it: a short centre jet
# with two veils arcing back down into the basin
for pts, c in [
    ([(FX - 10, FY - 47), (FX - 32, FY - 40), (FX - 50, FY - 8), (FX - 40, FY - 8), (FX - 24, FY - 33)], "#7AAAD9"),
    ([(FX + 10, FY - 47), (FX + 32, FY - 40), (FX + 50, FY - 8), (FX + 40, FY - 8), (FX + 24, FY - 33)], "#6E9FD0"),
]:
    poly(pts, c)
poly([(FX - 5, FY - 7), (FX - 4, FY - 40), (FX - 15, FY - 48), (FX - 7, FY - 54), (FX, FY - 49), (FX + 7, FY - 54),
      (FX + 15, FY - 48), (FX + 4, FY - 40), (FX + 5, FY - 7)], "#CFE6F7")
poly([(FX, FY - 49), (FX + 7, FY - 54), (FX + 15, FY - 48), (FX + 4, FY - 40), (FX + 5, FY - 7), (FX, FY - 7)], "#A9CDEB")
for x, y, r in [(FX - 58, FY - 22, 2.5), (FX + 58, FY - 20, 2.5), (FX - 22, FY - 58, 2), (FX + 24, FY - 56, 2)]:
    poly([(x, y - r * 1.6), (x + r, y), (x, y + r * 1.6), (x - r, y)], "#CFE6F7")

# Right-hand tree in front of the neighbouring hall
tree(1318, 528, 64)
tree(1452, 520, 92, n=10)

# ---------- The game's gold pin, pushed into the lawn (flat version only: the lit hero leaves it to the interface) ----------
PX, PY = 1130, 680
if G:
    out_pin_start = len(out)
poly([(PX - 24, PY + 2), (PX, PY - 4), (PX + 24, PY + 2), (PX, PY + 7)], "#1D6A40")
add(f'<path d="M{PX} {PY}C{PX-18} {PY-24} {PX-32} {PY-40} {PX-32} {PY-60}A32 32 0 0 1 {PX+32} {PY-60}C{PX+32} {PY-40} {PX+18} {PY-24} {PX} {PY}Z" '
    f'fill="#FFD100" stroke="{NIGHT}" stroke-width="5" stroke-linejoin="round"/>')
add(f'<circle cx="{PX}" cy="{PY-60}" r="11" fill="{NIGHT}"/>')

# ---------- Night foreground so the scene sinks into the page ----------
if G:
    del out[out_pin_start:]
    # A soft fade into the page colour instead of a jagged band, so the scene has no bottom edge
    vgrad("fade", [(0, NIGHT, 0), (0.3, NIGHT, 0.3), (0.62, NIGHT, 0.78), (0.85, NIGHT, 0.96), (1, NIGHT, 1)], 596, 720)
    rect(0, 596, W, 124, "url(#fade)")
else:
    poly([(0, 704), (200, 694), (420, 706), (640, 696), (860, 706), (1080, 694), (1300, 706), (1600, 698), (1600, 720), (0, 720)], NIGHT)

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" '
    f'aria-label="Royce Hall at dusk, seen from the quad walkway, with the Dickson fountain on the left">\n'
    "<!-- BruinGuessr campus scene. Generated by scripts/build-campus-scene.py; edit that, not this file. -->\n"
    + (f"<defs>{''.join(defs)}</defs>\n" if defs else "")
    + "\n".join(out) + "\n</svg>\n"
)
open(sys.argv[1], "w").write(svg)
