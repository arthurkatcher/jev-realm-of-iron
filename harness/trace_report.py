#!/usr/bin/env python3
"""Full traces of the LLM player's games, from harness/runs/<ts>/log.jsonl.

Writes, per run: trace.md (settings, result, spend by model, every plan in full, decision statistics, a timeline per
game minute) and turns.csv (one row per decision turn). Also writes runs/OVERVIEW.md, a table of all runs.
Token counts are not in the logs (only the cost OpenRouter reported per call), so none are shown.

Usage: python harness/trace_report.py [runs_dir]
"""
import csv, json, sys
from collections import Counter
from pathlib import Path

RUNS = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent / 'runs'


def mmss(t): t = int(t or 0); return f'{t // 60}:{t % 60:02d}'


def one(run):
    L = [json.loads(l) for l in open(run / 'log.jsonl') if l.strip()]
    cfg = next((x for x in L if x['kind'] == 'config'), {})
    plans = [x for x in L if x['kind'] == 'plan']
    turns = [x for x in L if x['kind'] == 'turn']
    summ = next((x for x in L if x['kind'] == 'summary'), None)
    if summ is None and (run / 'summary.json').exists(): summ = json.loads((run / 'summary.json').read_text())
    summ = summ or {}
    pc = sum(x.get('cost') or 0 for x in plans); dc = sum(x.get('cost') or 0 for x in turns)
    last = turns[-1] if turns else {}
    # two log formats: v1 turns carry answers{production, army}; v2 turns carry one choice plus offered/masked
    for x in turns:
        if 'answers' not in x and 'choice' in x:
            x['answers'] = {'production': {'choice': x['choice'], 'conf': x.get('conf'), 'p': x.get('p') or ({x['choice']: 1} if x.get('forced') else {})}}
            x['results'] = {'production': x.get('result')}; x['n_legal'] = len(x.get('offered') or [])
    prod = Counter((x['answers'].get('production') or {}).get('choice') for x in turns if x.get('answers'))
    army = Counter((x['answers'].get('army') or {}).get('choice') for x in turns if x.get('answers') and 'army' in x['answers'])
    forced = sum(1 for x in turns if x.get('n_legal', 0) <= 1)
    single = sum(1 for x in turns if len(((x.get('answers') or {}).get('production') or {}).get('p') or {}) == 1)
    overrides = sum(1 for x in turns if ((x.get('answers') or {}).get('production') or {}).get('note'))
    fails = [(x['t'], q, r) for x in turns for q, r in (x.get('results') or {}).items() if isinstance(r, str) and ('failed' in r or r.startswith('illegal'))]
    confs = [((x.get('answers') or {}).get('production') or {}).get('conf') for x in turns]
    confs = [c for c in confs if isinstance(c, (int, float))]
    secs_d = [x.get('secs') or 0 for x in turns]; secs_p = [x.get('secs') or 0 for x in plans]
    result = summ.get('winner') or ('unfinished' if not summ else '?')
    fin = summ.get('final') or {}
    row = {'run': run.name, 'planner': cfg.get('planner'), 'decider': cfg.get('decider'), 'race': cfg.get('race'), 'seed': cfg.get('seed'),
           'map': f"{cfg.get('size')} {cfg.get('map')}", 'result': result, 'error': (summ.get('error') or '')[:90], 'game_time': mmss(last.get('t')),
           'plans': len(plans), 'turns': len(turns), 'planner_usd': pc, 'decider_usd': dc, 'total_usd': pc + dc,
           'units': f"{(fin.get('player') or {}).get('units', '?')} vs {(fin.get('enemy') or {}).get('units', '?')}",
           'buildings': f"{(fin.get('player') or {}).get('buildings', '?')} vs {(fin.get('enemy') or {}).get('buildings', '?')}"}

    md = [f"# Trace {run.name}", '',
          f"- Planner: `{cfg.get('planner')}` (effort {cfg.get('effort')}), every {cfg.get('plan_every')} s and on events",
          f"- Decider: `{cfg.get('decider')}`, every {cfg.get('decide_every')} s, mode {cfg.get('mode')}",
          f"- Game: {cfg.get('race')}, seed {cfg.get('seed')}, map {cfg.get('size')} {cfg.get('map')}, limit {cfg.get('minutes')} min, budget ${cfg.get('budget')}",
          f"- Result: **{result}** at {row['game_time']} game time; units {row['units']}, buildings {row['buildings']} (ours vs theirs)"]
    if summ.get('error'): md.append(f"- Stopped by: `{summ['error'][:200]}`")
    md += ['', '## Spend', '', '| Part | Calls | USD | Per call | Avg latency |', '|---|---|---|---|---|',
           f"| Planner | {len(plans)} | {pc:.4f} | {pc / max(1, len(plans)):.4f} | {sum(secs_p) / max(1, len(secs_p)):.1f} s |",
           f"| Decider | {len(turns)} | {dc:.4f} | {dc / max(1, len(turns)):.6f} | {sum(secs_d) / max(1, len(secs_d)):.2f} s |",
           f"| Total | {len(plans) + len(turns)} | {pc + dc:.4f} | | |", '']
    md += ['## Decisions', '',
           f"- Production answers: " + ', '.join(f"`{k}` {v}" for k, v in prod.most_common(12)),
           f"- Army answers: " + (', '.join(f"`{k}` {v}" for k, v in army.most_common()) or 'none (no army options yet)'),
           f"- Turns with at most one legal action (the answer was forced): {forced} of {len(turns)}",
           f"- Turns where the production question had a single option: {single}",
           f"- Harness overrides of a 'wait' (bank over 1500 gold): {overrides}",
           f"- Mean production confidence: {sum(confs) / len(confs):.2f}" if confs else '- Confidence: not reported',
           f"- Failed or illegal actions: {len(fails)}" + (' — ' + '; '.join(f"{mmss(t)} {r}" for t, q, r in fails[:8]) if fails else ''), '']
    md += ['## Plans (in full)', '']
    for x in plans:
        p = x.get('plan') or {}
        md += [f"### {mmss(x['t'])} — {x.get('reason')} (${x.get('cost') or 0:.4f}, {x.get('secs', 0)} s)", '',
               f"- Strategy: {p.get('strategy')}",
               f"- Priorities: " + ', '.join(f"`{k}`" for k in (p.get('priorities') or [])),
               f"- Attack at: {p.get('attack_when_army_at_least')}; workers target: {p.get('workers_target')}; save for: {p.get('save_for')}; stance: {p.get('stance')}", '']
    md += ['## Timeline (one line per game minute)', '', '| Time | Gold | Lumber | Food | Workers | Army | Actions this minute |', '|---|---|---|---|---|---|---|']
    by_min = {}
    for x in turns: by_min.setdefault(int(x['t']) // 60, []).append(x)
    for m in sorted(by_min):
        xs = by_min[m]; e = xs[-1]
        did = Counter(r for x in xs for q, r in (x.get('results') or {}).items() if r not in ('wait', 'hold', None))
        acts = ', '.join(f"{k.split(' ')[0]}×{v}" if v > 1 else k.split(' ')[0] for k, v in did.most_common(5)) or 'wait/hold'
        if len(acts) > 58: acts = acts[:55] + '...'
        md.append(f"| {m}:00 | {e['gold']} | {e['lumber']} | {e['food']} | {e['workers']} | {e['army']} | {acts} |")
    (run / 'trace.md').write_text('\n'.join(md) + '\n')
    with open(run / 'turns.csv', 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['t', 'gold', 'lumber', 'food', 'workers', 'army', 'n_legal', 'production', 'prod_conf', 'army_q', 'results', 'cost_usd', 'secs'])
        for x in turns:
            a = x.get('answers') or {}
            w.writerow([x['t'], x['gold'], x['lumber'], x['food'], x['workers'], x['army'], x.get('n_legal'), (a.get('production') or {}).get('choice'),
                        (a.get('production') or {}).get('conf'), (a.get('army') or {}).get('choice'), json.dumps(x.get('results')), x.get('cost'), x.get('secs')])
    return row


rows = [one(r) for r in sorted(RUNS.iterdir()) if (r / 'log.jsonl').exists()]
tot = sum(r['total_usd'] for r in rows)
ov = ['# LLM player runs', '', f"Total logged spend: ${tot:.4f}", '',
      '| Run | Planner | Result | Game time | Units (us/them) | Plans | Turns | USD |', '|---|---|---|---|---|---|---|---|']
for r in rows:
    ov.append(f"| {r['run']} | {(r['planner'] or '').split('/')[-1]} | {r['result']} | {r['game_time']} | {r['units']} | {r['plans']} | {r['turns']} | {r['total_usd']:.4f} |")
(RUNS / 'OVERVIEW.md').write_text('\n'.join(ov) + '\n')
print('\n'.join(ov))
