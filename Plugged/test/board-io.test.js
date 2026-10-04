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
  // ledsOn is gone (#26): one "LED ON" line says the one LED is lit.
  assert.equal(r.lines.filter(l => l.text.startsWith('  💡 LED ON')).length, 1, r.lines.map(l => l.text).join(' | '));
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

// ── Pin names in the save format, issue #24 ───────────────────────────────
// docs/API-CONTRACT.md → "Placed-part record": a registry part's holeRefs
// each carry their pin name ({ pin: 'lead1', col, row }), and a wire end on
// a registry part names its pin (startPin / endPin) next to the index.
// Loading matches by name, and falls back to the index only when the name
// is missing. The LED joined in #25 (pins cathode, anode); the battery
// ('0', '1'), buzzer and button (lead1, lead2) join in #26.
//
// Pure helpers board-io.js adds (app.js's serializeBoard / wireRecords /
// rebuildBoard call them):
//   saveHoleRefs(comp)            → [{ pin, col, row }] in pin order for a registry
//                                   part; comp.holeRefs as-is (no `pin`) otherwise;
//                                   null when the part is off the board
//   loadHoleRefs(record)          → [{ col, row }] in the part's pin order: a named
//                                   ref by name, an unnamed one by its index
//   pinName(comp, idx)            → the registry pin's name, or undefined
//   pinIndex(comp, name, idx)     → the index of pin `name` on comp; `idx` when
//                                   name is missing (a file from before names)
//   wireRecord(wire, components)  → { startHole, endHole, startCompIdx, startPinIdx,
//                                   endCompIdx, endPinIdx } plus startPin / endPin
//                                   for an end on a registry part (no colour)

// A placed part as App.place* leaves it in state.components (no 3D here).
function runtime(type, label, holeRefs, values) {
  return { type, label, values: values || {}, holeRefs, pins: holeRefs ? holeRefs.map(() => ({})) : [{}, {}] };
}
// A drawn wire as App.finishWire records it.
function drawn(startHole, endHole, startComp, startPinIdx, endComp, endPinIdx) {
  return { startHole, endHole, startComp: startComp || null, startPinIdx: startPinIdx ?? -1,
           endComp: endComp || null, endPinIdx: endPinIdx ?? -1 };
}
// place() for rebuildComponents, the way rebuildBoard will do it: a saved
// part's holes are read through loadHoleRefs, so they come back in pin order.
function placeByName(r) {
  if (!KNOWN.has(r.type)) return null;
  const holeRefs = r.holeRefs ? need('loadHoleRefs')(r) : null;
  return runtime(r.type, r.label, holeRefs, r.values);
}
const cr = ref => (ref ? { col: ref.col, row: ref.row } : ref);

test('saving a resistor writes each hole with its pin name, lead1 then lead2 (#24)', () => {
  const r1 = runtime('resistor', 'R1', [h(1, 'a'), h(5, 'a')], { resistance: 470 });
  assert.deepStrictEqual(need('saveHoleRefs')(r1), [{ pin: 'lead1', col: 1, row: 'a' }, { pin: 'lead2', col: 5, row: 'a' }]);
});

test('an LED saves each hole with its pin name, cathode then anode (#25); a battery saves null (#24)', () => {
  const led1 = runtime('led', 'LED1', [h(9, 'a'), h(8, 'a')]);
  const saved = need('saveHoleRefs')(led1);
  assert.deepStrictEqual(saved, [{ pin: 'cathode', col: 9, row: 'a' }, { pin: 'anode', col: 8, row: 'a' }]);
  assert.equal(need('saveHoleRefs')(runtime('battery', 'BAT1', null)), null);
});

test('a wire end on a part pin saves its name next to the index, the battery\'s too since #26; hole ends save none (#24, #25, #26)', () => {
  const bat = runtime('battery', 'BAT1', null);
  const r1  = runtime('resistor', 'R1', [h(1, 'a'), h(5, 'a')]);
  const led1 = runtime('led', 'LED1', [h(9, 'a'), h(5, 'b')]);
  const comps = [bat, r1, led1];
  const wireRecord = need('wireRecord');

  // The AI's "BAT1.0 → R1.1": two off-hole ends.
  const aiWire = wireRecord(drawn(null, null, bat, 0, r1, 1), comps);
  assert.equal(aiWire.endCompIdx, 1);
  assert.equal(aiWire.endPinIdx, 1);
  assert.equal(aiWire.endPin, 'lead2', `the resistor end is named: ${JSON.stringify(aiWire)}`);
  // #26: the battery is a registry part (pins '0', '1'), so its end is named too.
  assert.equal(aiWire.startPin, '0', `a battery end names its pin: ${JSON.stringify(aiWire)}`);
  assert.equal(aiWire.startPinIdx, 0);

  // Drawn by hand from R1's first pin sphere (hole a2 and the part) to the rail.
  const hand = wireRecord(drawn(h(1, 'a'), h(1, 'tp'), r1, 0), comps);
  assert.equal(hand.startPin, 'lead1');
  assert.equal(hand.startPinIdx, 0);
  assert.deepStrictEqual(hand.startHole, h(1, 'a'));
  assert.ok(!('endPin' in hand), `a plain hole end has no pin name: ${JSON.stringify(hand)}`);

  // From an LED pin: the LED is a registry part since #25.
  const fromLed = wireRecord(drawn(h(9, 'a'), h(9, 'tn'), led1, 0), comps);
  assert.equal(fromLed.startPin, 'cathode', `an LED end is named: ${JSON.stringify(fromLed)}`);
  assert.equal(fromLed.startPinIdx, 0);

  // Hole to hole.
  const plain = wireRecord(drawn(h(2, 'tp'), h(1, 'b')), comps);
  assert.deepStrictEqual(plain, { startHole: h(2, 'tp'), endHole: h(1, 'b'), startCompIdx: -1, startPinIdx: -1,
                                  endCompIdx: -1, endPinIdx: -1 });
});

test('save then reload keeps the pin names: the second save is the same as the first (#24)', () => {
  const bat = runtime('battery', 'BAT1', null, { voltage: 9 });
  const r1  = runtime('resistor', 'R1', [h(1, 'a'), h(5, 'a')], { resistance: 470 });
  const comps = [bat, r1];
  const wires = [drawn(null, null, bat, 0, r1, 1), drawn(h(1, 'a'), h(1, 'tp'), r1, 0)];
  const save = (cs, ws) => JSON.parse(JSON.stringify({
    components: cs.map(c => ({ type: c.type, label: c.label, values: c.values, holeRefs: need('saveHoleRefs')(c) })),
    wires: ws.map(w => need('wireRecord')(w, cs)),
  }));

  const first = save(comps, wires);
  assert.deepStrictEqual(first.components[1].holeRefs, [{ pin: 'lead1', col: 1, row: 'a' }, { pin: 'lead2', col: 5, row: 'a' }]);
  assert.equal(first.wires[0].endPin, 'lead2');
  assert.equal(first.wires[1].startPin, 'lead1');

  // Reload: parts through placeByName, wire ends through pinIndex.
  const back = rebuildComponents(first.components, placeByName, knows);
  const pinIndex = need('pinIndex');
  const rewired = first.wires.map(w => drawn(w.startHole, w.endHole,
    w.startCompIdx >= 0 ? back[w.startCompIdx] : null, w.startCompIdx >= 0 ? pinIndex(back[w.startCompIdx], w.startPin, w.startPinIdx) : -1,
    w.endCompIdx >= 0 ? back[w.endCompIdx] : null, w.endCompIdx >= 0 ? pinIndex(back[w.endCompIdx], w.endPin, w.endPinIdx) : -1));
  assert.deepStrictEqual(save(back, rewired), first);
});

test('pinName and pinIndex: names for registry pins, the index when a file has no name (#24)', () => {
  const r1 = runtime('resistor', 'R1', [h(1, 'a'), h(5, 'a')]);
  const led1 = runtime('led', 'LED1', [h(9, 'a'), h(8, 'a')]);
  assert.equal(need('pinName')(r1, 0), 'lead1');
  assert.equal(need('pinName')(r1, 1), 'lead2');
  assert.equal(need('pinName')(led1, 0), 'cathode', 'the LED names its pins since #25');
  assert.equal(need('pinName')(led1, 1), 'anode');
  assert.equal(need('pinIndex')(led1, 'anode', 0), 1, 'the name wins over a stale index');
  assert.equal(need('pinIndex')(r1, 'lead2', 0), 1, 'the name wins over a stale index');
  assert.equal(need('pinIndex')(r1, 'lead1', 1), 0);
  assert.equal(need('pinIndex')(r1, undefined, 1), 1, 'no name: the saved index');
  assert.equal(need('pinIndex')(led1, undefined, 0), 0);
});

// A file written by a build whose pin list was in another order: the refs
// are saved lead2 first, and the wire indexes are stale, but the names are
// present. Loading must put each hole on its pin and each wire on its pin.
test('a file with the resistor holes in another order, names present, reconnects wires to the right pins (#24)', () => {
  const file = {
    components: [
      { type: 'battery',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null, position: { x: -20, z: 0 } },
      { type: 'resistor', label: 'R1', values: { resistance: 1000 },
        holeRefs: [{ pin: 'lead2', col: 5, row: 'a' }, { pin: 'lead1', col: 1, row: 'a' }] },
    ],
    // BAT1 + → R1.lead2 and BAT1 − → R1.lead1, with the indexes of the old order.
    wires: [
      { startHole: null, endHole: null, startCompIdx: 0, startPinIdx: 0, endCompIdx: 1, endPinIdx: 0, endPin: 'lead2' },
      { startHole: null, endHole: null, startCompIdx: 0, startPinIdx: 1, endCompIdx: 1, endPinIdx: 1, endPin: 'lead1' },
    ],
  };
  need('loadHoleRefs');   // placeByName uses it; a missing export would only show as a dropped part
  const comps = rebuildComponents(file.components, placeByName, knows);
  const r1 = comps[1];
  assert.deepStrictEqual(r1.holeRefs.map(cr), [h(1, 'a'), h(5, 'a')], 'holeRefs come back in pin order: lead1 a2, lead2 a6');

  const pinIndex = need('pinIndex');
  const wires = file.wires.map(w => drawn(null, null, comps[w.startCompIdx], w.startPinIdx,
                                          comps[w.endCompIdx], pinIndex(comps[w.endCompIdx], w.endPin, w.endPinIdx)));
  assert.equal(wires[0].endPinIdx, 1, 'BAT1 + reaches lead2');
  assert.deepStrictEqual(cr(r1.holeRefs[wires[0].endPinIdx]), h(5, 'a'), 'lead2 is hole a6');
  assert.equal(wires[1].endPinIdx, 0, 'BAT1 − reaches lead1');

  // + on lead2: current runs lead2 → lead1, negative in pin order, 9 V / 1 kΩ.
  const r = Sim.analyze(comps, wires);
  assert.equal(r.status, 'ok');
  assert.ok(Math.abs(r.currents[1] * 1000 + 9) < 0.01, `expected −9.0 mA through R1 (lead2 → lead1), got ${(r.currents[1] * 1000).toFixed(2)} mA`);
});

test('an old file with no pin names loads by index, as before (#24)', () => {
  const old = [
    { type: 'battery',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null },
    { type: 'resistor', label: 'R1', values: { resistance: 1000 }, holeRefs: [h(5, 'a'), h(1, 'a')] },   // lead1 a6, lead2 a2
    { type: 'led',      label: 'LED1', values: { color: 'red' }, holeRefs: [h(9, 'b'), h(8, 'b')] },
  ];
  assert.deepStrictEqual(need('loadHoleRefs')(old[1]).map(cr), [h(5, 'a'), h(1, 'a')]);
  assert.deepStrictEqual(need('loadHoleRefs')(old[2]).map(cr), [h(9, 'b'), h(8, 'b')]);
  const comps = rebuildComponents(old, placeByName, knows);
  assert.deepStrictEqual(comps[1].holeRefs.map(cr), [h(5, 'a'), h(1, 'a')]);
  assert.equal(need('pinIndex')(comps[1], undefined, 1), 1, 'wire to pin 1 still reaches pin 1 (a2)');
  assert.equal(need('pinIndex')(comps[1], null, 0), 0);
});

// ── Old files that break a placement rule load flagged, issue #24 ─────────
// docs/API-CONTRACT.md → "Parts.checkPlacement", flagged parts: warn only.
// A registry part loaded from an old file that breaks a rule still loads and
// simulates as saved, is never moved or blocked, and shows one warning line
// in the results and in the AI summary.
//
// How (chosen here, for the builder):
//   flagPlacements(components, wires) in board-io.js runs Parts.checkPlacement
//   for every registry part against the hole map of the board WITHOUT that
//   part (its own legs, and wire ends plugged into its own pins, don't count).
//   A part that fails gets comp.flag = "<label>: <reason>" (e.g. "R1: a
//   resistor's leads must be 3–5 columns apart; a3 to a33 is 30."); a part
//   that passes has no flag. Returns the flag lines. rebuildBoard calls it
//   after a load (and undo, which reloads a snapshot).
//   Sim.analyze adds each part's flag to `lines` (cls 'sim-warn') and to
//   parts[label].warnings; simulationSummary then carries it like any other
//   warning line. The flag is never saved.

// 9 V straight across R1: BAT1 + → b3, BAT1 − → b33, R1 at a3–a33 (30 apart).
function stretchedFile() {
  return {
    components: [
      { type: 'battery',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null, position: { x: -20, z: 0 } },
      { type: 'resistor', label: 'R1', values: { resistance: 470 }, holeRefs: [h(2, 'a'), h(32, 'a')], position: { x: 0, z: 0 } },
    ],
    wires: [
      { startHole: null, endHole: h(2, 'b'),  startCompIdx: 0, startPinIdx: 0, endCompIdx: -1, endPinIdx: -1, color: 0xef4444 },
      { startHole: null, endHole: h(32, 'b'), startCompIdx: 0, startPinIdx: 1, endCompIdx: -1, endPinIdx: -1, color: 0x111111 },
    ],
  };
}

function loadFile(file) {
  need('loadHoleRefs');
  const comps = rebuildComponents(file.components, placeByName, knows);
  const wires = file.wires.map(w => drawn(w.startHole, w.endHole,
    w.startCompIdx >= 0 ? comps[w.startCompIdx] : null, w.startPinIdx,
    w.endCompIdx >= 0 ? comps[w.endCompIdx] : null, w.endPinIdx));
  return { comps, wires };
}

const isStretchWarning = s => typeof s === 'string' && /\bR1\b/.test(s) && s.includes('3–5') && /\b30\b/.test(s);

test('an old file with a resistor 30 columns wide loads flagged, not moved or dropped (#24)', () => {
  const { comps, wires } = loadFile(stretchedFile());
  assert.equal(comps.length, 2);
  assert.equal(comps[1].type, 'resistor', 'the stretched resistor still loads');
  const lines = need('flagPlacements')(comps, wires);
  assert.equal(lines.length, 1, `one warning line: ${JSON.stringify(lines)}`);
  assert.ok(isStretchWarning(lines[0]), `the line names R1, the allowed 3–5 and the 30 it is: "${lines[0]}"`);
  assert.equal(comps[1].flag, lines[0], 'the flag rides on the part');
  assert.deepStrictEqual(comps[1].holeRefs.map(cr), [h(2, 'a'), h(32, 'a')], 'never auto-fixed');
  assert.deepStrictEqual(need('saveHoleRefs')(comps[1]), [{ pin: 'lead1', col: 2, row: 'a' }, { pin: 'lead2', col: 32, row: 'a' }],
    'saving keeps it as it is');
});

test('the flagged resistor still simulates, and its warning is in the results and the AI summary (#24)', () => {
  const { comps, wires } = loadFile(stretchedFile());
  need('flagPlacements')(comps, wires);
  const r = Sim.analyze(comps, wires);
  assert.equal(r.status, 'ok');
  assert.ok(r.parts.R1, 'R1 has a result');
  assert.ok(Math.abs(r.parts.R1.m.current - 19.15) < 0.05, `9 V / 470 Ω ≈ 19.1 mA, got ${r.parts.R1.m.current}`);
  const line = r.lines.find(l => isStretchWarning(l.text));
  assert.ok(line, `a results line warns about R1: ${r.lines.map(l => l.text).join(' | ')}`);
  assert.equal(line.cls, 'sim-warn');
  assert.ok(r.parts.R1.warnings.some(isStretchWarning), `parts.R1.warnings: ${JSON.stringify(r.parts.R1.warnings)}`);
  const summary = Sim.simulationSummary(comps, wires, (list, c) => c.label);
  assert.ok(summary.some(isStretchWarning), `simulationSummary:\n${summary.join('\n')}`);
});

// The part being checked must not see itself: its own legs are in the map,
// and so is the end of a wire drawn from its own pin (a hand-drawn wire from
// a pin sphere records the part's hole and the part). Neither is a clash.
test('a valid file flags nothing: a part never clashes with its own legs or wires on its own pins (#24)', () => {
  const file = {
    components: [
      { type: 'battery',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null },
      { type: 'resistor', label: 'R1', values: { resistance: 470 }, holeRefs: [{ pin: 'lead1', col: 2, row: 'a' }, { pin: 'lead2', col: 6, row: 'a' }] },
    ],
    wires: [
      { startHole: null, endHole: h(2, 'tp'), startCompIdx: 0, startPinIdx: 0, endCompIdx: -1, endPinIdx: -1 },
      { startHole: h(2, 'a'), endHole: h(3, 'tp'), startCompIdx: 1, startPinIdx: 0, startPin: 'lead1', endCompIdx: -1, endPinIdx: -1 },
      { startHole: h(6, 'b'), endHole: h(6, 'tn'), startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1 },
      { startHole: null, endHole: h(7, 'tn'), startCompIdx: 0, startPinIdx: 1, endCompIdx: -1, endPinIdx: -1 },
    ],
  };
  const { comps, wires } = loadFile(file);
  assert.deepStrictEqual(need('flagPlacements')(comps, wires), []);
  assert.ok(!comps[1].flag, `R1 should carry no flag, got "${comps[1].flag}"`);
  const r = Sim.analyze(comps, wires);
  assert.ok(!r.lines.some(l => /\bR1\b/.test(l.text) && l.cls === 'sim-warn'), r.lines.map(l => l.text).join(' | '));
});

// ── Old saved LEDs, issue #25 ─────────────────────────────────────────────
// The LED moved into the registry. A file saved by the build before #25 has
// its holes by index (pin 0 cathode, pin 1 anode) and its values as that
// build's componentValues wrote them: { color, forwardVoltage,
// thresholdCurrent, maxCurrent }, or just { color } from older builds and
// AI actions. It must load with the same colour on the same pins and
// simulate to the same current.
//
// The one-LED recipe layout (test/fixtures/recipes.js ONE_LED), one lead per
// hole: R1 b2–b6, LED1 cathode c8 / anode c6, tp_3 → a2, a8 → tn_8, and the
// battery on the rails at column 63.
function oldLedFile(ledValues) {
  return {
    components: [
      { type: 'battery',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null, position: { x: 15.8, z: 0 } },
      { type: 'resistor', label: 'R1', values: { resistance: 470 }, holeRefs: [h(1, 'b'), h(5, 'b')], position: { x: 0, z: 0 } },
      { type: 'led',      label: 'LED1', values: ledValues, holeRefs: [h(7, 'c'), h(5, 'c')], position: { x: 0, z: 0 } },
    ],
    wires: [
      { startHole: null, endHole: h(62, 'tp'), startCompIdx: 0, startPinIdx: 0, endCompIdx: -1, endPinIdx: -1, color: 0xef4444 },
      { startHole: null, endHole: h(62, 'tn'), startCompIdx: 0, startPinIdx: 1, endCompIdx: -1, endPinIdx: -1, color: 0x111111 },
      { startHole: h(2, 'tp'), endHole: h(1, 'a'), startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 0xef4444 },
      { startHole: h(7, 'a'), endHole: h(7, 'tn'), startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 0x111111 },
    ],
  };
}

// Today's numbers, 9 V through 470 Ω.
const OLD_LED_MA = { red: 14.8904, yellow: 14.6777, green: 14.4650, blue: 12.3378, white: 11.9124 };
const OLD_LED_VF = { red: 2.0, yellow: 2.1, green: 2.2, blue: 3.2, white: 3.4 };

test('an LED saved before #25 (holes by index, full values) loads on the same pins and lights at today\'s current (#25)', () => {
  for (const [color, want] of Object.entries(OLD_LED_MA)) {
    const values = { color, forwardVoltage: OLD_LED_VF[color], thresholdCurrent: 0.001, maxCurrent: 0.020 };
    const file = oldLedFile(values);
    assert.deepStrictEqual(need('loadHoleRefs')(file.components[2]).map(cr), [h(7, 'c'), h(5, 'c')], 'cathode c8, anode c6');
    const { comps, wires } = loadFile(file);
    assert.deepStrictEqual(need('flagPlacements')(comps, wires), [], `${color}: a valid old file flags nothing`);

    const r = Sim.analyze(comps, wires);
    assert.equal(r.status, 'ok');
    const got = -r.currents[2] * 1000;
    assert.ok(Math.abs(got - want) < 0.01, `${color}: expected ${want} mA, got ${got}`);
    assert.ok(r.parts.LED1, `${color}: parts.LED1; got ${JSON.stringify(Object.keys(r.parts))}`);
    assert.equal(r.parts.LED1.r.values.color, color);
    assert.equal(r.parts.LED1.m.on, true);
    assert.ok(Math.abs(r.parts.LED1.m.current - want) < 0.01, `${color}: parts.LED1.m.current ${r.parts.LED1.m.current}`);
  }
});

test('an LED saved with only its colour ({ color: "blue" }) simulates as a blue LED, 12.3 mA (#25)', () => {
  const { comps, wires } = loadFile(oldLedFile({ color: 'blue' }));
  const r = Sim.analyze(comps, wires);
  assert.ok(r.lines.some(l => l.text === '  💡 LED ON  (12.3 mA)'), r.lines.map(l => l.text).join(' | '));
  assert.ok(r.parts.LED1, `parts.LED1; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.equal(r.parts.LED1.r.values.color, 'blue');
  assert.equal(r.parts.LED1.r.values.vf, 3.2);
});

test('an old LED saves back with pin names, and reloads the same (#25)', () => {
  const { comps } = loadFile(oldLedFile({ color: 'green', forwardVoltage: 2.2, thresholdCurrent: 0.001, maxCurrent: 0.020 }));
  const saved = need('saveHoleRefs')(comps[2]);
  assert.deepStrictEqual(saved, [{ pin: 'cathode', col: 7, row: 'c' }, { pin: 'anode', col: 5, row: 'c' }]);
  assert.deepStrictEqual(need('loadHoleRefs')({ type: 'led', holeRefs: saved }).map(cr), [h(7, 'c'), h(5, 'c')]);
});

// The old stacked AI build: R1 a2–a6 and the LED at a8/a6, with the rail
// wires in a2 and a8. Files saved from it still exist. They load flagged
// (warn only), never moved or dropped, and the LED still lights.
test('an old file with the stacked LED build loads with LED1 flagged, and the LED still lights at 14.9 mA (#25)', () => {
  const file = {
    components: [
      { type: 'battery',  label: 'BAT1', values: { voltage: 9 }, holeRefs: null, position: { x: 15.8, z: 0 } },
      { type: 'resistor', label: 'R1', values: { resistance: 470 }, holeRefs: [h(1, 'a'), h(5, 'a')] },
      { type: 'led',      label: 'LED1', values: { color: 'red', forwardVoltage: 2.0, thresholdCurrent: 0.001, maxCurrent: 0.020 },
        holeRefs: [h(7, 'a'), h(5, 'a')] },
    ],
    wires: [
      { startHole: null, endHole: h(1, 'tp'), startCompIdx: 0, startPinIdx: 0, endCompIdx: -1, endPinIdx: -1 },
      { startHole: null, endHole: h(7, 'tn'), startCompIdx: 0, startPinIdx: 1, endCompIdx: -1, endPinIdx: -1 },
      { startHole: h(1, 'tp'), endHole: h(1, 'a'), startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1 },
      { startHole: h(7, 'a'), endHole: h(7, 'tn'), startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1 },
    ],
  };
  const { comps, wires } = loadFile(file);
  assert.equal(comps.length, 3);
  const lines = need('flagPlacements')(comps, wires);
  const ledFlag = lines.find(l => /^LED1: /.test(l));
  assert.ok(ledFlag, `LED1 should be flagged: ${JSON.stringify(lines)}`);
  assert.equal(comps[2].flag, ledFlag);
  assert.deepStrictEqual(comps[2].holeRefs.map(cr), [h(7, 'a'), h(5, 'a')], 'never auto-fixed');

  const r = Sim.analyze(comps, wires);
  assert.ok(r.lines.some(l => l.text === '  💡 LED ON  (14.9 mA)'), r.lines.map(l => l.text).join(' | '));
  assert.ok(r.lines.some(l => l.text === '  ⚠ ' + ledFlag && l.cls === 'sim-warn'), r.lines.map(l => l.text).join(' | '));
  assert.ok(r.parts.LED1 && r.parts.LED1.warnings.includes(ledFlag), `parts.LED1.warnings: ${JSON.stringify(r.parts.LED1 && r.parts.LED1.warnings)}`);
});

// ── Old saved batteries, buzzers and buttons, issue #26 ───────────────────
// The battery, buzzer and button moved into the registry: battery pins
// '0' (+) / '1' (−), buzzer and button pins lead1 / lead2. Files saved by the
// build before #26 have their holes by index (no pin names) and their values
// as that build's componentValues wrote them from Sim.PROPS: a battery
// { voltage }, a buzzer { resistance: 42, thresholdCurrent: 0.001 }, a
// button {} (its pressed state was never saved). They must load on the same
// pins and simulate the same. A pressed button is the record's
// controls.pressed (momentary, never saved).

// BAT1 → tp_3 → a4, R1 b4–b8, BZ1 c8–c10 (index-only), a10 → tn_10.
// I = 9 / (470 + 42) = 17.6 mA.
function oldBuzzerFile(batValues) {
  return {
    components: [
      { type: 'battery',  label: 'BAT1', values: batValues || { voltage: 9 }, holeRefs: null, position: { x: 15.8, z: 0 } },
      { type: 'resistor', label: 'R1', values: { resistance: 470 }, holeRefs: [h(3, 'b'), h(7, 'b')], position: { x: 0, z: 0 } },
      { type: 'buzzer',   label: 'BZ1', values: { resistance: 42, thresholdCurrent: 0.001 }, holeRefs: [h(7, 'c'), h(9, 'c')], position: { x: 0, z: 0 } },
    ],
    wires: [
      { startHole: null, endHole: h(62, 'tp'), startCompIdx: 0, startPinIdx: 0, endCompIdx: -1, endPinIdx: -1, color: 0xef4444 },
      { startHole: null, endHole: h(62, 'tn'), startCompIdx: 0, startPinIdx: 1, endCompIdx: -1, endPinIdx: -1, color: 0x111111 },
      { startHole: h(2, 'tp'), endHole: h(3, 'a'), startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 0xef4444 },
      { startHole: h(9, 'a'), endHole: h(9, 'tn'), startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 0x111111 },
    ],
  };
}

test('an old buzzer (holes by index, today\'s values) loads on the same pins, flags nothing, and sounds at 17.6 mA (#26)', () => {
  const file = oldBuzzerFile();
  assert.deepStrictEqual(need('loadHoleRefs')(file.components[2]).map(cr), [h(7, 'c'), h(9, 'c')], 'lead1 c8, lead2 c10');
  const { comps, wires } = loadFile(file);
  assert.deepStrictEqual(need('flagPlacements')(comps, wires), [], 'a valid old file flags nothing');
  const r = Sim.analyze(comps, wires);
  assert.equal(r.status, 'ok');
  assert.ok(r.parts.BZ1, `parts.BZ1; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.equal(r.parts.BZ1.m.sounding, true);
  assert.ok(Math.abs(r.parts.BZ1.m.current - 17.578) < 0.01, `9 V / 512 Ω: ${r.parts.BZ1.m.current}`);
  assert.ok(r.lines.some(l => l.text === '  🔔 BUZZER ON  (17.6 mA)' && l.cls === 'sim-on'), r.lines.map(l => l.text).join(' | '));
  assert.ok(r.parts.BAT1, 'parts.BAT1: the battery is a registry part');
});

test('an old battery saved with { voltage: 6 } and a position simulates at 6 V: "Battery 1: 6V", 11.7 mA (#26)', () => {
  const { comps, wires } = loadFile(oldBuzzerFile({ voltage: 6 }));
  const r = Sim.analyze(comps, wires);
  assert.ok(r.lines.some(l => l.text === 'Battery 1: 6V' && l.cls === 'sim-info'), r.lines.map(l => l.text).join(' | '));
  assert.ok(r.parts.BAT1, `parts.BAT1; got ${JSON.stringify(Object.keys(r.parts))}`);
  assert.equal(r.parts.BAT1.r.values.voltage, 6);
  assert.ok(Math.abs(r.parts.BZ1.m.current - 11.719) < 0.01, `6 V / 512 Ω: ${r.parts.BZ1.m.current}`);
});

test('a buzzer and a button save each hole with its pin name, lead1 then lead2; wire ends on them are named (#26)', () => {
  const bz = runtime('buzzer', 'BZ1', [h(7, 'c'), h(9, 'c')]);
  const sw = runtime('button', 'SW1', [h(11, 'b'), h(14, 'b')]);
  assert.deepStrictEqual(need('saveHoleRefs')(bz), [{ pin: 'lead1', col: 7, row: 'c' }, { pin: 'lead2', col: 9, row: 'c' }]);
  assert.deepStrictEqual(need('saveHoleRefs')(sw), [{ pin: 'lead1', col: 11, row: 'b' }, { pin: 'lead2', col: 14, row: 'b' }]);
  const bat = runtime('battery', 'BAT1', null);
  assert.equal(need('saveHoleRefs')(bat), null, 'the battery is off the board');
  assert.equal(need('pinName')(bat, 1), '1');
  assert.equal(need('pinIndex')(bat, '1', 0), 1, 'the name wins over a stale index');
  const rec = need('wireRecord')(drawn(null, h(14, 'a'), bat, 1, sw, 1), [bat, sw]);
  assert.equal(rec.startPin, '1');
  assert.equal(rec.endPin, 'lead2');
});

// demo.sparky, the "Try it out" circuit: saved before labels and pin names
// (ids battery_0 … button_3, holes by index). BAT1 → tp_4 → a3, R1 b3–b7,
// LED1 cathode c9 / anode c7, a9 → a12, SW1 b12–b15, a15 → tn_15.
test('demo.sparky loads with no flag; released it is open, and pressing SW1 lights LED1 at 14.9 mA (#26)', () => {
  const demo = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'demo.sparky'), 'utf8'));
  const { comps, wires } = loadFile(demo);
  assert.deepStrictEqual(comps.map(c => c.label), ['BAT1', 'R1', 'LED1', 'SW1']);
  assert.deepStrictEqual(need('flagPlacements')(comps, wires), [], 'the demo breaks no placement rule');

  const sw1 = comps[3];
  sw1.controls = { pressed: false };
  const open = Sim.analyze(comps, wires);
  assert.ok(open.lines.some(l => l.text.includes('Circuit open')), open.lines.map(l => l.text).join(' | '));
  assert.ok(open.parts.SW1, `parts.SW1; got ${JSON.stringify(Object.keys(open.parts))}`);

  sw1.controls = { pressed: true };   // what App.toggleButton sets
  const lit = Sim.analyze(comps, wires);
  assert.ok(lit.lines.some(l => l.text === 'Button 1: 🟢 CLOSED (current flowing)'), lit.lines.map(l => l.text).join(' | '));
  assert.ok(lit.lines.some(l => l.text === '  💡 LED ON  (14.9 mA)'), lit.lines.map(l => l.text).join(' | '));
  assert.ok(Math.abs(lit.parts.LED1.m.current - 14.89) < 0.01, `LED1 ${lit.parts.LED1.m.current}`);
  assert.ok(Math.abs(Math.abs(lit.currents[3]) * 1000 - 14.89) < 0.01, `SW1 carries the loop current: ${lit.currents[3]}`);
});
