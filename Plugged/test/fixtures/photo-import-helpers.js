// Shared by test/photo-import.test.js and test/photo-import-truth.test.js
// (#136, #137): Reading v1 builders, and the contract's invariant checks on
// a PhotoImport build (docs/API-CONTRACT.md → "PhotoImport" → "Invariants").
// Everything runs the app's real code: Parts, Board.apply, toSim,
// Sim.analyze, Readings. Nothing is mocked.

const assert = require('node:assert');

const Parts    = require('../../circuit3d/js/parts');
const Board    = require('../../circuit3d/js/board-model.js');
const Sim      = require('../../circuit3d/js/simulate.js');
const Readings = require('../../circuit3d/js/readings.js');
const GEOMETRY = require('../../circuit3d/js/board-geometry.js');

// Loaded lazily so each test reports on its own while the module is missing.
let PhotoImport = null;
try {
  PhotoImport = require('../../circuit3d/js/photo-import.js');
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

// ── Reading the output ───────────────────────────────────────────────────

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

// The bridge jumpers: every add_wire that is neither a battery lead nor one
// of the Reading's wires (the n-th add_wire is W<n>, and labels name the
// Reading's).
function jumpersOf(out) {
  const reading = new Set(Object.values(out.labels).filter(l => /^W\d+$/.test(l)));
  const bat = h => /^BAT\d+\./.test(String(h));
  return wiresOf(out).filter((w, i) => !bat(w.from) && !bat(w.to) && !reading.has('W' + (i + 1)));
}

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

// label → [the solver's node per pin], on the built board.
function builtNets(board) {
  const sim = Board.toSim(board);
  const built = {};
  Sim.buildGraph(sim.components, sim.wires).forEach(g => { built[g.comp.label] = g.nodes.slice(); });
  return built;
}

// Same nets: two terminals are joined in the Reading (union-find over its
// nodes through its built wires) exactly when they are joined on the built
// board (the solver's own graph). An assumed battery (no power entry in the
// Reading) is left out: the Reading has none, and its leads would join the
// + rails (and the − rails) of both sides.
function assertSameNets(rd, out, board) {
  const parent = new Map();
  const find = x => { if (!parent.has(x)) parent.set(x, x); while (parent.get(x) !== x) x = parent.get(x); return x; };
  for (const w of rd.wires) {
    if (skippedIds(out).includes(w.id)) continue;
    parent.set(find(readingNode(w.ends[0].hole)), find(readingNode(w.ends[1].hole)));
  }
  const powered = new Set(Object.keys(out.labels).filter(k => /^power:/.test(k)).map(k => out.labels[k]));
  const assumed = board.parts.filter(p => p.type === 'battery' && !powered.has(p.label)).map(p => p.label + '.');
  const onAssumed = h => assumed.some(pre => String(h).startsWith(pre));
  const built = builtNets({ parts: board.parts, wires: board.wires.filter(w => !onAssumed(w.from) && !onAssumed(w.to)) });

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

module.exports = {
  Parts, Board, GEOMETRY,
  build, BB830, lead, end, resistor, ledOf, led, wire, battery, reading,
  ref, wiresOf, placesOf, kinds, skippedIds, hasFlag, jumpersOf,
  checkInvariants, readingNode, builtNets, assertSameNets, simulate, backwardsFor,
};
