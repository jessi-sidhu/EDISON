// The resistor as a registry part, parts/resistor.js (issue #23). Its
// definition half loads in Node through require('circuit3d/js/parts') and
// in a browser-like context with no THREE or document; its model (view) is
// checked in the browser by e2e/parts.spec.js.
//
// Kept apart from parts-registry.test.js, which resets the registry before
// every test.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const Parts = require('../circuit3d/js/parts');

const PARTS_DIR = path.join(__dirname, '..', 'circuit3d', 'js', 'parts');

function resistor() {
  const def = Parts.get('resistor');
  assert.ok(def, "Parts.get('resistor') is null: parts/resistor.js must exist and be listed in parts/index.js");
  return def;
}

// A PartResult as the core hands it to measure/warnings/report.
function result(def, currentMA, values) {
  const [a, b] = def.pins;
  const els = def.elements(values || { resistance: 470 }, {});
  const id = els[0].id !== undefined ? els[0].id : 0;
  return { label: 'R1', values: values || { resistance: 470 }, controls: {},
           pins: { [a]: 9, [b]: 2 }, current: { [id]: currentMA }, modes: {} };
}

test('parts/index.js lists resistor.js', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('resistor.js'), `FILES should include 'resistor.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'resistor.js')), 'circuit3d/js/parts/resistor.js must exist');
});

test('the resistor is a 2-pin Passives part labelled R, named Resistor', () => {
  const def = resistor();
  assert.equal(def.type, 'resistor');
  assert.equal(def.name, 'Resistor');
  assert.equal(def.category, 'Passives');
  assert.equal(def.prefix, 'R', 'labels stay R1, R2… (ids.js)');
  assert.equal(def.pins.length, 2);
});

test('the resistor spans 3–5 columns (4 by default), horizontal or across the gap', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(resistor().place)),
    { kind: 'span', span: { min: 3, max: 5, default: 4 }, rotations: ['h', 'v'] });
});

test('resistance: Ω, 470 by default, 1 Ω to 10 MΩ, E12 kit hint', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(resistor().values)),
    { resistance: { unit: 'Ω', default: 470, min: 1, max: 10e6, series: 'E12' } });
});

test('elements(): one R between the two pins, ohms = resistance', () => {
  const def = resistor();
  for (const ohms of [470, 1000, 1234]) {
    const els = def.elements({ resistance: ohms }, {});
    assert.equal(els.length, 1, `one element for ${ohms} Ω; got ${JSON.stringify(els)}`);
    assert.equal(els[0].kind, 'R');
    assert.deepStrictEqual([...els[0].pins].sort(), [...def.pins].sort(), 'the R joins the two pins');
    assert.equal(els[0].ohms, ohms);
  }
});

test('measure(): current in mA, a positive magnitude either way through', () => {
  const def = resistor();
  assert.equal(typeof def.measure, 'function', 'the resistor must define measure()');
  for (const I of [14.894, -14.894]) {
    const m = def.measure(result(def, I));
    assert.ok(m && typeof m.current === 'number', `measure() needs a current; got ${JSON.stringify(m)}`);
    assert.ok(Math.abs(m.current - 14.894) < 0.01, `current ${I} mA should measure 14.894; got ${m.current}`);
  }
});

// Issue #26: the AI summary's part lines are now `- <label>: <report>`, so
// the report carries today's summary wording ("470 ohm resistor, 14.9 mA"),
// not #23's "470 Ω, 14.9 mA".
test('report(): today\'s summary wording, "470 ohm resistor, 14.9 mA" (#26)', () => {
  const def = resistor();
  const r = result(def, 14.894);
  const line = def.report(r, def.measure(r));
  assert.equal(typeof line, 'string');
  assert.ok(line.length <= 80, line);
  assert.equal(line, '470 ohm resistor, 14.9 mA');
  const k = result(def, 7.0, { resistance: 1000 });
  assert.equal(def.report(k, def.measure(k)), '1000 ohm resistor, 7.0 mA');
});

test('warnings: none for a resistor in a working circuit', () => {
  const def = resistor();
  const r = result(def, 14.894);
  const w = def.warnings ? def.warnings(r, def.measure(r)) : [];
  assert.deepStrictEqual(w, []);
});

test('ai: the existing place_resistor tool, found by the word "resistor"', () => {
  const def = resistor();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_resistor', 'the AI tool name is unchanged');
  assert.ok(def.ai.keywords.includes('resistor'), `keywords: ${JSON.stringify(def.ai.keywords)}`);
  assert.ok(def.ai.about.length > 0);
});

test('the resistor has a view.build and at least one example', () => {
  const def = resistor();
  assert.equal(typeof def.view.build, 'function');
  assert.ok(def.examples.length >= 1);
});

test('checkValue on the real resistor: 470 ok, 1234 hints 1.2 kΩ, −5 refused with the range', () => {
  resistor();
  assert.deepStrictEqual(Parts.checkValue('resistor', 'resistance', 470), { ok: true, value: 470 });
  const odd = Parts.checkValue('resistor', 'resistance', 1234);
  assert.equal(odd.ok, true);
  assert.equal(odd.value, 1234);
  assert.equal(odd.hint, 'closest kit value: 1.2 kΩ');
  assert.deepStrictEqual(Parts.checkValue('resistor', 'resistance', -5),
    { ok: false, reason: 'resistance must be 1 Ω–10 MΩ; got −5' });
});

test('checkPlacement on the real resistor: a3→a7 ok, a3→a33 refused with "3–5", e3→f3 ok', () => {
  resistor();
  const leg = (pin, col, row) => ({ pin, col, row });
  const [a, b] = Parts.get('resistor').pins;
  const place = (c1, r1, c2, r2) => Parts.checkPlacement('resistor', [leg(a, c1, r1), leg(b, c2, r2)], new Map(),
    { cols: 63, bodyRows: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] });
  assert.deepStrictEqual(place(2, 'a', 6, 'a'), { ok: true });
  const far = place(2, 'a', 32, 'a');
  assert.equal(far.ok, false);
  assert.ok(far.reason.includes('3–5'), far.reason);
  assert.deepStrictEqual(place(2, 'e', 2, 'f'), { ok: true });
});

// The definition half never touches THREE, document or window: in the
// browser it runs as a plain <script> after registry.js, before any 3D code.
test('in a browser-like page with no THREE or document, resistor.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'resistor.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/resistor.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('resistor');
  assert.ok(def, 'window.Parts.get("resistor") after loading resistor.js');
  assert.equal(def.elements({ resistance: 470 }, {})[0].ohms, 470);
});
