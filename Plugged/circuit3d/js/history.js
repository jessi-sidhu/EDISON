// ─────────────────────────────────────────────────────────────
//  history.js — snapshot undo/redo
//
//  Every board change snapshots the board before it runs, and undo
//  re-applies a snapshot rather than inverting the change.
//
//  EXPORTS
//  ───────
//  Browser: App.createHistory
//  Node:    module.exports, so a test runner can call it.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const H = factory();
  if (typeof module === 'object' && module.exports) module.exports = H;
  if (root) (root.App = root.App || {}).createHistory = H.createHistory;
})(typeof window !== 'undefined' ? window : null, function () {

  // afterBatch (optional) runs once when a batch ends, e.g. to refresh counts.
  function createHistory({ snapshot, apply, limit, afterBatch }) {
    const undoStack = [], redoStack = [];
    let batching = 0;

    function push() {
      if (batching) return;
      undoStack.push(snapshot());
      if (undoStack.length > limit) undoStack.shift();
      redoStack.length = 0;
    }
    function undo() {
      if (!undoStack.length) return false;
      redoStack.push(snapshot());
      apply(undoStack.pop());
      return true;
    }
    function redo() {
      if (!redoStack.length) return false;
      undoStack.push(snapshot());
      apply(redoStack.pop());
      return true;
    }
    // Many changes, one undo step: snapshot once, then mute push while fn runs.
    function batch(fn) {
      push();
      batching++;
      try { return fn(); } finally {
        batching--;
        if (afterBatch) afterBatch();
      }
    }

    // Undoes the last step and forgets it, with nothing to redo: an AI fix
    // that failed part-way is taken back whole (#199).
    function revert() {
      if (!undoStack.length) return false;
      apply(undoStack.pop());
      return true;
    }
    function clear() { undoStack.length = 0; redoStack.length = 0; }

    return { push, undo, redo, revert, batch, clear, size: () => undoStack.length };
  }

  return { createHistory };
});
