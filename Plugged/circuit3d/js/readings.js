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
//      problems()      [{ kind, labels[], why }], the mistake checker (#95):
//                      'short' | 'no-resistor' | 'backwards' | 'open' | 'over'
//      thevenin(a, b)  two holes → { Vth V, Rth Ω, In mA } between them, or
//                      { why } (#93); solves a copy of the board when called
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

  const TEST_AMPS = 0.001;   // A, the test current thevenin() pushes b → a

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

    // The mistake checker (#95), from the solve's own flags and each part's
    // own warnings, so it never re-derives the physics. Wording follows
    // server.js findCircuitProblems where the two overlap.
    function problems() {
      try { return findProblems(); } catch { return []; }
    }

    function findProblems() {
      const out = [];
      const add = (kind, labels, why) => { if (labels.length) out.push({ kind, labels, why }); };
      const labelled = graph.filter(g => g.part && typeof g.comp.label === 'string');
      const sources  = labelled.filter(g => g.part.def.ref !== undefined).map(g => g.comp.label);
      const warned   = (label, re) => ((parts[label] && parts[label].warnings) || []).some(w => re.test(w));
      const warnings = label => parts[label].warnings.join(' ');

      // An LED straight across the battery: led.js's own short warning.
      const noResistor = labelled.filter(g => warned(g.comp.label, /no current-limiting resistor/i));
      noResistor.forEach(g => add('no-resistor', [g.comp.label], `${g.comp.label}: ${warnings(g.comp.label)}`));

      // A short through an LED with its no-resistor row is one mistake.
      if (res.shorted === true && !noResistor.length) {
        add('short', sources, 'Short circuit: the battery + and − terminals are joined with nothing to limit the current. ' +
                              'Put a resistor or other part between them.');
      }

      const backwards = labelled.filter(g => warned(g.comp.label, /backwards/i));
      backwards.forEach(g => add('backwards', [g.comp.label], `${g.comp.label}: ${warnings(g.comp.label)}`));

      // No current anywhere, and a source with no loop from its + back to its −
      // through the other elements, every switch counted as closed (an open
      // switch is normal use), and no backwards part to say why.
      const still = label => { const p = part(label); return !!p && typeof p.I === 'number' && Math.abs(p.I) < 0.001; };
      const looped = src => {
        const own = src.part.els.filter(e => e.el.kind === 'V' || e.el.kind === 'I');
        const uf = new Sim.UnionFind();
        graph.forEach(g => g.part && g.part.els.forEach(e => {
          if (!own.includes(e)) e.nodes.forEach(n => uf.union(e.nodes[0], n));
        }));
        return own.some(e => uf.find(e.nodes[0]) === uf.find(e.nodes[1]));
      };
      const unlooped = labelled.some(g => g.part.def.ref !== undefined && !looped(g));
      if (sources.length && res.shorted !== true && unlooped && !backwards.length && sources.every(still)) {
        add('open', sources, 'No current flows: the circuit is not connected all the way from the battery + terminal ' +
                             'back to the − terminal. Check for a missing wire, often the one to ground.');
      }

      labelled.forEach(g => {
        const label = g.comp.label, p = part(label);
        if (!p || !p.over) return;
        const why = p.rating.W !== undefined
          ? `${label} uses ${Math.abs(p.P).toFixed(2)} W, over its ${p.rating.W} W rating. Use a bigger resistor in series.`
          : `${label} carries ${Math.abs(p.I).toFixed(1)} mA, over its ${p.rating.mA.toFixed(0)} mA rating. Add more resistance in series.`;
        add('over', [label], why);
      });
      return out;
    }

    // The equivalent circuit between holes a and b (#93). Vth = V(a) − V(b)
    // from this solve. Rth: solve a copy of the board with a 1 mA ideal
    // current source pushing current into a and out of b, then
    // Rth = ((V'(a) − V'(b)) − Vth) / 1 mA, differences only. The source is
    // appended last, so the board's own source stays the reference. On a
    // board with LEDs or diodes this is the small-signal Rth at today's
    // operating point. Never touches the board or this solve's readings.
    function thevenin(a, b) {
      try { return findThevenin(a, b); } catch { return { why: 'The equivalent circuit could not be worked out here.' }; }
    }

    function findThevenin(a, b) {
      if (res.status === 'no-source') return { why: 'There is no source on the board, so there is no equivalent circuit.' };
      if (res.status !== 'ok' || res.shorted) return { why: 'The circuit has no working solution to measure from.' };
      const na = netOf(a), nb = netOf(b);
      if (!na || !nb) return { why: 'Pick two holes on the board.' };
      if (na.id === nb.id) return { why: `${a} and ${b} are joined, so the voltage between them is always 0.` };
      const va = voltage(a), vb = voltage(b);
      if (va === null || vb === null) return { why: `${va === null ? a : b} is not connected to a source.` };
      const Vth = va - vb;

      const src = { type: 'current_source', label: null, pins: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }],
                    holeRefs: [parseHole(b), parseHole(a)], values: { current: TEST_AMPS } };   // from b, to a
      const copy = Sim.analyze(board.components.concat([src]), board.wires || []);
      const ta = copy.status === 'ok' && !copy.shorted ? copy.voltageAt(parseHole(a)) : null;
      const tb = copy.status === 'ok' && !copy.shorted ? copy.voltageAt(parseHole(b)) : null;
      if (typeof ta !== 'number' || typeof tb !== 'number') return { why: 'The test solve failed between these holes.' };
      const Rth = ((ta - tb) - Vth) / TEST_AMPS;
      if (!Number.isFinite(Rth) || Rth <= 0) return { why: 'There is no resistance between these holes to measure.' };
      return { Vth, Rth, In: Vth / Rth * 1000 };
    }

    return { netOf, voltage, part, kcl, problems, thevenin };
  }

  return { from, nets };
});
