# Warcraft II: Tides of Darkness — Game Mechanics & AI Spec

Scope: rules of play, timings, and computer-opponent behaviour for a browser clone.
Unit, building and upgrade stat tables live in sibling spec files and are not repeated here.

## 0. How to read this document

Confidence tags used below:

- **[ORIG]** stated by Blizzard (the WC2 Battle.net Edition manual) or by Blizzard's classic.battle.net strategy pages.
- **[WARGUS]** read directly from Wargus/Stratagus source. Wargus is a fan re-implementation that runs on the original game data. Its timings are careful approximations, not decompiled originals.
- **[COMMUNITY]** from fan guides, wikis or forums.
- **[UNVERIFIED]** my best understanding, with no primary source found. Treat as a design default.

Primary sources (fetched 2026-09-26):

- Manual: WC2 Battle.net Edition manual, http://ftp.blizzard.com/pub/misc/Warcraft%202%20Battlenet%20edition.PDF
- Blizzard strategy pages: http://classic.battle.net/war2/basic/ (combat.shtml, fog.shtml, score.shtml, hhk.shtml)
- Stratagus engine, commit 3d87c93: https://github.com/Wargus/stratagus/tree/master/src
- Wargus game scripts, commit cde1a07: https://github.com/Wargus/wargus/tree/master/scripts
- warcraft.wiki.gg: https://warcraft.wiki.gg/wiki/Warcraft_II:_Battle.net_Edition and https://warcraft.wiki.gg/wiki/Gnomish_Submarine

Unit conventions:

- 1 tile = 32×32 px.
- "Cycle" means one simulation tick. Wargus runs at 30 cycles/s at default speed.
- Every `wait N` in a Wargus animation lasts N cycles.

---

## 1. Game speed and time units

Source: `stratagus/src/include/settings.h`, `src/ui/interface.cpp`, `wargus/scripts/stratagus.lua`, `menus/options.lua`, and the BNE wiki page.

| Item | Value | Tag |
|---|---|---|
| Simulation rate at default speed | 30 cycles/s (`CYCLES_PER_SECOND`) | WARGUS |
| Wargus default `GameSpeed` preference | 30 | WARGUS |
| Speed hotkeys in Wargus | `+` / `-` change cycles/s by 1 | WARGUS |
| Named speeds in BNE | Slowest, Slow, Normal, Fast, Faster, Fastest | ORIG (see note) |
| BNE online games | speed fixed before start | ORIG |

**Conflict/gap.** No primary source gives the original ticks/s for each named speed. The BNE feature list only says it "added two new game speeds (Slowest and Faster)". **Recommended clone mapping [UNVERIFIED]:** keep the simulation at a fixed 30 cycles/s and scale wall-clock time per speed:

| Speed | Multiplier | Effective cycles/s |
|---|---|---|
| Slowest | 0.5× | 15 |
| Slow | 0.75× | 22.5 |
| Normal | 1.0× | 30 |
| Fast | 1.25× | 37.5 |
| Faster | 1.5× | 45 |
| Fastest | 2.0× | 60 |

### 1.1 Converting data values to seconds [WARGUS]

- **Build, train and research time.** The "time" cost field counts ticks of 6 cycles each. Training adds 1 tick every `CYCLES_PER_SECOND/6` = 5 (+1) cycles (`action_train.cpp`). Building progress is `time × 600` at 100 per cycle (`action_built.cpp`). So **seconds at Normal = time / 5**. Example: Footman time 60 → 360 cycles → 12 s.
- **Movement.** Speed comes from the Move animation, not from the `Speed` stat. Each animation moves 32 px (1 tile) over a fixed number of cycles. A good fit is **cycles per tile ≈ 160 / Speed**.

| Unit (Speed stat) | Cycles/tile | Tiles/s @30 |
|---|---|---|
| Peasant, Footman, Archer, Grunt (10) | 16 | 1.88 |
| Knight/Ogre, Gryphon/Dragon (13–14) | 12 | 2.50 |
| Mage (8) / Death Knight (8) | 18 / 19 | 1.67 / 1.58 |
| Dwarven Demo / Sappers (11) | 14 | 2.14 |
| Ballista/Catapult (5) | 32 | 0.94 |
| Tanker, Transport, Destroyer (10) | 16 | 1.88 |
| Battleship/Juggernaut (6) | 26 | 1.15 |
| Submarine/Turtle (7) | 21 | 1.43 |
| Flying Machine/Zeppelin (17) | 10 | 3.00 |
| Critter (3) | 48 | 0.62 |

The Ballista and Catapult take 63 cycles/tile in Wargus's optional "EnhancedEffects" mode. Source: `scripts/human/anim.lua`, `scripts/orc/anim.lua`, `scripts/anim.lua`.

- **Attack cooldowns.** Taken from full Attack animation length. The hit lands partway through.

| Attacker | Cycle length | Hit at cycle |
|---|---|---|
| Melee (Footman, Grunt, Peasant, Knight, Ogre) | 25 | 9 |
| Archer/Ranger | 65 | 10 |
| Axethrower/Berserker | 74 | 9 |
| Mage / Death Knight | 40 | 10 |
| Ballista / Catapult | 231 | 56 / 31 |
| Gryphon / Dragon | 190 | 37 / 25 |
| Destroyer | 120 | 0 |
| Battleship/Juggernaut | 230 | 0 |
| Submarine/Turtle | 115 | 35 |
| Guard Tower | 60 | 0 |
| Cannon Tower | 151 | 0 |

- **Mana** regenerates +1 per second (Increase = 1), with max 255. New casters start at 84 mana. Source: `scripts/spells.lua`, `DefineVariables("Mana", {Max=255, Value=84, Increase=1})` [WARGUS].

---

## 2. Combat

Source: manual p.27, http://classic.battle.net/war2/basic/combat.shtml, `stratagus/src/missile/missile.cpp` (`CalculateDamageStats`, `MissileHit`, `MissileHitsGoal`), and `wargus/scripts/missiles.lua`.

### 2.1 Damage formula

The manual (p.27) says [ORIG]: "Damage … is determined by subtracting the target's Armor from the attacking unit's Basic Damage, and then adding in the attacking unit's Piercing Damage. The attacking unit has a chance of doing either full damage or half damage with each attack."

- Manual example: an Ogre (8 basic, 4 piercing) against a Footman (armor 2) deals 5 or 10.
- A Footman (6 basic, 3 piercing) against an Ogre (armor 4) deals 3 or 5.
- classic.battle.net describes the roll as a range, "50–100% of this maximum".

Wargus implementation, applied per hit [WARGUS]:

```
dmg  = max(basic - armor, 1) + piercing      // basic & piercing ×2 if Bloodlust
dmg -= rand() % ((dmg + 2) / 2)              // uniform, gives ~50%..100%
```

| Rule | Value | Tag |
|---|---|---|
| Max damage | (Basic − Armor) + Piercing | ORIG |
| Roll | 50–100% of max, uniform integer | ORIG / WARGUS |
| Basic − Armor floor | 1 (Wargus) | WARGUS |
| Practical minimum | ≈ half the Piercing value | ORIG ("Min" in UI) |
| Building armor | 20 by default | ORIG (classic.battle.net) |
| Bloodlust | doubles basic and piercing before armor | WARGUS |

**Conflict.** The manual describes two outcomes: full or half damage. Wargus and classic.battle.net use a continuous 50–100% range. Use the continuous range. The unit panel shows the range as "Min-Max". Min is the damage done "no matter what armor". Max is the damage against zero armor.

### 2.2 Splash (area) damage [WARGUS]

A missile with `Range > 0` damages every unit within `Range − 1` tiles of the impact tile, so Range 2 covers a 3×3 area. Damage to each unit is `CalculateDamage / splash`:

- `splash` = 1 at distance 0.
- Otherwise `splash = distance × SplashFactor`.

| Missile (user) | Range | SplashFactor | Adjacent-tile damage |
|---|---|---|---|
| Catapult rock | 2 | 4 | 1/4 |
| Ballista bolt | 2 | 4 | 1/4 |
| Small cannon (Destroyer, Cannon Tower) | 2 | 3 | 1/3 |
| Big cannon (Battleship/Juggernaut) | 2 | 4 | 1/4 |
| Gryphon hammer / Dragon breath | 2 | 2 | 1/2, bounces 3× |
| Sub/Turtle torpedo | 1 | — | target tile only |
| Arrow, Axe | 0 | — | target only |

**Friendly fire.** Splash hits every unit in the area, including the attacker's own and allied units. The only exception is the firing unit itself (`CanHitOwner` false). Catapults, ballistas, cannons, dragons, gryphons and Demolition all damage friendly units [WARGUS; COMMUNITY agrees for catapults].

- Splash only hits unit types the attacker can target. For example, a catapult's splash never hits air units.
- **Attack Ground** is available to Ballista/Catapult and Battleship/Juggernaut (manual: "Only units with ranged attacks"). It fires at a tile and splashes normally.
- **Walls:** a land missile aimed at a land target stops on an enemy wall in its path (`MissileHandleBlocking`) [WARGUS].

### 2.3 Demolition (Dwarven Demolition Squad / Goblin Sappers) [WARGUS]

- The unit dies on detonation.
- Deals 400 damage to everything within range 3 (`spell-suicide-bomber`: `demolish range 3, damage 400`), friendly units included.
- Also destroys walls, rocks and trees in range.
- Wargus has the unit auto-detonate when an opponent is within 6 tiles.
- Wargus's "range 3" is looser than the original. Treat radius as tunable [UNVERIFIED].

### 2.4 Targeting domains (land / sea / air)

Source: `CanTargetAir`/`CanTargetSea` flags in `scripts/human/units.lua` and `scripts/orc/units.lua` [WARGUS].

| Attacker | Hits land | Hits sea | Hits air |
|---|---|---|---|
| Melee (Footman, Knight, Grunt, Ogre, Peasant) | yes | no | no |
| Archer/Ranger, Axethrower/Berserker | yes | yes | yes |
| Mage lightning, Death Knight | yes | yes | yes |
| Ballista / Catapult | yes | yes | no |
| Guard Tower | yes | yes | yes |
| Cannon Tower | yes | yes | no |
| Destroyer | yes | yes | yes |
| Battleship/Juggernaut | yes | yes | no |
| Submarine/Turtle | no* | yes | no |
| Gryphon / Dragon | yes | yes | yes |
| Flying Machine / Zeppelin | no | no | no (unarmed) |

\*The submarine cannot hit land units. Coastal buildings (Shipyard, Refinery, Foundry, Oil Platform) are both land and sea targets (`ShoreBuilding`), so ships, including submarines, can attack them.

- Ships can shell land units and buildings within range of the coast. Melee units cannot attack ships.
- Only Destroyers, Guard Towers, archer-types, casters and flyers can shoot flyers. The manual's AI note says Air Attack AI builds "guard towers and archers/axe throwers" as air defence [ORIG].

---

## 3. Resources and harvesting

Sources:

- Manual pp. 9–12 and 16–17.
- http://classic.battle.net/war2/basic/
- `wargus/scripts/human/units.lua` (peasant `CanGatherResources`, tanker, `ImproveProduction`), `scripts/stratagus.lua`, `scripts/wc2.lua`.
- `stratagus/src/action/action_resource.cpp`, `src/map/map.cpp`.
- https://www.the-lost-colony.net/p/warcraft-2-gold-lumber-and-peons

### 3.1 Per-trip amounts

| Resource | Base per trip | Bonus building | With bonus | Tag |
|---|---|---|---|---|
| Gold | 100 | Keep / Stronghold (+10) | 110 | ORIG base; WARGUS bonus |
| Gold | 100 | Castle / Fortress (+20) | 120 | WARGUS |
| Lumber | 100 | Lumber Mill (+25) | 125 | WARGUS |
| Oil | 100 | Refinery (+25) | 125 | WARGUS |

- The bonus is player-wide. It applies to every delivery once the player owns the building, not only deliveries to that building. The player's income is the highest `ImproveProduction` they own [WARGUS].
- classic.battle.net confirms "Gold is mined at 100 Gold a trip" and that Keep/Castle increase it [ORIG].

### 3.2 Timings [WARGUS]

| Phase | Cycles | Seconds @30 |
|---|---|---|
| Peasant inside gold mine (`wait-at-resource`) | 150 | 5.0 |
| Peasant inside depot unloading gold (`wait-at-depot`) | 150 | 5.0 |
| Chop: +2 lumber per 24-cycle step, 50 steps | ≈1250 | ≈41.7 |
| Peasant inside depot unloading lumber | 150 | 5.0 |
| Tanker at platform (`wait-at-resource`) | 100 | 3.3 |
| Tanker at Shipyard/Refinery (`wait-at-depot`) | 100 | 3.3 |

A community measurement says a gold trip takes about 12 s and lumber takes "nearly three times longer" [COMMUNITY, the-lost-colony]. Wargus's figures give roughly the same ratio.

### 3.3 Gold mine rules

- **Access.** A peasant enters the mine and is invisible while inside. Wargus's peasant has no `harvest-from-outside` for gold, so there is no queue limit: any number of peasants can be inside at once [WARGUS].
- **Amount.** Set per mine by the map. The wiki gives a range of 2,500–637,500. The Wargus editor default is 100,000 gold per mine and 50,000 oil per patch (`DefineDefaultResourceAmounts`). Gold mine: HP 25,500, armor 20 [COMMUNITY: warcraft.wiki.gg Gold Mine].
- **Depletion.** When the gold runs out the mine collapses and is removed [COMMUNITY]. Peasants then go idle. The manual says they repeat "until he empties the mine out, is attacked or is given another command" [ORIG].
- **Town Hall/Keep/Castle placement.** Must be more than 3 tiles from any gold mine (`BuildingRules distance > 3 to unit-gold-mine`) [WARGUS]. The manual says only "a minimum distance" [ORIG].

### 3.4 Lumber rules

- Each forest tile holds **100 lumber**, exactly one full load. When a tile is exhausted it becomes cleared ground (`map.cpp`: `mf.Value = 100`; `Map.ClearTile`) [WARGUS].
- **Tree regrowth: none.** Wargus sets `SetForestRegeneration(0)`. The engine supports regrowth, but it is disabled to match the original [WARGUS].
- Chopping is done from an adjacent tile. After each delivery the peasant goes back to the nearest remaining tree near its previous spot. The manual says the peasant continues "until he either cuts down all available trees in that area" [ORIG].

### 3.5 Oil rules

- The Tanker builds an **Oil Platform** on an Oil Patch. That is the only valid site ("Oil Platforms may only be placed on an Oil Patch") [ORIG].
- Once the platform is complete, the building tanker automatically starts hauling. Other tankers are assigned with Haul Oil or a right-click on the platform [ORIG].
- Oil is delivered to a Shipyard or Refinery. Both have `CanStore oil` [WARGUS].
- **Shipyard and Refinery placement:** both must be on the coast (`ShoreBuilding`) and more than 3 tiles from any oil patch or platform [WARGUS; the manual says only "minimum distance" and "placed on a coast"]. The Foundry must also be coastal [ORIG].
- A platform that is destroyed or depleted reverts to an Oil Patch (`ReplaceOnDie`) [WARGUS].

### 3.6 Depots and automation

- Gold and lumber depots are the Town Hall, Keep and Castle. The Lumber Mill also accepts lumber (`CanStore`) [WARGUS].
- A worker returns to the **nearest reachable depot** for its resource, measured by path, then resumes gathering [WARGUS; manual].
- A worker stopped while carrying keeps the load. The Harvest button is replaced by **Return with Goods** (hotkey G) [ORIG].
- A right-click with a peasant: on a mine or tree it harvests, on a damaged friendly building it repairs, and on an enemy it attacks [ORIG].

### 3.7 Starting resources

Source: `scripts/wc2.lua` `SetPlayerData` override [WARGUS]. The manual lists "Map Default, Low, Medium, High" [ORIG].

| Setting | Gold | Lumber | Oil |
|---|---|---|---|
| Map default | from map | from map | from map |
| Low | 2000 | 1000 | 1000 |
| Medium | 5000 | 2000 | 2000 |
| High | 10000 | 5000 | 5000 |
| (Wargus-only "Very High") | 30000 | 15000 | 10000 |

"Starting Units" can be set to Map Default or One Peasant Only [ORIG].

---

## 4. Food (supply)

Source: manual p.9, the BNE feature list (warcraft.wiki.gg), and `Supply`/`Demand` fields in Wargus units.

| Item | Value | Tag |
|---|---|---|
| Farm / Pig Farm | +4 food | ORIG |
| Town Hall / Keep / Castle (and orc equivalents) | +1 food | ORIG |
| Every unit, including ships and flyers | costs 1 food | WARGUS (Demand = 1) |
| Buildings | 0 food | WARGUS |
| Per-player food cap | 200 | ORIG (BNE feature list) |
| Buildings cap (Wargus) | 200 per player | WARGUS |
| Global unit limit | 600 in DOS original, 1200 "enhanced" in BNE | ORIG (BNE list) |

- Food is only counted from **completed** buildings.
- If training would exceed food, the building holds the finished unit. Wargus shows "Not enough food...build more farms" and retries every 5 cycles (`action_train.cpp`) [WARGUS]. The manual's wording is "Not Enough Food…Build More Farms" [ORIG].

---

## 5. Construction, cancel, repair, damage states

Source: manual p.10, `stratagus/src/action/action_built.cpp`, `action_repair.cpp`, `action_train.cpp`, `action_research.cpp`, `action_upgradeto.cpp`, and `wargus/scripts/missiles.lua` (`DefineBurningBuilding`).

### 5.1 Placement

- The footprint must be on **explored** and clear terrain. Non-coastal buildings "may not be constructed on dirt, ice or mud" (the manual means the coast-edge tiles) [ORIG].
- The ghost image is green where valid and pulses red where invalid. An info-line message explains why ("can't build there") [ORIG].
- Construction starts only when the peasant reaches the site. "Any obstacles present when the peasant reaches the site will prevent the construction" [ORIG].
- Distance rules: Town Hall more than 3 tiles from a gold mine. Shipyard and Refinery more than 3 tiles from an oil patch and on the coast. Foundry on the coast. Oil Platform on an Oil Patch. See §3 [WARGUS/ORIG].

### 5.2 Building process

- One peasant builds: it **enters and disappears into** the site and reappears when the building is done.
- The building starts at low HP and gains HP in proportion to progress ("begins in a weakened state and only reaches full strength when construction is completed") [ORIG].
- **Extra peasants** can help by *repairing* the site, which speeds it up. In Wargus this is free (`ResourcesMultiBuildersMultiplier = 0`) [WARGUS]. The original WC2 is widely reported to allow the same "repair to speed build" trick, but its cost is [UNVERIFIED].
- Build time: seconds = time / 5 at Normal (§1.1).
- The completion notice is a "work complete" voice from the builder (race voice, e.g. peasant "Job's done"). Research and upgrades use the research-complete voice [WARGUS `DefineGameSounds`].

### 5.3 Cancel refunds [WARGUS]

| Cancel | Refund |
|---|---|
| Building under construction | 75% (`CancelBuildingCostsFactor`) |
| Unit in training | 100% |
| Research | 100% |
| Building upgrade (e.g. Keep) | 100% |

The builder pops out when construction is cancelled.

### 5.4 Repair [WARGUS]

- Peasant/Peon repair range is 1, so it must be adjacent.
- Each repair animation loop is 25 cycles. Each loop adds `RepairHp` = **4 HP** and costs **1 gold + 1 lumber**, plus **1 oil** for buildings whose cost includes oil (e.g. ships, Refinery, Keep).
- That works out to ≈4.8 HP/s per worker. Multiple workers stack.
- Repair stops with "We need more gold/wood/oil for repair!" when you can't afford it.
- Ships are repaired by peasants standing on the adjacent shore (Transport `RepairHp = 4`).
- Wargus-only: idle peasants auto-repair within 4 tiles (`AutoRepairRange = 4`). Not in the original [UNVERIFIED].

### 5.5 Damage states and fire

- `DefineBurningBuilding` in Wargus:
  - HP ≥ 75%: no fire.
  - 50–74%: small fire.
  - Below 50%: large fire.
- Fire is **cosmetic** in Wargus: no `BurnPercent`/`BurnDamageRate` is set, so burning buildings do not lose HP [WARGUS]. Original WC2 buildings are believed not to burn down on their own, unlike StarCraft's Terran buildings [UNVERIFIED].
- A destroyed building leaves a rubble "destroyed place" doodad. It lasts 400 cycles (≈13 s) on land, and water rubble uses a similar sequence. The tile is walkable [WARGUS `anim.lua`].

---

## 6. Unit behaviour

Sources: manual pp. 13–17; `SightRange`/`ReactionRange` in Wargus unit files; `scripts/anim.lua`; `scripts/fov.lua`; `stratagus/src/unit/unit.cpp`; `stratagus/src/stratagus/selection.cpp`; http://classic.battle.net/war2/basic/fog.shtml

### 6.1 Orders (manual pp. 13–16) [ORIG]

- **Move.** Right-click on open ground moves (`RightButtonMoves()` in Wargus).
- **Stop.** Halts all actions. The unit then idles and auto-acquires targets.
- **Attack.** On a unit, attacks it. On ground, attack-moves: the unit engages anything met on the way. BNE notes "Attack Move command will now function correctly".
- **Patrol.** Moves back and forth between the current position and the target point, attacking enemies met. BNE: "Patrol command now sends units to the selected location rather than stopping after any contact".
- **Stand Ground.** "Will now stand his ground … not moving to engage". The unit still attacks targets within its weapon range. Cleared by Stop.
- **Attack Ground.** Siege units and battleships only (§2.2).
- **Follow.** Right-click a friendly unit. The link breaks when the leader does anything other than move or stop.
- **Right-click is contextual** (WC2 mouse mode):
  - enemy → attack
  - friendly unit → follow
  - gold mine or tree → harvest (workers)
  - damaged own building → repair (workers)
  - own Transport → board
  - oil platform → haul (tankers)
  - otherwise → move

  "Warcraft I style" mouse mode instead uses right-click to centre the map [ORIG].
- **Rally points: none** in WC2. Trained units appear next to the producing building [UNVERIFIED but consistent with manual, which never mentions them].
- **Retreat/flee:** no command. Workers (`Coward = true`) do not auto-acquire targets and only fight when ordered [WARGUS].

### 6.2 Auto-acquire and reaction [WARGUS]

- An idle combat unit attacks enemies within its **reaction range**. For human-controlled units `PersonReactionRange` equals sight radius. AI-controlled units use `ComputerReactionRange`, which is sight + 2.
  - Examples: Footman 4/6, Archer 5/7, Ballista 9/11, Destroyer 8/10, Guard Tower 6.
- When a unit is hit, the attacker is revealed (`SetRevealAttacker(true)`) and the victim retaliates if it can.
- Idle units near an attacked AI unit are pulled in (`AiHelpMe`).

### 6.3 Sight and fog of war

- There are three map states (manual p.12; classic.battle.net fog page) [ORIG]:
  - **black** — unexplored
  - **grey** — explored but not currently seen; terrain is visible, units are hidden
  - **lit** — currently in sight of a friendly unit or building
- **Buildings are remembered** in grey areas: "knowledge of their existence and condition is retained, although it will not be updated" [ORIG].
- Sight is a **simple radius** around the unit (`SetFieldOfViewType("simple-radial")`). There is **no line-of-sight blocking and no elevation**: trees and cliffs do not block vision or shots [WARGUS; ORIG implies it].
- Largest sight (9): Catapults, Flying units and Towers [ORIG classic.battle.net]. Wargus values:
  - most infantry 4
  - archers 5, rangers 6
  - casters 9, siege 9
  - flying machine/zeppelin 9, gryphon/dragon 6
  - destroyer 8, sub 5
  - most buildings 1; Keep 3, Castle 6
- Game options: Fog of War On/Off in multiplayer setup. Turning it off shows the whole map as lit [ORIG].
- Wargus-only: a player who loses their last town hall is revealed after 30 s. This is not in the original; omit it.

### 6.4 Death, corpses, blood [WARGUS `anim.lua`]

- The death animation runs about 106 cycles. The unit is then replaced by a corpse.
- Land corpse: 5 decay frames × 200 cycles = **1000 cycles (≈33 s)**, then it vanishes.
- Ship wreck: 3 frames × 100 cycles (≈10 s).
- Dead Knights/Paladins play extra frames (2 × 200 cycles).
- Corpses are the raw material for Death Knight *Raise Dead*.
- Blood splats are cosmetic hit effects only [UNVERIFIED].

### 6.5 Regeneration [WARGUS]

- **No HP regeneration** for any unit or building, except:
  - Troll Berserkers after the *Berserker Regeneration* upgrade: +1 HP every 2 s (`regeneration-rate 1, frequency 2`). The original rate is [UNVERIFIED].
  - Healing (Paladin spell) and repair.
- Mana: +1 per second, max 255 (§1.1).

### 6.6 Critters

Source: `scripts/units.lua` `unit-critter`.

- Neutral sheep, pig, seal or boar depending on tileset. 5 HP, speed 3, wanders randomly.
- Worth 1 point when killed [ORIG score table].
- **Easter egg:** clicking a critter 10 times in a row makes it explode (`ClicksToExplode = 10`). The explosion is cosmetic [WARGUS]. The original has the same exploding-sheep gag; its click count is [UNVERIFIED].

---

## 7. Naval and air

Sources: manual pp. 16–17; the warcraft.wiki.gg Gnomish Submarine page; `MaxOnBoard`, `CanTransport`, `PermanentCloak`, `DetectCloak`, `AirUnit` in Wargus units; `stratagus/src/unit/unittype.cpp`.

### 7.1 Transports

- **Capacity 6** land units (manual; Wargus `MaxOnBoard = 6`, `CanTransport LandUnit only`) [ORIG].
- **Loading:** select up to 6 units and right-click the transport. The transport blinks green, moves to the nearest shore, and the units walk aboard [ORIG].
- **Unloading:** move the ship to a shoreline, then press Unload (U). Clicking a passenger portrait unloads only that unit [ORIG]. Units disembark onto adjacent land tiles.
- Passengers cannot attack from the ship and die if the ship dies [UNVERIFIED].
- Ships occupy water tiles only. Coast tiles block them. Transports must be adjacent to coast land to load or unload.

### 7.2 Submarines / Giant Turtles

- Permanently invisible (`PermanentCloak`). According to the wiki, "visible only to towers, aerial forces, and other vessels that moved beneath the waves" [COMMUNITY].
- Wargus `DetectCloak` units:
  - all Watch, Guard and Cannon Towers
  - Gryphon, Dragon, Flying Machine, Zeppelin
  - Submarine and Turtle
  - Eye of Kilrogg, Holy Vision revealer, Daemon
- Once detected by an ally-shared or own detector, anything that can target sea can attack them.
- They attack only naval units and coastal buildings.

### 7.3 Oil Tankers

See §3.5. Unarmed. They build Oil Platforms.

### 7.4 Air units

- Gryphon Rider and Dragon are combat flyers that hit land, sea and air with bouncing splash.
- Flying Machine and Goblin Zeppelin are unarmed scouts (sight 9) and detectors.
- Flyers ignore terrain and water. They cannot be hit by melee, catapults, ballistas, cannon towers or battleships (§2.4).
- **Stacking:** in Wargus, one air unit per tile (air layer `MovementMask = MapFieldAirUnit`), so flyers never overlap. In the original, flyers are also believed to occupy one tile each [UNVERIFIED].
- The Flying Machine has an "Explore" auto-scout button in Wargus [WARGUS].

---

## 8. Selection, groups, hotkeys, command card

Sources: manual pp. 15–16, the BNE feature list, http://classic.battle.net/war2/basic/hhk.shtml, `wargus/scripts/menus/help.lua`, and `wargus/scripts/buttons.lua` plus the per-race button files.

### 8.1 Selection [ORIG]

- **Max 9 units** per selection or group ("Up to nine units may be placed in any one group"). Wargus defaults to 18 (`SetMaxSelectable(18)`); use **9** for fidelity.
- Drag a rectangle to box-select. Only mobile own units are box-selected; buildings are selected by single click.
- Shift-click adds a unit. Shift-click on a portrait removes that unit. Clicking a portrait selects only that unit. Clicking the portrait of a lone selected unit centres the map on it.
- Ctrl-click or double-click selects the closest 9 units of that type currently on screen (BNE).
- Groups: Ctrl+0–9 saves a group and 0–9 recalls it (BNE). Wargus: pressing the number twice centres on the group; Shift+# adds to the group.
- Alt-click any member recalls that member's last group (original DOS feature).
- Only one building can be selected at a time.

### 8.2 Command-card conventions

The card is a 3×3 grid with positions 1–9 in reading order.

| Pos | Combat unit | Peasant/Peon | Notes |
|---|---|---|---|
| 1 | Move (M) | Move (M) | |
| 2 | Stop (S) | Stop (S) | icon shows armor level |
| 3 | Attack (A) | Attack (A) | icon shows weapon level |
| 4 | Patrol (P) | Repair (R) | mage: spell 1 here |
| 5 | Stand Ground (T) | Harvest (H) | |
| 6 | Attack Ground (G) | Return Goods (G) | siege and battleship only |
| 7 | spell / special | Build Basic (B) | |
| 8 | spell / special | Build Advanced (V) | |
| 9 | spell / Demolish (D) | — | Cancel (ESC) in submenus |

Other command cards:

- Building sub-menus list structures in slots 1–8 with Cancel in slot 9.
- Production buildings show train and research buttons from slot 1, and Cancel in slot 9 while busy.
- The unit hotkey is the highlighted letter: P Peasant, F Footman, A Archer, K Knight, B Ballista, G Gryphon, O Oil Tanker, T Transport, D Destroyer, B Battleship, U Unload, and so on [ORIG hhk].

Global keys:

- Original: F10 menu, Enter chat, Pause, Space centres on the last 8 alerts (BNE).
- Wargus adds: `+`/`-` speed, Alt-I idle peasant, F2–F4 saved views, Ctrl-P pause, Alt-C centre on selected unit.

---

## 9. Voices, sounds and help messages

Sources: `stratagus/src/sound/sound.cpp` (`ChooseSample`), `stratagus/src/unit/unit.cpp` (HelpMe), `wargus/scripts/sound.lua`, manual p.23.

- **Selected** plays a random "selected" line.
- **Annoyed:** after 3 consecutive selection sounds on the same unit, the next clicks play the unit's "annoyed" lines **in order** (e.g. 7 for basic voices). The cycle then resets to normal selected lines [WARGUS].
- **Acknowledge** plays on every order given. The manual's *Unit Acknowledgments* option turns these off [ORIG].
- **Ready** plays when a unit finishes training.
- **Work complete** plays when a building finishes. The voice is the builder's ("Job's done" / "Work complete"). Tankers use the research-complete voice.
- **Research complete** plays on an upgrade or research finishing, with an info-line message "…: research complete".
- **Under attack:**
  - Units play "help 1" ("We're being attacked!"). Buildings play "help 2" ("Our town is under attack!").
  - Throttled to at most once per 2 s. The same area, defined as a 14-tile box, is silent for 120 s.
  - An info-line message "<Unit> attacked" appears and the minimap flashes.
  - Space jumps to the event [WARGUS; manual "Unit Speech"].
- **Building sounds:** clicking a building plays its sound (e.g. hammering or pigs). Can be disabled with the *Building Sounds* option [ORIG].
- **Placement:** error and success sounds when placing a building.
- **Help and info-line messages:**

| Situation | Text |
|---|---|
| Out of gold | Not enough gold...mine more gold. |
| Out of lumber | Not enough lumber...chop more lumber. |
| Out of oil | Not enough oil...drill for more oil. |
| Out of food | Not enough food...build more farms. |
| Bad placement | Can't build there. (reason shown) |
| Stopped carrier | Peasant is carrying gold/lumber. |
| Repair broke | We need more gold for repair! |
| Food cap | Unit limit reached |

Sources for the message wording:

- The food text is ORIG (manual).
- The gold, lumber and oil texts are the Wargus pattern `"Not enough %s...%s more %s."`, filled with the verbs mine, chop and drill. The original uses "lumber" rather than "wood" [UNVERIFIED exact punctuation].
- The repair text is WARGUS.

---

## 10. Victory, defeat, score

Sources: `wargus/scripts/stratagus.lua` (`SinglePlayerTriggers`), `scripts/menus/results.lua`, http://classic.battle.net/war2/basic/score.shtml, manual p.23.

- **Melee victory:** every non-allied opponent has no units or buildings left. **Defeat:** you have none left [WARGUS triggers].
- Campaign maps have scripted objectives, such as reaching a Circle of Power, rescuing, escorting, or destroying specific buildings [ORIG].
- Allied Victory: the game ends when all non-allied opponents are dead, but only if every ally on the side ticks Allied Victory [ORIG].
- **Score** comes **only from kills** [ORIG]. Destroying a unit or building adds its point value to the killer's score. Winning the scenario adds +500.

| Kill (examples) | Points |
|---|---|
| Wall, Critter | 1 |
| Peasant/Peon | 30 |
| Footman/Grunt | 50 |
| Archer/Axethrower | 60 |
| Knight/Ogre, Ballista/Catapult, Mage/DK | 100 |
| Destroyer, Gryphon/Dragon | 150 |
| Battleship/Juggernaut | 300 |
| Farm | 100 |
| Town Hall | 200 |
| Keep / Castle | 600 / 1500 |
| Winning scenario | 500 |

The full list is on the score page. The same values are the `Points` fields in the Wargus unit files.

- **Results screen columns:** Units, Buildings, Gold, Lumber, Oil, Kills, Razings, Score. Rows are listed per player and the counters animate [WARGUS `results.lua`, matches the original].
- **Rank titles** (score > threshold) [ORIG; identical in Wargus]:

| Score over | Human rank | Orc rank |
|---|---|---|
| 0 | Servant | Slave |
| 2,000 | Peasant | Peon |
| 5,000 | Squire | Rogue |
| 8,000 | Footman | Grunt |
| 18,000 | Corporal | Slasher |
| 28,000 | Sergeant | Marauder |
| 40,000 | Lieutenant | Commander |
| 55,000 | Captain | Captain |
| 70,000 | Major | Major |
| 85,000 | Knight | Knight |
| 105,000 | General | General |
| 125,000 | Admiral | Master |
| 145,000 | Marshall | Marshall |
| 165,000 | Lord | Chieftain |
| 185,000 | Grand Admiral | Overlord |
| 205,000 | Highlord | War Chief |
| 230,000 | Thundergod | Demigod |
| 255,000 | God | God |
| 280,000 | Designer | Designer |

- **Game options** for a skirmish or multiplayer setup [ORIG]:
  - race
  - Fog of War on/off
  - cheats allowed
  - starting resources: map, Low, Medium or High
  - start positions: random or fixed
  - tileset: map, Forest, Winter, Wasteland or Swamp
  - starting units: map or One Peasant Only
  - game type: Melee, FFA, 1v1, Top vs Bottom, Use Map Settings, Ladder
  - speed
- In multiplayer each player gets 3 pauses (BNE).

---

## 11. Computer AI

### 11.1 What the original does

Sources: manual p.26 (map editor AI schemes), and a community thread (https://groups.google.com/g/alt.games.warcraft/c/NaBflS2W4_c, seen via search summary only).

- There are three skirmish AI schemes [ORIG]:
  - **Land Attack.** "Concentrate on building up a sizeable army of ground troops. While it will not build any transports or other ships, it will use any that it starts with."
  - **Air Attack.** "Minimal ground defense … concentrate on air units and air defences, such as guard towers and archers/axe throwers." Needs many resources.
  - **Sea Attack.** "Large and varied navy, with only a minimal number of ground troops for defending its town." Needs many resources.
- Campaign levels use hand-written scripts per mission.
- The AI techs up through the tiers. It builds towers, researches upgrades and spells, and replaces lost workers and buildings. The manual advises map makers to "keep plenty of space between preplaced buildings, to give the computer room to expand" and to give it "clear paths to resources". Gold amount and mine distance govern how far it techs [ORIG, COMMUNITY].
- It attacks in **waves that grow over time**. With naval maps it sends about one transport load at a time [COMMUNITY]. It is not thought to cheat on resources in skirmish [COMMUNITY/UNVERIFIED].

### 11.2 Wargus AI scripts (the practical reference)

Source: https://github.com/Wargus/wargus/blob/master/scripts/ai/land_attack.lua, `sea_attack.lua`, `air_attack.lua`, `ai.lua`, and `stratagus/src/ai/*.cpp`.

The scripts are an ordered list of steps. `AiNeed` builds one of a building. `AiSet` keeps a count topped up, which rebuilds losses. `AiForce(n, …)` defines army *n*. `AiWaitForce` blocks until that force is full. `AiAttackWithForce` sends it at the nearest enemy.

**Land Attack (`wc2-land-attack`) sequence** [WARGUS]:

1. Town Hall. Train workers to 1, then 4. Build Barracks. Workers to 8.
2. Blacksmith. Research Weapons 1, Armor 1, Weapons 2, Armor 2.
3. **Wave 1:** 1 Footman/Grunt. Attack.
4. **Wave 2:** 4 Footmen. Workers to 12. Attack.
5. Second Barracks. **Wave 3:** 16 Footmen, plus a home-defence force of 4. Workers to 20. Attack.
6. Upgrade to Keep. Workers to 25. Stables. Home defence gains 2 Knights. Lumber Mill. Upgrade to Castle. Home defence gains 2 Archers. Workers to 30.
7. Church/Altar, then Paladin/Ogre-Mage upgrade and spell 1. Mage Tower with all 5 mage spells.
8. Build forces 4–8. Force 4: 10 Paladins. Force 5: 8 Paladins + 4 Mages. Force 6: 6. Force 7: 4. Force 8: 3 + 1 Catapult. Workers to 35. Expand: a second Town Hall and Barracks.
9. Attack with forces 4, 5, 6, 7 and 8 in turn. Rebuild them larger: 22+4 mages, 18+2 catapults, 14. Workers to 40. Attack again.
10. Workers to 45. Third town. Towers upgraded to Cannon and Guard. Ranger/Berserker upgrades.
11. Mixed waves: 5 Rangers + 12 Paladins, 5 + 10 + 4 Mages, and so on. Gryphon Aviary/Roost. 3 Gryphons/Dragons join force 5.
12. End loop, repeated forever:
    - more towers
    - force 6: 10 Rangers + 20 Paladins + 2 Catapults + 4 Mages
    - force 7: 4 flyers
    - attack with 6, then 7

**Sea Attack:**

- Economy first: 9 workers, Lumber Mill, farms, Barracks, 3-Footman defence.
- Then Shipyard, Keep, Refinery, tankers to 3–4, Oil Platform.
- Destroyer waves sized by difficulty (`Difficulty`, then `+1`, then `+2` plus a scout). Attacks come with sleeps of 1000 or 500 cycles between.
- Then Foundry and ship armor upgrades.
- Later: combined fleets (Destroyers + Battleships + a Flying Machine) and a transport landing force (Footmen, Knights, Catapults in 1–2 transports).
- End loop: 6 Destroyers + 7 Battleships + 1 scout, and 4 Footmen + 4 Knights + 4 Catapults + 2 Transports. Attack, then sleep 500.

**Air Attack:**

- 9 workers, Lumber Mill, Barracks, 2-Footman defence, Blacksmith, Keep.
- Workers to 15. Defence becomes 2 Footmen + 3 Archers. Stables, 2 Guard Towers, Castle, Aviary/Roost.
- The first attack is a single flyer. Waves then grow.
- End loop: six forces of 2, 2, 2, 2, 2 and 1 flyers, all launched together, then sleep 500.

**Engine-level AI behaviour** (all scripts) [WARGUS `stratagus/src/ai`]:

- **Farms:** built automatically whenever training is blocked by food (`AiNeedMoreSupply`, `AiRequestSupply`). The cheapest supply-per-cost building is chosen.
- **Workers** are split 50% gold and 50% lumber by default (`Collect[Gold]=50, Collect[Wood]=50, Oil=0`). Scripts can change the split.
- **Repair:** damaged buildings are repaired by an idle worker once the building has not been attacked for 5 s and no enemy is within its sight range (`AiCheckRepair`).
- **Defence:** when an AI unit is hit, nearby forces and the home-defence force (force 0) respond (`AiHelpMe`).
- **Rebuilding:** `AiSet` targets are re-checked continuously, so lost workers and buildings are rebuilt.
- **Difficulty** (Wargus-only):

| Difficulty | Resource bonus | Harvest/build/train speed |
|---|---|---|
| 1 (easy) | none | 75% |
| 4 (hard) | +50 gold, +35 wood, +25 oil per step | 120% |
| 5 (hardest) | +100 gold, +75 wood, +50 oil per step | 150% |

  The bonus is added each AI loop step (`AiLoop` in `ai.lua`). The original has no difficulty setting in skirmish; **do not cheat by default**.

### 11.3 Recommended clone AI (derived)

Use the Land Attack skeleton above as the default opponent:

- Rush with 1 unit, then 4, then 16. Then tech to the Castle tier and send paladin/ogre-mage-heavy waves of about 10–20 in turn, with growing forces.
- Always keep a home-defence force of about 4. Build farms on demand. Repair when safe. Rebuild workers to the script count.
- The first attack comes when the first footman finishes, about 12 s after the Barracks at Normal speed, so it is harmless.
- The first real wave (4) arrives roughly 3–4 minutes in, and the 16-unit wave around 8–10 minutes on medium resources [UNVERIFIED timing estimate].

---

## 12. Open questions / known conflicts

- **Game speed ticks/s** per named speed is undocumented (§1).
- **Damage roll:** the manual says "full or half" while other sources say 50–100% continuous (§2.1). Use continuous.
- **Harvest timings** (5 s in mine, about 42 s chopping) are Wargus approximations. Community measurements are relative ratios only (§3.2).
- **Keep/Castle, Mill and Refinery bonus magnitudes** (+10/+20/+25/+25) come from Wargus. Blizzard only says the gold amount "increases".
- **Max selection:** original 9, Wargus 18. Use 9.
- **Building fire:** cosmetic in Wargus. No primary source for the original.
- **Multi-worker build-assist cost, air-unit stacking, critter click count:** [UNVERIFIED].
