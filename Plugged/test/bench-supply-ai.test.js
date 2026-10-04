// The AI side of the bench supply (issue #34, scope decision 2026-09-29):
// backend/server.js stops treating "off-board" as "battery".
//
// Shapes these tests assume (the agreed design; stated so the builder
// matches them):
// - An off-board source's terminal pairs come from its V elements: each
//   V element [plus, minus] is a pair. The battery's V('0', '1') is
//   (BAT1.0, BAT1.1); the supply's are (PS1.0 pos, PS1.1 com) and
//   (PS1.1 com, PS1.2 neg). Pin refs are LABEL.k, k = the pin's index; the
//   i-th place_<type> in a build is PREFIX<i+1>.
// - findCircuitProblems uses those pairs for every source:
//   - a placed source must have its ref pin wired (PS1.1) and at least one
//     other pin wired; the problem names the pin in label form ("PS1.1 …");
//   - wires alone joining a pair's plus to its minus is a short, naming both
//     pins, and a supply's short does not call it a battery;
//   - a part must sit between some pair's plus and minus, and a backwards
//     LED is found against a supply as against a battery (same wording).
// - Every existing battery message stays word for word (the guards below
//   pin four of them, which no other test file pins).
// - The prompt keeps its battery rules, but "Only a battery pin can be a
//   wire end by label" and "This label form is only for battery pins." go:
//   an off-board part's pins are wire ends by label (BAT1.0, PS1.0 …), and
//   the "EVERY circuit needs a battery" line allows another off-board
//   source. The add_wire tool says the same. test/ai-tools.test.js's
//   VERBATIM list no longer holds those three lines.
// - place_bench_supply { voltage?, limit? } is generated from the registry
//   (NUMBER params, nothing required: it is off-board).

const assert = require('node:assert');
process.env.AI_PROVIDER = 'fixture';   // no key needed, never calls out
const Parts   = require('../circuit3d/js/parts');
const Server  = require('../backend/server.js');
const Recipes = require('./fixtures/recipes.js');

const N    = Recipes.HIGHEST_COL;   // 63
const wire = (from, to, color = 'green') => ({ tool: 'add_wire', from, to, color });
const problems = actions => Server.findCircuitProblems(actions.map(a => ({ ...a })));

function needSupply() {
  assert.ok(Parts.get('bench_supply'), "Parts.get('bench_supply') is null: parts/bench_supply.js must exist");
}

const decl  = name => Server.CIRCUIT_TOOLS[0].function_declarations.find(d => d.name === name);
const names = (message, board = []) => Server.selectTools(message, board).map(d => d.name);
const promptLines = () => Server.SYSTEM_PROMPT.split('\n');

// ── The tool and tool selection ───────────────────────────────────────────

test('the generated place_bench_supply tool takes voltage and limit (numbers), nothing required', () => {
  needSupply();
  const t = decl('place_bench_supply');
  assert.ok(t, `no place_bench_supply tool; tools: ${Server.CIRCUIT_TOOLS[0].function_declarations.map(d => d.name).join(', ')}`);
  const props = t.parameters && t.parameters.properties;
  assert.ok(props && props.voltage && props.limit, JSON.stringify(t.parameters));
  assert.equal(props.voltage.type, 'NUMBER');
  assert.equal(props.limit.type, 'NUMBER');
  assert.deepStrictEqual(t.parameters.required || [], []);
});

test('selectTools("Power an LED from the bench supply at 5 V with a series resistor") sends place_bench_supply, place_led and place_resistor', () => {
  needSupply();
  const got = names('Power an LED from the bench supply at 5 V with a series resistor');
  for (const n of ['place_bench_supply', 'place_led', 'place_resistor']) assert.ok(got.includes(n), `${n} missing from ${JSON.stringify(got)}`);
});

test('selectTools("use a ±12 V dual supply") sends place_bench_supply', () => {
  needSupply();
  const got = names('use a ±12 V dual supply');
  assert.ok(got.includes('place_bench_supply'), JSON.stringify(got));
});

test('selectTools("Build a single LED circuit with a current-limiting resistor.") does not send place_bench_supply (the demo prompt is unchanged)', () => {
  needSupply();
  const got = names('Build a single LED circuit with a current-limiting resistor.');
  assert.ok(!got.includes('place_bench_supply'), JSON.stringify(got));
  assert.ok(got.includes('place_battery'), JSON.stringify(got));
});

// ── The prompt and add_wire: off-board pins, not only battery pins ────────

test('the prompt carries the supply guide, naming PS1.0, PS1.1 and PS1.2', () => {
  needSupply();
  const line = promptLines().find(l => l.startsWith('- place_bench_supply: '));
  assert.ok(line, 'a "- place_bench_supply: <guide>" line in COMPONENT RULES');
  for (const ref of ['PS1.0', 'PS1.1', 'PS1.2']) assert.ok(line.includes(ref), `${ref} in ${line}`);
});

test('the prompt no longer says only a battery pin can be a wire end by label; an off-board part\'s pins can', () => {
  const lines = promptLines();
  assert.ok(!lines.includes('- Only a battery pin can be a wire end by label: "BAT1.0" (+) or "BAT1.1" (-).'),
    'the battery-only wire-end rule is generalised');
  assert.ok(!lines.includes('- Battery: "BAT1.0" (+), "BAT1.1" (-). This label form is only for battery pins.'),
    'the HOLE NAMES battery-only line is generalised');
  const said = lines.filter(l => /off-board/i.test(l) && l.includes('BAT1.0') && /label/i.test(l));
  assert.ok(said.length > 0, 'a line says an off-board part\'s pins (BAT1.0 …) are wire ends by label');
});

test('the "EVERY circuit needs a battery" rule allows another off-board source', () => {
  const line = promptLines().find(l => l.startsWith('- EVERY circuit needs'));
  assert.ok(line, 'the rule is still there');
  assert.match(line, /off-board|supply|source/i, line);
});

test('guard (passes today): the other battery rules stay word for word', () => {
  const lines = promptLines();
  const KEEP = [
    'BATTERY (CRITICAL):',
    '- BAT1.0 = positive (+), BAT1.1 = negative (-). The battery sits off-board.',
    '  1. add_wire from "BAT1.0" to "tp_N" (red wire)',
    '  2. add_wire from "BAT1.1" to "tn_N" (black wire)',
    '- Without BOTH battery wires the circuit WILL NOT WORK. ALWAYS include them.',
    '- Never wire BAT1.0 straight to BAT1.1, or tp to tn: that is a short circuit.',
    '- Battery wires go to the rails at the highest column, the end nearest the battery, so they drop straight in. In the recipes, N = the highest column in the board description (Columns 1-N).',
    '- A second battery (two separate circuits) goes on the bottom rails, bp_N (+) and bn_N (−), nearest row j: BAT2.0 -> bp_{N} (red) and BAT2.1 -> bn_{N} (black). Its parts go in rows f–j, with its rail wires in row j. Never wire a second battery to the tp/tn rails.',
  ];
  assert.deepStrictEqual(KEEP.filter(l => !lines.includes(l)), []);
});

test('the add_wire tool names off-board pins by label, not only battery pins', () => {
  const d = decl('add_wire').description;
  assert.match(d, /BAT1\.0/, d);
  assert.match(d, /off-board/i, d);
  assert.doesNotMatch(d, /or battery pins by label/, d);
});

// ── findCircuitProblems with a supply ─────────────────────────────────────
// + rail LED at C = 2: resistor b2–b6, LED cathode c8 / anode c6,
// tp_3 → a2, a8 → tn_8.

const PLUS_LED = [
  { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
  { tool: 'place_led', holeA: 'c8', holeB: 'c6' },
  wire('tp_3', 'a2', 'red'),
  wire('a8', 'tn_8', 'black'),
];

const SUPPLY_LED = [
  { tool: 'delete_all' },
  { tool: 'place_bench_supply', voltage: 5 },
  wire('PS1.0', `tp_${N}`, 'red'),
  wire('PS1.1', `tn_${N}`, 'black'),
  ...PLUS_LED,
];

test('a correct supply build (PS1.0 → tp, PS1.1 → tn, resistor + LED) has no problems', () => {
  needSupply();
  assert.deepStrictEqual(problems(SUPPLY_LED), []);
});

test('finishAIReply keeps the correct supply build as sent, with no "Heads up"', () => {
  needSupply();
  const out = Server.finishAIReply({ reply: 'Built it.', actions: SUPPLY_LED.map(a => ({ ...a })) });
  assert.deepStrictEqual(out.actions, SUPPLY_LED);
  assert.equal(out.reply, 'Built it.');
});

test('PS1.1 (COM) not wired: exactly one problem names PS1.1 and says it is not wired', () => {
  needSupply();
  const got = problems([
    { tool: 'delete_all' },
    { tool: 'place_bench_supply', voltage: 5 },
    wire('PS1.0', `tp_${N}`, 'red'),
    ...PLUS_LED,
  ]);
  const named = got.filter(p => p.includes('PS1.1'));
  assert.equal(named.length, 1, `one problem names PS1.1: ${JSON.stringify(got)}`);
  assert.match(named[0], /not wired/, named[0]);
  assert.ok(!got.some(p => /\bBAT\d|battery_\d/.test(p)), `no battery names for a supply: ${JSON.stringify(got)}`);
});

test('only PS1.1 wired (no + or − terminal): a problem names PS1.0 as not wired', () => {
  needSupply();
  const got = problems([
    { tool: 'delete_all' },
    { tool: 'place_bench_supply' },
    wire('PS1.1', `tn_${N}`, 'black'),
    ...PLUS_LED,
  ]);
  assert.ok(got.some(p => p.includes('PS1.0') && /not wired/.test(p)), JSON.stringify(got));
});

test('PS1.2 (−) left unwired on a single-supply build is not a problem', () => {
  needSupply();
  const got = problems(SUPPLY_LED);
  assert.ok(!got.some(p => p.includes('PS1.2')), JSON.stringify(got));
});

test('PS1.0 and PS1.1 joined by wires alone: a short naming both pins, not "the battery"', () => {
  needSupply();
  const got = problems([
    { tool: 'delete_all' },
    { tool: 'place_bench_supply' },
    wire('PS1.0', `tp_${N}`, 'red'),
    wire('PS1.1', `tp_${N - 3}`, 'black'),
    ...PLUS_LED,
  ]);
  const short = got.find(p => /short circuit/.test(p));
  assert.ok(short, `a short: ${JSON.stringify(got)}`);
  assert.match(short, /PS1\.0 and PS1\.1 are joined by wires alone/);
  assert.doesNotMatch(short, /battery/i);
});

test('PS1.1 and PS1.2 joined by wires alone: a short naming both pins', () => {
  needSupply();
  const got = problems([
    ...SUPPLY_LED,
    wire('PS1.2', `tn_${N - 3}`, 'blue'),
  ]);
  const short = got.find(p => /short circuit/.test(p));
  assert.ok(short, `a short: ${JSON.stringify(got)}`);
  assert.match(short, /PS1\.1 and PS1\.2 are joined by wires alone/);
});

test('a backwards LED on the supply is named with the battery\'s wording', () => {
  needSupply();
  assert.deepStrictEqual(problems([
    { tool: 'delete_all' },
    { tool: 'place_bench_supply', voltage: 5 },
    wire('PS1.0', `tp_${N}`, 'red'),
    wire('PS1.1', `tn_${N}`, 'black'),
    { tool: 'place_resistor', holeA: 'b2', holeB: 'b6' },
    { tool: 'place_led', holeA: 'c6', holeB: 'c8' },   // cathode c6 toward +, anode c8 toward COM
    wire('tp_3', 'a2', 'red'),
    wire('a8', 'tn_8', 'black'),
  ]), ['The LED at c6/c8 is backwards: its cathode c6 is on the power side and its anode c8 is on the ground side. Swap holeA and holeB.']);
});

// ±: PS1.2 → bn_N. The − rail load sits between COM (tn) and − (bn):
// tn_21 → a20, resistor b20–b24, LED anode c24 / cathode c26, a26 → bn_26.
const SPLIT = [
  ...SUPPLY_LED,
  wire('PS1.2', `bn_${N}`, 'blue'),
  wire('tn_21', 'a20', 'black'),
  { tool: 'place_resistor', holeA: 'b20', holeB: 'b24' },
  { tool: 'place_led', holeA: 'c26', holeB: 'c24' },
  wire('a26', 'bn_26', 'blue'),
];

test('a ± split build (a resistor + LED on each rail, COM on tn, − on bn) has no problems', () => {
  needSupply();
  assert.deepStrictEqual(problems(SPLIT), []);
});

test('the ± split build with the − rail LED backwards names that LED as backwards, and only it', () => {
  needSupply();
  const flipped = SPLIT.map(a => (a.tool === 'place_led' && a.holeA === 'c26' ? { ...a, holeA: 'c24', holeB: 'c26' } : a));
  assert.deepStrictEqual(problems(flipped),
    ['The LED at c24/c26 is backwards: its cathode c24 is on the power side and its anode c26 is on the ground side. Swap holeA and holeB.']);
});

test('an LED between no terminal pair is "not connected between power and ground"', () => {
  needSupply();
  assert.deepStrictEqual(problems([
    ...SUPPLY_LED,
    { tool: 'place_led', holeA: 'c42', holeB: 'c40' },
  ]), ['The LED at c42/c40 is not connected between power and ground, so no current flows through it.']);
});

test('a battery circuit on tp/tn and a supply circuit on bp/bn in one build have no problems', () => {
  needSupply();
  assert.deepStrictEqual(problems([
    { tool: 'delete_all' },
    { tool: 'place_battery' },
    wire('BAT1.0', `tp_${N}`, 'red'),
    wire('BAT1.1', `tn_${N}`, 'black'),
    ...PLUS_LED,
    { tool: 'place_bench_supply', voltage: 5 },
    wire('PS1.0', `bp_${N}`, 'red'),
    wire('PS1.1', `bn_${N}`, 'black'),
    { tool: 'place_resistor', holeA: 'g20', holeB: 'g24' },
    wire('bp_20', 'j20', 'red'),
    wire('j24', 'bn_24', 'black'),
  ]), []);
});

// ── Guards (pass today): battery messages, word for word ──────────────────
// No other test file pins these four lines. With the supply generalised,
// they must not change by a character.

const BAT_START = [{ tool: 'delete_all' }, { tool: 'place_battery' }];
const NOT_CONNECTED = where => `The ${where} is not connected between power and ground, so no current flows through it.`;

test('guard: BAT1.1 not wired', () => {
  assert.deepStrictEqual(problems([...BAT_START, wire('BAT1.0', `tp_${N}`, 'red'), ...PLUS_LED]), [
    'BAT1.1 is not wired to a ground rail (tn_N), so the circuit has no return path.',
    NOT_CONNECTED('resistor at b2/b6'),
    NOT_CONNECTED('LED at c8/c6'),
  ]);
});

test('guard: BAT1.0 not wired', () => {
  assert.deepStrictEqual(problems([...BAT_START, wire('BAT1.1', `tn_${N}`, 'black'), ...PLUS_LED]), [
    'BAT1.0 is not wired to a positive rail (tp_N), so nothing on the board is powered.',
    NOT_CONNECTED('resistor at b2/b6'),
    NOT_CONNECTED('LED at c8/c6'),
  ]);
});

test('guard: BAT1.0 and BAT1.1 shorted by wires', () => {
  const got = problems([...BAT_START, wire('BAT1.0', `tp_${N}`, 'red'), wire('BAT1.1', `tp_${N - 3}`, 'black'), ...PLUS_LED]);
  assert.equal(got[0], 'BAT1.0 and BAT1.1 are joined by wires alone, which is a short circuit across the battery. Put a resistor or other part between them.');
});

test('guard: two batteries on the same rails', () => {
  assert.deepStrictEqual(problems([
    { tool: 'delete_all' }, { tool: 'place_battery' }, { tool: 'place_battery' },
    wire('BAT1.0', `tp_${N}`, 'red'), wire('BAT1.1', `tn_${N}`, 'black'),
    wire('BAT2.0', `tp_${N - 1}`, 'red'), wire('BAT2.1', `tn_${N - 1}`, 'black'),
    ...PLUS_LED,
  ]), ['BAT1 and BAT2 are wired to the same rails (tp and tn), so they fight each other. Give the second battery the bottom rails (bp_N and bn_N), with its circuit in rows f–j.']);
});
