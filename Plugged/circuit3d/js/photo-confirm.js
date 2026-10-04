// ─────────────────────────────────────────────────────────────
//  photo-confirm.js — the confirm screen (issue #141), inside the 📷
//  overlay: the flattened photo with a dot on every lead and wire end,
//  the parts list, swap + / − per rail side, and Build it.
//  DOM only: the geometry is PhotoGrid, the labels and actions are
//  PhotoImport.build. Contract: docs/API-CONTRACT.md → "Reading v1",
//  "PhotoGrid", "PhotoImport"; spec → "The confirm screen".
//
//  FLOW
//  ────
//    photo.js gets a Reading → PhotoConfirm.open(reading, image, grid, onBuild)
//    → '?' endpoints snapped from their pt → draw
//    tap a dot (selected) → tap anywhere → it moves to grid.snap(point).hole
//    ⇄ swaps an LED's legs (or picks its + when unknown) · × deletes
//    every edit re-runs PhotoImport.build and redraws
//    Build it → onBuild(PhotoImport.build(reading)) (photo.js hands it on)
//
//  EXPORTS
//  ───────
//  Browser: window.PhotoConfirm = { reading, result, selected, dots(), built,
//                                   open(reading, image, grid, onBuild), cancelMove() }
// ─────────────────────────────────────────────────────────────

(function () {

  const PICK_TOL = 0.45;   // pitches: a tap this close to a dot selects it
  const SIDE_W   = 280;    // CSS px kept for the parts list beside the photo
  const RAIL_INK = { '+': '#ef4444', '-': '#3b82f6', '?': '#9ca3af' };
  const INK      = { red: '#ef4444', yellow: '#facc15', green: '#22c55e', blue: '#3b82f6',
                     black: '#1f2937', white: '#f9fafb', orange: '#f97316' };

  const $ = id => document.getElementById(id);
  const box    = $('photo-confirm'), canvas = $('photo-confirm-canvas'), list = $('photo-parts');
  const buildB = $('photo-build');

  let image = null, grid = null, onBuild = null;

  const C = window.PhotoConfirm = {
    reading: null, result: null, selected: null, built: null,
    dots, open, cancelMove,
  };

  const isLed   = p => p.type === 'led';
  const picked  = p => p.leads.filter(l => l.role === 'anode').length === 1 && p.leads.filter(l => l.role === 'cathode').length === 1;
  const unknown = () => C.reading.parts.some(p => isLed(p) && !picked(p));   // her + not chosen: Build waits
  const where   = e => grid.holeCentre(e.hole) || e.pt;

  function open(reading, img, g, built) {
    C.reading  = JSON.parse(JSON.stringify(reading));
    C.selected = null;
    C.built    = null;
    image = img;  grid = g;  onBuild = built;
    const ends = [...C.reading.parts.flatMap(p => p.leads), ...C.reading.wires.flatMap(w => w.ends)];
    for (const e of ends) if (e.hole === '?') e.hole = grid.snap(e.pt).hole;
    box.hidden = false;
    sizeCanvas();
    edited();
  }

  // Every edit lands here: rebuild, relist, redraw.
  function edited() {
    C.result = PhotoImport.build(C.reading, { components: [] });
    buildB.disabled = unknown();
    renderList();
    draw();
  }

  // What is drawn: a dot per part lead and wire end, flattened pixels.
  function dots() {
    if (!C.reading) return [];
    const label = id => C.result.labels[id] || '';
    return [
      ...C.reading.parts.flatMap(p => p.leads.map((l, i) => ({ id: p.id, end: i, hole: l.hole, x: where(l)[0], y: where(l)[1],
                                                              label: label(p.id), plus: isLed(p) && l.role === 'anode' }))),
      ...C.reading.wires.flatMap(w => w.ends.map((e, i) => ({ id: w.id, end: i, hole: e.hole, x: where(e)[0], y: where(e)[1],
                                                             label: label(w.id), plus: false }))),
    ];
  }

  function endOf(sel) {
    const p = C.reading.parts.find(q => q.id === sel.id);
    if (p) return p.leads[sel.end];
    return C.reading.wires.find(w => w.id === sel.id).ends[sel.end];
  }

  // Escape: true when it cancelled a move (the overlay stays open).
  function cancelMove() {
    if (box.hidden || !C.selected) return false;
    C.selected = null;
    draw();
    return true;
  }

  // ── Canvas ─────────────────────────────────────────────────

  // The flattened image fills the canvas box exactly, beside the list.
  function sizeCanvas() {
    const fit = Math.min((window.innerWidth - 96 - SIDE_W) / grid.width, (window.innerHeight - 140) / grid.height);
    const cw  = Math.round(grid.width * fit), ch = Math.round(grid.height * fit), dpr = window.devicePixelRatio || 1;
    canvas.style.width  = cw + 'px';
    canvas.style.height = ch + 'px';
    canvas.width  = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }

  function draw() {
    const ctx = canvas.getContext('2d');
    const k = canvas.width / grid.width;                        // flattened px → canvas px
    const d = canvas.width / parseFloat(canvas.style.width);    // CSS px → canvas px
    const at = p => [p[0] * k, p[1] * k];
    const r  = Math.max(4 * d, grid.pitch * k * 0.3);           // dot radius
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawBoard(ctx, at, d);

    const all = dots();
    const ends = id => all.filter(q => q.id === id);
    for (const p of C.reading.parts) link(ctx, ends(p.id), at, d, isLed(p) ? INK[p.color] || INK.red : '#d6a85c');
    for (const w of C.reading.wires) link(ctx, ends(w.id), at, d, INK[w.color] || '#a3a3a3');
    for (const q of all) {
      const [x, y] = at([q.x, q.y]);
      const sel = C.selected && C.selected.id === q.id && C.selected.end === q.end;
      ctx.beginPath();
      ctx.arc(x, y, sel ? r * 1.5 : r, 0, 2 * Math.PI);
      ctx.fillStyle = sel ? '#facc15' : q.plus ? '#ef4444' : '#0ea5e9';
      ctx.fill();
      ctx.lineWidth = 1.5 * d;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      if (q.plus) {
        ctx.font = `800 ${15 * d}px sans-serif`;
        text(ctx, '+', x + r + 5 * d, y - r - 4 * d, d);
      }
    }
    ctx.font = `600 ${11 * d}px sans-serif`;
    for (const id of new Set(all.map(q => q.id))) {
      const e = ends(id), lab = e[0].label || id;
      const [x, y] = at([(e[0].x + e[e.length - 1].x) / 2, (e[0].y + e[e.length - 1].y) / 2]);
      text(ctx, lab, x, y - 12 * d, d);
    }
  }

  // A part's or wire's ends joined by one line.
  function link(ctx, e, at, d, ink) {
    if (e.length < 2) return;
    ctx.beginPath();
    e.forEach((q, i) => { const [x, y] = at([q.x, q.y]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.lineWidth = 5 * d;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();
    ctx.lineWidth = 3 * d;
    ctx.strokeStyle = ink;
    ctx.stroke();
  }

  function text(ctx, s, x, y, d) {
    ctx.lineWidth = 3 * d;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(s, x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(s, x, y);
  }

  // A faint dot on every body hole; each rail line in its PRINTED sign's
  // colour with the sign at both ends (never our model's position).
  function drawBoard(ctx, at, d) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (const row of 'abcdefghij') {
      for (let c = 1; c <= grid.cols; c++) {
        const [x, y] = at(grid.holeCentre(row + c));
        ctx.fillRect(x - d, y - d, 2 * d, 2 * d);
      }
    }
    ctx.font = `700 ${12 * d}px sans-serif`;
    for (const [rail, sign] of Object.entries(C.reading.board.rails)) {
      const [x0, y] = at(grid.holeCentre(`rail:${rail}:1`)), [x1] = at(grid.holeCentre(`rail:${rail}:${grid.cols}`));
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.lineWidth = 2 * d;
      ctx.strokeStyle = RAIL_INK[sign] || RAIL_INK['?'];
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
      const glyph = sign === '-' ? '−' : sign;
      const gap = at([grid.pitch, 0])[0];
      text(ctx, glyph, x0 - gap, y, d);
      text(ctx, glyph, x1 + gap, y, d);
    }
  }

  canvas.addEventListener('click', e => {
    if (!C.reading) return;
    const b = canvas.getBoundingClientRect();
    const pt = [(e.clientX - b.left) * grid.width / b.width, (e.clientY - b.top) * grid.height / b.height];
    if (C.selected) {
      Object.assign(endOf(C.selected), { hole: grid.snap(pt).hole, pt: pt.map(Math.round) });
      C.selected = null;
      return edited();
    }
    let best = null, bestD = PICK_TOL * grid.pitch;
    for (const q of dots()) {
      const dist = Math.hypot(q.x - pt[0], q.y - pt[1]);
      if (dist <= bestD) { best = q; bestD = dist; }
    }
    if (best) { C.selected = { id: best.id, end: best.end }; draw(); }
  });

  // ── List ───────────────────────────────────────────────────

  function renderList() {
    list.textContent = '';
    for (const p of C.reading.parts) {
      let note = p.what || p.type;
      if (isLed(p)) {
        const a = p.leads.find(l => l.role === 'anode');
        note += picked(p) ? ` · + in ${a.hole}` : ' · which leg is +? Press ⇄';
      }
      list.appendChild(row(p.id, note, isLed(p) && (() => swapLegs(p))));
    }
    for (const w of C.reading.wires) list.appendChild(row(w.id, `${w.color || ''} wire`.trim(), null));
  }

  function row(id, note, swap) {
    const li = document.createElement('li');
    li.dataset.id = id;
    const name = document.createElement('b');
    name.textContent = C.result.labels[id] || id;
    const what = document.createElement('span');
    what.textContent = note;
    li.append(name, what);
    if (swap) li.appendChild(button('photo-swap', '⇄', 'Swap the + and − legs', swap));
    li.appendChild(button('photo-del', '×', 'Remove', () => remove(id)));
    return li;
  }

  function button(cls, glyph, title, fn) {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = glyph;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', fn);
    return b;
  }

  // ⇄: swap the anode and cathode; unless exactly one of each, pick them
  // (an anode kept, else a cathode, else the first dot is the +): it
  // always ends with one anode and one cathode.
  function swapLegs(p) {
    const a = p.leads.findIndex(l => l.role === 'anode'), c = p.leads.findIndex(l => l.role === 'cathode');
    const known = a >= 0 && c >= 0;
    const plus = known ? c : a >= 0 ? a : c >= 0 ? 1 - c : 0;
    p.leads.forEach((l, i) => { l.role = i === plus ? 'anode' : 'cathode'; });
    edited();
  }

  function remove(id) {
    C.reading.parts = C.reading.parts.filter(p => p.id !== id);
    C.reading.wires = C.reading.wires.filter(w => w.id !== id);
    if (C.selected && C.selected.id === id) C.selected = null;
    edited();
  }

  // swap + / −: one side's two strips trade printed signs.
  function swapRails(x, y) {
    const r = C.reading.board.rails;
    [r[x], r[y]] = [r[y], r[x]];
    edited();
  }

  $('photo-rails-a').addEventListener('click', () => swapRails('aOuter', 'aInner'));
  $('photo-rails-j').addEventListener('click', () => swapRails('jInner', 'jOuter'));
  buildB.addEventListener('click', () => {
    if (unknown()) return;
    C.built = PhotoImport.build(C.reading, { components: [] });
    onBuild(C.built);
  });

})();
