# Engine gap audit: Realm of Iron vs Warcraft II

This file compares what the engine does today with Warcraft II: Tides of Darkness. It was last updated on 2026-09-26,
after the data, spells, AI, interface and map work. The Warcraft II facts come from `docs/spec/`; the local wiki
mirror in `docs/wiki/` is becoming the source of truth. The remaining work order is in `docs/TODO.md`.

Status words: **ok** matches WC2, **simplified** exists but differs, **missing** absent.

## 1. Data model

All unit, building, upgrade and spell data lives in `data.js`, keyed by generic role, with per-race names, costs and
hotkeys in `RACES`. Values use WC2 conventions: times in 1/5 s, speed in cycles per tile, cooldown in cycles.

| Area | Status | Now |
|---|---|---|
| Role roster | ok | 19 unit roles, 20 building roles, both races |
| Costs, times, oil | ok | WC2 values; orc costs where they differ |
| Hall tiers | ok | Keep/Castle are building types a hall upgrades into |
| Upgrade levels | ok | two levels of weapons, shields, arrows, cannons, hulls, siege |
| Unit conversions | ok | Archer→Ranger, Knight→Paladin, Ogre→Ogre-Mage keep wounds |
| Wiki cross-check | in progress | `docs/wiki/AUDIT.md` compares each object with the wiki |

## 2. Economy

| Mechanic | Status | Now |
|---|---|---|
| Gold per trip, depot wait | ok | 100 gold, workers hide 5 s in the hall |
| Keep/Castle/Mill/Refinery bonus | ok | best bonus the player owns |
| Oil | ok | tanker, platform, refinery; shipyard/refinery depots |
| Food | ok | hall 1, farm 4, cap 200 |
| Starting resources | ok | low/medium/high on the title screen |
| Repair, cancel refund | ok | WC2 rates; 75% refund |

## 3. Combat

| Mechanic | Status | Now |
|---|---|---|
| Damage formula | ok | max(basic − armor, 1) + piercing, 50–100% roll |
| Splash | ok | falls off with distance, hurts own units |
| Invisibility / detection | ok | Invisibility, submarines, turtles; towers and eyes detect |
| Demolition | ok | Dwarves and Sappers blow up (radius 2, 400), hunt on patrol |
| Tower targeting | ok | wiki priority list, nearest within a tier |
| Gold mines | ok | attackable: 25,500 HP, armor 20; miners inside die |
| Ship repair | ok | workers repair ships from the shore (Wargus) |
| Attack ground | ok | siege and ships |
| Buildings burning | ok | fire is cosmetic, as in Wargus (no burn-down) |
| Facing | simplified | 4 directions from the LPC art; WC2 has 8 |

## 4. Spells

All 18 spells are in, with research at the Church, Mage Tower, Altar and Temple. Mana starts at 84, peaks at 255 and
regenerates 1 per second. Blizzard, Death and Decay and Raise Dead repeat in waves.

## 5. Orders and interface

| Feature | Status |
|---|---|
| WC2 3×3 command card with underlined hotkeys | ok |
| Build Basic / Build Advanced submenus (B / V) | ok |
| Move, Stop, Attack, Patrol, Stand Ground, Harvest, Return, Repair | ok |
| Title screen: race, map size, terrain, resources, units, opponent, fog, seed | ok |
| Six WC2 game speeds | ok |
| Score screen: Units, Buildings, Gold, Lumber, Oil, Kills, Razings, rank | ok |
| Selecting a mine or oil patch shows what is left | ok |
| Ctrl+click / double-click selects that type on screen | ok |
| Space jumps to the last attack alert | ok |
| Cheat codes on the Enter line; "Cheater!" rank | ok |
| Walls (title option; WC2 allows them in multiplayer only) | ok |
| Per-unit voice sets | simplified (small clip pack) |

## 6. AI

The AI follows the Wargus land-attack script with sea steps mixed in, and can play either side (`__game.autopilot`
runs it for the player too, for self-play tests). It trains workers, balances gold and lumber from the stock ratio
(a lumber trip is about four times a gold trip, so about half the workers cut wood), builds farms on demand and puts
its lumber mill by the woods. It keeps a small home guard from the first barracks on. Waves never leave alone: each
assembles at a rally point outside the base, then marches in hops along the walking route, waiting for stragglers,
and is let loose near the target. The first wave (4 footmen or grunts) arrives at about 4.5 to 5.5 minutes. A recipe
that cannot be met within 90 s leaves with what is on hand. Saving for a tier or research reserves only that cost,
so other spending goes on, and surplus gold becomes extra troops and up to three barracks. It expands while its
home mine still holds 15,000 gold, reserving the hall's cost ahead, and sends miners to mines beside its own halls.
Fleets pick targets on their own sea only; land armies pick what they can reach. Once the foe has no hall left,
every idle land and air unit hunts the rest. It techs to Castle/Fortress, researches, builds a navy and casts spells.
In self-play both sides reach paladins, mages and battleships, and games end decisively at 25 to 45 minutes.
Friendly units that block each other in a narrow gap swap tiles, so worker knots between hall and mine cannot form.
Missing: transports landing troops on islands, a separate air-attack script.

## 7. Maps

The generator makes point-symmetric maps from 32×32 to 128×128. Each has two templates, strait and bays; forest walls
with clearings and roads; rock outcrops; meadows with critters; and harbour clearings on the coast. Expansions scale
with size (1 per side at 32 up to 4 at 128). Oil patches sit offshore, clear of the WC2 shipyard gap. Every tested
seed (1–12 at 64 and 96) has a legal, reachable shipyard site. Missing: island maps, hand-made WC2 scenario maps.

## 8. Art

Being replaced now (see `docs/TODO.md`): stand-ins for Stables, Inventor, Mage Tower, Foundry and Refinery;
the Kenney placeholder ships; the Paladin, Ogre-Mage, Death Knight, skeleton, Dwarves and Sappers. Sources are in
`docs/spec/art_sources.md`; credits are in `assets/CREDITS.md`.
