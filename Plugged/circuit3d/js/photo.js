// ─────────────────────────────────────────────────────────────
//  photo.js — 📷 capture (issue #140): choose, drop or sample a photo,
//  tap the board's 4 corner holes, flatten it, send it to /api/photo.
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
//    → the Reading (logged until the confirm screen, #141), or the reply's
//      friendly text with Use sample photo.
//  While the overlay is open, keydown stops at the window (capture
//  phase), so Backspace and Ctrl+Z never reach the board.
//
//  EXPORTS
//  ───────
//  Browser: window.PhotoCapture = { timeoutMs, grid, lastReading }
// ─────────────────────────────────────────────────────────────

(function () {

  const PHOTO_PAGE_TIMEOUT_MS = 60000;   // above the server's 45 s PHOTO_TIMEOUT_MS
  const MAX_SIDE  = 3000;                // the original is resized to this before flattening
  const SAMPLE    = 'demo-board';
  const READING   = 'Reading your board…';
  // docs/API-CONTRACT.md → "POST /api/photo" → Errors
  const BAD_IMAGE  = "I can't read that file. Try a JPEG or PNG photo, or use the sample photo.";
  const AI_FAILED  = "I couldn't read the photo just now. Try again, or use the sample photo.";
  const AI_TIMEOUT = 'Reading the photo took too long. Try again, or use the sample photo.';

  // grid: the PhotoGrid grid of the current 4 taps (null until then).
  const Capture = window.PhotoCapture = { timeoutMs: PHOTO_PAGE_TIMEOUT_MS, grid: null, lastReading: null };

  const $ = id => document.getElementById(id);
  const modal   = $('photo-modal'),   menu   = $('photo-menu'),   fileIn = $('photo-file');
  const corners = $('photo-corners'), prompt = $('photo-prompt'), canvas = $('photo-canvas');
  const colsEl  = $('photo-cols'),    okBtn  = $('photo-ok'),     status = $('photo-status');
  const errBtn  = $('photo-error-sample');

  let img  = null;   // the photo being tapped
  let taps = [];     // its tapped corners, photo pixels, in corner order
  let job  = 0;      // bumped by every open, send and close: a stale reply is dropped
  let ctrl = null;   // the request in flight

  const cols    = () => Number(colsEl.value);
  const names   = () => ['a1', 'a' + cols(), 'j' + cols(), 'j1'];
  const isOpen  = () => modal.style.display !== 'none';
  const nextJob = () => { job++; if (ctrl) ctrl.abort(); return job; };

  function open() {
    menu.hidden = true;
    corners.hidden = true;
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

  // The original resized to ≤ MAX_SIDE, warped into the grid's frame, as a JPEG data URL.
  function flatten(im, grid) {
    const s   = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
    const src = document.createElement('canvas');
    src.width  = Math.round(im.naturalWidth * s);
    src.height = Math.round(im.naturalHeight * s);
    const sctx = src.getContext('2d');
    sctx.drawImage(im, 0, 0, src.width, src.height);
    const sx = src.width / im.naturalWidth, sy = src.height / im.naturalHeight;
    const H  = [grid.H[0].map(q => q * sx), grid.H[1].map(q => q * sy), grid.H[2]];   // flattened → resized photo
    const out  = document.createElement('canvas');
    out.width  = grid.width;
    out.height = grid.height;
    const octx = out.getContext('2d');
    const flat = PhotoGrid.warp(sctx.getImageData(0, 0, src.width, src.height), H, octx.createImageData(grid.width, grid.height));
    octx.putImageData(flat, 0, 0);
    return out.toDataURL('image/jpeg', 0.9);
  }

  async function send(im, grid, sample) {
    const my = nextJob();
    showStatus(READING, false);
    await new Promise(r => requestAnimationFrame(() => setTimeout(r)));   // paint the status before the warp
    if (my !== job) return;
    const body = { image: flatten(im, grid),
                   grid: { cols: grid.cols, pitch: grid.pitch, x0: grid.x0, y0: grid.y0, width: grid.width, height: grid.height } };
    if (sample) body.sample = sample;

    corners.hidden = true;                                 // in the same task as the request
    const ac = ctrl = new AbortController();
    let timedOut = false, res = null, data = null;
    const timer = setTimeout(() => { timedOut = true; ac.abort(); }, Capture.timeoutMs);
    try {
      res  = await fetch('/api/photo', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                         body: JSON.stringify(body), signal: ac.signal });
      data = await res.json().catch(() => null);
    } catch { /* network error or abort: handled below */ }
    clearTimeout(timer);
    if (my !== job) return;                                // closed or replaced meanwhile

    if (res && res.ok && data && data.reading) {
      Capture.lastReading = data.reading;
      console.log('[photo] reading', data);                // until the confirm screen (#141)
      return close();
    }
    showStatus(timedOut ? AI_TIMEOUT : (data && data.reply) || AI_FAILED, true);
  }

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
    if (e.key === 'Escape') close();
  }, true);

})();
