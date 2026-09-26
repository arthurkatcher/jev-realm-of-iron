# AGENTS.md

Guidance for coding agents working in this repository.

## What this is

Two separate parts:

1. **The game (*Realm of Iron*)**: a Warcraft II-style RTS written from scratch in plain JavaScript. It is a static
   page with no build step, and it has its own scripted AI. It exposes `window.__game` for outside control.
2. **The harness (`harness/llm_player.py`)**: Python plus Playwright. It drives the game in Chromium through
   `__game` and lets two OpenRouter models play the player's side:
   - a planner (default `openai/gpt-6-astra`) writes a JSON plan every ~60 game seconds and on events;
   - Jev (`typesafe/jev-1.13`, OpenRouter `/api/alpha/decisions`) picks one action per game second.

The harness touches the game only through `__game`. Keep it that way.

## Commands

There is no build, lint config or test suite. Verification is syntax checks, headless games through `__game`, and
replay sync checks.

```bash
python3 -m http.server 8778 --bind 127.0.0.1          # serve the game (the harness expects this URL)
node --check game.js && node --check art.js && node --check data.js
python -m py_compile harness/llm_player.py
pip install -r requirements.txt && python -m playwright install chromium

# the whole harness loop offline, no API calls (writes harness/runs/<ts>/)
python harness/llm_player.py --planner scripted --decider scripted --seed 2 --minutes 6 --budget 0
# a paid game: needs OPENROUTER_API_KEY or ~/.config/warcraft_game/openrouter.key; costs real money
python harness/llm_player.py --seed 2 --map strait --minutes 30 --budget 1.5 --headed
python harness/trace_report.py                           # trace.md / turns.csv per run, runs/OVERVIEW.md
```

To test a game change, write a short Playwright script against the served page:
1. `__game.newGame({race, seed, size, map, ai, fog})`
2. then `__game.agent({side:'player'})`, `__game.autopilot(true)` and `__game.advance(sec)`
3. read `__game.observe()`, `__game.actions()`, `__game.macro(key)`, `__game.state()`, `__game.stats()`
4. stage fights with `__game.spawn(owner, type, x, y)` and aim the camera with `__game.lookAt(x, y)`

To check determinism, take `__game.replay()` from that game and play it back in a fresh page:
- `__game.playReplay(r)`, then `__game.replaySeek(r.endTick)`;
- then `__game.replayInfo().desync` must be `null`.

Do this after any change to simulation code.

## Game architecture (`game.js`, one IIFE)

- **State.** All state is in `G`, and the simulation steps at a fixed 20 Hz (`step` / `stepInner`).
  - `aiThink(owner)` runs every 20 ticks: for the enemy, for the autopilot, or as `aiThink(side, true)` for an
    agent side. `econOnly` runs just the economy and helpers: worker gold/lumber balance, idle workers, farms,
    repair, the strike-back reflex, the rally point and marching waves.
- **Determinism is load-bearing.** A replay is the game's options plus recorded inputs, checked by `simHash()`
  every 600 ticks.
  - Anything from outside that changes the game must go through `rec(type, data)` plus a matching case in
    `applyInput()`. Existing inputs: `cmd`, `macro`, `agent`, `auto`, `agentset`, `cheat`.
  - `agentMacro` records the key once, then mutes recording (`recMute`) while it runs.
  - Simulation randomness uses `srand()` (seeded `G.rs`), never `Math.random` (sound and title screen only).
  - Observation-only bookkeeping lives in `G.agent`: sightings, income history, intel, layout cache. It must never
    feed back into the simulation.
- **Orders.** `issueCommand` → `resetOrder` clears the unit's target and cancels a swing about to land
  (`u.strike`). Re-issuing an order to units already fighting stops them from dealing damage. Macros filter with
  `fighting(u)`, and the harness locks repeated army orders for 10 s.
- **Agent API.** `window.__game` is defined near the end of `game.js`. The agent-facing functions:

  | Function | Role |
  |---|---|
  | `agentObserve()` | The compact JSON view for the agent |
  | `agentActions()` | Legal action keys with labels and costs |
  | `agentMacroRaw()` | Turns a key into orders using the native AI helpers |
  | `agentSet()` | Standing settings: `woodPct`, `guard`, `place`, `rally` |

  Action keys look like `train:<type>`, `build:<type>`, `research:<id>`, `expand`, `attack:base|nearest|…`,
  `defend`, `retreat` and `workers:evacuate`.
- **Native AI.** It starts at `aiThink`:
  - `AI_SCRIPT` is the build order;
  - a wave gathers with `aiMuster`, then `aiWaves` drives `aiMarch` (hops along a `walkDist` field) every AI tick,
    with a stall rule and a rule that ends a wave of 2 or fewer;
  - `aiTarget` picks targets;
  - building sites come from `findSpot` / `findSpotNear`, which reject sites that wall off routes (`cutter`) or
    that a walking builder has already claimed (`pendingNear`);
  - agent placement uses `agentZones` / `agentPlaceSite` and `towerSite`.
- **Map and pathing.** `genMap(seed, template)` builds the map (`strait` or `bays`). `findPath` is A* that treats
  standing units as walls. `ensurePath` falls back to a path that ignores units when the detour is too long.
- **Data and art.** `data.js` holds all numbers (`UNITS`, `BUILDINGS`, `RACES`, `UPGRADES`, `SPELLS`, exposed as
  `window.WC2`). `art.js` (`window.ART`) loads the sprite sheets, recolours team colours and falls back to
  procedural sprites.
- **Replay list.** The in-game "Watch replay" menu reads the directory listing of `harness/runs/`. Each run keeps a
  snapshot of the game files in `runs/<ts>/game/`, so an old run replays on the code it was played with.

## Harness architecture (`harness/llm_player.py`)

- **Per turn** (one per game second, in lockstep: the game is held while the models think):
  1. `observe()` and `actions()`;
  2. the event triggers in `main()` may call `make_plan`;
  3. `options()` applies the policy filter (plan whitelist, goal counts, reserve, posture and attack size,
     cooldowns and order locks; urgent farms and emergency fighters always pass) and gives each masked option a
     reason;
  4. `decide()` asks Jev: typed Choice questions for production and for the army;
  5. `__game.macro(key)`;
  6. the result is logged.
- **Plans.** `validate()` checks every key against the catalog. The prompt is `RULES_DIGEST` plus `PLANNER_SYS`,
  cached, and the conversation restarts every `CONVO_MAX` plans. Claude planners get a top-level
  `cache_control` and no `response_format`.
- **Adding a plan setting** touches four places:
  1. the schema text in `PLANNER_SYS`;
  2. `validate()`;
  3. the `__game.agentSet(cfg)` call after `make_plan`;
  4. `agentSet()` in `game.js`, which is a recorded input.
- **Run output** goes to `harness/runs/<ts>/` (git-ignored): `log.jsonl`, `trace.jsonl` (full API traffic),
  `replay.json`, `summary.json` and the game snapshot.
- **Budget.** `--budget` caps spend. When it runs out, the built-in AI takes over the side.

## Conventions

- Assets must be free-licensed. Record each one's source, author and licence in `assets/CREDITS.md` (or the pack's
  credit file). No Blizzard assets.
- Code comments explain *why*, often citing the game or run that exposed the bug. Keep that style and the dense
  single-line JS idiom.
- Commit as `Arthur Katcher <192321283+arthurkatcher@users.noreply.github.com>` only. No other identities and no
  co-author lines.
- Stopping a background harness: `pkill -f` with a pattern that also appears in your own shell command kills that
  shell. Stop it by PID (`kill -INT <pid>`) so it writes `summary.json`.
