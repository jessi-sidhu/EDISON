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
const Sim   = require('../circuit3d/js/simulate.js');
const COLS  = require('../circuit3d/js/board-geometry.js').COLS;   // 63

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

// ── "Backwards" only when a source drives the LED in reverse (bug #73) ────
// Solved by the real simulator (Sim.analyze), not a hand-made PartResult.
// An LED that is dark only because its anode is cut off (behind an off diode
// or an open switch) is not backwards. Once the modes settle, off diodes join
// nothing, so a cut-off anode floats (r.pins.anode null) rather than reading
// the 0 V GMIN leaves it at. A floating anode is still backwards when an off
// diode on its node would cap it well below the cathode: r.pinMax.anode is
// the highest it could reach: the min over off D elements with their anode
// on the node and their cathode driven or itself capped, of (V(cathode), or
// the cathode's own cap) + vf, carried along chains of off diodes; null if
// nothing caps it. The LED warns when V(cathode) − pinMax.anode ≥ vf. The first
// tests check the lines a user sees; the pinMax tests check the shape.

// A board hole: "d12" → { col: 11, row: 'd' }, "tp_2" → { col: 1, row: 'tp' }.
function at(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bp|bn)_(\d+))$/.exec(s);
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const n2 = k => Array.from({ length: k }, () => ({ x: 0, y: 0, z: 0 }));
// A part on body holes, in its pin order (LED: cathode, anode; diode: cathode, anode).
const onBoard = (type, label, holes, extra) =>
  Object.assign({ type, label, pins: n2(holes.length), holeRefs: holes.map(at) }, extra || {});
const hw = (a, b) => ({ startHole: at(a), endHole: at(b) });

// BAT1 off the board, wired to the rails at the highest column as the page
// leaves it. reversed swaps the two wires: + on tn, − on tp.
function wiredBattery(reversed) {
  const bat = { type: 'battery', label: 'BAT1', pins: n2(2), holeRefs: null };
  const wires = [{ startComp: bat, startPinIdx: 0, endHole: at(`${reversed ? 'tn' : 'tp'}_${COLS}`) },
                 { startComp: bat, startPinIdx: 1, endHole: at(`${reversed ? 'tp' : 'tn'}_${COLS}`) }];
  return { bat, wires };
}

function solve(components, wires) {
  const r = Sim.analyze(components, wires);
  assert.equal(r.status, 'ok', `status ${r.status}: ${(r.lines || []).map(l => l.text).join(' | ')}`);
  assert.ok(r.parts.LED1, `analyze().parts has LED1; got ${JSON.stringify(Object.keys(r.parts))}`);
  return r;
}
const warnedOf = r => Object.entries(r.parts).filter(([, q]) => q.warnings && q.warnings.length)
  .map(([l, q]) => `${l}: ${q.warnings.join('; ')}`);
const backwardsLines = r => (r.lines || []).map(l => l.text).filter(t => t.includes('backwards'));
const ledState = r => `LED1 pins ${JSON.stringify(r.parts.LED1.r.pins)}, modes ${JSON.stringify(r.parts.LED1.r.modes)}`;

// The #33 reverse-polarity protection build (diode's ai.recipe layout):
//   tp_2 → a2;  D1 anode b2, cathode b6;  R1 c6–c10 470 Ω;
//   LED1 anode d10, cathode d12;  a12 → tn_12.
// With the battery reversed, tn is +9 V: the LED's cathode sits on it, D1
// blocks, and the D1–R1–LED anode node is cut off from every source.
function protection(reversed) {
  const { bat, wires } = wiredBattery(reversed);
  return {
    components: [bat,
      onBoard('diode',    'D1',   ['b6', 'b2']),
      onBoard('resistor', 'R1',   ['c6', 'c10'], { values: { resistance: 470 } }),
      onBoard('led',      'LED1', ['d12', 'd10'])],
    wires: [...wires, hw('tp_2', 'a2'), hw('a12', 'tn_12')],
  };
}

test('bug #73: the protection build (+ → 1N4148 → 470 Ω → red LED → −) with the battery reversed: LED dark, no part warns, no "backwards" line', () => {
  const { components, wires } = protection(true);
  const r = solve(components, wires);
  assert.equal(r.parts.LED1.m.on, false, `the LED is dark: ${JSON.stringify(r.parts.LED1.m)}`);
  assert.equal(r.parts.D1.m.on, false, `the diode blocks: ${JSON.stringify(r.parts.D1.m)}`);
  assert.deepStrictEqual(warnedOf(r), [],
    `no part warns: the LED is the right way round, only its anode is cut off by the blocking diode (${ledState(r)})`);
  assert.deepStrictEqual(backwardsLines(r), [], 'the results panel has no "backwards" line');
});

test('bug #73: an LED whose anode meets only a blocking diode (D1 cathode on +9 V), its cathode on +9 V: no "backwards" line', () => {
  // tp_2 → a2;  D1 cathode b2, anode b6 (reversed: blocks);
  // LED1 anode d6 (D1's anode column), cathode d10;  a10 → tp_10 (+9 V).
  // Nothing drives the LED's anode: it touches only D1's blocking anode.
  const { bat, wires } = wiredBattery(false);
  const r = solve([bat, onBoard('diode', 'D1', ['b2', 'b6']), onBoard('led', 'LED1', ['d10', 'd6'])],
    [...wires, hw('tp_2', 'a2'), hw('a10', 'tp_10')]);
  assert.equal(r.parts.LED1.m.on, false, JSON.stringify(r.parts.LED1.m));
  assert.deepStrictEqual(r.parts.LED1.warnings, [], `LED1 warnings (${ledState(r)})`);
  assert.deepStrictEqual(backwardsLines(r), [], 'the results panel has no "backwards" line');
});

test('bug #73: an LED behind an open push button, battery reversed (+9 V on its cathode, anode cut off by SW1): no "backwards" line', () => {
  // tp_2 → a4;  SW1 b4–b7 (released);  R1 a7–a11 470 Ω;
  // LED1 anode a11, cathode a16;  b16 → tn_3.  Reversed, tn is +9 V.
  const { bat, wires } = wiredBattery(true);
  const r = solve([bat,
    onBoard('resistor', 'R1',   ['a7', 'a11'], { values: { resistance: 470 } }),
    onBoard('led',      'LED1', ['a16', 'a11']),
    onBoard('button',   'SW1',  ['b4', 'b7'], { controls: { pressed: false } })],
  [...wires, hw('tp_2', 'a4'), hw('b16', 'tn_3')]);
  assert.equal(r.parts.LED1.m.on, false, JSON.stringify(r.parts.LED1.m));
  assert.deepStrictEqual(r.parts.LED1.warnings, [], `LED1 warnings (${ledState(r)})`);
  assert.deepStrictEqual(backwardsLines(r), [], 'the results panel has no "backwards" line');
});

// Pin (passes today): a genuinely backwards LED, reverse-driven through a
// resistor on either side, still says so, word for word, on the real
// simulator. A fix for #73 must not treat a resistor-fed pin as floating.
test('pin: a genuinely backwards red LED on 9 V through 470 Ω still warns "LED is backwards…" (resistor on either side)', () => {
  const cases = [
    // battery → 470 Ω → LED reversed → ground:  tp_2 → a2; R1 b2–b6; LED1 cathode c6, anode c8; a8 → tn_8
    { name: 'resistor on the + side', parts: [
        onBoard('resistor', 'R1',   ['b2', 'b6'], { values: { resistance: 470 } }),
        onBoard('led',      'LED1', ['c6', 'c8'])],
      wires: [hw('tp_2', 'a2'), hw('a8', 'tn_8')] },
    // battery → LED reversed → 470 Ω → ground:  tp_2 → a2; LED1 cathode b2, anode b4; R1 c4–c8; a8 → tn_8
    { name: 'resistor on the − side', parts: [
        onBoard('led',      'LED1', ['b2', 'b4']),
        onBoard('resistor', 'R1',   ['c4', 'c8'], { values: { resistance: 470 } })],
      wires: [hw('tp_2', 'a2'), hw('a8', 'tn_8')] },
  ];
  for (const c of cases) {
    const { bat, wires } = wiredBattery(false);
    const r = solve([bat, ...c.parts], [...wires, ...c.wires]);
    assert.equal(r.parts.LED1.m.on, false, `${c.name}: ${JSON.stringify(r.parts.LED1.m)}`);
    assert.deepStrictEqual(r.parts.LED1.warnings, [BACKWARDS], `${c.name} (${ledState(r)})`);
    assert.deepStrictEqual(backwardsLines(r), ['  ' + BACKWARDS], `${c.name}: the results panel line`);
  }
});

// A floating anode capped by another off diode (#73, second approach).
// + → 470 Ω → LED1 reversed → <second> forward → −:
//   tp_2 → a2;  R1 b2–b6 470 Ω;  LED1 cathode c6, anode c8;
//   <second> anode d8, cathode d10;  a10 → tn_10.
// Both diodes block, so the column-8 node between them floats. LED2's
// cathode is on 0 V, so that node can't rise past 0 + vf before LED2
// conducts; LED1's cathode sits at 9 V, 7 V (LED2) or 8.35 V (1N4148) above
// that. LED1 is genuinely backwards and must say so.
function seriesFlipped(second) {
  const { bat, wires } = wiredBattery(false);
  return solve([bat,
    onBoard('resistor', 'R1',   ['b2', 'b6'], { values: { resistance: 470 } }),
    onBoard('led',      'LED1', ['c6', 'c8']),
    second],
  [...wires, hw('tp_2', 'a2'), hw('a10', 'tn_10')]);
}

test('bug #73: + → 470 Ω → LED1 reversed → LED2 forward → −: LED1 says "backwards", LED2 does not', () => {
  const r = seriesFlipped(onBoard('led', 'LED2', ['d10', 'd8']));
  assert.equal(r.parts.LED1.m.on, false, JSON.stringify(r.parts.LED1.m));
  assert.equal(r.parts.LED2.m.on, false, JSON.stringify(r.parts.LED2.m));
  assert.deepStrictEqual(r.parts.LED1.warnings, [BACKWARDS],
    `LED1 is reversed with 9 V on its cathode and its anode capped at 2 V by LED2 (${ledState(r)}, pinMax ${JSON.stringify(r.parts.LED1.r.pinMax)})`);
  assert.deepStrictEqual(r.parts.LED2.warnings, [], `LED2 is the right way round: pins ${JSON.stringify(r.parts.LED2.r.pins)}`);
  assert.deepStrictEqual(backwardsLines(r), ['  ' + BACKWARDS], 'one "backwards" line in the results panel');
});

test('bug #73: + → 470 Ω → LED1 reversed → 1N4148 forward → −: LED1 says "backwards"', () => {
  const r = seriesFlipped(onBoard('diode', 'D1', ['d10', 'd8']));
  assert.equal(r.parts.LED1.m.on, false, JSON.stringify(r.parts.LED1.m));
  assert.deepStrictEqual(r.parts.LED1.warnings, [BACKWARDS],
    `LED1 is reversed with 9 V on its cathode and its anode capped at 0.65 V by D1 (${ledState(r)}, pinMax ${JSON.stringify(r.parts.LED1.r.pinMax)})`);
  assert.deepStrictEqual(r.parts.D1.warnings, [], 'the blocking 1N4148 gives no warning');
  assert.deepStrictEqual(backwardsLines(r), ['  ' + BACKWARDS], 'one "backwards" line in the results panel');
});

// A chain of off diodes caps too (#73, review): the cap passes along the
// chain, cap(node) = min over off Ds with their anode there of
// (V(cathode) if driven, else cap(cathode)) + vf.
// + → 470 Ω → LED1 reversed → <chain, forward> → −:
//   tp_2 → a2;  R1 b2–b6 470 Ω;  LED1 cathode c6, anode c8;
//   the chain from column 8 to column <last>;  a<last> → tn_<last>.
function seriesChain(chain, last) {
  const { bat, wires } = wiredBattery(false);
  return solve([bat,
    onBoard('resistor', 'R1',   ['b2', 'b6'], { values: { resistance: 470 } }),
    onBoard('led',      'LED1', ['c6', 'c8']),
    ...chain],
  [...wires, hw('tp_2', 'a2'), hw(`a${last}`, `tn_${last}`)]);
}

test('bug #73: + → 470 Ω → LED1 reversed → LED2 → LED3 → −: LED1 says "backwards", its anode capped at (0 + 2) + 2 = 4 V', () => {
  // LED2 anode d8, cathode d10;  LED3 anode e10, cathode e12;  a12 → tn_12.
  // Column 10 floats, capped by LED3 at 0 + 2.0 = 2 V; column 8 by LED2 at
  // 2 + 2.0 = 4 V (LED1 itself would allow 9 + 2 = 11). 9 − 4 = 5 ≥ 2.
  const r = seriesChain([onBoard('led', 'LED2', ['d10', 'd8']), onBoard('led', 'LED3', ['e12', 'e10'])], 12);
  const l1 = r.parts.LED1.r;
  assert.equal(r.parts.LED1.m.on, false, JSON.stringify(r.parts.LED1.m));
  assert.deepStrictEqual(r.parts.LED1.warnings, [BACKWARDS],
    `LED1 is reversed with 9 V on its cathode, its anode capped at 4 V through LED2 and LED3 (${ledState(r)}, pinMax ${JSON.stringify(l1.pinMax)})`);
  assert.deepStrictEqual(r.parts.LED2.warnings, [], `LED2 is the right way round: pins ${JSON.stringify(r.parts.LED2.r.pins)}`);
  assert.deepStrictEqual(r.parts.LED3.warnings, [], `LED3 is the right way round: pins ${JSON.stringify(r.parts.LED3.r.pins)}`);
  assert.deepStrictEqual(backwardsLines(r), ['  ' + BACKWARDS], 'one "backwards" line in the results panel');
  assert.ok(l1.pinMax && typeof l1.pinMax.anode === 'number', `LED1's pinMax.anode is a number; got ${JSON.stringify(l1.pinMax)}`);
  near(l1.pinMax.anode, 4.0, "LED1's pinMax.anode, min(11, (0 + 2) + 2)");
});

test('bug #73: + → 470 Ω → LED1 reversed → 1N4148 → 1N4148 → −: LED1 says "backwards", its anode capped at 0.65 + 0.65 = 1.3 V', () => {
  // D1 anode d8, cathode d12;  D2 anode e12, cathode e16;  a16 → tn_16.
  const r = seriesChain([onBoard('diode', 'D1', ['d12', 'd8']), onBoard('diode', 'D2', ['e16', 'e12'])], 16);
  const l1 = r.parts.LED1.r;
  assert.equal(r.parts.LED1.m.on, false, JSON.stringify(r.parts.LED1.m));
  assert.deepStrictEqual(r.parts.LED1.warnings, [BACKWARDS],
    `LED1 is reversed with 9 V on its cathode, its anode capped at 1.3 V through D1 and D2 (${ledState(r)}, pinMax ${JSON.stringify(l1.pinMax)})`);
  assert.deepStrictEqual(backwardsLines(r), ['  ' + BACKWARDS], 'one "backwards" line in the results panel');
  assert.ok(l1.pinMax && typeof l1.pinMax.anode === 'number', `LED1's pinMax.anode is a number; got ${JSON.stringify(l1.pinMax)}`);
  near(l1.pinMax.anode, 1.3, "LED1's pinMax.anode, min(11, (0 + 0.65) + 0.65)");
});

test('bug #73: the protection build reversed with two red LEDs in parallel after the resistor: no part warns', () => {
  // protection(true) plus LED2 beside LED1: anode e10, cathode e12. Both
  // LEDs' anodes float with R1 and D1's cathode; each caps the node at
  // 9 + 2 = 11 V, above their own cathodes, so neither is backwards.
  const { components, wires } = protection(true);
  const r = solve([...components, onBoard('led', 'LED2', ['e12', 'e10'])], wires);
  assert.equal(r.parts.LED1.m.on, false, JSON.stringify(r.parts.LED1.m));
  assert.equal(r.parts.LED2.m.on, false, JSON.stringify(r.parts.LED2.m));
  assert.deepStrictEqual(warnedOf(r), [], `no part warns (${ledState(r)})`);
  assert.deepStrictEqual(backwardsLines(r), [], 'the results panel has no "backwards" line');
});

test('bug #73: PartResult.pinMax holds only floating pins, each capped by the off diodes on its node', () => {
  // LED1 reversed then LED2 forward: LED1's anode floats, capped by LED2 at
  // its cathode 0 V + vf 2.0 = 2.0 V (LED1 itself would allow 9 + 2 = 11).
  const a = seriesFlipped(onBoard('led', 'LED2', ['d10', 'd8'])).parts.LED1.r;
  assert.equal(a.pins.anode, null, `LED1's anode floats: pins ${JSON.stringify(a.pins)}`);
  assert.ok(a.pins.cathode != null, `LED1's cathode is driven through R1: pins ${JSON.stringify(a.pins)}`);
  assert.ok(a.pinMax && typeof a.pinMax.anode === 'number',
    `LED1's result has pinMax.anode as a number; got pinMax ${JSON.stringify(a.pinMax)}`);
  near(a.pinMax.anode, 2.0, "series build: LED1's pinMax.anode");
  assert.ok(!('cathode' in a.pinMax), `the driven cathode is not in pinMax: ${JSON.stringify(a.pinMax)}`);

  // The #73 protection build reversed: only LED1 itself caps its anode,
  // at its cathode 9 V + vf 2.0 = 11 V.
  const { components, wires } = protection(true);
  const b = solve(components, wires).parts.LED1.r;
  assert.equal(b.pins.anode, null, `LED1's anode floats: pins ${JSON.stringify(b.pins)}`);
  assert.ok(b.pinMax && typeof b.pinMax.anode === 'number',
    `LED1's result has pinMax.anode as a number; got pinMax ${JSON.stringify(b.pinMax)}`);
  near(b.pinMax.anode, 11, "protection build: LED1's pinMax.anode");
  assert.ok(!('cathode' in b.pinMax), `the driven cathode is not in pinMax: ${JSON.stringify(b.pinMax)}`);
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
