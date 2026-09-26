// Warcraft II: Tides of Darkness game data, used by game.js. Numbers come from docs/spec/ (the retail unit table
// decoded by PUDForge, Wargus/Stratagus scripts, the Battle.net Edition manual and classic.battle.net); where the
// sources disagree the spec's pick is used and noted there.
//
// Conventions:
// - Units are keyed by a generic role shared by both races; RACES maps each role to the race's own type id and
//   label. Human and Orc counterparts have identical stats except where a per-race override says otherwise.
// - time: seconds at Normal speed. WC2 stores a time N; Stratagus spends 6 cycles per unit at 30 cycles/s, so N / 5.
// - tps: tiles per second, 30 / (cycles per tile) from the Wargus move animations. `speed` is the WC2 panel value.
// - cd: seconds between attacks, the Wargus attack animation length / 30.
// - dmg / pierce: basic and piercing damage. tgt: what it can hit, L land, S sea, A air.
// - requires: generic building roles that must exist (finished). 'keep' is met by a Keep or a Castle.
// - Hall tiers and tower types are separate building types reached by an in-place upgrade (`becomes`).
(function () {
  'use strict';
  const T = (n) => n / 5;                 // WC2 time units -> seconds at Normal
  const MV = (cyclesPerTile) => 30 / cyclesPerTile;
  const CD = (cycles) => cycles / 30;

  const UNITS = {
    worker:    { hp: 30, armor: 0, dmg: 3, pierce: 2, range: 1, sight: 4, speed: 10, tps: MV(16), cd: CD(25), tgt: 'L', cost: { gold: 400 }, time: T(45), at: 'hall', coward: true, gathers: ['gold', 'tree'], organic: true, points: 30 },
    footman:   { hp: 60, armor: 2, dmg: 6, pierce: 3, range: 1, sight: 4, speed: 10, tps: MV(16), cd: CD(25), tgt: 'L', cost: { gold: 600 }, time: T(60), at: 'barracks', organic: true, points: 50 },
    archer:    { hp: 40, armor: 0, dmg: 3, pierce: 6, range: 4, sight: 5, speed: 10, tps: MV(16), cd: CD(65), tgt: 'LSA', cost: { gold: 500, lumber: 50 }, time: T(70), at: 'barracks', requires: ['mill'], proj: 'arrow', organic: true, points: 60,
      orc: { cd: CD(74), proj: 'axe' } },
    ranger:    { hp: 50, armor: 0, dmg: 3, pierce: 6, range: 4, sight: 6, speed: 10, tps: MV(16), cd: CD(65), tgt: 'LSA', cost: { gold: 500, lumber: 50 }, time: T(70), at: 'barracks', requires: ['mill'], requiresUpgrade: 'ranger', proj: 'arrow', organic: true, points: 70,
      orc: { cd: CD(74), proj: 'axe' } },
    knight:    { hp: 90, armor: 4, dmg: 8, pierce: 4, range: 1, sight: 4, speed: 13, tps: MV(12), cd: CD(25), tgt: 'L', cost: { gold: 800, lumber: 100 }, time: T(90), at: 'barracks', requires: ['stables', 'smith'], organic: true, points: 100 },
    paladin:   { hp: 90, armor: 4, dmg: 8, pierce: 4, range: 1, sight: 5, speed: 13, tps: MV(12), cd: CD(25), tgt: 'L', cost: { gold: 800, lumber: 100 }, time: T(90), at: 'barracks', requires: ['stables', 'smith'], requiresUpgrade: 'paladin', organic: true, mana: 255, points: 110,
      spells: { human: ['holy_vision', 'healing', 'exorcism'], orc: ['eye_of_kilrogg', 'bloodlust', 'runes'] } },
    ballista:  { hp: 110, armor: 0, dmg: 80, pierce: 0, range: 8, minRange: 2, sight: 9, speed: 5, tps: MV(40), cd: CD(231), tgt: 'LS', cost: { gold: 900, lumber: 300 }, time: T(250), at: 'barracks', requires: ['smith', 'mill'], proj: 'spear', splash: { r: 1, f: 4 }, groundAttack: true, points: 100,
      orc: { proj: 'boulder' } },
    caster:    { hp: 60, armor: 0, dmg: 0, pierce: 9, range: 2, sight: 9, speed: 8, tps: MV(18), cd: CD(40), tgt: 'LSA', cost: { gold: 1200 }, time: T(120), at: 'magetower', coward: true, flees: true, organic: true, mana: 255, proj: 'lightning', points: 100,
      spells: { human: ['fireball', 'slow', 'flame_shield', 'invisibility', 'polymorph', 'blizzard'], orc: ['death_coil', 'haste', 'raise_dead', 'whirlwind', 'unholy_armor', 'death_and_decay'] },
      orc: { range: 3, tps: MV(19), proj: 'touch', undead: true } },
    demo:      { hp: 40, armor: 0, dmg: 4, pierce: 2, range: 1, sight: 4, speed: 11, tps: MV(14), cd: CD(25), tgt: 'L', cost: { gold: 700, lumber: 250 }, time: T(200), at: 'inventor', organic: true, volatile: true, demolish: { r: 2, dmg: 400 }, points: 100 },
    flier:     { hp: 150, armor: 2, dmg: 0, pierce: 0, range: 0, sight: 9, speed: 17, tps: MV(10), cd: 1, tgt: '', cost: { gold: 500, lumber: 100 }, time: T(65), at: 'inventor', requires: ['mill'], domain: 'air', coward: true, detects: true, points: 40 },
    gryphon:   { hp: 100, armor: 5, dmg: 0, pierce: 16, range: 4, sight: 6, speed: 14, tps: MV(12), cd: CD(190), tgt: 'LSA', cost: { gold: 2500 }, time: T(250), at: 'aviary', domain: 'air', proj: 'hammer', splash: { r: 1, f: 2 }, organic: true, detects: true, points: 150,
      orc: { proj: 'dragonfire' } },
    tanker:    { hp: 90, armor: 10, dmg: 0, pierce: 0, range: 0, sight: 4, speed: 10, tps: MV(16), cd: 1, tgt: '', cost: { gold: 400, lumber: 200 }, time: T(50), at: 'shipyard', domain: 'water', coward: true, gathers: ['oil'], points: 40 },
    transport: { hp: 150, armor: 0, dmg: 0, pierce: 0, range: 0, sight: 4, speed: 10, tps: MV(16), cd: 1, tgt: '', cost: { gold: 600, lumber: 200, oil: 500 }, time: T(70), at: 'shipyard', requires: ['foundry'], domain: 'water', capacity: 6, points: 50 },
    destroyer: { hp: 100, armor: 10, dmg: 35, pierce: 0, range: 4, sight: 8, speed: 10, tps: MV(16), cd: CD(120), tgt: 'LSA', cost: { gold: 700, lumber: 350, oil: 700 }, time: T(90), at: 'shipyard', domain: 'water', proj: 'cannon', splash: { r: 1, f: 3 }, points: 150 },
    battleship:{ hp: 150, armor: 15, dmg: 130, pierce: 0, range: 6, sight: 8, speed: 6, tps: MV(26), cd: CD(230), tgt: 'LS', cost: { gold: 1000, lumber: 500, oil: 1000 }, time: T(140), at: 'shipyard', requires: ['foundry'], domain: 'water', proj: 'bigcannon', splash: { r: 1, f: 4 }, groundAttack: true, points: 300 },
    sub:       { hp: 60, armor: 0, dmg: 50, pierce: 0, range: 4, sight: 5, speed: 7, tps: MV(21), cd: CD(115), tgt: 'S', cost: { gold: 800, lumber: 150, oil: 900 }, time: T(100), at: 'shipyard', requires: ['inventor'], domain: 'water', submerged: true, detects: true, proj: 'torpedo', points: 120 },
    // summoned or neutral: never trained
    skeleton:  { hp: 40, armor: 0, dmg: 6, pierce: 3, range: 1, sight: 3, speed: 8, tps: MV(18), cd: CD(25), tgt: 'L', undead: true, summoned: true, noFood: true, points: 0 },
    eye:       { hp: 100, armor: 0, dmg: 0, pierce: 0, range: 0, sight: 3, speed: 42, tps: 5, cd: 1, tgt: '', domain: 'air', summoned: true, noFood: true, detects: true, coward: true, ttl: 765 / 30, points: 0 },
    critter:   { hp: 5, armor: 0, dmg: 0, pierce: 0, range: 0, sight: 2, speed: 10, tps: MV(16), cd: 1, tgt: '', coward: true, organic: true, neutral: true, noFood: true, points: 1 },
  };

  // food: supply given; depot: resources it accepts (gold, lumber, oil); seaTarget: a coastal building ships can shoot; bonus: extra per load for the owner; shore: must touch water;
  // onOil: sits on an oil patch; tier: hall tier (1 hall, 2 keep, 3 castle); becomes-upgrades are in UPGRADES.
  const BUILDINGS = {
    hall:     { size: 4, hp: 1200, armor: 20, sight: 4, cost: { gold: 1200, lumber: 800 }, time: T(255), food: 1, depot: ['gold', 'lumber'], tier: 1, points: 200, mineGap: 3 },
    keep:     { size: 4, hp: 1400, armor: 20, sight: 6, cost: { gold: 2000, lumber: 1000, oil: 200 }, time: T(200), food: 1, depot: ['gold', 'lumber'], tier: 2, bonus: { gold: 10 }, upgradeOf: 'hall', requires: ['barracks'], points: 600 },
    castle:   { size: 4, hp: 1600, armor: 20, sight: 9, cost: { gold: 2500, lumber: 1200, oil: 500 }, time: T(200), food: 1, depot: ['gold', 'lumber'], tier: 3, bonus: { gold: 20 }, upgradeOf: 'keep', requires: ['stables', 'smith', 'mill'], points: 1500 },
    farm:     { size: 2, hp: 400, armor: 20, sight: 3, cost: { gold: 500, lumber: 250 }, time: T(100), food: 4, points: 100 },
    barracks: { size: 3, hp: 800, armor: 20, sight: 3, cost: { gold: 700, lumber: 450 }, time: T(200), points: 160 },
    mill:     { size: 3, hp: 600, armor: 20, sight: 3, cost: { gold: 600, lumber: 450 }, time: T(150), depot: ['lumber'], bonus: { lumber: 25 }, points: 150 },
    smith:    { size: 3, hp: 775, armor: 20, sight: 3, cost: { gold: 800, lumber: 450, oil: 100 }, time: T(200), points: 170 },
    scout:    { size: 2, hp: 100, armor: 20, sight: 9, cost: { gold: 550, lumber: 200 }, time: T(60), detects: true, points: 95 },
    tower:    { size: 2, hp: 130, armor: 20, sight: 9, cost: { gold: 500, lumber: 150 }, time: T(140), upgradeOf: 'scout', requires: ['mill'], range: 6, dmg: 4, pierce: 12, cd: CD(60), tgt: 'LSA', proj: 'arrow', detects: true, points: 200 },
    cannon:   { size: 2, hp: 160, armor: 20, sight: 9, cost: { gold: 1000, lumber: 300 }, time: T(190), upgradeOf: 'scout', requires: ['smith'], range: 7, minRange: 2, dmg: 50, pierce: 0, cd: CD(151), tgt: 'LS', proj: 'cannon', splash: { r: 1, f: 3 }, detects: true, points: 250 },
    shipyard: { size: 3, hp: 1100, armor: 20, sight: 3, cost: { gold: 800, lumber: 450 }, time: T(200), requires: ['mill'], shore: true, oilGap: 3, depot: ['oil'], seaTarget: true, points: 170 },
    foundry:  { size: 3, hp: 750, armor: 20, sight: 3, cost: { gold: 700, lumber: 400, oil: 400 }, time: T(175), requires: ['shipyard'], shore: true, seaTarget: true, points: 200 },
    refinery: { size: 3, hp: 600, armor: 20, sight: 3, cost: { gold: 800, lumber: 350, oil: 200 }, time: T(225), requires: ['shipyard'], shore: true, oilGap: 3, depot: ['oil'], bonus: { oil: 25 }, seaTarget: true, points: 200 },
    // Wall (wiki: Wall (WC2 Human/Orc)): 40 HP, armor 0; destroying a section damages the orthogonal neighbours
    wall:     { size: 1, hp: 40, armor: 0, sight: 1, cost: { gold: 20, lumber: 10 }, time: T(30), wall: true, points: 1 },
    platform: { size: 3, hp: 650, armor: 20, sight: 3, cost: { gold: 700, lumber: 450 }, time: T(200), onOil: true, seaTarget: true, points: 160 },
    stables:  { size: 3, hp: 500, armor: 20, sight: 3, cost: { gold: 1000, lumber: 300 }, time: T(150), requires: ['keep'], points: 210 },
    inventor: { size: 3, hp: 500, armor: 20, sight: 3, cost: { gold: 1000, lumber: 400 }, time: T(150), requires: ['keep'], points: 230 },
    church:   { size: 3, hp: 700, armor: 20, sight: 3, cost: { gold: 900, lumber: 500 }, time: T(175), requires: ['castle'], points: 240 },
    magetower:{ size: 3, hp: 500, armor: 20, sight: 3, cost: { gold: 1000, lumber: 200 }, time: T(125), requires: ['castle'], points: 240 },
    aviary:   { size: 3, hp: 500, armor: 20, sight: 3, cost: { gold: 1000, lumber: 400 }, time: T(150), requires: ['castle'], points: 250 },
  };

  const RACES = {
    human: {
      units: { worker: 'worker', footman: 'footman', archer: 'archer', ranger: 'ranger', knight: 'knight', paladin: 'paladin', ballista: 'ballista', caster: 'mage',
        demo: 'dwarves', flier: 'flying_machine', gryphon: 'gryphon', tanker: 'tanker', transport: 'transport', destroyer: 'destroyer', battleship: 'battleship', sub: 'submarine',
        skeleton: 'skeleton', eye: 'eye', critter: 'critter' },
      buildings: { hall: 'town_hall', keep: 'keep', castle: 'castle', farm: 'farm', barracks: 'barracks', mill: 'lumbermill', smith: 'blacksmith', scout: 'scout_tower',
        tower: 'guard_tower', cannon: 'cannon_tower', shipyard: 'shipyard', foundry: 'foundry', refinery: 'refinery', platform: 'oil_platform', stables: 'stables',
        inventor: 'inventor', church: 'church', magetower: 'mage_tower', aviary: 'aviary', wall: 'wall' },
      labels: { worker: 'Peasant', footman: 'Footman', archer: 'Elven Archer', ranger: 'Elven Ranger', knight: 'Knight', paladin: 'Paladin', ballista: 'Ballista', mage: 'Mage',
        dwarves: 'Dwarven Demolition Squad', flying_machine: 'Gnomish Flying Machine', gryphon: 'Gryphon Rider', tanker: 'Oil Tanker', transport: 'Transport',
        destroyer: 'Elven Destroyer', battleship: 'Battleship', submarine: 'Gnomish Submarine', skeleton: 'Skeleton', eye: 'Eye of Kilrogg', critter: 'Sheep',
        town_hall: 'Town Hall', keep: 'Keep', castle: 'Castle', farm: 'Farm', barracks: 'Barracks', lumbermill: 'Elven Lumber Mill', blacksmith: 'Blacksmith',
        scout_tower: 'Scout Tower', guard_tower: 'Guard Tower', cannon_tower: 'Cannon Tower', shipyard: 'Shipyard', foundry: 'Foundry', refinery: 'Oil Refinery',
        oil_platform: 'Oil Platform', stables: 'Stables', inventor: 'Gnomish Inventor', church: 'Church', mage_tower: 'Mage Tower', aviary: 'Gryphon Aviary', wall: 'Wall' },
      hotkeys: { worker: 'p', footman: 'f', archer: 'a', ranger: 'a', knight: 'k', paladin: 'k', ballista: 'b', caster: 'm', demo: 'd', flier: 'f', gryphon: 'g',
        tanker: 'o', transport: 't', destroyer: 'd', battleship: 'b', sub: 's',
        hall: 'h', farm: 'f', barracks: 'b', mill: 'l', smith: 's', scout: 't', shipyard: 's', foundry: 'f', refinery: 'r', platform: 'b', stables: 'a', inventor: 'i',
        church: 'c', magetower: 'm', aviary: 'g', wall: 'w' },
    },
    orc: {
      units: { worker: 'peon', footman: 'grunt', archer: 'axethrower', ranger: 'berserker', knight: 'ogre', paladin: 'ogre_mage', ballista: 'catapult', caster: 'death_knight',
        demo: 'sappers', flier: 'zeppelin', gryphon: 'dragon', tanker: 'oil_tanker', transport: 'orc_transport', destroyer: 'troll_destroyer', battleship: 'juggernaught', sub: 'turtle',
        skeleton: 'skeleton', eye: 'eye', critter: 'critter' },
      buildings: { hall: 'great_hall', keep: 'stronghold', castle: 'fortress', farm: 'pig_farm', barracks: 'orc_barracks', mill: 'troll_mill', smith: 'forge', scout: 'watch_tower',
        tower: 'orc_guard_tower', cannon: 'orc_cannon_tower', shipyard: 'dock', foundry: 'metalworks', refinery: 'orc_refinery', platform: 'orc_platform', stables: 'ogre_mound',
        inventor: 'alchemist', church: 'altar', magetower: 'temple', aviary: 'roost', wall: 'orc_wall' },
      labels: { peon: 'Peon', grunt: 'Grunt', axethrower: 'Troll Axethrower', berserker: 'Troll Berserker', ogre: 'Ogre', ogre_mage: 'Ogre-Mage', catapult: 'Catapult',
        death_knight: 'Death Knight', sappers: 'Goblin Sappers', zeppelin: 'Goblin Zeppelin', dragon: 'Dragon', oil_tanker: 'Oil Tanker', orc_transport: 'Transport',
        troll_destroyer: 'Troll Destroyer', juggernaught: 'Ogre Juggernaught', turtle: 'Giant Turtle', skeleton: 'Skeleton', eye: 'Eye of Kilrogg', critter: 'Pig',
        great_hall: 'Great Hall', stronghold: 'Stronghold', fortress: 'Fortress', pig_farm: 'Pig Farm', orc_barracks: 'Barracks', troll_mill: 'Troll Lumber Mill',
        forge: 'Blacksmith', watch_tower: 'Watch Tower', orc_guard_tower: 'Guard Tower', orc_cannon_tower: 'Cannon Tower', dock: 'Shipyard', metalworks: 'Foundry',
        orc_refinery: 'Oil Refinery', orc_platform: 'Oil Platform', ogre_mound: 'Ogre Mound', alchemist: 'Goblin Alchemist', altar: 'Altar of Storms',
        temple: 'Temple of the Damned', roost: 'Dragon Roost', orc_wall: 'Wall' },
      hotkeys: { worker: 'p', footman: 'g', archer: 'a', ranger: 'b', knight: 'o', paladin: 'o', ballista: 'c', caster: 'k', demo: 's', flier: 'z', gryphon: 'd',
        tanker: 'o', transport: 't', destroyer: 'd', battleship: 'j', sub: 't',
        hall: 'h', farm: 'f', barracks: 'b', mill: 'l', smith: 's', scout: 't', shipyard: 's', foundry: 'f', refinery: 'r', platform: 'b', stables: 'o', inventor: 'a',
        church: 'l', magetower: 't', aviary: 'd', wall: 'w' },
    },
  };

  // Research. at: generic building role; requires: roles that must exist; needs: upgrades researched first;
  // effect: { pierce | armor | range | sight | regen, units: [roles] } applied player-wide; convert: role -> role;
  // spell: the spell it teaches. becomes: an in-place building upgrade (hall tiers, towers). Human and orc share
  // ids; label and cost may differ per race.
  const UPGRADES = {
    weapons1: { at: 'smith', cost: { gold: 800 }, orcCost: { gold: 500, lumber: 100 }, time: T(200), label: { human: 'Upgrade Swords', orc: 'Upgrade Weapons' }, key: 'w', effect: { pierce: 2, units: ['footman', 'knight', 'paladin', 'demo'] } },
    weapons2: { at: 'smith', cost: { gold: 2400 }, orcCost: { gold: 1500, lumber: 300 }, time: T(250), label: { human: 'Upgrade Swords 2', orc: 'Upgrade Weapons 2' }, key: 'w', needs: ['weapons1'], effect: { pierce: 2, units: ['footman', 'knight', 'paladin', 'demo'] } },
    shields1: { at: 'smith', cost: { gold: 300, lumber: 300 }, time: T(200), label: 'Upgrade Shields', key: 'h', effect: { armor: 2, units: ['footman', 'knight', 'paladin'] } },
    shields2: { at: 'smith', cost: { gold: 900, lumber: 500 }, time: T(250), label: 'Upgrade Shields 2', key: 'h', needs: ['shields1'], effect: { armor: 2, units: ['footman', 'knight', 'paladin'] } },
    siege1:   { at: 'smith', cost: { gold: 1500 }, time: T(250), label: { human: 'Upgrade Ballistas', orc: 'Upgrade Catapults' }, key: { human: 'b', orc: 'c' }, effect: { pierce: 15, units: ['ballista'] } },
    siege2:   { at: 'smith', cost: { gold: 4000 }, time: T(250), label: { human: 'Upgrade Ballistas 2', orc: 'Upgrade Catapults 2' }, key: { human: 'b', orc: 'c' }, needs: ['siege1'], effect: { pierce: 15, units: ['ballista'] } },
    arrows1:  { at: 'mill', cost: { gold: 300, lumber: 300 }, time: T(200), label: { human: 'Upgrade Arrows', orc: 'Upgrade Throwing Axes' }, key: 'u', effect: { pierce: 1, units: ['archer', 'ranger'] } },
    arrows2:  { at: 'mill', cost: { gold: 900, lumber: 500 }, time: T(250), label: { human: 'Upgrade Arrows 2', orc: 'Upgrade Throwing Axes 2' }, key: 'u', needs: ['arrows1'], effect: { pierce: 1, units: ['archer', 'ranger'] } },
    ranger:   { at: 'mill', cost: { gold: 1500 }, time: T(250), label: { human: 'Elven Ranger Training', orc: 'Troll Berserker Training' }, key: { human: 'r', orc: 'b' }, requires: ['keep'], convert: { from: 'archer', to: 'ranger' } },
    scouting: { at: 'mill', cost: { gold: 1500 }, time: T(250), label: { human: 'Ranger Scouting', orc: 'Berserker Scouting' }, key: 's', requires: ['keep'], needs: ['ranger'], effect: { sight: 3, units: ['ranger'] } },
    longbow:  { at: 'mill', cost: { gold: 2000 }, time: T(250), label: { human: 'Research Longbow', orc: 'Research Lighter Axes' }, key: { human: 'l', orc: 'l' }, requires: ['keep'], needs: ['ranger'], effect: { range: 1, units: ['ranger'] } },
    marksmanship: { at: 'mill', race: 'human', cost: { gold: 2500 }, time: T(250), label: 'Ranger Marksmanship', key: 'm', requires: ['keep'], needs: ['ranger'], effect: { pierce: 3, units: ['ranger'] } },
    regeneration: { at: 'mill', race: 'orc', cost: { gold: 3000 }, time: T(250), label: 'Berserker Regeneration', key: 'r', requires: ['keep'], needs: ['ranger'], effect: { regen: 0.5, units: ['ranger'] } },
    cannons1: { at: 'foundry', cost: { gold: 700, lumber: 100, oil: 1000 }, time: T(200), label: 'Upgrade Cannons', key: 'c', effect: { pierce: 5, units: ['destroyer', 'battleship', 'sub'] } },
    cannons2: { at: 'foundry', cost: { gold: 2000, lumber: 250, oil: 3000 }, time: T(250), label: 'Upgrade Cannons 2', key: 'c', needs: ['cannons1'], effect: { pierce: 5, units: ['destroyer', 'battleship', 'sub'] } },
    hulls1:   { at: 'foundry', cost: { gold: 500, lumber: 500 }, time: T(200), label: 'Upgrade Ship Armor', key: 'a', effect: { armor: 5, units: ['destroyer', 'battleship', 'transport'] } },
    hulls2:   { at: 'foundry', cost: { gold: 1500, lumber: 900 }, time: T(250), label: 'Upgrade Ship Armor 2', key: 'a', needs: ['hulls1'], effect: { armor: 5, units: ['destroyer', 'battleship', 'transport'] } },
    paladin:  { at: 'church', cost: { gold: 1000 }, time: T(250), label: { human: 'Upgrade Knights to Paladins', orc: 'Upgrade Ogres to Ogre-Mages' }, key: { human: 'p', orc: 'm' }, convert: { from: 'knight', to: 'paladin' },
      grants: { human: ['holy_vision'], orc: ['eye_of_kilrogg'] } },
    healing:  { at: 'church', race: 'human', cost: { gold: 1000 }, time: T(200), label: 'Healing', key: 'h', needs: ['paladin'], spell: 'healing' },
    exorcism: { at: 'church', race: 'human', cost: { gold: 2000 }, time: T(200), label: 'Exorcism', key: 'e', needs: ['paladin'], spell: 'exorcism' },
    bloodlust:{ at: 'church', race: 'orc', cost: { gold: 1000 }, time: T(100), label: 'Bloodlust', key: 'b', needs: ['paladin'], spell: 'bloodlust' },
    runes:    { at: 'church', race: 'orc', cost: { gold: 1000 }, time: T(150), label: 'Runes', key: 'r', needs: ['paladin'], spell: 'runes' },
    slow:     { at: 'magetower', race: 'human', cost: { gold: 500 }, time: T(100), label: 'Slow', key: 'o', spell: 'slow' },
    flame_shield: { at: 'magetower', race: 'human', cost: { gold: 1000 }, time: T(100), label: 'Flame Shield', key: 'l', spell: 'flame_shield' },
    invisibility: { at: 'magetower', race: 'human', cost: { gold: 2500 }, time: T(200), label: 'Invisibility', key: 'i', spell: 'invisibility' },
    polymorph:{ at: 'magetower', race: 'human', cost: { gold: 2000 }, time: T(200), label: 'Polymorph', key: 'p', spell: 'polymorph' },
    blizzard: { at: 'magetower', race: 'human', cost: { gold: 2000 }, time: T(200), label: 'Blizzard', key: 'b', spell: 'blizzard' },
    haste:    { at: 'magetower', race: 'orc', cost: { gold: 500 }, time: T(100), label: 'Haste', key: 'h', spell: 'haste' },
    raise_dead: { at: 'magetower', race: 'orc', cost: { gold: 1500 }, time: T(100), label: 'Raise Dead', key: 'r', spell: 'raise_dead' },
    whirlwind:{ at: 'magetower', race: 'orc', cost: { gold: 1500 }, time: T(150), label: 'Whirlwind', key: 'w', spell: 'whirlwind' },
    unholy_armor: { at: 'magetower', race: 'orc', cost: { gold: 2500 }, time: T(200), label: 'Unholy Armor', key: 'u', spell: 'unholy_armor' },
    death_and_decay: { at: 'magetower', race: 'orc', cost: { gold: 2000 }, time: T(200), label: 'Death and Decay', key: 'd', spell: 'death_and_decay' },
    // in-place building upgrades: the building's type changes; cost/time come from the target building
    keep:     { at: 'hall', becomes: 'keep', label: { human: 'Upgrade to Keep', orc: 'Upgrade to Stronghold' }, key: { human: 'k', orc: 's' } },
    castle:   { at: 'keep', becomes: 'castle', label: { human: 'Upgrade to Castle', orc: 'Upgrade to Fortress' }, key: { human: 'c', orc: 'f' } },
    tower_guard: { at: 'scout', becomes: 'tower', label: 'Upgrade to Guard Tower', key: 'g' },
    tower_cannon:{ at: 'scout', becomes: 'cannon', label: 'Upgrade to Cannon Tower', key: 'c' },
  };

  // Spells. mana: cost (perHp: mana per hit point for Healing/Exorcism; perWave: area spells repeat while mana lasts);
  // range in tiles; target: unit | point; ally / enemy / any: who may be targeted; dur: seconds; known: free at start.
  const SPELLS = {
    holy_vision:   { label: 'Holy Vision', mana: 70, range: 999, target: 'point', key: 'v', reveal: 12, dur: 3, grant: true },
    healing:       { label: 'Healing', perHp: 6, range: 6, target: 'unit', who: 'ally', organic: true, key: 'h' },
    exorcism:      { label: 'Exorcism', perHp: 4, range: 10, target: 'unit', who: 'enemy', undeadOnly: true, key: 'e' },
    fireball:      { label: 'Fireball', mana: 100, range: 10, target: 'point', key: 'f', known: true, dmg: 34, line: true },
    slow:          { label: 'Slow', mana: 50, range: 10, target: 'unit', who: 'any', key: 'o', dur: 1000 / 30 },
    flame_shield:  { label: 'Flame Shield', mana: 80, range: 6, target: 'unit', who: 'any', groundOnly: true, key: 'l', dur: 600 / 30, dps: 18.75 },
    invisibility:  { label: 'Invisibility', mana: 200, range: 6, target: 'unit', who: 'ally', key: 'i', dur: 2000 / 30 },
    polymorph:     { label: 'Polymorph', mana: 200, range: 10, target: 'unit', who: 'any', organic: true, key: 'p' },
    blizzard:      { label: 'Blizzard', perWave: 25, range: 12, target: 'point', key: 'b', area: 2 },
    eye_of_kilrogg:{ label: 'Eye of Kilrogg', mana: 70, range: 6, target: 'point', key: 'k', summon: 'eye', grant: true },
    bloodlust:     { label: 'Bloodlust', mana: 50, range: 6, target: 'unit', who: 'ally', organic: true, key: 'b', dur: 1000 / 30 },
    runes:         { label: 'Runes', mana: 200, range: 10, target: 'point', key: 'r', dur: 2000 / 30, dmg: 50 },
    death_coil:    { label: 'Death Coil', mana: 100, range: 10, target: 'unit', who: 'enemy', organic: true, key: 'c', known: true, dmg: 50 },
    haste:         { label: 'Haste', mana: 50, range: 6, target: 'unit', who: 'any', key: 'h', dur: 1000 / 30 },
    raise_dead:    { label: 'Raise Dead', perWave: 50, range: 6, target: 'point', key: 'r', summon: 'skeleton' },
    whirlwind:     { label: 'Whirlwind', mana: 100, range: 12, target: 'point', key: 'w', dur: 800 / 30, dps: 30 },
    unholy_armor:  { label: 'Unholy Armor', mana: 200, range: 6, target: 'unit', who: 'any', key: 'u', dur: 500 / 30 },
    death_and_decay: { label: 'Death and Decay', perWave: 25, range: 12, target: 'point', key: 'd', area: 2 },
  };

  const RULES = {
    CARRY: 100, MINE_TIME: 150 / 30, DEPOT_TIME: 150 / 30, CHOP_TIME: 1250 / 30, PUMP_TIME: 100 / 30, OIL_DEPOT_TIME: 100 / 30,
    TREE_AMOUNT: 100, MINE_AMOUNT: 50000, OIL_AMOUNT: 50000, FOOD_CAP: 200, SELECT_CAP: 9,
    MINE_HP: 25500, MINE_ARMOR: 20,   // gold mine (wiki: Gold Mine (Warcraft II))
    MANA_START: 84, MANA_MAX: 255, MANA_REGEN: 1, CANCEL_REFUND: 0.75,
    REPAIR: { hp: 4, every: 25 / 30, cost: { gold: 1, lumber: 1 } },          // + 1 oil when the building cost oil
    CORPSE_TTL: 1000 / 30, RUBBLE_TTL: 400 / 30,
    START: { low: { gold: 2000, lumber: 1000, oil: 1000 }, medium: { gold: 5000, lumber: 2000, oil: 2000 }, high: { gold: 10000, lumber: 5000, oil: 5000 } },
    SPEEDS: [['Slowest', 0.5], ['Slow', 0.75], ['Normal', 1], ['Fast', 1.25], ['Faster', 1.5], ['Fastest', 2]],
    RANKS: {
      human: [[0, 'Servant'], [2000, 'Peasant'], [5000, 'Squire'], [8000, 'Footman'], [18000, 'Corporal'], [28000, 'Sergeant'], [40000, 'Lieutenant'], [55000, 'Captain'],
        [70000, 'Major'], [85000, 'Knight'], [105000, 'General'], [125000, 'Admiral'], [145000, 'Marshall'], [165000, 'Lord'], [185000, 'Grand Admiral'], [205000, 'Highlord'],
        [230000, 'Thundergod'], [255000, 'God'], [280000, 'Designer']],
      orc: [[0, 'Slave'], [2000, 'Peon'], [5000, 'Rogue'], [8000, 'Grunt'], [18000, 'Slasher'], [28000, 'Marauder'], [40000, 'Commander'], [55000, 'Captain'],
        [70000, 'Major'], [85000, 'Knight'], [105000, 'General'], [125000, 'Master'], [145000, 'Marshall'], [165000, 'Chieftain'], [185000, 'Overlord'], [205000, 'War Chief'],
        [230000, 'Demigod'], [255000, 'God'], [280000, 'Designer']],
    },
  };

  window.WC2 = { UNITS, BUILDINGS, RACES, UPGRADES, SPELLS, RULES };
})();
