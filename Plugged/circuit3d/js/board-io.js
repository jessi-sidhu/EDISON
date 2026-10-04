// ─────────────────────────────────────────────────────────────
//  board-io.js — helpers for turning saved circuit data back into a board
//
//  EXPORTS
//  ───────
//  Browser: added to window.App
//  Node:    module.exports, so a test runner can call it.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const inNode = typeof module === 'object' && module.exports;
  const IO = factory(inNode ? require('./ids.js') : root.App);   // ids.js loads first in the page
  if (inNode) module.exports = IO;
  if (root) Object.assign(root.App = root.App || {}, IO);
})(typeof window !== 'undefined' ? window : null, function (Ids) {

  // Saved wires point at parts by index, so a part that cannot be rebuilt
  // must still take up its slot. Returns one entry per saved part: what
  // place() returned, or null.
  function rebuildComponents(list, place) {
    return (list || []).map(c => {
      try { return place(c) || null; } catch { return null; }
    });
  }

  // Files saved before labels existed have none. Give each unlabelled record
  // the next free label for its type, in list order, without reusing any
  // label already in the file. Returns new records; the input is untouched.
  function assignMissingLabels(records) {
    const list  = records || [];
    const taken = list.filter(r => r && r.label);
    return list.map(r => {
      if (!r || r.label) return r;
      const out = { ...r, label: Ids.nextLabel(taken, r.type) };
      taken.push(out);
      return out;
    });
  }

  return { rebuildComponents, assignMissingLabels };
});
