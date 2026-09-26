// Realm of Iron: art module.
// Every sprite comes from a public free-licensed pack, vendored under assets/ (see assets/CREDITS.md and the LICENSE files):
//   assets/lpc/             Liberated Pixel Cup characters composited with the Universal LPC Spritesheet Generator
//                           (CC-BY-SA 3.0 / OGA-BY 3.0 / CC-BY, per-layer credits in assets/lpc/CREDITS.md):
//                           4 facings; walk, slash, thrust, shoot, spellcast and hurt cycles.
//   assets/wyrmsun/         Wyrmsun (CC0 by Jinn / Exidelo; the pine trees CC-BY-SA 3.0 by b_o): every building, the construction and
//                           ruin sites, the mine, and the grass, water, shore, forest and rock autotile sheets.
//                           Purple is the sprites' team-colour channel; it is recoloured per owner (wyrmColour).
//   assets/wyrmsun/         also the ships (kogge, warships, transports, workship, aether warship), the flying machine and zeppelin (aether workship and transport, all
//                           CC0) and the fire, explosion, impact and rune effects.
//   assets/widelands/       Widelands (GPL-2.0+): the two oil refineries (Atlantean smelting works, Barbarian brewery), recoloured.
//   assets/oga/             OpenGameArt: dragon and Eye of Kilrogg (CC-BY 3.0, AntumDeluge), giant turtle (CC0, Oiboo), submarine
//                           (CC0, Lowder2), whirlwind (CC0, n4), Blizzard / Death and Decay effects (CC0, CodeManu).
//   assets/icons/           command-card icons: Wyrmsun (CC0) and Painterly Spell Icons (CC-BY 3.0, J. W. Bjerk); see cardIcon().
//   assets/lpc_siege/       "[LPC] Siege Weapons" (CC-BY 4.0, bluecarrot16 / Herodom): ballista, catapult, 8 facings.
//   assets/critters/        "LPC Farm Animals" (CC-BY 3.0, daneeklu): the sheep critter.
// Team colour (the blue cloth of every LPC unit is hue-shifted to the faction colour), construction stages, fire, rubble,
// corpses, projectiles, water frames, terrain edges and the HUD icons are composed in code on top of those images.
window.ART = (function () {
  'use strict';
  const TILE = 32, PX = 2;
  const FACTION = { player: ['#2f6fe0', '#1d448f'], enemy: ['#d83a2a', '#8a2117'], neutral: ['#c8c0a8', '#8a8270'] };
  const FACTION_HUE = { player: 220, enemy: 2 };

  // ---------------------------------------------------------------- image loading
  const IMG = {};
  const NO_SHADOW = ['h_barracks', 'h_smith', 'h_dock', 'o_dock', 'h_aviary', 'o_stables', 'o_foundry', 'o_roost', 'site2', 'constr2', 'site3', 'constr3', 'ruin', 'rock', 'grass', 'grass2', 'water', 'water_shore', 'trees'];
  const WYRM = ['h_hall', 'h_keep', 'h_castle', 'h_farm', 'h_barracks', 'h_scout', 'h_tower', 'h_cannon', 'h_smith', 'h_mill', 'h_dock', 'h_aviary', 'h_temple',
    'h_stables', 'h_inventor', 'h_magetower', 'h_foundry',
    'o_hall', 'o_keep', 'o_castle', 'o_farm', 'o_barracks', 'o_scout', 'o_tower', 'o_cannon', 'o_smith', 'o_mill', 'o_dock', 'o_aviary', 'o_temple',
    'o_stables', 'o_inventor', 'o_foundry', 'o_roost',
    'site2', 'constr2', 'site3', 'constr3', 'ruin', 'mine', 'rock', 'grass', 'grass2', 'water', 'water_shore', 'trees']
    .flatMap((k) => (NO_SHADOW.includes(k) ? [k] : [k, k + '_shadow']));
  // single images outside the building sheets: key -> path under assets/
  const EXTRA = {
    h_refinery: 'widelands/h_refinery', o_refinery: 'widelands/o_refinery',
    ship_destroyer: 'wyrmsun/ship_destroyer', ship_troll_destroyer: 'wyrmsun/ship_troll_destroyer', ship_battleship: 'wyrmsun/ship_battleship',
    ship_juggernaught: 'wyrmsun/ship_juggernaught', ship_tanker: 'wyrmsun/ship_tanker', ship_transport: 'wyrmsun/ship_transport',
    ship_orc_transport: 'wyrmsun/ship_orc_transport', ship_submarine: 'oga/ship_submarine', ship_turtle: 'oga/ship_turtle',
    fly_zeppelin: 'wyrmsun/fly_zeppelin', fly_machine: 'wyrmsun/fly_machine', fly_dragon: 'oga/fly_dragon', fly_eye: 'oga/fly_eye',
    fx_explosion: 'wyrmsun/fx_explosion', fx_siege_impact: 'wyrmsun/fx_siege_impact', fx_lightning_impact: 'wyrmsun/fx_lightning_impact',
    fx_big_fire: 'wyrmsun/fx_big_fire', fx_small_fire: 'wyrmsun/fx_small_fire', fx_cannon: 'wyrmsun/fx_cannon', fx_bigcannon: 'wyrmsun/fx_bigcannon',
    fx_boulder: 'wyrmsun/fx_boulder', fx_rune: 'wyrmsun/fx_rune', fx_ice: 'oga/fx_ice', fx_rot: 'oga/fx_rot', fx_whirlwind: 'oga/fx_whirlwind',
    card_icons: 'icons/card_icons', spell_icons: 'icons/spell_icons',
  };
  const LPC = ['worker', 'footman', 'archer', 'knight', 'ranger', 'mage', 'peon', 'grunt', 'axethrower', 'ogre', 'berserker', 'shaman',
    'paladin', 'dwarves', 'ogre_mage', 'death_knight', 'sappers', 'skeleton'];
  let ready = false, pending = 0;
  const onReady = [];
  function load(cb) {
    if (cb) onReady.push(cb);
    const start = (key, src) => {
      pending++;
      const im = new Image();
      im.onload = im.onerror = () => { if (--pending === 0) { ready = true; caches.forEach((c) => c.clear()); wyrmCache.clear(); onReady.forEach((f) => f()); } };
      im.src = src; IMG[key] = im;
    };
    for (const k of LPC) start('lpc_' + k, 'assets/lpc/' + k + '.png');
    for (const k of ['ballista', 'catapult_1', 'wheels-bg', 'wheels-fg']) start(k, 'assets/lpc_siege/' + k + '.png');
    for (const k in EXTRA) start(k, 'assets/' + EXTRA[k] + '.png');
    start('sheep', 'assets/critters/sheep_walk.png');
    for (const k of WYRM) start(k, 'assets/wyrmsun/' + k + '.png');
  }
  const caches = [];
  const cache = () => { const m = new Map(); caches.push(m); return m; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingEnabled = false; return [c, g]; };
  const okImg = (k) => IMG[k] && IMG[k].complete && IMG[k].naturalWidth > 0;

  // ---------------------------------------------------------------- colour helpers
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
  }
  // Shift every saturated blue pixel (the team-colour cloth) to the faction hue. Returns a new canvas.
  function teamColour(im, owner) {
    const [c, g] = mk(im.naturalWidth, im.naturalHeight);
    g.drawImage(im, 0, 0);
    if (owner === 'player') return c;
    const d = g.getImageData(0, 0, c.width, c.height), p = d.data, hue = FACTION_HUE[owner];
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] < 8) continue;
      const [h, s, l] = rgb2hsl(p[i], p[i + 1], p[i + 2]);
      if (s > 0.3 && h >= 195 && h <= 250 && l > 0.12) { const [r, gg, b] = hsl2rgb(hue, Math.min(1, s * 1.05), l); p[i] = r; p[i + 1] = gg; p[i + 2] = b; }
    }
    g.putImageData(d, 0, 0);
    return c;
  }

  // Wyrmsun sprites: the purple pixels (hue 270-310) are the team-colour channel -> faction hue (or an explicit hue)
  const wyrmCache = new Map();
  function wyrmColour(key, owner) {
    const ck = key + '|' + owner;
    let c = wyrmCache.get(ck);
    if (c) return c;
    const im = IMG[key], hue = typeof owner === 'number' ? owner : FACTION_HUE[owner];
    let g; [c, g] = mk(im.naturalWidth, im.naturalHeight);
    g.drawImage(im, 0, 0);
    if (hue !== undefined) {
      const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] < 8) continue;
        const [h, s, l] = rgb2hsl(p[i], p[i + 1], p[i + 2]);
        if (s > 0.2 && h >= 268 && h <= 312) { const [r, gg, b] = hsl2rgb(hue, s, l); p[i] = r; p[i + 1] = gg; p[i + 2] = b; }
      }
      g.putImageData(d, 0, 0);
    }
    wyrmCache.set(ck, c);
    return c;
  }

  // ---------------------------------------------------------------- generated placeholders (used until images load)
  const BASE_PAL = { k: '#161616', E: '#f4f4f4', X: '#e8ecf4', G: '#f2c744', W: '#8a5a2b', w: '#5d3b19', B: '#7a5230', b: '#4a3119',
    A: '#c9ccd6', a: '#7d8290', T: '#e8dcc0', H: '#f4e9c8', l: '#3a2a1a', r: '#3a2a1a' };
  const MAPS = {
    siege: ['................', '................', '.......kk.......', '......kXXk......', '.....kWWWWk.....', '....kWkkkkWk....', '...kW.kXXk.Wk...', '...kk.kWWk.kk...',
      '.....kWWWWk.....', '....kwWWWWwk....', '...kwwkkkkwwk...', '..kwwk....kwwk..', '..kwwk....kwwk..', '...kkk....kkk...', '................', '................'],
    ship: ['................', '................', '.......kk.......', '......kFFk......', '......kkkk......', '......kWWk......', '.....kWWWWk.....', '..kkkkWWWWkkkk..',
      '.kWWWWWWWWWWWWk.', '.kwFFFFFFFFFFwk.', '.kwwwwwwwwwwwwk.', '..kwwwwwwwwwwk..', '...kkkkkkkkkk...', '................', '................', '................'],
    man: ['................', '................', '......kkkk......', '.....kTTTTk.....', '.....kTkkTk.....', '.....kTTTTk.....', '......kkkk......', '....kkFFFFkk....',
      '...kFkFFFFkFk...', '...kFkFFFFkFk...', '...kkkFFFFkkk...', '.....kwkkwk.....', '.....kwk.kwk....', '.....kkk.kkk....', '................', '................'],
  };
  function genSprite(mapName, owner, frame) {
    const map = MAPS[mapName] || MAPS.man;
    const pal = Object.assign({}, BASE_PAL, { F: FACTION[owner][0], f: FACTION[owner][1] });
    const [c, g] = mk(TILE, TILE);
    const bob = frame === 1 ? -1 : 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ch = map[y][x];
      if (ch === '.') continue;
      g.fillStyle = pal[ch] || '#f0f';
      g.fillRect(x * PX, (y + bob) * PX, PX, PX);
    }
    return c;
  }

  // hand-drawn 24x18 pixel gryphon, two wing frames
  const GRYPHON = [
    ['......kkk...............', '.....kFFFk..............', '....kFwwFFk.............', '...kFwWwwFFk............', '...kFwWWwwFFk...........', '..kFwWWWwwwFk...kkkk....', '..kwWWWWwwwwk..kHHHHk...', '..kWWWWWWwwwwkkHHHEHHk..', '...kWWWWWWwwwBBhHHHHYYk.', '....kkWWWWWkBBBBhhHHkYyk', '.kk...kkkkBBBBBBBBhhk.k.', 'kbbk.kBBBBBBTTBBBBBBk...', '.kbbkBBBBBBBTTBBBBBbk...', '..kbbbbBBBBBBBBBBbbk....', '...kkkbbbBBBBBBbbkk.....', '.....kLLkkkkkkLLk.......', '....kCCLk...kCCLk.......', '.....kkk.....kkk........'],
    ['........................', '........................', '........................', '........................', '........................', '................kkkk....', '...............kHHHHk...', '..........kkkkkHHHEHHk..', '.........kBBBBBhHHHHYYk.', '.kk.....kBBBBBBBhhHHkYyk', 'kbbk...kBBBBBBBBBBhhk.k.', '.kbbk.kWWwBBBBTTBBBBk...', '..kbbkWWWwwBBBTTBBBbk...', '...kkWWWWwwwBBBBBbbk....', '....kFWWWwwwwkBBbkk.....', '.....kFFwwwwFkLLk.......', '......kFFFFFk.kCCLk.....', '.......kkkkk...kkk......']];
  const GRYPHON_PAL = { k: '#161616', W: '#6b4a2a', w: '#a0784a', F: '#e0c898', B: '#c8a060', b: '#8a6234', H: '#f4f0e6', h: '#cfc6b4', Y: '#f2c744', y: '#b8901c', E: '#161616', L: '#8a6234', C: '#f2c744' };

  // ---------------------------------------------------------------- LPC units
  // The standard universal layout: rows of 4 facings (up, left, down, right) per animation.
  const LPC_ROWS = { spellcast: [0, 7], thrust: [4, 8], walk: [8, 9], slash: [12, 6], shoot: [16, 13], hurt: [20, 6] };
  const DIR_ROW = { up: 0, left: 1, down: 2, right: 3 };
  // unit type -> LPC sheet name; attack animation per type. Paladin, Ogre-Mage, Death Knight, Skeleton, Demolition Squad and
  // Sappers have their own composites (assets/lpc/CREDITS.md); the Ogre and Ogre-Mage carry two heads; the dwarves are squat.
  const LPC_UNIT = {
    worker: { sheet: 'worker', attack: 'slash' }, peon: { sheet: 'peon', attack: 'slash' },
    footman: { sheet: 'footman', attack: 'slash' }, archer: { sheet: 'archer', attack: 'shoot' }, knight: { sheet: 'knight', attack: 'thrust' },
    ranger: { sheet: 'ranger', attack: 'shoot' }, mage: { sheet: 'mage', attack: 'spellcast' }, paladin: { sheet: 'paladin', attack: 'thrust', scale: 0.54 },
    dwarves: { sheet: 'dwarves', attack: 'slash', scale: 0.48 },
    grunt: { sheet: 'grunt', attack: 'slash' }, axethrower: { sheet: 'axethrower', attack: 'thrust' }, ogre: { sheet: 'ogre', attack: 'slash', scale: 0.6 },
    ogre_mage: { sheet: 'ogre_mage', attack: 'slash', scale: 0.62 }, berserker: { sheet: 'berserker', attack: 'slash' }, death_knight: { sheet: 'death_knight', attack: 'spellcast' },
    sappers: { sheet: 'sappers', attack: 'slash', scale: 0.44 }, skeleton: { sheet: 'skeleton', attack: 'slash', scale: 0.48 },
  };
  // ships: img = a north-facing hull (the game rotates it); purple sails / hulls take the faction colour, the rest get an outline.
  // flyers: img = a strip of right-facing flight frames (the game mirrors it).
  const OTHER_UNIT = {
    ballista: { siege: 'ballista' }, catapult: { siege: 'catapult_1' },
    tanker: { ship: 'small', img: 'ship_tanker' }, destroyer: { ship: 'large', img: 'ship_destroyer' }, battleship: { ship: 'large', img: 'ship_battleship' },
    submarine: { ship: 'small', sub: true, img: 'ship_submarine', outline: true },
    oil_tanker: { ship: 'small', dark: true, img: 'ship_tanker' }, troll_destroyer: { ship: 'large', img: 'ship_troll_destroyer' },
    juggernaught: { ship: 'large', img: 'ship_juggernaught' }, turtle: { ship: 'small', sub: true, img: 'ship_turtle', outline: true },
    transport: { ship: 'small', img: 'ship_transport' }, orc_transport: { ship: 'small', img: 'ship_orc_transport' },
    gryphon: { gryphon: true }, dragon: { fly: 'fly_dragon', n: 3, outline: true }, flying_machine: { fly: 'fly_machine', n: 1 },
    zeppelin: { fly: 'fly_zeppelin', n: 1 }, eye: { fly: 'fly_eye', n: 3, eye: true, outline: true }, critter: { critter: 'sheep' },
  };
  const lpcCache = cache();
  // bone-white copy of a sheet (skeletons): desaturated and lightened
  function paleSheet(src) {
    const [c, g] = mk(src.width, src.height);
    g.filter = 'grayscale(1) brightness(1.5) contrast(0.9)'; g.drawImage(src, 0, 0); g.filter = 'none';
    return c;
  }
  function lpcSheet(sheetName, owner, pale) {
    const key = sheetName + '|' + owner + '|' + !!pale;
    let c = lpcCache.get(key);
    if (!c) { c = teamColour(IMG['lpc_' + sheetName], owner); if (pale) c = paleSheet(c); lpcCache.set(key, c); }
    return c;
  }
  const isLpc = (type) => !!LPC_UNIT[type];
  const attackAnim = (type) => (LPC_UNIT[type] || {}).attack || 'slash';
  const frameCount = (anim) => (LPC_ROWS[anim] || LPC_ROWS.walk)[1];
  // One frame of an LPC unit: { c, sx, sy, sw, sh, scale, ax, ay } (ax, ay: feet anchor inside the scaled frame).
  function lpcFrame(type, race, owner, anim, dir, frame) {
    const spec = LPC_UNIT[type] || LPC_UNIT.footman;
    const sheetName = spec.sheet || spec[race] || spec.human;
    if (!ready || !okImg('lpc_' + sheetName)) return null;
    const rows = LPC_ROWS[anim] || LPC_ROWS.walk;
    const row = anim === 'hurt' ? 20 : rows[0] + (DIR_ROW[dir] || 0);
    const f = Math.max(0, Math.min(rows[1] - 1, frame | 0));
    const scale = spec.scale || 0.5;
    return { c: lpcSheet(sheetName, owner, spec.pale), sx: f * 64, sy: row * 64, sw: 64, sh: 64, scale, ax: 32 * scale, ay: 60 * scale };
  }

  // ---------------------------------------------------------------- other units (siege: 8 facings, ships and flyers: rotated)
  const unitCache = cache();
  // team colour outline: a coloured silhouette offset in four directions, drawn under the sprite
  function outlined(tmp, W, H, col) {
    const [c, g] = mk(W, H);
    const [sil, sg] = mk(W, H);
    sg.drawImage(tmp, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = col; sg.fillRect(0, 0, W, H);
    for (const [dx, dy] of [[PX, 0], [-PX, 0], [0, PX], [0, -PX]]) g.drawImage(sil, dx, dy);
    g.drawImage(tmp, 0, 0);
    return c;
  }
  // dir8: 0 = north, clockwise. The siege sheet rows: 0 N, 1 NE, 2 E, 3 SE, 4 S, 5 SW, 6 W, 7 NW; 6 frames per row (firing cycle).
  function siege(kind, owner, dir8, frame) {
    const key = 'siege|' + kind + '|' + owner + '|' + dir8 + '|' + frame + '|' + ready;
    let r = unitCache.get(key);
    if (r) return r;
    if (!ready || !okImg(kind)) { const c = genSprite('siege', owner, frame & 1); r = { c, w: TILE, h: TILE, ax: TILE / 2, ay: TILE - 4 }; unitCache.set(key, r); return r; }
    const cell = 128, w = 52, h = 52, W = w + 8, H = h + 8;
    const [tmp, tg] = mk(W, H);
    for (const k of ['wheels-bg', kind, 'wheels-fg']) tg.drawImage(IMG[k], (frame % 6) * cell, (dir8 & 7) * cell, cell, cell, 4, 4, w, h);
    // a thin dark rim (a thick team-colour outline smothered the detailed art) and a team pennant on top
    const [c, g] = mk(W, H), [sil, sg] = mk(W, H);
    sg.drawImage(tmp, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#140e08'; sg.fillRect(0, 0, W, H);
    g.globalAlpha = 0.55;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.drawImage(sil, dx, dy);
    g.globalAlpha = 1; g.drawImage(tmp, 0, 0);
    const a = tg.getImageData(0, 0, W, H).data;
    let top = H, tx = W / 2;
    for (let y = 0; y < H && top === H; y++) for (let x = 0; x < W; x++) if (a[(y * W + x) * 4 + 3] > 128) { top = y; tx = x; break; }
    const px = Math.max(3, Math.min(W - 10, tx)), py = Math.max(8, top + 2);
    g.fillStyle = '#2a1c10'; g.fillRect(px, py - 8, 1, 9);
    g.fillStyle = FACTION[owner][1]; g.beginPath(); g.moveTo(px + 1, py - 8); g.lineTo(px + 8, py - 5.5); g.lineTo(px + 1, py - 3); g.fill();
    g.fillStyle = FACTION[owner][0]; g.beginPath(); g.moveTo(px + 1, py - 8); g.lineTo(px + 7, py - 5.8); g.lineTo(px + 1, py - 4.5); g.fill();
    r = { c, w: W, h: H, ax: W / 2, ay: h - 6 };
    unitCache.set(key, r);
    return r;
  }
  // ships point up in the source art; the caller rotates by heading
  function ship(spec, owner) {
    const key = 'ship|' + spec.img + '|' + !!spec.dark + '|' + owner + '|' + ready;
    let r = unitCache.get(key);
    if (r) return r;
    if (!ready || !okImg(spec.img)) { r = { c: genSprite('ship', owner, 0), w: TILE, h: TILE, ax: TILE / 2, ay: TILE / 2 }; unitCache.set(key, r); return r; }
    const src = wyrmColour(spec.img, owner), w = src.width, h = src.height, W = w + 8, H = h + 8;
    const [tmp, tg] = mk(W, H);
    if (spec.dark) tg.filter = 'brightness(0.7) saturate(0.8)';                // the orc tanker: tarred timber
    tg.drawImage(src, 4, 4); tg.filter = 'none';
    r = { c: spec.outline ? outlined(tmp, W, H, FACTION[owner][0]) : tmp, w: W, h: H, ax: W / 2, ay: H / 2 };
    unitCache.set(key, r);
    return r;
  }
  function flyer(type, owner, frame) {
    const key = 'fly|' + type + '|' + owner + '|' + frame + '|' + ready;
    let r = unitCache.get(key);
    if (r) return r;
    const spec = OTHER_UNIT[type] || OTHER_UNIT.gryphon;
    if (spec.gryphon) {
      const m = GRYPHON[frame & 1], W = 24 * PX + 8, H = 18 * PX + 8;
      const [tmp, tg] = mk(W, H);
      const pal = Object.assign({}, GRYPHON_PAL, { T: FACTION[owner][0], t: FACTION[owner][1] });
      for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) { const ch = m[y][x]; if (ch !== '.') { tg.fillStyle = pal[ch] || '#f0f'; tg.fillRect(4 + x * PX, 4 + y * PX, PX, PX); } }
      r = { c: outlined(tmp, W, H, FACTION[owner][0]), w: W, h: H, ax: W / 2, ay: H - 6 };
    } else if (spec.fly && ready && okImg(spec.fly)) {  // a strip of n flight frames
      const src = wyrmColour(spec.fly, owner), fw = src.width / spec.n, fh = src.height, W = fw + 8, H = fh + 8;
      const [tmp, tg] = mk(W, H);
      tg.drawImage(src, (frame % spec.n) * fw, 0, fw, fh, 4, 4, fw, fh);
      r = { c: spec.outline ? outlined(tmp, W, H, FACTION[owner][0]) : tmp, w: W, h: H, ax: W / 2, ay: H - 4 };
    } else { r = { c: genSprite('man', owner, frame & 1), w: TILE, h: TILE, ax: TILE / 2, ay: TILE - 4 }; }
    unitCache.set(key, r);
    return r;
  }
  // Critter (sheep): LPC farm-animal walk sheet, 128 px cells, rows up / left / down / right, 4 frames.
  function critter(dir, frame) {
    if (!ready || !okImg('sheep')) return null;
    return { c: IMG.sheep, sx: (frame & 3) * 128, sy: (DIR_ROW[dir] || 2) * 128, sw: 128, sh: 128, scale: 0.34 };
  }
  // Whirlwind: a grey funnel, 4 frames
  function whirlwind(frame) {
    const key = 'whirl' + (frame & 3);
    let c = fxCache.get(key);
    if (c) return c;
    let g; [c, g] = mk(56, 56);
    if (ready && okImg('fx_whirlwind')) { for (let i = 0; i < 2; i++) g.drawImage(IMG.fx_whirlwind, (frame & 3) * 56, 0, 56, 56, 0, 0, 56, 56); fxCache.set(key, c); return c; }   // drawn twice: the CC0 swirl is faint
    for (let i = 0; i < 9; i++) {
      const y = 50 - i * 5, w = 6 + i * 2.6, off = Math.sin(i * 0.9 + (frame & 3) * 1.6) * 3;
      g.strokeStyle = 'rgba(' + (190 - i * 6) + ',' + (190 - i * 6) + ',' + (200 - i * 5) + ',0.75)'; g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(28 + off, y, w, 2.5 + i * 0.3, 0, 0, 7); g.stroke();
    }
    fxCache.set(key, c);
    return c;
  }
  function rune() {
    let c = fxCache.get('rune');
    if (c) return c;
    let g; [c, g] = mk(16, 16);
    if (ready && okImg('fx_rune')) { g.drawImage(IMG.fx_rune, 0, 0); fxCache.set('rune', c); return c; }   // a Wyrmsun glyph, glowing orange
    g.strokeStyle = '#ff7a30'; g.lineWidth = 2; g.beginPath(); g.arc(8, 8, 6, 0, 7); g.stroke();
    g.beginPath(); g.moveTo(8, 3); g.lineTo(8, 13); g.moveTo(4, 6); g.lineTo(12, 10); g.stroke();
    fxCache.set('rune', c);
    return c;
  }
  // A still image of any unit type, for portraits and buttons.
  function portrait(type, race, owner) {
    if (isLpc(type)) { const f = lpcFrame(type, race, owner, 'walk', 'down', 0); if (f) return { c: f.c, sx: f.sx, sy: f.sy, sw: 64, sh: 64 }; return { c: genSprite('man', owner, 0), sx: 0, sy: 0, sw: TILE, sh: TILE }; }
    const spec = OTHER_UNIT[type] || {};
    if (spec.critter) { const f = critter('down', 0); if (f) return { c: f.c, sx: f.sx + 32, sy: f.sy + 32, sw: 64, sh: 64 }; }
    const r = spec.siege ? siege(spec.siege, owner, 4, 0) : spec.ship ? ship(spec, owner) : flyer(type, owner, 0);
    return { c: r.c, sx: 0, sy: 0, sw: r.w, sh: r.h };
  }

  // ---------------------------------------------------------------- overlays: carried loads, corpses, fire, rubble, projectiles
  const fxCache = cache();
  function carry(kind) {
    let c = fxCache.get('carry' + kind);
    if (c) return c;
    let g; [c, g] = mk(14, 12);
    if (kind === 'gold') { g.fillStyle = '#c9a25a'; g.fillRect(3, 3, 8, 8); g.fillStyle = '#f2c744'; g.fillRect(4, 4, 6, 6); g.fillStyle = '#5d3b19'; g.fillRect(5, 1, 4, 3); g.fillStyle = '#fff2a0'; g.fillRect(5, 5, 2, 2); }
    else if (kind === 'lumber') { g.fillStyle = '#5d3b19'; g.fillRect(0, 4, 14, 5); g.fillStyle = '#8a5a2b'; g.fillRect(1, 5, 12, 2); g.fillStyle = '#c8a060'; g.fillRect(0, 4, 2, 5); g.fillRect(12, 4, 2, 5); }
    else { g.fillStyle = '#1a1a22'; g.fillRect(3, 2, 8, 9); g.fillStyle = '#3a3a5a'; g.fillRect(4, 3, 6, 2); g.fillRect(4, 8, 6, 2); }
    fxCache.set('carry' + kind, c);
    return c;
  }
  // fire: 4 animated frames of a flame cluster, sized to a building footprint
  function fire(size, frame, big) {
    const key = 'fire' + size + '|' + (frame & 3) + '|' + !!big;
    let c = fxCache.get(key);
    if (c) return c;
    let g; [c, g] = mk(size, size);
    const fk = big ? 'fx_big_fire' : 'fx_small_fire';
    if (ready && okImg(fk)) {                        // Wyrmsun flame sheets: 48 px x 10 frames (big), 32 px x 15 frames (small)
      const fs = big ? 48 : 32, nf = big ? 10 : 15, spots = big ? [[0.3, 0.45], [0.68, 0.38], [0.5, 0.7]] : [[0.35, 0.5], [0.65, 0.62]];
      if (big) { g.fillStyle = 'rgba(40,40,40,0.4)'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(size * (0.3 + i * 0.2), size * 0.18 - (frame & 3) * 2, 6 + i * 2, 0, 7); g.fill(); } }
      spots.forEach(([x, y], i) => { const f = ((frame & 3) * 2 + i * 3) % nf, d = Math.min(fs, size * 0.6); g.drawImage(IMG[fk], (f % 5) * fs, Math.floor(f / 5) * fs, fs, fs, Math.round(x * size - d / 2), Math.round(y * size - d / 2), d, d); });
      fxCache.set(key, c);
      return c;
    }
    const n = big ? 5 : 3, h = (i, j) => { let v = (i * 7919 + j * 104729 + (frame & 3) * 2749) % 1000; return v / 1000; };
    for (let i = 0; i < n; i++) {
      const x = 6 + h(i, 1) * (size - 12), base = size * 0.55 + h(i, 2) * size * 0.35, fh = (big ? 22 : 14) + h(i, 3 + (frame & 3)) * 10, w = big ? 12 : 9;
      g.fillStyle = 'rgba(255,90,20,0.9)'; g.beginPath(); g.moveTo(x - w / 2, base); g.quadraticCurveTo(x - w / 4, base - fh * 0.6, x + (h(i, 4) - 0.5) * 6, base - fh); g.quadraticCurveTo(x + w / 4, base - fh * 0.6, x + w / 2, base); g.fill();
      g.fillStyle = 'rgba(255,210,60,0.95)'; g.beginPath(); g.moveTo(x - w / 4, base); g.quadraticCurveTo(x, base - fh * 0.5, x + (h(i, 5) - 0.5) * 3, base - fh * 0.55); g.quadraticCurveTo(x + w / 5, base - fh * 0.3, x + w / 4, base); g.fill();
    }
    if (big) { g.fillStyle = 'rgba(40,40,40,0.45)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(8 + h(i, 6) * (size - 16), size * 0.3 - h(i, 7 + (frame & 3)) * size * 0.25, 5 + h(i, 8) * 5, 0, 7); g.fill(); } }
    fxCache.set(key, c);
    return c;
  }
  function rubble(n) {
    const key = 'rubble' + n + ready;
    let c = fxCache.get(key);
    if (c) return c;
    const size = n * TILE;
    let g; [c, g] = mk(size, size);
    if (ready && okImg('ruin')) wyrmFrame(g, 'ruin', undefined, 0, size); // Wyrmsun destroyed site: scorched earth and debris
    else {
      g.fillStyle = 'rgba(30,22,14,0.75)'; g.beginPath(); g.ellipse(size / 2, size / 2 + 2, size / 2 - 3, size / 2 - 6, 0, 0, 7); g.fill();
      g.fillStyle = '#4a3119'; for (let i = 0; i < n * 4; i++) { const x = 6 + ((i * 37) % (size - 20)), y = 8 + ((i * 53) % (size - 24)); g.fillRect(x, y, 6 + (i % 3) * 3, 4 + (i % 2) * 3); }
      g.fillStyle = '#6b6660'; for (let i = 0; i < n * 3; i++) { const x = 10 + ((i * 41 + 7) % (size - 24)), y = 6 + ((i * 29 + 5) % (size - 20)); g.fillRect(x, y, 5, 5); }
    }
    fxCache.set(key, c);
    return c;
  }
  // projectiles point to the right; the game rotates them along the flight direction
  function projectile(kind) {
    let c = fxCache.get('proj' + kind);
    if (c) return c;
    let g; [c, g] = mk(20, 8);
    if (ready && okImg('fx_' + kind) && ['cannon', 'bigcannon', 'boulder'].includes(kind)) { g.drawImage(IMG['fx_' + kind], 0, 0); fxCache.set('proj' + kind, c); return c; }
    if (kind === 'arrow') { // outlined like a Warcraft II arrow: a thin unbordered shaft all but vanishes against grass
      g.fillStyle = '#3a2412'; g.fillRect(1, 2, 15, 4); g.fillRect(14, 1, 6, 6); g.fillStyle = '#e0b870'; g.fillRect(2, 3, 13, 2);
      g.fillStyle = '#f4f4f8'; g.fillRect(15, 2, 4, 4); g.fillStyle = '#e03030'; g.fillRect(0, 1, 4, 2); g.fillRect(0, 5, 4, 2);
    }
    else if (kind === 'axe') { g.fillStyle = '#5d3b19'; g.fillRect(4, 3, 12, 2); g.fillStyle = '#c9ccd6'; g.fillRect(12, 0, 6, 8); g.fillStyle = '#e8ecf4'; g.fillRect(16, 1, 2, 6); }
    else if (kind === 'boulder') { g.fillStyle = '#4a4640'; g.beginPath(); g.arc(10, 4, 4, 0, 7); g.fill(); g.fillStyle = '#8a8680'; g.fillRect(8, 2, 3, 2); }
    else if (kind === 'fireball') { g.fillStyle = 'rgba(255,120,30,0.9)'; g.beginPath(); g.arc(12, 4, 4, 0, 7); g.fill(); g.fillStyle = '#ffe066'; g.beginPath(); g.arc(13, 4, 2, 0, 7); g.fill(); g.fillStyle = 'rgba(255,90,20,0.6)'; g.fillRect(0, 2, 10, 4); }
    else if (kind === 'bolt') { g.strokeStyle = '#9fd8ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 4); g.lineTo(6, 1); g.lineTo(10, 6); g.lineTo(15, 2); g.lineTo(20, 4); g.stroke(); }
    else if (kind === 'cannon') { g.fillStyle = '#222'; g.beginPath(); g.arc(10, 4, 3.5, 0, 7); g.fill(); }
    else if (kind === 'bigcannon') { g.fillStyle = '#111'; g.beginPath(); g.arc(10, 4, 4, 0, 7); g.fill(); g.fillStyle = '#555'; g.fillRect(8, 2, 2, 2); }
    else if (kind === 'spear') { g.fillStyle = '#5d3b19'; g.fillRect(0, 3, 16, 2); g.fillStyle = '#c9ccd6'; g.beginPath(); g.moveTo(15, 1); g.lineTo(20, 4); g.lineTo(15, 7); g.fill(); }
    else if (kind === 'lightning') { g.strokeStyle = '#9fd8ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 4); g.lineTo(6, 1); g.lineTo(10, 6); g.lineTo(15, 2); g.lineTo(20, 4); g.stroke(); }
    else if (kind === 'touch' || kind === 'coil') { g.fillStyle = kind === 'coil' ? 'rgba(90,200,90,0.9)' : 'rgba(160,80,220,0.9)'; g.beginPath(); g.arc(12, 4, 4, 0, 7); g.fill(); g.fillStyle = 'rgba(20,20,20,0.8)'; g.fillRect(10, 3, 1, 1); g.fillRect(13, 3, 1, 1); g.fillStyle = 'rgba(120,60,160,0.4)'; g.fillRect(0, 3, 9, 2); }
    else if (kind === 'hammer') { g.fillStyle = '#8a5a2b'; g.fillRect(4, 3, 10, 2); g.fillStyle = '#c9ccd6'; g.fillRect(13, 0, 6, 8); g.fillStyle = '#9fd8ff'; g.fillRect(14, 1, 1, 6); }
    else if (kind === 'dragonfire') { g.fillStyle = 'rgba(255,90,20,0.8)'; g.beginPath(); g.ellipse(12, 4, 7, 3.5, 0, 0, 7); g.fill(); g.fillStyle = '#ffe066'; g.beginPath(); g.ellipse(14, 4, 3, 2, 0, 0, 7); g.fill(); }
    else if (kind === 'torpedo') { g.fillStyle = '#20303a'; g.fillRect(4, 2, 12, 4); g.fillStyle = 'rgba(220,240,255,0.6)'; g.fillRect(0, 3, 4, 2); }
    fxCache.set('proj' + kind, c);
    return c;
  }
  function impact(kind, frame) {
    const key = 'imp' + kind + (frame & 3);
    let c = fxCache.get(key);
    if (c) return c;
    let g; [c, g] = mk(32, 32);
    const sheet = ready && { boulder: 'fx_siege_impact', cannon: 'fx_siege_impact', bigcannon: 'fx_explosion', spear: 'fx_siege_impact', boom: 'fx_explosion', torpedo: 'fx_siege_impact',
      hammer: 'fx_lightning_impact', dragonfire: 'fx_siege_impact', fireball: 'fx_explosion', bolt: 'fx_lightning_impact', lightning: 'fx_lightning_impact', ice: 'fx_ice', rot: 'fx_rot' }[kind];
    if (sheet && okImg(sheet)) { g.drawImage(IMG[sheet], (frame & 3) * 32, 0, 32, 32, 0, 0, 32, 32); fxCache.set(key, c); return c; }
    const r = 5 + (frame & 3) * 4;
    if (['boulder', 'cannon', 'bigcannon', 'spear', 'boom', 'torpedo', 'hammer', 'dragonfire'].includes(kind)) { g.fillStyle = 'rgba(90,70,40,' + (0.8 - (frame & 3) * 0.18) + ')'; g.beginPath(); g.arc(16, 16, r, 0, 7); g.fill(); g.fillStyle = '#6b6660'; for (let i = 0; i < 5; i++) g.fillRect(16 + Math.cos(i * 1.3) * r, 16 + Math.sin(i * 1.3) * r * 0.6, 3, 3); }
    else if (kind === 'fireball') { g.fillStyle = 'rgba(255,120,30,' + (0.9 - (frame & 3) * 0.2) + ')'; g.beginPath(); g.arc(16, 16, r + 3, 0, 7); g.fill(); g.fillStyle = 'rgba(255,230,120,0.8)'; g.beginPath(); g.arc(16, 16, r * 0.5, 0, 7); g.fill(); }
    else if (kind === 'ice') { g.fillStyle = 'rgba(200,235,255,' + (0.9 - (frame & 3) * 0.2) + ')'; for (let i = 0; i < 5; i++) g.fillRect(14 + Math.cos(i * 1.3) * r * 0.8, 14 + Math.sin(i * 1.3) * r * 0.6, 3, 5); }
    else if (kind === 'rot') { g.fillStyle = 'rgba(70,90,40,' + (0.7 - (frame & 3) * 0.15) + ')'; g.beginPath(); g.arc(16, 18 - (frame & 3) * 2, r + 2, 0, 7); g.fill(); g.fillStyle = 'rgba(40,20,50,0.5)'; g.beginPath(); g.arc(13, 15 - (frame & 3) * 2, r * 0.6, 0, 7); g.fill(); }
    else if (kind === 'exorcism') { g.strokeStyle = 'rgba(255,250,200,' + (0.9 - (frame & 3) * 0.2) + ')'; g.lineWidth = 3; g.beginPath(); g.moveTo(16, 2); g.lineTo(16, 30); g.moveTo(8, 11); g.lineTo(24, 11); g.stroke(); }
    else if (kind === 'coil' || kind === 'touch') { g.fillStyle = 'rgba(120,200,90,' + (0.8 - (frame & 3) * 0.18) + ')'; g.beginPath(); g.arc(16, 16, r + 2, 0, 7); g.fill(); }
    else if (kind === 'bolt' || kind === 'lightning') { g.strokeStyle = 'rgba(160,220,255,' + (0.9 - (frame & 3) * 0.2) + ')'; g.lineWidth = 2; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(16, 16); g.lineTo(16 + Math.cos(i) * r * 1.5, 16 + Math.sin(i) * r * 1.5); g.stroke(); } }
    else if (kind === 'heal') { g.fillStyle = 'rgba(120,255,140,' + (0.9 - (frame & 3) * 0.2) + ')'; for (let i = 0; i < 6; i++) g.fillRect(14 + Math.cos(i + frame) * r, 14 + Math.sin(i + frame) * r, 3, 3); }
    else if (kind === 'buff') { g.strokeStyle = 'rgba(255,60,60,' + (0.9 - (frame & 3) * 0.2) + ')'; g.lineWidth = 2; g.beginPath(); g.arc(16, 20, r + 4, 0, 7); g.stroke(); }
    else { g.strokeStyle = 'rgba(255,240,200,' + (0.9 - (frame & 3) * 0.2) + ')'; g.lineWidth = 2; g.beginPath(); g.moveTo(16 - r, 16 - r); g.lineTo(16 + r, 16 + r); g.moveTo(16 + r, 16 - r); g.lineTo(16 - r, 16 + r); g.stroke(); }
    fxCache.set(key, c);
    return c;
  }

  // ---------------------------------------------------------------- buildings
  // art name -> Wyrmsun sprite per race (square frames stacked vertically; frame 0 is the finished building).
  // Halls switch sprite with the keep tier; the oil platform uses the bare pier frame (2) of the teutonic dock.
  // Keyed by the building's generic role (data.js). Every role has its own sprite per race: Stables = teuton stables / troll
  // barracks (Ogre Mound), Inventor = gnome workshop / goblin market (Alchemist), Mage Tower = dwarf academy / goblin academy
  // (Temple of the Damned), Foundry = dwarf smithy / troll smithy, Roost = goblin spider pit, Refinery = Widelands smelting
  // works / brewery with the vats recoloured to oil.
  const BLD_ART = {
    hall: { human: 'h_hall', orc: 'o_hall', keep: { human: ['h_keep', 'h_castle'], orc: ['o_keep', 'o_castle'] } },
    farm: { human: 'h_farm', orc: 'o_farm' }, barracks: { human: 'h_barracks', orc: 'o_barracks' },
    scout: { human: 'h_scout', orc: 'o_scout' }, tower: { human: 'h_tower', orc: 'o_tower' }, cannon: { human: 'h_cannon', orc: 'o_cannon' },
    smith: { human: 'h_smith', orc: 'o_smith' }, mill: { human: 'h_mill', orc: 'o_mill' }, shipyard: { human: 'h_dock', orc: 'o_dock' },
    aviary: { human: 'h_aviary', orc: 'o_roost' }, church: { human: 'h_temple', orc: 'o_temple' }, platform: { human: 'h_dock', orc: 'h_dock', frame: 2 },
    stables: { human: 'h_stables', orc: 'o_stables' }, inventor: { human: 'h_inventor', orc: 'o_inventor' },
    magetower: { human: 'h_magetower', orc: 'o_aviary' }, foundry: { human: 'h_foundry', orc: 'o_foundry' },
    refinery: { human: 'h_refinery', orc: 'o_refinery' },
  };
  const bldCache = cache();
  // Draws one square frame of a Wyrmsun sheet scaled onto the footprint (smoothing only when the sizes differ).
  function wyrmFrame(g, key, owner, frame, size, dy, dh, alpha) {
    const im = IMG[key], fw = im.naturalWidth, frames = Math.max(1, Math.round(im.naturalHeight / fw)), fr = Math.min(frame | 0, frames - 1);
    const src = owner === undefined ? im : wyrmColour(key, owner);
    g.imageSmoothingEnabled = fw !== size; g.globalAlpha = alpha === undefined ? 1 : alpha;
    const y0 = dy === undefined ? 0 : dy, h = dh === undefined ? 1 : dh;
    g.drawImage(src, 0, fr * fw + fw * y0, fw, fw * h, 0, size * y0, size, size * h);
    g.globalAlpha = 1; g.imageSmoothingEnabled = false;
  }
  // stage: 0 staked site (< 25%), 1 planked site (< 50%), 2 half-built (< 100%), 3 done; keep: hall tier (1 keep, 2 castle)
  function building(art, n, owner, race, stage, keep) {
    const key = art + '|' + n + '|' + owner + '|' + race + '|' + stage + '|' + (keep | 0) + '|' + ready;
    let c = bldCache.get(key);
    if (c) return c;
    const size = n * TILE;
    let g; [c, g] = mk(size, size);
    const spec = BLD_ART[art] || BLD_ART.farm;
    let name = spec[race] || spec.human;
    if (keep && spec.keep) name = (spec.keep[race] || spec.keep.human)[Math.min(keep, 2) - 1];
    const im = ready && okImg(name) ? name : null, sz = n >= 3 ? '3' : '2', site = ready && okImg('site' + sz) && okImg('constr' + sz);
    if (stage === 0 || stage === 1) { // Wyrmsun construction site for this footprint: staked earth, then the first construction frame
      if (site) { if (stage === 0) wyrmFrame(g, 'site' + sz, undefined, 0, size); else wyrmFrame(g, 'constr' + sz, undefined, 0, size); }
      else {
        g.fillStyle = 'rgba(60,40,20,0.5)'; g.fillRect(6, 6, size - 12, size - 12);
        g.fillStyle = '#c8a060'; for (const [sx, sy] of [[4, 4], [size - 10, 4], [4, size - 12], [size - 10, size - 12]]) g.fillRect(sx, sy, 6, 8);
        g.strokeStyle = '#e8dcc0'; g.lineWidth = 1; g.setLineDash([4, 4]); g.strokeRect(7, 8, size - 14, size - 16); g.setLineDash([]);
      }
    } else if (im) {
      if (okImg(name + '_shadow')) wyrmFrame(g, name + '_shadow', undefined, spec.frame || 0, size, undefined, undefined, 0.55);
      if (stage === 2) { // half-built: the lower part of the building rises out of the last construction frame under a timber scaffold
        if (site) wyrmFrame(g, 'constr' + sz, undefined, 2, size);
        wyrmFrame(g, name, owner, spec.frame || 0, size, 0.42, 0.58);
        g.strokeStyle = '#c8a060'; g.lineWidth = 3;
        for (let k = 0; k <= 3; k++) { g.beginPath(); g.moveTo(6 + k * (size - 12) / 3, size * 0.5); g.lineTo(6 + k * (size - 12) / 3, size * 0.12); g.stroke(); }
        g.beginPath(); g.moveTo(6, size * 0.12); g.lineTo(size - 6, size * 0.12); g.stroke();
        g.beginPath(); g.moveTo(6, size * 0.3); g.lineTo(size - 6, size * 0.3); g.stroke();
      } else { if (spec.tint) g.filter = spec.tint; wyrmFrame(g, name, owner, spec.frame || 0, size); g.filter = 'none'; }
    } else { g.fillStyle = race === 'orc' ? '#7a5230' : '#8a8a90'; g.fillRect(2, 2, size - 4, size - 4); g.fillStyle = '#6a5a4a'; g.fillRect(6, 6, size - 12, size - 12); }
    if (stage === 3) { // faction banner(s): one per hall tier
      const flags = keep >= 2 ? [[size - 12, 4], [3, 4], [size / 2 - 5, 2]] : keep ? [[size - 12, 4], [3, 4]] : [[size - 12, 4]];
      for (const [bx, by] of flags) { g.fillStyle = '#3a2412'; g.fillRect(bx, by, 2, 22); g.fillStyle = FACTION[owner][0]; g.fillRect(bx + 2, by, 9, 12); g.fillStyle = FACTION[owner][1]; g.fillRect(bx + 2, by + 10, 9, 2); }
    }
    bldCache.set(key, c);
    return c;
  }

  // ---------------------------------------------------------------- resources
  const resCache = cache();
  function mine(n, lit) {
    const key = 'mine' + n + '|' + !!lit + '|' + ready;
    let c = resCache.get(key);
    if (c) return c;
    const size = n * TILE;
    let g; [c, g] = mk(size, size);
    if (ready && okImg('mine')) { // Wyrmsun gold mine: frame 1 has the lit entrance; the purple door glyph is painted gold
      if (okImg('mine_shadow')) wyrmFrame(g, 'mine_shadow', undefined, 0, size, undefined, undefined, 0.55);
      wyrmFrame(g, 'mine', 45, lit ? 1 : 0, size);
      if (lit) { // soft lantern glow spilling out of the entrance
        const gr = g.createRadialGradient(size * 0.19, size * 0.64, 1, size * 0.19, size * 0.64, size * 0.28);
        gr.addColorStop(0, 'rgba(255,230,150,0.8)'); gr.addColorStop(0.45, 'rgba(255,205,100,0.35)'); gr.addColorStop(1, 'rgba(255,190,80,0)');
        g.fillStyle = gr; g.fillRect(0, 0, size, size);
      }
    } else {
      g.fillStyle = '#6b5a3a'; g.fillRect(2, 2, size - 4, size - 4); g.fillStyle = '#f2c744'; g.fillRect(size / 3, size / 3, size / 3, size / 4);
      g.fillStyle = lit ? '#f2c744' : '#2a1a0a'; g.fillRect(size / 2 - 12, size - 30, 24, 26);
      if (lit) { g.fillStyle = '#ffe9a0'; g.fillRect(size / 2 - 8, size - 26, 16, 18); g.fillStyle = 'rgba(255,220,120,0.35)'; g.fillRect(size / 2 - 22, size - 12, 44, 12); }
      g.fillStyle = '#5d3b19'; g.fillRect(size / 2 - 15, size - 33, 30, 4); g.fillRect(size / 2 - 15, size - 33, 4, 30); g.fillRect(size / 2 + 11, size - 33, 4, 30);
    }
    resCache.set(key, c);
    return c;
  }
  // An oil patch: an irregular dark slick on the water (a wavy outline, not a disc), a thin light rim where it meets
  // the water, rainbow sheen rings that follow the outline as oil does, and a few bubbles. Deterministic per size.
  function oil(n) {
    const key = 'oil' + n;
    let c = resCache.get(key);
    if (c) return c;
    const size = n * TILE, cxm = size / 2, cym = size / 2, R = size / 2 - 3;
    let g; [c, g] = mk(size, size);
    const ph = [hash(n, 1) * 6.28, hash(n, 2) * 6.28, hash(n, 3) * 6.28];
    const rad = (a, k) => k * R * (0.8 + 0.1 * Math.sin(3 * a + ph[0]) + 0.07 * Math.sin(5 * a + ph[1]) + 0.04 * Math.sin(8 * a + ph[2]));
    const shape = (k, dy) => { g.beginPath(); for (let t = 0; t <= 64; t++) { const a = t / 64 * 6.2832, r = rad(a, k); const x = cxm + Math.cos(a) * r, y = cym + dy + Math.sin(a) * r * 0.86; t ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
    // a darker stain on the water, then the slick with a faint rim
    g.fillStyle = 'rgba(8,14,20,0.35)'; shape(1.08, 1); g.fill();
    const body = g.createRadialGradient(cxm - R * 0.2, cym - R * 0.2, R * 0.1, cxm, cym, R);
    body.addColorStop(0, '#221d2a'); body.addColorStop(0.6, '#15121a'); body.addColorStop(1, '#0c0b10');
    g.fillStyle = body; shape(1, 0); g.fill();
    g.strokeStyle = 'rgba(120,130,150,0.45)'; g.lineWidth = 1.5; shape(1, 0); g.stroke();
    // sheen rings (thin, broken, iridescent), following the outline at a few depths
    const hues = ['rgba(160,100,210,', 'rgba(70,180,200,', 'rgba(120,200,100,', 'rgba(230,180,80,'];
    g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const depth = 0.78 - k * 0.15;
      for (let seg = 0; seg < 3; seg++) {
        const a0 = seg * 2.094 + k * 0.9 + hash(n * 5 + k, seg) * 0.6, len = 0.9 + hash(k, seg + 9) * 0.7;
        g.strokeStyle = hues[(k + seg) % 4] + (0.28 + 0.2 * hash(seg, k + 4)) + ')'; g.lineWidth = 1.6 + hash(k, seg) * 1.2; g.shadowColor = g.strokeStyle; g.shadowBlur = 3;
        g.beginPath();
        for (let t = 0; t <= 12; t++) { const a = a0 + len * t / 12, r = rad(a, depth); const x = cxm + Math.cos(a) * r, y = cym + Math.sin(a) * r * 0.86; t ? g.lineTo(x, y) : g.moveTo(x, y); }
        g.stroke();
      }
    }
    g.shadowBlur = 0;
    // bubbles with a light rim
    for (let k = 0; k < 7; k++) {
      const a = hash(k, n + 20) * 6.2832, d = rad(a, 0.6) * hash(k + 3, n), x = cxm + Math.cos(a) * d, y = cym + Math.sin(a) * d * 0.86, r = 1.2 + 2.3 * hash(k, 31);
      g.fillStyle = '#1b1822'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.strokeStyle = 'rgba(190,185,220,0.75)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, r, 3.7, 5.3); g.stroke();
    }
    resCache.set(key, c);
    return c;
  }

  // ---------------------------------------------------------------- terrain
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }
  const tileCache = cache();
  // Wyrmsun terrain sheets are blob autotiles on a 32 px grid: a 3x3 block (corner, edge and centre pieces, origin ox,oy)
  // and, for the ground sheets, a plus-shaped block whose centre tile carries the four concave (inner) corners.
  // A tile is the centre piece with every side that borders another kind swapped for the edge strip, the corners for the
  // outer-corner quadrant, and a corner whose two sides match but whose diagonal does not for the inner-corner quadrant.
  // mask bits: N 1, E 2, S 4, W 8, NE 16, SE 32, SW 64, NW 128 (set when that neighbour is the same kind).
  const SHEETS = { rock: { ox: 1, oy: 0, plus: [8, 1] }, water: { ox: 0, oy: 0, plus: [7, 1] }, water_shore: { ox: 0, oy: 0, plus: [7, 1] }, trees: { ox: 1, oy: 0, plus: null } };
  function blob(g, key, mask, centre) {
    const im = IMG[key], sh = SHEETS[key], H = TILE / 2;
    const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8, NE = mask & 16, SE = mask & 32, SW = mask & 64, NW = mask & 128;
    const [t, tg] = mk(TILE, TILE);
    const src = (col, row, sx, sy, w, h) => { tg.clearRect(sx, sy, w, h); tg.drawImage(im, col * TILE + sx, row * TILE + sy, w, h, sx, sy, w, h); };
    const c = centre || [sh.ox + 1, sh.oy + 1];
    tg.drawImage(im, c[0] * TILE, c[1] * TILE, TILE, TILE, 0, 0, TILE, TILE);
    if (!N) src(sh.ox + 1, sh.oy, 0, 0, TILE, H); if (!S) src(sh.ox + 1, sh.oy + 2, 0, H, TILE, H);
    if (!W) src(sh.ox, sh.oy + 1, 0, 0, H, TILE); if (!E) src(sh.ox + 2, sh.oy + 1, H, 0, H, TILE);
    if (!N && !W) src(sh.ox, sh.oy, 0, 0, H, H); if (!N && !E) src(sh.ox + 2, sh.oy, H, 0, H, H);
    if (!S && !W) src(sh.ox, sh.oy + 2, 0, H, H, H); if (!S && !E) src(sh.ox + 2, sh.oy + 2, H, H, H, H);
    if (sh.plus) {
      const [px, py] = sh.plus;
      if (N && W && !NW) src(px, py, 0, 0, H, H); if (N && E && !NE) src(px, py, H, 0, H, H);
      if (S && W && !SW) src(px, py, 0, H, H, H); if (S && E && !SE) src(px, py, H, H, H, H);
    }
    g.drawImage(t, 0, 0);
    return t;
  }
  // full ground tiles: Wyrmsun grass and, for variants 3 and 7, a few pebbles (dry grass comes from dryPatch below);
  // plus the tree-litter pieces used for stumps
  const GRASS_TILES = [['grass', 1, 1], ['grass', 4, 1], ['grass', 7, 1], ['grass', 14, 2], ['grass', 7, 1], ['grass', 4, 1], ['grass', 1, 1], ['grass', 15, 2]];
  const LITTER = [[0, 1], [0, 2], [0, 3], [0, 1], [0, 2], [0, 3], [0, 1], [0, 2]];
  // forest piece by 4-neighbour mask (N 1, E 2, S 4, W 8): 'c' centre, [col, row] of the pine sheet, null = single tree
  const FOREST_PIECE = { 15: 'c', 14: [2, 0], 11: [2, 2], 7: [1, 1], 13: [3, 1], 6: [1, 0], 12: [3, 0], 3: [1, 2], 9: [3, 2] };
  const isLoneTree = (mask) => !FOREST_PIECE[mask & 15];
  // kind: grass | stump | forest | water | rock ; variant 0..7 ; water takes a frame 0..2 (ripple phases)
  // mask (water, forest, rock): the 8-neighbour same-kind mask above; 255 = surrounded, so a plain centre tile
  // bare: leave out the ground under the shape (the caller has already laid grass and dry patches there)
  function tile(kind, variant, frame, mask, bare) {
    variant &= 7; frame = frame | 0; mask = mask === undefined ? 255 : mask & 255;
    const shaped = kind === 'rock' || kind === 'water' || kind === 'forest';
    const key = kind + variant + '|' + frame + '|' + (shaped ? mask : 0) + '|' + ready + (bare ? '|b' : '');
    let c = tileCache.get(key);
    if (c) return c;
    let g; [c, g] = mk(TILE, TILE);
    const h = (i, j) => hash(i * 7 + variant * 131, j * 13 + variant * 17);
    const wyrm = ready && okImg('grass') && okImg('water') && okImg('water_shore') && okImg('trees') && okImg('rock');
    if (wyrm) {
      const [gs, gx, gy] = GRASS_TILES[variant];
      if (!bare) g.drawImage(okImg(gs) ? IMG[gs] : IMG.grass, gx * TILE, gy * TILE, TILE, TILE, 0, 0, TILE, TILE);
      if (kind === 'stump') { const [lx, ly] = LITTER[variant]; g.drawImage(IMG.trees, lx * TILE, ly * TILE, TILE, TILE, 0, 0, TILE, TILE); }
      else if (kind === 'water') {
        const w = blob(g, 'water', mask);
        blob(g, 'water_shore', mask);
        // ripples: three phases of the same strokes, shifted, so the water shimmers when the frame cycles; kept inside the water shape
        const [r, rg] = mk(TILE, TILE);
        rg.strokeStyle = 'rgba(235,248,255,' + (0.4 + 0.2 * (frame % 3 === 1)) + ')'; rg.lineWidth = 1.5;
        for (let i = 0; i < 2 + (variant & 1); i++) { const x = 2 + h(i, 8) * 14 + (frame % 3) * 3, y = 4 + h(i, 9) * 22 + ((frame + i) % 3) * 2; rg.beginPath(); rg.moveTo(x, y); rg.quadraticCurveTo(x + 3, y - 2.5, x + 6, y); rg.quadraticCurveTo(x + 9, y + 2.5, x + 12, y); rg.stroke(); }
        rg.fillStyle = 'rgba(200,230,255,' + (0.10 + 0.08 * (frame % 3)) + ')'; rg.fillRect(4 + (frame % 3) * 6, 20 - (frame % 3) * 4, 6, 2);
        rg.globalCompositeOperation = 'destination-in'; rg.drawImage(w, 0, 0);
        g.drawImage(r, 0, 0);
      } else if (kind === 'forest') {
        // whole pieces only (half-tile composites would cut crowns flat): centre variants, the four edges, the four outer
        // corners; every other shape (lone trees, one-tile strips, dead ends) is a single tree whose crown treeTop() overhangs
        const piece = FOREST_PIECE[mask & 15];
        if (piece === 'c') { const [cx, cy] = [[2, 1], [10, 0], [11, 1], [14, 1], [2, 1], [10, 1], [11, 0], [2, 1]][variant]; g.drawImage(IMG.trees, cx * TILE, cy * TILE, TILE, TILE, 0, 0, TILE, TILE); }
        else if (piece) g.drawImage(IMG.trees, piece[0] * TILE, piece[1] * TILE, TILE, TILE, 0, 0, TILE, TILE);
        else g.drawImage(IMG.trees, 1 * TILE, 5 * TILE, TILE, TILE, 0, 0, TILE, TILE);
      } else if (kind === 'rock') blob(g, 'rock', mask);
    } else {
      g.fillStyle = { grass: '#3f8a2f', stump: '#3f8a2f', forest: '#1d4f1d', water: '#2a5d9c', rock: '#5a564f' }[kind]; g.fillRect(0, 0, TILE, TILE);
      if (kind === 'water' && frame) { g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(4 + frame * 6, 12, 8, 2); }
    }
    tileCache.set(key, c);
    return c;
  }
  // Ground tiles that touch water get a strip of wet sand, ground tiles that touch forest a strip of canopy shade,
  // so the transition straddles the boundary (the autotiles above round only the water and tree side).
  function groundEdge(g, px, py, side, kind) {
    const w = kind === 'water' ? 7 : 10, col = kind === 'water' ? [206, 190, 132] : [0, 28, 0], a0 = kind === 'water' ? 0.55 : 0.6, am = kind === 'water' ? 0.22 : 0.3;
    const rgba = (a) => 'rgba(' + col.join(',') + ',' + a + ')';
    if (side.length === 2) { g.fillStyle = rgba(a0 * 0.5); g.fillRect(side[1] === 'w' ? px : px + TILE - w, side[0] === 'n' ? py : py + TILE - w, w, w); return; }
    const grd = side === 'n' ? g.createLinearGradient(0, py, 0, py + w) : side === 's' ? g.createLinearGradient(0, py + TILE, 0, py + TILE - w)
      : side === 'w' ? g.createLinearGradient(px, 0, px + w, 0) : g.createLinearGradient(px + TILE, 0, px + TILE - w, 0);
    grd.addColorStop(0, rgba(a0)); grd.addColorStop(0.55, rgba(am)); grd.addColorStop(1, rgba(0)); g.fillStyle = grd;
    if (side === 'n') g.fillRect(px, py, TILE, w); else if (side === 's') g.fillRect(px, py + TILE - w, TILE, w);
    else if (side === 'w') g.fillRect(px, py, w, TILE); else g.fillRect(px + TILE - w, py, w, TILE);
  }
  // Dry grass: a smooth value-noise field over the whole map (about a quarter of the ground), cut out of the Wyrmsun
  // semi-dry grass pixel by pixel with a little per-pixel jitter, so patches have ragged organic edges and never
  // follow the tile grid. Continuous across tiles, forest floors included.
  function dryField(x, y, seed) {
    const vn = (x, y, s) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const h = (i, j) => { let k = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(s, 0x9e3779b1); k = Math.imul(k ^ (k >>> 15), 0x85ebca6b); k = Math.imul(k ^ (k >>> 13), 0xc2b2ae35); return ((k ^ (k >>> 16)) >>> 0) / 4294967296; };
      return (h(x0, y0) * (1 - u) + h(x0 + 1, y0) * u) * (1 - v) + (h(x0, y0 + 1) * (1 - u) + h(x0 + 1, y0 + 1) * u) * v;
    };
    return vn(x / 7, y / 7, seed) * 0.7 + vn(x / 2.5, y / 2.5, seed + 99) * 0.3 - 0.6;
  }
  let dryPix = null, dryCache = new Map(), drySeed = null;
  function dryPatch(g, tx, ty, seed) {
    if (!ready || !okImg('grass2')) return;
    if (seed !== drySeed) { dryCache = new Map(); drySeed = seed; }
    const key = tx + ',' + ty;
    let hit = dryCache.get(key);
    if (hit === undefined) { hit = dryTile(tx, ty, seed); dryCache.set(key, hit); }
    if (hit) g.drawImage(hit, tx * TILE, ty * TILE);
  }
  function dryTile(tx, ty, seed) {
    const c = [dryField(tx, ty, seed), dryField(tx + 1, ty, seed), dryField(tx, ty + 1, seed), dryField(tx + 1, ty + 1, seed)];
    if (Math.max(...c) < -0.08) return null;                  // no dry grass anywhere near this tile
    if (Math.min(...c) > 0.08) { const [t, tg] = mk(TILE, TILE); tg.drawImage(IMG.grass2, TILE, TILE, TILE, TILE, 0, 0, TILE, TILE); return t; }
    if (!dryPix) { const [dc, dg] = mk(TILE, TILE); dg.drawImage(IMG.grass2, TILE, TILE, TILE, TILE, 0, 0, TILE, TILE); dryPix = dg.getImageData(0, 0, TILE, TILE).data; }
    const [t, tg] = mk(TILE, TILE), im = tg.createImageData(TILE, TILE), d = im.data;
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const f = dryField(tx + (i + 0.5) / TILE, ty + (j + 0.5) / TILE, seed) + (hash(tx * TILE + i, ty * TILE + j) - 0.5) * 0.06;
      if (f <= 0) continue;
      const o = (j * TILE + i) * 4; d[o] = dryPix[o]; d[o + 1] = dryPix[o + 1]; d[o + 2] = dryPix[o + 2]; d[o + 3] = 255;
    }
    tg.putImageData(im, 0, 0);
    return t;
  }
  // the crown of a lone tree, drawn over the tile above it after the ground pass
  function treeTop(g, px, py) { if (ready && okImg('trees')) g.drawImage(IMG.trees, 1 * TILE, 4 * TILE, TILE, TILE, px, py - TILE, TILE, TILE); }

  // ---------------------------------------------------------------- HUD icons (10x10 at 2px)
  const iconCache = cache();
  function icon(name) {
    let c = iconCache.get(name);
    if (c) return c;
    let g; [c, g] = mk(20, 20);
    const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x * PX, y * PX, w * PX, h * PX); };
    if (name === 'gold') { px(2, 3, 6, 5, '#f2c744'); px(3, 2, 4, 1, '#f2c744'); px(3, 8, 4, 1, '#a07a1a'); px(3, 4, 1, 2, '#fff2a0'); }
    else if (name === 'lumber') { px(1, 4, 8, 3, '#8a5a2b'); px(1, 5, 8, 1, '#5d3b19'); px(0, 4, 1, 3, '#c8a060'); px(9, 4, 1, 3, '#c8a060'); }
    else if (name === 'oil') { px(4, 1, 2, 2, '#3a3a5a'); px(3, 3, 4, 3, '#2a2a3a'); px(2, 5, 6, 3, '#1a1a22'); px(3, 8, 4, 1, '#1a1a22'); px(3, 4, 1, 1, '#8a8ab0'); }
    else if (name === 'food') { px(3, 2, 4, 4, '#f1c39b'); px(2, 6, 6, 3, '#2f6fe0'); px(4, 3, 1, 1, '#161616'); px(6, 3, 1, 1, '#161616'); }
    else if (name === 'stop') { px(2, 2, 6, 6, '#c83a2a'); px(3, 3, 4, 4, '#ff6a5a'); }
    else if (name === 'hold') { px(2, 2, 6, 6, '#8a8a90'); px(4, 3, 2, 4, '#f4f4f4'); }
    else if (name === 'gather') { px(2, 4, 5, 4, '#f2c744'); px(4, 2, 4, 2, '#8a5a2b'); }
    else if (name === 'attack') { px(2, 7, 2, 2, '#8a5a2b'); for (let i = 0; i < 5; i++) px(3 + i, 6 - i, 1, 1, '#e8ecf4'); }
    else if (name === 'research') { px(2, 2, 6, 6, '#3a2a6a'); px(4, 3, 2, 4, '#f2c744'); px(3, 4, 4, 1, '#f2c744'); }
    else if (name === 'cast') { px(4, 1, 2, 8, '#8a5a2b'); px(3, 0, 4, 2, '#7fd0ff'); px(1, 3, 2, 1, '#7fd0ff'); px(7, 5, 2, 1, '#7fd0ff'); }
    else if (name === 'build') { px(1, 5, 8, 4, '#8a8a90'); px(3, 2, 4, 3, '#c83a2a'); px(4, 6, 2, 3, '#3a2412'); }
    else if (name === 'repair') { px(2, 6, 3, 3, '#8a5a2b'); px(4, 2, 4, 4, '#c9ccd6'); px(5, 3, 2, 2, '#8a8a90'); }
    else if (name === 'move') { px(1, 4, 6, 2, '#7fd0ff'); px(6, 2, 2, 6, '#7fd0ff'); px(7, 4, 2, 2, '#7fd0ff'); }
    else if (name === 'patrol') { px(1, 3, 6, 1, '#7fd0ff'); px(3, 6, 6, 1, '#7fd0ff'); px(1, 2, 1, 3, '#7fd0ff'); px(8, 5, 1, 3, '#7fd0ff'); }
    else if (name === 'cancel') { for (let i = 0; i < 6; i++) { px(2 + i, 2 + i, 1, 1, '#ff6a5a'); px(7 - i, 2 + i, 1, 1, '#ff6a5a'); } }
    else if (name === 'load') { px(2, 6, 6, 3, '#5d3b19'); px(4, 2, 2, 4, '#f4f4f4'); px(3, 4, 4, 1, '#f4f4f4'); }
    else if (name === 'mana') { px(3, 2, 4, 6, '#3f7fff'); px(4, 1, 2, 1, '#7fb0ff'); px(4, 3, 1, 2, '#bcd6ff'); }
    iconCache.set(name, c);
    return c;
  }


  // ---------------------------------------------------------------- command-card icons (46x38, Warcraft II's icon size)
  // assets/icons/card_icons.png: Wyrmsun icons (CC0; purple = team colour); spell_icons.png: Painterly Spell Icons (CC-BY 3.0).
  // cardIcon(kind, id, race, owner) -> a 46x38 canvas with a bevelled edge, or null (unknown id, or images not loaded yet).
  //   kind 'order':    move, stop, attack, patrol, hold (stand ground), harvest, return, repair, build, build2 (advanced),
  //                    attack_ground, demolish, unload, board, cancel (aliases: gather, load, stand, build_basic, build_advanced)
  //   kind 'upgrade':  any UPGRADES id (spell research shows the spell; keep/castle/tower_* show the building they become)
  //   kind 'spell':    any SPELLS id
  //   kind 'unit':     any unit type (Wyrmsun icon where one fits, else a bust / hull / flyer cut from the unit's own sprite)
  //   kind 'building': a generic building role (BLD_DEFS[type].art: hall, farm, stables, ...), opts tier 1/2 for keep/castle
  const CARD_W = 46, CARD_H = 38;
  const CARD_NAMES = ["boots", "shield_h", "shield_o", "attack_h", "attack_o", "patrol_h", "patrol_o", "hold_h", "hold_o", "harvest", "return_h", "return_o", "repair", "build", "build2", "attack_ground", "demolish", "unload", "board", "cancel", "weapons1_h", "weapons2_h", "weapons1_o", "weapons2_o", "shields1_h", "shields2_h", "shields1_o", "shields2_o", "arrows1_h", "arrows2_h", "arrows1_o", "arrows2_o", "siege1_h", "siege2_h", "siege1_o", "siege2_o", "cannons1", "cannons2", "hulls1", "hulls2", "ranger_h", "ranger_o", "scouting", "longbow_h", "longbow_o", "marksmanship", "regeneration", "u_skeleton", "u_sappers", "u_dwarves", "u_knight", "u_dragon"];
  const SPELL_NAMES = ["holy_vision", "healing", "exorcism", "fireball", "slow", "flame_shield", "invisibility", "polymorph", "blizzard", "eye_of_kilrogg", "bloodlust", "runes", "death_coil", "haste", "raise_dead", "whirlwind", "unholy_armor", "death_and_decay"];
  const ORDER_ALIAS = { move: 'boots', stop: 'shield', gather: 'harvest', load: 'board', stand: 'hold', build_basic: 'build', build_advanced: 'build2' };
  const UNIT_ICON = { skeleton: 'u_skeleton', sappers: 'u_sappers', dwarves: 'u_dwarves', knight: 'u_knight', dragon: 'u_dragon' };
  const cardCache = cache();
  function cardFrame(c) {                           // WC2 button bevel: light top-left, dark bottom-right
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, CARD_W, 1); g.fillRect(0, 0, 1, CARD_H);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, CARD_H - 1, CARD_W, 1); g.fillRect(CARD_W - 1, 0, 1, CARD_H);
    return c;
  }
  function atlasIcon(name, race, owner) {           // race-specific variant (name_h / name_o) first
    const suf = race === 'orc' ? '_o' : '_h';
    const n = CARD_NAMES.includes(name + suf) ? name + suf : name;
    let i = CARD_NAMES.indexOf(n), key = 'card_icons', src;
    if (i >= 0) { if (!okImg(key)) return null; src = wyrmColour(key, owner); }
    else { i = SPELL_NAMES.indexOf(name); key = 'spell_icons'; if (i < 0 || !okImg(key)) return null; src = IMG[key]; }
    const [c, g] = mk(CARD_W, CARD_H);
    g.drawImage(src, (i % 16) * CARD_W, Math.floor(i / 16) * CARD_H, CARD_W, CARD_H, 0, 0, CARD_W, CARD_H);
    return cardFrame(c);
  }
  // an icon cut from the game's own sprite, on a strip of terrain
  function spriteIcon(type, race, owner) {
    const spec = OTHER_UNIT[type] || {}, [c, g] = mk(CARD_W, CARD_H);
    const bg = tile(spec.ship ? 'water' : 'grass', 1, 0, 255); g.drawImage(bg, 0, 0); g.drawImage(bg, 32, 0); g.drawImage(bg, 0, 32); g.drawImage(bg, 32, 32);
    if (spec.fly || spec.gryphon) { g.fillStyle = 'rgba(150,190,230,0.45)'; g.fillRect(0, 0, CARD_W, CARD_H); }
    const fit = (src, sx, sy, sw, sh, pad) => { const k = Math.min((CARD_W - pad) / sw, (CARD_H - pad) / sh), w = sw * k, h = sh * k; g.imageSmoothingEnabled = k < 1; g.drawImage(src, sx, sy, sw, sh, Math.round((CARD_W - w) / 2), Math.round((CARD_H - h) / 2), w, h); g.imageSmoothingEnabled = false; };
    if (isLpc(type)) { const f = lpcFrame(type, race, owner, 'walk', 'down', 0); if (!f) return null; g.drawImage(f.c, f.sx + 10, f.sy + 6, 44, 36, 0, 1, CARD_W, 38); }   // head and shoulders
    else if (spec.ship) {                              // hull turned to sail right
      const r = ship(spec, owner); if (!okImg(spec.img)) return null;
      const [t, tg] = mk(r.h, r.w); tg.translate(r.h / 2, r.w / 2); tg.rotate(Math.PI / 2); tg.drawImage(r.c, -r.w / 2, -r.h / 2);
      fit(t, 0, 0, r.h, r.w, 2);
    } else if (spec.siege) { const r = siege(spec.siege, owner, 2, 0); fit(r.c, 0, 0, r.w, r.h, 0); }
    else if (spec.critter) { const f = critter('down', 0); if (!f) return null; fit(f.c, f.sx + 32, f.sy + 40, 64, 56, 4); }
    else { const r = flyer(type, owner, 0); fit(r.c, 0, 0, r.w, r.h, 0); }
    return cardFrame(c);
  }
  function buildingIcon(role, race, owner, tier) {
    const spec = BLD_ART[role]; if (!spec || !ready) return null;
    const size = (window.WC2 && WC2.BUILDINGS[role] && WC2.BUILDINGS[role].size) || 3, b = building(role, size, owner, race, 3, tier | 0);
    const [c, g] = mk(CARD_W, CARD_H), bg = tile('grass', 1, 0, 255);
    g.drawImage(bg, 0, 0); g.drawImage(bg, 32, 0); g.drawImage(bg, 0, 32); g.drawImage(bg, 32, 32);
    const k = CARD_W / b.width; g.imageSmoothingEnabled = true; g.drawImage(b, 0, (b.height - CARD_H / k) / 2, b.width, CARD_H / k, 0, 0, CARD_W, CARD_H); g.imageSmoothingEnabled = false;
    return cardFrame(c);
  }
  function cardIcon(kind, id, race, owner, opts) {
    race = race === 'orc' ? 'orc' : 'human'; owner = owner || 'player';
    const key = kind + '|' + id + '|' + race + '|' + owner + '|' + (opts && opts.tier | 0);
    let c = cardCache.get(key);
    if (c) return c;
    if (!ready) return null;
    const U = window.WC2 && WC2.UPGRADES && WC2.UPGRADES[id];
    if (kind === 'order') c = atlasIcon(ORDER_ALIAS[id] || id, race, owner);
    else if (kind === 'spell') c = atlasIcon(id, race, owner);
    else if (kind === 'unit') c = UNIT_ICON[id] ? atlasIcon(UNIT_ICON[id], race, owner) : spriteIcon(id, race, owner);
    else if (kind === 'building') c = buildingIcon(id, race, owner, opts && opts.tier);
    else if (kind === 'upgrade' && U) {
      if (U.spell) c = atlasIcon(U.spell, race, owner);
      else if (U.becomes) c = buildingIcon({ keep: 'hall', castle: 'hall' }[U.becomes] || U.becomes, race, owner, { keep: 1, castle: 2 }[U.becomes] || 0);
      else if (id === 'paladin') c = spriteIcon(race === 'orc' ? 'ogre_mage' : 'paladin', race, owner);   // shows the unit it becomes
      else c = atlasIcon(id, race, owner);
    }
    if (c) cardCache.set(key, c);
    return c || null;
  }

  return { load, get ready() { return ready; }, isLpc, attackAnim, frameCount, lpcFrame, siege, ship, flyer, portrait, OTHER_UNIT,
    carry, fire, rubble, projectile, impact, building, critter, whirlwind, rune, mine, oil, tile, treeTop, isLoneTree, groundEdge, dryPatch, dryField, icon, cardIcon, CARD_W, CARD_H, FACTION, TILE, hash, IMG };
})();
