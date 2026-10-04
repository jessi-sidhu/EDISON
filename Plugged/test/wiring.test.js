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

test('the showcase viewer draws saved resistor values and LED colours', () => {
  const src = read('circuit3d/viewer.html');
  assert.match(src, /App\.buildResistor\(hA, hB, c\.values\?\.resistance\)/);
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

test('the home camera view (0, 22, 30) is written once, as App.CAMERA in scene.js', () => {
  const hits = copiesOf(/22,\s*(z:\s*)?30\b/);
  assert.equal(total(hits), 1, 'home camera position found in: ' + where(hits));
  assert.equal(hits[0].file, 'circuit3d/js/scene.js');
  const scene = read('circuit3d/js/scene.js');
  assert.match(scene, /App\.CAMERA\s*=/);
  assert.match(scene, /App\.resetCamera\s*=/);
  assert.match(read('circuit3d/js/app.js'), /App\.CAMERA\.home/, '_isCamDefault must read App.CAMERA.home');
});

test('the thumbnail camera view (20, 22, 20) is written once', () => {
  const hits = copiesOf(/20,\s*22,\s*20/);
  assert.equal(total(hits), 1, 'thumbnail camera position found in: ' + where(hits));
});

test('the reset-camera button calls App.resetCamera() instead of its own copy of the view', () => {
  const html = read('circuit3d/index.html');
  const btn = /<button id="reset-cam-btn"[^>]*>/.exec(html);
  assert.ok(btn, 'reset-cam-btn not found');
  assert.match(btn[0], /App\.resetCamera\(\)/);
  assert.doesNotMatch(html, /position\.set\(\s*0\s*,\s*22\s*,\s*30\s*\)/, 'index.html still sets the camera to (0,22,30) itself');
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
