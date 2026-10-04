// The bench supply's CH2 rows grey out in SERIES (issue #127). In series one
// setting drives both channels, so CH2's voltage2 / limit2 do nothing; the
// inspector shows them disabled with the note "tracks CH1". Independent,
// they are normal rows.
//
// The API the builder matches (chosen here, from the issue):
// - A ValueSpec may add `activeWhen: { <control>: <option>, note }`: the
//   value applies only while that choice control has that option. The
//   registry checks it (test/parts-registry.test.js).
// - Inspector.rows(def, comp): a value row whose activeWhen doesn't hold
//   (the control's saved value, else its default) gets `disabled: true` and
//   `note`. Its `value` is still the part's own (or the default), so going
//   back to independent shows what was set. A row whose activeWhen holds,
//   and every row of a part with no activeWhen, has no `disabled` / `note`
//   keys: the rows are exactly what they were before this issue.
// - Inspector.edit(comp, key, raw) on a disabled key → { ok: false, reason }
//   (a non-empty string), no `values` patch, even when the number is valid.
// - bench_supply marks voltage2 and limit2
//   activeWhen: { mode: 'independent', note: 'tracks CH1' }.

const assert = require('node:assert');

const Parts     = require('../circuit3d/js/parts');
const Inspector = require('../circuit3d/js/inspector.js');
const testSpan  = require('./fixtures/parts/test_span.js');

// Rows as plain data: a key set to undefined (e.g. a number row's `series`
// when the value has none) counts as absent.
const clean  = list => JSON.parse(JSON.stringify(list));
const rowsOf = (type, comp) => clean(Inspector.rows(Parts.get(type), Object.assign({ type, label: 'X1' }, comp)));
const byKey  = list => Object.fromEntries(list.map(r => [r.key, r]));

// bench_supply's rows before this issue, with its defaults.
const VOLTAGE  = { kind: 'number', key: 'voltage',  unit: 'V', value: 12,  min: 0,     max: 30 };
const LIMIT    = { kind: 'number', key: 'limit',    unit: 'A', value: 0.5, min: 0.001, max: 3 };
const VOLTAGE2 = { kind: 'number', key: 'voltage2', unit: 'V', value: 12,  min: 0,     max: 30 };
const LIMIT2   = { kind: 'number', key: 'limit2',   unit: 'A', value: 0.5, min: 0.001, max: 3 };
const MODE     = mode => ({ kind: 'option', key: 'mode', options: ['series', 'independent'], value: mode, saved: true });
const GREY     = { disabled: true, note: 'tracks CH1' };

// ── Inspector.rows: the bench supply ───────────────────────────────────────

test('bench supply with no mode saved (series by default): voltage2 and limit2 are disabled with "tracks CH1"; voltage, limit and mode are unchanged', () => {
  assert.deepEqual(rowsOf('bench_supply', {}), [
    VOLTAGE, LIMIT,
    { ...VOLTAGE2, ...GREY },
    { ...LIMIT2,   ...GREY },
    MODE('series'),
  ]);
});

test('bench supply in series: CH2 rows are disabled but still show the values set on them', () => {
  const r = byKey(rowsOf('bench_supply', { values: { voltage: 9, limit: 0.1, voltage2: 5, limit2: 0.05 }, controls: { mode: 'series' } }));
  assert.deepEqual(r.voltage2, { ...VOLTAGE2, value: 5,    ...GREY });
  assert.deepEqual(r.limit2,   { ...LIMIT2,   value: 0.05, ...GREY });
  assert.deepEqual(r.voltage,  { ...VOLTAGE,  value: 9 },   'CH1 stays editable');
  assert.deepEqual(r.limit,    { ...LIMIT,    value: 0.1 });
});

test('pin: bench supply in independent: every row is a normal row (no disabled, no note)', () => {
  assert.deepEqual(rowsOf('bench_supply', { values: { voltage2: 5, limit2: 0.05 }, controls: { mode: 'independent' } }), [
    VOLTAGE, LIMIT,
    { ...VOLTAGE2, value: 5 },
    { ...LIMIT2,   value: 0.05 },
    MODE('independent'),
  ]);
});

// ── activeWhen is generic: read from the definition, not bench-specific ────

test('a fixture value with activeWhen on a choice control greys out only while that control is off its option', () => {
  const def = Object.assign(testSpan(), {
    controls: { mode: { type: 'choice', options: ['a', 'b'], default: 'a', saved: true } },
  });
  def.values.resistance = { ...def.values.resistance, activeWhen: { mode: 'b', note: 'only in b' } };
  const row = controls => clean(Inspector.rows(def, { type: 'test_span', label: 'TS1', values: { resistance: 2200 }, controls }))
    .find(r => r.key === 'resistance');

  for (const controls of [undefined, { mode: 'a' }]) {
    const r = row(controls);
    assert.equal(r.disabled, true, `disabled with controls ${JSON.stringify(controls)}`);
    assert.equal(r.note, 'only in b');
    assert.equal(r.value, 2200, 'still shows its value');
  }
  const on = row({ mode: 'b' });
  assert.ok(!('disabled' in on) && !('note' in on), `no disabled / note while active; got ${JSON.stringify(on)}`);
});

// ── Inspector.edit refuses a disabled key ─────────────────────────────────

const PS = mode => ({ type: 'bench_supply', label: 'PS1', values: { voltage: 12, limit: 0.5, voltage2: 12, limit2: 0.5 },
                      controls: mode === undefined ? {} : { mode } });

test('Inspector.edit refuses voltage2 / limit2 in series (and with no mode saved), with a reason and no patch', () => {
  for (const mode of ['series', undefined]) {
    for (const [key, raw] of [['voltage2', '5'], ['limit2', '0.05']]) {
      const comp = PS(mode);
      const before = JSON.stringify(comp);
      const res = Inspector.edit(comp, key, raw);
      assert.equal(res.ok, false, `${key} = ${raw} with mode ${mode} must be refused; got ${JSON.stringify(res)}`);
      assert.equal(typeof res.reason, 'string');
      assert.ok(res.reason.length > 0, 'a reason to show');
      assert.equal(res.values, undefined, 'no patch');
      assert.equal(JSON.stringify(comp), before, 'edit() leaves the record alone');
    }
  }
});

// Pin (passes before the change): the independent edit must keep working.
test('pin: Inspector.edit accepts voltage2 / limit2 in independent', () => {
  assert.deepEqual(Inspector.edit(PS('independent'), 'voltage2', '5'),  { ok: true, values: { voltage2: 5 } });
  assert.deepEqual(Inspector.edit(PS('independent'), 'limit2', '0.05'), { ok: true, values: { limit2: 0.05 } });
});

// Pin: CH1 is never greyed, so its edits still go through in either mode.
test('pin: Inspector.edit accepts voltage in series and in independent', () => {
  for (const mode of ['series', 'independent', undefined]) {
    assert.deepEqual(Inspector.edit(PS(mode), 'voltage', '9'), { ok: true, values: { voltage: 9 } }, `mode ${mode}`);
  }
});

// ── Pins: every other part's rows are what they were ──────────────────────

test('pin: resistor, battery, potentiometer, LED and button rows are exactly as before', () => {
  assert.deepEqual(rowsOf('resistor', {}),
    [{ kind: 'number', key: 'resistance', unit: 'Ω', value: 470, min: 1, max: 10e6, series: 'E12' }]);
  assert.deepEqual(rowsOf('battery', {}),
    [{ kind: 'number', key: 'voltage', unit: 'V', value: 9, min: 1, max: 24 }]);
  assert.deepEqual(rowsOf('potentiometer', {}), [
    { kind: 'number', key: 'resistance', unit: 'Ω', value: 10000, min: 100, max: 1e6, series: 'E12' },
    { kind: 'slider', key: 'position', value: 50, min: 0, max: 100, step: 1, saved: true, unit: '%' },
  ]);
  assert.deepEqual(rowsOf('led', {}),
    [{ kind: 'choice', key: 'color', options: Object.keys(Parts.get('led').values.color.choices), value: 'red' }]);
  assert.deepEqual(rowsOf('button', {}), [{ kind: 'momentary', key: 'pressed', value: false, saved: false }]);
});

test('pin: no row of any other part has disabled or note, whatever its choice controls are set to', () => {
  for (const def of Parts.all().filter(d => d.type !== 'bench_supply')) {
    const choices = Object.entries(def.controls || {}).filter(([, c]) => c.type === 'choice');
    const settings = [{}, ...choices.flatMap(([k, c]) => c.options.map(o => ({ [k]: o })))];
    for (const controls of settings) {
      for (const r of rowsOf(def.type, { controls })) {
        assert.ok(!('disabled' in r) && !('note' in r),
          `${def.type}.${r.key} with ${JSON.stringify(controls)}: ${JSON.stringify(r)}`);
      }
    }
  }
});
