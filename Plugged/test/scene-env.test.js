// Issue #187 (Scene A): flush hole sockets everywhere, and the Edison grid
// floor groundwork with the instruments seated on a bench height.
//
// Run with:  npm test
//
// Two pure pieces are checked here; the page half (the scene-env group in
// Edison, the hidden ground, the seated instruments, the sunk holes in both
// UIs) is e2e/scene-env.spec.js.
//
// 1. The holes (circuit3d/js/breadboard.js). The hole cylinders were centred on
//    y = 0, so they stood 0.21 above the board as black pegs. Sunk, their cap
//    sits 0.005 above the board's top face (so the Connections and Thevenin
//    hole glows still show). breadboard.js runs as written in a Node vm with
//    a small THREE stand-in that records positions and the cylinder's height;
//    everything else THREE or the DOM gives is an inert stand-in.
//
// 2. circuit3d/js/scene-env.js, UMD like board-geometry.js. The API these
//    tests are written against:
//      Node:    module.exports = { shouldRun, BENCH_Y }  (loads with no window
//               or THREE; BENCH_Y reads BOARD_THICK from board-geometry.js)
//      Browser: window.SceneEnv, the same object. When shouldRun(<html>'s
//               dataset) is true it builds the 'scene-env' group, hides
//               'ground' and sets App.BENCH_Y = BENCH_Y.
//      shouldRun(dataset) → true only for data-ui="edison" without
//                           data-mode="hero".
//      BENCH_Y            → -(BOARD_THICK + 0.025), the bench height off-board
//                           parts sit on in Edison.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const JS         = path.join(__dirname, '..', 'circuit3d', 'js');
const BREADBOARD = path.join(JS, 'breadboard.js');
const SCENE_ENV  = path.join(JS, 'scene-env.js');
const GEOMETRY   = require(path.join(JS, 'board-geometry.js'));

const HOLE_CAP = 0.005;   // the issue: the cap sits 0.005 above the board's top face

// ── 1. breadboard.js in a vm ─────────────────────────────────

// Anything: any property is another one, and it can be called or constructed.
function inert() {
  return new Proxy(function () {}, {
    get(t, k) {
      if (k === Symbol.toPrimitive) return () => 0;
      if (typeof k === 'symbol' || k in t) return t[k];
      return (t[k] = inert());
    },
    apply: () => inert(),
    construct: () => inert(),
  });
}

function vec(x = 0, y = 0, z = 0) {
  return {
    x, y, z,
    set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
    clone() { return vec(this.x, this.y, this.z); },
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; },
  };
}

class Object3D {
  constructor() { this.position = vec(); this.rotation = vec(); this.scale = vec(1, 1, 1); this.children = []; this.matrix = { y: 0 }; }
  add(c) { this.children.push(c); return this; }
  updateMatrix() { this.matrix = { y: this.position.y }; }
}
class Group extends Object3D {}
class Mesh extends Object3D {
  constructor(geometry, material) { super(); this.geometry = geometry || inert(); this.material = material; }
}
class InstancedMesh extends Mesh {
  constructor(geometry, material, count) { super(geometry, material); this.count = count; this.instanceY = []; this.instanceMatrix = {}; }
  setMatrixAt(i, m) { this.instanceY[i] = m.y; }
}
class BoxGeometry { constructor(width, height, depth) { this.parameters = { width, height, depth }; } }
class CylinderGeometry { constructor(radiusTop, radiusBottom, height) { this.parameters = { radiusTop, radiusBottom, height }; } }

// Runs breadboard.js and builds the board: App.createBreadboard()'s result.
function buildBoard() {
  const known = { Object3D, Group, Mesh, InstancedMesh, BoxGeometry, CylinderGeometry, Vector3: function (x, y, z) { return vec(x, y, z); } };
  const win = vm.createContext({
    THREE: new Proxy(known, { get: (t, k) => (k in t ? t[k] : (t[k] = inert())) }),
    document: inert(),
    console,
    App: { BOARD_GEOMETRY: GEOMETRY },
  });
  win.window = win;
  vm.runInContext(fs.readFileSync(BREADBOARD, 'utf8'), win, { filename: 'circuit3d/js/breadboard.js' });
  assert.strictEqual(typeof win.App.createBreadboard, 'function', 'breadboard.js sets App.createBreadboard');
  return win.App.createBreadboard();
}

test('the hole sockets are sunk: their cap sits 0.005 above the board\'s top face, not 0.21', () => {
  const bb   = buildBoard();
  const body = bb.group.children.find(c => c.name === 'bb-body');
  assert.ok(body, 'the board has its bb-body mesh');
  const holes = bb.holesMesh;
  assert.ok(holes instanceof InstancedMesh && holes.name === 'bb-holes', 'App.createBreadboard() returns holesMesh, the bb-holes InstancedMesh');

  const boardTop = body.position.y + body.geometry.parameters.height / 2;
  assert.ok(Math.abs(boardTop) < 1e-9, `the board's top face is at y = 0 (got ${boardTop})`);

  // The cap: the mesh's own y, plus the highest instance, plus half the cylinder.
  const instanceY = Math.max(...holes.instanceY);
  const cap = holes.position.y + instanceY + holes.geometry.parameters.height / 2;
  const above = cap - boardTop;
  expect(above, `the hole cap is ${HOLE_CAP} above the board's top face (expected ${HOLE_CAP}, got ${above.toFixed(4)})`)
    .toBeCloseTo(HOLE_CAP, 6);
});

// ── 2. scene-env.js ──────────────────────────────────────────

// Loaded per test, so a missing module fails each test by name.
function SceneEnv() {
  assert.ok(fs.existsSync(SCENE_ENV), 'circuit3d/js/scene-env.js does not exist yet');
  let mod;
  try { mod = require(SCENE_ENV); } catch (e) {
    assert.fail(`circuit3d/js/scene-env.js can't be loaded in Node: ${e.message.split('\n')[0]}`);
  }
  assert.strictEqual(typeof mod.shouldRun, 'function', `SceneEnv.shouldRun is a function (exports: ${Object.keys(mod || {}).join(', ')})`);
  return mod;
}

test.each([
  [{ ui: 'edison' },                 true],
  [{ ui: 'classic' },                false],
  [{},                               false],   // no data-ui: classic
  [{ ui: 'edison', mode: 'hero' },   false],   // the landing page's hero viewer
])('shouldRun(%o) is %s', (dataset, want) => {
  expect(SceneEnv().shouldRun(dataset), `shouldRun(${JSON.stringify(dataset)})`).toBe(want);
});

test('BENCH_Y is -(BOARD_THICK + 0.025), read from board-geometry.js', () => {
  const { BENCH_Y } = SceneEnv();
  assert.strictEqual(typeof BENCH_Y, 'number', `SceneEnv.BENCH_Y is a number (got ${BENCH_Y})`);
  const want = -(GEOMETRY.BOARD_THICK + 0.025);
  expect(BENCH_Y, `BENCH_Y (expected ${want}, got ${BENCH_Y})`).toBeCloseTo(want, 9);
});
