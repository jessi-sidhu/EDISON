// Tests for board-io.js: turning saved circuit data back into a board.

const assert = require('node:assert');
const { rebuildComponents } = require('../circuit3d/js/board-io.js');

test('a part that fails to rebuild leaves a null so later indexes line up', () => {
  const out = rebuildComponents(['ok', 'bad', 'ok2'], c => (c === 'bad' ? null : c.toUpperCase()));
  assert.deepEqual(out, ['OK', null, 'OK2']);
});

test('a part whose rebuild throws also leaves a null instead of aborting the load', () => {
  const out = rebuildComponents(['ok', 'boom'], c => { if (c === 'boom') throw new Error('bad hole'); return c; });
  assert.deepEqual(out, ['ok', null]);
});
