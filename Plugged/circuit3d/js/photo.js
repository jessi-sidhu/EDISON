// ─────────────────────────────────────────────────────────────
//  photo.js — 📷 capture (issue #140): choose, drop or sample a photo,
//  tap the board's 4 corner holes, flatten it, send it to /api/photo,
//  then the confirm screen (photo-confirm.js, #141).
//  DOM only: the geometry is PhotoGrid (photo-grid.js).
//  Contract: docs/API-CONTRACT.md → "POST /api/photo", "PhotoGrid",
//  "Page additions".
//
//  FLOW
//  ────
//    📷 → Choose photo / drop on the chat → corner step (a1, aN, jN, j1,
//         a live labelled grid) → Looks right
//    📷 → Use sample photo → its stored taps (window.PhotoSamples)
//    → resize to ≤ 3,000 px → PhotoGrid.warp → JPEG 0.9 → POST /api/photo
//    → the crop round (#160): parts and wires still 'leads' unsure and a
//      `key` → "Found N parts · placing legs…", a labelled crop of each
//      (PhotoCrops.render, from the same resized photo) → one
//      POST /api/photo/leads → PhotoCrops.merge. A timeout (35 s), an
//      error, a network failure or any throw keeps the placeholders, no
//      message. Skipped after a 'deepseek' reading (#161); items() leaves
//      out off-image boxes and sends at most 24.
//    → the Reading opens the confirm screen (PhotoConfirm.open) on the same
//      flattened image; Build it hands its result back here: the board
//      (SparkyChat.applyBuild), window.PhotoFlags, the simulation, then her
//      question to Edison with the photo's context (#143). Or the reply's
//      friendly text with Use sample photo.
//  window.PhotoFlags (the labels of parts read unsure) is emptied when a
//  photo opens and whenever App.clearAll empties the board.
//  While the overlay is open, keydown stops at the window (capture
//  phase), so Backspace and Ctrl+Z never reach the board. Escape cancels
//  a confirm-screen move first, else closes.
//
//  EXPORTS
//  ───────
//  Browser: window.PhotoCapture = { timeoutMs, leadsTimeoutMs, grid, lastReading }
//  (lastReading: the Reading the confirm screen opened with, crops merged)
// ─────────────────────────────────────────────────────────────

(function () {

  const PHOTO_PAGE_TIMEOUT_MS = 60000;   // above the server's 45 s PHOTO_TIMEOUT_MS
  const PHOTO_LEADS_PAGE_TIMEOUT_MS = 35000;   // the server's 25 s PHOTO_LEADS_TIMEOUT_MS plus the upload
  const MAX_SIDE  = 3000;                // the original is resized to this before flattening
  const SAMPLE    = 'demo-board';
  const READING   = 'Reading your board…';
  const PLACING   = n => `Found ${n} part${n === 1 ? '' : 's'} · placing legs…`;
  const DEFAULT_Q = "What's wrong with my circuit?";       // Build it with nothing typed
  // docs/API-CONTRACT.md → "POST /api/photo" → Errors
  const BAD_IMAGE  = "I can't read that file. Try a JPEG or PNG photo, or use the sample photo.";
  const AI_FAILED  = "I couldn't read the photo just now. Try again, or use the sample photo.";
  const AI_TIMEOUT = 'Reading the photo took too long. Try again, or use the sample photo.';

  // grid: the PhotoGrid grid of the current 4 taps (null until then).
  const Capture = window.PhotoCapture = { timeoutMs: PHOTO_PAGE_TIMEOUT_MS, leadsTimeoutMs: PHOTO_LEADS_PAGE_TIMEOUT_MS,
                                          grid: null, lastReading: null };

  const $ = id => document.getElementById(id);
  const modal   = $('photo-modal'),   menu   = $('photo-menu'),   fileIn = $('photo-file');
  const corners = $('photo-corners'), prompt = $('photo-prompt'), canvas = $('photo-canvas');
  const colsEl  = $('photo-cols'),    okBtn  = $('photo-ok'),     status = $('photo-status');
  const errBtn  = $('photo-error-sample'), confirm = $('photo-confirm');

  let img  = null;   // the photo being tapped
  let taps = [];     // its tapped corners, photo pixels, in corner order
  let job  = 0;      // bumped by every open, send and close: a stale reply is dropped
  let ctrl = null;   // the request in flight

  const cols    = () => Number(colsEl.value);
  const names   = () => ['a1', 'a' + cols(), 'j' + cols(), 'j1'];
  const isOpen  = () => modal.style.display !== 'none';
  const nextJob = () => { job++; if (ctrl) ctrl.abort(); return job; };
  const paint   = () => new Promise(r => requestAnimationFrame(() => setTimeout(r)));   // let the status show

  function open() {
    clearFlags();                                          // a new photo: the last one's flags are done
    menu.hidden = true;
    corners.hidden = true;
    confirm.hidden = true;
    showStatus('', false);
    modal.style.display = 'flex';
  }

  function close() {
    nextJob();
    modal.style.display = 'none';
  }

  function showStatus(text, failed) {
    status.textContent = text;
    errBtn.hidden = !failed;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload  = () => resolve(im);
      im.onerror = () => reject(new Error('the image did not decode'));
      im.src = src;
    });
  }

  // ── Corner step ────────────────────────────────────────────

  async function startPhoto(file) {
    const my = nextJob();
    open();
    Capture.grid = null;
    let im = null;
    if (/^image\//.test(file.type)) {
      const url = URL.createObjectURL(file);
      im = await loadImage(url).catch(() => null);
      URL.revokeObjectURL(url);
    }
    if (my !== job) return;
    if (!im) return showStatus(BAD_IMAGE, true);
    img = im;
    taps = [];
    corners.hidden = false;
    sizeCanvas();
    update();
  }

  // The photo fills the canvas box exactly, scaled to fit the window.
  function sizeCanvas() {
    const w = img.naturalWidth, h = img.naturalHeight;
    const fit = Math.min((window.innerWidth - 96) / w, (window.innerHeight - 200) / h);
    const cw  = Math.round(w * fit), ch = Math.round(h * fit), dpr = window.devicePixelRatio || 1;
    canvas.style.width  = cw + 'px';
    canvas.style.height = ch + 'px';
    canvas.width  = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
  }

  function update() {
    const n = names();
    Capture.grid = null;
    if (taps.length === 4) {
      try {
        Capture.grid = PhotoGrid.homography({ [n[0]]: taps[0], [n[1]]: taps[1], [n[2]]: taps[2], [n[3]]: taps[3] }, cols());
      } catch { /* degenerate taps: the prompt asks for a Redo */ }
    }
    okBtn.disabled = !Capture.grid;
    prompt.textContent = taps.length < 4 ? `Tap the corner hole ${n[taps.length]} (${taps.length + 1} of 4).`
      : Capture.grid ? 'Check the dots sit on the holes, then press Looks right.'
      : "Those corners don't make a board. Press Redo and tap them again.";
    draw();
  }

  function draw() {
    const ctx = canvas.getContext('2d');
    const k = canvas.width / img.naturalWidth;            // photo px → canvas px
    const d = canvas.width / parseFloat(canvas.style.width);   // CSS px → canvas px
    const at = p => [p[0] * k, p[1] * k];
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.font = `600 ${11 * d}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (Capture.grid) drawGrid(ctx, Capture.grid, at, d);
    const n = names();
    taps.forEach((p, i) => {
      const [x, y] = at(p);
      ctx.beginPath();
      ctx.arc(x, y, 5 * d, 0, 2 * Math.PI);
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.lineWidth = 1.5 * d;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      label(ctx, n[i], x + 14 * d, y - 12 * d, d);
    });
  }

  function label(ctx, text, x, y, d) {
    ctx.lineWidth = 3 * d;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x, y);
  }

  // A dot on every body hole, the row letters at both ends, column 1 and
  // every 5th column number beyond the top row.
  function drawGrid(ctx, g, at, d) {
    const spot = q => at(g.toPhoto(q));
    ctx.fillStyle = '#22d3ee';
    for (const r of 'abcdefghij') {
      for (let c = 1; c <= g.cols; c++) {
        const [x, y] = spot(g.holeCentre(r + c));
        ctx.fillRect(x - 1.5 * d, y - 1.5 * d, 3 * d, 3 * d);
      }
    }
    const right = g.x0 + g.pitch * (g.cols - 1);
    for (const r of 'abcdefghij') {
      const y = g.holeCentre(r + 1)[1];
      label(ctx, r, ...spot([g.x0 - 1.3 * g.pitch, y]), d);
      label(ctx, r, ...spot([right + 1.3 * g.pitch, y]), d);
    }
    for (let c = 1; c <= g.cols; c++) {
      if (c !== 1 && c % 5) continue;
      label(ctx, String(c), ...spot([g.x0 + g.pitch * (c - 1), g.y0 - 1.3 * g.pitch]), d);
    }
  }

  canvas.addEventListener('click', e => {
    if (!img || taps.length >= 4) return;
    const r = canvas.getBoundingClientRect();
    taps.push([(e.clientX - r.left) * img.naturalWidth / r.width, (e.clientY - r.top) * img.naturalHeight / r.height]);
    update();
  });

  // ── Send ───────────────────────────────────────────────────

  // The original resized to ≤ MAX_SIDE: its pixels, and H scaled to them
  // (flattened → resized photo). flatten() and the crops both warp from it.
  function downsize(im, grid) {
    const s   = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
    const src = document.createElement('canvas');
    src.width  = Math.round(im.naturalWidth * s);
    src.height = Math.round(im.naturalHeight * s);
    const sctx = src.getContext('2d');
    sctx.drawImage(im, 0, 0, src.width, src.height);
    return { pixels: sctx.getImageData(0, 0, src.width, src.height),
             H: PhotoCrops.scaleH(grid.H, src.width / im.naturalWidth, src.height / im.naturalHeight) };
  }

  // The resized photo warped into the grid's frame: a canvas.
  function flatten(src, grid) {
    const out  = document.createElement('canvas');
    out.width  = grid.width;
    out.height = grid.height;
    const octx = out.getContext('2d');
    octx.putImageData(PhotoGrid.warp(src.pixels, src.H, octx.createImageData(grid.width, grid.height)), 0, 0);
    return out;
  }

  // POST JSON as the request in flight (the next job or close() aborts it),
  // given up after ms. res is null on a network error, abort or timeout.
  async function post(url, body, ms) {
    const ac = ctrl = new AbortController();
    let timedOut = false, res = null, data = null;
    const timer = setTimeout(() => { timedOut = true; ac.abort(); }, ms);
    try {
      res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(body), signal: ac.signal });
      data = await res.json().catch(() => null);
    } catch { /* network error or abort: the caller decides */ }
    clearTimeout(timer);
    return { res, data, timedOut };
  }

  async function send(im, grid, sample) {
    const my = nextJob();
    showStatus(READING, false);
    await paint();                                         // paint the status before the warp
    if (my !== job) return;
    const src  = downsize(im, grid);
    const flat = flatten(src, grid);
    const body = { image: flat.toDataURL('image/jpeg', 0.9),
                   grid: { cols: grid.cols, pitch: grid.pitch, x0: grid.x0, y0: grid.y0, width: grid.width, height: grid.height } };
    if (sample) body.sample = sample;

    corners.hidden = true;                                 // in the same task as the request
    const { res, data, timedOut } = await post('/api/photo', body, Capture.timeoutMs);
    if (my !== job) return;                                // closed or replaced meanwhile
    if (!(res && res.ok && data && data.reading)) return showStatus(timedOut ? AI_TIMEOUT : (data && data.reply) || AI_FAILED, true);

    const reading = await placeLegs(my, data, src, grid);
    if (my !== job) return;                                // Cancel while placing legs drops the round
    Capture.lastReading = reading;
    showStatus('', false);
    PhotoConfirm.open(reading, flat, grid, built);
  }

  // The crop round (#160): one labelled crop per item → /api/photo/leads →
  // the legs merged in. Anything short of an answer keeps the placeholders:
  // a deepseek reading (Gemini failed, #161) gets no round, and any throw
  // (a crop that won't render, a bad answer) returns the Reading as read.
  async function placeLegs(my, reply, src, grid) {
    const { reading, key } = reply;
    if (!key || reply.provider === 'deepseek') return reading;
    try {
      const items = PhotoCrops.items(reading, grid);
      if (!items.length) return reading;
      showStatus(PLACING(items.length), false);
      await paint();                                       // paint the status before the crops
      if (my !== job) return reading;
      const rails = reading.board && reading.board.rails;
      const sent  = items.map(it => {
        const win = PhotoCrops.window(grid, it.box);
        return { id: it.id, kind: it.kind, type: it.type, value: it.value, image: PhotoCrops.render(src.pixels, src.H, grid, win, rails), window: win };
      });
      const { res, data } = await post('/api/photo/leads', { key, items: sent }, Capture.leadsTimeoutMs);
      return res && res.ok && data && Array.isArray(data.items) ? PhotoCrops.merge(reading, data.items) : reading;
    } catch (err) {
      console.warn('Crop round failed; the placeholders stay:', err && err.message);
      return reading;
    }
  }

  // Build it on the confirm screen: { actions, flags, labels, skipped }.
  // The board, the simulation, then Edison answers her question (#143).
  function built(result) {
    const question = $('sparky-input').value.trim() || DEFAULT_Q;
    close();
    SparkyChat.applyBuild(result.actions);                 // may clear the board, and the flags with it
    window.PhotoFlags = new Set(result.flags.map(f => result.labels[f.id]).filter(Boolean));
    App.runSimulation();
    sparkyAsk(question, { context: SparkyChat.photoContext(result) });   // clears the input
  }

  // The flagged parts' labels go with the board they were read for.
  const clearFlags = () => { window.PhotoFlags = new Set(); };
  const _clearAll  = App.clearAll;
  App.clearAll = function (opts) { clearFlags(); return _clearAll.call(this, opts); };

  async function useSample() {
    const my = nextJob();
    open();
    showStatus(READING, false);
    const s  = window.PhotoSamples[SAMPLE];
    const im = await loadImage(s.file).catch(() => null);
    if (my !== job) return;
    if (!im) return showStatus(AI_FAILED, true);
    Capture.grid = PhotoGrid.homography(s.taps, s.cols);
    send(im, Capture.grid, SAMPLE);
  }

  // ── Wiring ─────────────────────────────────────────────────

  $('photo-btn').addEventListener('click', () => { menu.hidden = !menu.hidden; });
  document.addEventListener('click', e => {
    if (!menu.hidden && !$('photo-wrap').contains(e.target)) menu.hidden = true;
  });
  $('photo-choose').addEventListener('click', () => {
    menu.hidden = true;
    fileIn.value = '';
    fileIn.click();
  });
  fileIn.addEventListener('change', () => { if (fileIn.files[0]) startPhoto(fileIn.files[0]); });
  $('photo-sample').addEventListener('click', useSample);
  errBtn.addEventListener('click', useSample);
  $('photo-redo').addEventListener('click', () => { taps = []; update(); });
  okBtn.addEventListener('click', () => { if (Capture.grid) send(img, Capture.grid, null); });
  colsEl.addEventListener('change', () => { if (img) update(); });
  $('photo-cancel').addEventListener('click', close);

  // A photo dropped on the chat does the same as Choose photo.
  const panel    = $('sparky-panel');
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  panel.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  panel.addEventListener('drop', e => {
    if (!hasFiles(e) || !e.dataTransfer.files[0]) return;
    e.preventDefault();
    startPhoto(e.dataTransfer.files[0]);
  });

  window.addEventListener('keydown', e => {
    if (!isOpen()) return;
    e.stopPropagation();
    if (e.key === 'Escape' && !PhotoConfirm.cancelMove()) close();
  }, true);

})();
