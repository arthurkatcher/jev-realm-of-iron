# Warcraft II: upgrades, research and spells (reference spec)

This file lists every research, upgrade and spell in Warcraft II: Tides of
Darkness for both races. It gives enough detail to reproduce them, and it
names the source for each section. Where sources disagree, the conflict is
marked **CONFLICT** and a default is picked for implementation.

## 0. Sources and conventions

| Tag | Source |
|---|---|
| WG | Wargus scripts (data extracted from the original game) |
| ST | Stratagus engine source (runs the Wargus data) |
| CBN | classic.battle.net Warcraft II unit pages (Blizzard) |
| WIKI | warcraft.wiki.gg Warcraft II building and unit pages |
| MAN | Warcraft II Battle.net Edition manual (Blizzard, 1999) |

URLs:

- WG: https://raw.githubusercontent.com/Wargus/wargus/master/scripts/human/upgrade.lua,
  .../scripts/orc/upgrade.lua, .../scripts/spells.lua, .../scripts/missiles.lua,
  .../scripts/human/buttons.lua, .../scripts/orc/buttons.lua,
  .../scripts/human/units.lua, .../scripts/orc/units.lua, .../scripts/units.lua
- ST: https://github.com/Wargus/stratagus/tree/master/src (files cited inline)
- CBN: http://classic.battle.net/war2/units/mage.shtml, .../paladin.shtml,
  .../ogre.shtml, .../deathknight.shtml, .../archer.shtml
- WIKI: https://warcraft.wiki.gg/wiki/Blacksmith_(WC2_Human),
  https://warcraft.wiki.gg/wiki/Blacksmith_(WC2_Orc),
  https://warcraft.wiki.gg/wiki/Elven_Lumber_Mill_(Warcraft_II),
  https://warcraft.wiki.gg/wiki/Troll_Lumber_Mill_(Warcraft_II),
  https://warcraft.wiki.gg/wiki/Foundry_(WC2_Human),
  https://warcraft.wiki.gg/wiki/Church_(Warcraft_II),
  https://warcraft.wiki.gg/wiki/Altar_of_Storms_(Warcraft_II),
  https://warcraft.wiki.gg/wiki/Mage_Tower_(Warcraft_II),
  https://warcraft.wiki.gg/wiki/Temple_of_the_Damned_(Warcraft_II),
  https://warcraft.wiki.gg/wiki/Gnomish_Inventor_(Warcraft_II),
  https://warcraft.wiki.gg/wiki/Mage_(Warcraft_II),
  https://warcraft.wiki.gg/wiki/Paladin_(Warcraft_II),
  https://warcraft.wiki.gg/wiki/Ogre-Mage_(Warcraft_II),
  https://warcraft.wiki.gg/wiki/Death_Knight_(Warcraft_II)
- MAN: http://ftp.blizzard.com/pub/misc/Warcraft%202%20Battlenet%20edition.PDF
  (spell text on pp. 48-50 and 75-78)

### 0.1 Time units and seconds

- Research, training, construction and upgrade times are given in the game's
  own **time units**, e.g. 200 or 250. CBN calls them "Time Units". WIKI
  prints the same numbers but labels them "seconds", which is wrong.
- ST runs at `CYCLES_PER_SECOND = 30` (src/include/settings.h). This is
  Wargus's default game speed (`GameSpeed = 30` in scripts/stratagus.lua).
  Research, train and upgrade-to add 1 time unit, then wait
  `CYCLES_PER_SECOND / 6` = 5 cycles (src/action/action_research.cpp,
  action_train.cpp, action_upgradeto.cpp). So **1 time unit = 1/6 s** at
  default speed, and **seconds = units / 6**.
- Spell durations in WG are in **game cycles**, so **seconds = cycles / 30**.
  The spell-effect variables Haste, Slow, Bloodlust, Invisible and
  UnholyArmor drop by 1 every cycle (`HandleBuffsEachCycle`,
  src/action/actions.cpp). Summon `time-to-live` and missile `ttl` also
  count cycles.
- No source consulted says how the original's "Normal" speed maps to wall
  clock time. This spec treats Wargus's 30 cycles/s as Normal. **CONFLICT
  hint:** CBN says Runes last "about 2 minutes on slowest"; WG gives 2000
  cycles, which is 66.7 s at 30 cycles/s. That implies the slowest speed is
  about half of Normal, which fits a speed scale but is unverified.

Conversion used below: 100 u = 16.7 s, 150 u = 25 s, 200 u = 33.3 s,
250 u = 41.7 s.

### 0.2 Mana (all casters)

| Property | Value | Source |
|---|---|---|
| Max mana | 255 | WG spells.lua `Mana Max = 255`; CBN; WIKI |
| Starting mana (new unit) | 85 (CBN) / 84 (WG) | **CONFLICT**, use 85 |
| Regeneration | +1 mana per second | WG `Increase = 1`, ST applies each second |
| Casters | Paladin, Mage, Ogre-Mage, Death Knight | WG units.lua |

Mana regenerates in ST through `HandleBuffsEachSecond`, which adds
`Increase` once per 30 cycles. Units converted by research (Knight to
Paladin, Ogre to Ogre-Mage) keep their unit and gain a mana bar. The mana
value a converted unit starts with is not documented; WG uses the variable
default (84).

### 0.3 Research rules (engine)

- Each building researches one thing at a time. The level-1 and level-2
  buttons sit in the same slot: level 2 replaces level 1 once level 1 is
  done. All WG research buttons use `check-single-research`, so one
  upgrade cannot run in two buildings at once.
- Cancelling a research refunds it and resets its progress (ST
  `COrder_Research::Cancel`).
- An upgrade is player-wide. It applies at once to existing units and to
  units trained later. A `convert-to` upgrade (Ranger, Berserker, Paladin,
  Ogre-Mage) changes every existing unit of the old type into the new type,
  and the old type's train button then makes the new type.
- Upgrade icons on unit portraits step up with the level (e.g. sword1 to
  sword2 to sword3 in WG buttons.lua).

## 1. Upgrade catalog

Source: WG human/upgrade.lua and orc/upgrade.lua (costs are
`{time, gold, wood, oil}`), `DefineModifier` for effects,
`DefineDependency` for prerequisites, and buttons.lua for the researching
building and the hotkey. Checked against WIKI and CBN (links in section 0).
Time is given as units / seconds.

### 1.1 Blacksmith (Human) / Blacksmith (Orc)

| Upgrade (Human / Orc) | Lvl | Gold/Lum/Oil | Time u / s | Key |
|---|---|---|---|---|
| Upgrade Swords / Upgrade Weapons (axes) | 1 | H 800/0/0; O 500/100/0 | 200 / 33.3 | W |
| Upgrade Swords / Upgrade Weapons (axes) | 2 | H 2400/0/0; O 1500/300/0 | 250 / 41.7 | W |
| Upgrade Shields (both) | 1 | 300/300/0 | 200 / 33.3 | S |
| Upgrade Shields (both) | 2 | 900/500/0 | 250 / 41.7 | S |
| Upgrade Ballista / Upgrade Catapult | 1 | 1500/0/0 | 250 / 41.7 | B (H) / C (O) |
| Upgrade Ballista / Upgrade Catapult | 2 | 4000/0/0 | 250 / 41.7 | B (H) / C (O) |

The human and orc weapon upgrades really do cost different amounts: WG,
WIKI and CBN all agree that Swords cost 800 and 2400 gold and orc axes cost
500 gold + 100 lumber and 1500 gold + 300 lumber.

Effects (WG `DefineModifier`):

| Upgrade | Per level | Applies to (standard units) |
|---|---|---|
| Swords / Weapons | +2 Piercing Damage | Footman, Knight, Paladin, Dwarven Demolition Squad |
| Swords / Weapons (Orc) | +2 Piercing Damage | Grunt, Ogre, Ogre-Mage, Goblin Sappers |
| Shields | +2 Armor | same unit lists as the weapon upgrade |
| Ballista / Catapult | +15 Piercing Damage | Ballista / Catapult |

Weapon and shield bonuses also apply to the campaign hero variants of
these units (WG lists them). **CONFLICT:** WIKI says Shields affect only
Footman, Knight and Paladin (Grunt, Ogre and Ogre-Mage for Orcs), but WG
also applies them to Dwarves and Sappers. Use the WIKI list; it is a minor
difference.

Prerequisites: a Blacksmith, plus level 1 for level 2. WG sets no
hall-tier requirement for any Blacksmith upgrade.

### 1.2 Elven Lumber Mill (Human) / Troll Lumber Mill (Orc)

| Upgrade (Human / Orc) | Gold/Lum | Time u / s | Key H/O | Requires |
|---|---|---|---|---|
| Upgrade Arrows / Throwing Axes 1 | 300/300 | 200 / 33.3 | U / U | Lumber Mill |
| Upgrade Arrows / Throwing Axes 2 | 900/500 | 250 / 41.7 | U / U | level 1 |
| Elven Ranger / Troll Berserker Training | 1500/0 | 250 / 41.7 | R / B | Keep or Castle (Stronghold/Fortress) |
| Ranger / Berserker Scouting | 1500/0 | 250 / 41.7 | S / S | Keep+ and Ranger/Berserker training |
| Longbow / Lighter Axes | 2000/0 | 250 / 41.7 | L / A | Keep+ and Ranger/Berserker training |
| Ranger Marksmanship | 2500/0 | 250 / 41.7 | M | Keep+ and Ranger training |
| Berserker Regeneration | 3000/0 | 250 / 41.7 | R | Stronghold+ and Berserker training |

Effects:

| Upgrade | Effect (WG) |
|---|---|
| Arrows / Throwing Axes (each level) | +1 Piercing Damage: Archer, Ranger / Axethrower, Berserker |
| Ranger Training | Archers become Rangers (HP 40 to 50, sight 5 to 6) |
| Berserker Training | Axethrowers become Berserkers (HP 40 to 50, sight 5 to 6) |
| Ranger / Berserker Scouting | +3 Sight Range (6 to 9) |
| Longbow (H) | +1 Attack Range (4 to 5); WG also gives +1 Sight |
| Lighter Axes (O) | +1 Attack Range (4 to 5) |
| Ranger Marksmanship (H) | +3 Piercing Damage |
| Berserker Regeneration (O) | HP regen, WG: +1 HP every 2 s |

Notes and conflicts:

- CBN puts the Ranger/Berserker training gain as "Hit Points +10" and
  Scouting as "Sight: 9"; the button tooltips in WG read "(Sight:9)". Both
  agree with the WG unit stats. The trained unit also costs the same as
  before (500 gold, 50 lumber, 70 u).
- **CONFLICT (Longbow sight):** WG's Longbow adds +1 Sight as well as +1
  Range. That would make Scouting plus Longbow give sight 10, while CBN and
  WIKI give Longbow +1 range only. Use range only.
- **CONFLICT (Regeneration rate):** WIKI and CBN say only "slowly regain
  lost HP". WG uses `regeneration-rate 1, regeneration-frequency 2`, which
  ST applies as +1 HP whenever `(GameCycle/30) % 2 == 0`, i.e. +1 HP every
  2 s. Use WG.
- WIKI and CBN list no prerequisites for the Mill upgrades beyond the
  building. The Keep/Stronghold gate for Ranger/Berserker training comes
  from WG, and a WIKI search snippet says Ranger Training "requires Keep",
  which agrees.

### 1.3 Foundry (Human) / Foundry (Orc)

| Upgrade (both races) | Lvl | Gold/Lum/Oil | Time u / s | Key |
|---|---|---|---|---|
| Upgrade Cannons | 1 | 700/100/1000 | 200 / 33.3 | C |
| Upgrade Cannons | 2 | 2000/250/3000 | 250 / 41.7 | C |
| Upgrade Ship Armor | 1 | 500/500/0 | 200 / 33.3 | A |
| Upgrade Ship Armor | 2 | 1500/900/0 | 250 / 41.7 | A |

| Upgrade | Per level | Applies to |
|---|---|---|
| Cannons | +5 Piercing Damage | Destroyer, Battleship/Juggernaught, Submarine/Turtle |
| Ship Armor | +5 Armor | Destroyer, Battleship/Juggernaught, Transport |

**CONFLICT:** WIKI lists only Destroyers and Battleships for Cannons. WG
also includes the Gnomish Submarine and Giant Turtle. Oil tankers get
neither upgrade.

### 1.4 Gnomish Inventor / Goblin Alchemist

These buildings have **no research**. They only train the Flying Machine
or Zeppelin and the Dwarven Demolition Squad or Goblin Sappers, and they
unlock the Submarine or Turtle at the Shipyard (WIKI Gnomish Inventor page;
WG buttons.lua has no research buttons for `unit-inventor` or
`unit-alchemist`). The Shipyard, Barracks, Stables/Ogre Mound,
Gryphon Aviary/Dragon Roost, Farm and Refinery also have no research.

### 1.5 Hall and tower upgrades (building "upgrade-to")

Source: WG human/units.lua, orc/units.lua (costs), upgrade.lua
(dependencies), buttons.lua (keys).

| Upgrade (Human / Orc) | From | Gold/Lum/Oil | Time u / s | Key | Requires |
|---|---|---|---|---|---|
| Keep / Stronghold | Town Hall / Great Hall | 2000/1000/200 | 200 / 33.3 | K / S | Barracks |
| Castle / Fortress | Keep / Stronghold | 2500/1200/500 | 200 / 33.3 | C / F | Stables/Ogre Mound, Blacksmith, Lumber Mill |
| Guard Tower | Scout / Watch Tower | 500/150/0 | 140 / 23.3 | G | Lumber Mill |
| Cannon Tower | Scout / Watch Tower | 1000/300/0 | 190 / 31.7 | C | Blacksmith |

Resulting stats (WG): Keep/Stronghold 1400 HP, Castle/Fortress 1600 HP
(Town Hall 1200). Guard Tower: 130 HP, 4 basic + 12 piercing damage, range
6, arrow. Cannon Tower: 160 HP, 50 basic damage, range 2 to 7 (minimum
range 2), splash cannon. Scout Tower: 100 HP, no attack, sight 9.

Tier gates set by the halls (WG `DefineDependency`):

| Needs Keep/Stronghold or better | Needs Castle/Fortress |
|---|---|
| Stables / Ogre Mound | Church / Altar of Storms |
| Gnomish Inventor / Goblin Alchemist | Mage Tower / Temple of the Damned |
| Ranger / Berserker training and follow-ups | Gryphon Aviary / Dragon Roost |

### 1.6 Caster conversions and spell research

#### Church (Human), Altar of Storms (Orc)

| Research (Human / Orc) | Gold | Time u / s | Key | Requires |
|---|---|---|---|---|
| Upgrade Knights to Paladins / Ogres to Ogre-Mages | 1000 | 250 / 41.7 | P / M | Church/Altar (Castle/Fortress) |
| Healing / Bloodlust | 1000 | 200 / 33.3 (H); 100 / 16.7 (O) | H / B | Paladin / Ogre-Mage upgrade |
| Exorcism / Runes | 2000 (H) / 1000 (O) | 200 / 33.3 (H); 150 / 25 (O) | E / R | Paladin / Ogre-Mage upgrade |

- The conversion changes every Knight into a Paladin (sight 4 to 5, gains
  mana and spells; HP 90, armor 4 and damage 8/4 stay the same) or every
  Ogre into an Ogre-Mage (the same changes). Afterwards the Stables or
  Ogre Mound trains the new type directly.
- **Free spells.** Holy Vision (Paladin) and Eye of Kilrogg (Ogre-Mage) come
  with the conversion; they are never researched. WG marks both as
  researched from the start (`DefineAllow ... "R"`), and they appear once
  the caster exists. WIKI: "The Ogre-Mage upgrade automatically grants the
  Eye of Kilrogg spell".
- **CONFLICT (Bloodlust time):** WIKI gives 200; WG and CBN
  ("Time to Upgrade: 100") give 100. Use 100.
- None of these costs lumber. WG, WIKI and CBN agree on gold-only costs.

#### Mage Tower (Human), Temple of the Damned (Orc)

These buildings train the caster (Mage or Death Knight, 1200 gold, 120 u)
and research its spells. No spell here has a prerequisite beyond the
building. One spell per race is known from the start: Fireball for the
Mage and Death Coil for the Death Knight (WG `DefineAllow "R"`; CBN "Cost:
Free").

| Spell research (Human) | Gold | Time u / s | Key |
|---|---|---|---|
| Fireball | free (default) | n/a | F (cast) |
| Slow | 500 | 100 / 16.7 | O |
| Flame Shield | 1000 | 100 / 16.7 | L |
| Invisibility | 2500 | 200 / 33.3 | I |
| Polymorph | 2000 | 200 / 33.3 | P |
| Blizzard | 2000 | 200 / 33.3 | B |

| Spell research (Orc) | Gold | Time u / s | Key |
|---|---|---|---|
| Death Coil | free (default) | n/a | C (cast) |
| Haste | 500 | 100 / 16.7 | H |
| Raise Dead | 1500 | 100 / 16.7 | R |
| Whirlwind | 1500 | 150 / 25 | W |
| Unholy Armor | 2500 | 200 / 33.3 | U |
| Death and Decay | 2000 | 200 / 33.3 | D |

All of these values agree across WG, WIKI and CBN.

### 1.7 Complete list, count check

- Human: 6 Blacksmith, 6 Lumber Mill, 4 Foundry, 3 Church (Paladin, Healing,
  Exorcism) and 5 Mage Tower researches, 24 in total. Also 2 hall
  upgrades and 2 tower upgrades.
- Orc: 6 Blacksmith, 6 Lumber Mill, 4 Foundry, 3 Altar (Ogre-Mage,
  Bloodlust, Runes) and 5 Temple researches, 24 in total. Also 2 hall
  upgrades and 2 tower upgrades.
- Free spells: Holy Vision, Fireball, Eye of Kilrogg, Death Coil.

## 2. Spells

Sources: WG spells.lua (mana, range, target, action, condition), WG
missiles.lua (missile class and damage), ST spell/missile sources (how they
run), CBN and WIKI (numbers of the original), MAN (rules as written). Range
is in tiles. Durations are converted at 30 cycles/s.

### 2.1 Summary table

| Spell | Caster | Mana | Range | Target | Duration |
|---|---|---|---|---|---|
| Holy Vision | Paladin | 70 | unlimited | map position | brief reveal, terrain stays explored |
| Healing | Paladin | 6 per HP | 6 | friendly organic unit | instant |
| Exorcism | Paladin | 4 per HP | 10 | undead unit | instant |
| Fireball | Mage | 100 | 8 (WG) / 10 (CBN) | position (line) | instant |
| Slow | Mage | 50 | 10 | unit | 1000 cyc = 33.3 s |
| Flame Shield | Mage | 80 (CBN) / 50 (WG) | 6 | ground unit | 600 cyc = 20 s |
| Invisibility | Mage | 200 | 6 | unit | 2000 cyc = 66.7 s |
| Polymorph | Mage | 200 | 10 | organic unit | permanent |
| Blizzard | Mage | 25 per wave | 12 | area (position) | repeats while mana lasts |
| Eye of Kilrogg | Ogre-Mage | 70 | 6 | position | 765 cyc = 25.5 s |
| Bloodlust | Ogre-Mage | 50 | 6 | organic unit | 1000 cyc = 33.3 s |
| Runes | Ogre-Mage | 200 | 10 | position | 2000 cyc = 66.7 s |
| Death Coil | Death Knight | 100 | 10 | unit/position | instant |
| Haste | Death Knight | 50 | 6 | unit | 1000 cyc = 33.3 s |
| Raise Dead | Death Knight | 50 per skeleton | 6 | corpse position | skeleton TTL 120 s (WG) |
| Whirlwind | Death Knight | 100 | 12 | position | 800 cyc = 26.7 s |
| Unholy Armor | Death Knight | 200 (CBN) / 100 (WG) | 6 | unit | 500 cyc = 16.7 s |
| Death and Decay | Death Knight | 25 per wave | 12 | area (position) | repeats while mana lasts |

Hotkeys and button slots (WG buttons.lua):

| Caster | Spell buttons (slot: key) |
|---|---|
| Paladin | 7 Holy Vision: V, 8 Healing: H, 9 Exorcism: E |
| Mage | 4 Fireball: F, 5 Slow: O, 6 Flame Shield: L |
| Mage | 7 Invisibility: I, 8 Polymorph: P, 9 Blizzard: B |
| Ogre-Mage | 7 Eye of Kilrogg: K, 8 Bloodlust: B, 9 Runes: R |
| Death Knight | 4 Death Coil: C, 5 Haste: H, 6 Raise Dead: R |
| Death Knight | 7 Whirlwind: W, 8 Unholy Armor: U, 9 Death and Decay: D |

A spell button appears only after the spell is researched (WG
`Allowed = "check-upgrade"`). A cast that lacks mana is refused. A caster
that is ordered to cast out of range walks into range first.

### 2.2 Mana-cost conflicts

| Spell | CBN / WIKI | WG | Use |
|---|---|---|---|
| Flame Shield | 80 | 50 | 80 |
| Unholy Armor | 200 (CBN, WIKI; bench WARCRAFT2.md) | 100 | 200 |
| Fireball range | 10 | 8 | 10 |

A web-search summary also said Unholy Armor costs 100 mana, but the
primary Blizzard page (CBN) says 200. Use 200.

### 2.3 Paladin spells (Human)

**Holy Vision.** Free with the Paladin upgrade. 70 mana, unlimited range,
targets any map position. WG summons an invisible `unit-revealer`
(SightRange 12, i.e. a radius of about 12 tiles) at the target for 25 cycles
(0.8 s). WIKI says the reveal lasts "3 seconds". MAN: "When this spell dims,
the Paladin maintains knowledge of the lands he has seen, although he loses
sight of the denizens". So the terrain stays explored (shown under fog) and
units are no longer seen. Suggested implementation: 12-tile radius, 3 s of
full vision, then fog. Visual: a short sparkle (`missile-normal-spell`) at
the target point.

**Healing.** Research at Church (1000 gold). 6 mana per HP restored, range
6. Target: a friendly (WG autocast: allied), organic, non-building unit
below max HP. WIKI: "not usable on caster". WG `adjust-vitals` heals
`min(missing HP, mana / 6)` HP in one cast and charges 6 mana for each HP.
Ships, machines (Ballista, Catapult, Flying Machine, Zeppelin) and
buildings cannot be healed. Visual: `missile-heal-effect` (48x48, 10
frames) drawn on the target.

**Exorcism.** Research at Church (2000 gold). 4 mana per HP of damage, range
10. Target: undead units only (Death Knights, Skeletons; WG
`isundead only`). WG deals `min(target HP, mana / 4)` damage in one cast,
so it kills outright if the mana covers the target's HP. CBN: about 63.75
damage with 255 mana (255 / 4). MAN says Exorcism can hit "entire groups",
with less damage to each undead the more it hits, and that the Paladin needs
a rest afterwards. WG only does the single-target version; group damage
from the original is not quantified in any source. Visual:
`missile-exorcism` (48x48, 10 frames) on the target.

### 2.4 Mage spells (Human)

Base attack (not a spell, no mana): Lightning, 0 basic + 9 piercing damage
(ignores armor), range 2 (WG; MAN "strike their victims regardless of any
armor").

**Fireball.** Known from the start. 100 mana, range 10 (CBN, WIKI) or 8
(WG). Aimed at a position. A fireball flies in a straight line and damages
everything along its path (WIKI: "Powerful line attack"; MAN: "slamming its
fiery bulk into whatever stands in its path"). CBN: "average was about 34
damage" per unit hit. WG approximates this with a
`point-to-point-bounce` missile: 5 bounces, damage 20 per impact, impact
area 3x3 tiles, with damage halved for each tile away from the centre
(SplashFactor 2). Suggested implementation: a projectile along the line
from caster to target that deals about 34 (range 20 to 48) to each
non-air unit it passes, friendly units included. Visual: a fireball
sprite, then an explosion at each impact.

**Slow.** Research 500 gold. 50 mana, range 10. Target any non-building
unit that is not already slowed. For 1000 cycles (33.3 s) it doubles every
animation wait (ST `animation_wait.cpp`: `Wait <<= 1`). That halves
movement speed and attack rate (CBN: "movement speed and attack speed are
cut in half"). Casting Slow removes Haste from the target. Visual: the
normal spell sparkle and a status icon on the unit.

**Flame Shield.** Research 1000 gold. 80 mana (CBN, WIKI) or 50 (WG), range
6. Target: a non-building, non-air unit, friendly or enemy (WIKI: "Affects
both friend and foe"). WG spawns 5 flame missiles that circle the target
(36 positions per circle, following the unit) for 600 cycles (20 s). Each
missile deals 1 damage every 8 cycles to every unit within 1 tile of the
target (ST `missile_flameshield.cpp`). That is 5 damage per 8 cycles,
about 18.75 damage per second in total. It ignores armor. The shield ends
early if the target dies. In WG, extra casts on the same target stack.
MAN: "Flame Shield will deliver damage to any grounded barrier that it
comes into contact with" (so it also damages walls and buildings next to
the target). Visual: a spinning helix of 5 flames (32x48 sprite, 6
frames) around the unit.

**Invisibility.** Research 2500 gold. 200 mana, range 6. Target any
non-building unit. It lasts 2000 cycles (66.7 s). It ends early when the
unit attacks, casts or does any task other than moving (MAN: "may not
perform any tasks such as attacking, harvesting or spellcasting ... any
fashion more aggressive than simple movement, the Invisibility will be
dispelled"; ST calls `UnHideUnit` on attack). Enemies cannot see or target
the unit. WIKI: "Computer-controlled players can always see your units",
which is a quirk of the original AI. No source lists detectors for
it; treat the unit as hidden from all human enemies. Visual: the unit is drawn semi-transparent for its owner and
hidden from others.

**Polymorph.** Research 2000 gold. 200 mana, range 10. Target: any organic
unit (not ships, machines, buildings or the Eye; WIKI: "ships and machines
are immune"), friend or foe. The target is removed with no corpse and
replaced by a neutral critter (WG `unit-critter`: 5 HP, speed 3, no
control) on the same tile. The effect is permanent. The caster's player
gets kill credit and score. The critter depends on the tileset (sheep,
pig, seal, boar). MAN says "possessing a greater stamina does decrease the
possibility of this enchantment taking effect". **CONFLICT:** WG and
WIKI treat it as always successful; use always succeeds. Visual: a
sparkle, then the critter sprite appears.

**Blizzard.** Research 2000 gold. 25 mana per wave, range 12, targets a
position. WG `area-bombardment` has `fields 5, shards 11`. Each wave picks
5 random tiles within the 5x5 area centred on the target, and 11 ice
shards fall on each tile one after another, starting 4 tiles up and to
the left. Each shard deals `Rand(10)` (0 to 9) damage, ignoring armor, to
units on the impact tile (missile Range 1). `repeat-cast`: the Mage keeps
casting waves at the same spot, paying 25 mana each, until it runs out of
mana or gets a new order. Friendly units are hit; WIKI says the caster
itself is immune. Blizzard damages buildings as well (it is used to raze
bases). Visual: falling ice shards (32x32, 4 frames) with impact sounds.

### 2.5 Ogre-Mage spells (Orc)

Base attack: melee, 8 basic + 4 piercing (same as the Ogre).

**Eye of Kilrogg.** Free with the Ogre-Mage upgrade. 70 mana, range 6 (WG),
targets a position. It summons an `unit-eye-of-vision` owned by the caster:
flying, HP 100, speed 42 (very fast), sight 3, uses no food, cannot attack
in practice. The player controls it like a unit. WG gives it a TTL of 765
cycles (25.5 s). MAN: "The Eye will vanish after a time, leaving the
Ogre-Mage with the knowledge of the terrain". CBN: it "can draw enemy
fire" (enemies can attack it). Visual: a floating eye sprite.

**Bloodlust.** Research 1000 gold, 100 u. 50 mana, range 6. Target: an
organic unit that is not already bloodlusted (WG `organic only`; ships and
machines are excluded). For 1000 cycles (33.3 s) the unit's **basic and
piercing damage are both doubled** before armor is subtracted. ST
`CalculateDamageStats`:
`basic *= 2; piercing *= 2; dmg = max(basic - armor, 1) + piercing`, then
`dmg -= rand % ((dmg + 2) / 2)`. WIKI: "doubling its Basic and Piercing
Damage". Attack speed does not change. Visual: the unit is tinted red or
shows a red glow.

**Runes.** Research 1000 gold, 150 u. 200 mana, range 10, targets a
position (not on a building). It places 5 rune mines in a plus shape: on
the target tile and on the 4 tiles next to it (up, down, left, right). Each
mine lasts 2000 cycles (66.7 s; CBN "about 2 minutes on slowest"; WIKI
"approximately two minutes"). The first non-flying unit of any owner,
including the caster's own units (`CanHitOwner = true`), to step on a
rune's tile sets it off. It explodes for **50 damage** (CBN: "exactly 50
hit points"), ignoring armor, on that tile. WIKI: the cost is "40 less per
failed rune" when a rune cannot be placed (e.g. on water), i.e. 40 mana
per rune. MAN: runes also explode when they expire, and they are faintly
visible to watchful enemies. They blink every 15 s (CBN). WG does not
explode runes on expiry. Visual: a small 16x16 blinking rune on the
ground, and an explosion when set off.

### 2.6 Death Knight spells (Orc)

Base attack: Touch of Darkness, 0 basic + 9 piercing damage, range 3 (WG).
CBN: damage 5-9, range 3.

**Death Coil.** Known from the start. 100 mana, range 10. It deals **50
damage** that ignores armor to the target and **heals the caster by the
same amount**, up to the caster's max HP (WIKI: "removes 50 Hit Points
from any enemy unit except ships and machines ... and heals the Death
Knight for the same amount"; ST `missile_deathcoil.cpp`). Valid targets
are living (organic) units only. MAN calls it a "field of dark energy",
and some accounts split the damage across a group near the target point;
no source quantifies that. Use single target. Visual: a dark green homing
skull (the touch-of-death sprite, 30 frames).

**Haste.** Research 500 gold, 100 u. 50 mana, range 6. Target any
non-building unit that is not already hasted. For 1000 cycles (33.3 s) it
halves every animation wait (ST `Wait >>= 1` when the wait is above 1), so
the unit moves and attacks about twice as fast. Casting Haste removes
Slow. **CONFLICT:** WIKI says Haste "increases movement speed; doubles
attack speed for Dragons and Gryphons only". WG speeds up everything.
Use: double movement speed for all units, double attack speed only for
flyers, to match the original. Visual: sparkle.

**Raise Dead.** Research 1500 gold, 100 u. 50 mana per skeleton, range 6,
targets a position. It needs a corpse of a non-building unit (dying unit or
body) within the 3x3 area around the target. The corpse is used up and a
Skeleton appears there, owned by the caster. `repeat-cast`: the spell goes
on raising one skeleton per 50 mana while corpses and mana remain (WIKI:
"summons up to five Skeletons", the most 255 mana pays for). Skeleton (WG):
HP 40, 6 basic + 3 piercing, armor 0, speed 8, sight 3, melee, undead (so
Exorcism hurts it), uses 1 food. **CONFLICT on lifetime:** WG TTL is 3600
cycles (120 s); WIKI says "Permanent (until killed)"; the bench gap map
cites "skeletons fall apart after ~10 min". Use permanent. Visual: the
skeleton climbs up out of the corpse.

**Whirlwind.** Research 1500 gold, 150 u. 100 mana, range 12, targets a
position. It spawns an uncontrollable tornado that lasts 800 cycles (26.7
s). Every 100 cycles (3.3 s) it picks a new random point within +/-2 tiles
of its current tile and drifts slowly (2 px per cycle) towards it. It hits
10 times per second for **3 damage** per hit (ignores armor) to everything
in the 3x3 area under it (missile Range 2), buildings and ships included.
That is about 30 damage per second. In ST the hit test is
`!(TTL % CYCLES_PER_SECOND / 10)`, which fires on 10 of every 30 cycles.
WIKI: building damage needs direct contact. MAN: units caught inside cannot
be given commands while trapped; WG does not implement this. Visual: a
grey tornado (56x56, 4 frames).

**Unholy Armor.** Research 2500 gold, 200 u. 200 mana (CBN, WIKI) or 100
(WG), range 6. Target any non-building unit, friend or foe. It first
removes **half the target's current HP** (`max(1, floor(HP / 2))`), then
makes the target **invulnerable** for 500 cycles (16.7 s): all damage is
ignored and enemies will not auto-target it (ST unit.cpp checks
`UNHOLYARMOR_INDEX`). "Volatile" units (WG flag, used by
sappers/demolition) die instead. WIKI: it "does not protect against
Polymorph". Visual: a dark shimmering aura on the unit.

**Death and Decay.** Research 2000 gold, 200 u. 25 mana per wave, range
12, targets a position. It works like Blizzard: 5 random tiles in the 5x5
area around the target, 11 rot clouds per tile, each dealing `Rand(10)`
(0 to 9) damage to its tile, ignoring armor. The clouds rise in place
(`missile-class-stay`, 32x32, 8 frames) instead of falling. `repeat-cast`
until mana runs out. MAN: it consumes "flesh, bone, wood or even the
strongest metal", so it damages buildings, ships and machines. Friendly
units are hit; the caster is immune (WIKI). Visual: dark swirling clouds.

### 2.7 Condition flags used above (WG)

| Flag | Units |
|---|---|
| organic | all living land units and flyers (Gryphon, Dragon) |
| not organic | ships, siege, Flying Machine, Zeppelin, buildings |
| isundead | Death Knight, Skeleton |
| volatile | Dwarven Demolition Squad, Goblin Sappers (WG) |

## 3. Implementation defaults (one line each)

- Time: 1 research unit = 1/6 s; spell cycles / 30 = seconds.
- Mana: max 255, start 85, +1 per second; casting is refused below cost.
- Use CBN mana costs where they conflict with WG: Flame Shield 80, Unholy
  Armor 200.
- Buff timers: Slow, Haste and Bloodlust 33.3 s; Invisibility 66.7 s;
  Unholy Armor 16.7 s; Flame Shield 20 s; Runes 66.7 s; Eye 25.5 s;
  Whirlwind 26.7 s.
- Area spells (Blizzard, Death and Decay) repeat while mana lasts and hurt
  friends; Runes hit their own side.
- Weapon upgrades add to piercing damage and shields add armor; both apply
  at once to every existing unit.
