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

  // The part's label (R1, BAT1…) when it has one. Otherwise "<type>_<n>",
  // where n counts parts of that type only, so battery_0 is always the first
  // battery however many other parts come before it.
  function componentId(components, comp) {
    if (comp.label) return String(comp.label);
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

  // Stable labels shown to people: R1, LED2, BAT1… A label stays with its
  // part for life, so deleting R1 leaves R2 as R2. Unknown types share "U".
  const LABEL_PREFIX = { resistor: 'R', led: 'LED', battery: 'BAT', buzzer: 'BZ', button: 'SW' };

  function labelPrefix(type) {
    return LABEL_PREFIX[type] || 'U';
  }

  // Prefix plus one more than the highest number in use for that prefix.
  // Only labels that are exactly prefix + digits count.
  function nextLabel(components, type) {
    const prefix = labelPrefix(type);
    const re = new RegExp('^' + prefix + '(\\d+)$', 'i');
    let max = 0;
    for (const c of components || []) {
      const m = re.exec(c && c.label != null ? String(c.label) : '');
      if (m) max = Math.max(max, +m[1]);
    }
    return prefix + (max + 1);
  }

  function findByLabel(components, label) {
    const want = String(label).toLowerCase();
    return (components || []).find(c => c && c.label != null && String(c.label).toLowerCase() === want) || null;
  }

  // Hole address from { col, row }: "e14", "tp_14" (1-based column, "_" after
  // a rail row). Pure, no board check; App.formatHole adds that on top.
  // Not named formatHole: this object is copied onto App after breadboard.js.
  const RAIL_ROWS = ['tp', 'tn', 'bn', 'bp'];

  function holeName(ref) {
    return ref.row + (RAIL_ROWS.includes(ref.row) ? '_' : '') + (ref.col + 1);
  }

  return { componentId, parsePinRef, findComponent, LABEL_PREFIX, nextLabel, findByLabel, holeName };
});
