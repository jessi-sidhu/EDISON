// Issue #187 (Scene A): flush hole sockets everywhere, and the Edison grid
// floor groundwork with the instruments seated on a bench height.
// Issue #188 (Scene B): the ruled graphite slab's ruler; its tick maths is
// the pure rulerTicks() (section 3).
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
//      Node:    module.exports = { shouldRun, BENCH_Y, rulerTicks }  (loads with
//               no window or THREE; BENCH_Y reads BOARD_THICK from board-geometry.js)
//      Browser: window.SceneEnv, the same object. When shouldRun(<html>'s
//               dataset) is true it builds the 'scene-env' group, hides
//               'ground' and sets App.BENCH_Y = BENCH_Y.
//      shouldRun(dataset) → true only for data-ui="edison" without
//                           data-mode="hero".
//      BENCH_Y            → -(BOARD_THICK + 0.025), the bench height off-board
//                           parts sit on in Edison.
//      rulerTicks(cols, first = 1) → one tick per column first…cols:
//                           [{ col, x, inches, kind, len, label }], x the
//                           column's world x, inches (col-1)/10, kind 'inch'
//                           every 10th column from column 1, 'half' every 5th
//                           between, else 'tenth'; len 0.70 / 0.42 / 0.22;
//                           label '0', '1' … on inch ticks, else null.

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

// ── 3. The ruler's ticks (#188) ──────────────────────────────

// The issue's tick lengths, in from the front border.
const TICK_LEN = { inch: 0.70, half: 0.42, tenth: 0.22 };

function rulerTicks() {
  const mod = SceneEnv();
  assert.strictEqual(typeof mod.rulerTicks, 'function', `SceneEnv.rulerTicks is a function (exports: ${Object.keys(mod).join(', ')})`);
  return mod.rulerTicks;
}

test('rulerTicks(COLS): one tick per board column, 0 at column 1, inches every 10th column and halves every 5th', () => {
  const { COLS, HS } = GEOMETRY;
  const ticks = rulerTicks()(COLS);
  expect(ticks.map(t => t.col), `one tick per column 1…${COLS}`).toEqual(Array.from({ length: COLS }, (_, i) => i + 1));

  // Pin: the issue's landmarks, on this 63-column board (column 1 at x -12.4, column 63 at +12.4).
  const at   = col => ticks.find(t => t.col === col);
  const COL1 = -(COLS - 1) / 2 * HS;   // column 1's x, as breadboard.js lays the holes out
  const want = [
    // col  x                 inches            kind     label
    [1,     COL1,             0,                'inch',  '0'],
    [2,     COL1 + HS,        0.1,              'tenth', null],
    [6,     COL1 + 5 * HS,    0.5,              'half',  null],
    [11,    COL1 + 10 * HS,   1,                'inch',  '1'],
    [COLS,  -COL1,            (COLS - 1) / 10,  'tenth', null],
  ];
  expect(at(1).x, 'column 1 is at x -12.4').toBeCloseTo(-12.4, 9);
  expect(at(COLS).x, `column ${COLS} is at x 12.4`).toBeCloseTo(12.4, 9);
  for (const [col, x, inches, kind, label] of want) {
    const t = at(col);
    expect(t.x, `column ${col}'s x (expected ${x}, got ${t.x})`).toBeCloseTo(x, 9);
    expect(t.inches, `column ${col}'s inches (expected ${inches}, got ${t.inches})`).toBeCloseTo(inches, 9);
    expect({ kind: t.kind, len: t.len, label: t.label }, `column ${col}`).toEqual({ kind, len: TICK_LEN[kind], label });
  }

  // Every column: the kind cycles by ten from column 1, its length and label follow it.
  for (const t of ticks) {
    const n = t.col - 1;
    const kind = n % 10 === 0 ? 'inch' : n % 10 === 5 ? 'half' : 'tenth';
    expect(t.kind, `column ${t.col}'s kind`).toBe(kind);
    expect(t.len, `column ${t.col}'s length (${kind})`).toBe(TICK_LEN[kind]);
    expect(t.label, `column ${t.col}'s label`).toBe(kind === 'inch' ? String(n / 10) : null);
    expect(t.inches, `column ${t.col}'s inches`).toBeCloseTo(n / 10, 9);
  }
});

test('the ruler lines up with the board: each tick is at its column\'s hole x in breadboard.js, one hole pitch (HS) apart', () => {
  const { COLS, HS } = GEOMETRY;
  const ticks = rulerTicks()(COLS);
  for (let i = 1; i < ticks.length; i++) {
    expect(ticks[i].x - ticks[i - 1].x, `the pitch between columns ${i} and ${i + 1} is HS = ${HS}`).toBeCloseTo(HS, 9);
  }
  // The holes as breadboard.js lays them out (its col is 0-based).
  const holeX = new Map(buildBoard().holeData.map(h => [h.col + 1, h.x]));
  expect(holeX.size, 'breadboard.js has a hole x for every column').toBe(COLS);
  for (const t of ticks) {
    expect(t.x, `column ${t.col}'s tick is at its holes' x (expected ${holeX.get(t.col)}, got ${t.x})`).toBeCloseTo(holeX.get(t.col), 9);
  }
});

test('rulerTicks(cols, first) starts at column first, also left of column 1, where inches go negative', () => {
  const { HS } = GEOMETRY;
  const ticks = rulerTicks()(11, -9);
  expect(ticks.map(t => t.col), 'columns -9…11').toEqual(Array.from({ length: 21 }, (_, i) => i - 9));
  const col1 = ticks.find(t => t.col === 1);
  const left = ticks[0];   // column -9: ten columns left of column 1, an inch tick
  expect(left.x - col1.x, 'column -9 is 10 pitches left of column 1').toBeCloseTo(-10 * HS, 9);
  expect(left.inches).toBeCloseTo(-1, 9);
  expect({ kind: left.kind, len: left.len }).toEqual({ kind: 'inch', len: TICK_LEN.inch });
  expect(left.label, 'the inch left of 0 reads minus one').toMatch(/^[-\u2212]1$/);
  expect(ticks.find(t => t.col === -4).kind, 'column -4, half an inch left of 0').toBe('half');
  expect(ticks.find(t => t.col === 0).kind, 'column 0').toBe('tenth');
});
