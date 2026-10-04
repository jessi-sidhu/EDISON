// Tests for board-io.js: turning saved circuit data back into a board.

const assert = require('node:assert');
const { rebuildComponents, assignMissingLabels } = require('../circuit3d/js/board-io.js');

test('a part that fails to rebuild leaves a null so later indexes line up', () => {
  const out = rebuildComponents(['ok', 'bad', 'ok2'], c => (c === 'bad' ? null : c.toUpperCase()));
  assert.deepEqual(out, ['OK', null, 'OK2']);
});

test('a part whose rebuild throws also leaves a null instead of aborting the load', () => {
  const out = rebuildComponents(['ok', 'boom'], c => { if (c === 'boom') throw new Error('bad hole'); return c; });
  assert.deepEqual(out, ['ok', null]);
});

// ── Old files without labels, issue #2 ────────────────────────────────────

test('an old file without labels gets them in list order', () => {
  const old = [{ type: 'resistor' }, { type: 'resistor' }, { type: 'led' }];
  const out = assignMissingLabels(old);
  assert.deepEqual(out.map(r => r.label), ['R1', 'R2', 'LED1']);
});

test('backfilling labels keeps the rest of each record', () => {
  const holeRefs = [{ col: 1, row: 'a' }, { col: 5, row: 'a' }];
  const out = assignMissingLabels([{ type: 'resistor', values: { resistance: 220 }, holeRefs }]);
  assert.deepEqual(out[0], { type: 'resistor', values: { resistance: 220 }, holeRefs, label: 'R1' });
});

test('existing labels stay, and a new one does not collide with them', () => {
  const out = assignMissingLabels([{ type: 'resistor', label: 'R5' }, { type: 'resistor' }]);
  assert.deepEqual(out.map(r => r.label), ['R5', 'R6']);
});

test('an unlabelled part before a labelled one does not take its label', () => {
  const out = assignMissingLabels([{ type: 'resistor' }, { type: 'resistor', label: 'R1' }]);
  assert.equal(out[1].label, 'R1');
  assert.notEqual(out[0].label, 'R1');
  assert.match(out[0].label, /^R\d+$/);
});

// rebuildComponents never changes what it is given; this matches it.
test('assignMissingLabels does not change the records it is given', () => {
  const old = [{ type: 'resistor' }, { type: 'led', label: 'LED3' }];
  const copy = JSON.parse(JSON.stringify(old));
  assignMissingLabels(old);
  assert.deepEqual(old, copy);
});

test('a file with no components list backfills to an empty list', () => {
  assert.deepEqual(assignMissingLabels(undefined), []);
});
