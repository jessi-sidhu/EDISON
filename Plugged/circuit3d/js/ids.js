// ─────────────────────────────────────────────────────────────
//  ids.js — component names shared by the board export, saved files,
//  the AI and the code that applies AI actions.
//
//  EXPORTS
//  ───────
//  Browser: added to window.App
//  Node:    module.exports, so a test runner can call it.
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Ids = factory();
  if (typeof module === 'object' && module.exports) module.exports = Ids;
  if (root) Object.assign(root.App = root.App || {}, Ids);
})(typeof window !== 'undefined' ? window : null, function () {

  // "<type>_<n>", where n counts parts of that type only, so battery_0 is
  // always the first battery however many other parts come before it.
  function componentId(components, comp) {
    return comp.type + '_' + components.filter(c => c.type === comp.type).indexOf(comp);
  }

  // Two forms; null for anything else (holes like "a12" or "tp_5" included).
  //   "op_amp_0_pin2" -> { type: 'op_amp', n: 0, pin: 2 }   (type may hold "_")
  //   "U1.OUT"        -> { label: 'U1', pin: 'OUT' }        (label form)
  // pin is a number when it is all digits, a string otherwise.
  function parsePinRef(str) {
    const s = String(str);
    const pinOf = p => /^\d+$/.test(p) ? +p : p;
    let m = /^([a-z][a-z0-9_]*?)_(\d+)_pin(\w+)$/i.exec(s);
    if (m) return { type: m[1].toLowerCase(), n: +m[2], pin: pinOf(m[3]) };
    m = /^([a-z]+\d+)\.(\w+)$/i.exec(s);
    return m ? { label: m[1], pin: pinOf(m[2]) } : null;
  }

  function findComponent(components, type, n) {
    return components.filter(c => c.type === type)[n] || null;
  }

  return { componentId, parsePinRef, findComponent };
});
