// Tests for history.js: snapshot undo/redo.

const assert = require('node:assert');
const { createHistory } = require('../circuit3d/js/history.js');

// A "board" that is just a number. Each change snapshots first, as app.js does.
function counterBoard(limit) {
  const s = { n: 0 };
  const h = createHistory({ snapshot: () => s.n, apply: v => { s.n = v; }, limit: limit || 60 });
  const change = () => { h.push(); s.n++; };
  return { s, h, change };
}

test('a batch of changes is undone in one step', () => {
  const { s, h, change } = counterBoard();
  h.batch(() => { change(); change(); change(); });
  assert.equal(s.n, 3);
  assert.equal(h.undo(), true);
  assert.equal(s.n, 0);
  assert.equal(h.redo(), true);
  assert.equal(s.n, 3);
});

test('afterBatch runs once when a batch ends, even if it throws', () => {
  const s = { n: 0 };
  let after = 0;
  const h = createHistory({ snapshot: () => s.n, apply: v => { s.n = v; }, limit: 60,
                             afterBatch: () => { after++; } });
  h.batch(() => { h.push(); h.push(); });
  assert.throws(() => h.batch(() => { throw new Error('boom'); }), /boom/);
  assert.equal(after, 2);
});

test('history keeps at most limit entries, and clear empties it', () => {
  const { h, change } = counterBoard(2);
  for (let i = 0; i < 5; i++) change();
  assert.equal(h.size(), 2);
  h.clear();
  assert.equal(h.size(), 0);
  assert.equal(h.undo(), false);
});

// #199: an AI fix that fails part-way is taken back whole, and redo can't
// bring the half-applied board back.
test('revert undoes the last step and forgets it: no redo of it', () => {
  const s = { n: 0 };
  const h = createHistory({ snapshot: () => s.n, apply: v => { s.n = v; }, limit: 60 });
  h.batch(() => { s.n = 1; s.n = 2; });
  assert.strictEqual(h.revert(), true);
  assert.strictEqual(s.n, 0, 'back to before the batch');
  assert.strictEqual(h.redo(), false, 'nothing to redo');
  assert.strictEqual(s.n, 0);
  assert.strictEqual(h.revert(), false, 'nothing left to revert');
});
