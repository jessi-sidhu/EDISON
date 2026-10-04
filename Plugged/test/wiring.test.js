// Wiring checks for the browser pages. app.js, dashboard.html and the page
// scripts need WebGL and a DOM, so they cannot run under Node; these tests
// read their source to pin down that they load and call the tested modules.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

// Order of the <script src> tags on a page.
function scriptOrder(html) {
  return [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
}

test('Claude loads the code guide when working in Plugged/', () => {
  assert.match(read('CLAUDE.md'), /^@AGENTS\.md\s*$/m);
  assert.match(read('AGENTS.md'), /^# Plugged: code guide/m);
});

test('the editor keeps circuits under the signed-in user\'s key, loading storage.js first', () => {
  const order = scriptOrder(read('circuit3d/index.html'));
  assert.ok(order.indexOf('js/storage.js') >= 0 && order.indexOf('js/storage.js') < order.indexOf('js/app.js'),
    'storage.js must load before app.js: ' + order.join(', '));
  assert.match(read('circuit3d/js/app.js'),
    /const LS_KEY = SparkyStorage\.projectsKey\(SparkyStorage\.currentUid\(localStorage\)\)/);
});

test('both Firebase pages use the one shared config, for the plugged-hackathon project', () => {
  for (const page of ['landing.html', 'dashboard.html']) {
    const html = read(page);
    const order = scriptOrder(html);
    assert.ok(order.includes('firebase-config.js'), `${page} must load firebase-config.js`);
    assert.doesNotMatch(html, /apiKey:/, `${page} must not carry its own copy of the config`);
    assert.match(html, /firebase\.initializeApp\(window\.FIREBASE_CONFIG\)/);
  }
  assert.match(read('firebase-config.js'), /projectId:\s*"plugged-hackathon"/);
  assert.match(read('.firebaserc'), /"default":\s*"plugged-hackathon"/);
});

test('the Clear All confirmation says it can be undone, because it can', () => {
  const src = read('circuit3d/js/interaction.js');
  assert.doesNotMatch(src, /cannot be undone/);
  assert.match(src, /You can undo this with Ctrl\+Z/);
});

// Issue #23: the viewer builds a saved resistor through the registry helper
// App.buildPart (the resistor's view.build), not the old App.buildResistor.
test('the showcase viewer draws saved resistor values (via App.buildPart) and LED colours', () => {
  const src = read('circuit3d/viewer.html');
  assert.doesNotMatch(src, /App\.buildResistor\(/, 'viewer.html still builds resistors with App.buildResistor');
  assert.match(src, /App\.buildPart\(\s*['"]resistor['"]|App\.buildPart\(\s*c\.type\b/,
    'viewer.html should build a saved resistor with App.buildPart(type, legs, values)');
  assert.match(src, /c\.values/, 'the saved values are passed on');
  assert.match(src, /App\.buildLED\(hA, hB, c\.values\?\.color\)/);
});

test('the dashboard signs users in and out through storage.js and never deletes circuits', () => {
  const html = read('dashboard.html');
  assert.ok(scriptOrder(html).includes('circuit3d/js/storage.js'), 'dashboard must load storage.js');
  assert.match(html, /SparkyStorage\.signIn\(localStorage, user\.uid\)/);
  // Same key the editor uses, even when storage was too full to record the uid.
  assert.match(html, /LS_KEY\s*= SparkyStorage\.projectsKey\(SparkyStorage\.currentUid\(localStorage\)\)/);
  assert.match(html, /SparkyStorage\.signOut\(localStorage\)/);
  assert.doesNotMatch(html, /removeItem\(LS_KEY\)|\[LS_KEY, STARRED_KEY/, 'sign-out must not remove saved circuits');
});

// ── One copy of each number, issue #6 ───────────────────────────
//  Before the board grows to 63 columns, the camera view, the battery spot
//  and the part spans each live in one place. These count the copies.

const JS_DIR = 'circuit3d/js';
const editorSources = () => [
  ...fs.readdirSync(path.join(__dirname, '..', JS_DIR))
    .filter(f => f.endsWith('.js'))
    .map(f => ({ file: `${JS_DIR}/${f}`, src: read(`${JS_DIR}/${f}`) })),
  { file: 'circuit3d/index.html', src: read('circuit3d/index.html') },
];

// Every file (and how many times) a pattern appears in the editor's code.
function copiesOf(re) {
  const g = new RegExp(re.source, 'g');
  return editorSources()
    .map(({ file, src }) => ({ file, n: (src.match(g) || []).length }))
    .filter(x => x.n > 0);
}
const total = hits => hits.reduce((s, x) => s + x.n, 0);
const where = hits => hits.map(x => `${x.file} x${x.n}`).join(', ') || 'nowhere';

// The views as App.CAMERA in scene.js writes them. The numbers may change
// (issue #22 widens the board), but only there.
function cameraView(name) {
  const m = new RegExp(`${name}:\\s*\\{\\s*pos:\\s*\\[([^\\]]+)\\]`).exec(read('circuit3d/js/scene.js'));
  assert.ok(m, `App.CAMERA.${name} not found in scene.js`);
  return m[1].split(',').map(v => v.trim());
}
// "a, b, c" written with any spacing.
const numbersRe = nums => new RegExp('(?<![\\d.])' + nums.map(n => n.replace(/\./g, '\\.')).join(',\\s*') + '(?![\\d.])');

test('the home camera view is written once, as App.CAMERA in scene.js', () => {
  const hits = copiesOf(numbersRe(cameraView('home')));
  assert.equal(total(hits), 1, 'home camera position found in: ' + where(hits));
  assert.equal(hits[0].file, 'circuit3d/js/scene.js');
  const scene = read('circuit3d/js/scene.js');
  assert.match(scene, /App\.CAMERA\s*=/);
  assert.match(scene, /App\.resetCamera\s*=/);
  assert.match(read('circuit3d/js/app.js'), /App\.CAMERA\.home/, '_isCamDefault must read App.CAMERA.home');
});

test('the thumbnail camera view is written once', () => {
  const hits = copiesOf(numbersRe(cameraView('thumb')));
  assert.equal(total(hits), 1, 'thumbnail camera position found in: ' + where(hits));
});

test('the reset-camera button calls App.resetCamera() instead of its own copy of the view', () => {
  const html = read('circuit3d/index.html');
  const btn = /<button id="reset-cam-btn"[^>]*>/.exec(html);
  assert.ok(btn, 'reset-cam-btn not found');
  assert.match(btn[0], /App\.resetCamera\(\)/);
  assert.doesNotMatch(html, /camera\.position\.set\(\s*-?[\d.]+\s*,/, 'index.html still sets the camera position itself');
});

test('the battery margin is one named constant, not "BOARD_W / 2 + 2.5" in each file', () => {
  const hits = copiesOf(/\/\s*2\s*\+\s*2\.5\b/);
  assert.equal(total(hits), 0, '"/ 2 + 2.5" still found in: ' + where(hits));
  const defs = copiesOf(/BATTERY_MARGIN\s*=/);
  assert.equal(total(defs), 1, 'BATTERY_MARGIN defined in: ' + where(defs));
  assert.equal(total(copiesOf(/App\.batterySpot\s*=/)), 1, 'App.batterySpot must be defined once');
  assert.match(read('circuit3d/js/interaction.js'), /BATTERY_MARGIN|batterySpot\(/,
    'the user-placement clamp must share the margin');
});

test('chat.js has no battery spot of its own, and the preview asks for the same spot Accept uses', () => {
  const src = read('circuit3d/js/chat.js');
  assert.doesNotMatch(src, /BATTERY_SPOT/, 'chat.js still has its own BATTERY_SPOT');
  assert.doesNotMatch(src, /\bx:\s*13\b/, 'chat.js still hard-codes the battery at x: 13');
  const preview = /function sparkyPreviewActions[\s\S]*?\n {2}function /.exec(src);
  assert.ok(preview, 'sparkyPreviewActions not found');
  assert.match(preview[0], /batterySpot\(/, 'the preview ghost must read the spot from the board/App');
});

test('part spans are one App.SPANS table in app.js; the old names read from it', () => {
  const hits = copiesOf(/SPANS\s*=\s*\{/);
  assert.equal(total(hits), 1, 'span tables found in: ' + where(hits));
  assert.equal(hits[0].file, 'circuit3d/js/app.js');
  const app = read('circuit3d/js/app.js');
  assert.match(app, /App\.SPANS\s*=\s*\{\s*resistor:\s*4,\s*led:\s*2,\s*buzzer:\s*2,\s*button:\s*3\s*\}/);
  for (const [alias, key] of [['RESISTOR_SPAN', 'resistor'], ['LED_SPAN', 'led'],
                              ['BUZZER_SPAN', 'buzzer'], ['BUTTON_SPAN', 'button']]) {
    assert.match(app, new RegExp(`App\\.${alias}\\s*=\\s*(App\\.)?SPANS\\.${key}\\b`), `${alias} must read App.SPANS.${key}`);
  }
  assert.match(read('circuit3d/js/interaction.js'), /App\.SPANS/);
  assert.match(read('circuit3d/js/chat.js'), /App\.SPANS/);
});

test('App.exportState stays: e2e tests and debugging use it (issue #6, step 3 dropped)', () => {
  assert.match(read('circuit3d/js/app.js'), /App\.exportState\s*=\s*function/);
});

// ── Issue #20 follow-ups ─────────────────────────────────────────

// Loads playwright.config.js fresh with E2E_PORT set (or unset).
function e2eConfig(port) {
  const file = path.join(__dirname, '..', 'playwright.config.js');
  const saved = process.env.E2E_PORT;
  if (port == null) delete process.env.E2E_PORT; else process.env.E2E_PORT = String(port);
  try {
    delete require.cache[require.resolve(file)];
    return require(file);
  } finally {
    if (saved == null) delete process.env.E2E_PORT; else process.env.E2E_PORT = saved;
    delete require.cache[require.resolve(file)];
  }
}

test('browser tests use E2E_PORT when set, so two worktrees can run them side by side', () => {
  const cfg = e2eConfig(5091);
  assert.equal(cfg.use.baseURL, 'http://localhost:5091');
  assert.equal(cfg.webServer.url, 'http://localhost:5091/api/health');
  assert.equal(cfg.webServer.env.PORT, '5091');
});

test('browser tests still default to port 5090, written once', () => {
  const cfg = e2eConfig(null);
  assert.equal(cfg.use.baseURL, 'http://localhost:5090');
  assert.equal(cfg.webServer.url, 'http://localhost:5090/api/health');
  assert.equal(cfg.webServer.env.PORT, '5090');
  const src = read('playwright.config.js');
  assert.match(src, /const PORT = Number\(process\.env\.E2E_PORT\) \|\| 5090;/);
  assert.equal((src.match(/5090/g) || []).length - (src.match(/port 5090/gi) || []).length, 1,
    'the 5090 default should appear once in code (comments aside)');
});

test('the code guide names parts by label (BAT1), not battery_0', () => {
  const guide = read('AGENTS.md');
  assert.doesNotMatch(guide, /battery_0/, 'AGENTS.md still says battery_0');
  assert.match(guide, /\bBAT1\b/, 'AGENTS.md should name the battery BAT1');
  assert.match(guide, /\bBAT1\.0\b/, 'AGENTS.md should give battery pins as BAT1.0 / BAT1.1');
});

// ── 63-column board, issue #22 ──────────────────────────────────
//  The board's size lives in circuit3d/js/board-geometry.js, which Node can
//  load too. breadboard.js reads it instead of keeping its own GEOMETRY.

test('breadboard.js keeps no geometry numbers of its own', () => {
  const src = read('circuit3d/js/breadboard.js');
  for (const key of ['COLS', 'HS', 'MARGIN_X', 'BOARD_THICK', 'BOARD_D', 'ROW_Z', 'RAIL_IS_POS', 'ALL_ROWS']) {
    assert.doesNotMatch(src, new RegExp(`\\b${key}:\\s*[\\d.{\\[]`), `breadboard.js still defines ${key}`);
  }
  assert.doesNotMatch(src, /GEOMETRY\.(BOARD_W|TOTAL_HOLES)\s*=/, 'breadboard.js still works out BOARD_W / TOTAL_HOLES itself');
});

test('both 3D pages load js/board-geometry.js before js/breadboard.js', () => {
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const order = scriptOrder(read(page));
    const geo = order.indexOf('js/board-geometry.js'), bb = order.indexOf('js/breadboard.js');
    assert.ok(geo >= 0, `${page} does not load js/board-geometry.js: ${order.join(', ')}`);
    assert.ok(bb >= 0 && geo < bb, `${page} must load board-geometry.js before breadboard.js: ${order.join(', ')}`);
  }
});

test('no editor or server file says COLS: 50', () => {
  const files = [...editorSources(),
    { file: 'circuit3d/viewer.html', src: read('circuit3d/viewer.html') },
    { file: 'backend/server.js',     src: read('backend/server.js') }];
  const hits = files.filter(({ src }) => /\bCOLS\s*[:=]\s*50\b/.test(src)).map(x => x.file);
  assert.deepEqual(hits, [], 'COLS: 50 still in');
});

// ── The resistor in the parts registry, issue #23 ───────────────
//  Both 3D pages load parts/registry.js, then every part file in
//  parts/index.js's FILES order, before components.js and the modules that
//  read the registry. components.js keeps the shared 3D helpers (App.partCtx,
//  App.buildPart); the resistor's own model lives in parts/resistor.js.

// parts/index.js's FILES list, read from its source.
function partFiles() {
  const m = /const FILES\s*=\s*\[([^\]]*)\]/.exec(read('circuit3d/js/parts/index.js'));
  assert.ok(m, 'parts/index.js must keep its FILES list');
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]);
}

// The source of one top-level function in a file, up to the next one.
function functionSource(src, re) {
  const start = src.search(re);
  if (start < 0) return null;
  const rest = src.slice(start + 1);
  const next = rest.search(/\n {2}(function |App\.\w+\s*=|\/\/ ──)/);
  return src.slice(start, next < 0 ? undefined : start + 1 + next);
}

test('both 3D pages load parts/registry.js, then every FILES entry in order, before components.js', () => {
  const files = partFiles();
  assert.ok(files.includes('resistor.js'), `parts/index.js FILES should list resistor.js: ${JSON.stringify(files)}`);
  const want = ['js/parts/registry.js'].concat(files.map(f => 'js/parts/' + f));
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    const order = scriptOrder(read(page));
    const parts = order.filter(s => s.startsWith('js/parts/') && s !== 'js/parts/index.js');
    assert.deepEqual(parts, want, `${page} should load ${want.join(', ')}; it loads ${parts.join(', ') || 'no part scripts'}`);
    const lastPart = Math.max(...want.map(s => order.indexOf(s)));
    for (const after of ['js/components.js', 'js/interaction.js', 'js/simulate.js', 'js/ids.js', 'js/app.js']) {
      const i = order.indexOf(after);
      if (i >= 0) assert.ok(lastPart < i, `${page}: the part scripts must load before ${after}: ${order.join(', ')}`);
    }
    assert.ok(order.indexOf('js/components.js') >= 0, `${page} loads js/components.js`);
  }
});

test('components.js defines the shared part helpers App.partCtx and App.buildPart', () => {
  const src = read('circuit3d/js/components.js');
  assert.match(src, /App\.partCtx\s*=/, 'App.partCtx({ ghost }) → ctx');
  assert.match(src, /App\.buildPart\s*=/, 'App.buildPart(type, legs, values, { ghost })');
});

test("components.js no longer carries the resistor's model or its colour code", () => {
  const src = read('circuit3d/js/components.js');
  assert.doesNotMatch(src, /function buildResistor\s*\(/, 'buildResistor moved to parts/resistor.js');
  assert.doesNotMatch(src, /resistorBands|DIGIT_COLORS/, 'the band colour code moved to parts/resistor.js');
  assert.doesNotMatch(src, /0xd4a96a/i, "the resistor's body colour moved to parts/resistor.js");
});

test('buildPreview is still the one ghost entry point, with no resistor branch of its own', () => {
  const src = read('circuit3d/js/components.js');
  const preview = functionSource(src, /function buildPreview\s*\(/);
  assert.ok(preview, 'components.js must keep function buildPreview');
  assert.doesNotMatch(preview, /['"]resistor['"]/, 'buildPreview still has a resistor branch');
  assert.match(src, /App\.buildPreview\s*=/);
});

test("parts/resistor.js holds the resistor's model and draws only through ctx", () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'circuit3d/js/parts/resistor.js')), 'circuit3d/js/parts/resistor.js must exist');
  const src = read('circuit3d/js/parts/resistor.js');
  assert.match(src, /\bview\s*:/, 'a view: { build } section');
  assert.match(src, /\bbuild\s*\(\s*ctx\b|\bbuild\s*:\s*(function\s*)?\(\s*ctx\b/, 'view.build(ctx, values, controls, legs)');
  for (const hex of ['d4a96a', '7c3aed', 'fcbf49', 'd4af37']) {
    assert.match(src, new RegExp(hex, 'i'), `the model's colour ${hex} (body / bands) lives here`);
  }
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
});

test('App.placeResistor keeps its signature and goes through the registry', () => {
  const src = read('circuit3d/js/app.js');
  const fn = functionSource(src, /App\.placeResistor\s*=\s*function\s*\(holeA, holeB, values, opts\)/);
  assert.ok(fn, 'App.placeResistor = function (holeA, holeB, values, opts) must stay');
  assert.match(fn, /checkValue\(/, 'values are checked with Parts.checkValue');
  assert.match(fn, /buildPart\(/, 'the model is built with App.buildPart');
  assert.doesNotMatch(fn, /buildResistor/, 'no App.buildResistor');
});

// Issue #24: the hole map (App.holeMap(), rebuilt from the records) replaces
// breadboard.js's per-hole `occupied` flag, which nothing ever set.
test("breadboard.js no longer carries the unused per-hole 'occupied' flag", () => {
  const hits = read('circuit3d/js/breadboard.js').split('\n').filter(l => /\boccupied\b/.test(l)).map(l => l.trim());
  assert.deepStrictEqual(hits, [], 'breadboard.js still mentions occupied');
});
