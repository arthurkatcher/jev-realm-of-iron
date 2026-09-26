# To do

Work order for the remaining Warcraft II gaps, merged from two independent sweeps of the local wiki mirror:
`docs/wiki/COVERAGE.md` (A) and `docs/wiki/COVERAGE_B.md` (B). Done items move to `docs/GAPS.md`.

## Already fixed from the sweeps

- AI pacing (2026-09-26, from telemetry of 16 self-play games): the first wave of 4 leaves at about 3:00, before the
  smithy research. Between waves the AI trains toward the next wave. A wave's unit types that can't be made yet (no
  mill, or lumber short while gold piles up) are filled with melee units, and a wave that can't be completed leaves
  after 60 s. Research no longer holds gold while a smithy or mill is busy. Farms are built ahead of demand. A step
  stuck for 3 minutes is skipped. An idle army at home goes out anyway. Result: waves every 2.5 to 3 minutes, and all 8
  test games decided (16 to 44 min) where 2 of 4 were draws before.
- AI bugs: an expansion hall could seal off its own gold mine (sites are now checked for reachability). Leftover
  enemy tankers kept a game from ending (idle warships now hunt them). Buildings had no `trains` field, so
  `idleProducers` in the agent observation was always empty (fixed).

- Workers slow to speed 7 while carrying (A, B).
- Workers and casters flee when attacked while idle or harvesting; harvesters go back to work afterwards (B).
- Workers or tankers inside a destroyed hall or depot die with it (B).
- An oil platform is removed when its patch runs dry (B, a bug).
- Gryphon Aviary / Dragon Roost points 250, per the wiki's ranks table (A).
- Wiki audit fixes in `data.js`: hotkeys, orc labels, skeleton food, critter speed.
- Command card: a WC2-style icon for every order, upgrade, spell, unit and building.
- Group 1 (done and tested): walls, selection shortcuts, tower priority, patrol for non-combat units, ship repair,
  attackable gold mines, cheat codes. Former items 4 and 7–12.
- After the first test drive: forests sit on the same grass as the ground, dry grass in soft patches, sheep on the
  ground and attackable (and the pester-to-explode joke), the home mine in view at the start, and the AI pass
  described in `GAPS.md` §6 (no lone-unit attacks, mustered waves, lumber balance, expansion, reservations).
- After the second test drive (2026-09-26): a smooth coastline (marching-squares banks with surf and damp earth
  instead of the stepped sand strip), rock massifs in the deep woods (at least 3x3, no wall-like strips), gold
  mines spaced apart (an expansion is at least max(14, 0.3 x map size) tiles from the home mine), a square minimap
  with no black strip, and synthesised sword clashes for melee hits (`tools/synth_sword_clash.py`).
- AI fixes from the self-play sweep on all map sizes: the building a script step waits on is saved for (orcs
  stalled on the lumber mill), research reserves its cost even while its building is busy training (and a research
  step stuck for 3 minutes is skipped), spare gold turns into troops while a step waits on lumber, and a lost
  barracks is rebuilt ahead of the reserve. Still open: lumber runs short in the late game; some big-map games end
  as draws with a few enemy ships or buildings left.

## Next milestone: an LLM player against the native AI

Research in `docs/LLM_PLAYER_RESEARCH.md`. A planner (GPT-6 Astra) and a fast decision model (TypeSafe Jev) play the
player's side through the game API, paused while they think, against our native AI. Groups 2 and 3 below wait until
this is done.

Status (2026-09-26): the harness is `harness/llm_player.py` (game side: `__game.agent/advance/observe/actions/macro`).
Runs are logged in `harness/runs/`. Tuning so far: the planner gets the full action-key vocabulary, sets a worker
target, a save target and an attack size; Jev is offered only the top three legal plan priorities; tech buildings
are offered once. Four games: untuned timed out behind (20 vs 60 units at 45 min), two early tunings lost at 12 and
14 min, the latest was ahead at 17 min (48 vs 36 units, 21 vs 16 buildings) when the OpenRouter key hit its spending
limit. Open issue: Jev still answers "wait" on most turns and never orders an attack on its own; the planned attack
size (30) is rarely reached.

## Core skirmish (both sweeps agree unless marked)

1. **More than two sides.** 2–8 players, a race and a colour per side, several computer opponents, teams, alliances
   and shared vision. The engine is hard-coded to `player` / `enemy` / `neutral`, so this is the big refactor.
2. **Race per side**, including Human vs Human, Orc vs Orc and random (A).
3. **Tilesets:** winter, wasteland and swamp, with their critters (seal, boar, hellboar), and a tileset option.
5. **Island maps** and AI transport landings; an AI air-attack script.
6. **Map loading:** read `.pud` maps the player owns; custom-scenario screen, 2–8 start locations.
13. **Playtest and balance** on every map size, both races, with the AI.

## Campaign content

14. **Mission framework:**
    - objectives: build N, destroy X, rescue, escort to a Circle of Power, heroes must survive, capture, survive;
    - briefing and objectives screens;
    - tech unlocked per mission;
    - progression and saved mission state.
15. **Heroes and special units:** 15 heroes, the Daemon, and Attack Peasants/Peons.
16. **Neutral buildings:** Runestone, Dark Portal, Circle of Power.
17. **Our own campaigns** following the 58 mission patterns, with our own maps and text.
18. **Map editor.**

## Presentation

19. Per-race music and more voice lines, if free packs allow.
20. Eight facing directions and eight team colours.
21. A nine-portrait panel for multi-selection; an options menu for volume and scroll speed.
22. Easter eggs (the critter that explodes when clicked repeatedly).

## Art left (from the art pass)

The refinery (GPL art, a slightly different style), a proper fantasy submarine, and gyrocopter/blimp shapes for the
flying machine and zeppelin. Also mounted paladins and death knights, a caster pose for the Ogre-Mage, and flight
sprites for arrows, axes, fireball and lightning.
