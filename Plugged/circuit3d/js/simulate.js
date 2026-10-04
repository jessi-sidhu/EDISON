// ─────────────────────────────────────────────────────────────
//  simulate.js — Circuit simulation engine
//
//  NODE MODEL
//  ──────────
//  Each breadboard hole belongs to a "node" determined by its
//  physical connectivity (columns in same half share a node):
//
//    bb_top_<col>  →  any hole in col <col>, rows a–e
//    bb_bot_<col>  →  any hole in col <col>, rows f–j
//    bb_rail_tp    →  all holes in the top + rail row    (positive)
//    bb_rail_tn    →  all holes in the top − rail row    (negative)
//    bb_rail_bn    →  all holes in the bottom + rail row (positive)
//    bb_rail_bp    →  all holes in the bottom − rail row (negative)
//
//  Wires (drawn by the user) additionally merge nodes. Every part is a
//  registry part (parts/*.js) and simulates from its elements().
//
//  SOLVING
//  ───────
//  Modified nodal analysis: the whole circuit is solved at once for every
//  node voltage and every V element's current, so parallel branches share
//  current correctly and sources in series add up.
//
//  GROUND
//  ──────
//  Each connected circuit (nodes joined by wires and conducting elements)
//  is grounded at the ref pin of its earliest-placed source (a part with
//  `ref`, lowest index). A circuit with no source reads null.
//
//  POLARITY
//  ────────
//  A D element (an LED's, parts/led.js) is a diode: a mode block that is
//  off (open), on (Vf plus a small resistance) or, with vz, in breakdown.
//  One generic loop (settleModes) finds the modes that are consistent
//  with the voltages. A V element's pins are [plus, minus].
//
//  EXPORTS
//  ───────
//  Browser: window.App.runSimulation() / App.stopSimulation(), unchanged.
//  Node:    module.exports = the pure solver (UnionFind, bbNodeId,
//           buildGraph, solveLinear, settleModes, analyze,
//           simulationSummary) so a test runner can call it.
//  Everything above the "Presentation" divider is pure: no document,
//  no THREE, no audio.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Sim = factory();
  if (typeof module === 'object' && module.exports) module.exports = Sim;
  if (root) Sim.install(root.App = root.App || {});
})(typeof window !== 'undefined' ? window : null, function () {

  // Browser App namespace, set by install(). Stays null under node.
  let App = null;

  // ── Registry parts ──────────────────────────────────────────
  //  Parts defined in parts/*.js simulate from their elements(). Under Node
  //  this module loads the registry itself; the page loads it before this
  //  file. Definitions are looked up at call time, never cached.
  const Parts = typeof module === 'object' && module.exports ? require('./parts') : null;
  function partDef(type) {
    const P = Parts || (typeof window !== 'undefined' ? window.Parts : null);
    return P ? P.get(type) : null;
  }

  // A registry part's values: its defaults, then the record's own, then the
  // overrides of each choice the result names (so a record saved with only
  // { color: 'blue' } gets blue's vf).
  function partValues(def, comp) {
    const out = {};
    for (const [key, spec] of Object.entries(def.values || {})) out[key] = spec.default;
    Object.assign(out, comp.values || {});
    for (const [key, spec] of Object.entries(def.values || {})) {
      if (spec.choices && spec.choices[out[key]]) Object.assign(out, spec.choices[out[key]]);
    }
    return out;
  }

  function partControls(def, comp) {
    const out = {};
    for (const [key, c] of Object.entries(def.controls || {})) out[key] = c.default;
    return Object.assign(out, comp.controls || {});
  }

  // ── Union-Find ──────────────────────────────────────────────
  class UnionFind {
    constructor() { this._p = {}; }
    make(id) { if (!(id in this._p)) this._p[id] = id; }
    find(id) {
      this.make(id);
      if (this._p[id] !== id) this._p[id] = this.find(this._p[id]);
      return this._p[id];
    }
    union(a, b) {
      const ra = this.find(a), rb = this.find(b);
      if (ra === rb) return;
      // Smaller id always wins, so a root does not depend on wire order.
      if (ra < rb) this._p[rb] = ra; else this._p[ra] = rb;
    }
  }

  // ── Breadboard node identity ────────────────────────────────
  const TOP_BODY = new Set(['a','b','c','d','e']);
  const BOT_BODY = new Set(['f','g','h','i','j']);

  function bbNodeId(col, row) {
    if (TOP_BODY.has(row)) return `bb_top_${col}`;
    if (BOT_BODY.has(row)) return `bb_bot_${col}`;
    return `bb_rail_${row}`; // tp | tn | bn | bp
  }

  // ── Build graph ─────────────────────────────────────────────
  function buildGraph(components, wires) {
    const uf      = new UnionFind();
    const pinNode = []; // pinNode[ci][pi] = raw node string

    // 1. Assign every component pin to a node
    components.forEach((comp, ci) => {
      pinNode[ci] = [];
      comp.pins.forEach((_, pi) => {
        let nid;
        if (comp.holeRefs?.[pi]) {
          const { col, row } = comp.holeRefs[pi];
          nid = bbNodeId(col, row);
        } else {
          nid = `free_${ci}_${pi}`;
        }
        pinNode[ci][pi] = nid;
        uf.make(nid);
      });
    });

    // 2. Wires merge nodes — wires store startHole/endHole for breadboard
    //    holes and startComp/startPinIdx for off-board pins (a source's).
    wires.forEach(wire => {
      const { startHole, endHole, startComp, startPinIdx, endComp, endPinIdx } = wire;

      // Resolve each endpoint to a node string
      let na = startHole ? bbNodeId(startHole.col, startHole.row) : null;
      let nb = endHole   ? bbNodeId(endHole.col,   endHole.row)   : null;

      // Fall back to component free-pin node when no board hole was recorded
      if (!na && startComp) {
        const ci = components.indexOf(startComp);
        if (ci >= 0 && pinNode[ci]?.[startPinIdx] != null) na = pinNode[ci][startPinIdx];
      }
      if (!nb && endComp) {
        const ci = components.indexOf(endComp);
        if (ci >= 0 && pinNode[ci]?.[endPinIdx] != null) nb = pinNode[ci][endPinIdx];
      }

      if (na && nb) uf.union(na, nb);
    });

    // 3. Resolve each pin to its root
    const graph = components.map((comp, ci) => {
      // nodes[pi] = root node of pin pi
      const g = { comp, nodes: comp.pins.map((_, pi) => uf.find(pinNode[ci][pi])) };
      // A registry part also carries its elements, each pin resolved to a
      // node: a part pin by name, or an internal "#name" private to the part.
      const def = partDef(comp.type);
      if (def) {
        const values = partValues(def, comp), controls = partControls(def, comp);
        const els = def.elements(values, controls);
        const node = p => (p[0] === '#' ? `int_${ci}_${p.slice(1)}` : g.nodes[def.pins.indexOf(p)]);
        g.part = { def, values, controls, els: els.map(el => ({ el, nodes: (el.pins || []).map(node) })) };
      }
      return g;
    });
    // nodeOf({ col, row }) = root node of any breadboard hole, pin or not.
    graph.nodeOf = hole => uf.find(bbNodeId(hole.col, hole.row));
    return graph;
  }

  // ── Nodal analysis ──────────────────────────────────────────
  //
  //  Modified nodal analysis: one unknown per node voltage plus one per
  //  V element's current. A mode block (a D element) is piecewise linear:
  //  open when off, Vf in series with ron when on. The modes are found by
  //  settleModes, flipping the single most inconsistent block until none
  //  is, so the same circuit always gives the same answer.
  const GMIN       = 1e-12;   // S from every node to ground, keeps floating parts solvable
  const SW_OHMS    = 1e-3;    // a closed SW: 1 mΩ, never an ideal short
  const SHORT_AMPS = 1.0;    // source current treated as a short circuit
  const OPEN_AMPS  = 1e-6;   // below this nothing is flowing
  const PIVOT_EPS  = 1e-15;
  const MODE_EPS   = 1e-9;   // volts past a switching point that count as inconsistent

  // Gaussian elimination with partial pivoting. null when singular.
  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < PIVOT_EPS) return null;
      if (p !== c) { const t = M[c]; M[c] = M[p]; M[p] = t; }
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        if (f === 0) continue;
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / M[r][r];
    }
    return x;
  }

  // Every element of every registry part, in board order.
  function allElements(graph) {
    const out = [];
    graph.forEach(g => { if (g.part) g.part.els.forEach(e => out.push(e)); });
    return out;
  }

  // One linear solve with every mode block in a fixed mode.
  // grounds: Set of nodes held at 0 V, one per connected circuit.
  // modeOf:  Map(element entry -> 'off' | 'on' | 'breakdown').
  // Returns { v(node), vCurrent: Map(V element entry -> amps) } or null.
  function solveMNA(graph, grounds, modeOf) {
    const index = new Map();
    const add = n => { if (n != null && !grounds.has(n) && !index.has(n)) index.set(n, index.size); };
    graph.forEach(g => {
      g.nodes.forEach(add);
      if (g.part) g.part.els.forEach(e => e.nodes.forEach(add));
    });
    const els = allElements(graph);
    const vs  = els.filter(e => e.el.kind === 'V');
    const N = index.size, size = N + vs.length;
    const A = Array.from({ length: size }, () => new Array(size).fill(0));
    const b = new Array(size).fill(0);
    const at = n => (grounds.has(n) ? -1 : index.get(n));

    function conductance(n1, n2, g) {
      const i = at(n1), j = at(n2);
      if (i >= 0) A[i][i] += g;
      if (j >= 0) A[j][j] += g;
      if (i >= 0 && j >= 0) { A[i][j] -= g; A[j][i] -= g; }
    }
    function inject(n, amps) { const i = at(n); if (i >= 0) b[i] += amps; }

    for (let i = 0; i < N; i++) A[i][i] += GMIN;

    els.forEach(e => {
      const { el, nodes: [n1, n2] } = e;
      if (el.kind === 'R' && el.ohms > 0) conductance(n1, n2, 1 / el.ohms);
      if (el.kind === 'SW' && el.closed) conductance(n1, n2, 1 / SW_OHMS);
      if (el.kind !== 'D') return;
      // I(anode → cathode) = (Va − Vc ∓ V) / ron: Vf when on, −Vz in breakdown.
      const mode = modeOf.get(e), G = 1 / el.ron;
      const drop = mode === 'on' ? el.vf : mode === 'breakdown' ? -el.vz : null;
      if (drop == null) return;
      conductance(n1, n2, G);
      inject(n1, drop * G);
      inject(n2, -drop * G);
    });

    // V: one more unknown, its current, + from its plus pin to its minus
    // pin inside the source (so a source that supplies reads negative).
    vs.forEach((e, k) => {
      const row = N + k, pos = at(e.nodes[0]), neg = at(e.nodes[1]);
      if (pos >= 0) { A[pos][row] += 1; A[row][pos] += 1; }
      if (neg >= 0) { A[neg][row] -= 1; A[row][neg] -= 1; }
      b[row] = e.el.volts || 0;
    });

    const x = solveLinear(A, b);
    if (!x) return null;
    const vCurrent = new Map(vs.map((e, k) => [e, x[N + k]]));
    return { v: n => (grounds.has(n) ? 0 : x[index.get(n)]), vCurrent };
  }

  // Amps through one of a registry part's elements, + in its pin order.
  function elementAmps(e, sol, mode) {
    const { el, nodes: [a, b] } = e;
    if (el.kind === 'R' && el.ohms > 0) return (sol.v(a) - sol.v(b)) / el.ohms;
    if (el.kind === 'SW') return el.closed ? (sol.v(a) - sol.v(b)) / SW_OHMS : 0;
    if (el.kind === 'V') return sol.vCurrent.get(e) || 0;
    if (el.kind === 'D') {
      const vd = sol.v(a) - sol.v(b);
      if (mode === 'on')        return (vd - el.vf) / el.ron;
      if (mode === 'breakdown') return (vd + el.vz) / el.ron;
    }
    return 0;
  }

  // Is a D element consistent in this mode? null if so, else how many
  // volts past its switching point it is and the mode to flip to.
  function checkDiode({ el, nodes: [a, c] }, sol, mode) {
    const vd = sol.v(a) - sol.v(c);
    let by, to;
    if (mode === 'on')             { by = el.vf - vd; to = 'off'; }
    else if (mode === 'breakdown') { by = vd + el.vz; to = 'off'; }
    else {
      by = vd - el.vf; to = 'on';
      if (el.vz !== undefined && -vd - el.vz > by) { by = -vd - el.vz; to = 'breakdown'; }
    }
    return by > MODE_EPS ? { by, to } : null;
  }

  // ── Pure: settleModes, the one loop for every mode block ────
  //
  //  blocks[i] = { initial, check(sol, mode) → null | { by > 0, to } }
  //  solveFor(modes) → sol, or null when the circuit can't be solved.
  //  Each round: solve; if every block is consistent, stop; else flip the
  //  block with the largest `by`. If a set of modes comes round again, flip
  //  the lowest-index inconsistent block instead, which breaks the cycle.
  //  After 4·n + 10 rounds give up: settled false. `sol` is always the solve
  //  for the returned modes. Returns { modes, sol, settled } or null.
  function settleModes(blocks, solveFor) {
    const modes = blocks.map(b => b.initial);
    const seen  = new Set();
    const cap   = 4 * blocks.length + 10;
    for (let round = 0; round < cap; round++) {
      const sol = solveFor(modes.slice());
      if (!sol) return null;
      const bad = blocks.map((b, i) => b.check(sol, modes[i]));
      const first = bad.findIndex(Boolean);
      if (first < 0) return { modes, sol, settled: true };
      let worst = first;
      bad.forEach((x, i) => { if (x && x.by > bad[worst].by) worst = i; });
      const key = modes.join('|');
      const pick = seen.has(key) ? first : worst;
      seen.add(key);
      modes[pick] = bad[pick].to;
    }
    const sol = solveFor(modes.slice());
    return sol ? { modes, sol, settled: false } : null;
  }

  // A registry part's current for currents[]: its first element's, + from
  // part pin 0 to pin 1 (so an element wired the other way round flips).
  function partAmps({ part }, sol, modeOf) {
    const e = part.els[0];
    if (!e) return 0;
    const amps = elementAmps(e, sol, modeOf.get(e));
    const [p, q] = e.el.pins || [];
    return p === part.def.pins[1] && q === part.def.pins[0] ? -amps : amps;
  }

  // ── Sources and ground ──────────────────────────────────────
  //  A source is a registry part with a ref pin. Each connected circuit
  //  (nodes joined by wires and by elements that conduct; an open SW is
  //  removed) is grounded at the ref pin of its earliest-placed source.
  //  Every circuit with a source is live: its nodes are readings, a lone
  //  battery included. Only a circuit with no ref pin reads null.
  const isSource = g => !!(g.part && g.part.def.ref !== undefined);
  const refNode  = g => g.nodes[g.part.def.pins.indexOf(g.part.def.ref)];
  const conducts = el => !(el.kind === 'SW' && !el.closed);

  function groundCircuits(graph) {
    const uf = new UnionFind();
    graph.forEach(g => {
      g.nodes.forEach(n => uf.make(n));
      // A part the registry doesn't know joins all its pins, as before.
      if (!g.part) { g.nodes.forEach(n => uf.union(g.nodes[0], n)); return; }
      g.part.els.forEach(e => {
        e.nodes.forEach(n => uf.make(n));
        if (conducts(e.el)) e.nodes.forEach(n => uf.union(e.nodes[0], n));
      });
    });

    const grounds = new Set(), live = new Set();
    const firstOf = new Map();   // circuit root → its earliest source
    graph.forEach(g => {
      if (!isSource(g)) return;
      const root = uf.find(refNode(g));
      if (firstOf.has(root)) return;
      firstOf.set(root, g);
      grounds.add(refNode(g));
    });

    const mark = n => { if (firstOf.has(uf.find(n))) live.add(n); };
    graph.forEach(g => {
      g.nodes.forEach(mark);
      if (g.part) g.part.els.forEach(e => e.nodes.forEach(mark));
    });
    return { grounds, live };
  }

  // { r: PartResult, m: measured, warnings } per graph entry, null for a
  // part not in the registry. PartResult currents are mA; floating pins
  // null; open = volts across each mode block with every mode block off.
  function partResults(graph, sol, live, modeOf, openSol) {
    return graph.map((g, i) => {
      if (!g.part) return null;
      const { nodes, part: { def, els } } = g;
      const r = bareResult(graph, i);
      def.pins.forEach((pin, k) => { r.pins[pin] = live.has(nodes[k]) ? sol.v(nodes[k]) : null; });
      els.forEach((e, k) => {
        const id = e.el.id !== undefined ? e.el.id : k;
        const mode = modeOf.get(e);
        r.current[id] = elementAmps(e, sol, mode) * 1000;
        if (mode === undefined) return;
        r.modes[id] = mode;
        r.open[id] = openSol ? openSol.v(e.nodes[0]) - openSol.v(e.nodes[1]) : 0;
      });
      const m = def.measure ? def.measure(r) : {};
      return { r, m, warnings: def.warnings ? def.warnings(r, m) : [] };
    });
  }

  // A PartResult with no readings: label, values and controls. A part
  // saved before labels gets the one ids.js would give it (prefix + count).
  function bareResult(graph, i) {
    const { comp, part: { def, values, controls } } = graph[i];
    let label = comp.label;
    if (label == null) {
      const n = graph.slice(0, i + 1).filter(g => g.comp.type === comp.type).length;
      label = def.prefix + n;
    }
    const pins = {};
    def.pins.forEach(pin => { pins[pin] = null; });
    return { label, values, controls, pins, current: {}, modes: {}, open: {} };
  }

  // ── Pure: analyze ────────────────────────────────────────────
  //
  //  components + wires in, numbers and report lines out. Returns:
  //    status        'empty' | 'no-source' | 'ok' | 'unsolvable' | 'unsettled'
  //                  ('unsettled': the mode blocks never settled; only the
  //                  headlines and one warning, no readings)
  //    lines         [{ text, cls }] for the results panel: each part's
  //                  headline(r, m) first (board order, sources last), then
  //                  its line(r, m) or the generic ON line, its warnings,
  //                  and the circuit's own messages
  //    nodeVoltages  { [node id]: volts }, each relative to its circuit's ground
  //    currents      amps per component index, + from pin 0 to pin 1 inside
  //                  the part (so a lit LED is negative); always a number
  //    shorted       true when a source is shorted
  //    voltageAt     ({ col, row }) -> volts at any breadboard hole, same
  //                  reference as nodeVoltages; null when the hole's circuit
  //                  has no source, or nothing was solved
  //    parts         { [label]: { r, m, warnings } } for labelled registry
  //                  parts (docs/API-CONTRACT.md → PartResult, with r.open);
  //                  {} when nothing was solved. The page reads parts[label].m.
  //
  //  A part loaded from an old file that breaks a placement rule carries
  //  comp.flag ("R1: <reason>", board-io.js flagPlacements). Each flag adds
  //  one warning line, and goes into that part's warnings.
  function analyze(components, wires) {
    return run(components, wires).r;
  }

  // analyze(), plus what simulationSummary reads: the graph, each part's
  // result by index, and the live nodes.
  function run(components, wires) {
    const out = analyzeCircuit(components, wires);
    for (const c of components) {
      if (!c || !c.flag) continue;
      out.r.lines.push({ text: '  ⚠ ' + c.flag, cls: 'sim-warn' });
      if (out.r.parts && out.r.parts[c.label]) out.r.parts[c.label].warnings.push(c.flag);
    }
    return out;
  }

  // Headline lines, marked so the summary can leave them out.
  const HEADLINES = new WeakSet();

  function analyzeCircuit(components, wires) {
    const blank = { lines: [], nodeVoltages: {}, currents: [], shorted: false, voltageAt: () => null, parts: {} };
    const done  = (r, extra) => Object.assign({ r: Object.assign({}, blank, r) }, extra || {});

    if (!components.length) {
      return done({ status: 'empty', lines: [{ text: 'No components placed.', cls: 'sim-warn' }] });
    }

    const graph   = buildGraph(components, wires);
    const sources = graph.filter(isSource);
    if (!sources.length) {
      return done({ status: 'no-source', lines: [{ text: 'No battery in circuit.', cls: 'sim-warn' }] });
    }

    // One line per headline part, from its result once there is one.
    const heads = graph.map((g, i) => i).filter(i => graph[i].part && graph[i].part.def.headline);
    const order = heads.filter(i => !isSource(graph[i])).concat(heads.filter(i => isSource(graph[i])));
    const headlines = results => order.map(i => {
      const res = results && results[i];
      const h = graph[i].part.def.headline(res ? res.r : bareResult(graph, i), res ? res.m : {});
      const line = { text: h.text, cls: h.cls };
      HEADLINES.add(line);
      return line;
    });
    const lines = [];
    const withHeads = results => headlines(results).concat(lines);

    // A wire straight across a source merges its terminals into one node.
    const els = allElements(graph);
    if (els.some(e => e.el.kind === 'V' && e.nodes[0] === e.nodes[1])) {
      lines.push({ text: '  ⚠ Short circuit — no resistance in path!', cls: 'sim-err' });
      return done({ status: 'ok', lines: withHeads(null), shorted: true });
    }

    // Every mode block (D element) in board order, and the loop that settles them.
    const { grounds, live } = groundCircuits(graph);
    const blockEls = els.filter(e => e.el.kind === 'D');
    const blocks   = blockEls.map(e => ({ initial: 'off', check: (sol, mode) => checkDiode(e, sol, mode) }));
    const modesOf  = modes => new Map(blockEls.map((e, i) => [e, modes[i]]));
    const solveFor = modes => solveMNA(graph, grounds, modesOf(modes));

    const solved = settleModes(blocks, solveFor);
    if (!solved) {
      lines.push({ text: '  ⚠ This circuit cannot be solved. Two batteries may be wired straight into each other.', cls: 'sim-err' });
      return done({ status: 'unsolvable', lines: withHeads(null) });
    }
    if (!solved.settled) {
      lines.push({ text: '  ⚠ This circuit could not settle: some parts keep switching on and off, so there are no readings.', cls: 'sim-warn' });
      return done({ status: 'unsettled', lines: withHeads(null) });
    }
    const { sol } = solved;
    const modeOf  = modesOf(solved.modes);
    // What each mode block would see on its own: every block off. Leaving
    // the others on would let a parallel LED pin the shared node near Vf.
    const openSol = blockEls.length ? solveFor(blockEls.map(() => 'off')) : sol;

    const nodeVoltages = {};
    graph.forEach(g => g.nodes.forEach(n => { nodeVoltages[n] = sol.v(n); }));
    const voltageAt = hole => {
      const n = graph.nodeOf(hole);
      return live.has(n) ? nodeVoltages[n] : null;
    };

    const currents = graph.map(g => (g.part ? partAmps(g, sol, modeOf) : 0));

    const results = partResults(graph, sol, live, modeOf, openSol);
    const parts = {};
    graph.forEach((g, i) => { if (results[i] && g.comp.label != null) parts[g.comp.label] = results[i]; });
    const extra = { graph, results, live };

    // A source shorted through a part's mode block: that part's warnings
    // say why, the first as the error and the rest as advice.
    const sourceAmps = els.filter(e => e.el.kind === 'V').map(e => Math.abs(sol.vCurrent.get(e)));
    if (sourceAmps.some(a => a > SHORT_AMPS)) {
      const k = graph.findIndex(g => g.part &&
        g.part.els.some(e => modeOf.has(e) && Math.abs(elementAmps(e, sol, modeOf.get(e))) > SHORT_AMPS));
      const said = k >= 0 ? results[k].warnings : [];
      if (said.length) said.forEach((t, j) => lines.push({ text: '  ' + t, cls: j === 0 ? 'sim-err' : 'sim-info' }));
      else lines.push({ text: '  ⚠ Short circuit — no resistance in path!', cls: 'sim-err' });
      return done({ status: 'ok', lines: withHeads(results), nodeVoltages, currents, shorted: true, voltageAt, parts }, extra);
    }

    // One rule for every part: its own line(r, m) if it has one, else an
    // ON line when measure() says on; then each warning (an error while on,
    // a warning while off). A part whose mode blocks are all off and that
    // warns (a backwards LED) explains the dark circuit, so the generic
    // open-path lines are left out.
    let outputs = 0, explained = 0;
    graph.forEach((g, i) => {
      const res = results[i];
      if (!res) return;
      const { r, m, warnings } = res;
      const def = g.part.def;
      const own = def.line ? def.line(r, m) : m.on === true
        ? { text: `  💡 ${def.name.toUpperCase()} ON  (${m.current.toFixed(1)} mA)`, cls: 'sim-on' } : null;
      if (own) { lines.push({ text: own.text, cls: own.cls }); outputs++; }
      warnings.forEach(t => lines.push({ text: '  ' + t, cls: m.on === true ? 'sim-err' : 'sim-warn' }));
      const modes = Object.values(r.modes);
      if (warnings.length && modes.length && modes.every(x => x === 'off')) explained++;
    });

    const flowing = sourceAmps.some(a => a > OPEN_AMPS);
    if (!flowing && !outputs && !explained) {
      lines.push({ text: '  Circuit open — no complete path.', cls: 'sim-warn' });
      sources.forEach(src => {
        const linked = graph.some(g => g !== src && g.nodes.some(n => src.nodes.includes(n)));
        if (!linked) lines.push({ text: '  ⚠ Battery terminals not connected to anything.', cls: 'sim-warn' });
      });
    } else if (flowing && !outputs && !explained) {
      lines.push({ text: '  No output components in circuit path.', cls: 'sim-info' });
    }

    return done({ status: 'ok', lines: withHeads(results), nodeVoltages, currents, shorted: false, voltageAt, parts }, extra);
  }

  // ── Pure: simulationSummary ──────────────────────────────────
  //
  //  analyze() as markdown lines for the AI's "## Simulation" section: the
  //  status, each part's report, each pin's voltage, then the analysis
  //  messages. Volts to 2 decimals, currents to 0.1 mA, so the prompt
  //  stays short. labelOf(components, comp) names a part ("R1").

  // Hole address as App.formatHole writes it: "a11", "tp_2", from ids.js.
  // The page loads ids.js after this file, so App is read at call time.
  const Ids = typeof module === 'object' && module.exports ? require('./ids.js') : null;
  const holeName = ref => (Ids || App).holeName(ref);

  const volts = v => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2) + ' V';
  const milliamps = a => (Math.abs(a) < 0.00005 ? 0 : a * 1000).toFixed(1) + ' mA';
  // analyze's messages, minus the per-part ones the summary already states.
  const partMessage = l => l.cls === 'sim-on' || HEADLINES.has(l);
  const plain = t => t.replace(/[⚠💡🔔🟢⭕]/gu, '').replace(/\s+/g, ' ').trim();

  function simulationSummary(components, wires, labelOf) {
    const { r, graph, results, live } = run(components, wires);
    if (r.status === 'empty')     return ['The board is empty: no components placed.'];
    if (r.status === 'no-source') return ['No battery on the board.'];

    const messages = r.lines.filter(l => !partMessage(l)).map(l => '- ' + plain(l.text));
    if (r.status === 'unsolvable') {
      return ['Status: unsolvable. The simulator cannot solve this circuit.'].concat(messages);
    }
    if (r.status === 'unsettled') {
      return ['Status: unsettled. The simulator could not settle this circuit, so it has no readings.'].concat(messages);
    }

    const src0 = components.find(c => { const d = partDef(c.type); return d && d.ref !== undefined; });
    const ref  = partDef(src0.type).ref;
    const out  = [`Status: ${r.shorted ? 'short circuit' : 'solved'}. Voltages are measured from ${labelOf(components, src0)}.${ref} (the first battery's − terminal).`];
    if (!results) return out.concat(messages);   // a source shorted by a wire solves nothing

    // Off-board pins have no hole for voltageAt, so read every pin by node.
    const pinVoltage = (i, k) => {
      const n = graph[i].nodes[k];
      return live.has(n) ? r.nodeVoltages[n] : null;
    };
    components.forEach((c, i) => {
      const label = labelOf(components, c);
      const res = results[i], def = res && graph[i].part.def;
      // A short solves to tens of amps, not a reading worth showing.
      if (!res) {
        const I = r.currents[i];
        out.push(`- ${label}: ${c.type}` + (r.shorted || typeof I !== 'number' ? '' : ', ' + milliamps(Math.abs(I))));
      } else {
        out.push(`- ${label}: ` + (r.shorted ? def.name.toLowerCase() : def.report(res.r, res.m)));
      }
      c.pins.forEach((_, k) => {
        const v = pinVoltage(i, k);
        const reading = v == null ? 'floating (not connected to the battery)' : volts(v);
        const hole = c.holeRefs?.[k];
        if (!hole) { out.push(`  - ${label}.${k} (off-board): ${reading}`); return; }
        const pin  = def ? def.pins[k] : undefined;
        const role = pin !== undefined && !/^\d+$/.test(pin) ? ', ' + pin : '';   // ", cathode", ", lead1"
        out.push(`  - ${label} pin ${k} (${holeName(hole)}${role}): ${reading}`);
      });
    });
    return out.concat(messages);
  }

  // ── Presentation ─────────────────────────────────────────────
  //  DOM and THREE live below this line; each part draws, glows and
  //  sounds in its own view.update.

  // ── Visual: registry parts ──────────────────────────────────
  //  A part with view.update glows (or spins, or sounds) from its own
  //  measure(); with {} it goes back to how it was drawn.
  function viewOf(comp) {
    const def = comp && comp.group ? partDef(comp.type) : null;
    return def && def.view && typeof def.view.update === 'function' ? def.view : null;
  }

  // Every part last handed a reading, so one deleted since still goes quiet.
  let _shown = new Set();

  // After a run: each part with a reading gets it, every other part {}.
  function showParts(components, parts) {
    const now = new Set();
    components.forEach(c => {
      const view = viewOf(c);
      if (!view) return;
      const p = c.label != null ? parts[c.label] : null;
      view.update(c, p ? p.m : {}, p ? p.r : null);
      now.add(c);
    });
    _shown.forEach(c => { if (!now.has(c)) { const view = viewOf(c); if (view) view.update(c, {}, null); } });
    _shown = now;
  }

  function resetParts(components) {
    showParts(components, {});
    _shown = new Set();
  }

  // Stop puts every momentary control back to its default (a button
  // pops back up); other controls keep their setting.
  function resetControls(components) {
    components.forEach(c => {
      const def = c ? partDef(c.type) : null;
      if (!def || !def.controls || !c.controls) return;
      for (const [key, spec] of Object.entries(def.controls)) {
        if (spec.type === 'momentary') c.controls[key] = spec.default;
      }
    });
  }

  // ── Results overlay ─────────────────────────────────────────
  function showResults(lines) {
    let box = document.getElementById('sim-results');
    if (!box) {
      box = document.createElement('div');
      box.id = 'sim-results';
      document.getElementById('canvas-wrap').appendChild(box);
    }
    box.innerHTML = lines.map(l =>
      `<div class="sim-line ${l.cls || ''}">${l.text}</div>`
    ).join('');
    box.style.display = 'block';
  }

  function hideResults() {
    const b = document.getElementById('sim-results');
    if (b) b.style.display = 'none';
  }

  // ── Public: runSimulation ────────────────────────────────────
  //  Solve with analyze(), then render the result. A run while the
  //  simulation is already going (a click on a part, a delete) keeps the
  //  mode; each part's view.update gets its new reading.
  function runSimulation() {
    const { components, wires } = App.state;

    // Switch to select mode so the user can click parts during simulation
    if (!App.simRunning && App.setMode) App.setMode('select');

    const result = analyze(components, wires);
    showResults(result.lines);
    showParts(components, result.status === 'ok' && !result.shorted ? result.parts : {});
    if (result.status === 'empty') return;

    if (result.status === 'ok') {
      App.simRunning = true;
      document.getElementById('sim-run-btn').style.display  = 'none';
      document.getElementById('sim-stop-btn').style.display = 'inline-flex';
    }
  }

  // ── Public: stopSimulation ──────────────────────────────────
  function stopSimulation() {
    resetControls(App.state.components);
    resetParts(App.state.components);
    hideResults();
    App.simRunning = false;
    const runBtn  = document.getElementById('sim-run-btn');
    const stopBtn = document.getElementById('sim-stop-btn');
    if (runBtn)  runBtn.style.display  = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
  }

  // ── Wiring ───────────────────────────────────────────────────
  function install(app) {
    App = app;
    App.runSimulation  = runSimulation;
    App.stopSimulation = stopSimulation;
    App.simulationSummary = simulationSummary;
  }

  return { UnionFind, bbNodeId, buildGraph, solveLinear, settleModes, analyze, simulationSummary, install };
});
