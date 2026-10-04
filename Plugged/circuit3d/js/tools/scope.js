// ─────────────────────────────────────────────────────────────
//  tools/scope.js — the mini scope (issue #121)
//
//  While the clock runs, #scope (bottom right) graphs the first function
//  generator's OUT (CH1) and a probed hole (CH2) over the last 2 periods
//  of the generator (5 s without one), each with its Vpp and frequency.
//  One sample per plugged:sim time-run frame (detail.t), drawn there too:
//  no animation loop of its own. #scope-probe-btn, then a hole, sets CH2
//  (caught in the capture phase, as thevenin.js does); Esc cancels.
//  #scope-toggle (beside Stop) hides it; Stop clears the traces and the probe.
//
//  EXPORTS
//  ───────
//  Browser: window.Scope (DOM wiring runs only when document exists)
//  Node:    module.exports
//
//  windowFor(freq)  seconds shown: 2 / freq for freq > 0, else 5
//  recorder() → { push({ t, ch1, ch2, freq }), samples(ch), stats(ch),
//      scale(), span(), clear(ch?) }
//    samples(ch)  [{ t, v }] oldest first, inside the window
//    stats(ch)    { vpp, freq } or null with no samples; freq null with
//                 fewer than 2 rising crossings of the mid level, or when
//                 frames are too sparse for the generator's frequency
//    scale()      S > 0: the view spans −S…+S, a 1-2-5 step ≥ the peak
//    span()       { start, end } of the window, or null
//  source(readings, board) → { label, v, freq } for the first function
//      generator in board.components (v its OUT vs COM), or null
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Scope = factory();
  if (typeof module === 'object' && module.exports) module.exports = Scope;
  if (root) root.Scope = Scope;
})(typeof window !== 'undefined' ? window : null, function () {

  const inNode = typeof module === 'object' && module.exports;
  const Parts  = () => (inNode ? require('../parts') : window.Parts);

  const NO_GEN_S = 5;      // s of history with no generator
  const MIN_SPP  = 6;      // samples a period below which a frequency is a guess
  const HYST     = 0.1;    // re-arm below mid − 10% of the half swing

  const TYPE = 'function_generator';
  const num  = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  function windowFor(freq) {
    return freq > 0 ? 2 / freq : NO_GEN_S;
  }

  function recorder() {
    // Per channel, the samples in the window plus at most one from just
    // before its start, so a crossing right at the start still counts.
    let buf = { 1: [], 2: [] };
    let start = null, end = null, freq = null;

    function clear(ch) {
      if (ch === 1 || ch === 2) { buf[ch] = []; return; }
      buf = { 1: [], 2: [] };
      start = end = freq = null;
    }

    function push({ t, ch1, ch2, freq: f }) {
      if (num(t) === null) return;
      if (end !== null && t < end) clear();   // a new run
      end   = t;
      freq  = num(f);
      start = t - windowFor(freq);
      [[1, ch1], [2, ch2]].forEach(([ch, v]) => {
        if (num(v) !== null) buf[ch].push({ t, v });
        const b = buf[ch];
        let i = 0;
        while (i < b.length && b[i].t < start) i++;
        if (i > 1) b.splice(0, i - 1);
      });
    }

    const visible = ch => (buf[ch] || []).filter(s => s.t >= start);

    function stats(ch) {
      const vis = visible(ch);
      if (!vis.length) return null;
      let max = -Infinity, min = Infinity;
      vis.forEach(s => { if (s.v > max) max = s.v; if (s.v < min) min = s.v; });
      const vpp = max - min;
      if (!(vpp > 1e-6) || vis.length < 2) return { vpp, freq: null };

      // Rising crossings of the mid level, with a little hysteresis.
      const mid = (max + min) / 2, low = mid - HYST * vpp / 2;
      const all = buf[ch];
      const cross = [];
      let armed = all[0].v < mid;
      for (let k = 1; k < all.length; k++) {
        const a = all[k - 1], b = all[k];
        if (armed && a.v < mid && b.v >= mid) {
          cross.push(a.t + (mid - a.v) / (b.v - a.v) * (b.t - a.t));
          armed = false;
        }
        if (b.v < low) armed = true;
      }
      if (cross.length < 2) return { vpp, freq: null };
      const f = (cross.length - 1) / (cross[cross.length - 1] - cross[0]);

      // Too few frames a period: any number would be aliased or guessed.
      const ref  = freq || f;
      const spp  = (vis.length - 1) / ((vis[vis.length - 1].t - vis[0].t) * ref);
      return { vpp, freq: spp >= MIN_SPP && Number.isFinite(f) ? f : null };
    }

    function scale() {
      let peak = 0;
      [1, 2].forEach(ch => visible(ch).forEach(s => { peak = Math.max(peak, Math.abs(s.v)); }));
      if (!(peak > 0) || !Number.isFinite(peak)) return 1;
      const base = 10 ** Math.floor(Math.log10(peak));
      for (const m of [1, 2, 5, 10]) if (m * base >= peak * (1 - 1e-12)) return m * base;
      return 10 * base;
    }

    return {
      push, clear, stats, scale,
      samples: ch => visible(ch).map(s => ({ t: s.t, v: s.v })),
      span:    () => (end === null ? null : { start, end }),
    };
  }

  function source(readings, board) {
    const comps = (board && board.components) || [];
    const c = comps.find(x => x && x.type === TYPE);
    if (!c) return null;
    const p = readings ? readings.part(c.label) : null;
    const def = Parts().get(TYPE);
    const f = num(Number(c.values && c.values.frequency));
    return { label: c.label, v: p ? num(p.V) : null, freq: f !== null ? f : def.values.frequency.default };
  }

  const api = { windowFor, recorder, source };
  if (typeof document !== 'undefined') wire();

  function wire() {
    const DRAG_PX = 8;                // as interaction.js: more is an orbit, not a click
    const W = 240, H = 120, PAD = 6;  // canvas px; traces keep PAD from the top and bottom
    const COLOURS = { bg: '#10161c', grid: '#26323d', 1: '#ffd25a', 2: '#5ad2ff', text: '#8fa3b5' };

    const rec = recorder();
    let on = true, running = false, probe = null, pending = false, down = null, raycaster = null;

    // 1 → "1.0", 0.25 → "0.25": as the generator's panel prints it (0.9996 → "1.0").
    const hz  = f => (Number(f.toPrecision(2)) >= 1 ? f.toFixed(1) : String(Number(f.toPrecision(2))));
    const fmt = st => (st ? `${st.vpp.toFixed(2)} Vpp · ${st.freq === null ? '—' : hz(st.freq)} Hz` : '— Vpp · — Hz');

    const el = (tag, id, cls) => {
      const e = document.createElement(tag);
      if (id) e.id = id;
      if (cls) e.className = cls;
      return e;
    };
    const panel  = el('div', 'scope');
    const canvas = el('canvas', 'scope-canvas');
    canvas.width = W;
    canvas.height = H;
    const ch1 = el('div', 'scope-ch1', 'scope-ch');
    const ch2 = el('div', 'scope-ch2', 'scope-ch');
    const probeBtn = el('button', 'scope-probe-btn', 'btn-colouring');
    probeBtn.title = 'Click Probe, then a hole, to graph its voltage as CH2 (Esc cancels)';
    panel.append(canvas, ch1, ch2, probeBtn);
    panel.hidden = true;
    ch2.hidden = true;
    (document.getElementById('canvas-wrap') || document.body).appendChild(panel);

    const toggle = el('button', 'scope-toggle', 'btn-colouring');
    toggle.title = 'Show or hide the scope';
    toggle.hidden = true;
    const after = document.getElementById('flow-dots-toggle') || document.getElementById('sim-stop-btn');
    if (after) after.after(toggle);

    function labels() {
      toggle.textContent = on ? 'Scope on' : 'Scope off';
      toggle.setAttribute('aria-pressed', String(on));
      probeBtn.textContent = pending ? 'Pick a hole…' : 'Probe';
      probeBtn.setAttribute('aria-pressed', String(pending));
    }

    function draw() {
      const g = canvas.getContext('2d');
      g.fillStyle = COLOURS.bg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = COLOURS.grid;
      g.lineWidth = 1;
      g.beginPath();
      for (let k = 1; k < 4; k++) { g.moveTo(0, Math.round(H * k / 4) + 0.5); g.lineTo(W, Math.round(H * k / 4) + 0.5); }
      for (let k = 1; k < 8; k++) { g.moveTo(Math.round(W * k / 8) + 0.5, 0); g.lineTo(Math.round(W * k / 8) + 0.5, H); }
      g.stroke();
      const span = rec.span();
      if (!span || !(span.end > span.start)) return;
      const S = rec.scale();
      const x = t => (t - span.start) / (span.end - span.start) * W;
      const y = v => H / 2 - v / S * (H / 2 - PAD);
      [1, 2].forEach(ch => {
        const s = rec.samples(ch);
        if (s.length < 2) return;
        g.strokeStyle = COLOURS[ch];
        g.lineWidth = 1.5;
        g.beginPath();
        s.forEach((p, i) => (i ? g.lineTo(x(p.t), y(p.v)) : g.moveTo(x(p.t), y(p.v))));
        g.stroke();
      });
      g.fillStyle = COLOURS.text;
      g.font = '10px monospace';
      g.textAlign = 'right';
      g.fillText(`±${Number(S.toPrecision(3))} V`, W - 4, 12);
    }

    function show() {
      panel.hidden = !(running && on);
      toggle.hidden = !running;
      ch2.hidden = !probe;
      ch1.textContent = `CH1 ${fmt(rec.stats(1))}`;
      ch2.textContent = `CH2 ${probe || ''}: ${fmt(rec.stats(2))}`;
      labels();
      if (!panel.hidden) draw();
    }

    function stop() {
      running = false;
      probe = null;
      pending = false;
      down = null;
      rec.clear();
      show();
    }

    toggle.addEventListener('click', () => { on = !on; show(); });
    probeBtn.addEventListener('click', () => { pending = !pending; labels(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && pending) { pending = false; labels(); }
    });

    // The hole nearest the click on the board, within half a pitch, or null.
    function holeAt(e) {
      const r = App.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster = raycaster || new THREE.Raycaster();
      raycaster.setFromCamera(ndc, App.camera);
      const pt = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
      if (!pt) return null;
      let best = null, bestD = App.BOARD_GEOMETRY.HS / 2;
      for (const h of App.state.breadboard.holeData) {
        const d = Math.hypot(h.x - pt.x, h.z - pt.z);
        if (d < bestD) { best = h; bestD = d; }
      }
      return best ? App.holeName(best) : null;
    }

    // While picking, the canvas's own listeners (interaction.js,
    // equations.js, the orbit controls) never see the click.
    const onCanvas = e => pending && App.renderer && e.target === App.renderer.domElement;
    window.addEventListener('pointerdown', e => {
      if (!onCanvas(e)) return;
      e.stopPropagation();
      down = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
    }, true);
    window.addEventListener('pointerup', e => {
      if (!onCanvas(e)) return;
      e.stopPropagation();
      if (!down || e.pointerId !== down.id) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX;
      down = null;
      const hole = moved ? null : holeAt(e);
      if (!hole) return;
      pending = false;
      probe = hole;
      rec.clear(2);
      show();
    }, true);

    document.addEventListener('plugged:sim', e => {
      const d = e.detail || {};
      // Only time-run frames carry t: a plain solve has no clock to graph.
      if (!(typeof d.t === 'number' && App.simRunning)) {
        if (running) stop();
        return;
      }
      running = true;
      const board = { components: App.state.components, wires: App.state.wires };
      const src = source(d.readings, board);
      const v2  = probe && d.readings ? d.readings.voltage(probe) : null;
      rec.push({ t: d.t, ch1: src ? src.v : null, ch2: v2, freq: src ? src.freq : null });
      show();
    });

    document.addEventListener('plugged:sim-stop', stop);

    labels();
  }

  return api;
});
