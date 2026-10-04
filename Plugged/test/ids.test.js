// Tests for ids.js: the component names shared by the board export, saved
// files, the AI and the code that applies AI actions.

const assert = require('node:assert');
const Ids = require('../circuit3d/js/ids.js');

const parts = [{ type: 'resistor' }, { type: 'led' }, { type: 'battery' }, { type: 'led' }];

test('componentId counts within the part type', () => {
  assert.equal(Ids.componentId(parts, parts[2]), 'battery_0');
  assert.equal(Ids.componentId(parts, parts[3]), 'led_1');
});

test('a pin reference resolves to the nth part of its type', () => {
  assert.deepEqual(Ids.parsePinRef('battery_0_pin1'), { type: 'battery', n: 0, pin: 1 });
  assert.equal(Ids.parsePinRef('a12'), null);
  assert.equal(Ids.findComponent(parts, 'battery', 0), parts[2]);
  assert.equal(Ids.findComponent(parts, 'battery', 1), null);
});

test('a pin reference accepts a part type with an underscore in it', () => {
  assert.deepEqual(Ids.parsePinRef('op_amp_0_pin2'), { type: 'op_amp', n: 0, pin: 2 });
});

test('power_supply_1_pin0 parses as the second power supply, pin 0', () => {
  assert.deepEqual(Ids.parsePinRef('power_supply_1_pin0'), { type: 'power_supply', n: 1, pin: 0 });
});

test('a label-form reference keeps a named pin as a string', () => {
  assert.deepEqual(Ids.parsePinRef('U1.OUT'), { label: 'U1', pin: 'OUT' });
});

test('a label-form reference turns an all-digit pin into a number', () => {
  assert.deepStrictEqual(Ids.parsePinRef('R2.1'), { label: 'R2', pin: 1 });
});

test('hole addresses and plain words are not pin references', () => {
  for (const s of ['a12', 'j63', 'tp_5', 'bn_12', 'hello']) {
    assert.equal(Ids.parsePinRef(s), null, s);
  }
});

// ── Stable labels (R1, LED1, BAT1…), issue #2 ─────────────────────────────

// Place parts the way App.place* will: each new part takes nextLabel.
function placeAll(types) {
  const list = [];
  for (const type of types) list.push({ type, label: Ids.nextLabel(list, type) });
  return list;
}

test('each part type has its own label prefix', () => {
  assert.deepEqual(Ids.LABEL_PREFIX, { resistor: 'R', led: 'LED', battery: 'BAT', buzzer: 'BZ', button: 'SW' });
});

test('the first part of each type is number 1', () => {
  assert.equal(Ids.nextLabel([], 'resistor'), 'R1');
  assert.equal(Ids.nextLabel([], 'led'), 'LED1');
  assert.equal(Ids.nextLabel([], 'battery'), 'BAT1');
  assert.equal(Ids.nextLabel([], 'buzzer'), 'BZ1');
  assert.equal(Ids.nextLabel([], 'button'), 'SW1');
});

test('an unknown part type gets the U prefix', () => {
  assert.equal(Ids.nextLabel([], 'op_amp'), 'U1');
});

test('two unknown types share the U prefix, so their labels never collide', () => {
  assert.equal(Ids.nextLabel([{ type: 'op_amp', label: 'U1' }], 'capacitor'), 'U2');
});

test('removing R1 leaves R2 as R2', () => {
  const [r1, r2] = placeAll(['resistor', 'resistor']);
  assert.deepEqual([r1.label, r2.label], ['R1', 'R2']);
  const rest = [r2];                                  // R1 deleted
  assert.equal(r2.label, 'R2');
  assert.equal(Ids.findByLabel(rest, 'R2'), r2);
});

test('after R1 is deleted the next resistor is R3, not a reused R1', () => {
  const [, r2] = placeAll(['resistor', 'resistor']);
  assert.equal(Ids.nextLabel([r2], 'resistor'), 'R3');
});

test('findByLabel ignores case', () => {
  const parts = [{ type: 'resistor', label: 'R1' }, { type: 'resistor', label: 'R2' }, { type: 'led', label: 'LED1' }];
  assert.equal(Ids.findByLabel(parts, 'r2'), parts[1]);
  assert.equal(Ids.findByLabel(parts, 'led1'), parts[2]);
});

test('findByLabel finds nothing for a label no part has', () => {
  const parts = [{ type: 'resistor', label: 'R1' }];
  assert.ok(!Ids.findByLabel(parts, 'R9'));
});

test('other types\' labels do not count toward a prefix', () => {
  const parts = [
    { type: 'led', label: 'LED7' }, { type: 'battery', label: 'BAT4' },
    { type: 'buzzer', label: 'BZ2' }, { type: 'button', label: 'SW9' },
  ];
  assert.equal(Ids.nextLabel(parts, 'resistor'), 'R1');
  assert.equal(Ids.nextLabel(parts, 'led'), 'LED8');
  assert.equal(Ids.nextLabel(parts, 'battery'), 'BAT5');
});

test('label numbers compare as numbers, so after R10 comes R11', () => {
  const parts = [{ type: 'resistor', label: 'R9' }, { type: 'resistor', label: 'R10' }];
  assert.equal(Ids.nextLabel(parts, 'resistor'), 'R11');
});

// componentId is the name the AI reads and wires to, so a labelled part goes
// by its label (issue #8). Parts with no label still count by type.
test('componentId is the label when a part has one', () => {
  const parts = [{ type: 'resistor', label: 'R2' }, { type: 'led', label: 'LED1' }, { type: 'resistor', label: 'R3' }];
  assert.equal(Ids.componentId(parts, parts[0]), 'R2');
  assert.equal(Ids.componentId(parts, parts[1]), 'LED1');
  assert.equal(Ids.componentId(parts, parts[2]), 'R3');
});

test('componentId falls back to type_n for a part with no label', () => {
  const parts = [{ type: 'battery', label: 'BAT1' }, { type: 'resistor' }, { type: 'resistor' }];
  assert.equal(Ids.componentId(parts, parts[0]), 'BAT1');
  assert.equal(Ids.componentId(parts, parts[2]), 'resistor_1');
});

// ── One hole-name formula, issue #20 ──────────────────────────────────────
// holeName({ col, row }) is the pure address formula: row, "_" for a rail
// row (tp/tn/bn/bp), then the 1-based column. It is not called formatHole:
// ids.js copies its exports onto window.App after breadboard.js loads, so a
// formatHole export would replace the validating App.formatHole.

const fs   = require('node:fs');
const path = require('node:path');
const JS   = path.join(__dirname, '..', 'circuit3d', 'js');
const readJs = f => fs.readFileSync(path.join(JS, f), 'utf8');

// Fails on an assertion (not a TypeError) while holeName is missing.
function holeName(ref) {
  assert.equal(typeof Ids.holeName, 'function', 'ids.js should export holeName({ col, row })');
  return Ids.holeName(ref);
}

test('holeName writes a body hole as <row><col + 1>: col 13 row e is e14', () => {
  assert.equal(holeName({ col: 13, row: 'e' }), 'e14');
  assert.equal(holeName({ col: 0, row: 'a' }), 'a1');
  assert.equal(holeName({ col: 29, row: 'j' }), 'j30');
});

test('holeName puts an underscore after a rail row: tp_14, bn_14', () => {
  assert.equal(holeName({ col: 13, row: 'tp' }), 'tp_14');
  assert.equal(holeName({ col: 13, row: 'bn' }), 'bn_14');
  assert.equal(holeName({ col: 0, row: 'tn' }), 'tn_1');
  assert.equal(holeName({ col: 0, row: 'bp' }), 'bp_1');
});

test('ids.js does not export formatHole, so it cannot overwrite the validating App.formatHole', () => {
  assert.ok(!('formatHole' in Ids), 'ids.js must not export formatHole (it is Object.assign-ed onto App after breadboard.js)');
});

test('the (col + 1) hole formula is written once across the editor, in ids.js', () => {
  // "(col + 1)" or "(ref.col + 1)" in parentheses: the hole-address formula.
  // interaction.js's "Col ${h.col + 1}" hover label is display text, not a hole name.
  const re = /\(\s*(?:\w+\.)?col\s*\+\s*1\s*\)/g;
  const hits = fs.readdirSync(JS).filter(f => f.endsWith('.js'))
    .map(f => ({ f, n: (readJs(f).match(re) || []).length }))
    .filter(x => x.n > 0);
  const where = hits.map(x => `${x.f} x${x.n}`).join(', ') || 'nowhere';
  assert.equal(hits.reduce((s, x) => s + x.n, 0), 1, '(col + 1) hole formula found in: ' + where);
  assert.equal(hits[0].f, 'ids.js', '(col + 1) hole formula found in: ' + where);
});

test('simulate.js has no holeName of its own and reaches ids.js for it', () => {
  const src = readJs('simulate.js');
  assert.doesNotMatch(src, /function\s+holeName\b/, 'simulate.js still defines its own holeName');
  assert.doesNotMatch(src, /col\s*\+\s*1\b/, 'simulate.js still carries its own (col + 1) formula');
  assert.match(src, /require\(\s*['"]\.\/ids\.js['"]\s*\)/, 'simulate.js should require ./ids.js under Node');
  assert.match(src, /\bholeName\(/, 'simulate.js should still call holeName');
});

test('breadboard.js formatHole keeps its board check and returns App.holeName(ref)', () => {
  const src = readJs('breadboard.js');
  const fn = /function formatHole\s*\([^)]*\)\s*\{[\s\S]*?\n {2}\}/.exec(src);
  assert.ok(fn, 'function formatHole not found in breadboard.js');
  assert.match(fn[0], /throw new Error\(/, 'formatHole must still throw for a hole off the board');
  assert.match(fn[0], /ALL_ROWS\.includes\(ref\.row\)/, 'formatHole must still check the row');
  assert.match(fn[0], /ref\.col\s*<\s*COLS/, 'formatHole must still check the column');
  assert.match(fn[0], /App\.holeName\(\s*ref\s*\)/, 'formatHole should return App.holeName(ref), read at call time');
  assert.doesNotMatch(fn[0], /col\s*\+\s*1/, 'formatHole should not carry its own copy of the formula');
});
