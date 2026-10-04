// A TL072 half with an input that connects to nothing, its output wired into
// the circuit (issue #1, a bug). Today the whole board reads "This circuit
// cannot be solved" and no part gets a reading: the floating input node is
// held only by GMIN, so once a source pins the output the E's pivot drops
// under solveLinear's PIVOT_EPS. The fix: when settleModes fails, solve
// again with those halves open (mode 'open', current 0, the way an
// unpowered op-amp already is), and say which input is floating.
//
// Run with:  npx vitest run test/opamp-floating-input.test.js   (or npm test)
//
// Every board: PS1, the bench supply at 12 V (+ on tp, COM on tn), and the
// chip at f30 facing right: OUT1 f30, IN1− f31, IN1+ f32, V− f33, IN2+ e33,
// IN2− e32, OUT2 e31, V+ e30. V+ is wired to +12 V, V− to COM (0 V), so the
// low rail is V− + 1.5 V = 1.5 V. Other op-amp tests: test/tl072.test.js
// (the part) and test/e-element.test.js (the E element).
//
// Seams these tests assume (from the issue and the scout's map):
// - A half is "floating" only when its output is wired into the circuit and
//   an input reaches no other pin. A half nobody wired at all (inputs and
//   output unwired) stays as an unused half is today: mode 'low' at 1.5 V,
//   'unused', no warning. (Repros A and B leave op-amp 1 like that, G leaves
//   op-amp 2.)
// - The warning names the chip by its label, the half's output and only the
//   inputs that read null, in at most 120 characters; it never says "no
//   supply", so Readings.problems() gets no no-supply row.
// - The simulator says why a half was opened (Aarmen, on the issue): a
//   PartResult whose retry opened halves for a floating input carries
//   r.floatingInputs = { <E id>: true } (op1 / op2); with none, the key is
//   absent. The part's wording reads that flag, not the rail voltages, so a
//   chip whose V+ only reaches another op-amp's output stays "no supply".
// - state(): "inputs not connected (output open)" for a half in
//   r.floatingInputs. An unpowered chip keeps today's wording. report()
//   drops " (output open)" when the line would pass 80 characters.

const assert = require('node:assert');

const Parts    = require('../circuit3d/js/parts');
const Sim      = require('../circuit3d/js/simulate.js');
const Board    = require('../circuit3d/js/board-model.js');
const Readings = require('../circuit3d/js/readings.js');
const HoverCard = require('../circuit3d/js/tools/hover-card.js');

const tl = () => Parts.get('tl072');
// A pin's datasheet name ('IN2+', 'IN2−' with U+2212, 'OUT2') from the part's own pinout.
const pinName = pin => tl().pinout.labels[tl().pins.indexOf(pin)];

const PS1   = { type: 'bench_supply', label: 'PS1', values: { voltage: 12 } };
// The chip with pin 1 at f<col> facing right: f col..col+3 (pins 1–4), e col+3..col (pins 5–8).
const chip  = (label, col = 30) => ({ type: 'tl072', label,
  holes: [0, 1, 2, 3].map(k => 'f' + (col + k)).concat([3, 2, 1, 0].map(k => 'e' + (col + k))) });
const POWER = [['PS1.0', 'tp_63'], ['PS1.1', 'tn_63']];
const RAILS = [['tp_30', 'a30'], ['j33', 'tn_33']];   // V+ (pin 8) +12 V, V− (pin 4) 0 V

function analyze(parts, wires) {
  const board = Board.toSim(Board.fromExample({ parts, wires }));
  return { board, result: Sim.analyze(board.components, board.wires) };
}

const text = r => (r.lines || []).map(l => l.text).join(' | ');

function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);
}

function solved(result, label) {
  assert.strictEqual(result.status, 'ok', `status: expected 'ok', got '${result.status}': ${text(result)}`);
  const u = result.parts && result.parts[label];
  assert.ok(u, `analyze().parts has no ${label}; got ${JSON.stringify(Object.keys(result.parts || {}))}`);
  return u;
}

// ── The repros that fail today ────────────────────────────────
//
// half:     the op-amp whose output is wired and whose input floats
// floating: its inputs that touch nothing; tied: its inputs that don't float
// vout:     where its output sits: on the rail it is tied to (open, it drives nothing)
// other:    the chip's other half, wired to nothing at all
//
// B uses the label U2, so the warning can't be a hard-coded "U1".
const REPROS = [
  { id: 'A', what: 'unused OUT2 tied to +12 V', label: 'U1', wires: [['a31', 'tp_31']],
    half: 2, floating: ['in2p', 'in2n'], tied: [], vout: 12, other: 1 },
  { id: 'B', what: 'unused OUT2 tied to 0 V', label: 'U2', wires: [['a31', 'tn_31']],
    half: 2, floating: ['in2p', 'in2n'], tied: [], vout: 0, other: 1 },
  { id: 'G', what: 'IN1− on OUT1, OUT1 on +12 V, IN1+ floating', label: 'U1', wires: [['g30', 'g31'], ['j30', 'tp_29']],
    half: 1, floating: ['in1p'], tied: ['in1n'], vout: 12, other: 2 },
];

const repro = c => analyze([PS1, chip(c.label)], [...POWER, ...RAILS, ...c.wires]);

// The issue's wording for repro A, the one case checked word for word.
// Rails wired, OUT1 on +12 V and OUT2 on 0 V, every input floating: both halves open.
const BOTH_OUT = [['j30', 'tp_29'], ['a31', 'tn_31']];

const WARNING_A = 'U1: IN2+ and IN2− connect to nothing, so OUT2 drives nothing. Wire its inputs or clear OUT2\'s column.';

// ── 1. A, B, G solve: the floating half is open, the board reads ──

for (const c of REPROS) {
  test(`repro ${c.id} (${c.what}): solves; op-amp ${c.half} is open at ${c.vout} V with 0 mA, and PS1 reads ±12 V supplying 0 mA`, () => {
    const { result } = repro(c);
    const u = solved(result, c.label);
    const op = 'op' + c.half;
    assert.strictEqual(u.r.modes[op], 'open', `r.modes.${op}: ${JSON.stringify(u.r.modes)}`);
    assert.strictEqual(u.m['mode' + c.half], 'open', `m.mode${c.half}: ${JSON.stringify(u.m)}`);
    near(u.r.current[op], 0, 1e-9, `r.current.${op} (mA): an open output drives nothing`);
    near(u.m['iout' + c.half], 0, 1e-9, `m.iout${c.half} (mA)`);
    // Open, it doesn't fight the wire: OUT reads the rail it is tied to.
    near(u.m['vout' + c.half], c.vout, 1e-6, `m.vout${c.half}: OUT on the rail`);

    // PS1 gets its readings: +12 V, COM 0 V, − −12 V, and nothing loads it
    // (the open half draws nothing, the other half is unloaded).
    const ps = result.parts.PS1;
    assert.ok(ps, `analyze().parts has no PS1; got ${JSON.stringify(Object.keys(result.parts || {}))}`);
    near(ps.r.pins.pos, 12, 1e-6, 'PS1 +');
    near(ps.r.pins.com, 0, 1e-6, 'PS1 COM');
    near(ps.r.pins.neg, -12, 1e-6, 'PS1 −');
    near(ps.m.posAmps, 0, 0.001, 'PS1 + supplies (mA)');
  });

  test(`repro ${c.id} (${c.what}): ${c.label}'s warning names OUT${c.half} and only its floating input(s), in ≤ 120 characters; no "no supply"`, () => {
    const { result, board } = repro(c);
    const u = solved(result, c.label);
    const out = pinName('out' + c.half);
    const w = u.warnings.find(t => t.includes(out));
    assert.ok(w, `a warning naming ${out}; got ${JSON.stringify(u.warnings)}`);
    assert.ok(w.includes(c.label), `the warning names the chip as ${c.label}: ${w}`);
    if (c.label !== 'U1') assert.ok(!w.includes('U1'), `the label is the chip's own, not a fixed "U1": ${w}`);
    for (const pin of c.floating) assert.ok(w.includes(pinName(pin)), `names the floating input ${pinName(pin)}: ${w}`);
    for (const pin of c.tied) assert.ok(!w.includes(pinName(pin)), `${pinName(pin)} is wired, so it isn't named: ${w}`);
    assert.match(w, /connects? to nothing/, `says the input connects to nothing: ${w}`);
    assert.ok(w.length <= 120, `at most 120 characters; got ${w.length}: ${w}`);
    assert.ok(!u.warnings.some(t => /no supply/i.test(t)), `the rails are wired, so no "no supply": ${JSON.stringify(u.warnings)}`);
    const rows = Readings.from(result, board).problems();
    assert.ok(!rows.some(p => p.kind === 'no-supply'), `no no-supply problem row: ${JSON.stringify(rows)}`);
  });

  test(`repro ${c.id} (${c.what}): op-amp ${c.other}, wired to nothing, stays an unused half: low at 1.5 V, no warning about it`, () => {
    // Its inputs float, so vd = 0 and the drive is V(V−) + A·0 = 0 V, under
    // the low rail V− + 1.5 V = 1.5 V: mode 'low', unloaded, 1.5 V, as an
    // unused half reads today (repros C and I).
    const { result } = repro(c);
    const u = solved(result, c.label);
    const k = c.other;
    assert.strictEqual(u.m['mode' + k], 'low', `m.mode${k}: ${JSON.stringify(u.m)}`);
    near(u.m['vout' + k], 1.5, 1e-6, `m.vout${k}`);
    assert.strictEqual(u.m['unused' + k], true, `m.unused${k}`);
    const out = pinName('out' + k);
    assert.ok(!u.warnings.some(t => t.includes(out)), `no warning about ${out}: ${JSON.stringify(u.warnings)}`);
  });
}

test('repro A: the warning reads exactly as the issue words it', () => {
  const { result } = repro(REPROS[0]);
  assert.deepStrictEqual(solved(result, 'U1').warnings, [WARNING_A]);
});

// ── 2. The wording: line, report and the AI's summary ─────────

test('repro A: the results line and report say op-amp 2 "inputs not connected (output open)", never "no supply"; the AI\'s summary says solved and carries both', () => {
  const c = REPROS[0];
  const { result, board } = repro(c);
  const u = solved(result, 'U1');
  const STATE = 'op-amp 2 inputs not connected (output open)';

  const line = result.lines.find(l => l.cls === 'sim-on' && l.text.includes('U1'));
  assert.ok(line, `a results line for U1: ${text(result)}`);
  assert.ok(line.text.includes(STATE), `the line says "${STATE}": ${line.text}`);
  const report = tl().report(u.r, u.m);
  assert.ok(report.includes(STATE), `report() says "${STATE}": ${report}`);
  assert.doesNotMatch(text(result) + ' | ' + report, /no supply/i, 'the rails are wired');

  const summary = Sim.simulationSummary(board.components, board.wires, (cs, comp) => comp.label);
  assert.match(summary[0], /^Status: solved\./, `the AI is told it solved: ${summary.join('\n')}`);
  assert.ok(summary.some(l => l.includes(STATE)), `the summary has the report: ${summary.join('\n')}`);
  assert.ok(summary.some(l => l.includes(WARNING_A)), `the summary has the warning: ${summary.join('\n')}`);
});

// Pin: an unpowered chip keeps today's wording, even with OUT2 wired to
// +12 V and every input floating (the shape the new branch handles).
const NO_SUPPLY = 'the op-amp has no supply: wire V+ (pin 8) and V− (pin 4)';
test('pin: an unpowered chip (no rails, V+ only, V− only) still says "no supply", not "inputs not connected"', () => {
  for (const [what, rails] of [['no rails', []], ['V+ only', [RAILS[0]]], ['V− only', [RAILS[1]]]]) {
    const { result } = analyze([PS1, chip('U1')], [...POWER, ...rails, ['a31', 'tp_31']]);
    const u = solved(result, 'U1');
    assert.deepStrictEqual(u.r.modes, { op1: 'open', op2: 'open' }, `${what}: both halves open`);
    assert.deepStrictEqual(u.warnings, [NO_SUPPLY], `${what}: warnings`);
    assert.strictEqual(tl().report(u.r, u.m), 'no supply: both outputs open', `${what}: report`);
    assert.doesNotMatch(text(result), /inputs not connected/, `${what}: lines`);
  }
});

test('both outputs wired (OUT1 on +12 V, OUT2 on 0 V), every input floating: report() drops "(output open)" to fit 80 characters', () => {
  const { result } = analyze([PS1, chip('U1')], [...POWER, ...RAILS, ...BOTH_OUT]);
  const u = solved(result, 'U1');
  const report = tl().report(u.r, u.m);
  assert.strictEqual(report, 'op-amp 1 inputs not connected; op-amp 2 inputs not connected');
  assert.ok(report.length <= 80, `at most 80 characters; got ${report.length}`);
});

// Pin, as on dev: U2's V+ (e40, column 40's top half) is wired to U1's OUT1
// column, so it reads U1's 1.5 V, but no source feeds it (an op-amp's output
// isn't a supply): U2 is unpowered. It solves first time, so nothing was
// opened for a floating input, and U2's wording stays "no supply".
// U1 at f30: V+ tp_30 → a30, V− g33 → tn_33. U2 at f40: V+ g30 → a40, V− g43 → tn_43.
const VIA_OPAMP = {
  parts: [PS1, chip('U1', 30), chip('U2', 40)],
  wires: [...POWER, ['tp_30', 'a30'], ['g33', 'tn_33'], ['g30', 'a40'], ['g43', 'tn_43']],
  lines: [
    { text: 'Bench supply 1: SERIES ±12V · + 0.0 mA · − 0.0 mA', cls: 'sim-info' },
    { text: '  🔺 TL072 U1: op-amp 1 unused · op-amp 2 unused', cls: 'sim-on' },
    { text: '  the op-amp has no supply: wire V+ (pin 8) and V− (pin 4)', cls: 'sim-warn' },
  ],
};

test('pin: a chip whose V+ only reaches another op-amp\'s output (U2 via U1\'s OUT1) is unpowered, as on dev: "no supply", no line, a no-supply row, floating: false, no floatingInputs', () => {
  const { result, board } = analyze(VIA_OPAMP.parts, VIA_OPAMP.wires);
  const u2 = solved(result, 'U2'), u1 = solved(result, 'U1');
  assert.deepStrictEqual(u2.warnings, [NO_SUPPLY], 'U2 warnings');
  assert.strictEqual(tl().report(u2.r, u2.m), 'no supply: both outputs open', 'U2 report');
  assert.ok(!result.lines.some(l => l.text.includes('TL072 U2')), `no results line for U2: ${text(result)}`);
  assert.deepStrictEqual(result.lines.map(l => ({ text: l.text, cls: l.cls })), VIA_OPAMP.lines, 'the results panel, as on dev');

  const readings = Readings.from(result, board);
  const rows = readings.problems();
  assert.ok(rows.some(p => p.kind === 'no-supply' && p.labels.includes('U2')), `a no-supply row for U2: ${JSON.stringify(rows)}`);
  assert.deepStrictEqual(readings.part('U2').opamps.map(o => o.floating), [false, false], 'U2 opamps floating');

  const said = [text(result), tl().report(u1.r, u1.m), tl().report(u2.r, u2.m),
                ...Object.values(result.parts).flatMap(p => p.warnings),
                ...['U1', 'U2'].flatMap(l => HoverCard.cardLines(l, readings.part(l)) || [])];
  assert.ok(!said.some(t => /inputs not connected/.test(t)), `nothing says "inputs not connected": ${JSON.stringify(said)}`);
  for (const [label, u] of [['U1', u1], ['U2', u2]]) {
    assert.ok(!('floatingInputs' in u.r), `${label} solved first time, so r has no floatingInputs; got ${JSON.stringify(u.r.floatingInputs)}`);
  }
});

// ── 3. Boards that solve today give exactly today's result ────
//
// Pins: captured from today's code. Numbers are compared to 1e-9, so the
// GMIN-sized readings (1.2e-8 mA) are part of "exactly".

const round = x => (typeof x === 'number' ? Math.round(x * 1e9) / 1e9 + 0
  : Array.isArray(x) ? x.map(round)
  : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, round(v)])) : x);

const snapshot = r => round({
  status: r.status,
  lines:  r.lines.map(l => ({ text: l.text, cls: l.cls })),
  parts:  Object.fromEntries(Object.entries(r.parts).map(([k, p]) =>
    [k, { m: p.m, modes: p.r.modes, pins: p.r.pins, current: p.r.current, warnings: p.warnings }])),
});

const PS1_IDLE = (posAmps, negAmps) => ({
  m: { posAmps, negAmps, posOver: false, negOver: false }, modes: {},
  pins: { pos: 12, com: 0, neg: -12, com2: 0 }, current: { pos: -posAmps, neg: -negAmps, link: 0 }, warnings: [],
});

test('pin: repro C (op-amp 2 a follower of 0 V with OUT2 on +12 V) is exactly today\'s: OUT2 12 V, isrc−, −20 mA; op-amp 1 unused, low at 1.5 V', () => {
  const { result } = analyze([PS1, chip('U1')], [...POWER, ...RAILS, ['a31', 'tp_31'], ['a32', 'b31'], ['a33', 'tn_34']]);
  assert.deepStrictEqual(snapshot(result), {
    status: 'ok',
    lines: [
      { text: 'Bench supply 1: SERIES ±12V · + 20.0 mA · − 0.0 mA', cls: 'sim-info' },
      { text: '  🔺 TL072 U1: op-amp 1 unused · op-amp 2 current-limited at 20 mA', cls: 'sim-on' },
    ],
    parts: {
      PS1: PS1_IDLE(20.000000012, 1.2e-8),
      U1: {
        m:       { vout1: 1.5, mode1: 'low', iout1: 1e-9, unused1: true, vout2: 12, mode2: 'isrc−', iout2: -20, unused2: false },
        modes:   { op1: 'low', op2: 'isrc−' },
        pins:    { out1: 1.5, in1n: null, in1p: null, vneg: 0, in2p: 0, in2n: 12, out2: 12, vpos: 12 },
        current: { op1: 1e-9, op2: -20 },
        warnings: [],
      },
    },
  });
});

test('pin: repro I (R1 1 kΩ from OUT1 to COM, every input floating) is exactly today\'s: OUT1 1.429 V and OUT2 1.5 V, both low and unused', () => {
  const { result } = analyze(
    [PS1, chip('U1'), { type: 'resistor', label: 'R1', holes: ['h26', 'h30'], values: { resistance: 1000 } }],
    [...POWER, ...RAILS, ['j26', 'tn_26']]);
  assert.deepStrictEqual(snapshot(result), {
    status: 'ok',
    lines: [
      { text: 'Bench supply 1: SERIES ±12V · + 0.0 mA · − 0.0 mA', cls: 'sim-info' },
      { text: '  🔺 TL072 U1: op-amp 1 unused · op-amp 2 unused', cls: 'sim-on' },
    ],
    parts: {
      PS1: PS1_IDLE(1.2e-8, 1.2e-8),
      U1: {
        m:       { vout1: 1.428571429, mode1: 'low', iout1: 1.42857143, unused1: true,
                   vout2: 1.5, mode2: 'low', iout2: 1e-9, unused2: true },
        modes:   { op1: 'low', op2: 'low' },
        pins:    { out1: 1.428571429, in1n: null, in1p: null, vneg: 0, in2p: null, in2n: null, out2: 1.5, vpos: 12 },
        current: { op1: 1.42857143, op2: 1e-9 },
        warnings: [],
      },
      R1: { m: { current: 1.428571429 }, modes: {}, pins: { lead1: 0, lead2: 1.428571429 },
            current: { 0: -1.428571429 }, warnings: [] },
    },
  });
});

// ── 4. A genuinely unsolvable board still is ──────────────────

const BAT = (label, voltage) => ({ type: 'battery', label, values: { voltage } });
const UNSOLVABLE = [
  // test/simulate.test.js (#50): 9 V and 6 V on the same rails, a fight.
  { what: '9 V and 6 V batteries on the same rails (test/simulate.test.js)',
    parts: [BAT('BAT1', 9), BAT('BAT2', 6)],
    wires: [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1'], ['BAT2.0', 'tp_3'], ['BAT2.1', 'tn_3']],
    line: '⚠ BAT1 (9 V) and BAT2 (6 V) are wired straight across each other. Different voltages in parallel would fight. Give each its own rails or remove one.' },
  // A source loop the solver itself rejects: PS1's 12 V across tp–tn against
  // BAT1 9 V (tp → column 50) and BAT2 6 V (column 50 → tn), 15 V ≠ 12 V; with
  // repro A's chip on the board, so the retry with OUT2 open runs and fails too.
  { what: 'a 12 V supply against a 9 V + 6 V battery chain, with repro A\'s floating op-amp on the board',
    parts: [PS1, chip('U1'), BAT('BAT1', 9), BAT('BAT2', 6)],
    wires: [...POWER, ...RAILS, ['a31', 'tp_31'],
            ['BAT1.0', 'tp_50'], ['BAT1.1', 'a50'], ['BAT2.0', 'b50'], ['BAT2.1', 'tn_50']],
    line: '⚠ This circuit cannot be solved. Two batteries may be wired straight into each other.' },
];

test('pin: a genuinely unsolvable board still reports \'unsolvable\' with today\'s line and no readings', () => {
  for (const c of UNSOLVABLE) {
    const { result } = analyze(c.parts, c.wires);
    assert.strictEqual(result.status, 'unsolvable', `${c.what}: ${text(result)}`);
    assert.deepStrictEqual(result.parts, {}, `${c.what}: no readings`);
    const hits = result.lines.filter(l => l.text.trim() === c.line);
    assert.strictEqual(hits.length, 1, `${c.what}: exactly one line "${c.line}"; got ${text(result)}`);
    assert.strictEqual(hits[0].cls, 'sim-err', `${c.what}: an error line`);
  }
});

// ── 5. r.floatingInputs: which halves the retry opened ────────

test('r.floatingInputs names the halves opened for a floating input: A and B { op2 }, G { op1 }, both outputs wired { op1, op2 }', () => {
  const cases = [...REPROS.map(c => ({ id: 'repro ' + c.id, label: c.label, run: () => repro(c) })),
                 { id: 'both outputs wired', label: 'U1', run: () => analyze([PS1, chip('U1')], [...POWER, ...RAILS, ...BOTH_OUT]) }];
  const want = { 'repro A': { op2: true }, 'repro B': { op2: true }, 'repro G': { op1: true }, 'both outputs wired': { op1: true, op2: true } };
  for (const c of cases) {
    const u = solved(c.run().result, c.label);
    assert.deepStrictEqual(u.r.floatingInputs, want[c.id], `${c.id}: r.floatingInputs`);
  }
});

test('pin: boards that solve first time (C, I, an unpowered chip) have no floatingInputs on any part', () => {
  const boards = [
    ['repro C', [PS1, chip('U1')], [...POWER, ...RAILS, ['a31', 'tp_31'], ['a32', 'b31'], ['a33', 'tn_34']]],
    ['repro I', [PS1, chip('U1'), { type: 'resistor', label: 'R1', holes: ['h26', 'h30'], values: { resistance: 1000 } }],
     [...POWER, ...RAILS, ['j26', 'tn_26']]],
    ['unpowered, no rails', [PS1, chip('U1')], [...POWER, ['a31', 'tp_31']]],
    ['unpowered, V+ only', [PS1, chip('U1')], [...POWER, RAILS[0], ['a31', 'tp_31']]],
    ['unpowered, V− only', [PS1, chip('U1')], [...POWER, RAILS[1], ['a31', 'tp_31']]],
  ];
  for (const [what, parts, wires] of boards) {
    const { result } = analyze(parts, wires);
    solved(result, 'U1');
    const flagged = Object.entries(result.parts).filter(([, p]) => 'floatingInputs' in p.r).map(([l]) => l);
    assert.deepStrictEqual(flagged, [], `${what}: no part's r has floatingInputs`);
  }
});
