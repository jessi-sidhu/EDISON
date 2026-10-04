// The real-AI eval script's grading, in Node (issue #82). No network: these
// tests never call ask(); they hand grade() a reply built from known recipes.
//
// Contract these tests are written against (scripts/ai-eval.js; requiring it
// must not start a server, read a key or call out; the CLI runs only when
// require.main === module):
// - grade(testCase, reply) → { pass, failed: string[] }, reply = { reply, actions }.
//   Board = Board.apply(testCase.board ? Board.fromExample(testCase.board)
//   : Board.empty(), reply.actions), then testCase.after applied, then
//   Sim.analyze(...Board.toSim). Checks, each optional:
//     noHeadsUp: true      → 'noHeadsUp' if the reply text has
//                            "Heads up, this build has a problem:"
//     parts: { type: n }   → 'parts.<type>' if the board's count differs
//     expect: { LABEL: { field: value | [lo, hi] } } → 'expect.LABEL.field'
//     expectAll: { type: { field: … } } → 'expectAll.<type>.field' if any
//                            part of that type misses it, or none exists
//     status: 'ok'         → 'status' or 'shorted' if not ok / shorted
//   Any Board.apply error → 'apply'.
//   testCase.states: [{ name, after, checks }]: each graded on the reply's
//   built board plus that state's own `after` (not the case's), its failures
//   named '<name>.<check>' (e.g. 'released.expectAll.led.on'). grade passes
//   only when the main checks and every state pass.
// - describeError(err) → a one-line reason safe to print: names the status
//   ("DeepSeek 401") but never the response body (it can echo the key).
// - outcome(testCase, replyOrError) → 'pass' | 'fail' | 'error'. A thrown
//   Error or the server's "Sparky could not reach the AI service" reply is
//   'error'.
// - summarize(results), results = [{ id, tags, outcomes: ['pass'|'fail'|'error'] }]
//   → { cases: [{ id, passes, runs, passAll }], exitCode }, exitCode 1 iff a
//   demo-tagged case has passAll false.
// - parseArgs(argv) → { runs: 3 by default, only: undefined | string }.
// - emptyBoardMarkdown() → the markdown App.exportMarkdown sends for a fresh board.
//
// scripts/ai-eval-cases.js exports [{ id, tags?, message, board?, after?, checks }],
// the gradable docs/QA.md AI-xx cases.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Parts = require('../circuit3d/js/parts');
const GEOMETRY = require('../circuit3d/js/board-geometry.js');
const Recipes = require('./fixtures/recipes.js');
const { recipeActions } = require('./fixtures/recipe-steps.js');

const Eval  = require('../scripts/ai-eval.js');
const CASES = require('../scripts/ai-eval-cases.js');

const HEADS_UP = '\n\nHeads up, this build has a problem:\n- Hole c6 holds 2 leads.\n\nAsk me to fix it.';
const FALLBACK = 'Sparky could not reach the AI service. Please try again in a moment.';
const DEMO_MESSAGE = 'Build a single LED circuit with a current-limiting resistor.';

const reply = (actions, text = 'Built it.') => ({ reply: text, actions });
const caseById = id => CASES.find(c => c.id === id);
const demoCase = () => CASES.find(c => (c.tags || []).includes('demo'));

// Builds used below. ONE_LED is the prompt's one-LED recipe at C=2.
const BATTERY = Recipes.ONE_LED.slice(0, 4);
const BACKWARDS = Recipes.ONE_LED.map(a => (a.tool === 'place_led' ? { ...a, holeA: a.holeB, holeB: a.holeA } : a));
const NO_RESISTOR = [...BATTERY,
  { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
  { tool: 'add_wire', from: 'tp_6', to: 'a6' },
  { tool: 'add_wire', from: 'a8', to: 'tn_8' }];
const PRESS_SW1 = [{ tool: 'set_control', part: 'SW1', pressed: true }];

// A case written here, so grade's own rules are tested apart from the cases file.
const LED_CASE = {
  id: 'T-LED', message: DEMO_MESSAGE,
  checks: { noHeadsUp: true, parts: { resistor: 1, led: 1 }, expect: { LED1: { on: true, current: [10, 20] } },
            expectAll: { led: { on: true, current: [10, 20] } }, status: 'ok' },
};

// ── grade ────────────────────────────────────────────────────────────────

test('grade passes the one-LED recipe on a written case and on the demo case', () => {
  assert.deepStrictEqual(Eval.grade(LED_CASE, reply(Recipes.ONE_LED)), { pass: true, failed: [] });
  const demo = demoCase();
  assert.ok(demo, 'the cases file has no demo-tagged case');
  const got = Eval.grade(demo, reply(Recipes.ONE_LED));
  assert.deepStrictEqual(got, { pass: true, failed: [] }, `demo case failed the prompt's own recipe: ${JSON.stringify(got.failed)}`);
});

test('grade names the failed check: backwards LED, no resistor, Heads up, a rejected action', () => {
  const back = Eval.grade(LED_CASE, reply(BACKWARDS));
  assert.strictEqual(back.pass, false);
  assert.ok(back.failed.includes('expect.LED1.on'), `backwards: ${JSON.stringify(back.failed)}`);
  assert.ok(back.failed.includes('expectAll.led.on'), `backwards: ${JSON.stringify(back.failed)}`);
  assert.ok(!back.failed.includes('parts.resistor'), `backwards has its resistor: ${JSON.stringify(back.failed)}`);

  // Straight across the rails: the simulator reports a short (70 A through the LED).
  const bare = Eval.grade(LED_CASE, reply(NO_RESISTOR));
  assert.strictEqual(bare.pass, false);
  assert.ok(bare.failed.includes('parts.resistor'), `no resistor: ${JSON.stringify(bare.failed)}`);
  assert.ok(bare.failed.some(f => f === 'status' || f === 'shorted'), `no resistor is shorted: ${JSON.stringify(bare.failed)}`);

  assert.deepStrictEqual(Eval.grade(LED_CASE, reply(Recipes.ONE_LED, `Built it.${HEADS_UP}`)),
    { pass: false, failed: ['noHeadsUp'] });

  assert.deepStrictEqual(Eval.grade(LED_CASE, reply([...Recipes.ONE_LED, { tool: 'set_value', part: 'R9', resistance: 1000 }])),
    { pass: false, failed: ['apply'] });
});

test('the demo case fails a backwards LED and a build with no resistor', () => {
  const demo = demoCase();
  const back = Eval.grade(demo, reply(BACKWARDS));
  assert.strictEqual(back.pass, false);
  assert.ok(back.failed.some(f => /^expect(All)?\.(LED1|led)\.on$/.test(f)), `backwards: ${JSON.stringify(back.failed)}`);
  const bare = Eval.grade(demo, reply(NO_RESISTOR));
  assert.strictEqual(bare.pass, false);
  assert.ok(bare.failed.includes('parts.resistor'), `no resistor: ${JSON.stringify(bare.failed)}`);
});

test('grade: expectAll fails when no part of that type is on the board; status fails on a shorted battery', () => {
  const none = Eval.grade({ id: 'T', message: 'x', checks: { expectAll: { led: { on: true } } } }, reply(BATTERY));
  assert.strictEqual(none.pass, false);
  assert.ok(none.failed.some(f => f.startsWith('expectAll.led')), JSON.stringify(none.failed));

  const short = Eval.grade({ id: 'T', message: 'x', checks: { status: 'ok' } },
    reply([...BATTERY, { tool: 'add_wire', from: 'tp_5', to: 'tn_5' }]));
  assert.strictEqual(short.pass, false);
  assert.ok(short.failed.some(f => f === 'status' || f === 'shorted'), JSON.stringify(short.failed));
});

test('grade runs the case\'s after actions: the button branches are dark released, lit pressed', () => {
  const checks = { expect: { LED1: { on: true, current: [14.8, 15.0] }, LED2: { on: true, current: [14.4, 14.6] } } };
  const released = Eval.grade({ id: 'T-BTN', message: 'x', checks }, reply(Recipes.BUTTON_BRANCHES));
  assert.strictEqual(released.pass, false);
  assert.ok(released.failed.includes('expect.LED1.on') && released.failed.includes('expect.LED2.on'), JSON.stringify(released.failed));

  const pressed = Eval.grade({ id: 'T-BTN', message: 'x', after: PRESS_SW1, checks }, reply(Recipes.BUTTON_BRANCHES));
  assert.deepStrictEqual(pressed, { pass: true, failed: [] });
});

test('grade starts from testCase.board when given: set R1 to 1 kΩ on the contract LED → 7 mA', () => {
  const board = {
    parts: [{ type: 'battery', label: 'BAT1' },
            { type: 'resistor', label: 'R1', holes: ['a2', 'a6'] },
            { type: 'led', label: 'LED1', holes: ['b8', 'b6'], values: { color: 'red' } }],
    wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_2', 'b2'], ['c8', 'tn_8']],
  };
  const tc = { id: 'T-EDIT', message: 'x', board, checks: { expect: { LED1: { on: true, current: [6.9, 7.1] } } } };
  // (9 V − 2.0 V) / 1000 Ω = 7.0 mA; with no board it would be "no part R1".
  assert.deepStrictEqual(Eval.grade(tc, reply([{ tool: 'set_value', part: 'R1', resistance: 1000 }])), { pass: true, failed: [] });
});

// ── outcome ─────────────────────────────────────────────────────────────

test('outcome: a thrown error or the server\'s fallback reply is an error, not a fail', () => {
  assert.strictEqual(Eval.outcome(LED_CASE, new Error('fetch failed: ECONNRESET')), 'error');
  assert.strictEqual(Eval.outcome(LED_CASE, reply([], FALLBACK)), 'error');
  assert.strictEqual(Eval.outcome(LED_CASE, reply(Recipes.ONE_LED)), 'pass');
  assert.strictEqual(Eval.outcome(LED_CASE, reply(BACKWARDS)), 'fail');
});

// ── summarize ───────────────────────────────────────────────────────────

test('summarize: pass^N per case, exit 1 only when a demo case misses it', () => {
  const demo = outcomes => ({ id: 'AI-01', tags: ['demo'], outcomes });
  const other = outcomes => ({ id: 'AI-14', tags: [], outcomes });
  const table = [
    { name: 'demo 3/3',            results: [demo(['pass', 'pass', 'pass'])],                                  exit: 0 },
    { name: 'demo 2/3',            results: [demo(['pass', 'fail', 'pass'])],                                  exit: 1 },
    { name: 'non-demo fails alone', results: [demo(['pass', 'pass', 'pass']), other(['fail', 'pass', 'pass'])], exit: 0 },
    { name: 'demo with an error run', results: [demo(['pass', 'error', 'pass'])],                              exit: 1 },
  ];
  for (const row of table) {
    const s = Eval.summarize(row.results);
    assert.strictEqual(s.exitCode, row.exit, `${row.name}: exitCode`);
  }
  const s = Eval.summarize([demo(['pass', 'error', 'pass']), other(['pass', 'pass', 'pass'])]);
  assert.deepStrictEqual(s.cases, [
    { id: 'AI-01', passes: 2, runs: 3, passAll: false },
    { id: 'AI-14', passes: 3, runs: 3, passAll: true },
  ]);
});

// ── parseArgs ───────────────────────────────────────────────────────────

test('parseArgs: 3 runs and no filter by default; --runs N and --only id|tag', () => {
  const d = Eval.parseArgs([]);
  assert.strictEqual(d.runs, 3);
  assert.strictEqual(d.only, undefined);
  const f = Eval.parseArgs(['--runs', '5', '--only', 'demo']);
  assert.strictEqual(f.runs, 5);
  assert.strictEqual(f.only, 'demo');
  assert.strictEqual(Eval.parseArgs(['--only', 'AI-10']).only, 'AI-10');
});

// ── emptyBoardMarkdown ──────────────────────────────────────────────────

// breadboard.js's App.boardTopologyText, loaded the way
// test/board-geometry.test.js loads it (a window shim; it has no Node export).
function topologyText() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'circuit3d', 'js', 'breadboard.js'), 'utf8');
  const window = { App: { BOARD_GEOMETRY: GEOMETRY } };
  new Function('window', src)(window);
  return window.App.boardTopologyText();
}

test('emptyBoardMarkdown is exactly what App.exportMarkdown sends for a fresh board', () => {
  // app.js exportMarkdown with no parts and no wires, section by section.
  const want = '**Board status: EMPTY — no components or wires placed yet.**\n\n'
    + '## Components\n_None._\n'
    + '\n## Wires\n_None._\n'
    + '\n## Simulation\nThe board is empty: no components placed.\n'
    + '\n' + topologyText() + '\n';
  assert.ok(want.includes(`- Columns 1-${GEOMETRY.COLS}.`), 'topology text loaded');
  assert.strictEqual(Eval.emptyBoardMarkdown(), want);
});

// ── The cases file ──────────────────────────────────────────────────────

// docs/QA.md AI-01…AI-23 that start from a fresh board with a gradable result.
// AI-03 (question about a hand build), AI-04 and AI-07 (follow-ups) and
// AI-05 (a pure question) are left out.
const GRADABLE = ['AI-01', 'AI-02', 'AI-06', 'AI-08', 'AI-09', 'AI-10', 'AI-11', 'AI-12', 'AI-13', 'AI-14',
                  'AI-15', 'AI-16', 'AI-17', 'AI-18', 'AI-19', 'AI-20', 'AI-21', 'AI-22', 'AI-23'];
const LEFT_OUT = ['AI-03', 'AI-04', 'AI-05', 'AI-07'];

test('cases: each has an id, a message and checks; ids unique; one demo case; every gradable QA case', () => {
  assert.ok(Array.isArray(CASES) && CASES.length, 'ai-eval-cases.js exports a non-empty array');
  for (const c of CASES) {
    assert.ok(typeof c.id === 'string' && c.id, `case without id: ${JSON.stringify(c)}`);
    assert.ok(typeof c.message === 'string' && c.message.trim(), `${c.id}: no message`);
    assert.ok(c.checks && Object.keys(c.checks).length, `${c.id}: no checks`);
    assert.strictEqual(c.checks.noHeadsUp, true, `${c.id}: every QA case says the reply has no "Heads up"`);
    assert.ok(c.checks.expect || c.checks.expectAll, `${c.id}: checks no simulator reading`);
  }
  const ids = CASES.map(c => c.id);
  assert.strictEqual(new Set(ids).size, ids.length, `duplicate ids: ${ids}`);

  const demos = CASES.filter(c => (c.tags || []).includes('demo'));
  assert.strictEqual(demos.length, 1, `demo-tagged cases: ${demos.map(c => c.id)}`);
  assert.strictEqual(demos[0].message, DEMO_MESSAGE);

  for (const id of GRADABLE) assert.ok(ids.includes(id), `missing ${id}`);
  for (const id of LEFT_OUT) assert.ok(!ids.includes(id), `${id} is not build-from-fresh or not gradable`);
});

// ── Every case is satisfiable by a correct build ────────────────────────

const onBattery = rest => [...BATTERY, ...rest];
const ledGroup = C => [
  { tool: 'place_resistor', holeA: `b${C}`, holeB: `b${C + 4}` },
  { tool: 'place_led', holeA: `c${C + 6}`, holeB: `c${C + 4}` },
  { tool: 'add_wire', from: `tp_${C + 1}`, to: `a${C}` },
  { tool: 'add_wire', from: `a${C + 6}`, to: `tn_${C + 6}` },
];
const recipeOf = type => recipeActions(Parts.get(type).ai.recipe);

// Case → a correct build: a part's ai.recipe, the prompt's hand-written
// recipes (test/fixtures/recipes.js), or the part guide's build (pot, LDR,
// thermistor). The case's own `after` is applied by grade.
const CORRECT_BUILD = {
  'AI-01': Recipes.ONE_LED,
  'AI-02': onBattery([...ledGroup(2), ...ledGroup(10), ...ledGroup(18)]),
  'AI-06': Recipes.ONE_LED,
  'AI-08': Recipes.SERIES_2,
  'AI-09': onBattery([
    { tool: 'place_potentiometer', hole: 'c2', direction: 'right', resistance: 1000 },
    { tool: 'add_wire', from: 'tp_4', to: 'a4' }, { tool: 'add_wire', from: 'a2', to: 'tn_2' },
    { tool: 'place_resistor', holeA: 'b3', holeB: 'b7' },
    { tool: 'place_led', holeA: 'c9', holeB: 'c7' }, { tool: 'add_wire', from: 'a9', to: 'tn_9' }]),
  'AI-10': Recipes.BUTTON_BRANCHES,
  'AI-11': onBattery([
    { tool: 'add_wire', from: 'tp_3', to: 'a2' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 4700 },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6' }, { tool: 'place_ldr', holeA: 'd6', holeB: 'd9' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8' }, { tool: 'add_wire', from: 'a9', to: 'tn_9' }]),
  'AI-12': onBattery([
    { tool: 'add_wire', from: 'tp_3', to: 'a2' },
    { tool: 'place_thermistor', holeA: 'b2', holeB: 'b5' },
    { tool: 'place_resistor', holeA: 'c5', holeB: 'c9', resistance: 3300 },
    { tool: 'place_buzzer', holeA: 'd9', holeB: 'd11' }, { tool: 'add_wire', from: 'a11', to: 'tn_11' }]),
  // A 5 V bench supply into the one-LED layout: (5 − 2) / 470 = 6.4 mA, lit.
  'AI-13': [{ tool: 'delete_all' }, { tool: 'place_bench_supply', voltage: 5 },
            { tool: 'add_wire', from: 'PS1.0', to: `tp_${GEOMETRY.COLS}` },
            { tool: 'add_wire', from: 'PS1.1', to: `tn_${GEOMETRY.COLS}` }, ...Recipes.ONE_LED.slice(4)],
  'AI-14': recipeOf('seven_segment'),
  'AI-15': recipeOf('diode'),
  'AI-16': recipeOf('zener'),
  'AI-17': recipeOf('toggle_switch'),
  'AI-18': recipeOf('slide_switch'),
  'AI-19': recipeOf('bulb'),
  'AI-20': recipeOf('motor'),
  'AI-21': recipeOf('current_source'),
  'AI-22': recipeOf('rgb_led'),
  'AI-23': recipeOf('bench_supply'),
  'PART-meter':     recipeOf('multimeter'),
  'PART-capacitor': recipeOf('capacitor'),
};

test('every gradable case passes a correct build of it (no case asks for more than a right answer gives)', () => {
  const bad = [];
  for (const [id, actions] of Object.entries(CORRECT_BUILD)) {
    const c = caseById(id);
    if (!c) { bad.push(`${id}: not in the cases file`); continue; }
    const got = Eval.grade(c, reply(actions));
    if (!got.pass) bad.push(`${id}: ${JSON.stringify(got.failed)}`);
  }
  assert.deepStrictEqual(bad, []);
});

// ── #123: the meter and capacitor cases fail a wrong build ─────────────────
// A part's recipe with one of its parts changed (holes or a wire end swapped).
function recipeWith(type, change) {
  const r = JSON.parse(JSON.stringify(Parts.get(type).ai.recipe));
  change(r);
  return recipeActions(r);
}

test('PART-capacitor fails the capacitor reversed (+ lead to ground: it reads −9 V), on expect.C1.V', () => {
  const c = caseById('PART-capacitor');
  assert.ok(c, 'PART-capacitor is not in the cases file');
  const reversed = recipeWith('capacitor', r => {
    const cap = r.parts.find(p => p.type === 'capacitor');
    cap.holes = [cap.holes[1], cap.holes[0]];
  });
  const got = Eval.grade(c, reply(reversed));
  assert.strictEqual(got.pass, false, `a reversed capacitor passes PART-capacitor: ${JSON.stringify(got)}`);
  assert.ok(got.failed.includes('expect.C1.V'), `expected expect.C1.V among the failures, got ${JSON.stringify(got.failed)}`);
});

test('PART-meter fails the meter\'s probes swapped (red on the − side: it reads −4.5 V), on expect.MM1.reading', () => {
  const c = caseById('PART-meter');
  assert.ok(c, 'PART-meter is not in the cases file');
  const swapped = recipeWith('multimeter', r => {
    r.wires = r.wires.map(([a, b]) => [a === 'MM1.red' ? 'MM1.black' : a === 'MM1.black' ? 'MM1.red' : a, b]);
  });
  const got = Eval.grade(c, reply(swapped));
  assert.strictEqual(got.pass, false, `a meter with swapped probes passes PART-meter: ${JSON.stringify(got)}`);
  assert.ok(got.failed.includes('expect.MM1.reading'), `expected expect.MM1.reading among the failures, got ${JSON.stringify(got.failed)}`);
});

// ── Review follow-ups (#82): states, AI-13, describeError, no server on require ──

const stateNames = c => (c.states || []).map(st => st.name);
// Every failure belongs to one of the case's states, and at least one to a
// state whose name matches nameRe.
function failsOnlyInStates(c, got, nameRe) {
  assert.strictEqual(got.pass, false, `${c.id}: expected a fail, got ${JSON.stringify(got)}`);
  const names = stateNames(c);
  const owner = f => names.find(n => f.startsWith(n + '.'));
  assert.deepStrictEqual(got.failed.filter(f => !owner(f)), [], `${c.id}: failures outside its states: ${JSON.stringify(got.failed)}`);
  assert.ok(got.failed.some(f => nameRe.test(owner(f))), `${c.id}: no failure names a ${nameRe} state: ${JSON.stringify(got.failed)}`);
}

test('grade: a state is graded on the built board plus its own after, failures named <state>.<check>', () => {
  // Main checks want the LEDs lit after the press; the released state wants them dark.
  const tc = { id: 'T-STATES', message: 'x', after: PRESS_SW1,
               checks: { expectAll: { led: { on: true } } },
               states: [{ name: 'released', after: [], checks: { expectAll: { led: { on: false } } } }] };
  assert.deepStrictEqual(Eval.grade(tc, reply(Recipes.BUTTON_BRANCHES)), { pass: true, failed: [] });

  const lit = { id: 'T-STATES', message: 'x', checks: { expect: { LED1: { on: true } } },
                states: [{ name: 'bright', after: [], checks: { expect: { LED1: { on: false } } } }] };
  assert.deepStrictEqual(Eval.grade(lit, reply(Recipes.ONE_LED)), { pass: false, failed: ['bright.expect.LED1.on'] });
});

test('AI-11 fails an always-on night light whose LDR sits off the circuit, on its bright state', () => {
  const c = caseById('AI-11');
  assert.ok(stateNames(c).length, 'AI-11 has no states: nothing grades the LED off at 300 lux');
  // Battery, 4.7 kΩ into the LED, the LDR placed at h20–h23 with nothing wired to it:
  // (9 − 2) / 4700 ≈ 1.5 mA at any light level.
  const alwaysOn = onBattery([
    { tool: 'add_wire', from: 'tp_3', to: 'a2' },
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6', resistance: 4700 },
    { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
    { tool: 'add_wire', from: 'a8', to: 'tn_8' },
    { tool: 'place_ldr', holeA: 'h20', holeB: 'h23' }]);
  failsOnlyInStates(c, Eval.grade(c, reply(alwaysOn)), /bright|day|light|300/i);
});

test('AI-10 fails the button branches with the button bypassed, on its released state', () => {
  const c = caseById('AI-10');
  assert.ok(stateNames(c).length, 'AI-10 has no states: nothing grades the LEDs dark with the button released');
  // + rail straight into the button's output column: the LEDs light pressed or not.
  const bypassed = [...Recipes.BUTTON_BRANCHES, { tool: 'add_wire', from: 'tp_5', to: 'd5' }];
  failsOnlyInStates(c, Eval.grade(c, reply(bypassed)), /releas/i);
});

// A 5 V bench supply into the one-LED layout, with the resistor and LED given.
const bench5 = (resistor, led) => [
  { tool: 'delete_all' }, { tool: 'place_bench_supply', voltage: 5 },
  { tool: 'add_wire', from: 'PS1.0', to: `tp_${GEOMETRY.COLS}` },
  { tool: 'add_wire', from: 'PS1.1', to: `tn_${GEOMETRY.COLS}` },
  ...(resistor ? [{ tool: 'place_resistor', holeA: 'b2', holeB: 'b6', ...resistor }] : []),
  { tool: 'place_led', holeA: 'c8', holeB: 'c6', ...led },
  resistor ? { tool: 'add_wire', from: 'tp_3', to: 'a2' } : { tool: 'add_wire', from: 'tp_6', to: 'a6' },
  { tool: 'add_wire', from: 'a8', to: 'tn_8' }];

test('AI-13 passes any sensible bench-supply LED build (330 Ω; a blue LED at 470 Ω) and counts the resistor', () => {
  const c = caseById('AI-13');
  const r330 = Eval.grade(c, reply(bench5({ resistance: 330 }, {})));            // (5 − 2) / 330 ≈ 9.1 mA
  assert.deepStrictEqual(r330, { pass: true, failed: [] }, `330 Ω red: ${JSON.stringify(r330.failed)}`);
  const blue = Eval.grade(c, reply(bench5({ resistance: 470 }, { color: 'blue' })));
  assert.deepStrictEqual(blue, { pass: true, failed: [] }, `470 Ω blue: ${JSON.stringify(blue.failed)}`);
  const bare = Eval.grade(c, reply(bench5(null, {})));
  assert.ok(bare.failed.includes('parts.resistor'), `no resistor: ${JSON.stringify(bare.failed)}`);
});

test('describeError names the provider status but never the response body or key', () => {
  assert.strictEqual(typeof Eval.describeError, 'function', 'scripts/ai-eval.js exports no describeError');
  const msg = Eval.describeError(new Error('DeepSeek 401: {"error":{"message":"Your api key: sk-abc123 is invalid"}}'));
  assert.strictEqual(typeof msg, 'string');
  assert.ok(msg.includes('DeepSeek 401'), `status missing: ${msg}`);
  assert.ok(!msg.includes('sk-abc123'), `leaks the key: ${msg}`);
  assert.ok(!msg.includes('Your api key') && !msg.includes('{'), `leaks the body: ${msg}`);
  assert.ok(Eval.describeError(new Error('fetch failed')).includes('fetch failed'));
});

// Pin (passes today): the server reads the key file on require, so only the
// CLI path may require it.
test('requiring ai-eval.js does not load backend/server.js', () => {
  const server = Object.keys(require.cache).filter(k => k.replace(/\\/g, '/').endsWith('backend/server.js'));
  assert.deepStrictEqual(server, []);
});
