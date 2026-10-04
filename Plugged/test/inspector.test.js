// The value inspector, circuit3d/js/inspector.js (issue #29). Selecting a part
// shows its label, one row per value and one row per control, all read from
// its definition: no per-type code. The logic is pure and Node can load it;
// the page's render/show/hide is a thin layer over it (decision 1).
//
// The API the builder matches (chosen here):
//   Inspector.rows(def, comp) → Row[]
//     def   a part definition (Parts.get(type)); comp a placed record,
//           { type, label, values?, controls? }.
//     Values first, in the order of def.values, then controls, in the order
//     of def.controls. A row's `value` is comp's own (comp.values[key] /
//     comp.controls[key]), or the spec's default when comp has none.
//     Which values get a row (the rule pinned here): the keys in
//     def.ai.values when the part sets it, otherwise every value. This is
//     the rule App.formatValue already uses. So the LED shows only `color`;
//     maxCurrent and thresholdCurrent are internal ratings, and vf comes
//     from the colour choice.
//     Row shapes (extra fields are allowed):
//       number     { kind: 'number',    key, unit, value, min, max }
//       choice     { kind: 'choice',    key, options: [names in order], value }
//       slider     { kind: 'slider',    key, value, min, max, step, unit? }
//       toggle     { kind: 'toggle',    key, value }
//       momentary  { kind: 'momentary', key, value }
//
//   Inspector.edit(comp, key, raw) → { ok: true, values: { [key]: value }, hint? }
//                                  | { ok: false, reason }
//     raw is what the user entered: the input's text for a number ("1234",
//     " 470 "), or the chosen option's name for a choice. Numbers are parsed,
//     then checked with Parts.checkValue (the only validator); a refusal is
//     checkValue's reason, word for word. `values` is the patch the page
//     hands to App.setValues (one undo step). `hint` is checkValue's kit hint,
//     e.g. "closest kit value: 1.2 kΩ", only when the value has a series and
//     isn't a kit value already. edit() never changes comp.
// Loading: Node module.exports = Inspector (reading the registry through
// parts/registry.js); browser window.Inspector.

const assert = require('node:assert');

const Parts = require('../circuit3d/js/parts');
const testSpan = require('./fixtures/parts/test_span.js');

let Inspector = null;
let loadError = null;
try { Inspector = require('../circuit3d/js/inspector.js'); } catch (e) { loadError = e; }

function need(name) {
  assert.ok(!loadError, 'circuit3d/js/inspector.js must exist and load in Node: ' + (loadError && loadError.message));
  assert.equal(typeof (Inspector && Inspector[name]), 'function', `inspector.js must export Inspector.${name}()`);
  return Inspector[name];
}

const rows = (type, comp) => need('rows')(Parts.get(type), Object.assign({ type, label: 'X1' }, comp));

// The fields a row of that kind must have, and nothing else compared.
const FIELDS = {
  number:    ['kind', 'key', 'unit', 'value', 'min', 'max'],
  choice:    ['kind', 'key', 'options', 'value'],
  slider:    ['kind', 'key', 'value', 'min', 'max', 'step'],
  toggle:    ['kind', 'key', 'value'],
  momentary: ['kind', 'key', 'value'],
};
const shape = list => list.map(r => Object.fromEntries((FIELDS[r.kind] || ['kind', 'key']).map(f => [f, r[f]])));

// ── Inspector.rows ─────────────────────────────────────────────────────────

test('resistor: one number row, resistance 470 Ω, with its range', () => {
  assert.deepEqual(shape(rows('resistor', { values: { resistance: 470 } })),
    [{ kind: 'number', key: 'resistance', unit: 'Ω', value: 470, min: 1, max: 10e6 }]);
});

test("a row shows the part's own value, and the default when the record has none", () => {
  assert.equal(rows('resistor', { values: { resistance: 1000 } })[0].value, 1000);
  assert.equal(rows('resistor', {})[0].value, 470);
});

test('LED: one choice row for color (red…white, value red); no maxCurrent or thresholdCurrent rows', () => {
  const led = Parts.get('led');
  const r = rows('led', { values: { color: 'red', vf: 2.0, maxCurrent: 0.02, thresholdCurrent: 0.001 } });
  assert.deepEqual(shape(r), [{ kind: 'choice', key: 'color', options: Object.keys(led.values.color.choices), value: 'red' }]);
  assert.deepEqual(r[0].options, ['red', 'yellow', 'green', 'blue', 'white']);
  assert.deepEqual(r.map(x => x.key), ['color'], 'rule: only def.ai.values when set (the LED sets ["color"])');
});

test('LED: a green record shows green', () => {
  assert.equal(rows('led', { values: { color: 'green', vf: 2.2 } })[0].value, 'green');
});

test('battery: one number row, voltage 9 V, 1–24', () => {
  assert.deepEqual(shape(rows('battery', { values: { voltage: 9 } })),
    [{ kind: 'number', key: 'voltage', unit: 'V', value: 9, min: 1, max: 24 }]);
});

test('button: no value rows, one momentary row for pressed (false by default, true when pressed)', () => {
  assert.deepEqual(shape(rows('button', {})), [{ kind: 'momentary', key: 'pressed', value: false }]);
  assert.deepEqual(shape(rows('button', { controls: { pressed: false } })), [{ kind: 'momentary', key: 'pressed', value: false }]);
  assert.deepEqual(shape(rows('button', { controls: { pressed: true } })), [{ kind: 'momentary', key: 'pressed', value: true }]);
});

test('buzzer: no rows at all', () => {
  assert.deepEqual(rows('buzzer', {}), []);
});

test('a part with no ai.values shows every value, then its controls (test fixture: number, choice, toggle)', () => {
  const def = testSpan();   // not registered: rows() reads the definition it is given
  const r = need('rows')(def, { type: 'test_span', label: 'TS1', values: { resistance: 2200, color: 'blue' }, controls: { closed: false } });
  assert.deepEqual(shape(r), [
    { kind: 'number', key: 'resistance', unit: 'Ω', value: 2200, min: 1, max: 10e6 },
    { kind: 'choice', key: 'color', options: ['red', 'yellow', 'green', 'blue', 'white'], value: 'blue' },
    { kind: 'toggle', key: 'closed', value: false },
  ]);
});

test('a slider control gets a slider row with its range, step and unit', () => {
  const def = Object.assign(testSpan(), {
    type: 'test_pot', controls: { wiper: { type: 'slider', default: 50, min: 0, max: 100, step: 5, unit: '%', saved: true } },
  });
  const r = need('rows')(def, { type: 'test_pot', label: 'TP1', values: {}, controls: { wiper: 35 } });
  const slider = r.find(x => x.key === 'wiper');
  assert.ok(slider, 'a row for the slider control');
  assert.deepEqual(shape([slider]), [{ kind: 'slider', key: 'wiper', value: 35, min: 0, max: 100, step: 5 }]);
  assert.equal(slider.unit, '%');
  assert.equal(need('rows')(def, { type: 'test_pot', label: 'TP1' }).find(x => x.key === 'wiper').value, 50, 'default when unset');
});

// ── Inspector.edit: checkValue and the kit hint ────────────────────────────

const R1 = () => ({ type: 'resistor', label: 'R1', values: { resistance: 470 } });

test('1234 Ω is accepted with the hint "closest kit value: 1.2 kΩ"', () => {
  const res = need('edit')(R1(), 'resistance', '1234');
  assert.equal(res.ok, true, 'accepted: ' + res.reason);
  assert.deepEqual(res.values, { resistance: 1234 }, 'a number, not the text');
  assert.equal(res.hint, 'closest kit value: 1.2 kΩ');
});

test('470 Ω is already a kit value: accepted, no hint', () => {
  const res = need('edit')(R1(), 'resistance', '470');
  assert.equal(res.ok, true);
  assert.deepEqual(res.values, { resistance: 470 });
  assert.ok(!res.hint, `no hint for a kit value; got ${JSON.stringify(res.hint)}`);
});

test('spaces around the number are fine; a number (not text) is fine too', () => {
  assert.deepEqual(need('edit')(R1(), 'resistance', ' 1000 ').values, { resistance: 1000 });
  assert.deepEqual(need('edit')(R1(), 'resistance', 1000).values, { resistance: 1000 });
});

test("−5 is refused with checkValue's reason, and nothing changes", () => {
  const comp = R1();
  const before = JSON.stringify(comp);
  const res = need('edit')(comp, 'resistance', '-5');
  assert.equal(res.ok, false);
  assert.equal(res.reason, Parts.checkValue('resistor', 'resistance', -5).reason);
  assert.equal(res.reason, 'resistance must be 1 Ω–10 MΩ; got −5');
  assert.equal(res.values, undefined, 'no patch for a refused value');
  assert.equal(JSON.stringify(comp), before, 'edit() leaves the record alone');
});

test('text that is not a number is refused with a reason', () => {
  for (const raw of ['abc', '']) {
    const res = need('edit')(R1(), 'resistance', raw);
    assert.equal(res.ok, false, `"${raw}" is refused`);
    assert.equal(typeof res.reason, 'string');
    assert.match(res.reason, /resistance/);
  }
});

test('a battery voltage has no series, so no hint; 30 V is refused', () => {
  const bat = { type: 'battery', label: 'BAT1', values: { voltage: 9 } };
  const ok = need('edit')(bat, 'voltage', '6');
  assert.deepEqual([ok.ok, ok.values, !!ok.hint], [true, { voltage: 6 }, false]);
  const no = need('edit')(bat, 'voltage', '30');
  assert.equal(no.ok, false);
  assert.equal(no.reason, Parts.checkValue('battery', 'voltage', 30).reason);
});

test('LED colour: green is accepted as a choice; purple is refused', () => {
  const led = { type: 'led', label: 'LED1', values: { color: 'red', vf: 2.0 } };
  const ok = need('edit')(led, 'color', 'green');
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.values, { color: 'green' });
  const no = need('edit')(led, 'color', 'purple');
  assert.equal(no.ok, false);
  assert.equal(no.reason, Parts.checkValue('led', 'color', 'purple').reason);
});
