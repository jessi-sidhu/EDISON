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
//    bb_rail_bn    →  all holes in the bottom − rail row (negative)
//    bb_rail_bp    →  all holes in the bottom + rail row (positive)
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
//           simulationSummary, pickDt) so a test runner can call it.
//  Everything above the "Presentation" divider is pure: no document,
//  no THREE, no audio.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Sim = factory();
  if (typeof module === 'object' && module.exports) module.exports = Sim;
  if (root) { root.Sim = Sim; Sim.install(root.App = root.App || {}); }   // window.Sim: readings.js builds nets with it
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
        // An E's nodes are its out pair; its sensed ctrl pair and rails ride alongside.
        g.part = { def, values, controls, els: els.map(el => (el.kind === 'E'
          ? { el, nodes: el.out.map(node), ctrl: el.ctrl.map(node), rails: el.rails && el.rails.map(node) }
          : { el, nodes: (el.pins || []).map(node) })) };
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
  //  V or E element's current. A mode block (a D element, or an E with
  //  rails or ilim) is piecewise linear: a D is open when off, Vf in series
  //  with ron when on; an E is linear, clipped or current-limited. The modes are found by
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
  // modeOf:  Map(element entry -> 'off' | 'on' | 'breakdown' for a D,
  //          'linear' | 'high' | 'low' | 'isrc+' | 'isrc−' for an E).
  // skip:    Set of V element entries left out (the later sources of a
  //          parallel group, parallelSources); optional.
  // Returns { v(node), vCurrent: Map(V element entry -> amps),
  // eCurrent: Map(E element entry -> amps out of out+) } or null.
  function solveMNA(graph, grounds, modeOf, skip) {
    const index = new Map();
    const add = n => { if (n != null && !grounds.has(n) && !index.has(n)) index.set(n, index.size); };
    graph.forEach(g => {
      g.nodes.forEach(add);
      if (g.part) g.part.els.forEach(e => { e.nodes.forEach(add); if (e.ctrl) e.ctrl.forEach(add); if (e.rails) e.rails.forEach(add); });
    });
    const els = allElements(graph);
    const vs  = els.filter(e => e.el.kind === 'V' && !(skip && skip.has(e)));
    const es  = els.filter(e => e.el.kind === 'E');
    const N = index.size, size = N + vs.length + es.length;
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
      // I: a set current out of the source's `to` pin, back into its `from`.
      if (el.kind === 'I') { inject(n2, el.amps); inject(n1, -el.amps); }
      // C in a time step (e.cap, set by analyzeCircuit): backward Euler,
      // G = C/dt from a to b plus G·v_prev pushed into a. Open otherwise.
      if (el.kind === 'C' && e.cap) {
        conductance(n1, n2, e.cap.G);
        inject(n1, e.cap.G * e.cap.vPrev);
        inject(n2, -e.cap.G * e.cap.vPrev);
      }
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

    // E: one more unknown, its output current j, + out of out+ into the
    // circuit and back in at out−. Its row is the mode's law, rout in series:
    //   linear  V(out+) − V(out−) − gain·(V(ctrl+) − V(ctrl−)) + rout·j = 0
    //   high    V(out+) − V(vpos) + rout·j = −headroom
    //   low     V(out+) − V(vneg) + rout·j = +headroom
    //   isrc±   j = ±ilim
    // An E that is not a mode block (no rails, no ilim) is always linear.
    es.forEach((e, k) => {
      const row = N + vs.length + k, el = e.el, [op, om] = e.nodes;
      const put = (n, c) => { const i = at(n); if (i >= 0) A[row][i] += c; };
      if (at(op) >= 0) A[at(op)][row] -= 1;
      if (at(om) >= 0) A[at(om)][row] += 1;
      const mode = modeOf.get(e) || 'linear';
      if (mode === 'isrc+' || mode === 'isrc−') { A[row][row] = 1; b[row] = mode === 'isrc+' ? el.ilim : -el.ilim; return; }
      A[row][row] = el.rout || 0;
      put(op, 1);
      if (mode === 'high')     { put(e.rails[1], -1); b[row] = -(el.headroom || 0); }
      else if (mode === 'low') { put(e.rails[0], -1); b[row] = el.headroom || 0; }
      else { put(om, -1); put(e.ctrl[0], -el.gain); put(e.ctrl[1], el.gain); }
    });

    const x = solveLinear(A, b);
    if (!x) return null;
    const vCurrent = new Map(vs.map((e, k) => [e, x[N + k]]));
    const eCurrent = new Map(es.map((e, k) => [e, x[N + vs.length + k]]));
    return { v: n => (grounds.has(n) ? 0 : x[index.get(n)]), vCurrent, eCurrent };
  }

  // Amps through one of a registry part's elements, + in its pin order.
  function elementAmps(e, sol, mode) {
    const { el, nodes: [a, b] } = e;
    if (el.kind === 'R' && el.ohms > 0) return (sol.v(a) - sol.v(b)) / el.ohms;
    if (el.kind === 'SW') return el.closed ? (sol.v(a) - sol.v(b)) / SW_OHMS : 0;
    if (el.kind === 'V') return sol.vCurrent.get(e) || 0;
    if (el.kind === 'E') return sol.eCurrent.get(e) || 0;   // + out of out+
    if (el.kind === 'I') return el.amps;
    if (el.kind === 'C') return e.cap ? e.cap.G * (sol.v(a) - sol.v(b) - e.cap.vPrev) : 0;
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

  // An E with rails or ilim is a mode block (linear / high / low / isrc+ /
  // isrc−). Levels are node voltages: the drive u = V(out−) + gain·vd (what
  // linear asks for), hi = V(vpos) − headroom, lo = V(vneg) + headroom (±∞
  // with no rails), ilim ∞ when missing. isrc± holds while the clipped
  // drive behind rout would push more than ilim. As checkDiode: null if
  // consistent, else { by, to }; 1 mA past the limit weighs as 1 V.
  const isModeE = e => e.el.kind === 'E' && (e.el.rails !== undefined || e.el.ilim !== undefined);
  function checkE(e, sol, mode) {
    const { el, nodes: [op, om], ctrl: [cp, cm], rails } = e;
    const rout = el.rout || 0, hr = el.headroom || 0;
    const ilim = el.ilim !== undefined ? el.ilim : Infinity;
    const u    = sol.v(om) + el.gain * (sol.v(cp) - sol.v(cm));
    const hi   = rails ? sol.v(rails[1]) - hr : Infinity;
    const lo   = rails ? sol.v(rails[0]) + hr : -Infinity;
    const want = Math.min(hi, Math.max(lo, u));
    const asks = u >= hi ? 'high' : u <= lo ? 'low' : 'linear';
    const j    = sol.eCurrent.get(e);
    let by = 0, to = null;
    const worse = (b, t) => { if (b > by) { by = b; to = t; } };
    if (mode === 'isrc+')      worse(sol.v(op) - (want - rout * ilim), asks);
    else if (mode === 'isrc−') worse(want + rout * ilim - sol.v(op), asks);
    else {
      if (mode === 'linear') { worse(u - hi, 'high'); worse(lo - u, 'low'); }
      if (mode === 'high') worse(hi - u, asks);
      if (mode === 'low')  worse(u - lo, asks);
      worse((j - ilim) * 1000, 'isrc+');
      worse((-j - ilim) * 1000, 'isrc−');
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
  //  Given the settled modes (modeOf), an off mode block joins nothing
  //  either, so a node cut off from every source by off diodes reads null
  //  in the results, not the 0 V GMIN leaves it at (bug #73).
  const isSource = g => !!(g.part && g.part.def.ref !== undefined);
  const refNode  = g => g.nodes[g.part.def.pins.indexOf(g.part.def.ref)];
  const conducts = (e, modeOf) => !(e.el.kind === 'SW' && !e.el.closed) &&
    !(e.el.kind === 'C' && !e.cap) && !(modeOf && modeOf.get(e) === 'off');

  function groundCircuits(graph, modeOf) {
    const uf = new UnionFind();
    graph.forEach(g => {
      g.nodes.forEach(n => uf.make(n));
      // A part the registry doesn't know joins all its pins, as before.
      if (!g.part) { g.nodes.forEach(n => uf.union(g.nodes[0], n)); return; }
      g.part.els.forEach(e => {
        e.nodes.forEach(n => uf.make(n));
        if (conducts(e, modeOf)) e.nodes.forEach(n => uf.union(e.nodes[0], n));
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
  // pinMax, only for floating pins: the highest the node could rise before
  // an off diode with its anode there would conduct, min over them of
  // V(cathode) + vf, the cathode driven or itself capped (a chain of off
  // diodes); null if none caps it (#73). Each pass that lowers a cap adds
  // vf > 0 along a chain, so it settles within one pass per diode.
  function partResults(graph, sol, live, modeOf, openSol) {
    const cap = new Map();   // floating node → its lowest cap
    const offEls = [...modeOf].filter(([, mode]) => mode === 'off').map(([e]) => e);
    for (let pass = 0; pass <= offEls.length; pass++) {
      let dropped = false;
      offEls.forEach(({ el, nodes: [a, c] }) => {
        if (live.has(a)) return;
        const base = live.has(c) ? sol.v(c) : cap.get(c);
        if (base === undefined) return;
        const v = base + el.vf;
        if (!cap.has(a) || v < cap.get(a)) { cap.set(a, v); dropped = true; }
      });
      if (!dropped) break;
    }
    return graph.map((g, i) => {
      if (!g.part) return null;
      const { nodes, part: { def, els } } = g;
      const r = bareResult(graph, i);
      def.pins.forEach((pin, k) => { r.pins[pin] = live.has(nodes[k]) ? sol.v(nodes[k]) : null; });
      def.pins.forEach((pin, k) => {
        if (r.pins[pin] !== null) return;
        r.pinMax = r.pinMax || {};
        r.pinMax[pin] = cap.has(nodes[k]) ? cap.get(nodes[k]) : null;
      });
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

  // ── Parallel sources (issue #50) ────────────────────────────
  //  V elements whose + and − land on the same two nodes are one group,
  //  in board order. Same polarity and voltages within 1 mV: only the
  //  first is stamped (the rest go in skip) and the group's current is
  //  split evenly after the solve. Otherwise the group would fight, and
  //  `fight` is the one line that says so.
  //  Returns { groups: [[V element entry]], skip: Set, info: [text], fight }.
  const SAME_VOLTS = 1e-3;
  const listNames = ns => (ns.length < 3 ? ns.join(' and ') : ns.slice(0, -1).join(', ') + ' and ' + ns[ns.length - 1]);

  function parallelSources(graph) {
    const byPair = new Map();
    graph.forEach((g, i) => {
      if (!g.part) return;
      g.part.els.forEach(e => {
        if (e.el.kind !== 'V') return;
        const key = e.nodes.slice(0, 2).sort().join('|');
        if (!byPair.has(key)) byPair.set(key, []);
        byPair.get(key).push({ e, i });
      });
    });
    const out = { groups: [], skip: new Set(), info: [], fight: null };
    const name = i => bareResult(graph, i).label;
    const volts = e => e.el.volts || 0;
    for (const members of byPair.values()) {
      if (members.length < 2) continue;
      const [first, ...rest] = members;
      const flipped = rest.find(x => x.e.nodes[0] !== first.e.nodes[0]);
      if (flipped) {
        out.fight = out.fight || `  ⚠ ${name(first.i)} and ${name(flipped.i)} are wired straight across each other, + to −. ` +
          'Batteries facing opposite ways would fight. Give each its own rails or remove one.';
        continue;
      }
      const other = rest.find(x => Math.abs(volts(x.e) - volts(first.e)) > SAME_VOLTS);
      if (other) {
        out.fight = out.fight || `  ⚠ ${name(first.i)} (${volts(first.e)} V) and ${name(other.i)} (${volts(other.e)} V) are wired straight across each other. ` +
          'Different voltages in parallel would fight. Give each its own rails or remove one.';
        continue;
      }
      out.groups.push(members.map(x => x.e));
      rest.forEach(x => out.skip.add(x.e));
      out.info.push(`  ${listNames(members.map(x => name(x.i)))} are in parallel (${volts(first.e)} V each), so they share the load.`);
    }
    return out;
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
  //
  //  step = { dt, state } (optional) runs one time step of dt seconds: each
  //  C starts at state[`${label}.${id}`] volts (0 when missing), and a
  //  solved result also has state, each C's volts after the step. Without
  //  dt a C is open.
  function analyze(components, wires, step) {
    return run(components, wires, step).r;
  }

  // analyze(), plus what simulationSummary reads: the graph, each part's
  // result by index, and the live nodes.
  function run(components, wires, step) {
    const out = analyzeCircuit(components, wires, step);
    for (const c of components) {
      if (!c || !c.flag) continue;
      out.r.lines.push({ text: '  ⚠ ' + c.flag, cls: 'sim-warn' });
      if (out.r.parts && out.r.parts[c.label]) out.r.parts[c.label].warnings.push(c.flag);
    }
    return out;
  }

  // Headline lines, marked so the summary can leave them out.
  const HEADLINES = new WeakSet();

  function analyzeCircuit(components, wires, step) {
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

    // A time step: each C gets its companion (e.cap) and a state key.
    const timed = !!(step && step.dt > 0);
    const caps  = [];
    if (timed) {
      graph.forEach((g, i) => {
        if (!g.part) return;
        g.part.els.forEach((e, k) => {
          if (e.el.kind !== 'C') return;
          const key  = bareResult(graph, i).label + '.' + (e.el.id !== undefined ? e.el.id : k);
          const prev = step.state && Number.isFinite(step.state[key]) ? step.state[key] : 0;
          e.cap = { G: e.el.farads / step.dt, vPrev: prev };
          caps.push({ e, key });
        });
      });
    }

    // Sources straight across each other: one stamped, or a fight.
    const parallel = parallelSources(graph);
    if (parallel.fight) {
      lines.push({ text: parallel.fight, cls: 'sim-err' });
      return done({ status: 'unsolvable', lines: withHeads(null) });
    }

    // Every mode block (D, and E with rails or ilim) in board order, and the loop that settles them.
    const { grounds } = groundCircuits(graph);
    const blockEls = els.filter(e => e.el.kind === 'D' || isModeE(e));
    const blocks   = blockEls.map(e => (e.el.kind === 'E'
      ? { initial: 'linear', check: (sol, mode) => checkE(e, sol, mode) }
      : { initial: 'off', check: (sol, mode) => checkDiode(e, sol, mode) }));
    const modesOf  = modes => new Map(blockEls.map((e, i) => [e, modes[i]]));
    const solveFor = modes => solveMNA(graph, grounds, modesOf(modes), parallel.skip);

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
    // An ideal current source with no loop outside it (through settled
    // modes) would force its current anyway: no path, so no readings.
    if (els.some(e => e.el.kind === 'I')) {
      const uf = new UnionFind();
      els.forEach(e => {
        e.nodes.forEach(n => uf.make(n));
        if (e.el.kind !== 'I' && conducts(e, modeOf)) e.nodes.forEach(n => uf.union(e.nodes[0], n));
      });
      if (els.some(e => e.el.kind === 'I' && uf.find(e.nodes[0]) !== uf.find(e.nodes[1]))) {
        lines.push({ text: '  ⚠ No path for the current: wire the current source into a closed loop.', cls: 'sim-err' });
        return done({ status: 'unsolvable', lines: withHeads(null) });
      }
    }
    // The nodes a source reaches through the settled modes: these read volts.
    const { live } = groundCircuits(graph, modeOf);
    // Amps through each stamped source, read before the split below, so a
    // parallel group counts its total (a short is a short however shared).
    const sourceAmps = [...sol.vCurrent.values()].map(Math.abs);
    // Each source of a parallel group carries an even share of its current.
    parallel.groups.forEach(group => {
      const share = sol.vCurrent.get(group[0]) / group.length;
      group.forEach(e => sol.vCurrent.set(e, share));
    });
    // What each mode block would see on its own: every block off. Leaving
    // the others on would let a parallel LED pin the shared node near Vf.
    // An E has no off: it keeps its settled mode, but isrc± becomes the rail
    // it pushes toward (linear with no rails), so ±ilim into a node only
    // GMIN holds can't read ~1e10 V.
    const openMode = (e, m) => (m === 'isrc+' || m === 'isrc−' ? (!e.rails ? 'linear' : m === 'isrc+' ? 'high' : 'low') : m);
    const openSol = blockEls.length ? solveFor(blockEls.map((e, i) => (e.el.kind === 'E' ? openMode(e, solved.modes[i]) : 'off'))) : sol;

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
    const after = {};
    caps.forEach(({ e, key }) => { after[key] = sol.v(e.nodes[0]) - sol.v(e.nodes[1]); });
    const timedState = timed ? { state: after } : {};

    // A source shorted through a part's mode block: that part's warnings
    // say why, the first as the error and the rest as advice.
    if (sourceAmps.some(a => a > SHORT_AMPS)) {
      const k = graph.findIndex(g => g.part &&
        g.part.els.some(e => modeOf.has(e) && Math.abs(elementAmps(e, sol, modeOf.get(e))) > SHORT_AMPS));
      const said = k >= 0 ? results[k].warnings : [];
      if (said.length) said.forEach((t, j) => lines.push({ text: '  ' + t, cls: j === 0 ? 'sim-err' : 'sim-info' }));
      else lines.push({ text: '  ⚠ Short circuit — no resistance in path!', cls: 'sim-err' });
      return done(Object.assign({ status: 'ok', lines: withHeads(results), nodeVoltages, currents, shorted: true, voltageAt, parts }, timedState), extra);
    }

    parallel.info.forEach(text => lines.push({ text, cls: 'sim-info' }));

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
    // A capacitor charging or discharging is a complete path, even with
    // the battery supplying nothing.
    const capFlowing = caps.some(({ e }) => Math.abs(elementAmps(e, sol)) >= OPEN_AMPS);
    if (!flowing && !capFlowing && !outputs && !explained) {
      lines.push({ text: '  Circuit open — no complete path.', cls: 'sim-warn' });
      sources.forEach(src => {
        const linked = graph.some(g => g !== src && g.nodes.some(n => src.nodes.includes(n)));
        if (!linked) lines.push({ text: '  ⚠ Battery terminals not connected to anything.', cls: 'sim-warn' });
      });
    } else if (flowing && !outputs && !explained) {
      lines.push({ text: '  No output components in circuit path.', cls: 'sim-info' });
    }

    return done(Object.assign({ status: 'ok', lines: withHeads(results), nodeVoltages, currents, shorted: false, voltageAt, parts }, timedState), extra);
  }

  // ── Pure: time step size ─────────────────────────────────────
  //  pickDt(tauMin): the step for a time run, τ/50 seconds clamped to
  //  10 µs–10 ms; 1 ms when τ can't be estimated.
  const DT_MIN = 1e-5, DT_MAX = 1e-2, DT_UNKNOWN = 1e-3;
  function pickDt(tauMin) {
    if (typeof tauMin !== 'number' || !Number.isFinite(tauMin) || tauMin <= 0) return DT_UNKNOWN;
    return Math.min(DT_MAX, Math.max(DT_MIN, tauMin / 50));
  }

  // A cheap guess at the board's fastest time constant: the smallest R
  // times the smallest C. undefined when there is no R or no C.
  function estimateTau(components) {
    let rMin = Infinity, cMin = Infinity;
    components.forEach(comp => {
      const def = comp ? partDef(comp.type) : null;
      if (!def || typeof def.elements !== 'function') return;
      def.elements(partValues(def, comp), partControls(def, comp)).forEach(el => {
        if (el.kind === 'R' && el.ohms > 0) rMin = Math.min(rMin, el.ohms);
        if (el.kind === 'C' && el.farads > 0) cMin = Math.min(cMin, el.farads);
      });
    });
    return Number.isFinite(rMin) && Number.isFinite(cMin) ? rMin * cMin : undefined;
  }

  // Does the board hold a C element? Then Run starts the time loop.
  function hasCapacitor(components) {
    return components.some(comp => {
      const def = comp ? partDef(comp.type) : null;
      if (!def || typeof def.elements !== 'function') return false;
      return def.elements(partValues(def, comp), partControls(def, comp)).some(el => el.kind === 'C');
    });
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
    const def0 = partDef(src0.type), ref = def0.ref;
    // An off-board 2-pin source reads as today's battery; others name the ref pin by index.
    const from = def0.pins.length === 2 && def0.place.kind === 'offboard' ? `${labelOf(components, src0)}.${ref} (the first battery's − terminal)`
      : `${labelOf(components, src0)}.${def0.pins.indexOf(ref)} (${ref.toUpperCase()}, the ${def0.name.toLowerCase()}'s ground)`;
    const out  = [`Status: ${r.shorted ? 'short circuit' : 'solved'}. Voltages are measured from ${from}.`];
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
  //  clock (optional): the time run's "t = 1.23 s" line, shown first.
  function showResults(lines, clock) {
    let box = document.getElementById('sim-results');
    if (!box) {
      box = document.createElement('div');
      box.id = 'sim-results';
      document.getElementById('canvas-wrap').appendChild(box);
    }
    const top = clock ? `<div class="sim-line sim-clock">${clock}</div>` : '';
    box.innerHTML = top + lines.map(l =>
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

    // A time run already going: the next frame re-reads the board, and the
    // capacitors keep their charge.
    if (_time) { _time.dirty = true; return; }

    // Switch to select mode so the user can click parts during simulation
    if (!App.simRunning && App.setMode) App.setMode('select');

    if (hasCapacitor(components)) { startTimeRun(); return; }

    const result = analyze(components, wires);
    showResults(result.lines);
    showParts(components, result.status === 'ok' && !result.shorted ? result.parts : {});
    // Every solve is announced; the Phase 3 tools listen (API-CONTRACT → "Page events").
    const readings = window.Readings ? window.Readings.from(result, { components, wires }) : null;
    document.dispatchEvent(new CustomEvent('plugged:sim', { detail: { result, readings } }));
    if (result.status === 'empty') return;

    if (result.status === 'ok') {
      App.simRunning = true;
      document.getElementById('sim-run-btn').style.display  = 'none';
      document.getElementById('sim-stop-btn').style.display = 'inline-flex';
    }
  }

  // ── Time run ─────────────────────────────────────────────────
  //  A board with a C keeps simulating: each animation frame takes up to
  //  MAX_STEPS steps of dt, carrying each C's volts (state) forward, so sim
  //  time keeps pace with real time (or falls behind, "(slowed)"). Then the
  //  frame renders the latest result and announces it, like a single run.
  const MAX_STEPS = 200;
  let _time = null;   // { raf, dt, state, t, budget, last, slowed, dirty, result }

  function timedStep(run) {
    const { components, wires } = App.state;
    const result = analyze(components, wires, { dt: run.dt, state: run.state });
    if (result.state) run.state = result.state;   // early returns carry none
    run.t += run.dt;
    run.result = result;
    return result;
  }

  function renderTimed(run) {
    const { components, wires } = App.state;
    const result = run.result;
    const clock  = `t = ${run.t.toFixed(2)} s` + (run.slowed ? ' (slowed)' : '');
    showResults(result.lines, clock);
    showParts(components, result.status === 'ok' && !result.shorted ? result.parts : {});
    const readings = window.Readings ? window.Readings.from(result, { components, wires }) : null;
    document.dispatchEvent(new CustomEvent('plugged:sim', { detail: { result, readings } }));
  }

  function startTimeRun() {
    const run = { raf: 0, dt: pickDt(estimateTau(App.state.components)), state: {}, t: 0,
                  budget: 0, last: performance.now(), slowed: false, dirty: false, result: null };
    const result = timedStep(run);
    run.budget = -run.dt;   // that first step is paid back by the first frames
    if (result.status !== 'ok') {
      // Nothing to run: shown once, as a single run would.
      showResults(result.lines);
      showParts(App.state.components, {});
      const readings = window.Readings ? window.Readings.from(result, App.state) : null;
      document.dispatchEvent(new CustomEvent('plugged:sim', { detail: { result, readings } }));
      return;
    }
    _time = run;
    App.simRunning = true;
    document.getElementById('sim-run-btn').style.display  = 'none';
    document.getElementById('sim-stop-btn').style.display = 'inline-flex';
    renderTimed(run);
    run.raf = requestAnimationFrame(timeFrame);
  }

  function timeFrame(now) {
    const run = _time;
    if (!run) return;
    // The last capacitor deleted: back to a single solve.
    if (!hasCapacitor(App.state.components)) {
      _time = null;
      runSimulation();
      return;
    }
    if (run.dirty) run.dt = pickDt(estimateTau(App.state.components));
    run.budget += Math.max(0, now - run.last) / 1000;
    run.last = now;
    let n = Math.floor(run.budget / run.dt + 1e-9);
    run.slowed = n > MAX_STEPS;
    if (run.slowed) { n = MAX_STEPS; run.budget = 0; } else run.budget -= n * run.dt;
    if (run.dirty && n === 0) n = 1;   // a changed board shows at once
    run.dirty = false;
    for (let i = 0; i < n; i++) timedStep(run);   // a step ahead is paid back (budget < 0)
    renderTimed(run);
    run.raf = requestAnimationFrame(timeFrame);
  }

  function stopTimeRun() {
    if (!_time) return;
    cancelAnimationFrame(_time.raf);
    _time = null;
  }

  // ── Public: stopSimulation ──────────────────────────────────
  function stopSimulation() {
    stopTimeRun();
    resetControls(App.state.components);
    resetParts(App.state.components);
    hideResults();
    App.simRunning = false;
    const runBtn  = document.getElementById('sim-run-btn');
    const stopBtn = document.getElementById('sim-stop-btn');
    if (runBtn)  runBtn.style.display  = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
    document.dispatchEvent(new CustomEvent('plugged:sim-stop'));
  }

  // ── Wiring ───────────────────────────────────────────────────
  function install(app) {
    App = app;
    App.runSimulation  = runSimulation;
    App.stopSimulation = stopSimulation;
    App.simulationSummary = simulationSummary;
  }

  return { UnionFind, bbNodeId, buildGraph, solveLinear, settleModes, analyze, simulationSummary, pickDt, install };
});
