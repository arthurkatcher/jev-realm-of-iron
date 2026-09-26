#!/usr/bin/env node
// Mirror the Warcraft II part of warcraft.wiki.gg into docs/wiki/pages/ (raw wikitext), with manifest.json and INDEX.md.
// No dependencies (Node 18+). Polite: one API request at a time, ~1 s apart, up to 50 titles per request.
//
// Crawl (the stopping rule is also written to README.md):
//   1. Seeds: every member (articles, templates, file pages) of Category:Warcraft II and all its subcategories,
//      recursively; plus title searches for "Warcraft II", "WC2", "WC2x", "Tides of Darkness", "Beyond the Dark Portal",
//      "Battle.net Edition", "Remastered" (namespace 0) and allpages with prefix "Warcraft II".
//   2. Fetch each page's wikitext, categories, links and templates (API, so template-generated links count).
//   3. For every link target not yet seen: take it if its title is WC2-disambiguated ("(Warcraft II)", "(WC2 ...)",
//      "Warcraft II..." etc.), or if one of its categories is a WC2 category (name contains "Warcraft II", "WC2",
//      "Tides of Darkness" or "Beyond the Dark Portal"). Taken pages are fetched and their links followed in turn.
//   4. Stop when a round adds no new page. Templates are taken only if their title names WC2.
// Media: file description pages are saved like any page and their media URL/sha1/size go in manifest.json.
//   Binaries are not downloaded unless --media is given (then into docs/wiki/media/, ~1 s apart).
//
// Usage: node docs/wiki/fetch_pages.mjs [--media]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'pages');
const UA = 'wc2-clone-audit/1.0 (local reference mirror; github.com/arthurkatcher/jev-realm-of-iron)';
const API = 'https://warcraft.wiki.gg/api.php';
const ROOT_CAT = 'Category:Warcraft II';
const WANT_MEDIA = process.argv.includes('--media');
fs.mkdirSync(OUT, { recursive: true });

const stats = { requests: 0, retries: 0, failures: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(params) {
  const body = new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params });
  for (let i = 0; i < 6; i++) {
    stats.requests++;
    try {
      const r = await fetch(API, { method: 'POST', body, headers: { 'User-Agent': UA } });
      const j = r.ok ? await r.json() : null;
      await sleep(1000);
      if (j && !j.error) return j;
      console.log('  retry: HTTP', r.status, j && j.error && j.error.code);
    } catch (e) { console.log('  retry: fetch error', e.message); await sleep(1000); }
    stats.retries++;
    await sleep(3000 * (i + 1));
  }
  stats.failures.push(params.titles || params.cmtitle || params.srsearch || JSON.stringify(params).slice(0, 120));
  return null;
}
// generic continuation for list= queries
async function listAll(params, key) {
  const out = [];
  let cont = {};
  for (;;) {
    const j = await api({ ...params, ...cont });
    if (!j) break;
    out.push(...j.query[key]);
    if (!j.continue) break;
    cont = j.continue;
  }
  return out;
}

export const slug = (t) => t.toLowerCase().replace(/ /g, '_').replace(/\//g, '%2F');
const pageUrl = (t) => 'https://warcraft.wiki.gg/wiki/' + encodeURIComponent(t.replace(/ /g, '_')).replace(/%3A/g, ':').replace(/%2C/g, ',').replace(/%2F/g, '/');
const WC2_TITLE = /\((Warcraft II|WC2[^)]*)\)$|^Warcraft II(?!I)\b|Warcraft II:|Tides of Darkness|Beyond the Dark Portal|\bWC2x?\b/;
const WC2_CAT = /Warcraft II(?!I)|\bWC2|Tides of Darkness|Beyond the Dark Portal/;
const now = new Date().toISOString();

// ---- 1. seeds ----
const cats = new Map([[ROOT_CAT, { depth: 0, parent: null }]]);
const seeds = new Map(); // title -> {source, via}
const queue = [ROOT_CAT];
while (queue.length) {
  const cat = queue.shift();
  const members = await listAll({ action: 'query', list: 'categorymembers', cmtitle: cat, cmlimit: '500', cmtype: 'page|subcat|file', cmprop: 'title|ns' }, 'categorymembers');
  let n = 0;
  for (const m of members) {
    if (m.ns === 14) { if (!cats.has(m.title)) { cats.set(m.title, { depth: cats.get(cat).depth + 1, parent: cat }); queue.push(m.title); } continue; }
    if (!seeds.has(m.title)) seeds.set(m.title, { source: 'category', via: cat.replace(/^Category:/, '') });
    n++;
  }
  console.log(`category ${cat}: ${n} pages/files`);
}
const searches = ['intitle:"Warcraft II"', 'intitle:WC2', 'intitle:WC2x', 'intitle:"Tides of Darkness"', 'intitle:"Beyond the Dark Portal"', 'intitle:"Battle.net Edition"', 'intitle:"Warcraft II Remastered"'];
for (const q of searches) {
  const res = await listAll({ action: 'query', list: 'search', srsearch: q, srnamespace: '0', srlimit: '500', srwhat: 'text', srprop: '' }, 'search');
  let n = 0;
  for (const r of res) if (WC2_TITLE.test(r.title) && !seeds.has(r.title)) { seeds.set(r.title, { source: 'search', via: q }); n++; }
  console.log(`search ${q}: ${res.length} hits, ${n} new`);
}
for (const p of await listAll({ action: 'query', list: 'allpages', apprefix: 'Warcraft II', aplimit: '500' }, 'allpages')) {
  if (WC2_TITLE.test(p.title) && !seeds.has(p.title)) seeds.set(p.title, { source: 'search', via: 'allpages prefix "Warcraft II"' });
}
console.log('seeds:', seeds.size);

// ---- 2/3. fetch + follow links ----
const pages = {}; // title -> manifest entry
const redirects = {};
const known = new Set(); // titles fetched, queued or rejected
const rejected = {}; // title -> reason (link targets that are not WC2)
const missing = [];
let todo = [...seeds.keys()];
todo.forEach((t) => known.add(t));
const origin = new Map(seeds);

async function fetchBatch(titles) {
  const acc = {};
  let cont = {};
  for (;;) {
    const j = await api({
      action: 'query', titles: titles.join('|'), redirects: '1',
      prop: 'revisions|categories|links|templates|info|imageinfo', rvprop: 'content|ids|timestamp|sha1', rvslots: 'main',
      cllimit: 'max', clshow: '!hidden', pllimit: 'max', tllimit: 'max', iiprop: 'url|size|sha1|mime', ...cont,
    });
    if (!j) return null;
    for (const r of j.query.redirects || []) { redirects[r.from] = r.to; known.add(r.to); }
    for (const p of j.query.pages) {
      const a = (acc[p.title] ||= { title: p.title, ns: p.ns, pageid: p.pageid, missing: !!p.missing || !!p.invalid, cats: new Set(), links: new Set(), templates: new Set() });
      if (p.revisions && !a.rev) a.rev = p.revisions[0];
      (p.categories || []).forEach((c) => a.cats.add(c.title.replace(/^Category:/, '')));
      (p.links || []).forEach((l) => a.links.add((l.ns === 0 ? '' : '#' + l.ns + '#') + l.title));
      (p.templates || []).forEach((t) => a.templates.add(t.title));
      if (p.imageinfo && !a.media) a.media = p.imageinfo[0];
    }
    if (!j.continue) break;
    cont = j.continue;
  }
  // pages whose content was deferred by rvcontinue come back in later continuation responses and are merged above
  return Object.values(acc);
}

let round = 0;
while (todo.length) {
  round++;
  console.log(`round ${round}: fetching ${todo.length}`);
  const newLinks = new Map(); // title -> from
  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const got = await fetchBatch(chunk);
    if (!got) continue;
    for (const p of got) {
      known.add(p.title);
      if (p.missing || !p.rev) { missing.push(p.title); continue; }
      const text = p.rev.slots.main.content ?? '';
      const s = slug(p.title);
      fs.writeFileSync(path.join(OUT, s + '.wiki'), text);
      const o = origin.get(p.title) || [...origin.entries()].find(([k]) => redirects[k] === p.title)?.[1] || { source: 'link' };
      const links = [...p.links].filter((l) => !l.startsWith('#'));
      pages[p.title] = {
        file: `pages/${s}.wiki`, url: pageUrl(p.title), ns: p.ns, pageid: p.pageid, revid: p.rev.revid, rev_timestamp: p.rev.timestamp,
        fetched_at: now, retrieved: now.slice(0, 10), sha256: crypto.createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text),
        source: o.source, via: o.via || null, categories: [...p.cats].sort(), templates: [...p.templates].sort(), links: links.sort(),
      };
      if (p.media) pages[p.title].media = { url: p.media.url, size: p.media.size, sha1: p.media.sha1, mime: p.media.mime };
      for (const l of links) if (!known.has(l) && !newLinks.has(l)) newLinks.set(l, p.title);
      for (const t of p.templates) if (!known.has(t) && WC2_TITLE.test(t.replace(/^Template:/, '')) && !newLinks.has(t)) newLinks.set(t, p.title);
    }
    console.log(`  saved ${Object.keys(pages).length}`);
  }
  // decide which new link targets are WC2 content
  todo = [];
  const unsure = [];
  for (const [t, from] of newLinks) {
    known.add(t);
    if (WC2_TITLE.test(t)) { todo.push(t); origin.set(t, { source: 'link-title', via: from }); } else unsure.push([t, from]);
  }
  for (let i = 0; i < unsure.length; i += 50) {
    const chunk = unsure.slice(i, i + 50);
    const catsOf = {};
    let cont = {};
    for (;;) {
      const j = await api({ action: 'query', titles: chunk.map((x) => x[0]).join('|'), redirects: '1', prop: 'categories', cllimit: 'max', clshow: '!hidden', ...cont });
      if (!j) break;
      const red = Object.fromEntries((j.query.redirects || []).map((r) => [r.to, r.from]));
      for (const p of j.query.pages) {
        const k = red[p.title] || p.title;
        (catsOf[k] ||= { target: p.title, cats: [] }).cats.push(...(p.categories || []).map((c) => c.title.replace(/^Category:/, '')));
      }
      if (!j.continue) break;
      cont = j.continue;
    }
    for (const [t, from] of chunk) {
      const c = catsOf[t];
      const hit = c && c.cats.find((x) => WC2_CAT.test(x));
      if (hit && !pages[c.target] && !todo.includes(c.target)) { todo.push(c.target); known.add(c.target); origin.set(c.target, { source: 'link-category', via: `${from} [${hit}]` }); }
      else if (!hit) rejected[t] = from;
    }
  }
  console.log(`  round ${round}: ${todo.length} new WC2 pages from links, ${unsure.length} link targets checked by category`);
}

// ---- media (optional) ----
if (WANT_MEDIA) {
  const MD = path.join(HERE, 'media');
  fs.mkdirSync(MD, { recursive: true });
  for (const [t, p] of Object.entries(pages)) {
    if (!p.media) continue;
    const f = path.join(MD, slug(t.replace(/^File:/, '')));
    if (fs.existsSync(f) && fs.statSync(f).size === p.media.size) { p.media.local = 'media/' + path.basename(f); continue; }
    try {
      const r = await fetch(p.media.url, { headers: { 'User-Agent': UA } });
      if (r.ok) { fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); p.media.local = 'media/' + path.basename(f); }
      else stats.failures.push('media ' + t + ' HTTP ' + r.status);
    } catch (e) { stats.failures.push('media ' + t + ' ' + e.message); }
    await sleep(1000);
  }
}

// ---- outputs ----
const byNs = {};
for (const p of Object.values(pages)) byNs[p.ns] = (byNs[p.ns] || 0) + 1;
const report = {
  seeds: seeds.size, seeds_by_source: [...seeds.values()].reduce((a, s) => ((a[s.source] = (a[s.source] || 0) + 1), a), {}),
  fetched: Object.keys(pages).length, fetched_by_namespace: byNs, missing, redirects: Object.keys(redirects).length,
  link_targets_rejected: Object.keys(rejected).length, requests: stats.requests, retries: stats.retries, failures: stats.failures, rounds: round,
};
const manifest = {
  source: 'https://warcraft.wiki.gg', license: 'CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0), per the wiki siteinfo; see README.md', generated_at: now, retrieved: now.slice(0, 10),
  root: ROOT_CAT, categories: Object.fromEntries(cats), report, redirects, rejected_link_targets: rejected, pages,
};
fs.writeFileSync(path.join(HERE, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(JSON.stringify(report, null, 1));
