// Tests for circuit3d/js/photo-grid.js (issue #135): tapped holes in a photo
// → the flattened image's frame, exact holes, snapping and the warp.
// The contract is docs/API-CONTRACT.md → "PhotoGrid".
//
// Expected numbers are worked out by hand from the contract's frame:
//   column c at x = 90 + 30·(c − 1); a on top: a 190 … e 310, f 400 … j 520;
//   j on top: j 190 … f 310, e 400 … a 520; rail lines 2.9 and 3.9 pitches
//   beyond the nearest body row (y 103 / 73 at the top, 607 / 637 at the bottom).

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const FILE   = path.join(__dirname, '..', 'circuit3d', 'js', 'photo-grid.js');
const PHOTOS = require('./fixtures/photo/web/photos.json');

// Loaded inside each test, so a missing file fails the test that needs it.
function load() {
  assert.ok(fs.existsSync(FILE), 'circuit3d/js/photo-grid.js does not exist yet');
  return require(FILE);
}

// ── Helpers (test-side maths only) ────────────────────────────

// grid.H is "3 × 3, row-major"; accept nested rows or a flat 9.
function rows(H) {
  return H.length === 9 ? [H.slice(0, 3), H.slice(3, 6), H.slice(6, 9)] : H;
}

function applyH(H, [x, y]) {
  const M = rows(H);
  const w = M[2][0] * x + M[2][1] * y + M[2][2];
  return [(M[0][0] * x + M[0][1] * y + M[0][2]) / w, (M[1][0] * x + M[1][1] * y + M[1][2]) / w];
}

function inv3(H) {
  const [[a, b, c], [d, e, f], [g, h, i]] = rows(H);
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}

// A photo pixel → the flattened image, through the inverse of grid.H.
function toFlat(grid, p) { return applyH(inv3(grid.H), p); }

function near(actual, expected, tol, msg) {
  assert.ok(Array.isArray(actual), `${msg}: expected a point, got ${JSON.stringify(actual)}`);
  const d = Math.hypot(actual[0] - expected[0], actual[1] - expected[1]);
  assert.ok(d <= tol, `${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)} (off by ${d})`);
}

// Sign of the flattened → photo Jacobian at the board's centre: > 0 means
// the flattened image is not a mirror image of the photo.
function jacobianDet(grid) {
  const cx = grid.x0 + (grid.pitch * (grid.cols - 1)) / 2, cy = grid.y0 + grid.pitch * 5.5, e = 1e-3;
  const p0 = grid.toPhoto([cx, cy]), px = grid.toPhoto([cx + e, cy]), py = grid.toPhoto([cx, cy + e]);
  return ((px[0] - p0[0]) * (py[1] - p0[1]) - (py[0] - p0[0]) * (px[1] - p0[1])) / (e * e);
}

function allHoles(cols) {
  const out = [];
  for (let c = 1; c <= cols; c++) for (const r of 'abcdefghij') out.push(r + c);
  return out;
}

// The four corner taps when the photo IS the flattened image.
const A_TOP = { a1: [90, 190], a63: [1950, 190], j63: [1950, 520], j1: [90, 520] };
const J_TOP = { j1: [90, 190], j63: [1950, 190], a63: [1950, 520], a1: [90, 520] };

// A perspective (trapezoid) map, flattened → photo, with a positive determinant.
const P = [[0.9, 0.12, 40], [0.05, 1.1, 30], [0.0001, 0.00025, 1]];

// ── Shape of the grid ─────────────────────────────────────────

test('a 63-column grid: the flattened frame from the contract', () => {
  const grid = load().homography(A_TOP);
  assert.equal(grid.cols, 63, 'cols defaults to 63');
  assert.equal(grid.pitch, 30);
  assert.equal(grid.x0, 90);
  assert.equal(grid.y0, 190);
  assert.equal(grid.width, 2040);
  assert.equal(grid.height, 710);
});

test('a 30-column board is 30·29 + 180 = 1050 px wide', () => {
  const grid = load().homography({ a1: [90, 190], a30: [960, 190], j30: [960, 520], j1: [90, 520] }, 30);
  assert.equal(grid.cols, 30);
  assert.equal(grid.width, 1050);
  assert.equal(grid.height, 710);
  near(grid.holeCentre('a30'), [960, 190], 1e-9, 'a30');
  assert.equal(grid.snap([1000, 250]).hole, 'off', '1.3 pitches past column 30 is off the board');
});

// ── Hole centres and the frame ────────────────────────────────

test('hole centres in the j-on-top frame: j1 y=0, f1 y=4, e1 y=7, a63 y=11 pitches', () => {
  const grid = load().homography(J_TOP);
  assert.equal(grid.aTop, false);
  near(grid.holeCentre('j1'), [90, 190], 1e-9, 'j1');
  near(grid.holeCentre('f1'), [90, 310], 1e-9, 'f1');
  near(grid.holeCentre('e1'), [90, 400], 1e-9, 'e1');
  near(grid.holeCentre('a63'), [1950, 520], 1e-9, 'a63');
  near(grid.holeCentre('h14'), [480, 250], 1e-9, 'h14');
});

test('hole centres in the a-on-top frame: a1 at (90, 190), e1 310, f1 400, j63 (1950, 520)', () => {
  const grid = load().homography(A_TOP);
  assert.equal(grid.aTop, true);
  near(grid.holeCentre('a1'), [90, 190], 1e-9, 'a1');
  near(grid.holeCentre('e1'), [90, 310], 1e-9, 'e1');
  near(grid.holeCentre('f1'), [90, 400], 1e-9, 'f1');
  near(grid.holeCentre('j63'), [1950, 520], 1e-9, 'j63');
  near(grid.holeCentre('b17'), [570, 220], 1e-9, 'b17 (the mock Reading)');
});

test('rail holes sit on their line, named by side, in both frames', () => {
  const PG = load();
  const aTop = PG.homography(A_TOP);
  near(aTop.holeCentre('rail:aOuter:14'), [480, 73], 1e-9, 'a on top: aOuter');
  near(aTop.holeCentre('rail:aInner:14'), [480, 103], 1e-9, 'a on top: aInner');
  near(aTop.holeCentre('rail:jInner:14'), [480, 607], 1e-9, 'a on top: jInner');
  near(aTop.holeCentre('rail:jOuter:14'), [480, 637], 1e-9, 'a on top: jOuter');
  near(aTop.holeCentre('rail:aOuter:10'), [360, 73], 1e-9, 'the mock Reading\'s R1 rail lead');
  const jTop = PG.homography(J_TOP);
  near(jTop.holeCentre('rail:jOuter:14'), [480, 73], 1e-9, 'j on top: jOuter is the topmost strip');
  near(jTop.holeCentre('rail:jInner:14'), [480, 103], 1e-9, 'j on top: jInner');
  near(jTop.holeCentre('rail:aInner:14'), [480, 607], 1e-9, 'j on top: aInner');
  near(jTop.holeCentre('rail:aOuter:14'), [480, 637], 1e-9, 'j on top: aOuter');
});

test('holeCentre gives null for anything that is not a hole', () => {
  const grid = load().homography(A_TOP);
  for (const name of ['gap', 'off', '?', 'k5', 'c0', 'c64', 'rail:top:3', 'rail:aOuter:x', '', undefined]) {
    assert.equal(grid.holeCentre(name), null, `holeCentre(${JSON.stringify(name)})`);
  }
});

test('the frame is chosen from the taps so the flattened image is never mirrored', () => {
  const PG = load();
  const cases = [
    { name: 'a on top, as photographed', taps: A_TOP, aTop: true },
    { name: 'j on top, as photographed', taps: J_TOP, aTop: false },
    // The a-on-top tap order mirrored left-right: only the j-on-top frame is
    // unmirrored (it's the j-on-top board turned 180°).
    { name: 'a-on-top taps mirrored', taps: { a1: [1950, 190], a63: [90, 190], j63: [90, 520], j1: [1950, 520] }, aTop: false },
    // The j-on-top tap order mirrored left-right → the a-on-top frame.
    { name: 'j-on-top taps mirrored', taps: { j1: [1950, 190], j63: [90, 190], a63: [90, 520], a1: [1950, 520] }, aTop: true },
    // The j-on-top board turned upside down still flattens with j on top.
    { name: 'j on top, photo turned 180°', taps: { j1: [1950, 520], j63: [90, 520], a63: [90, 190], a1: [1950, 190] }, aTop: false },
  ];
  for (const c of cases) {
    const grid = PG.homography(c.taps);
    assert.equal(grid.aTop, c.aTop, `${c.name}: aTop`);
    assert.ok(jacobianDet(grid) > 0, `${c.name}: the flattened image is a mirror image of the photo`);
    for (const [hole, px] of Object.entries(c.taps)) near(grid.toPhoto(grid.holeCentre(hole)), px, 1e-6, `${c.name}: ${hole}`);
  }
});

// ── Round trips ───────────────────────────────────────────────

test('identity round trip: H maps the flattened image onto itself', () => {
  const grid = load().homography(A_TOP);
  for (const p of [[0, 0], [90, 190], [480, 250], [1234.5, 678.25], [2039, 709]]) {
    near(grid.toPhoto(p), p, 1e-6, `toPhoto(${p})`);
    near(applyH(grid.H, p), p, 1e-6, `H · ${p}`);
  }
  for (const hole of allHoles(63)) {
    const s = grid.snap(grid.toPhoto(grid.holeCentre(hole)));
    assert.equal(s.hole, hole);
    assert.equal(s.zone, 'body');
    assert.ok(s.dist < 1e-6, `${hole}: dist ${s.dist}`);
  }
});

test('trapezoid round trip: hole → photo → hole is exact in both frames', () => {
  const PG = load();
  for (const frame of [A_TOP, J_TOP]) {
    const taps = {};
    for (const [hole, flat] of Object.entries(frame)) taps[hole] = applyH(P, flat);
    const grid = PG.homography(taps);
    assert.equal(grid.aTop, frame === A_TOP);
    for (const hole of allHoles(63)) {
      const flat = grid.holeCentre(hole);
      const photo = grid.toPhoto(flat);
      near(photo, applyH(P, flat), 1e-6, `${hole} in the photo`);
      const s = grid.snap(toFlat(grid, photo));
      assert.equal(s.hole, hole, `${hole} → photo → ${s.hole}`);
      assert.ok(s.dist < 1e-6, `${hole}: dist ${s.dist}`);
    }
  }
});

test('more than 4 taps: least squares is still exact, even when the first 4 are collinear', () => {
  // A big photo (thousands of px) so the fit needs normalised coordinates.
  const P2 = [[1.8, 0.2, 300], [-0.1, 1.9, 500], [0.00005, -0.00008, 1]];
  const PG = load();
  const ref = PG.homography(A_TOP);
  const names = ['a1', 'a20', 'a40', 'a63', 'e10', 'f30', 'j1', 'j63', 'c50', 'h5', 'i33', 'b2'];
  const taps = {};
  for (const h of names) taps[h] = applyH(P2, ref.holeCentre(h));
  const grid = PG.homography(taps);
  assert.equal(grid.aTop, true);
  for (const hole of allHoles(63)) {
    near(grid.toPhoto(grid.holeCentre(hole)), applyH(P2, ref.holeCentre(hole)), 1e-6, hole);
  }
});

// ── Degenerate taps ───────────────────────────────────────────

test('degenerate taps throw an Error', () => {
  const PG = load();
  const cases = {
    'fewer than 4': { a1: [90, 190], a63: [1950, 190], j63: [1950, 520] },
    'collinear in the photo': { a1: [100, 100], a63: [1900, 100], j63: [1300, 100], j1: [700, 100] },
    'near-collinear in the photo (within 0.2 px of a line)': { a1: [100, 100], a63: [1900, 100], j63: [1300, 100.4], j1: [700, 100.4] },
    'collinear holes (all in row a)': { a1: [90, 190], a20: [660, 200], a40: [1260, 180], a63: [1950, 230] },
    'a repeated point': { a1: [90, 190], a63: [1950, 190], j63: [1950, 520], j1: [1950, 520] },
  };
  for (const [name, taps] of Object.entries(cases)) {
    assert.throws(() => PG.homography(taps), Error, name);
  }
});

// ── Snapping ──────────────────────────────────────────────────

function checkSnap(grid, cases, frame) {
  for (const [pt, want] of cases) {
    const s = grid.snap(pt);
    const label = `${frame}: snap(${JSON.stringify(pt)})`;
    for (const key of Object.keys(want)) {
      if (key === 'dist') continue;
      assert.equal(s[key], want[key], `${label}.${key}`);
    }
    if (!('dist' in want)) continue;
    if (want.dist === null) assert.equal(s.dist, null, `${label}.dist`);
    else assert.ok(Math.abs(s.dist - want.dist) < 1e-6, `${label}.dist: expected ${want.dist}, got ${s.dist}`);
  }
}

test('snap with a on top: body, gap, the 4 rail zones and off', () => {
  const grid = load().homography(A_TOP);
  checkSnap(grid, [
    // body: nearest hole within 0.45 pitch
    [[482, 251], { hole: 'c14', zone: 'body', dist: Math.hypot(2, 1) / 30 }],
    [[1950, 520], { hole: 'j63', zone: 'body', dist: 0 }],
    [[90, 190], { hole: 'a1', zone: 'body', dist: 0 }],
    // the centre channel → the nearest e or f hole, zone 'gap'
    [[480, 340], { hole: 'e14', zone: 'gap', dist: 1 }],
    [[480, 370], { hole: 'f14', zone: 'gap', dist: 1 }],
    // rails, by side: a-side above row a, j-side below row j
    [[480, 73], { hole: 'rail:aOuter:14', zone: 'rail', rail: 'aOuter', col: 14, dist: 0 }],
    [[480, 103], { hole: 'rail:aInner:14', zone: 'rail', rail: 'aInner', col: 14, dist: 0 }],
    [[480, 607], { hole: 'rail:jInner:14', zone: 'rail', rail: 'jInner', col: 14, dist: 0 }],
    [[480, 637], { hole: 'rail:jOuter:14', zone: 'rail', rail: 'jOuter', col: 14, dist: 0 }],
    // col is the nearest body column
    [[487, 80], { hole: 'rail:aOuter:14', rail: 'aOuter', col: 14, dist: Math.hypot(7, 7) / 30 }],
    [[497, 100], { hole: 'rail:aInner:15', rail: 'aInner', col: 15, dist: Math.hypot(13, 3) / 30 }],
    [[81, 103], { hole: 'rail:aInner:1', rail: 'aInner', col: 1 }],
    [[1959, 637], { hole: 'rail:jOuter:63', rail: 'jOuter', col: 63 }],
    // inner below 3.4 pitches beyond the body row, outer past it
    [[480, 91], { rail: 'aInner' }],    // 3.3 pitches above row a
    [[480, 85], { rail: 'aOuter' }],    // 3.5
    [[480, 619], { rail: 'jInner' }],   // 3.3 pitches below row j
    [[480, 625], { rail: 'jOuter' }],   // 3.5
    // off: between holes, past the columns, beyond the rail zones
    [[105, 205], { hole: 'off', zone: 'off', dist: null }],    // 0.71 pitch from a1, a2, b1, b2
    [[495, 250], { hole: 'off', zone: 'off', dist: null }],    // 0.5 pitch from c14 and c15
    [[60, 250], { hole: 'off', zone: 'off', dist: null }],     // 1 pitch left of column 1
    [[1975, 250], { hole: 'off', zone: 'off', dist: null }],   // 0.83 pitch right of column 63
    [[60, 73], { hole: 'off', zone: 'off', dist: null }],      // a rail line, but left of the board
    [[480, 20], { hole: 'off', zone: 'off', dist: null }],     // the label band above the rails
    [[480, 690], { hole: 'off', zone: 'off', dist: null }],    // the label band below
  ], 'a on top');
});

test('snap with j on top: rails keep their side\'s names', () => {
  const grid = load().homography(J_TOP);
  checkSnap(grid, [
    [[480, 250], { hole: 'h14', zone: 'body', dist: 0 }],
    [[480, 340], { hole: 'f14', zone: 'gap', dist: 1 }],
    [[480, 370], { hole: 'e14', zone: 'gap', dist: 1 }],
    [[480, 73], { hole: 'rail:jOuter:14', zone: 'rail', rail: 'jOuter', col: 14, dist: 0 }],
    [[480, 103], { hole: 'rail:jInner:14', zone: 'rail', rail: 'jInner', col: 14, dist: 0 }],
    [[480, 607], { hole: 'rail:aInner:14', zone: 'rail', rail: 'aInner', col: 14, dist: 0 }],
    [[480, 637], { hole: 'rail:aOuter:14', zone: 'rail', rail: 'aOuter', col: 14, dist: 0 }],
  ], 'j on top');
});

// ── Warp ──────────────────────────────────────────────────────

test('warp samples the photo at H · (x, y), bilinear, dark outside', () => {
  const PG = load();
  // Flattened → photo: the board frame in pitches (a1 at (0, 0), j30 at (29, 11)).
  const grid = PG.homography({ a1: [0, 0], a30: [29, 0], j30: [29, 11], j1: [0, 11] }, 30);
  // A 30 × 12 photo whose colour is a linear ramp, so bilinear is exact.
  const src = { width: 30, height: 12, data: new Uint8ClampedArray(30 * 12 * 4) };
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 30; x++) src.data.set([8 * x, 20 * y, 100, 255], 4 * (y * 30 + x));
  }
  const out = { width: grid.width, height: grid.height, data: new Uint8ClampedArray(grid.width * grid.height * 4) };
  const got = PG.warp(src, grid.H, out);
  assert.equal(got, out, 'warp returns out');
  const at = (x, y) => Array.from(out.data.slice(4 * (y * out.width + x), 4 * (y * out.width + x) + 4));
  assert.deepEqual(at(210, 250), [32, 40, 100, 255], 'c5 → photo (4, 2)');
  assert.deepEqual(at(225, 265), [36, 50, 100, 255], 'between holes → photo (4.5, 2.5), bilinear');
  assert.deepEqual(at(120, 490), [8, 200, 100, 255], 'i2 → photo (1, 10)');
  assert.deepEqual(at(0, 0), [40, 40, 40, 255], 'left of and above the photo');
  assert.deepEqual(at(1049, 709), [40, 40, 40, 255], 'right of and below the photo');
});

// ── The real photos ───────────────────────────────────────────

test('fixtures: every photo\'s taps map back to their own holes within 0.3 pitch, unmirrored', () => {
  const PG = load();
  for (const [id, photo] of Object.entries(PHOTOS)) {
    const grid = PG.homography(photo.taps, photo.ncols);
    assert.equal(grid.cols, photo.ncols, `${id}: cols`);
    if (photo.a_top !== null) assert.equal(grid.aTop, photo.a_top, `${id}: aTop`);
    assert.ok(jacobianDet(grid) > 0, `${id}: the flattened image is mirrored`);
    for (const [hole, px] of Object.entries(photo.taps)) {
      const s = grid.snap(toFlat(grid, px));
      assert.equal(s.hole, hole, `${id}: tap ${hole} snaps to ${s.hole}`);
      assert.ok(s.dist < 0.3, `${id}: tap ${hole} is ${s.dist} pitch from its hole`);
    }
  }
});
