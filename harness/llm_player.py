#!/usr/bin/env python3
"""LLM player for Realm of Iron (the Warcraft II clone): a planner model and a fast decision model play the
player's side through the game's agent API against the native AI. Built after JEV-Star (github.com/sc2musa/Jev_Star,
arXiv 2609.27331); the comparison is in docs/HARNESS_ANALYSIS.md.

  - Planner (GPT-6 Astra): every PLAN_EVERY game seconds and on events, reads the observation and writes a plan in
    JEV-Star's shape: goals (total counts), the spending it allows, a main order, a reserve, the army posture and its
    attack / retreat thresholds. The plan is validated against the action catalog; a rejected plan keeps the old
    one and is re-asked with the reason.
  - Policy filter (JEV-Star's policy_reason): before each decision the legal actions are narrowed by the plan (not
    allowed, goal reached, would spend the reserve, army below the attack size, posture held, failed a moment ago).
    Urgent supply (a farm when food is nearly full) and workers below the target always stay on offer. The masked
    options and their reasons go to Jev and to the trace. Nothing overrides Jev's answer afterwards.
  - Decider (TypeSafe Jev): one typed Choice every DECIDE_EVERY game seconds (default 1 s, the native AI's pace)
    over every remaining action, production and army alike. A single remaining option is taken without a call.
  - Executor: the game's agentMacro() turns an action key into orders with the native AI's helpers. The gold/lumber
    split, idle workers, farms-in-a-pinch, tankers, repair and the strike-back reflex run for both sides.
  - The game clock is held while the models think (lockstep), so model latency does not decide games; results are
    lockstep results, not real-time ones.
  - Tracing: every API call (full request and response, generation id, tokens incl. cached and reasoning, cost,
    latency) goes to trace.jsonl; plans, decisions and masks go to log.jsonl and, as chat notes, into the game's
    replay (replay.json; open http://127.0.0.1:8778/?replay=harness/runs/<run>/replay.json).

The OpenRouter key is read from ~/.config/warcraft_game/openrouter.key (or $OPENROUTER_API_KEY); it is never logged.

Usage:
  python harness/llm_player.py --seed 3 --race human --size 64 --map strait --minutes 40 --budget 1.5
  python harness/llm_player.py --planner scripted --decider scripted   # offline test of the loop (no API calls)
Needs the game served at --url (python3 -m http.server 8778 --bind 127.0.0.1 --directory ~/warcraft_game)
and Playwright with Chromium.
"""
import argparse, shutil, asyncio, json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

OR = 'https://openrouter.ai/api'
KEY_FILE = Path.home() / '.config/warcraft_game/openrouter.key'


def api_key():
    k = os.environ.get('OPENROUTER_API_KEY') or (KEY_FILE.read_text().strip() if KEY_FILE.exists() else '')
    if not k: sys.exit('No OpenRouter key: set OPENROUTER_API_KEY or write it to ' + str(KEY_FILE))
    return k


def post(path, body, key, timeout=180):
    req = urllib.request.Request(OR + path, data=json.dumps(body).encode(), method='POST', headers={
        'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost/realm-of-iron', 'X-Title': 'Realm of Iron LLM player'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read())
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')[:500]
            # 402 "in-flight budget": OpenRouter holds money for the largest possible reply of every open call;
            # it clears once those calls settle
            # (Retry-After is honoured, up to a minute)
            if (e.code in (402, 429) or e.code >= 500) and attempt < 3:
                try: wait = float(e.headers.get('Retry-After') or 0)
                except ValueError: wait = 0
                time.sleep(min(60, max(wait, (5 if e.code in (402, 429) else 3) * (attempt + 1)))); continue
            raise RuntimeError(f'{path} HTTP {e.code}: {msg}')
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 3: time.sleep(2 * (attempt + 1)); continue
            raise RuntimeError(f'{path}: {e}')


def usage_of(r):
    """Token and cost figures from an OpenRouter response (chat completions or Jev decisions), whatever is present."""
    u = r.get('usage') or {}
    pd = u.get('prompt_tokens_details') or {}; cd = u.get('completion_tokens_details') or {}
    return {'in': u.get('prompt_tokens') or u.get('input_tokens'), 'cached': pd.get('cached_tokens'), 'cache_write': pd.get('cache_write_tokens'),
            'out': u.get('completion_tokens') or u.get('output_tokens'), 'reasoning': cd.get('reasoning_tokens'), 'cost': u.get('cost')}


RULES_DIGEST = """You are playing Warcraft II (Tides of Darkness) skirmish rules, 1v1 against the built-in computer AI.
Win by destroying every enemy unit and building. Economy: workers mine gold (100 per trip, fast) and cut lumber
(100 per trip, about three to four times slower per worker than gold: lumber is the usual bottleneck, so plan
enough cutters with lumber_workers_pct). Idle workers, repairs and farms when food runs low are handled for you;
training workers is YOUR decision (the plan's worker_target). Farms give
food (4 each, the hall 1). Tech: Barracks -> footmen/grunts; Lumber Mill -> archers/axethrowers; Blacksmith ->
weapon/armor upgrades and ballistas/catapults (with Mill); Keep -> Stables (knights/ogres), Inventor; Castle ->
Church/Altar, Mage Tower/Temple, Gryphon Aviary/Dragon Roost. Ships need a Shipyard on the coast and oil (Oil Tanker +
Oil Platform). THE COMPUTER'S SCHEDULE (measured in our last game against it): 14 workers by 4:30, a forge at 4:30, armor and
weapon upgrades at 5:50 and 6:40, a Stronghold done by about 8:10, an Ogre Mound by 9:30, ogres and a second hall by
about 13:20, a catapult by about 14:30. Its waves reached our base at about 4:40 (3-4 units), 8:00 (7-8), 11:45
(8-10) and 15:30 (11+, with ogres), with more kept at home. It trains all game long and rebuilds what it loses. So: you start with ONE
worker and food 1/1 (the hall feeds 1), so that worker's first job is a farm, then train workers without a pause;
a barracks by about 1:00-1:30 (as soon as a second worker exists) and about 5 fighting units (or 2 towers and 3 units) at home by 3:00, then an army that keeps growing, with a farm per
4 units. Workers beyond about 14 on one mine add little. A home mine holds 50,000 gold. Losing all workers or the hall
early loses the game. A small army sent at the enemy base is usually thrown away; fighting near your own towers and
buildings is cheaper. Fog of war: you only see near your units and buildings; unseen enemy forces are unknown, not
absent. Scouting (scout:*) shows what the enemy is building; enemyIntel keeps everything ever seen and how long ago we last
saw their buildings - scout their base by about 6:00 and again before an attack. The game waits while you think.
WHAT BEATS THIS AI (from our test games; a guide, not a script): turtling loses, because the computer never stops
producing and out-grows a passive player. THE ARMY COMES FIRST: every wave must meet a bigger army at home, and
only a growing army wins. The start bank (5000 gold, 2000 lumber) goes to a Barracks at once and a second Barracks
soon after, a farm per 4 units you will train in the next minute, and fighters: about 5 at home by 3:00 (first wave
~3:20), 10+ by 6:00 (second wave ~6:00, ~8 units), then more than each wave. Lumber is the bottleneck: always keep
250 lumber for the next farm (food capped = no army), put 40-50% of the workers on lumber from the start
(lumber_workers_pct), and do not spend lumber on tech the army cannot use yet: the Lumber Mill when you want archers
(~2:00-3:00), the Blacksmith after about 6 fighters. THE TIER RACE: the enemy has weapon and armor upgrades by
6:40 and ogres (about a knight each) from about 9:30, so get weapons1 and shields1 before any push, the Keep started
by about 8:00-10:00 (it costs more than a minute of income: put it in reserve_for, or it never comes up), then
Stables and knights, and 2 ballistas with the main push. income shows gold and lumber per minute; since_last_plan
lists starved_goals (goals that could not be paid for a minute or more: reserve for them or drop them). Train
workers to 20-30 by about 10:00 between the fighters, never instead of them. Keep every barracks training without a gap (gold
banked above 1000, or food capped, is army not built), weapon/armor upgrades, then
the Keep, Stables and knights/ogres, and a ballista/catapult or two against towers. Its waves come to you: beat a wave
at home next to your towers, then counter-attack at once, while its army is dead or still walking back (the next
wave needs 2 minutes to gather). An attack of 12+ units with upgrades and a few ranged units usually breaks its base;
keep reinforcing it instead of pulling everything home. DEFENCE: at least 2 towers (scout tower, upgraded to Guard
Tower) on the OUTSKIRTS of the base where the enemy comes in - placement {"scout_tower": ["front", "mine"]} (the mine
side facing the approach), never tucked behind the hall - by about 6:00-8:00, and more as the base grows. Trained units wait at
the rally point (default "front", at the edge of the base facing the approach, just behind those towers), so every
wave meets the whole army and the towers together before it reaches the workers. Fight there; do not chase a beaten
wave across the map with a small army. Before the army leaves, have a home_guard of 3-5 units: the computer raids
the workers with 3-9 grunts while our army is away, and losing the workers loses the game. Army orders are carried
out over several seconds: give one and let it work (the same order is locked for 10 s; re-ordering a fight cancels
the blows about to land). To WIN, push with coordination: send the whole army above
the guard together (attack:base gathers it first). While a wave is out, attack:base sends new units to JOIN it
(they walk there alone: a packet under about 5 crossing the map meets the enemy's next wave and dies, so set
reinforce_min). An army that just beat an enemy wave in the field should push on, not come home. Bring ballistas
against towers and buildings, and keep the attack going building by building until every enemy building is gone.
attackWaves shows each wave out: members, where, route left, fights, enemies near.
What you see: the MAP (below the catalog: a coarse terrain grid, the ground route to the enemy, its chokes, the
expansions); every turn the observation adds enemySeen (visible enemy groups with heading, speed and arrival time),
incoming (enemy groups moving at our base, arriving within 90 s), supply (free food, farms going up, how long a
full food cap has blocked training, what the next farm still needs), fights (our groups in contact: health, enemies,
wounded) and enemyLastSeen (types seen in the last 2 minutes). Army orders work on groups, not single units:
attack:base / attack:nearest / attack:expansion (the whole free army), harass:workers (a squad of the 5 fastest free
units raids the enemy's gold line, the rest stay), hold:choke (the free army stands at the choke on the route
nearest our base), defend / retreat (everything home, fighting or not), pull_wounded (units under 40% health in a
fight run home), workers:evacuate / workers:resume (workers near raiders at our base step behind the hall, and go
back). Fighting itself is automatic: units pick targets, and casters cast their researched spells. The observation
also has enemyWaves (the enemy attacks on our base so far: when, how big, the usual gap), etaHomeSeconds per army
group, settings (our lumber share, home guard and placement now) and baseLayout. An incoming or enemySeen count is only what is visible:
a raid is often bigger than its first sighting. raidersAtBase counts enemy fighters anywhere in our base (near any of
our buildings or workers); defend sends the units at home at them."""

PLANNER_SYS = RULES_DIGEST + """

You are the strategic planner. You are called every 90 game seconds and on events. The decision model (Jev) then
picks one action per game second from the legal actions your plan allows, so your plan must say what to own, what may
be bought, what to save for, and when the army fights. Reply with ONLY a JSON object:
{"assessment": "<first, in at most 3 sentences: the enemy's likely next move and when (enemyWaves), our defenders at home vs
                   that threat, the army's ETA home, what blocks our economy (food, lumber, idle producers), what
                   went wrong since the last plan>",
 "strategy": "<one or two sentences>",
 "goals": [["<action key>", <total count to own, counting those already owned or under way>], ...],
                        // e.g. ["build:barracks", 2], ["train:footman", 10], ["research:weapons1", 1]; 3 to 12 entries;
                        // an option whose goal count is reached is hidden from Jev
 "allowed_spending": ["<action key or prefix>", ...],
                        // everything Jev may buy (prefixes like "train:" allowed); anything else is hidden.
                        // Include the workers, farms, tech prerequisites and army production this plan needs,
                        // and every goal. Tiny lists or caps stall Jev: set headroom for the next 2-3 minutes.
                        // Under attack, basic fighters and towers are offered whatever this list says.
 "priority_action": "<action key or null>",   // the MAIN ORDER: taken first whenever it is possible
 "worker_target": <int>,                       // workers stay on offer until we have this many (the native AI runs
                                               // 5 -> 13 -> 18 -> 30 over a game)
 "reserve_for": "<action key or null>",        // money for this is kept back: nothing else may dip into it
 "army_posture": "defend" | "attack" | "hold",
 "attack_min_army": <int>,                     // attacks are hidden while the free army is smaller (the AI's waves
                                               // are 4, 7, then 16 units; 10 to 20 is usually right)
 "retreat_below_army": <int>,                  // retreat is offered when an attacking army falls below this
 "min_posture_seconds": <int>,                 // how long a posture holds before it may flip (30 to 90)
 "lumber_workers_pct": <int or null>,          // share of the workers cutting lumber, 0-90 (the rest mine gold);
                                               // null = automatic from the stocks. Lumber trips are ~4x slower than
                                               // gold, so a tech/farm/tower phase needs 50-70%; with few workers and
                                               // no gold for the next worker, 0 puts everyone on gold
 "reinforce_min": <int>,                       // while a wave is out, new units join it in packets of at least this
                                               // many (default 5)
 "home_guard": <int>,                          // fighting units kept at home whenever the army is sent out (0-12);
                                               // they defend the workers against raids while the main army attacks
 "rally": "<zone>" | [x, y] | "off",           // where idle trained units stand at home (default "front": the
                                               // edge of the base facing the enemy's approach)
 "placement": {"<building type>": "<zone>" | ["<zone>", ...] | [x, y]}}  // where new buildings go, by the type in
                                               // build:<type>; a list spreads them (each goes to the listed zone
                                               // with the fewest of that type); a zone
                                               // from baseLayout (front, back, left, right, mine, woods, hall) or a
                                               // tile; "auto" = the default spot. Each placement replaces the last;
                                               // leave it out to keep the current one
A plan filters Jev's options for 180 game seconds; after that, until a new plan, nothing is filtered. A change of
army posture that can be carried out takes priority over unfinished production goals: attack once ready, then
replace losses; goal counts are replenishment ceilings, not a build order. Nothing is built automatically except a
farm when food is nearly full (up to two at a time); idle workers and repairs are handled by code, and the
gold/lumber split follows your lumber_workers_pct. A builder pays when it reaches its site: money promised to
builders on their way (promisedToBuilders) is not free, and a building whose builder could not pay is listed in
buildsFailed - order it again. Towers on the outskirts (scout tower, then Guard Tower) with a home guard stop raids
on the workers while the army is away; the enemy raids with 3-9 melee units. You choose where buildings stand with placement:
baseLayout lists our base's zones (front faces enemyComesFrom, left/right as seen facing it), the buildings in each,
and whether a 2x2 (room2) or 3x3 (room3) still fits. By default a tower goes to the front or the mine side, farms
fill an outer ring and other buildings pack in near the hall. A tower far out alone is picked off; one inside a
crowded base covers little. Spread buildings so workers and the army can move.
Use ONLY action keys from the catalog below (or prefixes such as "train:"). Whether a key is possible now depends on
the buildings, tech and money in the observation; goals may name what is not possible yet, and should list what
unlocks it first.
This is one running conversation for the whole game: your earlier plans and the messages before them are above.
Each new message carries only what changed: the current observation, since_last_plan (events, and the actions
carried out or failed since your last plan) and the army orders possible now. It may carry last_plan_rejection:
fix what it names. After a restart the first message carries game_so_far (your earlier strategies) and
plan_in_force.
THINK BEFORE YOU ANSWER. Every plan decides the next few minutes of a real-time game, so reason it through before
writing the JSON: (1) what the enemy has and will most likely do in the next 2-3 minutes (its schedule, what was seen,
what is incoming); (2) where our economy stands (workers, gold/lumber income, idle production, banked money) and what
it can afford by then; (3) whether our army should attack now, counter-attack after a wave, hold or defend, and at what
size; (4) which building, upgrade or tier unlocks the next step, and what must be kept back for it; (5) what went wrong
since the last plan (failed actions, losses) and how this plan fixes it. Then write the plan."""

PROD_KINDS = ('train', 'build', 'research', 'expand')
ARMY_KINDS = ('attack', 'defend', 'retreat', 'hold', 'harass', 'scout', 'pull_wounded', 'repair', 'workers')
JEV_PRODUCTION = ("What to start now: one unit, one building or one research. Priorities: survival and food "
                  "(a farm when food is nearly full); the option marked MAIN ORDER; critical production (troops while "
                  "the computer attacks every few minutes, an idle barracks is lost army); then economy and optional "
                  "upgrades. Follow strategic_plan and respect its reserve item. Choose wait only for a concrete "
                  "reason: saving for the reserve item or the main order, or nothing useful is affordable.")
JEV_ARMY = ("What the army does now (production goes on regardless). Keep the current orders unless something calls "
            "for a change: an enemy force incoming or attacking (bring home units that are away, or hold the choke "
            "before it arrives), a losing fight (pull the wounded, or retreat), a tower or the hall going down under attack "
            "(repair it under fire, which costs gold and lumber and puts workers at risk), or the plan's posture is attack and "
            "the army is big enough. Enemy counts cover what is visible or recently seen; unseen forces are "
            "unknown, not absent.")


class Budget:
    def __init__(self, cap): self.cap, self.spent, self.calls = cap, 0.0, {}
    def add(self, who, cost):
        self.spent += cost or 0.0; c = self.calls.setdefault(who, [0, 0.0]); c[0] += 1; c[1] += cost or 0.0
    def left(self): return self.cap - self.spent


def matches(key, prio):
    return bool(prio) and (key == prio or (prio.endswith(':') and key.startswith(prio)) or (prio.endswith('*') and key.startswith(prio[:-1])))


def costs_of(c): return {k: v for k, v in (c or {}).items() if v}


class Player:
    def __init__(self, a, key, budget, log, trace):
        self.a, self.key, self.budget, self.log, self.trace = a, key, budget, log, trace
        self.plan = None; self.plan_t = -1e9; self.plan_id = 0; self.rejection = None
        self.events = []; self.outcomes = []; self.cooldown = {}; self.last_fail = {}; self.fail_run = 0
        self.vocab = {}; self.cost = {}; self.catalog_lines = ''; self.worker_key = 'train:worker'; self.fighters = set()
        self.posture = 'defend'; self.posture_t = -1e9; self.map_text = ''
        self.notes = []          # chat notes for the game (they end up in the replay)
        self.convo = []; self.convo_t = -1; self.history = []; self.starve = {}; self.prio_status = None; self.home_order = (None, -99); self.last_army = {}    # Astra's running conversation; a line per plan
        self.scout_t = -1e9; self.forced_run = 0; self.stats_at_plan = None
        self.PLAN_TTL = 180                      # game seconds a plan filters for (JEV-Star)

    # ---- the action catalog (static for a game: it goes in the cached system prompt)
    def set_catalog(self, cat, race):
        self.worker_key = 'train:' + ('worker' if race == 'human' else 'peon')
        lines = []
        def fmt(c): return ', '.join(f'{v} {k}' for k, v in costs_of(c).items()) or 'free'
        for u in cat['units']:
            k = 'train:' + u['type']; self.vocab[k] = u['role']; self.cost[k] = costs_of(u['cost'])
            if u['role'] != 'worker' and 'barracks' in u['trainedAt']: self.fighters.add(k)
            lines.append(f"{k}: {u['role']}; {fmt(u['cost'])}; trained at {u['trainedAt']}" + (f"; needs {', '.join(u['requires'])}" if u['requires'] else ''))
        for b in cat['buildings']:
            if b['upgradeOf'] or b['role'] in ('hall', 'wall'): continue
            k = 'build:' + b['type']; self.vocab[k] = b['role']; self.cost[k] = costs_of(b['cost'])
            lines.append(f"{k}: {b['role']}; {fmt(b['cost'])}" + (f"; needs {', '.join(b['requires'])}" if b['requires'] else ''))
        hall = next((b for b in cat['buildings'] if b['role'] == 'hall'), None)
        for u in cat['upgrades']:
            k = 'research:' + u['id']; self.vocab[k] = u['label'] or u['id']; self.cost[k] = costs_of(u['cost'])
            lines.append(f"{k}: {u['label'] or u['id']}; {fmt(u['cost'])}; at {u['at']}" + (f"; needs {', '.join(u['requires'])}" if u['requires'] else ''))
        extra = {'expand': 'a new hall at the nearest free gold mine' + (f" ({fmt(hall['cost'])})" if hall else ''),
                 'attack:base': 'the free army gathers, then attacks the enemy base', 'attack:nearest': 'the army attacks the nearest known enemy',
                 'attack:sea': 'the fleet attacks enemy ships and coast',
                 'defend': 'the army comes home: units far out march without stopping, then fight within 15 tiles of the hall',
                 'workers:evacuate': 'workers near enemy fighters at our base stop gathering and run toward our army if it is out (the chasers meet it), else away past the hall; they go back on their own once the raiders are gone',
                 'workers:resume': 'evacuated workers go back to gathering now',
                 'retreat': 'every unit runs home without fighting (disengage)', 'scout:enemy_base': 'one fast unit looks at the enemy base',
                 'scout:expansions': 'one fast unit tours the other gold mines', 'wait': 'start nothing this second',
                 'attack:expansion': 'the free army attacks a known enemy expansion (a hall away from their start)',
                 'harass:workers': "a squad of the 5 fastest free units raids the enemy's workers at their gold mine; the rest stay",
                 'hold:choke': 'the free army stands at the choke on the ground route nearest our base',
                 'pull_wounded': 'units under 40% health that are in a fight run home; the rest keep fighting',
                 'repair:under_fire': 'the nearest 2 workers (3 for the hall) repair a building while enemies attack it, towers '
                                      'first (the automatic repair only starts once no enemy is near)'}
        if hall: self.cost['expand'] = costs_of(hall['cost'])
        for k, v in extra.items(): self.vocab[k] = v; lines.append(f'{k}: {v}')
        self.catalog_lines = '\n'.join(sorted(lines))

    def system_prompt(self):
        # byte-identical for the whole game and first in the request, so the provider's prompt cache serves it
        # (the map is static for a game, so it sits in this cached prefix too)
        return PLANNER_SYS.replace('every 90 game seconds', f'every {int(self.a.plan_every)} game seconds') + '\n\nACTION CATALOG (key: what it is; cost; where; prerequisites):\n' + self.catalog_lines + self.map_text

    def set_map(self, terr):
        if not terr: return
        t = dict(terr); grid = t.pop('grid')
        self.map_text = ('\n\nMAP (static for this game; tile coordinates, x to the right, y down):\n' + '\n'.join(grid) + '\n' + json.dumps(t))

    def call(self, who, path, body, t, timeout=180):
        t0 = time.time(); r = post(path, body, self.key, timeout=timeout); secs = round(time.time() - t0, 2)
        u = usage_of(r)
        self.trace({'kind': 'call', 'who': who, 't': t, 'model': body.get('model'), 'gen_id': r.get('id'), 'secs': secs, 'usage': u, 'request': body, 'response': r})
        return r, u, secs

    # the plan's building placement: {type: zone | [x, y] | 'auto'}, types as in build:<type>; None = no change
    ZONES = ('front', 'back', 'left', 'right', 'mine', 'woods', 'hall', 'auto')
    def placement(self, raw, errs):
        if not isinstance(raw, dict): return None
        out = {}
        for k, v in raw.items():
            if not isinstance(k, str) or 'build:' + k.removeprefix('build:') not in self.vocab: errs.append(f'unknown building in placement: {k!r}'); continue
            k = k.removeprefix('build:')
            if isinstance(v, str) and v in self.ZONES: out[k] = v
            elif isinstance(v, (list, tuple)) and len(v) == 2 and all(isinstance(n, (int, float)) for n in v): out[k] = [int(v[0]), int(v[1])]
            elif isinstance(v, (list, tuple)) and v and all(n in self.ZONES[:-1] for n in v): out[k] = list(v)[:6]
            else: errs.append(f'bad placement for {k}: {v!r}')
        return out

    # ---- plan validation (JEV-Star validate_plan): keys from the catalog, sane numbers
    def validate(self, p):
        errs = []
        if not isinstance(p, dict): return None, ['the reply is not a JSON object']
        known = lambda k: isinstance(k, str) and (k in self.vocab or (k.endswith(':') and any(v.startswith(k) for v in self.vocab)))
        goals = []
        for g in p.get('goals') or []:
            if isinstance(g, dict): g = [g.get('key'), g.get('count')]
            if not (isinstance(g, (list, tuple)) and len(g) == 2 and g[0] in self.vocab and isinstance(g[1], (int, float))): errs.append(f'bad goal {g!r}'); continue
            goals.append([g[0], int(g[1])])
        allowed = [k for k in (p.get('allowed_spending') or []) if known(k)]
        allowed += [g[0] for g in goals if not any(matches(g[0], a) for a in allowed)]
        bad = [k for k in (p.get('allowed_spending') or []) if not known(k)]
        if bad: errs.append(f'unknown keys in allowed_spending: {bad}')
        if not allowed: errs.append('allowed_spending is empty')
        pa = p.get('priority_action')
        if pa is not None and pa not in self.vocab: errs.append(f'unknown priority_action {pa!r}'); pa = None
        rf = p.get('reserve_for')
        if rf is not None and rf not in self.vocab: errs.append(f'unknown reserve_for {rf!r}'); rf = None
        posture = p.get('army_posture') if p.get('army_posture') in ('defend', 'attack', 'hold') else 'defend'
        num = lambda k, lo, hi, d: max(lo, min(hi, int(p[k]))) if isinstance(p.get(k), (int, float)) else d
        plan = {'assessment': str(p.get('assessment') or '')[:500], 'strategy': str(p.get('strategy') or '')[:400], 'goals': goals, 'allowed_spending': allowed, 'priority_action': pa,
                'worker_target': num('worker_target', 3, 40, 14), 'reserve_for': rf, 'army_posture': posture,
                'attack_min_army': num('attack_min_army', 1, 80, 12), 'retreat_below_army': num('retreat_below_army', 0, 60, 4),
                'min_posture_seconds': num('min_posture_seconds', 0, 300, 45),
                'lumber_workers_pct': (max(0, min(90, int(p['lumber_workers_pct']))) if isinstance(p.get('lumber_workers_pct'), (int, float)) else None),
                'home_guard': num('home_guard', 0, 12, 3), 'reinforce_min': num('reinforce_min', 1, 20, 5),
                'placement': self.placement(p.get('placement'), errs),
                'rally': (p['rally'] if p.get('rally') in self.ZONES[:-1] + ('off',) else [int(p['rally'][0]), int(p['rally'][1])] if isinstance(p.get('rally'), (list, tuple)) and len(p['rally']) == 2 and all(isinstance(n, (int, float)) for n in p['rally']) else None)}
        # a plan with some broken keys is still used when its core survived; one without spending rules is not
        return (plan if allowed else None), errs

    # ---- planner (a chat model; JSON out). One running conversation per game, so the provider's prompt cache holds
    # everything said before: the system prompt (rules, catalog, map), then each earlier user message (only what changed
    # since the plan before it) and Astra's own replies. Each call adds a small delta. Every CONVO_MAX plans the
    # conversation restarts with a short "game so far" summary, so the cached history stays bounded.
    CONVO_MAX = 6
    REPEAT_LOCK = ('attack:nearest', 'defend', 'retreat', 'workers:evacuate', 'workers:resume', 'pull_wounded', 'hold:choke', 'attack:expansion', 'harass:workers')

    def astra_obs(self, obs):
        # the map-level fields are in the cached system prompt already
        return {k: v for k, v in obs.items() if k not in ('mapSummary', 'fogNote', 'home', 'foeStart', 'mapSize')}

    def since_last_plan(self, obs):
        ev = [e for e in self.events if e['t'] >= self.convo_t]
        outs = [o for o in self.outcomes if o['t'] >= self.convo_t]
        done = {}; fails = {}
        for o in outs:
            for q, r in (o.get('results') or {}).items():
                if not r or r in ('wait', 'keep'): continue
                if 'failed' in str(r) or str(r).startswith('not offered'): fails[str(r)] = fails.get(str(r), 0) + 1
                else: done[r] = done.get(r, 0) + 1
        st = obs.get('stats') or {}; st0 = self.stats_at_plan or {}
        fight = {k: st.get(k, 0) - st0.get(k, 0) for k in ('kills', 'lost', 'razed')}
        self.stats_at_plan = dict(st)
        out = {'events': ev, 'fighting': fight, 'actions_done': done, 'actions_failed': fails}
        starved = self.starved_goals(obs)
        if starved: out['starved_goals'] = starved
        if self.prio_status: out['priority_status'] = self.prio_status
        return out

    # goals not yet owned whose cost the bank has not covered for 60 s or more: without reserve_for they never come up
    def starved_goals(self, obs):
        t = obs['time']; counts = obs.get('counts', {}); inc = obs.get('income') or {}; out = []
        bank = {'gold': obs['gold'], 'lumber': obs['lumber'], 'oil': obs['oil']}
        for k, n in (self.plan or {}).get('goals', []):
            c = self.cost.get(k) or {}
            short = {r: v - bank.get(r, 0) for r, v in c.items() if v > bank.get(r, 0)}
            if counts.get(k, 0) >= n or not short: self.starve.pop(k, None); continue
            t0 = self.starve.setdefault(k, t)
            if t - t0 >= 60:
                rate = {'gold': inc.get('goldPerMin') or 0, 'lumber': inc.get('lumberPerMin') or 0}
                need = max((v / rate[r] * 60 if rate.get(r) else 999) for r, v in short.items())
                out.append({'key': k, 'cost': c, 'short': short, 'unaffordable_for_s': t - t0, 'saving_needs_s': round(need), 'hint': 'put it in reserve_for, or drop it'})
        return out

    def make_plan(self, obs, legal, reason):
        u, cost, secs, thinking = {}, 0.0, 0.0, ''
        if self.a.planner == 'none':
            raw = {'strategy': 'no planner: everything allowed', 'allowed_spending': ['train:', 'build:', 'research:', 'expand'], 'worker_target': 18,
                   'army_posture': 'attack', 'attack_min_army': 12, 'retreat_below_army': 4, 'min_posture_seconds': 45}
            plan, errs = self.validate(raw)
        elif self.a.planner == 'scripted':        # a fixed plan for offline tests of the loop (no API calls)
            k = lambda kind, role: next((key for key, v in self.vocab.items() if key.startswith(kind + ':') and v == role), None)
            late = obs['time'] > 420; bk = k('build', 'barracks')
            raw = {'strategy': 'scripted: barracks, mill, smith, a footman/archer army, attack at 12',
                   'goals': [g for g in [[k('build', 'farm'), 1], [bk, 2 if late else 1], [k('build', 'mill'), 1], [k('build', 'smith'), 1], [k('train', 'footman'), 10], [k('train', 'archer'), 6]] if g[0]],
                   'allowed_spending': ['train:', 'build:', 'research:'], 'priority_action': k('build', 'farm') if not obs['counts'].get(k('build', 'farm')) else bk if obs['counts'].get(bk, 0) == 0 else None,
                   'worker_target': 16, 'reserve_for': None, 'army_posture': 'attack' if late else 'defend', 'attack_min_army': 12, 'retreat_below_army': 4, 'min_posture_seconds': 45}
            plan, errs = self.validate(raw)
            self.history.append(f"{obs['time'] // 60}:{obs['time'] % 60:02d} {reason}: {raw['strategy']}")
        else:
            if self.budget.left() < self.a.plan_reserve:
                self.log({'kind': 'plan_skipped', 't': obs['time'], 'reason': reason, 'why': f'budget left ${self.budget.left():.3f}'}); self.plan_t = obs['time']; return
            # restart: bounded history (not during a threat at home: the crisis plan needs the conversation)
            if len(self.convo) >= 2 * self.CONVO_MAX and (not (obs.get('underAttack') or obs.get('incoming')) or len(self.convo) >= 16): self.convo = []
            user = {'t': obs['time'], 'why_now': reason}
            if not self.convo:                    # the first message of a conversation carries the story so far
                if self.history: user['game_so_far'] = self.history[-12:]
                if self.plan: user['plan_in_force'] = self.plan
            user.update({'observation': self.astra_obs(obs), 'since_last_plan': self.since_last_plan(obs),
                         'army_orders_possible_now': [k for k in self.options(obs, legal)[1] if k != 'keep']})
            if self.rejection: user['last_plan_rejection'] = self.rejection
            # GPT-6 reasoning is adaptive: a per-turn nudge in the user message makes it actually think (and keeps the cache)
            user['before_you_answer'] = ('Think it through step by step before writing the JSON: the enemy\'s next 2-3 minutes, our economy '
                                         'and what it affords, attack/counter-attack/hold/defend and at what size, the next tier and what '
                                         'to save for, and what went wrong since the last plan.')
            umsg ={'role': 'user', 'content': json.dumps(user, separators=(',', ':'))}
            body = {'model': self.a.planner, 'messages': [{'role': 'system', 'content': self.system_prompt()}] + self.convo + [umsg],
                    'response_format': {'type': 'json_object'}, 'max_tokens': 1200 if self.a.effort in (None, '', 'low', 'minimal', 'none') else 4000, 'usage': {'include': True}}
            if self.a.effort: body['reasoning'] = {'effort': self.a.effort}
            if self.a.planner.startswith(('anthropic/', '~anthropic/')):   # Claude: adaptive thinking; no json mode; caching must be asked for
                body.pop('response_format'); body['cache_control'] = {'type': 'ephemeral'}
                body['max_tokens'] = 3000 if self.a.effort in (None, '', 'low', 'minimal', 'none') else 12000
            r, u, secs = self.call('astra', '/v1/chat/completions', body, obs['time'])
            cost = u['cost'] or 0.0; self.budget.add('planner', cost)
            msg = r['choices'][0]['message']; txt = msg.get('content') or ''
            thinking = msg.get('reasoning') or ''
            if not thinking and msg.get('reasoning_details'): thinking = '\n'.join(str(d.get('summary') or d.get('text') or '') for d in msg['reasoning_details'] if isinstance(d, dict))
            try: raw = json.loads(txt[txt.find('{'): txt.rfind('}') + 1])
            except Exception: raw = None
            plan, errs = self.validate(raw) if raw is not None else (None, ['the reply was not valid JSON (maybe cut off)'])
            self.convo += [umsg, {'role': 'assistant', 'content': txt}]      # byte-identical next time: the cache prefix
            self.convo_t = obs['time']
            self.history.append(f"{obs['time'] // 60}:{obs['time'] % 60:02d} {reason}: " + (str((raw or {}).get('strategy'))[:160] if plan else 'plan rejected'))
        self.rejection = '; '.join(errs) if errs else None
        if plan: self.plan = plan; self.plan_id += 1
        self.plan_t = obs['time']
        self.log({'kind': 'plan', 't': obs['time'], 'reason': reason, 'plan': self.plan, 'accepted': bool(plan), 'rejection': self.rejection, 'cost': cost, 'secs': secs, 'usage': u,
                  'thinking': (thinking or '')[:3000] if self.a.planner not in ('none', 'scripted') else None,
                  'convo_messages': len(self.convo)})
        p = self.plan or {}
        self.notes.append({'who': 'astra', 'kind': 'plan', 'title': 'plan' + ('' if plan else ' REJECTED, old plan kept') + (f' ({self.a.planner})' if self.a.planner in ('none', 'scripted') else ''),
                           'reason': reason + (f' | rejection: {self.rejection}' if self.rejection else ''), 'strategy': p.get('strategy'),
                           'priorities': [f'{g[0]} x{g[1]}' for g in p.get('goals', [])], 'attack_at': p.get('attack_min_army'), 'workers_target': p.get('worker_target'),
                           'save_for': p.get('reserve_for'), 'stance': f"{p.get('army_posture')}; main order {p.get('priority_action')}; allowed {', '.join(p.get('allowed_spending', []))}",
                           'cost': cost, 'secs': secs, 'thinking': (thinking or '')[:4000],
                           'tokens': {'in': u.get('in'), 'cached': u.get('cached'), 'out': u.get('out'), 'reasoning': u.get('reasoning')} if u else None})

    # ---- the policy filter (JEV-Star policy_reason): which legal actions the plan lets Jev choose, in two groups:
    # production (train, build, research, expand) and army orders. Options that would change nothing are hidden too.
    def options(self, obs, legal):
        p = self.plan or {}; counts = obs.get('counts', {}); t = obs['time']
        bank = {'gold': obs['gold'], 'lumber': obs['lumber'], 'oil': obs['oil']}
        used, cap = (int(x) for x in obs['food'].split('/'))
        groups = obs['armyGroups']
        # (the game counts it per unit: a group with one wave member no longer drops out whole, ships do not count)
        free_army = obs['freeArmy'] if 'freeArmy' in obs else sum(g['n'] for g in groups if 'in attack wave' not in g['order'])
        attacking = sum(g['n'] for g in groups if 'in attack wave' in g['order'] or g['order'].get('attackMove'))
        # (a group already walking home is not 'away': defend is not offered again every second on its way)
        away = [g for g in groups if (g.get('fromHome') or 0) > 10 and (set(g['order']) != {'returning home'} or (g.get('fromHome') or 0) > 25)]
        raiders = obs.get('raidersAtBase') or 0
        threat = bool(obs['underAttack'] or obs.get('incoming') or raiders)
        barracks = sum(counts.get(b, 0) for b, v in self.vocab.items() if v == 'barracks' and b.startswith('build:'))
        joining = any(x['key'] == 'attack:base' and 'JOIN' in x['label'] for x in legal)
        pa = p.get('priority_action'); legal_keys = {x['key'] for x in legal}
        rf = p.get('reserve_for')
        reserve = self.cost.get(rf) if rf and counts.get(rf, 0) == 0 else None
        goal = {g[0]: g[1] for g in p.get('goals', [])}
        hold = lambda: t - self.posture_t < p.get('min_posture_seconds', 45)
        prod, army, masked = {}, {}, {}
        # JEV-Star (strategic_policy.policy_reason): a plan older than its time to live filters nothing; under an
        # emergency basic fighters and towers stay on offer whatever the plan says (the whitelist, goal counts and the
        # reservation do not apply to them), as does the barracks when we have none; an urgent farm is always offered
        live = bool(self.plan) and t - self.plan_t <= self.PLAN_TTL
        emergency = bool(obs['underAttack'] or any(i['n'] >= 3 for i in obs.get('incoming') or []))
        has_barracks = any(counts.get(b, 0) for b, v in self.vocab.items() if v == 'barracks' and b.startswith('build:'))
        for x in legal:
            k = x['key']; kind = k.split(':')[0]; why = None
            if k == 'wait': continue
            if self.cooldown.get(k, -1) > t: why = f"failed a moment ago ({self.last_fail.get(k)})"
            elif kind in PROD_KINDS and live:
                role = self.vocab.get(k)
                farm_pending = counts.get(k, 0) * 4 + 1 > cap        # a farm under way already brings the food
                urgent = (role == 'farm' and used >= cap - 2 and not farm_pending) or \
                         (emergency and (k in self.fighters or (kind == 'build' and role == 'scout'))) or \
                         (role == 'barracks' and kind == 'build' and not has_barracks)
                if k == self.worker_key and obs['workers']['total'] >= p.get('worker_target', 14): why = f"worker target {p.get('worker_target')} reached"
                elif urgent: pass
                elif not any(matches(k, s) for s in p.get('allowed_spending', [])): why = 'not allowed by the plan'
                elif k in goal and counts.get(k, 0) >= goal[k]: why = f'goal {goal[k]} reached'
                elif role == 'farm' and cap - used >= 6 + 2 * barracks: why = f'{cap - used} food free already'
                elif reserve and k != rf and any(self.cost.get(k, {}).get(r, 0) > 0 and bank.get(r, 0) - self.cost[k][r] < v for r, v in reserve.items()):
                    why = f'would spend the reserve for {rf}'
            elif k.startswith('attack:') and live:
                defensive = obs['underAttack'] and k == 'attack:nearest'
                if p.get('army_posture') != 'attack' and not defensive: why = f"posture is {p.get('army_posture')}"
                elif k == 'attack:base' and joining:
                    if free_army < p.get('reinforce_min', 5): why = f"free army {free_army} is below the reinforcement size {p.get('reinforce_min', 5)}"
                elif k != 'attack:sea' and free_army < p.get('attack_min_army', 12) and not defensive: why = f"free army {free_army} is below the attack size {p.get('attack_min_army')}"
                elif self.posture != 'attack' and hold() and not defensive: why = 'posture held'
            elif k == 'hold:choke':
                if free_army < 3: why = 'fewer than 3 free units'
            elif k in self.REPEAT_LOCK and t - self.last_army.get(k, -99) < 10:
                why = f'{k} was ordered {t - self.last_army[k]} s ago and is being carried out (re-ordering a fight cancels the blows about to land)'
            elif k in ('workers:evacuate', 'workers:resume') and t - self.last_army.get('workers:resume' if k == 'workers:evacuate' else 'workers:evacuate', -99) < 20:
                why = 'the opposite worker order was given less than 20 s ago'
            elif k in ('retreat', 'defend') and self.home_order[0] not in (None, k) and t - self.home_order[1] < 20:
                why = f'{self.home_order[0]} was ordered {t - self.home_order[1]} s ago'
            elif k == 'retreat' and live:
                if not away: why = 'nobody is away from home'
                elif p.get('army_posture') == 'attack' and attacking >= p.get('retreat_below_army', 4) and not obs['underAttack']: why = f"attacking army {attacking} is not below {p.get('retreat_below_army')}"
                elif self.posture == 'attack' and hold(): why = 'posture held'
            elif k == 'defend':
                # units at home already fight whatever attacks the base (the strike-back reflex): defend only calls back
                # the ones that are away
                if not away and not raiders: why = 'the army is home: it fights attackers there on its own'
                elif not threat: why = 'no threat to the base'
            elif kind == 'scout':
                if t - self.scout_t < 15: why = 'a scout was sent less than 15 s ago'
            if why: masked[k] = why; continue
            have = (f" (we have {counts.get(k, 0)}" + (f", goal {goal[k]})" if k in goal else ')')) if kind in PROD_KINDS else ''
            # (one MAIN ORDER: the plan's priority_action; the posture's attack only when that is not on offer)
            main = k == pa or ((not pa or pa not in legal_keys or pa in masked) and live and k == 'attack:base' and p.get('army_posture') == 'attack'
                               and self.posture != 'attack' and free_army >= p.get('attack_min_army', 12) and not joining)
            label = x['label'] + have + (' — MAIN ORDER' + (': apply the army posture now; unfinished production is not a prerequisite' if kind == 'attack' else '') if main else '') + \
                (' — the reserve item' if k == rf else '') + (' — not in the plan, offered because of the emergency' if live and kind in PROD_KINDS and not any(matches(k, s) for s in p.get('allowed_spending', [])) else '')
            (prod if kind in PROD_KINDS else army)[k] = label
        if prod: prod['wait'] = 'Start nothing this second (save up)'
        # (keep is no answer while raiders are in the base and an order against them is on offer)
        if army and not (raiders >= 2 and ('defend' in army or 'attack:nearest' in army)): army['keep'] = 'Keep the current army orders'
        if pa: self.prio_status = {'key': pa, 'offered_now': pa in prod or pa in army, 'masked_because': masked.get(pa) or (None if pa in legal_keys else 'not possible in the game now')}
        return prod, army, masked

    # ---- decider: up to two typed Choice questions in one Jev call, production and army; a question with nothing
    # to choose is left out, and a turn with neither makes no call
    def decide(self, obs, legal):
        prod, army, masked = self.options(obs, legal)
        qs = {}
        if prod: qs['production'] = {'type': 'choice', 'instructions': JEV_PRODUCTION, 'criteria': prod}
        if army: qs['army'] = {'type': 'choice', 'instructions': JEV_ARMY, 'criteria': army}
        offers = {'production': prod, 'army': army}
        if not qs:
            self.forced_run += 1
            return {}, 0.0, 0.0, offers, masked
        self.forced_run = 0
        p = self.plan or {}; counts = obs.get('counts', {})
        state = {'observation': obs, 'strategic_plan': p,
                 'plan_progress': {'goals_remaining': [f'{k}: have {counts.get(k, 0)} of {n}' for k, n in p.get('goals', []) if counts.get(k, 0) < n], 'reserve_for': p.get('reserve_for')},
                 'masked_options': masked, 'recent_outcomes': self.outcomes[-6:]}
        cost, secs, u = 0.0, 0.0, {}
        if self.a.decider == 'scripted':         # offline and after the budget: a fixed order of preference; army: pull
            ans = {}                              # the wounded, meet a threat, attack when allowed, else keep
            if prod:
                # the main order, a farm, a worker, the first unmet goal, then any fighting unit; else wait
                goals = [k for k, n in p.get('goals', []) if counts.get(k, 0) < n]
                fighters = [k for k in prod if k.startswith('train:') and k != self.worker_key]
                early = [self.worker_key] if obs['workers']['total'] < 8 else []
                order = [p.get('priority_action')] + [k for k in prod if self.vocab.get(k) == 'farm'] + early + goals + fighters + [self.worker_key]
                ans['production'] = {'choice': next((k for k in order if k in prod), 'wait')}
            if army:
                pick = next((o for o in ['pull_wounded', 'repair:under_fire', 'defend', 'hold:choke', 'attack:base'] if o in army and (o != 'hold:choke' or obs.get('incoming'))), 'keep')
                ans['army'] = {'choice': pick}
        elif self.a.decider.startswith('typesafe/'):
            r, u, secs = self.call('jev', '/alpha/decisions', {'model': self.a.decider, 'state': state, 'questions': qs}, obs['time'], timeout=60)
            cost = u['cost'] or 0.0; self.budget.add('decider', cost)
            ans = {q: {'choice': a.get('choice'), 'p': a.get('probabilities'), 'conf': a.get('confidence')} for q, a in (r.get('answers') or {}).items() if q in qs}
        else:
            prompt = ('State:\n' + json.dumps(state) + '\n\nAnswer each question with one option key.\n' + json.dumps({q: {'instructions': v['instructions'], 'options': v['criteria']} for q, v in qs.items()}) +
                      '\nReply with ONLY JSON: {' + ', '.join(f'"{q}": "<option key>"' for q in qs) + '}')
            r, u, secs = self.call('decider', '/v1/chat/completions', {'model': self.a.decider, 'messages': [{'role': 'user', 'content': prompt}], 'response_format': {'type': 'json_object'}, 'max_tokens': 300, 'usage': {'include': True}}, obs['time'], timeout=90)
            cost = u['cost'] or 0.0; self.budget.add('decider', cost)
            txt = r['choices'][0]['message'].get('content') or '{}'
            try: j = json.loads(txt[txt.find('{'): txt.rfind('}') + 1])
            except Exception: j = {}
            ans = {q: {'choice': j.get(q)} for q in qs}
        for q in qs:
            a = ans.get(q) or {}
            self.notes.append({'who': 'jev', 'kind': 'decision', 'title': q + (' (scripted)' if self.a.decider == 'scripted' else ''), 'question': q, 'masked': masked if q == 'production' else {k: v for k, v in masked.items() if k.split(':')[0] in ARMY_KINDS},
                               'choice': a.get('choice'), 'conf': a.get('conf'), 'cost': cost if q == next(iter(qs)) else 0, 'secs': secs if q == next(iter(qs)) else 0,
                               'tokens': {'in': u.get('in')} if u and q == next(iter(qs)) else None,
                               'options': [{'key': o, 'label': offers[q][o], 'p': (a.get('p') or {}).get(o) if a.get('p') else (1.0 if o == a.get('choice') else 0.0) if self.a.decider == 'scripted' else None} for o in offers[q]]})
        return ans, cost, secs, offers, masked


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--url', default='http://127.0.0.1:8778/index.html')
    ap.add_argument('--seed', type=int, default=3); ap.add_argument('--race', default='human')
    ap.add_argument('--size', type=int, default=64); ap.add_argument('--map', default='strait')
    ap.add_argument('--minutes', type=float, default=40)
    ap.add_argument('--planner', default='openai/gpt-6-astra'); ap.add_argument('--effort', default='medium')
    ap.add_argument('--decider', default='typesafe/jev-1.13')
    ap.add_argument('--decide-every', type=float, default=1); ap.add_argument('--plan-every', type=float, default=60)
    ap.add_argument('--min-replan', type=float, default=30, help='event replans wait this long after the last plan (JEV-Star execution window)')
    ap.add_argument('--budget', type=float, default=1.5)
    ap.add_argument('--handover-at', type=float, default=0, help='game seconds after which the built-in AI plays our side (0: only when the budget is spent)')
    ap.add_argument('--plan-reserve', type=float, default=0.08, help='stop calling the planner when less than this is left (the plan in force stays)')
    ap.add_argument('--out', default=str(Path(__file__).resolve().parent / 'runs'))
    ap.add_argument('--headed', action='store_true', help='show the browser window (watch live, with the decision chat)')
    a = ap.parse_args()
    offline = a.planner in ('none', 'scripted') and a.decider == 'scripted'
    key = None if offline else api_key()
    run = Path(a.out) / time.strftime('%Y%m%d-%H%M%S'); run.mkdir(parents=True, exist_ok=True)
    # the game code this run was played with: replays follow the inputs, so a later edit of game.js would desync the
    # recording; the replay list opens a run in this copy (game/index.html?replay=../replay.json)
    GAME = Path(__file__).resolve().parent.parent
    try:
        (run / 'game').mkdir(exist_ok=True)
        for f in ('index.html', 'game.js', 'data.js', 'art.js', 'style.css'): shutil.copy2(GAME / f, run / 'game' / f)
        if not (run / 'game' / 'assets').exists(): os.symlink(GAME / 'assets', run / 'game' / 'assets')
    except OSError as e: print('could not keep a copy of the game code:', e)
    logf = open(run / 'log.jsonl', 'w'); tracef = open(run / 'trace.jsonl', 'w')
    def log(rec): logf.write(json.dumps(rec) + '\n'); logf.flush()
    def trace(rec): tracef.write(json.dumps(rec) + '\n'); tracef.flush()
    log({'kind': 'config', **{k: v for k, v in vars(a).items()}})
    budget = Budget(a.budget); pl = Player(a, key, budget, log, trace)
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        br = await p.chromium.launch(headless=not a.headed, handle_sigint=False); pg = await br.new_page(viewport={'width': 1600, 'height': 900})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(a.url); await pg.wait_for_timeout(800)
        await pg.evaluate(f"__game.newGame({{race:'{a.race}', seed:{a.seed}, size:{a.size}, map:'{a.map}', ai:true, fog:true, label:'Jev'}})")
        await pg.evaluate("__game.agent({side:'player'})")
        pl.set_catalog(await pg.evaluate('__game.catalog()'), a.race)
        pl.set_map(await pg.evaluate('__game.mapInfo()'))
        log({'kind': 'system_prompt', 'text': pl.system_prompt()})
        async def flush_notes():
            for n in pl.notes: await pg.evaluate('(n) => __game.note(n)', n)
            pl.notes.clear()
        async def save_replay():
            rp = await pg.evaluate('__game.replay()')
            if rp: (run / 'replay.json').write_text(rp)
        winner, err, turn, budget_out_t = None, None, 0, None
        api_fail = 0                                   # API calls failed in a row (after post()'s own retries)
        async def hand_over(t, title, text):
            nonlocal budget_out_t
            await pg.evaluate('__game.autopilot(true)'); budget_out_t = t
            log({'kind': 'budget_out', 't': t, 'spent': budget.spent, 'why': title})
            pl.notes.append({'who': 'harness', 'kind': 'note', 'title': title, 'text': text})
            await flush_notes()
        last_b = None; seen_types = set(); army_hist = []; mine_low = False
        try:
            while True:
                if budget_out_t is not None:          # the built-in AI plays our side now: just run the clock
                    st = await pg.evaluate(f'__game.advance({a.decide_every * 5})')
                    if st['winner']: winner = st['winner']; break
                    if st['time'] > a.minutes * 60: break
                    turn += 1
                    if turn % 60 == 0: await save_replay()
                    continue
                obs = await pg.evaluate('__game.observe()')
                legal = await pg.evaluate('__game.actions()')
                t = obs['time']
                # ---- events that call for a new plan (JEV-Star's triggers), at most one per execution window
                reason = None
                nb = sum(obs['buildings'].values()); army_n = sum(obs['army'].values())
                army_hist = [(tt, n) for tt, n in army_hist if t - tt <= 30] + [(t, army_n)]
                peak = max(n for _, n in army_hist)
                types = set(obs.get('enemyLastSeen', {}))
                # enemy fighters near home, and workers lost in the last 20 s: a threat that grows since the last plan
                # replans at once (the 8-grunt raid first showed as 3 units and the 30 s window hid the rest)
                threat = max(obs.get('raidersAtBase') or 0, sum(g.get('fighters', 0) for g in obs.get('enemySeen') or [] if (g.get('fromHome') or 99) <= 15))
                th0 = getattr(pl, 'threat0', 0)
                intel = obs.get('enemyIntel') or {}; seen_ago = intel.get('sawTheirBuildingsSecondsAgo', 'never')
                mine_min = min([m['minutesLeft'] for m in obs['goldMines'] if m.get('ours') and m.get('minutesLeft') is not None] or [99])
                wk_hist = [(tt, n) for tt, n in getattr(pl, 'wk_hist', []) if t - tt <= 20] + [(t, obs['workers']['total'])]; pl.wk_hist = wk_hist
                wk_drop = max(n for _, n in wk_hist) - obs['workers']['total']
                if pl.plan is None and pl.plan_t < 0: reason = 'game start'
                # (event replans need 20 s since the last plan: bursts at 7:58, 8:03 and 8:11 gave the same plan three times)
                elif t - pl.plan_t >= 20 and threat >= th0 + 3 and threat >= 1.5 * th0:
                    reason = f"the threat grew: {threat} enemy fighters at or near our base (was {th0} at the last plan)"; pl.grew_t = t
                elif t - pl.plan_t >= 20 and obs['underAttack'] and not getattr(pl, 'was_attacked', False) and t - getattr(pl, 'grew_t', -999) >= 60:
                    reason = 'under attack (the attack on our base has just begun)'
                elif t - pl.plan_t >= 20 and wk_drop >= 3 and not getattr(pl, 'wk_alarm', False):
                    reason = f'workers dying: {wk_drop} workers lost in the last 20 s'; pl.wk_alarm = True
                elif pl.rejection and t - pl.plan_t >= 20: reason = 'the last plan was rejected: ' + pl.rejection[:120]
                elif mine_min <= 5 and getattr(pl, 'mine_warn', 99) > 5 and t - pl.plan_t >= 20:
                    reason = f'our gold mine runs dry in about {mine_min} minutes at this rate: expand now'; pl.mine_warn = 5
                elif mine_min <= 3 and getattr(pl, 'mine_warn', 99) > 3 and t - pl.plan_t >= 20:
                    reason = f'our gold mine runs dry in about {mine_min} minutes'; pl.mine_warn = 3
                elif t >= 360 and getattr(pl, 'scout_warn', 0) < (1 if t < 600 else 2) and (seen_ago == 'never' or seen_ago > 240) and t - pl.plan_t >= 20:
                    reason = 'we have not seen the enemy base ' + ('yet' if seen_ago == 'never' else f'for {seen_ago} s') + ': its tier and army at home are unknown'; pl.scout_warn = 1 if t < 600 else 2
                elif t - pl.plan_t >= a.min_replan:
                    big = [i for i in obs.get('incoming') or [] if i['n'] >= 3]
                    if big: reason = f"enemy force incoming: {big[0]['n']} units, about {big[0].get('etaSeconds')} s away"
                    elif obs['underAttack']: reason = 'under attack'
                    elif last_b is not None and nb < last_b: reason = 'we lost a building'
                    elif peak >= 5 and army_n <= 0.7 * peak: reason = 'army losses (30% in 30 s)'
                    elif types - seen_types: reason = 'new enemy unit type seen: ' + ', '.join(sorted(types - seen_types))
                    elif pl.plan and pl.plan['goals'] and all(obs['counts'].get(k, 0) >= n for k, n in pl.plan['goals']): reason = 'every goal reached'
                    elif not mine_low and any(m['ours'] and m['gold'] < 8000 for m in obs['goldMines']) and getattr(pl, 'mine_warn', 99) > 5: reason = 'our gold mine is running low'; mine_low = True
                    elif pl.fail_run >= 3: reason = 'the executor keeps failing: ' + json.dumps(pl.outcomes[-1:])
                if not reason and t - pl.plan_t >= a.plan_every: reason = 'scheduled'
                seen_types |= types; last_b = nb
                pl.was_attacked = bool(obs['underAttack'])
                if reason:
                    pl.events.append({'t': t, 'event': reason})
                    # (an API error keeps the plan in force and is retried at the next trigger; three in a row hand
                    # the side to the built-in AI instead of ending the game)
                    try:
                        pl.make_plan(obs, legal, reason); api_fail = 0; pl.threat0 = threat
                        if wk_drop < 3: pl.wk_alarm = False
                        if pl.plan:
                            cfg = {'woodPct': pl.plan.get('lumber_workers_pct'), 'guard': pl.plan.get('home_guard', 3)}
                            if pl.plan.get('placement') is not None: cfg['place'] = pl.plan['placement']
                            if pl.plan.get('rally') is not None: cfg['rally'] = pl.plan['rally']
                            await pg.evaluate('(d) => __game.agentSet(d)', cfg)
                    except RuntimeError as e:
                        api_fail += 1; pl.plan_t = t; log({'kind': 'api_error', 't': t, 'who': 'planner', 'error': str(e)[:300]}); print('planner call failed:', str(e)[:200])
                    await flush_notes()
                # ---- one decision turn: production and army answers, each carried out as given
                try: ans, cost, secs, offers, masked = pl.decide(obs, legal); api_fail = 0 if pl.a.decider != 'scripted' else api_fail
                except RuntimeError as e:
                    api_fail += 1; ans = None; log({'kind': 'api_error', 't': t, 'who': 'decider', 'error': str(e)[:300]}); print('decider call failed:', str(e)[:200])
                if api_fail >= 3:
                    await hand_over(t, 'API errors', f'The model API failed {api_fail} times in a row at {t // 60}:{t % 60:02d}. From here the built-in computer AI plays our side so the game reaches its end.')
                    continue
                if ans is None:                              # this turn is skipped; the clock goes on
                    st = await pg.evaluate(f'__game.advance({a.decide_every})')
                    if st['winner']: winner = st['winner']; break
                    if st['time'] > a.minutes * 60: break
                    continue
                results = {}
                for q in ('production', 'army'):
                    k = (ans.get(q) or {}).get('choice')
                    if q not in ans: continue
                    if not k or k in ('wait', 'keep'): results[q] = k or 'no answer'; continue
                    if k not in offers[q]: results[q] = f'not offered: {k}'; continue
                    r = await pg.evaluate('(k) => __game.macro(k)', k)
                    results[q] = k if r['ok'] else f"{k} failed: {r['why']}"
                    if r['ok'] and k.split(':')[0] in ('attack', 'defend', 'retreat', 'hold'):
                        new = 'attack' if k.startswith('attack') else 'defend'
                        if new != pl.posture: pl.posture, pl.posture_t = new, t
                    if r['ok'] and k.startswith('scout:'): pl.scout_t = t
                    if r['ok'] and k in ('retreat', 'defend'): pl.home_order = (k, t)
                    if r['ok'] and q == 'army': pl.last_army[k] = t
                    if not r['ok']: pl.cooldown[k] = t + 5; pl.last_fail[k] = r['why']
                if any('failed' in str(v) for v in results.values()): pl.fail_run += 1
                elif results: pl.fail_run = 0
                if results: pl.outcomes.append({'t': t, 'results': results})
                for q, v in results.items():
                    for n in reversed(pl.notes):
                        if n.get('who') == 'jev' and n.get('question') == q and 'result' not in n: n['result'] = v; break
                await flush_notes()
                if turn % 60 == 0: await save_replay()
                k = (ans.get('production') or {}).get('choice') or 'wait'; result = results.get('production', 'wait')
                log({'kind': 'turn', 't': t, 'gold': obs['gold'], 'lumber': obs['lumber'], 'food': obs['food'], 'workers': obs['workers']['total'],
                     'army': army_n, 'choice': k, 'forced': not ans, 'answers': ans, 'results': results, 'result': result,
                     'offered': list(offers['production']) + list(offers['army']), 'masked': masked, 'n_legal': len(legal), 'plan_id': pl.plan_id, 'cost': cost, 'secs': secs})
                turn += 1
                if turn % 60 == 0:
                    print(f"{t // 60:>3}m gold {obs['gold']:>5} wood {obs['lumber']:>5} food {obs['food']:>6} workers {obs['workers']['total']:>2} army {army_n:>2} "
                          f"lost {obs['stats']['lost']:>3} kills {obs['stats']['kills']:>3} | ${budget.spent:.3f} | {results} | "
                          + ' '.join(f'{k}:{v}' for k, v in sorted(obs['army'].items())), flush=True)
                if (budget.left() <= 0.002 and pl.a.decider != 'scripted') or (a.handover_at and t >= a.handover_at):
                    # the money is spent: the game still runs to its end, with the built-in computer AI playing our side
                    # (recorded in the replay like any input, and marked in the chat)
                    why = 'Hand-over time reached' if a.handover_at and t >= a.handover_at else f'The ${a.budget:.2f} budget is used up'
                    await hand_over(t, 'hand-over' if a.handover_at and t >= a.handover_at else 'budget spent',
                                    f'{why} at {t // 60}:{t % 60:02d}. From here the built-in computer AI plays our side so the game reaches its end; Jev and Astra make no more calls.')
                st = await pg.evaluate(f'__game.advance({a.decide_every})')
                if st['winner']: winner = st['winner']; break
                if st['time'] > a.minutes * 60: break
        except (Exception, asyncio.CancelledError, KeyboardInterrupt) as e:   # (Ctrl-C/kill -INT: still save and write the summary)
            err = str(e) or 'stopped by hand'; print('stopped:', err)
        try: await flush_notes(); await save_replay()
        except Exception as e: print('could not save the replay:', e)
        final = await pg.evaluate('(() => { const s = __game.state(); const P = s.players; return { time: s.time, winner: s.winner, player: { units: P.player.units.length, buildings: P.player.buildings.length }, enemy: { units: P.enemy.units.length, buildings: P.enemy.buildings.length } }; })()')
        await pg.evaluate("__game.lookAt(__game.observe().home ? __game.observe().home.x : 10, __game.observe().home ? __game.observe().home.y : 10)")
        await pg.screenshot(path=str(run / 'final.png'))
        summary = {'winner': winner or final['winner'] or ('timeout' if not err else 'stopped'), 'error': err, 'final': final, 'budget_out_at': budget_out_t, 'map': f'{a.size}×{a.size} {a.map}',
                   'replay': f"http://127.0.0.1:8778/?replay=harness/runs/{run.name}/replay.json",
                   'spent_usd': round(budget.spent, 4), 'calls': budget.calls, 'page_errors': errs[:5], 'run_dir': str(run)}
        log({'kind': 'summary', **summary}); (run / 'summary.json').write_text(json.dumps(summary, indent=1))
        print(json.dumps(summary, indent=1))
        await br.close()

if __name__ == '__main__':
    asyncio.run(main())
