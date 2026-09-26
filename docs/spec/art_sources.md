# Art sources for the full Warcraft II roster

Research date: 2026-09-26. The goal is to find free-licensed art for every building, unit, missile and icon the game
lacks today. Only original works under CC0, CC-BY, CC-BY-SA, OGA-BY or GPL are listed. There is no Blizzard art and
no fan rips of it. Every candidate named "(downloaded)" was fetched into `assets/_candidates/` and looked at (frame
sizes measured, contact sheets checked). The others were checked on their OpenGameArt page only.

## What the game has today

The art is loaded in `art.js`: `WYRM`, `LPC`, `LPC_UNIT`, `OTHER_UNIT` and `BLD_ART`.

- **Buildings (Wyrmsun, CC0):** hall/keep/castle for both races (teuton and goblin sets), farm, barracks, watch
  tower, guard tower, cannon tower, smithy, lumber mill, dock, aviary, temple and the oil platform (dock frame 2).
  Also construction sites, ruin, gold mine, grass, water, shore, rock and trees.
  - The orc aviary uses `goblin/buildings/academy.png`, a demon skull on lava.
  - The human aviary uses `buildings/neutral/gryphon_nest.png`.
  - Keep/Castle and Stronghold/Fortress are done: `h_keep`, `h_castle`, `o_keep` and `o_castle` are loaded and
    switched by tier.
- **Units (LPC composites, CC-BY-SA 3.0):** worker, peon, footman, grunt, archer, ranger, axethrower, berserker,
  knight, ogre, mage and shaman. Each has 4 facings with walk, slash, thrust, shoot, cast and hurt frames.
- **Other units:**
  - Ballista and catapult: LPC Siege, CC-BY 4.0, 8 facings.
  - Ships: four Kenney Pirate hulls (CC0), rotated in code. They are reused for tanker, destroyer, juggernaut and
    transport.
  - Dragon: Tiny Creatures (CC0).
  - Gryphon: hand-drawn in code (24x18).
- **Drawn in code:** fire, projectiles, impacts and HUD icons.

Some of the "missing" units already have placeholder art: knight/ogre, mage, archer/ranger, axethrower/berserker,
ballista/catapult, dragon, gryphon and all ships. They are still covered below because better or matching art
exists.

## URL prefixes used in the tables

Table cells must stay short, so raw URLs are written with these prefixes:

| Prefix | Expands to |
|---|---|
| `W:` | Wyrmsun raw graphics (see below) |
| `N:` | Wesnoth raw images (see below) |
| `L:` | Widelands raw data (see below) |
| `U:` | Universal LPC generator spritesheets (see below) |
| `O:` | `https://opengameart.org/sites/default/files/` |

- `W:` = `https://raw.githubusercontent.com/Andrettin/Wyrmsun/master/graphics/`. It was checked at commit
  f0330d2 (2025-04-17). Licences come from `graphics/credits.txt` in that repo. Files that credits.txt does not
  list fall under the repo licence, GPL-2.0.
- `N:` = `https://raw.githubusercontent.com/wesnoth/wesnoth/master/data/core/images/`. Wesnoth art is GPL-2.0+
  unless `copyrights.csv` says otherwise, and none of the files listed here are exceptions.
- `L:` = `https://raw.githubusercontent.com/widelands/widelands/master/data/`. The licence is GPL-2.0+.
- `U:` = `https://raw.githubusercontent.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator/master/spritesheets/`.
  Each layer has its own licence (CC-BY-SA/GPL/OGA-BY); the generator prints a credits list per layer.

## How to read the frame layouts

Wyrmsun sheets follow the Stratagus/WC2 convention. Frames are square, and `frame = sheet width / 5`. The 5 columns
are the facings N, NE, E, SE, S; the game mirrors them for SW, W and NW. Rows are animation frames. This was
checked against the `frame_size` and `Image size` entries in Wyrmsun's `data/unit_types` and
`scripts/civilizations/*/units.lua`. Wyrmsun ships and flyers also have a `*_water.png` or shadow companion sheet.

Wyrmsun building sheets are one column of square frames. Frame 0 is the finished building, and later frames are
construction or other states, matching what `wyrmFrame()` already expects. A 96 px frame covers 3x3 tiles and a
128 px frame covers 4x4. All Wyrmsun art uses the same purple player colour that `wyrmColour()` already recolours.

Wyrmsun is the only large free source drawn in WC2's own top-down 3/4 projection, so it is preferred wherever it
has a match. Wesnoth and Widelands are side or oblique views and are best kept for portraits, icons and critters.

## Buildings

| WC2 building | Candidate (source path) | Licence / author | Frames |
|---|---|---|---|
| Stables (H) | **W:teuton/buildings/stables.png** | CC0 / Jinn | 96px x2 |
| Stables (H) alt | W:latin/buildings/stables.png | CC-BY-SA 3.0 / Jinn, WFG | 96px x2 |
| Stables (H) alt | W:germanic/buildings/stables.png | GPL-2.0 / Exidelo, Jinn | 96px x2 |
| Ogre Mound (O) | **W:buildings/troll/barracks.png** | CC0 / Exidelo | 96px x2 |
| Ogre Mound (O) alt | W:goblin/buildings/masons_shop.png | CC0 / Jinn | 96px x3 |
| Gnomish Inventor (H) | **W:gnome/buildings/town_hall.png** | CC0 / Jinn | 128px x2 |
| Gnomish Inventor (H) alt | W:buildings/elven/smithy.png | CC0 / Artyom Brullov | 96px |
| Goblin Alchemist (O) | **W:goblin/buildings/market.png** | CC0 / Jinn | 96px x2 |
| Goblin Alchemist (O) alt | W:goblin/buildings/masons_shop.png | CC0 / Jinn | 96px x3 |
| Mage Tower (H) | **W:dwarf/buildings/academy.png** | CC0 / Jinn | 96px x2 |
| Mage Tower (H) alt | W:teuton/buildings/university.png | CC0 / Jinn | 96px x2 |
| Temple of the Damned (O) | **W:goblin/buildings/academy.png** | CC0 / Jinn | 96px x2 |
| Temple of Damned alt | W:dwarf/buildings/temple.png | CC0 / Jinn | 96px x2 |
| Foundry (H) | **W:dwarf/buildings/smithy.png** | CC0 / Exidelo | 96px x2 |
| Foundry (H) alt | L:tribes/buildings/productionsites/empire/... | GPL-2.0+ / Widelands | 66x94 |
| Metalworks (O) | **W:buildings/troll/smithy.png** | CC0 / Exidelo | 96px x2 |
| Oil Refinery (H) | W:dwarf/buildings/masons_shop.png (weak) | CC0 / Jinn | 96px x2 |
| Oil Refinery (H) alt | L:.../atlanteans/smelting_works/idle_1.png | GPL-2.0+ / Widelands | 96x106 |
| Oil Refinery (O) | W:goblin/buildings/masons_shop.png (weak) | CC0 / Jinn | 96px x3 |
| Altar of Storms (O) | **W:germanic/buildings/temple.png** | CC0 / Jinn | 96px x2 |
| Altar of Storms alt | W:buildings/norse/great_temple.png | CC0 / Exidelo | 128px x2 |
| Dragon Roost (O) | **W:buildings/goblin/spider_pit.png** | CC0 / Exidelo | 96px 3x2 grid |
| Troll Lumber Mill (O) | **W:buildings/troll/lumber_mill.png** | CC0 / Exidelo | 96px x2 |
| Gold mine (rail) | **W:buildings/neutral/gold_mine_rail.png** | CC0 / Jinn | 96px x3 |
| Gold mine (active) | W:buildings/neutral/gold_mine_light.png | CC0 / Jinn | 96px x3 |
| Gold mine (depleted) | W:buildings/neutral/cavern_entrance.png | CC0 / Jinn | 96px |
| Dark Portal | **W:neutral/buildings/portal.png** | CC0 / Jinn | 96px x12 anim |
| Dark Portal alt | W:neutral/buildings/portal_purple.png | CC0 / Jinn | 96px x12 anim |
| Circle of Power | **W:neutral/buildings/glyph.png** | CC0 / Jinn | 32px 8x3 |
| Circle of Power alt | O:teleportCircle.png | CC0 / gfroad | 256px 4x4 |
| Runestone | **W:buildings/norse/runestone.png** | CC0 / Jinn | 64px x2 |
| Keep/Castle alt | W:latin/buildings/fortress.png | CC0 / Jinn | 128px x2 |
| Stronghold alt | W:buildings/troll/town_hall.png | CC0 / Exidelo | 128px x2 |

The recommended pick for each building is in bold.

- **Stables:** Pick the Teuton stables. It matches the Teuton hall and smithy already in use. The Latin stables is
  CC-BY-SA, and the Germanic one is GPL-only (not dual-licensed).
- **Ogre Mound:** Pick the troll barracks, a rock mound with skulls. It shares its look with the troll lumber mill
  and smithy, which gives the orc side a consistent "Exidelo troll" look.
- **Gnomish Inventor:** Pick the gnome town hall. It is a workshop with a chimney, gears and a small pond, and at
  128 px it must be scaled to 3x3.
- **Goblin Alchemist:** Pick the goblin market, a skull-and-horn tent with potions.
- **Mage Tower:** Pick the dwarf academy. It is a stained-glass pyramid that reads as magical. The university
  reads as a college rather than a tower.
- **Temple of the Damned:** Pick the goblin academy (demon skull on lava). The orc aviary uses it today, so give
  it to the Temple of the Damned and use the spider pit as the orc roost/aviary.
- **Foundry:** Pick the dwarf smithy, grey stone with two chimneys. It is clearly heavier than the Teuton smithy
  used for the Blacksmith.
- **Metalworks:** Pick the troll smithy, a forge glowing inside a rock pile.
- **Oil Refinery:** No good free art exists (see Gaps). The fallback is a recoloured Foundry/Metalworks with a
  code-drawn oil tank or barrel prop.
- **Altar of Storms:** Pick the Germanic temple. It is a stone circle around a purple altar and nearly an exact
  match.
- **Dragon Roost:** Pick the goblin spider pit. It holds six variants of bone-strewn pits with purple banners, and
  frame 0 is enough.
- **Troll Lumber Mill:** Pick the troll lumber mill, a sawblade set in rock.
- **Gold mine:** Use `gold_mine_rail` or `gold_mine_light` as the "being mined" state, which adds a lit entrance
  and carts. Use the cavern entrance or `neutral/buildings/destroyed_site.png` (CC0) as the depleted mine.
- **Dark Portal:** The portal is a 12-frame swirling vortex with no frame around it. Put it over
  `neutral/buildings/portal_frame.png` (unlisted in credits, so GPL-2.0) or a code-drawn ring.
- **Circle of Power:** Use the runes sheet as the Circle of Power floor glyph. The same sheet also serves as the
  Runes spell effect.

## Units: land

| WC2 unit | Candidate (source path) | Licence / author | Frames |
|---|---|---|---|
| Demolition Squad (H) | **U: male body + dwarf beard + barrel** | CC-BY-SA/GPL (ULPC) | 64px 4 dirs |
| Demolition Squad alt | W:dwarf/units/miner.png | GPL-2 or CC-BY-SA 3 / b_o | 72px 5 dirs |
| Demolition Squad alt | W:dwarf/units/thunderer.png | GPL-2 or CC-BY-SA 3 / Jinn, b_o | 72px 5x12 |
| Goblin Sappers (O) | **U:head/heads/goblin/adult/*.png + child body** | CC-BY-SA/GPL (ULPC) | 64px 4 dirs |
| Goblin Sappers alt | W:goblin/units/goblin_worker.png | GPL-2 or CC-BY-SA 3 / b_o | 72px 5 dirs |
| Goblin Sappers alt | O:goblin_0.png ([LPC] Goblin) | CC-BY 3/4, OGA-BY / W.Thompsonj | 64px 4 dirs |
| Paladin (H) | **LPC knight recoloured gold + white cape** | CC-BY-SA 3.0 (ULPC) | 64px 4 dirs |
| Paladin alt | W:teuton/units/ritter.png (mounted) | GPL-2 or CC-BY-SA 3 / badbuckle, b_o | 72px 5 dirs |
| Ogre (2-headed) | **W:ettin/units/ettin.png** | GPL-2 or CC-BY-SA 3 / Jinn, b_o | 144px 5x12 |
| Ogre-Mage (O) | **W:ettin/units/ettin.png, blue tint** | GPL-2 or CC-BY-SA 3 / Jinn, b_o | 144px 5x12 |
| Ogre alt | N:units/ogres/ogre.png (side view) | GPL-2.0+ / Wesnoth | 72px 1 dir |
| Death Knight (O) | **U:body/bodies/skeleton + robe + staff** | CC-BY-SA/GPL (ULPC) | 64px 4 dirs |
| Death Knight alt | W:teuton/units/cleric.png, dark tint | GPL-2 or CC-BY-SA 3 / Jinn, b_o | 72px 5x13 |
| Skeleton | **U:body/bodies/skeleton/*.png** | CC-BY-SA/GPL (ULPC) | 64px 4 dirs |
| Skeleton alt | W:units/undead/skeleton_warrior.png | CC0 / Kwaliti, Jinn | 82px 5x13 |
| Troll Axethrower alt | W:units/orc/spearthrower.png | CC0 / Kwaliti, Jinn | 104px 5x14 |
| Troll Berserker alt | W:troll/units/warrior.png | CC0 / Jinn, Gregor-Mack | 72px 5x12 |
| Grunt alt | W:units/orc/sea_orc.png | CC0 / Gregor-Mack | 72px 5x12 |
| Catapult alt | W:teuton/units/catapult.png | GPL-2 or CC-BY-SA 3 / b_o | 72px 5x4 |
| Ballista alt | W:dwarf/units/dwarven_ballista.png | GPL-2 or CC-BY-SA 3 / b_o | 72px 5 dirs |
| Daemon (optional) | **O:minidaemon.png** | CC0 / Timelot | 24x32, 12x8 grid |
| Eye of Kilrogg | **O:observer-48x64.png** | CC-BY 3/4, OGA-BY / AntumDeluge | 48x64 3x4 |
| Eye of Kilrogg alt | O:EyeMonster.png | CC0 / awesomeduck | 32px 3x3 |

The recommended pick for each unit is in bold.

- **Humanoids should stay LPC.** Every existing humanoid is an LPC composite. For Demolition Squad, Sappers,
  Paladin, Death Knight and Skeleton, the cleanest option is to composite new sheets with the same generator the
  project already uses (`lpc/manifest.json`). It already contains:
  - skeleton bodies and heads (`body/bodies/skeleton`, `head/heads/skeleton`);
  - goblin, vampire and zombie heads;
  - child and teen bodies, which work for short sappers and dwarves;
  - beards, robes, plate armour and staves.

  Composites keep the 4-facing, 21-row layout that `lpcFrame()` reads, so no code changes are needed. The
  Wyrmsun unit sheets use 5 facings and a different row order, so they would need a new frame reader.
- **Demolition Squad and Sappers:** Carry an explosive barrel. `W:neutral/items/explosive_barrel.png` (32 px x6)
  is not in Wyrmsun's credits.txt, so treat it as GPL-2.0. The alternative is a code-drawn barrel on the ULPC
  backpack layer.
- **Ogre (2-headed):** The Wyrmsun ettin is the only free two-headed giant found. It is drawn in the right
  projection, but it would be the one 5-facing unit among LPC units. If mixing styles is a problem, keep the
  current LPC ogre and add a second head (orc head layer) during compositing.
- **Paladin:** Wyrmsun's ritter is layered (`LayerImages`: separate shield/helmet), so it needs compositing too.
  An LPC paladin looks more consistent.
- **Death Knight:** Use a skeleton or vampire head with a hood, dark robe and simple staff; this matches how the
  shaman is built. WC2's Death Knight is mounted. An LPC rider is possible with bluecarrot16's
  [LPC] Horses (O:horse-black_0.png, CC-BY 3/CC-BY-SA 3/GPL/OGA-BY), but riding needs the "[LPC] Horse Riding"
  offsets and is optional.
- **Troll alternatives:** The Wyrmsun orc spearthrower (CC0) and troll warrior (CC0) are good if the project ever
  moves away from LPC, but they are not needed now.
- **Daemon:** The mini daemon is a small RPG-style 4-direction sprite (red, winged). It works as a summoned unit at
  0.5 tile scale.
- **Eye of Kilrogg:** "Observers" is a floating eyeball with 12 idle/float frames in 3 sizes; it is the better
  fit. EyeMonster is CC0 but a tiny 16 px original.

## Units: air

| WC2 unit | Candidate (source path) | Licence / author | Frames |
|---|---|---|---|
| Gnomish Flying Machine | **W:goblin/units/glider.png, recoloured** | GPL-2 or CC-BY-SA 3 / b_o | 100px 5x5 |
| Flying Machine alt | W:units/aether_workship.png | CC0 / Kwaliti, Jinn | 108px 5x3 |
| Goblin Zeppelin | **W:units/aether_transport.png** | CC0 / Kwaliti, Jinn | 114px 5x3 |
| Goblin Zeppelin alt | O:steampunk_zeppelin.png (+ .blend) | CC-BY-SA 3, GPL / johndh | 400px render |
| Gryphon Rider | **W:dwarf/units/gryphon_rider.png** | GPL-2 or CC-BY-SA 3 / b_o | 100px 5x13 |
| Gryphon Rider alt | W:neutral/units/gryphon.png (no rider) | GPL-2 or CC-BY-SA 3 / b_o | 100px 5x13 |
| Dragon | **O:flying_dragon-red-RGB.png** | CC-BY 3.0 / AntumDeluge | 191x161 3x4 |
| Dragon alt | O:flying_twin_headed_dragon-blue.png | CC-BY 3.0 / AntumDeluge | 144x128 3x4 |
| Dragon alt | W:neutral/units/wyrm.png (wingless) | GPL-2 or CC-BY-SA 3 / b_o | 110px 5 dirs |

The recommended pick for each unit is in bold.

- **Gnomish Flying Machine:** No free gyrocopter or ornithopter exists (see Gaps). The goblin glider is a
  bat-winged glider with a pilot, in the right projection with 5 facings. Recolour the membrane to canvas or tan
  for the gnomes. The aether workship is a small winged skiff and a CC0 alternative.
- **Goblin Zeppelin:** The aether transport is a purple-hulled flying boat with sail wings. It is CC0, top-down
  3/4, with 5 facings, and is the closest free "airship" in the right view. The steampunk zeppelin is a true
  blimp, but it comes as 3D renders; to use it, render 8 top-down facings from its `.blend` (CC-BY-SA).
- **Gryphon Rider:** This is a real upgrade over the hand-drawn 24x18 gryphon: 5 facings with flap frames, in
  the WC2 view. Pair it with its shadow sheet.
- **Dragon:** Tiny Creatures stays usable. "Flying Dragon Rework" is a proper 3/4 top-down flyer with 4
  directions x 3 flap frames. The twin-headed blue variant suits Deathwing-style heroes. Wesnoth's
  `units/monsters/fire-dragon.png` is side view only and is better as a portrait.

## Units: sea

| WC2 unit | Candidate (source path) | Licence / author | Frames |
|---|---|---|---|
| Elven Destroyer (H) | **W:teuton/units/kogge.png (+_water)** | CC0 / Jinn | 72px 5x3 |
| Troll Destroyer (O) | **W:goblin/units/warship.png (+_water)** | CC0 / Jinn | 100px 5x3 |
| Battleship (H) | **W:dwarf/units/ballista_warship.png** | CC0 / Jinn | 72px 5x3 |
| Battleship alt | N:units/transport/pirate-galleon.png | GPL-2.0+ / Wesnoth | 72x80 1 dir |
| Ogre Juggernaught (O) | **W:goblin/units/warship.png, scaled** | CC0 / Jinn | 100px 5x3 |
| Juggernaught alt | N:units/transport/orc/battle-barge.png | GPL-2.0+ / Wesnoth | 144px 1 dir |
| Oil Tanker (H) | **W:units/teutonic/workship.png** | CC0 / Jinn | 72px 5x3 |
| Oil Tanker (O) | W:units/teutonic/workship.png, dark tint | CC0 / Jinn | 72px 5x3 |
| Transport (H) | **W:dwarf/units/transport.png (+_water)** | CC0 / Jinn | 72px 5x3 |
| Transport (O) | **W:goblin/units/transport.png (+_water)** | CC0 / Jinn | 100px 5x3 |
| Gnomish Submarine (H) | O:Submarine hull (Sea Warfare Set) | CC0 / Lowder2 | top-down 1 dir |
| Giant Turtle (O) | **O:Turtle_TopDown_64x64_SpriteSheet_...png** | CC0 / Oiboo | 64px 4x4 |
| Giant Turtle alt | O:turtle_walk.png | CC0 / alizard | 66px x6 (side) |

The recommended pick for each ship is in bold.

- **Why Wyrmsun hulls:** They replace the Kenney pirate hulls with ships drawn in the same projection and palette
  as the docks. They also show the purple team colour, while the Kenney hulls are recoloured only by a hue shift.
- **Credits file names:** Credits.txt lists the dwarf and goblin transports as `*/transport_ship.png`. The files
  are now named `transport.png`, with the same author (Jinn, CC0).
- **Juggernaught:** It has no separate orc battleship, so reuse the goblin warship at 1.25x scale with extra
  spikes, or use the Wesnoth battle-barge (side view) only for its portrait.
- **Oil Tanker:** The Teutonic workship (a red-sail cargo boat with sacks) is the one CC0 utility ship. Tint it
  dark for the orcs, as the `dark: true` path in `OTHER_UNIT` does today.
- **Submarine:** Only modern top-down hulls exist. The Sea Warfare Set is CC0 but grey and 20th-century; the game
  rotates ships in code, so a single facing works. Treat it as a placeholder.
- **Giant Turtle:** Oiboo's turtle is a CC0 top-down 64 px turtle with walk and "retreat into shell" frames (the
  shell frame suits a submerged state). It is good, and it rotates like the ships.

## Critters for Polymorph

| Critter | Candidate (source path) | Licence / author | Frames |
|---|---|---|---|
| Sheep | **O:sheep_walk.png (LPC farm animals)** | CC-BY 3.0, GPL-2 / daneeklu | 128px 4 dirs x4 |
| Sheep alt | L:world/critters/sheep/walk_se_1.png | GPL-2.0+ / Widelands | 26x24, 6 dirs |
| Pig | **O:pig_walk.png (LPC farm animals)** | CC-BY 3.0, GPL-2 / daneeklu | 128px 4 dirs x4 |
| Pig / boar alt | W:neutral/units/boar.png | CC-BY-SA 3.0 / Jinn, WFG | 72px 5 dirs |
| Pig / boar alt | L:world/critters/wildboar/walk_se_1.png | GPL-2.0+ / Widelands | 38x25, 6 dirs |
| Seal | O:seal-monk-L1.png (Monk Seal) | CC-BY-SA 3/4 / rapidpunches | side view |
| Goat (sheep stand-in) | W:neutral/units/goat.png | GPL-2 or CC-BY-SA 3 / Jinn, b_o | 54px 5 dirs |

- **Sheep and pig:** The LPC farm animals are in the same style as the LPC units, 4 facings with walk and eat
  frames. They are the natural pick. The Widelands animals are GPL-only and have 6 hex facings.
- **Seal:** No top-down seal was found. The monk seal is a side-view platformer sprite. A code-drawn 16 px seal
  blob, or reusing the sheep in a grey tint, is acceptable.

## Missiles and effects

| Effect | Candidate (source path) | Licence / author | Frames |
|---|---|---|---|
| Fireball (flight) | **W:missiles/flaming_catapult_rock.png** | GPL-2 or CC-BY-SA 3 / b_o | 32px 5x3 |
| Fireball alt | N:projectiles/fireball-n-1.png (+nw, 2) | GPL-2.0+ / Wesnoth | 100px 2 dirs |
| Fireball impact | **W:missiles/siege_projectile_impact.png** | CC0 / Cuzco, Jinn | 48px 5x2 |
| Explosion | **W:missiles/explosion.png** | CC0 / StumpyStrust, Jinn | 64px 5x5 |
| Burning building | **W:missiles/big_fire.png, small_fire.png** | CC0 / Mikodrak, Jinn | 48px 5x2; 32px 5x3 |
| Lightning | **W:missiles/lightning.png** | CC0 / Jinn | 48x50 x5 |
| Lightning impact | W:missiles/lightning_impact.png | CC0 / Jinn | 48x50 x4 |
| Lightning alt | N:halo/lightning-bolt-1-1..4.png | GPL-2.0+ / Wesnoth | 200x360 x4 |
| Blizzard | **O:icicle.png (Icicle Spell)** | CC-BY 3.0 / Clint Bellanger | 64px 8 dirs x8 |
| Blizzard impact | O:19_freezing_spritesheet.png (CodeManu) | CC0 / CodeManu | 100px grid |
| Death and Decay | **O:17_felspell_spritesheet.png (CodeManu)** | CC0 / CodeManu | 100px grid |
| Flame Shield | **O:7_firespin_spritesheet.png (CodeManu)** | CC0 / CodeManu | 100px grid |
| Runes | **W:neutral/buildings/glyph.png** | CC0 / Jinn | 32px 8x3 |
| Whirlwind | **O:whirl1.png .. whirl4.png** | CC0 / n4 | 256px x4 |
| Whirlwind alt | O:13_vortex_spritesheet.png (CodeManu) | CC0 / CodeManu | 100px grid |
| Death Coil | **N:halo/undead/black-magic-1..3.png** | GPL-2.0+ / Wesnoth | 100px x3 |
| Death Coil alt | O:14_phantom_spritesheet.png (CodeManu) | CC0 / CodeManu | 100px grid |
| Holy Vision | **N:halo/holy/halo1..6.png** | GPL-2.0+ / Wesnoth | 100px x6 |
| Holy Vision alt | Kenney Particle Pack light_01..03 | CC0 / Kenney | 512px singles |
| Exorcism | **N:halo/holy/light-beam-*.png** | GPL-2.0+ / Wesnoth | beam frames |
| Exorcism alt | O:16_sunburn_spritesheet.png (CodeManu) | CC0 / CodeManu | 100px grid |
| Heal / Unholy Armor | O:8_protectioncircle_spritesheet.png | CC0 / CodeManu | 100px grid |
| Magic missile beam | W:missiles/magic.png | CC0 / Jinn | 42px x16 |
| Blood | **O:blood_red.png (Blood Splatters)** | CC0 / AntumDeluge | 32px x4 |
| Blood (anim) | O:blood_splatter_sprite_sheet.png | CC0 / Ko'asuna | 32px x7 |
| Corpse, human side | **W:neutral/units/human_corpse.png** | CC0 / Jinn | 72px 5x4 |
| Corpse, orc side | **W:units/orc/corpse.png** | CC0 / Kwaliti, Jinn | 132px 5x4 |
| Corpse alt | W:neutral/units/dwarven_corpse.png | CC0 / Jinn | 72px 5x4 |
| Bones | O:bones.png (Top down dead things) | CC-BY 3.0 / Liosan | single images |
| Cannonball | W:missiles/cannon_ball.png | CC0 / Jinn | 32px x3 |

- **Full URLs:**
  - Kenney Particle Pack: https://kenney.nl/assets/particle-pack (CC0; 80 white PNGs, tint in code).
  - CodeManu "Free Pixel Effects Pack": O:Free%20Pixel%20Effects%20Pack.zip, page
    https://opengameart.org/content/free-pixel-effects-pack (CC0). It contains 20 spritesheets of 100 px frames,
    and the downloaded copy is in `_candidates/oga/codemanu/`.
- **Style:** The CodeManu, Kenney and Wesnoth halo effects are all soft or glowy. Scale them to 32–96 px and use
  additive blending. That reads well over WC2-style terrain.
- **Holy art is GPL-only:** Every holy/undead effect recommended from Wesnoth is GPL-2.0+ only. If the project
  wants to avoid GPL-only files, use the CodeManu (CC0) alternative instead.
- **Corpses:** The Wyrmsun corpse sheets are the decay sequence Stratagus uses: fresh body, then blood, then
  bones. They are the right WC2-style replacement for today's code-drawn ellipse under a dead non-LPC unit.

## Portraits and command-card icons

| Use | Candidate (source path) | Licence / author | Frames |
|---|---|---|---|
| Unit/building icons | **Wyrmsun icon sets (see list)** | mostly CC0 / Jinn, Exidelo | 46x38 each |
| Spell icons | **Painterly Spell Icons 1–4** | CC-BY 3/CC-BY-SA 3-4/GPL / J.W. Bjerk | 256px each |
| Spell icons alt | N:attacks/*.png | GPL-2.0+ / Wesnoth | 60px each |
| Large portraits | N:portraits/*/*.webp | GPL-2.0+ / Wesnoth | 400–500px |

- **Wyrmsun icons (46x38, WC2's exact icon size, CC0 unless noted):**
  - `neutral/icons/gryphon.png`, `wyrm.png` (dragon), `goat.png` (polymorph), `healing.png`, `slow.png`,
    `blessing.png`, `far_sight.png` (Holy Vision), `ethereal_vision.png`, `terror.png`, `inspire.png`,
    `critical_strike.png` and `regeneration.png`.
  - `goblin/icons/glider.png` (flying machine or zeppelin), `goblin/icons/shaman.png` and
    `goblin/icons/gunpowder_infantry.png` (sappers).
  - `icons/units/undead/skeleton.png`.
  - `dwarf/icons/gryphon_rider.png`, `runesmith.png`, `runemaster.png` (Runes) and `thunderer.png`.
  - `teuton/icons/ritter.png` (knight or paladin) and `icons/commands/*` (attack ground, repair, harvest, cancel,
    rally point, stand ground, patrol).
  - All paths are under `W:`. Only the files credits.txt marks as "GPL 2.0 and CC-BY-SA 3.0", such as
    `dwarf/icons/thane.png`, are not CC0. Five were downloaded and measured at 46x38.
- **Painterly Spell Icons** (https://opengameart.org/content/painterly-spell-icons-part-1 to part-4, by eleazzaar
  (J. W. Bjerk)):
  - Relevant files: fireball-red, ice-blue, lightning-blue, runes-orange, wind-sky (whirlwind), horror-eerie
    (death coil), heal-jade, protect-royal (holy armour), haste-fire, enchant-magenta (bloodlust) and
    evil-eye-red (Eye of Kilrogg).
  - They are painterly 256 px icons. Downscaled to 46x38 they look close to WC2's painted icons. The best licence
    option for this project is CC-BY-SA 3.0.
- **Wesnoth portraits:** These are high-quality painted busts, all GPL-2.0+. They include
  `portraits/undead/death-knight.webp`, `monsters/ogre.webp`, `humans/paladin.webp`,
  `dwarves/gryphon-rider.webp`, `humans/mage.webp`, `trolls/troll-warrior.webp` and `transport/orcish-barge.webp`.
  - They could fill a large "selected unit" portrait panel, but the style is realistic painting rather than pixel
    art.
  - Their GPL-only licence means those files ship under GPL.

## Sources checked and rejected

- **Tiny Swords (Pixel Frog, itch.io):** Not free-licensed. The terms say "You may not redistribute, resell, or
  repackage the assets", which is incompatible with vendoring them in an open repo. Excluded.
- **Freeciv amplio2 units:** The spec file credits "Fairline's collection of original Civ2 units" and Apolyton
  scenario graphics. Their provenance is unclear and possibly derived from Civ2, so they were excluded. They also
  have only one facing.
- **Aleona's Tales (Stratagus):** Its own site says the graphics are "a mix of various Free and non-Free
  licenses", and it descends from the FreeCraft WC2-lookalike set. It is not safe to cherry-pick without a
  per-file audit, and no per-file licence list was found. Excluded.
- **Wargus:** Ships no art at all; it extracts it from a WC2 CD. Excluded.
- **Kenney Medieval RTS and Tiny Battle (CC0):** The licence is fine, but the style is flat vector or 16 px
  modern-war, a poor fit next to Wyrmsun.
- **0 A.D.:** 3D, skipped as asked. Wyrmsun already folds in some Wildfire Games 2D renders (CC-BY-SA), such as
  the Latin stables and the boar.
- **Battleships (illad-prasad, CC0):** Tiny modern ships, only useful as a last-resort submarine.

## Gaps: no good free art found

- **Oil Refinery (both races):** No free RTS refinery, oil well or oil tank building exists in any matching style.
  The workarounds are a recoloured Foundry/Metalworks plus code-drawn tanks, or the Widelands smelting works
  (GPL-only, oblique view).
- **Gnomish Flying Machine:** No free gyrocopter or ornithopter was found. The Wyrmsun goblin glider is a stand-in.
- **Gnomish Submarine:** Only modern grey hulls exist (CC0 Sea Warfare Set). A proper fantasy submarine would
  have to be drawn or rendered.
- **Seal (Polymorph):** No top-down seal exists. Draw it in code or reuse the sheep.
- **Death Knight on horseback / mounted Paladin in LPC:** Possible with [LPC] Horses plus the riding offsets, but
  no ready-made sheet exists. Use the foot versions.
- **Ogre-Mage:** Only covered by tinting the Wyrmsun ettin; no dedicated caster two-headed ogre exists.

## Candidate files on disk

Everything inspected is under `assets/_candidates/` (about 30 MB). It is not wired into the game and should be
deleted or moved into proper asset folders, with CREDITS entries, when the picks are adopted.

- `wyrmsun/`: about 95 building, unit, missile and icon sheets, named `<path with _>.png`.
- `wesnoth/`: units, halos, projectiles and portraits.
- `widelands/`: sheep, boar and smelting/piggery buildings.
- `oga/`: the OpenGameArt downloads. `codemanu/` holds the effects pack, and `painterly1/` holds part 1 of the
  spell icons.
- `kenney/kenney_particle-pack/`: the Kenney particle pack.
