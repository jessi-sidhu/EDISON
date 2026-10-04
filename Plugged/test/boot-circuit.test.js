// Tests for SparkyStorage.pickBootCircuit: which circuit the editor opens when
// it boots (issue #63). A circuit handed over by the dashboard wins; failing
// that, the circuit this tab already had open (so a reload reopens it instead
// of starting another "Untitled (N)"); failing that, none (a new circuit).

const assert = require('node:assert');
const S = require('../circuit3d/js/storage.js');

// A multi-part circuit as autosave stores it: battery, resistor, two LEDs.
const SERIES = {
  id: 'c-series',
  name: 'Two LEDs',
  thumbnail: 'data:image/jpeg;base64,xx',
  updatedAt: '2026-10-03T10:00:00.000Z',
  components: [
    { type: 'battery',  label: 'BAT1', values: {}, holeRefs: null, position: { x: 15.8, z: 0 } },
    { type: 'resistor', label: 'R1', values: { resistance: 220 }, holeRefs: [{ col: 2, row: 'b' }, { col: 6, row: 'b' }], position: { x: 0, z: 0 } },
    { type: 'led',      label: 'LED1', values: {}, holeRefs: [{ col: 8, row: 'c' }, { col: 6, row: 'c' }], position: { x: 0, z: 0 } },
    { type: 'led',      label: 'LED2', values: {}, holeRefs: [{ col: 10, row: 'c' }, { col: 8, row: 'd' }], position: { x: 0, z: 0 } },
  ],
  wires: [
    { startHole: null, endHole: { col: 3, row: 'tp' }, startCompIdx: 0, startPinIdx: 0, endCompIdx: -1, endPinIdx: -1, color: 15680580 },
    { startHole: null, endHole: { col: 15, row: 'tn' }, startCompIdx: 0, startPinIdx: 1, endCompIdx: -1, endPinIdx: -1, color: 1118481 },
    { startHole: { col: 2, row: 'tp' }, endHole: { col: 2, row: 'a' }, startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 15680580 },
    { startHole: { col: 10, row: 'a' }, endHole: { col: 10, row: 'tn' }, startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 1118481 },
  ],
};

const OTHER = { id: 'c-other', name: 'Other', components: [], wires: [] };

// Saved before circuits kept their parts at the top level.
const LEGACY = {
  id: 'c-legacy',
  name: 'Old one',
  circuit: { components: SERIES.components.slice(0, 2), wires: SERIES.wires.slice(0, 1) },
};

const projects = [OTHER, SERIES, LEGACY];

test('the open-circuit key is sparky_open_circuit', () => {
  assert.equal(S.OPEN_CIRCUIT_KEY, 'sparky_open_circuit');
});

test('a circuit handed over by the dashboard is opened, as parsed', () => {
  const pending = { id: 'c-other', name: 'Other', components: [], wires: [] };
  assert.deepEqual(S.pickBootCircuit({ pending: JSON.stringify(pending), openId: null, projects }), pending);
});

test('the dashboard hand-over beats the circuit this tab had open', () => {
  const pending = { id: 'c-other', name: 'Other', components: [], wires: [] };
  const got = S.pickBootCircuit({ pending: JSON.stringify(pending), openId: 'c-series', projects });
  assert.deepEqual(got, pending);
});

test('on a reload, the circuit this tab had open is reopened with its parts and wires', () => {
  const got = S.pickBootCircuit({ pending: null, openId: 'c-series', projects });
  assert.deepEqual(got, { id: 'c-series', name: 'Two LEDs', components: SERIES.components, wires: SERIES.wires });
});

test('a hand-over that is not valid JSON falls through to the open circuit', () => {
  const got = S.pickBootCircuit({ pending: '{not json', openId: 'c-series', projects });
  assert.deepEqual(got, { id: 'c-series', name: 'Two LEDs', components: SERIES.components, wires: SERIES.wires });
});

test('a bad hand-over and no open circuit opens nothing (a new circuit)', () => {
  assert.equal(S.pickBootCircuit({ pending: '{not json', openId: null, projects }), null);
});

test('an open circuit that is no longer saved opens nothing', () => {
  assert.equal(S.pickBootCircuit({ pending: null, openId: 'deleted-id', projects }), null);
});

test('nothing handed over and nothing open opens nothing', () => {
  assert.equal(S.pickBootCircuit({ pending: null, openId: null, projects }), null);
  assert.equal(S.pickBootCircuit({ pending: null, openId: null, projects: [] }), null);
});

test('an open circuit saved in the old shape (parts under .circuit) is reopened with those parts', () => {
  const got = S.pickBootCircuit({ pending: null, openId: 'c-legacy', projects });
  assert.deepEqual(got, { id: 'c-legacy', name: 'Old one', components: LEGACY.circuit.components, wires: LEGACY.circuit.wires });
});

test('an open circuit with no parts at all is reopened empty, not dropped', () => {
  const bare = { id: 'c-bare', name: 'Bare' };
  const got = S.pickBootCircuit({ pending: null, openId: 'c-bare', projects: [bare] });
  assert.deepEqual(got, { id: 'c-bare', name: 'Bare', components: [], wires: [] });
});
