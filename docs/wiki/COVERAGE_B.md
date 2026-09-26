# Warcraft II breadth coverage (sweep B)

This is the second independent answer to "does the remake have everything Warcraft II has?". It uses the local wiki
mirror (`docs/wiki/pages/`, retrieved 2026-09-26) as the source of truth. It covers breadth: every concept, object,
mechanic, mode and piece of presentation the mirror describes. Per-object numbers (cost, HP, damage and so on) for
the 150 units, buildings, upgrades and spells are in AUDIT.md and are not repeated here.

Code evidence is `file:line` or a function name in `~/warcraft_game` as of this sweep. Every "missing" row was
grepped first (for example `grep -ci 'wall\|runestone\|portal\|daemon\|cheat\|queue' game.js data.js art.js`).

Status words:

- **done**: implemented as WC2 does it.
- **partial**: present, but it differs; the difference is in the note or in the prose under the table.
- **missing**: absent.
- **out**: out of scope (Battle.net, networking, original cinematics, Blizzard-owned story text, retail packaging,
  lore that has no in-game effect).

## Summary

| Area | Concepts | done | partial | missing | out |
|---|---|---|---|---|---|
| 1. Objects beyond the 150 | 22 | 7 | 2 | 13 | 0 |
| 2. Core mechanics | 34 | 25 | 2 | 7 | 0 |
| 3. Modes and options | 20 | 7 | 1 | 9 | 3 |
| 4. Campaigns and missions | 20 | 0 | 0 | 16 | 4 |
| 5. UI and presentation | 24 | 11 | 7 | 5 | 1 |
| 6. Meta pages | 12 | 0 | 0 | 0 | 12 |
| **Total** | **132** | **50** | **12** | **50** | **20** |

Of the 112 in-scope concepts, 50 are done (44.6%), 12 are partial (10.7%) and 50 are missing (44.6%).

In short: the core skirmish loop is broad and mostly faithful. That covers the economy, combat, fog, detection, the
navy, transports, spells, the command card, save and load, speeds, and score and ranks. What is missing is everything
around that loop:

- more than one opponent, teams and allies;
- walls and the neutral special buildings;
- the other three tilesets;
- the hand-made scenario maps and any way to load them (PUD, map editor);
- cheats;
- the whole campaign layer: heroes, mission objectives, rescue, Circle of Power, briefings and progression.

## 1. Game objects beyond the audited 150

### 1.1 Special and hero units

| Concept | Wiki page | Status | Code evidence / note |
|---|---|---|---|
| Daemon (neutral flying unit) | daemon_(warcraft_ii).wiki | missing | no daemon in data.js or game.js |
| Attack Peasant / Attack Peon | peasant_(warcraft_ii).wiki | missing | only the gathering worker exists |
| ToD heroes (5): Lothar, Uther, Zuljin, Cho'gall, Gul'dan | warcraft_ii_units.wiki | missing | no hero entries in data.js UNITS |
| BtDP heroes (10): Alleria ... Deathwing | warcraft_ii_units.wiki | missing | no hero entries in data.js UNITS |
| Hero rules (death fails mission, own spells) | warcraft_ii:_beyond_the_dark_portal.wiki | missing | no mission-fail hook in step() |
| Critter (sheep) wandering, spell target | critter_(warcraft_ii).wiki | done | game.js:115 spawn, game.js:567 wander |
| Critter per tileset: seal, boar, helboar | critter_(warcraft_ii).wiki | missing | art.js:176 sheep only |
| Critter explodes when clicked repeatedly | critter_(warcraft_ii).wiki | missing | voice() has no critter case |

The 15 heroes have full stat boxes on warcraft_ii_units.wiki and their own pages, for example
alleria_(warcraft_ii).wiki and deathwing_(warcraft_ii).wiki. Their spell rules are on the hero pages: Cho'gall knows
all Ogre-Mage spells, Khadgar starts with Fireball only, and Dentarg learns what the Altar researches. The
blacksmith_(wc2_human).wiki page says which upgrades they inherit.

data.js labels the orc critter "Pig" (RACES.orc.labels.critter). The wiki ties the critter to the tileset, not to the
race: sheep (Summer), seal (Winter), boar (Wasteland), helboar (Swamp). assets/critters/pig_walk.png exists but
art.js draws only the sheep.

### 1.2 Neutral and special structures

| Concept | Wiki page | Status | Code evidence / note |
|---|---|---|---|
| Gold Mine: mined, collapses when empty | gold_mine_(warcraft_ii).wiki | done | game.js:293 addPatch, game.js:1019 removeResource |
| Gold Mine can be attacked and destroyed | gold_mine_(warcraft_ii).wiki | missing | attack refuses resources, game.js:1396 |
| Oil Patch, platform, builder-only use | oil_patch.wiki | done | game.js:1078 pumpable |
| Platform destroyed when its patch runs dry | oil_platform_(wc2_human).wiki | partial | patch removed, platform stays (note) |
| Runestone (5000 HP neutral building) | runestone_(warcraft_ii).wiki | missing | no runestone anywhere |
| Dark Portal (5000 HP, armor 0) | dark_portal_(warcraft_ii).wiki | missing | no portal anywhere |
| Circle of Power (mission goal marker) | circle_of_power.wiki | missing | no circle anywhere |
| Wall, both races (20g/10l, 40 HP) | wall_(wc2_human).wiki | missing | only mention: game.js:128 comment |
| Wall rules: adjacent damage, AI ignores | wall_(wc2_orc).wiki | missing | depends on walls |

Oil platform note: when the last oil is pumped, `removeResource` (game.js:1019) removes the patch and clears its
footprint on the building grid, which the platform also occupies. The platform building itself is never killed.

### 1.3 Terrain and tilesets

| Concept | Wiki page | Status | Code evidence / note |
|---|---|---|---|
| Forest: chop, trees fall to stumps | warcraft_ii:_tides_of_darkness_manual.wiki | done | game.js:1025 stump |
| Rock: only demolition units clear it | demolition_squad_(warcraft_ii).wiki | done | game.js:722 in detonate() |
| Water, coast, shore-only buildings | shipyard_(wc2_human).wiki | done | game.js:16 WATER, data.js shore flag |
| Tilesets: Summer, Winter, Wasteland, Swamp | critter_(warcraft_ii).wiki | partial | one Summer-like look only (note) |
| Rubble of razed buildings | warcraft_ii_ranks.wiki | done | game.js:785 G.rubble |

Tileset note: there are four terrain classes (game.js:16: grass, forest, water, rock) drawn with one grass and forest
look. The mirror names four tilesets: Summer, Winter, Wasteland and Swamp (Draenor). The BtDP-only Swamp tileset is
on warcraft_ii_patch_information.wiki (v1.33), and the per-map `tileset =` lines are on beetle_island.wiki,
brokenrock_mountains.wiki, griffon's_roost.wiki, plains_of_snow.wiki, skull_isle.wiki and
mysterious_dragon_isle.wiki. No Winter, Wasteland or Swamp art or palette exists, and no option selects one. The
mirror has no tile-level page (Tileset was rejected by the crawl), so ground types such as light/dark ground and
shallow water could not be checked.

## 2. Core mechanics (skirmish)

### 2.1 Economy

| Concept | Wiki page | Status | Code evidence / note |
|---|---|---|---|
| Gold, lumber, oil as resources | warcraft_ii:_the_dark_saga_manual.wiki | done | data.js RULES, game.js:1027 updGather |
| Food: farm 4, hall 1, cap 200 | farm_(wc2_human).wiki | done | game.js:1355 food() |
| Keep/Castle gold bonus, no stacking | keep_(warcraft_ii).wiki | done | game.js:1013 loadFor takes max |
| Lumber Mill +25 lumber, Refinery +25 oil | elven_lumber_mill_(warcraft_ii).wiki | done | data.js bonus, game.js:1013 |
| Several halls allowed | town_hall_(warcraft_ii).wiki | done | game.js:1796 aiExpand, build order |
| Hall not too close to a mine | town_hall_(warcraft_ii).wiki | done | game.js:1097 mineGap check |
| Workers slower when carrying (speed 7) | warcraft_ii_units.wiki | missing | moveStep game.js:430 ignores carrying |
| Workers inside hall/mine die with it | peasant_(warcraft_ii).wiki | partial | they pop out alive, game.js:788 |
| Docked tankers die with dock/platform | oil_tanker_(wc2_human).wiki | missing | kill() leaves tankers alone |
| Repair buildings, 1 gold + 1 lumber per 4 HP | peasant_(warcraft_ii).wiki | done | game.js:1205 updRepair |
| Repair ships and Transports | peasant_(warcraft_ii).wiki | missing | repair takes buildings only, game.js:1437 |
| Siege units cannot be repaired | ballista_(warcraft_ii).wiki | done | no unit repair exists |

### 2.2 Combat and orders

| Concept | Wiki page | Status | Code evidence / note |
|---|---|---|---|
| Land, sea and air target domains | warcraft_ii:_tides_of_darkness.wiki | done | game.js:516 canHit |
| Splash, friendly fire (siege, flyers) | ballista_(warcraft_ii).wiki | done | projectile splash, game.js:668 |
| Minimum range for siege | catapult_(warcraft_ii).wiki | done | game.js:591 minRangeOf |
| Attack Ground (hits unseen subs) | ogre_juggernaught_(warcraft_ii).wiki | done | game.js:1508, game.js:725 |
| Demolition: blast, clears trees and rock | goblin_sappers_(warcraft_ii).wiki | done | game.js:709 detonate |
| Demolition on patrol chases and blows up | goblin_sappers_(warcraft_ii).wiki | missing | d.combat false for demo, game.js:34 |
| Workers, casters, demo flee when hit | peasant_(warcraft_ii).wiki | missing | data.js coward/flees never read |
| Idle units retaliate and auto-acquire | footman_(warcraft_ii).wiki | done | game.js:766 hit, game.js:564 updIdle |
| Critters never auto-targeted | critter_(warcraft_ii).wiki | done | game.js:578 scanTarget skips neutral |
| Tower target priority list | guard_tower_(wc2_human).wiki | partial | nearest unit only, game.js:1326 |
| Damaged buildings burn | runestone_(warcraft_ii).wiki | done | game.js:757 fireT (visual) |
| Transports: board, carry 6, unload on shore | transport_(wc2_human).wiki | done | game.js:1490 load, game.js:1499 unload |
| Units die with a sunk Transport | transport_(wc2_orc).wiki | done | game.js:778 kills cargo |
| Follow a unit (flying machine, zeppelin) | gnomish_flying_machine_(warcraft_ii).wiki | done | game.js:1515 follow |
| Patrol, stand ground, attack-move | warcraft_ii:_battle.net_edition.wiki | done | game.js:1373, game.js:554 updHold |
| Unit production queue (BNE) | warcraft_ii:_battle.net_edition.wiki | missing | one b.training slot, game.js:1451 |
| Mixed-race control shares research | church_(warcraft_ii).wiki | missing | only one race per owner |

### 2.3 Vision and victory

| Concept | Wiki page | Status | Code evidence / note |
|---|---|---|---|
| Fog: unexplored / explored / visible | warcraft_ii:_tides_of_darkness.wiki | done | game.js:1540 updateFog |
| Enemy buildings remembered in fog | warcraft_ii:_tides_of_darkness.wiki | done | game.js:1552 G.memory |
| Subs and turtles seen by towers, flyers, subs | gnomish_submarine_(warcraft_ii).wiki | done | game.js:966 updateDetection |
| Partly built towers do not detect (BNE) | warcraft_ii:_battle.net_edition.wiki | done | game.js:972 skips unfinished |
| Victory: destroy all units and buildings | warcraft_ii_map_editor.wiki | done | game.js:1921 step() |

Tower priority note: guard_tower_(wc2_human).wiki gives a 12-tier list, from Catapult/Ballista, Mage/Death Knight and
Transport at the top down to Lumber Mill and Refinery. Buildings are on the list, so towers also shoot buildings.
updateBuilding (game.js:1326) scans only `G.units` and picks the nearest one. The wiki's other orders are also
missing: demolition units chasing on patrol, and "mages auto-attack only flying machines when idle" (the caster is a
plain `combat` unit, game.js:34).

## 3. Game modes and options

| Concept | Wiki page | Status | Code evidence / note |
|---|---|---|---|
| Custom game vs one computer | warcraft_ii_scenarios.wiki | done | index.html #titlescreen, game.js:88 |
| 2-8 players per map, up to 7 AIs | warcraft_ii:_beyond_the_dark_portal.wiki | missing | owners player/enemy only, game.js:101 |
| Teams, allies, Top vs Bottom, shared vision | warcraft_ii:_battle.net_edition.wiki | missing | no alliance model |
| Opponent race choice, random race | warcraft_ii:_battle.net_edition.wiki | partial | AI is always the other race, game.js:96 |
| Starting resources (low/medium/high) | warcraft_ii:_battle.net_edition.wiki | done | data.js RULES.START |
| Starting units (one peasant or default) | warcraft_ii:_battle.net_edition.wiki | done | index.html #o-units |
| Tileset choice, random tileset | warcraft_ii:_battle.net_edition.wiki | missing | no tileset option |
| Game speeds (6, set before play) | warcraft_ii:_battle.net_edition.wiki | done | data.js:189 SPEEDS |
| Pre-made scenario maps (about 150) | warcraft_ii_scenarios.wiki | missing | procedural maps only, game.js:143 |
| Island maps needing transports | warcraft_ii_scenarios.wiki | missing | only strait and bays, game.js:152 |
| Map sizes 32 to 128 | warcraft_ii_scenarios.wiki | done | game.js:92 size |
| Single-player scenarios (Alamo, Mutton...) | warcraft_ii_scenarios.wiki | missing | no scenario loader |
| PUD custom map format | pud.wiki | missing | no PUD reader |
| Map editor | warcraft_ii_map_editor.wiki | missing | none |
| Save and load game | warcraft_ii_patch_information.wiki | done | game.js:2820 saveGame, localStorage |
| Pause | warcraft_ii:_battle.net_edition.wiki | done | game.js:2773 setPaused |
| Cheat codes (20 codes) | warcraft_ii_cheat_codes.wiki | missing | no text entry, no cheat table |
| LAN / IPX / modem multiplayer | warcraft_ii:_tides_of_darkness.wiki | out | networking; see prose |
| Battle.net, ladder, spawning | warcraft_ii:_battle.net_edition.wiki | out | Battle.net |
| Demo / shareware campaign | warcraft_ii:_tides_of_darkness_missions_(demo).wiki | out | retail packaging |

Scenario maps: warcraft_ii_scenarios.wiki lists 28 classic multiplayer maps, 8 classic scenarios, 40 expansion maps,
28 expansion scenarios, 26 BNE maps, 13 ladder maps, 9 BNE scenarios and 3 later maps. Many of them are island or
sea maps (Islands in the Stream, High Seas Combat, Atols, Forsaken Isles). The generator (game.js:143) builds only
two point-symmetric two-player templates, so the AI's missing transport landing (docs/GAPS.md §6) has never been
needed.

Multiplayer: the task puts Battle.net out of scope, so I classed all networked play as out. Player count, teams and
allies are still listed as missing, because they matter offline too: WC2 custom games take several computer
opponents, and the maps are built for 2 to 8 players.

The "Fog of war: Revealed map" title option and the map seed are extras. WC2 has neither.

## 4. Campaigns and missions

| Concept | Wiki page | Status | Code evidence / note |
|---|---|---|---|
| ToD Human campaign (14 missions) | warcraft_ii:_tides_of_darkness_missions.wiki | missing | no campaign code |
| ToD Orc campaign (14 missions) | warcraft_ii:_tides_of_darkness_missions.wiki | missing | no campaign code |
| BtDP Human campaign (12 missions) | warcraft_ii:_beyond_the_dark_portal_missions.wiki | missing | no campaign code |
| BtDP Orc campaign (12 missions) | warcraft_ii:_beyond_the_dark_portal_missions.wiki | missing | no campaign code |
| Objective: build N of a building | hillsbrad_(wc2_human).wiki | missing | step() checks annihilation only |
| Objective: destroy named targets | grim_batol_(wc2_human).wiki | missing | none |
| Objective: rescue units (they join you) | ambush_at_tarren_mill_(wc2_human).wiki | missing | no rescuable owner |
| Objective: escort to a Circle of Power | the_battle_at_darrowmere_(wc2_human).wiki | missing | no circle |
| Objective: heroes must survive | the_battle_for_nethergarde_(wc2_human).wiki | missing | no heroes |
| Objective: capture a building | the_runestone_at_caer_darrow_(wc2_orc).wiki | missing | no capture |
| Objective: recapture ships | the_fall_of_stromgarde_(wc2_orc).wiki | missing | no rescue |
| Objective: only one hero may hit target | the_bitter_taste_of_victory_(wc2_human).wiki | missing | no scripting |
| Mission briefing and objectives screen | hillsbrad_(wc2_human).wiki | missing | no briefing UI |
| Tech unlocked mission by mission | hillsbrad_(wc2_human).wiki | missing | full tree always open |
| Campaign progression, mission select | warcraft_ii:_remastered.wiki | missing | none |
| Scripted mission AI (waves, prebuilt bases) | warcraft_ii:_beyond_the_dark_portal.wiki | missing | one generic AI script, game.js:1571 |
| Campaign team colours and clan names | alliance_traitors.wiki | out | Blizzard story |
| Mission briefing text and story | warcraft_ii_missions.wiki | out | Blizzard story text |
| Intro and campaign cinematics | warcraft_ii_campaign_cinematics.wiki | out | original cinematics |
| Story artefacts (Skull, Scepter, Book) | skull_of_gul'dan.wiki | out | lore props |

The mirror has one page per mission: 14 + 14 ToD, 12 + 12 BtDP and 6 demo. Each has objectives, forces and often
the tileset. The objective types in the table were read from the `Objectives` sections of all 58 pages. Blizzard's
story text is out of scope, but the mission mechanics are not. An original campaign would need every one of the
twelve "missing" mechanics above, plus the heroes (§1.1) and the Runestone, Dark Portal and Circle of Power (§1.2).
Most campaign missions also use hand-placed maps (§3).

## 5. UI and presentation

| Concept | Wiki page | Status | Code evidence / note |
|---|---|---|---|
| Minimap: fog, click jump, right-click move | warcraft_ii:_battle.net_edition_manual.wiki | done | game.js:2228 renderMinimap, game.js:2733 |
| Command card with hotkeys | warcraft_ii_abilities.wiki | done | game.js:2447 buildButtons |
| Portrait, HP, mana, status panel | warcraft_ii_units.wiki | done | game.js:2392, game.js:2400 |
| Resource bar with food (BNE) | warcraft_ii:_battle.net_edition.wiki | done | index.html #top |
| Select up to 9, shift to add | warcraft_ii:_remastered.wiki | done | data.js SELECT_CAP, game.js:2592 |
| Control groups on number keys | warcraft_ii:_battle.net_edition.wiki | done | game.js:2697 |
| Ctrl+click / double-click select type | warcraft_ii:_battle.net_edition.wiki | missing | no dblclick handler |
| Spacebar jumps to last message spot | warcraft_ii:_battle.net_edition.wiki | missing | no space binding |
| Right-click smart commands (BNE) | warcraft_ii:_battle.net_edition.wiki | done | game.js:2605 rightClick |
| Status messages (ready, under attack) | quotes_of_warcraft_ii.wiki | done | game.js:761, notice() |
| Tooltips with costs (Remastered) | warcraft_ii:_remastered.wiki | done | game.js:2469 b.title |
| In-game message entry (Enter) | warcraft_ii_cheat_codes.wiki | missing | Enter key unbound |
| Unit voices: select, ack, annoyed | quotes_of_warcraft_ii.wiki | partial | one small set per race, game.js:2304 |
| Hero and ship voice sets | quotes_of_warcraft_ii.wiki | missing | no per-unit sets |
| Advisor lines (work complete, attack) | quotes_of_warcraft_ii.wiki | partial | tones and text, game.js:2336 |
| Music: per-race tracks, war room, jingles | warcraft_ii_midi_files.wiki | partial | 3 generic loops + victory, game.js:2262 |
| Hidden song "I'm a Medieval Man" | i'm_a_medieval_man.wiki | missing | needs cheats (disco) |
| Score screen tallies | warcraft_ii_ranks.wiki | done | game.js:2548 showResult |
| Ranks by score (+500 win), "Cheater!" | warcraft_ii_ranks.wiki | partial | ranks done, no Cheater rank |
| Team colours (8) | alliance_traitors.wiki | partial | 2 colours, art.js:21 FACTION |
| Eight facings for units | warcraft_ii_units.wiki | partial | 4 LPC facings (GAPS.md §3) |
| Options: volumes, scroll speeds | warcraft_ii:_battle.net_edition_manual.wiki | partial | music on/off only, index.html |
| Victory/defeat screens | warcraft_ii_cheat_codes.wiki | done | index.html #overlay |
| Remastered graphics toggle | warcraft_ii:_remastered.wiki | out | Remastered-only feature |

Voice note: quotes_of_warcraft_ii.wiki has separate sections for Peasant, Footman, Archer/Ranger, Knight/Paladin,
Flying Machine, Demolition Squad, Mage and ships, the orc counterparts, and every BtDP hero. The code has a few clips
per race, pitched per unit type (game.js:2304 `voice`). The clicking sequence works, including the annoyed line after
four quick clicks, but the lines are not WC2's per-unit sets.

Music note: warcraft_ii_midi_files.wiki lists Intro, Human and Orc War Room (the briefing tracks), Human 1-6 and
Orc 1-6 in-game tracks, and separate Human and Orc victory and defeat jingles. The game has calm, battle and defeat
loops plus a victory cue, with no race split (game.js:2262 `MUSIC`).

## 6. Meta pages (no in-game content)

| Concept | Wiki page | Status | Code evidence / note |
|---|---|---|---|
| Lore characters (about 127 pages) | alleria_windrunner.wiki | out | lore; the in-game ones are §1.1 heroes |
| Lore places and events | alterac_crisis.wiki | out | lore |
| Editions, bundles, Remastered store text | warcraft_ii:_battle_chest.wiki | out | packaging |
| Manuals' history chapters | warcraft_ii:_tides_of_darkness_manual.wiki | out | story text |
| Strategy guides, websites | the_dark_portal_(website).wiki | out | guides |
| Voice actors, credits | warcraft_ii_credits.wiki | out | staff |
| Patch history, CHEATFIX, DOS fixes | warcraft_ii_patch_information.wiki | out | platform history |
| WAR archive format | war.wiki | out | Blizzard data files |
| Third-party level packs (W!Zone...) | w!zone.wiki | out | third-party products |
| WarCraft 2000 knock-off | warcraft_2000:_nuclear_epidemic.wiki | out | unrelated product |
| Battle.net chat icons | warcraft_ii_chat_icons.wiki | out | Battle.net |
| Unused beta spells (Hallucinate...) | warcraft_ii_abilities.wiki | out | cut content |

The file description pages (1114) were not read one by one. They are media stubs for the articles above.

## Top gaps to build next

Ordered by how much each matters to playing the game: core skirmish first, then campaign-type content, then cosmetic.

1. **Several opponents and teams.** Needed: 2 to 8 sides, up to 7 computer players, allied teams (Top vs Bottom),
   shared vision, eight team colours and a per-opponent race choice (random included). Today the owner model is
   hard-wired to `player`/`enemy`/`neutral` (game.js:101, art.js:21).
2. **Walls.** Needed: a buildable Wall for each race (20 gold, 10 lumber, 40 HP, 1×1), with the damage passed to
   orthogonal neighbours and ignored by the AI. They are the main skirmish defensive structure after towers.
3. **Island maps and hand-made maps.** Needed: an island or sea template, the ability to load PUD maps (the ~150
   official scenarios), and AI transport landings to make islands playable.
4. **Tilesets.** Needed: Winter, Wasteland and Swamp art and palettes, a tileset option on the title screen, and the
   matching critters (seal, boar, helboar), replacing the race-based "Pig" label.
5. **Default flee reaction.** Workers, Mages/Death Knights and demolition units should run from attackers. data.js
   already sets `coward`/`flees` but game.js never reads them.
6. **Worker carry slowdown.** Peasants and Peons should move at speed 7 instead of 10 while carrying gold or lumber.
7. **Tower targeting.** Towers need the 12-tier priority list, including buildings, instead of the nearest unit
   (game.js:1326).
8. **Unit production queue.** A BNE queue on training buildings; today there is a single `b.training` slot.
9. **Ship and Transport repair.** Workers should be able to repair adjacent ships, with an explicit Repair order for
   Transports (a right-click boards them instead).
10. **Destruction side effects.** Workers inside a razed hall or mine should die, as should tankers docked at a razed
    shipyard, refinery or platform. Gold mines should be attackable, and the platform should die when its patch runs
    dry (today the patch is removed and the platform is left standing).
11. **Cheat codes.** Needed: in-game Enter message entry, the 20 codes, and the "Cheater!" rank on the score screen.
12. **Selection shortcuts.** Ctrl+click or double-click should select up to 9 on-screen units of that type, and
    Spacebar should jump to the last alert. Demolition units on patrol should also hunt.
13. **Campaign framework.** Needed: mission scripts with the objective types in §4 (build N, destroy targets,
    rescue/join, escort to a Circle of Power, heroes must survive, capture), a briefing and objectives screen,
    per-mission tech unlocks, mission select and progression, and original mission content.
14. **Heroes and special objects.** Needed: the 15 heroes with their spell and upgrade rules, the Daemon, Attack
    Peasant/Peon, the Runestone, the Dark Portal and the Circle of Power.
15. **Map editor.** A scenario editor that saves PUD-compatible maps (this pairs with item 3).
16. **Music.** Per-race tracks (Human 1-6, Orc 1-6), War Room tracks and race-specific victory and defeat jingles.
17. **Voices.** Per-unit and per-hero voice sets and the advisor lines ("Work complete", "Job's done").
18. **Eight facings** for units.
19. **Options menu.** Music and effects volume, mouse and key scroll speed.
20. **Easter eggs.** Exploding critters, the "I'm a Medieval Man" song (disco cheat), day/ucla messages.
