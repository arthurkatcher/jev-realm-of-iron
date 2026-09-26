# Art credits

All art is vendored from free-licensed packs; nothing is loaded from the network.

| Folder | Pack | Author | License | Used for |
|---|---|---|---|---|
| lpc/ | Liberated Pixel Cup characters (composited) | 33 authors, see lpc/CREDITS.md | CC-BY-SA 3.0 (sheets), layers CC-BY-SA/OGA-BY/CC-BY/CC0 | all humanoid units: 4 facings, walk, attack, cast, death |
| wyrmsun/ | Wyrmsun graphics (github.com/Andrettin/Wyrmsun) | Jinn, Exidelo, Kwaliti, see MANIFEST | CC0 | buildings, sites, mine, terrain |
| wyrmsun/ship_*, fly_*, fx_* | Wyrmsun graphics | Jinn, Kwaliti, Mikodrak, StumpyStrust, Cuzco, iDreamRunner | CC0 | ships, flying machine, zeppelin, fire, impacts, runes |
| widelands/ | Widelands (github.com/widelands/widelands) | The Widelands Development Team | GPL-2.0+ | the two oil refineries |
| icons/ | Wyrmsun icons; Painterly Spell Icons | Jinn, Exidelo; J. W. Bjerk (eleazzaar) | CC0; CC-BY 3.0 | command-card icons, per file in icons/CREDITS.md |
| oga/ | OpenGameArt, see below | AntumDeluge, Oiboo, Lowder2, n4, CodeManu | CC-BY 3.0 / CC0 | dragon, eye, turtle, submarine, spell effects |
| wyrmsun/trees.png | Wyrmsun pine tree tileset | b_o | CC-BY-SA 3.0 (dual GPL 2.0) | forest tiles and stumps |
| kenney_pirate/ | Pirate Pack | Kenney (kenney.nl) | CC0 | no longer loaded (was: ships) |
| lpc_siege/ | [LPC] Siege Weapons | bluecarrot16, Herodom | CC-BY 4.0 | ballista, catapult (8 facings) |
| tiny_creatures/ | Tiny Creatures 1.0 | Clint Bellanger | CC0 | no longer loaded (was: dragon) |

Attribution for the CC-BY item: "[LPC] Siege Weapons" by bluecarrot16, https://opengameart.org/content/lpc-siege-weapons
Attribution for the CC-BY-SA tree tileset: pine_tree.png by b_o for Wyrmsun, https://github.com/Andrettin/Wyrmsun (graphics_credits.txt), CC-BY-SA 3.0

The LPC sheets were composited with the Universal LPC Spritesheet Character Generator
(https://github.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator); every layer's author and licence is
listed in lpc/CREDITS.md and the sheets as a whole are distributed under CC-BY-SA 3.0 (lpc/cc-by-sa-3_0.txt).

Every Wyrmsun file used, its original path, author and licence line is listed in wyrmsun/MANIFEST.txt (licence text in
wyrmsun/LICENSE-CC0.txt). Wyrmsun paints the player colour purple; the game recolours that channel to the faction hue.

critters/: "LPC Farm Animals" sheep and pig walk sheets by daneeklu (opengameart.org/content/lpc-farm-animals),
CC-BY 3.0 / GPL 2.0; used for the neutral critters (sheep on the map, the pig for Polymorph on the orc side is not used yet).

## Added 2026-09-26

- **LPC units** (lpc/, CC-BY-SA 3.0): paladin, death_knight, skeleton, dwarves (Demolition Squad), sappers, ogre (now
  two-headed) and ogre_mage were composited from Universal-LPC-Spritesheet layers; every layer's authors, licences and
  source URLs are listed at the end of lpc/CREDITS.md, and the layer list of each sheet is in lpc/manifest.json.
- **Wyrmsun** (wyrmsun/, CC0): stables, ogre mound (troll barracks), gnomish inventor (gnome town hall), goblin
  alchemist (goblin market), mage tower (dwarf academy), foundry (dwarf smithy), metalworks (troll smithy), dragon roost
  (goblin spider pit); all ships but the submarine and turtle; flying machine (aether workship) and zeppelin (aether
  transport); fire, explosion, impact, cannonball, stone and rune effects. Per-file authors in wyrmsun/MANIFEST.txt,
  source: https://github.com/Andrettin/Wyrmsun (graphics/credits.txt at commit f0330d2a).
- **Widelands** (widelands/, GPL-2.0 or later, https://github.com/widelands/widelands, © the Widelands Development
  Team): `h_refinery.png` from `data/tribes/buildings/productionsites/atlanteans/smelting_works/idle_1.png` and
  `o_refinery.png` from `data/tribes/buildings/productionsites/barbarians/brewery/idle_00.png`, scaled to 96 px, the
  molten metal / water recoloured to black oil and the Atlantean canopy recoloured to the team-colour purple. These two
  files (and their originals in widelands/src/) are distributed under the GPL-2.0+ (https://www.gnu.org/licenses/old-licenses/gpl-2.0.html).
- **OpenGameArt** (oga/, originals in oga/src/):
  - `fly_dragon.png`: "Flying Dragon Rework" by AntumDeluge, CC-BY 3.0, https://opengameart.org/content/flying-dragon-rework
    (flying_dragon-red-RGB.png, right-facing row, scaled).
  - `fly_eye.png`: "Observers" by AntumDeluge, CC-BY 3.0 (also CC-BY 4.0 / OGA-BY 3.0), https://opengameart.org/content/observers
    (observer-48x64.png, one row, scaled).
  - `ship_turtle.png`: "Turtle Sprite" by Oiboo, CC0, https://opengameart.org/content/turtle-sprite (first frame, scaled).
  - `ship_submarine.png`: "Sea Warfare Set, Ships and More" by Lowder2, CC0, https://opengameart.org/content/sea-warfare-set-ships-and-more
    (the submarine from Display.png, re-tinted brass and shortened).
  - `fx_whirlwind.png`: "Whirlwind for effects" by n4, CC0, https://opengameart.org/content/whirlwind-for-effects (whirl1.png,
    squashed and stacked into a funnel).
  - `fx_ice.png`, `fx_rot.png`: "Free Pixel Effects Pack" by CodeManu, CC0, https://opengameart.org/content/free-pixel-effects-pack
    (19_freezing and 17_felspell sheets, 4 frames each at 32 px).
- **Command-card icons** (icons/): 52 Wyrmsun icons (CC0, Jinn and Exidelo) for orders, upgrades and a few units, and 18
  "Painterly Spell Icons" by J. W. Bjerk (eleazzaar), https://opengameart.org/content/painterly-spell-icons-part-1 to
  part-4, used under CC-BY 3.0, for the spells. Every cell's source file is listed in icons/CREDITS.md.
- Build scripts for all of the above: tools/lpc_build.py, tools/process_sprites.py and tools/icons_build.py.

Attribution lines for the CC-BY items: "Flying Dragon Rework" and "Observers" by AntumDeluge (opengameart.org), CC-BY 3.0;
"Painterly Spell Icons" by J. W. Bjerk (eleazzaar), opengameart.org, CC-BY 3.0.
Attribution for the CC-BY-SA LPC composites: see lpc/CREDITS.md.

Drawn or synthesized in code: the gryphon (hand-drawn pixel sprite), team colours (hue shift of the blue cloth layer and of the
Wyrmsun purple channel), the half-built scaffold stage, arrow/axe/spear/fireball/lightning/coil/torpedo projectiles, heal/exorcism/buff/coil impacts, water frames, shore edges, the oil patch, HUD icons and sound.

# Sound credits

All clips live in sounds/ (trimmed, normalised and re-encoded to Ogg Vorbis); every file's source URL, author and licence
line is listed in sounds/SOURCES.md.

Sound effects by Kenney (kenney.nl, CC0); artisticdude (opengameart.org, CC-BY 3.0 for the bow shot, CC0 for the rest);
Little Robot Sound Factory (www.littlerobotsoundfactory.com, CC-BY 3.0: victory and defeat jingles); Michel Baradari
(apollo-music.de via opengameart.org, CC-BY 3.0: orc grunts and deaths); leohpaz (opengameart.org, CC-BY 4.0: heal);
rubberduck, Brandon Song (wolfwoot), Thimras, Joth, fvcalderan, StumpyStrust, Independent.nu and Julien Matthey (all CC0).
Music by RandomMind (opengameart.org, CC0): "Market Day" loop, "Battle" and "Defeat Theme" from the Medieval series.
