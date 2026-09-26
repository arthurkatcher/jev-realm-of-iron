# Warcraft II: Tides of Darkness - Units and Buildings Data Spec

This file lists every trainable unit and every building in Warcraft II: Tides
of Darkness (1995) for both the Human Alliance and the Orcish Horde. It
gives the numbers a developer needs to rebuild the game: costs, times, combat
stats, prerequisites, footprints and special rules. Beyond the Dark Portal
gets only a short appendix. Upgrade and spell effects are covered in
`upgrades_spells.md`; this file names the research items only.

Warcraft is a trademark of Blizzard Entertainment. This is a research note,
not affiliated with Blizzard.

## 0. Sources and how conflicts are resolved

Sources, in the order used to settle disagreements:

1. **RETAIL**: the game's own default unit table (the `UDTA` section every
   map falls back on), as shipped by the PUDForge project in
   `data/default-udta.bin`. Field layout is from PUDForge `constants.cpp`.
   It covers cost, build time, HP, armor, damage, range, sight, size,
   targets and flags. It has no movement speed, cooldown or mana.
   https://github.com/pudforge/PUDForge/blob/HEAD/data/default-udta.bin and
   https://github.com/pudforge/PUDForge/blob/HEAD/src/PUDForgeCore/constants.cpp
2. **WARGUS**: the open-source reimplementation's data scripts. Used for
   speed, animation timing, dependencies, buttons, mana and spells.
   https://github.com/Wargus/wargus/tree/master/scripts (files
   `human/units.lua`, `orc/units.lua`, `units.lua`, `human/upgrade.lua`,
   `orc/upgrade.lua`, `human/buttons.lua`, `orc/buttons.lua`, `spells.lua`,
   `anim.lua`, `human/anim.lua`, `orc/anim.lua`, `stratagus.lua`), plus the
   Stratagus engine https://github.com/Wargus/stratagus (files
   `src/action/action_train.cpp`, `action_built.cpp`, `action_research.cpp`,
   `action_upgradeto.cpp`, `src/include/settings.h`, `src/game/game.cpp`).
3. **MAN**: the official Warcraft II Battle.net Edition manual (Blizzard,
   1999), dependency charts on p.55-56 (Human) and p.82-83 (Orc).
   http://ftp.blizzard.com/pub/misc/Warcraft%202%20Battlenet%20edition.PDF
4. **CBN**: classic.battle.net unit pages, e.g.
   http://classic.battle.net/war2/units/footman.shtml
5. **WIKI**: warcraft.wiki.gg, https://warcraft.wiki.gg/wiki/Warcraft_II_units
   and https://warcraft.wiki.gg/wiki/Warcraft_II_buildings

Rule: RETAIL wins for any field it holds. WARGUS fills fields RETAIL lacks.
Every place where two sources disagree is marked **CONFLICT** in the text
and collected in section 9.

Human and Orc counterparts have identical stats in RETAIL for every pair
(checked field by field). The races differ in spells, in the Ranger versus
Berserker research line, in the Mage (range 2) versus Death Knight (range
3), and in a few upgrade prices. Everything else is art, names and sound.

## 1. Time units and conversion to seconds

Source: WARGUS engine files listed above; RETAIL `buildTime` field.

Every cost table stores time as a small integer N (RETAIL `buildTime` is one
byte, so 255 is the maximum; the Town Hall uses it). Wargus stores the same
number as `Costs = {"time", N, ...}`.

How Stratagus turns N into game cycles:

- Training (`action_train.cpp`): each step adds 1 to a counter, then waits
  `CYCLES_PER_SECOND / 6` = 5 cycles. Done when counter reaches N. So a
  unit takes **6 x N game cycles**.
- Construction (`action_built.cpp`): progress += 100 every cycle, done at
  N x 600. So a building also takes **6 x N cycles**. HP rises in step
  with progress.
- Research and hall/tower upgrades (`action_research.cpp`,
  `action_upgradeto.cpp`): same 1-per-6-cycles pattern, **6 x N cycles**.
- `CYCLES_PER_SECOND = 30` (`settings.h`). In Stratagus up to v2.4.x,
  `SetGameSpeed(30)` meant 30 cycles per second = 100 percent video sync,
  and Wargus's default preference is `GameSpeed = 30`.

At 30 cycles per second: **seconds = 6N / 30 = N / 5**. A Footman (N=60)
takes 12 s; a Town Hall (N=255) takes 51 s.

| Speed model | Cycles/s | Footman (N=60) | Formula |
|---|---|---|---|
| Stratagus nominal (old "100%") | 30 | 12.0 s | N / 5 |
| Wargus master slider at 30 | 19 | 18.9 s | 6N / 19 |
| Wiki labelling ("seconds") | n/a | 60 s | N |

**CONFLICT / UNRESOLVED.** Current Stratagus master maps the slider as
`cycles/s = speed x 0.3 + 10`, so the default preference 30 now gives 19
cycles/s. warcraft.wiki.gg writes build times as "60 seconds", which is the
raw N, not a measured duration. The real-time tick rate of the retail
game's six speed settings (Slowest, Slow, Normal, Fast, Faster, Fastest) was
not found in any source checked. Recommendation: store N, run the simulation
at 6 cycles per time unit, and treat cycles-per-second as the game-speed
knob (30 = the Stratagus "normal"). The "s" column below uses N / 5.

## 2. Movement speed, attack rate and sight

Sources: WARGUS `spells.lua` (comment "Speed: just drawing"), `anim.lua`,
`human/anim.lua`, `orc/anim.lua`.

- `Speed` is the value the unit panel shows (MAN p.7 lists Speed in the
  unit description). RETAIL `UDTA` holds no speed field.
- In Wargus, actual movement comes from each unit's `Move` animation: a
  list of pixel steps and waits. A tile is 32 px. The table gives cycles per
  tile measured from those animations. Rule of thumb: cycles per tile is
  about 160 / Speed, except siege engines (see note).
- Attack rate in Wargus is the total wait of the `Attack` animation, in
  cycles. It is the time between hits. RETAIL has no cooldown field.
- Sight and ranges are in tiles. Ranges are tile distance between
  footprints (a melee unit has range 1).

| Speed | Example units | Cycles per tile | Tiles/s at 30 cyc/s |
|---|---|---|---|
| 5 | Ballista, Catapult | 63 | 0.48 |
| 6 | Battleship, Juggernaught | 26 | 1.15 |
| 7 | Submarine, Giant Turtle | 21 | 1.43 |
| 8 | Mage | 18 | 1.67 |
| 8 | Death Knight | 19 | 1.58 |
| 10 | Peasant, Footman, Archer, Tanker, Transport, Destroyer | 16 | 1.88 |
| 11 | Demolition Squad, Sappers | 14 | 2.14 |
| 13 | Knight, Paladin, Ogre, Ogre-Mage | 12 | 2.50 |
| 14 | Gryphon Rider, Dragon | 12 | 2.50 |
| 17 | Flying Machine, Zeppelin | 10 | 3.00 |

Note: the siege engines move far slower in Wargus (63 cycles per tile) than
the 160 / Speed rule (32) suggests. Whether that matches retail is
unverified.

## 3. Rules common to all units

Sources: RETAIL; WARGUS `units.lua`, `spells.lua`; MAN p.9, p.26.

- **Food.** Every trainable unit uses 1 food (Wargus `Demand = 1`). Town
  Hall, Keep and Castle each give 1 food; each Farm gives 4 (MAN p.9;
  Wargus `Supply`). Eye of Kilrogg uses 0.
- **Damage** (MAN p.26): maximum damage = max(Basic - target Armor, 0) +
  Piercing; each hit deals a random 50 to 100 percent of that. Upgrades that
  raise weapons add to Piercing in Wargus (`PiercingDamage` modifiers).
  Details belong to the combat spec.
- **Targets.** RETAIL `canTarget` bits: L = land, S = sea, A = air. A unit
  with no bits cannot attack.
- **Attack Ground.** RETAIL flag "Can attack ground" is set only for
  Ballista, Catapult, Battleship and Juggernaught (Wargus `GroundAttack`).
- **Seeing submarines.** RETAIL flag "Sees submarines" is set on all air
  units, both submarines, and all towers (Scout, Guard, Cannon). Nothing
  else can see or target a submerged submarine (MAN p.66, p.68; CBN
  submarine page: "visible only to Towers, aerial forces, and other vessels
  that move beneath the waves"). Wargus models this as `PermanentCloak` plus
  `DetectCloak`.
- **Footprint.** RETAIL gives every mobile unit a 1x1 logical size. Ships,
  flyers and the Ballista/Catapult have a 64 px selection box (2x2 tiles
  drawn). Wargus gives ships and flyers `TileSize = {2, 2}`. **CONFLICT**
  (see section 9). Siege engines are 1x1 in both.
- **Mana.** Casters (Mage, Death Knight, Paladin, Ogre-Mage) have 255 max
  mana. Wargus starts them at 84 and regenerates 1 per game second
  (`DefineVariables("Mana", {Max = 255, Value = 84, Increase = 1})`). CBN
  says "255 max (85 starting)". **CONFLICT**, off by one.
- **Repair.** Workers repair buildings, Transports and (Wargus) ships.
  Wargus: 4 HP per step at 1 gold + 1 lumber (+1 oil if the building cost
  oil) per step.

## 4. Units

### 4.1 Production: cost, time, where, prerequisites

Sources: RETAIL (cost, time); WARGUS `*/buttons.lua` (trained at),
`*/upgrade.lua` `DefineDependency` (prerequisites); MAN p.55, p.82 (charts).

Costs are gold/lumber/oil. "s" = N / 5 (section 1). Prerequisites list the
buildings that must exist, in addition to the building that trains the unit.

| Human | Orc | G/L/O | N | s | Trained at | Also requires |
|---|---|---|---|---|---|---|
| Peasant | Peon | 400/0/0 | 45 | 9 | Town Hall/Keep/Castle | none |
| Footman | Grunt | 600/0/0 | 60 | 12 | Barracks | none |
| Elven Archer | Troll Axethrower | 500/50/0 | 70 | 14 | Barracks | Lumber Mill |
| Elven Ranger | Troll Berserker | 500/50/0 | 70 | 14 | Barracks | Lumber Mill + Ranger/Berserker research |
| Knight | Ogre | 800/100/0 | 90 | 18 | Barracks | Stables/Ogre Mound + Blacksmith |
| Paladin | Ogre-Mage | 800/100/0 | 90 | 18 | Barracks | Stables/Mound + Blacksmith + research |
| Ballista | Catapult | 900/300/0 | 250 | 50 | Barracks | Blacksmith + Lumber Mill |
| Mage | Death Knight | 1200/0/0 | 120 | 24 | Mage Tower / Temple | none |
| Dwarven Demolition Squad | Goblin Sappers | 700/250/0 | 200 | 40 | Inventor / Alchemist | none |
| Gnomish Flying Machine | Goblin Zeppelin | 500/100/0 | 65 | 13 | Inventor / Alchemist | Lumber Mill |
| Gryphon Rider | Dragon | 2500/0/0 | 250 | 50 | Aviary / Roost | none |
| Oil Tanker | Oil Tanker | 400/200/0 | 50 | 10 | Shipyard | none |
| Transport | Transport | 600/200/500 | 70 | 14 | Shipyard | Foundry |
| Elven Destroyer | Troll Destroyer | 700/350/700 | 90 | 18 | Shipyard | none |
| Battleship | Ogre Juggernaught | 1000/500/1000 | 140 | 28 | Shipyard | Foundry |
| Gnomish Submarine | Giant Turtle | 800/150/900 | 100 | 20 | Shipyard | Inventor / Alchemist |

Notes on the table:

- Ranger/Berserker and Paladin/Ogre-Mage are not separate purchases in the
  original game: researching the upgrade converts every existing Archer or
  Knight (Axethrower or Ogre) and the Barracks trains the new type from then
  on at the old price (section 4.4). Wargus implements this with
  `convert-to` modifiers and shows both buttons, each gated by its
  dependency.
- The Knight/Ogre Blacksmith requirement and the Flying Machine/Zeppelin
  Lumber Mill requirement are in both Wargus and MAN p.55/p.82.
- **CONFLICT, Oil Tanker lumber:** RETAIL and Wargus 200; CBN and WIKI 250.
- **CONFLICT, Demolition Squad gold:** RETAIL and Wargus 700; CBN shows
  "Cost: 750 250". WARCRAFT2.md also lists 750.
- **CONFLICT, Submarine oil:** RETAIL and Wargus 900; CBN shows 800 (its
  "Cost: 800 150 800" line). WARCRAFT2.md lists 800.

### 4.2 Combat stats

Sources: RETAIL (HP, armor, damage, range, sight, targets); WARGUS (Speed,
cycles per tile, attack cycle, min range). Dmg = Basic/Piercing. Atk = cycles
between attacks in Wargus. Tgt = RETAIL targets.

| Human / Orc | HP | Arm | Dmg | Rng | Sight | Spd | Atk | Tgt |
|---|---|---|---|---|---|---|---|---|
| Peasant / Peon | 30 | 0 | 3/2 | 1 | 4 | 10 | 25 | L |
| Footman / Grunt | 60 | 2 | 6/3 | 1 | 4 | 10 | 25 | L |
| Archer / Axethrower | 40 | 0 | 3/6 | 4 | 5 | 10 | 65 / 74 | LSA |
| Ranger / Berserker | 50 | 0 | 3/6 | 4 | 6 | 10 | 65 / 74 | LSA |
| Knight / Ogre | 90 | 4 | 8/4 | 1 | 4 | 13 | 25 | L |
| Paladin / Ogre-Mage | 90 | 4 | 8/4 | 1 | 5 | 13 | 25 | L |
| Ballista / Catapult | 110 | 0 | 80/0 | 8 | 9 | 5 | 231 | LS |
| Mage | 60 | 0 | 0/9 | 2 | 9 | 8 | 40 | LSA |
| Death Knight | 60 | 0 | 0/9 | 3 | 9 | 8 | 40 | LSA |
| Demolition Squad / Sappers | 40 | 0 | 4/2 | 1 | 4 | 11 | 25 | L |
| Flying Machine / Zeppelin | 150 | 2 | 0/0 | none | 9 | 17 | none | none |
| Gryphon Rider / Dragon | 100 | 5 | 0/16 | 4 | 6 | 14 | 190 | LSA |
| Oil Tanker (both) | 90 | 10 | 0/0 | none | 4 | 10 | none | none |
| Transport (both) | 150 | 0 | 0/0 | none | 4 | 10 | none | none |
| Destroyer (both) | 100 | 10 | 35/0 | 4 | 8 | 10 | 120 | LSA |
| Battleship / Juggernaught | 150 | 15 | 130/0 | 6 | 8 | 6 | 230 | LS |
| Submarine / Giant Turtle | 60 | 0 | 50/0 | 4 | 5 | 7 | 115 | S |

Notes:

- **Minimum range.** Wargus gives Ballista and Catapult `MinAttackRange =
  2`: they cannot fire at an adjacent target. RETAIL has no min-range field.
- **Splash.** The siege, ship and cannon missiles in Wargus
  (`missiles.lua`) deal area damage; see the combat spec.
- **In-game damage display** (CBN) is min-max after the 50-100 percent roll,
  e.g. Footman "2-9", Peasant "1-5", Mage "5-9", Dragon "8-16".
- **Weapon/armor upgradable flags** (RETAIL): melee units, archers,
  siege and warships take weapon upgrades; melee units and warships take
  armor upgrades. Mage, Death Knight, Gryphon, Dragon, Flying Machine,
  Tanker, Submarine take none. Transports take armor only. See the upgrade
  spec.
- **CONFLICT, Ballista armor:** RETAIL 0, CBN 0, WIKI 0, Wargus Catapult 0,
  but Wargus `unit-ballista` has `Armor = 5` (a Wargus data bug).
- **CONFLICT, Knight/Ogre sight:** RETAIL, Wargus and WIKI 4; CBN 5.
- **CONFLICT, Flying Machine armor:** RETAIL, Wargus, WIKI 2; CBN 0.
- **CONFLICT, Gryphon/Dragon armor:** RETAIL, Wargus, WIKI 5; CBN dragon
  page 0.
- **CONFLICT, Oil Tanker armor:** RETAIL and Wargus 10; CBN and WIKI 0.
- **CONFLICT, Submarine range:** RETAIL, Wargus, CBN, WIKI all 4. The 7 in
  WARCRAFT2.md (from unitstatistics.com) is not supported.
- **Archer vs Axethrower rate:** Wargus uses different attack animations
  (65 vs 74 cycles). RETAIL has no cooldown field, so parity is unverified.

### 4.3 Special abilities and roles

Sources: RETAIL flags; WARGUS unit definitions, `spells.lua`, buttons; MAN.

| Unit | Special rules |
|---|---|
| Peasant / Peon | Gathers gold and lumber, builds, repairs |
| Archer / Axethrower | Only early unit that hits air |
| Ranger / Berserker | +10 HP, +1 sight over Archer; unlocks 3 researches |
| Paladin / Ogre-Mage | Caster: 255 mana; see 4.5 |
| Mage / Death Knight | Caster; flees when attacked; DK is undead |
| Ballista / Catapult | Attack Ground; explodes when killed |
| Demolition Squad / Sappers | Suicide blast, 400 damage |
| Flying Machine / Zeppelin | Unarmed air scout; sees submarines |
| Gryphon Rider / Dragon | Air; sees submarines; hits all layers |
| Oil Tanker | Builds Oil Platform; hauls oil |
| Transport | Carries 6 land units |
| Destroyer | Only warship that hits air |
| Battleship / Juggernaught | Attack Ground; cannot hit air |
| Submarine / Giant Turtle | Submerged; hits ships only |

Details:

- **Peasant / Peon.** Carries 100 gold per trip; 100 lumber per trip
  (125 with a Lumber Mill; Wargus `ImproveProduction = {"wood", 25}` on the
  mill). Wargus timings: 150 cycles inside the mine, 150 cycles at the drop
  point, lumber in steps of 2 every 24 cycles (50 steps, 1200 cycles per
  load). Hall tier raises gold per trip: Keep +10, Castle +20 (Wargus
  `ImproveProduction` gold 10/20). Two build menus: Basic (Farm, Barracks,
  Town Hall, Lumber Mill, Blacksmith, Scout Tower, Wall) and Advanced
  (Shipyard, Foundry, Refinery, Inventor, Stables, Mage Tower, Church,
  Aviary) (MAN p.10; Wargus buttons `Level = 1` and `Level = 2`). Wargus
  marks it `Coward` (does not auto-attack) and auto-repairs within 4 tiles.
- **Demolition Squad / Goblin Sappers.** Wargus `spell-suicide-bomber`:
  cast on a target; the unit dies and deals 400 damage to every non-flying
  unit and building within radius 3 of the target point, friend or foe, and
  clears walls, rock and forest tiles in that radius (Stratagus
  `spell_demolish.cpp`). Air units are not hit. It also has a normal 4/2
  melee attack. MAN p.66: they "level" walls and rock.
- **Flying Machine / Zeppelin.** No attack in any source (RETAIL
  `canTarget` 0). Air layer, ignores terrain. Sees submarines. Wargus sends
  AI-built ones exploring (`OnReady = AiExploreUnit`).
- **Oil Tanker.** Only ship that costs no oil. Builds an Oil Platform on
  an Oil Patch (Wargus button on the tanker), then hauls 100 oil per trip
  (125 with a Refinery) to a Shipyard or Refinery. Wargus: 100 cycles at
  the platform, 100 at the depot. Unarmed.
- **Transport.** `MaxOnBoard = 6`, land units only (Wargus `CanTransport =
  {"LandUnit", "only"}`; MAN p.16-17). Unarmed. Unload on a coast tile.
- **Submarine / Giant Turtle.** Permanently submerged. Visible and
  targetable only by air units, towers, and other submarines (see section
  3). Attacks sea targets only (RETAIL `canTarget` = S). Its own sight still
  reveals the map normally.
- **Mage, Death Knight, Peasant, Tanker, Flying Machine.** Wargus flags
  them `Coward`: they do not auto-acquire targets. RETAIL sets "Flees when
  attacked" only on Mage and Death Knight.
- **Death Knight** is undead (RETAIL flag, Wargus `isundead`): Exorcism
  hurts it.

### 4.4 Conversion lines

Sources: WARGUS `human/upgrade.lua`, `orc/upgrade.lua` (costs, modifiers,
dependencies); MAN p.55, p.82.

| From | To | Research at | Cost G/L/O | N | Requires |
|---|---|---|---|---|---|
| Elven Archer | Elven Ranger | Elven Lumber Mill | 1500/0/0 | 250 | Keep or Castle |
| Troll Axethrower | Troll Berserker | Troll Lumber Mill | 1500/0/0 | 250 | Stronghold or Fortress |
| Knight | Paladin | Church | 1000/0/0 | 250 | Church (needs Castle) |
| Ogre | Ogre-Mage | Altar of Storms | 1000/0/0 | 250 | Altar (needs Fortress) |

- Research converts every existing unit of the old type and all later ones
  (Wargus `{"apply-to", "unit-archer"}, {"convert-to", "unit-ranger"}`).
- After conversion: Ranger/Berserker gain +10 HP and +1 sight (40 to 50,
  5 to 6); Paladin/Ogre-Mage gain +1 sight, mana and spells. Other stats
  are equal.
- Ranger-only follow-ups (require Keep + Ranger): Ranger Scouting, Longbow,
  Ranger Marksmanship. Berserker follow-ups (require Stronghold +
  Berserker): Berserker Scouting, Lighter Axes, Troll Regeneration.
- Paladin follow-ups at the Church: Healing, Exorcism. Ogre-Mage follow-ups
  at the Altar: Bloodlust, Runes.
- MAN writes the Ranger/Berserker prerequisite as "Upgrade at Keep" /
  "Upgrade at Stronghold"; the research button is on the Lumber Mill in
  Wargus and in the retail UI, gated by the hall tier.

### 4.5 Casters: mana and default spells

Sources: WARGUS `spells.lua`, `*/upgrade.lua` (`DefineAllow ... "R"` marks
a spell as already researched), `*/buttons.lua`; CBN mage/deathknight/ogre
pages.

| Caster | Mana max/start | Known at start | Learnable |
|---|---|---|---|
| Paladin | 255 / 84 | Holy Vision | Healing, Exorcism |
| Mage | 255 / 84 | Fireball | Slow, Flame Shield, Invisibility, Polymorph, Blizzard |
| Ogre-Mage | 255 / 84 | Eye of Kilrogg | Bloodlust, Runes |
| Death Knight | 255 / 84 | Death Coil | Haste, Raise Dead, Whirlwind, Unholy Armor, Death and Decay |

Mana costs and effects are in `upgrades_spells.md`. Eye of Kilrogg summons a
flying "Eye of Kilrogg" unit (100 HP, Speed 42, sight 3, 0 food, decays);
Raise Dead creates Skeletons (40 HP, 6/3, sight 3, decays).

## 5. Buildings

Human and Orc buildings have identical stats (RETAIL, WIKI).

### 5.1 Cost, time, HP, size, sight

Sources: RETAIL; WARGUS unit definitions (for the Wargus sight column);
WIKI buildings page (agrees with RETAIL on sight).

All buildings have Armor 20 except the Wall (see notes). Keep, Castle,
Guard Tower and Cannon Tower are upgrades of an existing building; their
cost is the upgrade price paid on top of the base building.

| Human | Orc | G/L/O | N | s | HP | Size | Sight |
|---|---|---|---|---|---|---|---|
| Town Hall | Great Hall | 1200/800/0 | 255 | 51 | 1200 | 4x4 | 4 |
| Keep (upgrade) | Stronghold (upgrade) | 2000/1000/200 | 200 | 40 | 1400 | 4x4 | 6 |
| Castle (upgrade) | Fortress (upgrade) | 2500/1200/500 | 200 | 40 | 1600 | 4x4 | 9 |
| Farm | Pig Farm | 500/250/0 | 100 | 20 | 400 | 2x2 | 3 |
| Barracks | Barracks | 700/450/0 | 200 | 40 | 800 | 3x3 | 3 |
| Elven Lumber Mill | Troll Lumber Mill | 600/450/0 | 150 | 30 | 600 | 3x3 | 3 |
| Blacksmith | Blacksmith | 800/450/100 | 200 | 40 | 775 | 3x3 | 3 |
| Scout Tower | Watch Tower | 550/200/0 | 60 | 12 | 100 | 2x2 | 9 |
| Guard Tower (upgrade) | Guard Tower (upgrade) | 500/150/0 | 140 | 28 | 130 | 2x2 | 9 |
| Cannon Tower (upgrade) | Cannon Tower (upgrade) | 1000/300/0 | 190 | 38 | 160 | 2x2 | 9 |
| Shipyard | Shipyard | 800/450/0 | 200 | 40 | 1100 | 3x3 | 3 |
| Foundry | Foundry | 700/400/400 | 175 | 35 | 750 | 3x3 | 3 |
| Oil Refinery | Oil Refinery | 800/350/200 | 225 | 45 | 600 | 3x3 | 3 |
| Oil Platform | Oil Platform | 700/450/0 | 200 | 40 | 650 | 3x3 | 3 |
| Stables | Ogre Mound | 1000/300/0 | 150 | 30 | 500 | 3x3 | 3 |
| Gnomish Inventor | Goblin Alchemist | 1000/400/0 | 150 | 30 | 500 | 3x3 | 3 |
| Church | Altar of Storms | 900/500/0 | 175 | 35 | 700 | 3x3 | 3 |
| Mage Tower | Temple of the Damned | 1000/200/0 | 125 | 25 | 500 | 3x3 | 3 |
| Gryphon Aviary | Dragon Roost | 1000/400/0 | 150 | 30 | 500 | 3x3 | 3 |
| Wall | Wall | 20/10/0 | 30 | 6 | 40 | 1x1 | 1 |

Notes:

- Totals for upgraded buildings: Keep 3200/1800/200 over a fresh Town Hall;
  Castle 5700/3000/700; Guard Tower 1050/350/0; Cannon Tower 1550/500/0.
- **CONFLICT, building sight:** RETAIL and WIKI give 3 for ordinary
  buildings, 4 Town Hall, 6 Keep, 9 Castle. Wargus gives 1 for ordinary
  buildings (Pig Farm 2), Town Hall 1, Keep 3 (Stronghold 2), Castle 6. Use
  RETAIL.
- **CONFLICT, Wall armor:** RETAIL 0 and WIKI 0; Wargus 20. WARCRAFT2.md
  (citing CBN combat page) says all buildings have 20 except the Wall.
  Use 0.
- Wargus also defines "super" Guard Tower, Cannon Tower and Ballista
  variants (5000/1500 gold/lumber towers, 650-800 HP) for its own scenarios.
  They are not retail units.

### 5.2 Prerequisites, production and research

Sources: WARGUS `*/upgrade.lua` (`DefineDependency`), `*/buttons.lua`;
MAN p.56, p.83 (building dependency charts), which agree.

| Building | Requires | Trains / upgrades to |
|---|---|---|
| Town Hall / Great Hall | none | Peasant/Peon; upgrade to Keep/Stronghold |
| Keep / Stronghold | Barracks | Peasant/Peon; upgrade to Castle/Fortress |
| Castle / Fortress | Lumber Mill, Blacksmith, Stables/Ogre Mound | Peasant/Peon |
| Farm / Pig Farm | none | nothing (food +4) |
| Barracks | none | Footman, Archer, Ranger, Knight, Paladin, Ballista |
| Lumber Mill | none | nothing (research only) |
| Blacksmith | none | nothing (research only) |
| Scout / Watch Tower | none | upgrade to Guard or Cannon Tower |
| Guard Tower | Lumber Mill | nothing |
| Cannon Tower | Blacksmith | nothing |
| Shipyard | Lumber Mill | Tanker, Destroyer, Transport, Battleship, Sub |
| Foundry | Shipyard | nothing (research only) |
| Oil Refinery | Shipyard | nothing |
| Oil Platform | built by a Tanker on an Oil Patch | nothing |
| Stables / Ogre Mound | Keep/Stronghold or higher | nothing |
| Inventor / Alchemist | Keep/Stronghold or higher | Flying Machine/Zeppelin, Demo Squad/Sappers |
| Church / Altar of Storms | Castle/Fortress | nothing (research only) |
| Mage Tower / Temple | Castle/Fortress | Mage / Death Knight |
| Gryphon Aviary / Dragon Roost | Castle/Fortress | Gryphon Rider / Dragon |
| Wall | none | nothing |

The Barracks row lists Human names; the Orc Barracks trains Grunt,
Axethrower, Berserker, Ogre, Ogre-Mage and Catapult. The Orc Shipyard
trains the Orc equivalents.

Research by building (names only; costs and effects are in
`upgrades_spells.md`):

- **Blacksmith (Human):** Upgrade Swords 1 and 2, Upgrade Shields 1 and 2,
  Upgrade Ballista 1 and 2.
- **Blacksmith (Orc):** Upgrade Battle Axes 1 and 2, Upgrade Shields 1 and
  2, Upgrade Catapult 1 and 2.
- **Elven Lumber Mill:** Upgrade Arrows 1 and 2, Elven Ranger Training,
  Ranger Scouting, Research Longbow, Ranger Marksmanship.
- **Troll Lumber Mill:** Upgrade Throwing Axes 1 and 2, Troll Berserker
  Training, Berserker Scouting, Research Lighter Axes, Troll Regeneration.
- **Church:** Upgrade Knights to Paladins, Healing, Exorcism.
- **Altar of Storms:** Upgrade Ogres to Ogre-Magi, Bloodlust, Runes.
- **Mage Tower:** Slow, Flame Shield, Invisibility, Polymorph, Blizzard.
- **Temple of the Damned:** Haste, Raise Dead, Whirlwind, Unholy Armor,
  Death and Decay.
- **Foundry (both):** Upgrade Cannons 1 and 2, Upgrade Ship Armor 1 and 2.
- Level-2 items require level 1 (e.g. `upgrade-sword2` needs
  `upgrade-sword1`).
- Only one research runs at a time per building, and a research cannot run
  in two buildings at once (Wargus `check-single-research`).

### 5.3 Towers

Sources: RETAIL; WARGUS unit definitions and `human/anim.lua` /
`orc/anim.lua` tower attack animations.

| Tower | HP | Dmg | Range | Atk cycles | Targets | Sees subs |
|---|---|---|---|---|---|---|
| Scout / Watch Tower | 100 | none | none | none | none | yes |
| Guard Tower | 130 | 4/12 | 6 | 60 | LSA | yes |
| Cannon Tower | 160 | 50/0 | 7 (min 2) | 151 | LS | yes |

- The Scout Tower is a lookout (sight 9) with no attack. RETAIL sets
  `canTarget` bits on it but no "Can attack" flag.
- Guard Tower fires arrows and can hit air. Cannon Tower cannot hit air and,
  in Wargus, cannot hit targets closer than 2 tiles. RETAIL has no min-range
  field, so the minimum range is Wargus-only (unverified).
- A tower is upgraded in place from a finished Scout/Watch Tower; the choice
  between Guard and Cannon is permanent.

### 5.4 Placement rules and special roles

Sources: WARGUS `BuildingRules`, `ShoreBuilding`, `CanStore`,
`ImproveProduction`; RETAIL flags; MAN p.10; PUDForge
`overrides/hall_clearance.cpp` and `overrides/oil_clearance.cpp`
(https://github.com/pudforge/PUDForge/tree/HEAD/src/PUDForgeCore/overrides).

| Building | Placement | Depot / role |
|---|---|---|
| Town Hall, Keep, Castle | Away from gold mines (see text) | Gold + lumber drop-off; +1 food |
| Farm | Land | +4 food |
| Lumber Mill | Land | Lumber drop-off; +25 lumber per load |
| Shipyard | Must touch coast | Oil drop-off; builds ships |
| Foundry | Must touch coast | Naval research only |
| Oil Refinery | Must touch coast | Oil drop-off; +25 oil per load |
| Oil Platform | On an Oil Patch in water | Oil source for Tankers |
| All others | Explored, clear land | none |

- Buildings need explored, clear ground. A green ghost shows the footprint
  and turns red on invalid ground (MAN p.10). Construction starts when the
  worker arrives; the worker goes inside until it finishes. The Oil
  Platform is built the same way by a Tanker.
- **Hall and gold mine.** Wargus: a hall must be more than 3 tiles from a
  gold mine (`Distance = 3, DistanceType = ">"`). PUDForge measured 3,013
  hall-mine pairs in 1,378 maps: the gap between footprints is never 1 or
  2; the minimum real gap is 3. Treat "at least 3 empty tiles between the
  footprints" as the rule.
- **Shipyard/Refinery and oil.** Wargus: more than 3 tiles from an Oil Patch
  or Oil Platform. PUDForge corpus: minimum gap 4 tiles for Shipyard and
  Refinery; the Foundry has no such rule (it sits 1 to 3 tiles from oil in
  Blizzard's maps).
- **Oil Platform.** Wargus `BuildingRules = {"ontop", {Type =
  "unit-oil-patch", ReplaceOnDie = true, ReplaceOnBuild = true}}`: it
  replaces the patch and the patch comes back if the platform dies.
- **Gold per trip** rises with the hall tier: Town Hall 100, Keep 110,
  Castle 120 (Wargus `ImproveProduction` 10 and 20 percent; WIKI Keep).
- **Food.** Town Hall, Keep and Castle give 1 each; Farms 4 each (MAN p.9).
  The Battle.net Edition caps food at 200 (see WARCRAFT2.md section 2).
- **Destroyed buildings** leave rubble of the same size (RETAIL ids
  106-109). Wargus uses a water rubble variant for coastal buildings.

### 5.5 Neutral map objects

Sources: RETAIL; WARGUS `units.lua`, `stratagus.lua`.

| Object | Size | HP | Notes |
|---|---|---|---|
| Gold Mine | 3x3 | 25500 | Gold per map; Wargus default 100000 |
| Oil Patch | 3x3 | none | Wargus default 50000 oil |
| Critter | 1x1 | 5 | Wanders; explodes after 10 clicks (Wargus) |
| Circle of Power | 2x2 | none | Campaign trigger tile |
| Runestone | 2x2 | 5000 | Campaign object |
| Dark Portal | 4x4 | 5000 | Campaign object |

## 6. Dependency trees

Sources: WARGUS `human/upgrade.lua`, `orc/upgrade.lua`; MAN p.55-56,
p.82-83. The two agree on every edge listed. "->" means "unlocks".

### 6.1 Human Alliance

- Town Hall (start)
  - -> Peasant
  - -> Farm
  - -> Barracks -> Footman
    - Barracks -> Keep upgrade (Town Hall -> Keep)
  - -> Elven Lumber Mill
    - -> Elven Archer (with Barracks)
    - -> Guard Tower upgrade (from Scout Tower)
    - -> Shipyard -> Oil Tanker, Elven Destroyer
      - Shipyard -> Foundry -> Transport, Battleship
      - Shipyard -> Oil Refinery
      - Oil Tanker -> Oil Platform
  - -> Blacksmith
    - -> Cannon Tower upgrade (from Scout Tower)
    - -> Ballista (with Lumber Mill, Barracks)
  - -> Scout Tower
  - -> Wall
- Keep (needs Barracks)
  - -> Stables -> Knight (with Blacksmith, Barracks)
  - -> Gnomish Inventor
    - -> Dwarven Demolition Squad
    - -> Gnomish Flying Machine (with Lumber Mill)
    - -> Gnomish Submarine (at Shipyard)
  - -> Elven Ranger research (at Lumber Mill)
    - -> Ranger Scouting, Longbow, Ranger Marksmanship
- Castle (needs Keep + Stables + Blacksmith + Lumber Mill)
  - -> Church -> Paladin research -> Paladin; Healing, Exorcism
  - -> Mage Tower -> Mage
  - -> Gryphon Aviary -> Gryphon Rider

### 6.2 Orcish Horde

- Great Hall (start)
  - -> Peon
  - -> Pig Farm
  - -> Barracks -> Grunt
    - Barracks -> Stronghold upgrade
  - -> Troll Lumber Mill
    - -> Troll Axethrower (with Barracks)
    - -> Guard Tower upgrade (from Watch Tower)
    - -> Shipyard -> Oil Tanker, Troll Destroyer
      - Shipyard -> Foundry -> Transport, Ogre Juggernaught
      - Shipyard -> Oil Refinery
      - Oil Tanker -> Oil Platform
  - -> Blacksmith
    - -> Cannon Tower upgrade (from Watch Tower)
    - -> Catapult (with Lumber Mill, Barracks)
  - -> Watch Tower
  - -> Wall
- Stronghold (needs Barracks)
  - -> Ogre Mound -> Ogre (with Blacksmith, Barracks)
  - -> Goblin Alchemist
    - -> Goblin Sappers
    - -> Goblin Zeppelin (with Lumber Mill)
    - -> Giant Turtle (at Shipyard)
  - -> Troll Berserker research (at Lumber Mill)
    - -> Berserker Scouting, Lighter Axes, Troll Regeneration
- Fortress (needs Stronghold + Ogre Mound + Blacksmith + Lumber Mill)
  - -> Altar of Storms -> Ogre-Mage research -> Ogre-Mage; Bloodlust, Runes
  - -> Temple of the Damned -> Death Knight
  - -> Dragon Roost -> Dragon

### 6.3 Hall tier gating

| Tier | Human unlocks | Orc unlocks |
|---|---|---|
| Town Hall / Great Hall | Farm, Barracks, Mill, Smith, towers, naval | Same set, Orc names |
| Keep / Stronghold | Stables, Inventor, Ranger line | Ogre Mound, Alchemist, Berserker line |
| Castle / Fortress | Church, Mage Tower, Aviary | Altar, Temple, Dragon Roost |

What each tier makes reachable, in units:

- **Town Hall tier:** Peasant, Footman, Archer, Ballista, Oil Tanker,
  Destroyer, Transport, Battleship (and the Orc equivalents). All naval
  units except the Submarine / Giant Turtle.
- **Keep / Stronghold tier:** Knight/Ogre, Demolition Squad/Sappers,
  Flying Machine/Zeppelin, Submarine/Giant Turtle, Ranger/Berserker.
- **Castle / Fortress tier:** Paladin/Ogre-Mage, Mage/Death Knight,
  Gryphon Rider/Dragon.

The Keep upgrade needs only a Barracks. The Castle upgrade needs Stables (or
Ogre Mound), Blacksmith and Lumber Mill. Buildings that need the Keep
accept the Castle as well (Wargus `"or", {"unit-castle"}`).

## 7. Wargus-only content to leave out of a faithful clone

Source: WARGUS `human/buttons.lua`, `orc/buttons.lua`, `stratagus.lua`,
unit definitions; PUDForge `overrides/hidden_units.cpp`.

- **Minuteman** (`unit-attack-peasant`, 0 cost) trainable at the Barracks,
  and the Farm "train critter" button: Wargus extensions
  (`wargus.extensions = true`). RETAIL's "Attack Peasant" and "Attack
  Peon" (ids 16-17) are campaign stand-ins that fight, not trainable units.
- **Training queues** (`SetTrainingQueue(true)`): the original trains one
  unit at a time per building.
- **Walls** are buildable in Wargus only in network games or with a debug
  option. In the original they are placed in the map editor and campaigns;
  whether players could build them in skirmish is unverified.
- **"Super" towers and Ballista/Catapult** (section 5.1 note).
- **Speed slider mapping** (section 1).

## 8. Retail unit id table (for map and data import)

Source: PUDForge `constants.cpp` `kUnits` (standard PUD unit ids).

| Ids (hex) | Units |
|---|---|
| 00-03 | Footman, Grunt, Peasant, Peon |
| 04-07 | Ballista, Catapult, Knight, Ogre |
| 08-0B | Archer, Axethrower, Mage, Death Knight |
| 0C-0F | Paladin, Ogre-Mage, Demolition Squad, Sappers |
| 10-13 | Attack Peasant, Attack Peon, Ranger, Berserker |
| 1A-21 | Tankers, Transports, Destroyers, Battleship, Juggernaught |
| 26-2B | Submarine, Turtle, Flying Machine, Zeppelin, Gryphon, Dragon |
| 3A-5B | Buildings, Human then Orc pairs, Farm (3A) to Fortress (5B) |
| 5C-5D | Gold Mine, Oil Patch |
| 60-63 | Guard Towers, Cannon Towers |
| 64-68 | Circle of Power, Dark Portal, Runestone, Walls |

For paired units and buildings the Human version has the even id and the
Orc version the odd id, except the Walls (67 Human, 68 Orc). Start
locations are 5E (Human) and 5F (Orc); 64-66 are neutral.

## 9. Conflicts between sources (summary)

| Item | RETAIL | Wargus | Other source |
|---|---|---|---|
| Real seconds per time unit | none | 6 cycles; 30 or 19 cyc/s | WIKI: N seconds |
| Oil Tanker lumber | 200 | 200 | CBN, WIKI 250 |
| Oil Tanker armor | 10 | 10 | CBN, WIKI 0 |
| Demolition Squad gold | 700 | 700 | CBN 750 |
| Submarine oil | 900 | 900 | CBN 800 |
| Ballista armor | 0 | 5 (Catapult 0) | CBN, WIKI 0 |
| Knight/Ogre sight | 4 | 4 | CBN 5 |
| Flying Machine armor | 2 | 2 | CBN 0 |
| Gryphon/Dragon armor | 5 | 5 | CBN 0 |
| Submarine range | 4 | 4 | unitstatistics.com 7 |
| Building sight | 3 (halls 4/6/9) | 1 (halls 1/3/6) | WIKI matches RETAIL |
| Wall armor | 0 | 20 | WIKI 0 |
| Ship/flyer footprint | 1x1 (64 px box) | 2x2 | none |
| Caster starting mana | none | 84 | CBN 85 |
| Zul'jin HP (ToD hero) | 40 | 120 | WIKI 40 |
| Siege move rate | none | 63 cycles/tile | 160/Speed rule gives 32 |

Resolution used in this file: RETAIL where it has the field. Unresolved:
real-time seconds per time unit, mana start (84 vs 85), footprint of ships
and flyers, siege move rate, attack cooldowns (no retail field), Cannon
Tower and siege minimum range (no retail field).

## Appendix A. Tides of Darkness campaign heroes

Source: RETAIL (stats); WARGUS (spells); WIKI (names). Not trainable in
skirmish; placed by missions. No XP, levels or items.

| Hero | Race | Base type | HP | Arm | Dmg | Rng | Sight |
|---|---|---|---|---|---|---|---|
| Anduin Lothar | Human | Knight | 90 | 4 | 8/4 | 1 | 5 |
| Uther Lightbringer | Human | Paladin | 90 | 4 | 8/4 | 1 | 5 |
| Zul'jin | Orc | Axethrower | 40 | 0 | 3/6 | 5 | 6 |
| Cho'gall | Orc | Ogre-Mage | 100 | 0 | 10/5 | 1 | 5 |
| Gul'dan | Orc | Death Knight | 40 | 0 | 0/3 | 3 | 8 |

Uther casts Paladin spells; Cho'gall has Eye of Kilrogg, Bloodlust and Runes
from the start; Gul'dan has all Death Knight spells (Wargus). Wargus gives
Lothar no spells.

## Appendix B. Beyond the Dark Portal differences

Sources: RETAIL; WARGUS; https://en.wikipedia.org/wiki/Warcraft_II:_Beyond_the_Dark_Portal

- No new trainable units, buildings or upgrades; the skirmish roster and all
  numbers above are unchanged.
- Two new 12-mission campaigns, a new Orc Swamp tileset, and ten stronger
  hero units (below). The Daemon and Deathwing appear as campaign units.

| Hero | Race | Base type | HP | Arm | Dmg | Rng | Sight |
|---|---|---|---|---|---|---|---|
| Alleria | Human | Ranger | 120 | 5 | 10/18 | 7 | 9 |
| Danath | Human | Footman | 220 | 8 | 15/8 | 1 | 6 |
| Turalyon | Human | Paladin | 180 | 10 | 14/5 | 1 | 6 |
| Khadgar | Human | Mage | 120 | 3 | 0/16 | 6 | 9 |
| Kurdran and Sky'ree | Human | Gryphon Rider | 250 | 6 | 0/25 | 5 | 9 |
| Grom Hellscream | Orc | Grunt | 240 | 8 | 16/6 | 1 | 5 |
| Kargath Bladefist | Orc | Grunt | 240 | 8 | 16/6 | 1 | 5 |
| Dentarg | Orc | Ogre-Mage | 300 | 8 | 18/6 | 1 | 6 |
| Teron Gorefiend | Orc | Death Knight | 180 | 2 | 0/16 | 4 | 9 |
| Deathwing | Orc | Dragon | 800 | 10 | 10/25 | 5 | 9 |

Other BDP units in RETAIL: Daemon (air, 60 HP, armor 2, 9/1, range 2,
sight 5). **CONFLICT:** Wargus gives the Daemon armor 3, damage 10/2 and
range 3. The Dark Portal (4x4, 5000 HP) is the campaign's centrepiece
object.
