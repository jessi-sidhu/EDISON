// The LED as a registry part, parts/led.js (issue #25). Its definition half
// loads in Node through require('circuit3d/js/parts') and in a browser-like
// context with no THREE or document; its model (view.build / view.update) is
// checked in the browser by e2e/parts.spec.js and e2e/led.spec.js.
//
// The LED keeps everything a user sees: saved type 'led', pins in today's
// order (pin 0 cathode, pin 1 anode), labels LED1, LED2…, the five colours
// and their forward voltages, and every message word for word. Its on/off
// logic is one D element (pins [anode, cathode]) that the generic mode loop
// in simulate.js solves.
//
// PartResult as the core hands it to measure / warnings / report (issue #25
// adds `open`):
//   { label, values, controls,
//     pins:    { cathode: V, anode: V }          volts, null if floating
//     current: { [id]: mA }                      + in the element's pin order (anode → cathode)
//     modes:   { [id]: 'on' | 'off' }
//     open:    { [id]: V } }                     anode − cathode with every mode block off
//
// Kept apart from parts-registry.test.js, which resets the registry before
// every test.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const Parts = require('../circuit3d/js/parts');

const PARTS_DIR = path.join(__dirname, '..', 'circuit3d', 'js', 'parts');

// Today's LED_TYPES (components.js before #25): colour → forward voltage.
const TODAY_VF = { red: 2.0, yellow: 2.1, green: 2.2, blue: 3.2, white: 3.4 };

// Today's message texts (simulate.js before #25), without the two leading
// spaces the results panel adds.
const BACKWARDS = 'LED is backwards. Current cannot flow from cathode to anode. Flip it around.';
const TOO_LOW   = 'LED: current too low.';
const SHORT_1   = 'Short circuit. The LED sits straight across the battery with no current-limiting resistor.';
const SHORT_2   = 'Put a resistor in series: at least 350 ohm, so use a 470 ohm.';
const OVER_46   = 'LED is over its 20 mA rating at 46.6 mA. Needs at least 350 ohm in series, so use 470 ohm.';

function led() {
  const def = Parts.get('led');
  assert.ok(def, "Parts.get('led') is null: parts/led.js must exist and be listed in parts/index.js");
  return def;
}

// A registry part's defaults, as elements() gets them: a choice's overrides
// sit beside the choice's name.
function defaults(def) {
  const out = {};
  for (const [key, spec] of Object.entries(def.values || {})) {
    out[key] = spec.default;
    if (spec.choices && spec.choices[spec.default]) Object.assign(out, spec.choices[spec.default]);
  }
  return out;
}

// The values of an LED of colour c, as the core would hand them over.
function valuesFor(def, color) {
  return Object.assign(defaults(def), { color }, def.values.color.choices[color]);
}

// The D element of an LED and the key PartResult uses for it (id or index).
function diode(def, values) {
  const els = def.elements(values || defaults(def), {});
  const k = els.findIndex(e => e.kind === 'D');
  assert.ok(k >= 0, `elements() should hold one D; got ${JSON.stringify(els)}`);
  return { el: els[k], id: els[k].id !== undefined ? els[k].id : k, els };
}

// A PartResult for the LED: mode 'on'/'off', current in mA (+ anode → cathode),
// pin volts, and the open-circuit volts across the D.
function result(def, { mode, current, cathode, anode, open, values }) {
  const v = values || defaults(def);
  const { id } = diode(def, v);
  return { label: 'LED1', values: v, controls: {},
           pins: { cathode: cathode === undefined ? 0 : cathode, anode: anode === undefined ? 0 : anode },
           current: { [id]: current || 0 }, modes: { [id]: mode }, open: { [id]: open === undefined ? 9 : open } };
}

const warningsOf = (def, r) => (def.warnings ? def.warnings(r, def.measure(r)) : []);

// ── The file and its identity ─────────────────────────────────────────────

test('parts/index.js lists led.js', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('led.js'), `FILES should include 'led.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'led.js')), 'circuit3d/js/parts/led.js must exist');
});

test("the LED keeps its saved type 'led', today's pin order (cathode, anode) and its LED1 labels", () => {
  const def = led();
  assert.equal(def.type, 'led', 'saved files say type "led"');
  assert.deepStrictEqual([...def.pins], ['cathode', 'anode'], "pin 0 cathode, pin 1 anode, as today's files have them");
  assert.equal(def.prefix, 'LED', 'labels stay LED1, LED2… (ids.js)');
  assert.equal(def.name, 'LED', 'the results line reads "LED ON", from the name');
});

test('the LED spans 1–3 columns, 2 by default', () => {
  const place = JSON.parse(JSON.stringify(led().place));
  assert.equal(place.kind, 'span');
  assert.deepStrictEqual(place.span, { min: 1, max: 3, default: 2 });
});

// ── Values: colour, rating, threshold ─────────────────────────────────────

test("color: red, yellow, green, blue, white, red by default, each with today's forward voltage", () => {
  const spec = led().values && led().values.color;
  assert.ok(spec && spec.choices, `values.color must be a choices ValueSpec; got ${JSON.stringify(spec)}`);
  assert.deepStrictEqual(Object.keys(spec.choices), ['red', 'yellow', 'green', 'blue', 'white']);
  assert.equal(spec.default, 'red');
  for (const [color, vf] of Object.entries(TODAY_VF)) {
    assert.equal(spec.choices[color].vf, vf, `${color}: vf ${spec.choices[color].vf}, today ${vf}`);
  }
});

test('the defaults carry a 20 mA rating and a 1 mA lighting threshold, as today', () => {
  const v = defaults(led());
  assert.equal(v.color, 'red');
  assert.equal(v.vf, 2.0);
  assert.equal(v.maxCurrent, 0.020, `maxCurrent (A): ${v.maxCurrent}`);
  assert.equal(v.thresholdCurrent, 0.001, `thresholdCurrent (A): ${v.thresholdCurrent}`);
});

// ── elements(): one D ─────────────────────────────────────────────────────

test('elements(): one D from anode to cathode, vf from the colour, ron 0.1 Ω (today\'s R_ON)', () => {
  const def = led();
  for (const [color, vf] of Object.entries(TODAY_VF)) {
    const { el, els } = diode(def, valuesFor(def, color));
    assert.equal(els.length, 1, `${color}: one element; got ${JSON.stringify(els)}`);
    assert.equal(el.kind, 'D');
    assert.deepStrictEqual([...el.pins], ['anode', 'cathode'], 'D pins are [anode, cathode]');
    assert.equal(el.vf, vf, `${color}: D vf ${el.vf}, today ${vf}`);
    assert.equal(el.ron, 0.1, `${color}: D ron ${el.ron}`);
  }
});

// ── measure(): { on, current } ────────────────────────────────────────────

test('measure(): lit at 14.9 mA is { on: true, current: 14.9 }', () => {
  const def = led();
  assert.equal(typeof def.measure, 'function', 'the LED must define measure()');
  const m = def.measure(result(def, { mode: 'on', current: 14.890, anode: 2.0015 }));
  assert.equal(m.on, true, JSON.stringify(m));
  assert.ok(Math.abs(m.current - 14.890) < 0.01, `current: ${m.current}`);
});

test('measure(): an off diode is not on and carries no current', () => {
  const def = led();
  const m = def.measure(result(def, { mode: 'off', current: 0, cathode: 9, anode: 0, open: -9 }));
  assert.equal(m.on, false, JSON.stringify(m));
  assert.ok(Math.abs(m.current) < 0.001, `current: ${m.current}`);
});

test('measure(): a diode on under the 1 mA threshold (0.7 mA) is not lit', () => {
  const def = led();
  const m = def.measure(result(def, { mode: 'on', current: 0.7, anode: 2.0 }));
  assert.equal(m.on, false, `0.7 mA is below the 1 mA threshold: ${JSON.stringify(m)}`);
});

// ── warnings(): today's messages, word for word ───────────────────────────

test('warnings(): none for an LED lit at 14.9 mA', () => {
  const def = led();
  assert.deepStrictEqual(warningsOf(def, result(def, { mode: 'on', current: 14.890, anode: 2.0015, open: 9 })), []);
});

test('warnings(): over its rating, with the resistor advice from the open-circuit volts', () => {
  const def = led();
  // 150 Ω on 9 V: 46.6 mA. With every diode off the LED sees 9 V, so it
  // needs (9 − 2) / 20 mA = 350 Ω; the next stock value is 470 Ω.
  const w = warningsOf(def, result(def, { mode: 'on', current: 46.636, anode: 2.005, open: 9 }));
  assert.deepStrictEqual(w, [OVER_46]);
});

test('warnings(): the advice follows r.open, not the lit voltage (6 V open → 200 Ω, use 220)', () => {
  const def = led();
  const w = warningsOf(def, result(def, { mode: 'on', current: 30.0, anode: 2.003, open: 6 }));
  assert.deepStrictEqual(w, ['LED is over its 20 mA rating at 30.0 mA. Needs at least 200 ohm in series, so use 220 ohm.']);
});

test('warnings(): backwards, when the cathode sits a forward voltage or more above the anode', () => {
  const def = led();
  const w = warningsOf(def, result(def, { mode: 'off', current: 0, cathode: 9, anode: 0, open: -9 }));
  assert.deepStrictEqual(w, [BACKWARDS]);
});

test('warnings(): current too low, when the diode is on but under the threshold', () => {
  const def = led();
  const w = warningsOf(def, result(def, { mode: 'on', current: 0.7, anode: 2.0, open: 9 }));
  assert.deepStrictEqual(w, [TOO_LOW]);
});

test('warnings(): none for an LED left floating (off, pins null), or leaking only a GMIN trickle', () => {
  const def = led();
  assert.deepStrictEqual(warningsOf(def, result(def, { mode: 'off', current: 0, cathode: null, anode: null, open: 0 })), []);
  // 0.0007 mA is below today's 1 µA "nothing is flowing" floor.
  assert.deepStrictEqual(warningsOf(def, result(def, { mode: 'on', current: 0.0007, anode: 2.0, open: 0 })), []);
});

test('warnings(): straight across the battery (70 A), the two short-circuit lines and nothing else', () => {
  const def = led();
  const w = warningsOf(def, result(def, { mode: 'on', current: 70000, cathode: 0, anode: 9, open: 9 }));
  assert.deepStrictEqual(w, [SHORT_1, SHORT_2]);
});

test('every warning fits the 120-character limit', () => {
  for (const s of [BACKWARDS, TOO_LOW, SHORT_1, SHORT_2, OVER_46]) assert.ok(s.length <= 120, s);
});

// ── report, ai, view, examples ────────────────────────────────────────────

// Issue #26: the AI summary's part lines are now `- <label>: <report>`, so
// the report carries today's summary wording.
test('report(): today\'s summary wording, "LED ON (lit), 14.9 mA" / "LED OFF (dark), 0.0 mA" (#26)', () => {
  const def = led();
  const r = result(def, { mode: 'on', current: 14.890, anode: 2.0015 });
  const line = def.report(r, def.measure(r));
  assert.equal(typeof line, 'string');
  assert.ok(line.length <= 80, line);
  assert.equal(line, 'LED ON (lit), 14.9 mA');
  const off = result(def, { mode: 'off', current: 0, cathode: 9, anode: 0, open: -9 });
  assert.equal(def.report(off, def.measure(off)), 'LED OFF (dark), 0.0 mA');
});

test('ai: the existing place_led tool, found by the word "led"', () => {
  const def = led();
  assert.equal(def.ai.tool || 'place_' + def.type, 'place_led', 'the AI tool name is unchanged');
  assert.ok(def.ai.keywords.includes('led'), `keywords: ${JSON.stringify(def.ai.keywords)}`);
  assert.ok(def.ai.about.length > 0);
});

test('the LED has view.build and view.update (glow / dim), and at least one example', () => {
  const def = led();
  assert.equal(typeof def.view.build, 'function', 'view.build draws the LED and its ghost');
  assert.equal(typeof def.view.update, 'function', 'view.update glows and dims the LED after each simulation');
  assert.ok(def.examples.length >= 1);
});

// ── view.update: the glow scales with current (issue #31, decision 6) ─────
// Lit brightness = today's lit intensity × clamp(current / 15 mA, 0.15, 1.3).
// Read here from the dome's material.emissiveIntensity (userData.ledDome):
// today 3.5 lit and 0.45 dark. So 14.9 mA looks as it does today (×0.993),
// 3.47 mA (a dimmer at 50 %) is about a quarter as bright, and a dark LED
// (under the 1 mA threshold, m.on false) stays at 0.45 with the light off.
// The update is called the way simulate.js calls it: update({ group }, m).

const LIT = 3.5, DARK = 0.45;

// A stand-in for the LED's group: its dome and its glow light, as build()
// marks them, found through group.traverse.
function fakeLed() {
  const dome  = { userData: { ledDome: true },  material: { emissiveIntensity: DARK, opacity: 0.88 } };
  const light = { userData: { ledLight: true }, visible: false, intensity: 8 };
  return { dome, light, obj: { group: { traverse: fn => [dome, light].forEach(fn) } } };
}
function glowAt(m) {
  const f = fakeLed();
  led().view.update(f.obj, m);
  return f;
}
const near = (got, want, what) => assert.ok(Math.abs(got - want) < 0.005, `${what}: expected ${want.toFixed(4)}, got ${got}`);

test('glow: 3.47 mA (the dimmer at 50 %) glows at 3.5 × 3.47 / 15 = 0.810, lit, with the light on', () => {
  const f = glowAt({ on: true, current: 3.4717 });
  near(f.dome.material.emissiveIntensity, LIT * 3.4717 / 15, 'dome emissiveIntensity at 3.47 mA');
  assert.equal(f.light.visible, true, 'a lit LED shows its glow light');
});

test('glow: 14.84 mA (the dimmer at 0 %) and 14.9 mA (the one-LED build) sit at 3.5 × I / 15, within 1 % of today', () => {
  for (const I of [14.840, 14.890]) {
    const f = glowAt({ on: true, current: I });
    near(f.dome.material.emissiveIntensity, LIT * I / 15, `dome at ${I} mA`);
    assert.ok(Math.abs(f.dome.material.emissiveIntensity - LIT) < 0.05, `${I} mA looks as today (3.5)`);
  }
});

test('glow: brighter current is brighter, clamped to 0.15× (1.2 mA → 0.525) and 1.3× (25 mA → 4.55)', () => {
  near(glowAt({ on: true, current: 1.2 }).dome.material.emissiveIntensity, LIT * 0.15, 'dome at 1.2 mA (floor)');
  near(glowAt({ on: true, current: 25 }).dome.material.emissiveIntensity, LIT * 1.3, 'dome at 25 mA (cap)');
  const order = [1.2, 3.47, 8, 14.9, 19.5].map(I => glowAt({ on: true, current: I }).dome.material.emissiveIntensity);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `glow rises with current: ${JSON.stringify(order)}`);
  // A dark LED (m.on false, e.g. the 10 kΩ dimmer's 0.84 mA, or Stop with
  // m = {}) stays at 0.45 with the light off, as today: dimmer than any lit one.
  for (const m of [{ on: false, current: 0.84 }, { on: false, current: 0 }, {}]) {
    const f = glowAt(m);
    assert.equal(f.dome.material.emissiveIntensity, DARK, JSON.stringify(m));
    assert.equal(f.light.visible, false, JSON.stringify(m));
  }
  assert.ok(order[0] > DARK, 'the dimmest lit glow is above the dark one');
});

test('an example lights the LED at about 14.9 mA', () => {
  const def = led();
  const lit = def.examples.some(ex => Object.values(ex.expect || {}).some(e =>
    e.on === true && Array.isArray(e.current) && e.current[0] <= 14.9 && e.current[1] >= 14.9));
  assert.ok(lit, `no example expects { on: true, current: [lo, hi] } around 14.9 mA: ${JSON.stringify(def.examples.map(e => e.expect))}`);
});

// ── checkValue / checkPlacement on the real LED ───────────────────────────

test('checkValue on the real LED: green ok, purple refused with the five colours', () => {
  led();
  assert.deepStrictEqual(Parts.checkValue('led', 'color', 'green'), { ok: true, value: 'green' });
  assert.deepStrictEqual(Parts.checkValue('led', 'color', 'purple'),
    { ok: false, reason: 'color must be one of red, yellow, green, blue, white' });
});

const BOARD = { cols: 63, bodyRows: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] };
// "c8" → { pin, col: 7, row: 'c' }
const leg = (pin, s) => ({ pin, col: +s.slice(1) - 1, row: s[0] });
const placeLed = (cathode, anode, map) =>
  Parts.checkPlacement('led', [leg('cathode', cathode), leg('anode', anode)], map || new Map(), BOARD);

test('checkPlacement on the real LED: 1, 2 and 3 columns apart are ok', () => {
  led();
  assert.deepStrictEqual(placeLed('c8', 'c7'), { ok: true });
  assert.deepStrictEqual(placeLed('c8', 'c6'), { ok: true });
  assert.deepStrictEqual(placeLed('c9', 'c6'), { ok: true });
});

test('checkPlacement on the real LED: 4 columns apart, or 0, is refused with the 1–3 range', () => {
  led();
  const far = placeLed('c10', 'c6');
  assert.equal(far.ok, false);
  assert.ok(far.reason.includes('1–3'), far.reason);
  assert.ok(/\b4\b/.test(far.reason), `names the 4 it is: ${far.reason}`);
  const none = placeLed('c8', 'c8');
  assert.equal(none.ok, false);
  assert.ok(none.reason.includes('1–3'), none.reason);
});

// The old stacked AI build put the LED anode on R1's a6. Once the LED is in
// the registry that is refused, which is why the e2e stubs moved to the
// one-lead-per-hole recipe (R b2–b6, LED c8/c6).
test("checkPlacement on the real LED: the old stacked build's a8→a6 lands on R1's a6 and is refused", () => {
  led();
  const out = placeLed('a8', 'a6', new Map([['a6', { label: 'R1', pin: 'lead2' }]]));
  assert.equal(out.ok, false);
  assert.ok(out.reason.includes("a6 already holds R1's pin lead2"), out.reason);
  assert.deepStrictEqual(placeLed('c8', 'c6', new Map([['b6', { label: 'R1', pin: 'lead2' }]])), { ok: true },
    'the recipe LED at c8/c6 beside R1 on b6 is fine');
});

// ── The browser half ──────────────────────────────────────────────────────

test('in a browser-like page with no THREE or document, led.js defines itself on window.Parts', () => {
  const file = path.join(PARTS_DIR, 'led.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/led.js must exist');
  const win = vm.createContext({ TextEncoder });
  win.window = win;
  vm.runInContext(fs.readFileSync(path.join(PARTS_DIR, 'registry.js'), 'utf8'), win);
  vm.runInContext(fs.readFileSync(file, 'utf8'), win);
  const def = win.Parts.get('led');
  assert.ok(def, 'window.Parts.get("led") after loading led.js');
  assert.equal(def.elements({ color: 'red', vf: 2.0, maxCurrent: 0.02, thresholdCurrent: 0.001 }, {})[0].vf, 2.0);
});

test('parts/led.js draws only through ctx: no App, no document', () => {
  const file = path.join(PARTS_DIR, 'led.js');
  assert.ok(fs.existsSync(file), 'circuit3d/js/parts/led.js must exist');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /\bview\s*:/, 'a view: { build, update } section');
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
});
