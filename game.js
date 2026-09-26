// Realm of Iron: a Warcraft II: Tides of Darkness style RTS. Vanilla JS, Canvas 2D, vendored free-licensed art (see assets/CREDITS.md).
// Game data (stats, costs, tech tree, upgrades, spells, rules) comes from data.js; its sources are in docs/spec/.
// World coordinates are in tiles; an integer coordinate is the CENTER of that tile (tile i covers [i-0.5, i+0.5)).
// Buildings and resource patches report the center of their footprint.
//
// Two races (human, orc) mirror each other's stats and differ in names, spells and art. The player picks a race in
// newGame({race}); the opponent plays the other one. Units move in one of three domains: ground, water (ships) or air.
// Owners are 'player', 'enemy' and 'neutral' (critters). Rules follow Warcraft II: damage = max(basic - armor, 1) + piercing
// rolled 50-100 percent, splash hurts friends too, a side is beaten when it has no buildings and no units left.
(function () {
  'use strict';

  // ---------------------------------------------------------------- constants
  const TILE = 32, TICK = 0.05; // 20 Hz simulation
  let MW = 64, MH = 64, N = MW * MH;  // map size in tiles; set per game by setMapSize()
  const GRASS = 0, FOREST = 1, WATER = 2, ROCK = 3;
  const PANEL_W = 224, TOP_H = 32;
  const STRIKE_DELAY = 0.3, PROJ_SPEED = 12;

  // Game data lives in data.js (window.WC2): Warcraft II stats keyed by a generic role, with per-race type names.
  const W2 = window.WC2, RULES = W2.RULES, RACES = W2.RACES, SPELLS = W2.SPELLS, UPGRADES = W2.UPGRADES;
  const { TREE_AMOUNT, MINE_AMOUNT, OIL_AMOUNT, CARRY, MINE_TIME, CHOP_TIME, PUMP_TIME, DEPOT_TIME, OIL_DEPOT_TIME, CORPSE_TTL, RUBBLE_TTL, SELECT_CAP } = RULES;
  const HEAVY_SHOT = new Set(['boulder', 'spear', 'cannon', 'bigcannon']);   // missiles that boom on launch and impact
  // Union of both races' type names -> stats (+ race, key). Types shared by both races (skeleton, eye, critter) exist once.
  // Unit defs: speed is tiles per second (the engine's unit), wcSpeed the Warcraft II panel value; land / sea / air: what it can hit.
  const UNIT_DEFS = {}, BLD_DEFS = {}, TYPE_RACE = {};
  const targets = (s) => ({ land: (s || '').includes('L'), sea: (s || '').includes('S'), air: (s || '').includes('A') });
  for (const [race, r] of Object.entries(RACES)) {
    for (const [key, type] of Object.entries(r.units)) {
      if (UNIT_DEFS[type]) continue;
      const src = W2.UNITS[key], d = Object.assign({}, src, src[race] || {}, { key, race, type }, targets((src[race] || {}).tgt || src.tgt));
      delete d.human; delete d.orc;
      d.domain = src.domain || 'ground'; d.wcSpeed = src.speed; d.speed = d.tps;
      d.combat = d.dmg + d.pierce > 0 && key !== 'worker' && key !== 'demo';   // auto-acquires targets
      d.requires = (src.requires || []).slice();                              // generic building roles
      d.at = src.at ? r.buildings[src.at] : null; d.atRole = src.at || null;
      d.cost = src.cost || null;
      d.spells = src.spells ? src.spells[race].slice() : null;
      UNIT_DEFS[type] = d; TYPE_RACE[type] = race;
    }
    for (const [key, type] of Object.entries(r.buildings)) {
      const src = W2.BUILDINGS[key];
      const d = Object.assign({}, src, { key, race, type, art: key === 'keep' || key === 'castle' ? 'hall' : key }, targets(src.tgt));
      d.requires = (src.requires || []).slice();
      // a Castle counts as a Keep and a hall; Guard and Cannon Towers still count as (upgraded) Scout Towers
      d.provides = key === 'castle' ? ['hall', 'keep', 'castle'] : key === 'keep' ? ['hall', 'keep'] : key === 'tower' || key === 'cannon' ? [key, 'scout'] : [key];
      d.hallTier = key === 'castle' ? 2 : key === 'keep' ? 1 : 0;
      BLD_DEFS[type] = d; TYPE_RACE[type] = race;
    }
  }
  const upLabel = (id, race) => { const l = UPGRADES[id].label; return typeof l === 'object' ? l[race] : l; };
  const upAvail = (id, race) => !UPGRADES[id].race || UPGRADES[id].race === race;
  // cost, time and prerequisites of a research; an in-place building upgrade (becomes) takes them from the target building
  function upInfo(id, race) {
    const u = UPGRADES[id];
    if (u.becomes) { const bd = W2.BUILDINGS[u.becomes]; return { cost: bd.cost, time: bd.time, requires: bd.requires || [], needs: [] }; }
    return { cost: (race === 'orc' && u.orcCost) || u.cost, time: u.time, requires: u.requires || [], needs: u.needs || [] };
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  // ---------------------------------------------------------------- state
  let G = null;
  let speed = 1;
  let paused = false, menuOpen = false;           // player-facing pause and menu; never touched by the test hooks
  const SAVE_PREFIX = 'realm-of-iron-save:';
  const ui = { camX: 0, camY: 0, zoom: 1, vw: 800, vh: 600, placing: null, drag: null, mouse: { x: 0, y: 0, seen: false },
    keys: {}, msg: '', msgT: 0, panelKey: '', terrainDirty: true, groups: {}, target: null, lastDigit: { key: null, at: -1e9 }, lastAlert: -1e9, clicks: { id: null, n: 0, at: -1e9 } };

  const idx = (x, y) => y * MW + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH;
  const other = (o) => (o === 'player' ? 'enemy' : 'player');
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  // the simulation's own random numbers: seeded per game and kept in G (saved with it), so a recorded game replays
  // exactly from its options and the commands given; Math.random is left to sound and the title screen only
  function srand() { G.rs = (Math.imul(G.rs >>> 0, 1664525) + 1013904223) >>> 0; return G.rs / 4294967296; }
  const cx = (e) => e.tx + (e.size - 1) / 2;
  const cy = (e) => e.ty + (e.size - 1) / 2;
  const raceOf = (owner) => (owner === 'player' ? G.race : owner === 'enemy' ? G.enemyRace : 'human');
  const isNeutral = (e) => e.owner === 'neutral';
  const T = (owner, key) => RACES[raceOf(owner)].units[key];        // race-specific unit type for a generic key
  const B = (owner, key) => RACES[raceOf(owner)].buildings[key];    // race-specific building type
  const label = (e) => RACES[raceOf(e.owner)].labels[e.type] || RACES[TYPE_RACE[e.type] || 'human'].labels[e.type] || e.type;
  const keyOf = (e) => (e.kind === 'unit' ? UNIT_DEFS[e.type].key : BLD_DEFS[e.type].key);   // generic role of an entity
  const dom = (u) => UNIT_DEFS[u.type].domain;
  const ex = (e) => (e.kind === 'unit' ? e.x : cx(e));
  const ey = (e) => (e.kind === 'unit' ? e.y : cy(e));

  // ---------------------------------------------------------------- setup
  // score tallies per side (Warcraft II score screen): units and buildings made, lost and destroyed, resources gathered
  const newStats = () => ({ kills: 0, razed: 0, lost: 0, units: 0, buildings: 0, gold: 0, lumber: 0, oil: 0, score: 0 });
  function newGame(opts) {
    opts = opts || {};
    const race = RACES[opts.race] ? opts.race : 'human';
    const start = RULES.START[opts.resources] || RULES.START.medium;
    const newPlayer = () => ({ gold: start.gold, lumber: start.lumber, oil: start.oil, upgrades: [] });
    const size = [32, 64, 96, 128].includes(opts.size) ? opts.size : 64;
    setMapSize(size, size);
    G = {
      tick: 0, time: 0, winner: null, nextId: 1, aiOn: opts.ai !== false, seed: opts.seed | 0, rs: (Math.imul((opts.seed | 0) + 1, 2654435761) ^ 0x5bd1e995) >>> 0, race, enemyRace: race === 'human' ? 'orc' : 'human',
      reveal: opts.fog === false, walls: opts.walls !== false,   // walls: buildable (Warcraft II allows it in multiplayer games)
      terrain: new Uint8Array(N), stump: new Uint8Array(N), bgrid: new Array(N).fill(null), ugrid: new Array(N).fill(null), agrid: new Array(N).fill(null),
      trees: new Map(), mines: [], oils: [], units: [], buildings: [], ents: new Map(),
      projectiles: [], impacts: [], corpses: [], rubble: [], runes: [], storms: [], shards: [], reveals: [], detect: { player: new Set(), enemy: new Set(), neutral: new Set() },
      players: { player: newPlayer(), enemy: newPlayer(), neutral: { gold: 0, lumber: 0, oil: 0, upgrades: [] } },
      stats: { player: newStats(), enemy: newStats(), neutral: newStats() },
      selection: [], vis: new Uint8Array(N), memory: new Map(),
      ai: { step: 0, workers: 1, defend: {}, needs: {}, waves: [], alarm: null },
    };
    if (!opts.replaying) { const rb = document.getElementById('replay-bar'); if (rb && !rb.hidden) { rb.hidden = true; chatOpen(false); } }
    if (!opts.replaying) G.rec = { v: 1, game: 'Realm of Iron', opts: JSON.parse(JSON.stringify(opts)), events: [], notes: [], checks: [] };
    const plan = genMap(G.seed, opts.map);
    // Warcraft II skirmish start: a Town Hall and one Peasant (opts.workers asks for more)
    const nWorkers = Math.max(1, Math.min(9, opts.workers | 0 || 1));
    for (const owner of ['player', 'enemy']) {
      const s = plan.starts[owner === 'player' ? 0 : 1];
      addBuilding(owner, B(owner, 'hall'), s.hall.x, s.hall.y, true);
      const hc = { x: s.hall.x + 1.5, y: s.hall.y + 1.5 };
      for (let i = 0; i < nWorkers; i++) { const p = nearestFree(hc.x + (s.dir > 0 ? 3 : -3), hc.y + (s.dir > 0 ? 3 : -3), null, undefined, undefined, null, null, 'ground'); if (p) addUnit(owner, T(owner, 'worker'), p.x, p.y); }
    }
    for (const c of plan.critters) { const p = nearestFree(c.x, c.y, null, undefined, undefined, null, null, 'ground'); if (p) addUnit('neutral', 'critter', p.x, p.y); }
    ui.terrainDirty = true; ui.placing = null; ui.panelKey = ''; ui.groups = {}; ui.target = null;
    G.selection = [];
    updateFog();
    { // as on every WC2 map, the home gold mine is in view from the first second
      const hb = G.buildings.find((b) => b.owner === 'player'), hm = hb && G.mines.slice().sort((a, b) => rectGap(hb, a) - rectGap(hb, b))[0];
      if (hm) { const mx = hm.tx + (hm.size - 1) / 2, my = hm.ty + (hm.size - 1) / 2, r = hm.size / 2 + 1.3;
        for (let y = Math.floor(my - r); y <= Math.ceil(my + r); y++) for (let x = Math.floor(mx - r); x <= Math.ceil(mx + r); x++) if (inb(x, y) && !G.vis[idx(x, y)] && Math.hypot(x - mx, y - my) <= r) G.vis[idx(x, y)] = 1; }
    }
    ui.zoom = 1; const ph = plan.starts[0].hall; lookAt(ph.x + 1.5, ph.y + 1.5);
    if ($('race').value !== race) $('race').value = race; // keep the top-bar selector in step with games started through the API
    const ov = document.getElementById('overlay'); if (ov) ov.hidden = true;
    closeMenus();
  }

  // ---------------------------------------------------------------- map generation
  // A Warcraft II style skirmish map, point-symmetric so both sides get the same ground. The land starts as one forest;
  // clearings are cut for the two bases (opposite corners, gold mine at the forest edge), for expansions and for a
  // central battlefield, and winding roads join them, so the woods read as walls with passes and hidden glades rather
  // than scattered blobs. Water comes from a template: a strait across the middle (shores kept clear for shipyards,
  // oil offshore) or two coastal bays in the other corners. Rock outcrops line some clearings, a few copses stand in the
  // open, critters graze in the meadows. Every hall and mine is checked to be reachable on foot and a path is cut if not.
  function valueNoise(seed, cell) {
    const r = rng(seed), gw = Math.ceil(MW / cell) + 4, gh = Math.ceil(MH / cell) + 4, g = new Float32Array(gw * gh);
    for (let i = 0; i < g.length; i++) g[i] = r();
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = x / cell + 1, fy = y / cell + 1, x0 = Math.max(0, Math.min(gw - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(gh - 2, Math.floor(fy)));
      const tx = sm(Math.max(0, Math.min(1, fx - x0))), ty = sm(Math.max(0, Math.min(1, fy - y0)));
      const v = (i, j) => g[(y0 + j) * gw + (x0 + i)];
      return (v(0, 0) * (1 - tx) + v(1, 0) * tx) * (1 - ty) + (v(0, 1) * (1 - tx) + v(1, 1) * tx) * ty;
    };
  }
  function genMap(seed, template) {
    const t = G.terrain, S = MW, r = rng(12345 + (seed | 0) * 7919);
    const M = (p) => ({ x: S - 1 - p.x, y: S - 1 - p.y });                         // point mirror
    // point-symmetric noise and an antisymmetric warp keep every shape below identical on both halves
    const raw1 = valueNoise(r() * 1e9, Math.max(5, S / 10)), raw2 = valueNoise(r() * 1e9, 3), raw3 = valueNoise(r() * 1e9, Math.max(7, S / 6));
    const sym = (f) => (x, y) => (f(x, y) + f(S - 1 - x, S - 1 - y)) / 2;
    const n1 = sym(raw1), n2 = sym(raw2), n3 = sym(raw3);
    const WARP = Math.max(3, S * 0.07);
    const warp = (x, y) => ({ x: x + (raw1(x + 37, y + 11) - raw1(S - 1 - x + 37, S - 1 - y + 11)) * WARP, y: y + (raw3(x + 5, y + 71) - raw3(S - 1 - x + 5, S - 1 - y + 71)) * WARP });
    const tpl = template || (r() < 0.5 ? 'strait' : 'bays');
    const dseg = (px, py, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1, k = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L)); return Math.hypot(px - a.x - k * dx, py - a.y - k * dy); };
    // ---- layout (one side; every feature also gets its mirror)
    const m = Math.max(3, Math.round(S * 0.07));
    const hall = { x: m, y: m }, hc = { x: hall.x + 1.5, y: hall.y + 1.5 };
    const mineP = r() < 0.5 ? { x: hall.x + 8, y: Math.max(1, hall.y - 1) } : { x: Math.max(1, hall.x - 1), y: hall.y + 8 };
    const clearings = [{ x: hc.x + 3, y: hc.y + 3, r: Math.max(8, S * 0.15), base: true }];
    const exps = [
      { x: Math.round(S * (0.46 + r() * 0.1)), y: Math.round(S * (0.1 + r() * 0.08)) },
      tpl === 'bays' ? { x: Math.round(S * (0.1 + r() * 0.08)), y: Math.round(S * (0.46 + r() * 0.1)) } : { x: Math.round(S * (0.78 + r() * 0.06)), y: Math.round(S * (0.1 + r() * 0.06)) },
    ];
    // dryAt: rough test that a 3x3 mine and its clearing stay off the water of the chosen template
    const dryAt = (p) => { const q = { x: p.x + 1, y: p.y + 1 };
      if (tpl === 'bays') return Math.min(Math.hypot(q.x - (S - 1), q.y), Math.hypot(q.x, q.y - (S - 1))) > S * 0.27 * 1.25 + 4 + WARP;
      return Math.abs(q.y - S / 2) > S * 0.06 * 2.4 + 5 + WARP; };
    // expansions per side grow with the map, as on Warcraft II skirmish maps: 1 at 32, 2 at 64, 3 at 96, 4 at 128
    const nExp = Math.max(1, Math.round(S / 32));
    // mines stand well apart: an expansion is a walk away from the home mine and hall (not in the same field), and
    // from every other mine, mirrored ones included; the spacing relaxes a little per failed try on crowded maps
    const HOME_GAP = Math.max(14, S * 0.3), MINE_GAP = Math.max(11, S * 0.22);
    const homeMine = { x: mineP.x + 1, y: mineP.y + 1 };
    const spaced = (p, list, k) => { const c = { x: p.x + 1, y: p.y + 1 }, d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), mc = M(c);
      if (d2(c, homeMine) < HOME_GAP * k || d2(c, hc) < HOME_GAP * k || d2(mc, homeMine) < MINE_GAP * k || d2(c, mc) < MINE_GAP * k) return false;
      return list.every((e) => { const q = { x: e.x + 1, y: e.y + 1 }; return d2(c, q) >= MINE_GAP * k && d2(mc, q) >= MINE_GAP * k; }); };
    const cand = exps.splice(0);
    for (const e of cand) if (exps.length < nExp && spaced(e, exps, 1) && dryAt(e)) exps.push(e);
    const far = (p, d) => clearings.concat(exps.map((e) => ({ x: e.x + 1, y: e.y + 1 }))).every((c) => Math.hypot(p.x - c.x, p.y - c.y) > d && Math.hypot(S - 1 - p.x - c.x, S - 1 - p.y - c.y) > d);
    for (let tries = 0; exps.length < nExp && tries < 600; tries++) {
      const p = { x: Math.round(S * (0.06 + r() * 0.84)), y: Math.round(S * (0.06 + r() * 0.84)) };
      if (p.x < 1 || p.y < 1 || p.x > S - 5 || p.y > S - 5) continue;
      if (p.x + p.y > S * 0.9 || Math.hypot(p.x - (S - 1) / 2, p.y - (S - 1) / 2) < S * 0.16) continue;   // own half, clear of the centre
      const k = Math.max(0.7, 1 - tries * 0.001);
      if (far({ x: p.x + 1, y: p.y + 1 }, S * 0.15 * k) && spaced(p, exps, k) && dryAt(p)) exps.push(p);
    }
    for (const e of exps) clearings.push({ x: e.x + 1, y: e.y + 1, r: Math.max(4.5, S * 0.075) });
    clearings.push({ x: (S - 1) / 2, y: (S - 1) / 2, r: Math.max(5, S * 0.1), mid: true });
    // bays: a harbour clearing on the rim of the bay facing this base, joined to the roads, so a shipyard, refinery
    // and foundry have open coast to stand on
    if (tpl === 'bays') for (const bay of [{ x: S - 1, y: 0 }, { x: 0, y: S - 1 }]) { const dx = hc.x - bay.x, dy = hc.y - bay.y, L = Math.hypot(dx, dy), R = S * 0.27 + 2;
      clearings.push({ x: bay.x + dx / L * R, y: bay.y + dy / L * R, r: Math.max(4.5, S * 0.07), harbour: true, bay }); }
    const nMeadow = S >= 96 ? 3 : S >= 64 ? 2 : 1;
    for (let i = 0; i < nMeadow; i++) clearings.push({ x: S * (0.22 + r() * 0.5), y: S * (0.25 + r() * 0.2), r: Math.max(3.5, S * (0.05 + r() * 0.04)), meadow: true });
    const allC = clearings.concat(clearings.filter((c) => !c.mid).map((c) => Object.assign({}, c, M(c))));
    // roads: a minimum spanning tree over the clearings plus a second route from each base, 3-4 tiles wide, bent through a midpoint
    const roads = [], link = (a, b) => { const mid = { x: (a.x + b.x) / 2 + (r() - 0.5) * S * 0.12, y: (a.y + b.y) / 2 + (r() - 0.5) * S * 0.12 }; roads.push([a, mid, b, 1.5 + r()]); };
    const inTree = [allC[0]], rest = allC.slice(1);
    while (rest.length) {
      let best = null, bd = 1e9;
      for (const a of inTree) for (const b of rest) { const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < bd) { bd = d; best = [a, b]; } }
      link(best[0], best[1]); inTree.push(best[1]); rest.splice(rest.indexOf(best[1]), 1);
    }
    link(clearings[0], clearings.find((c) => c.mid));
    const allRoads = roads.concat(roads.map(([a, mid, b, w]) => [M(a), M(mid), M(b), w]));
    // ---- water template
    let water = () => false;
    const oilWant = [];
    // a ford across the middle of a strait: a land pass straight through the water, kept open on both banks, so armies
    // meet in the centre instead of walking round both ends of the water (and getting lost on the way)
    const fordW = Math.max(3, S * 0.06), fmid = (S - 1) / 2;
    const inFord = (x, y) => tpl === 'strait' && Math.abs(x - fmid) + Math.abs(y - fmid) * 0.35 < fordW + 1.5 && Math.abs(y - fmid) < S * 0.22;
    if (tpl === 'strait') {
      const sy = S * (0.44 + r() * 0.08), bend = S * (r() - 0.5) * 0.12;
      const P0 = { x: S * (0.16 + r() * 0.06), y: sy }, P1 = { x: S * 0.33, y: S * 0.5 + bend }, P2 = { x: (S - 1) / 2, y: (S - 1) / 2 };
      const half = Math.max(2.5, S * 0.06);
      water = (x, y, w) => {
        if (inFord(x, y)) return 2;                                                   // (land; the paint below keeps it open)
        const d = Math.min(dseg(w.x, w.y, P0, P1), dseg(w.x, w.y, P1, P2), dseg(w.x, w.y, M(P0), M(P1)), dseg(w.x, w.y, M(P1), P2));
        const bay = Math.max(0, 1 - Math.min(Math.hypot(w.x - P0.x, w.y - P0.y), Math.hypot(w.x - M(P0).x, w.y - M(P0).y)) / (S * 0.12));
        return d - (half * (1 + 1.4 * bay) + (n3(x, y) - 0.5) * half);
      };
      oilWant.push(P0, { x: S * 0.4, y: S * 0.5 });
      if (S >= 96) oilWant.push({ x: S * 0.25, y: S * 0.47 });
    } else {
      const bay = { x: S - 1, y: 0 }, R = S * 0.27;
      water = (x, y, w) => Math.min(Math.hypot(w.x - bay.x, w.y - bay.y), Math.hypot(w.x - M(bay).x, w.y - M(bay).y)) - (R + (n3(x, y) - 0.5) * R * 0.5);
      oilWant.push({ x: S * 0.82, y: S * 0.18 }, { x: S * 0.9, y: S * 0.3 });
      if (S >= 96) oilWant.push({ x: S * 0.7, y: S * 0.08 });
    }
    // ---- rock: massifs inside the deep woods (their own noise, so the rest of the layout does not change with them)
    const rockN = sym(valueNoise(((seed | 0) * 31 + 7) * 7919 + 17, Math.max(5, S / 9)));
    // ---- paint
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const w = warp(x, y), i = idx(x, y), f = 0.6 * n1(x, y) + 0.4 * n2(x, y);
      const wd = water(x, y, w);
      if (wd < 0) { t[i] = WATER; continue; }
      let open = wd < 3.6 ? 1 : 0;                                                     // beaches along the water, deep enough for a shipyard
      let edge = 1e9;                                                                   // how far inside a clearing (negative = inside)
      for (const c of allC) edge = Math.min(edge, Math.hypot(w.x - c.x, w.y - c.y) - c.r * (0.85 + 0.3 * n2(x + 3, y + 9)));
      for (const [a, mid, b, rw] of allRoads) if (Math.min(dseg(w.x, w.y, a, mid), dseg(w.x, w.y, mid, b)) < rw + n2(x, y) * 1.2) open = 1;
      if (edge < 0) open = 1;
      if (inFord(x, y)) open = 1;
      if (!open && f > 0.7) open = 1;                                                   // hidden glades deep in the woods
      if (!open && wd > 2 && edge > 1 && rockN(x, y) > 0.68) { t[i] = ROCK; continue; }
      if (open && edge > -2.5 && edge < 0 && n1(x + 50, y + 20) > 0.62 && !allC.some((c) => (c.base || c.harbour) && Math.hypot(x - c.x, y - c.y) < c.r + 2)) t[i] = ROCK;   // outcrops on some clearing rims
      else if (open && edge < -3 && n2(x + 17, y + 3) > 0.8 && !allC.some((c) => (c.base || c.mid || c.harbour) && Math.hypot(x - c.x, y - c.y) < c.r)) t[i] = FOREST;   // copses in the open
      else t[i] = open ? GRASS : FOREST;
    }
    // rock thinner than three tiles reads as a wall: a rock tile stays only inside some solid 3x3 block of rock
    // (a morphological opening, mirror-symmetric like the rest), so rock comes as chunky massifs; the rest is forest
    { const isR = (x, y) => inb(x, y) && t[idx(x, y)] === ROCK, keep = new Uint8Array(N);
      for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
        let full = true; for (let dy = -1; dy <= 1 && full; dy++) for (let dx = -1; dx <= 1; dx++) if (!isR(x + dx, y + dy)) { full = false; break; }
        if (full) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) keep[idx(x + dx, y + dy)] = 1; }
      for (let i = 0; i < N; i++) if (t[i] === ROCK && !keep[i]) t[i] = FOREST; }
    for (let i = 0; i < N / 2; i++) t[N - 1 - i] = t[i];                            // exact symmetry (the fields above already are, up to rounding)
    const setB = (x, y, v) => { if (inb(x, y)) { t[idx(x, y)] = v; t[idx(S - 1 - x, S - 1 - y)] = v; } };
    const clearR = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y) && t[idx(x, y)] !== WATER) setB(x, y, GRASS); };
    clearR(hall.x - 2, hall.y - 2, hall.x + 5, hall.y + 5);
    // harbours: walk from the clearing toward the bay and clear a landing where the water starts
    for (const c of clearings) if (c.harbour) {
      const dx = c.bay.x - c.x, dy = c.bay.y - c.y, L = Math.hypot(dx, dy);
      for (let k = 0; k < L; k += 0.5) { const x = Math.round(c.x + dx / L * k), y = Math.round(c.y + dy / L * k); if (!inb(x, y)) break;
        if (t[idx(x, y)] === WATER) { clearR(x - 3, y - 3, x + 3, y + 3); break; } setB(x, y, GRASS); }
    }
    clearR(mineP.x - 1, mineP.y - 1, mineP.x + 3, mineP.y + 3);
    for (const e of exps) clearR(e.x - 1, e.y - 1, e.x + 3, e.y + 3);
    // ---- reachability: cut the cheapest path (forest and rock cost more, water impassable) to anything unreachable
    const goals = () => [hc, M(hc), { x: mineP.x + 1, y: mineP.y + 1 }].concat(exps.map((e) => ({ x: e.x + 1, y: e.y + 1 })));
    const reach = () => {
      const seen = new Uint8Array(N), q = [idx(Math.round(hc.x), Math.round(hc.y))]; seen[q[0]] = 1;
      for (let h = 0; h < q.length; h++) { const x = q[h] % S, y = (q[h] / S) | 0; for (const [dx, dy] of DIRS.slice(0, 4)) { const nx = x + dx, ny = y + dy, ni = idx(nx, ny); if (inb(nx, ny) && !seen[ni] && t[ni] === GRASS) { seen[ni] = 1; q.push(ni); } } }
      return seen;
    };
    for (let pass = 0; pass < 8; pass++) {
      const seen = reach(), miss = goals().find((p) => !seen[idx(Math.round(p.x), Math.round(p.y))]);
      if (!miss) break;
      const cost = new Float64Array(N).fill(1e18), prev = new Int32Array(N).fill(-1), heap = [];
      for (let i = 0; i < N; i++) if (seen[i]) { cost[i] = 0; heap.push([0, i]); }
      const target = idx(Math.round(miss.x), Math.round(miss.y));
      heap.sort((a, b) => a[0] - b[0]);
      // Dijkstra with a simple binary heap
      const hp = { a: heap, push(v) { const a = this.a; a.push(v); let k = a.length - 1; while (k) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } },
        pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, rr = l + 1; let mm = k; if (l < a.length && a[l][0] < a[mm][0]) mm = l; if (rr < a.length && a[rr][0] < a[mm][0]) mm = rr; if (mm === k) break; [a[mm], a[k]] = [a[k], a[mm]]; k = mm; } } return top; } };
      while (hp.a.length) {
        const [c, i] = hp.pop(); if (c > cost[i]) continue; if (i === target) break;
        const x = i % S, y = (i / S) | 0;
        for (const [dx, dy] of DIRS.slice(0, 4)) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue; const ni = idx(nx, ny), tt = t[ni]; if (tt === WATER) continue;
          const nc = c + (tt === GRASS ? 1 : tt === FOREST ? 4 : 8); if (nc < cost[ni]) { cost[ni] = nc; prev[ni] = i; hp.push([nc, ni]); } }
      }
      if (prev[target] < 0 && !seen[target]) break;
      for (let i = target; i >= 0 && !seen[i]; i = prev[i]) { const x = i % S, y = (i / S) | 0; for (let oy = 0; oy <= 1; oy++) for (let ox = 0; ox <= 1; ox++) if (inb(x + ox, y + oy) && t[idx(x + ox, y + oy)] !== WATER) setB(x + ox, y + oy, GRASS); }
    }
    // ---- resources
    let n = 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (t[idx(x, y)] === FOREST) {
      const tr = { id: 'tree' + (++n), kind: 'res', type: 'tree', tx: x, ty: y, size: 1, amount: TREE_AMOUNT };
      G.trees.set(idx(x, y), tr); G.ents.set(tr.id, tr);
    }
    const both = (x, y, size, fn) => { fn(x, y); fn(S - size - x, S - size - y); };   // a patch and its mirror
    both(mineP.x, mineP.y, 3, (x, y) => addPatch('gold', x, y, 3, MINE_AMOUNT));
    const dryPatch = (x, y) => { for (let yy = y - 1; yy <= y + 3; yy++) for (let xx = x - 1; xx <= x + 3; xx++) if (inb(xx, yy) && t[idx(xx, yy)] === WATER) return false; return true; };
    for (const e of exps) { const amt = 10000 * (2 + Math.floor(r() * 5)); if (dryPatch(e.x, e.y)) both(e.x, e.y, 3, (x, y) => addPatch('gold', x, y, 3, amt)); }
    // oil: 3x3 patches on open water (the footprint plus a one-tile margin all water)
    // patches sit well offshore (3 tiles of water round them when the sea allows) so a shipyard on the beach nearby
    // keeps the Warcraft II gap of more than 3 tiles to the oil
    const wet = (x, y, m) => { for (let yy = y - m; yy <= y + 2 + m; yy++) for (let xx = x - m; xx <= x + 2 + m; xx++) if (!inb(xx, yy) || t[idx(xx, yy)] !== WATER) return false; return true; };
    for (const want of oilWant) {
      let best = null, bd = 1e9;
      for (const m of [3, 2, 1]) { for (let y = 1; y < S - 3; y++) for (let x = 1; x < S - 3; x++) if (y + 1 < S / 2 && wet(x, y, m) && !G.oils.some((o) => Math.abs(o.tx - x) < 5 && Math.abs(o.ty - y) < 5)) { const d = Math.hypot(x - want.x, y - want.y); if (d < bd) { bd = d; best = { x, y }; } } if (best) break; }
      if (best) both(best.x, best.y, 3, (x, y) => addPatch('oil', x, y, 3, OIL_AMOUNT));
    }
    // ---- critters: a few in the meadows and expansion clearings, away from the halls
    const critters = [];
    for (const c of clearings) if (!c.base) for (let k = 0; k < (c.meadow ? 2 : 1); k++) { const p = { x: Math.round(c.x + (r() - 0.5) * c.r), y: Math.round(c.y + (r() - 0.5) * c.r) }; critters.push(p); if (!c.mid) critters.push(M(p)); }
    return { starts: [{ hall, dir: 1 }, { hall: { x: S - 4 - hall.x, y: S - 4 - hall.y }, dir: -1 }], critters, template: tpl };
  }

  function addPatch(type, tx, ty, size, amount) {
    const list = type === 'gold' ? G.mines : G.oils;
    const m = { id: type + (list.length + 1), kind: 'res', type, tx, ty, size, amount };
    if (type === 'gold') { m.hp = m.maxHp = RULES.MINE_HP; }
    list.push(m); G.ents.set(m.id, m); setFootprint(m, m); return m;
  }
  function setFootprint(e, v) {
    for (let y = e.ty; y < e.ty + e.size; y++) for (let x = e.tx; x < e.tx + e.size; x++) if (inb(x, y)) G.bgrid[idx(x, y)] = v;
  }
  function addBuilding(owner, type, tx, ty, done) {
    const d = BLD_DEFS[type];
    const b = { id: 'b' + (G.nextId++), kind: 'building', owner, type, tx, ty, size: d.size, hp: done ? d.hp : Math.max(1, Math.round(d.hp * 0.05)), maxHp: d.hp,
      done, progress: done ? 1 : 0, training: null, research: null, cooldown: 0, builderId: null, fireT: 0 };
    G.buildings.push(b); G.ents.set(b.id, b); setFootprint(b, b); return b;
  }
  function addUnit(owner, type, tx, ty) {
    const d = UNIT_DEFS[type];
    const u = { id: 'u' + (G.nextId++), kind: 'unit', owner, type, tx, ty, size: 1, x: tx, y: ty, hp: d.hp, maxHp: d.hp,
      mana: d.mana ? RULES.MANA_START : 0, fx: { slow: 0, haste: 0, bloodlust: 0, invis: 0, unholy: 0, flame: 0 }, castCd: 0, order: 'idle', path: [], goal: null, dest: null, targetId: null, spell: null, cooldown: 0, carrying: 0, carryType: null,
      gatherId: null, gatherType: null, phase: null, timer: 0, build: null, hidden: false, repathT: 0, scanT: 0, chaseT: 0, blockT: 0, fail: 0,
      dir: 'down', angle: Math.PI / 2, walkT: 0, anim: null, strike: null, cargo: [], aboard: null, voice: 0 };
    G.units.push(u); G.ents.set(u.id, u); grid(u)[idx(tx, ty)] = u; return u;
  }

  // ---------------------------------------------------------------- grid queries (domain aware)
  const grid = (u) => (u && dom(u) === 'air' ? G.agrid : G.ugrid);
  const gridFor = (d) => (d === 'air' ? G.agrid : G.ugrid);
  function sPassD(x, y, d) {
    if (!inb(x, y)) return false;
    if (d === 'air') return true;
    const t = G.terrain[idx(x, y)];
    return (d === 'water' ? t === WATER : t === GRASS) && !G.bgrid[idx(x, y)];
  }
  const sPass = (x, y) => sPassD(x, y, 'ground');
  // Warcraft II: idle friends step aside. A standing friendly ground unit (not one holding position or building)
  // is passable at an extra cost; moveStep then swaps places with it. Enemies and busy friends stay in the way.
  const yields = (o, u) => o.owner === u.owner && dom(o) === 'ground' && !o.hidden && o.order !== 'hold' && o.order !== 'build' && o.order !== 'building';
  function passFor(x, y, u) {
    if (!sPassD(x, y, dom(u))) return false;
    const o = grid(u)[idx(x, y)];
    return !o || o === u || o.path.length > 0 || yields(o, u);
  }
  function tileFree(x, y, u, group, d) {
    d = d || (u ? dom(u) : 'ground');
    if (!sPassD(x, y, d)) return false;
    const o = gridFor(d)[idx(x, y)];
    return !o || o === u || (group && group.has(o));
  }
  function nearestFree(x, y, u, px, py, group, exclude, d) {
    x = Math.round(x); y = Math.round(y);
    if (px === undefined) { px = x; py = y; }
    for (let r = 0; r < Math.max(MW, MH); r++) {
      let best = null, bd = 1e9;
      for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
        if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== r) continue;
        if (!tileFree(xx, yy, u, group, d) || (exclude && exclude.has(idx(xx, yy)))) continue;
        const dd = Math.hypot(xx - px, yy - py) + Math.hypot(xx - x, yy - y) * 0.01;
        if (dd < bd) { bd = dd; best = { x: xx, y: yy }; }
      }
      if (best) return best;
    }
    return null;
  }
  function rectDist(x, y, e) {
    const dx = Math.max(e.tx - x, 0, x - (e.tx + e.size - 1)), dy = Math.max(e.ty - y, 0, y - (e.ty + e.size - 1));
    return Math.max(dx, dy);
  }
  function rectEuclid(x, y, e) {
    const dx = Math.max(e.tx - x, 0, x - (e.tx + e.size - 1)), dy = Math.max(e.ty - y, 0, y - (e.ty + e.size - 1));
    return Math.hypot(dx, dy);
  }
  const atTile = (u) => Math.abs(u.x - u.tx) < 1e-6 && Math.abs(u.y - u.ty) < 1e-6;
  function nearWater(f) { // any tile adjacent to the footprint is water
    for (let y = f.ty - 1; y <= f.ty + f.size; y++) for (let x = f.tx - 1; x <= f.tx + f.size; x++)
      if (inb(x, y) && G.terrain[idx(x, y)] === WATER && rectDist(x, y, f) === 1) return true;
    return false;
  }
  function onOilPatch(f) { // the footprint covers an oil patch exactly
    return G.oils.some((o) => o.tx === f.tx && o.ty === f.ty && o.size === f.size && o.amount > 0);
  }
  function faceTowards(u, x, y) {
    const dx = x - u.x, dy = y - u.y;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
    u.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    u.angle = Math.atan2(dy, dx);
  }

  // ---------------------------------------------------------------- A* pathfinding
  let gS = new Float64Array(N), came = new Int32Array(N), seen = new Int32Array(N), closed = new Int32Array(N);
  let stamp = 0;
  function findPath(u, goal, limit, ghost) {
    limit = limit || 2500;
    const d = dom(u), sx = u.tx, sy = u.ty;
    if (goal.test(sx, sy)) return [];
    stamp++;
    const h = (x, y) => { const dx = Math.abs(x - goal.hx), dy = Math.abs(y - goal.hy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const hi = [], hf = [];
    const push = (f, i) => { hi.push(i); hf.push(f); let k = hi.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [hi[p], hi[k]] = [hi[k], hi[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; } };
    const pop = () => { const top = hi[0]; const li = hi.pop(), lf = hf.pop();
      if (hi.length) { hi[0] = li; hf[0] = lf; let k = 0;
        for (;;) { const l = 2 * k + 1, r = l + 1; let m = k;
          if (l < hi.length && hf[l] < hf[m]) m = l; if (r < hi.length && hf[r] < hf[m]) m = r;
          if (m === k) break; [hi[m], hi[k]] = [hi[k], hi[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m; } }
      return top; };
    const si = idx(sx, sy);
    gS[si] = 0; seen[si] = stamp; came[si] = -1; push(h(sx, sy), si);
    let best = si, bestH = h(sx, sy), expanded = 0;
    const build = (i) => { const p = []; while (i !== si) { p.push({ x: i % MW, y: (i / MW) | 0 }); i = came[i]; } return p.reverse(); };
    while (hi.length && expanded < limit) {
      const cur = pop();
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp; expanded++;
      const x = cur % MW, y = (cur / MW) | 0;
      if (cur !== si && goal.test(x, y)) return build(cur);
      const hc = h(x, y); if (hc < bestH) { bestH = hc; best = cur; }
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (ghost ? !sPassD(nx, ny, d) : !passFor(nx, ny, u)) continue;
        if (dx && dy && (!sPassD(x + dx, y, d) || !sPassD(x, y + dy, d))) continue;
        const ni = idx(nx, ny);
        if (closed[ni] === stamp) continue;
        const o = grid(u)[ni], ng = gS[cur] + (dx && dy ? 1.4142 : 1) + (o && o !== u && !o.path.length ? 4 : 0);
        if (seen[ni] !== stamp || ng < gS[ni]) { seen[ni] = stamp; gS[ni] = ng; came[ni] = cur; push(ng + h(nx, ny), ni); }
      }
    }
    return best !== si ? build(best) : null;
  }
  const pointGoal = (p) => ({ test: (x, y) => x === p.x && y === p.y, hx: p.x, hy: p.y });
  const adjGoal = (e) => ({ test: (x, y) => rectDist(x, y, e) === 1, hx: cx(e), hy: cy(e) });
  const nearGoal = (e, r) => ({ test: (x, y) => rectDist(x, y, e) <= r, hx: cx(e), hy: cy(e) });
  const rangeGoal = (e, range, minRange) => ({ test: (x, y) => { const d = rectEuclid(x, y, e); return d <= range + 0.5 && d >= (minRange || 0); }, hx: cx(e), hy: cy(e) });

  function ensurePath(u, goal) {
    if (u.path.length || u.repathT > 0) return;
    let p = findPath(u, goal);
    // standing units count as walls: a few enemies (or friends) standing in a lane sent a whole army on a 120-step
    // lap round a lake to reach a point 11 tiles away. A detour that long takes the way through the units instead:
    // a friend is squeezed past, an enemy in the way is fought (moveStep)
    if (p && dom(u) === 'ground') {
      const dx = Math.abs(goal.hx - u.tx), dy = Math.abs(goal.hy - u.ty), oct = Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
      if (p.length > 2 * oct + 12) { const q = findPath(u, goal, 2500, true); if (q && q.length * 1.5 < p.length) p = q; }
    }
    u.repathT = 0.25;
    if (p === null) { u.fail++; u.repathT = 0.5; } else if (p.length) { u.path = p; }
  }

  // ---------------------------------------------------------------- movement
  function moveStep(u, dt) {
    let step = UNIT_DEFS[u.type].speed * dt * (u.fx.haste > 0 ? 2 : 1) / (u.fx.slow > 0 ? 2 : 1) * (u.carrying && keyOf(u) === 'worker' ? 0.7 : 1);   // loaded workers: 7 instead of 10
    const gr = grid(u);
    for (let guard = 0; guard < 4; guard++) {
      const dx = u.tx - u.x, dy = u.ty - u.y, d = Math.hypot(dx, dy);
      if (d > 1e-6) {
        u.walkT += dt; faceTowards(u, u.tx, u.ty);
        if (step >= d) { u.x = u.tx; u.y = u.ty; step -= d; }
        else { u.x += dx / d * step; u.y += dy / d * step; return; }
      } else { u.x = u.tx; u.y = u.ty; }
      if (!u.path.length || step <= 0) return;
      const n = u.path[0];
      if (!sPassD(n.x, n.y, dom(u))) { u.path = []; return; }
      const o = gr[idx(n.x, n.y)];
      if (o && o !== u) {
        u.blockT += dt;
        if (o.owner !== u.owner && !isNeutral(o) && (u.order === 'attackMove' || u.wave) && UNIT_DEFS[u.type].combat && canHit(u, o) && seenBy(u.owner, o)) {
          u.blockT = 0; u.path = []; u.targetId = o.id; if (u.order !== 'attackMove') u.order = 'attack'; return;
        }
        // two friendly ground units in each other's way squeeze past (swap tiles): a head-on meeting at once, a
        // unit that stands on our path after a moment; otherwise re-route. Stops worker knots between hall and mine.
        const friend = dom(u) === 'ground' && yields(o, u) && atTile(o);
        const headOn = friend && o.path.length && o.path[0].x === u.tx && o.path[0].y === u.ty;
        if (friend && (headOn || u.blockT > 0.4)) {
          const ux = u.tx, uy = u.ty;
          gr[idx(ux, uy)] = o; gr[idx(n.x, n.y)] = u;
          o.tx = ux; o.ty = uy;                                    // o slides back one tile while we step forward
          if (headOn) o.path.shift(); else { o.path = []; o.repathT = 0; }
          u.tx = n.x; u.ty = n.y; u.path.shift(); u.blockT = 0;
          continue;
        }
        // (a standing friend is waited for until the swap above; anything else is routed around)
        if ((!o.path.length && !friend) || u.blockT > 0.6) { u.blockT = 0; u.path = []; u.repathT = 0; }
        return;
      }
      u.blockT = 0;
      gr[idx(u.tx, u.ty)] = null; gr[idx(n.x, n.y)] = u;
      u.tx = n.x; u.ty = n.y; u.path.shift();
    }
  }
  function placeUnit(u, p) {
    const gr = grid(u);
    if (!u.hidden && gr[idx(u.tx, u.ty)] === u) gr[idx(u.tx, u.ty)] = null;
    u.tx = u.x = p.x; u.ty = u.y = p.y; u.path = []; gr[idx(p.x, p.y)] = u;
  }
  function hideUnit(u) {
    const gr = grid(u);
    if (gr[idx(u.tx, u.ty)] === u) gr[idx(u.tx, u.ty)] = null;
    u.hidden = true; u.path = [];
  }
  function popOut(u, e, prefer) {
    const px = prefer ? cx(prefer) : u.tx, py = prefer ? cy(prefer) : u.ty;
    const p = nearestFree(cx(e), cy(e), u, px, py);
    u.hidden = false;
    if (p) { u.tx = u.x = p.x; u.ty = u.y = p.y; u.path = []; grid(u)[idx(p.x, p.y)] = u; }
  }

  // ---------------------------------------------------------------- orders
  function resetOrder(u) {
    u.path = []; u.targetId = null; u.goal = null; u.dest = null; u.build = null; u.phase = null; u.spell = null; u.fail = 0; u.repathT = 0; u.chaseT = 0; u.leash = null;
    u.strike = null;                                   // a new order cancels the swing that was about to land
    u.channel = false; u.castAt = null;
    if (u.anim && u.anim.loop) u.anim = null;
    if (u.hidden && u.order === 'gather') { const m = G.ents.get(u.phase === 'unloading' ? u.depotId : u.gatherId); if (m) popOut(u, m); else popOut(u, { tx: u.tx, ty: u.ty, size: 1 }); }
  }
  function setIdle(u) { resetOrder(u); u.order = 'idle'; }
  function setMove(u, goal, dest, order) { resetOrder(u); u.order = order || 'move'; u.goal = goal; u.dest = dest; }
  function setAttack(u, t) { resetOrder(u); u.order = 'attack'; u.targetId = t.id; }
  // an attack the unit picked by itself (an enemy in sight, or one hitting it) keeps it on a leash: it gives up the
  // chase about 10 tiles from where it started and walks back there
  function autoAttack(u, t) { setAttack(u, t); u.leash = { x: u.tx, y: u.ty }; }
  function setGather(u, res) {
    resetOrder(u); u.order = 'gather'; u.gatherId = res.id; u.gatherType = res.type;
    u.phase = u.carrying > 0 ? 'toBase' : 'toRes';
  }
  function setCast(u, spell, t, at) { resetOrder(u); u.order = 'cast'; u.spell = spell; u.targetId = t ? t.id : null; u.castAt = t ? null : at; }
  const playAnim = (u, name, dur, loop) => { u.anim = { name, t: 0, dur, loop: !!loop }; };

  function updateUnit(u, dt) {
    if (u.aboard) return;
    u.cooldown -= dt; u.repathT -= dt; u.scanT -= dt; u.chaseT -= dt; u.castCd -= dt;
    const d = UNIT_DEFS[u.type];
    if (d.mana) u.mana = G.cheats && G.cheats.mana && u.owner === 'player' ? RULES.MANA_MAX : Math.min(RULES.MANA_MAX, u.mana + RULES.MANA_REGEN * dt);
    if (u.fx.invis > 0 && !['idle', 'move', 'hold', 'load', 'aboard', 'unload', 'follow'].includes(u.order)) u.fx.invis = 0;   // any task but moving dispels it
    if (u.anim) { u.anim.t += dt; if (u.anim.t >= u.anim.dur) { if (u.anim.loop) u.anim.t -= u.anim.dur; else u.anim = null; } }
    if (u.strike) { u.strike.t -= dt; if (u.strike.t <= 0) { const s = u.strike; u.strike = null; deliverStrike(u, s); } }
    if (u.resume && u.order === 'idle' && G.time >= u.resume.at) { const r = u.resume; u.resume = null; if (G.ents.get(r.targetId)) issueCommand({ action: 'gather', unitIds: [u.id], targetId: r.targetId }, u.owner); }
    switch (u.order) {
      case 'move': updMove(u); break;
      case 'attackMove': case 'patrol': updAttackMove(u, dt); break;
      case 'attack': { const t = G.ents.get(u.targetId), L = u.leash;
        if (!validTarget(u, t)) { if (L && (L.x !== u.tx || L.y !== u.ty)) { const g = nearestFree(L.x, L.y, u); if (g) { setMove(u, g, g, 'attackMove'); break; } } setIdle(u); }
        else if (L && Math.hypot(ex(t) - L.x, ey(t) - L.y) > 10) { const g = nearestFree(L.x, L.y, u); if (g) setMove(u, g, g, 'attackMove'); else setIdle(u); }
        else engage(u, t, true);
        break; }
      case 'hold': updHold(u); break;
      case 'gather': updGather(u, dt); break;
      case 'build': updBuild(u); break;
      case 'repair': updRepair(u, dt); break;
      case 'cast': updCast(u, dt); break;
      case 'load': updLoad(u); break;
      case 'unload': updUnload(u); break;
      case 'attackGround': updAttackGround(u); break;
      case 'follow': updFollow(u); break;
      case 'building': return;
      default: updIdle(u);
    }
    if (!u.hidden) moveStep(u, dt);
  }
  // Warcraft II target domains: land, sea, air. Coastal buildings (shipyard, foundry, refinery, platform) count as land and sea.
  // gold mines (Warcraft II): neutral, 25,500 HP, armor 20; attacked only on an explicit Attack order
  const isMine = (t) => !!t && t.kind === 'res' && t.type === 'gold';
  function canHit(att, t) {
    const a = att.kind === 'unit' ? UNIT_DEFS[att.type] : BLD_DEFS[att.type];
    if (isMine(t)) return !!a.land;
    if (t.kind === 'building') return a.land || (a.sea && !!BLD_DEFS[t.type].seaTarget);
    const d = dom(t);
    return d === 'air' ? a.air : d === 'water' ? a.sea : a.land;
  }
  function validTarget(u, t) { return t && !t.dead && (t.kind !== 'res' || isMine(t)) && t.owner !== u.owner && !t.hidden && canHit(u, t) && seenBy(u.owner, t); }
  // auto-acquire skips neutral critters; they are attacked only when ordered

  function updMove(u) {
    if (u.path.length) return;
    if (atTile(u) && u.tx === u.goal.x && u.ty === u.goal.y) { if (u.order === 'move') setIdle(u); return true; }
    if (!tileFree(u.goal.x, u.goal.y, u)) {
      const g = nearestFree(u.dest.x, u.dest.y, u, u.tx, u.ty);
      if (!g) { setIdle(u); return true; }
      u.goal = g;
      if (u.tx === g.x && u.ty === g.y) return false;
    }
    ensurePath(u, pointGoal(u.goal));
    if (u.fail > 6) { if (u.order === 'move') setIdle(u); return true; }
    return false;
  }
  function updAttackMove(u) {
    if (u.targetId) {
      const t = G.ents.get(u.targetId);
      // (a building being knocked down is dropped for an enemy unit that comes into sight)
      const unitNear = validTarget(u, t) && t.kind === 'building' && u.scanT <= 0 && UNIT_DEFS[u.type].combat && ((u.scanT = 0.5), scanTarget(u, UNIT_DEFS[u.type].sight, false));
      if (unitNear) { u.targetId = unitNear.id; u.path = []; engage(u, unitNear, true); return; }
      if (validTarget(u, t)) { engage(u, t, true); return; }
      u.targetId = null; u.path = [];
    }
    if (u.scanT <= 0 && (UNIT_DEFS[u.type].combat || UNIT_DEFS[u.type].demolish)) {   // demolition units charge what they meet on patrol
      u.scanT = 0.5;
      const t = scanTarget(u, UNIT_DEFS[u.type].sight, true);
      if (t) { u.targetId = t.id; u.path = []; engage(u, t, true); return; }
    }
    if (updMove(u)) {
      if (u.order === 'patrol' && u.dest && u.origin) { const o = u.origin; u.origin = u.dest; u.dest = o; u.goal = nearestFree(o.x, o.y, u) || o; u.path = []; }
      else { u.order = 'idle'; u.goal = u.dest = null; }
    }
  }
  function updHold(u) {
    const t = G.ents.get(u.targetId);
    if (validTarget(u, t) && inRange(u, t)) { engage(u, t, false); return; }
    u.targetId = null; u.path = [];
    if (u.scanT <= 0) {
      u.scanT = 0.5;
      const c = scanTarget(u, UNIT_DEFS[u.type].range + 0.5, true);
      if (c && inRange(u, c)) u.targetId = c.id;
    }
  }
  function updIdle(u) {
    if (u.scanT > 0) return;
    u.scanT = 0.5;
    if (isNeutral(u)) {                                // critters amble about a few tiles at a time
      if (srand() < 0.12) { const g = nearestFree(u.tx + Math.round((srand() - 0.5) * 6), u.ty + Math.round((srand() - 0.5) * 6), u); if (g && (g.x !== u.tx || g.y !== u.ty)) setMove(u, g, g); }
      return;
    }
    if (!UNIT_DEFS[u.type].combat) return;
    const t = scanTarget(u, UNIT_DEFS[u.type].sight, true);   // Warcraft II: idle units also pick on buildings in reach
    if (t) autoAttack(u, t);
  }
  function scanTarget(u, radius, withBuildings) {
    let best = null, bd = 1e9;
    for (const e of G.units) {
      if (e.owner === u.owner || e.hidden || e.dead || isNeutral(e) || e.fx.unholy > 0 || !canHit(u, e) || !seenBy(u.owner, e) || (u.skip && u.skip.id === e.id && G.time < u.skip.until)) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < minRangeOf(u)) continue;                 // a catapult ignores what stands under its arm
      if (d <= radius && d < bd) { bd = d; best = e; }
    }
    if (best || !withBuildings) return best;
    for (const b of G.buildings) {
      if (b.owner === u.owner || b.dead || !canHit(u, b) || (u.owner !== 'player' && BLD_DEFS[b.type].wall) || (u.skip && u.skip.id === b.id && G.time < u.skip.until)) continue;
      const d = rectEuclid(u.tx, u.ty, b);
      if (d <= radius && d < bd) { bd = d; best = b; }
    }
    return best;
  }
  const minRangeOf = (u) => (UNIT_DEFS[u.type].minRange || 0);
  // research bonuses (data.js UPGRADES effect): the sum of every researched upgrade that names this unit's role
  function upBonus(owner, key, stat) {
    let v = 0;
    for (const id of G.players[owner].upgrades) { const e = UPGRADES[id] && UPGRADES[id].effect; if (e && e[stat] && e.units.includes(key)) v += e[stat]; }
    return v;
  }
  const rangeOf = (u) => UNIT_DEFS[u.type].range + upBonus(u.owner, UNIT_DEFS[u.type].key, 'range');
  const sightOf = (u) => UNIT_DEFS[u.type].sight + upBonus(u.owner, UNIT_DEFS[u.type].key, 'sight');
  const inRange = (u, t) => { const d = rectEuclid(u.tx, u.ty, t); return d <= rangeOf(u) + 0.5 && d >= minRangeOf(u); };
  function engage(u, t, canChase) {
    const d = UNIT_DEFS[u.type];
    if (d.dmg + d.pierce <= 0) { setIdle(u); return; }
    if (inRange(u, t)) {
      u.path = [];
      if (atTile(u) && u.cooldown <= 0 && !u.strike) {
        faceTowards(u, ex(t), ey(t));
        const dur = Math.min(0.6, d.cd);
        playAnim(u, window.ART.attackAnim(u.type), dur, false);
        u.strike = { t: STRIKE_DELAY, targetId: t.id };
        u.cooldown = d.cd * (u.fx.slow > 0 ? 2 : 1) / (u.fx.haste > 0 && d.domain === 'air' ? 2 : 1);   // Haste speeds attacks of flyers only
        u.fx.invis = 0;
      }
      return;
    }
    if (!canChase) return;
    // no way to reach it (walled off, across water): give it up, and do not pick it again for 10 s
    if (u.fail > 6) { u.skip = { id: t.id, until: G.time + 10 }; if (u.order === 'attack') setIdle(u); else { u.targetId = null; u.path = []; u.fail = 0; } return; }
    if (u.chaseT <= 0 || !u.path.length) {
      if (u.chaseT <= 0) { u.chaseT = 1; u.path = []; u.repathT = 0; }
      ensurePath(u, rangeGoal(t, rangeOf(u), minRangeOf(u)));
    }
  }
  // The strike lands STRIKE_DELAY after the swing starts: melee hits at once, ranged units loose a projectile.
  function deliverStrike(u, s) {
    const d = UNIT_DEFS[u.type];
    if (s.at) {                                        // Attack Ground: a shot at the tile, full damage there and the usual splash
      const full = Math.max(1, basicOf(u)) + pierceOf(u), dmg = Math.max(1, Math.round(full * (0.5 + 0.5 * srand())));
      if (u.owner === 'player') cueAt(HEAVY_SHOT.has(d.proj) ? 'siege' : 'shot', u);
      G.projectiles.push({ kind: d.proj || 'arrow', x: u.x, y: u.y, sx: u.x, sy: u.y, targetId: null, tx: s.at.x, ty: s.at.y, attId: u.id, owner: u.owner, dmg, splash: d.splash || { r: 0, f: 1 }, ground: true, spell: false, t: 0,
        ghost: { id: u.id, kind: 'unit', owner: u.owner, type: u.type } });
      return;
    }
    const t = G.ents.get(s.targetId);
    if (d.demolish) { if (validTarget(u, t)) detonate(u); return; }
    if (!validTarget(u, t) || rectEuclid(u.tx, u.ty, t) > rangeOf(u) + 1.5) return;
    if (d.range > 1 || d.proj) launch(u, t, d.proj || 'arrow', rollDamage(u, t), d.splash || null);
    else hit(u, t, rollDamage(u, t), 'melee');
  }
  function pierceOf(att) {
    const d = att.kind === 'unit' ? UNIT_DEFS[att.type] : BLD_DEFS[att.type];
    let p = d.pierce || 0;
    if (att.kind === 'unit') p += upBonus(att.owner, d.key, 'pierce');
    if (att.kind === 'unit' && att.fx.bloodlust > 0) p *= 2;
    return p;
  }
  function basicOf(att) {
    const d = att.kind === 'unit' ? UNIT_DEFS[att.type] : BLD_DEFS[att.type];
    let b = d.dmg || 0;
    if (att.kind === 'unit' && att.fx.bloodlust > 0) b *= 2;
    return b;
  }
  function armorOf(t) {
    if (isMine(t)) return RULES.MINE_ARMOR;
    if (t.kind !== 'unit') return BLD_DEFS[t.type].armor;
    return UNIT_DEFS[t.type].armor + upBonus(t.owner, UNIT_DEFS[t.type].key, 'armor');
  }
  // Warcraft II (Wargus): max(basic - armor, 1) + piercing, then a roll between 50 and 100 percent, at least 1.
  function rollDamage(att, t) {
    const full = Math.max(1, basicOf(att) - armorOf(t)) + pierceOf(att);
    const roll = 0.5 + 0.5 * srand();
    return Math.max(1, Math.round(full * roll));
  }
  const maxDamage = (att) => basicOf(att) + pierceOf(att);
  function launch(att, t, kind, dmg, splash) {
    const x = ex(att), y = ey(att);
    if (att.owner === 'player' || t.owner === 'player') cueAt(HEAVY_SHOT.has(kind) ? 'siege' : 'shot', att);
    G.projectiles.push({ kind, x, y, sx: x, sy: y, targetId: t.id, tx: ex(t), ty: ey(t), attId: att.id, owner: att.owner, dmg, splash, spell: false, t: 0,
      ghost: { id: att.id, kind: att.kind, owner: att.owner, type: att.type } });   // stands in for a shooter that died in flight
  }
  function updateProjectiles(dt) {
    for (const p of G.projectiles) {
      const t = G.ents.get(p.targetId);
      if (t && !t.dead) { p.tx = ex(t); p.ty = ey(t); }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), step = PROJ_SPEED * dt;
      p.t += dt;
      const att = G.ents.get(p.attId) || p.ghost;
      if (p.spell === 'line') {                        // Fireball: burns every ground unit and building along its path (about 34 each), friends too
        const fx = Math.round(p.x), fy = Math.round(p.y);
        for (const e of G.units.concat(G.buildings)) {
          if (e.dead || e.hidden || e.id === p.attId || p.seen.includes(e.id) || (e.kind === 'unit' && dom(e) === 'air')) continue;
          if ((e.kind === 'unit' ? Math.hypot(e.x - p.x, e.y - p.y) : rectDist(fx, fy, e)) > 0.7) continue;
          p.seen.push(e.id); G.impacts.push({ kind: 'fireball', x: ex(e), y: ey(e), t: 0 }); hit(att, e, 20 + Math.floor(srand() * 29), 'spell');
        }
      }
      if (d <= step || p.t > 4) {
        p.x = p.tx; p.y = p.ty; p.dead = true;
        G.impacts.push({ kind: p.kind, x: p.tx, y: p.ty, t: 0 });
        if (HEAVY_SHOT.has(p.kind) && (p.owner === 'player' || (t && t.owner === 'player'))) cueAt('explosion', { kind: 'unit', x: p.tx, y: p.ty });
        if (t && !t.dead && !t.hidden) {
          const before = t.hp; hit(att, t, p.dmg, p.spell ? 'spell' : 'ranged');
          if (p.spell === 'drain' && att.hp !== undefined && !att.dead) att.hp = Math.min(att.maxHp, att.hp + Math.max(0, before - Math.max(0, t.hp)));   // Death Coil heals the caster
        }
        // Warcraft II splash: everything the shooter could target within r tiles of the impact, friends included (not the
        // shooter itself), takes damage / (distance x factor); distance counts tiles, so the neighbours get 1/factor
        if (p.splash) {
          const ix = Math.round(p.tx), iy = Math.round(p.ty), near = (e) => (e.kind === 'unit' ? Math.max(Math.abs(e.tx - ix), Math.abs(e.ty - iy)) : rectDist(ix, iy, e));
          for (const e of G.units.concat(G.buildings)) {
            if (e.dead || e.hidden || e === t || e.id === p.attId || !canHit(att, e)) continue;
            const dd = near(e); if ((dd < 1 && !p.ground) || dd > p.splash.r) continue;
            hit(att, e, Math.max(1, Math.floor(p.dmg / (dd < 1 ? 1 : dd * p.splash.f))), 'ranged');
          }
        }
      } else { p.x += dx / d * step; p.y += dy / d * step; }
    }
    G.projectiles = G.projectiles.filter((p) => !p.dead);
    for (const i of G.impacts) i.t += dt;
    G.impacts = G.impacts.filter((i) => i.t < 0.4);
  }
  // Dwarven Demolition Squad / Goblin Sappers: the unit blows itself up for 400 damage to everything within
  // r tiles, friends included, and clears trees and rock there (Wargus spell-suicide-bomber; radius tunable, spec §2.3)
  function detonate(u) {
    const dm = UNIT_DEFS[u.type].demolish, x0 = u.tx, y0 = u.ty;
    kill(u, null, true);
    for (let k = 0; k < 6; k++) G.impacts.push({ kind: 'boom', x: x0 + (srand() - 0.5) * dm.r * 2, y: y0 + (srand() - 0.5) * dm.r * 2, t: 0 });
    cueAt('explosion', { kind: 'unit', x: x0, y: y0 });
    const ghost = { id: u.id, kind: 'unit', owner: u.owner, type: u.type };
    for (const e of G.units.concat(G.buildings)) {
      if (e.dead || e.hidden) continue;
      if ((e.kind === 'unit' ? Math.max(Math.abs(e.tx - x0), Math.abs(e.ty - y0)) : rectDist(x0, y0, e)) <= dm.r) hit(ghost, e, dm.dmg, 'spell');
    }
    for (let y = y0 - dm.r; y <= y0 + dm.r; y++) for (let x = x0 - dm.r; x <= x0 + dm.r; x++) {
      if (!inb(x, y)) continue;
      const tr = G.trees.get(idx(x, y)); if (tr) removeResource(tr);
      else if (G.terrain[idx(x, y)] === ROCK) { G.terrain[idx(x, y)] = GRASS; ui.terrainDirty = true; }
    }
  }
  function updAttackGround(u) {
    const d = UNIT_DEFS[u.type], at = u.castAt, range = d.demolish ? 1 : rangeOf(u), minR = d.demolish ? 0 : minRangeOf(u);
    const dist = Math.hypot(at.x - u.tx, at.y - u.ty);
    if (dist <= range + 0.5 && dist >= minR) {
      u.path = [];
      if (!atTile(u)) return;
      if (d.demolish) { detonate(u); return; }
      if (u.cooldown <= 0 && !u.strike) {
        faceTowards(u, at.x, at.y); playAnim(u, window.ART.attackAnim(u.type), Math.min(0.6, d.cd), false);
        u.strike = { t: STRIKE_DELAY, at }; u.cooldown = d.cd * (u.fx.slow > 0 ? 2 : 1);
      }
      return;
    }
    ensurePath(u, { test: (x, y) => { const e = Math.hypot(at.x - x, at.y - y); return e <= range + 0.5 && e >= minR; }, hx: at.x, hy: at.y });
    if (u.fail > 6) setIdle(u);
  }
  function updFollow(u) {
    const t = G.ents.get(u.targetId);
    if (!t || t.dead || t.aboard) { setIdle(u); return; }
    if (t.hidden) return;
    if (rectDist(u.tx, u.ty, t) <= 1) { u.path = []; return; }
    if (u.chaseT <= 0) { u.chaseT = 0.8; u.path = []; u.repathT = 0; }
    ensurePath(u, adjGoal(t));
  }
  function offScreen(e) {
    const px = (ex(e) + 0.5) * TILE, py = (ey(e) + 0.5) * TILE;
    return px < ui.camX || py < ui.camY || px > ui.camX + ui.vw / ui.zoom || py > ui.camY + ui.vh / ui.zoom;
  }
  function hit(att, t, dmg, kind) {
    if (t.dead) return;
    if (t.kind === 'res') {                                  // a gold mine: when it falls, the workers inside die with it
      if (!isMine(t)) return;
      t.hp -= dmg;
      if (t.hp <= 0) { for (const w of G.units.slice()) if (w.hidden && w.gatherId === t.id && w.phase === 'mining') kill(w, att, true); removeResource(t); if (G.vis[idx(t.tx, t.ty)] === 2) cueAt('razed', t); }
      return;
    }
    if (t.kind === 'unit' && t.fx.unholy > 0) return;        // Unholy Armor: invulnerable
    if (G.cheats && G.cheats.god) {                           // "it is a good day to die": only Whirlwind, Blizzard, Death and Decay hurt you
      if (t.owner === 'player' && att.owner !== 'player' && kind !== 'area') return;
      if (att.owner === 'player' && t.owner !== 'player') dmg *= 2;
    }
    t.hp -= dmg;
    if (t.kind === 'building' && t.done && t.hp / t.maxHp < 0.75) t.fireT = 0.001;
    if ((t.owner === 'player' || att.owner === 'player') && !offScreen(t)) sfx(kind === 'melee' ? 'clank' : kind === 'spell' || kind === 'area' ? 'spell' : 'arrow'); // throttled per clip inside sfx
    if (t.owner === 'player' && att.owner !== 'player') music.battleT = G.time;
    if (t.owner === 'player' && offScreen(t) && G.time - ui.lastAlert > 8) {
      ui.lastAlert = G.time; ui.alertAt = { x: ex(t), y: ey(t) }; notice(t.kind === 'building' ? 'Your base is under attack!' : 'Your forces are under attack!'); sfx('alarm');
    }
    if (t.hp <= 0) { kill(t, att); return; }
    if (t.kind === 'building') t.hitT = G.time;
    // the alarm feeds the strike-back reflex (and an agent's underAttack): the computer's side, a side on autopilot,
    // and the side an agent plays
    if (t.owner === 'enemy' || (t.owner === 'player' && G.autoPlayer) || (G.agent && t.owner === G.agent.side)) {
      const A = aiOf(t.owner), home = nearHall(t.owner, ex(t), ey(t), 18);    // (a hit out in the field does not mask a recent one at home)
      if (home || !(A.alarm && A.alarm.home && G.time - A.alarm.t < 10)) A.alarm = { t: G.time, id: att.id, x: ex(t), y: ey(t), home };
    }
    // (towers too: an idle unit shot by a tower goes for it instead of dying in place; a worker runs from it)
    if (t.kind === 'unit' && t.order === 'idle' && !t.hidden && UNIT_DEFS[t.type].combat && !UNIT_DEFS[t.type].coward && !att.dead && canHit(t, att)) autoAttack(t, att);
    else if (t.kind === 'unit' && !t.hidden && UNIT_DEFS[t.type].coward && !att.dead && (t.order === 'idle' || t.order === 'gather')) flee(t, att);
    // a unit busy knocking down a building turns on the enemy unit hitting it (and goes back to its march afterwards);
    // an explicit order to attack a building from the human player is kept
    else if (t.kind === 'unit' && !t.hidden && att.kind === 'unit' && !att.dead && UNIT_DEFS[t.type].combat && canHit(t, att)) {
      const cur = G.ents.get(t.targetId), onBld = !cur || cur.kind === 'building';
      if (onBld && (t.order === 'attackMove' || t.order === 'patrol')) { t.targetId = att.id; t.path = []; }
      else if (onBld && t.order === 'attack' && (t.owner !== 'player' || G.autoPlayer || (G.agent && G.agent.side === 'player'))) autoAttack(t, att);
    }
  }
  // Warcraft II: a worker's (or caster's) default reaction to being attacked is to run; a harvester returns to its
  // work a few seconds later
  // within r tiles of one of the side's finished halls (the home base or an expansion)
  const nearHall = (O, x, y, r) => G.buildings.some((b) => b.owner === O && b.done && BLD_DEFS[b.type].provides.includes('hall') && Math.hypot(cx(b) - x, cy(b) - y) < r);
  function flee(u, att) {
    const dx = u.x - ex(att), dy = u.y - ey(att), L = Math.hypot(dx, dy) || 1;
    const p = nearestFree(Math.round(u.x + dx / L * 5), Math.round(u.y + dy / L * 5), u, undefined, undefined, null, null, dom(u));
    if (!p) return;
    const back = u.order === 'gather' && u.gatherId ? { targetId: u.gatherId, at: G.time + 6 } : null;
    issueCommand({ action: 'move', unitIds: [u.id], x: p.x, y: p.y }, u.owner);
    u.resume = back;
  }
  // noCorpse: the unit vanishes (Polymorph, an expiring Eye of Kilrogg)
  function kill(e, att, noCorpse) {
    e.dead = true; e.hp = 0;
    G.ents.delete(e.id);
    if (att && att.owner && att.owner !== e.owner) { const S = G.stats[att.owner]; S[e.kind === 'unit' ? 'kills' : 'razed']++; S.score += (e.kind === 'unit' ? UNIT_DEFS[e.type] : BLD_DEFS[e.type]).points || 0; }
    G.stats[e.owner].lost++;
    if (e.kind === 'unit') {
      G.units.splice(G.units.indexOf(e), 1);
      const gr = grid(e);
      if (!e.hidden && gr[idx(e.tx, e.ty)] === e) gr[idx(e.tx, e.ty)] = null;
      for (const id of e.cargo || []) { const c = G.ents.get(id); if (c) kill(c, att); }
      if (!e.hidden && !noCorpse) G.corpses.push({ type: e.type, race: raceOf(e.owner), owner: e.owner, x: e.x, y: e.y, dir: e.dir, angle: e.angle, air: dom(e) === 'air', ship: dom(e) === 'water', t: 0 });
      if (!e.hidden && (e.owner === 'player' || G.vis[idx(e.tx, e.ty)] === 2)) cueAt('death', e);
    } else {
      G.buildings.splice(G.buildings.indexOf(e), 1);
      setFootprint(e, null);
      if (BLD_DEFS[e.type].wall) for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {   // the sections next to it are damaged too
        const o = inb(e.tx + dx, e.ty + dy) && G.bgrid[idx(e.tx + dx, e.ty + dy)];
        if (o && o.kind === 'building' && !o.dead && BLD_DEFS[o.type].wall) hit(att || { id: null, kind: 'unit', owner: null, type: null }, o, 20, 'area');
      }
      G.rubble.push({ x: cx(e), y: cy(e), size: e.size, t: 0 });
      if (e.owner === 'player' || footVisible(e)) cueAt('razed', e);
      const bu = e.builderId && G.ents.get(e.builderId);
      if (bu && bu.order === 'building') { popOut(bu, e); bu.order = 'idle'; }
      for (const w of G.units.slice()) if (w.hidden && w.phase === 'unloading' && w.depotId === e.id) kill(w, att, true);   // Warcraft II: whoever is inside dies too
    }
    G.selection = G.selection.filter((id) => id !== e.id);
  }

  // ---------------------------------------------------------------- spells (Warcraft II, docs/spec/upgrades_spells.md §2)
  // Unit effects live in u.fx as seconds left: slow, haste, bloodlust, invis, unholy, flame. Point spells (Fireball, Runes,
  // Whirlwind, Blizzard, Death and Decay, Raise Dead, Holy Vision, Eye of Kilrogg) aim at u.castAt; the area ones repeat a
  // wave while the caster has mana and no new order (repeat-cast).
  const FX = ['slow', 'haste', 'bloodlust', 'invis', 'unholy', 'flame'];
  const WAVE_TIME = 1.2;                               // seconds between Blizzard / Death and Decay / Raise Dead waves
  const organic = (e) => e.kind === 'unit' && !!UNIT_DEFS[e.type].organic;
  const undead = (e) => e.kind === 'unit' && !!UNIT_DEFS[e.type].undead;
  function spellKnown(owner, s) {
    const sp = SPELLS[s], race = raceOf(owner);
    if (!sp) return false;
    if (sp.known) return true;
    return G.players[owner].upgrades.some((id) => { const u = UPGRADES[id]; return u.spell === s || (u.grants && (u.grants[race] || []).includes(s)); });
  }
  const spellCost = (sp) => sp.mana || sp.perWave || 0;
  // Is t a legal target of spell s for the caster's owner? Returns null or the refusal text.
  function spellTargetWhy(owner, s, t) {
    const sp = SPELLS[s];
    if (!t || t.dead || t.kind !== 'unit') return sp.label + ': click a unit';
    if (sp.who === 'ally' && t.owner !== owner) return sp.label + ': click one of your own units';
    if (sp.who === 'enemy' && t.owner === owner) return sp.label + ': click an enemy unit';
    if (sp.organic && !organic(t)) return sp.label + ' works only on living units, not on ships or machines';
    if (sp.undeadOnly && !undead(t)) return 'Exorcism works only on the undead (Death Knights and Skeletons)';
    if (sp.groundOnly && dom(t) === 'air') return sp.label + ' cannot be cast on flying units';
    if (s === 'healing' && t.hp >= t.maxHp) return 'That unit is not wounded';
    if (['bloodlust', 'slow', 'haste', 'invisibility', 'unholy_armor'].includes(s)) {
      const k = { bloodlust: 'bloodlust', slow: 'slow', haste: 'haste', invisibility: 'invis', unholy_armor: 'unholy' }[s];
      if (t.fx && t.fx[k] > 0) return 'That unit is already under ' + sp.label;
    }
    return null;
  }
  function updCast(u, dt) {
    const sp = SPELLS[u.spell];
    if (!sp) { setIdle(u); return; }
    const t = sp.target === 'unit' ? G.ents.get(u.targetId) : null;
    if (sp.target === 'unit' && (!t || t.dead || t.hidden)) { setIdle(u); return; }
    const at = t ? { x: ex(t), y: ey(t) } : u.castAt;
    const dist = t ? rectEuclid(u.tx, u.ty, t) : Math.hypot(at.x - u.tx, at.y - u.ty);
    if (dist <= sp.range + 0.5) {
      u.path = [];
      if (!atTile(u) || u.castCd > 0) return;
      if (u.mana < (sp.perHp ? sp.perHp : spellCost(sp))) { if (u.owner === 'player' && !u.channel) toast('Not enough mana for ' + sp.label); setIdle(u); return; }
      faceTowards(u, at.x, at.y);
      playAnim(u, 'spellcast', 0.7, false);
      if (u.fx) u.fx.invis = 0;
      const again = castNow(u, u.spell, t, at);
      if (again) { u.channel = true; u.castCd = WAVE_TIME; return; }
      u.order = 'idle'; u.targetId = null; u.spell = null; u.castAt = null; u.channel = false; return;
    }
    ensurePath(u, t ? rangeGoal(t, sp.range) : { test: (x, y) => Math.hypot(at.x - x, at.y - y) <= sp.range + 0.5, hx: at.x, hy: at.y });
    if (u.fail > 6) setIdle(u);
  }
  const spark = (kind, x, y) => G.impacts.push({ kind, x, y, t: 0 });
  // Performs one cast; returns true when a repeat-cast spell should go on with another wave.
  function castNow(u, s, t, at) {
    const sp = SPELLS[s], me = u.owner;
    const cue = (n) => { if (me === 'player' || (t && t.owner === 'player')) cueAt(n, u); };
    switch (s) {
      case 'healing': {
        const hp = Math.min(t.maxHp - t.hp, Math.floor(u.mana / sp.perHp));
        if (hp <= 0) return false;
        u.mana -= hp * sp.perHp; t.hp += hp; spark('heal', ex(t), ey(t)); cue('heal'); return false;
      }
      case 'exorcism': {
        const dmg = Math.min(Math.ceil(t.hp), Math.floor(u.mana / sp.perHp));
        u.mana -= dmg * sp.perHp; spark('exorcism', ex(t), ey(t)); cue('spell'); hit(u, t, dmg, 'spell'); return false;
      }
      case 'death_coil': u.mana -= sp.mana; cue('spell');
        G.projectiles.push({ kind: 'coil', x: u.x, y: u.y, sx: u.x, sy: u.y, targetId: t.id, tx: ex(t), ty: ey(t), attId: u.id, owner: me, dmg: sp.dmg, splash: null, spell: 'drain', t: 0, ghost: { id: u.id, kind: 'unit', owner: me, type: u.type } });
        return false;
      case 'fireball': {
        u.mana -= sp.mana; cue('fireball');
        const dx = at.x - u.x, dy = at.y - u.y, L = Math.hypot(dx, dy) || 1, k = sp.range / L;
        G.projectiles.push({ kind: 'fireball', x: u.x, y: u.y, sx: u.x, sy: u.y, targetId: null, tx: u.x + dx * k, ty: u.y + dy * k, attId: u.id, owner: me, dmg: sp.dmg, splash: null, spell: 'line', seen: [], t: 0, ghost: { id: u.id, kind: 'unit', owner: me, type: u.type } });
        return false;
      }
      case 'slow': case 'haste': case 'bloodlust': case 'invisibility': case 'unholy_armor': case 'flame_shield': {
        u.mana -= sp.mana; cue('spell');
        const k = { slow: 'slow', haste: 'haste', bloodlust: 'bloodlust', invisibility: 'invis', unholy_armor: 'unholy', flame_shield: 'flame' }[s];
        if (s === 'unholy_armor') { if (UNIT_DEFS[t.type].volatile) { kill(t, u); return false; } t.hp = Math.max(1, t.hp - Math.max(1, Math.floor(t.hp / 2))); }
        if (s === 'slow') t.fx.haste = 0; if (s === 'haste') t.fx.slow = 0;
        t.fx[k] = sp.dur; spark(s === 'bloodlust' ? 'buff' : 'spark', ex(t), ey(t)); return false;
      }
      case 'polymorph': {
        u.mana -= sp.mana; cue('spell');
        const x = t.tx, y = t.ty; spark('spark', x, y);
        kill(t, u, true);
        if (tileFree(x, y, null, null, 'ground')) addUnit('neutral', 'critter', x, y);
        return false;
      }
      case 'holy_vision': u.mana -= sp.mana; G.reveals.push({ x: at.x, y: at.y, r: sp.reveal, t: sp.dur, owner: me }); spark('spark', at.x, at.y); cue('spell'); updateFog(); return false;
      case 'eye_of_kilrogg': {
        const p = nearestFree(at.x, at.y, null, undefined, undefined, null, null, 'air'); if (!p) return false;
        u.mana -= sp.mana; const e = addUnit(me, 'eye', p.x, p.y); e.ttl = UNIT_DEFS.eye.ttl; cue('spell'); return false;
      }
      case 'runes': {
        let placed = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = Math.round(at.x) + dx, y = Math.round(at.y) + dy;
          if (!sPass(x, y) || G.runes.some((r) => r.x === x && r.y === y)) continue;
          G.runes.push({ x, y, owner: me, t: sp.dur, attId: u.id, type: u.type }); placed++;
        }
        u.mana -= Math.max(0, sp.mana - 40 * (5 - placed)); cue('spell'); return false;
      }
      case 'whirlwind': u.mana -= sp.mana; G.storms.push({ kind: 'whirlwind', x: at.x, y: at.y, gx: at.x, gy: at.y, t: sp.dur, next: 0, hitT: 0, owner: me, attId: u.id, type: u.type }); cue('spell'); return false;
      case 'blizzard': case 'death_and_decay': {
        u.mana -= sp.perWave; cue('spell');
        const cx0 = Math.round(at.x), cy0 = Math.round(at.y);
        for (let f = 0; f < 5; f++) {
          const x = cx0 + Math.floor(srand() * 5) - 2, y = cy0 + Math.floor(srand() * 5) - 2;
          for (let k = 0; k < 11; k++) G.shards.push({ kind: s === 'blizzard' ? 'ice' : 'rot', x, y, t: k * 0.09 + f * 0.05, owner: me, attId: u.id, type: u.type });
        }
        return u.mana >= sp.perWave;
      }
      case 'raise_dead': {
        const c = G.corpses.find((k) => !k.air && !k.ship && Math.abs(k.x - at.x) <= 1.5 && Math.abs(k.y - at.y) <= 1.5 && tileFree(Math.round(k.x), Math.round(k.y), null, null, 'ground'));
        if (!c) { if (me === 'player' && !u.channel) toast('Raise Dead: no corpse there'); return false; }
        u.mana -= sp.perWave; G.corpses.splice(G.corpses.indexOf(c), 1);
        addUnit(me, 'skeleton', Math.round(c.x), Math.round(c.y)); spark('rot', c.x, c.y); cue('spell');
        return u.mana >= sp.perWave;
      }
    }
    return false;
  }
  // Per-tick spell world: unit effect timers, flame shields, runes, whirlwinds, falling shards, holy vision, summoned lifetimes.
  function updateSpells(dt) {
    for (const u of G.units.slice()) {
      if (u.dead) continue;
      for (const k of FX) if (u.fx[k] > 0) u.fx[k] = Math.max(0, u.fx[k] - dt);
      if (u.fx.flame > 0) {                          // 5 flames, 1 damage each every 8 cycles, to units next to the target
        u.flameT = (u.flameT || 0) + dt;
        while (u.flameT >= 8 / 30) { u.flameT -= 8 / 30; for (const e of G.units.slice()) if (e !== u && !e.dead && !e.hidden && dom(e) !== 'air' && Math.max(Math.abs(e.tx - u.tx), Math.abs(e.ty - u.ty)) <= 1) hit(u, e, 5, 'spell'); }
      }
      if (u.ttl !== undefined && (u.ttl -= dt) <= 0) kill(u, null, true);
      const d = UNIT_DEFS[u.type];
      if (d.key === 'ranger' && u.hp < u.maxHp && upBonus(u.owner, 'ranger', 'regen')) u.hp = Math.min(u.maxHp, u.hp + upBonus(u.owner, 'ranger', 'regen') * dt);
    }
    for (const r of G.runes) {
      r.t -= dt;
      const v = G.ugrid[idx(r.x, r.y)];
      if (v && !v.dead && !v.hidden) { r.t = 0; spark('boom', r.x, r.y); cueAt('explosion', v); hit(G.ents.get(r.attId) || { id: r.attId, kind: 'unit', owner: r.owner, type: r.type }, v, 50, 'spell'); }
    }
    G.runes = G.runes.filter((r) => r.t > 0);
    for (const w of G.storms) {
      w.t -= dt; w.next -= dt; w.hitT += dt;
      if (w.next <= 0) { w.next = 100 / 30; w.gx = Math.max(0, Math.min(MW - 1, w.x + Math.floor(srand() * 5) - 2)); w.gy = Math.max(0, Math.min(MH - 1, w.y + Math.floor(srand() * 5) - 2)); }
      const dx = w.gx - w.x, dy = w.gy - w.y, dd = Math.hypot(dx, dy), st = 60 / TILE * dt;
      if (dd > st) { w.x += dx / dd * st; w.y += dy / dd * st; }
      const att = G.ents.get(w.attId) || { id: w.attId, kind: 'unit', owner: w.owner, type: w.type };
      while (w.hitT >= 0.1) {
        w.hitT -= 0.1;
        const ix = Math.round(w.x), iy = Math.round(w.y);
        for (const e of G.units.concat(G.buildings)) if (!e.dead && !e.hidden && (e.kind === 'unit' ? Math.max(Math.abs(e.tx - ix), Math.abs(e.ty - iy)) : rectDist(ix, iy, e)) <= 1) hit(att, e, 3, 'area');
      }
    }
    G.storms = G.storms.filter((w) => w.t > 0);
    for (const s of G.shards) {
      s.t -= dt; if (s.t > 0) continue;
      spark(s.kind, s.x, s.y);
      const att = G.ents.get(s.attId) || { id: s.attId, kind: 'unit', owner: s.owner, type: s.type };
      const dmg = Math.floor(srand() * 10);
      if (dmg && inb(s.x, s.y)) {
        const us = [G.ugrid[idx(s.x, s.y)], G.agrid[idx(s.x, s.y)], G.bgrid[idx(s.x, s.y)]];
        for (const e of us) if (e && e.kind !== 'res' && !e.dead && !e.hidden && e.id !== s.attId) hit(att, e, dmg, 'area');
      }
    }
    G.shards = G.shards.filter((s) => s.t > 0);
    for (const r of G.reveals) r.t -= dt;
    G.reveals = G.reveals.filter((r) => r.t > 0);
  }
  // Cloaked units (submarines, turtles, invisible units) are seen and targeted only by a side that detects them:
  // submarines by any detector (towers, flyers, submarines, the Eye) whose sight reaches them; invisible units by nobody.
  const cloaked = (u) => u.kind === 'unit' && ((u.fx && u.fx.invis > 0) || !!UNIT_DEFS[u.type].submerged);
  function updateDetection() {
    for (const side of ['player', 'enemy', 'neutral']) G.detect[side] = new Set();
    const subs = G.units.filter((u) => UNIT_DEFS[u.type].submerged && !(u.fx.invis > 0));
    if (!subs.length) return;
    for (const d of G.units.concat(G.buildings)) {
      const dd = d.kind === 'unit' ? UNIT_DEFS[d.type] : BLD_DEFS[d.type];
      if (!dd.detects || (d.kind === 'building' && !d.done) || d.hidden) continue;
      const r = d.kind === 'unit' ? sightOf(d) : dd.sight + d.size / 2;
      for (const s of subs) if (s.owner !== d.owner && Math.hypot(s.x - ex(d), s.y - ey(d)) <= r) G.detect[d.owner].add(s.id);
    }
  }
  const seenBy = (owner, t) => t.kind !== 'unit' || t.owner === owner || !cloaked(t) || G.detect[owner].has(t.id);

  // ---------------------------------------------------------------- economy
  function nearestPatch(list, x, y) {
    let best = null, bd = 1e9;
    for (const m of list) { const d = Math.hypot(cx(m) - x, cy(m) - y); if (m.amount > 0 && d < bd) { bd = d; best = m; } }
    return best;
  }
  function nearestTree(u) {
    const q = [idx(u.tx, u.ty)], vis = new Uint8Array(N); vis[q[0]] = 1;
    // a tree holds one load: one another worker is walking to or chopping is taken (two on one tree made the second
    // chop 42 s for nothing - most chops came back empty with many cutters)
    const taken = new Set();
    for (const o of G.units) if (o !== u && !o.dead && o.order === 'gather' && o.gatherType === 'tree' && (o.phase === 'toRes' || o.phase === 'chopping') && o.gatherId) taken.add(o.gatherId);
    let spare = null;
    for (let h = 0; h < q.length; h++) {
      const x = q[h] % MW, y = (q[h] / MW) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy; if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        const tr = G.trees.get(ni); if (tr) { if (!taken.has(tr.id)) return tr; if (!spare) spare = tr; }
        if (!vis[ni] && sPass(nx, ny) && !(dx && dy && (!sPass(x + dx, y) || !sPass(x, y + dy)))) { vis[ni] = 1; q.push(ni); }   // (no corner cutting, as findPath)
      }
    }
    return spare;                                      // (every reachable tree taken: share one rather than stand idle)
  }
  // the tree nearest a building: the search starts on the open tiles around it (from its centre, a hall's own tiles
  // walled the search in and no tree was ever found, so the mill never went by the woods)
  function treeNear(b) {
    let best = null, bd = 1e9;
    const o = [[Math.round(cx(b)), b.ty - 1], [Math.round(cx(b)), b.ty + b.size], [b.tx - 1, Math.round(cy(b))], [b.tx + b.size, Math.round(cy(b))]];
    for (const [x, y] of o) {
      if (!inb(x, y) || !sPass(x, y)) continue;
      const t = nearestTree({ tx: x, ty: y }); if (!t) continue;
      const d = Math.hypot(t.tx - cx(b), t.ty - cy(b)); if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  // depots (Warcraft II): gold and lumber go to a hall of any tier, lumber also to a Lumber Mill, oil to a Shipyard or Refinery
  function nearestDepot(u) {
    let best = null, bd = 1e9;
    for (const b of G.buildings) {
      if (b.owner !== u.owner || !b.done || !(BLD_DEFS[b.type].depot || []).includes(u.carryType)) continue;
      const d = rectDist(u.tx, u.ty, b); if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  const depotReach = () => 1;
  const hasDone = (owner, type) => G.buildings.some((b) => b.owner === owner && b.type === type && b.done);
  // a finished building of that generic role (a Castle also counts as a Keep and a hall)
  const hasRole = (owner, role) => G.buildings.some((b) => b.owner === owner && b.done && BLD_DEFS[b.type].provides.includes(role));
  const resKind = (t) => (t === 'tree' ? 'lumber' : t);
  // load per trip: 100 plus the best bonus the owner has anywhere (Keep +10 gold, Castle +20, Lumber Mill +25 lumber, Refinery +25 oil)
  function loadFor(owner, type) {
    const kind = resKind(type);
    let bonus = 0;
    for (const b of G.buildings) if (b.owner === owner && b.done) bonus = Math.max(bonus, (BLD_DEFS[b.type].bonus || {})[kind] || 0);
    return CARRY + bonus;
  }
  function removeResource(r) {
    G.ents.delete(r.id); r.dead = true;
    if (r.type === 'gold' || r.type === 'oil') {
      const list = r.type === 'gold' ? G.mines : G.oils;
      list.splice(list.indexOf(r), 1); setFootprint(r, null);
      if (r.type === 'oil') { const pl = G.buildings.find((b) => BLD_DEFS[b.type].onOil && b.tx === r.tx && b.ty === r.ty); if (pl) kill(pl, null, true); }
      for (const u of G.units) if (u.hidden && u.order === 'gather' && u.phase === 'mining' && u.gatherId === r.id) { popOut(u, r); u.phase = u.carrying ? 'toBase' : 'toRes'; }
    } else { G.trees.delete(idx(r.tx, r.ty)); G.terrain[idx(r.tx, r.ty)] = GRASS; G.stump[idx(r.tx, r.ty)] = 1; ui.terrainDirty = true; }
  }
  function updGather(u, dt) {
    if (u.phase === 'unloading') {                     // inside the depot (workers) or moored at it (tankers)
      u.timer -= dt; if (u.timer > 0) return;
      const dep = G.ents.get(u.depotId);
      if (u.hidden) popOut(u, dep || { tx: u.tx, ty: u.ty, size: 1 }, G.ents.get(u.gatherId));
      u.phase = 'toRes'; u.path = []; u.fail = 0; return;
    }
    if (u.phase === 'mining' || u.phase === 'chopping' || u.phase === 'pumping') {
      u.timer -= dt; if (u.timer > 0) return;
      const res = G.ents.get(u.gatherId);
      if (res && res.amount > 0) {
        const take = Math.min(loadFor(u.owner, res.type), res.amount); res.amount -= take;
        u.carrying = take; u.carryType = res.type === 'gold' ? 'gold' : res.type === 'oil' ? 'oil' : 'lumber';
      }
      if (u.phase === 'mining') popOut(u, res || { tx: u.tx - 1, ty: u.ty - 1, size: 3 });
      if (u.owner === 'player') cueAt(u.phase === 'chopping' ? 'chop' : 'mine', u);
      if (res && res.amount <= 0) removeResource(res);
      u.anim = null; u.phase = 'toBase'; u.path = []; return;
    }
    if (u.phase === 'toBase') {
      if (!u.carrying) { u.phase = 'toRes'; return; }
      const dep = nearestDepot(u); if (!dep) return;
      if (atTile(u) && rectDist(u.tx, u.ty, dep) <= depotReach(u, dep)) {
        G.players[u.owner][u.carryType] += u.carrying; G.stats[u.owner][u.carryType] += u.carrying;
        if (u.owner === 'player') cueAt(u.carryType === 'gold' ? 'gold' : 'lumber', u);
        u.carrying = 0; u.carryType = null; u.path = []; u.depotId = dep.id; u.phase = 'unloading';
        if (dom(u) === 'water') u.timer = OIL_DEPOT_TIME; else { u.timer = DEPOT_TIME; hideUnit(u); }
        return;
      }
      ensurePath(u, nearGoal(dep, depotReach(u, dep))); return;
    }
    let res = G.ents.get(u.gatherId);
    if (!res || res.dead || u.fail > 6) {
      res = u.gatherType === 'tree' ? nearestTree(u) : u.gatherType === 'oil' ? nearestPatch(G.oils, u.tx, u.ty) : nearestPatch(G.mines, u.tx, u.ty);
      u.fail = 0; u.path = [];
      if (!res) { if (u.owner === 'player') notice(u.gatherType === 'tree' ? 'No trees left to chop nearby' : u.gatherType === 'oil' ? 'No oil patch left' : 'No gold mine left: your ' + nameOf('player', u.type) + ' is idle'); setIdle(u); return; }
      u.gatherId = res.id;
    }
    if (atTile(u) && rectDist(u.tx, u.ty, res) <= 1) {
      u.path = [];
      if (res.type === 'gold') {
        hideUnit(u); u.phase = 'mining'; u.timer = MINE_TIME;
      } else if (res.type === 'oil') {
        if (pumpable(res, u.owner)) { u.phase = 'pumping'; u.timer = PUMP_TIME; }
        else { u.fail = 7; return; } // no platform yet: wait
      } else { u.phase = 'chopping'; u.timer = G.cheats && G.cheats.hatchet ? CHOP_TIME / 3 : CHOP_TIME; faceTowards(u, res.tx, res.ty); playAnim(u, 'slash', 0.75, true); }
      return;
    }
    ensurePath(u, adjGoal(res));
  }
  // oil is pumped only from a patch that carries a finished platform of the tanker's own side (Warcraft II)
  function pumpable(res, owner) { return G.buildings.some((b) => b.done && b.owner === owner && BLD_DEFS[b.type].onOil && b.tx === res.tx && b.ty === res.ty); }

  // ---------------------------------------------------------------- building, repair, cancel
  const footOf = (type, x, y) => { const s = BLD_DEFS[type].size; return { tx: Math.round(x - (s - 1) / 2), ty: Math.round(y - (s - 1) / 2), size: s, type }; };
  // tiles between two footprints, Stratagus style: 1 when they touch
  function rectGap(a, b) {
    const dx = Math.max(0, b.tx - (a.tx + a.size - 1), a.tx - (b.tx + b.size - 1)), dy = Math.max(0, b.ty - (a.ty + a.size - 1), a.ty - (b.ty + b.size - 1));
    return Math.max(dx, dy);
  }
  // Why a footprint is not a legal site for its building type, or null. Warcraft II rules: clear ground, a hall more than
  // 3 tiles from any gold mine, Shipyard/Foundry/Refinery touching the coast, Shipyard/Refinery more than 3 tiles from
  // oil, an Oil Platform exactly on a free oil patch.
  function siteWhy(f) {
    const d = f.type && BLD_DEFS[f.type];
    if (d && d.onOil) return onOilPatch(f) && !G.buildings.some((b) => b.tx === f.tx && b.ty === f.ty && BLD_DEFS[b.type].onOil) ? null : 'Must be built on a free oil patch';
    const what = blockerOf(f);
    if (what) return 'Cannot build there: ' + what + ' in the way';
    if (!d) return null;
    if (d.shore && !nearWater(f)) return 'Must be built on the coast, touching water';
    if (d.mineGap && G.mines.some((m) => rectGap(f, m) <= d.mineGap)) return 'Too close to a gold mine: a hall must stand more than ' + d.mineGap + ' tiles away';
    if (d.oilGap && G.oils.some((o) => rectGap(f, o) <= d.oilGap)) return 'Too close to an oil patch: keep more than ' + d.oilGap + ' tiles away';
    return null;
  }
  const canPlace = (f) => !siteWhy(f);
  const afford = (owner, cost) => G.players[owner].gold >= (cost.gold || 0) && G.players[owner].lumber >= (cost.lumber || 0) && G.players[owner].oil >= (cost.oil || 0);
  function pay(owner, cost, k) { k = k === undefined ? 1 : k; G.players[owner].gold -= (cost.gold || 0) * k; G.players[owner].lumber -= (cost.lumber || 0) * k; G.players[owner].oil -= (cost.oil || 0) * k; }
  function rejectReason(owner, f, d) {
    const site = siteWhy(f); if (site) return site;
    const req = missing(owner, d.requires); if (req) return req.m;
    const short = shortfall(owner, d.cost); if (short) return short.m;
    return null;
  }
  function blockerOf(f) { // what stops a footprint: the first blocked tile's content
    for (let y = f.ty; y < f.ty + f.size; y++) for (let x = f.tx; x < f.tx + f.size; x++) {
      if (!inb(x, y)) return 'the map edge';
      const b = G.bgrid[idx(x, y)];
      if (b) return b.kind === 'res' ? 'a ' + b.type + (b.type === 'oil' ? ' patch' : ' mine') : 'a building';
      const t = G.terrain[idx(x, y)];
      if (t !== GRASS) return t === WATER ? 'water' : t === FOREST ? 'trees' : 'rock';
    }
    return null;
  }
  // Why an action cannot happen right now: { s: a few words for the button, m: the full message }, or null when it can.
  // The command card greys buttons with these and the command handler toasts the same text, so a refusal always says what is missing.
  const nameOf = (owner, t) => RACES[raceOf(owner)].labels[t] || t;
  const roleName = (owner, role) => nameOf(owner, B(owner, role));
  // Warcraft II wording: "Not enough gold... mine more gold."
  const VERB = { gold: 'mine', lumber: 'chop', oil: 'drill' };
  // the cost of the buildings our builders are still walking to (paid on arrival)
  function committedCost(owner) {
    const c = { gold: 0, lumber: 0, oil: 0 };
    for (const u of G.units) if (u.owner === owner && u.order === 'build' && u.build) { const k = BLD_DEFS[u.build.type].cost || {}; for (const r in c) c[r] += k[r] || 0; }
    return c;
  }
  function shortfall(owner, cost) {
    const P = G.players[owner], miss = ['gold', 'lumber', 'oil'].filter((r) => (cost[r] || 0) > P[r]);
    if (!miss.length) return null;
    const n = miss.map((r) => Math.ceil(cost[r] - P[r]));
    return { s: 'need ' + miss.map((r, i) => n[i] + r[0]).join(' '), m: 'Not enough ' + miss.join(' and ') + '... ' + miss.map((r, i) => VERB[r] + ' ' + n[i] + ' more ' + r).join(', ') + '.' };
  }
  // req: generic building roles; needs: upgrade ids
  function missing(owner, req, needs) {
    const lack = (req || []).filter((k) => !hasRole(owner, k)).map((k) => roleName(owner, k));
    for (const id of needs || []) if (!G.players[owner].upgrades.includes(id)) lack.push(upLabel(id, raceOf(owner)));
    return lack.length ? { s: 'needs ' + lack.join(', '), m: 'Requires ' + lack.join(' and ') + ' (build or research it first)' } : null;
  }
  function busyWhy(owner, b) {
    if (!b.done) return { s: 'under construction', m: 'The ' + nameOf(owner, b.type) + ' is still being built' };
    if (b.training) return { s: 'busy', m: 'Busy training a ' + nameOf(owner, b.training.type) + ': wait or cancel it' };
    if (b.research) return { s: 'busy', m: 'Busy with ' + upLabel(b.research.upgrade, raceOf(owner)) + ': wait or cancel it' };
    return null;
  }
  function trainWhy(owner, b, type) {
    const d = UNIT_DEFS[type];
    const busy = busyWhy(owner, b); if (busy) return busy;
    const req = missing(owner, d.requires, d.requiresUpgrade ? [d.requiresUpgrade] : []); if (req) return req;
    const short = shortfall(owner, d.cost); if (short) return short;
    const f = food(owner); if (f.used + 1 > f.cap) return { s: 'no food', m: 'Not enough food... build more ' + roleName(owner, 'farm') + 's (' + f.used + '/' + f.cap + ')' };
    return null;
  }
  function researchWhy(owner, b, id) {
    const up = UPGRADES[id], info = upInfo(id, raceOf(owner));
    const busy = busyWhy(owner, b); if (busy) return busy;
    if (!up.becomes && G.players[owner].upgrades.includes(id)) return { s: 'done', m: upLabel(id, raceOf(owner)) + ' is already researched' };
    if (!up.becomes && G.buildings.some((o) => o.owner === owner && o.research && o.research.upgrade === id)) return { s: 'in progress', m: upLabel(id, raceOf(owner)) + ' is already being researched elsewhere' };
    const req = missing(owner, info.requires, info.needs); if (req) return req;
    return shortfall(owner, info.cost);
  }
  // Before a building is placed: prerequisites and cost (the spot itself is checked on the click).
  function buildWhy(owner, type) {
    const d = BLD_DEFS[type];
    return missing(owner, d.requires) || shortfall(owner, d.cost);
  }
  // a building trains a unit when it provides the unit's production role (Peasants come from a hall of any tier)
  // whether a building trains any unit (barracks, halls, shipyards...), per building type, memoised
  const trainsMemo = {};
  const trainsUnits = (b) => (b.type in trainsMemo ? trainsMemo[b.type] : (trainsMemo[b.type] = Object.keys(UNIT_DEFS).some((t) => UNIT_DEFS[t].cost && trainsAt(b, t))));
  const trainsAt = (b, type) => !!UNIT_DEFS[type].atRole && BLD_DEFS[b.type].provides.includes(UNIT_DEFS[type].atRole) && BLD_DEFS[b.type].race === UNIT_DEFS[type].race;
  function deny(owner, m) { if (owner === 'player') toast(m); return false; }
  // Train buttons follow the upgrade lines: after Ranger training the Barracks offers Rangers instead of Archers, after
  // the Paladin upgrade Paladins instead of Knights.
  function trainable(owner, type) {
    const d = UNIT_DEFS[type], ups = G.players[owner].upgrades;
    if (!d.at || !d.cost) return false;
    if (d.key === 'archer') return !ups.includes('ranger');
    if (d.key === 'knight') return !ups.includes('paladin');
    if (d.key === 'ranger') return ups.includes('ranger');
    if (d.key === 'paladin') return ups.includes('paladin');
    return true;
  }

  function updBuild(u) {
    const f = u.build, d = BLD_DEFS[f.type];
    if (atTile(u) && rectDist(u.tx, u.ty, f) <= 1) {
      const why = rejectReason(u.owner, f, d);
      if (why) { if (u.owner === 'player') toast(why); (G.buildFails = G.buildFails || []).push({ owner: u.owner, t: G.time, type: f.type, why: String(why) }); if (G.buildFails.length > 20) G.buildFails.shift(); setIdle(u); return; }
      pay(u.owner, d.cost);
      const b = addBuilding(u.owner, f.type, f.tx, f.ty, false);
      G.stats[u.owner].buildings++;
      if (dom(u) === 'water') {                        // the tanker builds the platform from the water, then hauls from it (Warcraft II)
        b.builderId = null; b.tankerId = u.id;
        const res = G.oils.find((o) => o.tx === f.tx && o.ty === f.ty); setIdle(u); if (res) { u.resume = res.id; }
        return;
      }
      b.builderId = u.id;
      hideUnit(u); u.path = []; u.order = 'building'; u.build = null;
      for (let y = f.ty; y < f.ty + f.size; y++) for (let x = f.tx; x < f.tx + f.size; x++) {
        const o = G.ugrid[idx(x, y)]; if (o) { G.ugrid[idx(x, y)] = null; const p = nearestFree(x, y, o); if (p) placeUnit(o, p); }
      }
      return;
    }
    ensurePath(u, adjGoal(f));
    // give up when the site cannot be reached (repeated path failures, or still walking after two minutes)
    if (u.fail > 8 || G.time - (u.buildT || G.time) > 120) { if (u.owner === 'player') toast('The ' + nameOf(u.owner, u.type) + ' cannot reach the building site'); setIdle(u); }
  }
  // Warcraft II repair: 4 hit points every 25 cycles, each step costing 1 gold and 1 lumber (and 1 oil for buildings that cost oil)
  function updRepair(u, dt) {
    const b = G.ents.get(u.targetId);
    // buildings, and (Wargus) ships: the worker stands on the shore next to the ship
    const ship = b && b.kind === 'unit' && dom(b) === 'water';
    if (!b || b.dead || (b.kind !== 'building' && !ship) || b.owner !== u.owner || (!ship && !b.done) || b.hp >= b.maxHp) { setIdle(u); return; }
    const bd = ship ? UNIT_DEFS[b.type] : BLD_DEFS[b.type];
    if (atTile(u) && rectDist(u.tx, u.ty, b) <= 1) {
      faceTowards(u, cx(b), cy(b));
      if (!u.anim) playAnim(u, 'slash', 0.75, true);
      u.timer = (u.timer || 0) + dt;
      while (u.timer >= RULES.REPAIR.every && b.hp < b.maxHp) {
        const step = Object.assign({}, RULES.REPAIR.cost, bd.cost && bd.cost.oil ? { oil: 1 } : {});
        if (!afford(u.owner, step)) { if (u.owner === 'player') toast(shortfall(u.owner, step).m); setIdle(u); return; }
        pay(u.owner, step); u.timer -= RULES.REPAIR.every;
        b.hp = Math.min(b.maxHp, b.hp + RULES.REPAIR.hp);
        if (b.hp / b.maxHp >= 0.75) b.fireT = 0;
      }
      return;
    }
    u.timer = 0;
    ensurePath(u, adjGoal(b));
    if (u.fail > 8) { if (u.owner === 'player') toast('The ' + nameOf(u.owner, u.type) + (ship ? ' cannot reach the shore next to the ship' : ' cannot reach the building to repair it')); setIdle(u); }
  }
  // Refunds (Warcraft II): training and research in full, a building under construction 75 percent
  function cancelJob(b) {
    const race = raceOf(b.owner);
    if (b.training) { pay(b.owner, UNIT_DEFS[b.training.type].cost, -1); b.training = null; return true; }
    if (b.research) { pay(b.owner, upInfo(b.research.upgrade, race).cost, -1); b.research = null; return true; }
    if (!b.done) {
      pay(b.owner, BLD_DEFS[b.type].cost, -RULES.CANCEL_REFUND);
      const bu = b.builderId && G.ents.get(b.builderId);
      b.dead = true; G.ents.delete(b.id); G.buildings.splice(G.buildings.indexOf(b), 1); setFootprint(b, null);
      if (bu && bu.order === 'building') { popOut(bu, b); bu.order = 'idle'; }
      G.selection = G.selection.filter((id) => id !== b.id);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- transports
  function updLoad(u) {
    const s = G.ents.get(u.targetId);
    if (!s || s.dead || s.owner !== u.owner || !UNIT_DEFS[s.type].capacity || s.cargo.length >= UNIT_DEFS[s.type].capacity) { if (u.owner === 'player' && s && !s.dead && UNIT_DEFS[s.type].capacity) toast('The transport is full'); setIdle(u); return; }
    if (atTile(u) && rectDist(u.tx, u.ty, s) <= 1) {
      hideUnit(u); u.aboard = s.id; s.cargo.push(u.id); u.order = 'aboard'; u.path = []; u.targetId = null;
      return;
    }
    ensurePath(u, adjGoal(s));
    if (u.fail > 8) setIdle(u);
  }
  function unloadAt(s) {
    let n = 0;
    for (const id of s.cargo.slice()) {
      const c = G.ents.get(id); if (!c) { s.cargo.splice(s.cargo.indexOf(id), 1); continue; }
      let best = null, bd = 1e9;
      for (const [dx, dy] of DIRS) { const x = s.tx + dx, y = s.ty + dy; if (tileFree(x, y, null, null, 'ground')) { const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = { x, y }; } } }
      if (!best) break;
      s.cargo.splice(s.cargo.indexOf(id), 1);
      c.aboard = null; c.hidden = false; c.order = 'idle';
      c.tx = c.x = best.x; c.ty = c.y = best.y; grid(c)[idx(best.x, best.y)] = c;
      n++;
    }
    return n;
  }
  // nearest free water tile to (x, y) that has a walkable ground neighbour
  function shoreNear(x, y, ship) {
    let best = null, bd = 1e9;
    for (let yy = 0; yy < MH; yy++) for (let xx = 0; xx < MW; xx++) {
      if (!tileFree(xx, yy, ship, null, 'water')) continue;
      if (!DIRS.some(([dx, dy]) => sPassD(xx + dx, yy + dy, 'ground'))) continue;
      const d = Math.hypot(xx - x, yy - y); if (d < bd) { bd = d; best = { x: xx, y: yy }; }
    }
    return best;
  }
  function updUnload(u) {
    if (!u.cargo.length) { setIdle(u); return; }
    if (u.dest && !(atTile(u) && Math.abs(u.tx - u.dest.x) <= 1 && Math.abs(u.ty - u.dest.y) <= 1)) {
      if (updMove(u) && u.order === 'unload') { u.dest = null; }
      return;
    }
    if (atTile(u)) { unloadAt(u); if (!u.cargo.length || u.fail++ > 20) setIdle(u); }
  }

  function updateBuilding(b, dt) {
    const d = BLD_DEFS[b.type];
    if (b.fireT > 0) b.fireT += dt;
    if (!b.done) {
      b.progress = Math.min(1, b.progress + dt * cheatRate() / d.time);
      if (b.owner === 'player' && b.builderId) { b.hammerT = (b.hammerT || 0) + dt; if (b.hammerT >= 0.9) { b.hammerT = 0; cueAt('hammer', b); } }
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.95 * dt / d.time);
      if (b.progress >= 1) {
        b.done = true; b.hp = b.maxHp;
        const bu = G.ents.get(b.builderId);
        if (bu && bu.order === 'building') {
          popOut(bu, b); bu.order = 'idle';
          const res = bu.resume && G.ents.get(bu.resume); bu.resume = null;
          if (res && !res.dead) setGather(bu, res);
        }
        const tk = b.tankerId && G.ents.get(b.tankerId);
        if (tk && tk.order === 'idle') { const res = tk.resume && G.ents.get(tk.resume); tk.resume = null; if (res && !res.dead) setGather(tk, res); }
        b.builderId = null; b.tankerId = null;
        if (b.owner === 'player') { sfx('done'); notice(nameOf('player', b.type) + ' complete'); }
      }
      return;
    }
    if (b.training) {
      const ud = UNIT_DEFS[b.training.type];
      b.training.progress = Math.min(1, b.training.progress + dt * cheatRate() / ud.time);
      if (b.training.progress >= 1) {
        const p = nearestFree(cx(b), cy(b), null, undefined, undefined, null, null, ud.domain);
        if (p) {
          const t = b.training.type, u = addUnit(b.owner, t, p.x, p.y); b.training = null; b.noRoom = false; G.stats[b.owner].units++;
          if (b.rally) issueCommand(Object.assign({ unitIds: [u.id] }, b.rally), b.owner);
          if (b.owner === 'player') { sfx('ready'); notice(nameOf('player', t) + ' ready'); }
        } else if (b.owner === 'player' && !b.noRoom) { b.noRoom = true; toast('No room around the ' + nameOf('player', b.type) + ' for the new unit: clear some space'); }
      }
    }
    if (b.research) {
      b.research.progress = Math.min(1, b.research.progress + dt * cheatRate() / upInfo(b.research.upgrade, raceOf(b.owner)).time);
      if (b.research.progress >= 1) {
        const id = b.research.upgrade, was = nameOf(b.owner, b.type); b.research = null; completeUpgrade(b, id);
        if (b.owner === 'player') { sfx('done'); notice(UPGRADES[id].becomes ? was + ' upgraded to ' + nameOf('player', b.type) : upLabel(id, raceOf(b.owner)) + ' complete'); }
      }
    }
    if (d.range) {
      b.cooldown -= dt;
      if (b.cooldown <= 0) {
        // Warcraft II tower priority (wiki: Guard Tower): the lowest tier in range wins, the nearest within a tier
        let best = null, bd = 1e9;
        const consider = (e, dd) => { if (dd > d.range + 0.5 || dd < (d.minRange || 0)) return; const k = towerTier(e) * 1000 + dd; if (k < bd) { bd = k; best = e; } };
        for (const e of G.units) {
          if (e.owner === b.owner || e.hidden || isNeutral(e) || e.fx.unholy > 0 || !canHit(b, e) || !seenBy(b.owner, e)) continue;
          consider(e, rectEuclid(e.tx, e.ty, b));
        }
        for (const e of G.buildings) if (e.owner !== b.owner && !isNeutral(e) && !e.dead && canHit(b, e)) consider(e, rectGap(b, e) + 1);
        if (best) { launch(b, best, d.proj, rollDamage(b, best), d.splash || null); b.cooldown = d.cd; }
      }
    }
  }
  const TOWER_TIER = { ballista: 1, caster: 1, transport: 1, gryphon: 2, destroyer: 2, paladin: 2, battleship: 3, knight: 3, footman: 4, sub: 4,
    ranger: 5, archer: 6, demo: 6, skeleton: 6, worker: 7, tanker: 7, flier: 8, eye: 15,
    scout: 6, castle: 8, cannon: 8, tower: 8, keep: 9, hall: 9, magetower: 9, barracks: 10, shipyard: 11, mill: 12, refinery: 12, farm: 13, platform: 13 };
  const towerTier = (e) => TOWER_TIER[keyOf(e)] || (e.kind === 'building' ? 14 : 7);
  function completeUpgrade(b, id) {
    const owner = b.owner, P = G.players[owner], up = UPGRADES[id];
    if (up.becomes) { // one building changes type in place: hall -> Keep -> Castle, Scout Tower -> Guard / Cannon Tower
      const to = B(owner, up.becomes), nd = BLD_DEFS[to];
      b.type = to; b.hp += nd.hp - b.maxHp; b.maxHp = nd.hp; b.cooldown = 0;
      return;
    }
    if (!P.upgrades.includes(id)) P.upgrades.push(id);
    if (up.convert) { // Warcraft II: existing Archers become Rangers, Knights become Paladins, keeping their wounds
      const from = T(owner, up.convert.from), to = T(owner, up.convert.to);
      for (const u of G.units) if (u.owner === owner && u.type === from) {
        const nd = UNIT_DEFS[to]; u.type = to; u.hp += nd.hp - u.maxHp; u.maxHp = nd.hp;
        if (nd.mana && !u.mana) u.mana = RULES.MANA_START;
      }
    }
  }
  // food: 4 per farm, 1 per hall, at most 200; summoned units and critters eat nothing
  function food(owner) {
    let cap = 0, used = 0;
    for (const b of G.buildings) if (b.owner === owner) { if (b.done) cap += BLD_DEFS[b.type].food || 0; if (b.training) used++; }
    for (const u of G.units) if (u.owner === owner && !UNIT_DEFS[u.type].noFood && !UNIT_DEFS[u.type].summoned) used++;
    return { used, cap: Math.min(cap, RULES.FOOD_CAP) };
  }

  // ---------------------------------------------------------------- command interface (mouse, AI and API share this)
  function ownUnits(ids, owner) {
    if (!Array.isArray(ids)) return [];
    return ids.map((id) => G.ents.get(id)).filter((u) => u && u.kind === 'unit' && u.owner === owner && !u.dead && u.order !== 'building' && !u.aboard);
  }
  const finite = (v) => typeof v === 'number' && isFinite(v);
  const canGather = (u, type) => (UNIT_DEFS[u.type].gathers || []).includes(type);
  function issueCommand(cmd, owner) {
    if (G && G.replay && !inStep) return false;                // watching a replay: the viewer gives no orders
    rec('cmd', [cmd, owner]);
    if (!G || G.winner || !cmd || typeof cmd !== 'object') return false;
    owner = owner || 'player';
    for (const id of Array.isArray(cmd.unitIds) ? cmd.unitIds : []) { const u = G.ents.get(id); if (u && u.owner === owner) u.resume = null; }   // a new order cancels a pending return to work
    switch (cmd.action) {
      case 'move': case 'attackMove': case 'patrol': {
        const us = ownUnits(cmd.unitIds, owner);
        if (!us.length) return deny(owner, 'Select your units first');
        if (!finite(cmd.x) || !finite(cmd.y)) return false;
        const dx = Math.round(cmd.x), dy = Math.round(cmd.y);
        if (!inb(dx, dy)) return deny(owner, 'That is off the map');
        const group = new Set(us), taken = new Set();
        us.sort((a, b) => Math.hypot(a.tx - dx, a.ty - dy) - Math.hypot(b.tx - dx, b.ty - dy));
        let any = false;
        for (const u of us) {
          const g = nearestFree(dx, dy, u, dx, dy, group, taken);
          if (!g) continue;
          any = true;
          taken.add(idx(g.x, g.y));
          const origin = { x: u.tx, y: u.ty };
          setMove(u, g, { x: dx, y: dy }, cmd.action === 'move' ? 'move' : cmd.action);
          if (cmd.action === 'patrol') u.origin = origin;
        }
        return any || deny(owner, 'Cannot move there: no reachable ground nearby');
      }
      case 'attack': {
        const t = G.ents.get(cmd.targetId);
        if (!t || t.hidden) return deny(owner, 'Choose a visible enemy to attack');
        if ((t.kind === 'res' && !isMine(t)) || t.owner === owner) return deny(owner, 'Attack an enemy unit or building');
        const mine = ownUnits(cmd.unitIds, owner), us = mine.filter((u) => UNIT_DEFS[u.type].dmg + UNIT_DEFS[u.type].pierce > 0 && canHit(u, t));
        if (!us.length) return deny(owner, !mine.some((u) => UNIT_DEFS[u.type].dmg + UNIT_DEFS[u.type].pierce > 0) ? 'These units cannot attack'
          : t.kind === 'unit' && dom(t) === 'air' ? 'Cannot attack flying units: use archers, towers or gryphons' : t.kind === 'unit' && dom(t) === 'water' ? 'Cannot reach ships: use archers, towers or ships' : 'These units cannot attack that target');
        us.forEach((u) => setAttack(u, t));
        return true;
      }
      case 'gather': {
        let res = cmd.targetId !== undefined && cmd.targetId !== null ? G.ents.get(cmd.targetId) : null;
        if (cmd.targetId != null && (!res || res.kind !== 'res')) return deny(owner, 'Right-click a gold mine, a tree or an oil patch to gather');
        const ws = ownUnits(cmd.unitIds, owner).filter((u) => (res ? canGather(u, res.type) : UNIT_DEFS[u.type].gathers));
        if (!ws.length) return deny(owner, res && res.type === 'oil' ? 'Only oil tankers can haul oil' : 'Only ' + nameOf(owner, T(owner, 'worker')) + 's can gather ' + (res ? (res.type === 'tree' ? 'lumber' : res.type) : 'resources'));
        for (const w of ws) {
          const r = res || (canGather(w, 'gold') ? nearestPatch(G.mines, w.tx, w.ty) : nearestPatch(G.oils, w.tx, w.ty));
          if (!r) return deny(owner, canGather(w, 'gold') ? 'No gold mine left to gather from' : 'No oil patch found');
          setGather(w, r);
        }
        return true;
      }
      case 'build': {
        const d = BLD_DEFS[cmd.type];
        if (!d || !d.cost || !finite(cmd.x) || !finite(cmd.y)) return false;
        if (d.upgradeOf) { if (owner === 'player') toast('Upgrade a ' + roleName(owner, d.upgradeOf) + ' instead'); return false; }
        if (B(owner, d.key) !== cmd.type) return false; // other race's building
        const w = ownUnits(cmd.unitIds, owner).find((u) => (d.onOil ? canGather(u, 'oil') : keyOf(u) === 'worker'));
        if (!w) return deny(owner, d.onOil ? 'Select an oil tanker to build an oil platform' : 'Select a ' + roleName(owner, 'worker') + ' to build');
        const f = footOf(cmd.type, cmd.x, cmd.y);
        const why = rejectReason(owner, f, d);
        if (why) { if (owner === 'player') toast(why); return false; }
        w.resume = w.order === 'gather' && w.gatherId ? w.gatherId : null;
        resetOrder(w); w.order = 'build'; w.build = f; w.buildT = G.time;
        return true;
      }
      case 'returnGoods': {                            // Warcraft II "Return with Goods": carry the load home, then go back to work
        const ws = ownUnits(cmd.unitIds, owner).filter((u) => u.carrying > 0);
        if (!ws.length) return deny(owner, 'Nothing to return: the selected units carry no goods');
        for (const w of ws) { const keep = w.gatherId, kind = w.gatherType; resetOrder(w); w.order = 'gather'; w.gatherId = keep; w.gatherType = kind || (w.carryType === 'lumber' ? 'tree' : w.carryType); w.phase = 'toBase'; }
        return true;
      }
      case 'repair': {
        const b = G.ents.get(cmd.targetId);
        const ship = b && b.kind === 'unit' && dom(b) === 'water';
        if (!b || (b.kind !== 'building' && !ship) || b.owner !== owner) return deny(owner, 'Choose one of your own buildings or ships to repair');
        if (!ship && !b.done) return deny(owner, 'Still under construction: it cannot be repaired yet');
        if (b.hp >= b.maxHp) return deny(owner, 'The ' + nameOf(owner, b.type) + ' is not damaged');
        const ws = ownUnits(cmd.unitIds, owner).filter((u) => keyOf(u) === 'worker');
        if (!ws.length) return deny(owner, 'Only ' + nameOf(owner, T(owner, 'worker')) + 's can repair');
        ws.forEach((w) => { resetOrder(w); w.order = 'repair'; w.targetId = b.id; w.timer = 0; });
        return true;
      }
      case 'train': {
        const b = G.ents.get(cmd.buildingId), d = UNIT_DEFS[cmd.type];
        if (!b || !d || b.kind !== 'building' || b.owner !== owner || !b.done || !trainsAt(b, cmd.type)) return false;
        if (RACES[raceOf(owner)].units[d.key] !== cmd.type) return false;
        if (!trainable(owner, cmd.type)) return deny(owner, d.key === 'archer' || d.key === 'knight' ? 'Your ' + nameOf(owner, cmd.type) + 's have been upgraded: train the new unit instead' : 'Requires ' + upLabel(d.requiresUpgrade || (d.key === 'ranger' ? 'ranger' : 'paladin'), raceOf(owner)));
        const why = trainWhy(owner, b, cmd.type); if (why) return deny(owner, why.m);
        pay(owner, d.cost); b.training = { type: cmd.type, progress: 0 };
        return true;
      }
      case 'research': {
        const b = G.ents.get(cmd.buildingId), up = UPGRADES[cmd.upgrade];
        if (!b || !up || b.kind !== 'building' || b.owner !== owner || !b.done || BLD_DEFS[b.type].key !== up.at || !upAvail(cmd.upgrade, raceOf(owner))) return false;
        const why = researchWhy(owner, b, cmd.upgrade); if (why) return deny(owner, why.m);
        pay(owner, upInfo(cmd.upgrade, raceOf(owner)).cost); b.research = { upgrade: cmd.upgrade, progress: 0 };
        return true;
      }
      case 'cancel': {
        const b = G.ents.get(cmd.buildingId);
        if (!b || b.kind !== 'building' || b.owner !== owner) return false;
        return cancelJob(b) || deny(owner, 'Nothing to cancel');
      }
      case 'cast': {
        const sp = SPELLS[cmd.spell];
        if (!sp) return false;
        const us = ownUnits(cmd.unitIds, owner).filter((u) => (UNIT_DEFS[u.type].spells || []).includes(cmd.spell));
        if (!us.length) return deny(owner, 'None of the selected units can cast ' + sp.label);
        if (!spellKnown(owner, cmd.spell)) return deny(owner, sp.label + ' has not been researched yet');
        let t = null, at = null;
        if (sp.target === 'unit') {
          t = cmd.targetId != null ? G.ents.get(cmd.targetId) : null;
          if (!t && finite(cmd.x) && finite(cmd.y)) t = pickEntity(cmd.x, cmd.y, null);
          if (t && t.kind === 'unit' && !seenBy(owner, t)) t = null;
          const why = spellTargetWhy(owner, cmd.spell, t); if (why) return deny(owner, why);
        } else {
          if (!finite(cmd.x) || !finite(cmd.y)) { const e = cmd.targetId != null && G.ents.get(cmd.targetId); if (!e) return false; at = { x: ex(e), y: ey(e) }; }
          else at = { x: Math.round(cmd.x), y: Math.round(cmd.y) };
          if (!inb(at.x, at.y)) return deny(owner, 'That is off the map');
        }
        const need = sp.perHp || spellCost(sp);
        const ready = us.filter((u) => u.mana >= need && u !== t);
        if (!ready.length) return deny(owner, us.length === 1 && us[0] === t ? sp.label + ' cannot target the caster' : 'Not enough mana: ' + sp.label + ' needs ' + need + ' (has ' + Math.floor(Math.max(...us.map((u) => u.mana))) + ')');
        const c = ready.sort((a, b) => (t ? rectEuclid(a.tx, a.ty, t) - rectEuclid(b.tx, b.ty, t) : Math.hypot(a.x - at.x, a.y - at.y) - Math.hypot(b.x - at.x, b.y - at.y)))[0];
        setCast(c, cmd.spell, t, at);
        return true;
      }
      case 'load': {
        const s = G.ents.get(cmd.targetId);
        if (!s || s.kind !== 'unit' || s.owner !== owner || !UNIT_DEFS[s.type].capacity) return deny(owner, 'Click one of your transports to board');
        if (s.cargo.length >= UNIT_DEFS[s.type].capacity) return deny(owner, 'The transport is full (' + s.cargo.length + '/' + UNIT_DEFS[s.type].capacity + ')');
        const us = ownUnits(cmd.unitIds, owner).filter((u) => dom(u) === 'ground' && u !== s);
        if (!us.length) return deny(owner, 'Only land units can board a transport');
        us.forEach((u) => { resetOrder(u); u.order = 'load'; u.targetId = s.id; u.boardedAt = { x: u.tx, y: u.ty }; });
        return true;
      }
      case 'unload': {
        const ships = ownUnits(cmd.unitIds, owner).filter((u) => UNIT_DEFS[u.type].capacity && u.cargo.length);
        if (!ships.length) return deny(owner, 'The transport is empty');
        for (const s of ships) {
          resetOrder(s); s.order = 'unload';
          if (finite(cmd.x) && finite(cmd.y)) { const g = shoreNear(Math.round(cmd.x), Math.round(cmd.y), s); if (g) { s.goal = g; s.dest = g; } }
        }
        return true;
      }
      case 'attackGround': {                           // Warcraft II: siege weapons and Battleships/Juggernaughts; demolition units walk there and blow up
        const us = ownUnits(cmd.unitIds, owner).filter((u) => UNIT_DEFS[u.type].groundAttack || UNIT_DEFS[u.type].demolish);
        if (!us.length) return deny(owner, 'Only siege weapons, battleships and demolition units can attack the ground');
        if (!finite(cmd.x) || !finite(cmd.y) || !inb(Math.round(cmd.x), Math.round(cmd.y))) return false;
        us.forEach((u) => { resetOrder(u); u.order = 'attackGround'; u.castAt = { x: Math.round(cmd.x), y: Math.round(cmd.y) }; });
        return true;
      }
      case 'follow': {
        const t = G.ents.get(cmd.targetId);
        if (!t || t.kind !== 'unit' || t.dead) return deny(owner, 'Follow: click a unit');
        const us = ownUnits(cmd.unitIds, owner).filter((u) => u !== t);
        if (!us.length) return deny(owner, 'Select units to follow with');
        us.forEach((u) => { resetOrder(u); u.order = 'follow'; u.targetId = t.id; });
        return true;
      }
      case 'stop': case 'hold': {
        const us = ownUnits(cmd.unitIds, owner); if (!us.length) return deny(owner, 'Select your units first');
        us.forEach((u) => { setIdle(u); if (cmd.action === 'hold') u.order = 'hold'; });
        return true;
      }
      default: return false;
    }
  }
  function pickEntity(wx, wy, owner) {
    let best = null, bd = 1.0;
    for (const u of G.units) { if ((owner && u.owner !== owner) || u.hidden) continue; const d = Math.hypot(u.x - wx, u.y - wy); if (d < bd) { bd = d; best = u; } }
    if (best) return best;
    const b = inb(Math.round(wx), Math.round(wy)) && G.bgrid[idx(Math.round(wx), Math.round(wy))];
    return b && b.kind === 'building' && (!owner || b.owner === owner) ? b : null;
  }

  // ---------------------------------------------------------------- fog of war (player's view)
  function updateFog() {
    const v = G.vis;
    if (G.reveal) { v.fill(2); return; }
    for (let i = 0; i < N; i++) if (v[i] === 2) v[i] = 1;
    const mark = (x, y, r) => {
      const R = Math.ceil(r);
      for (let yy = Math.floor(y) - R; yy <= Math.ceil(y) + R; yy++) for (let xx = Math.floor(x) - R; xx <= Math.ceil(x) + R; xx++)
        if (inb(xx, yy) && Math.hypot(xx - x, yy - y) <= r) v[idx(xx, yy)] = 2;
    };
    for (const u of G.units) if (u.owner === 'player' && !u.hidden) mark(u.x, u.y, sightOf(u));
    for (const r of G.reveals) if (r.owner === 'player') mark(r.x, r.y, r.r);   // Holy Vision
    for (const b of G.buildings) if (b.owner === 'player') {             // buildings see from their edges (Wargus), not their centre
      const r = b.done ? BLD_DEFS[b.type].sight : 2, R = Math.ceil(r);
      for (let yy = b.ty - R; yy < b.ty + b.size + R; yy++) for (let xx = b.tx - R; xx < b.tx + b.size + R; xx++) {
        if (!inb(xx, yy)) continue;
        const dx = Math.max(b.tx - xx, 0, xx - (b.tx + b.size - 1)), dy = Math.max(b.ty - yy, 0, yy - (b.ty + b.size - 1));
        if (Math.hypot(dx, dy) <= r + 0.5) v[idx(xx, yy)] = 2;
      }
    }
    for (const b of G.buildings) if (b.owner === 'enemy' && footVisible(b)) G.memory.set(b.id, { type: b.type, tx: b.tx, ty: b.ty, size: b.size, done: b.done, progress: b.progress, owner: 'enemy' });
    for (const [id, m] of G.memory) if (!G.ents.has(id) && footVisible(m)) G.memory.delete(id);
  }
  function footVisible(e) {
    for (let y = e.ty; y < e.ty + e.size; y++) for (let x = e.tx; x < e.tx + e.size; x++) if (G.vis[idx(x, y)] === 2) return true;
    return false;
  }
  function visibility(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (!inb(x, y)) return 'hidden';
    return ['hidden', 'explored', 'visible'][G.vis[idx(x, y)]];
  }

  // ---------------------------------------------------------------- enemy AI (race aware through T() and B())
  // The Wargus "land attack" script (docs/spec/mechanics.md §11.2), run as an ordered list of steps: workers, buildings,
  // research and attack waves that grow from 4 to 7 to 16 units (Wargus opens with a lone unit; ours never sends one
  // alone), then Keep, Castle, Paladins/Ogre-Magi, casters,
  // siege and flyers, ending in a loop of large mixed waves. Around the script the engine-level behaviour runs every
  // second: farms on demand, a 50/50 gold/lumber split, a home-defence force, help when hit, repair when safe, rebuilding
  // of lost buildings, oil when the tech needs it, and spell casting in battle. It does not cheat.
  const AI_SCRIPT = [
    { workers: 6 }, { need: 'barracks' }, { defend: { footman: 2 } }, { workers: 10 }, { wave: { footman: 4 } }, { workers: 14 }, { need: 'smith' },
    { need: 'mill' }, { research: ['weapons1', 'shields1'] }, { wave: { footman: 5, archer: 3 } }, { workers: 18 },
    // tier 2 early (as the Warcraft II AI does, about minute 7-8): knights/ogres and siege arrive by minute 12
    { upgrade: 'keep' }, { need: 'barracks', n: 2 }, { need: 'stables' }, { defend: { footman: 3, archer: 2 } },
    { wave: { footman: 6, archer: 5, knight: 2, ballista: 1 } }, { research: ['weapons2', 'shields2'] }, { need: 'scout' }, { workers: 22 }, { research: ['tower_guard', 'arrows1'] },
    { oil: true }, { fleet: { destroyer: 2 } }, { defend: { footman: 4, knight: 2 } }, { research: ['ranger', 'arrows2'] },
    { wave: { knight: 6, archer: 4, ballista: 1 } },
    { upgrade: 'castle' }, { workers: 28 }, { defend: { footman: 2, knight: 2, archer: 2 } }, { need: 'church' }, { research: ['paladin'] },
    { research: { human: ['healing'], orc: ['bloodlust'] } }, { need: 'magetower' }, { research: { human: ['slow', 'blizzard', 'polymorph'], orc: ['haste', 'death_and_decay', 'raise_dead'] } },
    { wave: { knight: 10, caster: 2 } }, { fleet: { destroyer: 3, battleship: 2 } }, { research: ['cannons1', 'hulls1'] }, { need: 'aviary' }, { research: ['siege1', 'longbow', 'scouting'] },
    { wave: { knight: 8, caster: 4, ballista: 2, archer: 4 } }, { wave: { gryphon: 3, knight: 6 } }, { research: ['siege2', 'exorcism', 'runes'] },
    { loop: true }, { wave: { archer: 8, knight: 14, ballista: 2, caster: 4 } }, { wave: { gryphon: 4 } },
  ];
  const AI_LOOP = AI_SCRIPT.findIndex((s) => s.loop) + 1;
  // the AI's state per side: the computer opponent's in G.ai; G.aiP when the player's side is on autopilot (tests)
  const foeOf = (O) => (O === 'enemy' ? 'player' : 'enemy');
  const aiOf = (O) => (O === 'enemy' ? G.ai : (G.aiP || (G.aiP = { step: 0, workers: 1, defend: {}, needs: {}, waves: [], alarm: null })));
  // econOnly: just the economy helpers (farms on demand, the gold/lumber split, idle workers, oil, repair) and the
  // marching of waves already sent; used for a side driven by an outside agent (the LLM player)
  function aiThink(O, econOnly) {
    const P = G.players[O], race = raceOf(O), ai = aiOf(O), F = foeOf(O);
    ai.step = ai.step || 0; ai.workers = ai.workers || 1; ai.defend = ai.defend || {}; ai.needs = ai.needs || {}; ai.waves = ai.waves || [];
    const cmd = (c) => issueCommand(c, O);
    const mine = G.units.filter((u) => u.owner === O && !u.aboard);
    const workers = mine.filter((u) => keyOf(u) === 'worker');
    const blds = G.buildings.filter((b) => b.owner === O);
    const halls = blds.filter((b) => BLD_DEFS[b.type].provides.includes('hall'));
    const base = halls.find((b) => b.done) || halls[0];
    const army = mine.filter((u) => UNIT_DEFS[u.type].combat || UNIT_DEFS[u.type].mana);
    if (!base) {
      // no hall left: rebuild one when the money is there; meanwhile idle workers cut lumber (a mill still takes it),
      // and the army hunts, unless an outside agent commands it
      if (workers.length && P.gold >= 1200 && P.lumber >= 800 && !workers.some((w) => w.order === 'build')) aiBuild(workers, workers[0], 'hall');
      for (const w of workers) if (w.order === 'idle' && !w.hidden && !w.scout) { const t = nearestTree(w); if (t) cmd({ action: 'gather', unitIds: [w.id], targetId: t.id }); }
      if (!econOnly) hunt(army);
      return;
    }
    const count = (role) => blds.filter((b) => BLD_DEFS[b.type].provides.includes(role)).length + workers.filter((w) => w.order === 'build' && BLD_DEFS[w.build.type].key === role).length;
    const placed = (role) => blds.filter((b) => BLD_DEFS[b.type].provides.includes(role)).length;
    // a building is paid for when its builder arrives: until then its price is kept back from everything else (troops,
    // workers, research), or the builder arrived to an empty bank and the order was dropped
    const pending = { gold: 0, lumber: 0, oil: 0 };
    for (const w of workers) if (w.order === 'build' && w.build) { const c = BLD_DEFS[w.build.type].cost || {}; pending.gold += c.gold || 0; pending.lumber += c.lumber || 0; pending.oil += c.oil || 0; }
    // (money kept back only blocks what a purchase actually uses: a lumber reserve does not stop a gold-only footman)
    const fits = (c, ...back) => ['gold', 'lumber', 'oil'].every((r) => !(c[r] > 0) || P[r] >= c[r] + back.reduce((a, b) => a + ((b && b[r]) || 0), 0));
    const affordAI = (c) => fits(c, pending);
    const f = food(O);
    // ---- economy: workers, farms, gathering
    // (the hall stops training workers while the script waits on it for a tier upgrade: it must be idle to start one)
    if (!econOnly && workers.length < ai.workers && !base.training && base.done && f.used < f.cap && !(ai.hallFor && workers.length >= 8) && affordAI(UNIT_DEFS[T(O, 'worker')].cost)) cmd({ action: 'train', buildingId: base.id, type: T(O, 'worker') });
    const pendingFarm = blds.some((b) => BLD_DEFS[b.type].key === 'farm' && !b.done) || workers.some((w) => w.order === 'build' && BLD_DEFS[w.build.type].key === 'farm');
    const trainers = blds.filter((b) => b.done && trainsUnits(b)).length;
    if (econOnly) {
      // (an agent's side: count the farms under way and start the next one early enough that 2-3 producers never
      // stall on food; the old one-at-a-time rule left it food-capped a quarter of the time)
      const farmsOn = blds.filter((b) => BLD_DEFS[b.type].key === 'farm' && !b.done).length + workers.filter((w) => w.order === 'build' && w.build && BLD_DEFS[w.build.type].key === 'farm').length;
      if (f.cap + 4 * farmsOn - f.used <= 2 + 2 * trainers && farmsOn < 2 && f.cap + 4 * farmsOn < RULES.FOOD_CAP) aiBuild(workers, base, 'farm');
    } else if (f.cap - f.used <= 1 + trainers && f.cap < RULES.FOOD_CAP && !pendingFarm) aiBuild(workers, base, 'farm');
    // gold / lumber split from the stock ratio: about 50/50 when stocks are even, up to 20/80 when lumber runs short;
    // every 4 s up to half the surplus switches over
    // (a worker marked to switch counts as already switched; it changes over once it has dropped its load)
    const goingTo = (w) => (w.order === 'gather' ? w.aiNext || w.gatherType : null);
    const gatherers = (k) => workers.filter((w) => goingTo(w) === k);
    let gold = gatherers('gold').length, wood = gatherers('tree').length;
    for (const w of workers) if (w.aiNext && (w.order !== 'gather' || w.gatherType === w.aiNext)) w.aiNext = null;
    for (const w of workers) if (w.aiNext && !w.hidden && !w.carrying) {
      const k = w.aiNext; w.aiNext = null;
      const t = k === 'tree' ? nearestTree(w) : nearestPatch(G.mines, w.x, w.y);
      if (t) cmd({ action: 'gather', unitIds: [w.id], targetId: t.id });
    }
    const ratio = (P.gold + 300) / (P.lumber + 300);
    // (a lumber trip takes about four times a gold trip: 42 s at the tree against 5 s in the mine)
    // (spending runs about 2 gold to 1 lumber, so even stocks still want most workers in the woods; the old 50/50 at
    // even stocks left every tier-2 item waiting on lumber with thousands of gold banked)
    const cfg = econOnly && G.agent && G.agent.cfg;
    const woodShare = cfg && cfg.woodPct !== null && cfg.woodPct !== undefined ? cfg.woodPct / 100 : ratio > 4 ? 0.75 : ratio > 2 ? 0.65 : ratio > 1 ? 0.56 : ratio > 0.5 ? 0.45 : ratio > 0.3 ? 0.3 : 0.15;   // (a big lumber pile late sends nearly everyone to gold)
    const wantWood = () => Math.round((gold + wood) * woodShare);
    // gold goes to mines with one of our halls beside them (the expansion once the home mine is gone), nearest first
    const served = G.mines.filter((m) => halls.some((h) => h.done && rectGap(h, m) <= 6));
    const mineFor = (w) => nearestPatch(served.length ? served : G.mines, w ? w.x : cx(base), w ? w.y : cy(base));
    // (an agent's side: an idle worker is not sent into raiders at the mine or the woods; it waits until they go)
    const raided = (x, y) => econOnly && G.units.some((e) => e.owner === foeOf(O) && !e.hidden && !e.dead && UNIT_DEFS[e.type].combat && Math.hypot(e.x - x, e.y - y) < 7);
    for (const w of workers) {
      if (w.order !== 'idle' || w.hidden || w.scout || w.evac) continue;      // (a scouting worker is on its way to its next stop; an evacuated one waits)
      if (wood >= wantWood() || gold === 0) { const m = mineFor(w); if (m && !raided(cx(m), cy(m))) { cmd({ action: 'gather', unitIds: [w.id], targetId: m.id }); gold++; continue; } }
      const t = nearestTree(w); if (t && !raided(t.tx, t.ty)) { cmd({ action: 'gather', unitIds: [w.id], targetId: t.id }); wood++; }
    }
    // (an agent's side with nobody mining and less gold than a worker costs: one cutter goes to gold, or the economy
    // locks up for good - two cutters and 85 gold sat for three minutes)
    if (econOnly && gold === 0 && wood > 0 && P.gold < UNIT_DEFS[RACES[raceOf(O)].units.worker].cost.gold) {
      const w = gatherers('tree').find((x) => !x.hidden && !x.aiNext); if (w) { if (w.carrying) w.aiNext = 'gold'; else { const m = mineFor(w); if (m) cmd({ action: 'gather', unitIds: [w.id], targetId: m.id }); } }
    }
    if (G.time >= (ai.rebalT || 0)) {
      ai.rebalT = G.time + 4;
      const over = wood - wantWood(), n = Math.max(1, Math.floor(Math.abs(over) / 2));
      const pick = (k) => gatherers(k).filter((w) => !w.aiNext).sort((a, b) => (a.hidden || a.carrying ? 1 : 0) - (b.hidden || b.carrying ? 1 : 0)).slice(0, n);
      ai.dbg = { gold, wood, share: woodShare, over, marked: workers.filter((w) => w.aiNext).map((w) => w.id + ':' + w.aiNext + ':' + (w.hidden ? 'h' : '') + (w.carrying ? 'c' : '') + ':' + w.phase) };
      const band = econOnly && gold + wood < 6 ? 1 : 2;     // (an agent's few workers: one move is allowed, or 2 cutters never switch)
      if (over >= band) for (const w of pick('tree')) { if (w.hidden || w.carrying) { w.aiNext = 'gold'; continue; } const m = mineFor(w); if (m && !raided(cx(m), cy(m))) cmd({ action: 'gather', unitIds: [w.id], targetId: m.id }); }
      else if (over <= -band) for (const w of pick('gold')) { if (w.hidden || w.carrying) { w.aiNext = 'tree'; continue; } const t = nearestTree(w); if (t && !raided(t.tx, t.ty)) cmd({ action: 'gather', unitIds: [w.id], targetId: t.id }); }
      // miners at a mine with no hall of ours beside it (theirs ran dry and they wandered) move to a served one
      if (served.length) for (const w of gatherers('gold')) { const m = G.ents.get(w.gatherId); if (m && !served.includes(m) && !w.hidden && !w.carrying) { const n = mineFor(w); if (n) cmd({ action: 'gather', unitIds: [w.id], targetId: n.id }); } }
    }
    // ---- oil: a shipyard by the nearest oil patch, two tankers and a platform
    if (ai.oil) aiOil(O, base, workers, blds);
    if (econOnly) {                                   // an agent's tankers pump the nearest platform of ours
      const plats = blds.filter((b) => BLD_DEFS[b.type].onOil && b.done);
      for (const t of mine.filter((u) => keyOf(u) === 'tanker' && u.order === 'idle')) { const pl = plats[0], res = pl && G.oils.find((o) => o.tx === pl.tx && o.ty === pl.ty); if (res) cmd({ action: 'gather', unitIds: [t.id], targetId: res.id }); }
      if (ai.alarm && G.time - ai.alarm.t < 6) {       // the same reflex as the native AI: idle troops at home strike back
        const a = G.ents.get(ai.alarm.id);
        if (a && !a.dead && nearHall(O, ex(a), ey(a), 22)) for (const u of army) if (!u.wave && u.order === 'idle' && canHit(u, a) && Math.hypot(u.x - ex(a), u.y - ey(a)) < 26) cmd({ action: 'attack', unitIds: [u.id], targetId: a.id });
      }
      // the agent's unit flags, tidied inside the simulation (so a replay does the same): a scout back from its trip,
      // a squad whose task went idle, and a wounded unit that got home are free again
      // (a scout walks on to its next stop; a squad whose raid is over walks home, it no longer idles by the enemy mine)
      const hallAt = base && { x: cx(base), y: cy(base) + 3 };
      for (const u of mine) {
        if (u.scout && u.order === 'idle') { const p = u.scoutPts && u.scoutPts.shift(); if (p) cmd({ action: 'move', unitIds: [u.id], x: p[0], y: p[1] }); else { u.scout = false; u.scoutPts = null; } }
        if (u.task && u.order === 'idle') { u.task = null; u.wave = null; if (hallAt && Math.hypot(u.x - hallAt.x, u.y - hallAt.y) > 12) cmd({ action: 'attackMove', unitIds: [u.id], x: hallAt.x, y: hallAt.y }); }
        if (u.pulled && u.order !== 'move') u.pulled = false;
        // an evacuated worker goes back once no enemy fighter is near it or the hall (or after 90 s)
        if (u.evac && (G.time - (u.evacT || 0) > 45 || !G.units.some((e) => e.owner === foeOf(O) && !e.hidden && !e.dead && UNIT_DEFS[e.type].combat && (Math.hypot(e.x - u.x, e.y - u.y) < 8 || (u.evacAt && Math.hypot(e.x - u.evacAt[0], e.y - u.evacAt[1]) < 7))))) u.evac = false;
        // a unit marching home (defend) turns to fight once it is close, or when its march ended
        if (u.homeRun && (u.order !== 'move' || (hallAt && Math.hypot(u.x - hallAt.x, u.y - hallAt.y) < 15))) {
          u.homeRun = false; if (u.task === 'home') u.task = null;
          const raid = baseRaiders(O); let r = null; for (const e of raid) if (!r || Math.hypot(e.x - u.x, e.y - u.y) < Math.hypot(r.x - u.x, r.y - u.y)) r = e;
          if (r) cmd({ action: 'attackMove', unitIds: [u.id], x: Math.round(r.x), y: Math.round(r.y) }); else if (hallAt) cmd({ action: 'attackMove', unitIds: [u.id], x: hallAt.x, y: hallAt.y });
        }
      }
      // the rally point: idle free units at home stand at the edge of the base facing the enemy's approach (the plan's
      // rally setting, 'front' by default), so a wave meets the army before it reaches the workers
      const cfgR = G.agent.cfg && G.agent.cfg.rally !== undefined ? G.agent.cfg.rally : 'front';
      if (base && cfgR !== 'off' && G.time >= (ai.rallyT || 0)) {
        ai.rallyT = G.time + 3;
        if (!ai.rallyC || G.time - ai.rallyC.t > 20) { const at = Array.isArray(cfgR) ? cfgR : (agentZones(O, base)[cfgR] || agentZones(O, base).front); ai.rallyC = { t: G.time, x: at[0], y: at[1] }; }
        const rp = ai.rallyC;
        if (!baseRaiders(O).length) {
          const go = army.filter((u) => dom(u) === 'ground' && !u.wave && !u.scout && !u.pulled && !u.homeRun && !u.task && u.order === 'idle' &&
            Math.hypot(u.x - rp.x, u.y - rp.y) > 4 && Math.hypot(u.x - cx(base), u.y - cy(base)) < 30);
          if (go.length) cmd({ action: 'attackMove', unitIds: go.map((u) => u.id), x: rp.x, y: rp.y });
        }
      }
      aiWaves(O, army, ai); aiRepair(O, workers, blds); aiCast(O, army);
      // repair under fire against a small attack (a whole wave would only kill the workers: that stays the agent's call)
      const rf = repairUnderFire(O, blds, workers, 5);
      if (rf) cmd({ action: 'repair', unitIds: rf.ws.map((w) => w.id), targetId: rf.b.id });
      return;
    }
    // ---- expansion: a new hall at the nearest untaken mine once the mines by our halls run low
    if (G.time >= (ai.expandT || 0)) { ai.expandT = G.time + 20; aiExpand(O, base, workers, halls); }
    // ---- the script (ai.reserve: what the current step is saving for; other spending leaves that much in the bank)
    ai.saving = false; ai.reserve = null; ai.reserveFor = null;
    const save = (cost) => { ai.saving = true; ai.reserve = cost; };
    for (let guard = 0; guard < 8; guard++) {
      if (ai.step >= AI_SCRIPT.length) ai.step = AI_LOOP;
      const s = AI_SCRIPT[ai.step];
      // a research, building or tier step that has not moved in three minutes (no money coming in, its oil dried up,
      // its building keeps being lost) is skipped, so the rest of the script (and the waves) still go on
      if (ai.stallStep !== ai.step) { ai.stallStep = ai.step; ai.stallT = G.time; }
      else if ((s.research || s.need || s.upgrade) && G.time - ai.stallT > 180) { if (s.upgrade) { ai.tierAsk = ai.tierAsk || s.upgrade; ai.hallFor = null; } ai.step++; continue; }
      if (s.loop) { ai.step++; continue; }
      if (s.workers) { ai.workers = Math.max(ai.workers, s.workers); ai.step++; continue; }
      if (s.defend) { ai.defend = s.defend; ai.step++; continue; }
      if (s.oil) { ai.oil = true; ai.step++; continue; }
      if (s.fleet) { ai.fleet = s.fleet; ai.step++; continue; }
      if (s.need) {
        ai.needs[s.need] = Math.max(ai.needs[s.need] || 0, s.n || 1);
        // (done once the building is placed: a builder still walking may yet be turned away)
        if (placed(s.need) >= (s.n || 1)) { ai.step++; continue; }
        if (count(s.need) >= (s.n || 1)) break;              // on its way: its price is kept back as pending
        // the building the script waits on is saved for, so farms and troops do not eat its lumber (placed below)
        const d = BLD_DEFS[B(O, s.need)];
        // (affordable too: while a worker is still putting up the previous building, troops would spend it meanwhile)
        if (!['shipyard', 'refinery', 'foundry'].includes(s.need) && !d.requires.some((k) => !hasRole(O, k))) { save(d.cost); ai.reserveFor = s.need; }
        // (a prerequisite still going up, a Keep for the Stables, does not count towards the three-minute stall)
        if (d.requires.some((k) => !hasRole(O, k) && (blds.some((b) => !b.done && BLD_DEFS[b.type].key === k) || halls.some((b) => b.research && UPGRADES[b.research.upgrade].becomes === k)))) ai.stallT = G.time;
        break;
      }
      if (s.upgrade) {
        if (hasRole(O, s.upgrade)) { ai.hallFor = null; ai.step++; continue; }
        ai.hallFor = s.upgrade;
        const req = BLD_DEFS[B(O, s.upgrade)].requires.filter((k) => !hasRole(O, k));
        for (const k of req) ai.needs[k] = Math.max(ai.needs[k] || 0, 1);
        const at = halls.find((b) => b.done && !b.research && !b.training && UPGRADES[s.upgrade].at === BLD_DEFS[b.type].key);
        if (at && !req.length && affordAI(upInfo(s.upgrade, race).cost)) cmd({ action: 'research', buildingId: at.id, upgrade: s.upgrade });
        else if (at && !req.length) save(upInfo(s.upgrade, race).cost);
        if (halls.some((b) => b.research && b.research.upgrade === s.upgrade)) { ai.hallFor = null; ai.step++; continue; }
        break;
      }
      if (s.research) {
        const ids = (Array.isArray(s.research) ? s.research : s.research[race]).filter((id) => upAvail(id, race));
        let left = 0;
        for (const id of ids) {
          if (P.upgrades.includes(id) || blds.some((b) => b.research && b.research.upgrade === id)) continue;
          const up = UPGRADES[id];
          if (up.becomes) { if (blds.some((b) => BLD_DEFS[b.type].key === up.becomes)) continue; }
          left++;
          ai.needs[up.at] = Math.max(ai.needs[up.at] || 0, 1);
          const at = blds.find((b) => b.done && !b.research && !b.training && BLD_DEFS[b.type].key === up.at);
          const busy = !at && blds.some((b) => b.done && BLD_DEFS[b.type].key === up.at && trainsUnits(b));
          if (at && !researchWhy(O, at, id) && affordAI(upInfo(id, race).cost)) cmd({ action: 'research', buildingId: at.id, upgrade: id });
          // not affordable, or its building is busy training: save for it, so the next unit does not take its place
          // (for 60 s at most: a 2400-gold upgrade must not keep the barracks idle for minutes)
          else if ((busy || (at && !afford(O, upInfo(id, race).cost))) && !ai.reserve && G.time - ai.stallT < 60) save(upInfo(id, race).cost);
        }
        if (!left || ids.every((id) => P.upgrades.includes(id) || blds.some((b) => b.research && b.research.upgrade === id) || (UPGRADES[id].becomes && blds.some((b) => BLD_DEFS[b.type].key === UPGRADES[id].becomes)))) { ai.step++; continue; }
        // none of the buildings for what is left stands after a minute (not affordable, lost, no site): move on
        // rather than wait the full three minutes (these steps come back round in the loop)
        const todo = ids.filter((id) => !P.upgrades.includes(id) && !blds.some((b) => b.research && b.research.upgrade === id));
        if (G.time - ai.stallT > 60 && todo.every((id) => !placed(UPGRADES[id].at))) { ai.step++; continue; }
        break;
      }
      if (s.wave) {
        const recipe = aiSubst(O, s.wave);
        ai.want = recipe;
        if (ai.waveStep !== ai.step) { ai.waveStep = ai.step; ai.waveT = G.time; }
        // (the home guard stays home: it is set aside before the wave is picked, as Wargus keeps force 0 apart)
        const all = army.filter((u) => !u.wave && dom(u) !== 'water');
        const keep = new Set(), gneed = Object.assign({}, ai.defend);
        for (const u of all) { const k = aiRole(u); if (gneed[k] > 0) { gneed[k]--; keep.add(u); } }
        const pool = all.filter((u) => !keep.has(u));
        let take = aiPick(pool, recipe, O);
        // the recipe cannot be met (a building lost, a unit type out of reach): after 90 s the wave leaves with what
        // is on hand, once that is at least 70% of its size, keeping the home guard back
        const size = Object.values(s.wave).reduce((a, n) => a + n, 0);
        if (!take && G.time - ai.waveT > 60) {
          const spare = pool.filter((u) => UNIT_DEFS[u.type].combat);      // (the guard is already out of the pool)
          if (spare.length >= Math.ceil(size * 0.7)) take = spare.slice(0, Math.max(size, spare.length));
        }
        if (take) { const id = ai.waveN = (ai.waveN || 0) + 1; take.forEach((u) => { u.wave = id; }); ai.waves.push(id); aiMuster(O, id, take, base); ai.want = null; ai.lastWaveT = G.time; ai.step++; continue; }
        break;
      }
      ai.step++;
    }
    // a tier upgrade the script had to skip (no money in time) is retried in the background until it is done
    if (ai.tierAsk && hasRole(O, ai.tierAsk)) ai.tierAsk = null;
    if (ai.tierAsk && !ai.hallFor && UPGRADES[ai.tierAsk]) {
      const req = BLD_DEFS[B(O, ai.tierAsk)].requires.filter((k) => !hasRole(O, k));
      for (const k of req) if (k !== 'keep' && k !== 'castle') ai.needs[k] = Math.max(ai.needs[k] || 0, 1);
      const at = halls.find((b) => b.done && !b.research && UPGRADES[ai.tierAsk].at === BLD_DEFS[b.type].key);
      if (at && !req.length) {
        const c = upInfo(ai.tierAsk, race).cost;
        if (!at.training && affordAI(c)) cmd({ action: 'research', buildingId: at.id, upgrade: ai.tierAsk });
        else if (!ai.reserve) { save(c); ai.reserveFor = ai.tierAsk; }
        if (halls.some((b) => b.research && b.research.upgrade === ai.tierAsk)) ai.tierAsk = null;
      }
    }
    // an army idling at home while the script waits (on money, lumber or tech) goes out anyway: no wave on the move,
    // two and a half minutes since the last one, and at least 8 units beyond the home guard
    const homeArmy = army.filter((u) => !u.wave && dom(u) === 'ground' && UNIT_DEFS[u.type].combat && keyOf(u) !== 'worker');
    const guardN = Object.values(ai.defend || {}).reduce((a, n) => a + n, 0);
    const landWave = ai.waves.some((id) => army.some((u) => u.wave === id && dom(u) !== 'water'));   // (a fleet at sea does not count)
    if (!landWave && homeArmy.length >= guardN + 8 && G.time - (ai.lastWaveT || 0) > 150) {
      const guard = new Set(), need = Object.assign({}, ai.defend);
      for (const u of homeArmy) { const k = aiRole(u); if (need[k] > 0) { need[k]--; guard.add(u); } }
      const go = homeArmy.filter((u) => !guard.has(u));
      const id = ai.waveN = (ai.waveN || 0) + 1; go.forEach((u) => { u.wave = id; }); ai.waves.push(id); aiMuster(O, id, go, base); ai.lastWaveT = G.time;
    }
    const hallCost = ai.expandWant ? BLD_DEFS[B(O, 'hall')].cost : {};     // a planned expansion comes first
    const spend = (cost) => fits(cost, pending, ai.reserve, hallCost);
    // ---- buildings the script asked for (rebuilt when lost); production buildings that trains need
    // between waves the next wave in the script is trained ahead (from what the current step leaves in the bank),
    // so the army keeps growing while the script builds and researches
    if (!ai.want) { for (let i = ai.step, n = 0; n < AI_SCRIPT.length; n++, i = i + 1 >= AI_SCRIPT.length ? AI_LOOP : i + 1) if (AI_SCRIPT[i].wave) { ai.next = aiSubst(O, AI_SCRIPT[i].wave); break; } }
    else ai.next = null;
    const wantUnits = Object.assign({}, ai.defend, ai.oil && hasRole(O, 'shipyard') ? ai.fleet : null); for (const [k, n] of Object.entries(ai.want || {})) wantUnits[k] = (wantUnits[k] || 0) + n;
    for (const k of Object.keys(wantUnits)) { const at = W2.UNITS[k].at; if (at) ai.needs[at] = Math.max(ai.needs[at] || 0, 1); for (const r of W2.UNITS[k].requires || []) ai.needs[r] = Math.max(ai.needs[r] || 0, 1); }
    // (only the units we can train already: looking ahead does not pull the next wave's buildings forward)
    for (const [k, n] of Object.entries(ai.next || {})) { const u = W2.UNITS[k]; if (u && (!u.at || hasRole(O, u.at)) && !(u.requires || []).some((r) => !hasRole(O, r))) wantUnits[k] = (wantUnits[k] || 0) + n; }
    const alarmedNow = ai.alarm && ai.alarm.home && G.time - ai.alarm.t < 20;
    if (!workers.some((w) => w.order === 'build' && !['farm', 'shipyard'].includes(BLD_DEFS[w.build.type].key))) {
      // the building saved for is tried first (walking the list in order let an unaffordable earlier entry block a
      // reserved, affordable one for minutes)
      for (const [role, n] of Object.entries(ai.needs).sort(([a], [b]) => (b === ai.reserveFor) - (a === ai.reserveFor))) {
        if (role === 'keep' || role === 'castle' || role === 'hall') continue;
        if (count(role) >= n) continue;
        const d = BLD_DEFS[B(O, role)];
        const lack = d.requires.filter((k) => !hasRole(O, k));
        if (lack.length) { for (const k of lack) if (k !== 'keep' && k !== 'castle') ai.needs[k] = Math.max(ai.needs[k] || 0, 1); else if (!ai.tierAsk) ai.tierAsk = k; continue; }
        if (role === 'shipyard') continue;                                        // placed by aiOil next to the oil
        if (role === 'refinery' || role === 'foundry') {                           // coastal: beside our shipyard
          const yard = blds.find((b) => BLD_DEFS[b.type].key === 'shipyard' && b.done), type = B(O, role);
          if (!yard || !affordAI(d.cost)) break;
          const spot = shoreSpot(yard, d.size, type, base), w = workers.find((x) => !x.hidden && x.order === 'gather' && !x.carrying);
          if (spot && w) cmd({ action: 'build', unitIds: [w.id], type, x: spot.x, y: spot.y });
          break;
        }
        // the building saved for, and a lost barracks (no troops without one), go ahead of the reserve
        if (role === ai.reserveFor || (role === 'barracks' && !count('barracks')) ? affordAI(d.cost) : spend(d.cost)) { aiBuild(workers, base, role); break; }
        // save up for it (a building whose script step was skipped too: otherwise troops spent every coin before it)
        if (!ai.reserve && !alarmedNow) { save(d.cost); ai.reserveFor = role; }
        break;
      }
    }
    // ---- production: home defence first, then the wave being gathered
    const have = {}; for (const u of army) if (!u.wave) { const k = aiRole(u); have[k] = (have[k] || 0) + 1; }
    // while saving for a tier or a research, units are trained only from what is left over (unless the base is under attack)
    // (only with a thin home army: with every skirmish at home counted, troops ate each saving for a tier building)
    const alarmed = ai.alarm && ai.alarm.home && G.time - ai.alarm.t < 20 && homeArmy.length < 6;
    // (round-robin over the unit types, the ones furthest short of their count first: listing type by type let cheap
    // footmen and archers take every free barracks while knights and siege waited behind them for good)
    const short = Object.entries(wantUnits).map(([k, n]) => [k, n - (have[k] || 0), n]).filter((x) => x[1] > 0).sort((a, b) => b[1] / b[2] - a[1] / a[2]);
    const deficit = []; for (let r = 0; short.some((x) => x[1] > r); r++) for (const x of short) if (x[1] > r) deficit.push(x[0]);
    // rich (gold piling up, food to spare): extra troops of the wave being gathered, so the bank turns into army
    // also while the script waits on lumber: gold beyond what the step saves for becomes troops instead of idling
    const spare = P.gold - ((ai.reserve && ai.reserve.gold) || 0) - (hallCost.gold || 0);
    if ((P.gold > 4000 || spare > 1500) && f.used + 4 < f.cap) { const ks = Object.keys(ai.want || ai.next || ai.defend || {}); for (const k of ks) deficit.push(k); }
    if (P.gold > 5000 && P.lumber > 900 && G.time > 480) ai.needs.barracks = Math.min(3, Math.max(ai.needs.barracks || 1, count('barracks') + 1));
    for (const k of deficit) {
      const type = aiType(O, k); if (!type) continue;
      const at = blds.find((b) => trainsAt(b, type) && b.done && !b.training && !b.research);
      if (at && !trainWhy(O, at, type) && (alarmed ? affordAI(UNIT_DEFS[type].cost) : spend(UNIT_DEFS[type].cost))) cmd({ action: 'train', buildingId: at.id, type });
      // a unit type we have none of (a first knight, a first siege engine) is saved for, not skipped for cheaper troops
      // (tier-2 units only, and not while the step saves for something else: that held every barracks idle)
      else if (at && !alarmed && !ai.reserve && !have[k] && k === deficit[0] && !trainWhy(O, at, type) && UNIT_DEFS[type].cost.gold >= 700) break;
    }
    // ---- towers upgrade to Guard Towers
    for (const b of blds) if (BLD_DEFS[b.type].key === 'scout' && b.done && !b.research && !researchWhy(O, b, 'tower_guard') && spend(upInfo('tower_guard', race).cost)) cmd({ action: 'research', buildingId: b.id, upgrade: 'tower_guard' });
    // ---- defence: help when hit near home; the waves march on the player's hall, then on whatever is left
    if (ai.alarm && G.time - ai.alarm.t < 6) {
      const a = G.ents.get(ai.alarm.id);
      // (any of our halls, expansions too; the units nearest the fight answer, not the far side of the map)
      if (a && !a.dead && nearHall(O, ex(a), ey(a), 22)) for (const u of army) if (!u.wave && (u.order === 'idle' || u.order === 'move') && canHit(u, a) && Math.hypot(u.x - ex(a), u.y - ey(a)) < 26) cmd({ action: 'attack', unitIds: [u.id], targetId: a.id });
    }
    if (ai.fleet) {
      const ships = army.filter((u) => dom(u) === 'water' && !u.wave && UNIT_DEFS[u.type].combat);
      const need = Object.values(ai.fleet).reduce((a, n) => a + n, 0);
      if (ships.length >= need && aiSeaTarget(ships[0])) { const id = ai.waveN = (ai.waveN || 0) + 1; ships.forEach((u) => { u.wave = id; }); ai.waves.push(id); }
    }
    aiWaves(O, army, ai);
    aiRepair(O, workers, blds);
    aiCast(O, army);
  }
  // the waves already sent: march them, re-target the idle, drop the dead; then the mop-up hunt
  // a unit in a fight: it has a target, or an enemy fighter is within 7 tiles (a wave member that stood to fight
  // made no progress on the route and was dropped from its wave for it)
  const inContact = (u) => !!u.targetId || G.units.some((e) => e.owner === foeOf(u.owner) && !e.hidden && !e.dead && UNIT_DEFS[e.type].combat && Math.abs(e.x - u.x) < 7 && Math.abs(e.y - u.y) < 7);
  function aiWaves(O, army, ai) {
    const F = foeOf(O), cmd = (c) => issueCommand(c, O);
    ai.march = ai.march || {};
    for (const id of ai.waves) {
      const us = army.filter((u) => u.wave === id);
      if (!us.length) continue;
      if (dom(us[0]) !== 'water' && aiMarch(O, id, us)) continue;
      const idle = us.filter((u) => u.order === 'idle' || u.order === 'hold');
      if (idle.length) {
        const t = dom(us[0]) === 'water' ? aiSeaTarget(us[0]) : aiTarget(us[0]);
        if (t) cmd({ action: 'attackMove', unitIds: idle.map((u) => u.id), x: ex(t), y: ey(t) });
        else if (dom(us[0]) === 'water') us.forEach((u) => { u.wave = null; });   // nothing left at sea: the fleet guards home
      }
    }
    // a land wave worn down to 2 units or fewer is over: the survivors come home and join the next one (otherwise a
    // lone straggler keeps the wave alive and the army at home never gets sent)
    for (const id of ai.waves) {
      const us = army.filter((u) => u.wave === id);
      if (us.length && us.length <= 2 && us.every((u) => dom(u) !== 'water') && !us.some(inContact)) {
        const base = G.buildings.find((b) => b.owner === O && BLD_DEFS[b.type].provides.includes('hall') && b.done);
        us.forEach((u) => { u.wave = null; u.task = null; });
        if (base) cmd({ action: 'attackMove', unitIds: us.map((u) => u.id), x: cx(base), y: cy(base) + 3 });
      }
    }
    ai.waves = ai.waves.filter((id) => army.some((u) => u.wave === id));
    for (const id of Object.keys(ai.march)) if (!ai.waves.includes(+id)) delete ai.march[id];
    // mop-up: the foe has no hall left, so every idle land and air unit hunts what remains (flyers reach platforms
    // and tankers at sea that neither the army nor a fleet on another sea can)
    if (!G.buildings.some((b) => b.owner === F && BLD_DEFS[b.type].provides.includes('hall'))) {
      hunt(army.filter((u) => !u.wave && dom(u) !== 'water'));
      // ... and idle warships sink what is left at sea (tankers and transports count until they are gone)
      for (const u of army.filter((x) => dom(x) === 'water' && UNIT_DEFS[x.type].combat && x.order === 'idle')) { const t = aiSeaTarget(u); if (t) cmd({ action: 'attackMove', unitIds: [u.id], x: ex(t), y: ey(t) }); }
    }
  }
  const marchFields = new Map();   // walking-distance fields toward each marching wave's target (not saved)
  // A land wave first assembles at a rally point a few tiles out of the base toward the foe, so it leaves together.
  function aiMuster(O, id, us, base) {
    if (dom(us[0]) === 'water') return;
    const t = aiTarget(us[0]), ai = aiOf(O);
    let rx = cx(base), ry = cy(base);
    if (t) { const dx = ex(t) - rx, dy = ey(t) - ry, d = Math.hypot(dx, dy) || 1; rx += dx / d * 8; ry += dy / d * 8; }
    const p = nearestFree(Math.round(rx), Math.round(ry), null, undefined, undefined, null, null, 'ground') || { x: us[0].tx, y: us[0].ty };
    ai.march = ai.march || {};
    ai.march[id] = { stage: 'gather', t: G.time, x: p.x, y: p.y };
    issueCommand({ action: 'move', unitIds: us.filter((u) => dom(u) === 'ground').map((u) => u.id), x: p.x, y: p.y }, O);
  }
  // ... then marches on the target in hops of about 10 tiles along the walking route, each hop waiting (up to 15 s)
  // for three quarters of the wave, so fast units do not run ahead and arrive alone. Near the target the wave is let
  // loose. Units already fighting are left to fight. Returns false once the wave is loose (the caller then re-targets).
  function aiMarch(O, id, us) {
    const m = aiOf(O).march && aiOf(O).march[id];
    if (!m || m.stage === 'loose') return false;
    const ground = us.filter((u) => dom(u) === 'ground');
    const near = (x, y, r) => ground.filter((u) => Math.hypot(u.x - x, u.y - y) <= r).length;
    if (m.stage === 'gather') {
      if (near(m.x, m.y, 4) < ground.length * 0.85 && G.time - m.t < 40) {
        const lost = ground.filter((u) => u.order === 'idle' && Math.hypot(u.x - m.x, u.y - m.y) > 4);
        if (lost.length) issueCommand({ action: 'move', unitIds: lost.map((u) => u.id), x: m.x, y: m.y }, O);
        return true;
      }
      m.stage = 'march'; m.wx = null; m.mt = G.time;
    }
    const t = aiTarget(us[0]);
    if (!t) { m.stage = 'loose'; return false; }
    const fk = O + id;
    let fc = marchFields.get(fk);
    if (!fc || fc.g !== G || fc.tid !== t.id || G.time - fc.t > 20) { fc = { g: G, tid: t.id, t: G.time, f: walkDist(t.kind === 'building' ? t : { tx: t.tx, ty: t.ty, size: 1 }) }; marchFields.set(fk, fc); }
    const f = fc.f;
    // a member that has not come closer for 30 s (stuck behind a wall of buildings, no path) leaves the wave and goes
    // home; otherwise the hindmost one held the whole wave back for good. Two and a half minutes after it set out
    // the wave is let loose whatever happens.
    m.prog = m.prog || {};
    for (const u of ground) {
      const d = f[idx(u.tx, u.ty)], p = m.prog[u.id];
      if (!p || (d >= 0 && d < p.d - 0.5) || inContact(u)) m.prog[u.id] = { d: d < 0 ? 1e9 : d, t: G.time };
      else if (G.time - p.t > 30 && u.order !== 'attack' && u.order !== 'cast') {
        u.wave = null; u.task = null; delete m.prog[u.id];
        const home = G.buildings.find((b) => b.owner === O && BLD_DEFS[b.type].provides.includes('hall') && b.done);
        if (home) issueCommand({ action: 'attackMove', unitIds: [u.id], x: cx(home), y: cy(home) + 3 }, O);
      }
    }
    const moving = ground.filter((u) => u.wave === id);
    if (!moving.length || G.time - (m.mt || m.t) > 150) { m.stage = 'loose'; marchFields.delete(fk); return false; }
    // the anchor: the wave member furthest behind on the route
    let anchor = null, ad = -1;
    for (const u of moving) { const d = f[idx(u.tx, u.ty)]; if (d > ad) { ad = d; anchor = u; } }
    if (!anchor || ad < 0 || ad <= 14) { m.stage = 'loose'; marchFields.delete(fk); issueCommand({ action: 'attackMove', unitIds: us.map((u) => u.id), x: ex(t), y: ey(t) }, O); return true; }
    // (a 16-unit wave cannot stand within 4 tiles of one point: most hops ended on the 15-s timer, a third of walking pace)
    const arrived = m.wx !== null && m.wx !== undefined && (near(m.wx, m.wy, 3 + Math.sqrt(ground.length)) >= ground.length * 0.75 || G.time - m.wt > 15);
    if (m.wx === null || m.wx === undefined || arrived) {
      // next hop: 10 steps down the distance field from the hindmost unit's tile, or from the last hop
      let x = m.wx !== null && m.wx !== undefined ? m.wx : anchor.tx, y = m.wx !== null && m.wx !== undefined ? m.wy : anchor.ty;
      if (f[idx(x, y)] < 0) { x = anchor.tx; y = anchor.ty; }
      for (let k = 0; k < 10; k++) {
        let bx = x, by = y, bd = f[idx(x, y)];
        for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (inb(nx, ny) && f[idx(nx, ny)] >= 0 && f[idx(nx, ny)] < bd) { bd = f[idx(nx, ny)]; bx = nx; by = ny; } }
        if (bx === x && by === y) break;
        x = bx; y = by;
      }
      m.wx = x; m.wy = y; m.wt = G.time;
      const go = us.filter((u) => u.order !== 'attack' && u.order !== 'cast');
      if (go.length) issueCommand({ action: 'attackMove', unitIds: go.map((u) => u.id), x, y }, O);
    } else {
      const idle = us.filter((u) => u.order === 'idle' && Math.hypot(u.x - m.wx, u.y - m.wy) > 4);
      if (idle.length) issueCommand({ action: 'attackMove', unitIds: idle.map((u) => u.id), x: m.wx, y: m.wy }, O);
    }
    return true;
  }
  // generic role of an army unit as the script counts it (Rangers count as archers, Paladins as knights)
  const aiRole = (u) => ({ ranger: 'archer', paladin: 'knight' }[keyOf(u)] || keyOf(u));
  function aiType(O, k) {
    const ups = G.players[O].upgrades;
    if (k === 'archer' && ups.includes('ranger')) k = 'ranger';
    if (k === 'knight' && ups.includes('paladin')) k = 'paladin';
    return T(O, k);
  }
  // whether a role can be trained now: its building stands, its tech is in, and (when gold is plentiful) the lumber
  // or oil it needs is in the bank. A wave's roles that cannot be made are filled with the basic melee unit, so the
  // barracks keeps turning gold into army while lumber or tech lags (the Wargus script would wait instead)
  function aiCanMake(O, k) {
    const type = aiType(O, k), u = W2.UNITS[k], P = G.players[O];
    if (!type || !UNIT_DEFS[type] || !trainable(O, type) || !u) return false;
    if (u.at && !G.buildings.some((b) => b.owner === O && b.done && trainsAt(b, type))) return false;
    if ((u.requires || []).some((r) => !hasRole(O, r))) return false;
    const c = UNIT_DEFS[type].cost;
    if (P.gold > 1500 && ((c.lumber || 0) > P.lumber - 100 || (c.oil || 0) > P.oil)) return false;
    return true;
  }
  function aiSubst(O, recipe) {
    if (!aiCanMake(O, 'footman') && !G.buildings.some((b) => b.owner === O && b.done && trainsAt(b, aiType(O, 'footman')))) return recipe;
    const out = {};
    for (const [k, n] of Object.entries(recipe)) { const kk = aiCanMake(O, k) || !W2.UNITS[k] || W2.UNITS[k].domain ? k : 'footman'; out[kk] = (out[kk] || 0) + n; }
    return out;
  }
  // the units of a wave, once the pool holds enough of each kind
  function aiPick(pool, want, O) {
    const out = [];
    for (const [k, n] of Object.entries(want)) {
      const got = pool.filter((u) => aiRole(u) === k && !out.includes(u)).slice(0, n);
      if (got.length < n) return null;
      out.push(...got);
    }
    return out;
  }
  // water bodies: each water tile labelled with the connected sea it belongs to (water never changes, so once per map)
  function seaOf(x, y) {
    if (!G.seaMap || G.seaMap.length !== N) {
      const m = G.seaMap = new Int32Array(N).fill(-1); let n = 0;
      for (let i = 0; i < N; i++) if (G.terrain[i] === WATER && m[i] < 0) {
        const q = [i]; m[i] = n;
        for (let h = 0; h < q.length; h++) { const qx = q[h] % MW, qy = (q[h] / MW) | 0; for (const [dx, dy] of DIRS) { const nx = qx + dx, ny = qy + dy; if (!inb(nx, ny)) continue; const j = idx(nx, ny); if (G.terrain[j] === WATER && m[j] < 0) { m[j] = n; q.push(j); } } }
        n++;
      }
    }
    return inb(x, y) ? G.seaMap[idx(x, y)] : -1;
  }
  // the seas a building touches (a shipyard or a coastal building can be shelled from these)
  const seasBy = (f) => { const out = new Set(); for (let y = f.ty - 1; y <= f.ty + f.size; y++) for (let x = f.tx - 1; x <= f.tx + f.size; x++) { const k = seaOf(x, y); if (k >= 0) out.add(k); } return out; };
  // a fleet's target, on its own sea only: foe ships first, then oil platforms and coastal buildings, then anything
  // by the water
  function aiSeaTarget(u) {
    const near = (list) => { let best = null, bd = 1e9; for (const t of list) { const d = Math.hypot(ex(t) - u.x, ey(t) - u.y); if (d < bd) { bd = d; best = t; } } return best; };
    const F = foeOf(u.owner), sea = seaOf(u.tx, u.ty);
    const onSea = (b) => seasBy(b).has(sea);
    return near(G.units.filter((e) => e.owner === F && dom(e) === 'water' && !cloaked(e) && seaOf(e.tx, e.ty) === sea))
      || near(G.buildings.filter((b) => b.owner === F && (BLD_DEFS[b.type].seaTarget || nearWater(b)) && onSea(b)));
  }
  function aiTarget(u) {
    const F = foeOf(u.owner), land = dom(u) === 'ground';
    // a land army goes only for what it can walk up to: buildings on land (not platforms at sea) and units on land,
    // or ships and flyers it can shoot at
    const ps = G.buildings.filter((b) => b.owner === F && !BLD_DEFS[b.type].wall && !(land && BLD_DEFS[b.type].onOil));   // the computer never targets walls on purpose
    const hall = ps.find((b) => BLD_DEFS[b.type].provides.includes('hall'));
    if (hall) return hall;
    const all = ps.concat(G.units.filter((e) => e.owner === F && !e.hidden && !cloaked(e) && (!land || dom(e) === 'ground' || (canHit(u, e) && dom(e) === 'air'))));
    let best = null, bd = 1e9;
    for (const t of all) { const d = Math.hypot(ex(t) - u.x, ey(t) - u.y); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  function aiBuild(workers, base, role) {
    const O = base.owner, type = B(O, role), d = BLD_DEFS[type];
    const w = workers.find((x) => !x.hidden && x.order === 'gather' && x.gatherType === 'tree' && !x.carrying) || workers.find((x) => !x.hidden && (x.order === 'gather' || x.order === 'idle'));
    const pend = { gold: 0, lumber: 0 };                 // builders still walking to their sites have not paid yet
    for (const x of workers) if (x.order === 'build' && x.build) { const c = BLD_DEFS[x.build.type].cost || {}; pend.gold += c.gold || 0; pend.lumber += c.lumber || 0; }
    if (!w || !afford(O, { gold: (d.cost.gold || 0) + pend.gold, lumber: (d.cost.lumber || 0) + pend.lumber, oil: d.cost.oil || 0 })) return false;
    // a lumber mill goes by the woods the cutters use (a short haul is worth more than its bonus)
    let spot = agentPlaceSite(O, base, type, d.size);
    if (!spot && role === 'mill') { const t = treeNear(base); if (t && Math.hypot(t.tx - cx(base), t.ty - cy(base)) > 6) spot = findSpotNear(base, t.tx, t.ty, d.size); }
    spot = spot || findSpot(base, d.size, role === 'hall', role);
    return spot ? issueCommand({ action: 'build', unitIds: [w.id], type, x: spot.x, y: spot.y }, O) : false;
  }
  function aiOil(O, base, workers, blds) {
    const role = (k) => blds.filter((b) => BLD_DEFS[b.type].key === k);
    const free = G.oils.filter((o) => !G.buildings.some((b) => b.owner !== O && BLD_DEFS[b.type].onOil && b.tx === o.tx && b.ty === o.ty));
    const patch = nearestPatch(free, cx(base), cy(base));
    if (!patch) return;
    const yard = role('shipyard')[0];
    if (!yard) {
      if (workers.some((w) => w.order === 'build' && BLD_DEFS[w.build.type].key === 'shipyard') || !hasRole(O, 'mill')) return;
      const type = B(O, 'shipyard'); if (!afford(O, BLD_DEFS[type].cost)) return;
      if (G.time < (aiOf(O).yardRetry || 0)) return;
      const spot = yardSite(O, base, type);
      if (!spot) { aiOf(O).yardRetry = G.time + 60; return; }
      const w = workers.find((x) => !x.hidden && x.order === 'gather' && !x.carrying);
      if (spot && w) issueCommand({ action: 'build', unitIds: [w.id], type, x: spot.x, y: spot.y }, O);
      return;
    }
    if (!yard.done) return;
    const tankers = G.units.filter((u) => u.owner === O && keyOf(u) === 'tanker');
    if (tankers.length < 2 && !yard.training) issueCommand({ action: 'train', buildingId: yard.id, type: T(O, 'tanker') }, O);
    const plat = blds.find((b) => BLD_DEFS[b.type].onOil);
    for (const t of tankers) {
      if (t.order !== 'idle') continue;
      if (!plat && !tankers.some((x) => x.order === 'build')) { issueCommand({ action: 'build', unitIds: [t.id], type: B(O, 'platform'), x: cx(patch), y: cy(patch) }, O); continue; }
      if (plat && plat.done) { const res = G.oils.find((o) => o.tx === plat.tx && o.ty === plat.ty); if (res) issueCommand({ action: 'gather', unitIds: [t.id], targetId: res.id }, O); }
    }
  }
  function aiExpand(O, base, workers, halls) {
    const near = (m, bs, r) => bs.some((b) => Math.hypot(cx(m) - cx(b), cy(m) - cy(b)) < r);
    const ai = aiOf(O), P = G.players[O];
    const left = G.mines.filter((m) => near(m, halls, 10)).reduce((a, m) => a + m.amount, 0);
    // expand while the home mines still hold about ten minutes of mining (a hall takes 1200 gold: waiting until the
    // mine is empty leaves nothing to pay for it), or early when rich and well staffed
    const rich = G.time > 600 && halls.length < 2 && P.gold > 2500 && workers.length >= 16;
    ai.expandWant = false;
    if ((left >= 15000 && !rich) || halls.some((h) => !h.done) || workers.some((w) => w.order === 'build' && BLD_DEFS[w.build.type].key === 'hall')) return;
    const type = B(O, 'hall');
    // (saved for only when there is a legal site: an unplaceable expansion held 1200 gold back all game on small maps)
    if (!afford(O, BLD_DEFS[type].cost)) {
      if (G.time >= (ai.siteT || 0)) { ai.siteT = G.time + 20; ai.siteOk = !!expandSite(O, base); }
      ai.expandWant = ai.siteOk; ai.expandT = G.time + 3; return; }
    const best = expandSite(O, base);
    const w = workers.find((x) => !x.hidden && x.order === 'gather' && !x.carrying);
    if (best && w) issueCommand({ action: 'build', unitIds: [w.id], type, x: best.x, y: best.y }, O);
  }
  // the shipyard site: by the nearest free oil patch that has open, reachable coast within reach
  function yardSite(O, base, type) {
    const free = G.oils.filter((o) => !G.buildings.some((b) => BLD_DEFS[b.type].onOil && b.tx === o.tx && b.ty === o.ty))
      .sort((a, b) => Math.hypot(cx(a) - cx(base), cy(a) - cy(base)) - Math.hypot(cx(b) - cx(base), cy(b) - cy(base)));
    for (const p of free.slice(0, 6)) { const spot = shoreSpot(p, 3, type, base); if (spot) return spot; }
    return null;
  }
  // a legal coastal site for a building near a spot on the water (shipyard next to an oil patch)
  // (the site must be walkable from the hall: the nearest one by walking distance within 14 tiles of the spot)
  function shoreSpot(near, size, type, base) {
    const dist = walkDist(base), x0 = Math.round(cx(near)), y0 = Math.round(cy(near));
    const R = 18, cands = [];
    for (let y = y0 - R; y <= y0 + R; y++) for (let x = x0 - R; x <= x0 + R; x++) {
      const f = { tx: x, ty: y, size, type };
      if (!inb(x, y) || siteWhy(f)) continue;
      let d = 1e9; for (let yy = y - 1; yy <= y + size; yy++) for (let xx = x - 1; xx <= x + size; xx++) if (inb(xx, yy) && dist[idx(xx, yy)] >= 0) d = Math.min(d, dist[idx(xx, yy)]);
      if (d < 1e9) cands.push({ d, f });
    }
    // the nearest by walking that walls nothing off (coastal buildings could close a strip of shore too)
    cands.sort((a, b) => a.d - b.d || a.f.ty - b.f.ty || a.f.tx - b.f.tx);
    const cuts = cutter(base);
    for (const c of cands.slice(0, 40)) if (!cuts(c.f)) return { x: c.f.tx + (size - 1) / 2, y: c.f.ty + (size - 1) / 2 };
    return null;
  }
  // ground walking distance (tiles) from around a building to every tile, -1 where unreachable
  function walkDist(b) {
    const dist = new Int32Array(N).fill(-1), q = [];
    for (let y = b.ty - 1; y <= b.ty + b.size; y++) for (let x = b.tx - 1; x <= b.tx + b.size; x++) if (inb(x, y) && sPass(x, y)) { dist[idx(x, y)] = 0; q.push(idx(x, y)); }
    // (no cutting corners between two blocked tiles, as findPath: a diagonal squeeze past a building's corner counted
    // as a route here while no unit could take it, and a mine walled off that way looked reachable)
    for (let h = 0; h < q.length; h++) { const x = q[h] % MW, y = (q[h] / MW) | 0; for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny) || !sPass(nx, ny) || (dx && dy && (!sPass(x + dx, y) || !sPass(x, y + dy)))) continue; const ni = idx(nx, ny); if (dist[ni] < 0) { dist[ni] = dist[q[h]] + 1; q.push(ni); } } }
    return dist;
  }
  // Warcraft II AI repair: an idle or gathering worker fixes a damaged building once no enemy has been near it for 5 s
  function aiRepair(O, workers, blds) {
    if (workers.some((w) => w.order === 'repair')) return;
    if (G.agent && agentSide() === O && (workers.length < 6 || G.players[O].gold < UNIT_DEFS[RACES[raceOf(O)].units.worker].cost.gold + 100)) return;   // (an agent's last few workers, and its last gold, stay for the economy)
    const b = blds.find((x) => x.done && x.hp < x.maxHp * 0.9 && G.time - (x.hitT || -1e9) > 5 &&
      !G.units.some((e) => e.owner === foeOf(O) && Math.hypot(e.x - cx(x), e.y - cy(x)) < BLD_DEFS[x.type].sight + 4));
    if (!b || G.players[O].gold < 100 || G.players[O].lumber < 100) return;
    const w = workers.find((x) => !x.hidden && x.order === 'gather' && !x.carrying);
    if (w) issueCommand({ action: 'repair', unitIds: [w.id], targetId: b.id }, O);
  }
  // Casters in battle: damage spells on groups, heals and buffs on the front line
  function aiCast(O, army) {
    for (const u of army) {
      const d = UNIT_DEFS[u.type];
      if (!d.spells || u.order === 'cast' || u.mana < 50) continue;
      const foes = G.units.filter((e) => e.owner === foeOf(O) && !e.hidden && seenBy(O, e) && Math.hypot(e.x - u.x, e.y - u.y) < 9);
      if (!foes.length) continue;
      const friends = army.filter((e) => Math.hypot(e.x - u.x, e.y - u.y) < 7);
      const clusterAt = (r) => { let best = null, bn = 0; for (const e of foes) { const n = foes.filter((x) => Math.hypot(x.x - e.x, x.y - e.y) <= r).length, own = friends.filter((x) => Math.hypot(x.x - e.x, x.y - e.y) <= r + 1).length; if (!own && n > bn) { bn = n; best = e; } } return best && { e: best, n: bn }; };
      const can = (s) => d.spells.includes(s) && spellKnown(O, s) && u.mana >= spellCost(SPELLS[s]);
      const cast = (s, t, at) => issueCommand({ action: 'cast', unitIds: [u.id], spell: s, targetId: t ? t.id : undefined, x: at && at.x, y: at && at.y }, O);
      const big = foes.slice().sort((a, b) => b.maxHp - a.maxHp)[0];
      const cl = clusterAt(2);
      if ((can('blizzard') || can('death_and_decay')) && cl && cl.n >= 3) { cast(can('blizzard') ? 'blizzard' : 'death_and_decay', null, { x: cl.e.tx, y: cl.e.ty }); continue; }
      if (can('polymorph') && big && organic(big) && big.maxHp >= 90) { cast('polymorph', big); continue; }
      if (can('death_coil') && big && organic(big)) { cast('death_coil', big); continue; }
      if (can('fireball') && cl && cl.n >= 2) { cast('fireball', null, { x: cl.e.tx, y: cl.e.ty }); continue; }
      if (can('raise_dead') && G.corpses.some((c) => !c.air && Math.hypot(c.x - u.x, c.y - u.y) < 6)) { const c = G.corpses.find((k) => !k.air && Math.hypot(k.x - u.x, k.y - u.y) < 6); cast('raise_dead', null, { x: Math.round(c.x), y: Math.round(c.y) }); continue; }
      const hurt = friends.filter((e) => organic(e) && e !== u && e.hp < e.maxHp * 0.6)[0];
      if (can('healing') && hurt) { cast('healing', hurt); continue; }
      const melee = friends.find((e) => organic(e) && UNIT_DEFS[e.type].range <= 1 && UNIT_DEFS[e.type].combat && !(e.fx.bloodlust > 0) && (e.order === 'attack' || e.order === 'attackMove'));
      if (can('bloodlust') && melee) { cast('bloodlust', melee); continue; }
      const fast = friends.find((e) => e.order === 'attackMove' && !(e.fx.haste > 0) && e !== u);
      if (can('haste') && fast) { cast('haste', fast); continue; }
      const sl = foes.find((e) => !(e.fx.slow > 0) && e.maxHp >= 60);
      if (can('slow') && sl && u.mana >= 150) { cast('slow', sl); continue; }
    }
  }
  // once the player's hall is gone (or the AI has no hall), idle army units chase whatever the player has left
  function hunt(army) {
    const idle = army.filter((u) => u.order === 'idle');
    if (!idle.length) return;
    for (const u of idle) { const t = aiTarget(u); if (t) issueCommand({ action: 'attackMove', unitIds: [u.id], x: ex(t), y: ey(t) }, u.owner); }
  }
  // a free spot next to a point (the mill by the forest): open ground with a tile of margin, reachable from the hall
  function findSpotNear(base, px, py, size, reach0) {
    // (only by the home woods: once those were cut back, the nearest trees could lie halfway to the foe, and the mill
    // went there; the caller falls back to an ordinary site. A tower may stand further out: reach0)
    if (Math.hypot(px - cx(base), py - cy(base)) > (reach0 || 12)) return null;
    const foeH = G.buildings.filter((b) => b.owner !== base.owner && BLD_DEFS[b.type].provides.includes('hall'));
    if (foeH.some((h) => Math.hypot(cx(h) - px, cy(h) - py) < Math.hypot(cx(base) - px, cy(base) - py))) return null;
    const dist = walkDist(base), cuts = cutter(base);
    for (let r = 1; r < 8; r++) for (let y = py - r; y <= py + r; y++) for (let x = px - r; x <= px + r; x++) {
      if (Math.max(Math.abs(x - px), Math.abs(y - py)) !== r) continue;
      if (siteWhy({ tx: x, ty: y, size, type: null }) || pendingNear({ tx: x, ty: y, size }, base.owner, false)) continue;
      let ok = true, reach = false;
      for (let yy = y - 1; yy <= y + size && ok; yy++) for (let xx = x - 1; xx <= x + size; xx++) {
        if (!inb(xx, yy) || G.bgrid[idx(xx, yy)]) { ok = false; break; }
        if (G.terrain[idx(xx, yy)] === GRASS && dist[idx(xx, yy)] >= 0) reach = true;
      }
      if (ok && reach && !cuts({ tx: x, ty: y, size })) return { x: x + (size - 1) / 2, y: y + (size - 1) / 2 };
    }
    return null;
  }
  // an agent's tower goes where attacks come from, not behind the hall: the 1st (and every other one) on the enemy's
  // walking route about 10 tiles out, the 2nd by the gold mine on the side that faces that route
  function towerSite(O, base, size) {
    const { x, y } = approachPoint(O, base);
    const have = G.buildings.filter((b) => b.owner === O && /tower|scout/.test(BLD_DEFS[b.type].key)).length + G.units.filter((u) => u.owner === O && u.order === 'build' && u.build && BLD_DEFS[u.build.type].key === 'scout').length;
    const m = nearestPatch(G.mines, cx(base), cy(base));
    let px = x, py = y;
    if (have % 2 === 1 && m) { const mx = cx(m), my = cy(m), dd = Math.hypot(x - mx, y - my) || 1; px = Math.round(mx + (x - mx) / dd * 3); py = Math.round(my + (y - my) / dd * 3); }
    // (the 3rd and later: beside the approach, 3 tiles either side of it, so they do not fall back behind the hall)
    const ax = x - cx(base), ay = y - cy(base), al = Math.hypot(ax, ay) || 1, side = [Math.round(-ay / al * 3), Math.round(ax / al * 3)];
    return findSpotNear(base, px, py, size, 17) || findSpotNear(base, x, y, size, 17) || findSpotNear(base, x + side[0], y + side[1], size, 17) || findSpotNear(base, x - side[0], y - side[1], size, 17);
  }
  // where the enemy walks in: down the walking-distance field from the foe's hall (or the far corner) to ~13 tiles out
  function approachPoint(O, base) {
    const dist = walkDist(base), foe = G.buildings.find((b) => b.owner === foeOf(O) && BLD_DEFS[b.type].provides.includes('hall'));
    let x = Math.round(foe ? cx(foe) : MW - 1 - cx(base)), y = Math.round(foe ? cy(foe) : MH - 1 - cy(base));
    // walk down the distance field from the foe's side until about 10 steps from home: the approach
    if (dist[idx(x, y)] < 0) { let best = null, bd = 1e9; for (let i = 0; i < N; i++) if (dist[i] >= 0) { const d = Math.hypot(i % MW - x, ((i / MW) | 0) - y); if (d < bd) { bd = d; best = i; } } if (best !== null) { x = best % MW; y = (best / MW) | 0; } }
    for (let k = 0; k < 400 && Math.hypot(x - cx(base), y - cy(base)) > 13; k++) {
      let nx = x, ny = y, nd = dist[idx(x, y)];
      for (const [dx, dy] of DIRS) { const ax = x + dx, ay = y + dy; if (inb(ax, ay) && dist[idx(ax, ay)] >= 0 && dist[idx(ax, ay)] < nd) { nd = dist[idx(ax, ay)]; nx = ax; ny = ay; } }
      if (nx === x && ny === y) break; x = nx; y = ny;
    }
    return { x, y };
  }
  // the agent's named building zones around its hall, from the enemy's approach: front (toward it), back, left and
  // right (as seen facing the approach), mine (the gold mine's side facing the approach), woods (the nearest trees)
  const ZONES = ['front', 'back', 'left', 'right', 'mine', 'woods', 'hall'];
  function agentZones(O, base) {
    const a = approachPoint(O, base), bx = cx(base), by = cy(base), ux0 = a.x - bx, uy0 = a.y - by, ul = Math.hypot(ux0, uy0) || 1;
    const ux = ux0 / ul, uy = uy0 / ul, cl = (x, y) => [Math.max(1, Math.min(MW - 2, Math.round(x))), Math.max(1, Math.min(MH - 2, Math.round(y)))];
    const z = { front: cl(bx + ux * 9, by + uy * 9), back: cl(bx - ux * 7, by - uy * 7), left: cl(bx + uy * 8, by - ux * 8), right: cl(bx - uy * 8, by + ux * 8), hall: cl(bx, by) };
    const m = nearestPatch(G.mines, bx, by); if (m) z.mine = cl(cx(m) + ux * 3, cy(m) + uy * 3);
    const t = treeNear(base); if (t) z.woods = cl(t.tx, t.ty);
    return z;
  }
  // a site for the agent's building from its plan's placement setting (a zone name or a [x, y] tile); null = default
  function agentPlaceSite(O, base, type, size) {
    const cfg = G.agent && G.agent.side === O && G.agent.cfg && G.agent.cfg.place; if (!cfg) return null;
    const want = cfg[type] !== undefined ? cfg[type] : cfg[BLD_DEFS[type].key];
    if (want === undefined || want === null || want === 'auto') return null;
    if (want === 'hall') return findSpot(base, size, false, BLD_DEFS[type].key);
    let at = null;
    if (Array.isArray(want) && typeof want[0] === 'string') {         // several zones: the one with the fewest of this kind
      const z = agentZones(O, base), key = BLD_DEFS[type].key, near = (p) => G.buildings.filter((b) => b.owner === O && BLD_DEFS[b.type].key === key && Math.hypot(cx(b) - p[0], cy(b) - p[1]) < 7).length +
        G.units.filter((u) => u.owner === O && u.order === 'build' && u.build && BLD_DEFS[u.build.type].key === key && Math.hypot(u.build.tx - p[0], u.build.ty - p[1]) < 7).length;
      let bn = 1e9; for (const n of want) { const p = n === 'hall' ? z.hall : z[n]; if (p && near(p) < bn) { bn = near(p); at = p; } }
    } else at = Array.isArray(want) ? want : agentZones(O, base)[want];
    if (!at) return null;
    return findSpotNear(base, Math.round(at[0]), Math.round(at[1]), size, 17);
  }
  // a site a builder of ours is still walking to counts as taken, with the same tile of margin (two farm builders
  // were sent to one spot and the second found 'a building in the way'); farms may touch other farms
  function pendingNear(f, O, farm) {
    return G.units.some((u) => u.owner === O && u.order === 'build' && u.build && !BLD_DEFS[u.build.type].onOil &&
      rectGap(f, { tx: u.build.tx, ty: u.build.ty, size: BLD_DEFS[u.build.type].size }) < (farm && BLD_DEFS[u.build.type].key === 'farm' ? 1 : 2));
  }
  // a free spot for a building near the hall, off the hall-to-mine lane and with a tile of margin all round
  function findSpot(base, size, isHall, role) {
    const m = nearestPatch(G.mines, cx(base), cy(base));
    const cor = m ? { x0: Math.min(base.tx, m.tx) - 1, y0: Math.min(base.ty, m.ty) - 1, x1: Math.max(base.tx + base.size - 1, m.tx + 2) + 1, y1: Math.max(base.ty + base.size - 1, m.ty + 2) + 1 } : null;
    const bx = Math.round(cx(base)), by = Math.round(cy(base));
    // four passes, each looser: (1) a ring of open grass all round and clear of the hall-mine lane; (2) the ring may
    // touch trees, water or the map edge (never another building), still clear of the lane; (3) the lane allowed;
    // (4) the ring may touch other buildings too, as long as a worker can still walk up to the site.
    // A cramped start (a corner hemmed in by water and forest) fails the first pass after a building or two.
    // Farms go to the outside first (from 6 tiles out) and may stand wall to wall with other farms, so the room near
    // the hall stays free for the 3x3 buildings (on a 32x32 map farms otherwise fill every 3x3 site by minute 5).
    const farm = role === 'farm', O = base.owner;
    const blocks = (b) => b && !(farm && b.kind === 'building' && b.owner === O && BLD_DEFS[b.type].key === 'farm');
    // (never nearer a foe's hall than our own, and within a radius that suits the map: on 32x32 the outer rings of
    // a 20-tile search reached into the enemy base)
    const R = Math.min(20, Math.max(9, Math.round(Math.min(MW, MH) / 3)));
    const foeH = G.buildings.filter((b) => b.owner !== O && BLD_DEFS[b.type].provides.includes('hall'));
    // (nor where it would close the only walking route to the foe's hall or to our mine)
    const cuts = cutter(base);
    let dist = null;
    for (let pass = 1; pass <= 4; pass++) for (let r0 = 0; r0 < (farm ? 2 : 1); r0++) for (let r = farm && r0 === 0 ? 6 : 3; r < (farm && r0 === 0 ? R : farm ? 6 : R); r++) for (let y = by - r; y <= by + r; y++) for (let x = bx - r; x <= bx + r; x++) {
      if (Math.max(Math.abs(x - bx), Math.abs(y - by)) !== r) continue;
      const f = { tx: x, ty: y, size, type: isHall ? B(base.owner, 'hall') : null };
      if (siteWhy(f)) continue;
      if (pendingNear(f, O, farm)) continue;
      const sx = x + size / 2, sy = y + size / 2;
      if (!isHall && foeH.some((h) => Math.hypot(cx(h) - sx, cy(h) - sy) < Math.hypot(cx(base) - sx, cy(base) - sy))) continue;
      if (pass < 3 && cor && x <= cor.x1 && x + size - 1 >= cor.x0 && y <= cor.y1 && y + size - 1 >= cor.y0) continue;
      let ok = true, reach = pass === 1;
      if (!reach && !dist) dist = walkDist(base);
      for (let yy = y - 1; yy <= y + size && ok; yy++) for (let xx = x - 1; xx <= x + size; xx++) {
        const inside = xx >= x && xx < x + size && yy >= y && yy < y + size;
        if (!inside && pass === 4) { if (!reach && inb(xx, yy) && dist[idx(xx, yy)] >= 0) reach = true; continue; }
        if (pass === 1 ? (!inb(xx, yy) || blocks(G.bgrid[idx(xx, yy)]) || (!G.bgrid[idx(xx, yy)] && G.terrain[idx(xx, yy)] !== GRASS)) : (inb(xx, yy) && blocks(G.bgrid[idx(xx, yy)]))) { ok = false; break; }
        if (!reach && inb(xx, yy) && dist[idx(xx, yy)] >= 0) reach = true;      // a worker can walk up to it
      }
      if (ok && reach && !cuts(f)) return { x: x + (size - 1) / 2, y: y + (size - 1) / 2 };
    }
    return null;
  }

  // ---------------------------------------------------------------- agent interface (an outside player, e.g. an LLM)
  // The harness holds the clock (G.agent.hold) and advances it in fixed steps, reads a fog-of-war view of its side,
  // picks from the currently legal macro actions and hands them to macro(), which carries them out with the same
  // helpers the native AI uses (sites, marching waves). Farms, the gold/lumber split, idle workers, tankers, repair
  // and the strike-back reflex run for it as they do for the native AI (aiThink econOnly).
  const agentSide = () => (G.agent && G.agent.side) || 'player';
  function agentStart(opts) { rec('agent', opts || {}); G.agent = { side: 'player', hold: true, lost: 0, log: [] }; Object.assign(G.agent, opts || {}); aiOf(G.agent.side); return true; }
  function agentAdvance(sec) {
    const n = Math.max(1, Math.round(sec / TICK));
    for (let i = 0; i < n && !G.winner; i++) step();
    return { time: G.time, winner: G.winner };
  }
  const r1 = (v) => Math.round(v * 10) / 10;

  // ---- the agent's map knowledge, computed once per game from the terrain (static: the same for the whole game)
  // grid: one character per CxC tiles (. ground, T forest, ~ water, ^ rock; H our hall, E the enemy start, G gold mine)
  // route: the ground route to the enemy start (length, or none: then only ships, transports and fliers reach it)
  // chokes: the narrowest points of that route (passable width in tiles), nearest to our base first
  // expansions: every other gold mine with its ground distance from us and from the enemy start
  function agentTerrain() {
    if (G.agent.terrain) return G.agent.terrain;
    const O = agentSide(), hall = G.buildings.find((b) => b.owner === O && BLD_DEFS[b.type].provides.includes('hall'));
    if (!hall) return null;
    const hx = Math.round(cx(hall)), hy = Math.round(cy(hall)), fx = MW - 1 - hx, fy = MH - 1 - hy;
    const C = Math.max(2, Math.ceil(MW / 24)), cols = Math.ceil(MW / C), rows = Math.ceil(MH / C), ch = ['.', 'T', '~', '^'];
    const grid = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const n = [0, 0, 0, 0];
        for (let y = r * C; y < Math.min(MH, r * C + C); y++) for (let x = c * C; x < Math.min(MW, c * C + C); x++) n[G.terrain[idx(x, y)]]++;
        line += ch[n.indexOf(Math.max(...n))];
      }
      grid.push(line);
    }
    const mark = (x, y, k) => { const r = Math.floor(y / C), c = Math.floor(x / C); if (grid[r]) grid[r] = grid[r].slice(0, c) + k + grid[r].slice(c + 1); };
    for (const m of G.mines) mark(cx(m), cy(m), 'G');
    mark(hx, hy, 'H'); mark(fx, fy, 'E');
    // ground distances from our hall and from the enemy start (terrain only: the enemy's buildings are not known)
    // walking distance in tenths of a tile (a diagonal step 14), from the nearest ground tile to a point; Dial's
    // bucket queue, since the step costs are small integers
    // clearance: tiles to the nearest non-ground tile (1 = next to forest, rock or water)
    const clear = new Int32Array(N).fill(-1), cq = [];
    for (let i = 0; i < N; i++) if (G.terrain[i] !== GRASS) { clear[i] = 0; cq.push(i); }
    for (let h = 0; h < cq.length; h++) { const x = cq[h] % MW, y = (cq[h] / MW) | 0; for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (inb(nx, ny) && clear[idx(nx, ny)] < 0) { clear[idx(nx, ny)] = clear[cq[h]] + 1; cq.push(idx(nx, ny)); } } }
    for (let i = 0; i < N; i++) if (clear[i] < 0) clear[i] = 99;
    const flood = (x0, y0, pen, blk) => {
      const d = new Int32Array(N).fill(-1), b = [];
      let s0 = -1; for (let r = 0; r <= 4 && s0 < 0; r++) for (let y = y0 - r; y <= y0 + r && s0 < 0; y++) for (let x = x0 - r; x <= x0 + r; x++) if (inb(x, y) && G.terrain[idx(x, y)] === GRASS) { s0 = idx(x, y); break; }
      if (s0 < 0) return d;
      d[s0] = 0; b[0] = [s0];
      for (let c = 0; c < b.length; c++) for (const i of b[c] || []) {
        if (d[i] !== c) continue;
        const x = i % MW, y = (i / MW) | 0;
        for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny) || G.terrain[idx(nx, ny)] !== GRASS || (blk && blk(nx, ny))) continue; const ni = idx(nx, ny), nd = c + (dx && dy ? 14 : 10) + (pen ? [0, 40, 16, 6][Math.min(3, clear[ni])] || 0 : 0); if (d[ni] < 0 || nd < d[ni]) { d[ni] = nd; (b[nd] || (b[nd] = [])).push(ni); } }
      }
      if (!pen) for (let i = 0; i < N; i++) if (d[i] > 0) d[i] = Math.round(d[i] / 10);
      return d;
    };
    const dh = flood(hx, hy), df = flood(fx, fy), dp = flood(hx, hy, true);   // dp: the route an army takes, through the middle of corridors
    let meet = -1; for (let r = 0; r <= 4 && meet < 0; r++) for (let y = fy - r; y <= fy + r; y++) for (let x = fx - r; x <= fx + r; x++) if (inb(x, y) && dh[idx(x, y)] >= 0 && (meet < 0 || dh[idx(x, y)] < dh[meet])) meet = idx(x, y);
    const route = meet < 0 ? null : { groundTiles: dh[meet], straightTiles: Math.round(Math.hypot(fx - hx, fy - hy)) };
    // chokes: walk the route back from the enemy start; the passable width across it at each step (8 directions)
    const chokes = [];
    if (meet >= 0) {
      const path = []; let i = meet;
      while (dp[i] > 0) { path.push(i); const x = i % MW, y = (i / MW) | 0; let nx = -1; for (const [dx, dy] of DIRS) { const j = idx(x + dx, y + dy); if (inb(x + dx, y + dy) && dp[j] >= 0 && dp[j] < dp[i] && (nx < 0 || dp[j] < dp[nx])) nx = j; } if (nx < 0) break; i = nx; }
      // candidates: route points where the ground is at most 4 steps across along some axis; a candidate is a
      // choke when closing a disk of radius 3 on it cuts the route or makes it at least a quarter longer
      const run = (x, y, ax, ay) => { let w = 1; for (const sg of [1, -1]) for (let k = 1; k <= 8; k++) { const px = x + sg * k * ax, py = y + sg * k * ay; if (!inb(px, py) || G.terrain[idx(px, py)] !== GRASS) break; w++; } return w; };
      const cand = path.map((i) => { const x = i % MW, y = (i / MW) | 0; return { x, y, w: Math.min(run(x, y, 1, 0), run(x, y, 0, 1), run(x, y, 1, 1), run(x, y, 1, -1)), d: dh[i] }; })
        .filter((p) => p.w <= 4 && p.d > 8 && df[idx(p.x, p.y)] > 8).sort((a, b) => a.w - b.w || a.d - b.d);
      const tried = [];
      for (const p of cand) {
        if (tried.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 7) || tried.length >= 10) continue;
        tried.push(p);
        const cut = flood(hx, hy, false, (x, y) => Math.hypot(x - p.x, y - p.y) <= 3)[meet];
        if (cut >= 0 && cut < route.groundTiles * 1.25) continue;
        chokes.push({ at: [p.x, p.y], widthTiles: p.w, fromHomeTiles: p.d, fromEnemyTiles: df[idx(p.x, p.y)], ifBlocked: cut < 0 ? 'the only ground route' : 'detour +' + (cut - route.groundTiles) + ' tiles' });
        if (chokes.length >= 3) break;
      }
      chokes.sort((a, b) => a.fromHomeTiles - b.fromHomeTiles);
    }
    const near = (d, m) => { let best = -1; for (let y = m.ty - 2; y <= m.ty + 4; y++) for (let x = m.tx - 2; x <= m.tx + 4; x++) if (inb(x, y) && d[idx(x, y)] >= 0 && (best < 0 || d[idx(x, y)] < best)) best = d[idx(x, y)]; return best < 0 ? null : best; };
    const expansions = G.mines.filter((m) => Math.hypot(cx(m) - hx, cy(m) - hy) > 10 && Math.hypot(cx(m) - fx, cy(m) - fy) > 10)
      .map((m) => ({ at: [Math.round(cx(m)), Math.round(cy(m))], fromHomeTiles: near(dh, m), fromEnemyTiles: near(df, m) }))
      .sort((a, b) => (a.fromHomeTiles ?? 999) - (b.fromHomeTiles ?? 999));
    let water = 0; for (let i = 0; i < N; i++) if (G.terrain[i] === WATER) water++;
    G.agent.terrain = { cellTiles: C, legend: '. ground, T forest (cut for lumber; blocks walking), ~ water, ^ rock, H our hall, E enemy start, G gold mine; row r, column c covers tiles x c*' + C + '.., y r*' + C + '..',
      grid, mapTiles: [MW, MH], waterPercent: Math.round(100 * water / N), home: [hx, hy], enemyStart: [fx, fy],
      route: route || 'no ground route: the enemy base is reachable only by sea (transports) or air', chokes, expansions, oilPatches: G.oils.length };
    return G.agent.terrain;
  }
  // enemy groups in sight with their movement since the last look: heading (toward our base or away), speed, and an
  // arrival estimate; kept outside the simulation (G.agent), like the sightings
  function agentThreats(O, foeGroups, home) {
    const prev = G.agent.pos || {}, now = G.time, cur = {};
    const out = foeGroups.map((g) => {
      let vx = 0, vy = 0, n = 0;
      for (const u of g.units) { cur[u.id] = [u.x, u.y, now]; const p = prev[u.id]; if (p && now - p[2] > 0.2 && now - p[2] < 6) { vx += (u.x - p[0]) / (now - p[2]); vy += (u.y - p[1]) / (now - p[2]); n++; } }
      const e = { at: [Math.round(g.x), Math.round(g.y)], n: g.units.length, types: {}, fromHome: home ? Math.round(Math.hypot(g.x - home.x, g.y - home.y)) : null };
      for (const u of g.units) e.types[u.type] = (e.types[u.type] || 0) + 1;
      e.fighters = g.units.filter((u) => keyOf(u) !== 'worker' && keyOf(u) !== 'tanker' && (UNIT_DEFS[u.type].combat || UNIT_DEFS[u.type].mana)).length;
      if (n && home) {
        vx /= n; vy /= n; const sp = Math.hypot(vx, vy), dist = Math.hypot(g.x - home.x, g.y - home.y);
        const closing = dist > 0 ? -(vx * (g.x - home.x) + vy * (g.y - home.y)) / dist : 0;
        e.moving = sp < 0.15 ? 'standing' : closing > 0.5 * sp ? 'toward our base' : closing < -0.5 * sp ? 'away from our base' : 'across';
        e.speedTilesPerSec = r1(sp);
        if (closing > 0.15) e.etaSeconds = Math.round(dist / closing);
      }
      return e;
    });
    G.agent.pos = cur;
    return out;
  }
  function agentObserve() {
    const O = agentSide(), F = foeOf(O), P = G.players[O], race = raceOf(O);
    const mine = G.units.filter((u) => u.owner === O && !u.aboard), blds = G.buildings.filter((b) => b.owner === O);
    const hall = blds.find((b) => BLD_DEFS[b.type].provides.includes('hall'));
    const home = hall ? { x: r1(cx(hall)), y: r1(cy(hall)) } : null;
    const foeStart = { x: MW - 1 - (home ? home.x : 0), y: MH - 1 - (home ? home.y : 0) };   // the maps are point-symmetric
    const visible = (e) => O !== 'player' ? seenBy(O, e) : G.vis[idx(e.tx, e.ty)] === 2;
    const count = (list, f) => { const o = {}; for (const e of list) { const k = f(e); o[k] = (o[k] || 0) + 1; } return o; };
    const workers = mine.filter((u) => keyOf(u) === 'worker');
    const army = mine.filter((u) => UNIT_DEFS[u.type].combat || UNIT_DEFS[u.type].mana);
    // income over the last minute, from the gathered totals (the agent's bookkeeping in G.agent, outside the simulation)
    const income = (() => {
      const h = G.agent.inc || (G.agent.inc = []), st = G.stats[O];
      if (!h.length || G.time - h[h.length - 1].t >= 5) h.push({ t: G.time, g: st.gold, l: st.lumber });
      while (h.length > 2 && G.time - h[1].t >= 60) h.shift();
      const a = h[0], span = Math.max(1, G.time - a.t);
      return { goldPerMin: Math.round((st.gold - a.g) * 60 / span), lumberPerMin: Math.round((st.lumber - a.l) * 60 / span), overSeconds: Math.round(span) };
    })();
    // the army in clusters (units within 6 tiles of each other), so the view stays short however big it gets
    const groups = [];
    for (const u of army) { let g = groups.find((g) => Math.hypot(g.x - u.x, g.y - u.y) < 6); if (!g) { g = { x: u.x, y: u.y, units: [] }; groups.push(g); } g.units.push(u); }
    const fogFoes = G.units.filter((e) => e.owner === F && !e.hidden && !e.aboard && visible(e) && !cloaked(e));
    const foeGroups = [];
    for (const u of fogFoes) { let g = foeGroups.find((g) => Math.hypot(g.x - u.x, g.y - u.y) < 6); if (!g) { g = { x: u.x, y: u.y, units: [] }; foeGroups.push(g); } g.units.push(u); }
    const known = O === 'player' ? Array.from(G.memory.values()).filter((m) => m.owner === F) : G.buildings.filter((b) => b.owner === F && seenBy(O, b));
    const f = food(O), ai = aiOf(O);
    const terr = agentTerrain(), threats = agentThreats(O, foeGroups, home);
    const dist = (e) => home ? Math.round(Math.hypot(ex(e) - home.x, ey(e) - home.y)) : null;
    return {
      time: Math.round(G.time), race, gold: P.gold, lumber: P.lumber, oil: P.oil, food: f.used + '/' + f.cap,
      home, foeStart, mapSize: MW,
      workers: { total: workers.length, gold: workers.filter((w) => w.gatherType === 'gold' && w.order === 'gather').length, wood: workers.filter((w) => w.gatherType === 'tree' && w.order === 'gather').length, building: workers.filter((w) => w.order === 'build').length, idle: workers.filter((w) => w.order === 'idle').length },
      army: count(army, (u) => u.type),
      armyGroups: groups.map((g) => ({ at: [Math.round(g.x), Math.round(g.y)], n: g.units.length, types: count(g.units, (u) => u.type), hp: Math.round(100 * g.units.reduce((a, u) => a + u.hp, 0) / g.units.reduce((a, u) => a + u.maxHp, 0)) + '%', fromHome: dist({ x: g.x, y: g.y, kind: 'unit' }), order: count(g.units, (u) => u.wave ? 'in attack wave' : u.task === 'home' ? 'returning home' : u.order),
        // (walking time home: straight distance x 1.5 for the route, at the slowest unit's pace)
        etaHomeSeconds: home ? Math.round(Math.hypot(g.x - home.x, g.y - home.y) * 1.5 / Math.min(...g.units.map((u) => UNIT_DEFS[u.type].tps || 1))) : null })),
      // enemy attacks on our base seen so far (3+ fighters within 22 tiles of the hall; sightings within 60 s are one wave)
      enemyWaves: (() => {
        const W = G.agent.waves || (G.agent.waves = []);
        const n = home ? fogFoes.filter((e) => UNIT_DEFS[e.type].combat && Math.hypot(e.x - home.x, e.y - home.y) <= 22).length : 0;
        if (n >= 3) { const w = W[W.length - 1]; if (w && G.time - w.last < 60) { w.size = Math.max(w.size, n); w.last = G.time; } else W.push({ t: G.time, last: G.time, size: n }); }
        if (!W.length) return undefined;
        const gaps = W.slice(1).map((w, i) => w.t - W[i].t);
        return { seen: W.slice(-5).map((w) => ({ at: mmss(w.t), size: w.size })), lastWaveAgoSeconds: Math.round(G.time - W[W.length - 1].t),
          averageGapSeconds: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : undefined };
      })(),
      // land fighters with no wave, squad or scouting trip (what attack:base and hold:choke would send)
      freeArmy: army.filter((u) => dom(u) === 'ground' && UNIT_DEFS[u.type].combat && !u.wave && !u.scout && !u.guard && (!u.task || u.task === 'home')).length,
      ships: count(mine.filter((u) => dom(u) === 'water'), (u) => u.type),
      buildings: count(blds.filter((b) => b.done), (b) => b.type),
      busy: blds.filter((b) => b.training || b.research || !b.done).map((b) => b.type + ': ' + (b.training ? 'training ' + b.training.type : b.research ? 'researching ' + b.research.upgrade : Math.round(b.progress * 100) + '% built')),
      damaged: blds.filter((b) => b.done && b.hp < b.maxHp * 0.7).map((b) => b.type + ' ' + Math.round(100 * b.hp / b.maxHp) + '%'),
      upgrades: P.upgrades.slice(),
      enemySeen: threats,
      // (fighting units only: a peon walking our way is no attack)
      incoming: threats.filter((e) => e.fighters > 0 && e.moving === 'toward our base' && (e.etaSeconds || 999) <= 90).map((e) => ({ n: e.fighters, types: e.types, at: e.at, etaSeconds: e.etaSeconds })),
      fights: groups.map((g) => { const near = fogFoes.filter((e) => g.units.some((u) => Math.hypot(e.x - u.x, e.y - u.y) < 7)); return near.length ? { ours: [Math.round(g.x), Math.round(g.y)], n: g.units.length, hp: Math.round(100 * g.units.reduce((a, u) => a + u.hp, 0) / g.units.reduce((a, u) => a + u.maxHp, 0)) + '%', enemies: near.length, enemyTypes: count(near, (u) => u.type), wounded: g.units.filter((u) => u.hp < u.maxHp * 0.4).length } : null; }).filter(Boolean),
      mapSummary: terr ? { route: terr.route, chokes: terr.chokes, expansions: terr.expansions.slice(0, 4), waterPercent: terr.waterPercent } : null,
      enemyBuildingsKnown: known.map((m) => ({ type: m.type, at: [m.tx, m.ty] })),
      // (hits near one of our halls only: a fight out on the map is reported under fights, not as an attack on us)
      underAttack: ai.alarm && ai.alarm.home && G.time - ai.alarm.t < 10 ? (() => { const a = G.ents.get(ai.alarm.id); return a ? { by: a.type, at: [Math.round(ex(a)), Math.round(ey(a))] } : true; })() : false,
      goldMines: G.mines.filter((m) => G.vis[idx(m.tx, m.ty)] || O !== 'player').map((m) => { const ours = blds.some((b) => BLD_DEFS[b.type].provides.includes('hall') && rectGap(b, m) <= 6);
        return { at: [m.tx + 1, m.ty + 1], gold: m.amount, fromHome: dist(m), ours, minutesLeft: ours && income.goldPerMin > 0 ? Math.round(m.amount / income.goldPerMin * 10) / 10 : undefined }; }),
      income,
      raidersAtBase: hall ? baseRaiders(O).length : 0,
      attackWaves: agentWaves(O),
      enemyIntel: agentIntel(O, F, visible),
      stats: { kills: G.stats[O].kills, lost: G.stats[O].lost, razed: G.stats[O].razed },
      enemyLastSeen: agentSightings(O, fogFoes),
      counts: agentCounts(O),
      idleProducers: blds.filter((b) => b.done && !b.training && !b.research && trainsUnits(b)).map((b) => b.type),
      // food: free places, farms going up, and how long training has been blocked by a full food cap (the agent's own
      // bookkeeping in G.agent, outside the simulation)
      supply: (() => {
        const f = food(O), free = f.cap - f.used, farmKey = B(O, 'farm');
        const up = blds.filter((b) => b.type === farmKey && !b.done).length + mine.filter((u) => u.order === 'build' && u.build && u.build.type === farmKey).length;
        const m = G.agent.supply || (G.agent.supply = { since: null });
        if (free <= 0) { if (m.since === null) m.since = G.time; } else m.since = null;
        const fc = BLD_DEFS[farmKey].cost;
        return { free, farmsGoingUp: up, cappedForSeconds: m.since === null ? 0 : Math.round(G.time - m.since),
          nextFarmNeeds: P.lumber < fc.lumber || P.gold < fc.gold ? (P.lumber < fc.lumber ? (fc.lumber - P.lumber) + ' more lumber' : (fc.gold - P.gold) + ' more gold') : null };
      })(),
      // money promised to builders still walking to their sites (paid on arrival; the options leave it untouched)
      promisedToBuilders: (() => { const c = committedCost(O); return c.gold || c.lumber || c.oil ? c : undefined; })(),
      // builders that reached their site but could not put the building up (e.g. the money was gone), last 2 minutes
      buildsFailed: (G.buildFails || []).filter((x) => x.owner === O && G.time - x.t < 120).map((x) => ({ type: x.type, t: Math.round(x.t), why: x.why })),
      settings: G.agent && G.agent.cfg ? { lumberWorkersPct: G.agent.cfg.woodPct, homeGuard: G.agent.cfg.guard, guardsNow: mine.filter((u) => u.guard && !u.dead).length, placement: G.agent.cfg.place || {}, rally: G.agent.cfg.rally !== undefined ? G.agent.cfg.rally : 'front', rallyAt: aiOf(O).rallyC ? [aiOf(O).rallyC.x, aiOf(O).rallyC.y] : undefined } : undefined,
      // our base by zone: each zone's centre tile, our buildings nearest to it, and whether a 2x2 / 3x3 still fits there
      baseLayout: (() => {
        const base = blds.find((b) => BLD_DEFS[b.type].provides.includes('hall') && b.done); if (!base) return undefined;
        const memo = G.agent.layout;                                     // (a dozen site searches: redone every 10 s)
        if (memo && G.time - memo.t < 10 && memo.n === blds.length) return memo.v;
        const ap = approachPoint(O, base), z = agentZones(O, base), out = { enemyComesFrom: [ap.x, ap.y] }, names = Object.keys(z).filter((k) => k !== 'hall');
        for (const k of names) out[k] = { at: z[k], buildings: [], room2: !!findSpotNear(base, z[k][0], z[k][1], 2, 17), room3: !!findSpotNear(base, z[k][0], z[k][1], 3, 17) };
        out.hall = { at: z.hall, buildings: [] };
        for (const b of blds) {
          if (b === base) continue;
          let best = 'hall', bd = Math.hypot(cx(b) - z.hall[0], cy(b) - z.hall[1]) + 1.5;       // (a slight pull to the hall)
          for (const k of names) { const d = Math.hypot(cx(b) - z[k][0], cy(b) - z[k][1]); if (d < bd) { bd = d; best = k; } }
          out[best].buildings.push(b.type);
        }
        G.agent.layout = { t: G.time, n: blds.length, v: out };
        return out;
      })(),
      fogNote: 'Enemy counts cover what is visible now or was seen recently; missing units are unknown, not absent.',
    };
  }
  // our attack waves on the march: where each is, how far it still has to go, and who left it
  function agentWaves(O) {
    const ai = aiOf(O), out = [];
    for (const id of ai.waves || []) {
      const us = G.units.filter((u) => u.owner === O && !u.dead && u.wave === id && dom(u) === 'ground'); if (!us.length) continue;
      const m = ai.march && ai.march[id], x = us.reduce((a, u) => a + u.x, 0) / us.length, y = us.reduce((a, u) => a + u.y, 0) / us.length;
      const fc = marchFields.get(O + id), c = us.reduce((a, u) => (fc && fc.f[idx(u.tx, u.ty)] > a ? fc.f[idx(u.tx, u.ty)] : a), -1);
      const tps = Math.min(...us.map((u) => UNIT_DEFS[u.type].tps || 1));
      out.push({ id, stage: m ? m.stage : 'loose', members: us.length, types: (() => { const o = {}; for (const u of us) o[u.type] = (o[u.type] || 0) + 1; return o; })(), at: [Math.round(x), Math.round(y)],
        nextHop: m && m.wx != null ? [m.wx, m.wy] : undefined, routeLeftTiles: c >= 0 ? c : undefined, etaSeconds: c >= 0 ? Math.round(c / (tps * 0.7)) : undefined,
        inFight: us.filter((u) => u.targetId).length, enemyFightersNear: G.units.filter((e) => e.owner === foeOf(O) && !e.hidden && !e.dead && UNIT_DEFS[e.type].combat && Math.hypot(e.x - x, e.y - y) < 10 && (O !== 'player' || G.vis[idx(e.tx, e.ty)] === 2)).length });
    }
    return out;
  }
  // what we know about the enemy over the whole game (enemyLastSeen forgets after two minutes): every unit and building
  // type ever seen with the most at once, how long since we last saw their base, and the upgrades their visible units carry
  function agentIntel(O, F, visible) {
    const I = G.agent.intel || (G.agent.intel = { units: {}, blds: {}, baseT: null });
    const vu = G.units.filter((e) => e.owner === F && !e.hidden && !e.dead && visible(e)), vb = G.buildings.filter((b) => b.owner === F && visible(b));
    const now = Math.round(G.time), by = (l) => { const o = {}; for (const e of l) o[e.type] = (o[e.type] || 0) + 1; return o; };
    for (const [k, n] of Object.entries(by(vu))) { const r = I.units[k] || (I.units[k] = { most: 0, first: now }); r.most = Math.max(r.most, n); r.last = now; }
    for (const [k, n] of Object.entries(by(vb))) { const r = I.blds[k] || (I.blds[k] = { most: 0, first: now }); r.most = Math.max(r.most, n); r.last = now; }
    if (vb.length) I.baseT = now;
    const t2u = ['knight', 'paladin', 'ogre', 'ogre_mage', 'mage', 'death_knight', 'ballista', 'catapult', 'ranger', 'berserker'];
    const t2 = Object.keys(I.units).some((k) => t2u.includes(k)) || Object.keys(I.blds).some((k) => /keep|stronghold|castle|fortress|stables|ogre_mound|mound/.test(k));
    const keys = new Set(vu.map((e) => UNIT_DEFS[e.type].key));
    const ups = G.players[F].upgrades.filter((id) => UPGRADES[id] && UPGRADES[id].effect && UPGRADES[id].effect.units && UPGRADES[id].effect.units.some((k) => keys.has(k)));
    return { unitsEverSeen: I.units, buildingsEverSeen: I.blds, sawTheirBuildingsSecondsAgo: I.baseT === null ? 'never' : now - I.baseT,
      tier2Seen: t2, upgradesOnVisibleUnits: ups };
  }
  // enemy units by type: the most seen at once, and when and where last seen (kept 120 s); the agent's memory only,
  // outside the simulation (it lives in G.agent and nothing in the game reads it)
  function agentSightings(O, visibleFoes) {
    const mem = G.agent.seen || (G.agent.seen = {}), now = Math.round(G.time);
    const byType = {}; for (const u of visibleFoes) (byType[u.type] || (byType[u.type] = [])).push(u);
    for (const [type, us] of Object.entries(byType)) { const m = mem[type] || (mem[type] = { most: 0 }); m.now = us.length; m.most = Math.max(m.most, us.length); m.t = now; m.at = [Math.round(ex(us[0])), Math.round(ey(us[0]))]; }
    const out = {};
    for (const [type, m] of Object.entries(mem)) { if (!byType[type]) m.now = 0; if (now - m.t <= 120) out[type] = { visibleNow: m.now, mostSeen: m.most, lastSeenSecondsAgo: now - m.t, lastSeenAt: m.at }; }
    return out;
  }
  // how many of each action key we have, counting what is being trained, built or researched (for plan goals)
  function agentCounts(O) {
    const out = {}, add = (k, n) => { out[k] = (out[k] || 0) + (n || 1); };
    for (const u of G.units) if (u.owner === O && !u.dead) add('train:' + u.type);
    for (const b of G.buildings) if (b.owner === O) {
      add('build:' + b.type);
      if (b.training) add('train:' + b.training.type);
      if (b.research) add('research:' + b.research.upgrade);
    }
    for (const u of G.units) if (u.owner === O && u.order === 'build' && u.build) add('build:' + u.build.type);
    for (const id of G.players[O].upgrades) out['research:' + id] = 1;
    // an in-place upgrade (Keep, Castle, Guard Tower) is not kept in the upgrade list: it counts as done while a
    // building of what it becomes (or of a later tier) stands
    const later = { keep: ['keep', 'castle'], castle: ['castle'] };
    for (const [id, up] of Object.entries(UPGRADES)) if (up.becomes && G.buildings.some((b) => b.owner === O && (later[up.becomes] || [up.becomes]).includes(BLD_DEFS[b.type].key))) out['research:' + id] = Math.max(out['research:' + id] || 0, 1);
    return out;
  }
  // the macro actions that can be carried out right now, each with a key, a short label and its cost
  // repair under fire (the automatic repair waits until no enemy is near): the most valuable damaged building that
  // enemies are at now; towers first, then the hall, then producers; up to 2 workers (3 for a hall) at a time
  function repairUnderFire(O, blds, workers, maxFoes) {
    const P = G.players[O]; if (P.gold < 100 || P.lumber < 100) return null;
    const foesAt = (b) => G.units.filter((e) => e.owner === foeOf(O) && !e.hidden && UNIT_DEFS[e.type].combat && Math.hypot(e.x - cx(b), e.y - cy(b)) < BLD_DEFS[b.type].size + 6).length;
    const rank = (b) => { const k = BLD_DEFS[b.type].key; return /tower/.test(k) || k === 'scout' ? 0 : BLD_DEFS[b.type].provides.includes('hall') ? 1 : trainsUnits(b) ? 2 : 3; };
    const hit = blds.filter((b) => b.done && b.hp < b.maxHp * 0.75 && G.time - (b.hitT || -1e9) < 5 &&
      G.units.some((e) => e.owner === foeOf(O) && !e.hidden && Math.hypot(e.x - cx(b), e.y - cy(b)) < BLD_DEFS[b.type].size + 6));
    hit.sort((a, b) => rank(a) - rank(b) || a.hp / a.maxHp - b.hp / b.maxHp);
    for (const b of hit) {
      if (maxFoes !== undefined && foesAt(b) > maxFoes) continue;
      const want = rank(b) === 1 ? 3 : 2, have = workers.filter((w) => w.order === 'repair' && w.targetId === b.id).length;
      const free = workers.filter((w) => w.order === 'gather' || w.order === 'idle').sort((x, y) => Math.hypot(x.x - cx(b), x.y - cy(b)) - Math.hypot(y.x - cx(b), y.y - cy(b)));
      if (have < want && free.length) return { b, ws: free.slice(0, want - have) };
    }
    return null;
  }
  // standing settings from the agent's plan: woodPct (share of the workers on lumber; null = automatic from the stocks)
  // and guard (fighting units kept at home when the army is sent out). They steer the simulation, so they come in
  // as recorded inputs.
  function agentSet(d) {
    if (!G.agent) return null;
    const c = G.agent.cfg || (G.agent.cfg = { woodPct: null, guard: 0 });
    if (d && 'woodPct' in d) c.woodPct = d.woodPct === null || d.woodPct === undefined ? null : Math.max(0, Math.min(90, +d.woodPct || 0));
    if (d && 'guard' in d) c.guard = Math.max(0, Math.min(12, Math.round(+d.guard || 0)));
    if (d && 'rally' in d) {                                 // a zone name, a [x, y] tile, or 'off'
      const v = d.rally;
      if (typeof v === 'string' && (ZONES.includes(v) || v === 'off')) c.rally = v;
      else if (Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(+n))) c.rally = [Math.max(0, Math.min(MW - 1, Math.round(+v[0]))), Math.max(0, Math.min(MH - 1, Math.round(+v[1])))];
      if (G.agent.side && aiOf(G.agent.side)) aiOf(G.agent.side).rallyC = null;
    }
    if (d && 'place' in d) {                                 // {building type or key: zone name | [x, y] | 'auto'}
      c.place = {};
      for (const [k, v] of Object.entries(d.place || {})) {
        if (!BLD_DEFS[k] && !Object.values(BLD_DEFS).some((b) => b.key === k)) continue;
        if (typeof v === 'string' && (ZONES.includes(v) || v === 'auto')) c.place[k] = v;
        else if (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))) c.place[k] = [Math.max(0, Math.min(MW - 1, Math.round(+v[0]))), Math.max(0, Math.min(MH - 1, Math.round(+v[1])))];
        else if (Array.isArray(v) && v.length && v.every((n) => ZONES.includes(n))) c.place[k] = v.slice(0, 6);
      }
    }
    return Object.assign({}, c);
  }
  function agentActions() {
    const O = agentSide(), race = raceOf(O), R = RACES[race], P = G.players[O], out = [];
    const blds = G.buildings.filter((b) => b.owner === O), mine = G.units.filter((u) => u.owner === O && !u.aboard);
    const idleAt = (pred) => blds.find((b) => b.done && !b.training && !b.research && pred(b));
    const costTxt = (c) => Object.entries(c || {}).filter(([, v]) => v).map(([k, v]) => v + ' ' + k).join(', ');
    // a builder pays when it reaches its site: money promised to builders still walking is not free to spend (an
    // order that spent it made the builder give up without a word, and the building was never put up)
    const owed = committedCost(O), tight = (c) => ['gold', 'lumber', 'oil'].some((r) => ((c || {})[r] || 0) + owed[r] > P[r]);
    for (const type of Object.values(R.units)) {
      const d = UNIT_DEFS[type]; if (!d.cost || !trainable(O, type)) continue;
      const b = idleAt((x) => trainsAt(x, type)); if (!b || trainWhy(O, b, type) || tight(d.cost)) continue;
      out.push({ key: 'train:' + type, label: 'Train a ' + nameOf(O, type) + ' (' + costTxt(d.cost) + ')' });
    }
    const workers = mine.filter((u) => keyOf(u) === 'worker' && !u.hidden);
    for (const [role, type] of Object.entries(R.buildings)) {
      const d = BLD_DEFS[type];
      if (d.upgradeOf || d.wall || role === 'hall') continue;
      // one of each tech building (counting those under way); a few barracks and towers; farms as needed
      const have = blds.filter((b) => BLD_DEFS[b.type].key === role).length + mine.filter((u) => u.order === 'build' && u.build && BLD_DEFS[u.build.type].key === role).length;
      const cap = role === 'farm' ? 99 : role === 'barracks' ? 3 : role === 'scout' ? 4 : d.onOil ? 4 : 1;
      if (have >= cap) continue;
      // a builder must be free: every worker already off building or repairing makes the order fail
      if (d.onOil ? !mine.some((u) => keyOf(u) === 'tanker') : !workers.some((x) => x.order !== 'build' && x.order !== 'repair')) continue;
      if (buildWhy(O, type) || tight(d.cost)) continue;
      if (d.onOil && !G.oils.some((o) => !G.buildings.some((b) => BLD_DEFS[b.type].onOil && b.tx === o.tx && b.ty === o.ty))) continue;
      out.push({ key: 'build:' + type, label: 'Build a ' + nameOf(O, type) + ' (' + costTxt(d.cost) + ')' });
    }
    for (const id of Object.keys(UPGRADES)) {
      if (!upAvail(id, race)) continue;
      const b = idleAt((x) => UPGRADES[id].at === BLD_DEFS[x.type].key); if (!b || researchWhy(O, b, id) || tight(upInfo(id, race).cost)) continue;
      const up = UPGRADES[id];
      out.push({ key: 'research:' + id, label: (up.becomes ? 'Upgrade to ' + nameOf(O, B(O, up.becomes)) : 'Research ' + upLabel(id, race)) + ' (' + costTxt(upInfo(id, race).cost) + ')' });
    }
    const halls = blds.filter((b) => BLD_DEFS[b.type].provides.includes('hall'));
    const hallOnWay = mine.some((u) => u.order === 'build' && u.build && BLD_DEFS[u.build.type].provides.includes('hall'));
    if (workers.length && !hallOnWay && !buildWhy(O, B(O, 'hall')) && !tight(BLD_DEFS[B(O, 'hall')].cost) && halls.length && expandSite(O, halls[0])) out.push({ key: 'expand', label: 'Build a new ' + nameOf(O, B(O, 'hall')) + ' at the nearest free gold mine (' + costTxt(BLD_DEFS[B(O, 'hall')].cost) + ')' });
    const army = mine.filter((u) => UNIT_DEFS[u.type].combat && dom(u) !== 'water');
    const free0 = army.filter((u) => !u.wave);
    if (army.length) {
      // (3 or more: a wave of one or two is called off and sent home at once)
      const hall0 = blds.find((b) => BLD_DEFS[b.type].provides.includes('hall')), hx0 = hall0 ? cx(hall0) : 0, hy0 = hall0 ? cy(hall0) : 0;
      const eta = (list, x, y) => list.length ? Math.round(Math.max(...list.map((u) => Math.hypot(u.x - x, u.y - y) * 1.5 / (UNIT_DEFS[u.type].tps || 1)))) : 0;
      const raiders = hall0 ? baseRaiders(O) : [];
      const guards = free0.filter((u) => u.guard).length, want = (G.agent.cfg && G.agent.cfg.guard) || 0, goes = Math.max(0, free0.length - Math.max(guards, want));
      const fs = { x: MW - 1 - hx0, y: MH - 1 - hy0 };
      const lead = leadWave(O, army, hx0, hy0);
      if (lead && goes > 0) out.push({ key: 'attack:base', label: 'Send ' + goes + ' free units (' + Math.max(guards, want) + ' stay as home guard) to JOIN the attack wave of ' + lead.n + ' at ' + lead.x + ',' + lead.y + ' (about ' + eta(free0.filter((u) => !u.guard), lead.x, lead.y) + ' s to reach it; they walk there alone)' });
      else if (free0.length >= 3) out.push({ key: 'attack:base', label: 'Send the free army (' + goes + ' of ' + free0.length + '; ' + Math.max(guards, want) + ' stay as home guard) to attack the enemy base, gathering first; about ' + Math.round(eta(free0, fs.x, fs.y) * 1.3 + 25) + ' s to get there' });
      out.push({ key: 'attack:nearest', label: raiders.length ? 'Send the whole army at the ' + raiders.length + ' enemy fighters at OUR base (the farthest unit is about ' + eta(army, hx0, hy0) + ' s away)' : 'Send the army at the nearest known enemy' });
      const awayU = army.filter((u) => Math.hypot(u.x - hx0, u.y - hy0) > 15);
      out.push({ key: 'defend', label: 'Bring the army home to defend our base: ' + awayU.length + ' units away march home without stopping (the farthest about ' + eta(awayU, hx0, hy0) + ' s), then fight within 15 tiles' + (raiders.length ? '; the units at home attack the ' + raiders.length + ' enemy fighters at our base now' : '') });
    }
    const free = army.filter((u) => !u.wave), terr = agentTerrain(), tgt = agentTargets(O);
    if (free.length && tgt.expansion) out.push({ key: 'attack:expansion', label: 'Send the free army (' + free.length + ') at the known enemy expansion at ' + tgt.expansion.at.join(',') });
    if (free.length >= 3 && tgt.workers) out.push({ key: 'harass:workers', label: 'Send a raiding squad (the ' + Math.min(5, free.length) + ' fastest free units) at the enemy workers at ' + tgt.workers.at.join(',') + '; the rest stay' });
    const choke = terr && terr.chokes[0], cen = free.length ? { x: free.reduce((a, u) => a + u.x, 0) / free.length, y: free.reduce((a, u) => a + u.y, 0) / free.length } : null;
    if (choke && cen && Math.hypot(cen.x - choke.at[0], cen.y - choke.at[1]) > 5) out.push({ key: 'hold:choke', label: 'Move the free army (' + free.length + ') to hold the choke at ' + choke.at.join(',') + ' (' + choke.widthTiles + ' tiles wide, ' + choke.fromHomeTiles + ' from home)' });
    const foesNear = (u) => G.units.some((e) => e.owner === foeOf(O) && !e.hidden && Math.hypot(e.x - u.x, e.y - u.y) < 7);
    const homeB = blds.find((b) => BLD_DEFS[b.type].provides.includes('hall'));
    const away = (u) => !homeB || Math.hypot(u.x - cx(homeB), u.y - cy(homeB)) > 14;
    const hurt = army.filter((u) => u.hp < u.maxHp * 0.4 && !u.pulled && away(u) && foesNear(u));
    const rf = repairUnderFire(O, blds, workers);
    if (rf) out.push({ key: 'repair:under_fire', label: 'Send ' + rf.ws.length + ' worker' + (rf.ws.length > 1 ? 's' : '') + ' to repair the ' + nameOf(O, rf.b.type) + ' at ' + Math.round(cx(rf.b)) + ',' + Math.round(cy(rf.b)) +
      ' (' + Math.round(rf.b.hp) + '/' + rf.b.maxHp + ' hp) while it is under attack; each repair step costs gold and lumber and the workers can be hit' });
    if (hurt.length) out.push({ key: 'pull_wounded', label: 'Pull the ' + hurt.length + ' badly wounded units in fights away from home back to the base (the rest keep fighting; at home they defend it again)' });
    if (army.length && !mine.some((u) => u.scout && !u.dead)) {
      out.push({ key: 'scout:enemy_base', label: 'Send one fast unit to look at the enemy base' });
      out.push({ key: 'scout:expansions', label: 'Send one fast unit round the other gold mines' });
    } else if (!army.length && workers.length > 6 && !mine.some((u) => u.scout && !u.dead)) out.push({ key: 'scout:enemy_base', label: 'Send one worker to look at the enemy base' });
    // workers in reach of raiders at home can be taken out of the way (evacuate) and sent back (resume)
    {
      const hallE = blds.find((b) => BLD_DEFS[b.type].provides.includes('hall'));
      const foes = hallE ? baseRaiders(O) : [];
      const inDanger = workers.filter((w) => !w.evac && foes.some((e) => Math.hypot(e.x - w.x, e.y - w.y) < 7));
      if (inDanger.length && foes.length >= 2) out.push({ key: 'workers:evacuate', label: 'Take the ' + inDanger.length + ' workers near the ' + foes.length + ' enemy fighters at our base out of the way (lumber cutters switch to the gold mine if it is safe, the rest run toward our army or away; each goes back to work once its site is clear)' });
      const evac = mine.filter((u) => u.evac && !u.dead).length;
      if (evac) out.push({ key: 'workers:resume', label: 'Send the ' + evac + ' evacuated workers back to gathering' + (foes.length ? ' (' + foes.length + ' enemy fighters are still at our base)' : '') });
    }
    if (army.some((u) => u.wave || u.order === 'attackMove' || u.order === 'attack')) out.push({ key: 'retreat', label: 'Pull every unit back home without stopping to fight (disengage)' });
    const fleet = mine.filter((u) => dom(u) === 'water' && UNIT_DEFS[u.type].combat);
    if (fleet.length) out.push({ key: 'attack:sea', label: 'Send the fleet (' + fleet.length + ') against enemy ships and coast' });
    out.push({ key: 'wait', label: 'Do nothing new this turn (save up)' });
    return out;
  }
  // targets the agent's orders can name: a known enemy hall away from their start (an expansion), and the enemy's
  // workers (the gold mine by their main hall: a known hall if any, else the mine nearest their start)
  function agentTargets(O) {
    const F = foeOf(O), hall = G.buildings.find((b) => b.owner === O && BLD_DEFS[b.type].provides.includes('hall'));
    if (!hall) return {};
    const fx = MW - 1 - cx(hall), fy = MH - 1 - cy(hall);
    const known = O === 'player' ? Array.from(G.memory.values()).filter((m) => m.owner === F) : G.buildings.filter((b) => b.owner === F && seenBy(O, b));
    const halls = known.filter((m) => BLD_DEFS[m.type] && BLD_DEFS[m.type].provides.includes('hall'));
    const hp = (m) => ({ x: m.tx + BLD_DEFS[m.type].size / 2, y: m.ty + BLD_DEFS[m.type].size / 2 });
    const exp = halls.map(hp).filter((p) => Math.hypot(p.x - fx, p.y - fy) > 10).sort((a, b) => Math.hypot(a.x - cx(hall), a.y - cy(hall)) - Math.hypot(b.x - cx(hall), b.y - cy(hall)))[0];
    const main = halls.map(hp).sort((a, b) => Math.hypot(a.x - fx, a.y - fy) - Math.hypot(b.x - fx, b.y - fy))[0] || { x: fx, y: fy };
    const mine = G.mines.slice().sort((a, b) => Math.hypot(cx(a) - main.x, cy(a) - main.y) - Math.hypot(cx(b) - main.x, cy(b) - main.y))[0];
    const w = mine ? { x: (cx(mine) + main.x) / 2, y: (cy(mine) + main.y) / 2 } : main;
    return { expansion: exp ? { x: exp.x, y: exp.y, at: [Math.round(exp.x), Math.round(exp.y)] } : null, workers: { x: w.x, y: w.y, at: [Math.round(w.x), Math.round(w.y)] } };
  }
  // a hall site at the nearest free gold mine (the same search the native AI uses)
  function expandSite(O, base) {
    const halls = G.buildings.filter((b) => b.owner === O && BLD_DEFS[b.type].provides.includes('hall'));
    const near = (m, bs, r) => bs.some((b) => Math.hypot(cx(m) - cx(b), cy(m) - cy(b)) < r);
    const type = B(O, 'hall'), dist = walkDist(base), foe = G.buildings.filter((b) => b.owner !== O);
    const reach = (x, y) => inb(x, y) && dist[idx(x, y)] >= 0;
    const cands = [];
    for (const m of G.mines) {
      if (m.amount < 5000 || near(m, halls, 10) || near(m, foe, 12)) continue;
      for (let y = m.ty - 8; y <= m.ty + 8; y++) for (let x = m.tx - 8; x <= m.tx + 8; x++) {
        const f = { tx: x, ty: y, size: 4, type };
        let d = 1e9;
        for (let yy = y - 1; yy <= y + 4; yy++) for (let xx = x - 1; xx <= x + 4; xx++) if (reach(xx, yy)) d = Math.min(d, dist[idx(xx, yy)]);
        if (d === 1e9 || siteWhy(f)) continue;
        cands.push({ score: rectGap(f, m) * 40 + d, x: x + 1.5, y: y + 1.5, f, m });
      }
    }
    // the best site that leaves the mine and the new hall both reachable from the base (a hall dropped in the only
    // passage to its mine seals the mine off: the workers can never reach it)
    cands.sort((a, b) => a.score - b.score);
    for (const c of cands.slice(0, 8)) if (!sealsOff(base, c.f, c.m)) return c;
    return null;
  }
  // the ground reachable from beside a building with footprint f filled in (f null: as the map stands)
  // (seed: start from that one tile only; from every tile round the building, two sides it splits still both count)
  function reachWith(base, f, seed) {
    const inF = (x, y) => !!f && x >= f.tx && x < f.tx + f.size && y >= f.ty && y < f.ty + f.size;
    const d = new Uint8Array(N), q = [];
    if (seed !== undefined) { if (!inF(seed % MW, (seed / MW) | 0)) { d[seed] = 1; q.push(seed); } }
    else for (let y = base.ty - 1; y <= base.ty + base.size; y++) for (let x = base.tx - 1; x <= base.tx + base.size; x++) if (inb(x, y) && sPass(x, y) && !inF(x, y)) { d[idx(x, y)] = 1; q.push(idx(x, y)); }
    const ok = (x, y) => sPass(x, y) && !inF(x, y);
    for (let h = 0; h < q.length; h++) { const x = q[h] % MW, y = (q[h] / MW) | 0; for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny) || !ok(nx, ny) || (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy)))) continue; const ni = idx(nx, ny); if (!d[ni]) { d[ni] = 1; q.push(ni); } } }
    return d;
  }
  // walking steps from one tile with footprint f blocked (-1: out of reach), and the fewest steps to stand next to b
  function stepsWith(f, seed) {
    const inF = (x, y) => !!f && x >= f.tx && x < f.tx + f.size && y >= f.ty && y < f.ty + f.size;
    const d = new Int32Array(N).fill(-1), q = [seed]; d[seed] = 0;
    const ok = (x, y) => sPass(x, y) && !inF(x, y);
    for (let h = 0; h < q.length; h++) { const x = q[h] % MW, y = (q[h] / MW) | 0; for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (!inb(nx, ny) || !ok(nx, ny) || d[idx(nx, ny)] >= 0 || (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy)))) continue; d[idx(nx, ny)] = d[q[h]] + 1; q.push(idx(nx, ny)); } }
    return d;
  }
  const ringMin = (d, b) => { let m = -1; for (let y = b.ty - 1; y <= b.ty + b.size; y++) for (let x = b.tx - 1; x <= b.tx + b.size; x++) if (inb(x, y) && d[idx(x, y)] >= 0 && (m < 0 || d[idx(x, y)] < m)) m = d[idx(x, y)]; return m; };
  const ringIn = (d, b) => { for (let y = b.ty - 1; y <= b.ty + b.size; y++) for (let x = b.tx - 1; x <= b.tx + b.size; x++) if (inb(x, y) && d[idx(x, y)]) return true; return false; };
  // cutter(base)(f): would a building on footprint f wall off ground from the base (a pocket, the foe's hall, our mine)?
  // Farms set wall to wall closed pockets with workers inside, and a mill in a 4-tile corridor cut a base off its mine.
  // a unit already fighting: a live target within reach, or a swing on its way. A new order would cancel the swing
  // (resetOrder), and an order re-issued every second kept whole fights from landing a blow: 9 footmen died for 1 kill
  function fighting(u) {
    if (u.strike) return true;
    const t = u.targetId && G.ents.get(u.targetId);
    return !!t && !t.dead && (u.order === 'attack' || u.order === 'attackMove') && rectEuclid(u.tx, u.ty, t) <= rangeOf(u) + 1.5;
  }
  // enemy fighters raiding our base: within 8 tiles of any of our buildings, or 6 of a worker at home (the base
  // reaches 20+ tiles from the hall: a raid on the woodline counted as nothing when 'home' was the hall alone)
  function baseRaiders(O) {
    const F = foeOf(O), halls = G.buildings.filter((b) => b.owner === O && BLD_DEFS[b.type].provides.includes('hall'));
    const blds = G.buildings.filter((b) => b.owner === O && !BLD_DEFS[b.type].wall);
    const ws = G.units.filter((w) => w.owner === O && !w.hidden && !w.dead && keyOf(w) === 'worker' && halls.some((h) => Math.hypot(w.x - cx(h), w.y - cy(h)) < 25));
    return G.units.filter((e) => e.owner === F && !e.hidden && !e.dead && UNIT_DEFS[e.type].combat && dom(e) !== 'water' && (O !== 'player' || G.vis[idx(e.tx, e.ty)] === 2) &&
      (blds.some((b) => rectEuclid(e.tx, e.ty, b) < 8) || ws.some((w) => Math.hypot(w.x - e.x, w.y - e.y) < 6)));
  }
  // the agent's main land wave out on the map: the one with the most members, 20+ tiles from home (null if none)
  function leadWave(O, army, hx, hy) {
    let best = null;
    for (const id of aiOf(O).waves || []) {
      const us = army.filter((u) => u.wave === id && dom(u) === 'ground'); if (us.length < 3) continue;
      const x = us.reduce((a, u) => a + u.x, 0) / us.length, y = us.reduce((a, u) => a + u.y, 0) / us.length;
      if (Math.hypot(x - hx, y - hy) < 20) continue;
      if (!best || us.length > best.n) best = { id, n: us.length, x: Math.round(x), y: Math.round(y) };
    }
    return best;
  }
  function cutter(base) {
    const O = base.owner, m = nearestPatch(G.mines, cx(base), cy(base));
    const goals = G.buildings.filter((b) => b.owner !== O && BLD_DEFS[b.type].provides.includes('hall')).concat(m ? [m] : []);
    // one seed: the open tile beside the building nearest our mine (the miners' side); a building on it is refused
    let seed = -1, sd = 1e9;
    for (let y = base.ty - 1; y <= base.ty + base.size; y++) for (let x = base.tx - 1; x <= base.tx + base.size; x++) {
      if (!inb(x, y) || !sPass(x, y) || rectDist(x, y, base) !== 1) continue;
      const dd = m ? Math.hypot(x - cx(m), y - cy(m)) : 0; if (dd < sd) { sd = dd; seed = idx(x, y); } }
    let before = null, d0 = null, n0 = 0, w0 = null;
    // (nor one that makes the walk to our lumber mills or the home woods much longer: 15 farms stood wall to wall
    // between the hall and the woodline, and the army at the hall could not reach raiders killing the cutters)
    const works = G.buildings.filter((b) => b.owner === O && BLD_DEFS[b.type].key === 'mill').map((b) => ({ tx: b.tx, ty: b.ty, size: b.size }));
    const tr = treeNear(base); if (tr) works.push({ tx: tr.tx, ty: tr.ty, size: 1 });
    const walks = (f) => { const d = stepsWith(f, seed); return works.map((w) => ringMin(d, w)); };
    return (f) => {
      if (seed < 0) return false;
      const sx = seed % MW, sy = (seed / MW) | 0; if (sx >= f.tx && sx < f.tx + f.size && sy >= f.ty && sy < f.ty + f.size) return true;
      if (works.length && works.some((w) => rectGap(f, w) <= 6 || rectEuclid(sx, sy, f) < Math.hypot(sx - cx(w), sy - cy(w)))) {
        if (!w0) w0 = walks(null);
        const w1 = walks(f);
        if (w1.some((d, i) => w0[i] >= 0 && (d < 0 || d > w0[i] * 1.3 + 4))) return true;
      }
      if (!d0) { d0 = reachWith(base, null, seed); for (let i = 0; i < N; i++) n0 += d0[i]; before = goals.filter((g) => ringIn(d0, g)); }
      const d = reachWith(base, f, seed); let n = 0, foot = 0;
      for (let i = 0; i < N; i++) n += d[i];
      for (let y = f.ty; y < f.ty + f.size; y++) for (let x = f.tx; x < f.tx + f.size; x++) if (inb(x, y) && d0[idx(x, y)]) foot++;
      return n < n0 - foot || before.some((g) => !ringIn(d, g));
    };
  }
  function sealsOff(base, f, m) { const d = reachWith(base, f); return !ringIn(d, m) || !ringIn(d, f); }
  // carry out one macro action; returns { ok, why }
  function agentMacro(key) { rec('macro', key); recMute++; try { return agentMacroRaw(key); } finally { recMute--; } }
  function agentMacroRaw(key) {
    const O = agentSide(), P = G.players[O], cmd = (c) => issueCommand(c, O), ai = aiOf(O);
    const blds = G.buildings.filter((b) => b.owner === O), mine = G.units.filter((u) => u.owner === O && !u.aboard);
    const base = blds.find((b) => BLD_DEFS[b.type].provides.includes('hall') && b.done) || blds.find((b) => BLD_DEFS[b.type].provides.includes('hall'));
    const workers = mine.filter((u) => keyOf(u) === 'worker' && !u.hidden);
    const [kind, arg] = String(key).split(':');
    const res = (ok, why) => { G.agent.log.push({ t: Math.round(G.time), key, ok, why }); return { ok, why: why || null }; };
    if (kind === 'wait') return res(true);
    if (kind === 'train') {
      const b = blds.find((x) => x.done && !x.training && !x.research && trainsAt(x, arg) && !trainWhy(O, x, arg));
      return b ? res(cmd({ action: 'train', buildingId: b.id, type: arg })) : res(false, 'no idle building can train it now');
    }
    if (kind === 'research') {
      const b = blds.find((x) => x.done && !x.training && !x.research && UPGRADES[arg] && UPGRADES[arg].at === BLD_DEFS[x.type].key && !researchWhy(O, x, arg));
      return b ? res(cmd({ action: 'research', buildingId: b.id, upgrade: arg })) : res(false, 'cannot research it now');
    }
    if (kind === 'build') {
      const d = BLD_DEFS[arg]; if (!d || !base) return res(false, 'unknown building or no base');
      if (d.onOil) {
        const t = mine.find((u) => keyOf(u) === 'tanker' && u.order !== 'build');
        const free = G.oils.filter((o) => !G.buildings.some((b) => BLD_DEFS[b.type].onOil && b.tx === o.tx && b.ty === o.ty));
        const patch = t && nearestPatch(free, t.x, t.y);
        return patch ? res(cmd({ action: 'build', unitIds: [t.id], type: arg, x: cx(patch), y: cy(patch) })) : res(false, 'no tanker or no free oil patch');
      }
      let spot = d.shore ? null : agentPlaceSite(O, base, arg, d.size);
      if (spot) { /* the plan's placement */ }
      else if (d.key === 'shipyard') spot = yardSite(O, base, arg);
      else if (d.key === 'refinery' || d.key === 'foundry') { const yard = blds.find((b) => BLD_DEFS[b.type].key === 'shipyard' && b.done); spot = yard && shoreSpot(yard, d.size, arg, base); }
      else if (d.key === 'mill') { const t = treeNear(base); if (t && Math.hypot(t.tx - cx(base), t.ty - cy(base)) > 6) spot = findSpotNear(base, t.tx, t.ty, d.size); }
      else if (d.key === 'scout') spot = towerSite(O, base, d.size);
      spot = spot || (d.shore ? null : findSpot(base, d.size, false, d.key));
      const w = workers.find((x) => x.order === 'gather' && x.gatherType === 'tree' && !x.carrying) || workers.find((x) => x.order === 'gather' || x.order === 'idle') || workers.find((x) => x.order !== 'build' && x.order !== 'repair');
      if (!spot) return res(false, 'no site found');
      if (!w) return res(false, 'no free worker');
      return res(cmd({ action: 'build', unitIds: [w.id], type: arg, x: spot.x, y: spot.y }));
    }
    if (kind === 'expand') {
      if (mine.some((u) => u.order === 'build' && u.build && BLD_DEFS[u.build.type].provides.includes('hall'))) return res(false, 'a new hall is already on its way');
      const site = base && expandSite(O, base), w = workers.find((x) => x.order === 'gather' && !x.carrying) || workers[0];
      return site && w ? res(cmd({ action: 'build', unitIds: [w.id], type: B(O, 'hall'), x: site.x, y: site.y })) : res(false, 'no hall site or worker');
    }
    const army = mine.filter((u) => UNIT_DEFS[u.type].combat && dom(u) !== 'water');
    // (a new order ends a march home, and the 'home' mark defend left: at a muster it dropped each unit that went idle
    // from its wave, and the army dissolved before it set out)
    if (['attack', 'retreat', 'hold', 'harass'].includes(kind)) army.forEach((u) => { u.homeRun = false; if (u.task === 'home') u.task = null; });
    if (kind === 'attack' && arg === 'base') {
      // the plan's home guard stays: guards already named first, then the free units nearest home
      const want = (G.agent.cfg && G.agent.cfg.guard) || 0, hx = base ? cx(base) : 0, hy = base ? cy(base) : 0;
      const free = army.filter((u) => !u.wave), guards = free.filter((u) => u.guard);
      const rest = free.filter((u) => !u.guard).sort((a, b) => Math.hypot(a.x - hx, a.y - hy) - Math.hypot(b.x - hx, b.y - hy) || (a.id < b.id ? -1 : 1));
      while (guards.length < want && rest.length) { const u = rest.shift(); u.guard = true; guards.push(u); }
      while (guards.length > want) { const u = guards.pop(); u.guard = false; rest.push(u); }
      const gHome = guards.filter((u) => Math.hypot(u.x - hx, u.y - hy) > 8 && !fighting(u));
      if (gHome.length) issueCommand({ action: 'attackMove', unitIds: gHome.map((u) => u.id), x: hx, y: hy + 3 }, O);
      const us = rest;
      // an army already out: the new units join it (reinforcements sent as their own little waves mustered alone and
      // died alone); they walk to the lead wave's rear and become its members, and the wave's hops wait for them
      const lead = leadWave(O, army, hx, hy);
      if (lead && us.length) {
        us.forEach((u) => { u.wave = lead.id; u.task = null; });
        const m = ai.march && ai.march[lead.id];
        const to = m && m.stage === 'march' && m.wx != null ? { x: m.wx, y: m.wy } : { x: lead.x, y: lead.y };
        return res(cmd({ action: 'attackMove', unitIds: us.map((u) => u.id), x: to.x, y: to.y }));
      }
      if (us.length < 3) return res(false, 'fewer than 3 free units beyond the home guard of ' + guards.length + ': too small a wave');
      // (units already out on the map gather where they stand, not back at home)
      const out = us.filter((u) => Math.hypot(u.x - hx, u.y - hy) > 25);
      const at = out.length > us.length / 2 ? { tx: Math.round(out.reduce((a, u) => a + u.x, 0) / out.length), ty: Math.round(out.reduce((a, u) => a + u.y, 0) / out.length), size: 1 } : base || us[0];
      const id = ai.waveN = (ai.waveN || 0) + 1; us.forEach((u) => { u.wave = id; }); ai.waves.push(id); aiMuster(O, id, us, at);
      return res(true);
    }
    if (kind === 'attack' && arg === 'nearest') {
      if (!army.length) return res(false, 'no army');
      // the known enemy nearest our army: what we see now, else the buildings we remember
      const ax = army.reduce((a, u) => a + u.x, 0) / army.length, ay = army.reduce((a, u) => a + u.y, 0) / army.length, F = foeOf(O);
      const seen = G.units.filter((e) => e.owner === F && !e.hidden && !e.dead && seenBy(O, e)).concat(G.buildings.filter((b) => b.owner === F && seenBy(O, b)));
      // raiders at our own base come first (under attack, "the nearest enemy to the army" sent it the wrong way)
      const raiders = base ? baseRaiders(O) : [];
      if (raiders.length) {
        let r = raiders[0]; for (const e of raiders) if (Math.hypot(e.x - cx(base), e.y - cy(base)) < Math.hypot(r.x - cx(base), r.y - cy(base))) r = e;
        army.forEach((u) => { u.wave = null; });
        const go = army.filter((u) => !fighting(u));
        return go.length ? res(cmd({ action: 'attackMove', unitIds: go.map((u) => u.id), x: r.x, y: r.y })) : res(true, 'everyone is fighting already');
      }
      const known = seen.length ? seen : O === 'player' ? Array.from(G.memory.values()).filter((m) => m.owner === F).map((m) => ({ kind: 'building', tx: m.tx, ty: m.ty, size: m.size })) : [];
      let t = null, td = 1e9; for (const e of known) { const d = Math.hypot(ex(e) - ax, ey(e) - ay); if (d < td) { td = d; t = e; } }
      if (!t) return res(false, 'no known target');
      army.forEach((u) => { u.wave = null; });
      const go = army.filter((u) => !fighting(u));
      return go.length ? res(cmd({ action: 'attackMove', unitIds: go.map((u) => u.id), x: ex(t), y: ey(t) })) : res(true, 'everyone is fighting already');
    }
    if (kind === 'attack' && arg === 'sea') {
      const fleet = mine.filter((u) => dom(u) === 'water' && UNIT_DEFS[u.type].combat); const t = fleet[0] && aiSeaTarget(fleet[0]);
      if (!t) return res(false, 'no reachable target at sea');
      const id = ai.waveN = (ai.waveN || 0) + 1; fleet.forEach((u) => { u.wave = id; }); ai.waves.push(id);
      return res(cmd({ action: 'attackMove', unitIds: fleet.map((u) => u.id), x: ex(t), y: ey(t) }));
    }
    if (kind === 'scout') {
      // the fastest non-wave unit (a worker only when there is no army); its route: the enemy start, or each mine in turn
      const pool = army.filter((u) => !u.wave).sort((a, b) => UNIT_DEFS[b.type].speed - UNIT_DEFS[a.type].speed);
      const u = pool[0] || (arg === 'enemy_base' ? workers.find((x) => x.order === 'gather' && !x.carrying) : null);
      if (!u) return res(false, 'no unit to send');
      const home = base ? { x: cx(base), y: cy(base) } : { x: u.x, y: u.y };
      const pts = arg === 'expansions' ? G.mines.map((m) => ({ x: cx(m), y: cy(m) })).filter((m) => Math.hypot(m.x - home.x, m.y - home.y) > 12).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y)) : [{ x: MW - 1 - home.x, y: MH - 1 - home.y }];
      if (!pts.length) return res(false, 'nowhere to scout');
      // (a list of stops walked one after the other, then home; a patrol never ended and blocked scouting for good)
      u.scout = true; u.scoutPts = pts.slice(1).map((p) => [Math.round(p.x), Math.round(p.y)]).concat([[Math.round(home.x), Math.round(home.y) + 3]]);
      return res(cmd({ action: 'move', unitIds: [u.id], x: pts[0].x, y: pts[0].y }));
    }
    if (kind === 'attack' && arg === 'expansion') {
      const t = agentTargets(O).expansion, us = army.filter((u) => !u.wave && !u.guard);
      if (!t || !us.length) return res(false, 'no known enemy expansion or no free army');
      const id = ai.waveN = (ai.waveN || 0) + 1; us.forEach((u) => { u.wave = id; u.task = 'expansion'; });
      return res(cmd({ action: 'attackMove', unitIds: us.map((u) => u.id), x: t.x, y: t.y }));
    }
    if (kind === 'harass') {
      const t = agentTargets(O).workers, us = army.filter((u) => !u.wave && !u.guard && dom(u) !== 'water').sort((a, b) => UNIT_DEFS[b.type].speed - UNIT_DEFS[a.type].speed || a.id - b.id).slice(0, 5);
      if (!t || us.length < 3) return res(false, 'fewer than 3 free units');
      const id = ai.waveN = (ai.waveN || 0) + 1; us.forEach((u) => { u.wave = id; u.task = 'harass'; });
      return res(cmd({ action: 'attackMove', unitIds: us.map((u) => u.id), x: t.x, y: t.y }));
    }
    if (kind === 'hold') {
      const terr = agentTerrain(), c = terr && terr.chokes[0], us = army.filter((u) => !u.wave);
      if (!c || !us.length) return res(false, 'no choke on the route or no free army');
      return res(cmd({ action: 'attackMove', unitIds: us.map((u) => u.id), x: c.at[0], y: c.at[1] }));
    }
    if (kind === 'repair') {
      const rf = repairUnderFire(O, blds, workers);
      if (!rf) return res(false, 'no damaged building under attack, or no free worker or money');
      return res(cmd({ action: 'repair', unitIds: rf.ws.map((w) => w.id), targetId: rf.b.id }));
    }
    if (kind === 'pull_wounded') {
      const us = army.filter((u) => u.hp < u.maxHp * 0.4 && !u.pulled && (!base || Math.hypot(u.x - cx(base), u.y - cy(base)) > 14) &&
        G.units.some((e) => e.owner === foeOf(O) && !e.hidden && Math.hypot(e.x - u.x, e.y - u.y) < 7));
      if (!us.length || !base) return res(false, 'no wounded unit in a fight');
      us.forEach((u) => { u.wave = null; u.task = null; u.pulled = true; });
      return res(cmd({ action: 'move', unitIds: us.map((u) => u.id), x: cx(base), y: cy(base) + 3 }));
    }
    if (kind === 'retreat') {
      if (!army.length || !base) return res(false, 'no army or base');
      army.forEach((u) => { u.wave = null; u.task = null; }); ai.waves = [];
      return res(cmd({ action: 'move', unitIds: army.map((u) => u.id), x: cx(base), y: cy(base) + 3 }));
    }
    if (kind === 'workers') {
      const foes = base ? baseRaiders(O) : [];
      if (arg === 'resume') { const ev = mine.filter((u) => u.evac); ev.forEach((u) => { u.evac = false; }); return res(ev.length > 0, ev.length ? null : 'no evacuated workers'); }
      if (!base || foes.length < 2) return res(false, 'no raid at our base');
      const fx = foes.reduce((a, e) => a + e.x, 0) / foes.length, fy = foes.reduce((a, e) => a + e.y, 0) / foes.length;
      const dx = cx(base) - fx, dy = cy(base) - fy, d = Math.hypot(dx, dy) || 1;
      // toward our own army when it is out (the chasers run into it; fleeing into the corner of a base does not save
      // them), else 12 tiles past the hall, away from the raiders
      const out = army.filter((u) => Math.hypot(u.x - cx(base), u.y - cy(base)) > 12);
      let ux = dx / d, uy = dy / d;
      if (out.length) { const ax = out.reduce((a, u) => a + u.x, 0) / out.length - cx(base), ay = out.reduce((a, u) => a + u.y, 0) / out.length - cy(base), ad = Math.hypot(ax, ay) || 1; ux = ax / ad; uy = ay / ad; }
      let p = null;
      for (const k of [14, 10, 6]) { p = nearestFree(Math.round(cx(base) + ux * k), Math.round(cy(base) + uy * k), null, undefined, undefined, null, null, 'ground'); if (p) break; }
      p = p || { x: Math.round(cx(base)), y: Math.round(cy(base)) };
      // only the workers the raiders can reach soon (a whole base sent to the map edge mined nothing for 23 s);
      // cutters go mining instead when no raider is near the mine
      const ws = workers.filter((w) => !w.evac && foes.some((e) => Math.hypot(e.x - w.x, e.y - w.y) < 7));
      if (!ws.length) return res(false, 'no worker near the raiders');
      const gm = nearestPatch(G.mines.filter((m) => m.amount > 0), cx(base), cy(base)), gmSafe = gm && !foes.some((e) => Math.hypot(e.x - cx(gm), e.y - cy(gm)) < 9);
      const toMine = gmSafe ? ws.filter((w) => w.order === 'gather' && w.gatherType === 'tree') : [], run = ws.filter((w) => !toMine.includes(w));
      if (toMine.length) cmd({ action: 'gather', unitIds: toMine.map((w) => w.id), targetId: gm.id });
      run.forEach((w) => { w.evac = true; w.evacT = G.time; w.evacAt = [Math.round(w.x), Math.round(w.y)]; });
      if (run.length) cmd({ action: 'move', unitIds: run.map((w) => w.id), x: p.x, y: p.y });
      return res(true);
    }
    if (kind === 'defend') {
      if (!army.length || !base) return res(false, 'no army or base');
      // units near home fight at once; those far out march home without stopping to fight (an attack-move home came back
      // as a trickle of small fights across the map) and turn to fight once within 15 tiles; a unit already on its way
      // keeps its route (re-issuing defend re-pathed everyone)
      const hx = cx(base), hy = cy(base) + 3, near = (u) => Math.hypot(u.x - hx, u.y - hy) <= 15;
      army.forEach((u) => { u.wave = null; u.task = 'home'; }); ai.waves = [];          // (marked, so defend is not offered again on the way)
      // (the units at home go for the raiders wherever they are in the base: an attack-move to the hall turned them
      // away from raiders killing workers at the woodline)
      const fight = army.filter((u) => near(u) && !u.pulled && !fighting(u)), run = army.filter((u) => !near(u) && !u.homeRun && !fighting(u)), raid = baseRaiders(O);
      if (fight.length && raid.length) {
        const rx = raid.reduce((a, e) => a + e.x, 0) / raid.length, ry = raid.reduce((a, e) => a + e.y, 0) / raid.length;
        let r = raid[0]; for (const e of raid) if (Math.hypot(e.x - rx, e.y - ry) < Math.hypot(r.x - rx, r.y - ry)) r = e;
        cmd({ action: 'attackMove', unitIds: fight.map((u) => u.id), x: Math.round(r.x), y: Math.round(r.y) });
      } else if (fight.length) cmd({ action: 'attackMove', unitIds: fight.map((u) => u.id), x: hx, y: hy });
      if (run.length) { cmd({ action: 'move', unitIds: run.map((u) => u.id), x: hx, y: hy }); run.forEach((u) => { u.homeRun = true; }); }
      return res(true);
    }
    return res(false, 'unknown action');
  }

  // ---------------------------------------------------------------- simulation loop
  function step() {
    if (G.winner) return;
    inStep++;
    try { stepInner(); } finally { inStep--; }
    if (G.tick % 600 === 0) { if (G.rec) G.rec.checks.push([G.tick, simHash()]); if (G.replay) replayCheck(); }
  }
  function stepInner() {
    if (G.replay) replayFeed();
    G.tick++; G.time = G.tick * TICK;
    for (const u of G.units.slice()) if (!u.dead) updateUnit(u, TICK);
    for (const b of G.buildings.slice()) if (!b.dead) updateBuilding(b, TICK);
    updateProjectiles(TICK);
    updateSpells(TICK);
    for (const c of G.corpses) c.t += TICK;
    G.corpses = G.corpses.filter((c) => c.t < CORPSE_TTL);
    for (const r of G.rubble) r.t += TICK;
    G.rubble = G.rubble.filter((r) => r.t < RUBBLE_TTL);
    if (G.tick % 20 === 0) { if (G.aiOn) aiThink('enemy'); if (G.autoPlayer) aiThink('player'); else if (G.agent) aiThink(G.agent.side, true); }
    if (G.tick % 4 === 0) { updateDetection(); updateFog(); }
    // Warcraft II: a side is beaten when it has no buildings and no units left
    const alive = (o) => G.buildings.some((b) => b.owner === o) || G.units.some((u) => u.owner === o && !UNIT_DEFS[u.type].summoned);
    if (G.cheats && G.cheats.noWin) return;
    if (!alive('enemy')) G.winner = 'player';
    else if (!alive('player')) G.winner = 'enemy';
    if (G.winner) showResult();
  }
  let acc = 0, lastTs = null;
  function frame(ts) {
    const fdt = lastTs === null ? 0 : Math.min(0.1, Math.max(0, (ts - lastTs) / 1000));
    lastTs = ts;
    if (G && !paused && !menuOpen && !(G.agent && G.agent.hold)) {
      acc += fdt * speed;
      let n = 0;
      while (acc >= TICK && n < 400) { step(); acc -= TICK; n++; }
      if (n >= 400) acc = 0;
    } else acc = 0;
    if (G) {
      scrollCamera(fdt);
      const fog = G.vis;
      if (G.replay && G.replay.seeAll) { if (!allVis || allVis.length !== fog.length) allVis = new Uint8Array(fog.length).fill(2); G.vis = allVis; }
      try { render(); updatePanel(); } finally { G.vis = fog; }
      updateMusic(false);
      if (G.replay) replayUi();
    }
    requestAnimationFrame(frame);
  }
  let allVis = null;

  // ---------------------------------------------------------------- replays
  // As in Warcraft II, a replay is the game's options plus every order given from outside the simulation, each with
  // the tick it was given on (orders from the mouse and keys, the agent's macros, cheats, autopilot); the simulation
  // is deterministic (fixed ticks, its own seeded random numbers), so replaying those inputs rebuilds the game.
  // A checksum every 30 s shows whether the replay still matches. notes are the LLM player's messages (plans,
  // decisions), shown in the chat panel at their game time; they never touch the simulation.
  let inStep = 0, recMute = 0;
  function rec(type, data) {
    if (!G || !G.rec || G.replay || inStep || recMute) return;
    G.rec.events.push([G.tick, type, data === undefined ? null : JSON.parse(JSON.stringify(data))]);
  }
  function simHash() {
    let h = 2166136261 >>> 0; const mix = (v) => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; };
    const num = (id) => +String(id).replace(/\D/g, '') || 0;
    mix(G.tick); mix(G.nextId); mix(G.rs);
    for (const o of ['player', 'enemy']) { const P = G.players[o]; mix(P.gold); mix(P.lumber); mix(P.oil); mix(P.upgrades.length); }
    for (const u of G.units) { mix(num(u.id)); mix(Math.round(u.x * 64)); mix(Math.round(u.y * 64)); mix(Math.round(u.hp * 16)); }
    for (const b of G.buildings) { mix(num(b.id)); mix(Math.round(b.hp * 16)); mix(Math.round((b.progress || 0) * 1000)); }
    return h;
  }
  function applyInput(type, d) {
    if (type === 'cmd') issueCommand(d[0], d[1]);
    else if (type === 'macro') agentMacro(d);
    else if (type === 'agent') { agentStart(d); G.agent.hold = false; }
    else if (type === 'auto') G.autoPlayer = d !== false;
    else if (type === 'agentset') agentSet(d);
    else if (type === 'cheat') applyCheat(d);
  }
  function replayFeed() {                          // the inputs given before this tick, in their order
    const R = G.replay, ev = R.r.events;
    while (R.ei < ev.length && ev[R.ei][0] <= G.tick) { const e = ev[R.ei++]; applyInput(e[1], e[2]); }
  }
  function replayCheck() {
    const R = G.replay, cs = R.r.checks || [];
    while (R.ci < cs.length && cs[R.ci][0] <= G.tick) { const c = cs[R.ci++]; if (c[0] === G.tick && c[1] !== simHash() && R.desync === null) R.desync = c[0]; }
  }
  function playReplay(r, keep) {
    if (typeof r === 'string') r = JSON.parse(r);
    if (!r || !r.opts || !Array.isArray(r.events)) { toast('Not a replay file'); return false; }
    newGame(Object.assign({}, r.opts, { replaying: true }));
    G.rec = null;
    let seeAll = false; try { seeAll = localStorage.getItem('wc.replayFog') === 'off'; } catch (e) { /* storage blocked */ }
    G.replay = Object.assign({ r, ei: 0, ci: 0, desync: null, seeAll, shown: 0 }, keep || {});
    $('titlescreen').hidden = true; paused = false;
    chatOpen(true); chatReset(); resize();
    $('replay-bar').hidden = false;
    const end = r.endTick || 1; $('rp-seek').max = String(end);
    return true;
  }
  // jump to a tick: forward by simulating quietly in batches, backward by starting over (a replay has no snapshots)
  let seeking = null;
  function replaySeek(tick) {
    if (!G || !G.replay) return;
    const R = G.replay, target = Math.max(0, Math.min(tick | 0, R.r.endTick || tick));
    if (target < G.tick) playReplay(R.r, { seeAll: R.seeAll });
    seeking = target; ui.quiet = true; $('pause-banner').textContent = 'Seeking'; $('pause-banner').hidden = false;
    const run = () => {
      if (!G || !G.replay || seeking === null) return;
      const t0 = performance.now();
      while (G.tick < seeking && !G.winner && performance.now() - t0 < 40) step();
      if (G.tick < seeking && !G.winner) { setTimeout(run, 0); return; }
      seeking = null; ui.quiet = false; $('pause-banner').textContent = 'Paused'; $('pause-banner').hidden = !paused; chatReset();
    };
    run();
  }
  const mmss = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  function replayUi() {
    const R = G.replay, end = R.r.endTick || 0;
    if (end && G.tick >= end && !G.winner && !paused) { paused = true; notice('End of the recording'); }
    const sk = $('rp-seek'); if (seeking === null && document.activeElement !== sk) sk.value = String(G.tick);
    $('rp-time').textContent = mmss(G.time) + ' / ' + mmss(end * TICK) + (R.desync !== null ? '  (out of step since ' + mmss(R.desync * TICK) + ')' : '');
    $('rp-play').textContent = paused ? '▶' : '❚❚';
    $('rp-vis').textContent = R.seeAll ? 'Fog: off' : 'Fog: on'; $('rp-vis').classList.toggle('on', !!R.seeAll);
    for (const b of document.querySelectorAll('#replay-bar [data-speed]')) b.classList.toggle('on', +b.dataset.speed === speed);
    chatSync();
  }

  // ---------------------------------------------------------------- decision chat (the LLM player's messages)
  const CHAT_W = 380, CHAT_KEEP = 50;
  let chatShown = 0, chatOn = false, chatFollow = true, chatSet = -1;
  function chatSetFollow(on) {
    chatFollow = !!on; const b = $('chat-follow'); if (b) { b.classList.toggle('on', chatFollow); b.textContent = chatFollow ? 'Following' : 'Follow'; }
    if (chatFollow) chatBottom();
  }
  // scrolls made here are remembered by position, so a scroll event elsewhere is the viewer's own
  function chatBottom() { const log = $('chat-log'); if (!log) return; log.scrollTop = log.scrollHeight; chatSet = log.scrollTop; }
  function chatOpen(on) { chatOn = !!on; $('chat').hidden = !chatOn; resize(); if (chatOn && chatFollow) chatBottom(); }
  function chatReset() { $('chat-log').textContent = ''; chatShown = 0; chatSync(); }
  function chatNotes() { return G && G.replay ? G.replay.r.notes || [] : G && G.rec ? G.rec.notes : []; }
  function chatSync() {
    const ns = chatNotes(), log = $('chat-log'); if (!log) return;
    const limit = G && G.replay ? G.tick : Infinity;
    let added = false;
    while (chatShown < ns.length && ns[chatShown].tick <= limit) {
      const n = ns[chatShown++], last = log.lastElementChild;
      // a run of the same forced choice (nothing to decide) is one line with a count
      if (n.forced && last && last.dataset.forced === String(n.choice)) { const c = +last.dataset.count + 1; last.dataset.count = String(c); last.querySelector('.cnt').textContent = '×' + c + ' until ' + mmss(n.tick * TICK); }
      else log.appendChild(chatEntry(n));
      added = true;
    }
    // only the last CHAT_KEEP entries stay on the page (a long game made thousands and slowed the browser); a viewer
    // reading further up keeps their place
    while (log.childElementCount > CHAT_KEEP) { const h = log.firstElementChild.offsetHeight + 8; log.firstElementChild.remove(); if (!chatFollow) { log.scrollTop -= h; chatSet = log.scrollTop; } }
    if (added && chatFollow) chatBottom();
  }
  const esc = (v) => String(v === undefined || v === null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function chatEntry(n) {
    const d = document.createElement('div'), who = n.who || 'note';
    d.className = 'msg ' + who; d.title = 'Click to jump here';
    d.addEventListener('click', () => { if (G && G.replay) replaySeek(n.tick); });
    const money = n.cost ? ' · $' + (+n.cost).toFixed(n.cost < 0.001 ? 6 : 4) : '';
    const tok = n.tokens ? ' · ' + [n.tokens.in && n.tokens.in + ' in', n.tokens.cached && n.tokens.cached + ' cached', n.tokens.out && n.tokens.out + ' out', n.tokens.reasoning && n.tokens.reasoning + ' reasoning'].filter(Boolean).join(', ') : '';
    const head = '<div class="hd"><b>' + esc({ astra: 'Astra', jev: 'Jev', harness: 'Harness' }[who] || who) + '</b> ' + esc(n.title || n.kind || '') + '<span>' + mmss(n.tick * TICK) + money + (n.secs ? ' · ' + n.secs + ' s' : '') + '</span></div>';
    let body = '';
    if (n.forced) {
      d.className += ' forced'; d.dataset.forced = String(n.choice); d.dataset.count = '1';
      d.innerHTML = '<div class="hd"><b>Jev</b> ' + esc(n.choice) + ' <small>(only option, no call)</small> <small class="cnt"></small><span>' + mmss(n.tick * TICK) + '</span></div>' + maskedHtml(n);
      return d;
    }
    if (n.kind === 'plan') {
      body = '<div class="why">' + esc(n.reason) + '</div><div>' + esc(n.strategy) + '</div>' +
        '<ol>' + (n.priorities || []).map((k) => '<li>' + esc(k) + '</li>').join('') + '</ol>' +
        '<div class="meta">attack at ' + esc(n.attack_at) + ' · workers ' + esc(n.workers_target) + ' · save for ' + esc(n.save_for || '-') + ' · ' + esc(n.stance) + '</div>';
      if (n.thinking) body += '<details><summary>reasoning</summary><div class="think">' + esc(n.thinking) + '</div></details>';
    } else if (n.kind === 'decision') {
      const opts = (n.options || []).slice().sort((a, b) => (b.p || 0) - (a.p || 0));
      body = '<div class="q">' + esc(n.question) + (n.forced ? ' <i>(one option: no call)</i>' : '') + '</div>' +
        opts.map((o) => '<div class="opt' + (o.key === n.choice ? ' pick' : '') + '"><i style="width:' + Math.round((o.p || 0) * 100) + '%"></i><span>' + esc(o.key) + '</span><em>' + (o.p === undefined ? '' : Math.round(o.p * 100) + '%') + '</em></div>').join('') +
        '<div class="meta">→ ' + esc(n.result || n.choice) + (n.conf !== undefined && n.conf !== null ? ' · confidence ' + (+n.conf).toFixed(2) : '') + '</div>';
    } else body = '<div>' + esc(n.text || JSON.stringify(n)) + '</div>';
    d.innerHTML = head + body + maskedHtml(n) + (tok ? '<div class="tok">' + esc(tok.slice(3)) + '</div>' : '');
    return d;
  }
  function maskedHtml(n) {
    const m = Object.entries(n.masked || {}); if (!m.length) return '';
    return '<details><summary>' + m.length + ' hidden by the plan</summary>' + m.map(([k, why]) => '<div class="mk"><b>' + esc(k) + '</b> ' + esc(why) + '</div>').join('') + '</details>';
  }

  // ---------------------------------------------------------------- export API
  const r3 = (v) => Math.round(v * 1000) / 1000;
  function exportPlayer(o) {
    const P = G.players[o];
    return {
      gold: Math.floor(P.gold), lumber: Math.floor(P.lumber), oil: Math.floor(P.oil), food: food(o), race: raceOf(o), upgrades: P.upgrades.slice(),
      units: G.units.filter((u) => u.owner === o && !u.aboard).map((u) => {
        const e = { id: u.id, type: u.type, x: r3(u.x), y: r3(u.y), hp: Math.ceil(u.hp), maxHp: u.maxHp, flying: dom(u) === 'air', carrying: u.carrying, order: u.order };
        if (u.gatherType) e.gatherType = u.gatherType;
        if (u.carrying) e.carryType = u.carryType;
        if (UNIT_DEFS[u.type].mana) e.mana = Math.floor(u.mana);
        if (UNIT_DEFS[u.type].capacity) e.cargo = u.cargo.slice();
        return e;
      }),
      buildings: G.buildings.filter((b) => b.owner === o).map((b) => {
        const e = { id: b.id, type: b.type, x: cx(b), y: cy(b), hp: Math.ceil(b.hp), maxHp: b.maxHp, done: b.done, progress: r3(b.progress) };
        if (b.training) e.training = { type: b.training.type, progress: r3(b.training.progress) };
        if (b.research) e.research = { upgrade: b.research.upgrade, progress: r3(b.research.progress) };
        return e;
      }),
      stats: Object.assign({}, G.stats[o]),
    };
  }
  function state() {
    return {
      time: r3(G.time), winner: G.winner, map: { width: MW, height: MH },
      selection: G.selection.filter((id) => G.ents.has(id)),
      players: { player: exportPlayer('player'), enemy: exportPlayer('enemy'), neutral: exportPlayer('neutral') },
      resources: G.mines.concat(G.oils).map((m) => ({ id: m.id, type: m.type, x: cx(m), y: cy(m), amount: m.amount }))
        .concat([...G.trees.values()].map((t) => ({ id: t.id, type: 'tree', x: t.tx, y: t.ty, amount: t.amount }))),
    };
  }
  function catalog() {
    const R = RACES[G.race];
    return {
      units: Object.values(R.units).filter((type) => UNIT_DEFS[type].cost).map((type) => { const d = UNIT_DEFS[type]; const e = { type, role: d.key, cost: Object.assign({}, d.cost), trainedAt: d.at,
        requires: d.requires.map((k) => R.buildings[k]), hp: d.hp, damage: d.dmg + d.pierce, basic: d.dmg, piercing: d.pierce, armor: d.armor, range: d.range, speed: d.wcSpeed, sight: d.sight,
        buildTime: d.time, food: 1, targets: { land: d.land, sea: d.sea, air: d.air } };
        if (d.minRange) e.minRange = d.minRange; if (d.mana) e.mana = RULES.MANA_MAX; if (d.capacity) e.capacity = d.capacity; if (d.spells) e.spells = d.spells.slice();
        if (d.requiresUpgrade) e.requiresUpgrade = d.requiresUpgrade; return e; }),
      buildings: Object.values(R.buildings).map((type) => { const d = BLD_DEFS[type]; return { type, role: d.key, cost: Object.assign({}, d.cost), requires: d.requires.map((k) => R.buildings[k]),
        size: { w: d.size, h: d.size }, hp: d.hp, range: d.range || 0, armor: d.armor, sight: d.sight, buildTime: d.time, food: d.food || 0,
        damage: (d.dmg || 0) + (d.pierce || 0), upgradeOf: d.upgradeOf ? R.buildings[d.upgradeOf] : null, shore: !!d.shore, onOil: !!d.onOil }; }),
      upgrades: Object.keys(UPGRADES).filter((id) => upAvail(id, G.race)).map((id) => { const u = UPGRADES[id], info = upInfo(id, G.race);
        return { id, at: R.buildings[u.at], cost: Object.assign({}, info.cost), buildTime: info.time, requires: info.requires.map((k) => R.buildings[k]).concat(info.needs),
          becomes: u.becomes ? R.buildings[u.becomes] : null, converts: u.convert ? R.units[u.convert.to] : null, spell: u.spell || null, label: upLabel(id, G.race) }; }),
      spells: Object.fromEntries(Object.entries(SPELLS).map(([k, sp]) => [k, Object.assign({}, sp)])),
      races: Object.keys(RACES),
    };
  }
  function terrain(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (!inb(x, y)) return 'rock';
    return ['ground', 'forest', 'water', 'rock'][G.terrain[idx(x, y)]];
  }
  function spawn(owner, type, x, y, opts) {
    if (!G || !G.players[owner] || !finite(x) || !finite(y)) return null;
    const setHp = (e) => { if (opts && finite(opts.hp)) e.hp = Math.max(1, Math.min(e.maxHp, Math.round(opts.hp))); return e; };
    if (BLD_DEFS[type]) {
      const f = footOf(type, x, y);
      if (!canPlace(f)) return null;
      for (let yy = f.ty; yy < f.ty + f.size; yy++) for (let xx = f.tx; xx < f.tx + f.size; xx++) if (G.ugrid[idx(xx, yy)]) return null;
      const b = setHp(addBuilding(owner, type, f.tx, f.ty, true));
      updateFog();
      return b.id;
    }
    if (UNIT_DEFS[type]) {
      const tx = Math.round(x), ty = Math.round(y);
      if (!tileFree(tx, ty, null, null, UNIT_DEFS[type].domain)) return null;
      const u = setHp(addUnit(owner, type, tx, ty));
      updateFog();
      return u.id;
    }
    return null;
  }
  function worldToScreen(x, y) {
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((x + 0.5) * TILE - ui.camX) * ui.zoom, y: r.top + ((y + 0.5) * TILE - ui.camY) * ui.zoom };
  }
  function lookAt(x, y) {
    ui.camX = (x + 0.5) * TILE - ui.vw / ui.zoom / 2; ui.camY = (y + 0.5) * TILE - ui.vh / ui.zoom / 2; clampCam();
  }
  // Camera zoom (0.5..2.5, mouse wheel or +/-): the world point under (cx, cy) stays put.
  function setZoom(z, cx, cy) {
    z = Math.max(0.5, Math.min(2.5, z));
    const r = canvas.getBoundingClientRect(), px = cx === undefined ? ui.vw / 2 : cx - r.left, py = cy === undefined ? ui.vh / 2 : cy - r.top;
    const wx = ui.camX + px / ui.zoom, wy = ui.camY + py / ui.zoom;
    ui.zoom = z; ui.camX = wx - px / z; ui.camY = wy - py / z; clampCam();
  }
  function clampCam() {
    const mx = MW * TILE - ui.vw / ui.zoom, my = MH * TILE - ui.vh / ui.zoom;
    ui.camX = mx < 0 ? mx / 2 : Math.max(0, Math.min(mx, ui.camX));
    ui.camY = my < 0 ? my / 2 : Math.max(0, Math.min(my, ui.camY));
  }

  // ---------------------------------------------------------------- rendering
  const canvas = document.getElementById('view'), ctx = canvas.getContext('2d');
  const mini = document.getElementById('minimap'), mctx = mini.getContext('2d');
  const terrainCanvas = document.createElement('canvas');
  let miniImg = null, MS = 4;           // minimap image and its pixels per tile
  const miniTmp = document.createElement('canvas');
  // Resizes every per-tile buffer; called before a map is generated or a save is restored.
  function setMapSize(w, h) {
    MW = w; MH = h; N = MW * MH;
    gS = new Float64Array(N); came = new Int32Array(N); seen = new Int32Array(N); closed = new Int32Array(N); stamp = 0;
    terrainCanvas.width = MW * TILE; terrainCanvas.height = MH * TILE;
    miniTmp.width = MW; miniTmp.height = MH; miniImg = mctx.createImageData(MW, MH);
    MS = Math.min(mini.width / MW, mini.height / MH);
    mctx.fillStyle = '#000'; mctx.fillRect(0, 0, mini.width, mini.height);
  }
  const A = window.ART;

  // 8-neighbour mask of same-kind tiles for the terrain autotiles (N 1, E 2, S 4, W 8, NE 16, SE 32, SW 64, NW 128);
  // outside the map counts as rock.
  function terrainMask(x, y, t) {
    const k = (dx, dy) => ((inb(x + dx, y + dy) ? G.terrain[idx(x + dx, y + dy)] : ROCK) === t ? 1 : 0);
    return k(0, -1) | k(1, 0) << 1 | k(0, 1) << 2 | k(-1, 0) << 3 | k(1, -1) << 4 | k(1, 1) << 5 | k(-1, 1) << 6 | k(-1, -1) << 7;
  }
  // ---- coastline, marching-squares style: every tile corner holds the share of water among the four tiles that meet
  // there; inside a tile that share is interpolated and nudged by a little noise, and a pixel is water past one half.
  // A staircase of water tiles so draws as a smooth, slightly ragged bank, with a thin line of surf on the water side
  // and a band of damp earth on the land side. Shore art is cached per tile and water frame for the current game.
  let shoreG = null, shoreSet = new Set(), shoreGround = new Map(), shoreArt = new Map(), waterPix = new Map(), shoreNoise = null;
  const cornerW = (i, j) => { let n = 0, k = 0; for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const x = i + dx, y = j + dy; if (!inb(x, y)) continue; k++; if (G.terrain[idx(x, y)] === WATER) n++; } return k ? n / k : 0; };
  function isShore(x, y) { const a = cornerW(x, y), b = cornerW(x + 1, y), c = cornerW(x, y + 1), d = cornerW(x + 1, y + 1); return !((a === 0 && b === 0 && c === 0 && d === 0) || (a === 1 && b === 1 && c === 1 && d === 1)); }
  function shoreTile(x, y, frame) {
    const key = idx(x, y) * 3 + frame;
    let cv = shoreArt.get(key);
    if (cv) return cv;
    const v = Math.floor(A.hash(x, y) * 8), wk = v + '|' + frame;
    let wp = waterPix.get(wk);
    if (!wp) { wp = A.tile('water', v, frame, 255).getContext('2d').getImageData(0, 0, TILE, TILE).data; waterPix.set(wk, wp); }
    const gp = shoreGround.get(idx(x, y));
    const c00 = cornerW(x, y), c10 = cornerW(x + 1, y), c01 = cornerW(x, y + 1), c11 = cornerW(x + 1, y + 1);
    cv = document.createElement('canvas'); cv.width = cv.height = TILE;
    const g = cv.getContext('2d'), im = g.createImageData(TILE, TILE), d = im.data;
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const u = (i + 0.5) / TILE, w = (j + 0.5) / TILE, fx = x + u, fy = y + w;
      const f = (c00 * (1 - u) + c10 * u) * (1 - w) + (c01 * (1 - u) + c11 * u) * w + (shoreNoise(fx, fy) - 0.5) * 0.22 + (A.hash(x * TILE + i, y * TILE + j) - 0.5) * 0.015;
      const o = (j * TILE + i) * 4;
      if (f >= 0.5) {                                           // water; surf just inside the bank
        const k = f < 0.57 ? 0.55 * (1 - (f - 0.5) / 0.07) : 0;
        d[o] = wp[o] + (228 - wp[o]) * k; d[o + 1] = wp[o + 1] + (240 - wp[o + 1]) * k; d[o + 2] = wp[o + 2] + (236 - wp[o + 2]) * k;
      } else {                                                  // ground; damp earth near the water
        const k = f > 0.3 ? 0.55 * Math.pow((f - 0.3) / 0.2, 1.6) : 0;
        d[o] = gp[o] + (96 - gp[o]) * k; d[o + 1] = gp[o + 1] + (84 - gp[o + 1]) * k; d[o + 2] = gp[o + 2] + (52 - gp[o + 2]) * k;
      }
      d[o + 3] = 255;
    }
    g.putImageData(im, 0, 0); shoreArt.set(key, cv);
    return cv;
  }
  function drawTerrain() {
    const c = terrainCanvas.getContext('2d');
    c.imageSmoothingEnabled = false;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const t = G.terrain[idx(x, y)], px = x * TILE, py = y * TILE;
      let v = Math.floor(A.hash(x, y) * 8);
      if ((v === 3 || v === 7) && A.hash(x + 11, y + 5) < 0.5) v = 0; // pebbles on about one ground tile in eight
      c.drawImage(A.tile('grass', v), px, py);     // one continuous ground under everything, forest floor included
    }
    const seed = (G.seed | 0) % 9973;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) A.dryPatch(c, x, y, seed);
    // water never changes during a game: the shore tiles and the ground under them are taken once per game
    if (shoreG !== G) {
      shoreG = G; shoreSet = new Set(); shoreGround = new Map(); shoreArt = new Map(); shoreNoise = valueNoise(seed * 13 + 5, 1.6);
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (isShore(x, y)) { shoreSet.add(idx(x, y)); shoreGround.set(idx(x, y), c.getImageData(x * TILE, y * TILE, TILE, TILE).data); }
    }
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const t = G.terrain[idx(x, y)], px = x * TILE, py = y * TILE, v = Math.floor(A.hash(x, y) * 8);
      const kind = t === WATER ? 'water' : t === ROCK ? 'rock' : t === FOREST ? 'forest' : (G.stump[idx(x, y)] || A.hash(x + 7, y + 3) < 0.06) ? 'stump' : null;
      const shore = shoreSet.has(idx(x, y));
      if (shore) c.drawImage(shoreTile(x, y, 0), px, py);
      if (kind && !(shore && kind === 'water')) c.drawImage(A.tile(kind, v, 0, kind === 'stump' ? 255 : terrainMask(x, y, t), true), px, py);
    }
    // crowns of lone trees overhang the tile above
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (G.terrain[idx(x, y)] === FOREST && A.isLoneTree(terrainMask(x, y, FOREST))) A.treeTop(c, x * TILE, y * TILE);
    ui.terrainDirty = false;
  }
  function hpBar(px, py, w, frac) {
    ctx.fillStyle = '#000'; ctx.fillRect(px - 1, py - 1, w + 2, 5);
    ctx.fillStyle = frac > 0.6 ? '#3c3' : frac > 0.3 ? '#dd3' : '#d33';
    ctx.fillRect(px, py, w * Math.max(0, frac), 3);
  }
  const stageOf = (b) => (b.done ? 3 : b.progress < 0.25 ? 0 : b.progress < 0.5 ? 1 : 2);
  // walls: a stone wall (human) or a wooden palisade (orc), drawn in code and joined to the walls next to it
  const wallCache = new Map();
  function wallArt(race, mask) {
    const key = race + mask;
    let c = wallCache.get(key);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = TILE; const g = c.getContext('2d');
    const n = mask & 1, e = mask & 2, s = mask & 4, w = mask & 8, h = TILE / 2;
    const seg = (x0, y0, x1, y1) => { g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1); };
    if (race === 'orc') {   // sharpened logs
      const log = (x, y, len, vert) => { g.fillStyle = '#5a3a1c'; vert ? g.fillRect(x - 5, y, 10, len) : g.fillRect(x, y - 5, len, 10); g.fillStyle = '#8a5a2c'; vert ? g.fillRect(x - 3, y, 3, len) : g.fillRect(x, y - 3, len, 3); };
      g.fillStyle = '#3a2412'; g.fillRect(h - 7, h - 7, 14, 14);
      if (n) log(h, 0, h, true); if (s) log(h, h, h, true); if (w) log(0, h, h, false); if (e) log(h, h, h, false);
      for (let i = -1; i <= 1; i++) { g.fillStyle = '#6b4424'; g.fillRect(h - 5 + i * 4, h - 11, 3, 16); g.fillStyle = '#c9a060'; g.fillRect(h - 5 + i * 4, h - 13, 3, 3); }
    } else {                // grey stone with a darker course
      const block = (x, y, ww, hh) => { g.fillStyle = '#6a6660'; g.fillRect(x, y, ww, hh); g.fillStyle = '#9a958c'; g.fillRect(x, y, ww, 3); g.fillStyle = '#4a4640'; g.fillRect(x, y + hh - 2, ww, 2); };
      block(h - 8, h - 8, 16, 16);
      if (n) block(h - 7, 0, 14, h - 6); if (s) block(h - 7, h + 6, 14, h - 6); if (w) block(0, h - 7, h - 6, 14); if (e) block(h + 6, h - 7, h - 6, 14);
      g.fillStyle = '#3a3630'; g.fillRect(h - 8, h - 2, 16, 1); g.fillRect(h, h - 8, 1, 6); g.fillRect(h - 4, h - 1, 1, 7);
    }
    wallCache.set(key, c); return c;
  }
  const wallMask = (b) => { let m = 0; [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]].forEach(([dx, dy, bit]) => { const o = inb(b.tx + dx, b.ty + dy) && G.bgrid[idx(b.tx + dx, b.ty + dy)]; if (o && o.kind === 'building' && BLD_DEFS[o.type].wall) m |= bit; }); return m; };
  function drawBuilding(b, remembered) {
    const d = BLD_DEFS[b.type], px = b.tx * TILE, py = b.ty * TILE, s = b.size * TILE;
    const stage = stageOf(b);
    if (remembered) ctx.globalAlpha = 0.8;
    if (d.wall) { if (!b.done) ctx.globalAlpha = 0.4 + 0.6 * b.progress; ctx.drawImage(wallArt(raceOf(b.owner), wallMask(b)), px, py); }
    else ctx.drawImage(A.building(d.art, b.size, b.owner, raceOf(b.owner), stage, d.hallTier), px, py);
    ctx.globalAlpha = 1;
    if (remembered) return;
    if (b.done && !d.wall && b.hp / b.maxHp < 0.75) ctx.drawImage(A.fire(s, Math.floor(G.time * 8), b.hp / b.maxHp < 0.5), px, py);
    if (G.selection.includes(b.id)) { ctx.strokeStyle = '#4f4'; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, s - 2, s - 2); }
    // (a building going up shows only its construction bar: its hit points rise with it, so a second bar just
    // repeated the progress; the health bar comes back while it is under attack)
    if (b.done ? G.selection.includes(b.id) || b.hp < b.maxHp : G.time - (b.hitT || -99) < 5) hpBar(px + 4, py - 6, s - 8, b.hp / b.maxHp);
    const prog = !b.done ? b.progress : b.training ? b.training.progress : b.research ? b.research.progress : null;
    if (prog !== null) {
      ctx.fillStyle = '#000'; ctx.fillRect(px + 4, py + s - 10, s - 8, 8);
      ctx.fillStyle = b.done ? '#6cf' : '#fc6'; ctx.fillRect(px + 5, py + s - 9, (s - 10) * prog, 6);
    }
  }
  const DIR8 = (angle) => ((Math.round(angle / (Math.PI / 4)) + 2) % 8 + 8) % 8;
  // Draws the sprite of a unit (or a corpse) at a world position. Returns the sprite's top in screen px for the hp bar.
  function drawSprite(type, race, owner, x, y, dir, angle, anim, frame, lift, alpha, mirrorSide) {
    const px = (x + 0.5) * TILE, py = (y + 0.5) * TILE;
    let top = py - 20;
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    if (A.isLpc(type)) {
      const f = A.lpcFrame(type, race, owner, anim, dir, frame);
      if (f) {
        const w = 64 * f.scale, h = 64 * f.scale;
        ctx.drawImage(f.c, f.sx, f.sy, 64, 64, Math.round(px - w / 2), Math.round(py + 8 - h * 0.92 - lift), w, h);
        top = py + 8 - h * 0.92 - lift + h * 0.15;
      } else { const c = A.flyer('none', owner, 0).c; ctx.drawImage(c, px - 16, py - 20); }
    } else {
      const spec = A.OTHER_UNIT[type] || {};
      const cf = spec.critter && A.critter(dir, frame);
      if (cf) { const w = 128 * cf.scale; ctx.drawImage(cf.c, cf.sx, cf.sy, 128, 128, Math.round(px - w / 2), Math.round(py + 18 - w * 0.8), w, w); top = py; }
      else if (spec.siege) { const r = A.siege(spec.siege, owner, DIR8(angle), anim === 'attack' ? frame : 0); ctx.drawImage(r.c, px - r.ax, py + 6 - r.ay); top = py + 6 - r.ay; }
      else if (spec.ship) { const r = A.ship(spec, owner); ctx.save(); ctx.translate(px, py); ctx.rotate(angle + Math.PI / 2); ctx.drawImage(r.c, -r.ax, -r.ay); ctx.restore(); top = py - r.h / 2; }
      else { const r = A.flyer(type, owner, frame); ctx.save(); ctx.translate(px, py + 6 - lift); if (Math.cos(angle) < 0) ctx.scale(-1, 1); ctx.drawImage(r.c, -r.ax, -r.ay); ctx.restore(); top = py + 6 - r.ay - lift; }
    }
    ctx.globalAlpha = 1;
    return top;
  }
  function drawUnit(u) {
    const d = UNIT_DEFS[u.type], px = (u.x + 0.5) * TILE, py = (u.y + 0.5) * TILE, air = dom(u) === 'air';
    const moving = u.path.length || !atTile(u);
    const lift = air ? 10 + Math.sin(G.time * 4 + u.tx) * 2 : 0;
    if (G.selection.includes(u.id)) { ctx.strokeStyle = '#4f4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(px, py + 8, 15, 8, 0, 0, 7); ctx.stroke(); }
    const small = u.type === 'critter';
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(px, py + 9, air ? 8 : small ? 7 : 11, air ? 4 : small ? 3 : 5, 0, 0, 7); ctx.fill();
    const ghost = cloaked(u) ? 0.45 : undefined;           // own invisible units and submarines show faintly
    let anim = 'walk', frame = 0;
    if (u.anim) { anim = u.anim.name; frame = Math.min(A.frameCount(anim) - 1, Math.floor(u.anim.t / u.anim.dur * A.frameCount(anim))); if (!A.isLpc(u.type)) anim = 'attack'; }
    else if (moving) { frame = 1 + (Math.floor(u.walkT * 10) % 8); }
    else if (air) { frame = Math.floor(G.time * 6) & 1; }
    const top = drawSprite(u.type, raceOf(u.owner), u.owner, u.x, u.y, u.dir, u.angle, anim, frame, lift, ghost);
    if (u.carrying) { const c = A.carry(u.carryType || 'gold'); ctx.drawImage(c, Math.round(px + (u.dir === 'left' ? -12 : u.dir === 'right' ? 0 : -6)), Math.round(top - 4)); }
    // spell effects: a coloured ring per effect, flames circling a Flame Shield
    const rings = [['bloodlust', 'rgba(255,60,60,0.75)'], ['haste', 'rgba(255,220,80,0.75)'], ['slow', 'rgba(90,160,255,0.75)'], ['unholy', 'rgba(150,60,200,0.8)']];
    let ri = 0; for (const [k, col] of rings) if (u.fx[k] > 0) { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(px, py + 8, 13 + ri * 3, 6 + ri * 1.5, 0, 0, 7); ctx.stroke(); ri++; }
    if (u.fx.flame > 0) for (let k = 0; k < 5; k++) { const a = G.time * 4 + k * 1.2566; ctx.fillStyle = k & 1 ? 'rgba(255,200,60,0.9)' : 'rgba(255,100,20,0.9)'; ctx.beginPath(); ctx.arc(px + Math.cos(a) * 16, py + 2 + Math.sin(a) * 8 - (k % 3) * 4, 3.5, 0, 7); ctx.fill(); }
    if (G.selection.includes(u.id) || u.hp < u.maxHp) hpBar(px - 11, top - 6, 22, u.hp / u.maxHp);
    if (d.mana && G.selection.includes(u.id)) { ctx.fillStyle = '#000'; ctx.fillRect(px - 12, top - 1, 24, 4); ctx.fillStyle = '#4af'; ctx.fillRect(px - 11, top, 22 * u.mana / RULES.MANA_MAX, 2); }
  }
  function drawCorpse(c) {
    const frame = Math.min(5, Math.floor(c.t / 0.1));
    const alpha = c.t < 20 ? 1 : c.t < 32 ? 0.7 : 0.4;
    if (!A.isLpc(c.type)) { ctx.globalAlpha = alpha * 0.6; ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.ellipse((c.x + 0.5) * TILE, (c.y + 0.5) * TILE + 6, 12, 6, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; return; }
    drawSprite(c.type, c.race, c.owner, c.x, c.y, c.dir, c.angle, 'hurt', frame, 0, alpha);
  }
  function render() {
    if (ui.terrainDirty) drawTerrain();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ui.vw, ui.vh);
    ctx.save(); ctx.scale(ui.zoom, ui.zoom); ctx.translate(-Math.round(ui.camX), -Math.round(ui.camY));
    ctx.drawImage(terrainCanvas, 0, 0);
    const x0 = Math.max(0, Math.floor(ui.camX / TILE)), y0 = Math.max(0, Math.floor(ui.camY / TILE));
    const x1 = Math.min(MW - 1, Math.ceil((ui.camX + ui.vw / ui.zoom) / TILE)), y1 = Math.min(MH - 1, Math.ceil((ui.camY + ui.vh / ui.zoom) / TILE));
    // water shimmers: the visible water tiles are redrawn with the frame that matches the clock
    const wf = Math.floor(G.time / 0.4) % 3;
    if (wf) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (G.terrain[idx(x, y)] === WATER) {
      ctx.drawImage(shoreSet.has(idx(x, y)) ? shoreTile(x, y, wf) : A.tile('water', Math.floor(A.hash(x, y) * 8), wf, 255), x * TILE, y * TILE);
      if (inb(x, y + 1) && G.terrain[idx(x, y + 1)] === FOREST && A.isLoneTree(terrainMask(x, y + 1, FOREST))) A.treeTop(ctx, x * TILE, (y + 1) * TILE); // keep the crown that overhangs this water tile
    }
    for (const m of G.mines) {
      const lit = G.units.some((u) => u.hidden && u.order === 'gather' && u.phase === 'mining' && u.gatherId === m.id);
      ctx.drawImage(A.mine(m.size, lit), m.tx * TILE, m.ty * TILE);
      if (G.selection.includes(m.id)) { ctx.strokeStyle = '#ff4'; ctx.lineWidth = 2; ctx.strokeRect(m.tx * TILE + 1, m.ty * TILE + 1, m.size * TILE - 2, m.size * TILE - 2); }
    }
    for (const m of G.oils) {
      if (G.vis[idx(m.tx, m.ty)] === 0) continue;
      ctx.drawImage(A.oil(m.size), m.tx * TILE, m.ty * TILE);
      if (G.selection.includes(m.id)) { ctx.strokeStyle = '#ff4'; ctx.lineWidth = 2; ctx.strokeRect(m.tx * TILE + 1, m.ty * TILE + 1, m.size * TILE - 2, m.size * TILE - 2); }
    }
    for (const r of G.rubble) { ctx.globalAlpha = r.t < RUBBLE_TTL - 20 ? 1 : (RUBBLE_TTL - r.t) / 20; ctx.drawImage(A.rubble(r.size), (r.x - (r.size - 1) / 2) * TILE, (r.y - (r.size - 1) / 2) * TILE); ctx.globalAlpha = 1; }
    for (const c of G.corpses) if (!c.air && (c.owner === 'player' || G.vis[idx(Math.round(c.x), Math.round(c.y))] === 2)) drawCorpse(c);
    // runes: the caster's side sees them blink; others see them only faintly when close (Warcraft II)
    for (const r of G.runes) if (G.vis[idx(r.x, r.y)] === 2) { ctx.globalAlpha = r.owner === 'player' ? 0.6 + 0.4 * Math.sin(G.time * 4) : 0.25; ctx.drawImage(A.rune(), r.x * TILE + 8, r.y * TILE + 8); ctx.globalAlpha = 1; }
    const blds = G.buildings.filter((b) => b.owner === 'player' || footVisible(b));
    for (const [id, m] of G.memory) if (!footVisible(m)) drawBuilding(Object.assign({ id, hp: 1, maxHp: 1 }, m), true);
    const shown = (u) => !u.hidden && (u.owner === 'player' || (G.vis[idx(u.tx, u.ty)] === 2 && seenBy('player', u)));
    const ground = G.units.filter((u) => dom(u) !== 'air' && shown(u));
    const drawables = blds.map((b) => ({ y: (b.ty + b.size) * TILE, b })).concat(ground.map((u) => ({ y: (u.y + 0.5) * TILE + 8, u })));
    drawables.sort((p, q) => p.y - q.y);
    for (const d of drawables) d.b ? drawBuilding(d.b, false) : drawUnit(d.u);
    for (const p of G.projectiles) {
      const c = A.projectile(p.kind), ang = Math.atan2(p.ty - p.y, p.tx - p.x);
      ctx.save(); ctx.translate((p.x + 0.5) * TILE, (p.y + 0.5) * TILE - 8 - Math.sin(Math.min(1, p.t / 0.5) * Math.PI) * (p.kind === 'boulder' || p.kind === 'cannon' ? 14 : 0)); ctx.rotate(ang); ctx.drawImage(c, -10, -4); ctx.restore();
    }
    for (const i of G.impacts) ctx.drawImage(A.impact(i.kind, Math.floor(i.t / 0.1)), (i.x + 0.5) * TILE - 16, (i.y + 0.5) * TILE - 16);
    for (const c of G.corpses) if (c.air) drawCorpse(c);
    for (const u of G.units) if (dom(u) === 'air' && shown(u)) drawUnit(u);
    for (const w of G.storms) if (G.vis[idx(Math.round(w.x), Math.round(w.y))] === 2) ctx.drawImage(A.whirlwind(Math.floor(G.time * 10)), (w.x + 0.5) * TILE - 28, (w.y + 0.5) * TILE - 44);
    // fog
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const v = G.vis[idx(x, y)];
      if (v === 2) continue;
      ctx.fillStyle = v === 0 ? '#000' : 'rgba(0,0,0,0.5)'; ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    }
    if (ui.placing && ui.mouse.seen) {
      const w = screenToWorld(ui.mouse.x, ui.mouse.y), f = footOf(ui.placing, w.x, w.y), ok = canPlace(f);
      ctx.globalAlpha = 0.6; ctx.drawImage(A.building(BLD_DEFS[ui.placing].art, f.size, 'player', G.race, 3), f.tx * TILE, f.ty * TILE); ctx.globalAlpha = 1;
      // per tile: red where the ground is blocked; the whole site red when a placement rule (coast, mine distance) fails
      for (let y = f.ty; y < f.ty + f.size; y++) for (let x = f.tx; x < f.tx + f.size; x++) {
        ctx.fillStyle = ok ? 'rgba(80,255,80,0.3)' : (BLD_DEFS[ui.placing].onOil || !sPass(x, y)) ? 'rgba(255,60,60,0.5)' : 'rgba(255,160,60,0.35)';
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
      if (!ok) { const why = siteWhy(f); ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffb0a0';
        ctx.strokeText(why, (f.tx + f.size / 2) * TILE, f.ty * TILE - 6); ctx.fillText(why, (f.tx + f.size / 2) * TILE, f.ty * TILE - 6); }
    }
    if (ui.target && ui.mouse.seen) { ctx.strokeStyle = '#8cf'; ctx.lineWidth = 2; const w = screenToWorld(ui.mouse.x, ui.mouse.y); ctx.beginPath(); ctx.arc((w.x + 0.5) * TILE, (w.y + 0.5) * TILE, 14, 0, 7); ctx.stroke(); }
    ctx.restore();
    if (ui.drag && ui.drag.moved) {
      const r = canvas.getBoundingClientRect();
      ctx.strokeStyle = '#4f4'; ctx.lineWidth = 1;
      ctx.strokeRect(ui.drag.x - r.left, ui.drag.y - r.top, ui.mouse.x - ui.drag.x, ui.mouse.y - ui.drag.y);
    }
    if (ui.msgT > 0) {
      ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      const w = ctx.measureText(ui.msg).width + 40;
      ctx.fillStyle = ui.msgErr ? 'rgba(40,10,10,0.85)' : 'rgba(30,23,16,0.88)'; ctx.fillRect(ui.vw / 2 - w / 2, ui.vh - 58, w, 34);
      ctx.strokeStyle = ui.msgErr ? '#d83a2a' : '#a8813f'; ctx.lineWidth = 2; ctx.strokeRect(ui.vw / 2 - w / 2, ui.vh - 58, w, 34);
      ctx.fillStyle = '#ffd966'; ctx.fillText(ui.msg, ui.vw / 2, ui.vh - 35);
    }
    renderMinimap();
  }
  function renderMinimap() {
    const d = miniImg.data;
    const col = [[61, 122, 46], [30, 90, 30], [42, 93, 156], [107, 102, 96]];
    for (let i = 0; i < N; i++) {
      let c = col[G.terrain[i]];
      const b = G.bgrid[i];
      if (b) c = b.kind === 'res' ? (b.type === 'gold' ? [255, 210, 74] : [40, 40, 60]) : b.owner === 'player' ? [80, 140, 255] : (G.vis[i] ? [230, 70, 50] : c);
      const f = G.vis[i] === 0 ? 0 : G.vis[i] === 1 ? 0.5 : 1;
      d[i * 4] = c[0] * f; d[i * 4 + 1] = c[1] * f; d[i * 4 + 2] = c[2] * f; d[i * 4 + 3] = 255;
    }
    for (const u of G.units) {
      if (u.hidden || (u.owner !== 'player' && (G.vis[idx(u.tx, u.ty)] !== 2 || !seenBy('player', u)))) continue;
      const i = idx(u.tx, u.ty) * 4, c = u.owner === 'player' ? [140, 200, 255] : u.owner === 'enemy' ? [255, 90, 90] : [230, 230, 220];
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
    miniTmp.getContext('2d').putImageData(miniImg, 0, 0);
    mctx.imageSmoothingEnabled = false;
    mctx.drawImage(miniTmp, 0, 0, MW * MS, MH * MS);
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.strokeRect(ui.camX / TILE * MS + 0.5, ui.camY / TILE * MS + 0.5, ui.vw / ui.zoom / TILE * MS, ui.vh / ui.zoom / TILE * MS);
  }

  // ---------------------------------------------------------------- panel / HUD
  const $ = (id) => document.getElementById(id);
  function toast(m) { ui.msg = m; ui.msgT = 4; ui.msgErr = true; sfx('error'); console.log('[toast] ' + m); }
  function notice(m) { ui.msg = m; ui.msgT = 2.5; ui.msgErr = false; const el = $('notices'); if (el) { el.textContent = m; el.dataset.n = String((+el.dataset.n || 0) + 1); } }
  // ---------------------------------------------------------------- sound
  // Sampled effects and music from assets/sounds (provenance in assets/sounds/SOURCES.md) decoded into one AudioContext.
  // Every cue answers an input, combat or economy event; a short synthesized tone stands in until its clip has decoded.
  let audio = null, sfxGain = null, musicGain = null;
  const SND = {};
  const SFX_FILES = ['ack_human_yes_1', 'ack_human_yes_2', 'ack_orc_1', 'ack_orc_2', 'ack_orc_3', 'alarm_horn', 'annoyed_human_no', 'arrow_hit', 'arrow_shot', 'attack_human',
    'axe_hit', 'building_complete', 'building_destroyed_stone', 'building_destroyed_wood', 'catapult_fire', 'club_hit', 'death_human_1', 'death_human_2', 'death_orc_1', 'death_orc_2',
    'defeat', 'error', 'explosion', 'fireball', 'gold_delivered', 'hammer_1', 'hammer_2', 'hammer_3', 'heal', 'lumber_delivered', 'mine_1', 'mine_2', 'select_human_greet',
    'select_orc_1', 'select_orc_2', 'spell_cast', 'sword_hit_1', 'sword_hit_2', 'sword_hit_3', 'sword_swing', 'ui_click', 'ui_select', 'unit_ready', 'victory', 'wood_chop'];
  const MUSIC = { calm: 'bgm_market_day_loop', battle: 'bgm_battle', defeat: 'bgm_defeat_theme' };
  const music = { cur: null, src: null, gain: null, battleT: -1e9, unlocked: false, muted: false };
  try { music.muted = localStorage.getItem('rts_music') === 'off'; } catch (e) { /* storage unavailable */ }
  function ac() {
    if (audio) return audio;
    audio = new (window.AudioContext || window.webkitAudioContext)();
    sfxGain = audio.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(audio.destination);
    musicGain = audio.createGain(); musicGain.gain.value = 0.24; musicGain.connect(audio.destination); // quiet bed under the effects
    return audio;
  }
  function loadClip(name, cb) {
    if (SND[name]) { if (cb) cb(); return; }
    fetch('assets/sounds/' + name + '.ogg').then((r) => r.arrayBuffer()).then((buf) => ac().decodeAudioData(buf)).then((dec) => { SND[name] = dec; if (cb) cb(); }).catch(() => { /* clip unavailable: the tone fallback stays */ });
  }
  function loadSounds() {
    try { for (const n of SFX_FILES) loadClip(n); loadClip(MUSIC.calm); } catch (e) { /* audio unavailable */ }
  }
  const lastPlay = {};
  // Plays a decoded clip; minGap (s) throttles repeats of the same clip. Returns false when the clip is not decoded yet.
  function play(name, gain, rate, minGap) {
    if (ui.quiet) return true;
    const now = performance.now();
    if (minGap && lastPlay[name] && now - lastPlay[name] < minGap * 1000) return true;
    const buf = SND[name];
    if (!buf) return false;
    lastPlay[name] = now;
    try {
      const src = ac().createBufferSource(), g = audio.createGain();
      src.buffer = buf; src.playbackRate.value = rate || 1; g.gain.value = gain === undefined ? 1 : gain;
      src.connect(g); g.connect(sfxGain); src.start();
    } catch (e) { return false; }
    return true;
  }
  const pick = (names) => names[Math.floor(Math.random() * names.length)];
  function tone(freq, dur, type, gain, slide) {
    try {
      const o = ac().createOscillator(), g = audio.createGain(), t0 = audio.currentTime;
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
      g.gain.setValueAtTime(gain || 0.04, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + dur);
    } catch (e) { /* audio unavailable */ }
  }
  // Voice lines: three greetings per race, a fourth quick click in a row gets the annoyed line; each unit type speaks at its own pitch.
  const VOICES = {
    human: { greet: ['select_human_greet', 'ack_human_yes_1', 'ack_human_yes_2'], annoyed: 'annoyed_human_no', ack: ['ack_human_yes_1', 'ack_human_yes_2'], attack: 'attack_human', death: ['death_human_1', 'death_human_2'] },
    orc: { greet: ['select_orc_1', 'select_orc_2', 'ack_orc_1'], annoyed: 'ack_orc_3', ack: ['ack_orc_1', 'ack_orc_2', 'ack_orc_3'], attack: 'ack_orc_2', death: ['death_orc_1', 'death_orc_2'] },
  };
  const pitchOf = (type) => 0.9 + ((UNIT_DEFS[type].hp * 7 + UNIT_DEFS[type].speed * 31) % 260) / 260 * 0.2;
  function voice(u) {
    const base = 440 + (UNIT_DEFS[u.type].hp * 7 + UNIT_DEFS[u.type].speed * 31) % 260;
    if (ui.clicks.id === u.id && G.time - ui.clicks.at < 3) ui.clicks.n++; else { ui.clicks.id = u.id; ui.clicks.n = 0; }
    ui.clicks.at = G.time;
    const v = VOICES[raceOf(u.owner)] || VOICES.human, rate = pitchOf(u.type);
    if (ui.clicks.n >= 4) { if (!play(v.annoyed, 0.9, rate)) tone(base * 0.5, 0.18, 'sawtooth', 0.035, base * 0.4); return; }
    const k = ui.clicks.n % 3;
    if (!play(v.greet[k], 0.9, rate)) tone(base * [1, 1.25, 1.5][k], 0.08, 'square', 0.03, base * [1.33, 1.5, 2][k]);
  }
  let ackN = 0;
  function sfx(name) {
    const v = VOICES[G ? G.race : 'human'] || VOICES.human;
    switch (name) {
      case 'select': if (!play('ui_select', 0.7)) tone(660, 0.08, 'square', 0.03, 880); break;
      case 'ack': if (!play(v.ack[ackN++ % v.ack.length], 0.9)) tone(520, 0.06, 'triangle', 0.03, 620); break;
      case 'attack': if (!play(v.attack, 0.9)) tone(520, 0.06, 'triangle', 0.03, 620); break;
      case 'clank': if (!play(pick(['sword_hit_1', 'sword_hit_2', 'sword_hit_3']), 0.5, 1, 0.12)) tone(180, 0.08, 'sawtooth', 0.05, 90); break;
      case 'arrow': if (!play('arrow_hit', 0.5, 1, 0.12)) tone(1200, 0.06, 'sine', 0.03, 400); break;
      case 'shot': if (!play('arrow_shot', 0.4, 1, 0.15)) tone(1500, 0.05, 'sine', 0.02, 900); break;
      case 'siege': if (!play('catapult_fire', 0.5, 1, 0.3)) tone(120, 0.2, 'sawtooth', 0.05, 60); break;
      case 'explosion': if (!play('explosion', 0.5, 1, 0.3)) tone(90, 0.3, 'sawtooth', 0.06, 40); break;
      case 'spell': if (!play('spell_cast', 0.7)) tone(300, 0.25, 'sine', 0.04, 1200); break;
      case 'fireball': if (!play('fireball', 0.7)) tone(300, 0.25, 'sine', 0.04, 1200); break;
      case 'heal': if (!play('heal', 0.6)) tone(600, 0.25, 'sine', 0.04, 1200); break;
      case 'error': if (!play('error', 0.7)) tone(160, 0.15, 'square', 0.03, 120); break;
      case 'done': if (!play('building_complete', 0.6)) tone(440, 0.12, 'triangle', 0.03, 880); break;
      case 'ready': if (!play('unit_ready', 0.7)) tone(587, 0.1, 'triangle', 0.03, 784); break;
      case 'alarm': if (!play('alarm_horn', 0.8)) tone(880, 0.3, 'square', 0.04, 440); break;
      case 'click': if (!play('ui_click', 0.6)) tone(700, 0.04, 'square', 0.02, 900); break;
      case 'chop': if (!play('wood_chop', 0.35, 0.9 + Math.random() * 0.2, 0.25)) tone(220, 0.05, 'triangle', 0.02, 120); break;
      case 'mine': if (!play(pick(['mine_1', 'mine_2']), 0.4, 1, 0.25)) tone(500, 0.05, 'triangle', 0.02, 300); break;
      case 'gold': if (!play('gold_delivered', 0.45, 1, 0.3)) tone(900, 0.06, 'triangle', 0.02, 1400); break;
      case 'lumber': if (!play('lumber_delivered', 0.45, 1, 0.3)) tone(300, 0.06, 'triangle', 0.02, 200); break;
      case 'hammer': if (!play(pick(['hammer_1', 'hammer_2', 'hammer_3']), 0.45, 1, 0.2)) tone(400, 0.04, 'triangle', 0.02, 300); break;
      case 'death': if (!play(pick(v.death), 0.6, 1, 0.2)) tone(300, 0.2, 'sawtooth', 0.03, 100); break;
      case 'razed': if (!play(G.race === 'orc' ? 'building_destroyed_wood' : 'building_destroyed_stone', 0.8, 1, 0.3)) tone(100, 0.3, 'sawtooth', 0.05, 50); break;
    }
  }
  // Cues for things that happen on the map play only for the player's side and only when the spot is on screen.
  function cueAt(name, e) { if (G && !offScreen(e)) sfx(name); }
  // Background music: one looped source at a time (calm loop; the battle track while the player's side is being hit;
  // the defeat theme or victory jingle at the end). Starts after the first input, so nothing plays unasked.
  function setMusic(kind) {
    if (music.cur === kind) return;
    if (music.src) { try { const old = music.src, og = music.gain, t0 = audio.currentTime; og.gain.setValueAtTime(og.gain.value, t0); og.gain.linearRampToValueAtTime(0.001, t0 + 1.2); old.stop(t0 + 1.3); } catch (e) { /* already stopped */ } music.src = null; music.gain = null; }
    music.cur = kind;
    if (!kind) return;
    const file = MUSIC[kind] || kind;
    if (!SND[file]) { loadClip(file, () => { if (music.cur === kind && !music.src) startMusic(kind, file); }); return; }
    startMusic(kind, file);
  }
  function startMusic(kind, file) {
    if (music.muted || !music.unlocked) return;
    try {
      const src = ac().createBufferSource(), g = audio.createGain();
      src.buffer = SND[file]; src.loop = kind !== 'victory'; g.gain.value = 1; src.connect(g); g.connect(musicGain); src.start();
      music.src = src; music.gain = g;
    } catch (e) { /* audio unavailable */ }
  }
  // fromGesture: a track that is not playing yet (nothing decoded at the first click, or music just switched on)
  // is only ever started from an input event; the frame loop only switches between the calm and battle tracks.
  function updateMusic(fromGesture) {
    if (!music.unlocked || music.muted || !G || G.winner) return;
    const want = G.time - music.battleT < 25 ? 'battle' : 'calm';
    if (want !== music.cur) setMusic(want);
    else if (fromGesture && !music.src && SND[MUSIC[want]]) startMusic(want, MUSIC[want]);
  }
  function unlockAudio() {
    music.unlocked = true;
    try { if (ac().state !== 'running') audio.resume(); } catch (e) { /* audio unavailable */ } // browsers keep the context suspended until an input; retry on every input
    updateMusic(true);
  }
  function toggleMusic() {
    music.muted = !music.muted;
    try { localStorage.setItem('rts_music', music.muted ? 'off' : 'on'); } catch (e) { /* storage unavailable */ }
    const btn = $('music-btn'); if (btn) { btn.textContent = music.muted ? '♪ off' : '♪ on'; btn.title = music.muted ? 'Music off (click to turn on)' : 'Music on (click to turn off)'; }
    if (music.muted) { if (music.src) { try { music.src.stop(); } catch (e) { /* already stopped */ } music.src = null; } music.cur = null; }
    else updateMusic(true);
  }
  function selected() { return G.selection.map((id) => G.ents.get(id)).filter(Boolean); }
  const costText = (c) => c.gold + 'g' + (c.lumber ? ' ' + c.lumber + 'l' : '') + (c.oil ? ' ' + c.oil + 'o' : '');
  const portrait = $('portrait'), pctx = portrait.getContext('2d');
  function drawPortrait(e) {
    pctx.imageSmoothingEnabled = false;
    pctx.fillStyle = '#1a1208'; pctx.fillRect(0, 0, 64, 64);
    if (!e) return;
    if (e.kind === 'res') { const c = G.mines.includes(e) ? A.mine(e.size, false) : A.oil(e.size); pctx.drawImage(c, 4, 4, 56, 56); return; }
    if (e.kind === 'unit') { const s = A.portrait(e.type, raceOf(e.owner), e.owner); const k = Math.min(60 / s.sw, 60 / s.sh); pctx.drawImage(s.c, s.sx, s.sy, s.sw, s.sh, 32 - s.sw * k / 2, 32 - s.sh * k / 2, s.sw * k, s.sh * k); }
    else if (BLD_DEFS[e.type].wall) pctx.drawImage(wallArt(raceOf(e.owner), 10), 4, 4, 56, 56);
    else { const c = A.building(BLD_DEFS[e.type].art, e.size, e.owner, raceOf(e.owner), 3, BLD_DEFS[e.type].hallTier); pctx.drawImage(c, 4, 4, 56, 56); }
  }
  function updatePanel() {
    const P = G.players.player, f = food('player');
    $('gold').textContent = Math.floor(P.gold); $('lumber').textContent = Math.floor(P.lumber); $('oil').textContent = Math.floor(P.oil); $('food').textContent = f.used + '/' + f.cap;
    const t = Math.floor(G.time); $('clock').textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + (speed !== 1 ? '  x' + speed : '');
    const sel = selected();
    const selIds = G.selection.join(','); if (selIds !== ui.cardFor) { ui.cardFor = selIds; ui.card = null; }   // a new selection leaves any build submenu
    let html = '';
    if (sel.length === 1 && sel[0].kind === 'res') {
      const e = sel[0], gold = e.type === 'goldmine' || G.mines.includes(e);
      html = '<div class="name">' + (gold ? 'Gold Mine' : 'Oil Patch') + '</div><div class="order">' + (gold ? 'Gold left: ' : 'Oil left: ') + e.amount + '</div>';
    } else if (sel.length === 1) {
      const e = sel[0];
      const hpf = e.hp / e.maxHp;
      html = '<div class="name">' + label(e) + (e.owner === 'enemy' ? ' <span class="enemy">(enemy)</span>' : '') + '</div>' +
        '<div class="bar"><div class="fill" style="width:' + Math.round(hpf * 100) + '%;background:' + (hpf > 0.6 ? '#3c3' : hpf > 0.3 ? '#dd3' : '#d33') + '"></div><span>HP ' + Math.ceil(e.hp) + ' / ' + e.maxHp + '</span></div>';
      if (e.kind === 'unit') {
        const d = UNIT_DEFS[e.type];
        html += '<div class="stats"><span>Level ' + (1 + G.players[e.owner].upgrades.length) + '</span><span>Armor ' + armorOf(e) + '</span><span>Damage ' + Math.ceil(maxDamage(e) / 2) + '-' + maxDamage(e) + '</span><span>Range ' + rangeOf(e) + '</span><span>Sight ' + sightOf(e) + '</span><span>Speed ' + d.wcSpeed + '</span></div>';
        if (d.mana) html += '<div class="bar mana"><div class="fill" style="width:' + Math.round(100 * e.mana / RULES.MANA_MAX) + '%"></div><span>Mana ' + Math.floor(e.mana) + ' / ' + RULES.MANA_MAX + '</span></div>';
        const fxs = FX.filter((k) => e.fx[k] > 0).map((k) => ({ slow: 'Slowed', haste: 'Hasted', bloodlust: 'Bloodlust', invis: 'Invisible', unholy: 'Unholy Armor', flame: 'Flame Shield' }[k] + ' ' + Math.ceil(e.fx[k]) + 's'));
        if (fxs.length) html += '<div class="order">' + fxs.join(' · ') + '</div>';
        if (e.ttl !== undefined) html += '<div class="order">Vanishes in ' + Math.ceil(e.ttl) + 's</div>';
        if (d.capacity) html += '<div class="order">Cargo ' + e.cargo.length + ' / ' + d.capacity + '</div>';
        html += '<div class="order">' + orderText(e) + '</div>';
      } else if (!e.done) html += '<div class="bar prog"><div class="fill" style="width:' + Math.round(e.progress * 100) + '%"></div><span>Building ' + Math.floor(e.progress * 100) + '%</span></div>';
      else if (e.training) html += '<div class="bar prog"><div class="fill" style="width:' + Math.round(e.training.progress * 100) + '%"></div><span>Training ' + label({ type: e.training.type, owner: e.owner }) + ' ' + Math.floor(e.training.progress * 100) + '%</span></div>';
      else if (e.research) html += '<div class="bar prog"><div class="fill" style="width:' + Math.round(e.research.progress * 100) + '%"></div><span>' + upLabel(e.research.upgrade, raceOf(e.owner)) + ' ' + Math.floor(e.research.progress * 100) + '%</span></div>';
      else html += '<div class="stats"><span>Armor ' + BLD_DEFS[e.type].armor + '</span><span>Sight ' + BLD_DEFS[e.type].sight + '</span>' + (BLD_DEFS[e.type].range ? '<span>Range ' + BLD_DEFS[e.type].range + '</span>' : '') + '</div><div class="order">Idle</div>';
    } else if (sel.length > 1) {
      // Warcraft II group box: a small icon per selected unit with its own health bar; clicking one selects just that unit
      const MAX = 18;
      html = '<div class="name">' + sel.length + ' selected</div><div class="multi">' + sel.slice(0, MAX).map((e) => {
        const hpf = Math.max(0, e.hp / e.maxHp), src = selIcon(e);
        return '<div class="mu" data-id="' + e.id + '" title="' + label(e) + ' ' + Math.ceil(e.hp) + '/' + e.maxHp + '">' + (src ? '<img src="' + src + '">' : '<b>' + label(e).slice(0, 3) + '</b>') +
          '<i style="width:' + Math.round(hpf * 100) + '%;background:' + (hpf > 0.6 ? '#3c3' : hpf > 0.3 ? '#dd3' : '#d33') + '"></i></div>';
      }).join('') + (sel.length > MAX ? '<div class="mu more">+' + (sel.length - MAX) + '</div>' : '') + '</div>';
    } else html = '<div class="name dim">Nothing selected</div><div class="order">Left-click or drag to select</div>';
    if (html !== ui.infoHtml) { ui.infoHtml = html; $('info').innerHTML = html; }
    const key = sel.map((e) => e.id + (e.done === false ? '*' : '') + (e.training ? 't' : '') + (e.research ? 'r' : '')).join(',') + '|' + (ui.placing || '') + '|' + (ui.target || '') + '|' + (sel[0] && sel[0].type) + '|' + G.players.player.upgrades.length + '|' + (ui.card || '') + '|' + sel.some((e) => e.carrying);
    if (key !== ui.panelKey) { ui.panelKey = key; buildButtons(sel); drawPortrait(sel.length === 1 ? sel[0] : null); $('portrait').hidden = sel.length > 1; }   // a group uses the full width for its icons
    for (const c of ui.btnChecks || []) { // greyed state follows gold, lumber, food and prerequisites without rebuilding the buttons
      const w = c.why(), k = w ? w.m : '';
      if (k === c.last) continue;
      c.last = k; c.b.classList.toggle('off', !!w); c.sm.textContent = w ? w.s : c.sub; c.b.title = w ? c.tip + '\n\n' + w.m : c.tip;
    }
    if (ui.msgT > 0) ui.msgT -= 1 / 60;
  }
  const selIconCache = {};
  function selIcon(e) { // data URL of the unit's or building's command-card icon, cached once the images have loaded
    const race = raceOf(e.owner), k = e.kind + ':' + e.type + ':' + race;
    if (selIconCache[k]) return selIconCache[k];
    const c = !A.cardIcon ? null : e.kind === 'unit' ? A.cardIcon('unit', e.type, race)
      : e.kind === 'building' ? A.cardIcon('building', BLD_DEFS[e.type].art, race, e.owner, { tier: BLD_DEFS[e.type].hallTier }) : null;
    return c ? (selIconCache[k] = c.toDataURL()) : '';
  }
  function orderText(u) {
    if (u.order === 'gather') return u.phase === 'toBase' ? 'Returning ' + (u.carryType || '') : u.phase === 'mining' ? 'Mining gold' : u.phase === 'chopping' ? 'Chopping wood' : u.phase === 'pumping' ? 'Pumping oil' : 'Gathering';
    if (u.carrying) return 'Carrying ' + u.carrying + ' ' + u.carryType;
    return { idle: 'Idle', move: 'Moving', attack: 'Attacking', attackGround: 'Attacking the ground', follow: 'Following', attackMove: 'Attack-moving', patrol: 'Patrolling', hold: 'Holding position', build: 'Going to build', building: 'Building', cast: 'Casting', repair: 'Repairing', load: 'Boarding', unload: 'Unloading' }[u.order] || u.order;
  }
  function buildButtons(sel) {
    const box = $('buttons'); box.textContent = ''; ui.btnChecks = []; ui.hot = {};
    // why: returns null when the action is possible now, else { s, m }; such a button is greyed with the short reason
    // under its label, and clicking it shows the full message instead of doing nothing.
    // Warcraft II command card: every button has a one-letter hotkey, shown underlined in its label. A letter already
    // used on this card falls back to the first free letter of the label.
    const add = (text, sub, iconName, fn, title, art, why, hot) => {
      const b = document.createElement('button');
      hot = (hot || '').toLowerCase();
      if (!hot || ui.hot[hot]) hot = [...text.toLowerCase()].find((ch) => /[a-z]/.test(ch) && !ui.hot[ch]) || '';
      // 46x38 Warcraft II icon (art.js cardIcon); the older drawn sprites and icons stay as the fallback
      const ORDER_ICON = { Harvest: 'harvest', 'Return goods': 'return', 'Return oil': 'return', 'Haul oil': 'harvest', 'Build Basic': 'build', 'Build Advanced': 'build2',
        'Attack ground': 'attack_ground', Demolish: 'demolish', Unload: 'unload', Board: 'board', 'Stand Ground': 'hold', Cancel: 'cancel' };
      const ci = art && art.building && BLD_DEFS[art.building].wall ? (() => { const c = document.createElement('canvas'); c.width = 46; c.height = 38; const g = c.getContext('2d'); g.fillStyle = '#2a4a1c'; g.fillRect(0, 0, 46, 38); g.drawImage(wallArt(G.race, 10), 0, 0, 32, 32, 3, 3, 40, 32); return c; })()
        : !A.cardIcon ? null : art && art.unit ? A.cardIcon('unit', art.unit, G.race)
        : art && art.building ? A.cardIcon('building', BLD_DEFS[art.building].art, G.race, 'player', { tier: BLD_DEFS[art.building].hallTier })
        : art && art.icon ? A.cardIcon(art.icon[0], art.icon[1], G.race)
        : A.cardIcon('order', ORDER_ICON[text] || iconName, G.race);
      const im = document.createElement('canvas'); im.width = 46; im.height = 38; const ig = im.getContext('2d'); ig.imageSmoothingEnabled = false;
      if (ci) ig.drawImage(ci, 0, 0);
      else if (art && art.unit) { const sp = A.portrait(art.unit, G.race, 'player'); const k = Math.min(38 / sp.sw, 38 / sp.sh); ig.drawImage(sp.c, sp.sx, sp.sy, sp.sw, sp.sh, 23 - sp.sw * k / 2, 19 - sp.sh * k / 2, sp.sw * k, sp.sh * k); }
      else if (art && art.building) { const d = BLD_DEFS[art.building]; ig.drawImage(A.building(d.art, d.size, 'player', G.race, 3, d.hallTier), 4, 0, 38, 38); }
      else if (iconName) ig.drawImage(A.icon(iconName), 11, 7);
      b.appendChild(im);
      const s = document.createElement('span'), at = hot ? text.toLowerCase().indexOf(hot) : -1;
      if (at >= 0) { s.append(text.slice(0, at)); const u = document.createElement('u'); u.textContent = text[at]; s.append(u, text.slice(at + 1)); }
      else s.textContent = text + (hot ? ' (' + (hot === 'escape' ? 'Esc' : hot.toUpperCase()) + ')' : '');
      b.appendChild(s);
      let sm = null;
      if (sub || why) { sm = document.createElement('small'); sm.textContent = sub; b.appendChild(sm); }
      const tip = [text + (hot ? '  [' + (hot === 'escape' ? 'Esc' : hot.toUpperCase()) + ']' : ''), sub && /\d/.test(sub) ? 'Cost: ' + sub : '', title].filter(Boolean).join('\n');
      b.title = tip;
      b.onclick = why ? () => { const w = why(); if (w) toast(w.m); else fn(); } : fn; box.appendChild(b);
      if (hot) ui.hot[hot] = b;
      if (why) ui.btnChecks.push({ b, sm, sub, tip, why, last: undefined });
    };
    const own = sel.filter((e) => e.owner === 'player');
    if (!own.length) return;
    const R = RACES[G.race];
    if (own.length === 1 && own[0].kind === 'building') {
      const b = own[0];
      if (!b.done || b.training || b.research) { add('Cancel', '', 'cancel', () => issueCommand({ action: 'cancel', buildingId: b.id }, 'player'), '', null, null, 'Escape'); if (!b.done) return; }
      const reqText = (req, needs) => { const l = (req || []).map((k) => R.labels[R.buildings[k]]).concat((needs || []).map((id) => upLabel(id, G.race))); return l.length ? 'Requires ' + l.join(', ') : ''; };
      for (const type of Object.values(R.units)) { const d = UNIT_DEFS[type]; if (trainsAt(b, type) && trainable('player', type))
        add(R.labels[type], costText(d.cost), 'build', () => { issueCommand({ action: 'train', buildingId: b.id, type }, 'player'); }, reqText(d.requires), { unit: type },
          () => trainWhy('player', b, type), R.hotkeys[keyOf({ kind: 'unit', type })]); }
      // research: a level-2 upgrade appears once level 1 is done; spells already known are not offered
      const bk = BLD_DEFS[b.type].key, ups = G.players.player.upgrades;
      for (const [id, u] of Object.entries(UPGRADES)) {
        if (u.at !== bk || !upAvail(id, G.race) || (!u.becomes && ups.includes(id))) continue;
        const info = upInfo(id, G.race);
        if (info.needs.some((n) => UPGRADES[n].at === bk && !ups.includes(n))) continue;
        add(upLabel(id, G.race), costText(info.cost), u.becomes ? 'build' : 'research', () => { issueCommand({ action: 'research', buildingId: b.id, upgrade: id }, 'player'); },
          reqText(info.requires, info.needs), { icon: ['upgrade', id] }, () => researchWhy('player', b, id), typeof u.key === 'object' ? u.key[G.race] : u.key);
      }
      if (UNIT_DEFS[b.training && b.training.type]) return;
      return;
    }
    const units = own.filter((e) => e.kind === 'unit');
    if (!units.length) return;
    const ids = units.map((u) => u.id);
    const go = (t) => () => { ui.target = t; ui.placing = null; };
    const isCaster = units.every((u) => (UNIT_DEFS[u.type].spells || []).length);
    // order buttons first, in the Warcraft II layout: Move, Stop, Attack on the top row
    if (!ui.placing && !ui.card) {
      add('Move', '', 'move', go('move'), '', null, null, 'm');
      add('Stop', '', 'stop', () => { issueCommand({ action: 'stop', unitIds: ids }, 'player'); sfx('ack'); }, '', null, null, 's');
      if (units.some((u) => UNIT_DEFS[u.type].combat || UNIT_DEFS[u.type].dmg)) add('Attack', '', 'attack', go('attackMove'), '', null, null, 'a');
    }
    const workers = units.some((u) => keyOf(u) === 'worker');
    if (workers) {
      if (ui.placing || ui.card) {
        // build submenu: Basic (hall, farm, barracks, mill, smith, tower) or Advanced (everything else); Esc goes back
        const basic = ['hall', 'farm', 'barracks', 'mill', 'smith', 'scout', 'wall'];
        if (!ui.placing) for (const [role, type] of Object.entries(R.buildings)) { const d = BLD_DEFS[type]; if (!d.cost || d.onOil || d.upgradeOf || basic.includes(role) !== (ui.card === 'basic') || (d.wall && !G.walls)) continue;
          add(R.labels[type], costText(d.cost), 'build', () => { ui.placing = type; ui.target = null; }, [d.requires.length ? 'Requires ' + d.requires.map((k) => R.labels[R.buildings[k]]).join(', ') : '', d.shore ? 'Must touch the coast' : '', d.mineGap ? 'More than 3 tiles from a gold mine' : ''].filter(Boolean).join('\n'), { building: type },
            () => buildWhy('player', type), R.hotkeys[role]); }
        add('Cancel', '', 'cancel', () => { if (ui.placing) ui.placing = null; else ui.card = null; ui.panelKey = ''; }, '', null, null, 'Escape');
        return;
      }
      add('Repair', '', 'repair', go('repair'), '', null, null, 'r');
      if (units.some((u) => u.carrying)) add('Return goods', '', 'gather', () => issueCommand({ action: 'returnGoods', unitIds: ids }, 'player'), 'Carry the load to the nearest hall', null, null, 'g');
      else add('Harvest', '', 'gather', go('gather'), 'Mine gold or chop lumber (right-click a mine or tree)', null, null, 'h');
      add('Build Basic', '', 'build', () => { ui.card = 'basic'; ui.panelKey = ''; }, 'Town Hall, Farm, Barracks, Lumber Mill, Blacksmith, Tower', null, null, 'b');
      add('Build Advanced', '', 'build', () => { ui.card = 'advanced'; ui.panelKey = ''; }, 'Shipyard, Stables, Church, Mage Tower and the rest', null, null, 'v');
    }
    if (units.some((u) => UNIT_DEFS[u.type].gathers && UNIT_DEFS[u.type].gathers.includes('oil'))) {
      if (units.some((u) => u.carrying)) add('Return oil', '', 'gather', () => issueCommand({ action: 'returnGoods', unitIds: ids }, 'player'), '', null, null, 'g');
      else add('Haul oil', '', 'gather', () => issueCommand({ action: 'gather', unitIds: ids }, 'player'), '', null, null, 'h');
      const pl = B('player', 'platform'); add(R.labels[pl], costText(BLD_DEFS[pl].cost), 'build', () => { ui.placing = pl; ui.target = null; }, 'On an oil patch', { building: pl }, () => buildWhy('player', pl), 'b');
      if (ui.placing) { add('Cancel', '', 'cancel', () => { ui.placing = null; ui.panelKey = ''; }, '', null, null, 'Escape'); return; }
    }
    if (units.some((u) => UNIT_DEFS[u.type].capacity)) add('Unload', '', 'load', () => issueCommand({ action: 'unload', unitIds: ids }, 'player'), '', null, null, 'u');
    if (units.some((u) => UNIT_DEFS[u.type].groundAttack || UNIT_DEFS[u.type].demolish)) add(units.some((u) => UNIT_DEFS[u.type].demolish) ? 'Demolish' : 'Attack ground', '', 'attack', go('attackGround'), '', null, null, 'g');
    // Patrol: fighters, and (Warcraft II) the scouts and demolition units too; Stand Ground only for fighters
    if (!workers && !isCaster && units.some((u) => UNIT_DEFS[u.type].combat || UNIT_DEFS[u.type].demolish || ['flier', 'eye'].includes(keyOf(u)))) add('Patrol', '', 'patrol', go('patrol'), '', null, null, 'p');
    if (!workers && !isCaster && units.some((u) => UNIT_DEFS[u.type].combat)) {
      add('Stand Ground', '', 'hold', () => { issueCommand({ action: 'hold', unitIds: ids }, 'player'); sfx('ack'); }, 'Hold position and fight only what comes in range', null, null, 't');
    }
    const spells = new Set(); units.forEach((u) => (UNIT_DEFS[u.type].spells || []).forEach((s) => spells.add(s)));
    for (const s of spells) if (spellKnown('player', s)) {
      const sp = SPELLS[s], cost = sp.perHp ? sp.perHp + '/hp' : sp.perWave ? sp.perWave + '/wave' : sp.mana;
      add(sp.label, cost + ' mana', 'cast', go(s), sp.target === 'point' ? 'Click a spot' : 'Click a unit', { icon: ['spell', s] },
        () => (units.some((u) => (UNIT_DEFS[u.type].spells || []).includes(s) && u.mana >= (sp.perHp || spellCost(sp))) ? null : { s: 'no mana', m: 'Not enough mana for ' + sp.label + ' (needs ' + (sp.perHp || spellCost(sp)) + ')' }), sp.key);
    }
    if (units.some((u) => dom(u) === 'ground') && G.units.some((t) => t.owner === 'player' && UNIT_DEFS[t.type].capacity)) add('Board', 'transport', 'load', go('load'), 'Click a transport', null, null, 'o');
  }
  // ---------------------------------------------------------------- cheat codes (wiki: Warcraft II cheat codes)
  // Enter opens a text line; any code that works marks the game, and the results screen then shows the rank "Cheater!".
  const cheatRate = () => (G.cheats && G.cheats.fast ? 10 : 1);
  // a cheat typed or sent through the API is an input like any order: recorded for the replay
  function cheatInput(text) { if (G && G.replay) return false; rec('cheat', text); recMute++; try { return applyCheat(text); } finally { recMute--; } }
  function applyCheat(text) {
    const c = String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!G || !c) return false;
    G.cheats = G.cheats || {};
    const P = G.players.player, grant = (pred) => { for (const [id, u] of Object.entries(UPGRADES)) if (!u.becomes && upAvail(id, G.race) && !P.upgrades.includes(id) && pred(u, id)) completeUpgrade({ owner: 'player', type: null }, id); };
    const all = () => ['player'].concat(Object.keys(G.players).filter((o) => o !== 'player' && o !== 'neutral'));
    const say = (m) => notice(m);
    const table = {
      'day': () => say('FEIF'),
      'ucla': () => say('Go Bruins!'),
      'disco': () => say('Disco! (the hidden song is not included)'),
      'deck me out': () => { grant((u) => u.effect && !u.spell && !u.convert && !u.grants); say('All weapon and armor upgrades'); },
      'every little thing she does': () => { grant((u) => !!u.spell || !!u.grants); G.cheats.mana = true; say('All spells and unlimited mana'); },
      'glittering prizes': () => { for (const o of all()) { const Q = G.players[o]; Q.gold += 10000; Q.lumber += 5000; Q.oil += 5000; } say('Resources for everyone'); },
      'valdez': () => { P.oil += 5000; say('5000 oil'); },
      'hatchet': () => { G.cheats.hatchet = true; say('Trees fall faster'); },
      'make it so': () => { G.cheats.fast = true; say('Faster building, training and research'); },
      'it is a good day to die': () => { G.cheats.god = true; say('Invincible'); },
      'never a winner': () => { G.cheats.noWin = true; say('Victory conditions disabled'); },
      'noglues': () => { G.cheats.noScreens = true; say('Victory and defeat screens disabled'); },
      'on screen': () => { G.reveal = true; updateFog(); say('The whole map is revealed'); },
      'showpath': () => { G.reveal = true; updateFog(); say('The whole map is revealed'); },
      'unite the clans': () => { G.winner = 'player'; showResult(); },
      'you pitiful worm': () => { G.winner = 'enemy'; showResult(); },
      'there can be only one': () => say('There is no campaign yet'),
      'tigerlily': () => say('There is no campaign yet'),
    };
    const f = table[c];
    if (!f) return false;
    G.cheated = true; ui.panelKey = ''; f(); sfx('done');
    return true;
  }
  function openCheatLine() {
    const el = $('cheat'); if (!el || !G) return;
    el.hidden = false; el.value = ''; el.focus();
  }
  // Warcraft II results screen: per side Units, Buildings, Gold, Lumber, Oil, Kills, Razings; the score is the point
  // value of everything the side destroyed plus 500 for the winner, and the rank comes from the race's rank table.
  function finalScore(side) { return G.stats[side].score + (G.winner === side ? 500 : 0); }
  function rankOf(score, race) { if (G.cheated) return 'Cheater!'; let r = ''; for (const [min, name] of RULES.RANKS[race]) if (score >= min) r = name; return r; }
  function showResult() {
    if (G.cheats && G.cheats.noScreens) return;
    const t = Math.floor(G.time), score = finalScore('player');
    setMusic(G.winner === 'player' ? 'victory' : 'defeat');
    $('result').textContent = G.winner === 'player' ? 'Victory!' : 'Defeat';
    $('result').className = G.winner;
    $('result-sub').textContent = G.winner === 'player' ? 'The enemy has been wiped from the map.' : 'Your forces have been annihilated.';
    const cols = [['Units', 'units'], ['Buildings', 'buildings'], ['Gold', 'gold'], ['Lumber', 'lumber'], ['Oil', 'oil'], ['Kills', 'kills'], ['Razings', 'razed']];
    const tb = $('result-table'); tb.textContent = '';
    const tr = (cls, cells, th) => { const r = document.createElement('tr'); if (cls) r.className = cls; for (const c of cells) { const d = document.createElement(th ? 'th' : 'td'); d.textContent = c; r.appendChild(d); } tb.appendChild(r); };
    tr('', [''].concat(cols.map((c) => c[0]), ['Score']), true);
    tr('player', ['You'].concat(cols.map((c) => G.stats.player[c[1]]), [score]));
    tr('enemy', [G.enemyRace === 'orc' ? 'Horde' : 'Alliance'].concat(cols.map((c) => G.stats.enemy[c[1]]), [finalScore('enemy')]));
    $('result-score').textContent = 'Time ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0') + ' · Your rank: ' + rankOf(score, G.race);
    $('overlay').hidden = false;
  }

  // ---------------------------------------------------------------- input
  function screenToWorld(px, py) {
    const r = canvas.getBoundingClientRect();
    return { x: ((px - r.left) / ui.zoom + ui.camX) / TILE - 0.5, y: ((py - r.top) / ui.zoom + ui.camY) / TILE - 0.5 };
  }
  function pickAt(wx, wy) {
    let best = null, bd = 0.6;
    for (const u of G.units) {
      if (u.hidden || (u.owner !== 'player' && (G.vis[idx(u.tx, u.ty)] !== 2 || !seenBy('player', u)))) continue;
      const d = Math.hypot(u.x - wx, u.y - wy); if (d < bd) { bd = d; best = u; }
    }
    if (best) return best;
    const tx = Math.round(wx), ty = Math.round(wy);
    if (!inb(tx, ty)) return null;
    const b = G.bgrid[idx(tx, ty)];
    if (b && (b.kind === 'res' || b.owner === 'player' || G.vis[idx(tx, ty)] === 2)) return b;
    const tr = G.trees.get(idx(tx, ty));
    if (tr && G.vis[idx(tx, ty)]) return tr;
    return null;
  }
  const ownSel = () => G.selection.filter((id) => { const x = G.ents.get(id); return x && x.kind === 'unit' && x.owner === 'player'; });
  function leftClick(px, py, shift) {
    const w = screenToWorld(px, py), e = pickAt(w.x, w.y);
    if (!e || (e.kind === 'res' && e.type === 'tree')) { if (!shift) G.selection = []; return; }
    if (e.kind === 'res') { G.selection = [e.id]; sfx('select'); return; }   // a gold mine or oil patch shows what is left in it
    if (e.type === 'critter') {                                             // WC2 joke: pester a critter and it explodes
      const p = ui.pester && ui.pester.id === e.id && performance.now() - ui.pester.t < 700 ? ui.pester : { id: e.id, n: 0 };
      p.n++; p.t = performance.now(); ui.pester = p;
      if (p.n >= 8) { ui.pester = null; spark('boom', e.x, e.y); cueAt('explosion', e); kill(e, null); G.selection = []; return; }
    }
    if (shift && e.owner === 'player' && e.kind === 'unit') {
      const base = ownSel();
      const i = base.indexOf(e.id);
      if (i >= 0) base.splice(i, 1); else if (base.length < SELECT_CAP) base.push(e.id);
      G.selection = base;
    } else G.selection = [e.id];
    if (e.owner === 'player' && e.kind === 'unit') voice(e); else if (e.owner === 'player') sfx('select');
  }
  function selectType(u, add) {
    const r = canvas.getBoundingClientRect(), onScreen = (e) => { const p = worldToScreen(e.x, e.y); return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom; };
    const same = G.units.filter((e) => e.owner === 'player' && e.type === u.type && !e.hidden && !e.aboard && onScreen(e)).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
    const base = add ? ownSel() : [];
    for (const e of same) if (base.length < SELECT_CAP && !base.includes(e.id)) base.push(e.id);
    G.selection = base; voice(u);
  }
  function boxSelect(ax, ay, bx, by, shift) {
    const a = screenToWorld(Math.min(ax, bx), Math.min(ay, by)), b = screenToWorld(Math.max(ax, bx), Math.max(ay, by));
    const hits = G.units.filter((u) => u.owner === 'player' && !u.hidden && u.x >= a.x - 0.4 && u.x <= b.x + 0.4 && u.y >= a.y - 0.4 && u.y <= b.y + 0.4).map((u) => u.id);
    const base = shift ? ownSel() : [];
    for (const id of hits) if (!base.includes(id) && base.length < SELECT_CAP) base.push(id);
    if (base.length || !shift) G.selection = base;
    if (hits.length) sfx('select');
  }
  function rightClick(px, py) {
    const units = selected().filter((e) => e.kind === 'unit' && e.owner === 'player');
    if (!units.length) return;
    const ids = units.map((u) => u.id), w = screenToWorld(px, py), t = pickAt(w.x, w.y);
    let ok = false;
    if (t && t.kind !== 'res' && (t.owner === 'enemy' || (isNeutral(t) && units.some((u) => UNIT_DEFS[u.type].dmg + UNIT_DEFS[u.type].pierce > 0)))) ok = issueCommand({ action: 'attack', unitIds: ids, targetId: t.id }, 'player');
    else if (t && t.kind === 'building' && t.owner === 'player' && t.done && t.hp < t.maxHp && units.some((u) => keyOf(u) === 'worker')) ok = issueCommand({ action: 'repair', unitIds: ids, targetId: t.id }, 'player');
    else if (t && t.kind === 'unit' && t.owner === 'player' && UNIT_DEFS[t.type].capacity && units.some((u) => dom(u) === 'ground')) ok = issueCommand({ action: 'load', unitIds: ids, targetId: t.id }, 'player');
    else if (t && t.kind === 'unit' && t.owner === 'player' && !ids.includes(t.id)) ok = issueCommand({ action: 'follow', unitIds: ids, targetId: t.id }, 'player');
    else if (t && t.kind === 'res') {
      const gs = units.filter((u) => canGather(u, t.type)).map((u) => u.id), rest = units.filter((u) => !canGather(u, t.type)).map((u) => u.id);
      if (gs.length) ok = issueCommand({ action: 'gather', unitIds: gs, targetId: t.id }, 'player');
      if (rest.length) ok = issueCommand({ action: 'move', unitIds: rest, x: w.x, y: w.y }, 'player') || ok;
    } else ok = issueCommand({ action: 'move', unitIds: ids, x: w.x, y: w.y }, 'player');
    if (ok) sfx('ack');
  }
  function placeClick(px, py, shift) {
    const w = screenToWorld(px, py), f = footOf(ui.placing, w.x, w.y);
    const d = BLD_DEFS[ui.placing];
    const ws = selected().filter((e) => e.kind === 'unit' && e.owner === 'player' && (d.onOil ? canGather(e, 'oil') : keyOf(e) === 'worker'));
    const ok = issueCommand({ action: 'build', unitIds: ws.map((u) => u.id), type: ui.placing, x: f.tx + (f.size - 1) / 2, y: f.ty + (f.size - 1) / 2 }, 'player');
    if (ok) { sfx('ack'); if (!shift) ui.placing = null; }
  }
  function targetClick(px, py) {
    const w = screenToWorld(px, py), ids = selected().filter((e) => e.kind === 'unit' && e.owner === 'player').map((u) => u.id);
    let ok;
    const at = pickAt(w.x, w.y), onTarget = ui.target === 'attackMove' && at && (isMine(at) || (at.kind !== 'res' && at.owner !== 'player'));
    if (onTarget) ok = issueCommand({ action: 'attack', unitIds: ids, targetId: at.id }, 'player');
    else if (ui.target === 'attackMove' || ui.target === 'move' || ui.target === 'patrol' || ui.target === 'attackGround') ok = issueCommand({ action: ui.target, unitIds: ids, x: w.x, y: w.y }, 'player');
    else if (ui.target === 'gather') {
      const t = pickAt(w.x, w.y);
      ok = t && t.kind === 'res' ? issueCommand({ action: 'gather', unitIds: ids, targetId: t.id }, 'player')
        : issueCommand({ action: 'gather', unitIds: ids }, 'player');
    } else if (ui.target === 'repair' || ui.target === 'load') {
      const t = pickAt(w.x, w.y);
      ok = t && t.kind !== 'res' ? issueCommand({ action: ui.target, unitIds: ids, targetId: t.id }, 'player')
        : (toast(ui.target === 'repair' ? 'Repair: click a damaged building of yours' : 'Board: click one of your transports'), false);
    } else { const t = pickAt(w.x, w.y); ok = issueCommand({ action: 'cast', unitIds: ids, spell: ui.target, targetId: t && t.kind !== 'res' ? t.id : undefined, x: w.x, y: w.y }, 'player'); }
    if (ok) sfx(ui.target === 'attackMove' ? 'attack' : 'ack'); // a refused order has already said why
    ui.target = null;
  }
  function updateCursor() {
    let c = 'default';
    if (ui.placing) c = 'copy';
    else if (ui.target) c = 'crosshair';
    else if (ui.mouse.seen && G) {
      const w = screenToWorld(ui.mouse.x, ui.mouse.y), e = pickAt(w.x, w.y);
      if (e && e.kind !== 'res' && (e.owner === 'enemy' || isNeutral(e)) && ownSel().length) c = 'crosshair';
      else if (e && e.kind !== 'res' && e.owner === 'player') c = 'pointer';
      else if (e && e.kind === 'res' && ownSel().length) c = 'grab';
    }
    if (canvas.style.cursor !== c) canvas.style.cursor = c;
  }

  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (!G || G.winner) return;
    if (e.button === 0) {
      if (ui.placing) { placeClick(e.clientX, e.clientY, e.shiftKey); return; }
      if (ui.target) { targetClick(e.clientX, e.clientY); return; }
      ui.drag = { x: e.clientX, y: e.clientY, moved: false };
    } else if (e.button === 2) {
      if (ui.placing || ui.target) { ui.placing = null; ui.target = null; return; }
      rightClick(e.clientX, e.clientY);
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => {
    ui.mouse.x = e.clientX; ui.mouse.y = e.clientY; ui.mouse.seen = true;
    if (ui.drag && Math.hypot(e.clientX - ui.drag.x, e.clientY - ui.drag.y) > 5) ui.drag.moved = true;
    if (G) updateCursor();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0 || !ui.drag) return;
    const d = ui.drag; ui.drag = null;
    if (!G || G.winner) return;
    if (d.moved) boxSelect(d.x, d.y, e.clientX, e.clientY, e.shiftKey);
    else {
      // Warcraft II: Ctrl+click or double-click on one of your units selects every unit of that type on screen
      const w = screenToWorld(e.clientX, e.clientY), hit = pickAt(w.x, w.y), now = performance.now();
      const dbl = hit && ui.lastClick && ui.lastClick.id === hit.id && now - ui.lastClick.at < 400;
      ui.lastClick = hit ? { id: hit.id, at: now } : null;
      if (hit && hit.kind === 'unit' && hit.owner === 'player' && (e.ctrlKey || e.metaKey || dbl)) selectType(hit, e.shiftKey);
      else leftClick(e.clientX, e.clientY, e.shiftKey);
    }
    updateCursor();
  });
  document.addEventListener('mouseleave', () => { ui.mouse.seen = false; });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F10') { e.preventDefault(); toggleMenu(); return; }
    if (e.key === 'Pause' || (e.altKey && (e.key === 'p' || e.key === 'P'))) { if (G && !menuOpen) setPaused(!paused); return; }
    if (e.key === 'Escape' && menuOpen) { toggleMenu(false); return; }
    if (!G || menuOpen || e.target.tagName === 'INPUT') return;
    if (e.key === 'Enter') { e.preventDefault(); openCheatLine(); return; }
    ui.keys[e.key] = true;
    if (e.key === 'Escape') { ui.placing = null; ui.target = null; updateCursor(); }
    if (e.key === '+' || e.key === '=') { setZoom(ui.zoom * 1.25); return; }
    if (e.key === '-' || e.key === '_') { setZoom(ui.zoom / 1.25); return; }
    if (e.key === 'Home') { setZoom(1); return; }
    if (G.replay && (e.key === 'f' || e.key === 'F')) { replayFog(); return; }
    const m = /^Digit([0-9])$/.exec(e.code);
    if (e.key === ' ') { e.preventDefault(); if (ui.alertAt) lookAt(ui.alertAt.x, ui.alertAt.y); return; }   // Space: jump to the last alert
    if (m) {
      e.preventDefault();
      const n = m[1];
      if (e.ctrlKey || e.metaKey) ui.groups[n] = G.selection.filter((id) => { const x = G.ents.get(id); return x && x.owner === 'player'; });
      else if (ui.groups[n]) {
        G.selection = ui.groups[n].filter((id) => G.ents.has(id));
        const now = performance.now();
        if (ui.lastDigit.key === n && now - ui.lastDigit.at < 500 && G.selection.length) { const u = G.ents.get(G.selection[0]); if (u) lookAt(ex(u), ey(u)); }
        ui.lastDigit = { key: n, at: now };
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // letters press the matching command-card button (Warcraft II hotkeys); Esc backs out of a build submenu
    const k = e.key === 'Escape' ? 'escape' : e.key.toLowerCase();
    if (k === 'escape' && ui.card && !ui.placing) { ui.card = null; ui.panelKey = ''; }
    else if (k !== 'escape' && ui.hot && ui.hot[k]) { e.preventDefault(); ui.hot[k].click(); }
    updatePanel();   // redraw the card now, so a quick second key (B then F) finds the submenu's buttons
    updateCursor();
  });
  window.addEventListener('keyup', (e) => { ui.keys[e.key] = false; });
  window.addEventListener('blur', () => { ui.keys = {}; });
  function scrollCamera(dt) {
    const k = ui.keys, v = 700 * dt / ui.zoom;
    let dx = 0, dy = 0;
    if (k.ArrowLeft) dx -= v; if (k.ArrowRight) dx += v;
    if (k.ArrowUp) dy -= v; if (k.ArrowDown) dy += v;
    if (ui.mouse.seen && !ui.drag) {
      const m = 4;
      if (ui.mouse.x <= m) dx -= v; else if (ui.mouse.x >= innerWidth - 1 - m) dx += v;
      if (ui.mouse.y <= m) dy -= v; else if (ui.mouse.y >= innerHeight - 1 - m) dy += v;
    }
    if (dx || dy) { ui.camX += dx; ui.camY += dy; clampCam(); }
  }
  function minimapJump(e) {
    const r = mini.getBoundingClientRect();
    lookAt((e.clientX - r.left) / MS - 0.5, (e.clientY - r.top) / MS - 0.5);
  }
  let miniDown = false;
  mini.addEventListener('mousedown', (e) => { if (e.button === 0) { miniDown = true; minimapJump(e); } else if (e.button === 2) {
    const r = mini.getBoundingClientRect(), ids = selected().filter((x) => x.kind === 'unit' && x.owner === 'player').map((u) => u.id);
    if (ids.length) issueCommand({ action: 'move', unitIds: ids, x: (e.clientX - r.left) / MS - 0.5, y: (e.clientY - r.top) / MS - 0.5 }, 'player');
  } });
  mini.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('mousemove', (e) => { if (miniDown) minimapJump(e); });
  window.addEventListener('mouseup', () => { miniDown = false; });
  function resize() {
    ui.vw = Math.max(100, innerWidth - PANEL_W - (chatOn ? CHAT_W : 0)); ui.vh = Math.max(100, innerHeight - TOP_H);
    canvas.width = ui.vw; canvas.height = ui.vh; canvas.style.width = ui.vw + 'px'; canvas.style.height = ui.vh + 'px';
    clampCam();
  }
  window.addEventListener('resize', resize);
  canvas.addEventListener('wheel', (e) => { if (!G) return; e.preventDefault(); setZoom(ui.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY); }, { passive: false });
  // title screen options, as in the Warcraft II skirmish setup; "Play again" and "New game" reuse the last choice
  let lastOpts = null;
  function titleOpts() {
    const seed = $('o-seed').value.trim();
    return { race: $('race').value, size: +$('o-size').value, map: $('o-map').value, resources: $('o-res').value, workers: +$('o-units').value,
      walls: $('o-walls').value !== 'off', ai: $('o-ai').value !== 'off', fog: $('o-fog').value !== 'off', seed: seed === '' ? (Math.random() * 1e6) | 0 : +seed | 0 };
  }
  const startFromTitle = () => { lastOpts = titleOpts(); newGame(lastOpts); };
  const again = () => newGame(Object.assign({}, lastOpts || { race: G ? G.race : 'human' }, { seed: (Math.random() * 1e6) | 0 }));
  $('restart').addEventListener('click', again);
  $('r-title').addEventListener('click', exitGame);
  for (const [name, k] of RULES.SPEEDS) { const o = document.createElement('option'); o.value = String(k); o.textContent = name; if (k === 1) o.selected = true; $('speed').appendChild(o); }
  $('menu-btn').addEventListener('click', () => { sfx('click'); toggleMenu(); });
  $('music-btn').addEventListener('click', () => { sfx('click'); toggleMusic(); });
  window.addEventListener('pointerdown', unlockAudio, true); window.addEventListener('keydown', unlockAudio, true);
  loadSounds(); if (music.muted) { const btn = $('music-btn'); btn.textContent = '♪ off'; btn.title = 'Music off (click to turn on)'; }
  $('m-resume').addEventListener('click', () => toggleMenu(false));
  $('m-save').addEventListener('click', () => saveGame($('save-name').value));
  $('m-load').addEventListener('click', () => loadGame());
  $('m-new').addEventListener('click', again);
  $('m-exit').addEventListener('click', exitGame);
  $('t-new').addEventListener('click', startFromTitle);
  $('t-load').addEventListener('click', () => loadGame());
  // replays: a file from disk, or ?replay=<url> (e.g. harness/runs/<run>/replay.json served next to the game)
  // Watch replay: the recorded games of the LLM harness (harness/runs/<run>/replay.json, newest first), or a file
  $('t-replay').addEventListener('click', () => { const box = $('replay-list'); box.hidden = !box.hidden; if (!box.hidden) listReplays(box); });
  async function listReplays(box) {
    box.textContent = '';
    const add = (html, fn, cls) => { const b = document.createElement(fn ? 'button' : 'div'); b.className = cls || 'rp-item'; b.innerHTML = html; if (fn) b.onclick = fn; box.appendChild(b); return b; };
    add('Open a replay file…', () => $('replay-file').click());
    let runs = [];
    try { const t = await (await fetch('harness/runs/')).text(); runs = [...t.matchAll(/href="(\d{8}-\d{6})\/"/g)].map((m) => m[1]).sort().reverse().slice(0, 30); } catch (e) { runs = []; }
    const rows = await Promise.all(runs.map(async (r) => {
      try { const rp = await fetch('harness/runs/' + r + '/replay.json', { method: 'HEAD' }); if (!rp.ok) return null; } catch (e) { return null; }
      let s = {}; try { s = await (await fetch('harness/runs/' + r + '/summary.json')).json(); } catch (e) { s = {}; }
      let own = false; try { own = (await fetch('harness/runs/' + r + '/game/game.js', { method: 'HEAD' })).ok; } catch (e) { own = false; }
      return { r, s, own };
    }));
    const ok = rows.filter(Boolean);
    if (!ok.length) { add('No recorded games found in harness/runs/ (run the game from its folder to list them).', null, 'rp-empty'); return; }
    for (const { r, s, own } of ok) {
      const when = r.slice(0, 4) + '-' + r.slice(4, 6) + '-' + r.slice(6, 8) + ' ' + r.slice(9, 11) + ':' + r.slice(11, 13);
      const f = s.final || {}, dur = f.time ? mmss(f.time) : '?', res = s.winner === 'player' ? 'Jev won' : s.winner === 'enemy' ? 'computer won' : (s.winner || 'unfinished');
      const cost = s.spent_usd !== undefined ? ' · $' + (+s.spent_usd).toFixed(2) : '', map = s.map ? ' · ' + s.map : '';
      // a run that kept a copy of the game code it was played with opens in that copy (a replay only follows the
      // inputs: the current code, edited since, would play it out differently)
      if (own) { add(esc(when) + '<small>' + esc(res + ' · ' + dur + map + cost) + '</small>', () => { location.href = 'harness/runs/' + r + '/game/index.html?replay=../replay.json'; }); continue; }
      add(esc(when) + '<small>' + esc(res + ' · ' + dur + map + cost) + '</small>', () => fetch('harness/runs/' + r + '/replay.json').then((x) => x.text()).then((t) => { box.hidden = true; playReplay(t); }).catch((e) => toast('Could not load the replay: ' + e.message)));
    }
  }
  // index.html?replay=<url>: open that recording straight away
  { const q = new URLSearchParams(location.search).get('replay');
    if (q) window.addEventListener('load', () => setTimeout(() => fetch(q).then((x) => x.text()).then((t) => playReplay(t)).catch((e) => toast('Could not load the replay: ' + e.message)), 300)); }
  $('replay-file').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; f.text().then((t) => playReplay(t)).catch((err) => toast('Could not read the replay: ' + err.message)); e.target.value = ''; });
  $('rp-play').addEventListener('click', () => { if (G && G.replay) { paused = !paused; $('pause-banner').hidden = !paused; } });
  for (const b of document.querySelectorAll('#replay-bar [data-speed]')) b.addEventListener('click', () => { speed = +b.dataset.speed; $('speed').value = String(speed); });
  $('rp-seek').addEventListener('change', (e) => replaySeek(+e.target.value));
  function replayFog() {
    if (!G || !G.replay) return; G.replay.seeAll = !G.replay.seeAll; ui.terrainDirty = true;
    try { localStorage.setItem('wc.replayFog', G.replay.seeAll ? 'off' : 'on'); } catch (e) { /* storage blocked */ }
  }
  // group box: click an icon to select only that unit, shift+click to drop it from the group (mousedown: the box redraws as health changes)
  $('info').addEventListener('mousedown', (ev) => { const m = ev.target.closest('.mu[data-id]'); if (!m || !G) return; const id = m.dataset.id;
    G.selection = ev.shiftKey ? G.selection.filter((x) => x !== id) : [id]; sfx('select'); });
  $('rp-vis').addEventListener('click', replayFog);
  $('rp-chat').addEventListener('click', () => chatOpen(!chatOn));
  $('chat-follow').addEventListener('click', () => chatSetFollow(!chatFollow));
  $('chat-log').addEventListener('scroll', () => {
    const log = $('chat-log'); if (Math.abs(log.scrollTop - chatSet) < 2) return;
    const atEnd = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
    if (atEnd !== chatFollow) chatSetFollow(atEnd);
  });
  $('chat-log').addEventListener('wheel', (e) => { if (e.deltaY < 0 && chatFollow) chatSetFollow(false); }, { passive: true });
  $('rp-exit').addEventListener('click', () => { $('replay-bar').hidden = true; chatOpen(false); exitGame(); });
  { const q = new URLSearchParams(location.search).get('replay');
    if (q) fetch(q).then((r) => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.text(); }).then((t) => { const go = () => playReplay(t); if (document.readyState === 'complete') setTimeout(go, 300); else addEventListener('load', () => setTimeout(go, 300)); }).catch((err) => toast('Could not load the replay: ' + err.message)); }
  $('cheat').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { const t = e.target.value; e.target.hidden = true; e.target.blur(); if (t.trim() && !cheatInput(t)) notice(t); }
    else if (e.key === 'Escape') { e.target.hidden = true; e.target.blur(); }
  });
  $('speed').addEventListener('change', (e) => { speed = +e.target.value || 1; });

  // ---------------------------------------------------------------- menu, pause, save, load, exit
  function setPaused(v) { paused = v; $('pause-banner').hidden = !v; }
  function toggleMenu(open) {
    if (!G) return;
    const show = open === undefined ? $('menu').hidden : open;
    menuOpen = show;
    $('menu').hidden = !show;
    $('m-load').disabled = !saveNames().length;
    if (show) { ui.placing = null; ui.target = null; ui.keys = {}; ui.mouse.seen = false; if (!$('save-name').value) $('save-name').value = 'Save ' + (saveNames().length + 1); renderSaveList(); }
  }
  function closeMenus() { menuOpen = false; paused = false; for (const id of ['menu', 'titlescreen', 'pause-banner']) { const el = $(id); if (el) el.hidden = true; } }
  const memorySaves = {};
  function storage() { try { return window.localStorage; } catch (e) { return null; } }
  function saveNames() {
    const out = [];
    const st = storage();
    if (st) { for (let i = 0; i < st.length; i++) { const k = st.key(i); if (k && k.startsWith(SAVE_PREFIX)) { let at = 0; try { at = JSON.parse(st.getItem(k)).at || 0; } catch (e) { /* skip */ } out.push({ name: k.slice(SAVE_PREFIX.length), at }); } } }
    else for (const [name, v] of Object.entries(memorySaves)) out.push({ name, at: v.at || 0 });
    return out.sort((a, b) => b.at - a.at).map((s) => s.name);
  }
  function serialize() {
    return JSON.stringify({
      v: 4, at: Date.now(), tick: G.tick, time: G.time, winner: G.winner, nextId: G.nextId, aiOn: G.aiOn, seed: G.seed, rs: G.rs, race: G.race, enemyRace: G.enemyRace, reveal: G.reveal,
      mapW: MW, mapH: MH, terrain: Array.from(G.terrain), stump: Array.from(G.stump), vis: Array.from(G.vis),
      trees: Array.from(G.trees.values()), mines: G.mines, oils: G.oils, units: G.units, buildings: G.buildings,
      players: G.players, stats: G.stats, memory: Array.from(G.memory.entries()), ai: G.ai, selection: G.selection,
      corpses: G.corpses, rubble: G.rubble, runes: G.runes, storms: G.storms, cheats: G.cheats || null, cheated: !!G.cheated, walls: G.walls !== false, cam: { x: ui.camX, y: ui.camY }, groups: ui.groups, speed,
    });
  }
  function restore(d) {
    setMapSize(d.mapW || 48, d.mapH || 40);
    G = { tick: d.tick, time: d.time, winner: d.winner, nextId: d.nextId, aiOn: d.aiOn, seed: d.seed, rs: d.rs >>> 0 || 12345, race: d.race, enemyRace: d.enemyRace, reveal: !!d.reveal,
      terrain: Uint8Array.from(d.terrain), stump: Uint8Array.from(d.stump), vis: Uint8Array.from(d.vis),
      bgrid: new Array(N).fill(null), ugrid: new Array(N).fill(null), agrid: new Array(N).fill(null),
      trees: new Map(), mines: d.mines, oils: d.oils, units: d.units, buildings: d.buildings, ents: new Map(),
      projectiles: [], impacts: [], corpses: d.corpses || [], rubble: d.rubble || [], runes: d.runes || [], storms: d.storms || [], shards: [], reveals: [], detect: { player: new Set(), enemy: new Set(), neutral: new Set() },
      cheats: d.cheats || null, cheated: !!d.cheated, walls: d.walls !== false, players: Object.assign({ neutral: { gold: 0, lumber: 0, oil: 0, upgrades: [] } }, d.players), stats: Object.assign({ player: newStats(), enemy: newStats(), neutral: newStats() }, d.stats || {}), selection: d.selection || [], memory: new Map(d.memory || []), ai: d.ai };
    for (const tr of d.trees) { G.trees.set(idx(tr.tx, tr.ty), tr); G.ents.set(tr.id, tr); }
    for (const m of G.mines.concat(G.oils)) { G.ents.set(m.id, m); setFootprint(m, m); if (m.type === 'gold' && !m.maxHp) m.hp = m.maxHp = RULES.MINE_HP; }
    for (const b of G.buildings) { G.ents.set(b.id, b); setFootprint(b, b); }
    for (const u of G.units) { G.ents.set(u.id, u); u.cargo = u.cargo || []; u.anim = null; u.strike = null; u.fx = u.fx || { slow: 0, haste: 0, bloodlust: 0, invis: 0, unholy: 0, flame: 0 }; u.castCd = 0; if (!u.hidden) grid(u)[idx(u.tx, u.ty)] = u; }
    ui.terrainDirty = true; ui.panelKey = ''; ui.placing = null; ui.target = null; ui.groups = d.groups || {};
    ui.zoom = 1; ui.camX = d.cam ? d.cam.x : 0; ui.camY = d.cam ? d.cam.y : 0; clampCam();
    speed = d.speed || 1; $('speed').value = String(speed);
    $('race').value = G.race;
    $('overlay').hidden = !G.winner; if (G.winner) showResult();
    updateFog();
  }
  function saveGame(name) {
    if (!G) return false;
    name = (name && String(name).trim()) || 'Quick save';
    try {
      const st = storage(), data = serialize();
      if (st) st.setItem(SAVE_PREFIX + name, data); else memorySaves[name] = { at: Date.now(), data };
      notice('Game saved: ' + name); renderSaveList(); if (menuOpen) toggleMenu(false); return true;
    } catch (e) { toast('Could not save: ' + e.message); return false; }
  }
  function loadGame(name) {
    const names = saveNames();
    name = name && String(name).trim() ? String(name).trim() : names[0];
    if (!name) { toast('No saved game'); return false; }
    let d = null;
    try { const st = storage(); const raw = st ? st.getItem(SAVE_PREFIX + name) : (memorySaves[name] || {}).data; d = JSON.parse(raw); } catch (e) { d = null; }
    if (!d || d.v !== 4) { toast('No saved game named ' + name); return false; }
    restore(d); closeMenus(); notice('Game loaded: ' + name); return true;
  }
  function renderSaveList() {
    const box = $('save-list'); if (!box) return;
    box.textContent = '';
    for (const name of saveNames()) {
      const b = document.createElement('button'); b.className = 'slot'; b.textContent = 'Load ' + name; b.onclick = () => loadGame(name); box.appendChild(b);
    }
  }
  function exitGame() {
    G = null; closeMenus();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, ui.vw, ui.vh); mctx.fillStyle = '#000'; mctx.fillRect(0, 0, mini.width, mini.height);
    $('info').innerHTML = ''; $('buttons').textContent = ''; ui.infoHtml = ''; ui.panelKey = '';
    $('overlay').hidden = true; $('titlescreen').hidden = false; $('t-load').disabled = !saveNames().length;
  }

  // ---------------------------------------------------------------- boot
  for (const [k, im] of Object.entries({ gold: 'gold', lumber: 'lumber', oil: 'oil', food: 'food' })) { const c = $('ic-' + k); if (c) c.getContext('2d').drawImage(A.icon(im), 0, 0); }
  A.load(() => { ui.terrainDirty = true; ui.panelKey = ''; });
  resize();
  exitGame();   // boot to the title screen
  window.__game = {
    select: (ids) => { if (G) G.selection = ids.filter((id) => G.ents.has(id)); },   // tests: set the selection
    ui: () => ({ card: ui.card, placing: ui.placing, target: ui.target, hot: Object.keys(ui.hot || {}), cam: [ui.camX, ui.camY], alertAt: ui.alertAt }),
    state: () => (G ? state() : null), catalog: () => (G ? catalog() : null), worldToScreen, lookAt, spawn,
    visibility: (x, y) => (G ? visibility(x, y) : 'hidden'), terrain: (x, y) => (G ? terrain(x, y) : 'rock'),
    newGame: (opts) => { newGame(opts); return true; },
    cheat: (text) => cheatInput(text),
    // replays and the decision chat
    note: (n) => { if (!G) return false; const x = Object.assign({ tick: G.tick }, n); if (G.rec) G.rec.notes.push(x); if (!chatOn) chatOpen(true); chatSync(); return true; },
    replay: () => (G && G.rec ? JSON.stringify(Object.assign({}, G.rec, { endTick: G.tick, winner: G.winner || null })) : null),
    playReplay: (r) => playReplay(r), replaySeek: (t) => replaySeek(t), replayInfo: () => (G && G.replay ? { tick: G.tick, end: G.replay.r.endTick, desync: G.replay.desync, events: G.replay.ei, hash: simHash() } : null),
    simHash: () => (G ? simHash() : null), chat: (on) => { chatOpen(on !== false); return chatOn; },
    music: () => ({ track: music.cur, playing: !!music.src, muted: music.muted, unlocked: music.unlocked, context: audio ? audio.state : null, decoded: Object.keys(SND).length }),
    command: (cmd) => (G ? issueCommand(cmd, 'player') : false),
    // test helpers (not used by the game itself)
    debugGrant: (ids) => { for (const id of ids || []) if (UPGRADES[id] && !UPGRADES[id].becomes) completeUpgrade({ owner: 'player' }, id); ui.panelKey = ''; return G.players.player.upgrades.slice(); },
    debugKill: (id) => { const e = G && G.ents.get(id); if (!e || e.dead || e.kind === 'res') return false; kill(e, null, true); return true; },
    debugSet: (id, v) => { const e = G && G.ents.get(id); if (!e) return false; for (const k of ['hp', 'mana', 'amount']) if (finite(v[k])) e[k] = v[k]; return true; },
    debugSpot: (O, role) => {        // where the AI would place a building of this role now (tests)
      const base = G.buildings.find((b) => b.owner === O && BLD_DEFS[b.type].provides.includes('hall')); if (!base) return null;
      const d = BLD_DEFS[B(O, role)]; let near = null, spot = null;
      if (role === 'mill') { const t = treeNear(base); if (t && Math.hypot(t.tx - cx(base), t.ty - cy(base)) > 6) { near = findSpotNear(base, t.tx, t.ty, d.size); } }
      spot = near || findSpot(base, d.size, false, role);
      return { near, spot, size: d.size };
    },
    debugGrid: (x0, y0, x1, y1) => { const rows = [];   // tests: terrain (. forest ~ water), buildings (first letter), units (p/e, capital when standing)
      for (let y = y0; y <= y1; y++) { let r = ''; for (let x = x0; x <= x1; x++) { if (!inb(x, y)) { r += ' '; continue; } const i = idx(x, y), b = G.bgrid[i], u = G.ugrid && G.ugrid[i];
        r += b ? (b.kind === 'res' ? '$' : BLD_DEFS[b.type] ? b.type[0].toUpperCase() : '#') : u ? (u.path.length ? u.owner[0] : u.owner[0].toUpperCase()) : G.terrain[i] === WATER ? '~' : G.terrain[i] === GRASS ? '.' : 'f'; } rows.push(r); }
      return rows; },
    debugPath: (id, tid, limit) => { const u = G && G.ents.get(id), t = G && G.ents.get(tid); if (!u || !t) return null; const p = findPath(u, adjGoal(t), limit); const d = walkDist(t);   // tests: the route a unit would take
      return { len: p ? p.length : null, end: p && p.length ? p[p.length - 1] : null, reaches: !!p && p.length > 0 && rectDist(p[p.length - 1].x, p[p.length - 1].y, t) === 1, walk: d[idx(u.tx, u.ty)] }; },
    debugGet: (id) => { const e = G && G.ents.get(id); return e ? JSON.parse(JSON.stringify({ hp: e.hp, mana: e.mana, fx: e.fx, order: e.order, phase: e.phase, tx: e.tx, ty: e.ty, x: e.x, y: e.y, path: e.path && e.path.length, fail: e.fail, gatherId: e.gatherId, gatherType: e.gatherType, carrying: e.carrying, hidden: e.hidden, blockT: e.blockT, timer: e.timer, depotId: e.depotId, build: e.build && e.build.type })) : null; },
    stats: () => (G ? JSON.parse(JSON.stringify(G.stats)) : null),
    agent: (opts) => agentStart(opts), advance: (sec) => agentAdvance(sec), observe: () => agentObserve(), mapInfo: () => (G && G.agent ? agentTerrain() : null), actions: () => agentActions(), macro: (key) => agentMacro(key),
    agentLog: () => (G && G.agent ? G.agent.log.slice(-50) : []),
    agentSet: (d) => { rec('agentset', d); return agentSet(d); },   // the plan's standing settings (woodPct, guard)
    autopilot: (on) => { rec('auto', on !== false); G.autoPlayer = on !== false; return G.autoPlayer; },   // the AI also plays the player's side (self-play tests)
    debugAI: (O = 'enemy') => { const ai = aiOf(O), base = G.buildings.find((b) => b.owner === O && BLD_DEFS[b.type].provides.includes('hall')); return JSON.parse(JSON.stringify(Object.assign({ stepDef: AI_SCRIPT[ai.step], spot3: base && findSpot(base, 3), yard: base && { spot: yardSite(O, base, B(O, 'shipyard')) }, builds: G.units.filter((u) => u.owner === O && u.order === 'build').map((u) => [u.build.type, u.build.tx, u.build.ty, u.fail, u.tx, u.ty]) }, ai))); },
    // telemetry for AI tuning: units per wave id (null = at home), idle workers, idle trainers, gatherers by resource
    debugArmy: (O = 'enemy') => { const us = G.units.filter((u) => u.owner === O && !u.aboard), waves = {}; for (const u of us) if (UNIT_DEFS[u.type].combat && keyOf(u) !== 'worker') { const k = u.wave || 'home'; waves[k] = (waves[k] || 0) + 1; }
      const ws = us.filter((u) => keyOf(u) === 'worker'); return { waves, idleWorkers: ws.filter((u) => u.order === 'idle').length, gold: ws.filter((u) => u.order === 'gather' && u.gatherType === 'gold').length, wood: ws.filter((u) => u.order === 'gather' && u.gatherType === 'tree').length, building: ws.filter((u) => u.order === 'build').length,
        idleTrainers: G.buildings.filter((b) => b.owner === O && b.done && !b.training && !b.research && Object.keys(UNIT_DEFS).some((t) => UNIT_DEFS[t].combat && UNIT_DEFS[t].key !== 'worker' && trainsAt(b, t))).map((b) => b.type) }; },
    debugWorld: () => ({ runes: G.runes.length, storms: G.storms.length, corpses: G.corpses.length, corpseAt: G.corpses.length ? [G.corpses[G.corpses.length - 1].x, G.corpses[G.corpses.length - 1].y] : null }),
    debugMove: (id, x, y) => { const e = G && G.ents.get(id); return e ? issueCommand({ action: 'move', unitIds: [id], x, y }, e.owner) : false; },
    placement: (type, x, y) => (G && BLD_DEFS[type] ? siteWhy(footOf(type, x, y)) : 'unknown type'),   // why a site is illegal, or null
    setSpeed: (k) => { if (typeof k === 'number' && isFinite(k) && k > 0) { speed = Math.min(64, k); $('speed').value = String(speed); } return speed; },
    save: (name) => saveGame(name), load: (name) => loadGame(name), saves: () => saveNames(),
    minimapRect: () => { const r = mini.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; },
  };
  requestAnimationFrame(frame);
})();
