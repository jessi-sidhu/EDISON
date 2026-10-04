// Tests for the hole map, issue #24: docs/API-CONTRACT.md → "Legs and the
// hole map". One map of the whole board, hole name → what sits in it:
//   'a3'    → { label: 'R1', pin: 'lead1' }    a part's leg
//   'b3'    → { wire: 0, end: 'from' }         a wire end ('from' = start, 'to' = end)
// It is rebuilt from the records after every change and never patched or
// saved. App.holeMap() in the page returns the map for state.components and
// state.wires; the rebuild is the pure board-io.js helper
//   buildHoleMap(components, wires) → Map
// tested here in Node. e2e/hole-map.spec.js checks App.holeMap() equals it
// after place, delete, undo, reload and an AI build in the browser.
//
// Legs come from Parts.legsOf(comp): a registry part's pins by name, a
// legacy part's (LED, battery, buzzer, button) by index as '0', '1' until
// #25/#26. Off-board legs (the battery) and off-board wire ends are not in
// the map.

const assert = require('node:assert');
const IO     = require('../circuit3d/js/board-io.js');
const Parts  = require('../circuit3d/js/parts');

function need(name) {
  assert.equal(typeof IO[name], 'function', `board-io.js must export ${name}()`);
  return IO[name];
}

const h = (col, row) => ({ col, row });

// A placed part as App.place* leaves it in state.components (no 3D here).
function part(type, label, holeRefs, values) {
  return { type, label, values: values || {}, holeRefs, pins: holeRefs ? holeRefs.map(() => ({})) : [{}, {}] };
}
// A drawn wire as App.finishWire records it.
function wire(startHole, endHole, startComp, startPinIdx, endComp, endPinIdx) {
  return { startHole, endHole, startComp: startComp || null, startPinIdx: startPinIdx ?? -1,
           endComp: endComp || null, endPinIdx: endPinIdx ?? -1 };
}

// Map → plain sorted object, for readable deep-equality failures.
const plain = m => {
  assert.ok(m instanceof Map, `expected a Map, got ${Object.prototype.toString.call(m)}`);
  return Object.fromEntries([...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
};

// 9 V → R1 (a3–a7) → LED1 (anode b8, cathode b10) → back to the battery.
function board() {
  const bat  = part('battery', 'BAT1', null, { voltage: 9 });
  const r1   = part('resistor', 'R1', [h(2, 'a'), h(6, 'a')], { resistance: 470 });
  const led1 = part('led', 'LED1', [h(9, 'b'), h(7, 'b')], { color: 'red' });   // cathode b10, anode b8
  const components = [bat, r1, led1];
  const wires = [
    wire(null, h(2, 'tp'), bat, 0),         // BAT1 + → tp_3 (off-board start)
    wire(h(3, 'tp'), h(2, 'c')),            // tp_4 → c3
    wire(h(6, 'c'), h(7, 'c')),             // c7 → c8
    wire(h(9, 'c'), h(9, 'tn')),            // c10 → tn_10
    wire(null, h(9, 'tn'), bat, 1),         // BAT1 − → tn_10 (off-board start)
  ];
  return { components, wires, bat, r1, led1 };
}

test('the hole map holds each leg by label and pin name, and each wire end on a body hole', () => {
  const { components, wires } = board();
  const map = plain(need('buildHoleMap')(components, wires));
  assert.deepStrictEqual(map.a3, { label: 'R1', pin: 'lead1' });
  assert.deepStrictEqual(map.a7, { label: 'R1', pin: 'lead2' });
  assert.deepStrictEqual(map.b10, { label: 'LED1', pin: '0' }, 'legacy LED: pin by index until #25');
  assert.deepStrictEqual(map.b8, { label: 'LED1', pin: '1' });
  assert.deepStrictEqual(map.c3, { wire: 1, end: 'to' });
  assert.deepStrictEqual(map.c7, { wire: 2, end: 'from' });
  assert.deepStrictEqual(map.c8, { wire: 2, end: 'to' });
  assert.deepStrictEqual(map.c10, { wire: 3, end: 'from' });
  assert.ok(!Object.values(map).some(o => o.label === 'BAT1'), `the off-board battery has no holes: ${JSON.stringify(map)}`);
});

test('every part on the board has one leg in the map per pin', () => {
  const { components, wires } = board();
  const map = need('buildHoleMap')(components, wires);
  const legs = label => [...map.values()].filter(o => o.label === label).map(o => o.pin).sort();
  assert.deepStrictEqual(legs('R1'), [...Parts.get('resistor').pins].sort());
  assert.deepStrictEqual(legs('LED1'), ['0', '1']);
  assert.equal(legs('BAT1').length, 0);
});

test('a resistor saved with its holes in the other order still maps each hole to the right pin', () => {
  const r1 = part('resistor', 'R1', [{ pin: 'lead2', col: 6, row: 'a' }, { pin: 'lead1', col: 2, row: 'a' }]);
  const map = plain(need('buildHoleMap')([r1], []));
  assert.deepStrictEqual(map, { a3: { label: 'R1', pin: 'lead1' }, a7: { label: 'R1', pin: 'lead2' } });
});

test('the map is rebuilt, not kept: a fresh Map each call that follows the records, which it never changes', () => {
  const { components, wires } = board();
  const before = JSON.stringify({ components, wires });
  const buildHoleMap = need('buildHoleMap');
  const first = buildHoleMap(components, wires);
  const second = buildHoleMap(components, wires);
  assert.notStrictEqual(first, second, 'a new Map each time');
  assert.deepStrictEqual(plain(first), plain(second));
  assert.equal(JSON.stringify({ components, wires }), before, 'the records are not changed');
});

// The editor's steps, done on plain records the way app.js does them:
//   place  = push a part     delete = drop it and its wires
//   undo   = rebuild the snapshot taken before the change
//   reload = save with saveHoleRefs / wireRecord, JSON, rebuild with loadHoleRefs / pinIndex
// After each step the map equals a fresh rebuild of the board as it now is,
// and after undo and reload it equals the map of the board it came from.

const KNOWN = new Set(['resistor', 'led', 'battery', 'buzzer', 'button']);

function save(components, wires) {
  return JSON.parse(JSON.stringify({
    components: components.map(c => ({ type: c.type, label: c.label, values: c.values, holeRefs: need('saveHoleRefs')(c) })),
    wires: wires.map(w => need('wireRecord')(w, components)),
  }));
}

function load(data) {
  need('loadHoleRefs');
  const components = IO.rebuildComponents(data.components,
    r => (KNOWN.has(r.type) ? part(r.type, r.label, r.holeRefs ? IO.loadHoleRefs(r) : null, r.values) : null),
    t => KNOWN.has(t));
  const end = (hole, ci, name, idx) => {
    const comp = ci >= 0 ? components[ci] : null;
    return [hole, comp, comp ? need('pinIndex')(comp, name, idx) : -1];
  };
  const wires = data.wires.map(w => {
    const [sh, sc, sp] = end(w.startHole, w.startCompIdx, w.startPin, w.startPinIdx);
    const [eh, ec, ep] = end(w.endHole, w.endCompIdx, w.endPin, w.endPinIdx);
    return wire(sh, eh, sc, sp, ec, ep);
  });
  return { components: components.filter(Boolean), wires };
}

test('after place, delete, undo and reload the map equals a fresh rebuild, one leg per pin', () => {
  const buildHoleMap = need('buildHoleMap');
  let { components, wires } = board();
  const expectConsistent = (step, want) => {
    const map = buildHoleMap(components, wires);
    for (const c of components) {
      if (!c.holeRefs) continue;
      const n = [...map.values()].filter(o => o.label === c.label).length;
      assert.equal(n, c.pins.length, `${step}: ${c.label} has ${n} legs in the map, expected ${c.pins.length}`);
    }
    if (want) assert.deepStrictEqual(plain(map), want, `${step}: the map`);
    return plain(map);
  };
  const start = expectConsistent('start');

  // place R2 at d20–d24
  const history = [save(components, wires)];
  const r2 = part('resistor', 'R2', [h(19, 'd'), h(23, 'd')]);
  components = components.concat([r2]);
  const placed = expectConsistent('place');
  assert.deepStrictEqual(placed.d20, { label: 'R2', pin: 'lead1' });

  // delete R1 (no wire names it, so none go with it)
  history.push(save(components, wires));
  const r1 = components.find(c => c.label === 'R1');
  components = components.filter(c => c !== r1);
  wires = wires.filter(w => w.startComp !== r1 && w.endComp !== r1);
  const deleted = expectConsistent('delete');
  assert.equal(deleted.a3, undefined, 'R1\'s holes are free once it is deleted');
  assert.equal(deleted.a7, undefined);

  // undo the delete
  ({ components, wires } = load(history.pop()));
  expectConsistent('undo', placed);

  // reload from a saved file
  ({ components, wires } = load(save(components, wires)));
  expectConsistent('reload', placed);

  // undo the place: back to the start
  ({ components, wires } = load(history.pop()));
  expectConsistent('undo place', start);
});
