// PhotoImport (issues #136, #137): a confirmed photo Reading → the app's
// actions, rails by printed sign, the battery, the bridge, and the same
// circuit.
//
// Contract these tests are written against (docs/API-CONTRACT.md → "Photo →
// circuit (#134)" → "Reading v1", "Mock Reading (the demo board)" and
// "PhotoImport"; circuit3d/js/photo-import.js, UMD like board-model.js):
// - PhotoImport.build(reading, { components }) → { actions, labels, flags,
//   skipped }. Never throws.
// - actions, in order: place_battery per power entry; every part
//   (place_resistor { holeA, holeB, resistance }, place_led { holeA: cathode,
//   holeB: anode, color }); every wire: the battery's leads (BAT1.0 → the +
//   rail, red; BAT1.1 → the − rail, black), then the Reading's wires
//   (add_wire { from: ends[0], to: ends[1], color }). No delete_all.
// - Rails by side and printed sign: a-side + → tp, − → tn; j-side + → bp,
//   − → bn; column = the endpoint's column. A side whose signs are both `?`
//   or the same falls back to outer +, inner −, flagged `rails`.
// - labels: Reading id → app label (Ids.nextLabel; a skipped part shifts
//   later numbers); power:<i> → its battery; Reading wire → W<n>, counted
//   over every add_wire in output order.
// - flags [{ kind, id, why }], skipped [{ id, type, why }].
// - Invariants: every place_* passes Parts.checkPlacement in order against a
//   running hole map (wire ends included) and Board.apply gives no errors;
//   the built board's nets equal the Reading's; LED polarity is never changed.
//
// The bridge (#137): a
// part that can't sit on its two nodes (a lead in a rail, span out of range,
// diagonal across the gap, both leads in one node) keeps one lead on its
// real node, puts the other in a free helper column-half H (one the Reading
// doesn't use) within span, and an add_wire jumper joins H to the other real
// node. Both legs in rails → two helpers. Search order for H: the same half,
// both sides, within span; then the same column across the gap. A bridged
// part is flagged `moved` (`shorted` when both leads share a node); no free
// helper → `mismatch`, not built. A 6th lead into a full column-half →
// `position`, not built. A part standing straight across the gap in one
// column is placed vertically as it is. Jumpers come after the battery
// leads and before the Reading's wires.
//
// The checks (checkInvariants, assertSameNets, …) live in
// fixtures/photo-import-helpers.js, shared with photo-import-truth.test.js.
// Everything runs the app's real code: Parts, Board.apply, toSim,
// Sim.analyze, Readings. Nothing is mocked.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const {
  Board, build, BB830, lead, end, resistor, ledOf, led, wire, battery, reading,
  ref, wiresOf, placesOf, kinds, skippedIds, hasFlag, jumpersOf,
  checkInvariants, builtNets, assertSameNets, simulate, backwardsFor,
} = require('./fixtures/photo-import-helpers.js');

// The stage board (the stage-board rule, #144): a 9 V battery
// on the a-side rails, 470 Ω fully in the main holes with a jumper from the
// + rail, a red LED (backwards unless `ledPart` says otherwise), and a
// black return wire to the − rail. Imports with no bridge and no flags.
// Fresh objects on every call: some tests edit the Reading they get.
const stage = (ledPart = led('LED1', 'c14', 'c17')) => reading({
  parts: [resistor('R1', 'a10', 'a14'), ledPart],
  wires: [wire('W1', 'red', 'rail:aOuter:10', 'b10'), wire('W2', 'black', 'b17', 'rail:aInner:19')],
  power: [battery('rail:aOuter:3', 'rail:aInner:3')],
});

// The contract's own mock Reading, read from docs/API-CONTRACT.md so the
// test follows the contract.
function contractMockReading() {
  const doc = fs.readFileSync(path.join(__dirname, '../../docs/API-CONTRACT.md'), 'utf8');
  const at  = doc.indexOf('#### Mock Reading (the demo board)');
  assert.ok(at >= 0, 'docs/API-CONTRACT.md has no "Mock Reading (the demo board)" section');
  const m = /```json\s*\n([\s\S]*?)\n```/.exec(doc.slice(at));
  assert.ok(m, 'the Mock Reading section has no ```json block');
  return JSON.parse(m[1]);
}

// ── The stage board: exact output, the same circuit, what it simulates ──

test('the stage board builds exact actions and labels, with no flags and nothing skipped', () => {
  const out = build(stage());
  assert.deepStrictEqual(out, {
    actions: [
      { tool: 'place_battery', voltage: 9 },
      { tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 },
      { tool: 'place_led', holeA: 'c14', holeB: 'c17', color: 'red' },     // cathode c14: backwards, as photographed
      { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3', color: 'red' },     // W1
      { tool: 'add_wire', from: 'BAT1.1', to: 'tn_3', color: 'black' },   // W2
      { tool: 'add_wire', from: 'tp_10', to: 'b10', color: 'red' },       // W3, the Reading's W1
      { tool: 'add_wire', from: 'b17', to: 'tn_19', color: 'black' },     // W4, the Reading's W2
    ],
    labels: { 'power:0': 'BAT1', R1: 'R1', LED1: 'LED1', W1: 'W3', W2: 'W4' },
    flags: [],
    skipped: [],
  });
});

test('the stage board passes every placement check in order, applies cleanly, and has the Reading\'s nets', () => {
  const rd = stage();
  const out = build(rd);
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
});

test('the stage board simulates with LED1 dark and a backwards problem; flipped in the app, about 14.9 mA', () => {
  const board = checkInvariants(build(stage()));
  const back = simulate(board);
  const m = back.r.parts.LED1.m;
  assert.strictEqual(m.on, false, 'the backwards LED must be dark');
  assert.ok(Math.abs(m.current) < 0.01, `backwards LED1 current expected ~0 mA, got ${m.current}`);
  assert.ok(backwardsFor(back.problems, 'LED1'), `expected a backwards problem for LED1, got ${JSON.stringify(back.problems)}`);

  // The fix in the app: swap LED1's two holes (F in place mode), nothing else.
  const flipped = JSON.parse(JSON.stringify(board));
  flipped.parts.find(p => p.label === 'LED1').holes.reverse();
  const fixed = simulate(flipped);
  const f = fixed.r.parts.LED1.m;
  assert.ok(f.on && f.current > 14.8 && f.current < 15.0, `flipped LED1 expected on at 14.8–15.0 mA, got on=${f.on} ${f.current}`);
  assert.deepStrictEqual(fixed.problems, []);
});

// ── LED polarity is kept exactly as confirmed ────────────────────────────

test.each([
  { name: 'backwards, cathode listed first', leds: [{ hole: 'c14', role: 'cathode' }, { hole: 'c17', role: 'anode' }], cathode: 'c14', anode: 'c17', on: false },
  { name: 'backwards, anode listed first',   leds: [{ hole: 'c17', role: 'anode' }, { hole: 'c14', role: 'cathode' }], cathode: 'c14', anode: 'c17', on: false },
  { name: 'forwards, cathode listed first',  leds: [{ hole: 'c17', role: 'cathode' }, { hole: 'c14', role: 'anode' }], cathode: 'c17', anode: 'c14', on: true },
  { name: 'forwards, anode listed first',    leds: [{ hole: 'c14', role: 'anode' }, { hole: 'c17', role: 'cathode' }], cathode: 'c17', anode: 'c14', on: true },
])('LED polarity is never changed ($name): holeA is the confirmed cathode', ({ leds, cathode, anode, on }) => {
  const rd = stage(ledOf('LED1', leds));
  const out = build(rd);
  const place = out.actions.find(a => a.tool === 'place_led');
  assert.deepStrictEqual(place, { tool: 'place_led', holeA: cathode, holeB: anode, color: 'red' });
  assert.ok(!hasFlag(out, 'polarity', 'LED1'), `no polarity flag when both roles are known; got ${kinds(out)}`);
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
  const m = simulate(board).r.parts.LED1.m;
  if (on) assert.ok(m.on && m.current > 14.8 && m.current < 15.0, `forwards LED1 expected on at 14.8–15.0 mA, got on=${m.on} ${m.current}`);
  else assert.ok(!m.on && Math.abs(m.current) < 0.01, `backwards LED1 expected dark, got on=${m.on} ${m.current}`);
});

test('an LED whose leads have unknown roles takes the first dot as the anode, flagged polarity', () => {
  const rd = stage(ledOf('LED1', [{ hole: 'c14', role: 'unknown' }, { hole: 'c17', role: 'unknown' }]));
  const out = build(rd);
  assert.deepStrictEqual(out.actions.find(a => a.tool === 'place_led'), { tool: 'place_led', holeA: 'c17', holeB: 'c14', color: 'red' });
  assert.ok(hasFlag(out, 'polarity', 'LED1'), `expected a polarity flag for LED1, got ${JSON.stringify(kinds(out))}`);
  assertSameNets(rd, out, checkInvariants(out));
});

// ── The contract's mock Reading: R1's rail lead takes the bridge ─────────

test('the contract\'s mock Reading builds to the contract\'s mock output: R1 bridged with a white jumper (W3), flagged moved', () => {
  const rd = contractMockReading();
  const out = build(rd);
  assert.deepStrictEqual(out.actions, [
    { tool: 'place_battery', voltage: 9 },
    { tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 },   // bridged: its + lead is in a rail
    { tool: 'place_led', holeA: 'c14', holeB: 'c17', color: 'red' },           // cathode c14: backwards, as photographed
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3', color: 'red' },           // W1
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_3', color: 'black' },         // W2
    { tool: 'add_wire', from: 'b10', to: 'tp_10', color: 'white' },           // W3, the bridge jumper
    { tool: 'add_wire', from: 'b17', to: 'tn_19', color: 'black' },           // W4, the Reading's W1
  ]);
  assert.deepStrictEqual(out.labels, { 'power:0': 'BAT1', R1: 'R1', LED1: 'LED1', W1: 'W4' });
  assert.deepStrictEqual(kinds(out), ['moved:R1']);
  assert.match(String(out.flags[0].why), /jumper/i, 'the contract\'s why: "…drawn with a jumper…"');
  assert.deepStrictEqual(out.skipped, []);
  assertSameNets(rd, out, checkInvariants(out));
});

test('the contract\'s mock Reading simulates with LED1 dark and backwards; flipped in the app, about 14.9 mA', () => {
  const board = checkInvariants(build(contractMockReading()));
  const back = simulate(board);
  const m = back.r.parts.LED1.m;
  assert.ok(!m.on && Math.abs(m.current) < 0.01, `backwards LED1 expected dark, got on=${m.on} ${m.current}`);
  assert.ok(backwardsFor(back.problems, 'LED1'), `expected a backwards problem for LED1, got ${JSON.stringify(back.problems)}`);
  const flipped = JSON.parse(JSON.stringify(board));
  flipped.parts.find(p => p.label === 'LED1').holes.reverse();
  const f = simulate(flipped).r.parts.LED1.m;
  assert.ok(f.on && f.current > 14.8 && f.current < 15.0, `flipped LED1 expected on at 14.8–15.0 mA, got on=${f.on} ${f.current}`);
});

// ── Rails by side and printed sign ───────────────────────────────────────

// A Reading touching all four strips: the battery on the a-side + and −
// strips, and one wire from a body hole into each strip.
function fourRails(rails) {
  const plus  = rails.aOuter === '-' && rails.aInner === '+' ? 'aInner' : 'aOuter';
  const minus = plus === 'aOuter' ? 'aInner' : 'aOuter';
  return reading({
    rails,
    wires: [wire('W1', 'red', 'a5', 'rail:aOuter:5'), wire('W2', 'black', 'b6', 'rail:aInner:6'),
            wire('W3', 'red', 'i20', 'rail:jInner:20'), wire('W4', 'black', 'j25', 'rail:jOuter:25')],
    power: [battery(`rail:${plus}:3`, `rail:${minus}:3`)],
  });
}
const railOfWire = (out, from) => {
  const w = wiresOf(out).find(a => a.from === from);
  assert.ok(w, `no add_wire from ${from}: ${JSON.stringify(wiresOf(out))}`);
  return w.to;
};

test.each([
  { name: 'BB830 order: + outer on the a-side, + inner on the j-side', rails: BB830,
    want: { a5: 'tp_5', b6: 'tn_6', i20: 'bp_20', j25: 'bn_25' } },
  { name: 'the opposite print on both sides', rails: { aOuter: '-', aInner: '+', jInner: '-', jOuter: '+' },
    want: { a5: 'tn_5', b6: 'tp_6', i20: 'bn_20', j25: 'bp_25' } },
])('rails map by side and printed sign, column kept ($name)', ({ rails, want }) => {
  const rd = fourRails(rails);
  const out = build(rd);
  const got = {};
  for (const from of Object.keys(want)) got[from] = railOfWire(out, from);
  assert.deepStrictEqual(got, want);
  assert.ok(!out.flags.some(f => f.kind === 'rails'), `signs were read, so no rails flag; got ${JSON.stringify(kinds(out))}`);
  assertSameNets(rd, out, checkInvariants(out));
});

test.each([
  { name: 'a-side both ?', rails: { aOuter: '?', aInner: '?', jInner: '+', jOuter: '-' },
    want: { a5: 'tp_5', b6: 'tn_6', i20: 'bp_20', j25: 'bn_25' } },
  { name: 'a-side both +', rails: { aOuter: '+', aInner: '+', jInner: '+', jOuter: '-' },
    want: { a5: 'tp_5', b6: 'tn_6', i20: 'bp_20', j25: 'bn_25' } },
  { name: 'j-side both ?', rails: { aOuter: '+', aInner: '-', jInner: '?', jOuter: '?' },
    want: { a5: 'tp_5', b6: 'tn_6', i20: 'bn_20', j25: 'bp_25' } },
  { name: 'j-side both −', rails: { aOuter: '+', aInner: '-', jInner: '-', jOuter: '-' },
    want: { a5: 'tp_5', b6: 'tn_6', i20: 'bn_20', j25: 'bp_25' } },
])('a side with unreadable or equal signs falls back to outer +, inner −, flagged rails ($name)', ({ rails, want }) => {
  const rd = fourRails(rails);
  const out = build(rd);
  const got = {};
  for (const from of Object.keys(want)) got[from] = railOfWire(out, from);
  assert.deepStrictEqual(got, want);
  assert.ok(hasFlag(out, 'rails', null), `expected a rails flag (id null), got ${JSON.stringify(kinds(out))}`);
  assertSameNets(rd, out, checkInvariants(out));
});

// ── Taken holes move within their node ───────────────────────────────────

test('a wire end on a rail hole the battery already took moves to the next column of that rail, flagged moved', () => {
  const rd = reading({
    parts: [resistor('R1', 'a5', 'a9')],
    wires: [wire('W1', 'red', 'e5', 'rail:aOuter:3'), wire('W2', 'black', 'e9', 'rail:aInner:20')],
    power: [battery('rail:aOuter:3', 'rail:aInner:3')],
  });
  const out = build(rd);
  assert.deepStrictEqual(wiresOf(out)[0], { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3', color: 'red' });
  const to = railOfWire(out, 'e5');
  assert.ok(to === 'tp_4' || to === 'tp_2', `W1's rail end expected in the next column of tp (tp_4 or tp_2), got ${to}`);
  assert.ok(hasFlag(out, 'moved', 'W1'), `expected a moved flag for W1, got ${JSON.stringify(kinds(out))}`);
  assertSameNets(rd, out, checkInvariants(out));
});

test.each([
  { name: 'an LED lead in a resistor lead\'s hole', item: 'LED1',
    extra: { parts: [resistor('R1', 'a10', 'a14'), led('LED1', 'a14', 'a17')], wires: [] },
    moved: out => {
      const p = out.actions.find(a => a.tool === 'place_led');
      const A = ref(p.holeA), B = ref(p.holeB);
      assert.ok(p.holeA !== 'a14' && A.col === 13 && 'abcde'.includes(A.row), `LED1's cathode expected in column 14 a–e, not a14; got ${p.holeA}`);
      assert.ok(B.col === 16 && B.row === A.row, `LED1's anode expected in column 17 on the cathode's row; got ${p.holeB}`);
    } },
  { name: 'a wire end in a resistor lead\'s hole', item: 'W1',
    extra: { parts: [resistor('R1', 'a10', 'a14')], wires: [wire('W1', 'black', 'a14', 'rail:aInner:14')] },
    moved: out => {
      const w = wiresOf(out).find(a => a.to === 'tn_14');
      assert.ok(w, `W1 expected to end at tn_14: ${JSON.stringify(wiresOf(out))}`);
      const A = ref(w.from);
      assert.ok(w.from !== 'a14' && A && A.col === 13 && 'abcde'.includes(A.row), `W1's body end expected in column 14 a–e, not a14; got ${w.from}`);
    } },
])('two leads in one hole: the second moves to a free hole in the same column-half, flagged moved ($name)', ({ item, extra, moved }) => {
  const rd = reading(Object.assign({ power: [battery('rail:aOuter:3', 'rail:aInner:3')] }, extra));
  const out = build(rd);
  moved(out);
  assert.ok(hasFlag(out, 'moved', item), `expected a moved flag for ${item}, got ${JSON.stringify(kinds(out))}`);
  assert.deepStrictEqual(out.skipped, []);
  assertSameNets(rd, out, checkInvariants(out));
});

test.each([
  { name: 'two holes of one column-half', ends: ['a20', 'c20'] },
  { name: 'two holes of one rail',        ends: ['rail:aOuter:3', 'rail:aOuter:20'] },
])('a wire with both ends in one node is dropped and listed in skipped ($name)', ({ ends }) => {
  const rd = reading({
    parts: [resistor('R1', 'a10', 'a14')],
    wires: [wire('W1', 'green', ends[0], ends[1]), wire('W2', 'red', 'rail:aOuter:10', 'b10')],
    power: [battery('rail:aOuter:5', 'rail:aInner:5')],
  });
  const out = build(rd);
  assert.deepStrictEqual(wiresOf(out).map(w => w.color), ['red', 'black', 'red'], 'only the battery leads and W2 are built');
  assert.deepStrictEqual(skippedIds(out), ['W1']);
  assert.strictEqual(out.labels.W1, undefined, 'a dropped wire has no app id');
  assert.strictEqual(out.labels.W2, 'W3');
  assertSameNets(rd, out, checkInvariants(out));
});

// ── Power ────────────────────────────────────────────────────────────────

// A forwards LED circuit on the rails with no power entry.
test.each([
  { name: 'a-side rails only',
    wires: [wire('W1', 'red', 'rail:aOuter:8', 'b10'), wire('W2', 'black', 'b17', 'rail:aInner:19')],
    rails: ['tp', 'tn'] },
  { name: 'the a-side + rail and the j-side − rail',
    wires: [wire('W1', 'red', 'rail:aOuter:8', 'b10'), wire('W2', 'yellow', 'd17', 'g17'), wire('W3', 'black', 'h17', 'rail:jOuter:19')],
    rails: ['tp', 'bn'] },
])('no power entry but rails in use: a 9 V battery is assumed on them, flagged source ($name)', ({ wires, rails }) => {
  const rd = reading({ parts: [resistor('R1', 'a10', 'a14'), led('LED1', 'c17', 'c14')], wires });
  const out = build(rd);
  assert.deepStrictEqual(out.actions[0], { tool: 'place_battery', voltage: 9 });
  assert.ok(out.flags.some(f => f.kind === 'source'), `expected a source flag, got ${JSON.stringify(kinds(out))}`);
  const batWires = wiresOf(out).filter(w => /^BAT1\./.test(w.from));
  for (const r of rails) {
    assert.ok(batWires.some(w => ref(w.to) && ref(w.to).row === r), `the assumed battery must wire ${r}: ${JSON.stringify(batWires)}`);
  }
  // Every Reading wire's id counts the battery's leads first.
  wires.forEach((w, i) => assert.strictEqual(out.labels[w.id], `W${batWires.length + i + 1}`));
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
  const m = simulate(board).r.parts.LED1.m;
  assert.ok(m.on && m.current > 14.8 && m.current < 15.0, `LED1 expected on at 14.8–15.0 mA from the assumed 9 V, got on=${m.on} ${m.current}`);
});

test.each([
  { name: 'a 9 V battery with its voltage unread', power: battery('rail:aOuter:3', 'rail:aInner:3', 0), voltage: 9, flag: 'value' },
  { name: 'a battery read at 30 V (out of 1–24 V)', power: battery('rail:aOuter:3', 'rail:aInner:3', 30), voltage: 9, flag: 'value' },
  { name: 'a bench supply at 5 V', power: battery('rail:aOuter:3', 'rail:aInner:3', 5, 'bench_supply'), voltage: 5, flag: 'source' },
  { name: 'an unknown source at 9 V', power: battery('rail:aOuter:3', 'rail:aInner:3', 9, 'unknown'), voltage: 9, flag: 'source' },
])('every power entry is built as a battery, flagged when guessed ($name)', ({ power, voltage, flag }) => {
  const rd = reading({ parts: [resistor('R1', 'a10', 'a14')], wires: [wire('W1', 'red', 'rail:aOuter:10', 'b10')], power: [power] });
  const out = build(rd);
  assert.deepStrictEqual(out.actions[0], { tool: 'place_battery', voltage });
  assert.deepStrictEqual(wiresOf(out).slice(0, 2), [
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_3', color: 'black' },
  ]);
  assert.strictEqual(out.labels['power:0'], 'BAT1');
  assert.ok(hasFlag(out, flag, 'power:0'), `expected a ${flag} flag for power:0, got ${JSON.stringify(kinds(out))}`);
  checkInvariants(out);
});

// ── Not built ────────────────────────────────────────────────────────────

test('a part of type other is not built: flagged type, listed in skipped, later parts still numbered from 1', () => {
  const other = { id: 'U1', type: 'other', what: 'push button', value: 0, bands: [], color: '',
                  leads: [lead('e20'), lead('f20'), lead('e22'), lead('f22')], box: [0, 0, 0, 0], confidence: 0.6, unsure: [] };
  const rd = reading({ parts: [other, resistor('R1', 'a10', 'a14')], wires: [wire('W1', 'red', 'rail:aOuter:10', 'b10')],
                       power: [battery('rail:aOuter:3', 'rail:aInner:3')] });
  const out = build(rd);
  assert.ok(hasFlag(out, 'type', 'U1'), `expected a type flag for U1, got ${JSON.stringify(kinds(out))}`);
  assert.deepStrictEqual(skippedIds(out), ['U1']);
  assert.strictEqual(out.labels.U1, undefined);
  assert.deepStrictEqual(placesOf(out), [{ tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 }]);
  assert.strictEqual(out.labels.R1, 'R1');
  checkInvariants(out);
});

// ── The bridge (#137) ────────────────────────────────────────────────────

const BAT_A = () => [battery('rail:aOuter:3', 'rail:aInner:3')];
const R_MA  = 9 / 470 * 1000;   // 9 V across 470 Ω: 19.15 mA
const amps  = (board, label) => Math.abs(simulate(board).r.parts[label].m.current);
const builtOk = (out, id) => assert.ok(out.labels[id],
  `${id} must be built; got flags ${JSON.stringify(kinds(out))}, skipped ${JSON.stringify(out.skipped.map(s => s.id))}`);

// These were "not built yet" (mismatch) in #136; the bridge builds them.
test.each([
  { name: 'a lead in a rail',                id: 'R1',   flag: 'moved',   part: resistor('R1', 'rail:aOuter:10', 'a14') },
  { name: 'leads 8 columns apart',            id: 'R1',   flag: 'moved',   part: resistor('R1', 'a10', 'a18') },
  { name: 'diagonal across the centre gap',   id: 'R1',   flag: 'moved',   part: resistor('R1', 'a10', 'h13') },
  { name: 'both leads in one column-half',    id: 'LED1', flag: 'shorted', part: led('LED1', 'a14', 'c14') },
])('a part that needs the bridge is built with one white jumper between the battery leads and the Reading\'s wires, flagged $flag ($name)', ({ id, flag, part }) => {
  const rd = reading({ parts: [part, resistor('R2', 'a30', 'a34')], wires: [wire('W1', 'red', 'rail:aOuter:30', 'b30')], power: BAT_A() });
  const out = build(rd);
  builtOk(out, id);
  assert.deepStrictEqual(out.skipped, []);
  assert.ok(hasFlag(out, flag, id), `expected a ${flag} flag for ${id}, got ${JSON.stringify(kinds(out))}`);
  assert.ok(!out.flags.some(f => f.kind === 'mismatch'), `no mismatch: a helper is free; got ${JSON.stringify(kinds(out))}`);
  assert.ok(placesOf(out).some(a => a.holeA === 'a30' && a.holeB === 'a34'), 'R2 still sits where it was photographed');
  const jumpers = jumpersOf(out);
  assert.deepStrictEqual(jumpers.map(w => w.color), ['white'], `one white jumper; got ${JSON.stringify(wiresOf(out))}`);
  assert.strictEqual(wiresOf(out).indexOf(jumpers[0]), 2, 'the jumper comes right after the two battery leads');
  assert.strictEqual(out.labels.W1, 'W4', 'the Reading\'s W1 counts the battery leads and the jumper first');
  assertSameNets(rd, out, checkInvariants(out));
});

// Pin (already in #136): the bridge must not take over a part that fits.
test('pin: a diagonal resistor c10→e14 in one half sits on one row of columns 10 and 14, no jumper, flagged moved', () => {
  const rd = reading({ parts: [resistor('R1', 'c10', 'e14')], power: BAT_A(),
                       wires: [wire('W1', 'red', 'rail:aOuter:10', 'a10'), wire('W2', 'black', 'a14', 'rail:aInner:14')] });
  const out = build(rd);
  const [p] = placesOf(out);
  const A = ref(p.holeA), B = ref(p.holeB);
  assert.ok(A.row === B.row && 'abcde'.includes(A.row) && A.col === 9 && B.col === 13, `R1 expected on one a–e row, columns 10 and 14; got ${p.holeA}/${p.holeB}`);
  assert.deepStrictEqual(jumpersOf(out), []);
  assert.ok(hasFlag(out, 'moved', 'R1'), `expected a moved flag for R1, got ${JSON.stringify(kinds(out))}`);
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
  assert.ok(Math.abs(amps(board, 'R1') - R_MA) < 0.05, `R1 expected ${R_MA.toFixed(2)} mA, got ${amps(board, 'R1')}`);
});

test('an 8-column resistor a10→a18 is bridged: one white jumper, flagged moved, 9 V / 470 Ω flows; a corrupted jumper breaks the nets check', () => {
  const rd = reading({ parts: [resistor('R1', 'a10', 'a18')], power: BAT_A(),
                       wires: [wire('W1', 'red', 'rail:aOuter:10', 'b10'), wire('W2', 'black', 'b18', 'rail:aInner:18')] });
  const out = build(rd);
  builtOk(out, 'R1');
  assert.ok(hasFlag(out, 'moved', 'R1'), `expected a moved flag for R1, got ${JSON.stringify(kinds(out))}`);
  assert.deepStrictEqual(jumpersOf(out).map(w => w.color), ['white']);
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
  assert.ok(Math.abs(amps(board, 'R1') - R_MA) < 0.05, `R1 expected ${R_MA.toFixed(2)} mA, got ${amps(board, 'R1')}`);

  // Negative control: move the jumper's body end one column; the nets check must catch it.
  const bad = JSON.parse(JSON.stringify(out));
  const j = jumpersOf(bad)[0];
  const next = h => h.replace(/\d+$/, n => String(+n + 1));
  if (/^[a-j]\d+$/.test(j.to)) j.to = next(j.to); else j.from = next(j.from);
  assert.throws(() => assertSameNets(rd, bad, Board.apply(Board.empty(), bad.actions).board), /nets/);
});

test('an LED with both legs in one column-half is bridged, flagged shorted: its pins share one net and it simulates dark', () => {
  const rd = reading({ parts: [resistor('R1', 'b16', 'b20'), led('LED1', 'c20', 'd20')], power: BAT_A(),
                       wires: [wire('W1', 'red', 'rail:aOuter:16', 'a16'), wire('W2', 'black', 'e20', 'rail:aInner:20')] });
  const out = build(rd);
  builtOk(out, 'LED1');
  assert.ok(hasFlag(out, 'shorted', 'LED1'), `expected a shorted flag for LED1, got ${JSON.stringify(kinds(out))}`);
  assert.deepStrictEqual(jumpersOf(out).map(w => w.color), ['white']);
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
  const n = builtNets(board).LED1;
  assert.strictEqual(n[0], n[1], 'LED1\'s two pins must be on one net');
  const m = simulate(board).r.parts.LED1.m;
  assert.ok(!m.on && Math.abs(m.current) < 0.01, `shorted LED1 expected dark, got on=${m.on} ${m.current}`);
  assert.ok(Math.abs(amps(board, 'R1') - R_MA) < 0.05, `R1 expected ${R_MA.toFixed(2)} mA through the short, got ${amps(board, 'R1')}`);
});

test('a resistor with both legs in rails (+ to −) is bridged through two helpers: two white jumpers, flagged moved, 9 V / 470 Ω flows', () => {
  const rd = reading({ parts: [resistor('R1', 'rail:aOuter:10', 'rail:aInner:14')], power: BAT_A() });
  const out = build(rd);
  builtOk(out, 'R1');
  assert.ok(hasFlag(out, 'moved', 'R1'), `expected a moved flag for R1, got ${JSON.stringify(kinds(out))}`);
  assert.deepStrictEqual(jumpersOf(out).map(w => w.color), ['white', 'white']);
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
  assert.ok(Math.abs(amps(board, 'R1') - R_MA) < 0.05, `R1 expected ${R_MA.toFixed(2)} mA, got ${amps(board, 'R1')}`);
});

test('a resistor with both legs in one rail is built, flagged shorted, its pins on one net', () => {
  const rd = reading({ parts: [resistor('R1', 'rail:aOuter:10', 'rail:aOuter:14')], power: BAT_A() });
  const out = build(rd);
  builtOk(out, 'R1');
  assert.ok(hasFlag(out, 'shorted', 'R1'), `expected a shorted flag for R1, got ${JSON.stringify(kinds(out))}`);
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
  const n = builtNets(board).R1;
  assert.strictEqual(n[0], n[1], 'R1\'s two pins must be on one net');
});

// Column 30 a–e holds five leads (R1–R5); one more can't fit.
const FIVE = () => [resistor('R1', 'a30', 'a26'), resistor('R2', 'b30', 'b27'), resistor('R3', 'c30', 'c35'),
                    resistor('R4', 'd30', 'd34'), resistor('R5', 'e30', 'e33')];
test.each([
  { name: 'a sixth resistor lead', id: 'R6', parts: [resistor('R6', 'c30', 'c25')], wires: [] },
  { name: 'pin: a wire end',       id: 'W1', parts: [], wires: [wire('W1', 'green', 'c30', 'rail:aInner:30')] },
])('a 6th lead into a full column-half is not built, flagged position (not mismatch); the five are built ($name)', ({ id, parts, wires }) => {
  const rd = reading({ parts: FIVE().concat(parts), wires, power: BAT_A() });
  const out = build(rd);
  assert.ok(hasFlag(out, 'position', id), `expected a position flag for ${id}, got ${JSON.stringify(kinds(out))}`);
  assert.ok(!out.flags.some(f => f.kind === 'mismatch'), `a full column-half is position, not mismatch; got ${JSON.stringify(kinds(out))}`);
  assert.deepStrictEqual(skippedIds(out), [id]);
  assert.strictEqual(out.labels[id], undefined);
  for (const k of ['R1', 'R2', 'R3', 'R4', 'R5']) assert.strictEqual(out.labels[k], k);
  assertSameNets(rd, out, checkInvariants(out));
});

// A part straight across the gap in one column is legal as it is (the
// registry allows a vertical placement across the gap, e.g. e3→f3).
test.each([
  { name: 'a resistor e10–f10',            part: resistor('R1', 'e10', 'f10'), want: { tool: 'place_resistor', holeA: 'e10', holeB: 'f10', resistance: 470 } },
  { name: 'a resistor c10–h10',            part: resistor('R1', 'c10', 'h10'), want: { tool: 'place_resistor', holeA: 'c10', holeB: 'h10', resistance: 470 } },
  { name: 'an LED, cathode e3, anode f3',  part: led('LED1', 'e3', 'f3'),      want: { tool: 'place_led', holeA: 'e3', holeB: 'f3', color: 'red' } },
])('a part standing straight across the gap in one column is placed vertically as it is: no jumper, no flags ($name)', ({ part, want }) => {
  const rd = reading({ parts: [part], power: BAT_A() });
  const out = build(rd);
  assert.deepStrictEqual(placesOf(out), [want]);
  assert.deepStrictEqual(out.flags, []);
  assert.deepStrictEqual(out.skipped, []);
  assert.deepStrictEqual(jumpersOf(out), []);
  assertSameNets(rd, out, checkInvariants(out));
});

test('pin: a wire e10 → f10 across the gap is built as given and joins the halves: R1 and R2 in series, 9 V / 940 Ω', () => {
  const rd = reading({
    parts: [resistor('R1', 'a6', 'a10'), resistor('R2', 'j10', 'j14')],
    wires: [wire('W1', 'yellow', 'e10', 'f10'), wire('W2', 'red', 'rail:aOuter:6', 'b6'), wire('W3', 'black', 'i14', 'rail:jOuter:14')],
    power: [battery('rail:aOuter:2', 'rail:jOuter:2')],
  });
  const out = build(rd);
  assert.ok(wiresOf(out).some(w => w.from === 'e10' && w.to === 'f10'), `expected add_wire e10 → f10: ${JSON.stringify(wiresOf(out))}`);
  assert.deepStrictEqual(jumpersOf(out), []);
  assert.deepStrictEqual(out.skipped, []);
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
  assert.ok(Math.abs(amps(board, 'R1') - 9 / 940 * 1000) < 0.05, `R1 expected 9.57 mA, got ${amps(board, 'R1')}`);
});

test('on a 30-column board the bridge stays within the board\'s 30 columns (on 63 it may use column 31)', () => {
  // R1's rail lead (− rail, column 30) needs a helper 3–5 columns from
  // column 28: toward the rail end that is 31, past a 30-column board, so
  // there the helper is 25.
  const at = cols => reading({
    cols,
    parts: [resistor('R1', 'a28', 'rail:aInner:30')],
    power: [battery('rail:aOuter:2', 'rail:aInner:2')],
  });
  const rd = at(30);
  const out = build(rd);
  builtOk(out, 'R1');
  assert.deepStrictEqual(out.skipped, []);
  assert.deepStrictEqual(placesOf(out), [{ tool: 'place_resistor', holeA: 'a28', holeB: 'a25', resistance: 470 }]);
  const jumpers = jumpersOf(out);
  assert.strictEqual(jumpers.length, 1);
  assert.strictEqual(ref(jumpers[0].from).col + 1, 25, `the jumper starts at the helper, column 25: ${JSON.stringify(jumpers[0])}`);
  const cols = out.actions.flatMap(a => [a.holeA, a.holeB, a.from, a.to]).map(ref).filter(Boolean).map(r => r.col + 1);
  assert.ok(cols.every(c => c <= 30), `every hole must be in columns 1–30; got columns ${cols.join(', ')}`);
  assertSameNets(rd, out, checkInvariants(out));

  // The same Reading on a 63-column board takes the helper at 31: the limit is what moved it.
  const wide = build(at(63));
  const [p] = placesOf(wide);
  assert.strictEqual(ref(p.holeB).col + 1, 31, `on 63 columns the helper is column 31; got ${p.holeA}/${p.holeB}`);
});

test('when no same-half helper is free within span, the helper is the same column across the gap: the part stands vertically', () => {
  // Every top column-half 3–5 away from column 10 or 18 is in use.
  const wires = [5, 6, 7, 13, 14, 15, 21, 22, 23].map(c => wire('X' + c, 'yellow', 'e' + c, 'f' + c));
  const rd = reading({ parts: [resistor('R1', 'a10', 'a18')], wires, power: BAT_A() });
  const out = build(rd);
  builtOk(out, 'R1');
  const [p] = placesOf(out);
  const A = ref(p.holeA), B = ref(p.holeB);
  assert.ok(A.col === B.col && [9, 17].includes(A.col) && 'abcde'.includes(A.row) !== 'abcde'.includes(B.row),
    `R1 expected vertical across the gap in column 10 or 18; got ${p.holeA}/${p.holeB}`);
  assert.strictEqual(jumpersOf(out).length, 1);
  assert.ok(hasFlag(out, 'moved', 'R1'), `expected a moved flag for R1, got ${JSON.stringify(kinds(out))}`);
  assertSameNets(rd, out, checkInvariants(out));
});

// Passes before the bridge exists (nothing is bridged yet); guards the
// no-helper path once it does.
test('no free helper column-half anywhere: the part is not built, flagged mismatch, listed in skipped', () => {
  const wires = [];
  for (let c = 1; c <= 63; c++) wires.push(wire('X' + c, 'yellow', 'e' + c, 'f' + c));   // every column-half in use
  const rd = reading({ parts: [resistor('R1', 'b10', 'b18'), resistor('R2', 'a40', 'a44')], wires });
  const out = build(rd);
  assert.ok(hasFlag(out, 'mismatch', 'R1'), `expected a mismatch flag for R1, got ${JSON.stringify(kinds(out))}`);
  assert.deepStrictEqual(skippedIds(out), ['R1']);
  assert.strictEqual(out.labels.R1, undefined);
  assert.strictEqual(out.labels.R2, 'R1', 'a skipped part shifts later numbers');
  assert.deepStrictEqual(jumpersOf(out), []);
  assertSameNets(rd, out, checkInvariants(out));
});

// ── Property: 200 random Readings (seeded, so the same every run) ────────
// Resistors and LEDs with random holes (body columns 1–40, a fifth in a
// rail), spans 0–6 columns, any rows, random polarity (sometimes unknown),
// random wires, a battery on random rail strips. Zero refusals and the
// Reading's nets always (stronger than the issue's "unless `type` or
// `mismatch`": unbuilt parts are left out of the terminals); and the bridge
// must actually build: at least 97% of the parts (the prototype built all).

function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('property: 200 random Readings build with zero refusals and the Reading\'s nets, and nearly every part is built', () => {
  const next = mulberry32(137);
  const rnd  = n => Math.floor(next() * n);
  const STRIPS = ['aOuter', 'aInner', 'jInner', 'jOuter'], ROWS = 'abcdefghij';
  const rail = () => `rail:${STRIPS[rnd(4)]}:${1 + rnd(63)}`;
  const hole = () => (rnd(5) === 0 ? rail() : ROWS[rnd(10)] + (1 + rnd(40)));
  const near = h => (h.startsWith('rail') ? hole() : ROWS[rnd(10)] + Math.max(1, Math.min(63, +h.slice(1) + rnd(13) - 6)));

  const fails = [];
  let parts = 0, built = 0, jumpers = 0;
  for (let k = 0; k < 200; k++) {
    const ps = [], ws = [];
    for (let i = 0, n = 2 + rnd(8); i < n; i++) {
      const a = hole(), b = near(a);
      if (rnd(2)) { ps.push(resistor('R' + i, a, b)); continue; }
      const roles = rnd(4) === 0 ? ['unknown', 'unknown'] : rnd(2) ? ['cathode', 'anode'] : ['anode', 'cathode'];
      ps.push(ledOf('L' + i, [{ hole: a, role: roles[0] }, { hole: b, role: roles[1] }]));
    }
    for (let i = 0, n = rnd(6); i < n; i++) { const a = hole(); ws.push(wire('W' + i, 'yellow', a, near(a))); }
    const rd = reading({ parts: ps, wires: ws, power: [battery(rail(), rail())] });

    let out;
    try { out = build(rd); } catch (e) { fails.push(`#${k} threw ${e.message}`); continue; }
    try {
      const board = checkInvariants(out);
      assertSameNets(rd, out, board);   // every Reading: unbuilt parts are left out of the terminals
    } catch (e) {
      fails.push(`#${k}: ${String(e.message).split('\n')[0]} ${JSON.stringify(rd.parts.map(p => [p.id, p.leads.map(l => l.hole)]))}`);
    }
    for (const p of ps) {
      if (out.labels[p.id]) built++;
      else if (!skippedIds(out).includes(p.id)) fails.push(`#${k}: ${p.id} is neither built nor listed in skipped`);
    }
    parts += ps.length;
    jumpers += jumpersOf(out).length;
  }
  assert.deepStrictEqual(fails, [], fails.slice(0, 5).join('\n'));
  assert.ok(built / parts >= 0.97, `only ${built} of ${parts} parts built (${(100 * built / parts).toFixed(1)}%); the bridge should build at least 97%`);
  assert.ok(jumpers > 0, 'the random Readings must exercise the bridge');
});

// ── Malformed input, missing ids and duplicates ──────────────────────────
// validateReading (backend/photo-reader.js) turns a missing id into '', so
// a blank id is treated as missing: the entry's key is part<i+1> / wire<i+1>
// (1-based within parts / wires), used in labels, flags and skipped. Only
// exact duplicates are dropped (a part with the same type, value and lead
// holes as an earlier one; a wire with the same two ends, either order). A
// different entry reusing an id is still built, keyed <id>#2, <id>#3…

const STAGE_ACTIONS = [
  { tool: 'place_battery', voltage: 9 },
  { tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 },
  { tool: 'place_led', holeA: 'c14', holeB: 'c17', color: 'red' },
  { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3', color: 'red' },
  { tool: 'add_wire', from: 'BAT1.1', to: 'tn_3', color: 'black' },
  { tool: 'add_wire', from: 'tp_10', to: 'b10', color: 'red' },
  { tool: 'add_wire', from: 'b17', to: 'tn_19', color: 'black' },
];

test.each([
  { name: 'undefined', rd: undefined },
  { name: 'null',      rd: null },
  { name: '{}',        rd: {} },
  { name: 'null lists and rails', rd: { board: { visible: true, cols: 63, rails: null, split: false }, parts: null, wires: null, power: null } },
])('build never throws on a Reading that is $name, and builds nothing', ({ rd }) => {
  const out = build(rd);
  assert.deepStrictEqual(out, { actions: [], labels: {}, flags: [], skipped: [] });
});

test('build never throws on junk entries: each bad one is listed in skipped, the good ones still build legally', () => {
  const junk = (id, leads) => Object.assign(resistor(id, 'a1', 'a5'), { leads });
  const rd = {
    board: { visible: true, cols: 63, rails: null, split: false },
    parts: [
      junk('X1', []),                                             // no leads
      junk('X2', [lead('a40'), lead('a44'), lead('a46')]),         // 3 leads
      junk('X3', [{ hole: 14, pt: [0, 0], role: 'none' }, { hole: {}, pt: [0, 0], role: 'none' }]),   // not strings
      null,                                                        // not a part (key part4)
      resistor('R1', 'a10', 'a14'),
    ],
    wires: [
      { id: 'WX1', color: 'red', ends: [end('a50')], confidence: 0.9, unsure: [] },                  // one end
      { id: 'WX2', color: 'red', ends: [{ hole: null }, { hole: 7 }], confidence: 0.9, unsure: [] },  // not strings
      wire('W1', 'red', 'rail:aOuter:10', 'b10'),
    ],
    power: [battery('rail:aOuter:3', 'rail:aInner:3')],
  };
  const out = build(rd);
  assert.deepStrictEqual(skippedIds(out).slice().sort(), ['WX1', 'WX2', 'X1', 'X2', 'X3', 'part4']);
  assert.deepStrictEqual(placesOf(out), [{ tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 }]);
  assert.strictEqual(out.labels.R1, 'R1');
  assert.strictEqual(out.labels.W1, 'W3');
  checkInvariants(out);
});

test.each([
  { name: 'blank',       id: '' },
  { name: 'whitespace',  id: '   ' },
  { name: 'null',        id: null },
  { name: 'missing',     id: undefined },
])('the stage board with every part and wire id $name builds everything, keyed part<n> / wire<n>', ({ id }) => {
  const rd = stage();
  for (const x of rd.parts.concat(rd.wires)) {
    if (id === undefined) delete x.id; else x.id = id;
  }
  const out = build(rd);
  assert.deepStrictEqual(out, {
    actions: STAGE_ACTIONS,
    labels: { 'power:0': 'BAT1', part1: 'R1', part2: 'LED1', wire1: 'W3', wire2: 'W4' },
    flags: [],
    skipped: [],
  });
});

test('an exact duplicate part (same type, value, holes) and an exact duplicate wire (same ends, either order) are built once; the copies are listed in skipped', () => {
  const rd = stage();
  rd.parts.push(resistor('R9', 'a10', 'a14'));
  rd.wires.push(wire('W9', 'black', 'rail:aInner:19', 'b17'));
  const out = build(rd);
  assert.deepStrictEqual(out.actions, STAGE_ACTIONS);
  assert.deepStrictEqual(skippedIds(out), ['R9', 'W9']);
  assert.strictEqual(out.labels.R9, undefined);
  assert.strictEqual(out.labels.W9, undefined);
});

test('different parts and wires that reuse an id are all built, keyed <id>#2, <id>#3', () => {
  const rd = stage();
  rd.parts.push(resistor('R1', 'a30', 'a34', 1000), resistor('R1', 'a40', 'a44', 2200));
  rd.wires.push(wire('W1', 'green', 'rail:aOuter:30', 'b30'));
  const out = build(rd);
  assert.deepStrictEqual(placesOf(out), [
    { tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 },
    { tool: 'place_led', holeA: 'c14', holeB: 'c17', color: 'red' },
    { tool: 'place_resistor', holeA: 'a30', holeB: 'a34', resistance: 1000 },
    { tool: 'place_resistor', holeA: 'a40', holeB: 'a44', resistance: 2200 },
  ]);
  assert.deepStrictEqual(out.labels, { 'power:0': 'BAT1', R1: 'R1', LED1: 'LED1', 'R1#2': 'R2', 'R1#3': 'R3', W1: 'W3', W2: 'W4', 'W1#2': 'W5' });
  assert.deepStrictEqual(out.skipped, []);
  checkInvariants(out);
});
