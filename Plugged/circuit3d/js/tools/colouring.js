// ─────────────────────────────────────────────────────────────
//  tools/colouring.js — voltage colouring (issue #91)
//
//  While simulating, every hole of a connected net is tinted blue → red
//  by readings.voltage(net), from the board's lowest live voltage to its
//  highest. Floating nets stay plain. It recolours once per plugged:sim,
//  never per frame, and plugged:sim-stop restores the plain board.
//  #colouring-toggle (beside Stop) turns the tint off for this session.
//
//  Hole colours (shared with the connection highlight, #94): the holes
//  mesh gets instance colours once (ensureInstanceColours), and a tool
//  puts back only the colours it changed. A hole another tool has
//  recoloured since our tint is left to that tool.
//
//  EXPORTS
//  ───────
//  Browser: window.Colouring (DOM wiring runs only when document exists)
//  Node:    module.exports
//
//  tintPlan(readings, holeNames) → [{ hole, t }]  t 0 at the lowest live
//      voltage to 1 at the highest, 0.5 for all when equal; floating left out
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Colouring = factory();
  if (typeof module === 'object' && module.exports) module.exports = Colouring;
  if (root) root.Colouring = Colouring;
})(typeof window !== 'undefined' ? window : null, function () {

  function tintPlan(readings, holeNames) {
    const volts = new Map();   // net id → volts or null
    const live = [];
    holeNames.forEach(hole => {
      const net = readings.netOf(hole);
      if (!net) return;
      if (!volts.has(net.id)) volts.set(net.id, readings.voltage(net));
      const v = volts.get(net.id);
      if (typeof v === 'number') live.push({ hole, v });
    });
    if (!live.length) return [];
    const vs = live.map(x => x.v);
    const lo = Math.min(...vs), hi = Math.max(...vs);
    return live.map(({ hole, v }) => ({ hole, t: hi > lo ? (v - lo) / (hi - lo) : 0.5 }));
  }

  if (typeof document !== 'undefined') wire();

  function wire() {
    let on   = true;            // the toggle, this session only
    let last = null;            // readings of the last solve while simulating
    let mesh = null;            // the holes mesh the maps below belong to
    const saved   = new Map();  // index → its colour before we first touched it
    const applied = new Map();  // index → the colour we last wrote

    // Idempotent: the board looks the same before and after.
    function ensureInstanceColours(m) {
      if (m.userData.plainColour) return;
      m.userData.plainColour = m.material.color.clone();
      for (let i = 0; i < m.count; i++) m.setColorAt(i, m.userData.plainColour);
      m.material.color.set(0xffffff);
      m.instanceColor.needsUpdate = true;
      m.material.needsUpdate = true;   // r128 recompiles to use instance colours
    }

    // t 0 → blue, 0.5 → purple, 1 → red; saturated so the tint shows.
    const scale = t => new THREE.Color(Math.min(1, 2 * t), 0, Math.min(1, 2 * (1 - t)));

    // The instance buffer is float32, so compare within a tolerance.
    const near = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 1e-4;
    const colourAt = i => { const c = new THREE.Color(); mesh.getColorAt(i, c); return c; };

    // Give back one index: to its saved colour while ours is still on top,
    // else another tool owns it now and we just forget it.
    function release(i) {
      if (near(colourAt(i), applied.get(i))) mesh.setColorAt(i, saved.get(i));
      saved.delete(i);
      applied.delete(i);
    }

    function restore() {
      if (!applied.size) return;
      [...applied.keys()].forEach(release);
      mesh.instanceColor.needsUpdate = true;
    }

    function tint(readings) {
      const bb = App.state.breadboard;
      const want = new Map();   // index → colour
      tintPlan(readings, bb.holeData.map(h => App.holeName(h))).forEach(({ hole, t }) => {
        const { col, row } = App.parseHole(hole);
        want.set(bb.getHole(col, row).idx, scale(t));
      });
      if (!want.size && !applied.size) return;
      mesh = bb.holesMesh;
      ensureInstanceColours(mesh);
      [...applied.keys()].forEach(i => { if (!want.has(i)) release(i); });
      want.forEach((c, i) => {
        const now = colourAt(i);
        if (applied.has(i) && !near(now, applied.get(i))) return;   // another tool is on top
        if (!saved.has(i)) saved.set(i, now);
        mesh.setColorAt(i, c);
        applied.set(i, c);
      });
      mesh.instanceColor.needsUpdate = true;
    }

    // The toggle sits beside Stop and shows only while simulating.
    const toggle = document.createElement('button');
    toggle.id = 'colouring-toggle';
    toggle.className = 'btn-colouring';
    toggle.title = 'Tint each net by its voltage (turn off for frame rate)';
    toggle.hidden = true;
    const label = () => {
      toggle.textContent = on ? 'Colours on' : 'Colours off';
      toggle.setAttribute('aria-pressed', String(on));
    };
    label();
    const stopBtn = document.getElementById('sim-stop-btn');
    if (stopBtn) stopBtn.after(toggle);

    toggle.addEventListener('click', () => {
      on = !on;
      label();
      if (on && last) tint(last); else restore();
    });

    document.addEventListener('plugged:sim', e => {
      const d = e.detail || {};
      // A first run that fails never starts the simulation, so no Stop follows.
      const running = App.simRunning || (d.result && d.result.status === 'ok');
      last = running && d.readings ? d.readings : null;
      toggle.hidden = !running;
      if (on && last) tint(last); else restore();
    });

    document.addEventListener('plugged:sim-stop', () => {
      last = null;
      toggle.hidden = true;
      restore();
    });
  }

  return { tintPlan };
});
