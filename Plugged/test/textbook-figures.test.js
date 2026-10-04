// The textbook spread's figures and maths, edison/textbook-figures.js, and the
// non-inverting figure circuit, edison/figures/non-inverting.sparky (issue
// #181). Aarmen approved the page's look before these were written, so they
// PIN the module as built: the gain formulas, the ±10.5 V clamp, the worked
// numbers, the "Check yourself" answers and the figure labels. What the page
// does with them (scrubbing, the ✓, "Test in lab +" opening the editor with
// the simulation running) is e2e/edison-textbook-page.spec.js.
//
// Run with:  npm test
//
// API (UMD: window.TextbookFigures in the page, module.exports in Node):
//   gainInv(r1, r2) = −r2/r1     gainNon(r1, r2) = 1 + r2/r1
//   vout(gain, vin) clamped to ±RAIL (a TL072 on ±12 V: 10.5 V)
//   clipped(gain, vin)  true past the rail
//   solve(id, state)    { gain, vout, clipped }, state merged over defaults
//   check(id, text)     the typed "Check yourself" answer is right
//   figureSvg(id)       the schematic as one <svg>
//   FIGURES[id]         { circuit, defaults: { r1, r2, vin }, ... }
//
// The physics: each figure's circuit is read the way the editor rebuilds a
// saved file (load(), copied from test/course-textbook.test.js, itself from
// test/lab1-circuit.test.js) and solved in the real simulator. No mocks.
// Hand-computed: non-inverting gain 1 + 10k/10k = 2, so 0.5 V in → 1.0 V out;
// inverting gain −100k/10k = −10, so 0.5 V in → −5.0 V out.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const Sim      = require('../circuit3d/js/simulate.js');
const IO       = require('../circuit3d/js/board-io.js');
const Parts    = require('../circuit3d/js/parts');
const Readings = require('../circuit3d/js/readings.js');
const UiFlag   = require('../edison/ui-flag.js');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'edison', 'textbook-figures.js');
const IDS  = ['inverting', 'non-inverting'];

// Loaded per test, so a module that can't load in Node fails each test by name.
function TF() {
  assert.ok(fs.existsSync(FILE), 'edison/textbook-figures.js should exist');
  let mod;
  try { mod = require(FILE); } catch (e) {
    assert.fail(`edison/textbook-figures.js can't be loaded in Node: ${e.message.split('\n')[0]}`);
  }
  return mod;
}

// The saved file as the simulator's { components, wires }, the way app.js's
// rebuildBoard places each record and redraws each wire.
function load(file) {
  const components = IO.rebuildComponents(file.components, rec => {
    const def = Parts.get(rec.type);
    if (!def) return null;
    const offboard = def.place.kind === 'offboard';
    const holeRefs = offboard ? null : IO.loadHoleRefs(rec);
    const comp = { type: rec.type, label: rec.label, values: rec.values || {}, holeRefs,
                   pins: def.pins.map(() => ({ x: 0, y: 0, z: 0 })) };
    if (rec.controls) comp.controls = Object.assign({}, rec.controls);
    return comp;
  }, t => !!Parts.get(t));
  const end = (hole, ci, name, pi) => {
    const comp = !hole && ci >= 0 ? components[ci] : null;
    return { hole: hole ? { col: hole.col, row: hole.row } : null, comp, idx: comp ? IO.pinIndex(comp, name, pi) : -1 };
  };
  const wires = (file.wires || []).map(w => {
    const a = end(w.startHole, w.startCompIdx, w.startPin, w.startPinIdx);
    const b = end(w.endHole,   w.endCompIdx,   w.endPin,   w.endPinIdx);
    return { startHole: a.hole, endHole: b.hole, startComp: a.comp, startPinIdx: a.idx,
             endComp: b.comp, endPinIdx: b.idx };
  });
  return { components, wires };
}

function readCircuit(rel) {
  const file = path.join(ROOT, rel);
  assert.ok(fs.existsSync(file), `${rel} should exist under Plugged/`);
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    assert.fail(`${rel} should parse as JSON: ${e.message}`);
  }
  return data;
}

// The visible text of each <text class="tb-fig-label"> (its tspans joined:
// "R" + "1" → "R1"), and of every <text>.
const textsOf = (svg, cls) => [...svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)]
  .filter(m => !cls || m[1].includes(`class="${cls}`))
  .map(m => m[2].replace(/<[^>]+>/g, ''));

test('pin: gainInv is −R2/R1 and gainNon is 1 + R2/R1 (the figures: −10 and 2)', () => {
  const T = TF();
  expect(T.gainInv(10e3, 100e3), 'inverting, R1 10 kΩ, R2 100 kΩ').toBe(-10);
  expect(T.gainNon(10e3, 10e3), 'non-inverting, R1 10 kΩ, R2 10 kΩ').toBe(2);
});

test('pin: vout clamps at ±10.5 V (a TL072 on ±12 V), and clipped() is true only past it', () => {
  const T = TF();
  // [gain, vin, Vout, clipped]
  const rows = [
    [-10, 0.5, -5,    false],
    [-10, 1.2, -10.5, true],    // −12 V asked for: pinned at the − swing
    [2,   0.5, 1,     false],
    [10,  2,   10.5,  true],    // +20 V asked for: pinned at the + swing
  ];
  for (const [gain, vin, v, clip] of rows) {
    expect(T.vout(gain, vin), `vout(${gain}, ${vin})`).toBeCloseTo(v, 9);
    expect(T.clipped(gain, vin), `clipped(${gain}, ${vin})`).toBe(clip);
  }
});

test("pin: solve() at each figure's defaults gives the worked lines: −5 V and 1 V, neither clipped; past the rail it clips", () => {
  const T = TF();
  const inv = T.solve('inverting', T.FIGURES.inverting.defaults);
  expect(inv.gain, 'inverting gain').toBeCloseTo(-10, 9);
  expect(inv.vout, 'inverting: 0.5 V in → Vout').toBeCloseTo(-5, 9);
  expect(inv.clipped, 'inverting at 0.5 V in').toBe(false);

  const non = T.solve('non-inverting', T.FIGURES['non-inverting'].defaults);
  expect(non.gain, 'non-inverting gain').toBeCloseTo(2, 9);
  expect(non.vout, 'non-inverting: 0.5 V in → Vout').toBeCloseTo(1, 9);
  expect(non.clipped, 'non-inverting at 0.5 V in').toBe(false);

  const hot = T.solve('inverting', { vin: 1.2 });
  expect(hot.vout, 'inverting at 1.2 V in: clamped').toBeCloseTo(-10.5, 9);
  expect(hot.clipped, 'inverting at 1.2 V in').toBe(true);
});

test('pin: check() takes −2.35 V on the left page and 20 kΩ (as "20k", "20 k" or "20000") on the right, and rejects a wrong value', () => {
  const T = TF();
  // The answer key agrees with the maths: R2 47 kΩ at 0.5 V in, and the R2 for a gain of 3.
  expect(T.solve('inverting', { r2: 47000 }).vout, 'R2 = 47 kΩ, 0.5 V in').toBeCloseTo(-2.35, 9);
  expect(T.gainNon(10e3, 20e3), 'R2 = 20 kΩ over R1 = 10 kΩ').toBe(3);

  // [id, typed, right?]
  const rows = [
    ['inverting', '-2.35', true],
    ['inverting', '−2.35 V', true],
    ['inverting', '-5', false],
    ['non-inverting', '20k', true],
    ['non-inverting', '20 k', true],
    ['non-inverting', '20000', true],
    ['non-inverting', '10k', false],
  ];
  for (const [id, typed, ok] of rows) expect(T.check(id, typed), `check('${id}', '${typed}')`).toBe(ok);
});

test('figureSvg(id) draws each figure with its R1, R2, Vin and Vout labels, its values and its paths', () => {
  const T = TF();
  const values = {
    inverting:       ['10 kΩ', '100 kΩ', '0.5 V', '−5.0 V'],
    'non-inverting': ['10 kΩ', '0.5 V', '1.0 V'],
  };
  for (const id of IDS) {
    const svg = T.figureSvg(id);
    expect(typeof svg, `figureSvg('${id}') returns markup`).toBe('string');
    expect(svg.startsWith('<svg'), `figureSvg('${id}') is an <svg>`).toBe(true);
    expect(svg, `figureSvg('${id}') names its figure`).toContain(`data-figure-id="${id}"`);
    const labels = textsOf(svg, 'tb-fig-label');
    for (const l of ['R1', 'R2', 'Vin', 'Vout']) expect(labels, `${id}: the ${l} label`).toContain(l);
    const shown = textsOf(svg);
    for (const v of values[id]) expect(shown, `${id}: the value ${v} is shown`).toContain(v);
    expect((svg.match(/<path\b[^>]*\sd="M/g) || []).length, `${id}: drawn with paths`).toBeGreaterThan(5);
  }
});

test("non-inverting.sparky's nets make a non-inverting amp: PS2 + on U1's + input, R2 from OUT1 to the − input, R1 from the − input to ground", () => {
  const file = readCircuit('edison/figures/non-inverting.sparky');
  const board = load(file);
  expect(board.components.every(Boolean), 'every part rebuilds').toBe(true);

  const nets = Readings.nets(board);
  const netOf = (label, pin) => {
    const n = nets.find(x => x.pins.some(p => p.label === label && p.pin === pin));
    expect(n, `${label}.${pin} is on a net`).toBeTruthy();
    return n.id;
  };
  const leads = label => ['lead1', 'lead2'].map(p => netOf(label, p)).sort();
  const pair  = (a, b) => [a, b].sort();

  const ground = netOf('PS1', 'com');            // the ±12 V supply's COM is 0 V
  const minus  = netOf('U1', 'in1n');
  const plus   = netOf('U1', 'in1p');
  const out    = netOf('U1', 'out1');

  expect(netOf('PS2', 'com'), 'PS2 COM on ground, so Vin is measured from 0 V').toBe(ground);
  expect(netOf('PS2', 'pos'), "PS2 + drives U1's + input (in1p)").toBe(plus);
  expect(plus, 'the + input is not grounded').not.toBe(ground);
  expect(leads('R2'), 'R2 runs from OUT1 to the − input').toEqual(pair(out, minus));
  expect(leads('R1'), 'R1 runs from the − input to ground').toEqual(pair(minus, ground));
});

test("each figure's circuit is the one its page shows: same R1, R2 and Vin, an allowed path, and it solves to the worked Vout (−5.0 V; +1.0 V)", () => {
  const T = TF();
  for (const id of IDS) {
    const fig = T.FIGURES[id];
    expect(fig.circuit, `${id}: the circuit "Test in lab +" opens`).toBe(`edison/figures/${id}.sparky`);
    expect(UiFlag.allowedCircuit(fig.circuit), `${fig.circuit} passes the editor's ?open= guard`).toBe(true);

    const file = readCircuit(fig.circuit);
    const rec = label => file.components.find(c => c.label === label);
    expect(rec('R1').values.resistance, `${id}: R1 in the file`).toBe(fig.defaults.r1);
    expect(rec('R2').values.resistance, `${id}: R2 in the file`).toBe(fig.defaults.r2);
    expect(rec('PS2').values.voltage, `${id}: Vin (PS2) in the file`).toBe(fig.defaults.vin);
    expect(rec('U1').type, `${id}: U1 is a TL072`).toBe('tl072');

    const board = load(file);
    const result = Sim.analyze(board.components, board.wires);
    const lines = (result.lines || []).map(l => l.text).join(' | ');
    expect(result.error, `${id}: no error`).toBeUndefined();
    expect(result.status, `${id} status; lines: ${lines}`).toBe('ok');
    expect(result.shorted, `${id} is not a short`).toBe(false);
    const readings = Readings.from(result, board);
    expect(readings.problems(), `${id}: the mistake checker finds nothing`).toEqual([]);
    const want = T.solve(id).vout;
    expect(readings.part('U1').V, `${id}: U1 OUT1, V (the page says ${want} V)`).toBeCloseTo(want, 2);
  }
});
