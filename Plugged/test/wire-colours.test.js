// Fixed wire colours by pin (issue #133): a part may declare
// `wireColors: { <pin>: <24-bit colour> }`, and a wire drawn from (or to) one
// of those pins takes that colour instead of the one picked in the
// wire-colour row. The registry's rules for the field are the wireColors rows
// in test/parts-registry.test.js; this file checks the real parts. What the
// wire looks like on the board is e2e/bench-supply-two-channel.spec.js.
//
// Shapes these tests assume (stated so the builder matches them):
// - The field is `wireColors` on the part definition, an object keyed by pin
//   name, each value an integer 0..0xffffff (the THREE colour app.js uses).
// - The bench supply (pins pos, com, neg, com2): CH1 + (pos) red 0xef4444,
//   CH1 − (com) black 0x000000, CH2 + (com2) white 0xffffff, CH2 − (neg)
//   blue 0x2563eb (Aarmen's colours).
// - The multimeter keeps the probe colours app.js's probeColor hard-codes
//   today (#108): red probe 0xef4444, black probe 0x000000.
// - No other part declares wireColors yet, so every other wire keeps the
//   picked colour.

const assert = require('node:assert');
const Parts  = require('../circuit3d/js/parts');

const RED   = 0xef4444;
const BLACK = 0x000000;
const WHITE = 0xffffff;
const BLUE  = 0x2563eb;

const hex = c => (typeof c === 'number' ? '0x' + c.toString(16).padStart(6, '0') : String(c));
const shown = m => m && Object.fromEntries(Object.entries(m).map(([k, v]) => [k, hex(v)]));

test('the bench supply\'s wires are CH1 + red, CH1 − black, CH2 + white, CH2 − blue', () => {
  const def = Parts.get('bench_supply');
  assert.ok(def, 'bench_supply is registered');
  assert.deepStrictEqual(shown(def.wireColors), shown({ pos: RED, com: BLACK, com2: WHITE, neg: BLUE }),
    'bench_supply.wireColors maps pos → red, com → black, com2 → white, neg → blue');
  assert.deepStrictEqual(Object.keys(def.wireColors).sort(), [...def.pins].sort(), 'every post has a colour');
});

test('the multimeter\'s probe wires stay red and black, now declared as its wireColors', () => {
  const def = Parts.get('multimeter');
  assert.ok(def, 'multimeter is registered');
  assert.deepStrictEqual(shown(def.wireColors), shown({ red: RED, black: BLACK }),
    'multimeter.wireColors maps red → red, black → black');
});

// Pin (passes today): only the two parts above colour their wires.
test('no other part declares wireColors', () => {
  const others = Parts.all().filter(d => d.wireColors !== undefined && !['bench_supply', 'multimeter'].includes(d.type));
  assert.deepStrictEqual(others.map(d => d.type), [], 'only bench_supply and multimeter set wireColors');
});
