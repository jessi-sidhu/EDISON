// The function generator part (issue #120): an off-board instrument like the
// bench supply whose sine drives the circuit live, with its AI pack, recipe
// and ai-eval case. The page's half (place it from the sidebar, the panel,
// the inspector, Run and the LED breathing) is e2e/function-generator.spec.js.
//
// Run with:  npm test
//
// Shapes these tests assume (spec: docs/superpowers/specs/
// 2026-10-01-phase-4-op-amp-and-sine-design.md → "The function generator
// part"; values from Aarmen on the issue), stated so the builder matches them:
// - type 'function_generator', place { kind: 'offboard' }, pins ['out', 'com'],
//   ref 'com'. Its label prefix is the def's own (read here, never assumed);
//   its tool is place_function_generator (ai.tool unset).
// - values: amplitude (V, peak) 0–10, default 1; frequency (Hz) 0.1–100,
//   default 1; offset (V) −10…+10, default 0. 'Hz' is a new ValueSpec unit.
// - elements: exactly one V with wave { kind: 'sine', amp: amplitude,
//   freq: frequency, offset } behind 50 Ω, so OUT into 1 kΩ is
//   (offset + amplitude·sin(2π·frequency·t))·1000/1050. Stepped by #119's
//   Sim.analyze(components, wires, { dt, state, t }); a plain solve reads
//   the offset.
// - measure(r).vout: the present output, V(out) − V(com), in volts.
// - The results lines (result.lines, what #sim-results shows) say
//   "sine 5.00 Vp at 1.0 Hz" and the present output in volts.
// - ai: keywords sine, signal, wave, function generator, oscillate, fade,
//   breathe; a guide; a recipe (5 Vp, 5 V offset, 1 Hz, so 0–10 V, into
//   470 Ω and a red LED: never reverse-biased); listed: 'in-play' (test/part-packs.test.js LISTED_ONLY_IN_PLAY), so
//   the demo prompt is byte-identical (test/prompt-golden.test.js pins it).
// - scripts/ai-eval-cases.js has a case whose message is
//   "Make an LED fade in and out with a function generator". It grades the
//   LED at more than one moment of the sine (the runner's plain solve only
//   sees the offset), whatever frequency the AI picks: scripts/ai-eval.js
//   lets a case or state solve at a time `t` (Sim.analyze(c, w, { dt, state,
//   t })), with its frequency pinned by the state's `after` (coordinator's
//   decision on #120).
//
// How: real solves (Board → Sim.analyze → Readings), the real server's
// selectTools / ask (AI_PROVIDER=deepseek, a fake fetch, no network) and the
// real eval grader. Nothing under test is mocked.

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
const Recipes  = require('./fixtures/recipes.js');
const { recipeActions } = require('./fixtures/recipe-steps.js');

const TYPE      = 'function_generator';
const DEMO      = 'Build a single LED circuit with a current-limiting resistor.';
const FADE      = 'Make an LED fade in and out with a function generator';
const R_OUT     = 50;     // Ω, the generator's output resistance
const R_LOAD    = 1000;   // Ω

const toolName = def => (def.ai && def.ai.tool) || 'place_' + def.type;

function fg() {
  const def = Parts.get(TYPE);
  assert.ok(def, `Parts.get('${TYPE}') is null; parts: ${Parts.all().map(d => d.type).join(', ')}`);
  return def;
}
const label = () => fg().prefix + '1';

function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol,
    `${what}: expected ${want} (±${tol}), got ${got}`);
}

// ── Solving a board ─────────────────────────────────────────────────────────

// FG1 OUT → + rail, COM → − rail, R1 1 kΩ (a10–a14) across the rails.
function loadedBoard(values) {
  const L = label();
  return { parts: [{ type: TYPE, label: L, values },
                   { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: R_LOAD } }],
           wires: [[`${L}.0`, 'tp_50'], [`${L}.1`, 'tn_50'], ['tp_9', 'b10'], ['b14', 'tn_15']] };
}

// Solve an Example (wires [from, to]) plainly, or as one step at time t.
function solve(ex, t) {
  const board = Board.toSim(Board.fromExample(ex));
  const result = t === undefined
    ? Sim.analyze(board.components, board.wires)
    : Sim.analyze(board.components, board.wires, { dt: 1e-3, state: {}, t });
  assert.strictEqual(result.status, 'ok', `status ${result.status}: ${(result.lines || []).map(l => l.text).join(' | ')}`);
  return { result, readings: Readings.from(result, board) };
}

// Solve AI actions (a recipe) built through the board model, at time t.
function solveActions(actions, t) {
  const applied = Board.apply(Board.empty(), actions.map(a => ({ ...a })));
  assert.deepStrictEqual(applied.errors, [], 'every action applies to the board model');
  const board = Board.toSim(applied.board);
  const result = Sim.analyze(board.components, board.wires, { dt: 1e-3, state: {}, t });
  assert.strictEqual(result.status, 'ok', `status ${result.status}: ${(result.lines || []).map(l => l.text).join(' | ')}`);
  return result;
}

const emf = (v, t) => v.offset + v.amplitude * Math.sin(2 * Math.PI * v.frequency * t);

// ── 1. The part ─────────────────────────────────────────────────────────────

test('the function generator is an off-board source with two terminals, OUT and COM, COM its ground', () => {
  const def = fg();
  assert.deepStrictEqual([...def.pins], ['out', 'com']);
  assert.strictEqual(def.ref, 'com', 'COM can be ground');
  assert.deepStrictEqual({ ...def.place }, { kind: 'offboard' });
});

// ── 2. The values and their limits ──────────────────────────────────────────

const VALUES = [
  // key          unit   default  min    max    just below   just above
  ['amplitude',   'V',   1,       0,     10,    -0.01,       10.01],
  ['frequency',   'Hz',  1,       0.1,   100,   0.09,        100.1],
  ['offset',      'V',   0,       -10,   10,    -10.01,      10.01],
];

describe('values: amplitude 0–10 Vp (1), frequency 0.1–100 Hz (1), offset ±10 V (0)', () => {
  test.each(VALUES)('%s: unit %s, default %s, range %s to %s', (key, unit, dflt, min, max) => {
    const spec = fg().values && fg().values[key];
    assert.ok(spec, `values.${key} is missing: ${JSON.stringify(Object.keys(fg().values || {}))}`);
    assert.deepStrictEqual({ unit: spec.unit, default: spec.default, min: spec.min, max: spec.max },
                           { unit, default: dflt, min, max });
  });

  test.each(VALUES)('%s: checkValue accepts min and max, refuses just outside', (key, unit, dflt, min, max, below, above) => {
    fg();
    for (const v of [min, max]) {
      const got = Parts.checkValue(TYPE, key, v);
      assert.ok(got.ok, `${key} = ${v} should be accepted: ${JSON.stringify(got)}`);
    }
    for (const v of [below, above]) {
      const got = Parts.checkValue(TYPE, key, v);
      assert.strictEqual(got.ok, false, `${key} = ${v} should be refused: ${JSON.stringify(got)}`);
    }
  });
});

test('elements: exactly one V, carrying a sine wave of the set amplitude, frequency and offset', () => {
  const v = { amplitude: 5, frequency: 2, offset: 2.5 };
  const els = fg().elements(v, {});
  const sources = els.filter(e => e.kind === 'V');
  assert.strictEqual(sources.length, 1, `one V element: ${JSON.stringify(els)}`);
  assert.deepStrictEqual({ ...sources[0].wave }, { kind: 'sine', amp: 5, freq: 2, offset: 2.5 });
});

// ── 3. The output at t, through 50 Ω into 1 kΩ ─────────────────────────────
// 5 Vp, 1 Hz, 2.5 V offset: the load sees (2.5 + 5·sin(2πt))·1000/1050.

describe('5 Vp, 1 Hz, 2.5 V offset into 1 kΩ: OUT reads (offset + A·sin(2πft))·1000/1050', () => {
  const v = { amplitude: 5, frequency: 1, offset: 2.5 };
  const split = R_LOAD / (R_LOAD + R_OUT);

  test.each([
    // t        why
    [0,         'sin 0: the offset alone, 2.381 V'],
    [0.1,       'part way up, 6.902 V'],
    [0.25,      'the peak, 7.5 V EMF → 7.143 V'],
    [0.5,       'back to the offset, 2.381 V'],
    [0.75,      'the trough, −2.5 V EMF → −2.381 V'],
  ])('at t = %s s (%s)', (t) => {
    const { result, readings } = solve(loadedBoard(v), t);
    const want = emf(v, t) * split;
    near(readings.voltage('c10'), want, 1e-3, `V across the 1 kΩ load at t = ${t} s`);
    near(result.parts[label()].m.vout, want, 1e-3, `${label()} measure vout (the present output) at t = ${t} s`);
  });

  test('a plain solve (no time step) reads the offset through the divider, 2.381 V', () => {
    const { readings } = solve(loadedBoard(v));
    near(readings.voltage('c10'), 2.5 * split, 1e-3, 'V across the load, plain solve');
  });

  test('frequency counts: at 2 Hz the peak comes at t = 0.125 s, and t = 0.25 s is back at the offset', () => {
    const v2 = { ...v, frequency: 2 };
    near(solve(loadedBoard(v2), 0.125).readings.voltage('c10'), 7.5 * split, 1e-3, 'peak at 2 Hz');
    near(solve(loadedBoard(v2), 0.25).readings.voltage('c10'), 2.5 * split, 1e-3, 'half a 2 Hz period');
  });

  test('defaults (1 Vp, 1 Hz, 0 V): ±0.952 V at the peak and trough', () => {
    near(solve(loadedBoard({}), 0.25).readings.voltage('c10'), split, 1e-3, 'default peak');
    near(solve(loadedBoard({}), 0.75).readings.voltage('c10'), -split, 1e-3, 'default trough');
  });
});

// ── 4. The results line: the present output and the set sine ───────────────

const VOLT_READ = /([-−]?\d+(?:\.\d+)?) ?V\b/g;
const voltsIn = text => [...String(text).matchAll(VOLT_READ)].map(m => Number(m[1].replace('−', '-')));

test('the results lines say "sine 5.00 Vp at 1.0 Hz" and the present output (7.14 V at the peak, −2.38 V at the trough)', () => {
  const v = { amplitude: 5, frequency: 1, offset: 2.5 };
  for (const [t, want] of [[0.25, 7.5 * R_LOAD / (R_LOAD + R_OUT)], [0.75, -2.5 * R_LOAD / (R_LOAD + R_OUT)]]) {
    const { result } = solve(loadedBoard(v), t);
    const text = (result.lines || []).map(l => l.text).join(' | ');
    assert.ok(text.includes('sine 5.00 Vp at 1.0 Hz'), `the lines name the sine: ${text}`);
    assert.ok(voltsIn(text).some(x => Math.abs(x - want) <= 0.01),
      `at t = ${t} s the lines show the present output ${want.toFixed(2)} V: ${text}`);
  }
});

// ── 5. The recipe: 5 Vp, 5 V offset, 1 Hz into 470 Ω and a red LED ─────────
// Output 0–10 V. Peak: (10 − 2.0) / (470 + 50 + 0.1) = 15.38 mA (the real
// simulator's figure), lit and under the 20 mA rating. Trough: 0 V, dark, and
// never reverse-biased, so no "backwards" line while it breathes.

const recipe = () => {
  const def = fg();
  assert.ok(def.ai && def.ai.recipe, `the ${TYPE} has an ai.recipe: ${JSON.stringify(def.ai)}`);
  return def.ai.recipe;
};

test('recipe: one generator at 5 Vp, 5 V offset, 1 Hz, a 470 Ω resistor and a red LED', () => {
  const ex = recipe();
  const gens = ex.parts.filter(p => p.type === TYPE);
  assert.strictEqual(gens.length, 1, 'one function generator');
  const defaults = Object.fromEntries(Object.entries(fg().values || {}).map(([k, spec]) => [k, spec.default]));
  const values = { ...defaults, ...gens[0].values };
  assert.deepStrictEqual({ amplitude: values.amplitude, offset: values.offset, frequency: values.frequency },
                         { amplitude: 5, offset: 5, frequency: 1 });
  const res = ex.parts.filter(p => p.type === 'resistor');
  assert.deepStrictEqual(res.map(p => p.values && p.values.resistance), [470], 'one 470 Ω resistor');
  const leds = ex.parts.filter(p => p.type === 'led');
  assert.strictEqual(leds.length, 1, 'one LED');
  const color = (leds[0].values && leds[0].values.color) || Parts.get('led').values.color.default;
  assert.strictEqual(color, 'red', 'a red LED');
});

test('recipe: the LED breathes, lit at 15.4 mA (under its 20 mA rating) on the peak (t = 0.25 s) and dark on the trough (t = 0.75 s)', () => {
  const actions = recipeActions(recipe());
  const peak = solveActions(actions, 0.25);
  const trough = solveActions(actions, 0.75);
  const ledLabel = Object.keys(peak.parts).find(l => /^LED/.test(l));
  const led = peak.parts[ledLabel];
  near(led.m.current, 15.38, 0.3, 'LED mA at the peak, (10 − 2.0) / 520.1');
  assert.ok(led.m.current < led.r.values.maxCurrent * 1000,
    `under the LED's ${led.r.values.maxCurrent * 1000} mA rating at the peak: ${led.m.current} mA`);
  assert.strictEqual(led.m.on, true, 'LED lit at the peak');
  assert.strictEqual(trough.parts[ledLabel].m.on, false, 'LED dark at the trough');
});

// Pin: 0–10 V never reverse-biases the LED, so a breathing LED shows no
// "LED is backwards" line on its troughs (2.5 V offset did: −2.5 V ≥ vf).
test('pin: recipe at the trough (t = 0.75 s): the results lines and the LED\'s warnings say nothing "backwards"', () => {
  const trough = solveActions(recipeActions(recipe()), 0.75);
  const text = (trough.lines || []).map(l => l.text).join(' | ');
  assert.ok(!/backwards/i.test(text), `the trough's results lines: ${text}`);
  const ledLabel = Object.keys(trough.parts).find(l => /^LED/.test(l));
  assert.deepStrictEqual(trough.parts[ledLabel].warnings.filter(w => /backwards/i.test(w)), [], 'LED warnings at the trough');
});

test('recipe: the server checker finds nothing (findCircuitProblems and checkBuild), so the AI\'s copy gets no Heads up', () => {
  const actions = recipeActions(recipe());
  assert.deepStrictEqual(Server.findCircuitProblems(actions.map(a => ({ ...a }))), [], 'findCircuitProblems');
  assert.deepStrictEqual(Server.checkBuild(actions.map(a => ({ ...a })), null), [], 'checkBuild');
});

// ── 5b. The AI's simulation summary names the generator's ground ───────────
// Sim.simulationSummary's first line says where voltages are measured from.
// A 2-pin off-board source used to read as "the first battery's − terminal";
// the generator is not a battery.

const summaryOf = actions => {
  const applied = Board.apply(Board.empty(), actions.map(a => ({ ...a })));
  assert.deepStrictEqual(applied.errors, [], 'every action applies to the board model');
  const board = Board.toSim(applied.board);
  return Sim.simulationSummary(board.components, board.wires, (comps, comp) => comp.label);
};

test('simulationSummary: on the recipe board (the generator its only source) voltages are measured from the generator\'s COM, and nothing says "battery"', () => {
  const out = summaryOf(recipeActions(recipe()));
  const L = label();
  assert.match(out[0], /^Status: solved\./, out[0]);
  assert.match(out[0], new RegExp(`\\b${L}\\.(com|1)\\b`), `names the generator's COM in label form: ${out[0]}`);
  assert.match(out[0], /function generator/i, `says it is the function generator's: ${out[0]}`);
  assert.deepStrictEqual(out.filter(l => /battery/i.test(l)), [], `no line mentions a battery (there is none):\n${out.join('\n')}`);
});

// Pin (passes today; test/parts-bench_supply.test.js has it word for word too).
test('pin: simulationSummary on the one-LED battery build still measures from "BAT1.1 (the first battery\'s − terminal)"', () => {
  const out = summaryOf(Recipes.ONE_LED);
  assert.equal(out[0], "Status: solved. Voltages are measured from BAT1.1 (the first battery's − terminal).");
});

// ── 6. The AI pack: which requests send place_function_generator ───────────

const selected = message => Server.selectTools(message, []).map(d => d.name);

const NAMES_IT = [
  FADE,
  'Drive a 1 kΩ resistor with a 2 V sine.',
  'Feed a 10 Hz signal into the resistor.',
  'Show me a wave on an LED.',
  'Make an LED breathe.',
  'Build a circuit whose voltage oscillates.',
  'Add a function generator.',
];

test('selectTools sends place_function_generator for sine, signal, wave, function generator, oscillate, fade and breathe', () => {
  const t = toolName(fg());
  const missing = NAMES_IT.filter(m => !selected(m).includes(t));
  assert.deepStrictEqual(missing, [], `messages that should send ${t} but do not`);
});

test('pin: selectTools does not send place_function_generator for the demo or for any other ai-eval case message', () => {
  const t = toolName(fg());
  // An op-amp build's input is the function generator (#198), so the opamp-tagged cases send it too.
  const others = [DEMO, ...CASES.filter(c => c.message !== FADE && !(c.tags || []).includes('opamp')).map(c => c.message)];
  assert.ok(others.length > 5, `sanity: the cases file has its messages (${others.length})`);
  const wrong = others.filter(m => selected(m).includes(t));
  assert.deepStrictEqual(wrong, [], `messages with no sine in them that send ${t}`);
});

test('the fade request also sends the tools its build needs: the resistor and the LED', () => {
  const lacking = [toolName(fg()), 'place_resistor', 'place_led'].filter(t => !selected(FADE).includes(t));
  assert.deepStrictEqual(lacking, [], `tools missing for "${FADE}"`);
});

// ── 7. What the request sends (the prompt), with a fake DeepSeek ───────────

async function firstBody(message) {
  const calls = [];
  vi.stubGlobal('fetch', async (url, opts) => {
    calls.push(JSON.parse(opts.body));
    return { ok: true, status: 200, text: async () => '',
      json: async () => ({ choices: [{ message: { content: 'Sure.', tool_calls: null } }] }) };
  });
  const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
  try { await Server.ask('', message, []); } finally { quiet.mockRestore(); vi.unstubAllGlobals(); }
  assert.ok(calls.length >= 1, `nothing was sent to DeepSeek for "${message}"`);
  return calls[0];
}

const linesOf = body => body.messages[0].content.split('\n');
const namesOf = body => (body.tools || []).map(t => t.function.name);
const propsOf = (body, name) => {
  const t = (body.tools || []).find(x => x.function.name === name);
  assert.ok(t, `${name} is not sent: ${JSON.stringify(namesOf(body))}`);
  return Object.keys((t.function.parameters && t.function.parameters.properties) || {});
};
function packIn(body, def) {
  const t = toolName(def);
  const lines = linesOf(body);
  const guide = def.ai && def.ai.guide;
  return {
    values: lines.filter(l => l.startsWith(`- ${t} `)),
    guide:  lines.filter(l => guide && l === `- ${t}: ${guide}`),
    recipe: lines.filter(l => l.startsWith(`RECIPE FOR THE ${def.name.toUpperCase()} (${t}`)),
    tagged: lines.filter(l => l.startsWith(`- ${t} `) || l.startsWith(`- ${t}: `)),
  };
}
// Value keys only this part has, so a schema carrying one carries this part.
function ownKeys(def) {
  const others = new Set(Parts.all().filter(d => d !== def && d.ai !== false).flatMap(d => Object.keys(d.values || {})));
  return Object.keys(def.values || {}).filter(k => !others.has(k));
}
function coreOf(text) {
  const lines = text.split('\n');
  const find = start => lines.find(l => l.startsWith(start)) || '';
  return { catalogue: find('- Every part (type: name):'), labels: find('- Every part has a label'), wiredBy: find('- Parts on the board (') };
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function namedIn(core, def) {
  const wired = (core.wiredBy.match(/^- Parts on the board \(([^)]*)\)/) || ['', ''])[1].split(', ');
  return {
    catalogue: new RegExp(`(?:: |, )${esc(def.type)}: ${esc(def.name)}(?:,|\\.$)`).test(core.catalogue),
    labels:    new RegExp(`(?:: |, )${esc(def.prefix)} = `).test(core.labels),
    wiredBy:   wired.includes(def.prefix),
  };
}

const sent = {};
beforeAll(async () => {
  sent.demo = await firstBody(DEMO);
  sent.fade = await firstBody(FADE);
});

test('the fade request sends the generator\'s pack: its guide, a values line for amplitude, frequency and offset, its recipe, and those keys in set_value', () => {
  const def = fg();
  const t = toolName(def);
  assert.ok(namesOf(sent.fade).includes(t), `${t} is not sent: ${JSON.stringify(namesOf(sent.fade))}`);
  const pack = packIn(sent.fade, def);
  assert.equal(pack.guide.length, 1, `the guide line "- ${t}: ${def.ai && def.ai.guide}" in the system prompt`);
  for (const k of ['amplitude', 'frequency', 'offset']) {
    assert.ok(pack.values.some(l => l.startsWith(`- ${t} ${k}: `)), `a PART VALUES line "- ${t} ${k}: ..."; got ${JSON.stringify(pack.values)}`);
  }
  assert.equal(pack.recipe.length, 1, `the recipe "RECIPE FOR THE ${def.name.toUpperCase()} (${t}..." in the system prompt`);
  const sv = propsOf(sent.fade, 'set_value');
  assert.deepStrictEqual(['amplitude', 'frequency', 'offset'].filter(k => !sv.includes(k)), [], `set_value keys: ${JSON.stringify(sv)}`);
});

test('the fade request lists the generator in the catalogue and label prefixes; it is off the board, so never in wiredBy', () => {
  const def = fg();
  const core = coreOf(sent.fade.messages[0].content);
  assert.deepEqual(namedIn(core, def), { catalogue: true, labels: true, wiredBy: false },
    `the fade request's core lines:\n${Object.values(core).join('\n')}`);
});

test('pin: the demo LED request sends nothing of the generator: no tool, no pack lines, no generator-only set_value keys', () => {
  const def = fg();
  const t = toolName(def);
  assert.ok(!namesOf(sent.demo).includes(t), `the demo sends ${t}`);
  const pack = packIn(sent.demo, def);
  assert.deepEqual([...pack.tagged, ...pack.recipe], [], 'the demo\'s system prompt has generator pack lines');
  const own = ownKeys(def);
  assert.ok(own.length >= 1, `sanity: the generator has a value key no other AI part has: ${JSON.stringify(Object.keys(def.values || {}))}`);
  const sv = propsOf(sent.demo, 'set_value');
  assert.deepEqual(own.filter(k => sv.includes(k)), [], `the demo's set_value ${JSON.stringify(sv)} carries generator-only keys`);
});

// ── 8. The ai-eval case: "Make an LED fade in and out with a function generator"

const reply = actions => ({ reply: 'Built it.', actions });
function fadeCase() {
  const c = CASES.find(x => x.message === FADE);
  assert.ok(c, `scripts/ai-eval-cases.js has no case with the message "${FADE}"; ids: ${CASES.map(x => x.id).join(', ')}`);
  return c;
}
// The recipe with a change (parts and wires deep-copied).
function recipeWith(change) {
  const r = JSON.parse(JSON.stringify(recipe()));
  change(r);
  return recipeActions(r);
}
const genOf = r => r.parts.find(p => p.type === TYPE);

test('the fade case is a well-formed QA case: tagged parts, no Heads up, a simulator reading, status ok', () => {
  const c = fadeCase();
  assert.ok((c.tags || []).includes('parts'), `tags: ${JSON.stringify(c.tags)}`);
  assert.strictEqual(c.checks.noHeadsUp, true);
  assert.ok(c.checks.expect || c.checks.expectAll, 'checks a simulator reading');
  assert.strictEqual(c.checks.status, 'ok');
});

test('the fade case passes the recipe', () => {
  const got = Eval.grade(fadeCase(), reply(recipeActions(recipe())));
  assert.deepStrictEqual(got, { pass: true, failed: [] }, `the recipe fails the fade case: ${JSON.stringify(got.failed)}`);
});

// Another right answer: 4 Vp, 4 V offset (0–8 V), 0.5 Hz, 330 Ω, elsewhere
// on the board. Peak (8 − 2) / 380.1 = 15.8 mA, trough 0 V. The case must not
// hang on the recipe's frequency, values or holes.
test('the fade case passes a different correct build (4 Vp, 4 V offset, 0.5 Hz, 330 Ω, other holes)', () => {
  const L = label();
  const actions = [
    { tool: 'delete_all' },
    { tool: toolName(fg()), amplitude: 4, frequency: 0.5, offset: 4 },
    { tool: 'add_wire', from: `${L}.0`, to: 'tp_60' },
    { tool: 'add_wire', from: `${L}.1`, to: 'tn_60' },
    { tool: 'place_resistor', holeA: 'b20', holeB: 'b24', resistance: 330 },
    { tool: 'place_led', holeA: 'c26', holeB: 'c24' },     // cathode c26, anode c24 (toward the resistor)
    { tool: 'add_wire', from: 'tp_21', to: 'a20' },
    { tool: 'add_wire', from: 'a26', to: 'tn_26' },
  ];
  const got = Eval.grade(fadeCase(), reply(actions));
  assert.deepStrictEqual(got, { pass: true, failed: [] }, `a correct 0.5 Hz build fails the fade case: ${JSON.stringify(got.failed)}`);
});

test.each([
  ['the LED backwards (reverse-biased on the peak, never lit)', () => recipeWith(r => {
    const led = r.parts.find(p => p.type === 'led');
    led.holes = [led.holes[1], led.holes[0]];
  })],
  ['a flat output (0 Vp, 5 V offset): the LED is always on, it never fades', () => recipeWith(r => {
    genOf(r).values = { ...genOf(r).values, amplitude: 0, offset: 5 };
  })],
  ['the defaults (1 Vp, no offset): the LED never lights', () => recipeWith(r => {
    genOf(r).values = { amplitude: 1, frequency: 1, offset: 0 };
  })],
  ['a battery and an LED (no generator)', () => Recipes.ONE_LED],
])('the fade case fails %s', (why, build) => {
  const got = Eval.grade(fadeCase(), reply(build()));
  assert.strictEqual(got.pass, false, `${why} passes the fade case: ${JSON.stringify(got)}`);
});
