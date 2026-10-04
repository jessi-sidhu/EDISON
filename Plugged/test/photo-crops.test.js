// Tests for circuit3d/js/photo-crops.js (issue #160, Photo crops 2/2): which
// parts and wires get a crop, each crop's window, the matrix that renders it
// straight from the photo, and merging /api/photo/leads' answers into the
// Reading. The contract is docs/API-CONTRACT.md → "POST /api/photo/leads"
// and "Reading v1".
//
// THE API THE BUILDER MATCHES (a UMD module like photo-grid.js:
// window.PhotoCrops in the browser, module.exports in Node; pure, no DOM)
//
//   items(reading, grid) → [{ id, kind, type, value, box }]
//       Parts of type 'resistor' or 'led', then wires, in the Reading's order,
//       that have a box of 4 finite numbers [x0, y0, x1, y1] with x1 > x0 and
//       y1 > y0 AND 'leads' in their `unsure`. kind 'part' | 'wire'; type
//       'resistor' | 'led' | 'wire'; value the part's `value` (ohms) for a
//       resistor, 0 otherwise. A part of type 'other' never appears (the
//       contract: the page crops only resistors, LEDs and wires).
//       grid (#161): the PhotoGrid grid the boxes are on (photo.js passes
//       PhotoCapture.grid); only its width, height and pitch are read. An
//       item is left out (it keeps its placeholders) when its box lies
//       wholly off the flattened image [0, grid.width] × [0, grid.height]
//       (x0 ≥ width, x1 ≤ 0, y0 ≥ height or y1 ≤ 0), or when its crop's
//       photo area, window(grid, box) without the label margins
//       (width − 2·padLeft, height − 2·padTop), is under 1 px either way:
//       render() can't draw a 0-px area (createImageData throws, #161).
//       A box partly on the image is still cropped (window() clamps it).
//       At most MAX_ITEMS: the first MAX_ITEMS of the above, in that order;
//       an item left out never takes a slot.
//
//   MAX_ITEMS = 24 (#161): /api/photo/leads refuses more ("1 to 24",
//       docs/API-CONTRACT.md → BAD_ITEMS). The cap lives in items(), so the
//       page sends items() as it is.
//
//   window(grid, box) → { x, y, scale, padLeft, padTop, width, height }
//       The box plus a margin of max(1.5·grid.pitch, 0.15·box width) left and
//       right, max(1.5·grid.pitch, 0.15·box height) top and bottom, clamped
//       to [0, grid.width] × [0, grid.height] (the "area", aw × ah).
//       x, y      the area's top-left, flattened px.
//       scale     3 (90 px a pitch), lowered until width·height ≤ 2,000,000.
//                 (These tests only ask it to stay at ≥ 80% of the largest
//                 scale that fits, so the step size is the builder's.)
//       padLeft = padTop = round(0.9 · grid.pitch · scale), the same pad on
//                 the right and bottom (the label margins).
//       width   = round(aw · scale) + 2·padLeft
//       height  = round(ah · scale) + 2·padTop   (the whole labelled image)
//       So the contract's mapping holds: crop pixel (u, v) ↔ flattened
//       (x + (u − padLeft)/scale, y + (v − padTop)/scale).
//
//   scaleH(H, sx, sy) → a new 3×3 (nested rows): H's rows 0 and 1 times sx
//       and sy, row 2 as is; H itself unchanged. What flatten() in photo.js
//       did inline (flattened → the downsized photo); photo.js uses it.
//
//   matrix(H, win) → a 3×3 (nested rows, ready for PhotoGrid.warp) taking an
//       INNER crop pixel (u, v), the photo area without the padding, to the
//       photo pixel: applyH(matrix, u, v) = applyH(H, win.x + u/scale,
//       win.y + v/scale) for any (u, v). The page warps the inner area with it
//       and draws that at (padLeft, padTop) on a white canvas.
//
//   merge(reading, results) → a NEW Reading; `reading` is not mutated.
//       results: the /api/photo/leads response's `items`. For each
//       { id, found: true, leads: [2 entries] } its part's leads (or wire's
//       ends), in order, take each returned { pin, pt, role }:
//         pt [x, y]  → pt = that point, hole '?' (the confirm screen snaps it)
//         pt null    → hole 'off', the old pt kept
//         role       'anode' / 'cathode' → that role; anything else → the
//                    lead's role unchanged (a wire end gets no role)
//       and 'leads' leaves that item's `unsure` (its other words stay).
//       { id, found: false } → that part or wire is dropped.
//       { id, error }, found true with fewer or more than 2 leads, or an id
//       the Reading lacks → nothing changes for it ('leads' stays in unsure).
//
//   render(source, H, grid, win, rails) is browser-only: e2e/photo-crops.spec.js.
//
// Expected numbers are worked out by hand from the rules above on a
// 63-column grid (2040 × 710, pitch 30) unless a test says otherwise.
// The #160 items() tests pass that grid too (#161 added the argument);
// every box in them lies well inside it, so their answers are unchanged.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const FILE      = path.join(__dirname, '..', 'circuit3d', 'js', 'photo-crops.js');
const PhotoGrid = require('../circuit3d/js/photo-grid.js');
const PHOTOS    = require('./fixtures/photo/web/photos.json');

// Loaded inside each test, so a missing file fails the test that needs it.
function load() {
  assert.ok(fs.existsSync(FILE), 'circuit3d/js/photo-crops.js does not exist yet');
  return require(FILE);
}

const MAX_PIXELS = 2000000;

// ── Helpers (test-side maths only) ────────────────────────────

function applyH(H, x, y) {
  const w = H[2][0] * x + H[2][1] * y + H[2][2];
  return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w];
}

function near(actual, expected, tol, msg) {
  const d = Math.hypot(actual[0] - expected[0], actual[1] - expected[1]);
  assert.ok(d <= tol, `${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)} (off by ${d})`);
}

function isMatrix(M) {
  return Array.isArray(M) && M.length === 3 && M.every(r => Array.isArray(r) && r.length === 3 && r.every(Number.isFinite));
}

const clone = o => JSON.parse(JSON.stringify(o));

// The four corner taps when the photo IS the flattened image (a on top).
const A_TOP = { a1: [90, 190], a63: [1950, 190], j63: [1950, 520], j1: [90, 520] };
const grid63 = () => PhotoGrid.homography(A_TOP);

// A real perspective photo (p3_bjornr, 30 columns, from photos.json).
const realGrid = () => PhotoGrid.homography(PHOTOS.p3_bjornr.taps, PHOTOS.p3_bjornr.ncols);

// ── A box-round Reading, as boxesToReading leaves it ──────────
// Placeholder legs at the midpoints of the box's short edges, hole '?',
// role 'unknown', 'leads' in unsure (backend/photo-reader.js).

function part(id, type, value, box, extra = {}) {
  const [x0, y0, x1, y1] = box;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const ends = x1 - x0 >= y1 - y0 ? [[x0, my], [x1, my]] : [[mx, y0], [mx, y1]];
  return Object.assign({
    id, type, what: type, value, bands: [], color: '',
    leads: ends.map(pt => ({ hole: '?', pt, role: 'unknown' })),
    box, confidence: 0.8, unsure: ['leads'],
  }, extra);
}

function wire(id, box, extra = {}) {
  const [x0, y0, x1, y1] = box;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const ends = x1 - x0 >= y1 - y0 ? [[x0, my], [x1, my]] : [[mx, y0], [mx, y1]];
  return Object.assign({ id, color: '', ends: ends.map(pt => ({ hole: '?', pt })), box, confidence: 0.9, unsure: ['leads'] }, extra);
}

function boxRound() {
  return {
    board: { visible: true, cols: 63, rails: { aOuter: '+', aInner: '-', jInner: '+', jOuter: '-' }, split: false },
    parts: [
      part('R1', 'resistor', 470, [345, 178, 495, 202], { unsure: ['leads', 'value'] }),
      part('LED1', 'led', 0, [1245, 238, 1335, 262]),
      part('X1', 'other', 0, [1545, 298, 1665, 412]),
      part('R2', 'resistor', 1000, [645, 418, 795, 442]),
    ],
    wires: [
      wire('W1', [495, 61, 675, 292]),
      wire('W2', [900, 400, 1100, 430]),
    ],
    power: [],
  };
}

// ── items() ───────────────────────────────────────────────────

test('items: every resistor, LED and wire with a box and \'leads\' unsure, parts then wires in Reading order; never an other part', () => {
  const PC = load();
  const reading = {
    board: { visible: true, cols: 63, rails: { aOuter: '?', aInner: '?', jInner: '?', jOuter: '?' }, split: false },
    parts: [
      part('LED1', 'led', 2, [1245, 238, 1335, 262]),                     // a stray LED value is still sent as 0
      part('X1', 'other', 0, [1545, 298, 1665, 412]),                     // an IC: never built in Tier 1, never cropped
      part('R1', 'resistor', 470, [345, 178, 495, 202], { unsure: ['value', 'leads'] }),
      part('R2', 'resistor', 0, [645, 418, 795, 442]),                    // value unread: 0
      part('R3', 'resistor', 220, [100, 100, 200, 120], { unsure: [] }),  // real legs (a saved reading): no crop
      part('R4', 'resistor', 470, [], { leads: [{ hole: '?', pt: [0, 0], role: 'unknown' }, { hole: '?', pt: [9, 9], role: 'unknown' }] }),
    ],
    wires: [
      wire('W1', [495, 61, 675, 292]),
      wire('W2', [900, 400, 1100, 430], { unsure: ['color'] }),            // no 'leads' flag
      wire('W3', [700, 100, 760, 600]),
    ],
    power: [],
  };
  assert.deepStrictEqual(PC.items(reading, grid63()), [
    { id: 'LED1', kind: 'part', type: 'led',      value: 0,   box: [1245, 238, 1335, 262] },
    { id: 'R1',   kind: 'part', type: 'resistor', value: 470, box: [345, 178, 495, 202] },
    { id: 'R2',   kind: 'part', type: 'resistor', value: 0,   box: [645, 418, 795, 442] },
    { id: 'W1',   kind: 'wire', type: 'wire',     value: 0,   box: [495, 61, 675, 292] },
    { id: 'W3',   kind: 'wire', type: 'wire',     value: 0,   box: [700, 100, 760, 600] },
  ]);
});

test('items: a box that isn\'t 4 finite numbers with x1 > x0 and y1 > y0 is never cropped', () => {
  const PC = load();
  const bad = [
    [],                         // a wire with no box (#159), or a part with none
    [0, 0, 0, 0],               // a part she added on the confirm screen
    [345, 178, 495],            // 3 numbers
    [345, 178, 495, 202, 9],    // 5 numbers
    [495, 178, 345, 202],       // x1 < x0
    [345, 202, 495, 178],       // y1 < y0
    [345, 178, 345, 202],       // zero width
    [345, NaN, 495, 202],
    ['345', '178', '495', '202'],
    null,
  ];
  for (const box of bad) {
    const r = boxRound();
    r.parts = [Object.assign(part('R1', 'resistor', 470, [345, 178, 495, 202]), { box })];
    r.wires = [Object.assign(wire('W1', [495, 61, 675, 292]), { box })];
    assert.deepStrictEqual(PC.items(r, grid63()), [], `box ${JSON.stringify(box)} gives no crop`);
  }
  // Pin: the shared fixture gives exactly its resistors, LED and wires.
  assert.deepStrictEqual(PC.items(boxRound(), grid63()).map(i => i.id), ['R1', 'LED1', 'R2', 'W1', 'W2']);
});

test('items: the demo board\'s saved reading (real holes, nothing unsure) needs no crop round', () => {
  const demo = require('./fixtures/photo/demo-board.json').reading;
  assert.deepStrictEqual(load().items(demo, grid63()), []);
});

// ── items(), issue #161: never a crop render() can't draw, at most 24 ──

// The inner (photo) area of a crop, crop px: the window without its label margins.
const innerOf = w => [w.width - 2 * w.padLeft, w.height - 2 * w.padTop];

test('items (#161): a box wholly off the flattened image, or whose crop would have a photo area under 1 px, is never cropped; a box partly on the image still is', () => {
  const PC = load(), g = grid63();   // 2040 × 710, pitch 30: a small box's margin is 45 px
  const off = [
    // [what, box]
    ['wholly right, far',                                      [2240, 300, 2300, 330]],
    ['wholly right, its 45 px margin reaching back on (2005–2040)', [2050, 300, 2080, 330]],
    ['wholly right, its photo area 0.1 px wide: 0 crop px (the stall)', [2084.9, 300, 2114.9, 330]],
    ['wholly left',                                            [-120, 300, -60, 330]],
    ['wholly above (y1 < 0), its margin reaching back on (0–35)', [500, -60, 600, -10]],
    ['wholly below, its photo area 0.1 px tall: 0 crop px (the stall)', [500, 754.9, 600, 780]],
    ['wholly above and left of the image',                     [-300, -200, -250, -150]],
  ];
  // The two stall boxes really do give a crop render() can't draw.
  for (const [what, box] of off.filter(([w]) => /the stall/.test(w))) {
    const [iw, ih] = innerOf(PC.window(g, box));
    assert.ok(iw < 1 || ih < 1, `${what}: window() leaves ${iw} × ${ih} crop px of photo`);
  }
  const reading = box => {
    const r = boxRound();
    r.parts = [r.parts[0], part('R9', 'resistor', 220, box), part('LED9', 'led', 0, box)];
    r.wires = [wire('W9', box)];
    return r;
  };
  for (const [what, box] of off) {
    assert.deepStrictEqual(PC.items(reading(box), g).map(i => i.id), ['R1'],
      `${what} ${JSON.stringify(box)}: R9, LED9 and W9 keep their placeholders, only R1 is cropped`);
  }

  // Pins: a box that crosses the edge is cropped (window() clamps its area).
  const partly = [
    ['across the right edge',               [2000, 300, 2100, 330]],
    ['across the left edge',                [-10, 300, 20, 330]],
    ['across the top edge',                 [500, -20, 600, 30]],
    ['across the bottom-right corner',      [2030, 700, 2060, 730]],
  ];
  for (const [what, box] of partly) {
    assert.deepStrictEqual(PC.items(reading(box), g).map(i => i.id), ['R1', 'R9', 'LED9', 'W9'], `${what} ${JSON.stringify(box)}: cropped`);
  }
});

test('items (#161): at most MAX_ITEMS (24, the contract\'s cap): 30 eligible give the first 24, parts then wires; an item left out never takes a slot', () => {
  const PC = load(), g = grid63();
  // 16 resistors, 4 LEDs and 10 wires, every one boxed on the image with 'leads' unsure.
  const parts = [], wires = [];
  for (let k = 0; k < 16; k++) parts.push(part(`R${k + 1}`, 'resistor', 100 * (k + 1), [60 + 110 * k, 418, 150 + 110 * k, 442]));
  for (let k = 0; k < 4; k++)  parts.push(part(`LED${k + 1}`, 'led', 0, [200 + 300 * k, 238, 260 + 300 * k, 262]));
  for (let k = 0; k < 10; k++) wires.push(wire(`W${k + 1}`, [100 + 190 * k, 300, 160 + 190 * k, 600]));
  const ids    = [...parts, ...wires].map(e => e.id);
  const of     = (p, w) => Object.assign(boxRound(), { parts: p, wires: w });

  const got = PC.items(of(parts, wires), g).map(i => i.id);
  assert.deepStrictEqual(got, ids.slice(0, 24), `30 eligible: the first 24 (every part, then W1–W4); W5–W10 keep their placeholders. Got ${got.length}`);
  assert.strictEqual(PC.MAX_ITEMS, 24, 'PhotoCrops.MAX_ITEMS is /api/photo/leads\' "1 to 24"');
  assert.deepStrictEqual(PC.items(of(parts, wires.slice(0, 4)), g).map(i => i.id), ids.slice(0, 24), 'exactly 24: all of them');
  assert.deepStrictEqual(PC.items(of(parts, wires.slice(0, 5)), g).map(i => i.id), ids.slice(0, 24), '25: the first 24');

  // An IC and an off-image resistor early in the Reading are left out, so
  // they don't push W3 and W4 out of the 24.
  const mixed = [...parts.slice(0, 2), part('X1', 'other', 0, [1545, 298, 1665, 412]),
                 ...parts.slice(2, 5), part('R99', 'resistor', 470, [2240, 300, 2300, 330]), ...parts.slice(5)];
  assert.deepStrictEqual(PC.items(of(mixed, wires), g).map(i => i.id), ids.slice(0, 24),
    'the IC and the off-image R99 take no slot: still every boxed resistor and LED, then W1–W4');
});

// ── window() ──────────────────────────────────────────────────

test('window: a short resistor gets the 1.5-pitch margin (45 px) all round, at scale 3 with an 81 px label pad', () => {
  // box 150 × 24: 15% is 22.5 and 3.6, so 45 wins both ways.
  // area x 300–540 (240), y 193–307 (114); pad round(27·3) = 81;
  // 240·3 + 162 = 882, 114·3 + 162 = 504.
  assert.deepStrictEqual(load().window(grid63(), [345, 238, 495, 262]),
    { x: 300, y: 193, scale: 3, padLeft: 81, padTop: 81, width: 882, height: 504 });
});

test('window: 15% of the box wins over 1.5 pitches when the box is long, each way on its own', () => {
  const PC = load(), g = grid63();
  // 400 wide: 15% = 60 left and right; 100 tall: 45 top and bottom.
  // area x 540–1060 (520), y 155–345 (190): 1560 + 162 = 1722, 570 + 162 = 732.
  assert.deepStrictEqual(PC.window(g, [600, 200, 1000, 300]),
    { x: 540, y: 155, scale: 3, padLeft: 81, padTop: 81, width: 1722, height: 732 });
  // A vertical wire 60 × 500: 45 left and right, 15% = 75 top and bottom.
  // area x 655–805 (150), y 25–675 (650): 450 + 162 = 612, 1950 + 162 = 2112.
  assert.deepStrictEqual(PC.window(g, [700, 100, 760, 600]),
    { x: 655, y: 25, scale: 3, padLeft: 81, padTop: 81, width: 612, height: 2112 });
});

test('window: the area is clamped at each board edge (left, top, right, bottom, a corner, a 30-column board)', () => {
  const PC = load();
  const g30 = PhotoGrid.homography({ a1: [90, 190], a30: [960, 190], j30: [960, 520], j1: [90, 520] }, 30);
  const cases = [
    // [what, grid, box, expected]
    ['left: x 20 − 45 → 0',              grid63(), [20, 240, 120, 260],
      { x: 0,    y: 195, scale: 3, padLeft: 81, padTop: 81, width: 165 * 3 + 162, height: 110 * 3 + 162 }],
    ['top: y 10 − 45 → 0',               grid63(), [500, 10, 560, 80],
      { x: 455,  y: 0,   scale: 3, padLeft: 81, padTop: 81, width: 150 * 3 + 162, height: 125 * 3 + 162 }],
    ['right: 2030 + 45 → 2040',          grid63(), [1980, 300, 2030, 330],
      { x: 1935, y: 255, scale: 3, padLeft: 81, padTop: 81, width: 105 * 3 + 162, height: 120 * 3 + 162 }],
    ['bottom: 700 + 45 → 710',           grid63(), [800, 650, 900, 700],
      { x: 755,  y: 605, scale: 3, padLeft: 81, padTop: 81, width: 190 * 3 + 162, height: 105 * 3 + 162 }],
    ['bottom-right corner: both clamp',  grid63(), [1990, 670, 2035, 705],
      { x: 1945, y: 625, scale: 3, padLeft: 81, padTop: 81, width: 95 * 3 + 162,  height: 85 * 3 + 162 }],
    ['top-left corner: both clamp',      grid63(), [5, 5, 50, 30],
      { x: 0,    y: 0,   scale: 3, padLeft: 81, padTop: 81, width: 95 * 3 + 162,  height: 75 * 3 + 162 }],
    ['right of a 30-column board: 1050', g30,      [1000, 450, 1040, 470],
      { x: 955,  y: 405, scale: 3, padLeft: 81, padTop: 81, width: 95 * 3 + 162,  height: 110 * 3 + 162 }],
  ];
  for (const [what, g, box, want] of cases) assert.deepStrictEqual(PC.window(g, box), want, what);
});

// The largest scale ≤ 3 whose labelled crop fits in 2 MP, by the window rules.
function largestFit(aw, ah, pitch) {
  const pixels = s => {
    const pad = Math.round(0.9 * pitch * s);
    return (Math.round(aw * s) + 2 * pad) * (Math.round(ah * s) + 2 * pad);
  };
  if (pixels(3) <= MAX_PIXELS) return 3;
  let lo = 0, hi = 3;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (pixels(m) <= MAX_PIXELS) lo = m; else hi = m; }
  return lo;
}

test('window: a long wire across the board would be 7.2 MP at scale 3, so scale is lowered to fit 2 MP (and no further than needed)', () => {
  const PC = load(), g = grid63();
  // box 1800 × 240: 15% = 270 left and right (clamped to 0 and 2040), 45 top
  // and bottom: area 0–2040 × 15–345 (2040 × 330). At 3: 6282 × 1152.
  const cases = [
    ['a long wire', [100, 60, 1900, 300], { x: 0, y: 15, aw: 2040, ah: 330 }],
    ['the whole board', [0, 0, 2040, 710], { x: 0, y: 0, aw: 2040, ah: 710 }],
  ];
  for (const [what, box, area] of cases) {
    const w = PC.window(g, box);
    assert.equal(w.x, area.x, `${what}: x`);
    assert.equal(w.y, area.y, `${what}: y`);
    assert.ok(w.scale > 0 && w.scale < 3, `${what}: scale is lowered from 3, got ${w.scale}`);
    assert.ok(w.width * w.height <= MAX_PIXELS, `${what}: ${w.width} × ${w.height} = ${w.width * w.height} px is at most 2 MP`);
    const best = largestFit(area.aw, area.ah, g.pitch);
    assert.ok(w.scale >= 0.8 * best, `${what}: scale ${w.scale} keeps at least 80% of the largest that fits (${best.toFixed(3)})`);
    const pad = Math.round(0.9 * g.pitch * w.scale);
    assert.equal(w.padLeft, pad, `${what}: padLeft = round(0.9 · 30 · ${w.scale})`);
    assert.equal(w.padTop, pad, `${what}: padTop = padLeft`);
    assert.equal(w.width, Math.round(area.aw * w.scale) + 2 * pad, `${what}: width`);
    assert.equal(w.height, Math.round(area.ah * w.scale) + 2 * pad, `${what}: height`);
  }
});

test('window: the contract\'s mapping puts the inner area on the clamped area and the whole box inside it (a box with decimals)', () => {
  const PC = load(), g = grid63();
  for (const box of [[345.7, 238.2, 495.1, 262.9], [12.3, 640.5, 1888.8, 700.1], [1003.4, 61.2, 1010.6, 292.7]]) {
    const w = PC.window(g, box);
    for (const k of ['x', 'y', 'scale', 'padLeft', 'padTop', 'width', 'height']) {
      assert.ok(Number.isFinite(w[k]), `${JSON.stringify(box)}: window.${k} is a finite number, got ${w[k]}`);
    }
    assert.ok(w.scale > 0 && w.width * w.height <= MAX_PIXELS, `${JSON.stringify(box)}: scale > 0, at most 2 MP`);
    assert.ok(Number.isInteger(w.width) && Number.isInteger(w.height), 'width and height are an image\'s pixel size');
    // crop pixel (u, v) → flattened (x + (u − padLeft)/scale, y + (v − padTop)/scale)
    const toFlat = (u, v) => [w.x + (u - w.padLeft) / w.scale, w.y + (v - w.padTop) / w.scale];
    const toCrop = (fx, fy) => [w.padLeft + (fx - w.x) * w.scale, w.padTop + (fy - w.y) * w.scale];
    near(toFlat(w.padLeft, w.padTop), [w.x, w.y], 1e-9, 'the inner area starts at the area\'s top-left');
    const bw = box[2] - box[0], bh = box[3] - box[1];
    const right  = Math.min(g.width,  box[2] + Math.max(45, 0.15 * bw));
    const bottom = Math.min(g.height, box[3] + Math.max(45, 0.15 * bh));
    const end = toFlat(w.width - w.padLeft, w.height - w.padTop);
    assert.ok(Math.abs(end[0] - right) <= 0.5 / w.scale + 1e-9 && Math.abs(end[1] - bottom) <= 0.5 / w.scale + 1e-9,
      `the inner area ends at the area's bottom-right ${[right, bottom]} within half a crop pixel each way, got ${end}`);
    for (const [fx, fy] of [[box[0], box[1]], [box[2], box[3]], [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]]) {
      const [u, v] = toCrop(fx, fy);
      assert.ok(u >= w.padLeft && u <= w.width - w.padLeft && v >= w.padTop && v <= w.height - w.padTop,
        `box point ${[fx, fy]} lands inside the photo area of the crop, got crop pixel ${[u, v]}`);
      near(toFlat(u, v), [fx, fy], 1e-9, 'and maps back to itself');
    }
  }
});

// ── scaleH() ──────────────────────────────────────────────────

test('scaleH: rows 0 and 1 times sx and sy, row 2 as is, and H itself left alone', () => {
  const PC = load();
  const H = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
  const before = clone(H);
  assert.deepStrictEqual(PC.scaleH(H, 0.5, 0.25), [[0.5, 1, 1.5], [1, 1.25, 1.5], [7, 8, 9]]);
  assert.deepStrictEqual(H, before, 'H is not mutated (it is the grid\'s own H)');
  assert.deepStrictEqual(PC.scaleH(H, 1, 1), H, 'no resize: the same numbers');
});

test('scaleH: a flattened pixel lands on the photo pixel scaled by (sx, sy), as flatten() needs for the downsized photo', () => {
  const PC = load(), g = realGrid();
  const H = g.H, sx = 3000 / 4032, sy = 2250 / 3024;
  const S = PC.scaleH(H, sx, sy);
  for (const hole of ['a1', 'j30', 'e14', 'f15', 'rail:aOuter:7']) {
    const [x, y] = g.holeCentre(hole), [px, py] = applyH(H, x, y);
    near(applyH(S, x, y), [px * sx, py * sy], 1e-6, hole);
  }
});

// ── matrix() ──────────────────────────────────────────────────

test('matrix: an inner crop pixel (u, v) goes to the same photo pixel as H applied to its flattened pixel (x + u/scale, y + v/scale)', () => {
  const PC = load(), g = realGrid();
  const cases = [
    ['a resistor at scale 3, the grid\'s own H', g.H, [600, 238, 750, 262]],
    ['a long wire (scale lowered), H for a downsized photo', PC.scaleH(g.H, 0.5, 0.5), [100, 60, 1000, 300]],
    ['a clamped corner box, H for a downsized photo', PC.scaleH(g.H, 0.74, 0.74), [5, 640, 60, 705]],
  ];
  for (const [what, H, box] of cases) {
    const win = PC.window(g, box);
    const M = PC.matrix(H, win);
    assert.ok(isMatrix(M), `${what}: matrix is 3 nested rows of 3 finite numbers (PhotoGrid.warp reads M[r][c]), got ${JSON.stringify(M)}`);
    const innerW = win.width - 2 * win.padLeft, innerH = win.height - 2 * win.padTop;
    const pts = [[0, 0], [innerW, 0], [0, innerH], [innerW, innerH], [innerW / 2, innerH / 3], [10.5, 20.25], [-7, -3]];
    for (const [u, v] of pts) {
      const want = applyH(H, win.x + u / win.scale, win.y + v / win.scale);
      near(applyH(M, u, v), want, 1e-6 * Math.max(1, Math.hypot(...want)), `${what}: inner crop pixel (${u}, ${v})`);
    }
    // Composed with the contract's window mapping: a full crop pixel (U, V),
    // inner pixel (U − padLeft, V − padTop), is the photo pixel under the
    // flattened point the contract names.
    const [U, V] = [win.padLeft + 37, win.padTop + 11];
    const flat = [win.x + (U - win.padLeft) / win.scale, win.y + (V - win.padTop) / win.scale];
    near(applyH(M, U - win.padLeft, V - win.padTop), applyH(H, ...flat), 1e-6 * Math.max(1, Math.hypot(...applyH(H, ...flat))),
      `${what}: the contract's mapping`);
  }
});

test('matrix: warping through it gives the photo under the box (a synthetic photo, Node only)', () => {
  // The photo IS the flattened image (identity H), coloured by position:
  // red = x mod 256, green = y mod 256. The inner crop's pixel (u, v) must
  // carry the colour of flattened (x + u/scale, y + v/scale).
  const PC = load(), g = grid63();
  const W = g.width, Hh = g.height, data = new Uint8ClampedArray(4 * W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const i = 4 * (y * W + x);
    data[i] = x % 256; data[i + 1] = y % 256; data[i + 2] = 0; data[i + 3] = 255;
  }
  const src = { width: W, height: Hh, data };
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const win = PC.window(g, [345, 238, 495, 262]);           // x 300, y 193, scale 3
  const iw = win.width - 2 * win.padLeft, ih = win.height - 2 * win.padTop;
  const out = PhotoGrid.warp(src, PC.matrix(I, win), { width: iw, height: ih, data: new Uint8ClampedArray(4 * iw * ih) });
  for (const [u, v] of [[0, 0], [30, 60], [iw - 1, ih - 1], [300, 171]]) {
    const i = 4 * (v * iw + u);
    const fx = win.x + u / win.scale, fy = win.y + v / win.scale;
    assert.ok(Math.abs(out.data[i] - (fx % 256)) <= 1 && Math.abs(out.data[i + 1] - (fy % 256)) <= 1,
      `inner pixel (${u}, ${v}) shows flattened (${fx}, ${fy}): got rgb ${out.data[i]},${out.data[i + 1]}`);
  }
});

// ── merge() ───────────────────────────────────────────────────

const R1_PTS   = [[360.4, 190.3], [479.6, 189.8]];
const LED1_PTS = [[1258.2, 251.1], [1321.7, 248.9]];
const W1_PTS   = [[512.1, 281.9], [661.8, 76.4]];

test('merge: 2 returned legs become the leads\' points in order, hole \'?\' for the confirm screen to snap, and \'leads\' leaves unsure', () => {
  const PC = load();
  const reading = boxRound();
  const out = PC.merge(reading, [
    { id: 'R1', found: true, leads: [{ pin: '1', pt: R1_PTS[0], role: 'none' }, { pin: '2', pt: R1_PTS[1], role: 'none' }], conf: 0.9 },
    { id: 'W1', found: true, leads: [{ pin: '1', pt: W1_PTS[0], role: 'none' }, { pin: '2', pt: W1_PTS[1], role: 'none' }], conf: 0.8 },
  ]);
  const r1 = out.parts.find(p => p.id === 'R1');
  const want = Object.assign(clone(reading.parts[0]), {
    leads: [{ hole: '?', pt: R1_PTS[0], role: 'unknown' }, { hole: '?', pt: R1_PTS[1], role: 'unknown' }],   // 'none' leaves the role as it was
    unsure: ['value'],                                                                                      // only 'leads' goes
  });
  assert.deepStrictEqual(r1, want);
  const w1 = out.wires.find(w => w.id === 'W1');
  assert.deepStrictEqual(w1, Object.assign(clone(reading.wires[0]), {
    ends: [{ hole: '?', pt: W1_PTS[0] }, { hole: '?', pt: W1_PTS[1] }],                                    // a wire end stays { hole, pt }
    unsure: [],
  }));
  // Everything not answered is as it was, in the same order.
  assert.deepStrictEqual(out.parts.map(p => p.id), ['R1', 'LED1', 'X1', 'R2']);
  assert.deepStrictEqual(out.wires.map(w => w.id), ['W1', 'W2']);
  for (const id of ['LED1', 'X1', 'R2']) {
    assert.deepStrictEqual(out.parts.find(p => p.id === id), reading.parts.find(p => p.id === id), `${id} untouched`);
  }
  assert.deepStrictEqual(out.wires[1], reading.wires[1], 'W2 untouched');
  assert.deepStrictEqual(out.board, reading.board);
  assert.deepStrictEqual(out.power, reading.power);
});

test('merge: an LED keeps the roles it was given, in the order the legs came back; an unknown role leaves the lead\'s own', () => {
  const PC = load();
  const reading = boxRound();
  // Cathode first: leads[0] is the cathode, leads[1] the anode.
  let out = PC.merge(reading, [{ id: 'LED1', found: true, conf: 0.8,
    leads: [{ pin: 'cathode', pt: LED1_PTS[0], role: 'cathode' }, { pin: 'anode', pt: LED1_PTS[1], role: 'anode' }] }]);
  let led = out.parts.find(p => p.id === 'LED1');
  assert.deepStrictEqual(led.leads, [{ hole: '?', pt: LED1_PTS[0], role: 'cathode' }, { hole: '?', pt: LED1_PTS[1], role: 'anode' }]);
  assert.deepStrictEqual(led.unsure, []);

  // Pins Gemini didn't name ('1', '2' → role 'unknown'): a Reading that already
  // knew the polarity keeps it.
  const known = boxRound();
  known.parts[1].leads[0].role = 'anode';
  known.parts[1].leads[1].role = 'cathode';
  out = PC.merge(known, [{ id: 'LED1', found: true, conf: 0.5,
    leads: [{ pin: '1', pt: LED1_PTS[0], role: 'unknown' }, { pin: '2', pt: LED1_PTS[1], role: 'unknown' }] }]);
  led = out.parts.find(p => p.id === 'LED1');
  assert.deepStrictEqual(led.leads.map(l => l.role), ['anode', 'cathode']);
  assert.deepStrictEqual(led.leads.map(l => l.pt), LED1_PTS);
});

test('merge: an end that leaves the crop (pt null) is \'off\' and keeps its old point', () => {
  const PC = load();
  const reading = boxRound();
  const out = PC.merge(reading, [
    { id: 'W1', found: true, conf: 0.7, leads: [{ pin: '1', pt: W1_PTS[0], role: 'none' }, { pin: '2', pt: null, role: 'none' }] },
    { id: 'R1', found: true, conf: 0.7, leads: [{ pin: '1', pt: null, role: 'none' }, { pin: '2', pt: R1_PTS[1], role: 'none' }] },
  ]);
  assert.deepStrictEqual(out.wires[0].ends, [{ hole: '?', pt: W1_PTS[0] }, { hole: 'off', pt: reading.wires[0].ends[1].pt }]);
  assert.deepStrictEqual(out.parts[0].leads, [
    { hole: 'off', pt: reading.parts[0].leads[0].pt, role: 'unknown' },
    { hole: '?', pt: R1_PTS[1], role: 'unknown' },
  ]);
  assert.ok(!out.wires[0].unsure.includes('leads') && !out.parts[0].unsure.includes('leads'), 'answered: \'leads\' goes even with an end off');
});

test('merge: found false drops that part or wire', () => {
  const PC = load();
  const reading = boxRound();
  const out = PC.merge(reading, [
    { id: 'R2', found: false, leads: [], conf: 0.1 },
    { id: 'W2', found: false, leads: [], conf: 0.2 },
  ]);
  assert.deepStrictEqual(out.parts.map(p => p.id), ['R1', 'LED1', 'X1']);
  assert.deepStrictEqual(out.wires.map(w => w.id), ['W1']);
});

test('merge: an error, 0, 1 or 3 legs, or an id the Reading lacks leaves every placeholder and \'leads\' flag as it was', () => {
  const PC = load();
  const reading = boxRound();
  const leg = (pt, role = 'none') => ({ pin: '?', pt, role });
  const cases = [
    ['an AI_TIMEOUT',      [{ id: 'R1', error: 'AI_TIMEOUT' }, { id: 'W1', error: 'AI_TIMEOUT' }]],
    ['an AI_FAILED',       [{ id: 'LED1', error: 'AI_FAILED' }, { id: 'R2', error: 'AI_FAILED' }]],
    ['1 leg',              [{ id: 'R1', found: true, conf: 0.5, leads: [leg(R1_PTS[0])] }]],
    ['3 legs',             [{ id: 'LED1', found: true, conf: 0.5, leads: [leg(LED1_PTS[0], 'anode'), leg(LED1_PTS[1], 'cathode'), leg([1300, 250])] }]],
    ['no legs, found',     [{ id: 'W1', found: true, conf: 0.5, leads: [] }]],
    ['an unknown id',      [{ id: 'R9', found: true, conf: 0.9, leads: [leg(R1_PTS[0]), leg(R1_PTS[1])] },
                            { id: 'W7', found: false, leads: [], conf: 0.1 }]],
    ['no answers at all',  []],
  ];
  for (const [what, results] of cases) {
    assert.deepStrictEqual(PC.merge(reading, results), reading, `${what}: the Reading is unchanged`);
  }
});

test('merge: returns a new Reading and never mutates the one it was given (a mixed round)', () => {
  const PC = load();
  const reading = boxRound();
  const before = clone(reading);
  const out = PC.merge(reading, [
    { id: 'R1', found: true, conf: 0.9, leads: [{ pin: '1', pt: R1_PTS[0], role: 'none' }, { pin: '2', pt: null, role: 'none' }] },
    { id: 'LED1', found: true, conf: 0.8, leads: [{ pin: 'anode', pt: LED1_PTS[0], role: 'anode' }, { pin: 'cathode', pt: LED1_PTS[1], role: 'cathode' }] },
    { id: 'R2', found: false, leads: [], conf: 0.1 },
    { id: 'W1', error: 'AI_TIMEOUT' },
    { id: 'W2', found: true, conf: 0.6, leads: [{ pin: '1', pt: [905, 415], role: 'none' }, { pin: '2', pt: [1095, 416], role: 'none' }] },
  ]);
  assert.deepStrictEqual(reading, before, 'the input Reading is exactly as it was');
  assert.notStrictEqual(out, reading, 'a new object');
  assert.deepStrictEqual(out.parts.map(p => p.id), ['R1', 'LED1', 'X1']);
  assert.deepStrictEqual(out.parts[1].leads.map(l => [l.hole, l.role]), [['?', 'anode'], ['?', 'cathode']]);
  assert.deepStrictEqual(out.wires.map(w => [w.id, w.unsure.includes('leads')]), [['W1', true], ['W2', false]]);
});
