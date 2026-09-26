# LLM player harness: analysis (2026-09-26)

What the Jev + Astra harness (`harness/llm_player.py`) sends to the models, what they can control, what the first
ten games cost and showed, how it compares with the StarCraft Jev projects, and what changed after this review.

## 1. What the models see

Measured on a local game (seed 3, 64 strait), serialised exactly as the harness sends it. Token counts are
characters / 4, so they are estimates.

| Part of an Astra (planner) call | Chars | ~Tokens | Changes per call? |
|---|---|---|---|
| Rules digest + plan schema (system) | 2,800 | 700 | no |
| Action vocabulary (v1: in the user message) | 2,000 | 500 | no |
| Observation | 550 to 1,550 | 140 to 390 | yes |
| Legal actions, previous plan, history, events | 1,200 | 300 | yes |
| Total | 6,700 to 8,000 | 1,700 to 2,000 | |

The observation (`__game.observe()`, fog-filtered):

- Economy: time, gold, lumber, oil, food, the gold/wood/idle split of the workers.
- Own forces: army counts by type, clusters within 6 tiles (position, size, HP %, distance from home, orders), ships.
- Base: finished buildings by type, what is training or researching, damaged buildings, upgrades.
- Map: home, the enemy start (from symmetry, a known assist), map size, visible gold mines with gold left.
- Enemy: clusters visible right now, remembered buildings (no timestamps in v1), "under attack" (by what, where).
- Score: kills, losses, buildings razed.

A Jev call carried the same observation plus the plan and the last 8 actions: about 700 to 900 tokens.

### What was missing (v1)

- **Enemy memory.** Only units visible this second; the planner was blind between contacts and never scouted.
- **Costs and prerequisites.** The vocabulary gave each key's name only, so plans asked for things that could not be
  bought yet and never budgeted.
- **Counts including work in progress.** "Buildings" counted finished ones only, so goals could not be checked.
- **Outcomes.** A failed action was not reported back; the same failing action was offered again every turn.
- **Map geometry.** No chokes or expansion sites, and only mines already seen (the `expand` macro finds sites itself).

## 2. What the models can control

| Layer | v1 control | Who does it |
|---|---|---|
| Unit training | one unit per decision | Jev (top 3 plan items) |
| Workers | trained to the plan's target | harness, automatic |
| Buildings | type only; the site is found | Jev, placed by the game |
| Research / hall tiers | one per decision | Jev |
| Army | the whole army at once | Jev + harness auto-attack |
| Individual units | none | game (native AI helpers) |
| Scouting, retreat, spells | none | not available |
| Gathering split, idle workers, farms-in-a-pinch, repair | none | game, same code as the native AI |

So v1 was a **macro** player: the army moved as one block (attack the base, attack the nearest enemy, go home). No
unit was ever controlled individually. That matches JEV-Star's macro mode, but there Jev decides once per second over
every legal action. Ours decided once per 5 game-seconds over at most three items, and the harness made the
attack decisions itself.

## 3. What the ten games cost and showed

The spend in our logs is $3.0308. The key's own counter says $3.0308 too. The full per-game traces are in
`harness/runs/<run>/trace.md` and `turns.csv`, with the index in `harness/runs/OVERVIEW.md`
(`python harness/trace_report.py` rebuilds them).

| Run | Result | Game time | Units (us/them) | USD |
|---|---|---|---|---|
| 110758 (Jev alone) | timeout (test) | 3:00 | 17 vs 11 | 0.0015 |
| 110843 | timeout (test) | 2:00 | 4 vs 9 | 0.0453 |
| 110942 | timeout (test) | 3:00 | 10 vs 11 | 0.1068 |
| 111041 | timeout | 45:00 | 20 vs 60 | 1.5785 |
| 112344 | lost | 11:45 | 0 vs 24 | 0.3949 |
| 112737 | lost | 14:05 | 0 vs 23 | 0.3708 |
| 113141 | stopped, HTTP 520 | 7:40 | 25 vs 21 | 0.1619 |
| 113415 | stopped, key limit | 16:50 | 48 vs 36 | 0.3711 |

Where the money went: **Astra was 97% of it.** A plan cost $0.026 to $0.031, took about 4 s, and came every 60 to
90 s or on an event. A Jev decision cost $0.00004 to $0.00006 and took about 0.9 s.

In the best game (113415):

- 162 of 203 production answers were **wait**; 136 of those turns had "wait" as the only option.
- Jev answered **hold** to every one of the 186 army questions. Every attack in that game came from the harness's own
  rule, not from Jev.
- Two actions failed ("no free worker", "no site found"). The same failing action came back on the next turns.

### Prompt caching

- **Jev:** input costs $0.042 per million tokens, so caching would save almost nothing. The waste was elsewhere:
  paying for questions with a single possible answer (fixed now).
- **Astra, v1: probably no caching at all.** OpenAI caches automatically only when at least 1,024 tokens at the start
  of the prompt are byte-identical from call to call. Our fixed part (rules and schema) was about 700 tokens, and the
  other fixed part (the vocabulary) sat in the user message *after* the changing observation.
- **Astra, now:** the system message holds the rules, the schema and the full action catalog with costs and
  prerequisites (about 1,900 tokens), byte-identical for the whole game. Each call's changing part follows it. From the
  second plan on, that prefix should be billed at the cached price ($1 instead of $10 per million), saving about
  $0.017 per plan.
- **Checking it:** every call's `usage.prompt_tokens_details.cached_tokens` is now logged in `trace.jsonl` and shown
  on the chat card. JEV-Star measured 11% of its planner input as cached.
- **Unknown:** how much of each Astra call was hidden reasoning. The v1 logs kept only cost. OpenRouter's daily usage
  (read with the management key) will split input, output and reasoning tokens by model once today's UTC day is
  complete. From now on each call's own counts are in `trace.jsonl`.

## 4. Compared with the StarCraft Jev projects

These are the projects' actual sources (read-only), not their READMEs:

- JEV-Star: `sc2musa/Jev_Star`, paper arXiv 2609.27331.
- jev-plays-starcraft-2: `rapidstartup/jev-plays-starcraft-2`.
- tsai-sc (StarCraft 1): `phyous/tsai-sc`.
- The Minecraft agent: `rmalde/minecraft-agent`.

Their setups:

| | JEV-Star | jev-plays-sc2 | tsai-sc | ours v1 |
|---|---|---|---|---|
| Jev input per call | ~4.9k tokens | ~750 tokens | ~22k tokens | ~800 tokens |
| Jev calls | 1 per game-second | per cohort | every 3 s | every 5 s |
| Questions | 1 over all legal actions | 1 per unit type | intent + command | 2, top-3 options |
| Plan shape | goals, whitelist, reserve | none | none | ordered priorities |
| Plan filters options | yes, with reasons | n/a | n/a | top 3 only |
| Overrides Jev's answer | never | never | never | yes (wait, attack) |
| Scouting / retreat | yes / yes | yes / yes | yes / yes | no / no |
| Clock | real time, async | real time | paused | paused (lockstep) |

The published results that matter:

- JEV-Star won 9 of 10 games against the level-7 built-in AI with Astra constrained + Jev. With the plan only
  advisory it won 3 of 10, and Jev alone won 0.
- Jev alone chose wait on 71% of turns. That is the same failure we saw.
- A game cost $2.83 to $4.52, about $0.15 of it for Jev.

### Ranked gaps in v1

1. We decided 5 times less often than the native AI, which acts every second. Production buildings sat idle.
2. The plan was a list of priorities. There were no target counts, no list of allowed spending and no real reserve.
3. No scouting and no enemy memory.
4. No retreat and no attack threshold on the options. The harness attacked on its own.
5. A failed action was offered again at once, and a string of failures did not trigger a replan.
6. The planner did not know costs or prerequisites.
7. Few replan triggers: under attack, building lost, first sighting, schedule.
8. An invalid plan silently turned the filter off (`priorities: []` meant "offer everything").
9. Jev's instructions were thin.
10. The prompt layout defeated caching.
11. The logs could not explain a loss: no requests, no masked options, no replay.

**Wrong by their standards:** changing Jev's answer after it replied, both "wait → the plan's top item" and the
harness's own attacks. With that in place, a win or loss cannot be credited to Jev.

## 5. What changed after this review

### Harness (`harness/llm_player.py`, rewritten on JEV-Star's design)

- **Plan schema:** goals as total counts, `allowed_spending`, `priority_action` (the MAIN ORDER), `worker_target`,
  `reserve_for`, `army_posture`, `attack_min_army`, `retreat_below_army`, `min_posture_seconds`.
- **Validation:** each plan is checked against the action catalog. A rejected plan keeps the previous one and is
  re-asked with the reason (`last_plan_rejection`).
- **Policy filter, before Jev answers:** the legal actions are narrowed, with a reason for each one hidden:
  - not allowed by the plan;
  - goal reached, or worker target reached;
  - would spend the reserve;
  - posture is not attack;
  - free army below the attack size;
  - posture held (the plan's minimum time between flips);
  - failed within the last 5 s;
  - the army is already home ("defend" does nothing).

  Two things always stay on offer: workers below the target, and a farm when food is nearly full.
- **No overrides:** the harness never changes Jev's answer and never trains workers or attacks on its own.
- **Decisions:** one Jev Choice per game-second, as in JEV-Star, over every remaining option (production and army
  together). A turn with one option is taken without a call.
- **Replans:** JEV-Star's triggers, at most one per 30 s window:
  - under attack, a building lost, army losses (30% in 30 s);
  - a new enemy unit type seen;
  - every goal reached;
  - our gold mine running low;
  - three failed actions in a row;
  - a rejected plan;
  - the 90 s schedule.
- **Budget guard:** the planner is not called when less than $0.08 of the budget is left. The plan in force stays,
  and Jev keeps playing until the cap.

### Game (`game.js`)

- New actions: `scout:enemy_base`, `scout:expansions`, and `retreat` (move home without fighting).
- The observation gained:
  - `enemyLastSeen`: per enemy type, visible now, most seen at once, seconds since, where; kept 120 s.
  - `counts`: per action key, including units and buildings in progress.
  - `idleProducers`.
  - A fog note.

### Tracing

- `trace.jsonl` records every API call: full request, full response, generation ID, tokens (input, cached, output,
  reasoning), cost and latency.
- `log.jsonl` records every plan (accepted or rejected, with the reason) and every turn (options offered, options
  hidden with reasons, the choice, Jev's probabilities and confidence, the result).
- `trace.md` / `turns.csv` / `OVERVIEW.md` come from `harness/trace_report.py`.

### Replays

- Replays work as in Warcraft II. A replay holds the game options and every outside input with its tick, and the
  simulation re-runs them. The simulation now has its own seeded random numbers.
- A checksum every 30 s detects any drift. A 19-minute harness game replays with all 37 checkpoints matching.
- A replay file is about 15 to 50 KB. `replay.json` is saved in each run folder, every 60 turns and at the end.
- The viewer: open `http://127.0.0.1:8778/?replay=harness/runs/<run>/replay.json`, or use "Watch replay" on the
  title screen.
  - Play/pause, 1x to 16x, and a time bar to jump anywhere.
  - Vision: the player's fog, or the whole map.
  - You can scroll, zoom and select freely.
  - The **decision chat** on the right shows every Astra plan (reason, goals, main order, posture, tokens, cost,
    reasoning when the model returns it) and every Jev choice (options with probability bars, confidence, result,
    hidden options with reasons), each at its game time. Click a message to jump there.
- `--headed` shows the same chat live while a game runs.
- **Limit:** a replay must be watched with the game version it was recorded with. A change to the simulation or the
  agent macros makes older replays drift, and the checksum will say so.

## 6. Cost of the next game

With the new cadence:

- **Jev:** about 1 call per game-second minus forced turns. About 1,500 calls in 30 minutes at roughly $0.00008
  (bigger state) is about $0.12.
- **Astra:** a plan every 90 s plus events, about 25 to 30 in 30 minutes. At about $0.02 to $0.03 each with the
  cached prefix, that is $0.60 to $0.90.
- **A 30-minute game:** about $0.8 to $1.1. With $1.70 on the account, one game fits. Run it with `--minutes 30
  --budget 1.4`, so the planner stops before the cap and the game still finishes with the plan in force.
- **Needed before it can run:** the key in `~/.config/warcraft_game/openrouter.key` has used its whole $3 limit.
  - Raise the limit on OpenRouter to about $4.50 (Workspaces → Keys), or put a new key in that file.
  - The key also expires on 2026-09-27 08:41 UTC.

Command, once the key has room:

```
cd ~/warcraft_game && ~/warcraft_bench/.venv/bin/python harness/llm_player.py --minutes 30 --budget 1.4
```

Then watch: `http://127.0.0.1:8778/?replay=harness/runs/<run>/replay.json`. Add `--headed` to watch it live.

## 7. Awareness update (after this review)

The models were blind to terrain, only heard about an attack once it hit, and could only order the whole army. That
changed as follows.

### What the models see now

- **Map (Astra, once per game, in the cached system prompt).**
  - A coarse terrain grid: 16 to 24 characters a side, one character per 2 to 6 tiles.
  - The ground route to the enemy: its length, or "none, sea or air only".
  - Real chokepoints on that route. A spot counts only if closing it cuts the route or lengthens it by at least a
    quarter.
  - Every expansion site, with its ground distance from us and from the enemy start.
- **Threats (every turn).** `enemySeen` gives each visible enemy group's heading (toward our base, away, across or
  standing), its speed and its arrival time. `incoming` lists the groups arriving within 90 s.
- **Fights (every turn).** Each of our groups in contact: its health, the enemies near it, and its wounded units.
- **Map summary (every turn, for Jev).** The route, chokepoints and nearest expansions.

### What they can order now

- **New orders:**
  - `attack:expansion`: the free army hits a known enemy expansion.
  - `harass:workers`: a squad of the 5 fastest free units raids the enemy's gold line; the rest stay home.
  - `hold:choke`: the free army stands at the chokepoint on the route nearest our base.
  - `pull_wounded`: units under 40% health in a fight run home.
- **Spells:** the models' casters now cast their researched spells in combat, using the same code as the native AI.
- **Replanning:** Astra is now re-asked when an enemy force of at least 3 units is arriving. Before, the first
  replan came after the first hit.

### Limits and checks

- **Still no single-unit control.** Orders go to the whole army or a squad. Targeting in a fight is automatic.
- **Cost:** the observation is about 350 to 400 tokens a turn. Astra's fixed prompt is about 2,700 tokens and cached
  after the first call. The estimate for a 30-minute game rises to about $1.0 to $1.2.
- **Determinism:** the agent's unit flags (scout, squad task, pulled back) are tidied inside the simulation, so
  replays stay exact. An offline test game replayed with all 15 checkpoints matching.

## 8. Port of JEV-Star's constrained filter (from their code)

Read from github.com/sc2musa/Jev_Star (`strategic_policy.py`, `hierarchical_protoss_bot.py`, `astra_planner.py`).
Their constrained mode won 9/10 vs Lv7; advisory (plan as advice only) 3/10; Jev alone 0/10.

What now matches their method:

- The plan filters for 180 game seconds (their TTL). With no live plan, nothing is filtered.
- Under an emergency (base attacked, or 3+ enemies incoming), basic fighters and scout towers bypass the whitelist,
  goal counts and the reservation. The barracks does too when we have none. An urgent farm always does.
- Scouting is never filtered (15 s repeat cooldown only). Raids and choke holds are not filtered by posture.
- Every goal is added to the allowed list. The planner prompt carries their headroom rules.
- An attack is the MAIN ORDER when posture is attack and the army is big enough, ahead of production.
- Removed rules of my own that they do not have: "only worker builds a farm first" and the farm-first money hold.

Still different, by choice:

- The game pauses while models think (theirs runs in real time).
- Astra plans every 90 s at low effort (theirs: 60 s, medium). Both are flags: `--plan-every`, `--effort`.
- One running Astra conversation (for the prompt cache). Theirs is a fresh call with the previous plan.
