// ─────────────────────────────────────────────────────────────
//  tools/flow-dots.js — current-flow dots (issue #100)
//
//  While simulating, small dots move along every wire and through every
//  two-lead part in the direction of conventional current, faster with
//  more current. A branch with no current (below 1 µA) has none. All the
//  dots are one THREE.InstancedMesh ('flow-dots'); the layout is worked
//  out once per plugged:sim and each frame only moves the instances.
//  #flow-dots-toggle (beside Stop) turns them off and on;
//  plugged:sim-stop hides them.
//
//  Wire currents aren't in the solve: inside each net, the current each
//  part pin puts in (Readings kcl) is spread over the net's wires, taken
//  as equal conductances, so wires in parallel share it.
//
//  EXPORTS
//  ───────
//  Browser: window.FlowDots (DOM wiring runs only when document exists)
//  Node:    module.exports
//
//  dotSpeed(mA)  world units per second for a current in mA, sign
//      ignored; 0 below 0.001 mA, never decreasing, clamped at 100 mA
//  flows(readings, board) → { wires, parts }  board the { components,
//      wires } given to Sim.analyze. wires[i] mA through board.wires[i],
//      + start → end; parts[label] mA pin 0 → pin 1 for a two-lead part
//      in board holes. Exactly 0 when nothing flows or no readings.
//  Browser only: count() → dots visible now
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const FlowDots = factory();
  if (typeof module === 'object' && module.exports) module.exports = FlowDots;
  if (root) root.FlowDots = FlowDots;
})(typeof window !== 'undefined' ? window : null, function () {

  const inNode   = typeof module === 'object' && module.exports;
  const Sim      = () => (inNode ? require('../simulate.js') : window.Sim);
  const Readings = () => (inNode ? require('../readings.js') : window.Readings);
  const Parts    = () => (inNode ? require('../parts') : window.Parts);

  const STILL_MA = 0.001;   // simulate.js OPEN_AMPS (1 µA) in mA: below it nothing flows
  const CAP_MA   = 100;     // more current than this moves no faster

  function dotSpeed(mA) {
    const a = Math.abs(mA);
    if (!(a >= STILL_MA)) return 0;
    return 0.4 + 1.2 * Math.log10(1 + Math.min(a, CAP_MA));
  }

  const flowing = mA => (typeof mA === 'number' && Math.abs(mA) >= STILL_MA ? mA : 0);

  function flows(readings, board) {
    const comps = (board && board.components) || [];
    const ws    = (board && board.wires) || [];
    const out   = { wires: ws.map(() => 0), parts: {} };

    comps.forEach(c => {
      if (!c || c.label == null || !c.holeRefs || !c.pins || c.pins.length !== 2) return;
      const p = readings ? readings.part(c.label) : null;
      out.parts[c.label] = flowing(p && p.I);
    });
    if (!readings) return out;

    // Where a pin or wire end sits: its breadboard strip, or an off-board
    // pin's own node, as simulate.js buildGraph names them.
    const S = Sim();
    const pinAt = (comp, pi) => {
      const ci = comps.indexOf(comp);
      if (ci < 0 || !comp.pins || !(pi >= 0 && pi < comp.pins.length)) return null;
      const h = comp.holeRefs && comp.holeRefs[pi];
      return h ? S.bbNodeId(h.col, h.row) : `free_${ci}_${pi}`;
    };
    const endAt = (hole, comp, pi) => (hole ? S.bbNodeId(hole.col, hole.row) : comp ? pinAt(comp, pi) : null);
    const ends  = ws.map(w => [endAt(w.startHole, w.startComp, w.startPinIdx), endAt(w.endHole, w.endComp, w.endPinIdx)]);

    // mA put into each point by the part pins there.
    const inj = new Map();
    const byLabel = new Map();
    comps.forEach(c => { if (c && c.label != null && !byLabel.has(c.label)) byLabel.set(c.label, c); });
    Readings().nets(board).forEach(net => {
      if (!net.pins.length) return;
      readings.kcl(net.id).forEach(({ label, pin, amps }) => {
        const comp = byLabel.get(label);
        const def  = comp && Parts().get(comp.type);
        const at   = def ? pinAt(comp, def.pins.indexOf(pin)) : null;
        if (at && typeof amps === 'number') inj.set(at, (inj.get(at) || 0) + amps);
      });
    });

    // Wires join points into groups (one per net); solve each group's
    // potentials with every wire a unit conductance, its first point at 0.
    const uf = new S.UnionFind();
    ends.forEach(([a, b]) => {
      if (!a || !b) return;
      uf.make(a); uf.make(b);
      uf.union(a, b);
    });
    const groups = new Map();
    ends.forEach(([a, b], i) => {
      if (!a || !b || a === b) return;
      const g = uf.find(a);
      if (!groups.has(g)) groups.set(g, { points: [], index: new Map(), wires: [] });
      const grp = groups.get(g);
      [a, b].forEach(p => { if (!grp.index.has(p)) { grp.index.set(p, grp.points.length); grp.points.push(p); } });
      grp.wires.push(i);
    });

    groups.forEach(({ points, index, wires }) => {
      const n = points.length - 1;   // point 0 is held at 0 V
      if (n < 1) return;
      const A = Array.from({ length: n }, () => new Array(n).fill(0));
      const b = points.slice(1).map(p => inj.get(p) || 0);
      wires.forEach(i => {
        const [s, e] = ends[i].map(p => index.get(p) - 1);
        if (s >= 0) A[s][s] += 1;
        if (e >= 0) A[e][e] += 1;
        if (s >= 0 && e >= 0) { A[s][e] -= 1; A[e][s] -= 1; }
      });
      const x = S.solveLinear(A, b);
      if (!x) return;
      const v = k => (k > 0 ? x[k - 1] : 0);
      wires.forEach(i => {
        const [s, e] = ends[i].map(p => index.get(p));
        out.wires[i] = flowing(v(s) - v(e));
      });
    });
    return out;
  }

  const api = { dotSpeed, flows };
  if (typeof document !== 'undefined') wire();

  function wire() {
    const SPACING = 0.3;     // world units between dots on a path
    const SAMPLES = 32;      // points a wire's arc is sampled at
    const LIFT    = 0.12;    // a part's dots sit this high over its holes
    const RADIUS  = 0.06;    // a dot, just proud of the wire tube (0.043)
    const MAX_DT  = 0.1;     // s; a long pause (hidden tab) doesn't jump the dots

    let on      = true;      // the toggle, this session only
    let last    = null;      // readings of the last solve while simulating
    let mesh    = null;
    let paths   = [];        // { key, pts, cum, len, n, first, v, phase }
    let total   = 0;
    let phases  = new Map(); // key → phase, kept while the circuit is unchanged
    let raf     = 0;
    let before  = 0;

    function ensureMesh(need) {
      if (mesh && mesh.instanceMatrix.count >= need) {
        if (mesh.parent !== App.scene) App.scene.add(mesh);
        return;
      }
      const cap = Math.max(256, need);
      const geo = mesh ? mesh.geometry : new THREE.SphereGeometry(RADIUS, 8, 6);
      const mat = mesh ? mesh.material : new THREE.MeshBasicMaterial({ color: 0xfff27a });
      if (mesh) { if (mesh.parent) mesh.parent.remove(mesh); mesh.dispose(); }
      mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.name = 'flow-dots';
      mesh.frustumCulled = false;   // the instances aren't where the geometry's bounds say
      mesh.raycast = () => {};       // never in the way of a click
      const one = new THREE.Matrix4();
      for (let i = 0; i < cap; i++) mesh.setMatrixAt(i, one);
      mesh.count = 0;
      mesh.visible = false;
      App.scene.add(mesh);
    }

    // The arc a wire is drawn along (its tube's path).
    function arcOf(w) {
      let path = null;
      if (w && w.group) w.group.traverse(o => {
        if (!path && o.geometry && o.geometry.parameters && o.geometry.parameters.path) path = o.geometry.parameters.path;
      });
      return path;
    }

    function addPath(key, points, mA, list) {
      const k = points.length / 3 - 1;
      const cum = new Float32Array(k + 1);
      for (let j = 1; j <= k; j++) {
        const dx = points[3 * j] - points[3 * j - 3], dy = points[3 * j + 1] - points[3 * j - 2], dz = points[3 * j + 2] - points[3 * j - 1];
        cum[j] = cum[j - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      const len = cum[k];
      if (!(len > 1e-6)) return;
      const n = Math.max(2, Math.round(len / SPACING));
      list.push({ key, pts: points, cum, len, n, first: 0, v: Math.sign(mA) * dotSpeed(mA), phase: phases.get(key) || 0 });
    }

    function layout(readings) {
      const board = { components: App.state.components, wires: App.state.wires };
      const f = flows(readings, board);
      const list = [];
      board.wires.forEach((w, i) => {
        if (!f.wires[i]) return;
        const path = arcOf(w);
        if (!path) return;
        const pts = new Float32Array(3 * (SAMPLES + 1));
        const p = new THREE.Vector3();
        for (let j = 0; j <= SAMPLES; j++) {
          path.getPointAt(j / SAMPLES, p);
          pts[3 * j] = p.x; pts[3 * j + 1] = p.y; pts[3 * j + 2] = p.z;
        }
        addPath(path, pts, f.wires[i], list);
      });
      board.components.forEach(c => {
        const mA = c && c.label != null ? f.parts[c.label] : 0;
        if (!mA || !c.pins || c.pins.length !== 2 || !c.group) return;
        const [a, b] = c.pins;
        addPath(c.group, new Float32Array([a.x, a.y + LIFT, a.z, b.x, b.y + LIFT, b.z]), mA, list);
      });
      let first = 0;
      list.forEach(p => { p.first = first; first += p.n; });
      paths  = list;
      total  = first;
      phases = new Map(list.map(p => [p.key, p.phase]));
    }

    // Moves every dot to its place; no allocations.
    function place() {
      const arr = mesh.instanceMatrix.array;
      for (let q = 0; q < paths.length; q++) {
        const p = paths[q], pts = p.pts, cum = p.cum, end = cum.length - 1;
        let j = 1;
        for (let k = 0; k < p.n; k++) {
          // Dots are placed in increasing distance from the phase on, so the
          // segment search carries on from the last one (restarting on wrap).
          let u = k / p.n + p.phase;
          if (u >= 1) u -= 1;
          const d = u * p.len;
          if (d < cum[j - 1]) j = 1;
          while (j < end && cum[j] < d) j++;
          const seg = cum[j] - cum[j - 1];
          const t = seg > 0 ? (d - cum[j - 1]) / seg : 0;
          const o = 16 * (p.first + k), a = 3 * (j - 1), b = 3 * j;
          arr[o + 12] = pts[a]     + (pts[b]     - pts[a])     * t;
          arr[o + 13] = pts[a + 1] + (pts[b + 1] - pts[a + 1]) * t;
          arr[o + 14] = pts[a + 2] + (pts[b + 2] - pts[a + 2]) * t;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(MAX_DT, Math.max(0, (now - before) / 1000));
      before = now;
      for (let q = 0; q < paths.length; q++) {
        const p = paths[q];
        p.phase = (p.phase + p.v * dt / p.len) % 1;
        if (p.phase < 0) p.phase += 1;
      }
      place();
    }

    function hide() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      paths.forEach(p => phases.set(p.key, p.phase));
      paths = [];
      total = 0;
      if (mesh) { mesh.count = 0; mesh.visible = false; }
    }

    function show() {
      hide();
      if (!on || !last) return;
      layout(last);
      if (!total) return;
      ensureMesh(total);
      mesh.count = total;
      mesh.visible = true;
      place();
      before = performance.now();
      raf = requestAnimationFrame(tick);
    }

    // The toggle sits beside the other simulation buttons and shows only while simulating.
    const toggle = document.createElement('button');
    toggle.id = 'flow-dots-toggle';
    toggle.className = 'btn-colouring';
    toggle.title = 'Show current flowing as moving dots (turn off for frame rate)';
    toggle.hidden = true;
    const label = () => {
      toggle.textContent = on ? 'Dots on' : 'Dots off';
      toggle.setAttribute('aria-pressed', String(on));
    };
    label();
    const after = document.getElementById('csv-export-btn') || document.getElementById('colouring-toggle') ||
                  document.getElementById('sim-stop-btn');
    if (after) after.after(toggle);

    toggle.addEventListener('click', () => {
      on = !on;
      label();
      show();
    });

    document.addEventListener('plugged:sim', e => {
      const d = e.detail || {};
      // A first run that fails never starts the simulation, so no Stop follows.
      const running = App.simRunning || (d.result && d.result.status === 'ok');
      last = running && d.readings ? d.readings : null;
      toggle.hidden = !running;
      show();
    });

    document.addEventListener('plugged:sim-stop', () => {
      last = null;
      toggle.hidden = true;
      hide();
    });

    api.count = () => (mesh && mesh.visible ? mesh.count : 0);
  }

  return api;
});
