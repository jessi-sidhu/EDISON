// Test-only parts, never loaded by the app (issue #27).
//
// withGizmos(n) registers n extra span parts ("gizmo_a", "gizmo_b", ...) in
// the real parts registry, then loads backend/server.js again, so the server
// builds its tools and prompt with them in. It proves the tools and prompt
// are generated from the registry: nothing in server.js names a gizmo.
//
// It changes the shared registry for the rest of the test file, so call it
// only from the last tests in a file.

const testSpan = require('./parts/test_span.js');
const Parts    = require('../../circuit3d/js/parts');

const LETTERS = 'ABCDEFGHIJKLMNOP';

// Gizmo i: type gizmo_<letter>, name "Gizmo <LETTER>", prefix G<LETTER>,
// 2–6 columns apart (3 is typical), keyword "gizmo".
function gizmo(i) {
  const L = LETTERS[i];
  const d = testSpan();
  Object.assign(d, { type: 'gizmo_' + L.toLowerCase(), name: 'Gizmo ' + L, prefix: 'G' + L });
  d.place = { kind: 'span', span: { min: 2, max: 6, default: 3 }, rotations: ['h', 'v'] };
  d.ai    = { about: 'A test-only gizmo.', keywords: ['gizmo'] };
  d.examples[0].parts[1] = { type: d.type, label: d.prefix + '1', holes: ['a3', 'a7'] };
  d.examples[0].expect   = { [d.prefix + '1']: { current: [8.5, 9.5] } };
  return d;
}

function withGizmos(n) {
  const defs = [];
  for (let i = 0; i < n; i++) {
    const d = gizmo(i);
    defs.push(Parts.get(d.type) || Parts.define(d));
  }
  const file = require.resolve('../../backend/server.js');
  delete require.cache[file];
  const Server = require(file);
  return { Server, gizmos: defs };
}

module.exports = { withGizmos };
