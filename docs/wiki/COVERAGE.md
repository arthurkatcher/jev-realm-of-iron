# Warcraft II breadth coverage

This file asks one question: does Realm of Iron have everything Warcraft II has? It uses the local wiki mirror as the
source of truth. AUDIT.md already checks the per-object numbers (cost, HP, damage and so on) for the 150 objects in
`data.js`, so this sweep does not repeat that. It covers breadth instead: every object, mechanic, mode, option and piece
of presentation that the mirror describes.

It was written on 2026-09-26 against the code as it was then. Other agents were editing `game.js` and `art.js` at the
same time, so line numbers may drift. Function names are given so the evidence can still be found.

## How to read this

- **Wiki**: a file in `docs/wiki/pages/`. The `pages/` prefix is left out.
- **Code**: `file:line` or `function()` for items that are implemented or partial. For missing items it is the grep
  that found nothing.
- **Status**:
  - **implemented**: behaves as the wiki describes.
  - **partial**: exists, but differs; the difference is under the table.
  - **missing**: not in the code (checked with grep).
  - **out of scope**: see the last section for the rule.

Method: I read every article group in INDEX.md: the "Warcraft II" group, units, buildings, maps, the four campaigns plus
the demo, the manuals, the cheats, ranks, patch notes and edition pages, and the quotes page. I skimmed the
character, place, lore, book and voice-actor pages. Where a page named a game concept, I grepped `game.js`, `data.js`,
`art.js` and `index.html` for it. File pages (images and sounds) were used only for their names, for example the
critter variant sprites.

## Summary

| Area | Concepts | Implemented | Partial | Missing | Out of scope |
|---|---|---|---|---|---|
| 1. Units, heroes, critters | 25 | 3 | 1 | 21 | 0 |
| 2. Buildings, neutral objects | 11 | 6 | 1 | 4 | 0 |
| 3. Terrain, tilesets, maps | 16 | 5 | 0 | 10 | 1 |
| 4. Core mechanics and economy | 31 | 24 | 3 | 4 | 0 |
| 5. Campaign mechanics | 15 | 0 | 0 | 13 | 2 |
| 6. Modes and options | 20 | 5 | 2 | 9 | 4 |
| 7. Interface and presentation | 23 | 11 | 6 | 5 | 1 |
| **Total (areas 1-7)** | **141** | **54** | **13** | **66** | **8** |
| 8. Campaign missions | 58 | 0 | 0 | 58 | 0 |

The answer is no. The skirmish core is solid: all 150 audited objects, the economy, combat, spells, fog of war,
detection, transports, speeds, save and load, and the score screen are all in. What the game lacks is everything
around one fixed 1-vs-1 summer skirmish:

- more than two players, alliances and mirror matches;
- the other three tilesets and their critters;
- walls and the neutral buildings;
- heroes and the Daemon;
- a campaign or trigger system of any kind;
- map loading and a map editor;
- cheat codes.

Every one of the 58 campaign missions is missing, because none of the objective types they need exists yet.

## 1. Units, heroes and critters

The 38 unit roles in `data.js` are covered by AUDIT.md and count here as one row.

| Concept | Wiki | Status | Code |
|---|---|---|---|
| 38-role unit roster (audited) | warcraft_ii_units.wiki | implemented | data.js UNITS, AUDIT.md |
| Skeleton (Raise Dead) | skeleton_(warcraft_ii).wiki | implemented | data.js:45, castNow() raise_dead |
| Eye of Kilrogg | eye_of_kilrogg_(warcraft_ii).wiki | implemented | data.js:46, castNow() summon |
| Critter: sheep | critter_(warcraft_ii).wiki | partial | data.js:47, genMap() critters, updIdle() |
| Critter: seal (winter) | critter_(warcraft_ii).wiki | missing | no "seal" in code |
| Critter: boar (wasteland) | critter_(warcraft_ii).wiki | missing | no "boar" in code |
| Critter: helboar (swamp) | critter_(warcraft_ii).wiki | missing | no "helboar" in code |
| Critter explodes when clicked many times | warcraft_ii:_tides_of_darkness.wiki | missing | voice() handles own units only |
| Daemon (campaign air unit) | daemon_(warcraft_ii).wiki | missing | no "daemon" in code |
| Attack Peasant / Attack Peon | warcraft_ii_units.wiki | missing | not in UNITS |
| Hero: Anduin Lothar (Knight) | anduin_lothar_(warcraft_ii).wiki | missing | no hero support |
| Hero: Uther Lightbringer (Paladin) | uther_lightbringer_(warcraft_ii).wiki | missing | no hero support |
| Hero: Zul'jin (Axethrower) | zuljin_(warcraft_ii).wiki | missing | no hero support |
| Hero: Cho'gall (Ogre-Mage) | cho'gall_(warcraft_ii).wiki | missing | no hero support |
| Hero: Gul'dan (Death Knight) | gul'dan_(warcraft_ii).wiki | missing | no hero support |
| Hero: Alleria (Ranger) | alleria_(warcraft_ii).wiki | missing | no hero support |
| Hero: Danath (Footman) | danath_(warcraft_ii).wiki | missing | no hero support |
| Hero: Khadgar (Mage) | khadgar_(warcraft_ii).wiki | missing | no hero support |
| Hero: Kurdran and Sky'ree (Gryphon) | kurdran_(warcraft_ii).wiki | missing | no hero support |
| Hero: Turalyon (Paladin) | turalyon_(warcraft_ii).wiki | missing | no hero support |
| Hero: Grom Hellscream (Grunt) | grom_hellscream_(warcraft_ii).wiki | missing | no hero support |
| Hero: Kargath Bladefist (Grunt) | kargath_bladefist_(warcraft_ii).wiki | missing | no hero support |
| Hero: Dentarg (Ogre-Mage) | dentarg_(warcraft_ii).wiki | missing | no hero support |
| Hero: Teron Gorefiend (Death Knight) | teron_gorefiend_(warcraft_ii).wiki | missing | no hero support |
| Hero: Deathwing (Dragon) | deathwing_(warcraft_ii).wiki | missing | no hero support |

**Critters.** The wiki says the critter depends on the tileset: sheep in summer, seals in winter (they cannot enter
water), boars in wasteland and helboars in swamp. The game has one tileset and always draws a sheep: `art.js`
`critter: { critter: 'sheep' }`. `data.js` labels the orc player's critter "Pig", which ties it to the race rather than
the map. `assets/critters/pig_walk.png` exists but nothing loads it. The file pages for all four variants are in the
mirror (`file:crittersealwc2.gif.wiki` and the others). The easter egg in which a critter explodes after repeated
clicks is also missing. The spec gives about 10 clicks (units_buildings.md 5.5).

**Heroes.** warcraft_ii_units.wiki says a hero "is based on a certain unit and has the same basic abilities as that
unit" but has its own stats, portrait and name. The Beyond the Dark Portal heroes also have their own quotes and much
higher stats, and losing one fails the mission. Hero stats are already in docs/spec/units_buildings.md Appendices A and
B. The score table in warcraft_ii_ranks.wiki gives each hero's point value. The engine needs:

- unit types that reuse a base role but have their own stats;
- a hero flag;
- a portrait;
- a "must survive" rule.

**Daemon.** An air unit with 60 HP, armor 2 and damage 9/1, per the Daemon page and the spec. It appears only in
scenarios and missions (The Tomb of Sargeras, BtDP).

**Attack Peasant / Attack Peon.** These are campaign units that fight and cannot be trained.

## 2. Buildings and neutral objects

| Concept | Wiki | Status | Code |
|---|---|---|---|
| 38-role building roster (audited) | warcraft_ii_buildings.wiki | implemented | data.js BUILDINGS, AUDIT.md |
| Gold Mine | gold_mine_(warcraft_ii).wiki | partial | addPatch(), updGather() |
| Mine collapses when empty | gold_mine_(warcraft_ii).wiki | implemented | removeResource() game.js:1019 |
| Oil Patch, gone when drained | oil_patch.wiki | implemented | removeResource(), pumpable() |
| Wall (Human and Orc) | wall_(wc2_human).wiki | missing | no wall type; "wall" only in a comment |
| Runestone (neutral, 5000 HP) | runestone_(warcraft_ii).wiki | missing | not in BUILDINGS |
| Dark Portal (neutral, 5000 HP) | dark_portal_(warcraft_ii).wiki | missing | not in BUILDINGS |
| Circle of Power | circle_of_power.wiki | missing | no "circle" in code |
| Burning damaged buildings | warcraft_ii_buildings.wiki | implemented | hit() game.js:757 fireT, art.js fire |
| Rubble after destruction | warcraft_ii_buildings.wiki | implemented | kill() G.rubble, RULES.RUBBLE_TTL |
| Construction stages | warcraft_ii_buildings.wiki | implemented | stageOf() game.js:2085 |

**Gold Mine.**

- Collapse works.
- The wiki says a mine has 25500 HP and can be destroyed with the Attack command. `validTarget()` rejects anything of
  kind `res`, so mines cannot be attacked.
- The wiki gives amounts from 2,500 to 637,500 per mine. Every mine here holds `RULES.MINE_AMOUNT` (50000).

**Walls.** 40 HP, armor 0, cost 20 gold and 10 lumber, build time 30, size 1x1. The wiki says:

- walls "can only be built in multiplayer games" and appear pre-placed on single-player maps;
- they probably have a hard-coded damage reduction;
- destroying one section also damages the sections next to it orthogonally;
- the AI does not target them on purpose.

The spec adds that missiles aimed at land stop on an enemy wall (mechanics.md). Walls are worth 1 point on the score
screen.

**Runestone, Dark Portal and Circle of Power.** These are campaign objects. They can be captured (Runestone, Dark
Portal), destroyed as an objective (Dark Portal), or used as a delivery point (Circle of Power). The wiki says the
computer ignores the Runestone and the Dark Portal when they are neutral on custom maps. The spec gives sizes of 2x2,
4x4 and 2x2.

**Other neutral structures.** The mirror lists no other neutral buildings (goblin or otherwise). The Goblin
Alchemist is an Orc building and is already in the audited roster.

## 3. Terrain, tilesets and maps

| Concept | Wiki | Status | Code |
|---|---|---|---|
| Grass, forest, water, rock terrain | warcraft_ii:_tides_of_darkness.wiki | implemented | game.js:16 GRASS/FOREST/WATER/ROCK |
| Trees felled to stumps | warcraft_ii:_tides_of_darkness_manual.wiki | implemented | removeResource() G.stump |
| Rock and trees cleared by demolition | demolition_squad_(warcraft_ii).wiki | implemented | detonate() game.js:709 |
| Summer (forest) tileset | critter_(warcraft_ii).wiki | implemented | drawTerrain(), single palette |
| Winter tileset | plains_of_snow.wiki | missing | no tileset option |
| Wasteland tileset | skull_isle.wiki | missing | no tileset option |
| Swamp / Draenor tileset (BtDP) | warcraft_ii:_beyond_the_dark_portal.wiki | missing | no tileset option |
| Map sizes 32 to 128 | warcraft_ii_scenarios.wiki | implemented | setMapSize(), index.html o-size |
| Maps with 3 to 8 start locations | warcraft_ii_scenarios.wiki | missing | genMap() returns two starts |
| Island maps that need transports | warcraft_ii_scenarios.wiki | missing | templates: strait, bays (GAPS.md 7) |
| Classic maps (28 multi, 8 scenario) | warcraft_ii_scenarios.wiki | missing | no map loader |
| BtDP maps (41) and scenarios | warcraft_ii_scenarios.wiki | missing | no map loader |
| BNE web maps (Beetle Island etc.) | beetle_island.wiki | missing | no map loader |
| PUD map file loading | pud.wiki | missing | no "pud" in code |
| Map editor | warcraft_ii_map_editor.wiki | missing | no editor |
| Sound editor | warcraft_ii:_tides_of_darkness_manual.wiki | out of scope | edits Blizzard sound data |

**Tilesets.** The wiki names four:

- Summer: Mysterious Dragon Isle, Beetle Island.
- Winter: Plains of Snow, The Eye of Dalaran.
- Wasteland: Skull Isle, The Tomb of Sargeras.
- Swamp: Brokenrock Mountains. This is the Draenor tileset added by BtDP; patch 1.33 made it available to the editor.

Each tileset changes the art and the critter. The game has one summer look.

**Maps.** The random generator (`genMap()`, strait and bays templates) is this project's own replacement for the
shipped maps. WC2 has no generator. The shipped scenario maps are Blizzard data, so the practical route is:

- a PUD loader (the format is documented at the link on pud.wiki), so players can use maps they own;
- original hand-made maps built with the same loader.

The Map Editor page says the WC2 editor changes the map, unit stats (not speed) and hero stats. It cannot change
objectives: every custom map is "destroy all enemies".

## 4. Core mechanics and economy

| Concept | Wiki | Status | Code |
|---|---|---|---|
| Gold mining and depots | gold_mine_(warcraft_ii).wiki | implemented | updGather(), nearestDepot() |
| Lumber harvesting | warcraft_ii:_tides_of_darkness_manual.wiki | implemented | updGather() chopping |
| Oil: tanker, platform, depot | oil_patch.wiki | implemented | updGather() pumping, pumpable() |
| Keep/Castle/Mill/Refinery bonus | warcraft_ii_structures.wiki | implemented | loadFor() game.js:1013 |
| Food: farms, halls, cap 200 | warcraft_ii:_battle.net_edition.wiki | implemented | food() game.js:1355 |
| Worker speed 7 when carrying | warcraft_ii_units.wiki | missing | moveStep() ignores carrying |
| Repair | warcraft_ii_buildings.wiki | implemented | updRepair() game.js:1205 |
| Cancel refund | warcraft_ii:_battle.net_edition.wiki | implemented | cancelJob(), RULES.CANCEL_REFUND |
| In-place hall and tower upgrades | warcraft_ii_structures.wiki | implemented | completeUpgrade() becomes |
| Fog: hidden, explored, visible | warcraft_ii:_tides_of_darkness.wiki | implemented | updateFog(), visibility() |
| Remembered enemy buildings | warcraft_ii:_tides_of_darkness.wiki | implemented | updateFog() G.memory |
| Fog off option | warcraft_ii:_remastered_patch_information.wiki | implemented | newGame() reveal, o-fog |
| Submarine and invisibility detection | warcraft_ii:_battle.net_edition.wiki | implemented | updateDetection(), seenBy() |
| Unfinished towers cannot detect | warcraft_ii:_battle.net_edition.wiki | implemented | updateDetection() !d.done |
| Transports load and unload | transport_(wc2_human).wiki | implemented | updLoad(), unloadAt() |
| Attack ground (siege, ships) | ballista_(warcraft_ii).wiki | implemented | updAttackGround() |
| Demolition blast | demolition_squad_(warcraft_ii).wiki | implemented | detonate() |
| Half/full damage roll, armor | warcraft_ii_units.wiki | implemented | rollDamage() game.js:656 |
| Splash hurts friends | warcraft_ii_units.wiki | implemented | updateProjectiles() |
| Corpses that decay | warcraft_ii:_tides_of_darkness_manual.wiki | implemented | kill() corpses, CORPSE_TTL |
| Mana, spells, summons (audited) | warcraft_ii_abilities.wiki | implemented | castNow(), updateSpells() |
| Polymorph turns target into critter | mage_(warcraft_ii).wiki | partial | castNow() polymorph, always sheep |
| Victory by eliminating all enemies | warcraft_ii_map_editor.wiki | implemented | step() alive() game.js:1921 |
| Critters not auto-attacked | critter_(warcraft_ii).wiki | implemented | scanTarget() skips neutral |
| Select up to 9 units | warcraft_ii:_remastered.wiki | implemented | RULES.SELECT_CAP 9 |
| One unit trained at a time | warcraft_ii:_battle.net_edition.wiki | implemented | updateBuilding() b.training |
| Patrol for fliers, sappers, eye | warcraft_ii:_battle.net_edition.wiki | partial | buildButtons() combat units only |
| Any race vs any race | warcraft_ii:_battle.net_edition.wiki | partial | newGame() enemyRace = other race |
| 3 to 8 players | warcraft_ii:_beyond_the_dark_portal.wiki | missing | owners fixed: player, enemy, neutral |
| Alliances and shared vision | warcraft_ii:_battle.net_edition.wiki | missing | no "ally" logic |
| AI air attacks, naval landings | warcraft_ii:_beyond_the_dark_portal.wiki | missing | aiThink(), GAPS.md 6 |

Notes:

- **Carry speed.** Both worker infoboxes give speed "10, 7 (carrying goods)". `moveStep()` uses the same speed loaded
  or empty.
- **Patrol.** The BNE page says Flying Machines, Zeppelins, Sappers and Demolition Squads can patrol, and patch 2.02
  adds the Eye of Kilrogg. Here `buildButtons()` offers Patrol only when `UNIT_DEFS.combat` is true. That flag is false
  for fliers, demolition units and the eye.
- **Race pairing.** BNE lets each slot pick any race, including Random. `newGame()` always gives the computer the
  race the player did not pick, so Human vs Human and Orc vs Orc cannot be played.
- **More players.** The BtDP page lists 8 players and shared vision. The BNE page lists Top vs Bottom teams, shared
  vision and "allies can see friendly invisible units". The engine hard-codes two sides (`other()`, `G.players`,
  `G.stats`, `G.detect`), so this is the largest structural gap.
- **AI.** The wiki does not describe the AI's scripts. The BtDP page only says mission AIs are more scripted, for
  example "human wave" attacks or building their own base. The gap row comes from GAPS.md section 6.
- **Mine death bug.** The mine collapse that killed a worker inside, and the pre-BNE lumber and gold refund from a
  drained platform, were bugs that later patches removed. They are left out on purpose.

## 5. Campaign mechanics

| Concept | Wiki | Status | Code |
|---|---|---|---|
| Campaign mode with mission sequence | warcraft_ii:_tides_of_darkness_missions.wiki | missing | no "mission" in code |
| Mission briefing screen | warcraft_ii:_tides_of_darkness.wiki | missing | no briefing UI |
| Objectives dialog in game | warcraft_ii_patch_information.wiki | missing | menu has no objectives |
| Rescue: neutral units join on contact | ambush_at_tarren_mill_(wc2_human).wiki | missing | no "rescue" in code |
| Capture a building by touching it | the_dark_portal_(wc2_orc).wiki | missing | no "capture" in code |
| Deliver a unit to a Circle of Power | circle_of_power.wiki | missing | no trigger zones |
| Hero must survive or mission fails | warcraft_ii:_beyond_the_dark_portal.wiki | missing | no hero flag |
| "Build N of X" objectives | hillsbrad_(wc2_human).wiki | missing | victory is elimination only |
| "Destroy all X" objectives | grim_batol_(wc2_human).wiki | missing | victory is elimination only |
| Survive until relieved | siege_of_vanguard_(wc2_human).wiki | missing | no timers |
| Only a named unit can harm a target | the_bitter_taste_of_victory_(wc2_human).wiki | missing | no damage filters |
| Several computer factions per map | the_skull_of_gul'dan_(wc2_orc).wiki | missing | two owners only |
| Mission select or level jump | warcraft_ii_cheat_codes.wiki | missing | no campaign state |
| Act-end campaign cinematics | warcraft_ii_campaign_cinematics.wiki | out of scope | Blizzard video |
| Blizzard briefing and story text | warcraft_ii:_tides_of_darkness_missions.wiki | out of scope | write original text instead |

Notes:

- **Rescue and capture.** Several missions depend on these: The Dark Portal says the Portal "will come under the
  player's control once one of their units moves adjacent to it". Rescue works the same way for the captured units in
  Tarren Mill, Alterac and Raid at Hillsbrad. The Runestone is "internally marked as belonging to the Alliance
  Traitors faction" so that it can be captured.
- **Objectives dialog.** Patch 1.23 mentions quitting "from the mission objectives dialog".
- **Level jump and mission select.** tigerlily jumps levels ("human #", "orc #", "xorc10"). The Remastered page lists
  mission select screens.
- **What the engine needs.** A per-map trigger list, checked each tick, would cover every objective type in the table.
  Mission state must also be saved.

## 6. Game modes and options

| Concept | Wiki | Status | Code |
|---|---|---|---|
| Skirmish vs one computer | warcraft_ii:_tides_of_darkness.wiki | implemented | newGame(), aiThink() |
| Custom scenario (pick a map) | warcraft_ii_scenarios.wiki | missing | map is always generated |
| LAN / modem / IPX multiplayer | warcraft_ii:_tides_of_darkness_manual.wiki | missing | no networking |
| Battle.net, ladders, chat icons | warcraft_ii_chat_icons.wiki | out of scope | Blizzard service |
| Six game speeds | warcraft_ii:_battle.net_edition.wiki | implemented | RULES.SPEEDS data.js:189 |
| Pause | warcraft_ii:_battle.net_edition.wiki | implemented | setPaused() |
| Save and load | warcraft_ii_patch_information.wiki | implemented | saveGame(), loadGame() |
| Choose race | warcraft_ii:_battle.net_edition.wiki | implemented | index.html race, newGame() |
| Random race | warcraft_ii:_battle.net_edition.wiki | missing | race select has 2 options |
| Choose or randomise tileset | warcraft_ii:_battle.net_edition.wiki | missing | only one tileset |
| Resources: low/medium/high | warcraft_ii:_remastered_patch_information.wiki | partial | RULES.START; no "map default" |
| Units: one peasant or map default | warcraft_ii:_battle.net_edition.wiki | partial | o-units: 1 or 5 workers |
| Top vs Bottom team template | warcraft_ii:_battle.net_edition.wiki | missing | two sides only |
| Random or fixed start locations | warcraft_ii:_remastered_patch_information.wiki | missing | starts fixed by genMap() |
| Cheat codes (18) | warcraft_ii_cheat_codes.wiki | missing | no "cheat" handler |
| "Cheater!" rank after cheating | warcraft_ii_ranks.wiki | missing | rankOf() has no flag |
| Hidden song via "disco" | i'm_a_medieval_man.wiki | out of scope | Blizzard song |
| Demo / shareware campaign | warcraft_ii:_tides_of_darkness_shareware.wiki | missing | see section 8 |
| Remastered art toggle, grid keys | warcraft_ii:_remastered.wiki | out of scope | Remastered-only UX |
| Remastered 1.0.1 balance patch | warcraft_ii:_remastered_patch_information.wiki | out of scope | clone keeps ToD/BNE values |

**Cheats.** The wiki lists 18 codes, typed after Enter:

- **Resources:** glittering prizes (resources for everyone), valdez (oil).
- **Upgrades and mana:** deck me out, every little thing she does.
- **Economy speed:** hatchet (trees in two chops), make it so (faster production).
- **Combat:** it is a good day to die.
- **Map:** on screen, showpath.
- **Win or lose:** unite the clans, you pitiful worm, never a winner, there can be only one.
- **Mission jump:** tigerlily.
- **Screens:** noglues.
- **Jokes:** day, ucla, disco.

The game has no text input and no cheat handler. The "Revealed map" title option does the same as "on screen", but
only before the game starts. The rank table then shows "Cheater!" in place of the rank.

**Starting options.** "Units: five workers" is this project's own option. WC2 offers "one peasant only" or the map's
default units.

## 7. Interface and presentation

| Concept | Wiki | Status | Code |
|---|---|---|---|
| Minimap: fog, jump, right-click move | warcraft_ii:_tides_of_darkness_manual.wiki | implemented | renderMinimap(), minimapJump() |
| 3x3 command card with hotkeys | warcraft_ii_structures.wiki | implemented | buildButtons(), RACES.hotkeys |
| Info panel: HP, armor, damage, mana | warcraft_ii_units.wiki | implemented | updatePanel() game.js:2400 |
| Multi-select panel with 9 portraits | warcraft_ii:_tides_of_darkness.wiki | partial | updatePanel() text counts only |
| Unit portraits | warcraft_ii_units.wiki | implemented | drawPortrait() |
| Status line and attack alerts | quotes_of_warcraft_ii.wiki | implemented | notice(), hit() alert |
| Control groups (Ctrl+#, # twice) | warcraft_ii:_battle.net_edition.wiki | implemented | keydown Digit handler |
| Ctrl/double-click selects same type | warcraft_ii:_battle.net_edition.wiki | missing | leftClick() has no dblclick |
| Space centres on last alert | warcraft_ii:_battle.net_edition.wiki | missing | no Space handler |
| Right-click smart orders | warcraft_ii:_battle.net_edition.wiki | implemented | rightClick() game.js:2605 |
| Button tooltips | warcraft_ii:_remastered.wiki | implemented | buildButtons() b.title |
| Health bars over units | warcraft_ii:_remastered.wiki | implemented | hpBar() game.js:2080 |
| Unit voices: what, yes, annoyed | quotes_of_warcraft_ii.wiki | partial | voice() game.js:2310, VOICES |
| Voices: ready, job done, dead, help | quotes_of_warcraft_ii.wiki | partial | sfx('ready'), notice(); few clips |
| Hero voice sets (BtDP) | quotes_of_warcraft_ii.wiki | missing | no heroes |
| Sound effects | warcraft_ii:_battle.net_edition.wiki | implemented | sfx(), SFX_FILES |
| Music: race themes, war room, end | warcraft_ii_midi_files.wiki | partial | MUSIC calm/battle/defeat |
| Score screen with tallies and rank | warcraft_ii_ranks.wiki | implemented | showResult(), rankOf() |
| Faction names by team colour | warcraft_ii_ranks.wiki | missing | score rows say you/enemy |
| Eight team colours | alliance_traitors.wiki | partial | art.js FACTION: 2 colours |
| Eight facing directions | warcraft_ii_units.wiki | partial | 4 LPC facings (GAPS.md 3) |
| Chat / message entry (Enter) | warcraft_ii_cheat_codes.wiki | missing | no text input in game |
| Intro and outro cinematics | warcraft_ii:_tides_of_darkness_cinematic_intro.wiki | out of scope | Blizzard video |

Notes:

- **Voices.** The quotes page gives each unit type these line sets: Ready (when trained), What (selected), Yes
  (acknowledged), Pissed (up to 7 escalating lines), Job complete (workers), plus race-wide "under attack" and
  "work complete". The game has one small shared set per race, told apart only by pitch
  (`voice()`, `pitchOf()`). The BtDP heroes each have unique quotes.
- **Music.** The WC2 score has Human 1-4, Orc 1-4, a war room theme per race, and death and victory stings for each
  race. The game plays one calm loop, one battle loop and a defeat theme, the same for both races. The Blizzard tracks
  themselves are out of scope. The structure (per-race playlists, briefing theme, victory and defeat stings) is not.
- **Multi-select panel.** In WC2 selecting several units shows up to nine small portraits with health. Here it is a
  line of text such as "3 Footman, 2 Elven Archer".
- **Score screen.** Points follow warcraft_ii_ranks.wiki with one exception: the Gryphon Aviary / Dragon Roost gives
  280 in `data.js` (`aviary.points`), but the wiki table gives 250. AUDIT.md did not check points, so this is a new data
  mismatch.
- **Team colours.** WC2 has eight team colours, each with a nation or clan name. The ranks page says the victory
  screen lists armies "as the nation/clan assigned to the Team color". The game has blue for the player and red for
  the enemy.

## 8. Campaign missions

All missions are **missing**, since the campaign mechanics in section 5 are missing. The "Needs" column lists the
section 5 features each mission requires beyond the skirmish engine. Blizzard's maps and briefing text are out of
scope, so a remake would need original maps and text built on these objective types.

### Tides of Darkness: Orc campaign

| # | Wiki | Objectives | Needs |
|---|---|---|---|
| 1 | zul'dare_(wc2_orc).wiki | Build 4 farms and a barracks | build-N |
| 2 | raid_at_hillsbrad_(wc2_orc).wiki | Rescue Zul'jin, return him to circle | hero, rescue, circle |
| 3 | southshore_(wc2_orc).wiki | Build shipyard and 4 oil platforms | build-N |
| 4 | assault_on_hillsbrad_(wc2_orc).wiki | Destroy Hillsbrad and defenders | multi-faction |
| 5 | tol_barad_(wc2_orc).wiki | Retake Dun Modr, destroy Tol Barad | rescue buildings |
| 6 | the_badlands_(wc2_orc).wiki | Escort Cho'gall to circle | hero, circle |
| 7 | the_fall_of_stromgarde_(wc2_orc).wiki | Recapture transports, destroy city | rescue units |
| 8 | the_runestone_at_caer_darrow_(wc2_orc).wiki | Destroy castle, secure Runestone | Runestone, capture |
| 9 | the_razing_of_tyr's_hand_(wc2_orc).wiki | Build fortress and shipyard on isle | build-N, island map |
| 10 | the_destruction_of_stratholme_(wc2_orc).wiki | Destroy platforms, refineries, city | destroy-all-X |
| 11 | the_dead_rise_as_quel'thalas_falls_(wc2_orc).wiki | Destroy the Elven stronghold | destroy target |
| 12 | the_tomb_of_sargeras_(wc2_orc).wiki | Destroy Stormreaver and Twilight's Hammer | several orc AIs |
| 13 | the_siege_of_dalaran_(wc2_orc).wiki | Destroy Dalaran and defenders | multi-faction |
| 14 | the_fall_of_lordaeron_(wc2_orc).wiki | Destroy everything | multi-faction |

### Tides of Darkness: Human campaign

| # | Wiki | Objectives | Needs |
|---|---|---|---|
| 1 | hillsbrad_(wc2_human).wiki | Build 4 farms and a barracks | build-N |
| 2 | ambush_at_tarren_mill_(wc2_human).wiki | Rescue an archer, return to circle | rescue, circle |
| 3 | southshore_(wc2_human).wiki | Build shipyard and 4 oil platforms | build-N |
| 4 | attack_on_zul'dare_(wc2_human).wiki | Destroy the orc base | destroy target |
| 5 | tol_barad_(wc2_human).wiki | Reclaim Tol Barad, destroy Dun Modr | rescue buildings |
| 6 | dun_algaz_(wc2_human).wiki | Destroy Dun Algaz | destroy target |
| 7 | grim_batol_(wc2_human).wiki | Destroy five oil refineries | destroy-N-X |
| 8 | tyr's_hand_(wc2_human).wiki | Quell uprising, build castle, win | build-N, multi-faction |
| 9 | the_battle_at_darrowmere_(wc2_human).wiki | Escort Uther to circle | hero, circle |
| 10 | the_prisoners_(wc2_human).wiki | Ferry 4 traitors to circle | rescue, circle, transport |
| 11 | betrayal_and_the_destruction_of_alterac_(wc2_human).wiki | Free mages and peasants, destroy Alterac | rescue |
| 12 | the_battle_at_crestfall_(wc2_human).wiki | Sink transports, platforms, shipyards | destroy-all-X |
| 13 | assault_on_blackrock_spire_(wc2_human).wiki | Destroy Blackrock Spire, all enemies | destroy target |
| 14 | the_great_portal_(wc2_human).wiki | Destroy the Great Portal | Dark Portal |

### Beyond the Dark Portal: Orc campaign

| # | Wiki | Objectives | Needs |
|---|---|---|---|
| 1 | slayer_of_the_shadowmoon_(wc2_orc).wiki | Kill Death Knights and Temple; Grom lives | hero, destroy-all-X |
| 2 | the_skull_of_gul'dan_(wc2_orc).wiki | Recruit, destroy, rescue clans; heroes live | allies, rescue, hero |
| 3 | thunderlord_and_bonechewer_(wc2_orc).wiki | Destroy two clans | several AIs |
| 4 | the_rift_awakened_(wc2_orc).wiki | Destroy the humans; Teron lives | hero |
| 5 | dragons_of_blackrock_spire_(wc2_orc).wiki | Capture dragons and the roost | capture |
| 6 | new_stormwind_(wc2_orc).wiki | Destroy everything; Teron lives | hero |
| 7 | the_seas_of_azeroth_(wc2_orc).wiki | Build 5 shipyards, sink all ships | build-N, destroy-all-X |
| 8 | assault_on_kul_tiras_(wc2_orc).wiki | Destroy the navy and Kul Tiras | destroy-all-X |
| 9 | the_tomb_of_sargeras_(wc2x_orc).wiki | Slay the Daemon with the Scepter | Daemon, kill target |
| 10 | alterac_(wc2_orc).wiki | Destroy settlements, deliver a mage | rescue, circle |
| 11 | the_eye_of_dalaran_(wc2_orc).wiki | Destroy Mage Towers and Dalaran | destroy-all-X, winter |
| 12 | the_dark_portal_(wc2_orc).wiki | Capture the Dark Portal, kill humans | Dark Portal, capture |

### Beyond the Dark Portal: Human campaign

| # | Wiki | Objectives | Needs |
|---|---|---|---|
| 1 | alleria's_journey_(wc2_human).wiki | Rescue 3 heroes, return to circle | heroes, rescue, circle |
| 2 | the_battle_for_nethergarde_(wc2_human).wiki | Destroy all enemies; Danath lives | hero |
| 3 | once_more_unto_the_breach_(wc2_human).wiki | Raze strongholds; Turalyon to Portal | hero, Dark Portal |
| 4 | beyond_the_dark_portal_(wc2_human).wiki | Build a castle by the Portal, win | build-N, Dark Portal |
| 5 | upon_the_shadowed_seas_(wc2_human).wiki | Build 3 shipyards, destroy orc yards | build-N, destroy-all-X |
| 6 | the_fall_of_auchindoun_(wc2_human).wiki | Beat Bleeding Hollow, heroes to circle | heroes, circle |
| 7 | deathwing_(wc2_human).wiki | Kill Deathwing and lair; heroes live | Deathwing, heroes |
| 8 | coast_of_bones_(wc2_human).wiki | Destroy all enemy forces | swamp tileset |
| 9 | the_heart_of_evil_(wc2_human).wiki | Destroy fortress and Mystic Sanctum | Runestones, rescue |
| 10 | siege_of_vanguard_(wc2_human).wiki | Hold out; heroes must survive | hero, survive |
| 11 | dance_of_the_laughing_skull_(wc2_human).wiki | Destroy all; heroes live; mixed casters | heroes, mixed races |
| 12 | the_bitter_taste_of_victory_(wc2_human).wiki | Only Khadgar may destroy the Portal | hero, damage filter |

### Tides of Darkness demo

| # | Wiki | Objectives | Needs |
|---|---|---|---|
| H1 | hillsbrad_(wc2_demo).wiki | Build 4 farms, barracks, lumber mill | build-N |
| H2 | southshore_(wc2_demo).wiki | Build shipyard and 4 oil rigs | build-N |
| H3 | zul'dare_(wc2_demo).wiki | Locate and destroy the orc base | destroy target |
| O1 | tol_ronal_(wc2_demo).wiki | Build 4 farms, barracks, lumber mill | build-N |
| O2 | dun_argath_(wc2_demo).wiki | Build shipyard and 4 oil rigs | build-N |
| O3 | thandol_(wc2_demo).wiki | Destroy the human base | destroy target |

Counting by need, the objective types cover every mission:

- build-N: 13 missions;
- a hero or a unit that must survive: 15;
- rescue: 11;
- Circle of Power delivery: 8;
- several computer factions or allies: 7;
- capture: 3;
- the Dark Portal object: 4.

Dance of the Laughing Skull also gives the player casters of both races, so the engine must let one owner field
units of both races.

## Out of scope

The rule: no Blizzard-owned media or text, no Blizzard online services, and no features that only exist to support a
particular release. None of these count in the tables above except where a row names them.

- **Battle.net:** Battle.net and its ladders, chat icons, spawn installs, CD keys and lobbies
  (warcraft_ii_chat_icons.wiki, warcraft_ii:_battle.net_edition.wiki).
- **Blizzard media:** the intro, outro and act cinematics, the MIDI and CD music, "I'm a Medieval Man", and the
  voice recordings. Original replacements are in scope. Sources: warcraft_ii_campaign_cinematics.wiki,
  warcraft_ii_midi_files.wiki.
- **Campaign writing:** briefing and story text, lore, the character pages (about 130), places, artifacts (Book of
  Medivh, Skull of Gul'dan, Eye of Dalaran, Jeweled Scepter), books, guide books, novels, voice actors and credits.
- **Editions and patches:** edition and bundle pages, including the console Dark Saga, Remastered's art toggle and
  its balance patch. Also patch-only fixes: CD-ROM, DirectX, the memory cheat fix and the 24-day timer bug.
- **Unused content:** the unused beta spells in warcraft_ii_abilities.wiki (Unholy Vision, Search for Oil, the summon
  spells, Hallucinate, Greater Healing).
- **Third-party products:** W!Zone, The Next 70/350 Levels, WarCraft 2000, and fan editions.
- **Spec decision:** the BNE production queue. The spec (units_buildings.md section 7) keeps the original's one unit
  at a time, even though the BNE page lists queuing.

## Top gaps to build next

Ordered by how much each matters to playing the game: core skirmish first, then campaign content, then cosmetics.

1. **More than two sides.** Replace the fixed `player`/`enemy` owners with N players, each with a race and colour.
   This unblocks 3-8 player skirmish, several AIs, teams, alliances and shared vision, and many missions.
2. **Free race choice for each side.** Allow mirror matches (Human vs Human, Orc vs Orc) and a Random race.
3. **Tilesets.** Add winter, wasteland and swamp, each with its own critter (seal, boar, helboar), plus a random
   tileset option. Stop tying Sheep and Pig to race.
4. **Walls.** 40 HP, damage to neighbouring sections, missiles blocked; placed on maps and buildable in multiplayer.
   The AI does not target them on purpose.
5. **Island maps and the AI to use them.** Add a transport-required template with AI naval landings, plus the air
   attack script (GAPS.md 6 and 7).
6. **PUD loader and custom scenario screen.** Play maps the player owns, with 2-8 start locations and the "map
   default" resources and units options.
7. **Workers slowed to speed 7 while carrying.** This is an economy rule, not cosmetic.
8. **Selection helpers.** Ctrl-click or double-click selects every unit of that type on screen; Space centres on the
   last alert.
9. **Patrol for non-combat units.** Flying Machines, Zeppelins, Sappers, Demolition Squads and the Eye of Kilrogg.
10. **Gold mines.** Let them be attacked (25500 HP) and give them varied amounts per map.
11. **Cheats.** An Enter-key message line, the 18 cheat codes, and the "Cheater!" rank.
12. **Trigger and objective engine.** Rescue on contact, capture, delivery to a Circle of Power, heroes that must
    survive, build N, destroy all X, survive, damage filters. Add briefing and objectives screens and campaign
    progression, and save the mission state.
13. **Heroes, the Daemon, and Attack Peasants/Peons.** The 15 heroes are stat variants of their base roles with
    portraits and a hero flag. Stats are in units_buildings.md Appendices A and B.
14. **Neutral buildings.** Runestone, Dark Portal and Circle of Power.
15. **Original campaigns** built from the 58 mission patterns in section 8, with original maps and text.
16. **Map editor** that writes the PUD-compatible format from item 6.
17. **Network multiplayer** (LAN or peer-to-peer). This is large, and only worth doing after item 1.
18. **Voices.** Full per-unit sets: ready, what, yes, pissed (escalating), job done, death, under attack. Unique hero
    lines.
19. **Music.** Per-race playlists, war-room and briefing themes, and victory and defeat stings.
20. **Multi-select panel** with nine mini portraits and health.
21. **Eight team colours** with nation and clan names on the score screen.
22. **Eight facing directions** for units (GAPS.md 3).
23. **Critter easter egg.** It explodes after repeated clicks.
24. **Data fix.** Aviary / Roost score points 280 → 250, per warcraft_ii_ranks.wiki.
