// The TL072 dual op-amp, parts/tl072.js (issue #117): a DIP-8 across the
// centre gap, two E elements (issue #116) on the bench supply's ± rails. It
// amplifies, clips at ±10.5 V on ±12 V, current-limits at 20 mA, and warns
// when it has no supply. Readings' problems() gains no-supply,
// output-shorted and clipping (info only). Its definition half loads in
// Node through require('circuit3d/js/parts'); the page (sidebar pick, the
// ghost across the gap, Run, the hover card) is e2e/tl072.spec.js.
//
// Run with:  npm test
//
// The part-file contract (define's rules) and every part's examples[] are
// checked for every registered part by test/parts-registry.test.js and
// test/parts-examples.test.js, so they are not repeated here. The AI side
// (its pack, recipe and ai-eval cases, #118) is test/tl072-ai.test.js.
//
// Seams these tests assume (from the issue; stated so the builder matches
// them):
// - type 'tl072', listed in parts/index.js, loaded by circuit3d/index.html
//   and circuit3d/viewer.html (every part is, so a shared board shows it).
//   name / sub / category / prefix / icon are the builder's pick; the tests
//   label it Ids.nextLabel([], 'tl072').
// - pins in datasheet order, 1 OUT1, 2 IN1−, 3 IN1+, 4 V−, 5 IN2+, 6 IN2−,
//   7 OUT2, 8 V+. The pin NAMES are the builder's pick: the tests use
//   def.pins[k] by index.
// - place { kind: 'footprint', straddle: true, rotations [0, 180] }, legs as
//   a DIP-8: pins 1–4 along one row, pins 5–8 back along the row across the
//   gap (pin 5 opposite pin 4, pin 8 opposite pin 1), like seven_segment.js.
//   The tests read every hole from Parts.footprintLegs, anchored at f30 (or
//   e30 if that is the side the builder anchors on).
// - elements: two E, one per op-amp: out [OUTn, V−], ctrl [INn+, INn−],
//   rails [V−, V+], gain 200 000, rout 50 Ω, headroom 1.5 V, ilim 0.02 A.
// - measure(r) → { vout1, mode1, iout1, vout2, mode2, iout2 } (extra fields
//   allowed): vout in volts against ground (COM), signed; mode the E's own
//   mode ('linear' | 'high' | 'low' | 'isrc+' | 'isrc−'); iout in mA, + when
//   the op-amp sources current out of its OUT pin (the E's sign).
// - No supply: when V+ or V− isn't connected to a source, both outputs are
//   open (they drive nothing), and warnings(r, m) has "the op-amp has no
//   supply: wire V+ (pin 8) and V− (pin 4)" (the − may be U+2212 or '-').
// - The results-panel lines say, per op-amp, "clipped at +10.5 V (the rail)"
//   (high) / "clipped at −10.5 V (the rail)" (low) and "current-limited at
//   20 mA" (isrc±), and a linear op-amp's Vout ("−5.00 V" or "−5.0 V").
// - The hover card: the page shows HoverCard.cardLines(label,
//   readings.part(label)) over a part, so for the TL072 that card carries
//   each op-amp's Vout (signed), its mode wording and Iout. Readings.part
//   and/or cardLines change to do it; the field names are the builder's.
// - Readings.problems() rows: { kind: 'no-supply', labels: [label] };
//   { kind: 'output-shorted', labels: [label, …] } when an output is tied
//   straight to a rail, ground or the other output (it current-limits);
//   a clipped output gives a row naming the label with `info: true` and a
//   why that says it clipped (any kind). No other row has info: true.
//   A plain inverting amp gives no rows at all.
// - Readings.kcl(net) at an op-amp's OUT and V− nets: the E's current
//   enters with the part's pin NAME (def.pins[0] for OUT1, def.pins[3] for
//   V−) and the right sign: + out of out+ means iout1 INTO the OUT net and
//   −iout1 into the V− net. Today kcl reads an E as if it had `pins` and
//   current pin 0 → pin 1, so the pin is undefined and the sign is flipped
//   (#116 review): the OUT net sums to 2·|iout|, not 0, and the flow dots on
//   the V− wires read 0 instead of the op-amp's current.
//
// Every expected number is hand-computed in the comment above its test
// and was checked against the real simulator with a prototype of the part.
// Note: out− is V−, so the drive is u = V(V−) + A·vd, not A·vd. With finite
// A that leaves a sub-millivolt error from the ideal answer: a follower of
// Vin gives Vin − (Vin − V−)/(A + 1) (−0.09 mV at 6 V), the inverting −10
// gives −5.00038 V (−0.66 mV from V−/(1 + A/11), +0.27 mV from the gain).
// So linear outputs are checked within 1 mV of the ideal answer.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const Parts    = require('../circuit3d/js/parts');
const Sim      = require('../circuit3d/js/simulate.js');
const Board    = require('../circuit3d/js/board-model.js');
const Readings = require('../circuit3d/js/readings.js');
const Ids      = require('../circuit3d/js/ids.js');

// Loaded per test, so a module that can't load in Node fails each test by name.
const HoverCard = () => require('../circuit3d/js/tools/hover-card.js');
const FlowDots  = () => require('../circuit3d/js/tools/flow-dots.js');

const PARTS_DIR = path.join(__dirname, '..', 'circuit3d', 'js', 'parts');
const BOARD     = { cols: 63, bodyRows: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] };
const STRADDLE  = 'a chip must sit across the centre gap (rows e and f).';

// The TL072's datasheet values (Aarmen).
const GAIN = 200000, ROUT = 50, HEADROOM = 1.5, ILIM = 0.02;
const RAIL = 12 - HEADROOM;   // 10.5 V on the bench supply's default ±12 V

// Datasheet pin numbers (1-based) → index into def.pins.
const OUT1 = 0, IN1N = 1, IN1P = 2, VNEG = 3, IN2P = 4, IN2N = 5, OUT2 = 6, VPOS = 7;

function tl() {
  const def = Parts.get('tl072');
  assert.ok(def, `Parts.get('tl072') is null: parts/tl072.js must exist and be listed in parts/index.js; parts: ${Parts.all().map(d => d.type).join(', ')}`);
  return def;
}
const label = () => Ids.nextLabel([], 'tl072');

function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);
}
const MINUS = '[−-]';

// ── Where the chip sits ───────────────────────────────────────

const place = (legs, holeMap = new Map()) => Parts.checkPlacement('tl072', legs, holeMap, BOARD);

// The chip's legs at column 30, across the gap: anchored at f30 (as the
// 7-segment display), or at e30 if the builder's footprint anchors there.
function chipLegs() {
  tl();
  for (const anchor of ['f30', 'e30']) {
    const legs = Parts.footprintLegs('tl072', anchor, 0);
    if (legs && legs.every(l => l.hole) && place(legs).ok) return legs;
  }
  assert.fail(`no legs from Parts.footprintLegs('tl072', 'f30' | 'e30', 0) sit across the gap: ` +
              JSON.stringify(Parts.footprintLegs('tl072', 'f30', 0)));
}

// The i-th hole away from the gap in pin k's column (i = 1 is g or d).
function pinHole(k, i) {
  const leg = chipLegs()[k];
  const rows = leg.row === 'f' ? ['f', 'g', 'h', 'i', 'j'] : ['e', 'd', 'c', 'b', 'a'];
  return rows[i] + (leg.col + 1);
}

// ── Boards: the bench supply at ±12 V, and the chip ───────────

const wiresOf = pairs => pairs.map(([from, to], i) => ({ id: 'W' + (i + 1), from, to }));
const res = (lab, holes, ohms) => ({ type: 'resistor', label: lab, holes, values: { resistance: ohms } });
const chip = () => ({ type: 'tl072', label: label(), holes: chipLegs().map(l => l.hole) });

// PS1: + → tp, COM → tn, − → bn. Then tp → V+, bn → V−.
const PS1 = { type: 'bench_supply', label: 'PS1', values: { voltage: 12 } };
const RAILS = () => [['PS1.0', 'tp_1'], ['PS1.1', 'tn_1'], ['PS1.2', 'bn_1']];
const SUPPLY_VPOS = () => ['tp_' + (chipLegs()[VPOS].col + 1), pinHole(VPOS, 4)];
const SUPPLY_VNEG = () => ['bn_' + (chipLegs()[VNEG].col + 1), pinHole(VNEG, 4)];
const POWERED = () => [...RAILS(), SUPPLY_VPOS(), SUPPLY_VNEG()];

// A second supply as a stiff signal source: PS2.0 at `volts`, its COM on tn.
const PS2 = volts => ({ type: 'bench_supply', label: 'PS2', values: { voltage: volts } });
const SIGNAL = at => [['PS2.0', at], ['PS2.1', 'tn_2']];

// A divider from +12 V: top Ra a45–a40, bottom Rb b40–b35, its middle in
// column 40 (d40 to wire on); unloaded, since the inputs draw nothing.
const divider = (ra, rb) => ({
  parts: [res('RA', ['a40', 'a45'], ra), res('RB', ['b40', 'b35'], rb)],
  wires: [['tp_45', 'c45'], ['c35', 'tn_35']],
  mid: 'd40',
});

// The unused half as the datasheet advises: a follower with IN2+ on COM.
const PARK_HALF_2 = () => [[pinHole(IN2P, 1), 'tn_' + (chipLegs()[IN2P].col + 1)], [pinHole(IN2N, 1), pinHole(OUT2, 1)]];

function solve(parts, pairs) {
  const board = Board.toSim({ parts, wires: wiresOf(pairs) });
  const result = Sim.analyze(board.components, board.wires);
  assert.equal(result.status, 'ok', `status ${result.status}: ${text(result)}`);
  const readings = Readings.from(result, board);
  return { result, board, readings, chip: chipResult(result) };
}

function chipResult(result) {
  const p = result.parts && result.parts[label()];
  assert.ok(p, `analyze().parts has no ${label()}; got ${JSON.stringify(Object.keys(result.parts || {}))}`);
  return p;
}

const text = r => (r.lines || []).map(l => l.text).join(' | ');

// problems(), each row checked for its shape.
function problemsOf(readings) {
  const list = readings.problems();
  assert.ok(Array.isArray(list), `problems() should be an array; got ${JSON.stringify(list)}`);
  for (const p of list) {
    assert.ok(typeof p.kind === 'string' && Array.isArray(p.labels) && typeof p.why === 'string' && p.why.length,
      `a problem is { kind, labels[], why }; got ${JSON.stringify(p)}`);
  }
  return list;
}
const errorsOf = list => list.filter(p => p.info !== true);
const clippedRow = (list, lab) => list.find(p => p.info === true && p.labels.includes(lab) && /clip/i.test(p.why));

// ── Circuits (with the chip at f30: OUT1 f30, IN1− f31, IN1+ f32, V− f33,
//    IN2+ e33, IN2− e32, OUT2 e31, V+ e30) ─────────────────────

// Inverting −10: PS2 (vin) → Rin 10 kΩ h20–IN1−; Rf 100 kΩ OUT1–IN1−;
// IN1+ → COM. Half 2 parked unless `floating2`.
function inverting(vin, { floating2 = false, extraParts = [], extraWires = [] } = {}) {
  return solve(
    [PS1, PS2(vin), chip(), res('RIN', ['h20', pinHole(IN1N, 2)], 10000),
     res('RF', [pinHole(OUT1, 3), pinHole(IN1N, 3)], 100000), ...extraParts],
    [...POWERED(), ...SIGNAL('g20'), [pinHole(IN1P, 4), 'tn_' + (chipLegs()[IN1P].col + 1)],
     ...(floating2 ? [] : PARK_HALF_2()), ...extraWires]);
}

// Op-amp 1 with IN1+ at `plus` volts and IN1− at `minus` volts, each from a
// divider of 12 V (unloaded: the inputs draw nothing), OUT1 open.
// 6 V: 1k/1k in column 40; 5 V: 7k (a57–a50) over 5k (b50–b53) in column 50.
function comparator({ swap = false, extraParts = [], extraWires = [] } = {}) {
  const six  = divider(1000, 1000);
  const five = { parts: [res('RC', ['a50', 'a57'], 7000), res('RD', ['b50', 'b53'], 5000)],
                 wires: [['tp_57', 'c57'], ['c53', 'tn_53']], mid: 'd50' };
  const [toPlus, toMinus] = swap ? [five, six] : [six, five];
  return solve(
    [PS1, chip(), ...six.parts, ...five.parts, ...extraParts],
    [...POWERED(), ...six.wires, ...five.wires, ...PARK_HALF_2(),
     [toPlus.mid, pinHole(IN1P, 4)], [toMinus.mid, pinHole(IN1N, 4)], ...extraWires]);
}

// A follower: OUT1 → IN1−, IN1+ from a divider of 12 V.
function follower(ra, rb, extraWires = []) {
  const d = divider(ra, rb);
  return solve([PS1, chip(), ...d.parts],
    [...POWERED(), ...d.wires, ...PARK_HALF_2(), [d.mid, pinHole(IN1P, 4)], [pinHole(OUT1, 1), pinHole(IN1N, 1)], ...extraWires]);
}

const tn = k => 'tn_' + (chipLegs()[k].col + 1);
const tp = k => 'tp_' + (chipLegs()[k].col + 1);

// ── 1. The file, the pages and the pinout ─────────────────────

test('parts/index.js lists tl072.js, the file exists, and both 3D pages load js/parts/tl072.js', () => {
  const src = fs.readFileSync(path.join(PARTS_DIR, 'index.js'), 'utf8');
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(src);
  assert.ok(m, 'parts/index.js must keep its FILES list');
  const files = [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
  assert.ok(files.includes('tl072.js'), `FILES should include 'tl072.js'; got ${JSON.stringify(files)}`);
  assert.ok(fs.existsSync(path.join(PARTS_DIR, 'tl072.js')), 'circuit3d/js/parts/tl072.js must exist');
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    const order = [...html.matchAll(/<script src="([^"]+)"/g)].map(x => x[1]);
    assert.ok(order.includes('js/parts/tl072.js'), `${page} loads js/parts/tl072.js: ${order.join(', ')}`);
  }
});

// The pin-out diagram the inspector draws (#132): pinout { title,
// style: 'dip', labels } with one short name per pin, in pin order
// (def.pins[k] is labels[k]); the registry checks the rules. The page side
// is e2e/tl072.spec.js.
const PINOUT = ['OUT1', 'IN1\u2212', 'IN1+', 'V\u2212', 'IN2+', 'IN2\u2212', 'OUT2', 'V+'];

test('pinout (#132): a DIP diagram titled, with the datasheet names in pin order, one per pin (OUT1 … V− at 4 … V+ at 8)', () => {
  const def = tl();
  const p = def.pinout;
  assert.ok(p && typeof p === 'object', `tl072 must declare a pinout { title, style, labels }; got ${JSON.stringify(p)}`);
  assert.equal(p.style, 'dip');
  assert.ok(typeof p.title === 'string' && p.title.length > 0, `pinout.title is a non-empty string; got ${JSON.stringify(p.title)}`);
  assert.equal(p.labels.length, def.pins.length, 'one label per pin');
  assert.deepEqual([...p.labels], PINOUT);
  // Pin by pin against the datasheet indexes the circuits above use.
  const at = { [OUT1]: 'OUT1', [IN1N]: 'IN1\u2212', [IN1P]: 'IN1+', [VNEG]: 'V\u2212', [IN2P]: 'IN2+', [IN2N]: 'IN2\u2212', [OUT2]: 'OUT2', [VPOS]: 'V+' };
  for (const [k, name] of Object.entries(at)) assert.equal(p.labels[k], name, `pin ${Number(k) + 1} (${def.pins[k]}) is ${name}`);
});

test('pinout (#132): no other registered part has one (the field is new; only the TL072 uses it)', () => {
  tl();
  const others = Parts.all().filter(d => d.type !== 'tl072' && d.pinout !== undefined).map(d => d.type);
  assert.deepEqual(others, []);
});

test('footprint: a DIP-8 straddling the gap — pins 1–4 along one row, 5–8 back along the other (5 opposite 4, 8 opposite 1); refused off the gap', () => {
  const def = tl();
  assert.strictEqual(def.pins.length, 8, `8 pins; got ${JSON.stringify(def.pins)}`);
  assert.strictEqual(def.place.kind, 'footprint');
  assert.strictEqual(def.place.straddle, true, 'place.straddle: true');

  const legs = chipLegs();
  const rows = legs.map(l => l.row), cols = legs.map(l => l.col);
  const near4 = rows.slice(0, 4), far4 = rows.slice(4);
  assert.ok(new Set(near4).size === 1 && new Set(far4).size === 1 && near4[0] !== far4[0]
    && ['e', 'f'].includes(near4[0]) && ['e', 'f'].includes(far4[0]),
    `pins 1–4 in one of rows e/f, pins 5–8 in the other: ${legs.map(l => l.hole).join(' ')}`);
  const step = cols[1] - cols[0];
  assert.ok(Math.abs(step) === 1, `pins 1–4 in neighbouring columns: ${legs.map(l => l.hole).join(' ')}`);
  for (let k = 0; k < 4; k++) {
    assert.strictEqual(cols[k], cols[0] + k * step, `pin ${k + 1} is ${k} columns from pin 1: ${legs.map(l => l.hole).join(' ')}`);
    assert.strictEqual(cols[7 - k], cols[k], `pin ${8 - k} sits across the gap from pin ${k + 1}: ${legs.map(l => l.hole).join(' ')}`);
  }

  // Shifted onto rows a/b (off the gap), the same footprint is refused with the straddle message.
  const off = legs.map(l => ({ col: l.col, row: l.row === 'e' ? 'a' : 'b' }));
  const r = place(off);
  assert.strictEqual(r.ok, false, `a TL072 on rows a/b must be refused: ${JSON.stringify(off)}`);
  assert.strictEqual(r.reason, STRADDLE);
});

test('elements: two E op-amps on the datasheet pins — out [OUTn, V−], ctrl [INn+, INn−], rails [V−, V+], A 200 000, rout 50 Ω, headroom 1.5 V, ilim 20 mA', () => {
  const def = tl();
  const p = def.pins;
  const els = def.elements(Object.fromEntries(Object.entries(def.values || {}).map(([k, s]) => [k, s.default])), {});
  const es = els.filter(e => e.kind === 'E');
  assert.strictEqual(es.length, 2, `two E elements; got ${JSON.stringify(els)}`);
  const want = [{ out: [p[OUT1], p[VNEG]], ctrl: [p[IN1P], p[IN1N]] },
                { out: [p[OUT2], p[VNEG]], ctrl: [p[IN2P], p[IN2N]] }];
  for (const [n, w] of want.entries()) {
    const e = es.find(x => x.out && x.out[0] === w.out[0]);
    assert.ok(e, `an E whose out+ is pin ${n ? 7 : 1} (${w.out[0]}); got ${JSON.stringify(es)}`);
    assert.deepStrictEqual({ out: e.out, ctrl: e.ctrl, rails: e.rails },
      { out: w.out, ctrl: w.ctrl, rails: [p[VNEG], p[VPOS]] }, `op-amp ${n + 1}'s pins`);
    assert.deepStrictEqual({ gain: e.gain, rout: e.rout, headroom: e.headroom, ilim: e.ilim },
      { gain: GAIN, rout: ROUT, headroom: HEADROOM, ilim: ILIM }, `op-amp ${n + 1}'s values`);
  }
});

// ── 2. Simulated against hand calculations, bench supply ±12 V ────

test('follower: IN1+ at 6 V (1k/1k of 12 V) and 3 V (3k/1k) — Vout = Vin within 1 mV, linear, no current', () => {
  // Vout = (V− + A·Vin)/(A + 1) = Vin − (Vin + 12)/200001: 5.99991 V, 2.99992 V.
  for (const [ra, rb, vin] of [[1000, 1000, 6], [3000, 1000, 3]]) {
    const { chip: c, readings } = follower(ra, rb);
    near(c.m.vout1, vin, 0.001, `vout1 following ${vin} V`);
    near(readings.voltage(pinHole(OUT1, 2)), vin, 0.001, `the OUT1 column reads ${vin} V`);
    assert.strictEqual(c.m.mode1, 'linear', `mode1 following ${vin} V`);
    near(c.m.iout1, 0, 0.001, 'iout1 (mA): the inverting input draws nothing');
  }
});

test('inverting −10 (10 kΩ in, 100 kΩ feedback): 0.50 V in gives −5.00 V, linear, 0.05 mA into OUT1; the line says it; no problems', () => {
  // Vout = (−12 − A·0.5·100k/110k) / (1 + A·10k/110k) = −5.00038 V.
  // Iout = −(Vn − Vout)/100 kΩ = −0.0500 mA (sinking through Rf), Vn ≈ 0.
  const { chip: c, result, readings } = inverting(0.5);
  near(c.m.vout1, -5, 0.001, 'vout1');
  near(readings.voltage(pinHole(OUT1, 1)), -5, 0.001, 'the OUT1 column');
  near(readings.voltage(pinHole(IN1N, 1)), 0, 0.001, 'IN1−, the virtual ground');
  assert.strictEqual(c.m.mode1, 'linear');
  near(c.m.iout1, -0.05, 0.0005, 'iout1 (mA, − = sinking)');
  assert.match(text(result), new RegExp(`${MINUS}5\\.00? ?V`), `a results line gives Vout1 −5.00 V: ${text(result)}`);
  assert.deepStrictEqual(problemsOf(readings), [], 'a working inverting amp (half 2 parked as a follower) has no problems');
});

test('inverting −10 with 1.2 V in clips at −10.5 V (low), the line says "clipped at −10.5 V (the rail)", problems() has it as info only', () => {
  // Wants −12 V, past lo = −12 + 1.5. Low mode: Vout = −10.5 + 50 Ω·I, I into
  // OUT1 = (Vn − Vout)/100 kΩ = 0.10632 mA → Vout = −10.49468 V.
  const { chip: c, result, readings } = inverting(1.2);
  near(c.m.vout1, -10.49468, 0.001, 'vout1');
  assert.strictEqual(c.m.mode1, 'low');
  assert.match(text(result), new RegExp(`clipped at ${MINUS}10\\.5 V \\(the rail\\)`), `results lines: ${text(result)}`);
  const list = problemsOf(readings);
  assert.ok(clippedRow(list, label()), `a clipped row (info: true) naming ${label()}: ${JSON.stringify(list)}`);
  assert.deepStrictEqual(errorsOf(list), [], 'clipping is never an error');
});

test('comparator: 6 V against a 5 V reference gives +10.5 V (high); swapped gives −10.5 V (low); each line says "clipped at ±10.5 V (the rail)", info only', () => {
  // A·vd = ±200 000 V, far past either rail; unloaded, so exactly hi / lo.
  for (const [swap, volts, mode, sign] of [[false, RAIL, 'high', '\\+'], [true, -RAIL, 'low', MINUS]]) {
    const { chip: c, result, readings } = comparator({ swap });
    const what = swap ? '5 V vs 6 V' : '6 V vs 5 V';
    near(c.m.vout1, volts, 0.001, `${what}: vout1`);
    near(readings.voltage(pinHole(OUT1, 1)), volts, 0.001, `${what}: the OUT1 column`);
    assert.strictEqual(c.m.mode1, mode, `${what}: mode1`);
    assert.match(text(result), new RegExp(`clipped at ${sign}10\\.5 V \\(the rail\\)`), `${what}: results lines: ${text(result)}`);
    const list = problemsOf(readings);
    assert.ok(clippedRow(list, label()), `${what}: a clipped row (info: true) naming ${label()}: ${JSON.stringify(list)}`);
    assert.deepStrictEqual(errorsOf(list), [], `${what}: a comparator clips on purpose, so no error rows`);
  }
});

test('OUT1 tied to COM through a wire (0 Ω): the follower of 6 V current-limits at +20 mA (isrc+), OUT1 at 0 V, "current-limited at 20 mA", output-shorted', () => {
  // The clipped drive (6 V behind 50 Ω into 0 Ω) would push 120 mA > 20 mA.
  const { chip: c, result, readings } = follower(1000, 1000, [[pinHole(OUT1, 3), tn(OUT1)]]);
  near(c.m.iout1, ILIM * 1000, 0.01, 'iout1 (mA)');
  assert.strictEqual(c.m.mode1, 'isrc+');
  near(readings.voltage(pinHole(OUT1, 2)), 0, 0.001, 'OUT1 is on COM');
  assert.match(text(result), /current-limited at 20 mA/, `results lines: ${text(result)}`);
  const list = problemsOf(readings);
  const row = list.find(p => p.kind === 'output-shorted');
  assert.ok(row && row.labels.includes(label()) && row.info !== true, `an output-shorted error row naming ${label()}: ${JSON.stringify(list)}`);
});

test('output-shorted: OUT1 straight to the +12 V rail (isrc−, −20 mA), and OUT1 straight to OUT2 (one +20 mA, the other −20 mA)', () => {
  // Follower of 3 V with OUT1 on +12 V: the drive (3 V) would pull 180 mA in → isrc−.
  const toRail = follower(3000, 1000, [[pinHole(OUT1, 3), tp(OUT1)]]);
  near(toRail.chip.m.iout1, -ILIM * 1000, 0.01, 'OUT1 on +12 V: iout1 (mA)');
  assert.strictEqual(toRail.chip.m.mode1, 'isrc−', 'OUT1 on +12 V: mode1');

  // Op-amp 1 a comparator driving high, op-amp 2 (IN2+ on COM, IN2− at 6 V) driving low, outputs joined.
  const p = (h, k) => [h, pinHole(k, 4)];
  const fight = solve(
    [PS1, chip(), ...divider(1000, 1000).parts],
    [...POWERED(), ...divider(1000, 1000).wires, p('d40', IN1P), [pinHole(IN1N, 1), tn(IN1N)],
     [pinHole(IN2P, 1), tn(IN2P)], ['e40', pinHole(IN2N, 1)], [pinHole(OUT1, 1), pinHole(OUT2, 1)]]);
  near(fight.chip.m.iout1, ILIM * 1000, 0.01, 'outputs joined: iout1 (mA)');
  near(fight.chip.m.iout2, -ILIM * 1000, 0.01, 'outputs joined: iout2 (mA)');

  for (const [what, s] of [['OUT1 on +12 V', toRail], ['OUT1 on OUT2', fight]]) {
    const list = problemsOf(s.readings);
    const row = list.find(r => r.kind === 'output-shorted');
    assert.ok(row && row.labels.includes(label()), `${what}: an output-shorted row naming ${label()}: ${JSON.stringify(list)}`);
  }
});

test('no supply: V+ or V− unwired — the warning names pins 8 and 4, both outputs are open (OUT1 just follows Rf: 0.50 V), no-supply in problems()', () => {
  // Open output: no current in Rf or Rin, so OUT1 sits at the input, 0.50 V.
  const warning = new RegExp(`the op-amp has no supply: wire V\\+ \\(pin 8\\) and V${MINUS} \\(pin 4\\)`);
  for (const [what, keep] of [['V+ unwired', SUPPLY_VNEG], ['V− unwired', SUPPLY_VPOS]]) {
    const parts = [PS1, PS2(0.5), chip(), res('RIN', ['h20', pinHole(IN1N, 2)], 10000),
                   res('RF', [pinHole(OUT1, 3), pinHole(IN1N, 3)], 100000)];
    const { chip: c, readings } = solve(parts, [...RAILS(), keep(), ...SIGNAL('g20'), [pinHole(IN1P, 4), tn(IN1P)]]);
    assert.ok(c.warnings.some(w => warning.test(w)), `${what}: warnings ${JSON.stringify(c.warnings)}`);
    near(readings.voltage(pinHole(OUT1, 1)), 0.5, 0.001, `${what}: OUT1 is open, so it reads the input through Rf`);
    near(c.m.iout1 || 0, 0, 0.001, `${what}: iout1 (mA)`);
    near(c.m.iout2 || 0, 0, 0.001, `${what}: iout2 (mA)`);
    const list = problemsOf(readings);
    const row = list.find(p => p.kind === 'no-supply');
    assert.ok(row && row.labels.includes(label()) && row.info !== true, `${what}: a no-supply row naming ${label()}: ${JSON.stringify(list)}`);
  }
});

test('both halves: op-amp 2 buffers a 23k/1k divider (0.50 V) into op-amp 1\'s inverting −10 — 0.50 V and −5.00 V', () => {
  // Divider 12·1k/24k = 0.5 V unloaded; the follower gives 0.5 − 12.5/200001
  // = 0.49994 V into Rin 10 kΩ, so op-amp 1 gives −4.99976 V.
  const d = divider(23000, 1000);
  const { chip: c } = solve(
    [PS1, chip(), ...d.parts, res('RIN', [pinHole(OUT2, 2), pinHole(IN1N, 2)], 10000),
     res('RF', [pinHole(OUT1, 3), pinHole(IN1N, 3)], 100000)],
    [...POWERED(), ...d.wires, [d.mid, pinHole(IN2P, 1)], [pinHole(IN2N, 1), pinHole(OUT2, 1)],
     [pinHole(IN1P, 4), tn(IN1P)]]);
  near(c.m.vout2, 0.5, 0.001, 'vout2, the buffer');
  assert.strictEqual(c.m.mode2, 'linear');
  near(c.m.iout2, 0.05, 0.0005, 'iout2 (mA): it sources the 0.05 mA Rin takes');
  near(c.m.vout1, -5, 0.001, 'vout1');
  assert.strictEqual(c.m.mode1, 'linear');
});

test('the unused half left floating (inputs unwired): op-amp 1 still −5.00 V, no problems at all, and the line and hover card call op-amp 2 unused (not clipped)', () => {
  // Half 2's inputs touch nothing, so the model's vd = 0 drive sits at V− and
  // would read "clipped at −10.5 V". A student using one half hasn't made a
  // mistake and hasn't clipped anything: it is unused.
  const s = inverting(0.5, { floating2: true });
  near(s.chip.m.vout1, -5, 0.001, 'vout1');
  assert.deepStrictEqual(problemsOf(s.readings), [], 'an unused half is neither a mistake nor a clipped output (no info row either)');
  const lines = text(s.result);
  assert.match(lines, /op-amp 2[^·|]*unused/i, `the results line calls op-amp 2 unused: ${lines}`);
  assert.doesNotMatch(lines, /op-amp 2[^·|]*clipped/i, `the results line must not say op-amp 2 clipped: ${lines}`);
  const card = (HoverCard().cardLines(label(), s.readings.part(label())) || []).join(' | ');
  assert.match(card, /unused/i, `the hover card calls op-amp 2 unused: ${card}`);
  assert.doesNotMatch(card, /clipped/i, `nothing on the card is clipped (op-amp 1 is linear, op-amp 2 unused): ${card}`);
});

test('a comparator (6 V vs 5 V) driving 330 Ω → red LED → COM current-limits at 20 mA, and output-shorted says the load draws too much (a bigger resistor), not only "tied to ground"', () => {
  // High wants 10.5 V behind 50 Ω into 330 Ω + the LED (2.0 V, 0.1 Ω):
  // (10.5 − 2.0)/380.1 = 22.36 mA > 20 mA, so isrc+ at 20 mA and
  // Vout1 = 2.0 + 0.020·330.1 = 8.602 V.
  // OUT1 h30 → R 330 Ω h30–h26 → LED anode i26, cathode i22 → tn_22.
  const s = comparator({
    extraParts: [res('RLED', [pinHole(OUT1, 2), 'h26'], 330),
                 { type: 'led', label: 'LED1', holes: ['i22', 'i26'], values: { color: 'red' } }],   // [cathode, anode]
    extraWires: [['j22', 'tn_22']],
  });
  near(s.chip.m.iout1, ILIM * 1000, 0.01, 'iout1 (mA)');
  assert.strictEqual(s.chip.m.mode1, 'isrc+');
  near(s.chip.m.vout1, 8.602, 0.002, 'vout1: the LED and 330 Ω at 20 mA');
  const list = problemsOf(s.readings);
  const row = list.find(p => p.kind === 'output-shorted');
  assert.ok(row && row.labels.includes(label()) && row.info !== true, `an output-shorted error row naming ${label()}: ${JSON.stringify(list)}`);
  assert.match(row.why, /too much current|bigger resistor/i, `the why says the load draws too much: ${row.why}`);
});

// ── 3. Readings: kcl, the flow dots and the hover card at the op-amp ──

// Inverting −10 at 0.5 V with a 10 kΩ load. OUT1's own column holds only the
// chip's pin: Rf sits in column 40 and the load RL in columns 50–55, each
// reached by a wire, so the flow dots must take the op-amp's current from kcl.
//   Vout1 = −5.00038 V; RL takes 0.50004 mA from COM into OUT1; Rf 0.05 mA;
//   the op-amp sinks 0.55004 mA (iout1 = −0.55) and returns it out of V−,
//   along bn into PS1's − terminal.
function loadedPairs() {
  return [...RAILS(), SUPPLY_VPOS(), SUPPLY_VNEG(), ...SIGNAL('g20'), [pinHole(IN1P, 4), tn(IN1P)], ...PARK_HALF_2(),
          [pinHole(OUT1, 1), 'g40'], ['h40', 'b50'], ['b55', 'tn_55']];
}
const loaded = () => solve(
  [PS1, PS2(0.5), chip(), res('RIN', ['h20', pinHole(IN1N, 2)], 10000),
   res('RF', ['i40', pinHole(IN1N, 3)], 100000), res('RL', ['a50', 'a55'], 10000)],
  loadedPairs());

// The index of a wire [from, to] in the order solve() was given them
// (board.wires keeps that order, as flows' wires[i] does).
function wireIndex(pairs, pair) {
  const i = pairs.findIndex(p => p[0] === pair[0] && p[1] === pair[1]);
  assert.ok(i >= 0, `wire ${pair.join('→')} is in the board`);
  return i;
}

test('kcl at the op-amp: OUT1\'s net lists pin 1 by name with iout1 into it, V−\'s net pin 4 with −iout1, and each sums to 0 within 1 µA', () => {
  const s = loaded();
  const def = tl(), lab = label();
  const iout = s.chip.m.iout1;
  near(iout, -0.55004, 0.0005, 'iout1 (mA): sinking the load and Rf');
  const sum = list => list.reduce((a, e) => a + e.amps, 0);
  for (const [k, into, what] of [[OUT1, iout, 'OUT1'], [VNEG, -iout, 'V−']]) {
    const list = s.readings.kcl(s.readings.netOf(pinHole(k, 1)));
    const mine = list.filter(e => e.label === lab);
    assert.deepStrictEqual(mine.map(e => e.pin), [def.pins[k]], `${what}: ${lab}'s entry names pin ${k + 1} (${def.pins[k]}); got ${JSON.stringify(list)}`);
    near(mine[0].amps, into, 0.0005, `${what}: ${lab}'s current into the net (mA); list ${JSON.stringify(list)}`);
    assert.ok(Math.abs(sum(list)) <= 0.001, `${what}: kcl sums to ${sum(list)} mA, not 0: ${JSON.stringify(list)}`);
  }
});

test('flow dots: the op-amp\'s sunk current runs from the load into OUT1 and out of V− to PS1\'s − terminal (−0.55 mA on each of those wires)', () => {
  const s = loaded();
  const pairs = loadedPairs();
  const flows = FlowDots().flows(s.readings, s.board);
  // + means start → end. OUT1 → g40: the current comes from g40 (the load) into OUT1, so −.
  near(flows.wires[wireIndex(pairs, [pinHole(OUT1, 1), 'g40'])], -0.55004, 0.0005, 'wire OUT1 → g40 (mA)');
  // bn → V−: it flows out of V− into the bn rail, so −; PS1.2 → bn_1: from bn into PS1's − terminal, so −.
  near(flows.wires[wireIndex(pairs, SUPPLY_VNEG())], -0.55004, 0.0005, `wire ${SUPPLY_VNEG().join(' → ')} (mA)`);
  near(flows.wires[wireIndex(pairs, ['PS1.2', 'bn_1'])], -0.55004, 0.0005, 'wire PS1.2 → bn_1 (mA)');
});

test('hover card over the chip (cardLines of Readings.part): Vout1 signed (−5.0 V), and the mode wording when clipped or current-limited', () => {
  const card = s => (HoverCard().cardLines(label(), s.readings.part(label())) || []).join(' | ');
  const inv = card(inverting(0.5));
  assert.match(inv, new RegExp(`${MINUS}5\\.00? ?V`), `inverting −10 at 0.5 V: card ${inv}`);
  const comp = card(comparator());
  assert.match(comp, /clipped at \+10\.5 V \(the rail\)/, `comparator: card ${comp}`);
  const short = card(follower(1000, 1000, [[pinHole(OUT1, 3), tn(OUT1)]]));
  assert.match(short, /current-limited at 20 mA/, `OUT1 on COM: card ${short}`);
});
