// PhotoImport core (issue #136): a confirmed photo Reading → the app's
// actions, rails by printed sign, the battery, and the same circuit.
//
// Contract these tests are written against (docs/API-CONTRACT.md → "Photo →
// circuit (#134)" → "Reading v1", "Mock Reading (the demo board)" and
// "PhotoImport"; circuit3d/js/photo-import.js, UMD like board-model.js):
// - PhotoImport.build(reading, { components }) → { actions, labels, flags,
//   skipped }. Never throws.
// - actions, in order: place_battery per power entry; every part
//   (place_resistor { holeA, holeB, resistance }, place_led { holeA: cathode,
//   holeB: anode, color }); every wire: the battery's leads (BAT1.0 → the +
//   rail, red; BAT1.1 → the − rail, black), then the Reading's wires
//   (add_wire { from: ends[0], to: ends[1], color }). No delete_all.
// - Rails by side and printed sign: a-side + → tp, − → tn; j-side + → bp,
//   − → bn; column = the endpoint's column. A side whose signs are both `?`
//   or the same falls back to outer +, inner −, flagged `rails`.
// - labels: Reading id → app label (Ids.nextLabel; a skipped part shifts
//   later numbers); power:<i> → its battery; Reading wire → W<n>, counted
//   over every add_wire in output order.
// - flags [{ kind, id, why }], skipped [{ id, type, why }].
// - Invariants: every place_* passes Parts.checkPlacement in order against a
//   running hole map (wire ends included) and Board.apply gives no errors;
//   the built board's nets equal the Reading's; LED polarity is never changed.
//
// #136 scope: a part is placed only when both leads are body holes in one
// half with the span in range (resistor 3–5, LED 1–3). Anything that needs
// the bridge (a lead in a rail, span out of range, diagonal across the gap,
// both leads in one node) is not built yet: a `mismatch` flag and listed in
// `skipped`. The bridge is #137, which flips the "not built yet" tests.
//
// Everything below runs the app's real code: Parts, Board.apply, toSim,
// Sim.analyze, Readings. Nothing is mocked.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const Parts    = require('../circuit3d/js/parts');
const Board    = require('../circuit3d/js/board-model.js');
const Sim      = require('../circuit3d/js/simulate.js');
const Readings = require('../circuit3d/js/readings.js');
const GEOMETRY = require('../circuit3d/js/board-geometry.js');

// Loaded lazily so each test reports on its own while the module is missing.
let PhotoImport = null;
try {
  PhotoImport = require('../circuit3d/js/photo-import.js');
} catch (e) {
  if (!(e && e.code === 'MODULE_NOT_FOUND' && /photo-import/.test(e.message))) throw e;
}

function build(reading, components = []) {
  assert.ok(PhotoImport, 'circuit3d/js/photo-import.js does not exist yet (#136)');
  return PhotoImport.build(reading, { components });
}

// ── Reading v1 builders ──────────────────────────────────────────────────

const BB830 = { aOuter: '+', aInner: '-', jInner: '+', jOuter: '-' };

const lead = (hole, role = 'none') => ({ hole, pt: [0, 0], role });
const end  = hole => ({ hole, pt: [0, 0] });

const resistor = (id, a, b, value = 470) => ({
  id, type: 'resistor', what: `${value} Ω resistor`, value, bands: [], color: '',
  leads: [lead(a), lead(b)], box: [0, 0, 0, 0], confidence: 0.8, unsure: [],
});
// Leads in the order given; each { hole, role }.
const ledOf = (id, leads, color = 'red') => ({
  id, type: 'led', what: `${color} 5 mm LED`, value: 0, bands: [], color,
  leads: leads.map(l => lead(l.hole, l.role)), box: [0, 0, 0, 0], confidence: 0.7, unsure: [],
});
const led = (id, cathode, anode, color = 'red') =>
  ledOf(id, [{ hole: cathode, role: 'cathode' }, { hole: anode, role: 'anode' }], color);
const wire = (id, color, a, b) => ({ id, color, ends: [end(a), end(b)], confidence: 0.9, unsure: [] });
const battery = (plus, minus, volts = 9, kind = 'battery_9v') => ({ kind, volts, plus: end(plus), minus: end(minus), unsure: [] });

function reading({ parts = [], wires = [], power = [], rails = BB830, cols = 63 } = {}) {
  return { board: { visible: true, cols, rails: Object.assign({}, rails), split: false }, parts, wires, power };
}

// The stage board (the photo spec's stage-board rule, #144): a 9 V battery
// on the a-side rails, 470 Ω fully in the main holes with a jumper from the
// + rail, a red LED (backwards unless `ledPart` says otherwise), and a
// black return wire to the − rail. Imports with no bridge and no flags.
// Fresh objects on every call: some tests edit the Reading they get.
const stage = (ledPart = led('LED1', 'c14', 'c17')) => reading({
  parts: [resistor('R1', 'a10', 'a14'), ledPart],
  wires: [wire('W1', 'red', 'rail:aOuter:10', 'b10'), wire('W2', 'black', 'b17', 'rail:aInner:19')],
  power: [battery('rail:aOuter:3', 'rail:aInner:3')],
});

// The contract's own mock Reading, read from docs/API-CONTRACT.md so the
// test follows the contract.
function contractMockReading() {
  const doc = fs.readFileSync(path.join(__dirname, '../../docs/API-CONTRACT.md'), 'utf8');
  const at  = doc.indexOf('#### Mock Reading (the demo board)');
  assert.ok(at >= 0, 'docs/API-CONTRACT.md has no "Mock Reading (the demo board)" section');
  const m = /```json\s*\n([\s\S]*?)\n```/.exec(doc.slice(at));
  assert.ok(m, 'the Mock Reading section has no ```json block');
  return JSON.parse(m[1]);
}

// ── Checks ───────────────────────────────────────────────────────────────

const HOLE = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/;
const ref  = h => { const m = HOLE.exec(String(h)); if (!m) return null; return m[1] ? { col: +m[2] - 1, row: m[1] } : { col: +m[4] - 1, row: m[3] }; };
const BOARD = { cols: GEOMETRY.COLS, bodyRows: GEOMETRY.BODY_ROWS };
const toolOf = def => (def.ai && def.ai.tool) || 'place_' + def.type;
const defFor = tool => Parts.all().find(d => toolOf(d) === tool) || null;

const wiresOf  = out => out.actions.filter(a => a.tool === 'add_wire');
const placesOf = out => out.actions.filter(a => a.tool !== 'add_wire' && a.tool !== 'place_battery');
const kinds    = out => out.flags.map(f => `${f.kind}:${f.id}`);
const skippedIds = out => out.skipped.map(s => s.id);
const hasFlag  = (out, kind, id) => out.flags.some(f => f.kind === kind && f.id === id);

// The contract's invariants on any build: the order (battery, parts, wires;
// no delete_all), zero refusals (every place_* passes Parts.checkPlacement in
// order against the running hole map, wire ends included; no hole holds two
// leads), and Board.apply gives no errors. → the built board.
function checkInvariants(out) {
  const { actions } = out;
  assert.ok(Array.isArray(actions), `actions is not an array: ${JSON.stringify(out)}`);
  assert.ok(!actions.some(a => a.tool === 'delete_all'), 'a photo build never emits delete_all');

  const rank = a => (a.tool === 'place_battery' ? 0 : a.tool === 'add_wire' ? 2 : 1);
  const ranks = actions.map(rank);
  assert.deepStrictEqual(ranks, ranks.slice().sort((p, q) => p - q),
    `actions must be the battery, then every part, then every wire; got ${actions.map(a => a.tool).join(', ')}`);

  const map = new Map();
  actions.forEach((a, i) => {
    if (a.tool === 'add_wire') {
      for (const h of [a.from, a.to]) {
        const r = ref(h);
        if (!r) continue;   // a BAT1.0-style pin end
        assert.ok(!map.has(h), `action ${i} add_wire ${a.from}→${a.to}: ${h} already holds ${JSON.stringify(map.get(h))}`);
        map.set(h, { wire: i });
      }
      return;
    }
    const def = defFor(a.tool);
    assert.ok(def, `action ${i}: unknown tool ${a.tool}`);
    if (def.place.kind !== 'span') return;
    const legs = [a.holeA, a.holeB].map((h, k) => Object.assign({ pin: def.pins[k], hole: h }, ref(h)));
    const check = Parts.checkPlacement(def.type, legs, map, BOARD);
    assert.ok(check.ok, `action ${i} ${a.tool} ${a.holeA}/${a.holeB} refused: ${check.reason}`);
    for (const l of legs) map.set(l.hole, { label: def.type, pin: l.pin });
  });

  const { board, errors } = Board.apply(Board.empty(), actions);
  assert.deepStrictEqual(errors, [], `Board.apply errors: ${JSON.stringify(errors)}`);
  return board;
}

// A Reading endpoint's node: column + half for a body hole, the strip for a
// rail (each rail is one node). Truth only needs strips one to one, so the
// Reading's own strip names do.
function readingNode(hole) {
  let m = /^([a-j])(\d+)$/.exec(hole);
  if (m) return ('abcde'.includes(m[1]) ? 'top:' : 'bot:') + m[2];
  m = /^rail:(\w+):\d+$/.exec(hole);
  if (m) return 'rail:' + m[1];
  return null;
}

// The Reading's terminals with the app pin each becomes: a resistor's
// leads[k] → pin k (holeA, holeB); an LED's cathode → pin 'cathode', anode
// → 'anode' (unknown roles: the first dot is the anode); a battery's plus
// → pin 0, minus → pin 1.
function terminals(rd, out) {
  const terms = [];
  const ledPins = Parts.get('led').pins;
  for (const p of rd.parts) {
    const label = out.labels[p.id];
    if (!label || skippedIds(out).includes(p.id)) continue;
    p.leads.forEach((l, k) => {
      let pin = k;
      if (p.type === 'led') {
        const role = l.role === 'anode' || l.role === 'cathode' ? l.role : (k === 0 ? 'anode' : 'cathode');
        pin = ledPins.indexOf(role);
      }
      terms.push({ name: `${p.id}.${k}`, node: readingNode(l.hole), label, pin });
    });
  }
  rd.power.forEach((s, i) => {
    const label = out.labels[`power:${i}`];
    if (!label) return;
    terms.push({ name: `power:${i}.plus`, node: readingNode(s.plus.hole), label, pin: 0 });
    terms.push({ name: `power:${i}.minus`, node: readingNode(s.minus.hole), label, pin: 1 });
  });
  return terms;
}

// Same nets: two terminals are joined in the Reading (union-find over its
// nodes through its built wires) exactly when they are joined on the built
// board (the solver's own graph).
function assertSameNets(rd, out, board) {
  const parent = new Map();
  const find = x => { if (!parent.has(x)) parent.set(x, x); while (parent.get(x) !== x) x = parent.get(x); return x; };
  for (const w of rd.wires) {
    if (skippedIds(out).includes(w.id)) continue;
    parent.set(find(readingNode(w.ends[0].hole)), find(readingNode(w.ends[1].hole)));
  }
  const sim = Board.toSim(board);
  const built = {};
  Sim.buildGraph(sim.components, sim.wires).forEach(g => { built[g.comp.label] = g.nodes.slice(); });

  const terms = terminals(rd, out);
  assert.ok(terms.length >= 2, `no built terminals to compare: labels ${JSON.stringify(out.labels)}`);
  const bad = [];
  for (let i = 0; i < terms.length; i++) for (let j = i + 1; j < terms.length; j++) {
    const a = terms[i], b = terms[j];
    assert.ok(built[a.label], `${a.label} is not on the built board`);
    const t = find(a.node) === find(b.node);
    const g = built[a.label][a.pin] === built[b.label][b.pin];
    if (t !== g) bad.push(`${a.name} & ${b.name}: Reading ${t ? 'joined' : 'apart'}, built ${g ? 'joined' : 'apart'}`);
  }
  assert.deepStrictEqual(bad, [], 'the built board must have the Reading\'s nets');
}

function simulate(board) {
  const sim = Board.toSim(board);
  const r = Sim.analyze(sim.components, sim.wires);
  return { r, problems: Readings.from(r, sim).problems() };
}

const backwardsFor = (problems, label) => problems.some(p => p.kind === 'backwards' && p.labels.includes(label));

// ── The stage board: exact output, the same circuit, what it simulates ──

test('the stage board builds exact actions and labels, with no flags and nothing skipped', () => {
  const out = build(stage());
  assert.deepStrictEqual(out, {
    actions: [
      { tool: 'place_battery', voltage: 9 },
      { tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 },
      { tool: 'place_led', holeA: 'c14', holeB: 'c17', color: 'red' },     // cathode c14: backwards, as photographed
      { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3', color: 'red' },     // W1
      { tool: 'add_wire', from: 'BAT1.1', to: 'tn_3', color: 'black' },   // W2
      { tool: 'add_wire', from: 'tp_10', to: 'b10', color: 'red' },       // W3, the Reading's W1
      { tool: 'add_wire', from: 'b17', to: 'tn_19', color: 'black' },     // W4, the Reading's W2
    ],
    labels: { 'power:0': 'BAT1', R1: 'R1', LED1: 'LED1', W1: 'W3', W2: 'W4' },
    flags: [],
    skipped: [],
  });
});

test('the stage board passes every placement check in order, applies cleanly, and has the Reading\'s nets', () => {
  const rd = stage();
  const out = build(rd);
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
});

test('the stage board simulates with LED1 dark and a backwards problem; flipped in the app, about 14.9 mA', () => {
  const board = checkInvariants(build(stage()));
  const back = simulate(board);
  const m = back.r.parts.LED1.m;
  assert.strictEqual(m.on, false, 'the backwards LED must be dark');
  assert.ok(Math.abs(m.current) < 0.01, `backwards LED1 current expected ~0 mA, got ${m.current}`);
  assert.ok(backwardsFor(back.problems, 'LED1'), `expected a backwards problem for LED1, got ${JSON.stringify(back.problems)}`);

  // The fix in the app: swap LED1's two holes (F in place mode), nothing else.
  const flipped = JSON.parse(JSON.stringify(board));
  flipped.parts.find(p => p.label === 'LED1').holes.reverse();
  const fixed = simulate(flipped);
  const f = fixed.r.parts.LED1.m;
  assert.ok(f.on && f.current > 14.8 && f.current < 15.0, `flipped LED1 expected on at 14.8–15.0 mA, got on=${f.on} ${f.current}`);
  assert.deepStrictEqual(fixed.problems, []);
});

// ── LED polarity is kept exactly as confirmed ────────────────────────────

test.each([
  { name: 'backwards, cathode listed first', leds: [{ hole: 'c14', role: 'cathode' }, { hole: 'c17', role: 'anode' }], cathode: 'c14', anode: 'c17', on: false },
  { name: 'backwards, anode listed first',   leds: [{ hole: 'c17', role: 'anode' }, { hole: 'c14', role: 'cathode' }], cathode: 'c14', anode: 'c17', on: false },
  { name: 'forwards, cathode listed first',  leds: [{ hole: 'c17', role: 'cathode' }, { hole: 'c14', role: 'anode' }], cathode: 'c17', anode: 'c14', on: true },
  { name: 'forwards, anode listed first',    leds: [{ hole: 'c14', role: 'anode' }, { hole: 'c17', role: 'cathode' }], cathode: 'c17', anode: 'c14', on: true },
])('LED polarity is never changed ($name): holeA is the confirmed cathode', ({ leds, cathode, anode, on }) => {
  const rd = stage(ledOf('LED1', leds));
  const out = build(rd);
  const place = out.actions.find(a => a.tool === 'place_led');
  assert.deepStrictEqual(place, { tool: 'place_led', holeA: cathode, holeB: anode, color: 'red' });
  assert.ok(!hasFlag(out, 'polarity', 'LED1'), `no polarity flag when both roles are known; got ${kinds(out)}`);
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
  const m = simulate(board).r.parts.LED1.m;
  if (on) assert.ok(m.on && m.current > 14.8 && m.current < 15.0, `forwards LED1 expected on at 14.8–15.0 mA, got on=${m.on} ${m.current}`);
  else assert.ok(!m.on && Math.abs(m.current) < 0.01, `backwards LED1 expected dark, got on=${m.on} ${m.current}`);
});

test('an LED whose leads have unknown roles takes the first dot as the anode, flagged polarity', () => {
  const rd = stage(ledOf('LED1', [{ hole: 'c14', role: 'unknown' }, { hole: 'c17', role: 'unknown' }]));
  const out = build(rd);
  assert.deepStrictEqual(out.actions.find(a => a.tool === 'place_led'), { tool: 'place_led', holeA: 'c17', holeB: 'c14', color: 'red' });
  assert.ok(hasFlag(out, 'polarity', 'LED1'), `expected a polarity flag for LED1, got ${JSON.stringify(kinds(out))}`);
  assertSameNets(rd, out, checkInvariants(out));
});

// ── The contract's mock Reading, in #136 (no bridge yet) ─────────────────

test('the contract\'s mock Reading (#136, no bridge yet): R1\'s rail lead leaves it unbuilt with a mismatch flag; LED1 still built backwards', () => {
  const rd = contractMockReading();
  const out = build(rd);
  assert.deepStrictEqual(out.actions, [
    { tool: 'place_battery', voltage: 9 },
    { tool: 'place_led', holeA: 'c14', holeB: 'c17', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_3', color: 'black' },
    { tool: 'add_wire', from: 'b17', to: 'tn_19', color: 'black' },
  ]);
  // R1 is not built, so it has no app label; the Reading's W1 is the third add_wire.
  assert.deepStrictEqual(out.labels, { 'power:0': 'BAT1', LED1: 'LED1', W1: 'W3' });
  assert.deepStrictEqual(kinds(out), ['mismatch:R1']);
  assert.deepStrictEqual(out.skipped.map(s => [s.id, s.type]), [['R1', 'resistor']]);
  assertSameNets(rd, out, checkInvariants(out));
});

// ── Rails by side and printed sign ───────────────────────────────────────

// A Reading touching all four strips: the battery on the a-side + and −
// strips, and one wire from a body hole into each strip.
function fourRails(rails) {
  const plus  = rails.aOuter === '-' && rails.aInner === '+' ? 'aInner' : 'aOuter';
  const minus = plus === 'aOuter' ? 'aInner' : 'aOuter';
  return reading({
    rails,
    wires: [wire('W1', 'red', 'a5', 'rail:aOuter:5'), wire('W2', 'black', 'b6', 'rail:aInner:6'),
            wire('W3', 'red', 'i20', 'rail:jInner:20'), wire('W4', 'black', 'j25', 'rail:jOuter:25')],
    power: [battery(`rail:${plus}:3`, `rail:${minus}:3`)],
  });
}
const railOfWire = (out, from) => {
  const w = wiresOf(out).find(a => a.from === from);
  assert.ok(w, `no add_wire from ${from}: ${JSON.stringify(wiresOf(out))}`);
  return w.to;
};

test.each([
  { name: 'BB830 order: + outer on the a-side, + inner on the j-side', rails: BB830,
    want: { a5: 'tp_5', b6: 'tn_6', i20: 'bp_20', j25: 'bn_25' } },
  { name: 'the opposite print on both sides', rails: { aOuter: '-', aInner: '+', jInner: '-', jOuter: '+' },
    want: { a5: 'tn_5', b6: 'tp_6', i20: 'bn_20', j25: 'bp_25' } },
])('rails map by side and printed sign, column kept ($name)', ({ rails, want }) => {
  const rd = fourRails(rails);
  const out = build(rd);
  const got = {};
  for (const from of Object.keys(want)) got[from] = railOfWire(out, from);
  assert.deepStrictEqual(got, want);
  assert.ok(!out.flags.some(f => f.kind === 'rails'), `signs were read, so no rails flag; got ${JSON.stringify(kinds(out))}`);
  assertSameNets(rd, out, checkInvariants(out));
});

test.each([
  { name: 'a-side both ?', rails: { aOuter: '?', aInner: '?', jInner: '+', jOuter: '-' },
    want: { a5: 'tp_5', b6: 'tn_6', i20: 'bp_20', j25: 'bn_25' } },
  { name: 'a-side both +', rails: { aOuter: '+', aInner: '+', jInner: '+', jOuter: '-' },
    want: { a5: 'tp_5', b6: 'tn_6', i20: 'bp_20', j25: 'bn_25' } },
  { name: 'j-side both ?', rails: { aOuter: '+', aInner: '-', jInner: '?', jOuter: '?' },
    want: { a5: 'tp_5', b6: 'tn_6', i20: 'bn_20', j25: 'bp_25' } },
  { name: 'j-side both −', rails: { aOuter: '+', aInner: '-', jInner: '-', jOuter: '-' },
    want: { a5: 'tp_5', b6: 'tn_6', i20: 'bn_20', j25: 'bp_25' } },
])('a side with unreadable or equal signs falls back to outer +, inner −, flagged rails ($name)', ({ rails, want }) => {
  const rd = fourRails(rails);
  const out = build(rd);
  const got = {};
  for (const from of Object.keys(want)) got[from] = railOfWire(out, from);
  assert.deepStrictEqual(got, want);
  assert.ok(hasFlag(out, 'rails', null), `expected a rails flag (id null), got ${JSON.stringify(kinds(out))}`);
  assertSameNets(rd, out, checkInvariants(out));
});

// ── Taken holes move within their node ───────────────────────────────────

test('a wire end on a rail hole the battery already took moves to the next column of that rail, flagged moved', () => {
  const rd = reading({
    parts: [resistor('R1', 'a5', 'a9')],
    wires: [wire('W1', 'red', 'e5', 'rail:aOuter:3'), wire('W2', 'black', 'e9', 'rail:aInner:20')],
    power: [battery('rail:aOuter:3', 'rail:aInner:3')],
  });
  const out = build(rd);
  assert.deepStrictEqual(wiresOf(out)[0], { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3', color: 'red' });
  const to = railOfWire(out, 'e5');
  assert.ok(to === 'tp_4' || to === 'tp_2', `W1's rail end expected in the next column of tp (tp_4 or tp_2), got ${to}`);
  assert.ok(hasFlag(out, 'moved', 'W1'), `expected a moved flag for W1, got ${JSON.stringify(kinds(out))}`);
  assertSameNets(rd, out, checkInvariants(out));
});

test.each([
  { name: 'an LED lead in a resistor lead\'s hole', item: 'LED1',
    extra: { parts: [resistor('R1', 'a10', 'a14'), led('LED1', 'a14', 'a17')], wires: [] },
    moved: out => {
      const p = out.actions.find(a => a.tool === 'place_led');
      const A = ref(p.holeA), B = ref(p.holeB);
      assert.ok(p.holeA !== 'a14' && A.col === 13 && 'abcde'.includes(A.row), `LED1's cathode expected in column 14 a–e, not a14; got ${p.holeA}`);
      assert.ok(B.col === 16 && B.row === A.row, `LED1's anode expected in column 17 on the cathode's row; got ${p.holeB}`);
    } },
  { name: 'a wire end in a resistor lead\'s hole', item: 'W1',
    extra: { parts: [resistor('R1', 'a10', 'a14')], wires: [wire('W1', 'black', 'a14', 'rail:aInner:14')] },
    moved: out => {
      const w = wiresOf(out).find(a => a.to === 'tn_14');
      assert.ok(w, `W1 expected to end at tn_14: ${JSON.stringify(wiresOf(out))}`);
      const A = ref(w.from);
      assert.ok(w.from !== 'a14' && A && A.col === 13 && 'abcde'.includes(A.row), `W1's body end expected in column 14 a–e, not a14; got ${w.from}`);
    } },
])('two leads in one hole: the second moves to a free hole in the same column-half, flagged moved ($name)', ({ item, extra, moved }) => {
  const rd = reading(Object.assign({ power: [battery('rail:aOuter:3', 'rail:aInner:3')] }, extra));
  const out = build(rd);
  moved(out);
  assert.ok(hasFlag(out, 'moved', item), `expected a moved flag for ${item}, got ${JSON.stringify(kinds(out))}`);
  assert.deepStrictEqual(out.skipped, []);
  assertSameNets(rd, out, checkInvariants(out));
});

test.each([
  { name: 'two holes of one column-half', ends: ['a20', 'c20'] },
  { name: 'two holes of one rail',        ends: ['rail:aOuter:3', 'rail:aOuter:20'] },
])('a wire with both ends in one node is dropped and listed in skipped ($name)', ({ ends }) => {
  const rd = reading({
    parts: [resistor('R1', 'a10', 'a14')],
    wires: [wire('W1', 'green', ends[0], ends[1]), wire('W2', 'red', 'rail:aOuter:10', 'b10')],
    power: [battery('rail:aOuter:5', 'rail:aInner:5')],
  });
  const out = build(rd);
  assert.deepStrictEqual(wiresOf(out).map(w => w.color), ['red', 'black', 'red'], 'only the battery leads and W2 are built');
  assert.deepStrictEqual(skippedIds(out), ['W1']);
  assert.strictEqual(out.labels.W1, undefined, 'a dropped wire has no app id');
  assert.strictEqual(out.labels.W2, 'W3');
  assertSameNets(rd, out, checkInvariants(out));
});

// ── Power ────────────────────────────────────────────────────────────────

// A forwards LED circuit on the rails with no power entry.
test.each([
  { name: 'a-side rails only',
    wires: [wire('W1', 'red', 'rail:aOuter:8', 'b10'), wire('W2', 'black', 'b17', 'rail:aInner:19')],
    rails: ['tp', 'tn'] },
  { name: 'the a-side + rail and the j-side − rail',
    wires: [wire('W1', 'red', 'rail:aOuter:8', 'b10'), wire('W2', 'yellow', 'd17', 'g17'), wire('W3', 'black', 'h17', 'rail:jOuter:19')],
    rails: ['tp', 'bn'] },
])('no power entry but rails in use: a 9 V battery is assumed on them, flagged source ($name)', ({ wires, rails }) => {
  const rd = reading({ parts: [resistor('R1', 'a10', 'a14'), led('LED1', 'c17', 'c14')], wires });
  const out = build(rd);
  assert.deepStrictEqual(out.actions[0], { tool: 'place_battery', voltage: 9 });
  assert.ok(out.flags.some(f => f.kind === 'source'), `expected a source flag, got ${JSON.stringify(kinds(out))}`);
  const batWires = wiresOf(out).filter(w => /^BAT1\./.test(w.from));
  for (const r of rails) {
    assert.ok(batWires.some(w => ref(w.to) && ref(w.to).row === r), `the assumed battery must wire ${r}: ${JSON.stringify(batWires)}`);
  }
  // Every Reading wire's id counts the battery's leads first.
  wires.forEach((w, i) => assert.strictEqual(out.labels[w.id], `W${batWires.length + i + 1}`));
  const board = checkInvariants(out);
  assertSameNets(rd, out, board);
  const m = simulate(board).r.parts.LED1.m;
  assert.ok(m.on && m.current > 14.8 && m.current < 15.0, `LED1 expected on at 14.8–15.0 mA from the assumed 9 V, got on=${m.on} ${m.current}`);
});

test.each([
  { name: 'a 9 V battery with its voltage unread', power: battery('rail:aOuter:3', 'rail:aInner:3', 0), voltage: 9, flag: 'value' },
  { name: 'a battery read at 30 V (out of 1–24 V)', power: battery('rail:aOuter:3', 'rail:aInner:3', 30), voltage: 9, flag: 'value' },
  { name: 'a bench supply at 5 V', power: battery('rail:aOuter:3', 'rail:aInner:3', 5, 'bench_supply'), voltage: 5, flag: 'source' },
  { name: 'an unknown source at 9 V', power: battery('rail:aOuter:3', 'rail:aInner:3', 9, 'unknown'), voltage: 9, flag: 'source' },
])('every power entry is built as a battery, flagged when guessed ($name)', ({ power, voltage, flag }) => {
  const rd = reading({ parts: [resistor('R1', 'a10', 'a14')], wires: [wire('W1', 'red', 'rail:aOuter:10', 'b10')], power: [power] });
  const out = build(rd);
  assert.deepStrictEqual(out.actions[0], { tool: 'place_battery', voltage });
  assert.deepStrictEqual(wiresOf(out).slice(0, 2), [
    { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3', color: 'red' },
    { tool: 'add_wire', from: 'BAT1.1', to: 'tn_3', color: 'black' },
  ]);
  assert.strictEqual(out.labels['power:0'], 'BAT1');
  assert.ok(hasFlag(out, flag, 'power:0'), `expected a ${flag} flag for power:0, got ${JSON.stringify(kinds(out))}`);
  checkInvariants(out);
});

// ── Not built ────────────────────────────────────────────────────────────

test('a part of type other is not built: flagged type, listed in skipped, later parts still numbered from 1', () => {
  const other = { id: 'U1', type: 'other', what: 'push button', value: 0, bands: [], color: '',
                  leads: [lead('e20'), lead('f20'), lead('e22'), lead('f22')], box: [0, 0, 0, 0], confidence: 0.6, unsure: [] };
  const rd = reading({ parts: [other, resistor('R1', 'a10', 'a14')], wires: [wire('W1', 'red', 'rail:aOuter:10', 'b10')],
                       power: [battery('rail:aOuter:3', 'rail:aInner:3')] });
  const out = build(rd);
  assert.ok(hasFlag(out, 'type', 'U1'), `expected a type flag for U1, got ${JSON.stringify(kinds(out))}`);
  assert.deepStrictEqual(skippedIds(out), ['U1']);
  assert.strictEqual(out.labels.U1, undefined);
  assert.deepStrictEqual(placesOf(out), [{ tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 }]);
  assert.strictEqual(out.labels.R1, 'R1');
  checkInvariants(out);
});

// #136 only: these all need the bridge (#137), which builds them instead.
test.each([
  { name: 'a lead in a rail',                id: 'R1', part: resistor('R1', 'rail:aOuter:10', 'a14') },
  { name: 'leads 8 columns apart',            id: 'R1', part: resistor('R1', 'a10', 'a18') },
  { name: 'diagonal across the centre gap',   id: 'R1', part: resistor('R1', 'a10', 'h13') },
  { name: 'both leads in one column-half',    id: 'LED1', part: led('LED1', 'a14', 'c14') },
])('#136, no bridge yet: a part that needs one is not built, flagged mismatch and listed in skipped ($name)', ({ id, part }) => {
  const rd = reading({ parts: [part, resistor('R2', 'a30', 'a34')], wires: [wire('W1', 'red', 'rail:aOuter:30', 'b30')],
                       power: [battery('rail:aOuter:3', 'rail:aInner:3')] });
  const out = build(rd);
  assert.deepStrictEqual(placesOf(out), [{ tool: 'place_resistor', holeA: 'a30', holeB: 'a34', resistance: 470 }]);
  assert.ok(hasFlag(out, 'mismatch', id), `expected a mismatch flag for ${id}, got ${JSON.stringify(kinds(out))}`);
  assert.deepStrictEqual(skippedIds(out), [id]);
  assert.strictEqual(out.labels[id], undefined);
  assert.strictEqual(out.labels.R2, 'R1', 'a skipped part shifts later numbers');
  assertSameNets(rd, out, checkInvariants(out));
});

// ── Malformed input, missing ids and duplicates ──────────────────────────
// validateReading (backend/photo-reader.js) turns a missing id into '', so
// a blank id is treated as missing: the entry's key is part<i+1> / wire<i+1>
// (1-based within parts / wires), used in labels, flags and skipped. Only
// exact duplicates are dropped (a part with the same type, value and lead
// holes as an earlier one; a wire with the same two ends, either order). A
// different entry reusing an id is still built, keyed <id>#2, <id>#3…

const STAGE_ACTIONS = [
  { tool: 'place_battery', voltage: 9 },
  { tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 },
  { tool: 'place_led', holeA: 'c14', holeB: 'c17', color: 'red' },
  { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3', color: 'red' },
  { tool: 'add_wire', from: 'BAT1.1', to: 'tn_3', color: 'black' },
  { tool: 'add_wire', from: 'tp_10', to: 'b10', color: 'red' },
  { tool: 'add_wire', from: 'b17', to: 'tn_19', color: 'black' },
];

test.each([
  { name: 'undefined', rd: undefined },
  { name: 'null',      rd: null },
  { name: '{}',        rd: {} },
  { name: 'null lists and rails', rd: { board: { visible: true, cols: 63, rails: null, split: false }, parts: null, wires: null, power: null } },
])('build never throws on a Reading that is $name, and builds nothing', ({ rd }) => {
  const out = build(rd);
  assert.deepStrictEqual(out, { actions: [], labels: {}, flags: [], skipped: [] });
});

test('build never throws on junk entries: each bad one is listed in skipped, the good ones still build legally', () => {
  const junk = (id, leads) => Object.assign(resistor(id, 'a1', 'a5'), { leads });
  const rd = {
    board: { visible: true, cols: 63, rails: null, split: false },
    parts: [
      junk('X1', []),                                             // no leads
      junk('X2', [lead('a40'), lead('a44'), lead('a46')]),         // 3 leads
      junk('X3', [{ hole: 14, pt: [0, 0], role: 'none' }, { hole: {}, pt: [0, 0], role: 'none' }]),   // not strings
      null,                                                        // not a part (key part4)
      resistor('R1', 'a10', 'a14'),
    ],
    wires: [
      { id: 'WX1', color: 'red', ends: [end('a50')], confidence: 0.9, unsure: [] },                  // one end
      { id: 'WX2', color: 'red', ends: [{ hole: null }, { hole: 7 }], confidence: 0.9, unsure: [] },  // not strings
      wire('W1', 'red', 'rail:aOuter:10', 'b10'),
    ],
    power: [battery('rail:aOuter:3', 'rail:aInner:3')],
  };
  const out = build(rd);
  assert.deepStrictEqual(skippedIds(out).slice().sort(), ['WX1', 'WX2', 'X1', 'X2', 'X3', 'part4']);
  assert.deepStrictEqual(placesOf(out), [{ tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 }]);
  assert.strictEqual(out.labels.R1, 'R1');
  assert.strictEqual(out.labels.W1, 'W3');
  checkInvariants(out);
});

test.each([
  { name: 'blank',       id: '' },
  { name: 'whitespace',  id: '   ' },
  { name: 'null',        id: null },
  { name: 'missing',     id: undefined },
])('the stage board with every part and wire id $name builds everything, keyed part<n> / wire<n>', ({ id }) => {
  const rd = stage();
  for (const x of rd.parts.concat(rd.wires)) {
    if (id === undefined) delete x.id; else x.id = id;
  }
  const out = build(rd);
  assert.deepStrictEqual(out, {
    actions: STAGE_ACTIONS,
    labels: { 'power:0': 'BAT1', part1: 'R1', part2: 'LED1', wire1: 'W3', wire2: 'W4' },
    flags: [],
    skipped: [],
  });
});

test('an exact duplicate part (same type, value, holes) and an exact duplicate wire (same ends, either order) are built once; the copies are listed in skipped', () => {
  const rd = stage();
  rd.parts.push(resistor('R9', 'a10', 'a14'));
  rd.wires.push(wire('W9', 'black', 'rail:aInner:19', 'b17'));
  const out = build(rd);
  assert.deepStrictEqual(out.actions, STAGE_ACTIONS);
  assert.deepStrictEqual(skippedIds(out), ['R9', 'W9']);
  assert.strictEqual(out.labels.R9, undefined);
  assert.strictEqual(out.labels.W9, undefined);
});

test('different parts and wires that reuse an id are all built, keyed <id>#2, <id>#3', () => {
  const rd = stage();
  rd.parts.push(resistor('R1', 'a30', 'a34', 1000), resistor('R1', 'a40', 'a44', 2200));
  rd.wires.push(wire('W1', 'green', 'rail:aOuter:30', 'b30'));
  const out = build(rd);
  assert.deepStrictEqual(placesOf(out), [
    { tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 },
    { tool: 'place_led', holeA: 'c14', holeB: 'c17', color: 'red' },
    { tool: 'place_resistor', holeA: 'a30', holeB: 'a34', resistance: 1000 },
    { tool: 'place_resistor', holeA: 'a40', holeB: 'a44', resistance: 2200 },
  ]);
  assert.deepStrictEqual(out.labels, { 'power:0': 'BAT1', R1: 'R1', LED1: 'LED1', 'R1#2': 'R2', 'R1#3': 'R3', W1: 'W3', W2: 'W4', 'W1#2': 'W5' });
  assert.deepStrictEqual(out.skipped, []);
  checkInvariants(out);
});
