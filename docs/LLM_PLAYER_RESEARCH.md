# LLM Player for the Warcraft II Clone: Prior Art and Harness Design

Research date: 2026-09-26. Web research only; no code was changed. Prices and model names are
taken from public pages as of this date. Check the OpenRouter model pages before spending money.

## 0. TL;DR

- **"jev"** is most likely **Jev**, the "System One" decision model from **TypeSafe AI**. It went
  into early access on 2026-09-15 and is on OpenRouter as `typesafe/jev-1.13`. It does not write
  text. You give it a state block plus typed questions (Choice / Score / Noul), and it returns a
  choice with calibrated probabilities in about 0.4 s, for about $0.042 per million input tokens.
- **"astra"** is **OpenAI GPT-6 Astra** (released 2026-09-03), used as the slow strategic
  *planner*. The pattern is "Astra plans, Jev decides". It went viral through Ronak Malde's
  Minecraft Ender-Dragon run on X and through the **JEV-Star** StarCraft II paper and repo
  (arXiv 2609.27331, github.com/sc2musa/Jev_Star, 2026-09-23).
- **Does Jev move every minion?** Not in full games. In JEV-Star macro play, Jev picks **one of
  about 73 macro commands** (build X, train Y, research Z, expand, attack, retreat, wait) about
  once per wall-clock second. Scripted code (BurnySC2/python-sc2) handles placement, worker
  saturation and low-level orders. Only in the small-battle "micro" benchmark (SMAC-Hard maps) does
  Jev choose an action per unit from an enumerated list (move to one of N spots, attack a visible
  target, heal, stop). The game is stepped 8 loops at a time there, so it waits for Jev.
- Every serious LLM-RTS system since 2023 (TextStarCraft II, SwarmBrain, HEP, SC2Arena/StarEvolve,
  JEV-Star) uses the same split: **an LLM for strategy, script for execution**. None of them lets a
  chat LLM micro-manage units in real time.
- Recommended design for us: three tiers. (1) A **Strategist LLM** every ~45 game-seconds plus on
  events, which writes a plan as JSON. (2) A **Tactician** every ~5 game-seconds that picks from
  enumerated legal macro candidates. This can be a cheap chat model or Jev. (3) A **deterministic
  executor** in JS that turns macro actions into `__game.command` calls, reusing the native AI's
  helpers. For benchmarking, run lockstep (sim paused while the model thinks) with a fixed
  game-time cadence. Real-time is a secondary mode.

## 1. Identifying "jev" and "astra"

The voice transcript said "jev model to play starcraft … astra request to plan maker and jev model
to decide". That wording matches this cluster almost word for word:

- **Jev (TypeSafe AI).** A San Francisco startup founded in 2024 with a $40M seed led by DCVC. Jev
  "does not generate natural-language text"; it "returns typed values together with probability
  estimates and confidence scores". It has three primitives: *Choice* (pick one option), *Score*
  (place on an ordered scale) and *Noul* (probability that a yes/no holds). Latency is 70 to 500 ms
  and the context window is 32k tokens. On OpenRouter it is served through
  `POST https://openrouter.ai/api/alpha/decisions`. Input costs $0.042/M tokens and output is
  free. Sources: https://en.wikipedia.org/wiki/Jev_(AI_model),
  https://openrouter.ai/typesafe/jev-1.13, https://openrouter.ai/docs/guides/community/jev,
  https://www.techtarget.com/it-infrastructure/news/366650696/Jev-decision-model-touted-as-quicker-cheaper-LLM-alternative
- **GPT-6 Astra (OpenAI).** OpenAI's flagship reasoning model. It costs $10/M input and $50/M
  output ($1/M for cached input) and has a context window of about 1M tokens. It is on OpenRouter
  as `openai/gpt-6-astra`. Source: https://openai.com/index/gpt-6-astra/ and
  https://openrouter.ai/openai/gpt-6-astra
- **The X posts.** Ronak Malde (@rronak_):
  https://x.com/rronak_/status/2101544156757950697 says "Jev + Astra beats the Ender Dragon in
  Minecraft in 8 minutes 43 seconds … Cost less than $1 ($0.01 Jev, $0.96 Astra)". The follow-up,
  https://x.com/rronak_/status/2101544158502728002, says "I made Jev control the player … Astra is
  the planner that sends instructions to Jev async … Astra would add skills as mjs files". The code
  is at https://github.com/rmalde/minecraft-agent (131 Jev decisions and 35 Astra calls per run).
  There is also a Jev launch thread by @kimmonismus
  (https://x.com/kimmonismus/status/2100222673385312617) and an X trending card
  (https://x.com/i/trending/2101370964336578639). X returned HTTP 402 to the fetcher, so the post
  text above comes from search snippets.
- **The StarCraft projects.** There are three separate ones, described in section 2.1: JEV-Star
  (SC2, with Astra), tsai-sc (original StarCraft 1 shareware, Jev only) and jev-plays-starcraft-2.

Other readings are much less likely. Gemini, GPT, Grok or DeepSeek do not fit "jev" together with
"astra" as a planner. Google's Project Astra is an assistant, not a game planner.

## 2. Prior art

### 2.1 Summary table

| Project | Game | Who decides what | Obs format | Result |
|---|---|---|---|---|
| JEV-Star (2026) | SC2 full game + SMAC | Astra plans, Jev picks macro | Structured text | Beats Lv7 (2 wins) |
| tsai-sc (2026) | StarCraft 1 campaign | Jev picks squad/eco action | Structured state | Beat mission 1 |
| jev-plays-starcraft-2 | SC2 campaign | Jev per unit-type group | Structured + fog | Won Liberation Day |
| Minecraft Jev+Astra | Minecraft | Astra plans, Jev acts | Structured state | Dragon in 8:43 |
| TextStarCraft II / CoS | SC2 full game | LLM macro, script micro | Text summaries | Beats Lv5 (Harder) |
| HEP (2025) | TextStarCraft II | Hierarchical expert prompt | Text | First win vs Lv7 Elite |
| SwarmBrain (2024) | SC2 Zerg | LLM macro + state machine | Text | Wins vs several levels |
| SC2Arena / StarEvolve | SC2 all races | Planner-Executor-Verifier | Text, JSON actions | Better than prior LLMs |
| LLM-PySC2 (2024) | SC2 micro/SMAC | LLM per agent group | Text + image | Unreliable decisions |
| VideoGameBench (2025) | Incl. Warcraft II | VLM, raw mouse/keys | Screenshots | Near 0% completion |
| Age of LLM (2026) | Custom 1v1 grid | LLM, 3 actions/turn | JSON + fog | 15-model ladder |
| When Agents Rule | Browser AoE-like | LLM tool calls | JSON snapshot | Multi-model matches |
| Factorio LE | Factorio | LLM writes Python API code | REPL output | Weak at automation |

### 2.2 JEV-Star: the closest match to the request

Paper: https://arxiv.org/abs/2609.27331 (HTML: https://arxiv.org/html/2609.27331v1). Code:
https://github.com/sc2musa/Jev_Star. Authors: Weiyu Ma, Liangbing Zhao, Yongcheng Zeng, Jian Zhao
(CASIA). This is the same group that made TextStarCraft II; there is a mirror at
github.com/histmeisah/Jev_Star.

- **Pipeline.** Structured game state → candidate legal actions → optional Astra plan → action
  filtering → Jev picks one → local executor (BurnySC2) → real-time SC2.
- **Planner (GPT-6 Astra, medium reasoning).** It runs on a nominal 60-game-second interval and
  also "at relevant events", with a minimum execution window. It outputs goals and constraints
  such as "expand economy to 2 bases" or "maintain army posture". Median latency is 27.6 s for
  macro and 37.2 s for micro, which is why it runs **asynchronously**. The game keeps running and a
  finished plan applies to later decisions.
- **Adapter.** In *constrained* mode, the plan removes candidate actions and makes **resource
  reservations**: "when saving for an expansion, the adapter can suppress lower-priority spending
  until the required minerals accumulate". In *advisory* mode the plan is only context. Constrained
  mode won clearly: 9/10 vs 3/10 in the repo's macro runs.
- **Jev (fast selector).** At most one request per wall-clock second, with a median of 0.42 s. Its
  macro candidates are produce unit, construct building, research, expand, attack, retreat and wait
  (about 73 Protoss actions). Scripts handle worker distribution, Gateway morphing and building
  placement, and these do not count as actions.
- **Micro mode (35 SMAC-Hard maps).** Candidates are listed *per unit*: move to an enumerated
  destination, attack an available target, heal an ally, or stop. The observation includes HP,
  positions, ranges, cooldowns and energy. The environment advances 8 game loops only after the
  whole team's decision returns, so it is effectively paused. Average enemy elimination was 37.7%
  with Astra+Jev vs 16.5% with Jev alone.
- **Results.** It beat Lv5, Lv6 and **Lv7 (the strongest non-cheating built-in AI) twice** with
  different seeds, and lost to Lv8 (a cheating level). **Cost was $3.71 per game ($0.15 Jev, $3.56
  GPT-6).** The authors admit that interface changes made during development confound how much the
  planner contributed.

### 2.3 Other Jev game harnesses (curated at https://github.com/AbdelStark/awesome-typesafe-jev)

- **tsai-sc**, https://github.com/phyous/tsai-sc. **Original StarCraft 1**, which is the closest
  analogue to WC2 in era and mechanics. It reads structured state from the running game, calls Jev
  and executes through synthetic mouse and keyboard input. **The game is paused during state reads
  and inference.** Jev chooses a category (Economy / Engage / Explore / Reposition / Continue) and
  then a concrete candidate. Nearby combat units are grouped into **squads of at most 12**, so Jev
  never moves individual units. It uses separate Economy and Army calls that alternate. It beat
  mission "Strongarm" on attempt 16 with 421 decisions over 17.6 minutes and a median latency of
  383 ms. It used about 9.4M input tokens, roughly $0.40.
- **jev-plays-starcraft-2**, https://github.com/rapidstartup/jev-plays-starcraft-2. Runs in real
  time. It asks Jev for a strategic priority and then for a concrete order per unit-type selection.
  Decisions older than 64 game loops are thrown away. It uses stale fog snapshots and logs to
  JSONL. It won the SC2 campaign mission Liberation Day.
- **Minecraft agent**, https://github.com/rmalde/minecraft-agent. Astra sets goals and waypoints,
  Jev picks bounded actions, and Mineflayer handles pathing. When a run fails, Astra writes reusable
  skill modules (`.mjs`).

### 2.4 Earlier LLM-plays-StarCraft work

- **TextStarCraft II + Chain of Summarization** (Ma et al., CASIA, 2023). Paper:
  https://arxiv.org/abs/2312.11865, code:
  https://github.com/histmeisah/Large-Language-Models-play-StarCraftII. The observation is text in
  six sections: resources, units, buildings, in-progress, enemy and research. Each frame is
  summarized, then K frames are summarized together, and the LLM is queried **once every K steps**.
  It outputs a list of macro actions that goes into an **action queue** and is executed one at a
  time. Scripts do micro, placement and targeting. It runs non-real-time, so the game waits.
  Results: GPT-4 Turbo won 12/20 against Lv5 (Harder); a fine-tuned Qwen-7B won 9/20; most of the
  10 tested LLMs beat Lv5; Lv6 and above were hard. Prompt quality alone moved Lv5 win rate from 0%
  to 50%.
- **Hierarchical Expert Prompt (HEP)**, https://arxiv.org/abs/2502.11122 (2025). Adds
  expert-tactic knowledge and a prioritized subtask hierarchy on top of TextStarCraft II. It was the
  first to beat the Elite (Lv7) built-in AI.
- **SwarmBrain**, https://arxiv.org/abs/2401.17749, https://github.com/ramsayxiaoshao/SwarmBrain.
  The "Overmind Intelligence Matrix" LLM decides macro strategy: resource allocation, expansion and
  multi-pronged attacks. The "Swarm ReflexNet" condition-response state machine handles unit
  maneuvers, explicitly **because LLM latency is too high** for micro. It plays Zerg against the
  Terran built-in AI and won against several difficulty levels.
- **SC2Arena + StarEvolve**, https://arxiv.org/abs/2508.10428 (2025). A benchmark with all races
  and a low-level action space. The agent has a **Planner → Executor → Verifier** structure. For
  example, the Executor turns the plan into JSON such as `BARRACKSTRAIN_MARINE` on an idle
  Barracks. It self-corrects and is fine-tuned on high-scoring games.
- **LLM-PySC2**, https://arxiv.org/abs/2411.05348. Exposes the full pysc2 action set with
  multimodal observations and multiple LLM agents. It uses asynchronous queries so latency stays
  constant as agent count grows. Its finding: LLMs "can achieve victories in complex scenarios but
  cannot constantly generate correct decisions" when given raw action spaces. This is the argument
  for giving the model enumerated candidates instead.
- **Society of Mind meets RTS**, https://arxiv.org/pdf/2508.06042, and IMBM
  (https://github.com/Kanpfx/IMBM). Both are hierarchical multi-agent Planner/Executor/Verifier
  variants.

### 2.5 Analogous harnesses and benchmarks

- **VideoGameBench**, https://arxiv.org/abs/2505.18134, https://github.com/alexzhang13/videogamebench.
  Its set **includes Warcraft II** (the Orc campaign). VLMs see screenshots and send raw inputs. In
  the "Lite" mode the emulator **pauses while the model thinks**. The best models completed 0.48%
  of the benchmark (1.6% on Lite). This shows that pixel-level control of an RTS is hopeless, so
  structured state is the way to go.
- **Age of LLM**, https://arxiv.org/html/2606.24391v1. A deterministic turn-based 1v1 with fog. The
  observation is a JSON payload per turn, and each turn allows at most 3 structured actions.
  **Illegal actions are silently dropped as wasted slots.** Cost is $0.10 to $1.91 per match. The
  authors recommend at least 20 side-swapped matches per pairing.
- **When Agents Rule**, https://github.com/baristahaus/when-agents-rule. A **browser-only**
  AoE-style RTS, the same shape as ours. Agents get JSON snapshots and use tool calls
  (`train_unit`, `build_structure`, `assign_workers`, `attack_target`, `explore`, `wait`, …), with
  up to 3 commands plus 1 `plan` call per turn. It has a real-time mode and a synchronized
  turn-based mode (90 s answer window). Its OpenRouter adapter is reusable.
- **Factorio Learning Environment**, https://github.com/JackHopkins/factorio-learning-environment.
  The LLM writes Python against a typed tool API in a REPL. The idea for us is "actions as code
  against a high-level API", which suits a slow planner but is risky for an adversarial real-time
  game.
- Also relevant: BALROG (agentic game benchmark), lmgame-Bench, DSGBench
  (https://arxiv.org/pdf/2503.06047) and RTSGameBench (Beyond All Reason, VLMs,
  https://arxiv.org/html/2606.18950v2).

### 2.6 Cross-cutting lessons

1. **The LLM decides *what* to do; the script decides *how*.** Placement, pathing, worker
   balancing, targeting and focus fire are always scripted, or at most chosen from a short
   enumerated list.
2. **Give the model enumerated legal candidates** (JEV-Star, tsai-sc, SC2Arena). Letting it write
   free-form commands leads to hallucinated ids and illegal orders (LLM-PySC2).
3. **Plans should constrain rather than advise.** In JEV-Star, constrained mode won 9/10 vs 3/10
   for advisory mode. Resource reservation for the planned item is the key piece.
4. **Handle latency explicitly.** Either pause or step the game (TextStarCraft II, tsai-sc,
   VideoGameBench Lite, SMAC micro), or run async and throw away stale decisions (JEV-Star macro,
   jev-plays-sc2 drops decisions older than 64 loops).
5. **Prompt and harness quality dominate model choice.** In TextStarCraft II, prompt changes alone
   moved Lv5 from 0% to 50%. Keep the harness fixed when comparing models.
6. **Decision budgets:** JEV-Star calls the planner every 60 game-s and the selector at 1 Hz;
   tsai-sc made about 24 decisions per minute; CoS calls the LLM every K steps with an action queue.

## 3. Recommended design for our harness

### 3.1 What our engine gives us today, and gaps found while reading `game.js`

- `__game.state()` returns **the full enemy roster including units hidden by fog**. The enemy
  entries come from `exportPlayer('enemy')` with no visibility filter. Fog data exists separately:
  `G.vis` for the player's view, `__game.visibility(x,y)`, and `G.memory` for last-seen enemy
  buildings. **The LLM serializer must filter the enemy through visibility.** Better, add a
  `__game.observe('player')` that returns only visible enemy units plus remembered buildings.
- `__game.command(cmd)` always issues commands as `'player'`, so the LLM plays the player slot and
  the native AI plays `'enemy'`. That is fine for LLM-vs-AI. For LLM-vs-LLM we would need an
  owner parameter.
- **There is no external pause or step hook.** `paused` is internal, and `setSpeed(k)` requires
  k > 0. The loop is driven by `requestAnimationFrame`, which background tabs throttle. Add
  `__game.pause(bool)` and `__game.advance(seconds)`, which runs `step()` N times synchronously, for
  lockstep evaluation.
- Combat rolls use unseeded `Math.random` (12 call sites), while map generation is seeded. Games
  are therefore **not reproducible from a seed**. Route combat randomness through a seeded RNG if we
  want replays driven by seed plus an action log.
- `catalog()` already describes costs, requirements and upgrades, so the model gets a tech tree for
  free. `__game.placement(type,x,y)` explains why a site is illegal.
- The native AI contains the macro helpers we want the executor to reuse: farms on demand, the
  gold/lumber split, home defence, repair, rebuild, `findSpot` and `yardSite`. These run each
  second for `enemy`, and for `player` under `autopilot`.

### 3.2 Architecture (three tiers)

```
 Node runner (Playwright, headless Chromium, game at file:// or localhost)
   ├─ Strategist LLM  (OpenRouter chat, every ~45 game-s + events)  → Plan JSON
   ├─ Tactician       (cheap chat LLM or Jev Choice, every ~5 game-s) → 1-3 macro actions
   └─ page.evaluate:  Executor (JS, every tick) → __game.command(...)
                      Observer  (JS)            → fog-filtered observation
```

Run the LLM calls in Node, not in the page, so the API key never enters the page and logs go to
disk. The page only exposes `observe()`, `candidates()`, `applyMacro()`, `pause()` and `advance()`.

**Strategist (slow, smart).** It receives the full observation, the catalog summary, the last plan,
the outcomes since then (what finished, what died, what was seen) and a short running "memory" note
it wrote itself. It returns a Plan:

```json
{ "posture": "defend|expand|pressure|all_in",
  "buildQueue": ["farm","barracks","lumber_mill"],
  "armyTarget": {"footman": 8, "archer": 4},
  "research": ["arrows1"],
  "reserve": {"gold": 400, "lumber": 0, "for": "keep"},
  "attack": {"when": "army>=12", "target": "enemy_main"},
  "workerTarget": {"gold": 10, "lumber": 6, "oil": 0},
  "note": "enemy is rushing grunts; hold choke then counter" }
```

**Tactician (fast, cheap).** It gets a short observation plus the **enumerated legal candidates**
for this moment, filtered by the plan in constrained mode. Candidates respect reservations and
prerequisites, and use real ids. It returns 1 to 3 candidate indices. This matches Jev's Choice
primitive exactly, so it is a natural Jev slot. A chat model with `response_format: json_schema`
also works. A no-LLM baseline also fits here: the executor pops the plan's queue in order.

**Executor (deterministic JS).** It turns each macro into engine commands and does the continuous
chores that no LLM should spend tokens on:

| Macro action | Maps to engine API |
|---|---|
| `train(type, n)` | `train` on least-busy eligible building |
| `build(type, near)` | pick worker, `findSpot`/`placement`, `build` |
| `research(upgrade)` | `research` at the right building |
| `set_workers(g, l, o)` | re-issue `gather` to hit targets |
| `attack(target, group)` | `attackMove` army group to target point |
| `defend(where)` | `attackMove` to base/choke, then `hold` |
| `retreat(group)` | `move` to rally point |
| `scout(unit?, where)` | `move` a cheap unit through waypoints |
| `expand(mine)` | build hall near a named goldmine |
| `harass(group, target)` | `attack` worker/peon targets |
| `cast(spell, caster, tgt)` | `cast` (optional; else auto-cast) |
| `transport(...)` | `load`/`unload` (naval maps only) |
| `wait` | no-op |

The executor also does the following automatically. Each of these is an **assist flag**, and the
native AI's engine layer does the same things for itself:

- Idle workers go back to gathering.
- Farms are built when supply is within 2.
- Damaged buildings are repaired when safe.
- Army units fight back automatically when attacked.
- Units follow a rally point.
- Squads are formed: up to 12 units, grouped by proximity and role, as in tsai-sc.

Target names are symbolic, never raw coordinates from the LLM. Examples are `enemy_main`,
`enemy_expansion_1`, `last_seen_army`, `my_natural`, `choke_1` and `mine:#123`. The observer
resolves them. This removes the spatial-reasoning failure mode that SC2Arena reported.

### 3.3 Observation serializer

Send compact JSON or YAML-ish text, not the raw `state()`. That is too big, and it leaks fog.
Aim for about 1.5 to 3k tokens:

```
t=312s race=human  gold=640 lumber=410 oil=0  food=18/24
workers: gold 9, lumber 5, idle 1, building 1
buildings: town_hall(done), barracks(done, training footman 60%), farm x3, lumber_mill(40%)
army: footman x6 (hp 94%), archer x2   squads: S1{6 footman @ my_natural}, S2{2 archer @ home}
upgrades: none   researching: -
enemy (visible now): grunt x3 @ (41,22) moving toward my_natural, dist 9
enemy (remembered): great_hall @ enemy_main, barracks @ enemy_main (seen t=240)
map: my_main(12,50) my_natural(20,38) enemy_main(52,10) choke_1(30,30) mines: #88 full, #91 60%
events since last: lost 1 peasant @ lumber; footman trained x2; scout died @ enemy_main
plan status: buildQueue[0]=lumber_mill in progress; reserve 0; posture=defend
```

Put stable context in the system prompt so OpenRouter prompt caching makes repeated calls cheap.
That context is: rules digest, race catalog, unit counters, action schema and map landmarks.

### 3.4 Cadence and latency: two modes

- **Lockstep (default for benchmarking).** Pause the sim, observe, call the model, apply, then
  `advance(Δ)`. Use Δ = 5 game-s for the tactician, and run the strategist every 45 game-s or on
  events: under attack, a building lost, a new enemy tech seen, a plan finished, or supply-blocked.
  Model speed then does not change the result, so we measure strategic quality. This is the
  approach of TextStarCraft II, tsai-sc and VideoGameBench Lite. The native AI also acts every
  game-second, so the comparison is fair in game time.
- **Real-time (secondary, "fun" mode).** The game runs at speed 1 and the strategist runs
  asynchronously. The executor keeps working the current plan in the meantime. Decisions are
  discarded if the observation is older than 3 game-s at the time of applying. This measures speed
  as part of skill, as JEV-Star does. Report it separately.
- Set a hard timeout per call: 60 s for the strategist, 10 s for the tactician. On timeout or
  invalid JSON, keep the previous plan and record a `wait`. Give it one repair retry with the
  validation error, then give up.

### 3.5 Fairness rules against the native AI

- **Same information.** The LLM sees only what the player fog shows (`vis == 2`), plus remembered
  buildings. It gets no global `state()` data about the enemy. The native AI "does not cheat"
  according to the comment in `game.js`, so this is symmetric. Assert in tests that no hidden enemy
  id ever appears in a prompt.
- **Same executor help.** Turn on only the assists that the native AI's engine layer also has:
  farms on demand, worker split, repair, defend-when-hit. Log which assists are on in every run
  record. Also run an ablation with assists off.
- **Action rate cap.** Measure the native AI's commands per game-minute with a wrapper around
  `issueCommand`, then cap the LLM executor at the same figure. Macro decisions are capped
  anyway: at most 3 macros per tactician tick, which is about 36 per game-minute at Δ = 5 s.
- **No cheats.** Refuse `cheat()` and all `debug*` hooks from the runner. Check `state.cheated` is
  false.
- **Same settings.** Both sides get the same starting resources, map template and race balance.
  Swap races and sides where possible.

### 3.6 Logging and replay

- Write one JSONL line per decision with these fields:
  - game-time and wall-time
  - tier and model
  - prompt hash, plus the full prompt stored once per unique hash
  - raw response
  - parsed action and validation result
  - commands issued and engine accept/deny reasons
  - latency, input and output tokens, and `usage.cost` from OpenRouter
- Save `__game.save()` snapshots every 60 game-s and at the end. Store `G.seed` and the options.
- Write a per-game summary with these metrics:
  - winner and duration
  - supply-blocked seconds
  - peak and average army food
  - gold and lumber gathered vs spent (unspent-resource ratio, the analogue of TextStarCraft II's
    RUR and APU)
  - tech reached
  - invalid-action rate
  - calls and cost
- Replay: with seeded combat RNG, (seed, options, timestamped command log) reproduces the game
  exactly. Without it, rely on snapshots.
- A simple HTML viewer is worth adding later. It would show a timeline of plans and notes next to
  a minimap from snapshots, which is the "why did it lose" tool.

### 3.7 Evaluation protocol

- **Baselines first:**
  - `autopilot` vs AI. This is the mirror sanity check and should be about 50%. If it is not, the
    map or seat is unbalanced, and every other number has to be read relative to it.
  - A random-legal-candidate agent.
  - A "plan-queue only" agent: fixed opening, no LLM.
- **Matrix:** models × {human, orc} × at least 3 map templates × seeds. Use N ≥ 20 games per
  cell, with fixed seed lists shared across models, so comparisons are paired. Report the win rate
  with a Wilson 95% CI, the median game length, and cost per game.
- **Ablations** (JEV-Star could not separate these, so we should):
  - planner on vs off
  - constrained vs advisory plans
  - executor assists on vs off
  - lockstep vs real-time
  - Δ = 2 / 5 / 10 s
- **Difficulty ladder:** the native AI has one script today. Adding knobs such as attack-wave
  timing, resource multiplier or delayed start gives an Lv1-to-Lv7-style ladder, so results read
  like "beats AI at level k".
- **Timeouts:** a game ends at 40 game-min. Score by destroyed-value difference, and count it as a
  draw in the main win rate.

### 3.8 Model candidates on OpenRouter (prices as listed around Sept 2026)

| Role | Model slug (verify on OpenRouter) | $/M in / out |
|---|---|---|
| Strategist, top | `openai/gpt-6-astra` | 10 / 50 |
| Strategist, value | `anthropic/claude-sonnet-5` | 2 / 10 |
| Strategist, value | `openai/gpt-5.6-terra` | 2 / 12 |
| Strategist, value | `google/gemini-3.1-pro` | 2 / 12 |
| Tactician, cheap | `google/gemini-3.8-flash` | 0.75 / 3.75 |
| Tactician, cheap | `openai/gpt-5.6-luna` | 0.20 / 1.20 |
| Tactician, cheapest | `deepseek/deepseek-v4-flash` | 0.05 / 0.16 |
| Tactician, Jev-style | `typesafe/jev-1.13` (decisions API) | 0.042 / 0 |
| Wildcard | `x-ai/grok-4.6` | 2 / 6 |

The slugs are inferred from the model names on the pricing pages. Confirm exact IDs before use.

**Rough cost per 20-game-minute game in lockstep mode.** Assume the strategist runs about 30
times (about 6k input tokens, mostly cached, and about 1.5k output including reasoning). Assume the
tactician runs about 240 times (about 2.5k input and about 100 output).

- Astra strategist, about $1.50 to $3 (JEV-Star reported $3.56 per game), plus a Jev tactician,
  about $0.03 to $0.15. **Total about $2 to $4 per game.**
- Sonnet-5 or Terra strategist, about $0.40 to $0.80, plus a Gemini-Flash tactician, about $0.50.
  **Total about $1 per game.**
- An all-DeepSeek-V4-Flash setup: **about $0.05 to $0.10 per game.** Use it for bulk iteration on
  the harness.
- A 20-game cell costs about $2 to $80 depending on the tier. A full matrix of 5 models × 2 races
  × 3 maps × 20 games = 600 games, which is about $60 on value models or about $2k with Astra.
  **Iterate on cheap models first.**

### 3.9 Suggested build order

1. Engine hooks: `observe()` with fog filtering, `pause` and `advance`, command-rate metering, and
   a seeded combat RNG.
2. The executor macro layer, reusing the AI helpers. Test it with the no-LLM plan-queue agent.
3. The Node runner (Playwright) with a JSONL logger and the autopilot-vs-AI baseline.
4. The tactician on a cheap model, then the strategist, then Jev as an optional tactician backend.
5. The evaluation matrix and a results table in `docs/`.

## 4. Sources

- JEV-Star: https://arxiv.org/abs/2609.27331, https://github.com/sc2musa/Jev_Star
- Jev: https://en.wikipedia.org/wiki/Jev_(AI_model), https://openrouter.ai/typesafe/jev-1.13,
  https://openrouter.ai/docs/guides/community/jev
- GPT-6 Astra: https://openai.com/index/gpt-6-astra/, https://openrouter.ai/openai/gpt-6-astra
- X posts: https://x.com/rronak_/status/2101544156757950697,
  https://x.com/rronak_/status/2101544158502728002,
  https://x.com/kimmonismus/status/2100222673385312617
- Jev game harnesses: https://github.com/rmalde/minecraft-agent, https://github.com/phyous/tsai-sc,
  https://github.com/rapidstartup/jev-plays-starcraft-2,
  https://github.com/AbdelStark/awesome-typesafe-jev
- TextStarCraft II: https://arxiv.org/abs/2312.11865,
  https://github.com/histmeisah/Large-Language-Models-play-StarCraftII
- HEP: https://arxiv.org/abs/2502.11122
- SwarmBrain: https://arxiv.org/abs/2401.17749
- SC2Arena/StarEvolve: https://arxiv.org/abs/2508.10428
- LLM-PySC2: https://arxiv.org/abs/2411.05348
- VideoGameBench: https://arxiv.org/abs/2505.18134
- Age of LLM: https://arxiv.org/html/2606.24391v1
- When Agents Rule: https://github.com/baristahaus/when-agents-rule
- Factorio LE: https://github.com/JackHopkins/factorio-learning-environment
- OpenRouter pricing digest:
  https://betonai.net/openrouter-pricing-2026-complete-guide-to-every-model-tier-and-hidden-cost/
