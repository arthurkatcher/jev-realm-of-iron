# Warcraft II wiki mirror

A local copy of the Warcraft II part of [Warcraft Wiki](https://warcraft.wiki.gg) (warcraft.wiki.gg), kept as a
checkable source of truth for the clone. The per-object audit of data.js against it is in AUDIT.md.

## Licence and attribution

The text of every file in `pages/` comes from Warcraft Wiki and is licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) (the licence the wiki's API reports). Attribution:
the authors are the contributors of Warcraft Wiki; each page's source URL and revision id are in manifest.json, and
the full author list of a page is its history (`<url>?action=history`). If you redistribute these files or work
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

Refresh: `node docs/wiki/fetch_pages.mjs && node docs/wiki/make_docs.mjs && node docs/wiki/build_index.mjs && node docs/wiki/check.mjs`.

## Crawl rule

1. Seeds: every member (articles, templates, file description pages) of Category:Warcraft II and all of its
   subcategories, recursively (20 categories); plus namespace-0 title searches for
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
   the rejected link targets are listed in manifest.json (`rejected_link_targets`).
5. Politeness: one request at a time, 1 s apart, up to 50 titles per request, `maxlag=5`, retries with back-off.

## Completeness report (2026-09-26)

| Measure | Count |
|---|---|
| Categories walked | 20 |
| Seed titles (category + search) | 1429 |
| Seeds from categories | 1358 |
| Seeds from title search | 71 |
| Pages fetched and saved | 1522 |
| Articles (namespace 0) | 403 |
| File description pages | 1114 |
| Templates | 4 |
| Added via WC2 title of a link | 3 |
| Added via WC2 category of a link | 143 |
| Missing/invalid titles | 0 |
| Redirects resolved | 55 |
| Link targets rejected (not WC2) | 10747 |
| Crawl rounds | 3 |
| API requests | 444 |
| Retries | 0 |
| Failed requests after retries | 0 |
| Media files listed | 1114 |
| Media files downloaded | 0 |

Found vs fetched: every seed and every accepted link target was requested; no request failed after retries.

Removed 145 Warcraft III pages that the allpages prefix "Warcraft II" seed matched by mistake (filter fixed in fetch_pages.mjs).
Media binaries are not downloaded; their URL, size and sha1 are in manifest.json. Run fetch_pages.mjs with --media to download them into media/.
