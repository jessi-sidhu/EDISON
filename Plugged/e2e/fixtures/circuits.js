// Saved circuits for the dashboard and reload tests (issue #63), in the shape
// the editor's autosave stores them.

// Battery, resistor and two LEDs in series: tp_2 → a2, R1 b2–b6, LED1 anode
// c6 / cathode c8, LED2 anode d8 / cathode c10, a10 → tn_10.
const TWO_LEDS = {
  id: 'c-two-leds',
  name: 'Two LEDs',
  updatedAt: '2026-09-27T10:00:00.000Z',
  components: [
    { type: 'battery',  label: 'BAT1', holeRefs: null, position: { x: 15.8, z: 0 } },
    { type: 'resistor', label: 'R1',   values: { resistance: 220 }, holeRefs: [{ col: 2, row: 'b' }, { col: 6, row: 'b' }], position: { x: 0, z: 0 } },
    { type: 'led',      label: 'LED1', holeRefs: [{ col: 8, row: 'c' }, { col: 6, row: 'c' }], position: { x: 0, z: 0 } },
    { type: 'led',      label: 'LED2', holeRefs: [{ col: 10, row: 'c' }, { col: 8, row: 'd' }], position: { x: 0, z: 0 } },
  ],
  wires: [
    { startHole: null, endHole: { col: 3, row: 'tp' }, startCompIdx: 0, startPinIdx: 0, endCompIdx: -1, endPinIdx: -1, color: 15680580 },
    { startHole: null, endHole: { col: 15, row: 'tn' }, startCompIdx: 0, startPinIdx: 1, endCompIdx: -1, endPinIdx: -1, color: 1118481 },
    { startHole: { col: 2, row: 'tp' }, endHole: { col: 2, row: 'a' }, startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 15680580 },
    { startHole: { col: 10, row: 'a' }, endHole: { col: 10, row: 'tn' }, startCompIdx: -1, startPinIdx: -1, endCompIdx: -1, endPinIdx: -1, color: 1118481 },
  ],
};

// A lone resistor.
const ONE_RESISTOR = {
  id: 'c-one-resistor',
  name: 'Just a resistor',
  updatedAt: '2026-09-26T10:00:00.000Z',
  components: [
    { type: 'resistor', label: 'R1', values: { resistance: 1000 }, holeRefs: [{ col: 20, row: 'b' }, { col: 24, row: 'b' }], position: { x: 0, z: 0 } },
  ],
  wires: [],
};

// What the dashboard hands the editor when a card is opened.
const handOver = c => ({ id: c.id, name: c.name, components: c.components, wires: c.wires });

module.exports = { TWO_LEDS, ONE_RESISTOR, handOver };
