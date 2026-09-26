#!/usr/bin/env node
// Build docs/wiki/index.json: every data.js object mapped to its Warcraft II page on warcraft.wiki.gg, with the
// stats extracted from the saved wikitext (docs/wiki/pages/*.wiki) and the same fields from data.js.
// Offline: reads only local files. Refresh pages first with fetch_pages.mjs if needed.
// Usage: node docs/wiki/build_index.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWC2, dataFields } from './check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const W = loadWC2();
const slug = (t) => t.toLowerCase().replace(/ /g, '_').replace(/\//g, '%2F');
const page = (t) => fs.readFileSync(path.join(HERE, 'pages', slug(t) + '.wiki'), 'utf8');

// ---- object -> page maps (human, orc) ----
const UNIT_PAGES = {
  worker: ['Peasant (Warcraft II)', 'Peon (Warcraft II)'], footman: ['Footman (Warcraft II)', 'Grunt (Warcraft II)'],
  archer: ['Elven Archer (Warcraft II)', 'Troll Axethrower (Warcraft II)'], ranger: ['Elven Ranger (Warcraft II)', 'Troll Berserker (Warcraft II)'],
  knight: ['Knight (Warcraft II)', 'Ogre (Warcraft II)'], paladin: ['Paladin (Warcraft II)', 'Ogre-Mage (Warcraft II)'],
  ballista: ['Ballista (Warcraft II)', 'Catapult (Warcraft II)'], caster: ['Mage (Warcraft II)', 'Death Knight (Warcraft II)'],
  demo: ['Demolition Squad (Warcraft II)', 'Goblin Sappers (Warcraft II)'], flier: ['Gnomish Flying Machine (Warcraft II)', 'Goblin Zeppelin (Warcraft II)'],
  gryphon: ['Gryphon Rider (Warcraft II)', 'Dragon (Warcraft II)'], tanker: ['Oil Tanker (WC2 Human)', 'Oil Tanker (WC2 Orc)'],
  transport: ['Transport (WC2 Human)', 'Transport (WC2 Orc)'], destroyer: ['Elven Destroyer (Warcraft II)', 'Troll Destroyer (Warcraft II)'],
  battleship: ['Battleship (Warcraft II)', 'Ogre Juggernaught (Warcraft II)'], sub: ['Gnomish Submarine (Warcraft II)', 'Giant Turtle (Warcraft II)'],
  skeleton: ['Skeleton (Warcraft II)', 'Skeleton (Warcraft II)'], eye: ['Eye of Kilrogg (Warcraft II)', 'Eye of Kilrogg (Warcraft II)'],
  critter: ['Critter (Warcraft II)', 'Critter (Warcraft II)'],
};
const BUILDING_PAGES = {
  hall: ['Town Hall (Warcraft II)', 'Great Hall (Warcraft II)'], keep: ['Keep (Warcraft II)', 'Stronghold (Warcraft II)'],
  castle: ['Castle (Warcraft II)', 'Fortress (Warcraft II)'], farm: ['Farm (WC2 Human)', 'Pig Farm (WC2 Orc)'],
  barracks: ['Barracks (WC2 Human)', 'Barracks (WC2 Orc)'], mill: ['Elven Lumber Mill (Warcraft II)', 'Troll Lumber Mill (Warcraft II)'],
  smith: ['Blacksmith (WC2 Human)', 'Blacksmith (WC2 Orc)'], scout: ['Scout Tower (Warcraft II)', 'Watch Tower (Warcraft II)'],
  tower: ['Guard Tower (WC2 Human)', 'Guard Tower (WC2 Orc)'], cannon: ['Cannon Tower (WC2 Human)', 'Cannon Tower (WC2 Orc)'],
  shipyard: ['Shipyard (WC2 Human)', 'Shipyard (WC2 Orc)'], foundry: ['Foundry (WC2 Human)', 'Foundry (WC2 Orc)'],
  refinery: ['Oil Refinery (WC2 Human)', 'Oil Refinery (WC2 Orc)'], platform: ['Oil Platform (WC2 Human)', 'Oil Platform (WC2 Orc)'],
  stables: ['Stables (Warcraft II)', 'Ogre Mound (Warcraft II)'], inventor: ['Gnomish Inventor (Warcraft II)', 'Goblin Alchemist (Warcraft II)'],
  church: ['Church (Warcraft II)', 'Altar of Storms (Warcraft II)'], magetower: ['Mage Tower (Warcraft II)', 'Temple of the Damned (Warcraft II)'],
  aviary: ['Gryphon Aviary (Warcraft II)', 'Dragon Roost (Warcraft II)'],
};
const RACE_IX = { human: 0, orc: 1 };
const TITLE_ROLE = {};
for (const [role, [h, o]] of Object.entries({ ...UNIT_PAGES, ...BUILDING_PAGES })) { TITLE_ROLE[h] = role; TITLE_ROLE[o] = role; }
const roleOf = (title) => TITLE_ROLE[title.replace(/_/g, ' ').trim()] || null;

// Upgrades: A = ";Heading" + cost table (n-th heading with that name), B = horizontal research table column, box = target infobox.
const bs = (r) => (r === 'human' ? 'Blacksmith (WC2 Human)' : 'Blacksmith (WC2 Orc)');
const mill = (r) => (r === 'human' ? 'Elven Lumber Mill (Warcraft II)' : 'Troll Lumber Mill (Warcraft II)');
const fd = (r) => (r === 'human' ? 'Foundry (WC2 Human)' : 'Foundry (WC2 Orc)');
const A = (pg, name, n = 1) => ({ how: 'A', page: pg, name, n });
const UPGRADE_SRC = {
  weapons1: (r) => A(bs(r), r === 'human' ? 'Upgrade Swords' : 'Upgrade Weapons', 1),
  weapons2: (r) => A(bs(r), r === 'human' ? 'Upgrade Swords' : 'Upgrade Weapons', 2),
  shields1: (r) => A(bs(r), 'Upgrade Shields', 1), shields2: (r) => A(bs(r), 'Upgrade Shields', 2),
  siege1: (r) => A(bs(r), r === 'human' ? 'Upgrade Ballistas' : 'Upgrade Catapults', 1),
  siege2: (r) => A(bs(r), r === 'human' ? 'Upgrade Ballistas' : 'Upgrade Catapults', 2),
  arrows1: (r) => A(mill(r), r === 'human' ? 'Upgrade Arrows' : 'Upgrade Throwing Axes', 1),
  arrows2: (r) => A(mill(r), r === 'human' ? 'Upgrade Arrows' : 'Upgrade Throwing Axes', 2),
  ranger: (r) => A(mill(r), r === 'human' ? 'Elven Ranger Training' : 'Troll Berserker Training'),
  scouting: (r) => A(mill(r), r === 'human' ? 'Ranger Scouting' : 'Berserker Scouting'),
  longbow: (r) => A(mill(r), r === 'human' ? 'Research Longbow' : 'Research Lighter Axes'),
  marksmanship: (r) => A(mill(r), 'Ranger Marksmanship'),
  regeneration: (r) => A(mill(r), 'Berserker Regeneration'),
  cannons1: (r) => A(fd(r), 'Upgrade Cannons', 1), cannons2: (r) => A(fd(r), 'Upgrade Cannons', 2),
  hulls1: (r) => A(fd(r), 'Upgrade Ship Armor', 1), hulls2: (r) => A(fd(r), 'Upgrade Ship Armor', 2),
  paladin: (r) => (r === 'human' ? { how: 'B', page: 'Church (Warcraft II)', name: 'Upgrade Knights to Paladins' } : { how: 'B', page: 'Altar of Storms (Warcraft II)', name: 'Upgrade Ogres to Ogre-Mages' }),
  healing: () => ({ how: 'B', page: 'Church (Warcraft II)', name: 'Healing' }),
  exorcism: () => ({ how: 'B', page: 'Church (Warcraft II)', name: 'Exorcism' }),
  bloodlust: () => ({ how: 'B', page: 'Altar of Storms (Warcraft II)', name: 'Bloodlust' }),
  runes: () => ({ how: 'B', page: 'Altar of Storms (Warcraft II)', name: 'Runes' }),
  keep: (r) => ({ how: 'B', page: UNIT_PAGES && BUILDING_PAGES.hall[RACE_IX[r]], name: r === 'human' ? 'Keep' : 'Stronghold', box: BUILDING_PAGES.keep[RACE_IX[r]] }),
  castle: (r) => ({ how: 'B', page: BUILDING_PAGES.keep[RACE_IX[r]], name: r === 'human' ? 'Castle' : 'Fortress', box: BUILDING_PAGES.castle[RACE_IX[r]] }),
  tower_guard: (r) => ({ how: 'box', page: BUILDING_PAGES.tower[RACE_IX[r]] }),
  tower_cannon: (r) => ({ how: 'box', page: BUILDING_PAGES.cannon[RACE_IX[r]] }),
};
for (const s of ['slow', 'flame_shield', 'invisibility', 'polymorph', 'blizzard']) UPGRADE_SRC[s] = () => ({ how: 'B', page: 'Mage Tower (Warcraft II)', name: W.UPGRADES[s].label });
for (const s of ['haste', 'raise_dead', 'whirlwind', 'unholy_armor', 'death_and_decay']) UPGRADE_SRC[s] = () => ({ how: 'B', page: 'Temple of the Damned (Warcraft II)', name: W.UPGRADES[s].label });

const SPELL_SRC = {
  holy_vision: ['Paladin (Warcraft II)', 'Holy Vision'], healing: ['Paladin (Warcraft II)', 'Healing'], exorcism: ['Paladin (Warcraft II)', 'Exorcism'],
  fireball: ['Mage (Warcraft II)', 'Fireball'], slow: ['Mage (Warcraft II)', 'Slow'], flame_shield: ['Mage (Warcraft II)', 'Flame Shield'],
  invisibility: ['Mage (Warcraft II)', 'Invisibility'], polymorph: ['Mage (Warcraft II)', 'Polymorph'], blizzard: ['Mage (Warcraft II)', 'Blizzard'],
  eye_of_kilrogg: ['Ogre-Mage (Warcraft II)', 'Eye of Kilrogg'], bloodlust: ['Ogre-Mage (Warcraft II)', 'Bloodlust'], runes: ['Ogre-Mage (Warcraft II)', 'Runes'],
  death_coil: ['Death Knight (Warcraft II)', 'Death Coil'], haste: ['Death Knight (Warcraft II)', 'Haste'], raise_dead: ['Death Knight (Warcraft II)', 'Raise Dead'],
  whirlwind: ['Death Knight (Warcraft II)', 'Whirlwind'], unholy_armor: ['Death Knight (Warcraft II)', 'Unholy Armor'], death_and_decay: ['Death Knight (Warcraft II)', 'Death and Decay'],
};
const HUMAN_SPELLS = new Set(['holy_vision', 'healing', 'exorcism', 'fireball', 'slow', 'flame_shield', 'invisibility', 'polymorph', 'blizzard']);

// ---- wikitext helpers ----
const unlink = (s) => s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
const stripMarkup = (s) => unlink(s).replace(/<[^>]+>/g, '').replace(/'''?/g, '').replace(/\{\{[^}]*\}\}/g, '').trim();
const firstNum = (s) => { if (s == null) return null; const m = String(s).match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
const links = (s) => [...s.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].replace(/_/g, ' ').trim());

function infobox(text) {
  const m = text.match(/\{\{WC2UnitBox([\s\S]*?)\n\}\}/);
  if (!m) return null;
  const o = {};
  for (const line of m[1].split('\n')) {
    const mm = line.match(/^\|\s*([a-z0-9]+)\s*=(.*)$/i);
    if (mm && mm[2].trim()) o[mm[1]] = mm[2].trim();
  }
  return o;
}

// Format A: ";Heading" research entries followed by a Research Cost / Researched At / Upgrade Time table.
function researchHeadings(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith(';')) continue;
    const raw = lines[i].slice(1);
    const key = (raw.match(/color:\s*yellow"?>\s*([A-Za-z])\s*</) || [])[1] || null;
    const plain = stripMarkup(raw);
    const paren = (plain.match(/\(([^)]*)\)\s*$/) || [])[1] || null;
    const name = plain.replace(/\s*\([^)]*\)\s*$/, '').trim();
    let desc = '';
    let j = i + 1;
    for (; j < lines.length && !lines[j].startsWith(';') && !/^==/.test(lines[j]); j++) {
      if (/^:[^{[]/.test(lines[j]) && !desc) desc = lines[j].slice(1);
      if (/class="alt"/.test(lines[j])) break;
    }
    let row = '';
    for (let k = j + 1; k < lines.length && !lines[k].startsWith('|}'); k++) row += lines[k] + '\n';
    if (!/class="alt"/.test(lines[j] || '')) row = '';
    const cost = row.split('||')[0] || '';
    const c = { gold: 0, lumber: 0, oil: 0 };
    for (const m of cost.matchAll(/(\d+)\s*\[\[File:Sm(Gold|Lumber|Oil)WC2/g)) c[m[2].toLowerCase()] = Number(m[1]);
    const time = firstNum((row.match(/(\d+)\s*secs?/) || [])[1]);
    out.push({ name, key, paren, desc, row: row.trim(), ...c, time, line: lines[i] });
  }
  return out;
}

// Format B: horizontal darktable with a header row of names and rows keyed by an icon or label.
function hTables(text) {
  const out = [];
  for (const t of text.matchAll(/\{\|[^\n]*darktable[^\n]*\n([\s\S]*?)\n\|\}/g)) {
    const rows = t[1].split(/\n\|-[^\n]*\n/).map((r) => r.split('\n').filter((l) => l.startsWith('|')).flatMap((l) => l.slice(1).split('||')).map((c) => c.trim()));
    if (rows.length < 2) continue;
    const head = rows.find((r) => r.length > 1 && r[0] === '');
    if (!head) continue;
    const names = head.slice(1).map((c) => stripMarkup(c.replace(/\[\[File:[^\]]*\]\]/g, '')));
    const cols = names.map((n) => ({ name: n, gold: 0, lumber: 0, oil: 0 }));
    for (const r of rows) {
      if (r === head || r.length < 2) continue;
      const lab = r[0];
      const field = /SmGold/.test(lab) ? 'gold' : /SmLumber/.test(lab) ? 'lumber' : /SmOil/.test(lab) ? 'oil' : /SmFood/.test(lab) ? 'food' : /time/i.test(lab) ? 'time' : null;
      if (!field) continue;
      r.slice(1).forEach((v, i) => { if (cols[i]) cols[i][field] = firstNum(v); });
    }
    out.push(...cols);
  }
  return out;
}

function spellLines(text) {
  const sec = text.split(/\n==\s*Spells\s*==\n/)[1];
  if (!sec) return {};
  const body = sec.split(/\n==[^=]/)[0].split('\n');
  const out = {};
  for (let i = 0; i < body.length; i++) {
    if (!body[i].startsWith(';')) continue;
    const name = stripMarkup(body[i].slice(1));
    const next = body.slice(i + 1).find((l) => l.startsWith(':')) || '';
    out[name] = next.slice(1);
  }
  return out;
}

// ---- wiki field extraction ----
function wikiUnit(title) {
  const b = infobox(page(title));
  const ev = {};
  const g = (k) => { if (b[k] != null) ev[k] = b[k]; return b[k]; };
  const trainable = g('gold') != null;
  const dmg = firstNum(g('attack1')) || 0, pierce = firstNum(g('attack2')) || 0;
  // only buildings count as "produced at"; summons list their caster here
  const pr = g('produced') ? roleOf(links(b.produced)[0] || '') : null;
  const produced = pr && W.BUILDINGS[pr] ? pr : null;
  return {
    label: stripMarkup(b.name || ''),
    gold: trainable ? firstNum(b.gold) : null, lumber: trainable ? firstNum(g('lumber')) || 0 : null, oil: trainable ? firstNum(g('oil')) || 0 : null,
    time_N: firstNum(g('buildtime')), hp: firstNum(g('hp')), armor: firstNum(g('armor')),
    dmg, pierce, range: dmg + pierce > 0 ? firstNum(g('range')) : null,
    sight: firstNum(g('sight')), speed: firstNum(g('speed')), food: firstNum(g('food')),
    produced_at: produced, mana: /cost/.test(b.mana || '') ? null : firstNum(g('mana')),
    _evidence: ev,
  };
}
function wikiBuilding(title) {
  const b = infobox(page(title));
  const ev = {};
  const g = (k) => { if (b[k] != null) ev[k] = b[k]; return b[k]; };
  const armed = firstNum(b.attack1) || firstNum(b.attack2);
  return {
    label: stripMarkup(b.name || '').replace(/ \((Warcraft II|WC2 \w+)\)/, '').split('|').pop(),
    gold: firstNum(g('gold')) || 0, lumber: firstNum(g('lumber')) || 0, oil: firstNum(g('oil')) || 0,
    time_N: firstNum(g('buildtime')), hp: firstNum(g('hp')), armor: firstNum(g('armor')), sight: firstNum(g('sight')),
    food: firstNum(g('food')),
    dmg: armed ? firstNum(g('attack1')) || 0 : null, pierce: armed ? firstNum(g('attack2')) || 0 : null, range: armed ? firstNum(g('range')) : null,
    hotkey: g('hotkey') || null,
    _evidence: ev,
  };
}
const STAT = [[/piercing attack damage/i, 'pierce'], [/armor/i, 'armor'], [/sight/i, 'sight'], [/range/i, 'range']];
function wikiUpgrade(id, race) {
  const src = UPGRADE_SRC[id](race);
  const at = W.UPGRADES[id].at;
  if (src.how === 'A') {
    const hs = researchHeadings(page(src.page)).filter((h) => h.name === src.name);
    const h = hs[src.n - 1];
    if (!h) throw new Error(`heading ${src.name} #${src.n} not found on ${src.page}`);
    const out = { label: h.name, at: roleOf(src.page), gold: h.gold, lumber: h.lumber, oil: h.oil, time_N: h.time, hotkey: h.key ? h.key.toUpperCase() : null };
    const m = h.desc.match(/(piercing attack damage|armor|sight|range) of (.*?) by \+(\d+)/i);
    if (m) {
      out.effect_stat = STAT.find(([re]) => re.test(m[1]))[1];
      out.effect_amount = Number(m[3]);
      out.effect_units = [...new Set(links(m[2]).map(roleOf).filter(Boolean))].sort();
    } else if (/^Upgrades /.test(h.desc)) {
      out.effect_stat = 'convert'; out.effect_units = [roleOf(links(h.desc)[0])];
    } else if (/regain lost HP/i.test(h.desc)) {
      out.effect_stat = 'regen'; out.effect_units = ['ranger'];
    }
    out._evidence = { heading: h.line, description: h.desc, cost_row: h.row };
    return { title: src.page, wiki: out };
  }
  if (src.how === 'B') {
    const cols = hTables(page(src.page)).filter((c) => c.name === src.name);
    if (!cols.length) throw new Error(`column ${src.name} not found on ${src.page}`);
    const c = cols[0];
    const out = { label: c.name, at: roleOf(src.page), gold: c.gold, lumber: c.lumber || 0, oil: c.oil || 0, time_N: c.time };
    if (src.box) out.hotkey = infobox(page(src.box)).hotkey || null;
    if (/ to /.test(c.name) && id === 'paladin') { out.effect_stat = 'convert'; out.effect_units = ['knight']; }
    if (W.UPGRADES[id].spell) out.effect_stat = 'spell';
    out._evidence = { table_column: `${c.name}: gold ${c.gold}, lumber ${c.lumber || 0}, oil ${c.oil || 0}, time ${c.time}` };
    if (src.box) out._evidence.target_page = src.box;
    return { title: src.page, wiki: out };
  }
  const b = infobox(page(src.page));
  return {
    title: src.page,
    wiki: { at, gold: firstNum(b.gold) || 0, lumber: firstNum(b.lumber) || 0, oil: firstNum(b.oil) || 0, time_N: firstNum(b.buildtime), hotkey: b.hotkey || null,
      _evidence: { infobox: `gold=${b.gold} lumber=${b.lumber} buildtime=${b.buildtime} hotkey=${b.hotkey}` } },
  };
}
function wikiSpell(id) {
  const [title, name] = SPELL_SRC[id];
  const text = page(title);
  const line = spellLines(text)[name];
  if (line == null) throw new Error(`spell ${name} not on ${title}`);
  const out = { label: name };
  const ev = { spell_line: line };
  const mana = line.match(/costs?:?\s*(\d+)\s*(?:Mana|MP)/i);
  out.mana = mana ? Number(mana[1]) : null;
  out.mana_per = /per HP/i.test(line) ? 'hp' : /per Skeleton/i.test(line) ? 'wave' : mana ? null : null;
  const rng = line.match(/range:?\s*(\d+)/i);
  out.range = /unlimited range/i.test(line) ? 'unlimited' : rng ? Number(rng[1]) : null;
  const dur = line.match(/for (\d+) seconds/);
  out.dur_s = dur ? Number(dur[1]) : null;
  const dmg = line.match(/deals (\d+) [A-Za-z ]*Damage/i);
  out.dmg = dmg ? Number(dmg[1]) : null;
  // numbers given only in the page's Information bullets or on the summon's page
  const info = (re) => { const m = text.match(re); if (m) ev.information = (ev.information ? ev.information + ' | ' : '') + m[0]; return m; };
  if (id === 'fireball' && info(/dealing varying damage \(usually around (\d+)\)/)) out.dmg = { approx: 34 };
  if (id === 'death_coil') { const m = info(/Death Coil removes (\d+) Hit Points/); if (m) out.dmg = Number(m[1]); }
  if (id === 'runes' && info(/They last approximately two minutes/)) out.dur_s = { approx: 120, note: 'about two minutes' };
  if (id === 'eye_of_kilrogg') {
    const e = page('Eye of Kilrogg (Warcraft II)').match(/disappear after approximately (\d+) seconds on the default game speed/);
    if (e) { out.dur_s = { approx: Number(e[1]), note: 'default game speed' }; ev.eye_page = e[0]; }
    out.range = null; // the wiki gives no range for the Eye
  }
  out._evidence = ev;
  return { title, wiki: out };
}

// ---- build ----
const index = [];
const today = manifest.retrieved;
const meta = (t) => manifest.pages[t] || null;
function entry(kind, id, race, type_id, label, title, wiki, anchor = '') {
  const m = title ? meta(title) : null;
  const e = {
    kind, role_or_id: id, race, type_id, label,
    wiki_title: m ? title : null, url: m ? m.url + anchor : null, revid: m ? m.revid : null, retrieved: m ? m.retrieved : today,
    file: m ? 'docs/wiki/' + m.file : null,
    wiki: m ? wiki : null,
    data: dataFields(W, kind, id, race),
  };
  index.push(e);
}
for (const race of ['human', 'orc']) {
  const R = W.RACES[race];
  for (const role of Object.keys(W.UNITS)) {
    const t = UNIT_PAGES[role][RACE_IX[race]];
    entry('unit', role, race, R.units[role], R.labels[R.units[role]], t, wikiUnit(t));
  }
}
for (const race of ['human', 'orc']) {
  const R = W.RACES[race];
  for (const role of Object.keys(W.BUILDINGS)) {
    const t = BUILDING_PAGES[role][RACE_IX[race]];
    entry('building', role, race, R.buildings[role], R.labels[R.buildings[role]], t, wikiBuilding(t));
  }
}
for (const [id, g] of Object.entries(W.UPGRADES)) {
  for (const race of g.race ? [g.race] : ['human', 'orc']) {
    const { title, wiki } = wikiUpgrade(id, race);
    const lab = typeof g.label === 'object' ? g.label[race] : g.label;
    entry('upgrade', id, race, id, lab, title, wiki);
  }
}
for (const id of Object.keys(W.SPELLS)) {
  const { title, wiki } = wikiSpell(id);
  entry('spell', id, HUMAN_SPELLS.has(id) ? 'human' : 'orc', id, W.SPELLS[id].label, title, wiki, '#' + encodeURIComponent(wiki.label.replace(/ /g, '_')).replace(/%/g, '.'));
}
// Summon lifetimes live on the unit pages
for (const e of index.filter((x) => x.kind === 'unit' && (x.role_or_id === 'skeleton' || x.role_or_id === 'eye'))) {
  const text = page(e.wiki_title);
  const m = e.role_or_id === 'skeleton' ? text.match(/fall apart after approximately (\d+) minutes on the default game speed/) : text.match(/disappear after approximately (\d+) seconds on the default game speed/);
  if (m) { e.wiki.ttl_s = { approx: e.role_or_id === 'skeleton' ? Number(m[1]) * 60 : Number(m[1]), note: 'default game speed' }; e.wiki._evidence.ttl = m[0]; }
}
fs.writeFileSync(path.join(HERE, 'index.json'), JSON.stringify(index, null, 1) + '\n');
console.log('index.json:', index.length, 'objects,', new Set(index.map((e) => e.wiki_title).filter(Boolean)).size, 'distinct pages');
