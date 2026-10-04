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
  // ids.js, board-geometry.js and the parts registry load first in the page.
  const IO = inNode
    ? factory(require('./ids.js'), require('./parts'), require('./board-geometry.js'))
    : factory(root.App, root.Parts, root.App.BOARD_GEOMETRY);
  if (inNode) module.exports = IO;
  if (root) Object.assign(root.App = root.App || {}, IO);
})(typeof window !== 'undefined' ? window : null, function (Ids, Parts, GEOMETRY) {

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

  // ── Pin names (docs/API-CONTRACT.md → "Placed-part record") ──────────
  // Registry parts save each hole and wire end with its pin name. Legacy
  // parts (LED, battery, buzzer, button) stay index-only until they move.

  const defOf = comp => (comp && !comp.unknown ? Parts.get(comp.type) : null);

  // The name of pin idx on comp, or undefined for a legacy part.
  function pinName(comp, idx) {
    const def = defOf(comp);
    return def ? def.pins[idx] : undefined;
  }

  // The index of pin `name` on comp. A file from before names (no name), or
  // a name this part doesn't have, falls back to the saved index.
  function pinIndex(comp, name, idx) {
    if (name == null) return idx;
    const def = defOf(comp);
    const k = def ? def.pins.indexOf(String(name)) : -1;
    return k >= 0 ? k : idx;
  }

  // A part's holeRefs as saved: [{ pin, col, row }] in pin order for a
  // registry part, the runtime refs as they are for a legacy one, null off
  // the board.
  function saveHoleRefs(comp) {
    if (!comp || !comp.holeRefs) return null;
    if (!defOf(comp)) return comp.holeRefs;
    return Parts.legsOf(comp).map(l => (l.hole ? { pin: l.pin, col: l.col, row: l.row } : null));
  }

  // A saved record's holes as runtime refs, [{ col, row }] in the part's pin
  // order: a named ref by its name, an unnamed one by its index.
  function loadHoleRefs(record) {
    if (!record || !Array.isArray(record.holeRefs)) return null;
    const bare = r => (r ? { col: r.col, row: r.row } : null);
    if (!Parts.get(record.type)) return record.holeRefs.map(bare);
    return Parts.legsOf(record).map(l => (l.hole ? { col: l.col, row: l.row } : null));
  }

  // A drawn wire as a saved record (without its colour, which app.js adds).
  // An end on a registry part names its pin next to the index.
  function wireRecord(wire, components) {
    const rec = {
      startHole:    wire.startHole,
      endHole:      wire.endHole,
      startCompIdx: wire.startComp ? components.indexOf(wire.startComp) : -1,
      startPinIdx:  wire.startPinIdx,
      endCompIdx:   wire.endComp   ? components.indexOf(wire.endComp)   : -1,
      endPinIdx:    wire.endPinIdx,
    };
    const startPin = wire.startComp ? pinName(wire.startComp, wire.startPinIdx) : undefined;
    const endPin   = wire.endComp   ? pinName(wire.endComp,   wire.endPinIdx)   : undefined;
    if (startPin !== undefined) rec.startPin = startPin;
    if (endPin   !== undefined) rec.endPin   = endPin;
    return rec;
  }

  // ── The hole map (docs/API-CONTRACT.md → "Legs and the hole map") ─────
  // Hole name → { label, pin } for a part's leg, or { wire, end } for a wire
  // end. Rebuilt from the records on every call; never patched or saved.
  // Off-board legs and wire ends have no hole and are left out. A part's leg
  // wins over a wire end in the same hole.

  function buildHoleMap(components, wires) {
    return holeMapWithout(components, wires, null);
  }

  // The map without `skip`: none of its legs, and no wire end on its pins.
  function holeMapWithout(components, wires, skip) {
    const map = new Map();
    for (const c of components || []) {
      if (!c || c === skip || c.unknown || !c.holeRefs) continue;
      for (const leg of Parts.legsOf(c)) {
        if (leg.hole && !map.has(leg.hole)) map.set(leg.hole, { label: c.label, pin: leg.pin });
      }
    }
    (wires || []).forEach((w, i) => {
      if (!w) return;
      const add = (hole, comp, end) => {
        if (!hole || (skip && comp === skip)) return;
        const name = Ids.holeName(hole);
        if (!map.has(name)) map.set(name, { wire: i, end });
      };
      add(w.startHole, w.startComp, 'from');
      add(w.endHole,   w.endComp,   'to');
    });
    return map;
  }

  // Files saved before the placement checks may break a rule. Each registry
  // part is checked against the board without itself; one that fails gets
  // comp.flag = "R1: <reason>" (warn only: never moved, never blocked), one
  // that passes has its flag cleared. Returns the flag lines.
  function flagPlacements(components, wires) {
    const board = { cols: GEOMETRY.COLS, bodyRows: GEOMETRY.BODY_ROWS };
    const lines = [];
    for (const c of components || []) {
      if (!defOf(c)) continue;
      delete c.flag;
      if (!c.holeRefs) continue;
      const check = Parts.checkPlacement(c.type, Parts.legsOf(c), holeMapWithout(components, wires, c), board);
      if (check.ok) continue;
      c.flag = `${c.label}: ${check.reason}`;
      lines.push(c.flag);
    }
    return lines;
  }

  return { rebuildComponents, assignMissingLabels, splitWires, unknownWireRecords, recordsFor,
           pinName, pinIndex, saveHoleRefs, loadHoleRefs, wireRecord, buildHoleMap, flagPlacements };
});
