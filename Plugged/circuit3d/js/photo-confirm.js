// ─────────────────────────────────────────────────────────────
//  photo-confirm.js — the confirm screen (issues #141, #142), inside the
//  📷 overlay: the flattened photo with a dot on every lead, wire end and
//  battery lead, the parts list (values, colours, volts, amber flags,
//  greyed not-built parts), + Add a part, swap + / − per rail side, and
//  Build it.
//  DOM only: the geometry is PhotoGrid, the flags and actions are
//  PhotoImport.build. Each row and canvas label is named by its Reading id
//  (PhotoImport's key when that is missing or repeated; a battery its app
//  label, BAT1), never by its built label (#178).
//  Contract: docs/API-CONTRACT.md → "Reading v1",
//  "PhotoGrid", "PhotoImport".
//
//  FLOW
//  ────
//    photo.js gets a Reading → PhotoConfirm.open(reading, image, grid, onBuild)
//    → '?' endpoints snapped from their pt → draw
//    tap a dot (selected) → tap anywhere → it moves to grid.snap(point).hole
//    ⇄ swaps an LED's legs (or picks its + when unknown) · × deletes
//    value / colour dropdowns, battery volts (as typed: PhotoImport flags
//    and falls back to 9 V outside 1–24 V)
//    + Add a part → resistor / LED / wire → tap two holes (snapped)
//    every edit re-runs PhotoImport.build and redraws; a row is amber
//    (.photo-flagged) with each flag's why, greyed (.photo-notbuilt) if skipped
//    Build it → onBuild(PhotoImport.build(reading)) (photo.js hands it on),
//    at any time, crops out or not
//
//  LEGS AS THEY ANSWER (#173)
//  ──────────────────────────
//    photo.js opens the screen with the box round's placeholders, then
//    startPlacing(ids) for the crops it sends: those rows get .photo-placing
//    and "Placing legs N/M…" shows above the list. Each crop's line →
//    place(id, entry): the id leaves `placing`; unless she has touched that
//    item since open() (moved a dot, ⇄, ×, a value, colour or volts), the
//    entry is merged (PhotoCrops.merge; found false drops the item), its '?'
//    snapped, rebuilt and redrawn. stopPlacing() clears it all (done, a
//    timeout, an error, a close).
//    #177: a landing line never replaces the control she is using: the row
//    holding the focused input or select stays the same element (its typed
//    value and open picker kept), the others are rebuilt around it, and every
//    row control writes to the item as it is when it fires (merge copies the
//    Reading), looked up by id.
//
//  EXPORTS
//  ───────
//  Browser: window.PhotoConfirm = { reading, result, selected, dots(), built, placing,
//                                   open(reading, image, grid, onBuild), cancelMove(),
//                                   place(id, entry), startPlacing(ids), stopPlacing() }
//  (placing: a Set of the ids whose crop line hasn't arrived)
// ─────────────────────────────────────────────────────────────

(function () {

  const PICK_TOL = 0.45;   // pitches: a tap this close to a dot selects it
  const SIDE_W   = 280;    // CSS px kept for the parts list beside the photo
  const RAIL_INK = { '+': '#ef4444', '-': '#3b82f6', '?': '#9ca3af' };
  const INK      = { red: '#ef4444', yellow: '#facc15', green: '#22c55e', blue: '#3b82f6',
                     black: '#1f2937', white: '#f9fafb', orange: '#f97316' };
  const WIRE_COLORS = ['red', 'yellow', 'green', 'blue', 'black', 'white'];   // chat.js's wire colours
  const BAND = { black: 0, brown: 1, red: 2, orange: 3, yellow: 4, green: 5, blue: 6, violet: 7, purple: 7,
                 grey: 8, gray: 8, white: 9, gold: -1, silver: -2 };
  const NEW_PART = { resistor: { what: 'resistor', value: 470, color: '' }, led: { what: 'LED', value: 0, color: 'red' } };

  const $ = id => document.getElementById(id);
  const box    = $('photo-confirm'), canvas = $('photo-confirm-canvas'), list = $('photo-parts');
  const buildB = $('photo-build');

  let image = null, grid = null, onBuild = null;
  let adding = null;   // + Add a part: { type, pts } until its second tap
  let touched = new Set();   // ids she has edited since open(): their crop lines are ignored
  let sent = 0;              // crops out this round, for "Placing legs N/M…"

  const C = window.PhotoConfirm = {
    reading: null, result: null, selected: null, built: null, placing: new Set(),
    dots, open, cancelMove, place, startPlacing, stopPlacing,
  };

  const isLed   = p => p.type === 'led';
  const picked  = p => p.leads.filter(l => l.role === 'anode').length === 1 && p.leads.filter(l => l.role === 'cathode').length === 1;
  const unknown = () => C.reading.parts.some(p => isLed(p) && !picked(p));   // her + not chosen: Build waits
  const where   = e => grid.holeCentre(e.hole) || e.pt;
  const powerAt = id => /^power:(\d+)$/.exec(id);
  const current = id => {   // the item in C.reading now, by id ('power:N' a battery)
    const m = powerAt(id);
    return m ? C.reading.power[+m[1]] : C.reading.parts.find(p => p.id === id) || C.reading.wires.find(w => w.id === id);
  };

  function open(reading, img, g, built) {
    C.reading  = JSON.parse(JSON.stringify(reading));
    C.selected = null;
    C.built    = null;
    C.placing  = new Set();
    image = img;  grid = g;  onBuild = built;  adding = null;  touched = new Set();  sent = 0;
    picker.hidden = true;
    snapUnknown();
    box.hidden = false;
    sizeCanvas();
    edited();
  }

  // Every '?' end to the hole under its point.
  function snapUnknown() {
    const ends = [...C.reading.parts.flatMap(p => p.leads), ...C.reading.wires.flatMap(w => w.ends),
                  ...C.reading.power.flatMap(s => [s.plus, s.minus])];
    for (const e of ends) if (e.hole === '?') e.hole = grid.snap(e.pt).hole;
  }

  // ── Legs as they answer (#173) ─────────────────────────────

  function startPlacing(ids) {
    C.placing = new Set(ids);
    sent = C.placing.size;
    if (C.reading) { mark(); draw(); }
  }

  function stopPlacing() {
    C.placing = new Set();
    sent = 0;
    if (C.reading) { mark(); draw(); }
  }

  // One crop's answer. An item she has touched keeps what she made of it.
  function place(id, entry) {
    if (!C.reading) return;
    C.placing.delete(id);
    if (touched.has(id) || !entry) {
      mark();
      draw();
      return;
    }
    C.reading = PhotoCrops.merge(C.reading, [Object.assign({}, entry, { id })]);
    snapUnknown();
    if (C.selected && !dots().some(q => q.id === C.selected.id)) C.selected = null;   // found false dropped it
    edited(true);
  }

  // Every edit lands here: rebuild, relist, redraw. keep: a crop line
  // landing, so the control she is using stays (renderList).
  function edited(keep) {
    rebuild();
    renderList(keep);
    draw();
  }

  function rebuild() {
    C.result = PhotoImport.build(C.reading, { components: [] });
    buildB.disabled = unknown();
  }

  // Each part's and wire's name on this screen (#178), in Reading order:
  // its Reading id, the one its why-text uses; a missing or repeated id
  // takes PhotoImport's key instead (part<n> / wire<n>, <id>#2), so no two
  // read the same. PhotoImport's labels name the built board, not these.
  function names() {
    const uses = new Map();
    const key  = (id, fallback) => {
      const base = id != null && String(id).trim() ? String(id).trim() : fallback;
      uses.set(base, (uses.get(base) || 0) + 1);
      return uses.get(base) > 1 ? `${base}#${uses.get(base)}` : base;
    };
    return { parts: C.reading.parts.map((p, i) => key(p.id, `part${i + 1}`)),
             wires: C.reading.wires.map((w, i) => key(w.id, `wire${i + 1}`)) };
  }
  const battery = k => C.result.labels['power:' + k] || 'power:' + k;   // its app label (BAT1)

  // What is drawn: a dot per part lead, wire end and battery lead (end 0
  // its +, end 1 its −), flattened pixels, labelled with its item's name.
  function dots() {
    if (!C.reading) return [];
    const n   = names();
    const dot = (id, label, e, i, plus) => ({ id, end: i, hole: e.hole, x: where(e)[0], y: where(e)[1], label, plus });
    return [
      ...C.reading.parts.flatMap((p, k) => p.leads.map((l, i) => dot(p.id, n.parts[k], l, i, isLed(p) && l.role === 'anode'))),
      ...C.reading.wires.flatMap((w, k) => w.ends.map((e, i) => dot(w.id, n.wires[k], e, i, false))),
      ...C.reading.power.flatMap((s, k) => [s.plus, s.minus].map((e, i) => dot('power:' + k, battery(k), e, i, false))),
    ];
  }

  function endOf(sel) {
    const m = powerAt(sel.id);
    if (m) return C.reading.power[+m[1]][sel.end ? 'minus' : 'plus'];
    const p = C.reading.parts.find(q => q.id === sel.id);
    if (p) return p.leads[sel.end];
    return C.reading.wires.find(w => w.id === sel.id).ends[sel.end];
  }

  // Escape: true when it cancelled a move or an add (the overlay stays open).
  function cancelMove() {
    if (box.hidden || !(C.selected || adding || !picker.hidden)) return false;
    C.selected = null;
    adding = null;
    picker.hidden = true;
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

    const all = dots(), n = names();
    const ends = (id, name) => all.filter(q => q.id === id && q.label === name);   // one item's: ids may repeat, names don't (#178)
    C.reading.parts.forEach((p, k) => link(ctx, ends(p.id, n.parts[k]), at, d, isLed(p) ? INK[p.color] || INK.red : '#d6a85c'));
    C.reading.wires.forEach((w, k) => link(ctx, ends(w.id, n.wires[k]), at, d, INK[w.color] || '#a3a3a3'));
    for (const q of all) {
      const [x, y] = at([q.x, q.y]);
      const sel = C.selected && C.selected.id === q.id && C.selected.end === q.end;
      const bat = powerAt(q.id), glyph = q.plus || (bat && !q.end) ? '+' : bat ? '−' : '';
      ctx.globalAlpha = C.placing.has(q.id) && !sel ? 0.5 : 1;   // a placeholder still being placed
      ctx.beginPath();
      ctx.arc(x, y, sel ? r * 1.5 : r, 0, 2 * Math.PI);
      ctx.fillStyle = sel ? '#facc15' : glyph === '+' ? '#ef4444' : glyph ? '#1f2937' : '#0ea5e9';
      ctx.fill();
      ctx.lineWidth = 1.5 * d;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (glyph) {
        ctx.font = `800 ${15 * d}px sans-serif`;
        text(ctx, glyph, x + r + 5 * d, y - r - 4 * d, d);
      }
    }
    if (adding && adding.pts.length) {                            // + Add: its first tap
      const [x, y] = at(grid.holeCentre(adding.pts[0].hole) || adding.pts[0].pt);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.5, 0, 2 * Math.PI);
      ctx.lineWidth = 3 * d;
      ctx.strokeStyle = '#facc15';
      ctx.stroke();
    }
    ctx.font = `600 ${11 * d}px sans-serif`;
    const named = new Set();
    for (const q of all) {                                         // one label per item, by its name
      if (named.has(q.id + '\n' + q.label)) continue;
      named.add(q.id + '\n' + q.label);
      const e = ends(q.id, q.label);
      const [x, y] = at([(e[0].x + e[e.length - 1].x) / 2, (e[0].y + e[e.length - 1].y) / 2]);
      text(ctx, q.label, x, y - 12 * d, d);
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
    if (adding) {
      adding.pts.push({ hole: grid.snap(pt).hole, pt: pt.map(Math.round) });
      if (adding.pts.length < 2) return draw();
      return add(adding.type, adding.pts);
    }
    if (C.selected) {
      touched.add(C.selected.id);
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

  // Every row afresh. keep (a crop line landing, #177): the row holding the
  // focused control stays the same element, only its name and holes
  // refreshed, and the other rows are rebuilt around it, so she keeps her
  // focus, what she typed and an open picker.
  function renderList(keep) {
    const rows = [];
    for (const f of C.result.flags.filter(x => x.id == null)) {   // the whole board: no battery seen, rails guessed
      const li = document.createElement('li');
      li.className = 'photo-flagged photo-board';
      li.textContent = f.why;
      rows.push(li);
    }
    const holes = ends => ends.map(e => e.hole).join(' → ');
    const n = names();
    C.reading.parts.forEach((p, k) => {
      let note = p.type === 'resistor' || isLed(p) ? holes(p.leads) : p.what || p.type;
      if (isLed(p)) {
        const a = p.leads.find(l => l.role === 'anode');
        note += picked(p) ? ` · + in ${a.hole}` : ' · which leg is +? Press ⇄';
      }
      const pick = p.type === 'resistor' ? valueSelect(p) : isLed(p) ? colorSelect(p, Object.keys(Parts.get('led').values.color.choices)) : null;
      rows.push(row(p.id, n.parts[k], note, isLed(p) && (() => swapLegs(p.id)), pick));
    });
    C.reading.wires.forEach((w, k) => rows.push(row(w.id, n.wires[k], holes(w.ends), null, colorSelect(w, WIRE_COLORS))));
    C.reading.power.forEach((s, i) => rows.push(row('power:' + i, battery(i), s.kind === 'bench_supply' ? 'bench supply' : 'battery', null, voltsInput(s, 'power:' + i))));

    const active = document.activeElement;
    const held   = keep && active && list.contains(active) ? active.closest('li[data-id]') : null;
    const twin   = held && rows.find(li => li.dataset.id === held.dataset.id);
    if (twin) {
      for (const tag of ['b', 'span']) held.querySelector(`:scope > ${tag}`).textContent = twin.querySelector(`:scope > ${tag}`).textContent;
      for (const li of [...list.children]) if (li !== held) li.remove();
      const at = rows.indexOf(twin);
      held.before(...rows.slice(0, at));
      held.after(...rows.slice(at + 1));
    } else {
      list.textContent = '';
      list.append(...rows);
    }
    mark();
  }

  // Every row's amber (flagged, with each why), grey (not built) and
  // placing (its crop still out), from C.result and C.placing; the count.
  function mark() {
    for (const li of list.querySelectorAll('li[data-id]')) {
      const id = li.dataset.id, skip = C.result.skipped.find(x => x.id === id);
      const why = C.result.flags.filter(f => f.id === id).map(f => f.why);
      if (skip) why.unshift(why.includes(skip.why) ? 'not built' : `not built: ${skip.why}`);
      li.classList.toggle('photo-flagged', C.result.flags.some(f => f.id === id));
      li.classList.toggle('photo-notbuilt', !!skip);
      li.classList.toggle('photo-placing', C.placing.has(id));
      li.querySelector('.photo-why').textContent = why.join('\n');
    }
    note.hidden = !C.placing.size;
    note.textContent = C.placing.size ? `Placing legs ${sent - C.placing.size}/${sent}…` : '';
  }

  // A row: data-id its Reading id ('power:N' a battery), named by its name.
  function row(id, label, note, swap, pick) {
    const li = document.createElement('li');
    li.dataset.id = id;
    const name = document.createElement('b');
    name.textContent = label;
    const what = document.createElement('span');
    what.textContent = note;
    const why = document.createElement('small');
    why.className = 'photo-why';
    li.append(name, what);
    if (pick) li.append(...[].concat(pick));
    if (swap) li.appendChild(button('photo-swap', '⇄', 'Swap the + and − legs', swap));
    li.append(button('photo-del', '×', 'Remove', () => remove(id)), why);
    return li;
  }

  function select(cls, title, options, value, fn) {
    const s = document.createElement('select');
    s.className = cls;
    s.title = title;
    s.setAttribute('aria-label', title);
    for (const [v, text] of options) s.add(new Option(text, v));
    s.value = value;
    s.addEventListener('change', () => fn(s.value));
    return s;
  }

  // The Reading's value, its bands' value and the E12 values around them;
  // unread → "? Ω" until she picks one (PhotoImport uses 470 Ω meanwhile).
  function valueSelect(p) {
    const ok   = v => Parts.checkValue('resistor', 'resistance', v).ok;
    const read = ok(p.value) ? p.value : null, bands = decodeBands(p.bands);
    const mid  = read || bands || 470;
    const vals = [read, bands];
    for (let k = -6; k <= 6; k++) vals.push(Parts.nearestKit(mid * Math.pow(10, k / 12), 'E12'));
    const opts = [...new Set(vals.filter(v => v != null && ok(v)))].sort((a, b) => a - b).map(v => [String(v), Parts.withUnit(v, 'Ω')]);
    if (read == null) opts.unshift(['', '? Ω']);
    return select('photo-value', 'Resistance', opts, read == null ? '' : String(read), v => { set(p.id, 'value', Number(v)); edited(); });
  }

  // A row control's edit, to the item as it is when it fires (a landing
  // crop line may have replaced C.reading under a control she kept, #177).
  function set(id, key, v) {
    touched.add(id);
    const item = current(id);
    if (item) item[key] = v;
  }

  // ['yellow', 'violet', 'brown', 'gold'] → 470: two digits (three on a
  // 5-band) then the multiplier; the last band of 4+ is the tolerance. null if unreadable.
  function decodeBands(bands) {
    const b = (Array.isArray(bands) ? bands : []).map(c => BAND[String(c).trim().toLowerCase()]);
    if (b.length < 3 || b.length > 5) return null;
    const n = b.length === 5 ? 3 : 2, digits = b.slice(0, n), mult = b[n];
    if (digits.some(d => d == null || d < 0) || mult == null) return null;
    const v = Number((Number(digits.join('')) * Math.pow(10, mult)).toPrecision(12));
    return v > 0 ? v : null;
  }

  function colorSelect(item, colors) {
    const opts = colors.map(c => [c, c]);
    if (!colors.includes(item.color)) opts.unshift(['', item.color || '?']);
    return select('photo-color', 'Colour', opts, colors.includes(item.color) ? item.color : '', v => { set(item.id, 'color', v); edited(); });
  }

  // The volts built (9 when unread or out of range). Typing re-runs the
  // build in place (the input keeps focus); change redraws the list.
  function voltsInput(s, id) {
    const input = document.createElement('input');
    Object.assign(input, { type: 'number', className: 'photo-volts', min: '1', max: '24', step: 'any', title: 'Volts' });
    input.setAttribute('aria-label', 'Volts');
    input.value = String(Parts.checkValue('battery', 'voltage', s.volts).ok ? s.volts : 9);
    input.addEventListener('input', () => { set(id, 'volts', Number(input.value)); rebuild(); mark(); draw(); });
    input.addEventListener('change', () => { set(id, 'volts', Number(input.value)); edited(); });
    const unit = document.createElement('i');
    unit.textContent = 'V';
    return [input, unit];
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
  function swapLegs(id) {
    const p = current(id);
    if (!p) return;
    const a = p.leads.findIndex(l => l.role === 'anode'), c = p.leads.findIndex(l => l.role === 'cathode');
    const known = a >= 0 && c >= 0;
    const plus = known ? c : a >= 0 ? a : c >= 0 ? 1 - c : 0;
    p.leads.forEach((l, i) => { l.role = i === plus ? 'anode' : 'cathode'; });
    touched.add(p.id);
    edited();
  }

  function remove(id) {
    touched.add(id);
    const m = powerAt(id);
    if (m) C.reading.power.splice(+m[1], 1);
    C.reading.parts = C.reading.parts.filter(p => p.id !== id);
    C.reading.wires = C.reading.wires.filter(w => w.id !== id);
    if (C.selected && C.selected.id === id) C.selected = null;
    edited();
  }

  // + Add a part: a resistor or LED (first tap the anode, the second the
  // cathode) or a wire, with an id no part or wire uses.
  function add(type, pts) {
    adding = null;
    const taken = new Set([...C.reading.parts, ...C.reading.wires].map(x => x.id));
    const pre = { resistor: 'R', led: 'LED', wire: 'W' }[type];
    let n = 1;
    while (taken.has(pre + n)) n++;
    const id = pre + n;
    touched.add(id);   // hers: a late crop line under the same id never moves it
    if (type === 'wire') C.reading.wires.push({ id, color: 'yellow', ends: pts, confidence: 1, unsure: [] });
    else {
      const roles = type === 'led' ? ['anode', 'cathode'] : ['none', 'none'];
      C.reading.parts.push(Object.assign({ id, type, bands: [], box: [0, 0, 0, 0], confidence: 1, unsure: [] }, NEW_PART[type],
                                         { leads: pts.map((e, i) => Object.assign({ role: roles[i] }, e)) }));
    }
    edited();
  }

  // swap + / −: one side's two strips trade printed signs.
  function swapRails(x, y) {
    const r = C.reading.board.rails;
    [r[x], r[y]] = [r[y], r[x]];
    edited();
  }

  // + Add a part, under the list: pick a type, then tap its two holes.
  const addBar = document.createElement('div'), picker = document.createElement('span');
  addBar.className = 'photo-btns photo-addbar';
  const addB = button('btn-secondary', '+ Add a part', 'Add a part the photo missed', () => { picker.hidden = !picker.hidden; });
  addB.id = 'photo-add';
  picker.hidden = true;
  for (const [type, text, a] of [['resistor', 'Resistor', 'a resistor'], ['led', 'LED', 'an LED'], ['wire', 'Wire', 'a wire']]) {
    const b = button('btn-secondary', text, `Add ${a}: tap its two holes`, () => {
      picker.hidden = true;
      C.selected = null;
      adding = { type, pts: [] };
      draw();
    });
    b.dataset.add = type;
    picker.appendChild(b);
  }
  addBar.append(addB, picker);
  list.after(addBar);

  // "Placing legs N/M…" above the list while crops are out (#173).
  const note = document.createElement('div');
  note.id = 'photo-placing-note';
  note.hidden = true;
  list.before(note);

  $('photo-rails-a').addEventListener('click', () => swapRails('aOuter', 'aInner'));
  $('photo-rails-j').addEventListener('click', () => swapRails('jInner', 'jOuter'));
  buildB.addEventListener('click', () => {
    if (unknown()) return;
    C.built = PhotoImport.build(C.reading, { components: [] });
    onBuild(C.built);
  });

})();
