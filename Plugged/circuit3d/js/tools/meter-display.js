// ─────────────────────────────────────────────────────────────
//  tools/meter-display.js — the multimeter's screen (issue #97).
//
//  While a multimeter is on the board, #meter-display (bottom left of
//  the canvas) shows the first meter's mode (#meter-mode: V, A or Ω) and
//  reading (#meter-reading). On every plugged:sim the reading comes from
//  result.parts[label].m (the meter's own measure, which a short's
//  result still carries): "7.00 V", "14.9 mA", or "FUSE" in red. In Ω
//  mode it is Multimeter.ohms(), or "--" and why (#meter-note). Not
//  simulating: "--". Every meter's own 3D LCD gets the same text
//  (multimeter.js view.show), so the two always agree.
//
//  A click on the meter in 3D (select mode) turns the dial V → A → Ω → V
//  through App.setValues when it lands on the dial knob, or on the body of
//  a meter that was already selected. A first click on the body only
//  selects it (interaction.js). Never stops or prevents an event.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/multimeter.js and readings.js. Does
//  nothing in Node.
// ─────────────────────────────────────────────────────────────

(function () {
  if (typeof document === 'undefined') return;

  const MODES   = ['V', 'A', 'Ω'];
  const DRAG_PX = 8;     // as interaction.js: more is an orbit, not a click
  const POLL_MS = 500;   // how often a placed or deleted meter is noticed

  let el = null, modeEl = null, readingEl = null, noteEl = null;

  function panel() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'meter-display';
    el.hidden = true;
    modeEl    = document.createElement('div');
    modeEl.id = 'meter-mode';
    readingEl = document.createElement('div');
    readingEl.id = 'meter-reading';
    readingEl.textContent = '--';
    noteEl    = document.createElement('div');
    noteEl.id = 'meter-note';
    el.append(modeEl, readingEl, noteEl);
    document.getElementById('canvas-wrap').appendChild(el);
    return el;
  }

  const firstMeter = () => (window.App && App.state ? App.state.components.find(c => c.type === 'multimeter') : null);

  function ohmsText(r) {
    if (r >= 1e6) return (r / 1e6).toFixed(2) + ' MΩ';
    if (r >= 1e3) return (r / 1e3).toFixed(2) + ' kΩ';
    return r.toFixed(1) + ' Ω';
  }

  // { text, fuse, note } for meter `comp` from a plugged:sim result.
  function reading(comp, result) {
    if (comp.values.mode === 'Ω') {
      const o = window.Multimeter.ohms(App.state.components, App.state.wires, comp.label);
      if (typeof o.reading === 'number') return { text: ohmsText(o.reading) };
      return { text: o.reading, note: o.why };
    }
    const pr = result && result.parts && result.parts[comp.label];
    const m  = pr && pr.m;
    if (!m || typeof m.reading !== 'number') return { text: '--' };
    if (m.fuse) return { text: 'FUSE', fuse: true };
    return { text: m.mode === 'A' ? `${m.reading.toFixed(1)} mA` : `${m.reading.toFixed(2)} V` };
  }

  function show(r) {
    readingEl.textContent = r.text;
    readingEl.classList.toggle('meter-fuse', !!r.fuse);
    noteEl.textContent = r.note || '';
  }

  // Shows or hides the panel and names the mode. Cheap: no solve.
  function sync() {
    const comp = firstMeter();
    if (!comp) { if (el) el.hidden = true; return null; }
    panel().hidden = false;
    if (modeEl.textContent !== comp.values.mode) modeEl.textContent = comp.values.mode;
    return comp;
  }

  // Every meter's own 3D screen shows its panel text (multimeter.js view.show).
  const meters = () => (window.App && App.state ? App.state.components.filter(c => c.type === 'multimeter') : []);
  function lcd(comp, r) {
    const def = window.Parts && window.Parts.get('multimeter');
    if (def && def.view && typeof def.view.show === 'function') def.view.show(comp, r);
  }

  document.addEventListener('plugged:sim', e => {
    const comp = sync(), result = e.detail && e.detail.result;
    meters().forEach(m => {
      const r = reading(m, result);
      if (m === comp) show(r);
      lcd(m, r);
    });
  });
  document.addEventListener('plugged:sim-stop', () => {
    if (sync()) show({ text: '--' });
    meters().forEach(m => lcd(m, { text: '--' }));
  });
  setInterval(sync, POLL_MS);

  // ── Turning the dial: a click on the knob, or on a selected meter ──
  let down = null;
  let raycaster = null;

  // { comp, knob } for the meter whose model is the first thing under the
  // click (knob: the hit is inside the dial, the meter's nested group), or null.
  function meterAt(e) {
    const canvas = App.renderer.domElement;
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster = raycaster || new THREE.Raycaster();
    raycaster.setFromCamera(ndc, App.camera);
    const meshes = [];
    App.state.components.forEach(c => { if (c.group) c.group.traverse(o => { if (o.isMesh) meshes.push(o); }); });
    App.state.wires.forEach(w => { if (w.group) w.group.traverse(o => { if (o.isMesh) meshes.push(o); }); });
    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    let comp = null;
    for (let o = hit.object; o && !comp; o = o.parent) comp = App.state.components.find(c => c.group === o) || null;
    return comp && comp.type === 'multimeter' ? { comp, knob: hit.object.parent !== comp.group } : null;
  }

  // What was selected is read here: interaction.js selects on pointerup, before this file's handler.
  document.addEventListener('pointerdown', e => {
    down = window.App && App.renderer && e.target === App.renderer.domElement && e.isPrimary && e.button === 0
      ? { x: e.clientX, y: e.clientY, id: e.pointerId, selected: App.state.selected && App.state.selected.item } : null;
  });
  document.addEventListener('pointerup', e => {
    if (!down || e.pointerId !== down.id) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX;
    const wasSelected = down.selected;
    down = null;
    if (moved || App.state.mode !== 'select') return;
    const at = meterAt(e);
    if (!at || (!at.knob && at.comp !== wasSelected)) return;
    const comp = at.comp;
    const next = MODES[(MODES.indexOf(comp.values.mode) + 1) % MODES.length];
    App.setValues(comp, { mode: next });
    sync();
  });
})();
