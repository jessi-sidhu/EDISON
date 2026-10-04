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
