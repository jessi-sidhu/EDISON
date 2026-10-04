// ─────────────────────────────────────────────────────────────
//  readings.js — what every Phase 3 tool reads from a solve (issue #90).
//  The shape is docs/API-CONTRACT.md → "Readings". Units V, mA and W.
//
//    Readings.from(result, board)  result from Sim.analyze, board the
//                                  { components, wires } given to it
//      netOf(hole)     "b14" → { id, holes[], pins[{ label, pin }] }, or
//                      null for a hole not on the board
//      voltage(x)      a hole, a net or a net id → volts; null when floating
//      part(label)     { V, I, P, rating, over }, or null without readings
//      kcl(net)        [{ label, pin, amps }], each element's current INTO
//                      the net in mA; sums to about 0
//    Readings.nets(board)  every net, with no solve
//
//  Nets come from simulate.js's own buildGraph, so they always match the
//  solver. Never throws, never changes the solver. No DOM, no THREE.
//
//  EXPORTS
//  ───────
//  Browser: window.Readings (after simulate.js, which sets window.Sim)
//  Node:    module.exports, so a test runner can call it
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Readings = factory();
  if (typeof module === 'object' && module.exports) module.exports = Readings;
  if (root) root.Readings = Readings;
})(typeof window !== 'undefined' ? window : null, function () {

  const inNode = typeof module === 'object' && module.exports;
  const Sim    = inNode ? require('./simulate.js') : window.Sim;
  const GEO    = inNode ? require('./board-geometry.js') : window.App.BOARD_GEOMETRY;
  const COLS   = GEO.COLS;

  // Hole names by ids.js's holeName. The page loads ids.js after this
  // file, so App is read at call time.
  const Ids  = inNode ? require('./ids.js') : null;
  const ROWS = GEO.ALL_ROWS;

  // Ratings the part files don't expose as values.
  const RESISTOR_W = 0.25;   // W, every kit resistor is ¼ W
  const ZENER_W    = 0.5;    // W, the same as MAX_POWER in parts/zener.js

  // "b14" → { col: 13, row: 'b' }, "tp_50" → { col: 49, row: 'tp' };
  // null when it isn't a hole on this board.
  function parseHole(s) {
    const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/.exec(String(s));
    if (!m) return null;
    const col = Number(m[2] || m[4]) - 1;
    return col >= 0 && col < COLS ? { col, row: m[1] || m[3] } : null;
  }

  // The graph and every net, keyed by the node id buildGraph gives it.
  function netsOf(board) {
    const components = (board && board.components) || [];
    const graph = Sim.buildGraph(components, (board && board.wires) || []);
    const byId = new Map();
    const netAt = id => {
      if (!byId.has(id)) byId.set(id, { id, holes: [], pins: [] });
      return byId.get(id);
    };
    const holeName = (Ids || window.App).holeName;
    for (const row of ROWS) {
      for (let col = 0; col < COLS; col++) netAt(graph.nodeOf({ col, row })).holes.push(holeName({ col, row }));
    }
    graph.forEach(g => g.nodes.forEach((id, k) => {
      const pin = g.part ? g.part.def.pins[k] : String(k);
      netAt(id).pins.push({ label: g.comp.label, pin });
    }));
    return { graph, byId };
  }

  function nets(board) {
    try { return [...netsOf(board).byId.values()]; } catch { return []; }
  }

  // { W } or { mA } from the part's own values, or null.
  function ratingOf(type, values) {
    if (type === 'resistor') return { W: RESISTOR_W };
    if (type === 'zener')    return { W: ZENER_W };
    if (values && typeof values.maxCurrent === 'number') return { mA: values.maxCurrent * 1000 };
    return null;
  }

  function from(result, board) {
    const res = result || {};
    const parts = res.parts || {};
    let graph = [], byId = new Map();
    try { ({ graph, byId } = netsOf(board)); } catch { /* no nets: every lookup reads null */ }

    function netOf(hole) {
      const ref = parseHole(hole);
      return ref && graph.nodeOf ? byId.get(graph.nodeOf(ref)) || null : null;
    }

    // A net by its id, so one from an older readings resolves here too.
    const asNet = x => byId.get(x && typeof x === 'object' ? x.id : x) || null;

    function voltage(x) {
      const ref = typeof x === 'string' ? parseHole(x) : null;
      if (ref) return res.voltageAt ? res.voltageAt(ref) : null;
      const net = asNet(x);
      if (!net) return null;
      if (net.holes.length) return voltage(net.holes[0]);
      // An off-board pin with no wire: read it from its part's result.
      const p = net.pins.find(q => parts[q.label]);
      const v = p ? parts[p.label].r.pins[p.pin] : null;
      return typeof v === 'number' ? v : null;
    }

    function part(label) {
      const pr = parts[label];
      const ci = graph.findIndex(g => g.comp.label === label && g.part);
      if (!pr || ci < 0) return null;
      const pins = graph[ci].part.def.pins;
      const a = pr.r.pins[pins[0]], b = pr.r.pins[pins[pins.length - 1]];
      const V = typeof a === 'number' && typeof b === 'number' ? a - b : null;
      const I = typeof res.currents[ci] === 'number' ? res.currents[ci] * 1000 : null;   // simulate.js partAmps, pin 0 → pin 1
      const P = V !== null && I !== null ? V * I / 1000 : null;
      const rating = ratingOf(graph[ci].comp.type, pr.r.values);
      const over = !!rating && (rating.W !== undefined ? P !== null && Math.abs(P) > rating.W
                                                       : I !== null && Math.abs(I) > rating.mA);
      return { V, I, P, rating, over };
    }

    // Element pins [a, b], current I mA from a to b through it: −I flows
    // into the net at a, +I at b. Internal "#" nodes are never a net.
    function kcl(x) {
      const net = asNet(x);
      if (!net) return [];
      const out = [], at = new Map();
      const add = (label, pin, amps) => {
        const key = label + '.' + pin;
        if (!at.has(key)) { at.set(key, { label, pin, amps: 0 }); out.push(at.get(key)); }
        at.get(key).amps += amps;
      };
      graph.forEach(g => {
        const pr = g.part && parts[g.comp.label];
        if (!pr) return;
        g.part.els.forEach((e, k) => {
          const I = pr.r.current[e.el.id !== undefined ? e.el.id : k];
          if (typeof I !== 'number') return;
          const [p, q] = e.el.pins || [];
          if (e.nodes[0] === net.id) add(g.comp.label, p, -I);
          if (e.nodes[1] === net.id) add(g.comp.label, q, I);
        });
      });
      return out;
    }

    return { netOf, voltage, part, kcl };
  }

  return { from, nets };
});
