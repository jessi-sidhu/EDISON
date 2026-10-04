// The viewer's ?circuit= hook (issue #147): circuit3d/viewer.html
// renders the .sparky named by ?circuit=, but only through
// UiFlag.allowedCircuit; anything else, such as ?circuit=../backend/server.js,
// falls back to ../demo.sparky (contract: docs/API-CONTRACT.md → "Edison and
// the course hub" → Page hooks).
//
// Run with:  npm test
//
// The second test runs the viewer's own inline script in a Node vm, after the
// real edison/ui-flag.js, and records the URL it fetches. Only the page's
// surroundings are stubbed: App (the scene, controls and breadboard that
// scene.js and breadboard.js would make), fetch (records the URL, never
// resolves), location, document and localStorage. The viewer drawing the
// circuit is e2e/parts.spec.js's job.

const assert = require('node:assert');
const fs     = require('node:fs');
const path   = require('node:path');
const vm     = require('node:vm');

const ROOT = path.join(__dirname, '..');
const VIEWER = path.join(ROOT, 'circuit3d/viewer.html');
const FLAG   = path.join(ROOT, 'edison/ui-flag.js');

test('viewer.html loads ui-flag.js and gates ?circuit= with allowedCircuit', () => {
  const html = fs.readFileSync(require.resolve('../circuit3d/viewer.html'), 'utf8');
  expect(html).toMatch(/<script src="\.\.\/edison\/ui-flag\.js"><\/script>/);
  expect(html).toMatch(/UiFlag\.allowedCircuit\(/);
});

// Opens viewer.html at `search` and returns the path it fetched, resolved the
// way the browser would from /circuit3d/viewer.html.
function viewerFetches(search) {
  assert.ok(fs.existsSync(FLAG), `edison/ui-flag.js should exist (viewer.html loads it): ${path.relative(ROOT, FLAG)}`);
  const html = fs.readFileSync(VIEWER, 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(inline.length > 0, 'viewer.html has its inline script');

  const page = 'http://localhost:5001/circuit3d/viewer.html' + search;
  const fetched = [];
  const store = new Map();
  const win = vm.createContext({
    URL, URLSearchParams, console,
    location: { search, href: page },
    document: { documentElement: { dataset: {} } },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } },
    fetch: url => { fetched.push(String(url)); return new Promise(() => {}); },
    requestAnimationFrame: () => 0,
    App: {
      createBreadboard: () => ({ group: {}, getHole: () => null }),
      scene: { add() {} }, controls: { update() {} }, renderer: { render() {} }, camera: {},
    },
  });
  win.window = win;

  vm.runInContext(fs.readFileSync(FLAG, 'utf8'), win, { filename: 'edison/ui-flag.js' });
  assert.strictEqual(typeof win.UiFlag, 'object', 'edison/ui-flag.js puts UiFlag on window in a page');
  for (const src of inline) vm.runInContext(src, win, { filename: 'circuit3d/viewer.html' });

  assert.strictEqual(fetched.length, 1, `the viewer fetches one circuit (fetched: ${fetched.join(', ') || 'nothing'})`);
  return new URL(fetched[0], page).pathname;
}

test.each([
  ['?circuit=edison/demo/inverting-amp.sparky', '/edison/demo/inverting-amp.sparky'],
  ['?circuit=circuit3d/labs/lab1.sparky', '/circuit3d/labs/lab1.sparky'],
  ['?ui=edison&circuit=edison/demo/inverting-amp.sparky', '/edison/demo/inverting-amp.sparky'],
  // Refused: each falls back to the demo circuit.
  ['?circuit=../backend/server.js', '/demo.sparky'],
  ['?circuit=edison/../backend/x.sparky', '/demo.sparky'],
  ['?circuit=https://evil.example/x.sparky', '/demo.sparky'],
  ['?circuit=edison/demo/x.js', '/demo.sparky'],
  ['?circuit=', '/demo.sparky'],
  ['', '/demo.sparky'],
])('viewer.html%s fetches %s', (search, want) => {
  expect(viewerFetches(search)).toBe(want);
});
