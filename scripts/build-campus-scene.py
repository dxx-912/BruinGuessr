"""Generates public/art/campus-scene.svg: Royce Hall from the quad walkway, flat geometric style."""
import math, random, sys

random.seed(7)
W, H = 1600, 720
GROUND = 585
out = []
add = out.append

def poly(pts, fill, extra=""):
    add(f'<path d="M{" L".join(f"{x:.1f} {y:.1f}" for x, y in pts)}Z" fill="{fill}"{extra}/>')

def rect(x, y, w, h, fill, extra=""):
    add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" fill="{fill}"{extra}/>')

def arch(x, y, w, h, fill):
    """Round-headed opening: x,y top-left of its box."""
    r = w / 2
    add(f'<path d="M{x:.1f} {y+h:.1f}V{y+r:.1f}A{r:.1f} {r:.1f} 0 0 1 {x+w:.1f} {y+r:.1f}V{y+h:.1f}Z" fill="{fill}"/>')

# Palette (DESIGN.md)
NIGHT = "#06182B"
BRICK_LIT, BRICK, BRICK_WING, BRICK_SHADE, BRICK_DARK = "#CB6440", "#B9472A", "#C25A37", "#963D23", "#A84A2C"
OPEN = "#3A1A12"
STONE, STONE_SHADE = "#EBD3A3", "#CDB07E"
GLOW = "#FFC75A"
TILE = "#B5502E"

# ---------- Sky ----------
rect(0, 0, W, H, NIGHT)
for y, c in [(150, "#0B2742"), (235, "#123660"), (305, "#1B4C82"), (365, "#2A62A0"), (420, "#4A74B4"), (470, "#7B86C2"), (515, "#A795C6")]:
    rect(0, y, W, H - y, c)

# Pink cloud shards streaking up to the right, as on an evening over the quad
for pts, c in [
    ([(930, 330), (1080, 250), (1260, 210), (1180, 262), (1010, 318)], "#C77DB0"),
    ([(1010, 318), (1180, 262), (1420, 236), (1330, 270), (1110, 330)], "#E58FA6"),
    ([(1150, 360), (1330, 300), (1560, 290), (1440, 330), (1230, 372)], "#E58FA6"),
    ([(1230, 372), (1440, 330), (1600, 334), (1600, 352), (1380, 380)], "#F2B1A0"),
    ([(220, 330), (360, 296), (470, 300), (380, 322), (260, 342)], "#C77DB0"),
    ([(110, 400), (260, 372), (380, 378), (300, 396), (150, 412)], "#E58FA6"),
]:
    poly(pts, c)

add('<g fill="#F3D9A4">')
for x, y, r in [(140, 60, 2.5), (330, 120, 2), (520, 44, 3), (690, 150, 2), (1010, 70, 2.5), (1180, 140, 2), (1350, 52, 3),
                (1500, 118, 2), (60, 190, 2), (1560, 210, 2), (880, 34, 2), (760, 96, 1.6), (260, 220, 1.6), (1440, 180, 1.6)]:
    add(f'<path d="M{x} {y-r*1.6}L{x+r} {y}L{x} {y+r*1.6}L{x-r} {y}Z"/>')
add('</g>')

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

# Background trees behind the wings
tree(1235, 470, 70, greens=("#246E48", "#1D6040", "#175236", "#12462E"), trunk=False)
tree(1305, 500, 58, greens=("#246E48", "#1D6040", "#175236", "#12462E"), trunk=False)
tree(395, 480, 62, greens=("#246E48", "#1D6040", "#175236", "#12462E"), trunk=False)

# ---------- A neighbouring Romanesque hall at the right edge (as seen beside Royce) ----------
NB, NB_SHADE = "#A8553A", "#8C4530"
rect(1380, 470, 220, 125, NB)
poly([(1372, 472), (1470, 410), (1568, 472)], NB)
poly([(1470, 410), (1568, 472), (1470, 472)], NB_SHADE)
poly([(1372, 472), (1470, 410), (1476, 414), (1382, 474)], STONE_SHADE)
poly([(1470, 410), (1568, 472), (1558, 474), (1464, 414)], STONE_SHADE)
add(f'<circle cx="1470" cy="446" r="11" fill="{STONE}"/><circle cx="1470" cy="446" r="7" fill="{OPEN}"/>')
for i, x in enumerate([1396, 1426, 1500, 1530, 1560]):
    arch(x, 488, 14, 30, GLOW if i == 3 else OPEN)
    arch(x, 538, 14, 34, OPEN)
rect(1380, 528, 220, 4, STONE_SHADE)

# Royce Hall is traced from a straight-on photo of the east facade (photo pixels, 2310 wide).
# X()/Y() map photo coordinates into the scene: the axis of the building to x = 800, the base of the steps to GROUND.
S = 0.314
def X(xp): return (xp - 1125) * S + 800
def Y(yp): return GROUND - (1405 - yp) * S
LT, RT_END = X(445), X(1800)          # outer edges of the two towers
TOPY = GROUND + 20
# ---------- The quad: lawns and the striped walkway ----------
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
add(f'<circle cx="{X(690):.1f}" cy="{Y(860):.1f}" r="{22 * S:.1f}" fill="{STONE}"/>')
add(f'<circle cx="{X(690):.1f}" cy="{Y(860):.1f}" r="{12 * S:.1f}" fill="{BRICK_DARK}"/>')
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

# Low hedges along the wings, and the rounded shrubs in front of each tower
for x0, x1 in ((-530, 380), (1880, 2780)):
    P([(x0, 1440), (x0 + 10, 1385), (x1 - 10, 1385), (x1, 1440)], "#1F6B40")
    P([(x0 + 10, 1385), (x1 - 10, 1385), (x1 - 16, 1400), (x0 + 16, 1400)], "#2E8B57")
for x0, x1 in ((390, 735), (1520, 1870)):
    m = (x0 + x1) / 2
    P([(x0, 1445), (x0 + 30, 1395), (m - 60, 1368), (m + 60, 1368), (x1 - 30, 1395), (x1, 1445)], "#2B7A4A")
    P([(x0 + 30, 1395), (m - 60, 1368), (m, 1380), (x0 + 60, 1410)], "#3E9A55")

# Lamp posts with blue and gold banners, either side of the walkway
for x, flip in ((X(128), -1), (X(2065), 1)):
    rect(x - 2.5, 520, 5, TOPY + 4 - 520, "#1B2A3A")
    add(f'<circle cx="{x}" cy="516" r="7" fill="{GLOW}"/>')
    rect(x - 5, 508, 10, 3, "#1B2A3A")
    bx = x + (3 if flip > 0 else -17)
    rect(bx, 532, 14, 30, "#2774AE")
    rect(bx, 552, 14, 6, "#FFD100")

# ---------- The Dickson fountain, front left ----------
FX, FY = 330, 632
tree(120, 452, 120, n=11)
tree(250, 520, 64)
poly([(FX - 70, FY), (FX - 50, FY - 9), (FX + 50, FY - 9), (FX + 70, FY), (FX + 50, FY + 9), (FX - 50, FY + 9)], STONE)
poly([(FX - 70, FY), (FX + 70, FY), (FX + 50, FY + 9), (FX - 50, FY + 9)], STONE_SHADE)
poly([(FX - 56, FY - 1), (FX - 42, FY - 6), (FX + 42, FY - 6), (FX + 56, FY - 1), (FX + 42, FY + 3), (FX - 42, FY + 3)], "#5FA3D9")
# The jet: a tall plume, widest two thirds of the way up, with thin veils of spray falling back to the basin
for pts, c in [
    ([(FX - 15, 470), (FX - 30, 520), (FX - 40, FY - 6), (FX - 26, FY - 6), (FX - 20, 520)], "#7AAAD9"),
    ([(FX + 15, 470), (FX + 30, 520), (FX + 40, FY - 6), (FX + 26, FY - 6), (FX + 20, 520)], "#6E9FD0"),
]:
    poly(pts, c)
poly([(FX - 9, FY - 2), (FX - 13, 520), (FX - 17, 466), (FX - 13, 430), (FX - 3, 392), (FX + 4, 396),
      (FX + 14, 432), (FX + 17, 468), (FX + 13, 520), (FX + 9, FY - 2)], "#CFE6F7")
poly([(FX + 1, 393), (FX + 4, 396), (FX + 14, 432), (FX + 17, 468), (FX + 13, 520), (FX + 9, FY - 2), (FX + 1, FY - 2)], "#A9CDEB")
poly([(FX - 13, 430), (FX - 3, 392), (FX - 4, 440), (FX - 17, 466)], "#EAF4FC")
for pts, c in [
    ([(FX - 12, FY - 4), (FX - 50, FY - 8), (FX - 26, FY - 20)], "#CFE6F7"),
    ([(FX + 12, FY - 4), (FX + 50, FY - 8), (FX + 26, FY - 20)], "#A9CDEB"),
]:
    poly(pts, c)

# Right-hand tree in front of the neighbouring hall
tree(1318, 528, 64)
tree(1452, 520, 92, n=10)

# ---------- The game's gold pin, pushed into the lawn ----------
PX, PY = 1130, 680
poly([(PX - 24, PY + 2), (PX, PY - 4), (PX + 24, PY + 2), (PX, PY + 7)], "#1D6A40")
add(f'<path d="M{PX} {PY}C{PX-18} {PY-24} {PX-32} {PY-40} {PX-32} {PY-60}A32 32 0 0 1 {PX+32} {PY-60}C{PX+32} {PY-40} {PX+18} {PY-24} {PX} {PY}Z" '
    f'fill="#FFD100" stroke="{NIGHT}" stroke-width="5" stroke-linejoin="round"/>')
add(f'<circle cx="{PX}" cy="{PY-60}" r="11" fill="{NIGHT}"/>')

# ---------- Night foreground so the scene sinks into the page ----------
poly([(0, 704), (200, 694), (420, 706), (640, 696), (860, 706), (1080, 694), (1300, 706), (1600, 698), (1600, 720), (0, 720)], NIGHT)

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" '
    f'aria-label="Royce Hall at dusk, seen from the quad walkway, with the Dickson fountain on the left">\n'
    "<!-- BruinGuessr campus scene. Generated by scripts/build-campus-scene.py; edit that, not this file. -->\n"
    + "\n".join(out) + "\n</svg>\n"
)
open(sys.argv[1], "w").write(svg)
