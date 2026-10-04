// The TA view's drawing logic (Edison E9, issue #155): edison/sections/ta.js.
//
// ta.js becomes a UMD module (the wrapper at the top of course-data.js): in
// the browser it sets window.TA and registers the #ta section with
// Course.section; in Node it exports the same object and touches no DOM.
//
// What these tests assume (plan Task E9, Step 1; spec §3, §4 and §4a):
// - TA.isoPoint(hole) → { x, y }: a body hole ('a1' … 'j63', rows and columns
//   from circuit3d/js/board-geometry.js) in the isometric drawing's own
//   coordinates. The projection is isometric line art, so it is affine:
//   - one column step is the same vector everywhere on the board;
//   - a1, a63, j63 and j1 are the corners of a parallelogram with a1 and j63
//     opposite, and every body hole lands inside it;
//   - neither board axis is drawn flat or upright: the column axis and the
//     row axis are each slanted 15–45° from the horizontal (true isometric
//     is 30°, 2:1 pixel isometric is about 26.6°).
// - TA.colourFor(count, max) → a CSS colour (hex or rgb()): a sequential
//   scale from --pad #E9EFE2 (count 0) to --bus-red #C4333B (count = max).
//   Higher counts are never further from --bus-red. No colour on the way is
//   purple (the design guard's rule: hue 230–290°, saturation above 40%).
//   It is a valid colour for max 0 and for counts above max.
// - TA.summary(heatmap) → the summary block's sentences, as an array of
//   strings or one string. Numbers live inside sentences (spec §3: no stat
//   banners), so every sentence carries its number, and the busiest cell
//   reads "<count> of <total> students …" with that cell's note in the same
//   sentence.
//
// ta.js is loaded inside each test, so a module that doesn't load yet fails
// each test on its own assertion rather than failing the file at import.

const path = require('node:path');

const GEOMETRY   = require('../circuit3d/js/board-geometry.js');
const CourseData = require('../edison/course-data.js');

const FILE = path.join(__dirname, '..', 'edison', 'sections', 'ta.js');
let loadError = null;
function loadTA() {
  try {
    delete require.cache[require.resolve(FILE)];
    loadError = null;
    return require(FILE) || {};
  } catch (e) {
    loadError = e.message;
    return {};
  }
}
function fn(TA, name) {
  expect(typeof TA[name], `edison/sections/ta.js exports ${name}() in Node` +
    (loadError ? ` (loading it threw: ${loadError})` : '')).toBe('function');
  return TA[name];
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

const ROWS = GEOMETRY.BODY_ROWS;                          // a … j
const COLS = Array.from({ length: GEOMETRY.COLS }, (_, i) => i + 1);
const FIRST = ROWS[0], LAST = ROWS[ROWS.length - 1];
const N = GEOMETRY.COLS;

const sub   = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
const cross = (u, v) => u.x * v.y - u.y * v.x;
const len   = u => Math.hypot(u.x, u.y);
const slant = u => Math.atan2(Math.abs(u.y), Math.abs(u.x)) * 180 / Math.PI;   // degrees from horizontal

// Inside (or on) the convex polygon `poly` (any winding), with a tolerance in
// drawing units.
function inside(p, poly, eps) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const edge = sub(b, a);
    const d = cross(edge, sub(p, a)) / len(edge);   // signed distance from the edge's line
    if (Math.abs(d) <= eps) continue;
    const s = Math.sign(d);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function pointOf(isoPoint, hole) {
  const p = isoPoint(hole);
  expect(p && Number.isFinite(p.x) && Number.isFinite(p.y), `isoPoint('${hole}') is a finite { x, y } (got ${JSON.stringify(p)})`).toBe(true);
  return p;
}

// ── Colour helpers ───────────────────────────────────────────────────────────

const PAD     = [0xE9, 0xEF, 0xE2];
const BUS_RED = [0xC4, 0x33, 0x3B];
const END_TOLERANCE = 16;   // RGB distance: the scale's ends are the tokens, give or take rounding

function hslToRgb(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(v => Math.round(v * 255));
}
// A CSS colour as [r, g, b], or null when it isn't one this test reads.
function rgbOf(css) {
  const s = String(css).trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (m) return [m[1], m[2], m[3]].map(Number);
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(s);
  if (m) return hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100);
  return null;
}
function colour(colourFor, count, max) {
  const out = colourFor(count, max);
  const rgb = rgbOf(out);
  expect(rgb && rgb.every(Number.isFinite), `colourFor(${count}, ${max}) is a CSS colour (got ${JSON.stringify(out)})`).toBeTruthy();
  return rgb;
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
// The design guard's purple test (test/edison-design-guard.test.js).
function purple([R, G, B]) {
  const r = R / 255, g = G / 255, b = B / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return false;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const hue = (h * 60 + 360) % 360, sat = d / (1 - Math.abs(mx + mn - 1));
  return hue >= 230 && hue <= 290 && sat > 0.4;
}

const HEAT = CourseData.heatmap;
const MAX  = Math.max(...HEAT.cells.map(c => c.count));

// ── isoPoint ─────────────────────────────────────────────────────────────────

test('isoPoint puts a1 and j63 on opposite corners of the drawing, and every body hole inside it', () => {
  const isoPoint = fn(loadTA(), 'isoPoint');
  const A = pointOf(isoPoint, `${FIRST}1`), B = pointOf(isoPoint, `${FIRST}${N}`);
  const C = pointOf(isoPoint, `${LAST}${N}`), D = pointOf(isoPoint, `${LAST}1`);
  const outline = [A, B, C, D];

  const diag = len(sub(C, A));
  expect(diag, 'a1 and j63 are drawn apart').toBeGreaterThan(0);
  const area = Math.abs(cross(sub(B, A), sub(D, A)));
  expect(area, 'a1, a63, j63 and j1 enclose an area (the drawing is not flat)').toBeGreaterThan(diag * diag * 0.01);
  // An affine (isometric) drawing keeps the board a parallelogram: a1 + j63 = a63 + j1.
  const eps = diag * 1e-3;
  expect(len(sub({ x: A.x + C.x, y: A.y + C.y }, { x: B.x + D.x, y: B.y + D.y })),
    'a1, a63, j63, j1 form a parallelogram with a1 and j63 opposite').toBeLessThanOrEqual(eps);

  const outside = [];
  for (const r of ROWS) for (const c of COLS) {
    const p = pointOf(isoPoint, `${r}${c}`);
    if (!inside(p, outline, eps)) outside.push(`${r}${c}`);
  }
  expect(outside, 'body holes drawn outside the a1–a63–j63–j1 outline').toEqual([]);
});

test('every heat-map hole lands inside the board outline', () => {
  const isoPoint = fn(loadTA(), 'isoPoint');
  const outline = [`${FIRST}1`, `${FIRST}${N}`, `${LAST}${N}`, `${LAST}1`].map(h => pointOf(isoPoint, h));
  const eps = len(sub(outline[2], outline[0])) * 1e-3;
  expect(HEAT.cells.length, 'the sample heat-map has cells').toBeGreaterThan(0);
  for (const cell of HEAT.cells) {
    const p = pointOf(isoPoint, cell.hole);
    expect(inside(p, outline, eps), `${cell.hole} (${JSON.stringify(p)}) is inside the outline`).toBe(true);
  }
});

test('isoPoint is isometric: one column step everywhere, both board axes slanted 15–45° from the horizontal', () => {
  const isoPoint = fn(loadTA(), 'isoPoint');
  const step = sub(pointOf(isoPoint, `${FIRST}2`), pointOf(isoPoint, `${FIRST}1`));
  const unit = len(step);
  expect(unit, 'one column step has a length').toBeGreaterThan(0);
  for (const r of ROWS) for (const c of [1, 17, 30, 31, 62]) {
    const s = sub(pointOf(isoPoint, `${r}${c + 1}`), pointOf(isoPoint, `${r}${c}`));
    expect(len(sub(s, step)), `the step ${r}${c} → ${r}${c + 1} matches a1 → a2`).toBeLessThanOrEqual(unit * 1e-3);
  }
  const across = sub(pointOf(isoPoint, `${LAST}1`), pointOf(isoPoint, `${FIRST}1`));
  expect(len(across), 'rows a to j are drawn apart').toBeGreaterThan(0);
  expect(Math.abs(cross(step, across)), 'the column and row axes are not parallel').toBeGreaterThan(0);
  for (const [name, axis] of [['column axis (a1 → a2)', step], ['row axis (a1 → j1)', across]]) {
    const deg = slant(axis);
    expect(deg >= 15 && deg <= 45, `the ${name} is slanted ${deg.toFixed(1)}° from the horizontal (isometric: 15–45°)`).toBe(true);
  }
  // Each column's holes a → j sit on one straight line.
  for (const c of [1, 30, N]) {
    const a = pointOf(isoPoint, `${FIRST}${c}`), j = pointOf(isoPoint, `${LAST}${c}`);
    for (const r of ROWS) {
      const p = pointOf(isoPoint, `${r}${c}`);
      expect(Math.abs(cross(sub(j, a), sub(p, a))) / len(sub(j, a)), `${r}${c} is on the line ${FIRST}${c}–${LAST}${c}`)
        .toBeLessThanOrEqual(unit * 1e-3);
    }
  }
});

// ── colourFor ────────────────────────────────────────────────────────────────

test('colourFor runs from --pad at 0 to --bus-red at max, never further from --bus-red as the count rises', () => {
  const colourFor = fn(loadTA(), 'colourFor');
  const low = colour(colourFor, 0, MAX), high = colour(colourFor, MAX, MAX);
  expect(dist(low, PAD), `colourFor(0, ${MAX}) is --pad #E9EFE2 (got rgb(${low}))`).toBeLessThanOrEqual(END_TOLERANCE);
  expect(dist(high, BUS_RED), `colourFor(${MAX}, ${MAX}) is --bus-red #C4333B (got rgb(${high}))`).toBeLessThanOrEqual(END_TOLERANCE);

  let prev = null;
  for (let n = 0; n <= MAX; n++) {
    const c = colour(colourFor, n, MAX);
    if (prev) {
      expect(dist(c, BUS_RED), `colourFor(${n}) is no further from --bus-red than colourFor(${n - 1})`).toBeLessThanOrEqual(dist(prev, BUS_RED) + 1.5);
      expect(dist(c, PAD), `colourFor(${n}) is no closer to --pad than colourFor(${n - 1})`).toBeGreaterThanOrEqual(dist(prev, PAD) - 1.5);
    }
    prev = c;
  }
  // Every sample count gets a hotter colour than the coolest one below it.
  const counts = [...new Set(HEAT.cells.map(c => c.count))].sort((a, b) => a - b);
  expect(dist(colour(colourFor, counts.at(-1), MAX), BUS_RED), 'the busiest cell is redder than the quietest')
    .toBeLessThan(dist(colour(colourFor, counts[0], MAX), BUS_RED));
});

test('colourFor reads the count against max: the same count is cooler on a bigger scale', () => {
  const colourFor = fn(loadTA(), 'colourFor');
  const n = 10;
  expect(dist(colour(colourFor, n, n), BUS_RED), `colourFor(${n}, ${n}) is the top of the scale`).toBeLessThanOrEqual(END_TOLERANCE);
  expect(dist(colour(colourFor, n, HEAT.total), BUS_RED), `colourFor(${n}, ${HEAT.total}) is cooler than colourFor(${n}, ${n})`)
    .toBeGreaterThan(dist(colour(colourFor, n, n), BUS_RED) + END_TOLERANCE);
});

test('colourFor is never purple, and stays a colour for max 0 and for counts above max', () => {
  const colourFor = fn(loadTA(), 'colourFor');
  const hits = [];
  for (const max of [1, 7, MAX, HEAT.total]) for (let n = 0; n <= max; n++) {
    const c = colour(colourFor, n, max);
    if (purple(c)) hits.push(`colourFor(${n}, ${max}) = rgb(${c})`);
  }
  expect(hits, 'purple colours on the scale').toEqual([]);
  colour(colourFor, 0, 0);
  const over = colour(colourFor, MAX * 2, MAX);
  expect(dist(over, BUS_RED), `colourFor(${MAX * 2}, ${MAX}) stays at the top of the scale (got rgb(${over}))`).toBeLessThanOrEqual(END_TOLERANCE);
});

// ── summary ──────────────────────────────────────────────────────────────────

function sentencesOf(summary, heatmap) {
  const out = summary(heatmap);
  const list = Array.isArray(out) ? out : typeof out === 'string' ? out.split(/(?<=[.!?])\s+/) : null;
  expect(Array.isArray(list), `summary() returns sentences, as a list or a string (got ${JSON.stringify(out)})`).toBe(true);
  return list.map(s => String(s).trim()).filter(Boolean);
}
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('summary: every sentence carries its number, and the busiest cell reads "<count> of <total> students" with its note', () => {
  const summary = fn(loadTA(), 'summary');
  const sentences = sentencesOf(summary, HEAT);
  expect(sentences.length, 'the summary is a block of sentences').toBeGreaterThanOrEqual(2);
  for (const s of sentences) {
    expect(s, 'each summary sentence holds a number').toMatch(/\d/);
    expect(s, 'each summary line is a sentence').toMatch(/^[A-Z0-9].*[.!?]$/);
    expect(s.split(/\s+/).length, `"${s}" is a sentence, not a stat`).toBeGreaterThanOrEqual(4);
  }
  const top = [...HEAT.cells].sort((a, b) => b.count - a.count)[0];
  const lead = new RegExp(`\\b${top.count} of ${HEAT.total} students\\b`);
  const hit = sentences.find(s => lead.test(s));
  expect(hit, `a sentence reads "${top.count} of ${HEAT.total} students …" (sentences: ${JSON.stringify(sentences)})`).toBeTruthy();
  expect(hit.toLowerCase(), 'that sentence names the mistake').toContain(top.note.toLowerCase());
});

test('summary is drawn from the heat-map it is given, not from the sample', () => {
  const summary = fn(loadTA(), 'summary');
  const heat = { lab: 'lab1', total: 40, cells: [
    { hole: 'h20', count: 3,  note: 'R2 in the wrong row' },
    { hole: 'c5',  count: 11, note: 'LED1 backwards' },
  ] };
  const sentences = sentencesOf(summary, heat);
  expect(sentences.length, 'the summary has sentences').toBeGreaterThan(0);
  const hit = sentences.find(s => /\b11 of 40 students\b/.test(s));
  expect(hit, `a sentence reads "11 of 40 students …" (sentences: ${JSON.stringify(sentences)})`).toBeTruthy();
  expect(hit, 'that sentence names the mistake').toMatch(new RegExp(reEsc('LED1 backwards'), 'i'));
  for (const s of sentences) {
    expect(s, 'each summary sentence holds a number').toMatch(/\d/);
    expect(s, 'no sample total leaks in').not.toMatch(new RegExp(`\\b${HEAT.total}\\b`));
  }
});
