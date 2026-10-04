// Bug #59 (QA AI-09, AI-11): which part a wheel tick turns while simulating.
// A small part (the LDR is about 38 × 21 px at the home view) is easy to
// miss by a few pixels, and a near-miss used to zoom the camera. The agreed
// fix: a wheel on, or within ~15 px of, a scroll-gesture part's on-screen
// outline turns that part; when two are near, the nearest wins; the camera
// zooms only when none is near.
//
// The pick is a pure helper, so it is tested here without a browser.
//
// The API the builder matches (chosen here):
//   Gestures.pickScrollPart(pointer, candidates, maxPx) → candidate | null
//     pointer     { x, y }                  page pixels
//     candidates  [{ id, rect: { x, y, w, h } }, …]
//                 rect = the part's on-screen outline: top-left x, y (y
//                 grows downward), width w, height h, in page pixels.
//                 Extra fields on a candidate (e.g. comp) are allowed.
//     maxPx       how far outside a rect still counts (the app uses ~15).
//   Returns the candidate object itself (not a copy) whose rect is nearest
//   to the pointer, measured to the rect's nearest edge or corner
//   (Euclidean; 0 inside), if that distance is ≤ maxPx; otherwise null.
//   Pure: no document, no App, no THREE.
// Loading: in circuit3d/js/gestures.js, beside Gestures.create (Node
// module.exports = Gestures; browser window.Gestures).

const assert = require('node:assert');

let Gestures = null;
let loadError = null;
try { Gestures = require('../circuit3d/js/gestures.js'); } catch (e) { loadError = e; }

function pick(...args) {
  assert.ok(!loadError, 'circuit3d/js/gestures.js must load in Node: ' + (loadError && loadError.message));
  assert.equal(typeof Gestures.pickScrollPart, 'function',
    'gestures.js must export Gestures.pickScrollPart(pointer, candidates, maxPx)');
  return Gestures.pickScrollPart(...args);
}

// The LDR at the home view, roughly: 38 × 21 px with its top-left at (600, 400).
const LDR = { id: 'LDR1', rect: { x: 600, y: 400, w: 38, h: 21 } };
const idOf = c => (c ? c.id : null);

test('a pointer inside a part\'s outline picks that part, and returns the candidate object itself', () => {
  const got = pick({ x: 619, y: 410 }, [LDR], 15);
  assert.equal(idOf(got), 'LDR1', `inside LDR1's rect: expected LDR1, got ${JSON.stringify(got)}`);
  assert.strictEqual(got, LDR, 'returns the candidate it was given (so the caller can carry comp on it)');
});

test('8 px outside a part\'s outline (each side) still picks that part', () => {
  const sides = {
    left:   { x: 600 - 8,      y: 410 },
    right:  { x: 600 + 38 + 8, y: 410 },
    above:  { x: 619,          y: 400 - 8 },
    below:  { x: 619,          y: 400 + 21 + 8 },
  };
  for (const [side, p] of Object.entries(sides)) {
    const got = pick(p, [LDR], 15);
    assert.equal(idOf(got), 'LDR1', `8 px ${side} of LDR1 (${p.x}, ${p.y}): expected LDR1, got ${JSON.stringify(got)}`);
  }
});

test('20 px outside every outline picks nothing (null), so the wheel zooms', () => {
  for (const p of [{ x: 600 - 20, y: 410 }, { x: 619, y: 400 + 21 + 20 }]) {
    const got = pick(p, [LDR], 15);
    assert.strictEqual(got, null, `20 px from LDR1 at (${p.x}, ${p.y}): expected null, got ${JSON.stringify(got)}`);
  }
});

test('no candidates → null', () => {
  assert.strictEqual(pick({ x: 10, y: 10 }, [], 15), null);
});

test('the limit is maxPx: 14 px out picks the part at maxPx 15, 16 px out does not', () => {
  assert.equal(idOf(pick({ x: 600 + 38 + 14, y: 410 }, [LDR], 15)), 'LDR1', '14 px right of LDR1 is within 15');
  assert.strictEqual(pick({ x: 600 + 38 + 16, y: 410 }, [LDR], 15), null, '16 px right of LDR1 is beyond 15');
  assert.equal(idOf(pick({ x: 600 + 38 + 16, y: 410 }, [LDR], 20)), 'LDR1', 'with maxPx 20, 16 px out counts');
});

test('off a corner the distance is to the corner (Euclidean): 10,10 px out (14.1) picks, 12,12 px out (17.0) does not', () => {
  // Bottom-right corner of LDR1 is (638, 421).
  assert.equal(idOf(pick({ x: 638 + 10, y: 421 + 10 }, [LDR], 15)), 'LDR1', '√(10²+10²) ≈ 14.1 ≤ 15');
  assert.strictEqual(pick({ x: 638 + 12, y: 421 + 12 }, [LDR], 15), null, '√(12²+12²) ≈ 17.0 > 15, even though each axis is only 12');
});

test('two parts near the pointer: the nearest wins, whichever order they come in', () => {
  // RV1 sits 30 px to the right of LDR1. A pointer 5 px right of LDR1 is 25 px
  // left of RV1; a pointer 22 px right of LDR1 is 8 px left of RV1.
  const RV = { id: 'RV1', rect: { x: 638 + 30, y: 400, w: 30, h: 30 } };
  for (const list of [[LDR, RV], [RV, LDR]]) {
    const order = list.map(c => c.id).join(',');
    assert.equal(idOf(pick({ x: 638 + 5,  y: 410 }, list, 15)), 'LDR1', `[${order}] 5 px from LDR1, 25 px from RV1 → LDR1`);
    assert.equal(idOf(pick({ x: 638 + 22, y: 410 }, list, 15)), 'RV1',  `[${order}] 22 px from LDR1, 8 px from RV1 → RV1`);
  }
});

test('distance is to the rect\'s edge, not its centre: a big part whose edge is nearer beats a small one whose centre is nearer', () => {
  // Pointer at (500, 500).
  // BIG: 200 × 200, left edge 10 px to the right of the pointer → edge 10 px away, centre 110 px away.
  // SMALL: 4 × 4, its centre 14 px left of the pointer → edge 12 px away, centre 14 px away.
  const BIG   = { id: 'BIG',   rect: { x: 510, y: 400, w: 200, h: 200 } };
  const SMALL = { id: 'SMALL', rect: { x: 484, y: 498, w: 4,   h: 4 } };
  for (const list of [[BIG, SMALL], [SMALL, BIG]]) {
    const got = pick({ x: 500, y: 500 }, list, 15);
    assert.equal(idOf(got), 'BIG', `edge 10 px (BIG) vs edge 12 px (SMALL, centre 14 px): expected BIG, got ${idOf(got)}`);
  }
});

test('inside one part and near another: the one under the pointer wins', () => {
  const RV = { id: 'RV1', rect: { x: 638 + 3, y: 400, w: 30, h: 30 } };   // 3 px right of LDR1
  assert.equal(idOf(pick({ x: 636, y: 410 }, [RV, LDR], 15)), 'LDR1', 'inside LDR1 (distance 0) beats 5 px from RV1');
});
