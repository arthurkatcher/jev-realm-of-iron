# Build script used to cut the sprites (run once; originals are now kept in assets/{wyrmsun,oga,widelands}/src/,
# the Wyrmsun files renamed as in wyrmsun/MANIFEST.txt; paths below are the paths used at the time).
# Cut, scale and recolour the chosen free sprites into the game's asset folders.
import colorsys, os, shutil
from PIL import Image

G = os.path.expanduser('~/warcraft_game/assets')
C = G + '/_candidates'
S = '/tmp/claude-1000/wg/ulpc/stage'
WL = '/tmp/claude-1000/wg/ulpc/wl'
for d in ['wyrmsun', 'widelands', 'oga']: os.makedirs(G + '/' + d, exist_ok=True)


def cell(im, col, row, w, h=None):
    h = h or w
    return im.crop((col * w, row * h, col * w + w, row * h + h))


def crisp(im):
    """binary alpha, so downscaled sprites stay hard-edged"""
    im = im.convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 110 else (0, 0, 0, 0)
    return im


def fit(frames, maxw, maxh, pad=0, sharp=True):
    """Crop a list of frames to their union bbox and scale them (down only) to fit maxw x maxh. Returns frames."""
    frames = [f.convert('RGBA') for f in frames]
    boxes = [f.getbbox() for f in frames if f.getbbox()]
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    frames = [f.crop((x0, y0, x1, y1)) for f in frames]
    k = min(1, maxw / (x1 - x0), maxh / (y1 - y0))
    if k < 1: frames = [f.resize((max(1, round(f.width * k)), max(1, round(f.height * k))), Image.LANCZOS) for f in frames]
    if sharp: frames = [crisp(f) for f in frames]
    if pad: frames = [padded(f, pad) for f in frames]
    return frames


def padded(f, p):
    c = Image.new('RGBA', (f.width + 2 * p, f.height + 2 * p)); c.alpha_composite(f, (p, p)); return c


def strip(frames, name):
    w, h = max(f.width for f in frames), max(f.height for f in frames)
    c = Image.new('RGBA', (w * len(frames), h))
    for i, f in enumerate(frames): c.alpha_composite(f, (i * w + (w - f.width) // 2, h - f.height))
    c.save(name); print(name, c.size, len(frames))


def recolour(im, test, fn):
    im = im.convert('RGBA'); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a: continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if test(h * 360, s, l, r, g, b):
                px[x, y] = fn(h * 360, s, l, r, g, b) + (a,)
    return im


def hls(h, l, s): return tuple(round(v * 255) for v in colorsys.hls_to_rgb(h / 360, l, s))


def open_(p): return Image.open(p).convert('RGBA')


# ------------------------------------------------------------------ buildings (Wyrmsun, frame 0 used by building())
for n in ['h_stables', 'h_stables_shadow', 'o_stables', 'h_magetower', 'h_magetower_shadow', 'h_foundry', 'h_foundry_shadow', 'o_foundry', 'o_inventor', 'o_inventor_shadow']:
    shutil.copy(S + '/' + n + '.png', G + '/wyrmsun/' + n + '.png')
for n in ['h_inventor', 'h_inventor_shadow']:          # 128 px gnome workshop -> 96 px frames for a 3x3 footprint
    im = open_(S + '/' + n + '.png')
    fr = [cell(im, 0, r, 128).resize((96, 96), Image.LANCZOS) for r in range(2)]
    out = Image.new('RGBA', (96, 192))
    for i, f in enumerate(fr): out.alpha_composite(crisp(f) if 'shadow' not in n else f, (0, i * 96))
    out.save(G + '/wyrmsun/' + n + '.png')
cell(open_(S + '/o_roost.png'), 0, 0, 96).save(G + '/wyrmsun/o_roost.png')   # spider pit, first variant

# ------------------------------------------------------------------ oil refineries (Widelands, GPL-2.0+)
def refinery_h():
    im = open_(C + '/widelands/atlanteans_smelting_works_idle_1.png')
    # molten metal in the vats -> black oil; the blue canopy -> Wyrmsun purple so the team-colour pass recolours it
    im = recolour(im, lambda h, s, l, *_: (h < 40 or h > 345) and s > 0.45 and l > 0.25, lambda h, s, l, *_: hls(230, 0.06 + l * 0.18, 0.25))
    im = recolour(im, lambda h, s, l, *_: 205 <= h <= 255 and s > 0.25, lambda h, s, l, *_: hls(290, l, s))
    c = Image.new('RGBA', (96, 96)); c.alpha_composite(im.resize((87, 96), Image.LANCZOS), (5, 0))
    crisp(c).save(G + '/widelands/h_refinery.png')
def refinery_o():
    im = open_(WL + '/barbarians_brewery.png')
    # the water in the kettle -> black oil
    im = recolour(im, lambda h, s, l, *_: 160 <= h <= 230 and l > 0.3, lambda h, s, l, *_: hls(230, 0.05 + (l - 0.3) * 0.3, 0.3))
    c = Image.new('RGBA', (96, 96)); c.alpha_composite(im.resize((96, 89), Image.LANCZOS), (0, 5))
    crisp(c).save(G + '/widelands/o_refinery.png')
refinery_h(); refinery_o()

# ------------------------------------------------------------------ ships: one north-facing hull each (the game rotates it)
def ship(src, cw, name, maxh, col=0, row=0, ch=None, pre=None):
    im = open_(src)
    f = cell(im, col, row, cw, ch)
    if pre: f = pre(f)
    strip(fit([f], maxh, maxh), G + '/' + name)
red2purple = lambda im: recolour(im, lambda h, s, l, *_: (h < 15 or h > 340) and s > 0.45, lambda h, s, l, *_: hls(290, l, s))
ship(S + '/ship_destroyer.png', 72, 'wyrmsun/ship_destroyer.png', 62)
ship(S + '/ship_troll_destroyer.png', 100, 'wyrmsun/ship_troll_destroyer.png', 64)
ship(S + '/ship_battleship.png', 72, 'wyrmsun/ship_battleship.png', 70)
ship(C + '/wyrmsun/units_aether_warship.png', 108, 'wyrmsun/ship_juggernaught.png', 74)
ship(S + '/ship_tanker.png', 72, 'wyrmsun/ship_tanker.png', 50, pre=red2purple)
ship(S + '/ship_transport.png', 72, 'wyrmsun/ship_transport.png', 56)
ship(S + '/ship_orc_transport.png', 100, 'wyrmsun/ship_orc_transport.png', 58)
# Gnomish Submarine: the CC0 modern sub, re-tinted to riveted brass
sub = open_(C + '/oga/seawarfare_display.png').crop((69, 0, 103, 150))
sub = recolour(sub, lambda *a: True, lambda h, s, l, *_: hls(38, min(0.8, 0.12 + l * 0.95), 0.55))
sub = fit([sub], 999, 999)[0].resize((20, 46), Image.LANCZOS)   # stubbier than the modern hull
strip([crisp(sub)], G + '/oga/ship_submarine.png')
turtle = open_(C + '/oga/Turtle_TopDown_64x64_SpriteSheet_powerup_white_bg.png')
strip(fit([cell(turtle, 0, 0, 64)], 50, 50), G + '/oga/ship_turtle.png')

# ------------------------------------------------------------------ flyers: right-facing flight frames
zep = open_(S + '/zeppelin.png')
strip(fit([cell(zep, 2, 0, 114)], 72, 60), G + '/wyrmsun/fly_zeppelin.png')
wk = open_(C + '/wyrmsun/units_aether_workship.png')     # Gnomish Flying Machine: the CC0 aether workship (winged skiff, prop at the bow)
strip(fit([cell(wk, 2, 0, 108)], 58, 46), G + '/wyrmsun/fly_machine.png')
dr = open_(C + '/oga/flying_dragon-red-RGB.png')
strip(fit([cell(dr, c, 1, 191, 161) for c in range(3)], 76, 64), G + '/oga/fly_dragon.png')
ob = open_(C + '/oga/observer-48x64.png')
strip(fit([cell(ob, c, 2, 48, 64) for c in range(3)], 26, 30), G + '/oga/fly_eye.png')

# ------------------------------------------------------------------ effects
def fxstrip(src, cw, ch, picks, size, name, cols):
    im = open_(src)
    fr = [cell(im, p % cols, p // cols, cw, ch).resize((size, size), Image.LANCZOS) for p in picks]
    c = Image.new('RGBA', (size * len(fr), size))
    for i, f in enumerate(fr): c.alpha_composite(f, (i * size, 0))
    c.save(G + '/' + name); print(name, c.size)
fxstrip(S + '/fx_explosion.png', 64, 64, [1, 3, 5, 8], 32, 'wyrmsun/fx_explosion.png', 5)
fxstrip(S + '/fx_siege_impact.png', 48, 48, [0, 1, 3, 4], 32, 'wyrmsun/fx_siege_impact.png', 5)
fxstrip(S + '/fx_lightning_impact.png', 48, 50, [0, 1, 2, 3], 32, 'wyrmsun/fx_lightning_impact.png', 4)
fxstrip(C + '/oga/codemanu/19_freezing_spritesheet.png', 100, 100, [8, 20, 34, 50], 32, 'oga/fx_ice.png', 10)
fxstrip(C + '/oga/codemanu/17_felspell_spritesheet.png', 100, 100, [10, 25, 40, 55], 32, 'oga/fx_rot.png', 10)
for n in ['fx_big_fire', 'fx_small_fire']: shutil.copy(S + '/' + n + '.png', G + '/wyrmsun/' + n + '.png')
# cannon ball and catapult stone: centred in the 20x8 projectile box
for src, n, fr in [('fx_cannon_ball', 'fx_cannon', 1), ('fx_cannon_ball', 'fx_bigcannon', 2), ('fx_rock', 'fx_boulder', 2)]:
    f = cell(open_(S + '/' + src + '.png'), 0, fr, 32).crop(cell(open_(S + '/' + src + '.png'), 0, fr, 32).getbbox())
    c = Image.new('RGBA', (20, 8)); c.alpha_composite(f, ((20 - f.width) // 2, max(0, (8 - f.height) // 2))); c.save(G + '/wyrmsun/' + n + '.png')
# Runes: a Wyrmsun glyph, 16 px, glowing orange
gly = cell(open_(S + '/fx_glyph.png'), 0, 0, 32)
gly = recolour(gly, lambda *a: True, lambda h, s, l, *_: hls(22, min(0.75, l * 1.3), 0.95)).resize((16, 16), Image.LANCZOS)
gly.save(G + '/wyrmsun/fx_rune.png')
# Whirlwind: the CC0 swirl ring squashed into stacked ellipses, turning a quarter per frame -> 4 funnel frames of 56 px
wh = open_(C + '/oga/whirl1.png')
fr = Image.new('RGBA', (56 * 4, 56))
for k in range(4):
    for i in range(8):
        w = 10 + i * 5.5; ring = wh.rotate(k * 90 + i * 37).resize((round(w), max(3, round(w * 0.32))), Image.LANCZOS)
        fr.alpha_composite(ring, (k * 56 + 28 - ring.width // 2 + round(3 * __import__('math').sin(i * 0.9 + k * 1.6)), 50 - i * 6 - ring.height // 2))
fr.save(G + '/oga/fx_whirlwind.png'); print('whirl ok')
