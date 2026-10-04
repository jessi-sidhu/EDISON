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

  // "battery_0_pin1" -> { type: 'battery', n: 0, pin: 1 }; null for anything else.
  function parsePinRef(str) {
    const m = /^([a-z]+)_(\d+)_pin(\d+)$/i.exec(String(str));
    return m ? { type: m[1].toLowerCase(), n: +m[2], pin: +m[3] } : null;
  }

  function findComponent(components, type, n) {
    return components.filter(c => c.type === type)[n] || null;
  }

  return { componentId, parsePinRef, findComponent };
});
