// Known answers for every registered part (testing contract, item 2): each
// part's examples[] (and its ai.recipe, if any) is built into components and
// wires, run through Sim.analyze, and must match its `expect`. Issue #23.
//
// Nothing here is per part: a new part file is covered as soon as
// parts/index.js lists it.
//
// Shapes these tests assume (docs/API-CONTRACT.md → "Example"):
// - example.parts: [{ type, label, holes?, values?, controls? }]. `holes` are addresses
//   ("a2", "tp_50"), one per pin in pin order; off-board parts have none.
// - example.wires: [[from, to]], each end a hole address or a pin in label
//   form: "BAT1.0" (pin index) or "LED1.anode" (pin name).
// - example.expect: { [label]: { [measure() field]: exact value | [lo, hi] } }.
// - Sim.analyze(...).parts[label] = { r, m, warnings } for registry parts.
// The adapter below builds the records the way App.place* leaves them: a
// label, one pin per leg, holeRefs as { col (0-based), row }, and a
// registry part's values filled in from its defaults.

const assert = require('node:assert');

const Parts = require('../circuit3d/js/parts');
const Sim   = require('../circuit3d/js/simulate.js');

// ── Example → components and wires ──────────────────────────────────────

// "a2" → { col: 1, row: 'a' }; "tp_50" → { col: 49, row: 'tp' }; else null.
function parseHole(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  if (!m) return null;
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}

// A registry part's defaults, as elements() gets them: a choice's overrides
// sit beside the choice's name.
function defaultValues(def) {
  const out = {};
  for (const [key, spec] of Object.entries(def.values || {})) {
    out[key] = spec.default;
    if (spec.choices && spec.choices[spec.default]) Object.assign(out, spec.choices[spec.default]);
  }
  return out;
}

function valuesOf(p) {
  const def = Parts.get(p.type);
  if (def) {
    const v = Object.assign(defaultValues(def), p.values || {});
    for (const [key, val] of Object.entries(p.values || {})) {
      const spec = def.values && def.values[key];
      if (spec && spec.choices && spec.choices[val]) Object.assign(v, spec.choices[val]);
    }
    return v;
  }
  // A part not in the registry: its own values as given. (Sim.PROPS, the
  // old per-type defaults, is gone since #26, when every part is a
  // registry part.)
  return p.values ? Object.assign({}, p.values) : undefined;
}

function toCircuit(ex) {
  const byLabel = new Map();
  const components = ex.parts.map(p => {
    const def = Parts.get(p.type);
    const n = def ? def.pins.length : 2;   // every pre-registry part has 2 pins
    const holeRefs = p.holes ? p.holes.map(h => {
      const ref = parseHole(h);
      assert.ok(ref, `${ex.name}: ${p.label} hole "${h}" is not a board address`);
      return ref;
    }) : null;
    if (holeRefs) assert.equal(holeRefs.length, n, `${ex.name}: ${p.label} needs one hole per pin (${n})`);
    const comp = { type: p.type, label: p.label, pins: Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 })),
                   holeRefs, values: valuesOf(p) };
    if (comp.values === undefined) delete comp.values;
    // A part may set its controls, in the saved record's shape (#26), e.g.
    // a pressed button: { type: 'button', ..., controls: { pressed: true } }.
    if (p.controls) comp.controls = Object.assign({}, p.controls);
    byLabel.set(p.label, { comp, def });
    return comp;
  });

  const end = (s, side) => {
    const hole = parseHole(s);
    if (hole) return { [side + 'Hole']: hole };
    const m = /^([A-Za-z]+\d+)\.(\w+)$/.exec(String(s));
    assert.ok(m, `${ex.name}: wire end "${s}" is neither a hole nor LABEL.pin`);
    const owner = byLabel.get(m[1]);
    assert.ok(owner, `${ex.name}: wire end "${s}" names no part in the example`);
    const idx = /^\d+$/.test(m[2]) ? Number(m[2]) : owner.def ? owner.def.pins.indexOf(m[2]) : -1;
    assert.ok(idx >= 0 && idx < owner.comp.pins.length, `${ex.name}: wire end "${s}" names no pin of ${m[1]}`);
    return { [side + 'Comp']: owner.comp, [side + 'PinIdx']: idx };
  };
  const wires = ex.wires.map(([a, b]) => Object.assign({}, end(a, 'start'), end(b, 'end')));
  return { components, wires };
}

// Every hole an example uses, part legs and wire ends alike.
function holesUsed(ex) {
  const out = [];
  for (const p of ex.parts) for (const h of p.holes || []) out.push(h);
  for (const w of ex.wires) for (const e of w) if (parseHole(e)) out.push(e);
  return out;
}

function checkExpect(ex, result) {
  for (const [label, fields] of Object.entries(ex.expect)) {
    const part = result.parts && result.parts[label];
    assert.ok(part, `${ex.name}: analyze().parts has no "${label}"; got ${JSON.stringify(Object.keys(result.parts || {}))}`);
    assert.ok(part.m && typeof part.m === 'object', `${ex.name}: parts.${label}.m must be measure()'s object`);
    for (const [field, want] of Object.entries(fields)) {
      const got = part.m[field];
      if (Array.isArray(want)) {
        assert.ok(typeof got === 'number' && got >= want[0] && got <= want[1],
          `${ex.name}: ${label}.${field} expected ${want[0]}–${want[1]}, got ${got}`);
      } else {
        assert.deepStrictEqual(got, want, `${ex.name}: ${label}.${field} expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
      }
    }
  }
}

function runExample(ex) {
  const dup = holesUsed(ex).filter((h, i, all) => all.indexOf(h) !== i);
  assert.deepEqual(dup, [], `${ex.name}: a hole holds one lead; used twice: ${dup.join(', ')}`);
  const { components, wires } = toCircuit(ex);
  const r = Sim.analyze(components, wires);
  assert.equal(r.status, 'ok', `${ex.name}: status ${r.status}; ${(r.lines || []).map(l => l.text).join(' | ')}`);
  assert.equal(r.shorted, false, `${ex.name}: shorted`);
  checkExpect(ex, r);
  return r;
}

// ── The resistor is registered ──────────────────────────────────────────

test('require("circuit3d/js/parts") registers the resistor', () => {
  const types = Parts.all().map(d => d.type);
  assert.ok(Parts.get('resistor'), `Parts.get('resistor') is null; registered: ${JSON.stringify(types)}`);
  assert.ok(types.includes('resistor'), `Parts.all() should list the resistor; got ${JSON.stringify(types)}`);
});

// Issue #26: all five of today's parts are registry parts, so each has its
// examples run below.
test('the registry holds all five parts, each with at least one example (#26)', () => {
  for (const type of ['resistor', 'led', 'battery', 'buzzer', 'button']) {
    const def = Parts.get(type);
    assert.ok(def, `Parts.get('${type}') is null; registered: ${JSON.stringify(Parts.all().map(d => d.type))}`);
    assert.ok(def.examples.length >= 1, `${type} has no examples`);
  }
});

// ── Every registered part's examples ────────────────────────────────────

// Parts.all() is read when this file loads; a part added later in the file
// list still gets its own tests.
for (const def of Parts.all()) {
  const cases = def.examples.map((ex, i) => [`examples[${i}]`, ex]);
  if (def.ai && def.ai.recipe) cases.push(['ai.recipe', def.ai.recipe]);
  for (const [where, ex] of cases) {
    test(`${def.type} ${where}: ${ex.name}`, () => { runExample(ex); });
  }
}

test('every registered part has at least one example that names it in expect', () => {
  assert.ok(Parts.all().length > 0, 'no parts are registered');
  for (const def of Parts.all()) {
    const named = def.examples.some(ex =>
      ex.parts.some(p => p.type === def.type && Object.hasOwn(ex.expect, p.label)));
    assert.ok(named, `${def.type}: no example checks the part itself in expect`);
  }
});

// ── The resistor's own known answer ─────────────────────────────────────
// 9 V straight across 470 Ω: I = 9 / 470 = 19.149 mA. Built here with the
// same adapter, so it doesn't depend on how the resistor file words its
// example.

const NINE_VOLTS_ACROSS_470 = {
  name: '9 V across 470 Ω draws 19.1 mA',
  parts: [{ type: 'battery', label: 'BAT1' },
          { type: 'resistor', label: 'R1', holes: ['a10', 'a14'] }],
  wires: [['BAT1.0', 'tp_10'], ['BAT1.1', 'tn_14'], ['tp_9', 'b10'], ['b14', 'tn_15']],
  expect: { R1: { current: [19.1, 19.2] } },
};

test('9 V across a 470 Ω resistor: parts.R1.m.current is 19.1 mA', () => {
  const r = runExample(NINE_VOLTS_ACROSS_470);
  assert.ok(Math.abs(r.parts.R1.m.current - 19.149) < 0.01, `got ${r.parts.R1.m.current}`);
});

test("the resistor's own examples include a battery across it at about 19.1 mA", () => {
  const def = Parts.get('resistor');
  assert.ok(def, 'the resistor is not registered');
  const hits = def.examples.flatMap(ex => {
    const r = runExample(ex);
    return Object.entries(r.parts).filter(([, p]) => p.r && p.r.values && p.r.values.resistance === 470)
      .map(([, p]) => p.m.current);
  });
  assert.ok(hits.some(i => Math.abs(i - 19.149) < 0.05),
    `expected an example with 9 V across 470 Ω (19.1 mA); 470 Ω currents seen: ${JSON.stringify(hits)}`);
});
