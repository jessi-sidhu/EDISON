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
  // must still take up its slot. Missing labels are filled in first (see
  // assignMissingLabels) and the labelled record goes to place(). Returns one
  // entry per saved part: what place() returned; null when it returned
  // nothing or threw for a type knows(type) accepts (a broken part is
  // dropped); otherwise a placeholder. With no knows(), every part that
  // fails becomes a placeholder. The records given are never changed.
  function rebuildComponents(records, place, knows) {
    const list     = records || [];
    const labelled = assignMissingLabels(list);
    return list.map((raw, i) => {
      let built = null;
      try { built = place(labelled[i]) || null; } catch { built = null; }
      if (built) return built;
      if (knows && knows(raw && raw.type)) return null;
      return placeholder(raw, labelled[i]);
    });
  }

  // A part this build doesn't know (or couldn't rebuild). It keeps the saved
  // record as it was in `raw`, to be written back unchanged, and the label it
  // got on load so no new part takes that label. No group, no pins: nothing
  // is drawn and the simulator skips it.
  function placeholder(raw, labelled) {
    return {
      type:    raw ? raw.type : undefined,
      raw,
      unknown: true,
      group:   null,
      pins:    [],
      label:   labelled ? labelled.label : undefined,
    };
  }

  // The part a wire end names, or null. An end names a part only when it
  // has no hole: an off-board pin such as a battery terminal.
  function namedPart(hole, idx, components) {
    return !hole && idx >= 0 ? components[idx] || null : null;
  }

  // Saved wires split into the ones the board can draw (`known`, the records
  // as given, in order) and the ones touching a placeholder (`unknown`).
  // An unknown entry holds the record and the parts it names, so it can be
  // re-pointed after deletes (see unknownWireRecords).
  function splitWires(wires, components) {
    const known = [], unknown = [];
    for (const w of wires || []) {
      const startComp = namedPart(w.startHole, w.startCompIdx, components);
      const endComp   = namedPart(w.endHole,   w.endCompIdx,   components);
      if ((startComp && startComp.unknown) || (endComp && endComp.unknown)) {
        unknown.push({ raw: w, startComp, endComp });
      } else {
        known.push(w);
      }
    }
    return { known, unknown };
  }

  // The kept wires as saved records, with part indexes taken from where the
  // parts they name now sit. A wire whose part is gone is dropped with it:
  // deleted since the load, or a known part that could not be rebuilt (its
  // end names a slot that held nothing).
  function unknownWireRecords(unknown, components) {
    const out = [];
    for (const u of unknown || []) {
      if (!u.raw.startHole && u.raw.startCompIdx >= 0 && !u.startComp) continue;
      if (!u.raw.endHole   && u.raw.endCompIdx   >= 0 && !u.endComp)   continue;
      const rec = { ...u.raw };
      if (u.startComp) rec.startCompIdx = components.indexOf(u.startComp);
      if (u.endComp)   rec.endCompIdx   = components.indexOf(u.endComp);
      if (rec.startCompIdx < 0 && u.startComp) continue;
      if (rec.endCompIdx   < 0 && u.endComp)   continue;
      out.push(rec);
    }
    return out;
  }

  // One saved record per part: a placeholder's original record, unchanged,
  // and toRecord(c, i) for every part this build knows.
  function recordsFor(components, toRecord) {
    return (components || []).map((c, i) => (c && c.unknown ? c.raw : toRecord(c, i)));
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

  return { rebuildComponents, assignMissingLabels, splitWires, unknownWireRecords, recordsFor };
});
