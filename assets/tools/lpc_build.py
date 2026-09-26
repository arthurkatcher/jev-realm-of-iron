# Build script for the LPC sheets added on 2026-09-26 (paladin, death_knight, skeleton, dwarves, sappers, ogre, ogre_mage).
# Composite new LPC unit sheets (13x21 cells of 64 px, universal layout) from Universal-LPC-Spritesheet layers.
# Layers are fetched from the generator repo at the last commit before the per-animation slicing (universal sheets).
import csv, io, json, os, sys, urllib.request
from PIL import Image

BASE = '/tmp/claude-1000/wg/ulpc'
SHA = open(BASE + '/parent.txt').read().strip()
RAW = 'https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/' + SHA + '/spritesheets/'
CACHE = BASE + '/layers'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-1000/wg/art/lpc_out'
os.makedirs(CACHE, exist_ok=True); os.makedirs(OUT, exist_ok=True)
W, H = 832, 1344
DIRS = ['up', 'left', 'down', 'right']


def layer(path):
    f = CACHE + '/' + path.replace('/', '__')
    if not os.path.exists(f):
        urllib.request.urlretrieve(RAW + path, f)
    return Image.open(f).convert('RGBA')


def universal(path, custom=None):
    """A 832x1344 canvas of the layer. custom: 'slash_128' / 'slash_oversize' (big frames, re-centred into the slash rows)."""
    im = layer(path)
    cv = Image.new('RGBA', (W, H))
    if not custom:
        cv.alpha_composite(im.crop((0, 0, min(W, im.width), min(H, im.height))))
        return cv
    cell = im.height // 4 if custom == 'slash_oversize' or im.height <= 4 * 192 else 128
    if custom == 'slash_128': cell = 128
    if custom == 'slash_oversize': cell = 192
    off = (cell - 64) // 2
    for d in range(4):
        for f in range(6):
            fr = im.crop((f * cell, d * cell, f * cell + cell, d * cell + cell)).crop((off, off, off + 64, off + 64))
            cv.alpha_composite(fr, (f * 64, (12 + d) * 64))
    return cv


def shift_rows(cv, dxs, dy=0):
    """Shift every cell horizontally by dxs[facing], clipped to its own cell."""
    out = Image.new('RGBA', (W, H))
    for r in range(21):
        dx = dxs[r % 4 if r < 20 else 2]
        for c in range(13):
            tmp = Image.new('RGBA', (64, 64)); tmp.paste(cv.crop((c * 64, r * 64, c * 64 + 64, r * 64 + 64)), (dx, dy))
            out.alpha_composite(tmp, (c * 64, r * 64))
    return out


def squash(cv, k, foot=60):
    """Stockier figure: scale every cell vertically by k about the feet line (nearest), width unchanged."""
    out = Image.new('RGBA', (W, H))
    nh = round(64 * k)
    for r in range(21):
        for c in range(13):
            cell = cv.crop((c * 64, r * 64, c * 64 + 64, r * 64 + 64)).resize((64, nh), Image.NEAREST)
            out.alpha_composite(cell, (c * 64, r * 64 + round(foot - foot * k)))
    return out


# unit -> list of (z, path, opts); opts: custom, dx (per-direction shift list), dy
UNITS = {
    'paladin': [
        (5, 'cape/solid_behind/white.png', {}),
        (9, 'weapon/polearm/spear/background/gold.png', {}),
        (10, 'body/bodies/male/light.png', {}),
        (15, 'feet/armour/plate/male/gold.png', {}),
        (20, 'legs/armour/plate/male/gold.png', {}),
        (60, 'torso/armour/plate/male/gold.png', {}),
        (60, 'arms/armour/plate/male/gold.png', {}),
        (62, 'torso/jacket/tabard/male/blue.png', {}),
        (65, 'shoulders/plate/male/gold.png', {}),
        (85, 'cape/solid/female/white.png', {}),
        (100, 'head/heads/human/male/light.png', {}),
        (7, 'shield/crusader/bg/crusader.png', {}),
        (110, 'shield/crusader/fg/male/crusader.png', {}),
        (130, 'hat/helmet/armet/adult/gold.png', {}),
        (140, 'weapon/polearm/spear/foreground/gold.png', {}),
    ],
    'death_knight': [
        (5, 'cape/tattered_behind/blue.png', {}),
        (9, 'weapon/magic/simple/background/simple.png', {}),
        (10, 'body/bodies/skeleton/universal/skeleton.png', {}),
        (20, 'legs/armour/plate/male/iron.png', {}),
        (60, 'torso/armour/plate/male/iron.png', {}),
        (65, 'shoulders/plate/male/iron.png', {}),
        (85, 'cape/tattered/female/blue.png', {}),
        (100, 'head/heads/skeleton/adult/skeleton.png', {}),
        (130, 'hat/cloth/hood/adult/black.png', {}),
        (140, 'weapon/magic/simple/foreground/simple.png', {}),
    ],
    'skeleton': [
        (5, 'cape/tattered_behind/blue.png', {}),
        (8, 'weapon/sword/arming/attack_slash/bg/iron.png', {'custom': 'slash_128'}),
        (9, 'weapon/sword/arming/universal/bg/iron.png', {}),
        (10, 'body/bodies/skeleton/universal/skeleton.png', {}),
        (85, 'cape/tattered/female/blue.png', {}),
        (100, 'head/heads/skeleton/adult/skeleton.png', {}),
        (140, 'weapon/sword/arming/universal/fg/iron.png', {}),
        (150, 'weapon/sword/arming/attack_slash/fg/iron.png', {'custom': 'slash_128'}),
    ],
    'dwarves': [
        (9, 'tools/smash/background/hammer.png', {'custom': 'slash_128'}),
        (10, 'body/bodies/male/light.png', {}),
        (15, 'feet/boots/male/brown.png', {}),
        (20, 'legs/pants/male/brown.png', {}),
        (35, 'torso/clothes/longsleeve/longsleeve/male/blue.png', {}),
        (60, 'torso/armour/leather/male/brown.png', {}),
        (100, 'head/heads/human/male/light.png', {}),
        (135, 'beards/beard/medium/ginger.png', {}),
        (130, 'hat/helmet/nasal/adult/steel.png', {}),
        (140, 'tools/smash/universal/male/hammer.png', {}),
        (150, 'tools/smash/foreground/hammer.png', {'custom': 'slash_128'}),
    ],
    'sappers': [
        (9, 'tools/smash/background/pickaxe.png', {'custom': 'slash_128'}),
        (10, 'body/bodies/male/bright_green.png', {}),
        (15, 'feet/sandals/male/brown.png', {}),
        (20, 'legs/pants/male/brown.png', {}),
        (35, 'torso/clothes/sleeveless/sleeveless/male/blue.png', {}),
        (100, 'head/heads/goblin/adult/bright_green.png', {}),
        (140, 'tools/smash/universal/male/pickaxe.png', {}),
        (150, 'tools/smash/foreground/pickaxe.png', {'custom': 'slash_128'}),
    ],
}
# two-headed ogres: the orc head is drawn twice, split apart per facing (up, left, down, right)
TWO_HEADS = {'up': -5, 'left': -3, 'down': -5, 'right': -3}
def ogre(skin, extra, cape=None, helmet='hat/helmet/horned/adult/iron.png', helm2=None):
    L = [
        (9, 'weapon/blunt/mace/universal_behind/mace.png', {}),
        (9, 'weapon/blunt/mace/attack_slash/behind/mace.png', {'custom': 'slash_oversize'}),
        (10, 'body/bodies/muscular/%s.png' % skin, {}),
        (20, 'legs/pants/muscular/blue.png', {}),
        (25, 'feet/boots/male/walnut.png', {}),
        (100, 'head/heads/orc/male/%s.png' % skin, {'dx': [-5, 3, -5, -3]}),
        (101, 'head/heads/orc/male/%s.png' % skin, {'dx': [5, -3, 5, 3]}),
        (140, 'weapon/blunt/mace/mace.png', {}),
        (150, 'weapon/blunt/mace/attack_slash/mace.png', {'custom': 'slash_oversize'}),
    ] + extra
    if cape: L += [(5, 'cape/%s_behind/%s.png' % cape, {}), (85, 'cape/%s/female/%s.png' % cape, {})]
    if helmet: L += [(130, helmet, {'dx': [-5, 3, -5, -3]})]
    if helm2: L += [(131, helm2, {'dx': [5, -3, 5, 3]})]
    return L
UNITS['ogre'] = ogre('olive', [(65, 'shoulders/plate/male/iron.png', {})], helmet=None)
UNITS['ogre_mage'] = ogre('brown', [(65, 'shoulders/plate/male/gold.png', {}), (70, 'arms/bracers/male/gold.png', {})], cape=('tattered', 'red'), helmet=None)
SQUASH = {'dwarves': 0.78, 'sappers': 0.86}

credits = {}
for row in csv.DictReader(open(BASE + '/CREDITS.csv', encoding='utf-8')):
    credits[row['filename']] = row

only = sys.argv[2:] if len(sys.argv) > 2 else list(UNITS)
manifest = {}
for name in only:
    cv = Image.new('RGBA', (W, H))
    for z, path, o in sorted(UNITS[name], key=lambda t: t[0]):
        try:
            lay = universal(path, o.get('custom'))
        except Exception as e:
            print('MISSING', name, path, e); continue
        if 'dx' in o: lay = shift_rows(lay, o['dx'])
        cv.alpha_composite(lay)
    if name in SQUASH: cv = squash(cv, SQUASH[name])
    cv.save(OUT + '/' + name + '.png')
    manifest[name] = [{'src': 'spritesheets/' + p, 'zPos': z, **({'custom_animation': o['custom']} if 'custom' in o else {}), **({'head_offset_x': o['dx']} if 'dx' in o else {})} for z, p, o in UNITS[name]]
    manifest[name + '_credits'] = [credits.get(p, {'filename': p, 'authors': '?', 'licenses': '?'}) for _, p, _ in UNITS[name]]
    print('built', name)
json.dump(manifest, open(OUT + '/new_manifest.json', 'w'), indent=1)
