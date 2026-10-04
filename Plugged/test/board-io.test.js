// Tests for board-io.js: turning saved circuit data back into a board.

const assert = require('node:assert');
const IO  = require('../circuit3d/js/board-io.js');
const Ids = require('../circuit3d/js/ids.js');
const Sim = require('../circuit3d/js/simulate.js');
const { rebuildComponents, assignMissingLabels } = IO;

// ── Fixtures ──────────────────────────────────────────────────────────────
// Records are in the saved-file shape (see demo.sparky). place() stands in
// for App.place*: it builds the part types this build knows and returns null
// for the rest, the way rebuildBoard's callback does.

const h = (col, row) => ({ col, row });
const KNOWN = new Set(['resistor', 'led', 'battery', 'buzzer', 'button']);
// The types this build knows, as rebuildBoard tells rebuildComponents. A
// known type that fails to rebuild is dropped (null); only an unknown type
// becomes a placeholder.
const knows = t => KNOWN.has(t);

function place(r) {
  if (!KNOWN.has(r.type)) return null;
  return { type: r.type, label: r.label, values: r.values, holeRefs: r.holeRefs, pins: [{}, {}] };
}

// What serializeBoard writes for a part it knows.
const toRecord = c => ({ type: c.type, label: c.label, values: c.values, holeRefs: c.holeRefs });

const resistor = () => ({ type: 'resistor', label: 'R1', values: { resistance: 470 }, holeRefs: [h(1, 'a'), h(5, 'a')] });
const led      = () => ({ type: 'led',      label: 'LED1', values: { color: 'red' }, holeRefs: [h(9, 'a'), h(8, 'a')] });
const battery  = () => ({ type: 'battery',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null, position: { x: -20, z: 0 } });
// A part from a newer build: a type and fields this build has never heard of.
const opAmp    = () => ({
  type: 'op_amp', id: 'op_amp_0', label: 'U1', values: { gain: 100000 },
  holeRefs: [h(12, 'e'), h(13, 'e'), h(14, 'e'), h(12, 'f'), h(13, 'f'), h(14, 'f')],
  position: { x: 0, z: 0 }, foo: 'bar', pinout: ['IN-', 'IN+', 'OUT', 'V+', 'V-', 'NC'],
});

// Saved wires in the file's shape. A wire names a part by index only for an
// end with no hole (startHole/endHole null), e.g. an off-board pin.
const holeWire = (a, b) => ({ startHole: a, endHole: b, startCompIdx: -1, startPinIdx: -1,
                              endCompIdx: -1, endPinIdx: -1, color: 0xef4444 });
const pinToHole = (ci, pi, hole) => ({ startHole: null, endHole: hole, startCompIdx: ci, startPinIdx: pi,
                                       endCompIdx: -1, endPinIdx: -1, color: 0x22c55e });
const pinToPin = (ci, pi, cj, pj) => ({ startHole: null, endHole: null, startCompIdx: ci, startPinIdx: pi,
                                        endCompIdx: cj, endPinIdx: pj, color: 0x111111 });

// The new pure functions this issue adds. Checked first so a missing export
// fails as an assertion rather than "x is not a function".
function need(name) {
  assert.equal(typeof IO[name], 'function', `board-io.js must export ${name}()`);
  return IO[name];
}

// Rebuild then serialize, the way rebuildBoard and serializeBoard pair up.
function roundTrip(records, wires) {
  const components = rebuildComponents(records, place, knows);
  const { known, unknown } = need('splitWires')(wires, components);
  return {
    components,
    known,
    unknown,
    savedComponents: need('recordsFor')(components, toRecord),
    savedWires:      known.concat(need('unknownWireRecords')(unknown, components)),
  };
}

function assertPlaceholder(p, msg) {
  assert.ok(p && typeof p === 'object', `${msg}: expected a placeholder object, got ${JSON.stringify(p)}`);
  assert.equal(p.unknown, true, `${msg}: placeholder.unknown`);
}

// ── Rebuilding keeps every slot ───────────────────────────────────────────

test('a part that fails to rebuild keeps its slot as a placeholder so later indexes line up', () => {
  const out = rebuildComponents([resistor(), opAmp(), led()], place, knows);
  assert.equal(out.length, 3);
  assert.equal(out[0].type, 'resistor');
  assertPlaceholder(out[1], 'slot 1');
  assert.equal(out[2].type, 'led');
});

test('an unknown part whose rebuild throws becomes a placeholder instead of aborting the load', () => {
  const bad = opAmp();
  const out = rebuildComponents([led(), bad], r => { if (r.type === 'op_amp') throw new Error('bad hole'); return place(r); }, knows);
  assert.equal(out.length, 2);
  assert.equal(out[0].type, 'led');
  assertPlaceholder(out[1], 'slot 1');
  assert.deepEqual(out[1].raw, bad);
});

test('a known part whose rebuild throws is dropped (null slot), not a placeholder, and the load goes on', () => {
  const out = rebuildComponents([led(), resistor(), opAmp()],
    r => { if (r.type === 'resistor') throw new Error('bad hole'); return place(r); }, knows);
  assert.equal(out.length, 3, 'one slot per saved part, so later indexes line up');
  assert.equal(out[0].type, 'led');
  assert.equal(out[1], null, `the broken resistor: expected null, got ${JSON.stringify(out[1])}`);
  assertPlaceholder(out[2], 'the op_amp after it');
});

test('a known part that place() cannot build (returns null) is dropped (null slot), not a placeholder', () => {
  // An LED at holes off the board: place() finds no hole and builds nothing.
  const offBoard = { ...led(), holeRefs: [h(99, 'a'), h(98, 'a')] };
  const out = rebuildComponents([battery(), offBoard, resistor()],
    r => (r.holeRefs && r.holeRefs[0].col === 99 ? null : place(r)), knows);
  assert.equal(out.length, 3);
  assert.equal(out[0].type, 'battery');
  assert.equal(out[1], null, `the off-board LED: expected null, got ${JSON.stringify(out[1])}`);
  assert.equal(out[2].type, 'resistor');
  assert.ok(!out.some(c => c && c.unknown && c.type === 'led'), 'no placeholder of a known type');
});

// Decision: with no knows() given, rebuildComponents knows no type, so every
// part it cannot build becomes a placeholder (the behaviour before knows()).
test('with knows() omitted, every part that fails to rebuild becomes a placeholder', () => {
  const out = rebuildComponents([led(), opAmp()], r => (r.type === 'led' ? null : place(r)));
  assert.equal(out.length, 2);
  assertPlaceholder(out[0], 'the unbuilt LED');
  assertPlaceholder(out[1], 'the op_amp');
});

// ── Unknown parts survive a save, issue #3 ────────────────────────────────

test('an op_amp and its wire survive rebuild then serialize, unchanged at index 1 (#3)', () => {
  const records = [resistor(), opAmp(), led()];
  const wires   = [holeWire(h(2, 'tp'), h(1, 'a')), pinToHole(1, 2, h(20, 'a'))];

  const components = rebuildComponents(records, place, knows);
  assertPlaceholder(components[1], 'the op_amp');

  const { savedComponents, savedWires } = roundTrip(records, wires);
  assert.equal(savedComponents.length, 3);
  assert.deepEqual(savedComponents[1], opAmp(), 'the op_amp record, unknown fields and all');
  assert.deepEqual(savedComponents[0], toRecord(components[0]));
  assert.deepEqual(savedComponents[2], toRecord(components[2]));
  assert.equal(savedWires.length, 2);
  assert.ok(savedWires.some(w => JSON.stringify(w) === JSON.stringify(pinToHole(1, 2, h(20, 'a')))),
    `the wire to the op_amp is still there: ${JSON.stringify(savedWires)}`);
});

test('the placeholder is { type, raw, unknown: true, group: null, pins: [], label } (#3)', () => {
  const [p] = rebuildComponents([opAmp()], place, knows);
  assertPlaceholder(p, 'the op_amp');
  assert.equal(p.type, 'op_amp');
  assert.deepEqual(p.raw, opAmp());
  assert.equal(p.group, null);
  assert.deepEqual(p.pins, []);
  assert.equal(p.label, 'U1');
});

test('a wire to the placeholder, or between two placeholders, goes to the unknown list (#3)', () => {
  const splitWires = need('splitWires');
  const components = rebuildComponents([battery(), opAmp(), opAmp(), resistor()], place, knows);
  const plain    = holeWire(h(2, 'tp'), h(1, 'a'));
  const batToRail = pinToHole(0, 0, h(1, 'tp'));
  const toOpAmp  = pinToHole(1, 0, h(20, 'a'));
  const between  = pinToPin(1, 2, 2, 0);
  const batToAmp = pinToPin(0, 1, 2, 1);

  const { known, unknown } = splitWires([plain, toOpAmp, batToRail, between, batToAmp], components);
  assert.deepEqual(known, [plain, batToRail], 'wires between known parts and holes stay known, in order');
  assert.equal(unknown.length, 3, 'wires touching a placeholder are kept aside');
  assert.deepEqual(need('unknownWireRecords')(unknown, components), [toOpAmp, between, batToAmp]);
});

test('a board with no unknown parts splits every wire into the known list (#3)', () => {
  const components = rebuildComponents([battery(), resistor()], place, knows);
  const wires = [pinToHole(0, 0, h(1, 'tp')), holeWire(h(2, 'tp'), h(1, 'a'))];
  const { known, unknown } = need('splitWires')(wires, components);
  assert.deepEqual(known, wires);
  assert.equal(unknown.length, 0);
});

test('deleting a part before the op_amp re-points its kept wire at the op_amp\'s new index (#3)', () => {
  const components = rebuildComponents([resistor(), opAmp(), led()], place, knows);
  const { unknown } = need('splitWires')([pinToHole(1, 2, h(20, 'a'))], components);
  const afterDelete = components.slice(1);   // R1 deleted: the op_amp is now at 0
  assert.deepEqual(need('unknownWireRecords')(unknown, afterDelete), [{ ...pinToHole(1, 2, h(20, 'a')), startCompIdx: 0 }]);
  assert.deepEqual(need('recordsFor')(afterDelete, toRecord)[0], opAmp());
});

test('a kept wire whose other part was deleted is dropped with it, as deleteSelected does (#3)', () => {
  const components = rebuildComponents([battery(), opAmp()], place, knows);
  const { unknown } = need('splitWires')([pinToPin(0, 1, 1, 1)], components);
  assert.equal(unknown.length, 1);
  assert.deepEqual(need('unknownWireRecords')(unknown, components.slice(1)), []);
});

test('a kept wire from the op_amp to a known part that failed to rebuild is dropped, not saved with a stale index (#3)', () => {
  // BAT1, the op_amp, then a known resistor that could not be rebuilt: its
  // slot is null (built by hand so this checks only unknownWireRecords).
  const rebuilt = rebuildComponents([battery(), opAmp()], place, knows).concat([null]);
  assertPlaceholder(rebuilt[1], 'the op_amp');
  const toBroken = pinToPin(1, 2, 2, 0);            // op_amp pin 2 -> the broken resistor
  const toHole   = pinToHole(1, 0, h(20, 'a'));     // op_amp pin 0 -> hole a21
  const { unknown } = need('splitWires')([toBroken, toHole], rebuilt);
  // rebuildBoard keeps only the parts it built; the saved indexes are read from that list.
  const components = rebuilt.filter(Boolean);
  const saved = need('unknownWireRecords')(unknown, components);
  assert.deepEqual(saved, [{ ...toHole, startCompIdx: 1 }],
    `only the op_amp -> hole wire is kept: ${JSON.stringify(saved)}`);
});

test('rebuild, split and serialize do not change the records they are given (#3)', () => {
  const records = [resistor(), opAmp(), { type: 'op_amp', foo: 1 }, led()];
  const wires   = [holeWire(h(2, 'tp'), h(1, 'a')), pinToHole(1, 2, h(20, 'a')), pinToPin(1, 0, 2, 0)];
  const before  = JSON.parse(JSON.stringify({ records, wires }));
  roundTrip(records, wires);
  assert.deepEqual({ records, wires }, before);
});

// ── Labels on unknown parts ───────────────────────────────────────────────

test('an unknown part keeps its label reserved: the next U-part is U2, not U1 (#3)', () => {
  const components = rebuildComponents([resistor(), opAmp()], place, knows);
  assertPlaceholder(components[1], 'the op_amp');
  assert.equal(Ids.nextLabel(components, 'op_amp'), 'U2');
  assert.equal(Ids.nextLabel(components, 'mystery_part'), 'U2');
  assert.equal(Ids.nextLabel(components, 'resistor'), 'R2');
});

test('an unlabelled unknown part gets a label on its placeholder, but its saved record stays as it was (#3)', () => {
  const raw = { type: 'op_amp', values: { gain: 10 }, foo: 'bar' };
  const components = rebuildComponents([resistor(), raw], place, knows);
  assertPlaceholder(components[1], 'the op_amp');
  assert.equal(components[1].label, 'U1');
  assert.ok(!('label' in components[1].raw), `raw should stay label-less: ${JSON.stringify(components[1].raw)}`);
  assert.deepEqual(need('recordsFor')(components, toRecord)[1], { type: 'op_amp', values: { gain: 10 }, foo: 'bar' });
});

test('rebuildComponents fills in missing labels on the records it passes to place() (#3)', () => {
  const seen = [];
  rebuildComponents([{ type: 'resistor', holeRefs: [h(1, 'a'), h(5, 'a')] }, resistor()], r => { seen.push(r.label); return place(r); }, knows);
  assert.deepEqual(seen, ['R2', 'R1']);
});

// ── The solver runs with a placeholder on the board ───────────────────────
// runSimulation hands state.components, placeholders included, to analyze().
// 9 V - 470R - LED in series: (9 - 2) / 470 = 14.9 mA.

function seriesWithOpAmp() {
  const records = [
    { type: 'battery',  label: 'BAT1', holeRefs: [h(1, 'tp'), h(1, 'tn')] },
    { type: 'resistor', label: 'R1',   holeRefs: [h(5, 'a'),  h(10, 'a')] },
    opAmp(),
    { type: 'led',      label: 'LED1', holeRefs: [h(15, 'a'), h(10, 'a')] },   // pin0 cathode, pin1 anode
  ];
  const components = rebuildComponents(records, place, knows);
  const wires = [
    { startHole: h(2, 'tp'), endHole: h(5, 'a') },
    { startHole: h(15, 'a'), endHole: h(2, 'tn') },
  ];
  return { components, wires };
}

test('analyze() with a placeholder on the board still lights the LED at 14.9 mA (#3)', () => {
  const { components, wires } = seriesWithOpAmp();
  assertPlaceholder(components[2], 'the op_amp');
  const r = Sim.analyze(components, wires);
  assert.equal(r.status, 'ok');
  assert.equal(r.ledsOn.length, 1);
  assert.ok(r.lines.some(l => l.text.includes('LED ON  (14.9 mA)')), r.lines.map(l => l.text).join(' | '));
});

test('simulationSummary() with a placeholder on the board still reports LED1 ON at 14.9 mA (#3)', () => {
  const { components, wires } = seriesWithOpAmp();
  assertPlaceholder(components[2], 'the op_amp');
  const lines = Sim.simulationSummary(components, wires, (list, c) => c.label);
  assert.ok(lines.some(l => /\bLED1\b.*\bON\b.*\b14\.9 mA\b/.test(l)), lines.join('\n'));
});

// ── Old files without labels, issue #2 ────────────────────────────────────

test('an old file without labels gets them in list order', () => {
  const old = [{ type: 'resistor' }, { type: 'resistor' }, { type: 'led' }];
  const out = assignMissingLabels(old);
  assert.deepEqual(out.map(r => r.label), ['R1', 'R2', 'LED1']);
});

test('backfilling labels keeps the rest of each record', () => {
  const holeRefs = [{ col: 1, row: 'a' }, { col: 5, row: 'a' }];
  const out = assignMissingLabels([{ type: 'resistor', values: { resistance: 220 }, holeRefs }]);
  assert.deepEqual(out[0], { type: 'resistor', values: { resistance: 220 }, holeRefs, label: 'R1' });
});

test('existing labels stay, and a new one does not collide with them', () => {
  const out = assignMissingLabels([{ type: 'resistor', label: 'R5' }, { type: 'resistor' }]);
  assert.deepEqual(out.map(r => r.label), ['R5', 'R6']);
});

test('an unlabelled part before a labelled one does not take its label', () => {
  const out = assignMissingLabels([{ type: 'resistor' }, { type: 'resistor', label: 'R1' }]);
  assert.equal(out[1].label, 'R1');
  assert.notEqual(out[0].label, 'R1');
  assert.match(out[0].label, /^R\d+$/);
});

// rebuildComponents never changes what it is given; this matches it.
test('assignMissingLabels does not change the records it is given', () => {
  const old = [{ type: 'resistor' }, { type: 'led', label: 'LED3' }];
  const copy = JSON.parse(JSON.stringify(old));
  assignMissingLabels(old);
  assert.deepEqual(old, copy);
});

test('a file with no components list backfills to an empty list', () => {
  assert.deepEqual(assignMissingLabels(undefined), []);
});
