# data.js vs warcraft.wiki.gg audit

This audit compares every object in `data.js` with its Warcraft II page on [Warcraft Wiki](https://warcraft.wiki.gg).
The wiki copies used are the local files in `pages/` (retrieved 2026-09-26; revision ids in manifest.json and
index.json).

The audit covers 150 objects:

- 38 unit entries: 19 roles for each race, including Skeleton, Eye of Kilrogg and Critter.
- 38 building entries: 19 roles for each race.
- 56 upgrade entries, one per race label.
- 18 spells.

Every object has a WC2 page. Upgrades and spells have no pages of their own on the wiki, so each one is read from
the page that lists it. Research is on the researching building's page: the Blacksmith, Lumber Mill and Foundry
headings, or the research tables of the Church, Altar, Mage Tower and Temple. Hall upgrades come from the hall's
upgrade table, and tower upgrades from the Guard and Cannon Tower infoboxes. Spells come from the caster's
"Spells" section.

The wiki writes build and research times as "N seconds". That N is the raw WC2 time unit, so the check compares it
with `time * 5` from data.js. Spell durations are compared in seconds. The wiki gives hotkeys only for buildings, and
for research through the highlighted letter. It does not list prerequisites.

Re-run with `node docs/wiki/check.mjs`. It re-reads `data.js` and compares it with the wiki values in index.json.
A mismatch that `decisions.json` does not cover is reported as UNREVIEWED, and the exit code is 1 while any
UNREVIEWED or likely-error item remains.

32 field mismatches were found. The table below merges rows that are the same for both races (the per-race count
is 40). Every other extracted field agrees: cost, time, HP, armor, damage, range, sight, speed, food, trained-at,
mana, spell mana, range and damage, and upgrade effects and costs.

## Mismatches

Status: **error** = likely a plain data.js error; **spec** = docs/spec resolved this conflict on purpose;
**spec-src** = data.js follows the spec's primary source (RETAIL or Wargus), but the spec does not flag the wiki's
different value; **n/a** = the fields are not comparable.

| Object | Field | data.js | wiki | Status: spec decision / source |
|---|---|---|---|---|
| Stables (human) | hotkey | S | A | error: clashes with Shipyard S (note 1) |
| Altar of Storms (orc) | hotkey | A | L | error: clashes with Goblin Alchemist A (note 1) |
| Oil Platform (both) | hotkey | O | B | error: wiki infobox, both pages (note 2) |
| Upgrade Battle Axes 1 and 2 (orc) | label | Upgrade Battle Axes | Upgrade Weapons | error: wiki + upgrades_spells.md 1.1 |
| Troll Regeneration (orc) | label | Troll Regeneration | Berserker Regeneration | error: wiki + upgrades_spells.md 1.2 |
| Upgrade Ogres to Ogre-Magi (orc) | label | ...to Ogre-Magi | ...to Ogre-Mages | error: wiki + upgrades_spells.md 1.6 |
| Demolition Squad / Sappers | gold | 700 | 750 | spec: units_buildings.md 4.1, RETAIL 700 |
| Oil Tanker (both) | lumber | 200 | 250 | spec: units_buildings.md 4.1, RETAIL 200 |
| Oil Tanker (both) | armor | 10 | 0 | spec: units_buildings.md 4.2, RETAIL 10 |
| Submarine / Giant Turtle | oil | 900 | 800 | spec: units_buildings.md 4.1, RETAIL 900 |
| Upgrade Cannons 1 and 2 (both) | units | destroyer, battleship, sub | destroyer, battleship | spec: upgrades_spells.md 1.3, Wargus |
| Bloodlust research (orc) | time N | 100 | 200 | spec: upgrades_spells.md 1.6, Wargus + CBN |
| Runes (spell) | duration s | 66.7 | about 120 | spec: upgrades_spells.md 0.1/2.5 (note 3) |
| Skeleton | lifetime s | permanent | about 600 | spec: upgrades_spells.md 2.6 picks permanent |
| Goblin Sappers | pierce | 2 | 4 | spec-src: RETAIL pairs identical (note 4) |
| Skeleton | food | 1 | 0 | spec-src: upgrades_spells.md 2.6, Wargus (note 5) |
| Sheep / Pig (critter) | speed | 3 | 10 | spec-src: upgrades_spells.md 2.4, Wargus |
| Eye of Kilrogg (unit + spell) | duration s | 25.5 | about 18 | spec-src: upgrades_spells.md 2.5 (note 3) |
| Upgrade Shields 1 and 2 (both) | hotkey | S | H | spec-src: upgrades_spells.md 1.1 (note 6) |
| Research Lighter Axes (orc) | hotkey | A | L | spec-src: upgrades_spells.md 1.2 (note 6) |
| Dwarven Demolition Squad | label | Dwarven Demolition Squad | Demolition Squad | n/a: wiki uses the short name |
| Sheep / Pig | label | Sheep / Pig | Critter | n/a: tileset variants of one Critter page |

## Notes

1. **Stables and Altar hotkeys.** In data.js the Human advanced build menu gives both Shipyard and Stables the key
   S. The Orc menu gives both Goblin Alchemist and Altar of Storms the key A. The wiki infoboxes use A (Stables),
   O (Ogre Mound) and L (Altar), which removes both clashes. These look like real errors. No spec section covers
   building hotkeys.
2. **Oil Platform.** The Tanker's build button is "Build Oil Platform", with B highlighted on both wiki pages.
   data.js uses O, which the Tanker also uses for its own train hotkey at the Shipyard. This is minor.
3. **Durations.** data.js follows the spec: Wargus cycles / 30 at Normal. The wiki's "about 2 minutes" for Runes
   matches classic.battle.net's "2 minutes on slowest", which is already noted in upgrades_spells.md 0.1. The
   wiki's "approximately 18 seconds on the default game speed" for the Eye is not in the spec. If it is accurate,
   it suggests a real-time scale that differs from 30 cycles/s. That question is still open in units_buildings.md
   section 1.
4. **Sappers damage.** The wiki's own Demolition Squad page gives 4/2 but the Goblin Sappers page gives 4/4, so the
   wiki contradicts itself. The spec says RETAIL stats are identical for every Human/Orc pair. Keep 2.
5. **Skeleton food.** The spec copies Wargus (Demand 1). The wiki infobox says 0. The original's behaviour is
   unverified, so this is worth a check in the real game.
6. **Research hotkeys.** The wiki highlights "S**h**ields" and "Research **L**ighter Axes". The spec took S and A
   from the Wargus buttons. Two sources disagree and neither is the original UI, so this is worth checking against
   the game. It is not counted as an error.

The label rows are cosmetic. They are counted as errors because the wiki and the spec's own upgrade table agree
with each other and differ from data.js (the spec's prose in units_buildings.md 5.2 uses the data.js names).

## Objects with no WC2 wiki page

None. The only gaps are pages that give no value for a field:

- The wiki gives no hotkeys for units.
- It gives no hotkeys for Church, Altar, Mage Tower or Temple research.
- It gives no range for Eye of Kilrogg (the spell).
- It gives no durations for Slow, Haste, Bloodlust, Invisibility, Unholy Armor, Flame Shield or Whirlwind.
- It gives no prerequisites.

Those data.js values could not be checked against the wiki.
