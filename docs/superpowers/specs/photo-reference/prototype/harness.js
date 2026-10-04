// Runs PhotoImport actions through the app's REAL code paths, in Node.
//   apply(actions)        Board.apply (board-model.js)        → { board, errors }
//   accept(actions)       Chat.applyActions on a fake board    → the Accept path's
//                         own Parts.checkPlacement against the live hole map
//   serverChecks(actions) server.js-style: each place_* against the actions
//                         before it, plus the stacked-holes rule
//   netsOf(board)         Sim.buildGraph (the solver's own nets)
//   solve(board)          Sim.analyze + Readings.problems()
const APP      = process.env.PLUGGED_JS || require('node:path').join(__dirname, '../../../../../Plugged/circuit3d/js');
const Board    = require(APP + '/board-model.js');
const Sim      = require(APP + '/simulate.js');
const Readings = require(APP + '/readings.js');
const Parts    = require(APP + '/parts');
const Ids      = require(APP + '/ids.js');
const IO       = require(APP + '/board-io.js');
const Chat     = require(APP + '/chat.js');
const GEOMETRY = require(APP + '/board-geometry.js');
const Import   = require('./photo-import.js');

const COLS = GEOMETRY.COLS;
const BOARD = { cols: COLS, bodyRows: GEOMETRY.BODY_ROWS };
const HOLE = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/i;
const ref = s => { const m = HOLE.exec(String(s).trim()); if (!m) return null; return m[1] ? { col: +m[2] - 1, row: m[1].toLowerCase() } : { col: +m[4] - 1, row: m[3].toLowerCase() }; };

function apply(actions) { return Board.apply(Board.empty(), actions); }

function accept(actions) {
  const components = [], wires = [], notes = [];
  const board = {
    components: () => components,
    batterySpot: () => ({ x: 0, z: 0 }),
    parseHole: s => { const r = ref(s); if (!r) throw new Error('not a hole'); return r; },
    getHole: (col, row) => (col >= 0 && col < COLS && GEOMETRY.ALL_ROWS.includes(row) ? { col, row } : null),
    placePart(type, where, values) {
      const def = Parts.get(type);
      components.push({ type, label: Ids.nextLabel(components, type), values: Object.assign({}, values),
                        holeRefs: Array.isArray(where) ? where.map(h => ({ col: h.col, row: h.row })) : null,
                        pins: def.pins.map(() => ({ x: 0, y: 0, z: 0 })) });
    },
    setValues: (c, v) => Object.assign(c.values, v),
    setControls: (c, v) => { c.controls = Object.assign({}, c.controls, v); },
    deletePart: c => components.splice(components.indexOf(c), 1),
    deleteWire: () => false,
    clearAll: () => { components.length = 0; wires.length = 0; },
    batch: fn => fn(),
    holeMap: () => IO.buildHoleMap(components, wires),
    note: t => notes.push(t),
    addWire(from, to) {
      const end = e => (e.hole ? { hole: { col: e.hole.col, row: e.hole.row }, comp: null, idx: -1 } : { hole: null, comp: e.comp, idx: e.pin });
      const a = end(from), b = end(to);
      wires.push({ startHole: a.hole, endHole: b.hole, startComp: a.comp, startPinIdx: a.idx, endComp: b.comp, endPinIdx: b.idx });
      return true;
    },
  };
  const r = Chat.applyActions(actions, board);
  return { applied: r.applied, failed: r.failed, failedActions: r.failedActions, notes, components, wires };
}

// server.js placementRefusal + findStackedHoles, re-done on the same rules.
function serverChecks(actions) {
  const refusals = [], used = new Map();
  let map = new Map();
  const put = (h, what) => { if (!/^[a-j]\d+$/.test(h)) return; if (!used.has(h)) used.set(h, []); used.get(h).push(what); };
  actions.forEach((a, i) => {
    if (a.tool === 'delete_all') { map = new Map(); used.clear(); return; }
    if (a.tool === 'add_wire') {
      for (const [end, h] of [['from', a.from], ['to', a.to]]) { const r = ref(h); if (r && !map.has(Ids.holeName(r))) map.set(Ids.holeName(r), { wire: i, end }); put(String(h).toLowerCase(), 'wire'); }
      return;
    }
    const def = Parts.all().find(d => ((d.ai && d.ai.tool) || 'place_' + d.type) === a.tool);
    if (!def || def.place.kind !== 'span') return;
    const legs = [ref(a.holeA), ref(a.holeB)].map((r, k) => Object.assign({ pin: def.pins[k], hole: Ids.holeName(r) }, r));
    const check = Parts.checkPlacement(def.type, legs, map, BOARD);
    if (!check.ok) refusals.push(`${a.tool} ${a.holeA}/${a.holeB}: ${check.reason}`);
    for (const l of legs) if (!map.has(l.hole)) map.set(l.hole, { label: def.type, pin: l.pin });
    put(a.holeA, def.type); put(a.holeB, def.type);
  });
  const stacked = [...used].filter(([, l]) => l.length > 1).map(([h, l]) => `${h}: ${l.join(' + ')}`);
  return { refusals, stacked };
}

// label → [root node per pin], from the solver's own graph.
function netsOf(board) {
  const { components, wires } = Board.toSim(board);
  const graph = Sim.buildGraph(components, wires);
  const out = {};
  graph.forEach(g => { out[g.comp.label] = g.nodes.slice(); });
  return out;
}

function solve(board) {
  const sim = Board.toSim(board);
  const r = Sim.analyze(sim.components, sim.wires);
  const problems = Readings.from(r, sim).problems();
  return { r, problems };
}

// Truth nets vs built nets, over the terminals of every imported item.
// reading: the import's input; out: PhotoImport.build's output; board: built.
// An assumed battery (no source in the photo) is left out: the truth has none,
// and its wires would join tp+bp / tn+bn. assumedOk says it reaches every rail used.
function compareNets(reading, out, board) {
  const assumed = out.labels['(assumed battery)'];
  const onAssumed = e => assumed && String(e).startsWith(assumed + '.');
  const built = netsOf(assumed ? { parts: board.parts, wires: board.wires.filter(w => !onAssumed(w.from) && !onAssumed(w.to)) } : board);
  let assumedOk = null;
  if (assumed) {
    const all = netsOf(board), [plus, minus] = all[assumed];
    const railNode = r => { const sim = Board.toSim(board); return Sim.buildGraph(sim.components, sim.wires).nodeOf({ col: 0, row: r }); };
    const want = new Set(); for (const p of reading.parts || []) for (const l of p.leads) { const q = Import.parse(l.hole, reading.cols); if (q && q.kind === 'rail') want.add(q.rail); }
    for (const w of reading.wires || []) for (const e of w.ends) { const q = Import.parse(e.hole, reading.cols); if (q && q.kind === 'rail') want.add(q.rail); }
    assumedOk = [...want].every(r => railNode(r) === (r.endsWith('p') ? plus : minus));
  }
  // truth union-find over reading nodes, joined by the imported wires
  const parent = new Map();
  const find = x => { if (!parent.has(x)) parent.set(x, x); while (parent.get(x) !== x) x = parent.get(x); return x; };
  const union = (a, b) => parent.set(find(a), find(b));
  const cols = reading.cols;
  const node = h => { const p = Import.parse(h, cols); return p && p.node; };
  const skippedIds = new Set(out.skipped.map(s => s.id));
  for (const w of reading.wires || []) {
    if (skippedIds.has(w.id)) continue;
    union(node(w.ends[0].hole), node(w.ends[1].hole));
  }
  const terms = [];
  for (const p of reading.parts || []) {
    const label = out.labels[p.id];
    if (!label || skippedIds.has(p.id)) continue;
    p.leads.forEach((l, k) => {
      const pin = out.pinMap[p.id][k];
      if (pin == null || !l.hole || l.hole === 'off') return;
      terms.push({ name: `${p.id}.${l.pin}`, truth: find(node(l.hole)), built: built[label][pin] });
    });
  }
  const bad = [];
  for (let i = 0; i < terms.length; i++) for (let j = i + 1; j < terms.length; j++) {
    const t = terms[i].truth === terms[j].truth, b = terms[i].built === terms[j].built;
    if (t !== b) bad.push(`${terms[i].name} & ${terms[j].name}: truth ${t ? 'joined' : 'apart'}, built ${b ? 'joined' : 'apart'}`);
  }
  return { terminals: terms.length, pairs: terms.length * (terms.length - 1) / 2, bad, equal: bad.length === 0, assumedOk };
}

// Everything at once.
function run(reading) {
  const out = Import.build(reading);
  const applied = apply(out.actions);
  const acc = accept(out.actions);
  const srv = serverChecks(out.actions);
  // the Accept path and Board.apply must build the same board
  const sameBoard = acc.components.length === applied.board.parts.length && acc.wires.length === applied.board.wires.length &&
    acc.components.every((c, i) => c.label === applied.board.parts[i].label &&
      JSON.stringify((c.holeRefs || []).map(Ids.holeName)) === JSON.stringify(applied.board.parts[i].holes || []));
  const nets = compareNets(reading, out, applied.board);
  const sim = solve(applied.board);
  return { out, applied, acc, srv, sameBoard, nets, sim };
}

module.exports = { apply, accept, serverChecks, netsOf, solve, compareNets, run, Import, Board, Sim, Readings, Parts };
