// The battery, buzzer and button as registry parts, parts/battery.js,
// parts/buzzer.js and parts/button.js (issue #26). Their definition halves
// load in Node through require('circuit3d/js/parts') and in a browser-like
// context with no THREE or document; their models (view.build / view.update)
// are checked in the browser by e2e/parts.spec.js, e2e/button.spec.js and
// e2e/buzzer.spec.js.
//
// Each keeps everything a user sees: its saved type, its labels (BAT1, BZ1,
// SW1, from ids.js), and today's results and summary wording. The decisions
// on the issue fix the rest:
//   battery  offboard, pins ['0', '1'] (BAT1.0 = +), ref '1' (the − pin),
//            values.voltage 9 V, elements: one V from '0' to '1'
//   buzzer   span {2,2,2}, pins ['lead1', 'lead2'], one R of 42 Ω,
//            measure → { sounding, current }, sounding from 1 mA
//   button   span {3,3,3}, pins ['lead1', 'lead2'], controls.pressed
//            momentary, gestures.click → 'pressed', one SW, closed = pressed
// and the two new optional PartDefinition fields:
//   headline(r, m) → { text, cls }         one line at the top of the results
//   line(r, m)     → { text, cls } | null  replaces the generic "💡 NAME ON" line
// Each part's report(r, m) is today's AI-summary wording without the label.
//
// Kept apart from parts-registry.test.js, which resets the registry before
// every test.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const Parts = require('../circuit3d/js/parts');
const Ids   = require('../circuit3d/js/ids.js');

const PARTS_DIR = path.join(__dirname, '..', 'circuit3d', 'js', 'parts');

function def(type) {
  const d = Parts.get(type);
  assert.ok(d, `Parts.get('${type}') is null: parts/${type}.js must exist and be listed in parts/index.js`);
  return d;
}

// A registry part's defaults, as elements() gets them.
function defaults(d) {
  const out = {};
  for (const [key, spec] of Object.entries(d.values || {})) {
    out[key] = spec.default;
    if (spec.choices && spec.choices[spec.default]) Object.assign(out, spec.choices[spec.default]);
  }
  return out;
}
function controlDefaults(d) {
  const out = {};
  for (const [key, c] of Object.entries(d.controls || {})) out[key] = c.default;
  return out;
}

// The one element of `kind` and the key PartResult uses for it (id or index).
function element(d, kind, values, controls) {
  const els = d.elements(values || defaults(d), controls || controlDefaults(d));
  const k = els.findIndex(e => e.kind === kind);
  assert.ok(k >= 0, `${d.type}.elements() should hold a ${kind}; got ${JSON.stringify(els)}`);
  return { el: els[k], id: els[k].id !== undefined ? els[k].id : k, els };
}

// A PartResult as the core hands it over: current in mA through the part's
// one element, + in the element's pin order.
function result(d, kind, { label, values, controls, pins, current }) {
  const v = Object.assign(defaults(d), values || {});
  const c = Object.assign(controlDefaults(d), controls || {});
  const { id } = element(d, kind, v, c);
  const p = pins || {};
  for (const name of d.pins) if (!(name in p)) p[name] = 0;
  return { label, values: v, controls: c, pins: p, current: { [id]: current || 0 }, modes: {}, open: {} };
}

const measured = (d, r) => (d.measure ? d.measure(r) : {});
const plain = o => JSON.parse(JSON.stringify(o));

// ── The files ─────────────────────────────────────────────────────────────

test('parts/index.js lists battery.js, buzzer.js and button.js, and each file exists', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  for (const f of ['battery.js', 'buzzer.js', 'button.js']) {
    assert.ok(files.includes(f), `FILES should include '${f}'; got ${JSON.stringify(files)}`);
    assert.ok(fs.existsSync(path.join(PARTS_DIR, f)), `circuit3d/js/parts/${f} must exist`);
  }
});

// #31 adds the potentiometer, the sixth registered part; #40 the light
// sensor (ldr), the seventh; #41 the thermistor, the eighth; #34 the bench
// supply (bench_supply), the ninth; #43 the 7-segment display; #33 the diode;
// #35 the Zener; #32 the toggle switch (toggle_switch);
// #39 the slide switch (slide_switch); #36 the bulb; #37 the DC motor.
test('every part is registered: resistor, led, battery, buzzer, button, potentiometer, ldr, thermistor, bench_supply, seven_segment, diode, zener, toggle_switch, slide_switch, bulb, motor', () => {
  const types = Parts.all().map(d => d.type).sort();
  assert.deepStrictEqual(types, ['battery', 'bench_supply', 'bulb', 'button', 'buzzer', 'diode', 'ldr', 'led', 'motor', 'potentiometer', 'resistor', 'seven_segment', 'slide_switch', 'thermistor', 'toggle_switch', 'zener']);
});

test("each keeps its saved type and today's label prefix (ids.js): BAT, BZ, SW", () => {
  for (const [type, prefix] of [['battery', 'BAT'], ['buzzer', 'BZ'], ['button', 'SW']]) {
    const d = def(type);
    assert.equal(d.type, type);
    assert.equal(d.prefix, prefix, `${type}: labels stay ${prefix}1, ${prefix}2…`);
    assert.equal(Ids.LABEL_PREFIX[type], d.prefix, `ids.js and the part file agree on ${type}'s prefix`);
  }
});

// ── The battery ───────────────────────────────────────────────────────────

test("the battery: a Sources part, off the board, pins '0' (+) and '1' (−), with '1' as its ref", () => {
  const d = def('battery');
  assert.equal(d.category, 'Sources');
  assert.deepStrictEqual([...d.pins], ['0', '1'], "today's order: BAT1.0 is +, BAT1.1 is −");
  assert.equal(d.ref, '1', 'the − pin can be ground');
  assert.deepStrictEqual(plain(d.place), { kind: 'offboard' });
});

test('the battery: values.voltage in V, 9 by default; 5 V and 6 V are accepted', () => {
  const spec = def('battery').values && def('battery').values.voltage;
  assert.ok(spec, 'values.voltage');
  assert.equal(spec.unit, 'V');
  assert.equal(spec.default, 9);
  assert.deepStrictEqual(Parts.checkValue('battery', 'voltage', 5), { ok: true, value: 5 });
  assert.deepStrictEqual(Parts.checkValue('battery', 'voltage', 6), { ok: true, value: 6 });
});

test("the battery: elements() is one V from '0' (+) to '1' (−), volts = voltage", () => {
  const d = def('battery');
  for (const volts of [9, 6]) {
    const { el, els } = element(d, 'V', { voltage: volts });
    assert.equal(els.length, 1, `one element; got ${JSON.stringify(els)}`);
    assert.deepStrictEqual([...el.pins], ['0', '1'], 'V pins are [plus, minus]');
    assert.equal(el.volts, volts);
  }
});

test('the battery: report is "9.00 V battery, supplying 14.9 mA", whichever way the current is signed', () => {
  const d = def('battery');
  for (const I of [-14.894, 14.894]) {
    const r = result(d, 'V', { label: 'BAT1', pins: { 0: 9, 1: 0 }, current: I });
    assert.equal(d.report(r, measured(d, r)), '9.00 V battery, supplying 14.9 mA', `current ${I} mA`);
  }
  const r6 = result(d, 'V', { label: 'BAT1', values: { voltage: 6 }, pins: { 0: 6, 1: 0 }, current: 0 });
  assert.equal(d.report(r6, measured(d, r6)), '6.00 V battery, supplying 0.0 mA');
});

test('the battery: headline "Battery N: 9V" in sim-info, N from its label', () => {
  const d = def('battery');
  assert.equal(typeof d.headline, 'function', 'the battery defines headline(r, m)');
  const r1 = result(d, 'V', { label: 'BAT1', current: -14.894 });
  assert.deepStrictEqual(plain(d.headline(r1, measured(d, r1))), { text: 'Battery 1: 9V', cls: 'sim-info' });
  const r2 = result(d, 'V', { label: 'BAT2', values: { voltage: 6 } });
  assert.deepStrictEqual(plain(d.headline(r2, measured(d, r2))), { text: 'Battery 2: 6V', cls: 'sim-info' });
});

test('the battery: checkPlacement says ok, it sits beside the board', () => {
  def('battery');
  assert.deepStrictEqual(Parts.checkPlacement('battery', [{ pin: '0', col: null, row: null }, { pin: '1', col: null, row: null }],
    new Map(), { cols: 63, bodyRows: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] }), { ok: true });
});

// ── The buzzer ────────────────────────────────────────────────────────────

test('the buzzer: pins lead1, lead2; a fixed span of 2 columns', () => {
  const d = def('buzzer');
  assert.deepStrictEqual([...d.pins], ['lead1', 'lead2']);
  assert.equal(d.place.kind, 'span');
  assert.deepStrictEqual(plain(d.place.span), { min: 2, max: 2, default: 2 });
});

test("the buzzer: elements() is one R of 42 Ω between its leads (today's buzzer resistance)", () => {
  const d = def('buzzer');
  const { el, els } = element(d, 'R');
  assert.equal(els.length, 1, `one element; got ${JSON.stringify(els)}`);
  assert.deepStrictEqual([...el.pins].sort(), ['lead1', 'lead2']);
  assert.equal(el.ohms, 42);
});

test('the buzzer: measure() is { sounding, current } — sounding from 1 mA, current a positive magnitude', () => {
  const d = def('buzzer');
  assert.equal(typeof d.measure, 'function', 'the buzzer must define measure()');
  for (const I of [17.578, -17.578]) {
    const m = d.measure(result(d, 'R', { label: 'BZ1', current: I }));
    assert.equal(m.sounding, true, `${I} mA: ${JSON.stringify(m)}`);
    assert.ok(Math.abs(m.current - 17.578) < 0.001, `${I} mA measures 17.578: ${JSON.stringify(m)}`);
  }
  assert.equal(d.measure(result(d, 'R', { label: 'BZ1', current: 0.5 })).sounding, false, 'under 1 mA it is silent');
  assert.equal(d.measure(result(d, 'R', { label: 'BZ1', current: 0 })).sounding, false);
});

test('the buzzer: report is "buzzer ON (sounding), 17.6 mA" / "buzzer OFF (silent), 0.0 mA"', () => {
  const d = def('buzzer');
  const on = result(d, 'R', { label: 'BZ1', current: 17.578 });
  assert.equal(d.report(on, d.measure(on)), 'buzzer ON (sounding), 17.6 mA');
  const off = result(d, 'R', { label: 'BZ1', current: 0 });
  assert.equal(d.report(off, d.measure(off)), 'buzzer OFF (silent), 0.0 mA');
});

test('the buzzer: line() is "  🔔 BUZZER ON  (17.6 mA)" in sim-on while sounding, null while silent', () => {
  const d = def('buzzer');
  assert.equal(typeof d.line, 'function', 'the buzzer defines line(r, m)');
  const on = result(d, 'R', { label: 'BZ1', current: 17.578 });
  assert.deepStrictEqual(plain(d.line(on, d.measure(on))), { text: '  🔔 BUZZER ON  (17.6 mA)', cls: 'sim-on' });
  const off = result(d, 'R', { label: 'BZ1', current: 0 });
  assert.strictEqual(d.line(off, d.measure(off)), null);
});

test('the buzzer: view.build and view.update (the tone starts and stops there)', () => {
  const d = def('buzzer');
  assert.equal(typeof d.view.build, 'function');
  assert.equal(typeof d.view.update, 'function', 'view.update plays and stops the tone after each simulation');
});

// ── The button ────────────────────────────────────────────────────────────

test('the button: pins lead1, lead2; a fixed span of 3 columns', () => {
  const d = def('button');
  assert.deepStrictEqual([...d.pins], ['lead1', 'lead2']);
  assert.equal(d.place.kind, 'span');
  assert.deepStrictEqual(plain(d.place.span), { min: 3, max: 3, default: 3 });
});

test('the button: controls.pressed is momentary (default false, not saved), and a click drives it', () => {
  const d = def('button');
  assert.deepStrictEqual(plain(d.controls), { pressed: { type: 'momentary', default: false, saved: false } });
  assert.deepStrictEqual(plain(d.gestures), { click: 'pressed' });
});

test('the button: elements() is one SW between its leads, closed exactly while pressed', () => {
  const d = def('button');
  for (const pressed of [false, true]) {
    const { el, els } = element(d, 'SW', defaults(d), { pressed });
    assert.equal(els.length, 1, `one element; got ${JSON.stringify(els)}`);
    assert.deepStrictEqual([...el.pins].sort(), ['lead1', 'lead2']);
    assert.strictEqual(el.closed, pressed, `pressed ${pressed}: closed ${el.closed}`);
  }
});

test('the button: report is "button pressed (closed), 14.9 mA" / "button released (open), 0.0 mA"', () => {
  const d = def('button');
  const down = result(d, 'SW', { label: 'SW1', controls: { pressed: true }, pins: { lead1: 9, lead2: 9 }, current: 14.894 });
  assert.equal(d.report(down, measured(d, down)), 'button pressed (closed), 14.9 mA');
  const up = result(d, 'SW', { label: 'SW1', controls: { pressed: false }, pins: { lead1: 9, lead2: 0 }, current: 0 });
  assert.equal(d.report(up, measured(d, up)), 'button released (open), 0.0 mA');
});

test('the button: headline "Button N: 🟢 CLOSED (current flowing)" / "Button N: ⭕ OPEN — click to press", N from its label', () => {
  const d = def('button');
  assert.equal(typeof d.headline, 'function', 'the button defines headline(r, m)');
  const down = result(d, 'SW', { label: 'SW1', controls: { pressed: true }, current: 14.894 });
  assert.deepStrictEqual(plain(d.headline(down, measured(d, down))), { text: 'Button 1: 🟢 CLOSED (current flowing)', cls: 'sim-on' });
  const up = result(d, 'SW', { label: 'SW3', controls: { pressed: false } });
  assert.deepStrictEqual(plain(d.headline(up, measured(d, up))), { text: 'Button 3: ⭕ OPEN — click to press', cls: 'sim-info' });
});

test('the button: view.build and view.update (the cap goes down and back up there)', () => {
  const d = def('button');
  assert.equal(typeof d.view.build, 'function');
  assert.equal(typeof d.view.update, 'function', 'view.update animates the cap');
});

// ── Placement ─────────────────────────────────────────────────────────────

const BOARD = { cols: 63, bodyRows: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] };
const leg = (pin, s) => ({ pin, col: +s.slice(1) - 1, row: s[0] });
const place = (type, a, b) => Parts.checkPlacement(type, [leg('lead1', a), leg('lead2', b)], new Map(), BOARD);

test('checkPlacement on the real buzzer: 2 columns apart ok; 1 or 3 refused with "2 columns apart"', () => {
  def('buzzer');
  assert.deepStrictEqual(place('buzzer', 'c30', 'c32'), { ok: true });
  for (const b of ['c31', 'c33']) {
    const out = place('buzzer', 'c30', b);
    assert.equal(out.ok, false, `c30 → ${b}`);
    assert.ok(out.reason.includes('must be 2 columns apart'), out.reason);
  }
});

test('checkPlacement on the real button: 3 columns apart ok (the demo\'s b12→b15); 2 or 4 refused with "3 columns apart"', () => {
  def('button');
  assert.deepStrictEqual(place('button', 'b12', 'b15'), { ok: true });
  for (const b of ['b14', 'b16']) {
    const out = place('button', 'b12', b);
    assert.equal(out.ok, false, `b12 → ${b}`);
    assert.ok(out.reason.includes('must be 3 columns apart'), out.reason);
  }
});

// ── Examples ──────────────────────────────────────────────────────────────
// parts-examples.test.js runs every example; here, that each part's own
// examples check the part itself.

test('each of the three has an example whose expect names it', () => {
  for (const type of ['battery', 'buzzer', 'button']) {
    const d = def(type);
    const named = d.examples.some(ex => ex.parts.some(p => p.type === type && Object.hasOwn(ex.expect, p.label)));
    assert.ok(named, `${type}: no example checks the part itself in expect`);
  }
});

test('the button has an example with it pressed (controls: { pressed: true }) that carries a current', () => {
  const d = def('button');
  const pressed = d.examples.some(ex => ex.parts.some(p => p.type === 'button' && p.controls && p.controls.pressed === true));
  assert.ok(pressed, `no example presses the button: ${JSON.stringify(d.examples.map(e => e.parts))}`);
});

// ── The browser half ──────────────────────────────────────────────────────

for (const type of ['battery', 'buzzer', 'button']) {
  test(`in a browser-like page with no THREE, document or AudioContext, ${type}.js defines itself on window.Parts`, () => {
    const file = path.join(PARTS_DIR, type + '.js');
    assert.ok(fs.existsSync(file), `circuit3d/js/parts/${type}.js must exist`);
    const win = vm.createContext({ TextEncoder });
    win.window = win;
    vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
    vm.runInContext(fs.readFileSync(file, 'utf8'), win);
    assert.ok(win.Parts.get(type), `window.Parts.get("${type}") after loading ${type}.js`);
  });

  test(`parts/${type}.js draws only through ctx: no App, no document`, () => {
    const file = path.join(PARTS_DIR, type + '.js');
    assert.ok(fs.existsSync(file), `circuit3d/js/parts/${type}.js must exist`);
    const src = fs.readFileSync(file, 'utf8');
    assert.match(src, /\bview\s*:/, 'a view: { build, update? } section');
    assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
    assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
  });
}
