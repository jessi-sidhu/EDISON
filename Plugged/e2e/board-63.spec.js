// The 63-column breadboard, issue #22. The board is built from
// circuit3d/js/board-geometry.js, the home and thumbnail views still show all
// of it, and a circuit saved on the old 50-column board opens in the same
// holes. Drives the board through window.App. Guest only; /api/ask is stubbed,
// no AI is called.
const { test, expect } = require('@playwright/test');
const GEOMETRY = require('../circuit3d/js/board-geometry.js');

async function openEditor(page) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer);
}

// Where the eight corners of the drawn board land in a camera's view, as NDC
// (x, y and z each in [-1, 1] when on screen). `view` is 'home' after
// App.resetCamera(), or 'thumb' for the angle saved thumbnails are shot from.
function cornersInView(page, view) {
  return page.evaluate(view => {
    let cam = App.camera;
    if (view === 'home') {
      App.camera.position.set(3, 40, -5);   // move away first, so reset has work to do
      App.controls.update();
      App.resetCamera();
    } else {
      // The thumbnail is rendered on the same canvas, so a copy of the camera
      // (same aspect and field of view) placed at App.CAMERA.thumb sees what it sees.
      cam = App.camera.clone();
      cam.position.set(...App.CAMERA[view].pos);
      cam.lookAt(...App.CAMERA[view].target);
    }
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const box = new THREE.Box3().setFromObject(App.state.breadboard.group);
    const pts = [];
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const p = new THREE.Vector3(x, y, z).project(cam);
          pts.push({ at: [x, y, z].map(v => +v.toFixed(2)), ndc: [p.x, p.y, p.z].map(v => +v.toFixed(3)) });
        }
    return { width: box.max.x - box.min.x, pts };
  }, view);
}

const offScreen = pts => pts.filter(p => p.ndc.some(v => v < -1 || v > 1));

test('the editor board has 63 columns, from board-geometry.js', async ({ page }) => {
  await openEditor(page);
  const board = await page.evaluate(() => {
    const bb = App.state.breadboard;
    return {
      geometry: JSON.parse(JSON.stringify(App.BOARD_GEOMETRY)),
      cols:     bb.COLS,
      holes:    bb.holeData.length,
      col62:    !!bb.getHole(62, 'a'),
      col63:    !!bb.getHole(63, 'a'),
      tp63:     App.formatHole(App.parseHole('tp_63')),
      topology: App.boardTopologyText(),
    };
  });
  expect(board.geometry.COLS).toBe(63);
  expect(board.geometry).toEqual(JSON.parse(JSON.stringify(GEOMETRY)));   // one source for page and Node
  expect(board.cols).toBe(63);
  expect(board.holes).toBe(63 * 14);
  expect(board.col62, 'hole a63 (col index 62) exists').toBe(true);
  expect(board.col63, 'there is no 64th column').toBe(false);
  expect(board.tp63).toBe('tp_63');
  expect(board.topology).toContain('Columns 1-63');
});

test('after reset view, the whole 63-column board is on screen', async ({ page }) => {
  await openEditor(page);
  const { width, pts } = await cornersInView(page, 'home');
  expect(width, 'drawn board width').toBeGreaterThan(GEOMETRY.BOARD_W);
  expect(width).toBeLessThan(GEOMETRY.BOARD_W + 0.5);
  expect(offScreen(pts), 'board corners outside the home view').toEqual([]);
});

test('after reset view, the AI battery spot beside the board is on screen', async ({ page }) => {
  await openEditor(page);
  const ndc = await page.evaluate(() => {
    App.resetCamera();
    App.camera.updateMatrixWorld();
    const s = App.batterySpot();
    const p = new THREE.Vector3(s.x, 0, s.z).project(App.camera);
    return [p.x, p.y, p.z];
  });
  expect(ndc.filter(v => v < -1 || v > 1), `battery spot NDC ${ndc}`).toEqual([]);
});

test('the thumbnail view shows the whole 63-column board, uncropped', async ({ page }) => {
  await openEditor(page);
  const { width, pts } = await cornersInView(page, 'thumb');
  expect(width).toBeGreaterThan(GEOMETRY.BOARD_W);
  expect(offScreen(pts), 'board corners outside the thumbnail view').toEqual([]);
});

// ── A circuit saved on the 50-column board ──────────────────────────────────
// Holes are saved as { col, row } with a 0-based column, so a hole keeps its
// name on the wider board. The battery was saved at x 13.2 (2.5 past the old
// board's end), which is now over the board; it must end up beside it.

const h = (col, row) => ({ col, row });
const W = (startHole, endHole, startCompIdx = -1, startPinIdx = -1, color = 0xef4444) =>
  ({ startHole, endHole, startCompIdx, startPinIdx, endCompIdx: -1, endPinIdx: -1, color });

// The 50-column era's one-LED recipe (battery wires on tp_50/tn_50), plus a
// resistor at the old board's far end, a46-a50.
const OLD_CIRCUIT = {
  id: 'fifty-column-e2e', name: 'Saved on the 50-column board',
  components: [
    { type: 'battery',  id: 'battery_0',  label: 'BAT1', values: { voltage: 9 },       holeRefs: null,                 position: { x: 13.2, z: -3.15 } },
    { type: 'resistor', id: 'resistor_0', label: 'R1',   values: { resistance: 330 },  holeRefs: [h(1, 'b'), h(5, 'b')], position: { x: 0, z: 0 } },
    { type: 'led',      id: 'led_0',      label: 'LED1', values: { color: 'red' },     holeRefs: [h(7, 'c'), h(5, 'c')], position: { x: 0, z: 0 } },
    { type: 'resistor', id: 'resistor_1', label: 'R2',   values: { resistance: 1000 }, holeRefs: [h(45, 'a'), h(49, 'a')], position: { x: 0, z: 0 } },
  ],
  wires: [
    W(null, h(49, 'tp'), 0, 0),
    W(null, h(49, 'tn'), 0, 1, 0x111111),
    W(h(2, 'tp'), h(1, 'a')),
    W(h(7, 'a'), h(7, 'tn'), -1, -1, 0x111111),
  ],
};

async function openSaved(page, data) {
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.goto('/circuit3d/index.html');
  await page.evaluate(d => sessionStorage.setItem('sparky_load_circuit', JSON.stringify(d)), data);
  await page.reload();
  await page.waitForFunction(() => window.App && App.state && App.state.breadboard && App.renderer
                                   && App.state.components.length > 0);
}

const HOLE = /^((tp|tn|bn|bp)_\d+|[a-j]\d+)$/;

test('a circuit saved on the 50-column board opens in the same holes, battery beside the board', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await openSaved(page, OLD_CIRCUIT);

  const out = await page.evaluate(() => {
    const s = App.exportState();
    const bat = App.state.components.find(c => c.type === 'battery');
    return {
      cols:   App.BOARD_GEOMETRY.COLS,
      halfW:  App.BOARD_GEOMETRY.BOARD_W / 2,
      margin: App.BATTERY_MARGIN,
      parts:  s.components.map(c => ({ id: c.id, holes: c.holes || null })),
      wires:  s.wires.map(w => [w.from, w.to]),
      bat:    { x: bat.group.position.x, z: bat.group.position.z },
    };
  });
  expect(out.cols, 'this checks an old save on the 63-column board').toBe(63);
  expect(out.parts).toEqual([
    { id: expect.anything(), holes: null },
    { id: expect.anything(), holes: ['b2', 'b6'] },
    { id: expect.anything(), holes: ['c8', 'c6'] },
    { id: expect.anything(), holes: ['a46', 'a50'] },
  ]);
  expect(out.wires.map(w => w.filter(e => HOLE.test(e)))).toEqual([
    ['tp_50'], ['tn_50'], ['tp_3', 'a2'], ['a8', 'tn_8'],
  ]);
  expect(out.bat.x, 'battery x must be past the 63-column board end').toBeGreaterThan(out.halfW);
  expect(out.bat.x).toBeCloseTo(out.halfW + out.margin, 2);
  expect(out.bat.z).toBeCloseTo(-3.15, 2);

  // Same holes, same circuit: the LED still lights from the old tp_50/tn_50 wires.
  await page.evaluate(() => App.runSimulation());
  await expect(page.locator('#sim-results')).toContainText('LED ON');
  await expect(page.locator('#sim-results')).not.toContainText('Short circuit');
  expect(errors).toEqual([]);
});
