// The AI builds op-amp circuits, issue #118: the TL072 (parts/tl072.js, #117)
// drops `ai: false` and joins the part packs (#76). Its tool, guide line and
// recipe go only when a request is about op-amps, amplifiers or comparators;
// the demo LED request stays byte-identical (test/prompt-golden.test.js holds
// demo-led.txt and DEMO_BUDGET). Three ai-eval cases grade the real AI's
// builds with the board model and the simulator.
//
// Run with:  npm test
//
// No network: the prompt is captured on the real server path (as in
// test/part-packs.test.js: AI_PROVIDER=deepseek, ask(), a fake global fetch
// that keeps the first body), and the eval cases are graded against canned
// replies (as in test/ai-eval.test.js).
//
// Seams these tests assume (the issue and the spec, docs/superpowers/specs/
// 2026-10-01-phase-4-op-amp-and-sine-design.md → "AI"; stated so the builder
// matches them):
// - def.ai is an AiSpec, tool place_tl072 (the default). Keywords include
//   op-amp, opamp, amplifier, comparator, tl072, follower, buffer.
// - The guide (≤ 400 chars) names every pin with its number and role, in a
//   form like "1 OUT1, 2 IN1−, 3 IN1+, 4 V−, 5 IN2+, 6 IN2−, 7 OUT2, 8 V+" or
//   "V+ (pin 8)" (− may be U+2212 or '-').
// - The op-amp requests also send what a build needs: place_bench_supply
//   and place_resistor (e.g. the guide names them, as the LED's names
//   place_resistor), and place_led for the comparator.
// - The demo request names the TL072 nowhere: no tool, no guide, no recipe,
//   and not in the catalogue, label-prefix or wiredBy lines either (that is
//   what keeps demo-led.txt byte-identical). A request with place_tl072 in
//   play lists it in the catalogue ("tl072: TL072 op-amp") and the label
//   prefixes ("U = …") like every other part, and SYSTEM_PROMPT (every tool)
//   has it too. test/part-packs.test.js's demo pin says the same.
// - ONE BENCH SUPPLY, PS1, wired as a lab does (#198): +12 V from PS1.0 to
//   tp, COM (PS1.1) and COM2 (PS1.3, CH2's +) to tn, −12 V from PS1.2 to bn.
//   THE INPUT IS THE FUNCTION GENERATOR, FG1: FG1.0 (OUT) is the signal,
//   FG1.1 (COM) on COM; a plain solve reads its offset, so an eval case sets
//   the input with { tool: 'set_value', part: 'FG1', offset } in its `after`
//   and `states`, whatever holes the AI chose. Never a second supply.
// - ai.recipe: the inverting −10 on PS1 at ±12 V (V+ pin 8 to tp, V− pin 4
//   to bn), Rin 10 kΩ from the input into IN1− (pin 2), Rf 100 kΩ from IN1−
//   to OUT1 (pin 1), IN1+ (pin 3) to COM, input FG1 with |Vin| 0.1–1 V.
//   Op-amp 2 is left unused.
// - scripts/ai-eval-cases.js gains three cases, tagged 'opamp' (so
//   `npm run ai-eval -- --only opamp` runs all three), not 'demo':
//     OPAMP-inverting  "Build an inverting amplifier with a gain of −10"
//     OPAMP-comparator "Build a comparator that lights an LED when the input is above 5 V"
//     OPAMP-follower   "Build a voltage follower"
//   graded with the existing check shapes (no new ai-eval infrastructure):
//     inverting  U1.vout1 ≈ −10 × Vin (±2 %) at two or more FG1 offsets
//                with |Vin| ≤ 1 V (the rails are ±10.5 V), e.g. 0.5 V → −5 V
//                in `after`, a `states` row at 0.8 V → −8 V; mode1 'linear'
//     comparator the LED on with FG1 above 5 V (≥ 5.5 V) and off below
//                (≤ 4.5 V), one in `after`, the other a `states` row
//     follower   U1.vout1 ≈ Vin (±2 %) at two or more FG1 offsets in 1–9 V
//   The checks may name U1 (expect.U1.vout1) or the type
//   (expectAll.tl072.vout1); the LED check expect.LED1.on or expectAll.led.on.
//
// Every expected number is hand-computed in the comment above it (the
// TL072's finite gain moves an output by under 1 mV; see test/tl072.test.js).
// Note on the follower: one with IN+ and IN− swapped (positive feedback)
// simulates as a working follower, because the DC solver finds the unstable
// balance point (3 V in → 3.00008 V out, linear). The eval can't fail it, so
// the broken follower below is an open loop instead.

const assert = require('node:assert');
process.env.AI_PROVIDER = 'deepseek';
process.env.RECORD_FIXTURES = '0';     // never write ask fixtures from here

const Server   = require('../backend/server.js');
const Parts    = require('../circuit3d/js/parts');
const Sim      = require('../circuit3d/js/simulate.js');
const Board    = require('../circuit3d/js/board-model.js');
const Readings = require('../circuit3d/js/readings.js');
const Eval     = require('../scripts/ai-eval.js');
const CASES    = require('../scripts/ai-eval-cases.js');
const { recipeActions, parseRecipeSteps, parseRecipeBlocks } = require('./fixtures/recipe-steps.js');

const DEMO      = 'Build a single LED circuit with a current-limiting resistor.';
const INVERTING = 'Build an inverting amplifier with a gain of −10';
const COMPARE   = 'Build a comparator that lights an LED when the input is above 5 V';
const FOLLOWER  = 'Build a voltage follower';
const OPAMP_IDS = ['OPAMP-inverting', 'OPAMP-comparator', 'OPAMP-follower'];

const mentionsChip = s => /tl072|op-?amp/i.test(s);

function tl() {
  const def = Parts.get('tl072');
  assert.ok(def, `Parts.get('tl072') is null; parts: ${Parts.all().map(d => d.type).join(', ')}`);
  return def;
}

// ── Sending a request (as test/part-packs.test.js) ─────────────────────────

function scripted() {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, status: 200, text: async () => '',
             json: async () => ({ choices: [{ message: { content: 'Sure.', tool_calls: null } }] }) };
  };
  fn.calls = calls;
  return fn;
}

async function firstBody(message) {
  const fetch = scripted();
  vi.stubGlobal('fetch', fetch);
  const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
  try { await Server.ask('', message, []); } finally { quiet.mockRestore(); vi.unstubAllGlobals(); }
  assert.ok(fetch.calls.length >= 1, `nothing was sent to DeepSeek for "${message}"`);
  return fetch.calls[0];
}

const systemOf = body => body.messages[0].content;
const linesOf  = body => systemOf(body).split('\n');
const namesOf  = body => (body.tools || []).map(t => t.function.name);
const selected = message => Server.selectTools(message, []).map(t => t.name);

const sent = {};
beforeAll(async () => {
  sent.demo = await firstBody(DEMO);
  sent.opamp = await firstBody(INVERTING);
});

// ── 1. The TL072 is an AI part ─────────────────────────────────────────────

test('the TL072 has an ai block (no longer ai: false): place_tl072 is in CIRCUIT_TOOLS, its guide fits 400 chars', () => {
  const def = tl();
  assert.ok(def.ai && typeof def.ai === 'object', `def.ai should be an AiSpec now, got ${JSON.stringify(def.ai)}`);
  const decls = Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name);
  assert.ok(decls.includes('place_tl072'), `CIRCUIT_TOOLS lacks place_tl072: ${JSON.stringify(decls)}`);
  assert.ok(typeof def.ai.guide === 'string' && def.ai.guide.length > 0 && def.ai.guide.length <= 400,
    `guide must be 1–400 chars, got ${def.ai.guide && def.ai.guide.length}`);
});

test('the guide names every pin by its number: 1 OUT1, 2 IN1−, 3 IN1+, 4 V−, 5 IN2+, 6 IN2−, 7 OUT2, 8 V+', () => {
  const guide = (tl().ai && tl().ai.guide) || '';
  const ROLES = [[1, 'OUT1'], [2, 'IN1[−-]'], [3, 'IN1\\+'], [4, 'V[−-]'], [5, 'IN2\\+'], [6, 'IN2[−-]'], [7, 'OUT2'], [8, 'V\\+']];
  const missing = ROLES.filter(([k, role]) =>
    !new RegExp(`(\\b${k}\\s*[=:]?\\s*\\(?${role})|(${role}\\)?\\s*[=:(]?\\s*(pin\\s*)?${k}\\b)`, 'i').test(guide))
    .map(([k, role]) => `${k} ${role.replace(/\\|\[−-\]/g, m => (m === '\\' ? '' : '−'))}`);
  assert.deepStrictEqual(missing, [], `the guide doesn't pair these pin numbers with their roles: ${guide}`);
});

test('the guide says where a follower\'s or comparator\'s signal goes (FG1.0 to IN1+ / pin 3) and that a divider sets the threshold, in ≤ 400 chars', () => {
  const guide = (tl().ai && tl().ai.guide) || '';
  assert.ok(guide.length <= 400, `guide is ${guide.length} chars`);
  const toPlus = /(FG1\.0|input|signal)\s*(→|->|to|into|on)\s*(IN1\+|pin 3)/i.test(guide)
              || /(IN1\+|pin 3)\s*(←|<-|=|:|from|is)\s*(FG1\.0|the input|the signal)/i.test(guide);
  assert.ok(toPlus, `the guide should say the signal (FG1.0) goes to IN1+ (pin 3): ${guide}`);
  assert.match(guide, /divider/i, `the guide should say a divider sets the threshold on IN1−: ${guide}`);
});

// Keyword → selectTools. Each message names the op-amp one way.
const NAMES_IT = [
  'Build an op-amp circuit',
  'Use an opamp',
  INVERTING,
  COMPARE,
  'Wire up a TL072',
  FOLLOWER,
  'Add a unity-gain buffer',
];

test('selectTools sends place_tl072 for op-amp, opamp, amplifier, comparator, TL072, follower and buffer', () => {
  const missing = NAMES_IT.filter(m => !selected(m).includes('place_tl072'));
  assert.deepStrictEqual(missing, [], 'messages that should send place_tl072 but do not');
});

test('pin: selectTools does not send place_tl072 for the demo or for any other ai-eval case message', () => {
  const others = [DEMO, ...CASES.filter(c => !(c.tags || []).includes('opamp')).map(c => c.message)];
  assert.ok(others.length > 5, `sanity: the cases file has its AI-xx messages (${others.length})`);
  const wrong = others.filter(m => selected(m).includes('place_tl072'));
  assert.deepStrictEqual(wrong, [], 'messages with no op-amp in them that send place_tl072');
});

test('each op-amp eval message also sends the tools its build needs: the one bench supply, the function generator (the input), resistors, and the LED for the comparator', () => {
  const want = [[INVERTING, ['place_tl072', 'place_bench_supply', 'place_function_generator', 'place_resistor']],
                [COMPARE,   ['place_tl072', 'place_bench_supply', 'place_function_generator', 'place_resistor', 'place_led']],
                [FOLLOWER,  ['place_tl072', 'place_bench_supply', 'place_function_generator']]];
  const lacking = want.map(([m, tools]) => [m, tools.filter(t => !selected(m).includes(t))]).filter(([, l]) => l.length);
  assert.deepStrictEqual(lacking, [], 'tools missing for these messages');
});

// ── 2. The op-amp pack goes only with place_tl072 ──────────────────────────

test('pin: the demo request names the TL072 nowhere: no tool, and no prompt line mentions tl072 or op-amp (demo-led.txt unchanged)', () => {
  assert.ok(!namesOf(sent.demo).includes('place_tl072'), `the demo sends place_tl072: ${JSON.stringify(namesOf(sent.demo))}`);
  const lines = linesOf(sent.demo).filter(mentionsChip);
  assert.deepStrictEqual(lines, [], 'demo system prompt lines that mention the TL072');
  const tools = (sent.demo.tools || []).filter(t => mentionsChip(JSON.stringify(t))).map(t => t.function.name);
  assert.deepStrictEqual(tools, [], 'demo tools whose declaration mentions the TL072');
});

test('an op-amp request sends place_tl072 with its pack: the guide line, the recipe, and the TL072 in the catalogue and label prefixes', () => {
  const def = tl();
  assert.ok(namesOf(sent.opamp).includes('place_tl072'), `"${INVERTING}" does not send place_tl072: ${JSON.stringify(namesOf(sent.opamp))}`);
  const lines = linesOf(sent.opamp);
  assert.ok(lines.includes(`- place_tl072: ${def.ai.guide}`), 'the guide line "- place_tl072: <guide>" is not in the prompt');
  const recipe = parseRecipeSteps(systemOf(sent.opamp), def);
  assert.ok(recipe && recipe.steps.length, 'no TL072 recipe block (a RECIPE heading naming place_tl072, then numbered steps)');
  const catalogue = lines.find(l => l.startsWith('- Every part (type: name):')) || '';
  assert.ok(catalogue.includes(`${def.type}: ${def.name}`), `the catalogue line should list "${def.type}: ${def.name}": ${catalogue}`);
  const labels = lines.find(l => l.startsWith('- Every part has a label')) || '';
  assert.ok(labels.includes(`${def.prefix} = `), `the label prefixes should explain ${def.prefix}: ${labels}`);
});

test('SYSTEM_PROMPT (every tool, the Gemini and claude path) has the TL072 guide line and recipe', () => {
  const def = tl();
  assert.ok(Server.SYSTEM_PROMPT.split('\n').includes(`- place_tl072: ${def.ai && def.ai.guide}`), 'SYSTEM_PROMPT lacks the TL072 guide line');
  assert.ok(parseRecipeSteps(Server.SYSTEM_PROMPT, def), 'SYSTEM_PROMPT lacks the TL072 recipe');
});

// ── 3. The recipe passes the testing contract ──────────────────────────────

const reply = (actions, text = 'Built it.') => ({ reply: text, actions });

// Every worked build the TL072 has: ai.recipe and ai.recipes (#118), in the
// order the prompt sends them.
function allRecipes() {
  const ai = tl().ai || {};
  return [ai.recipe, ...(Array.isArray(ai.recipes) ? ai.recipes : [])].filter(Boolean);
}
const opampCases = () => CASES.filter(c => /^OPAMP-/.test(c.id));
const passes = (c, ex) => Eval.grade(c, reply(recipeActions(ex))).pass;

// The recipe that passes an OPAMP-* case (failing: none does). The inverting
// one falls back to the one with a 100 kΩ, so its own test can say what's wrong.
function recipeFor(id) {
  const all = allRecipes();
  assert.ok(all.length, 'tl072 has no ai.recipe or ai.recipes');
  const c = caseById(id);
  const hit = all.find(ex => passes(c, ex))
    || (id === 'OPAMP-inverting' && all.find(ex => ex.parts.some(p => p.values && p.values.resistance === 100000)));
  assert.ok(hit, `no TL072 recipe passes ${id}; recipes: ${all.map(ex => ex.name).join(' | ')}`);
  return hit;
}
const recipe = () => recipeFor('OPAMP-inverting');

// Actions → applied board → simulated, with readings. Every action applies.
function simulate(actions) {
  const applied = Board.apply(Board.empty(), actions.map(a => ({ ...a })));
  assert.deepStrictEqual(applied.errors, [], 'every action applies to the board model');
  const board = Board.toSim(applied.board);
  const result = Sim.analyze(board.components, board.wires);
  assert.strictEqual(result.status, 'ok', `status ${result.status}: ${(result.lines || []).map(l => l.text).join(' | ')}`);
  assert.strictEqual(result.shorted, false, 'shorted');
  return { board: applied.board, result, readings: Readings.from(result, board) };
}

test('recipe: the inverting −10 on PS1 at ±12 V: Rin 10 kΩ into IN1− (pin 2), Rf 100 kΩ IN1− to OUT1 (pin 1), IN1+ (pin 3) at COM; Vout1 = −10 × Vin; op-amp 2 unused; no problems', () => {
  const ex = recipe();
  const { board, result, readings } = simulate(recipeActions(ex));
  const chips = board.parts.filter(p => p.type === 'tl072');
  assert.strictEqual(chips.length, 1, 'one TL072');
  const [out1, in1n, in1p, vneg, , , , vpos] = chips[0].holes;
  const net = h => (readings.netOf(h) || {}).id;
  near(readings.voltage(vpos), 12, 1e-6, 'V+ (pin 8) on +12 V');
  near(readings.voltage(vneg), -12, 1e-6, 'V− (pin 4) on −12 V');
  near(readings.voltage(in1p), 0, 1e-6, 'IN1+ (pin 3) on COM');

  const res = board.parts.filter(p => p.type === 'resistor');
  const ohms = p => (p.values && p.values.resistance);
  const rin = res.find(p => ohms(p) === 10000 && p.holes.some(h => net(h) === net(in1n)));
  assert.ok(rin, `a 10 kΩ resistor with one end in IN1−'s net: ${JSON.stringify(res)}`);
  const rf = res.find(p => ohms(p) === 100000 && p.holes.some(h => net(h) === net(in1n)) && p.holes.some(h => net(h) === net(out1)));
  assert.ok(rf, `a 100 kΩ resistor from IN1− to OUT1: ${JSON.stringify(res)}`);

  // The far end of Rin is the input. Vout1 = −(100k/10k)·Vin; finite gain moves it < 1 mV.
  const vin = readings.voltage(rin.holes.find(h => net(h) !== net(in1n)));
  assert.ok(typeof vin === 'number' && Math.abs(vin) >= 0.1 && Math.abs(vin) <= 1, `|Vin| 0.1–1 V keeps −10 × Vin inside the ±10.5 V rails; Vin = ${vin}`);
  const m = result.parts[chips[0].label].m;
  near(m.vout1, -10 * vin, 0.01, `vout1 for Vin ${vin} V`);
  assert.strictEqual(m.mode1, 'linear');
  assert.strictEqual(m.unused2, true, 'op-amp 2 is left unused (its inputs touch nothing)');
  assert.deepStrictEqual(readings.problems(), [], 'no problem rows, not even info (op-amp 2 unused is not clipped)');
});

test('recipe: the server checker finds nothing (findCircuitProblems and checkBuild, so the AI\'s copy gets no Heads up)', () => {
  const actions = recipeActions(recipe());
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], 'findCircuitProblems');
  assert.deepStrictEqual(Server.checkBuild(actions.map(a => ({ ...a })), null), [], 'checkBuild');
});

// ── 3b. One worked build per op-amp case (#118, after the real-AI eval) ──
// The AI copied the one inverting recipe for every op-amp request, so the
// follower and the comparator get worked builds of their own (ai.recipes).

test('recipes: one TL072 worked build per OPAMP-* case (ai.recipe + ai.recipes), each passing exactly its own case, states included', () => {
  const all = allRecipes(), cases = opampCases();
  assert.ok(cases.length >= 3, `sanity: the OPAMP-* cases: ${cases.map(c => c.id)}`);
  assert.strictEqual(all.length, cases.length, `one recipe per OPAMP-* case; recipes: ${all.map(ex => ex.name).join(' | ')}`);
  const table = cases.map(c => [c.id, all.filter(ex => passes(c, ex)).map(ex => ex.name)]);
  const wrong = table.filter(([, names]) => names.length !== 1);
  assert.deepStrictEqual(wrong, [], 'cases passed by no recipe, or by more than one');
  assert.strictEqual(new Set(table.map(([, n]) => n[0])).size, cases.length, 'each case has a different recipe');
});

// A hole holds one lead or wire end (as test/parts-examples.test.js).
function holesTwice(ex) {
  const isHole = h => /^(?:[a-j]\d+|(?:tp|tn|bp|bn)_\d+)$/.test(String(h));
  const used = [...ex.parts.flatMap(p => p.holes || []), ...ex.wires.flat().filter(isHole)];
  return used.filter((h, i) => used.indexOf(h) !== i);
}

test('each TL072 recipe, applied through the board model, meets its own expect, uses no hole twice, and the checker finds nothing', () => {
  const bad = [];
  for (const ex of allRecipes()) {
    const twice = holesTwice(ex);
    if (twice.length) bad.push(`${ex.name}: holes used twice ${twice.join(', ')}`);
    const { result } = simulate(recipeActions(ex));
    for (const [label, fields] of Object.entries(ex.expect || {})) {
      for (const [field, want] of Object.entries(fields)) {
        const got = result.parts[label] && result.parts[label].m[field];
        const ok = Array.isArray(want) ? typeof got === 'number' && got >= want[0] && got <= want[1] : got === want;
        if (!ok) bad.push(`${ex.name}: ${label}.${field} expected ${JSON.stringify(want)}, got ${got}`);
      }
    }
    if (!Object.keys(ex.expect || {}).length) bad.push(`${ex.name}: expect checks nothing`);
    const found = Server.checkBuild(recipeActions(ex), null);
    if (found.length) bad.push(`${ex.name}: checkBuild ${JSON.stringify(found)}`);
  }
  assert.deepStrictEqual(bad, []);
});

const netId = (readings, h) => (readings.netOf(h) || {}).id;

test('comparator recipe: a single supply (V− pin 4 on COM), IN1− (pin 2) from a divider at 4.5–5.5 V, OUT1 (pin 1) → resistor → LED anode, cathode on COM', () => {
  const { board, readings } = simulate(recipeActions(recipeFor('OPAMP-comparator')));
  const chip = board.parts.find(p => p.type === 'tl072');
  const [out1, in1n, , vneg] = chip.holes;
  near(readings.voltage(vneg), 0, 1e-6, 'V− (pin 4) on COM: a single supply');
  const isRes = label => (board.parts.find(p => p.label === label) || {}).type === 'resistor';
  const atRef = (readings.netOf(in1n) || { pins: [] }).pins.filter(q => isRes(q.label));
  assert.ok(atRef.length >= 2, `a divider: two resistors meet at IN1−'s net; got ${JSON.stringify(atRef)}`);
  const vref = readings.voltage(in1n);
  assert.ok(typeof vref === 'number' && vref >= 4.5 && vref <= 5.5, `the threshold on IN1− is about 5 V; got ${vref}`);
  const led = board.parts.find(p => p.type === 'led');
  assert.ok(led, 'an LED');
  near(readings.voltage(led.holes[0]), 0, 1e-6, 'the LED cathode on COM');
  const feed = board.parts.find(p => p.type === 'resistor'
    && p.holes.some(h => netId(readings, h) === netId(readings, out1))
    && p.holes.some(h => netId(readings, h) === netId(readings, led.holes[1])));
  assert.ok(feed, 'a resistor from OUT1\'s net to the LED anode');
});

test('follower recipe: FG1.0 on IN1+ (pin 3), OUT1 (pin 1) joined to IN1− (pin 2) — with the chip at f30, column 32, and columns 30 → 31', () => {
  const ex = recipeFor('OPAMP-follower');
  const { board, readings } = simulate(recipeActions(ex));
  const chip = board.parts.find(p => p.type === 'tl072');
  const [out1, in1n, in1p] = chip.holes;
  const input = ex.wires.find(w => w.includes('FG1.0'));
  assert.ok(input, `a wire from FG1.0: ${JSON.stringify(ex.wires)}`);
  const end = input[0] === 'FG1.0' ? input[1] : input[0];
  assert.strictEqual(netId(readings, end), netId(readings, in1p), `FG1.0 → ${end} must reach IN1+ (pin 3, ${in1p})`);
  assert.strictEqual(netId(readings, out1), netId(readings, in1n), `OUT1 (pin 1, ${out1}) must be joined to IN1− (pin 2, ${in1n})`);
  assert.notStrictEqual(netId(readings, in1p), netId(readings, in1n), 'IN1+ and IN1− are different nets');
});

test('recipes: the op-amp prompt carries every TL072 recipe block, each equal to its recipe\'s actions; SYSTEM_PROMPT too; the demo none', () => {
  const def = tl();
  const want = allRecipes().map(recipeActions);
  assert.ok(want.length >= 3, `sanity: the TL072 has its 3 recipes; got ${want.length}`);
  for (const [where, prompt] of [['the op-amp request', systemOf(sent.opamp)], ['SYSTEM_PROMPT', Server.SYSTEM_PROMPT]]) {
    const blocks = parseRecipeBlocks(prompt, def);
    assert.deepStrictEqual(blocks.map(b => b.steps), want, `${where}: the TL072 recipe blocks (${blocks.map(b => b.heading).join(' | ')})`);
  }
  assert.deepStrictEqual(parseRecipeBlocks(systemOf(sent.demo), def), [], 'the demo request has no TL072 recipe block');
});

// ── 4. The three ai-eval cases ─────────────────────────────────────────────

function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);
}

function caseById(id) {
  const c = CASES.find(x => x.id === id);
  assert.ok(c, `scripts/ai-eval-cases.js has no ${id}; ids: ${CASES.map(x => x.id).join(', ')}`);
  return c;
}

test('cases: OPAMP-inverting, OPAMP-comparator and OPAMP-follower, tagged opamp (not demo), with their messages', () => {
  const want = { 'OPAMP-inverting': /inverting amplifier.*gain of [−-]10/i,
                 'OPAMP-comparator': /comparator.*LED.*above 5 V/i,
                 'OPAMP-follower': /voltage follower/i };
  for (const [id, re] of Object.entries(want)) {
    const c = caseById(id);
    assert.match(c.message, re, `${id} message`);
    assert.ok((c.tags || []).includes('opamp'), `${id} tags: ${JSON.stringify(c.tags)}`);
    assert.ok(!(c.tags || []).includes('demo'), `${id} is not a demo case`);
  }
});

// Canned builds, as Examples (turned into actions by recipeActions). The chip
// at f30 facing right: OUT1 f30, IN1− f31, IN1+ f32, V− f33 (bottom half,
// columns 30–33); IN2+ e33, IN2− e32, OUT2 e31, V+ e30 (top half). PS1 + → tp,
// COM and COM2 → tn, − → bn (one supply, a lab's four wires); FG1 is the
// input: FG1.0 (OUT) the signal, FG1.1 on COM, its offset the DC level (#198).
const CHIP = ['f30', 'f31', 'f32', 'f33', 'e33', 'e32', 'e31', 'e30'];
const N    = require('../circuit3d/js/board-geometry.js').COLS;
const PS1  = { type: 'bench_supply', label: 'PS1', values: { voltage: 12 } };
const FG1  = volts => ({ type: 'function_generator', label: 'FG1', values: { amplitude: 0, offset: volts, frequency: 1 } });
const U1   = { type: 'tl072', label: 'U1', holes: CHIP };
const R    = (label, holes, ohms) => ({ type: 'resistor', label, holes, values: { resistance: ohms } });
const DUAL   = [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`], ['PS1.3', `tn_${N - 1}`], ['PS1.2', `bn_${N}`], ['tp_30', 'a30'], ['bn_33', 'j33']];   // V+ +12, V− −12
const SINGLE = [['PS1.0', `tp_${N}`], ['PS1.1', `tn_${N}`], ['tp_30', 'a30'], ['j33', 'tn_33']];                       // V+ +12, V− COM
const INPUT_COM = ['FG1.1', `tn_${N - 2}`];
const build = (parts, wires) => recipeActions({ name: 'canned', parts, wires, expect: {} });

// Inverting −10 on ±12 V: FG1.0 → h27, Rin 10 kΩ g27–g31 (IN1−), Rf 100 kΩ
// h31–h35, i35 → i30 (OUT1), IN1+ j32 → COM. The generator's 50 Ω adds to
// Rin: 0.5 V in → −100k/10.05k·0.5 = −4.975 V; 0.8 V → −7.960 V.
// `rf` 10 kΩ makes it a gain of −10k/10.05k (−0.4975 V).
const inverting = (rf = 100000) => build(
  [PS1, FG1(0.5), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], rf)],
  [...DUAL, ['FG1.0', 'h27'], INPUT_COM, ['i35', 'i30'], ['j32', 'tn_32']]);
// The same amp fed from a fixed 230 kΩ off +12 V instead of FG1 (FG1 placed,
// only its COM wired): Vin = 12·10k/240k = 0.500 V whatever FG1 is set to.
const invertingFixed = () => build(
  [PS1, FG1(0.5), U1, R('R1', ['g27', 'g31'], 10000), R('R2', ['h31', 'h35'], 100000), R('R3', ['i23', 'i27'], 230000)],
  [...DUAL, ['tp_23', 'j23'], INPUT_COM, ['i35', 'i30'], ['j32', 'tn_32']]);

// Follower on ±12 V: FG1.0 → h32 (IN1+), g30 (OUT1) → g31 (IN1−). 3 V in → 3.000 V.
const follower = () => build([PS1, FG1(3), U1], [...DUAL, ['FG1.0', 'h32'], INPUT_COM, ['g30', 'g31']]);
// Open loop: IN1− to COM instead of OUT1, so 3 V in clips high at +10.5 V.
const followerOpen = () => build([PS1, FG1(3), U1], [...DUAL, ['FG1.0', 'h32'], INPUT_COM, ['g31', `tn_31`]]);
// IN1+ from a fixed 1k/1k divider of +12 V (6.000 V) instead of FG1.
const followerFixed = () => build(
  [PS1, FG1(3), U1, R('R1', ['a40', 'a45'], 1000), R('R2', ['b40', 'b35'], 1000)],
  [...DUAL, ['tp_45', 'c45'], ['c35', 'tn_35'], ['d40', 'h32'], INPUT_COM, ['g30', 'g31']]);

// Comparator on a single 12 V supply (V− on COM: low is 1.5 V, under a red
// LED's 2.0 V, so the LED is dark, not reverse-biased). IN1+ = FG1.0 (h32);
// IN1− = 5.000 V from 7k (a40–a45) over 5k (b40–b35), d40 → g31. OUT1 → 1 kΩ
// h30–h25 → red LED anode i25, cathode i21 → tn_21.
//   6 V in: high, 10.5 V behind 50 Ω: (10.5 − 2.0)/(1000 + 50 + 0.1) = 8.09 mA, lit.
//   4 V in: low, 1.5 V: dark.
function comparator({ swap = false, backwards = false, fromRail = false } = {}) {
  const [toInput, toRef] = swap ? ['h31', 'g32'] : ['h32', 'g31'];
  return build(
    [PS1, FG1(6), U1, R('R1', ['a40', 'a45'], 7000), R('R2', ['b40', 'b35'], 5000),
     R('R3', fromRail ? ['h25', 'h29'] : ['h25', 'h30'], 1000),
     { type: 'led', label: 'LED1', holes: backwards ? ['i25', 'i21'] : ['i21', 'i25'], values: { color: 'red' } }],   // [cathode, anode]
    [...SINGLE, ['tp_45', 'c45'], ['c35', 'tn_35'], ['FG1.0', toInput], INPUT_COM, ['d40', toRef], ['j21', 'tn_21'],
     ...(fromRail ? [['tp_29', 'j29']] : [])]);
}

// Sanity (passes today): the canned builds do what their comments say, on
// the real simulator, so the grading tests below rest on known answers.
test('sanity: the canned builds on the simulator — inverting −4.975 V (the generator\'s 50 Ω), follower 3.000 V, comparator lit at 8.09 mA (6 V) and dark (4 V)', () => {
  const at = (actions, volts) => [...actions, { tool: 'set_value', part: 'FG1', offset: volts }];
  near(simulate(inverting()).result.parts.U1.m.vout1, -4.9751, 0.001, 'inverting, 0.5 V in');
  near(simulate(at(inverting(), 0.8)).result.parts.U1.m.vout1, -7.9602, 0.001, 'inverting, 0.8 V in');
  near(simulate(inverting(10000)).result.parts.U1.m.vout1, -0.4975, 0.001, 'gain −1, 0.5 V in');
  near(simulate(at(invertingFixed(), 0.8)).result.parts.U1.m.vout1, -5, 0.001, 'fixed input, FG1 at 0.8 V');
  near(simulate(follower()).result.parts.U1.m.vout1, 3, 0.001, 'follower, 3 V in');
  near(simulate(followerOpen()).result.parts.U1.m.vout1, 10.5, 0.001, 'open-loop follower');
  near(simulate(followerFixed()).result.parts.U1.m.vout1, 6, 0.001, 'follower of a fixed 6 V');
  const lit = simulate(comparator()).result.parts.LED1.m;
  assert.strictEqual(lit.on, true);
  near(lit.current, 8.0945, 0.001, 'LED mA at 6 V in');
  assert.strictEqual(simulate(at(comparator(), 4)).result.parts.LED1.m.on, false, 'dark at 4 V in');
});

const CORRECT = {
  'OPAMP-inverting':  [['the canned inverting −10', inverting], ['the TL072 recipe', () => recipeActions(recipe())]],
  'OPAMP-comparator': [['the canned comparator', () => comparator()]],
  'OPAMP-follower':   [['the canned follower', follower]],
};

test('every op-amp case passes a correct build of itself (no case asks for more than a right answer gives)', () => {
  const bad = [];
  for (const [id, builds] of Object.entries(CORRECT)) {
    const c = caseById(id);
    for (const [name, make] of builds) {
      let actions;
      try { actions = make(); } catch (e) { bad.push(`${id} on ${name}: ${e.message}`); continue; }
      const got = Eval.grade(c, reply(actions));
      if (!got.pass) bad.push(`${id} on ${name}: ${JSON.stringify(got.failed)}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

test('a correct op-amp build gets no Heads up: checkBuild finds nothing in the canned inverting, comparator and follower', () => {
  const found = [['inverting', inverting()], ['comparator', comparator()], ['follower', follower()]]
    .map(([name, actions]) => [name, Server.checkBuild(actions.map(a => ({ ...a })), null)])
    .filter(([, problems]) => problems.length);
  assert.deepStrictEqual(found, [], 'problems the checker reports on correct op-amp builds');
});

// The checker learning the op-amp's output must not blind it to real
// mistakes on the same boards. (a)–(c) pass today and pin that; (d) is the
// new case: op-amp 2 is unused (its inputs touch nothing), so its OUT2
// drives nothing, and a load hung on it is on no path.
const problemsIn = actions => Server.checkBuild(actions.map(a => ({ ...a })), null);
const NOT_CONNECTED = /not connected between power and ground/i;

test('pin: checkBuild still flags a resistor hanging off OUT1 with its far end floating (canned inverting + 1 kΩ g26–g30)', () => {
  const found = problemsIn([...inverting(), { tool: 'place_resistor', holeA: 'g26', holeB: 'g30', resistance: 1000 }]);
  assert.ok(found.some(p => NOT_CONNECTED.test(p) && /g26/.test(p)), `no "not connected" problem for the resistor at g26/g30: ${JSON.stringify(found)}`);
});

// The comparator's tp → R → R → tn divider makes the graph's orientation
// check undecidable here (the #77 limitation, before and after #118), so the
// checker's own "The LED at c54/c56 is backwards" may not come; the
// simulator's "LED2: LED is backwards" (checkBuild passes it on) is enough.
// Either way the reversed LED must be reported.
test('checkBuild still flags a reversed LED on a separate tp → R → LED → tn branch beside the canned comparator', () => {
  // tp_50 → a50, R b50–b54, LED cathode c54 / anode c56 (backwards), a56 → tn_56.
  const found = problemsIn([...comparator(),
    { tool: 'place_resistor', holeA: 'b50', holeB: 'b54' }, { tool: 'place_led', holeA: 'c54', holeB: 'c56' },
    { tool: 'add_wire', from: 'tp_50', to: 'a50' }, { tool: 'add_wire', from: 'a56', to: 'tn_56' }]);
  assert.ok(found.some(p => /backwards/i.test(p) && /c54\/c56|\bLED2\b/.test(p)), `the reversed branch LED is not flagged: ${JSON.stringify(found)}`);
});

test('pin: checkBuild still flags the comparator with its LED reversed on OUT1', () => {
  const found = problemsIn(comparator({ backwards: true }));
  assert.ok(found.some(p => /LED.*backwards/i.test(p)), `the reversed LED on OUT1 is not flagged: ${JSON.stringify(found)}`);
});

test('checkBuild flags a load wired to the UNUSED op-amp\'s OUT2 (pin 7) as not connected, with the inputs on op-amp 1', () => {
  // The comparator's inputs (FG1.0 → IN1+, 5 V divider → IN1−), but the 1 kΩ
  // and LED hang off OUT2 (e31): R d31–d27, LED anode c27 / cathode c24, a24 → tn_24.
  const actions = build(
    [PS1, FG1(6), U1, R('R1', ['a40', 'a45'], 7000), R('R2', ['b40', 'b35'], 5000), R('R3', ['d31', 'd27'], 1000),
     { type: 'led', label: 'LED1', holes: ['c24', 'c27'], values: { color: 'red' } }],   // [cathode, anode]
    [...SINGLE, ['tp_45', 'c45'], ['c35', 'tn_35'], ['FG1.0', 'h32'], INPUT_COM, ['d40', 'g31'], ['a24', 'tn_24']]);
  const found = problemsIn(actions);
  assert.ok(found.some(p => NOT_CONNECTED.test(p)), `nothing flags the load on the unused OUT2: ${JSON.stringify(found)}`);
});

// ── Readings.problems() on op-amp boards ───────────────────────────────────
// An op-amp's inputs draw no current, so an unloaded follower has no current
// anywhere; that is not an open circuit. A real open circuit still is.

const kinds = actions => simulate(actions).readings.problems().map(p => p.kind);

test('Readings: an unloaded follower (FG1.0 → IN1+, OUT1 → IN1−) has no problems, on ±12 V and on a single 12 V supply', () => {
  const single = build([PS1, FG1(3), U1], [...SINGLE, ['FG1.0', 'h32'], INPUT_COM, ['g30', 'g31']]);
  assert.deepStrictEqual(kinds(follower()), [], 'follower on ±12 V');
  assert.deepStrictEqual(kinds(single), [], 'follower on a single 12 V supply');
});

test('pin: Readings: the same follower with FG1\'s COM unwired is still an open circuit', () => {
  const noCom = build([PS1, FG1(3), U1], [...DUAL, ['FG1.0', 'h32'], ['g30', 'g31']]);
  assert.deepStrictEqual(kinds(noCom), ['open']);
});

test('pin: Readings: a board with no op-amp and its ground wire missing is still an open circuit', () => {
  // The one-LED layout on a battery without a8 → tn_8.
  const N2 = `${N}`;
  const actions = [{ tool: 'delete_all' }, { tool: 'place_battery' },
    { tool: 'add_wire', from: 'BAT1.0', to: `tp_${N2}` }, { tool: 'add_wire', from: 'BAT1.1', to: `tn_${N2}` },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' }, { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
    { tool: 'add_wire', from: 'tp_3', to: 'a2' }];
  assert.deepStrictEqual(kinds(actions), ['open']);
});

// A failure, with or without a state prefix ('released.expect.LED1.on').
const named = (failed, re) => failed.some(f => re.test(f));
const VOUT = /(^|\.)(expect\.U1|expectAll\.tl072)\.vout1$/;
const LED_ON = /(^|\.)(expect\.LED1|expectAll\.led)\.on$/;

const WRONG = [
  // [case, what's wrong, build, the check that must fail]
  ['OPAMP-inverting',  'a gain of −1 (Rf 10 kΩ)',                         () => inverting(10000), VOUT],
  ['OPAMP-inverting',  'an input that ignores FG1 (a fixed 0.5 V)',       invertingFixed,         VOUT],
  ['OPAMP-follower',   'open loop (IN1− on COM, not OUT1)',               followerOpen,           VOUT],
  ['OPAMP-follower',   'an input that ignores FG1 (a fixed 6 V)',         followerFixed,          VOUT],
  ['OPAMP-comparator', 'the LED backwards',                                () => comparator({ backwards: true }), LED_ON],
  ['OPAMP-comparator', 'the inputs swapped (lit below 5 V, dark above)',   () => comparator({ swap: true }),      LED_ON],
  ['OPAMP-comparator', 'the LED fed from the + rail, not OUT1 (always lit)', () => comparator({ fromRail: true }), LED_ON],
];

test('each op-amp case fails a wrong build, naming the right check', () => {
  const bad = [];
  for (const [id, what, make, re] of WRONG) {
    const got = Eval.grade(caseById(id), reply(make()));
    if (got.pass) bad.push(`${id} passes ${what}`);
    else if (!named(got.failed, re)) bad.push(`${id} on ${what}: no ${re} among ${JSON.stringify(got.failed)}`);
  }
  assert.deepStrictEqual(bad, []);
});
