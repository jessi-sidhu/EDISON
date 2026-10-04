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
//  Wires (drawn by the user) and pressed buttons additionally merge nodes.
//
//  SOLVING
//  ───────
//  Modified nodal analysis: the whole circuit is solved at once for every
//  node voltage and every battery current, so parallel branches share
//  current correctly and batteries in series add up.
//
//  POLARITY
//  ────────
//  LEDs are diodes — current may only flow from anode (+) to cathode (−).
//  Each LED is off (open) or on (Vf plus a small resistance); the solver
//  finds the on/off pattern that is consistent with the voltages.
//  Battery: pin 0 = positive (+) output, pin 1 = negative (−) return.
//
//  EXPORTS
//  ───────
//  Browser: window.App.runSimulation() / App.stopSimulation(), unchanged.
//  Node:    module.exports = the pure solver (PROPS, UnionFind, bbNodeId,
//           buildGraph, solveLinear, analyze, simulationSummary) so a test
//           runner can call it.
//  Everything above the "Presentation" divider is pure: no document,
//  no THREE, no AudioContext.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Sim = factory();
  if (typeof module === 'object' && module.exports) module.exports = Sim;
  if (root) Sim.install(root.App = root.App || {});
})(typeof window !== 'undefined' ? window : null, function () {

  // Browser App namespace, set by install(). Stays null under node.
  let App = null;

  // ── Electrical properties ───────────────────────────────────
  const PROPS = {
    battery:  { voltage: 9.0 },
    resistor: { resistance: 470 },    // about 15 mA on 9 V through an LED
    led:      { forwardVoltage: 2.0, thresholdCurrent: 0.001, maxCurrent: 0.020 },
    buzzer:   { resistance: 42,      thresholdCurrent: 0.001 },
  };

  // A placed component carries its own values. PROPS is the default for parts
  // built before instance values existed, and is what keeps this module
  // loadable without a browser.
  function propsOf(comp) {
    return comp.values || PROPS[comp.type] || {};
  }

  const STOCK_R = [100, 150, 220, 330, 470, 680, 1000, 1500, 2200, 3300, 4700, 10000];

  function stockResistor(minOhms) {
    return STOCK_R.find(r => r >= minOhms) || Math.ceil(minOhms / 1000) * 1000;
  }

  function overCurrentLine(comp, I, advice) {
    const max = propsOf(comp).maxCurrent;
    if (!max || I <= max) return null;
    return {
      text: "  " + comp.type.toUpperCase() + " is over its " + (max * 1000).toFixed(0) +
            " mA rating at " + (I * 1000).toFixed(1) + " mA. Needs at least " + advice.minR +
            " ohm in series, so use " + advice.stock + " ohm.",
      cls: "sim-err",
    };
  }

  // app.js places LEDs pin 0 = cathode, pin 1 = anode.
  const LED_ANODE_PIN = 1;

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
    //    holes and startComp/startPinIdx for off-board pins (e.g. battery).
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

    // 3. Buttons that are pressed act as closed switches — merge their two pins
    components.forEach((comp, ci) => {
      if (comp.type === 'button' && comp.pressed) {
        uf.union(pinNode[ci][0], pinNode[ci][1]);
      }
    });

    // 4. Resolve each pin to its root
    const graph = components.map((comp, ci) => ({
      comp,
      // nodes[pi] = root node of pin pi
      nodes: comp.pins.map((_, pi) => uf.find(pinNode[ci][pi])),
    }));
    // nodeOf({ col, row }) = root node of any breadboard hole, pin or not.
    graph.nodeOf = hole => uf.find(bbNodeId(hole.col, hole.row));
    return graph;
  }

  // ── Nodal analysis ──────────────────────────────────────────
  //
  //  Modified nodal analysis: one unknown per node voltage plus one per
  //  battery current. An LED is piecewise linear: open when off, Vf in
  //  series with R_ON when on. The on/off pattern is found by flipping the
  //  single most inconsistent LED until none is, so the same circuit always
  //  gives the same answer.
  const R_ON       = 0.1;    // ohm, LED on-state series resistance
  const GMIN       = 1e-12;   // S from every node to the reference, keeps floating parts solvable
  const SHORT_AMPS = 1.0;    // battery current treated as a short circuit
  const OPEN_AMPS  = 1e-6;   // below this nothing is flowing
  const PIVOT_EPS  = 1e-15;

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

  // One linear solve for a fixed set of LEDs that are on.
  // Returns { v(node), batteryCurrent: Map(comp -> amps) } or null.
  function solveMNA(graph, bats, ledOn) {
    const ref   = bats[0].nodes[1];
    const index = new Map();
    graph.forEach(g => g.nodes.forEach(n => {
      if (n !== ref && !index.has(n)) index.set(n, index.size);
    }));
    const N = index.size, size = N + bats.length;
    const A = Array.from({ length: size }, () => new Array(size).fill(0));
    const b = new Array(size).fill(0);
    const at = n => (n === ref ? -1 : index.get(n));

    function conductance(n1, n2, g) {
      const i = at(n1), j = at(n2);
      if (i >= 0) A[i][i] += g;
      if (j >= 0) A[j][j] += g;
      if (i >= 0 && j >= 0) { A[i][j] -= g; A[j][i] -= g; }
    }
    function inject(n, amps) { const i = at(n); if (i >= 0) b[i] += amps; }

    for (let i = 0; i < N; i++) A[i][i] += GMIN;

    graph.forEach(g => {
      const { comp, nodes } = g;
      const p = propsOf(comp);
      if (comp.type === 'resistor' || comp.type === 'buzzer') {
        if (p.resistance > 0) conductance(nodes[0], nodes[1], 1 / p.resistance);
      } else if (comp.type === 'led' && ledOn.get(comp)) {
        const anode = nodes[LED_ANODE_PIN], cathode = nodes[1 - LED_ANODE_PIN];
        const vf = p.forwardVoltage || 0;
        conductance(anode, cathode, 1 / R_ON);
        inject(anode, vf / R_ON);
        inject(cathode, -vf / R_ON);
      }
    });

    bats.forEach((bat, k) => {
      const row = N + k, pos = at(bat.nodes[0]), neg = at(bat.nodes[1]);
      if (pos >= 0) { A[pos][row] += 1; A[row][pos] += 1; }
      if (neg >= 0) { A[neg][row] -= 1; A[row][neg] -= 1; }
      b[row] = propsOf(bat.comp).voltage || 0;
    });

    const x = solveLinear(A, b);
    if (!x) return null;
    const batteryCurrent = new Map(bats.map((bat, k) => [bat.comp, x[N + k]]));
    return { v: n => (n === ref ? 0 : x[index.get(n)]), batteryCurrent };
  }

  function forwardCurrent(led, sol, on) {
    if (!on) return 0;
    const vf = propsOf(led.comp).forwardVoltage || 0;
    return (sol.v(led.nodes[LED_ANODE_PIN]) - sol.v(led.nodes[1 - LED_ANODE_PIN]) - vf) / R_ON;
  }

  // Find the consistent on/off pattern. Returns { sol, ledOn, settled } or null.
  function solveCircuit(graph, bats) {
    const leds   = graph.filter(g => g.comp.type === 'led');
    const ledOn  = new Map(leds.map(l => [l.comp, false]));
    const rounds = 4 * leds.length + 10;
    for (let round = 0; round < rounds; round++) {
      const sol = solveMNA(graph, bats, ledOn);
      if (!sol) return null;
      let worst = null, worstBy = 1e-9;
      leds.forEach(l => {
        const vf = propsOf(l.comp).forwardVoltage || 0;
        const vd = sol.v(l.nodes[LED_ANODE_PIN]) - sol.v(l.nodes[1 - LED_ANODE_PIN]);
        const by = ledOn.get(l.comp) ? vf - vd : vd - vf;   // volts past the switching point
        if (by > worstBy) { worst = l; worstBy = by; }
      });
      if (!worst) return { sol, ledOn, settled: true };
      ledOn.set(worst.comp, !ledOn.get(worst.comp));
    }
    const sol = solveMNA(graph, bats, ledOn);
    return sol ? { sol, ledOn, settled: false } : null;
  }

  // Open-circuit voltage across an LED with every LED switched off: what it
  // would see on its own. Leaving the others on would let a parallel LED
  // pin the shared node near Vf, and the advice would shrink toward 0 ohm.
  function openVoltage(graph, bats, ledOn, led) {
    const off = new Map([...ledOn.keys()].map(c => [c, false]));
    const sol = solveMNA(graph, bats, off);
    return sol ? sol.v(led.nodes[LED_ANODE_PIN]) - sol.v(led.nodes[1 - LED_ANODE_PIN]) : 0;
  }

  // The series resistance that would hold an LED at its rated current.
  function resistorAdvice(led, voc) {
    const p = propsOf(led.comp);
    const minR = Math.ceil((voc - (p.forwardVoltage || 0)) / p.maxCurrent);
    return { minR, stock: stockResistor(minR) };
  }

  // Nodes reachable from the first battery through parts. Wires and pressed
  // buttons are already merged into one root; a released button is open.
  // Anything else only reads a GMIN leak, so it is floating, not 0 V.
  function liveNodes(graph, bats) {
    const live = new Set(bats[0].nodes);
    for (let grew = true; grew;) {
      grew = false;
      graph.forEach(({ comp, nodes }) => {
        if (comp.type === 'button' && !comp.pressed) return;
        if (!nodes.some(n => live.has(n))) return;
        nodes.forEach(n => { if (!live.has(n)) { live.add(n); grew = true; } });
      });
    }
    return live;
  }

  // ── Pure: analyze ────────────────────────────────────────────
  //
  //  components + wires in, numbers and report lines out. Returns:
  //    status        'empty' | 'no-battery' | 'ok' | 'unsolvable'
  //    lines         [{ text, cls }] for the results panel
  //    ledsOn        components the caller should light
  //    buzzersOn     components the caller should sound
  //    nodeVoltages  { [node id]: volts }, relative to the first battery's −
  //    currents      amps per component index, + from pin 0 to pin 1 inside
  //                  the part (so a lit LED is negative); null for a pressed
  //                  button, whose pins are one node
  //    shorted       true when a battery is shorted
  //    voltageAt     ({ col, row }) -> volts at any breadboard hole, same
  //                  reference as nodeVoltages; null when the hole's node is
  //                  not connected to the first battery through wires or
  //                  parts, or nothing was solved
  //
  function analyze(components, wires) {
    const blank = { lines: [], ledsOn: [], buzzersOn: [], nodeVoltages: {}, currents: [], shorted: false,
                    voltageAt: () => null };

    if (!components.length) {
      return Object.assign({}, blank, {
        status: 'empty',
        lines: [{ text: 'No components placed.', cls: 'sim-warn' }],
      });
    }

    const graph = buildGraph(components, wires);
    const bats  = graph.filter(g => g.comp.type === 'battery');
    const lines = [];

    components.filter(c => c.type === 'button').forEach((btn, i) => {
      const state = btn.pressed ? '🟢 CLOSED (current flowing)' : '⭕ OPEN — click to press';
      lines.push({ text: `Button ${i + 1}: ${state}`, cls: btn.pressed ? 'sim-on' : 'sim-info' });
    });

    if (!bats.length) {
      return Object.assign({}, blank, {
        status: 'no-battery',
        lines: [{ text: 'No battery in circuit.', cls: 'sim-warn' }],
      });
    }

    bats.forEach((bat, bi) => lines.push({ text: `Battery ${bi + 1}: ${propsOf(bat.comp).voltage}V`, cls: 'sim-info' }));

    // A wire straight across a battery merges its terminals into one node.
    if (bats.some(bat => bat.nodes[0] === bat.nodes[1])) {
      lines.push({ text: '  ⚠ Short circuit — no resistance in path!', cls: 'sim-err' });
      return Object.assign({}, blank, { status: 'ok', lines, shorted: true });
    }

    const solved = solveCircuit(graph, bats);
    if (!solved) {
      lines.push({ text: '  ⚠ This circuit cannot be solved. Two batteries may be wired straight into each other.', cls: 'sim-err' });
      return Object.assign({}, blank, { status: 'unsolvable', lines });
    }
    const { sol, ledOn, settled } = solved;
    if (!settled) lines.push({ text: '  Some LEDs could not settle on or off, so this result is approximate.', cls: 'sim-warn' });

    const nodeVoltages = {};
    graph.forEach(g => g.nodes.forEach(n => { nodeVoltages[n] = sol.v(n); }));
    const live = liveNodes(graph, bats);
    const voltageAt = hole => {
      const n = graph.nodeOf(hole);
      return live.has(n) ? nodeVoltages[n] : null;
    };

    const currents = graph.map(g => {
      const { comp, nodes } = g;
      if (comp.type === 'battery') return sol.batteryCurrent.get(comp);
      if (comp.type === 'button')  return comp.pressed ? null : 0;
      if (comp.type === 'led')     return -forwardCurrent(g, sol, ledOn.get(comp));
      const R = propsOf(comp).resistance;
      return R > 0 ? (sol.v(nodes[0]) - sol.v(nodes[1])) / R : 0;
    });

    const shortBat = bats.find(bat => Math.abs(sol.batteryCurrent.get(bat.comp)) > SHORT_AMPS);
    if (shortBat) {
      const led = graph.find((g, i) => g.comp.type === 'led' && -currents[i] > SHORT_AMPS);
      if (led) {
        const advice = resistorAdvice(led, openVoltage(graph, bats, ledOn, led));
        lines.push({ text: '  Short circuit. The LED sits straight across the battery with no current-limiting resistor.', cls: 'sim-err' });
        lines.push({ text: `  Put a resistor in series: at least ${advice.minR} ohm, so use a ${advice.stock} ohm.`, cls: 'sim-info' });
      } else {
        lines.push({ text: '  ⚠ Short circuit — no resistance in path!', cls: 'sim-err' });
      }
      return Object.assign({}, blank, { status: 'ok', lines, nodeVoltages, currents, shorted: true, voltageAt });
    }

    const ledsOn = [], buzzersOn = [];
    let backwards = 0;
    graph.forEach((g, i) => {
      const { comp } = g;
      const p = propsOf(comp);
      if (comp.type === 'led') {
        const I = -currents[i];
        if (ledOn.get(comp) && I >= p.thresholdCurrent) {
          ledsOn.push(comp);
          lines.push({ text: `  💡 LED ON  (${(I * 1000).toFixed(1)} mA)`, cls: 'sim-on' });
          const over = overCurrentLine(comp, I, resistorAdvice(g, openVoltage(graph, bats, ledOn, g)));
          if (over) lines.push(over);
        } else if (!ledOn.get(comp)) {
          const reverse = sol.v(g.nodes[1 - LED_ANODE_PIN]) - sol.v(g.nodes[LED_ANODE_PIN]);
          if (reverse >= (p.forwardVoltage || 0)) {
            backwards++;
            lines.push({ text: '  LED is backwards. Current cannot flow from cathode to anode. Flip it around.', cls: 'sim-warn' });
          }
        } else if (I >= OPEN_AMPS) {
          // Below OPEN_AMPS the "current" is only GMIN leaking through a
          // floating node: the path is open, which the open-circuit line says.
          lines.push({ text: '  LED: current too low.', cls: 'sim-warn' });
        }
      }
      if (comp.type === 'buzzer' && Math.abs(currents[i]) >= p.thresholdCurrent) {
        buzzersOn.push(comp);
        lines.push({ text: `  🔔 BUZZER ON  (${(Math.abs(currents[i]) * 1000).toFixed(1)} mA)`, cls: 'sim-on' });
      }
    });

    const flowing = bats.some(bat => Math.abs(sol.batteryCurrent.get(bat.comp)) > OPEN_AMPS);
    if (!flowing && !ledsOn.length && !buzzersOn.length && !backwards) {
      lines.push({ text: '  Circuit open — no complete path.', cls: 'sim-warn' });
      bats.forEach(bat => {
        const linked = graph.some(g => g.comp !== bat.comp &&
          g.nodes.some(n => n === bat.nodes[0] || n === bat.nodes[1]));
        if (!linked) lines.push({ text: '  ⚠ Battery terminals not connected to anything.', cls: 'sim-warn' });
      });
    } else if (flowing && !ledsOn.length && !buzzersOn.length && !backwards) {
      lines.push({ text: '  No output components in circuit path.', cls: 'sim-info' });
    }

    return { status: 'ok', lines, ledsOn, buzzersOn, nodeVoltages, currents, shorted: false, voltageAt };
  }

  // ── Pure: simulationSummary ──────────────────────────────────
  //
  //  analyze() as markdown lines for the AI's "## Simulation" section: the
  //  status, each part's state and current, each pin's voltage, then the
  //  analysis messages. Volts to 2 decimals, currents to 0.1 mA, so the
  //  prompt stays short. labelOf(components, comp) names a part ("R1").

  // Hole address as App.formatHole writes it: "a11", "tp_2", from ids.js.
  // The page loads ids.js after this file, so App is read at call time.
  const Ids = typeof module === 'object' && module.exports ? require('./ids.js') : null;
  const holeName = ref => (Ids || App).holeName(ref);

  const volts = v => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2) + ' V';
  const milliamps = a => (Math.abs(a) < 0.00005 ? 0 : a * 1000).toFixed(1) + ' mA';
  // analyze's messages, minus the per-part ones the summary already states.
  const partMessage = l => l.cls === 'sim-on' || /^(Button|Battery) \d/.test(l.text);
  const plain = t => t.replace(/[⚠💡🔔🟢⭕]/gu, '').replace(/\s+/g, ' ').trim();

  function simulationSummary(components, wires, labelOf) {
    const r = analyze(components, wires);
    if (r.status === 'empty')      return ['The board is empty: no components placed.'];
    if (r.status === 'no-battery') return ['No battery on the board.'];

    const messages = r.lines.filter(l => !partMessage(l)).map(l => '- ' + plain(l.text));
    if (r.status === 'unsolvable') {
      return ['Status: unsolvable. The simulator cannot solve this circuit.'].concat(messages);
    }

    const bat0  = components.find(c => c.type === 'battery');
    const out   = [`Status: ${r.shorted ? 'short circuit' : 'solved'}. Voltages are measured from ${labelOf(components, bat0)}.1 (the first battery's − terminal).`];
    const solved = r.currents.length === components.length;   // a battery shorted by a wire solves nothing
    if (solved) {
      // Off-board pins have no hole for voltageAt, so read every pin by node.
      const graph = buildGraph(components, wires);
      const live  = liveNodes(graph, graph.filter(g => g.comp.type === 'battery'));
      const pinVoltage = (i, k) => {
        const n = graph[i].nodes[k];
        return live.has(n) ? r.nodeVoltages[n] : null;
      };
      components.forEach((c, i) => {
        const label = labelOf(components, c);
        const p = propsOf(c), I = r.currents[i];
        // A short solves to tens of amps, not a reading worth showing.
        const mA = a => (r.shorted ? '' : ', ' + milliamps(a));
        if (c.type === 'battery') {
          out.push(`- ${label}: ${volts(p.voltage || 0)} battery` + (r.shorted ? '' : `, supplying ${milliamps(Math.abs(I || 0))}`));
        } else if (c.type === 'resistor') {
          out.push(`- ${label}: ${p.resistance} ohm resistor${mA(Math.abs(I))}`);
        } else if (c.type === 'led') {
          const state = r.ledsOn.includes(c) ? 'ON (lit)' : 'OFF (dark)';
          out.push(`- ${label}: LED ${state}${mA(Math.max(0, -I))}`);
        } else if (c.type === 'buzzer') {
          const state = r.buzzersOn.includes(c) ? 'ON (sounding)' : 'OFF (silent)';
          out.push(`- ${label}: buzzer ${state}${mA(Math.abs(I))}`);
        } else if (c.type === 'button') {
          out.push(`- ${label}: button ${c.pressed ? 'pressed (closed)' : 'released (open)' + mA(0)}`);
        } else {
          out.push(`- ${label}: ${c.type}` + (typeof I === 'number' ? mA(Math.abs(I)) : ''));
        }
        c.pins.forEach((_, k) => {
          const v = pinVoltage(i, k);
          const reading = v == null ? 'floating (not connected to the battery)' : volts(v);
          const hole = c.holeRefs?.[k];
          if (!hole) { out.push(`  - ${label}.${k} (off-board): ${reading}`); return; }
          const role = c.type === 'led' ? (k === LED_ANODE_PIN ? ', anode' : ', cathode') : '';
          out.push(`  - ${label} pin ${k} (${holeName(hole)}${role}): ${reading}`);
        });
      });
    }
    return out.concat(messages);
  }

  // ── Presentation ─────────────────────────────────────────────
  //  DOM, THREE and audio live below this line.

  // ── Buzzer audio ─────────────────────────────────────────────
  let _audioCtx = null;
  const _buzzerNodes = new Map(); // comp → { osc, gain }

  function _getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
  }

  function activateBuzzer(comp) {
    if (_buzzerNodes.has(comp)) return;
    try {
      const ctx  = _getAudioCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 220;   // low, buzzy tone
      gain.gain.value = 0.12;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      _buzzerNodes.set(comp, { osc, gain });
    } catch {}
  }

  function deactivateBuzzer(comp) {
    const node = _buzzerNodes.get(comp);
    if (!node) return;
    try {
      const ctx = _getAudioCtx();
      node.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      setTimeout(() => { try { node.osc.stop(); } catch {} }, 80);
    } catch {}
    _buzzerNodes.delete(comp);
  }

  function stopAllBuzzers() {
    _buzzerNodes.forEach((node) => {
      try {
        const ctx = _getAudioCtx();
        node.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        setTimeout(() => { try { node.osc.stop(); } catch {} }, 80);
      } catch {}
    });
    _buzzerNodes.clear();
  }

  // ── Visual: LED on/off ──────────────────────────────────────
  const activeLights = [];

  function lightUpLED(comp) {
    comp.group.traverse(obj => {
      if (!obj.isMesh || !obj.material.transparent) return;
      obj.material = obj.material.clone();
      obj.material.emissiveIntensity = 3.5;
      obj.material.opacity = 1.0;
    });

    const ledColor = getDomeColor(comp) ?? 0xffffff;
    const p0 = comp.pins[0], p1 = comp.pins[1];
    const light = new THREE.PointLight(ledColor, 8.0, 10);
    light.position.set((p0.x + p1.x) / 2, 3.0, (p0.z + p1.z) / 2);
    App.scene.add(light);
    activeLights.push(light);
    comp._simLight = light;
  }

  function dimLED(comp) {
    comp.group.traverse(obj => {
      if (!obj.isMesh || !obj.material.transparent) return;
      obj.material.emissiveIntensity = 0.45;
      obj.material.opacity = 0.88;
    });
    if (comp._simLight) { App.scene.remove(comp._simLight); comp._simLight = null; }
  }

  function getDomeColor(comp) {
    let col = null;
    comp.group.traverse(obj => {
      if (obj.isMesh && obj.material.transparent && col === null)
        col = obj.material.color.getHex();
    });
    return col;
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

  // ── Button click handler (active only during simulation) ─────
  let _btnClickHandler = null;

  function installButtonClicks() {
    removeButtonClicks();
    const canvas    = document.getElementById('canvas');
    const raycaster = new THREE.Raycaster();
    const mouseNDC  = new THREE.Vector2();

    _btnClickHandler = function (e) {
      // Only fire on a clean click (not a drag)
      const r = canvas.getBoundingClientRect();
      mouseNDC.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
      mouseNDC.y = -((e.clientY - r.top)  / r.height) * 2 + 1;
      raycaster.setFromCamera(mouseNDC, App.camera);

      const capMeshes = [];
      App.state.components.forEach(c => {
        if (c.type === 'button' && c.capMesh) capMeshes.push(c.capMesh);
      });
      if (!capMeshes.length) return;

      const hits = raycaster.intersectObjects(capMeshes, false);
      if (!hits.length) return;

      const cap  = hits[0].object;
      const comp = cap.userData.ownerComp;
      if (comp) {
        App.toggleButton(comp);   // animate cap + flip comp.pressed
        App.runSimulation();      // re-evaluate circuit with new button state
      }
    };

    canvas.addEventListener('click', _btnClickHandler);
  }

  function removeButtonClicks() {
    if (_btnClickHandler) {
      const canvas = document.getElementById('canvas');
      canvas.removeEventListener('click', _btnClickHandler);
      _btnClickHandler = null;
    }
  }

  // ── Internal: clear visual state only (no button/UI reset) ──
  function clearSimVisuals() {
    activeLights.forEach(l => App.scene.remove(l));
    activeLights.length = 0;
    App.state.components.forEach(c => {
      if (c.type === 'led')    dimLED(c);
      if (c.type === 'buzzer') deactivateBuzzer(c);
    });
    stopAllBuzzers();
    hideResults();
  }

  // ── Public: runSimulation ────────────────────────────────────
  //  Solve with analyze(), then render the result.
  function runSimulation() {
    const { components, wires } = App.state;
    const isRerun = _btnClickHandler !== null; // already running = button click re-run
    clearSimVisuals(); // preserve button states across re-runs

    // Switch to select mode so user can click components during simulation
    if (!isRerun && App.setMode) App.setMode('select');

    const result = analyze(components, wires);
    showResults(result.lines);
    if (result.status === 'empty') return;

    result.ledsOn.forEach(lightUpLED);
    result.buzzersOn.forEach(activateBuzzer);

    if (result.status === 'ok') {
      App.simRunning = true;
      document.getElementById('sim-run-btn').style.display  = 'none';
      document.getElementById('sim-stop-btn').style.display = 'inline-flex';
    }
    // Only install the click handler on the first run — re-runs from
    // the button handler itself keep the same handler alive.
    if (!isRerun) installButtonClicks();
  }

  // ── Public: stopSimulation ──────────────────────────────────
  function stopSimulation() {
    clearSimVisuals();
    // Reset all buttons directly — no toggleButton call to avoid re-entrancy
    App.state.components.forEach(c => {
      if (c.type !== 'button') return;
      c.pressed = false;
      const cap = c.capMesh;
      if (!cap) return;
      if (cap.userData._animId) { cancelAnimationFrame(cap.userData._animId); cap.userData._animId = null; }
      cap.position.y = cap.userData.capRestY;
      if (cap.userData.matCloned) {
        cap.material.color.setHex(0xe8e8e8);
        cap.material.emissive.setHex(0x000000);
        cap.material.emissiveIntensity = 0;
      }
    });
    App.simRunning = false;
    removeButtonClicks();
    const runBtn  = document.getElementById('sim-run-btn');
    const stopBtn = document.getElementById('sim-stop-btn');
    if (runBtn)  runBtn.style.display  = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
  }

  // ── Wiring ───────────────────────────────────────────────────
  function install(app) {
    App = app;
    App.PROPS          = PROPS;
    App.runSimulation  = runSimulation;
    App.stopSimulation = stopSimulation;
    App.simulationSummary = simulationSummary;
  }

  return { PROPS, UnionFind, bbNodeId, buildGraph, solveLinear, analyze, simulationSummary, install };
});
