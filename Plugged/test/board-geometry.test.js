// Tests for circuit3d/js/board-geometry.js: the board's size, one copy for the
// browser (breadboard.js, app.js) and for Node (server.js's prompt, the test
// recipes). Issue #22: the board has 63 columns.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const FILE = path.join(__dirname, '..', 'circuit3d', 'js', 'board-geometry.js');

// Loaded inside each test, so a missing file fails the test that needs it.
function load() {
  assert.ok(fs.existsSync(FILE), 'circuit3d/js/board-geometry.js does not exist yet');
  return require(FILE);
}

test('the board has 63 columns', () => {
  assert.equal(load().COLS, 63);
});

test('it loads in Node with no window or THREE', () => {
  assert.equal(typeof globalThis.window, 'undefined', 'this test must run without a window');
  assert.equal(typeof globalThis.THREE, 'undefined', 'this test must run without THREE');
  const G = load();
  assert.equal(typeof G, 'object');
  assert.equal(typeof G.COLS, 'number');
});

test('hole spacing and the board depth are unchanged', () => {
  const G = load();
  assert.equal(G.HS, 0.40);
  assert.equal(G.MARGIN_X, 0.90);
  assert.equal(G.BOARD_THICK, 0.38);
  assert.equal(G.BOARD_D, 7.9);
});

test('BOARD_W is derived from COLS: (COLS - 1) * HS + 2 * MARGIN_X, 26.6 at 63 columns', () => {
  const G = load();
  assert.ok(Math.abs(G.BOARD_W - ((G.COLS - 1) * G.HS + 2 * G.MARGIN_X)) < 1e-9,
    `BOARD_W ${G.BOARD_W} is not (COLS - 1) * HS + 2 * MARGIN_X`);
  assert.ok(Math.abs(G.BOARD_W - 26.6) < 1e-9, `expected BOARD_W 26.6, got ${G.BOARD_W}`);
});

test('the rows, their Z positions and the rail polarity (#61: bp is +) are as expected', () => {
  const G = load();
  assert.deepStrictEqual(G.ALL_ROWS,  ['tp', 'tn', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'bn', 'bp']);
  assert.deepStrictEqual(G.BODY_ROWS, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
  assert.deepStrictEqual(G.RAIL_ROWS, ['tp', 'tn', 'bn', 'bp']);
  assert.deepStrictEqual(G.ROW_Z, {
    tp: -3.35, tn: -2.95,
    a: -2.15, b: -1.75, c: -1.35, d: -0.95, e: -0.55,
    f:  0.55, g:  0.95, h:  1.35, i:  1.75, j:  2.15,
    bn: 2.95, bp: 3.35,
  });
  assert.deepStrictEqual(G.RAIL_IS_POS, { tp: true, tn: false, bn: false, bp: true });
});

// Issue #61: the bottom rails were drawn backwards, red on bn. The names are
// what the AI prompt and saved files use (bp_N = +, bn_N = GND), so the
// colours follow the names: the bottom red rail is bp and the blue one is bn,
// in the same order as the top (the + rail is the outer one, by the edge).
test('the bottom rail drawn red is bp and the blue one is bn, in the top\'s order', () => {
  const G = load();
  const red  = side => G.RAIL_ROWS.filter(r => G.RAIL_IS_POS[r]  && Math.sign(G.ROW_Z[r]) === side);
  const blue = side => G.RAIL_ROWS.filter(r => !G.RAIL_IS_POS[r] && Math.sign(G.ROW_Z[r]) === side);
  assert.deepStrictEqual(red(-1),  ['tp'], 'top red rail');
  assert.deepStrictEqual(blue(-1), ['tn'], 'top blue rail');
  assert.deepStrictEqual(red(1),   ['bp'], 'bottom red rail');
  assert.deepStrictEqual(blue(1),  ['bn'], 'bottom blue rail');
  // Same order on both halves: the red (+) rail is the one nearer the board edge.
  for (const [pos, neg] of [['tp', 'tn'], ['bp', 'bn']]) {
    assert.ok(Math.abs(G.ROW_Z[pos]) > Math.abs(G.ROW_Z[neg]),
      `${pos} (+, red) should be outside ${neg} (−, blue)`);
  }
});

// The board description sent with every AI question (breadboard.js's
// App.boardTopologyText) must agree with the colours and with the server's
// second-battery recipe, which puts + on bp_N and GND on bn_N.
test('the AI board description calls bp the + bottom rail and bn GND, like the server prompt', () => {
  const G = load();
  const src = fs.readFileSync(path.join(__dirname, '..', 'circuit3d', 'js', 'breadboard.js'), 'utf8');
  const window = { App: { BOARD_GEOMETRY: G } };
  new Function('window', src)(window);
  const text = window.App.boardTopologyText();
  assert.match(text, /bp = positive bottom rail \(\+9V\), bn = negative bottom rail \(GND\)/);
  assert.doesNotMatch(text, /bn = positive/);
  const server = fs.readFileSync(path.join(__dirname, '..', 'backend', 'server.js'), 'utf8');
  assert.match(server, /bp_N \(\+\) and bn_N \(GND\)/, 'the server prompt should still put + on bp and GND on bn');
});

test('TOTAL_HOLES is COLS x rows: 882 at 63 columns', () => {
  const G = load();
  assert.equal(G.TOTAL_HOLES, G.COLS * G.ALL_ROWS.length);
  assert.equal(G.TOTAL_HOLES, 882);
});

// The landing page's 3D preview (circuit3d/viewer.html) draws demo.sparky's
// battery at its saved position with no clamp, so the saved spot must already
// sit clear of the 63-column board. Read with fs: require('x.sparky') fails.
test('demo.sparky keeps every battery body clear of the 63-column board', () => {
  const G = load();
  const demo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'demo.sparky'), 'utf8'));
  const BATTERY_HALF_W = 2.0 / 2; // components.js buildBattery: W = 2.0
  const batteries = (demo.components || []).filter(c => c.type === 'battery' && c.position);
  assert.ok(batteries.length > 0, 'demo.sparky has no positioned battery to check');
  for (const b of batteries) {
    const inner = Math.abs(b.position.x) - BATTERY_HALF_W;
    assert.ok(inner > G.BOARD_W / 2,
      `${b.id} at x ${b.position.x}: its body's inner edge is at |x| ${inner}, ` +
      `not clear of the board edge at ${G.BOARD_W / 2}`);
  }
});
