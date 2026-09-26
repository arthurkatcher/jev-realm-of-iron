# Command-card icon atlas: 46x38 cells (Warcraft II's icon size), one row of 16 per line.
# Wyrmsun icons (CC0, credits.txt at commit f0330d2a) and Painterly Spell Icons (J. W. Bjerk / eleazzaar, used under CC-BY 3.0).
import json, os
from PIL import Image

W_ICONS = '/tmp/claude-1000/wg/ulpc/icons/'
P_ICONS = '/tmp/claude-1000/wg/ulpc/painterly/all/'
OUT = os.path.expanduser('~/warcraft_game/assets/icons/')
os.makedirs(OUT, exist_ok=True)

WY = {  # atlas name -> Wyrmsun path under graphics/
    'boots': 'gnome/icons/boots_fur', 'shield_h': 'dwarf/icons/shield_2', 'shield_o': 'goblin/icons/wooden_shield',
    'attack_h': 'germanic/icons/short_sword', 'attack_o': 'dwarf/icons/battle_axe',
    'patrol_h': 'germanic/icons/patrol_land', 'patrol_o': 'goblin/icons/patrol_land',
    'hold_h': 'germanic/icons/stand_ground', 'hold_o': 'goblin/icons/stand_ground',
    'harvest': 'icons/commands/harvest', 'return_h': 'germanic/icons/return_goods', 'return_o': 'goblin/icons/return_goods',
    'repair': 'icons/commands/repair', 'build': 'icons/commands/build_basic_structure', 'build2': 'neutral/icons/engineering',
    'attack_ground': 'icons/commands/attack_ground', 'demolish': 'neutral/icons/gunpowder', 'unload': 'neutral/icons/unload',
    'board': 'icons/commands/enter', 'cancel': 'icons/commands/cancel',
    'weapons1_h': 'teuton/icons/spatha', 'weapons2_h': 'goblin/icons/long_sword', 'weapons1_o': 'dwarf/icons/battle_axe', 'weapons2_o': 'dwarf/icons/great_axe',
    'shields1_h': 'icons/items/heater_shield', 'shields2_h': 'dwarf/icons/shield_3', 'shields1_o': 'goblin/icons/rimmed_shield', 'shields2_o': 'goblin/icons/embossed_shield',
    'arrows1_h': 'germanic/icons/arrow', 'arrows2_h': 'icons/items/bodkin_arrow',
    'arrows1_o': 'icons/items/dwarven/bearded_throwing_axe', 'arrows2_o': 'icons/items/dwarven/sharp_throwing_axe',
    'siege1_h': 'dwarf/icons/ballista_bolt_1', 'siege2_h': 'dwarf/icons/ballista_bolt_2',
    'siege1_o': 'icons/technologies/catapult_projectile_sandstone', 'siege2_o': 'icons/technologies/catapult_projectile_granite',
    'cannons1': 'icons/technologies/catapult_projectile_metal', 'cannons2': 'teuton/icons/hand_cannon',
    'hulls1': 'neutral/icons/sailing', 'hulls2': 'icons/commands/anchor',
    'ranger_h': 'icons/units/elven/archer', 'ranger_o': 'icons/units/troll/warrior', 'scouting': 'neutral/icons/scouting',
    'longbow_h': 'neutral/icons/bow_mastery', 'longbow_o': 'neutral/icons/throwing_mastery', 'marksmanship': 'neutral/icons/precise_shot',
    'regeneration': 'neutral/icons/regeneration',
    'u_skeleton': 'icons/units/undead/skeleton', 'u_sappers': 'goblin/icons/gunpowder_infantry',
    'u_dwarves': 'dwarf/icons/thunderer', 'u_knight': 'teuton/icons/ritter', 'u_dragon': 'neutral/icons/wyrm_red_scales',
}
PT = {  # atlas name -> Painterly file (level 1)
    'holy_vision': 'light-sky', 'healing': 'heal-jade', 'exorcism': 'light-air-fire', 'fireball': 'fireball-red', 'slow': 'link-blue',
    'flame_shield': 'shielding-fire', 'invisibility': 'fog-air', 'polymorph': 'wild-jade', 'blizzard': 'ice-blue', 'eye_of_kilrogg': 'evil-eye-red',
    'bloodlust': 'enchant-red', 'runes': 'runes-orange', 'death_coil': 'horror-eerie', 'haste': 'haste-fire', 'raise_dead': 'rip-acid',
    'whirlwind': 'wind-grasp-air', 'unholy_armor': 'protect-eerie', 'death_and_decay': 'fog-acid',
}
cells = []
for k, p in WY.items():
    im = Image.open(W_ICONS + p.replace('/', '__') + '.png').convert('RGBA').crop((0, 0, 46, 38))
    cells.append((k, im))
for k, p in PT.items():
    im = Image.open(P_ICONS + p + '-1.png').convert('RGBA')
    im = im.crop((0, 22, 256, 233)).resize((46, 38), Image.LANCZOS)   # WC2's 46:38 landscape crop of the square painting
    cells.append((k, im))
cols = 16
index = {}
for name, group in [('card_icons', [c for c in cells if c[0] in WY]), ('spell_icons', [c for c in cells if c[0] in PT])]:
    atlas = Image.new('RGBA', (cols * 46, ((len(group) + cols - 1) // cols) * 38))
    for i, (k, im) in enumerate(group):
        atlas.alpha_composite(im, ((i % cols) * 46, (i // cols) * 38)); index[k] = i
    atlas.save(OUT + name + '.png')
print(json.dumps(index, separators=(',', ':')))
json.dump({'wyrmsun': WY, 'painterly': PT}, open('/tmp/claude-1000/wg/art/icons_sources.json', 'w'), indent=1)
