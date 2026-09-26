#!/usr/bin/env node
// Compare data.js against the warcraft.wiki.gg values stored in index.json.
// Usage: node docs/wiki/check.mjs [--all] [--json]
//   default: print every field where data.js disagrees with the wiki, grouped by review status
//   --all:   also list mismatches already reviewed (decisions.json) in full detail (default shows them too, compact)
//   --json:  print the mismatch list as JSON
// data.js is re-read on every run (the `data` snapshot in index.json is ignored), so this can be re-run after edits.
// No dependencies. Exit code 1 when there are unreviewed mismatches or likely data.js errors.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

export function loadWC2(file = path.join(ROOT, 'data.js')) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  return ctx.window.WC2;
}

const num = (v) => (v === undefined || v === null ? null : v);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

// Fields from data.js, converted to the wiki's units: time_N = seconds * 5 (WC2 time units), durations in seconds.
export function dataFields(W, kind, id, race) {
  const R = W.RACES[race];
  if (kind === 'unit') {
    const u = { ...W.UNITS[id], ...((W.UNITS[id] || {})[race] || {}) };
    const armed = (u.dmg || 0) + (u.pierce || 0) > 0;
    const out = {
      label: R.labels[R.units[id]],
      gold: u.cost ? u.cost.gold || 0 : null, lumber: u.cost ? u.cost.lumber || 0 : null, oil: u.cost ? u.cost.oil || 0 : null,
      time_N: u.time != null ? r2(u.time * 5) : null,
      hp: u.hp, armor: u.armor, dmg: armed ? u.dmg : 0, pierce: armed ? u.pierce : 0, range: armed ? u.range : null,
      sight: u.sight, speed: u.speed, food: u.noFood || u.neutral ? 0 : 1,
      produced_at: u.at || null, mana: num(u.mana), hotkey: (R.hotkeys[id] || '').toUpperCase() || null,
    };
    if (u.summoned || u.ttl) out.ttl_s = u.ttl != null ? r2(u.ttl) : 'permanent';
    return out;
  }
  if (kind === 'building') {
    const b = W.BUILDINGS[id];
    const up = Object.values(W.UPGRADES).find((x) => x.becomes === id);
    let key = R.hotkeys[id];
    if (up) key = typeof up.key === 'object' ? up.key[race] : up.key;
    return {
      label: R.labels[R.buildings[id]],
      gold: b.cost.gold || 0, lumber: b.cost.lumber || 0, oil: b.cost.oil || 0, time_N: r2(b.time * 5),
      hp: b.hp, armor: b.armor, sight: b.sight, food: b.food || 0,
      dmg: b.range ? b.dmg : null, pierce: b.range ? b.pierce : null, range: num(b.range),
      hotkey: key ? key.toUpperCase() : null,
    };
  }
  if (kind === 'upgrade') {
    const g = W.UPGRADES[id];
    const lab = typeof g.label === 'object' ? g.label[race] : g.label;
    const key = typeof g.key === 'object' ? g.key[race] : g.key;
    if (g.becomes) {
      const b = W.BUILDINGS[g.becomes];
      return { label: lab, at: g.at, gold: b.cost.gold || 0, lumber: b.cost.lumber || 0, oil: b.cost.oil || 0, time_N: r2(b.time * 5), hotkey: key ? key.toUpperCase() : null };
    }
    const c = race === 'orc' && g.orcCost ? g.orcCost : g.cost;
    const out = { label: lab, at: g.at, gold: c.gold || 0, lumber: c.lumber || 0, oil: c.oil || 0, time_N: r2(g.time * 5), hotkey: key ? key.toUpperCase() : null };
    if (g.effect) {
      const stat = Object.keys(g.effect).find((k) => k !== 'units');
      out.effect_stat = stat; out.effect_amount = g.effect[stat]; out.effect_units = [...g.effect.units].sort();
    }
    if (g.convert) { out.effect_stat = 'convert'; out.effect_units = [g.convert.from]; }
    if (g.spell) out.effect_stat = 'spell';
    return out;
  }
  if (kind === 'spell') {
    const s = W.SPELLS[id];
    const out = {
      label: s.label,
      mana: s.mana ?? s.perHp ?? s.perWave ?? null,
      mana_per: s.perHp ? 'hp' : s.perWave ? 'wave' : 'cast',
      range: s.range >= 99 ? 'unlimited' : s.range,
      dur_s: s.dur != null ? r2(s.dur) : null,
      dmg: num(s.dmg),
    };
    if (s.summon === 'eye') out.dur_s = r2(W.UNITS.eye.ttl);
    return out;
  }
  throw new Error('unknown kind ' + kind);
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
// Returns true when the data value agrees with the wiki value.
export function agrees(field, wiki, data) {
  if (wiki && typeof wiki === 'object' && !Array.isArray(wiki) && 'approx' in wiki) {
    if (typeof data !== 'number') return false;
    return Math.abs(data - wiki.approx) <= Math.max(1, wiki.approx * 0.15);
  }
  if (Array.isArray(wiki)) {
    if (!Array.isArray(data)) return false;
    const a = [...new Set(wiki)].sort(), b = [...new Set(data)].sort();
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  if (typeof wiki === 'number') return typeof data === 'number' && Math.abs(wiki - data) < 0.01;
  if (data == null) return false;
  // labels: the wiki names both levels of an upgrade alike and names hall/tower upgrades after the target building
  if (field === 'label') { const n = (s) => norm(s).replace(/^upgradeto/, '').replace(/[0-9]$/, ''); return n(wiki) === n(data); }
  return String(wiki).toLowerCase() === String(data).toLowerCase();
}

const fmt = (v) => {
  if (v == null) return 'none';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object' && 'approx' in v) return '~' + v.approx + (v.note ? ' (' + v.note + ')' : '');
  return String(v);
};

export function findMismatches(index, W, decisions = []) {
  const out = [];
  for (const e of index) {
    if (!e.wiki) continue;
    let d;
    try { d = dataFields(W, e.kind, e.role_or_id, e.race); } catch (err) { out.push({ e, field: '*', wiki: 'object', data: 'missing in data.js: ' + err.message, status: 'error' }); continue; }
    for (const [field, wv] of Object.entries(e.wiki)) {
      if (wv == null || field.startsWith('_')) continue;
      if (!(field in d)) continue; // wiki-only information (notes, names)
      if (agrees(field, wv, d[field])) continue;
      const key = `${e.kind}:${e.role_or_id}:${e.race}:${field}`;
      const dec = decisions.find((x) => new RegExp('^' + x.key.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^:]*') + '$').test(key));
      out.push({ key, e, field, wiki: wv, data: d[field], status: dec ? dec.status : 'unreviewed', decision: dec || null });
    }
  }
  return out;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const index = JSON.parse(fs.readFileSync(path.join(HERE, 'index.json'), 'utf8'));
  const decisions = fs.existsSync(path.join(HERE, 'decisions.json')) ? JSON.parse(fs.readFileSync(path.join(HERE, 'decisions.json'), 'utf8')) : [];
  const W = loadWC2();
  const mm = findMismatches(index, W, decisions);
  if (args.has('--json')) {
    console.log(JSON.stringify(mm.map(({ e, ...m }) => ({ ...m, object: `${e.label} (${e.kind} ${e.role_or_id}, ${e.race})`, wiki_title: e.wiki_title })), null, 1));
  } else {
    const order = ['error', 'unreviewed', 'spec', 'spec-implicit', 'wiki'];
    const names = { error: 'LIKELY data.js ERRORS', unreviewed: 'UNREVIEWED (new since last audit)', spec: 'Resolved on purpose by docs/spec (explicit CONFLICT)', 'spec-implicit': 'Data follows the spec source; wiki differs (not flagged in spec)', wiki: 'Wiki value not comparable / wiki known wrong' };
    const mapped = index.filter((e) => e.wiki_title).length;
    console.log(`index.json: ${index.length} objects, ${mapped} with a wiki page; ${mm.length} field mismatches\n`);
    for (const st of order) {
      const rows = mm.filter((m) => m.status === st);
      if (!rows.length) continue;
      console.log(`== ${names[st]}: ${rows.length}`);
      for (const m of rows) {
        const why = m.decision && (args.has('--all') || st === 'error') ? `  [${m.decision.note}]` : '';
        console.log(`  ${m.e.label.padEnd(26)} ${(m.e.kind + ' ' + m.e.role_or_id + '/' + m.e.race).padEnd(30)} ${m.field.padEnd(13)} data.js=${fmt(m.data).padEnd(12)} wiki=${fmt(m.wiki)}${why}`);
      }
      console.log('');
    }
    const missing = index.filter((e) => !e.wiki_title);
    if (missing.length) console.log('No WC2 wiki page: ' + missing.map((e) => `${e.kind} ${e.role_or_id}/${e.race}`).join(', '));
  }
  process.exitCode = mm.some((m) => m.status === 'error' || m.status === 'unreviewed') ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
