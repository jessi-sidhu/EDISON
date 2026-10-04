// ─────────────────────────────────────────────────────────────
//  tools/equations.js — the equation card (issue #92).
//  While simulating, a click on a hole shows its net's KCL with the
//  numbers filled in; a click on a resistor, LED, bulb or motor shows
//  Ohm's law. Reads only Readings (API-CONTRACT → "Readings", "Page
//  events").
//
//    formatKCL(kclRows)              readings.kcl(net) → string, or null
//    formatOhm(type, values, reading) result.parts[label].r.values and
//                                    readings.part(label) → string, or null
//
//  A click on a control part (button, switches) is interaction.js's: it
//  presses or flips it, and no card opens. Never stops or prevents an event.
//
//  EXPORTS
//  ───────
//  Browser: window.Equations (after readings.js); listens on the page
//  Node:    module.exports, so a test runner can call it
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Equations = factory();
  if (typeof module === 'object' && module.exports) module.exports = Equations;
  if (root) root.Equations = Equations;
})(typeof window !== 'undefined' ? window : null, function () {

  const inNode = typeof module === 'object' && module.exports;
  const Parts  = inNode ? require('../parts') : window.Parts;

  const MINUS = '−';
  const mA = x => Math.abs(x).toFixed(1);

  // "I(R1) − I(LED1) − I(R2) = 7.3 − 4.2 − 3.1 = 0 mA"
  function formatKCL(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    const sign = (r, k) => (r.amps < 0 ? (k ? ` ${MINUS} ` : MINUS) : (k ? ' + ' : ''));
    const terms = rows.map((r, k) => sign(r, k) + `I(${r.label})`).join('');
    const nums  = rows.map((r, k) => sign(r, k) + mA(r.amps)).join('');
    const total = rows.reduce((s, r) => s + r.amps, 0);
    const sum   = Number(total.toFixed(1)) === 0 ? '0' : (total < 0 ? MINUS : '') + mA(total);
    return `${terms} = ${nums} = ${sum} mA`;
  }

  const OHMIC = ['resistor', 'bulb', 'motor'];
  const LED_OFF_MA = 0.05;   // below this an LED is off (it would print 0.0 mA)

  // "V = IR → 7.0 V = 14.9 mA × 470 Ω", or the LED's "V = Vf + I·ron → …".
  function formatOhm(type, values, reading) {
    if (!reading || typeof reading.V !== 'number' || typeof reading.I !== 'number' || !values) return null;
    const V = Math.abs(reading.V).toFixed(1), I = mA(reading.I);
    if (OHMIC.includes(type)) return `V = IR → ${V} V = ${I} mA × ${values.resistance} Ω`;
    if (type === 'led') {
      if (Math.abs(reading.I) < LED_OFF_MA) return 'LED off → I = 0 mA';
      const ron = Parts.get('led').elements(values)[0].ron;
      return `V = Vf + I·ron → ${V} V = ${values.vf.toFixed(1)} V + ${I} mA × ${ron} Ω`;
    }
    return null;
  }

  if (!inNode && typeof document !== 'undefined') installCard();

  // ── The card (browser only) ──────────────────────────────────
  function installCard() {
    const App = window.App;
    const DRAG_PX = 8;   // as interaction.js: more is an orbit, not a click
    let latest = null;   // the last plugged:sim detail, until plugged:sim-stop
    let card = null;
    let down = null;
    let raycaster = null;

    function close() { if (card) card.hidden = true; }

    function show(text, x, y) {
      if (!card) {
        card = document.createElement('div');
        card.id = 'equation-card';
        document.body.appendChild(card);
      }
      card.textContent = text;
      card.hidden = false;
      const w = card.offsetWidth, h = card.offsetHeight;
      card.style.left = Math.max(4, Math.min(x + 12, window.innerWidth - w - 4)) + 'px';
      card.style.top  = Math.max(4, Math.min(y + 12, window.innerHeight - h - 4)) + 'px';
    }

    // The nearest part or wire under the click, else the hole nearest the
    // click on the board, within half a pitch.
    function textAt(e) {
      const canvas = App.renderer.domElement;
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster = raycaster || new THREE.Raycaster();
      raycaster.setFromCamera(ndc, App.camera);

      const meshes = [];
      App.state.components.forEach(c => { if (c.group) c.group.traverse(o => { if (o.isMesh) meshes.push(o); }); });
      App.state.wires.forEach(w => { if (w.group) w.group.traverse(o => { if (o.isMesh) meshes.push(o); }); });
      const hit = raycaster.intersectObjects(meshes, false)[0];
      if (hit) {
        let comp = null;
        for (let o = hit.object; o && !comp; o = o.parent) comp = App.state.components.find(c => c.group === o) || null;
        const pr = comp && latest.result && latest.result.parts && latest.result.parts[comp.label];
        return comp && pr ? formatOhm(comp.type, pr.r.values, latest.readings.part(comp.label)) : null;
      }

      const pt = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (!pt) return null;
      let best = null, bestD = App.BOARD_GEOMETRY.HS / 2;
      for (const h of App.state.breadboard.holeData) {
        const d = Math.hypot(h.x - pt.x, h.z - pt.z);
        if (d < bestD) { best = h; bestD = d; }
      }
      return best ? formatKCL(latest.readings.kcl(latest.readings.netOf(App.holeName(best)))) : null;
    }

    document.addEventListener('plugged:sim', e => { latest = e.detail; });
    document.addEventListener('plugged:sim-stop', () => { latest = null; close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    // On document, so interaction.js's canvas listener (a button press) runs first.
    document.addEventListener('pointerdown', e => {
      down = App.renderer && e.target === App.renderer.domElement && e.isPrimary && e.button === 0
        ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    });
    document.addEventListener('pointerup', e => {
      if (!down || e.pointerId !== down.id) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX;
      down = null;
      if (moved || App.state.mode !== 'select') return;
      const text = latest && latest.readings ? textAt(e) : null;
      if (text) show(text, e.clientX, e.clientY); else close();
    });
  }

  return { formatKCL, formatOhm };
});
