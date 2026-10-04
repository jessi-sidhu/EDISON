// The camera framing helper, circuit3d/js/camera-frame.js (issue #67). After
// an AI build, or when a circuit is opened, the camera frames the parts: the
// AI recipes build at columns 2-9, the far-left end of the 63-column board,
// which at the home view is a ~40 px speck.
//
// The API the builder matches (chosen here):
//   CameraFrame.frameParts(items, opts) → { target: [x,y,z], pos: [x,y,z] }
//   items   an array; each is a point [x, y, z] or a box
//           { min: [x,y,z], max: [x,y,z] } (e.g. a part's Box3 as arrays).
//           A box counts the same as its 8 corners.
//   opts    { home: { pos, target },   App.CAMERA.home
//             fov,                     the camera's vertical fov, degrees
//             aspect,                  canvas width / height
//             minDistance }            the closest the camera may come
//   target  the centre of the items (their bounding box's centre).
//   pos     target + (home.pos - home.target) direction × d: the same viewing
//           angle as home, at a distance d that fits every item in view with
//           some margin, clamped to minDistance ≤ d ≤ |home.pos - home.target|.
//   No items → the home view itself ({ pos, target } copied from home).
// Pure: no THREE, no window, no DOM.
// Loading: Node module.exports = CameraFrame; browser window.CameraFrame.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const FILE = path.join(__dirname, '..', 'circuit3d', 'js', 'camera-frame.js');
const G    = require('../circuit3d/js/board-geometry.js');

// Loaded inside each test, so a missing file fails the test that needs it.
function load() {
  assert.ok(fs.existsSync(FILE), 'circuit3d/js/camera-frame.js does not exist yet');
  const mod = require(FILE);
  assert.equal(typeof mod.frameParts, 'function', 'CameraFrame.frameParts is not a function');
  return mod;
}

// The editor's camera (scene.js): App.CAMERA.home, a 42° vertical fov.
const HOME = { pos: [0, 22, 30], target: [0, 0, 0] };
const FOV  = 42;
const ASPECT = 1.5;
const MIN_D = 6;
const OPTS = { home: HOME, fov: FOV, aspect: ASPECT, minDistance: MIN_D };

const sub  = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot  = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len  = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const HOME_D = len(sub(HOME.pos, HOME.target));   // ≈ 37.2

// A hole's world position, as breadboard.js lays them out (col is 1-based).
const hole = (col, row) => [(col - 1 - (G.COLS - 1) / 2) * G.HS, 0, G.ROW_Z[row]];

// Where a world point lands in normalised device coordinates for a camera at
// pos looking at target (y up), the way THREE.PerspectiveCamera projects it.
function ndc(p, cam, fov, aspect) {
  const f = norm(sub(cam.target, cam.pos));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const v = sub(p, cam.pos);
  const z = dot(v, f);
  const t = Math.tan((fov * Math.PI / 180) / 2);
  return [dot(v, r) / (z * t * aspect), dot(v, u) / (z * t), z];
}

function assertAllInView(points, cam, fov, aspect) {
  for (const p of points) {
    const [x, y, z] = ndc(p, cam, fov, aspect);
    assert.ok(z > 0, `point ${p} is behind the camera`);
    assert.ok(Math.abs(x) <= 1 && Math.abs(y) <= 1,
      `point ${p} is out of view: ndc (${x.toFixed(2)}, ${y.toFixed(2)})`);
  }
}

// The one-LED recipe (test/fixtures/recipes.js ONE_LED) on the board: R1
// b2-b6, LED1 c6-c8, wires tp_3 → a2 and a8 → tn_8, parts up to ~1 unit tall.
const SMALL = [
  hole(2, 'b'), hole(6, 'b'), hole(6, 'c'), hole(8, 'c'),
  hole(3, 'tp'), hole(2, 'a'), hole(8, 'a'), hole(8, 'tn'),
  [hole(6, 'c')[0], 1, hole(6, 'c')[2]],
  [hole(9, 'c')[0], 0, hole(9, 'c')[2]],
];
const centre = pts => {
  const lo = [0, 1, 2].map(i => Math.min(...pts.map(p => p[i])));
  const hi = [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])));
  return [0, 1, 2].map(i => (lo[i] + hi[i]) / 2);
};

// Every body and rail corner of the board, all 63 columns.
const FULL = [
  hole(1, 'tp'), hole(G.COLS, 'tp'), hole(1, 'bp'), hole(G.COLS, 'bp'),
  hole(1, 'a'), hole(G.COLS, 'j'),
];

test('it loads in Node with no window or THREE', () => {
  assert.equal(typeof globalThis.window, 'undefined', 'this test must run without a window');
  assert.equal(typeof globalThis.THREE, 'undefined', 'this test must run without THREE');
  load();
});

test('a small cluster at columns 2-9: the target is its centre, and the camera comes much closer than home', () => {
  const { target, pos } = load().frameParts(SMALL, OPTS);
  const c = centre(SMALL);
  assert.ok(Math.abs(target[0] - c[0]) < 0.3, `target x ${target[0]} is not near the cluster's centre x ${c[0].toFixed(2)}`);
  assert.ok(Math.abs(target[2] - c[2]) < 0.3, `target z ${target[2]} is not near the cluster's centre z ${c[2].toFixed(2)}`);
  const d = len(sub(pos, target));
  assert.ok(d < HOME_D / 2, `expected a distance well under home (${HOME_D.toFixed(1)}), got ${d.toFixed(2)}`);
  assert.ok(d >= MIN_D - 1e-9, `distance ${d.toFixed(2)} is under the minimum ${MIN_D}`);
  assertAllInView(SMALL, { pos, target }, FOV, ASPECT);
});

test('the camera keeps the home viewing angle', () => {
  const { target, pos } = load().frameParts(SMALL, OPTS);
  const want = norm(sub(HOME.pos, HOME.target));
  const got  = norm(sub(pos, target));
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(got[i] - want[i]) < 1e-6, `direction ${got} is not home's ${want}`);
  }
});

test('a full-width circuit: the distance is at most home, and every corner is in view', () => {
  const { target, pos } = load().frameParts(FULL, OPTS);
  const d = len(sub(pos, target));
  assert.ok(d <= HOME_D + 1e-6, `distance ${d.toFixed(2)} is past home (${HOME_D.toFixed(2)})`);
  assert.ok(Math.abs(target[0]) < 0.3, `a full-width circuit is centred on the board, target x ${target[0]}`);
  assertAllInView(FULL, { pos, target }, FOV, ASPECT);
});

test('a circuit too wide to fit a narrow canvas stops at the home distance', () => {
  const { target, pos } = load().frameParts(FULL, { ...OPTS, aspect: 0.4 });
  const d = len(sub(pos, target));
  assert.ok(Math.abs(d - HOME_D) < 1e-6, `expected the home distance ${HOME_D.toFixed(2)}, got ${d.toFixed(2)}`);
});

test('maxDistance lifts the home cap: the full board fits a narrow canvas (a lab beside its paper), every corner in view', () => {
  const { target, pos } = load().frameParts(FULL, { ...OPTS, aspect: 0.4, maxDistance: Infinity });
  const d = len(sub(pos, target));
  assert.ok(d > HOME_D, `expected past home (${HOME_D.toFixed(2)}) to fit, got ${d.toFixed(2)}`);
  assertAllInView(FULL, { pos, target }, FOV, 0.4);
});

test('a single point: the target is the point and the distance is the minimum, not closer', () => {
  const p = hole(30, 'c');
  const { target, pos } = load().frameParts([p], OPTS);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(target[i] - p[i]) < 1e-9, `target ${target} is not the point ${p}`);
  const d = len(sub(pos, target));
  assert.ok(Math.abs(d - MIN_D) < 1e-6, `expected the minimum distance ${MIN_D}, got ${d.toFixed(3)}`);
});

test('a box counts the same as its 8 corners', () => {
  const { frameParts } = load();
  const min = [-12, 0, -2.2], max = [-9, 0.8, -0.9];
  const corners = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push([x, y, z]);
  const a = frameParts([{ min, max }], OPTS);
  const b = frameParts(corners, OPTS);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(a.target[i] - b.target[i]) < 1e-9, `targets differ: ${a.target} vs ${b.target}`);
    assert.ok(Math.abs(a.pos[i] - b.pos[i]) < 1e-9, `positions differ: ${a.pos} vs ${b.pos}`);
  }
});

test('no items: the home view', () => {
  const { target, pos } = load().frameParts([], OPTS);
  assert.deepStrictEqual({ target, pos }, { target: HOME.target, pos: HOME.pos });
});
