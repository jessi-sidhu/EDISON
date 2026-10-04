// ─────────────────────────────────────────────────────────────
//  board-io.js — helpers for turning saved circuit data back into a board
//
//  EXPORTS
//  ───────
//  Browser: added to window.App
//  Node:    module.exports, so a test runner can call it.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const IO = factory();
  if (typeof module === 'object' && module.exports) module.exports = IO;
  if (root) Object.assign(root.App = root.App || {}, IO);
})(typeof window !== 'undefined' ? window : null, function () {

  // Saved wires point at parts by index, so a part that cannot be rebuilt
  // must still take up its slot. Returns one entry per saved part: what
  // place() returned, or null.
  function rebuildComponents(list, place) {
    return (list || []).map(c => {
      try { return place(c) || null; } catch { return null; }
    });
  }

  return { rebuildComponents };
});
