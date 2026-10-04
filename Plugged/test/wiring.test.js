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

// Issue #60: an AI build's delete_all empties the board of the circuit being
// worked on, so accepting an AI build doesn't file a second saved record.
// Since #86 the Clear All button keeps the circuit too; new circuits come from
// the dashboard (the no-option App.clearAll() is what loading uses).
test("the AI's delete_all clears the board but keeps the circuit's id and name", () => {
  assert.match(read('circuit3d/js/chat.js'), /clearAll:\s*\(\) => App\.clearAll\(\{ keepCircuit: true \}\)/);
  assert.match(read('circuit3d/js/app.js'), /App\.clearAll = function \(\{ keepCircuit = false \} = \{\}\)/);
});

// Issue #23: the viewer builds a saved resistor through the registry helper
// App.buildPart (the resistor's view.build), not the old App.buildResistor.
// Issue #25: a saved LED goes the same way, its colour in c.values; the old
// App.buildLED is gone.
test('the showcase viewer draws saved resistor values and LED colours via App.buildPart', () => {
  const src = read('circuit3d/viewer.html');
  assert.doesNotMatch(src, /App\.buildResistor\(/, 'viewer.html still builds resistors with App.buildResistor');
  assert.match(src, /App\.buildPart\(\s*['"]resistor['"]|App\.buildPart\(\s*c\.type\b/,
    'viewer.html should build a saved resistor with App.buildPart(type, legs, values)');
  assert.match(src, /c\.values/, 'the saved values are passed on');
  assert.doesNotMatch(src, /App\.buildLED\(/, 'viewer.html still builds LEDs with App.buildLED; a saved LED is a registry part (#25)');
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

// Part spans: issue #53 removed the App.SPANS table and its *_SPAN aliases;
// spans come from each part's place.span.default. test/parts-tidy.test.js
// ("spans come from the registry, not an App.SPANS table") checks that.

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

// Issue #27 (D2) deletes the per-type wrappers: every placement (hand
// placement, rebuildBoard, chat.js, the e2e helpers) goes through
// App.placePart(type, holes | { x, z }, values, opts).
test('App.placeResistor is gone: placement goes through App.placePart', () => {
  const src = read('circuit3d/js/app.js');
  assert.doesNotMatch(src, /App\.placeResistor\b/, 'App.placeResistor is still defined or used in app.js');
  assert.match(src, /App\.placePart\s*=\s*function\s*\(type, where, values, opts\)/, 'App.placePart(type, where, values, opts) stays');
});

// Issue #24: the hole map (App.holeMap(), rebuilt from the records) replaces
// breadboard.js's per-hole `occupied` flag, which nothing ever set.
test("breadboard.js no longer carries the unused per-hole 'occupied' flag", () => {
  const hits = read('circuit3d/js/breadboard.js').split('\n').filter(l => /\boccupied\b/.test(l)).map(l => l.trim());
  assert.deepStrictEqual(hits, [], 'breadboard.js still mentions occupied');
});

// ── The LED in the parts registry, issue #25 ────────────────────
//  parts/led.js holds the LED's model, its ghost (the same view.build) and
//  its glow / dim (view.update). components.js and simulate.js lose their
//  LED-only code, including the "the only transparent mesh is the dome"
//  convention that lightUpLED / dimLED relied on.

test('parts/index.js lists led.js, so both 3D pages load it after registry.js', () => {
  assert.ok(partFiles().includes('led.js'), `parts/index.js FILES should list led.js: ${JSON.stringify(partFiles())}`);
});

test("components.js no longer carries the LED's model, colour table or ghost branch", () => {
  const src = read('circuit3d/js/components.js');
  assert.doesNotMatch(src, /function buildLED\s*\(/, 'buildLED moved to parts/led.js (view.build)');
  assert.doesNotMatch(src, /\bLED_TYPES\b/, 'the LED colour table moved to parts/led.js');
  const preview = functionSource(src, /function buildPreview\s*\(/);
  assert.ok(preview, 'components.js must keep function buildPreview');
  assert.doesNotMatch(preview, /['"]led['"]/, 'buildPreview still has an LED branch; the LED ghost is its view.build');
});

test('simulate.js no longer lights LEDs itself: no lightUpLED / dimLED / getDomeColor, no transparent-dome convention', () => {
  const src = read('circuit3d/js/simulate.js');
  for (const fn of ['lightUpLED', 'dimLED', 'getDomeColor']) {
    assert.doesNotMatch(src, new RegExp(`function ${fn}\\s*\\(`), `${fn} moved to parts/led.js view.update`);
  }
  assert.doesNotMatch(src, /material\.transparent/, 'no code may find the dome as "the transparent mesh"');
});

test("parts/led.js holds the LED's model and glow, drawing only through ctx", () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'circuit3d/js/parts/led.js')), 'circuit3d/js/parts/led.js must exist');
  const src = read('circuit3d/js/parts/led.js');
  assert.match(src, /\bview\s*:/, 'a view: { build, update } section');
  assert.match(src, /\bupdate\b/, 'view.update glows / dims the LED');
  for (const hex of ['ff2222', 'ffd21f', '35d94a', '3b82f6', 'f5f5f5']) {
    assert.match(src, new RegExp(hex, 'i'), `the dome colour ${hex} lives here`);
  }
  assert.doesNotMatch(src, /\bApp\b/, 'the part file must not reach into App; use ctx');
  assert.doesNotMatch(src, /\bdocument\b/, 'the part file must not touch document');
});

test('App.placeLED is gone: placement goes through App.placePart', () => {
  assert.doesNotMatch(read('circuit3d/js/app.js'), /App\.placeLED\b/, 'App.placeLED is still defined or used in app.js');
});

// ── Battery, buzzer and button in the parts registry, issue #26 ─────────
//  The last three parts move into parts/battery.js, buzzer.js and button.js,
//  and the old per-type code goes: simulate.js keeps no part-type literals,
//  no PROPS and no ledsOn / buzzersOn; its buzzer audio moves to the buzzer's
//  view.update and its button click handler to the gesture dispatcher
//  (circuit3d/js/gestures.js, wired up by app.js / interaction.js).
//  components.js loses the three models; rebuildBoard loses its per-type
//  table. The App.place* wrappers stay (issue #27 removes them).

const TYPE_LITERAL = /(['"])(battery|buzzer|button|led|resistor)\1/g;

test('parts/index.js lists battery.js, buzzer.js and button.js, so both 3D pages load them after registry.js', () => {
  const files = partFiles();
  for (const f of ['battery.js', 'buzzer.js', 'button.js']) {
    assert.ok(files.includes(f), `parts/index.js FILES should list ${f}: ${JSON.stringify(files)}`);
  }
});

test("simulate.js names no part type: no 'battery', 'buzzer', 'button', 'led' or 'resistor' literal", () => {
  const src = read('circuit3d/js/simulate.js');
  const hits = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => new RegExp(TYPE_LITERAL.source).test(l))
    .map(([n, l]) => `${n}: ${l.trim()}`);
  assert.deepStrictEqual(hits, [], 'part-type literals left in simulate.js');
});

test('PROPS, ledsOn and buzzersOn are gone from every editor and viewer file', () => {
  const files = [
    ...editorSources(),
    ...fs.readdirSync(path.join(__dirname, '..', JS_DIR, 'parts')).filter(f => f.endsWith('.js'))
      .map(f => ({ file: `${JS_DIR}/parts/${f}`, src: read(`${JS_DIR}/parts/${f}`) })),
    { file: 'circuit3d/viewer.html', src: read('circuit3d/viewer.html') },
  ];
  for (const name of ['PROPS', 'ledsOn', 'buzzersOn']) {
    const hits = files.filter(({ src }) => new RegExp(`\\b${name}\\b`).test(src)).map(x => x.file);
    assert.deepStrictEqual(hits, [], `${name} still in`);
  }
});

test('simulate.js no longer plays buzzers or handles button clicks: no AudioContext, capMesh, toggleButton or .pressed', () => {
  const src = read('circuit3d/js/simulate.js');
  assert.doesNotMatch(src, /AudioContext/, "the buzzer's tone moved to parts/buzzer.js view.update");
  assert.doesNotMatch(src, /\bcapMesh\b/, "the button's cap moved to parts/button.js view.update");
  assert.doesNotMatch(src, /\btoggleButton\b/, 'button clicks go through the gesture dispatcher');
  assert.doesNotMatch(src, /\.pressed\b/, "a button's state is its controls, read generically through elements()");
});

test('the editor loads js/gestures.js before js/app.js, and the page creates the dispatcher with Gestures.create', () => {
  const order = scriptOrder(read('circuit3d/index.html'));
  const g = order.indexOf('js/gestures.js');
  assert.ok(g >= 0, `circuit3d/index.html must load js/gestures.js: ${order.join(', ')}`);
  assert.ok(g < order.indexOf('js/app.js'), `gestures.js must load before app.js: ${order.join(', ')}`);
  const wiring = read('circuit3d/js/app.js') + read('circuit3d/js/interaction.js');
  assert.match(wiring, /Gestures\.create\(/, 'app.js or interaction.js creates the dispatcher');
});

test('rebuildBoard has no per-type table: no PLACE map, no part-type literal', () => {
  const fn = functionSource(read('circuit3d/js/app.js'), /function rebuildBoard\s*\(/);
  assert.ok(fn, 'app.js must keep function rebuildBoard');
  assert.doesNotMatch(fn, /\bPLACE\s*=\s*\{/, 'rebuildBoard still keeps its own type → place* table');
  assert.doesNotMatch(fn, new RegExp(TYPE_LITERAL.source), 'rebuildBoard still names part types');
});

test('App.placeBattery, placeBuzzer and placeButton are gone: placement goes through App.placePart', () => {
  const src = read('circuit3d/js/app.js');
  for (const name of ['placeBattery', 'placeBuzzer', 'placeButton']) {
    assert.doesNotMatch(src, new RegExp(`App\\.${name}\\b`), `App.${name} is still defined or used in app.js`);
  }
});

test('App.toggleButton stays, as a wrapper that flips controls.pressed', () => {
  const fn = functionSource(read('circuit3d/js/app.js'), /App\.toggleButton\s*=\s*function\s*\(comp\)/);
  assert.ok(fn, 'App.toggleButton = function (comp) must stay (e2e and the AI use it)');
  assert.match(fn, /controls\.pressed/, 'it sets the momentary control');
  assert.doesNotMatch(fn, /comp\.pressed\b/, 'no comp.pressed of its own');
  assert.doesNotMatch(fn, /requestAnimationFrame/, "the cap animation moved to parts/button.js view.update");
});

test("components.js no longer carries the battery, buzzer or button models, or their ghost branches", () => {
  const src = read('circuit3d/js/components.js');
  for (const fn of ['buildBattery', 'buildBuzzer', 'buildButton']) {
    assert.doesNotMatch(src, new RegExp(`function ${fn}\\s*\\(`), `${fn} moved to its part file's view.build`);
  }
  const preview = functionSource(src, /function buildPreview\s*\(/);
  assert.ok(preview, 'components.js must keep function buildPreview');
  assert.doesNotMatch(preview, /['"](battery|buzzer|button)['"]/, 'buildPreview still has a battery / buzzer / button branch');
});

test('the showcase viewer draws saved batteries, buzzers and buttons through App.buildPart', () => {
  const src = read('circuit3d/viewer.html');
  assert.doesNotMatch(src, /App\.build(Battery|Buzzer|Button)\(/, 'viewer.html still uses the old per-type builders');
});

// ── Issue #27 (D2): no part-type names left in the core code ────────────────
//  app.js, interaction.js, simulate.js, chat.js and server.js must not name
//  a part type in code: every per-type branch reads the registry instead.
//  What counts: a string literal ('…', "…" or a template with no ${}) whose
//  whole text is one of the five types, e.g. 'led' or "battery". Also
//  checked inside ${…} of a template. What doesn't count: comments, and a
//  type named inside longer text, e.g. the prompt's recipe prose ("put a
//  resistor in series") or 'Part types, e.g. ["led"]'. Rule of thumb: code
//  that compares or passes a type must get it from Parts, not spell it.

const PART_TYPES = ['battery', 'buzzer', 'button', 'led', 'resistor'];

// Every string literal in a JS source, with its line: [{ line, text }].
// Skips comments and regex literals; walks into ${…} inside templates.
function stringLiterals(src) {
  const out = [];
  let i = 0, line = 1;
  const stack = [];        // open template ${ … } brace depths
  let prev = '';           // last significant code character, for regex detection
  const regexCanStart = () => prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, i - 7), i).trimEnd());
  function readQuoted(q) {
    const startLine = line;
    let text = '';
    i++;
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') { text += src[i + 1]; i += 2; continue; }
      if (src[i] === '\n') line++;
      text += src[i++];
    }
    i++;
    out.push({ line: startLine, text });
  }
  function readTemplate() {
    // From just after a ` (or after the } closing a ${), up to ` or ${.
    const startLine = line;
    let text = '', hasExpr = false;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { text += src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') { hasExpr = true; i += 2; stack.push(0); prev = '{'; return { text, hasExpr, startLine, open: true }; }
      if (src[i] === '\n') line++;
      text += src[i++];
    }
    i++;
    return { text, hasExpr, startLine, open: false };
  }
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { const end = src.indexOf('*/', i + 2); line += (src.slice(i, end).match(/\n/g) || []).length; i = end + 2; continue; }
    if (c === '"' || c === "'") { readQuoted(c); prev = 'x'; continue; }
    if (c === '`') {
      i++;
      const t = readTemplate();
      if (!t.hasExpr) out.push({ line: t.startLine, text: t.text });
      if (!t.open) prev = 'x';
      continue;
    }
    if (c === '/' && regexCanStart()) {
      i++;
      let inClass = false;
      while (i < src.length && (inClass || src[i] !== '/')) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        i++;
      }
      i++;
      while (/[a-z]/i.test(src[i] || '')) i++;
      prev = 'x';
      continue;
    }
    if (stack.length && c === '{') { stack[stack.length - 1]++; }
    if (stack.length && c === '}') {
      if (stack[stack.length - 1] === 0) {
        stack.pop();
        i++;
        const t = readTemplate();   // the rest of the template after ${…}
        if (!t.open) prev = 'x';
        continue;
      }
      stack[stack.length - 1]--;
    }
    if (!/\s/.test(c)) prev = /[\w$]/.test(c) ? 'x' : c;
    i++;
  }
  return out;
}

test('the literal scanner finds quoted type names in code, and not in comments or longer text', () => {
  const src = [
    "if (c.type === 'led') x();          // a 'buzzer' in a comment",
    'const a = "battery", b = `resistor`;',
    "/* 'button' */ const re = /'led'/;",
    "const prose = 'put a resistor in series', eg = 'Part types, e.g. [\"led\"]';",
    'const t = `$' + '{c.type === "button" ? 1 : 2} and led`;',
  ].join('\n');
  const hits = stringLiterals(src).filter(s => PART_TYPES.includes(s.text)).map(s => `${s.line}:${s.text}`);
  assert.deepStrictEqual(hits, ['1:led', '2:battery', '2:resistor', '5:button']);
});

test("app.js, interaction.js, simulate.js, chat.js and server.js name no part type: no 'battery', 'buzzer', 'button', 'led' or 'resistor' literal", () => {
  const files = ['circuit3d/js/app.js', 'circuit3d/js/interaction.js', 'circuit3d/js/simulate.js',
                 'circuit3d/js/chat.js', 'backend/server.js'];
  const hits = [];
  for (const file of files) {
    const src = read(file);
    for (const s of stringLiterals(src)) {
      if (PART_TYPES.includes(s.text)) hits.push(`${file}:${s.line}: ${src.split('\n')[s.line - 1].trim()}`);
    }
  }
  assert.deepStrictEqual(hits, [], 'part-type literals left');
});

test('no page, script or browser test calls the deleted App.placeResistor / placeLED / placeBuzzer / placeButton / placeBattery', () => {
  const files = [
    ...editorSources(),
    { file: 'circuit3d/viewer.html', src: read('circuit3d/viewer.html') },
    ...fs.readdirSync(path.join(__dirname, '..', 'e2e')).filter(f => f.endsWith('.js'))
      .map(f => ({ file: `e2e/${f}`, src: read(`e2e/${f}`) })),
  ];
  const hits = files.filter(({ src }) => /\bApp\.place(Resistor|LED|Buzzer|Button|Battery)\b/.test(src)).map(x => x.file);
  assert.deepStrictEqual(hits, [], 'App.place<Type> still used in');
});

test('viewer.html builds every saved part from the registry, with no part type of its own', () => {
  const src = read('circuit3d/viewer.html');
  assert.match(src, /Parts\.get\(\s*c\.type\s*\)/, 'the viewer looks each saved part up in the registry');
  assert.match(src, /App\.buildPart\(\s*c\.type\b/, 'and draws it with App.buildPart(c.type, …)');
  const hits = stringLiterals(src).filter(s => PART_TYPES.includes(s.text)).map(s => `${s.line}: ${s.text}`);
  assert.deepStrictEqual(hits, [], 'part-type literals in viewer.html');
});

// ── The potentiometer, issue #31 ──────────────────────────────────
//  The first footprint + slider part. Both 3D pages load it through the
//  FILES-order check above; the docs get its pattern and one QA case.

test('parts/index.js lists potentiometer.js, so both 3D pages load it after registry.js', () => {
  const files = partFiles();
  assert.ok(files.includes('potentiometer.js'), `parts/index.js FILES should list potentiometer.js: ${JSON.stringify(files)}`);
  for (const page of ['circuit3d/index.html', 'circuit3d/viewer.html']) {
    assert.ok(scriptOrder(read(page)).includes('js/parts/potentiometer.js'), `${page} loads js/parts/potentiometer.js`);
  }
});

test('docs/API-CONTRACT.md has a "Pattern: footprint + slider" section with potentiometer.js as the example', () => {
  const doc = read('../docs/API-CONTRACT.md');
  const m = /^(#{2,4}) Pattern: footprint \+ slider\b.*$/m.exec(doc);
  assert.ok(m, 'a "Pattern: footprint + slider" heading in docs/API-CONTRACT.md');
  const rest = doc.slice(m.index + m[0].length);
  const next = rest.search(new RegExp(`^#{2,${m[1].length}} `, 'm'));
  const section = next < 0 ? rest : rest.slice(0, next);
  assert.match(section, /potentiometer\.js/, 'the section names potentiometer.js as its example');
});

test('docs/QA.md has an AI case for "Make an LED dimmer with a potentiometer"', () => {
  const qa = read('../docs/QA.md');
  const rows = qa.split('\n').filter(l => l.startsWith('|') && l.includes('Make an LED dimmer with a potentiometer'));
  assert.equal(rows.length, 1, 'one QA row sends the dimmer prompt');
  assert.match(rows[0], /^\| AI-\d+ \|/, 'it is an AI prompt check (AI-NN)');
});

// ── Photo capture, issue #140 ─────────────────────────────────────
//  photo-grid.js is a UMD module app.js's page uses, so it loads after ids.js
//  and before app.js. photo.js is the DOM layer on top of the chat, after
//  chat.js, with the sample photos' stored taps (samples/samples.js) before
//  it. board-model.js stays off the page (the nets are checked in Node).
//  photo-import.js uses Parts, Ids and App.BOARD_GEOMETRY, so it loads after
//  the part files, board-geometry.js and ids.js, and before app.js.

// The HTML of the element with this id, its own nested <div>s included.
function elementHtml(html, id) {
  const start = html.search(new RegExp(`<(\\w+)[^>]*\\bid="${id}"`));
  if (start < 0) return null;
  const tag = /^<(\w+)/.exec(html.slice(start))[1];
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return null;
}

test('the editor loads photo-grid.js and photo-import.js between ids.js and app.js, and samples/samples.js then photo.js after chat.js', () => {
  const order = scriptOrder(read('circuit3d/index.html'));
  const at = f => order.indexOf(f);
  const list = order.join(', ');
  for (const f of ['js/parts/registry.js', 'js/board-geometry.js', 'js/ids.js', 'js/photo-grid.js', 'js/photo-import.js',
                   'js/app.js', 'js/chat.js', 'samples/samples.js', 'js/photo.js']) {
    assert.ok(at(f) >= 0, `circuit3d/index.html loads ${f}: ${list}`);
  }
  assert.ok(at('js/ids.js') < at('js/photo-grid.js') && at('js/photo-grid.js') < at('js/app.js'),
    `photo-grid.js loads after ids.js and before app.js: ${list}`);
  assert.ok(at('js/ids.js') < at('js/photo-import.js') && at('js/photo-import.js') < at('js/app.js'),
    `photo-import.js loads after ids.js and before app.js: ${list}`);
  const lastPart = Math.max(...order.map((x, i) => (x.startsWith('js/parts/') ? i : -1)));
  assert.ok(lastPart < at('js/photo-import.js') && at('js/board-geometry.js') < at('js/photo-import.js'),
    `photo-import.js loads after every part file and board-geometry.js: ${list}`);
  assert.ok(at('js/chat.js') < at('js/photo.js'), `photo.js loads after chat.js: ${list}`);
  assert.ok(at('samples/samples.js') < at('js/photo.js'), `samples/samples.js loads before photo.js: ${list}`);
  assert.ok(!order.some(f => /board-model\.js$/.test(f)), `board-model.js is not on the page: ${list}`);
});

// ── Photo crops, issue #160 ───────────────────────────────────────
//  photo-crops.js (window.PhotoCrops) cuts each part's crop with
//  PhotoGrid.warp and photo.js calls it, so it loads after photo-grid.js and
//  before photo.js. flatten() and the crops share one way of scaling H to
//  the downsized photo: PhotoCrops.scaleH, not a second inline copy.
test('the editor loads photo-crops.js after photo-grid.js and before photo.js, and photo.js scales H with PhotoCrops.scaleH', () => {
  const order = scriptOrder(read('circuit3d/index.html'));
  const at = f => order.indexOf(f);
  const list = order.join(', ');
  assert.ok(at('js/photo-crops.js') >= 0, `circuit3d/index.html loads js/photo-crops.js: ${list}`);
  assert.ok(at('js/photo-grid.js') < at('js/photo-crops.js') && at('js/photo-crops.js') < at('js/photo.js'),
    `photo-crops.js loads after photo-grid.js and before photo.js: ${list}`);
  const src = read('circuit3d/js/photo.js');
  assert.match(src, /PhotoCrops\.scaleH\(/, 'photo.js scales H to the downsized photo with PhotoCrops.scaleH');
  assert.doesNotMatch(src, /H\[0\]\.map\(\s*q\s*=>\s*q\s*\*\s*sx\s*\)/, 'no inline copy of scaleH left in photo.js');
});

test('the 📷 button sits in the chat input row', () => {
  const row = elementHtml(read('circuit3d/index.html'), 'sparky-input-row');
  assert.ok(row, 'circuit3d/index.html has #sparky-input-row');
  assert.match(row, /<button\b[^>]*\bid="photo-btn"[^>]*>[\s\S]*?📷[\s\S]*?<\/button>/,
    '#sparky-input-row holds <button id="photo-btn">📷</button>');
});
