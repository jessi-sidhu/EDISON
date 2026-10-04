// What Readings.part reports for the 2-channel bench supply (issue #124
// fix-up), and what the hover card and the CSV export show from it. Real
// simulator (Sim.analyze), real Readings, no mocks.
//
// The bug: Readings.part(label) reads a part's V as pins[0] − pins[last].
// #124 appended com2 (CH2+) as the supply's last pin, so the supply's V
// became pos − com2: 12 V for a ±12 V series supply (it was pos − neg, 24 V),
// and meaningless when the channels are independent.
//
// Aarmen's decision (the seam these tests pin, for the builder):
// - SERIES (mode 'series', or no mode saved): V = pos − neg, as before #124.
//   No `channels` field.
// - INDEPENDENT: V = CH1's, pos − com, and the result also carries
//     channels: [{ name: 'CH1', V: pos − com }, { name: 'CH2', V: com2 − neg }]
//   (only in independent mode; each channel against its own ground).
// - Every other part's V is unchanged (pins[0] − pins[last]).
// - Hover card (tools/hover-card.js cardLines): for a part with `channels`,
//   the line under the title is each channel's |V| to 1 dp, joined the way
//   the card joins its readings:  'CH1 5.0 V · CH2 9.0 V'.
//   A series supply keeps today's 'V · mA · P' line, V now 24.0.
// - CSV (tools/csv-export.js toCSV): the supply's row keeps the single
//   `V (V)` column, so it shows part.V: 24.00 in series, CH1's 5.00 when
//   independent.
//
// Hand-computed (ideal sources, 1 kΩ loads):
//   series 12 V: pos +12, com 0, neg −12 → V = 24
//   independent: CH1 5 V → pos − com = 5; CH2 9 V → com2 − neg = 9
//   Lab 1 (lab1.sparky, PS1 at 10 V, no mode saved) → V = 10 − (−10) = 20

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const Parts     = require('../circuit3d/js/parts');
const Sim       = require('../circuit3d/js/simulate.js');
const IO        = require('../circuit3d/js/board-io.js');
const Board     = require('../circuit3d/js/board-model.js');
const Readings  = require('../circuit3d/js/readings.js');
const HoverCard = require('../circuit3d/js/tools/hover-card.js');
const { toCSV } = require('../circuit3d/js/tools/csv-export.js');

const supply = () => Parts.get('bench_supply');
const PIN = name => {
  const k = supply().pins.indexOf(name);
  assert.ok(k >= 0, `bench_supply has no pin '${name}'; pins ${JSON.stringify(supply().pins)}`);
  return k;
};

function near(got, want, tol, what) {
  assert.ok(typeof got === 'number' && Math.abs(got - want) <= tol, `${what}: expected ${want} (±${tol}), got ${got}`);
}

function holeRef(s) {
  const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
  assert.ok(m, 'not a hole: ' + s);
  return m[1] ? { col: Number(m[2]) - 1, row: m[1] } : { col: Number(m[4]) - 1, row: m[3] };
}
const pinsOf = n => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));
const text = r => (r.lines || []).map(l => l.text).join(' | ');

// The circuit builder from bench-two-channel.test.js: records the way App
// leaves them; a supply pin end is "PS1.com2", by name.
function circuit() {
  const components = [], wires = [];
  const byLabel = new Map();
  const add = comp => { components.push(comp); byLabel.set(comp.label, comp); return comp; };
  const end = (s, side) => {
    const m = /^([A-Z]+\d+)\.(\w+)$/.exec(s);
    if (!m) return { [side + 'Hole']: holeRef(s) };
    const comp = byLabel.get(m[1]);
    assert.ok(comp, `no ${m[1]} for wire end ${s}`);
    return { [side + 'Comp']: comp, [side + 'PinIdx']: /^\d+$/.test(m[2]) ? Number(m[2]) : PIN(m[2]) };
  };
  return {
    components, wires,
    supply(label, values, mode) {
      const comp = { type: 'bench_supply', label, pins: pinsOf(supply().pins.length), holeRefs: null,
                     values: Object.assign({ voltage: 12, limit: 0.5, voltage2: 12, limit2: 0.5 }, values) };
      if (mode) comp.controls = { mode };
      return add(comp);
    },
    resistor(label, a, b, ohms) {
      return add({ type: 'resistor', label, pins: pinsOf(2), holeRefs: [holeRef(a), holeRef(b)], values: { resistance: ohms } });
    },
    wire(a, b) { wires.push(Object.assign({}, end(a, 'start'), end(b, 'end'))); },
    readings() {
      const r = Sim.analyze(components, wires);
      assert.equal(r.status, 'ok', `status ${r.status}: ${text(r)}`);
      const board = { components, wires };
      return { result: r, board, readings: Readings.from(r, board) };
    },
  };
}

// CH1: pos → tp, com → tn, R1 1 kΩ a10–a14.
function ch1Load(c) {
  c.wire('PS1.pos', 'tp_63');
  c.wire('PS1.com', 'tn_63');
  c.resistor('R1', 'a10', 'a14', 1000);
  c.wire('tp_9', 'b10');
  c.wire('b14', 'tn_15');
}
// CH2: com2 → bp, neg → bn, R2 1 kΩ g20–g24.
function ch2Load(c) {
  c.wire('PS1.com2', 'bp_63');
  c.wire('PS1.neg', 'bn_63');
  c.resistor('R2', 'g20', 'g24', 1000);
  c.wire('bp_20', 'j20');
  c.wire('j24', 'bn_25');
}

// ±12 V series: R1 + → COM on CH1, R2 COM → − (the − rail).
function seriesSupply(mode) {
  const c = circuit();
  c.supply('PS1', { voltage: 12 }, mode);
  ch1Load(c);
  c.wire('PS1.neg', 'bn_63');
  c.resistor('R2', 'f20', 'f24', 1000);
  c.wire('tn_19', 'g20');
  c.wire('g24', 'bn_25');
  return c.readings();
}

function independentSupply() {
  const c = circuit();
  c.supply('PS1', { voltage: 5, voltage2: 9 }, 'independent');
  ch1Load(c);
  ch2Load(c);
  return c.readings();
}

// The supply's row of the CSV, split into cells.
const csvRow = ({ readings, board }, label) => {
  const line = toCSV(readings, board).split('\n').find(l => l.startsWith(label + ','));
  assert.ok(line, `a CSV row for ${label}`);
  return line.split(',');
};

// ── Series ────────────────────────────────────────────────────────────────

test('series, voltage 12, loads across + and −: Readings.part(PS1).V is pos − neg = 24 V, with no channels', () => {
  const { result, readings } = seriesSupply('series');
  const pins = result.parts.PS1.r.pins;
  near(pins.pos - pins.neg, 24, 1e-6, 'sanity: the solve has pos − neg = 24');
  const ps = readings.part('PS1');
  assert.ok(ps, 'Readings.part(PS1)');
  near(ps.V, 24, 1e-6, 'Readings.part(PS1).V (series)');
  assert.ok(!('channels' in ps), `series has no channels field; got ${JSON.stringify(ps.channels)}`);
});

test('series: the hover card and the CSV row show the supply at 24 V', () => {
  const solved = seriesSupply('series');
  const lines = HoverCard.cardLines('PS1', solved.readings.part('PS1'));
  assert.ok(lines && /^24\.0 V( · |$)/.test(lines[1]), `hover card line under the title starts "24.0 V"; got ${JSON.stringify(lines)}`);
  assert.equal(csvRow(solved, 'PS1')[2], '24.00', 'CSV V (V) column for PS1');
});

test('series ±12 V into 1 kΩ per rail: |P(PS1)| is both rails\' power, 2 × 144 mW = 288 mW, and equals R1 + R2', () => {
  // Each rail: 12 V across 1 kΩ → 12 mA, 144 mW. CH1-only V×I would be 144 mW.
  const { readings } = seriesSupply('series');
  const ps = readings.part('PS1');
  near(ps && Math.abs(ps.P), 0.288, 1e-6, '|Readings.part(PS1).P| (series)');
  near(Math.abs(ps.P), readings.part('R1').P + readings.part('R2').P, 1e-6, '|P(PS1)| vs P(R1) + P(R2)');
});

// ── Independent ───────────────────────────────────────────────────────────

test('independent, CH1 5 V and CH2 9 V into 1 kΩ each: V is CH1\'s 5 V; channels CH1 5 V (pos − com), CH2 9 V (com2 − neg)', () => {
  const { readings } = independentSupply();
  const ps = readings.part('PS1');
  assert.ok(ps, 'Readings.part(PS1)');
  near(ps.V, 5, 1e-6, 'Readings.part(PS1).V is CH1\'s pos − com');
  assert.ok(Array.isArray(ps.channels), `independent carries channels; got ${JSON.stringify(ps)}`);
  assert.deepStrictEqual(ps.channels.map(ch => ch.name), ['CH1', 'CH2']);
  near(ps.channels[0].V, 5, 1e-6, 'channels CH1 V');
  near(ps.channels[1].V, 9, 1e-6, 'channels CH2 V');
});

test('independent: the hover card shows both channels, "CH1 5.0 V · CH2 9.0 V"; the CSV V column is CH1\'s 5.00', () => {
  const solved = independentSupply();
  const lines = HoverCard.cardLines('PS1', solved.readings.part('PS1'));
  assert.deepStrictEqual(lines && lines.slice(0, 2), ['PS1', 'CH1 5.0 V · CH2 9.0 V'], `hover card lines ${JSON.stringify(lines)}`);
  assert.equal(csvRow(solved, 'PS1')[2], '5.00', 'CSV V (V) column for PS1');
});

test('independent: |P(PS1)| is both channels\' power, 25 + 81 mW = 106 mW; the hover card says "106 mW total"', () => {
  // CH1 5 V / 1 kΩ → 25 mW; CH2 9 V / 1 kΩ → 81 mW. CH1-only V×I would be 25 mW.
  const solved = independentSupply();
  const ps = solved.readings.part('PS1');
  near(ps && Math.abs(ps.P), 0.106, 1e-6, '|Readings.part(PS1).P| (independent)');
  const lines = HoverCard.cardLines('PS1', ps);
  assert.equal(lines && lines[2], '106 mW total', `hover card lines ${JSON.stringify(lines)}`);
});

// ── Old saves: no mode saved reads like series ────────────────────────────

test('a supply record with no mode saved reads like series: ±12 V → V 24 V, no channels', () => {
  const { readings } = seriesSupply(undefined);
  const ps = readings.part('PS1');
  near(ps && ps.V, 24, 1e-6, 'Readings.part(PS1).V (no mode)');
  assert.ok(!('channels' in ps), `no channels field; got ${JSON.stringify(ps.channels)}`);
});

test('Lab 1 (lab1.sparky, PS1 at 10 V, no mode saved): Readings.part(PS1).V is pos − neg = 20 V', () => {
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'circuit3d', 'labs', 'lab1.sparky'), 'utf8'));
  const rec = file.components.find(x => x.label === 'PS1');
  assert.ok(rec && !(rec.controls && rec.controls.mode), `sanity: Lab 1's PS1 saves no mode; ${JSON.stringify(rec)}`);
  // Loaded the way lab1-circuit.test.js does (app.js's rebuildBoard).
  const components = IO.rebuildComponents(file.components, r => {
    const def = Parts.get(r.type);
    if (!def) return null;
    const comp = { type: r.type, label: r.label, values: r.values || {}, pins: pinsOf(def.pins.length),
                   holeRefs: def.place.kind === 'offboard' ? null : IO.loadHoleRefs(r) };
    if (r.controls) comp.controls = Object.assign({}, r.controls);
    return comp;
  }, t => !!Parts.get(t));
  const end = (hole, ci, name, pi) => {
    const comp = !hole && ci >= 0 ? components[ci] : null;
    return { hole: hole ? { col: hole.col, row: hole.row } : null, comp, idx: comp ? IO.pinIndex(comp, name, pi) : -1 };
  };
  const wires = (file.wires || []).map(w => {
    const a = end(w.startHole, w.startCompIdx, w.startPin, w.startPinIdx);
    const b = end(w.endHole, w.endCompIdx, w.endPin, w.endPinIdx);
    return { startHole: a.hole, endHole: b.hole, startComp: a.comp, startPinIdx: a.idx, endComp: b.comp, endPinIdx: b.idx };
  });
  const board = { components, wires };
  const result = Sim.analyze(components, wires);
  assert.equal(result.status, 'ok', text(result));
  const ps = Readings.from(result, board).part('PS1');
  near(ps && ps.V, 20, 1e-6, 'Readings.part(PS1).V for Lab 1');
  assert.ok(!('channels' in ps), 'no channels field');
});

// ── Pin (passes today): every other part's V is still pins[0] − pins[last] ─

test('pin: other parts keep V = pins[0] − pins[last]: a 9 V battery, a pot across it (1 → 3), R1 in a divider', () => {
  // 9 V across RV1 (pins 1, wiper, 3 at c10 c11 c12; 1 → + rail, 3 → − rail)
  // and across R1 1 kΩ + R2 2 kΩ: V(BAT1) 9, V(RV1) 9, V(R1) 3.
  const board = Board.toSim({
    parts: [{ type: 'battery', label: 'BAT1' },
            { type: 'potentiometer', label: 'RV1', holes: ['c10', 'c11', 'c12'] },
            { type: 'resistor', label: 'R1', holes: ['a20', 'a24'], values: { resistance: 1000 } },
            { type: 'resistor', label: 'R2', holes: ['b24', 'b28'], values: { resistance: 2000 } }],
    wires: [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1'], ['tp_10', 'a10'], ['a12', 'tn_12'],
            ['tp_20', 'c20'], ['c28', 'tn_28']].map(([from, to], i) => ({ id: 'W' + (i + 1), from, to })),
  });
  const result = Sim.analyze(board.components, board.wires);
  assert.equal(result.status, 'ok', text(result));
  const readings = Readings.from(result, board);
  const cases = [['BAT1', 9], ['RV1', 9], ['R1', 3], ['R2', 6]];
  for (const [label, V] of cases) {
    const p = readings.part(label);
    near(p && p.V, V, 1e-3, `Readings.part(${label}).V`);
    assert.ok(!('channels' in p), `${label} has no channels field`);
  }
});
