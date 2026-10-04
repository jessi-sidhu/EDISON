// ─────────────────────────────────────────────────────────────
//  photo-crops.js — the crop round (#160): a zoomed, labelled crop of
//  every resistor, LED and wire still 'leads' unsure, for
//  POST /api/photo/leads, and its answers merged into the Reading.
//  Pure except render() (browser only: a canvas). Contract:
//  docs/API-CONTRACT.md → "POST /api/photo/leads", "Reading v1".
//
//  THE CROP
//  ────────
//    window(grid, box): the box plus a margin, clamped to the flattened
//    image (the "area"), drawn at `scale` px per flattened px, with a
//    white label margin of padLeft / padTop on every side. Crop pixel
//    (u, v) is flattened (x + (u − padLeft)/scale, y + (v − padTop)/scale).
//    matrix(H, win) takes an INNER crop pixel (the area, no margin) to the
//    photo pixel, for PhotoGrid.warp.
//
//  items(reading, grid) (#161) leaves out a box wholly off the flattened
//  image, or one whose crop has under 1 px of photo either way (render
//  can't draw it), and returns at most MAX_ITEMS (/api/photo/leads' cap).
//
//  EXPORTS
//  ───────
//  Browser: window.PhotoCrops = { items, MAX_ITEMS, window, scaleH, matrix, merge, render }
//  Node:    module.exports (render needs a DOM)
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const PhotoCrops = factory();
  if (typeof module === 'object' && module.exports) module.exports = PhotoCrops;
  if (root) root.PhotoCrops = PhotoCrops;
})(typeof window !== 'undefined' ? window : null, function () {

  const MAX_PIXELS = 2000000;   // a crop is at most 2 MP
  const SCALE      = 3;         // 90 px a pitch, lowered in 0.05 steps to fit
  const MARGIN     = 1.5;       // pitches of photo round the box, at least
  const MARGIN_K   = 0.15;      // or 15% of the box's size, whichever is more
  const PAD        = 0.9;       // label margin, pitches
  const FONT       = 0.45;      // label size, pitches
  const RAILS      = ['aOuter', 'aInner', 'jInner', 'jOuter'];
  const MAX_ITEMS  = 24;        // /api/photo/leads takes 1 to 24 items

  const isBox = b => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[2] > b[0] && b[3] > b[1];
  const leadsUnsure = e => Array.isArray(e.unsure) && e.unsure.includes('leads');
  const cropped = e => isBox(e.box) && leadsUnsure(e);

  // The box touches the flattened image and its crop has ≥ 1 px of photo
  // each way (render's createImageData throws on 0).
  function drawable(grid, b) {
    if (b[0] >= grid.width || b[2] <= 0 || b[1] >= grid.height || b[3] <= 0) return false;
    const w = cropWindow(grid, b);
    return w.width - 2 * w.padLeft >= 1 && w.height - 2 * w.padTop >= 1;
  }

  // Resistors and LEDs, then wires, with a box on the image and 'leads'
  // unsure; the first MAX_ITEMS of them.
  function items(reading, grid) {
    const ok = e => cropped(e) && drawable(grid, e.box);
    const parts = (reading.parts || []).filter(p => (p.type === 'resistor' || p.type === 'led') && ok(p))
      .map(p => ({ id: p.id, kind: 'part', type: p.type, value: p.type === 'resistor' && Number.isFinite(p.value) ? p.value : 0, box: p.box.slice() }));
    const wires = (reading.wires || []).filter(ok)
      .map(w => ({ id: w.id, kind: 'wire', type: 'wire', value: 0, box: w.box.slice() }));
    return [...parts, ...wires].slice(0, MAX_ITEMS);
  }

  function cropWindow(grid, box) {
    const p  = grid.pitch;
    const mx = Math.max(MARGIN * p, MARGIN_K * (box[2] - box[0]));
    const my = Math.max(MARGIN * p, MARGIN_K * (box[3] - box[1]));
    const x  = Math.max(0, box[0] - mx), y = Math.max(0, box[1] - my);
    const aw = Math.min(grid.width, box[2] + mx) - x, ah = Math.min(grid.height, box[3] + my) - y;
    const size = s => {
      const pad = Math.round(PAD * p * s);
      return { pad, width: Math.round(aw * s) + 2 * pad, height: Math.round(ah * s) + 2 * pad };
    };
    let k = SCALE * 100;   // hundredths, so the scale stays a round number
    for (let z = size(k / 100); k > 5 && z.width * z.height > MAX_PIXELS; z = size(k / 100)) k -= 5;
    const scale = k / 100, z = size(scale);
    return { x, y, scale, padLeft: z.pad, padTop: z.pad, width: z.width, height: z.height };
  }

  // H (flattened → photo) for the photo resized by (sx, sy).
  function scaleH(H, sx, sy) {
    return [H[0].map(q => q * sx), H[1].map(q => q * sy), H[2].slice()];
  }

  // H · [[1/s, 0, x], [0, 1/s, y], [0, 0, 1]]: inner crop pixel → photo pixel.
  function matrix(H, win) {
    const k = 1 / win.scale;
    return H.map(r => [r[0] * k, r[1] * k, r[0] * win.x + r[1] * win.y + r[2]]);
  }

  // The answers into a new Reading: 2 legs set the points (hole '?' for
  // the confirm screen to snap), found false drops the item, anything
  // else keeps its placeholders and its 'leads' flag.
  function merge(reading, results) {
    const out = JSON.parse(JSON.stringify(reading));
    const by  = new Map((results || []).filter(r => r && r.id).map(r => [r.id, r]));
    const keep = e => !(by.has(e.id) && by.get(e.id).found === false);
    const place = (e, ends, isPart) => {
      const r = by.get(e.id);
      if (!r || r.found !== true || !Array.isArray(r.leads) || r.leads.length !== 2 || !Array.isArray(ends) || ends.length !== 2) return;
      r.leads.forEach((leg, i) => {
        const pt = leg && leg.pt;
        if (Array.isArray(pt) && pt.length === 2 && pt.every(Number.isFinite)) Object.assign(ends[i], { hole: '?', pt: pt.slice() });
        else ends[i].hole = 'off';
        if (isPart && leg && (leg.role === 'anode' || leg.role === 'cathode')) ends[i].role = leg.role;
      });
      if (Array.isArray(e.unsure)) e.unsure = e.unsure.filter(w => w !== 'leads');
    };
    out.parts = out.parts.filter(keep);
    out.wires = out.wires.filter(keep);
    for (const p of out.parts) place(p, p.leads, true);
    for (const w of out.wires) place(w, w.ends, false);
    return out;
  }

  // ── Render (browser only) ──────────────────────────────────

  // The labelled crop as a JPEG data URL. source: the photo's pixels
  // (ImageData-like); H: flattened → those pixels; rails: board.rails.
  function render(source, H, grid, win, rails) {
    const { scale, padLeft: pl, padTop: pt, width: W, height: Ht } = win;
    const iw = W - 2 * pl, ih = Ht - 2 * pt;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = Ht;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, Ht);
    ctx.putImageData(PhotoGrid.warp(source, matrix(H, win), ctx.createImageData(iw, ih)), pl, pt);

    const u = fx => pl + (fx - win.x) * scale, v = fy => pt + (fy - win.y) * scale;
    const inX = q => q >= pl && q <= W - pl, inY = q => q >= pt && q <= Ht - pt;
    const text = (s, x, y, colour) => { ctx.fillStyle = colour; ctx.fillText(s, x, y); };
    ctx.font = `700 ${Math.round(FONT * grid.pitch * scale)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let c = 1; c <= grid.cols; c++) {
      const x = u(grid.holeCentre('a' + c)[0]);
      if (inX(x)) { text(String(c), x, pt / 2, '#111'); text(String(c), x, Ht - pt / 2, '#111'); }
    }
    const row = (s, fy, colour) => {
      const y = v(fy);
      if (inY(y)) { text(s, pl / 2, y, colour); text(s, W - pl / 2, y, colour); }
    };
    for (const r of 'abcdefghij') row(r, grid.holeCentre(r + '1')[1], '#111');
    for (const name of RAILS) {
      const sign = rails && rails[name];
      if (sign === '+') row('+', grid.holeCentre(`rail:${name}:1`)[1], '#dc2626');
      if (sign === '-') row('−', grid.holeCentre(`rail:${name}:1`)[1], '#2563eb');
    }
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  return { items, MAX_ITEMS, window: cropWindow, scaleH, matrix, merge, render };
});
