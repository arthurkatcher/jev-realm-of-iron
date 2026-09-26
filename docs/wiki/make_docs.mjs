#!/usr/bin/env node
// Write docs/wiki/INDEX.md (every mirrored page: title -> file, category, revid) and docs/wiki/README.md
// (licence, attribution, crawl rule, completeness report) from manifest.json. Offline.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const man = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
man.license = 'CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0), per the wiki siteinfo; see README.md';
fs.writeFileSync(path.join(HERE, 'manifest.json'), JSON.stringify(man, null, 1) + '\n');

const cut = (s, n = 60) => (s.length <= n ? s : s.slice(0, n - 3) + '...');
const esc = (s) => s.replace(/\|/g, '\\|');
const NS = { 0: 'Articles', 6: 'File description pages', 10: 'Templates', 14: 'Categories' };
const pages = Object.entries(man.pages);
// primary category: the WC2 crawl category it came from, else its first WC2 category, else its first category
const wc2 = /Warcraft II(?!I)|\bWC2|Tides of Darkness|Beyond the Dark Portal/;
const primary = ([, p]) => (p.source === 'category' && p.via) || p.categories.find((c) => wc2.test(c)) || p.categories[0] || '(none)';
const groups = {};
for (const e of pages) {
  const g = e[1].ns === 0 ? primary(e) : NS[e[1].ns] || 'Namespace ' + e[1].ns;
  (groups[g] ||= []).push(e);
}
const gnames = Object.keys(groups).sort((a, b) => (a.startsWith('File') || a.startsWith('Template')) - (b.startsWith('File') || b.startsWith('Template')) || a.localeCompare(b));
let md = `# Warcraft II wiki mirror: index\n\nEvery page mirrored from [warcraft.wiki.gg](https://warcraft.wiki.gg) into \`pages/\`, grouped by its main\ncategory. ${pages.length} pages, retrieved ${man.retrieved}. Text is CC BY-SA 4.0; see README.md for attribution.\nFull metadata (url, revid, sha256, all categories, links) is in manifest.json.\n\n`;
md += '## Groups\n\n' + gnames.map((g) => `- ${g} (${groups[g].length})`).join('\n') + '\n';
for (const g of gnames) {
  md += `\n## ${g}\n\n| Title | File | Revid |\n|---|---|---|\n`;
  for (const [t, p] of groups[g].sort((a, b) => a[0].localeCompare(b[0]))) {
    md += `| ${esc(cut(t))} | [wiki](${encodeURI(p.file)}) | ${p.revid} |\n`;
  }
}
fs.writeFileSync(path.join(HERE, 'INDEX.md'), md);

const r = man.report;
const bySrc = pages.reduce((a, [, p]) => ((a[p.source] = (a[p.source] || 0) + 1), a), {});
const media = pages.filter(([, p]) => p.media).length;
const localMedia = pages.filter(([, p]) => p.media && p.media.local).length;
const readme = `# Warcraft II wiki mirror

A local copy of the Warcraft II part of [Warcraft Wiki](https://warcraft.wiki.gg) (warcraft.wiki.gg), kept as a
checkable source of truth for the clone. The per-object audit of data.js against it is in AUDIT.md.

## Licence and attribution

The text of every file in \`pages/\` comes from Warcraft Wiki and is licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) (the licence the wiki's API reports). Attribution:
the authors are the contributors of Warcraft Wiki; each page's source URL and revision id are in manifest.json, and
the full author list of a page is its history (\`<url>?action=history\`). If you redistribute these files or work
derived from them, keep this attribution, link the licence, say what you changed, and share it under the same
licence. Media files (images, sounds) are not covered by the wiki's text licence; most are Blizzard Entertainment
property. Warcraft is a trademark of Blizzard Entertainment; this mirror is not affiliated with Blizzard or the wiki.

## Files

| File | Contents |
|---|---|
| pages/<slug>.wiki | Raw wikitext; slug = lowercase title, spaces to _ |
| manifest.json | Per page: url, revid, fetched_at, sha256, categories, links |
| INDEX.md | Title to file, main category, revid |
| index.json | Every data.js object mapped to its page, wiki vs data fields |
| check.mjs | Re-runnable data.js vs wiki check |
| decisions.json | Review status of known mismatches |
| AUDIT.md | Mismatch report |
| fetch_pages.mjs | Re-runs the crawl (overwrites pages/ and manifest.json) |
| build_index.mjs | Rebuilds index.json from pages/ |
| make_docs.mjs | Rebuilds INDEX.md and this README |

Refresh: \`node docs/wiki/fetch_pages.mjs && node docs/wiki/make_docs.mjs && node docs/wiki/build_index.mjs && node docs/wiki/check.mjs\`.

## Crawl rule

1. Seeds: every member (articles, templates, file description pages) of Category:Warcraft II and all of its
   subcategories, recursively (${Object.keys(man.categories).length} categories); plus namespace-0 title searches for
   "Warcraft II", "WC2", "WC2x", "Tides of Darkness", "Beyond the Dark Portal", "Battle.net Edition" and
   "Warcraft II Remastered" (hits kept only when the title itself names WC2), and all pages whose title starts with
   "Warcraft II".
2. For every fetched page the API returns its wikitext, categories, links (including links made by templates) and
   templates.
3. A link target not yet seen is taken when its title marks it as WC2 (e.g. "(Warcraft II)", "(WC2 Human)",
   "Warcraft II: ...", "Tides of Darkness", "Beyond the Dark Portal") or when one of its visible categories does
   (name contains "Warcraft II" but not "Warcraft III", "WC2", "Tides of Darkness" or "Beyond the Dark Portal").
   Taken pages are fetched and their links followed the same way. Templates are taken only when their title names WC2.
4. The crawl stops when a round adds no new page. Everything else (general lore, WoW, Warcraft III pages) is left out;
   the rejected link targets are listed in manifest.json (\`rejected_link_targets\`).
5. Politeness: one request at a time, 1 s apart, up to 50 titles per request, \`maxlag=5\`, retries with back-off.

## Completeness report (${man.retrieved})

| Measure | Count |
|---|---|
| Categories walked | ${Object.keys(man.categories).length} |
| Seed titles (category + search) | ${r.seeds} |
| Seeds from categories | ${r.seeds_by_source.category || 0} |
| Seeds from title search | ${r.seeds_by_source.search || 0} |
| Pages fetched and saved | ${r.fetched} |
| Articles (namespace 0) | ${r.fetched_by_namespace[0] || 0} |
| File description pages | ${r.fetched_by_namespace[6] || 0} |
| Templates | ${r.fetched_by_namespace[10] || 0} |
| Added via WC2 title of a link | ${bySrc['link-title'] || 0} |
| Added via WC2 category of a link | ${bySrc['link-category'] || 0} |
| Missing/invalid titles | ${r.missing.length} |
| Redirects resolved | ${r.redirects} |
| Link targets rejected (not WC2) | ${r.link_targets_rejected} |
| Crawl rounds | ${r.rounds} |
| API requests | ${r.requests} |
| Retries | ${r.retries} |
| Failed requests after retries | ${r.failures.length} |
| Media files listed | ${media} |
| Media files downloaded | ${localMedia} |

Found vs fetched: every seed and every accepted link target was requested; ${r.failures.length ? 'the failures are listed in manifest.json (report.failures).' : 'no request failed after retries.'}
${r.missing.length ? 'Titles that do not exist on the wiki (dead links or seeds): ' + r.missing.slice(0, 30).join(', ') + (r.missing.length > 30 ? ', ...' : '') + '.' : ''}
${r.pruned_note ? r.pruned_note + '\n' : ''}Media binaries are ${localMedia ? 'in media/' : 'not downloaded; their URL, size and sha1 are in manifest.json. Run fetch_pages.mjs with --media to download them into media/'}.
`;
fs.writeFileSync(path.join(HERE, 'README.md'), readme);
console.log('INDEX.md groups', gnames.length, 'pages', pages.length);
