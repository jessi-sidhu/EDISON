// ─────────────────────────────────────────────────────────────
//  board-model.js — the board as plain data, with no THREE and no DOM
//  (issue #81). The AI's actions apply to it, and toSim hands it to
//  simulate.js, so a whole AI build can be checked in Node.
//
//  SHAPE (docs/API-CONTRACT.md → "Board model")
//  ─────
//    { parts: [{ type, label, holes?, values?, controls? }],
//      wires: [{ id: 'W1', from, to }] }
//  A part is an Example part; a wire end is a hole ("b2", "tp_50") or a
//  pin in label form ("BAT1.0").
//
//  EXPORTS
//  ───────
//  Browser: window.Board
//  Node:    module.exports, so a test runner can call it
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Board = factory();
  if (typeof module === 'object' && module.exports) module.exports = Board;
  if (root) root.Board = Board;
})(typeof window !== 'undefined' ? window : null, function () {

  const inNode = typeof module === 'object' && module.exports;
  const Ids    = inNode ? require('./ids.js') : window.App;
  const Parts  = inNode ? require('./parts') : window.Parts;
  const COLS   = (inNode ? require('./board-geometry.js') : window.App.BOARD_GEOMETRY).COLS;

  // A footprint part's direction as its rotation. The same map as
  // Chat.ROTATION (a test keeps the two equal); defined here so chat.js
  // can use this module without a require cycle.
  const ROTATION = { right: 0, down: 90, left: 180, up: 270 };

  // Tool arguments that say where a part goes, never one of its values.
  const WHERE = ['tool', 'holeA', 'holeB', 'hole', 'direction'];

  function empty() { return { parts: [], wires: [] }; }

  // A part as a new object: holes, values and controls copied too.
  function copyPart(p) {
    const out = { type: p.type, label: p.label };
    if (p.holes)    out.holes    = p.holes.slice();
    if (p.values)   out.values   = Object.assign({}, p.values);
    if (p.controls) out.controls = Object.assign({}, p.controls);
    return out;
  }

  // An Example (docs/API-CONTRACT.md → "Example") as a board: its wires
  // [from, to] become W1…Wn in order.
  function fromExample(ex) {
    return {
      parts: (ex.parts || []).map(copyPart),
      wires: (ex.wires || []).map(([from, to], i) => ({ id: 'W' + (i + 1), from, to })),
    };
  }

  // The registry part a place_ tool stands for, or null.
  function partFor(tool) {
    return Parts.all().find(def => ((def.ai && def.ai.tool) || 'place_' + def.type) === tool) || null;
  }

  // One more than the highest wire number in use: ids are never reused
  // while a higher one exists, and never renumbered.
  function nextWireId(wires) {
    let max = 0;
    for (const w of wires) {
      const m = /^W(\d+)$/.exec(String(w.id));
      if (m) max = Math.max(max, +m[1]);
    }
    return 'W' + (max + 1);
  }

  // The action's own keys, less `tool`, `part` and any null: what
  // set_value and set_control merge in.
  function argsOf(a) {
    const out = {};
    for (const [k, v] of Object.entries(a)) if (k !== 'tool' && k !== 'part' && v != null) out[k] = v;
    return out;
  }

  // A pin's index in a part, from "0" or a pin name ("anode"), as toSim
  // reads it; -1 if the part has no such pin.
  function pinIndex(part, pin) {
    const def = Parts.get(part.type);
    const n = def ? def.pins.length : 2;   // every pre-registry part has 2 pins
    const idx = typeof pin === 'number' ? pin : def ? def.pins.indexOf(pin) : -1;
    return idx >= 0 && idx < n ? idx : -1;
  }

  // A wire end as stored: a hole as given, a LABEL.k pin with the part's
  // own label ("bat1.0" → "BAT1.0"). → { end }, or { why } for anything
  // toSim can't read: not a hole or LABEL.k ("battery_0_pin0", "nowhere"),
  // or a LABEL.k naming no part or no pin of it.
  function wireEnd(end, parts) {
    if (parseHole(end)) return { end: String(end).toLowerCase() };   // TP_3 → tp_3
    const ref = Ids.parsePinRef(end);
    if (!ref || !ref.label) return { why: `wire end ${JSON.stringify(end)} is neither a hole nor LABEL.k` };
    const part = Ids.findByLabel(parts, ref.label);
    if (!part) return { why: `wire end ${JSON.stringify(end)} names no part on the board` };
    if (pinIndex(part, ref.pin) < 0) return { why: `wire end ${JSON.stringify(end)} names no pin of ${part.label}` };
    return { end: part.label + '.' + ref.pin };
  }

  // A part from a place_ action, or a reason string it can't be placed.
  // Only the shape is worked out here: no range or placement checks.
  function placed(def, a, parts) {
    const part = { type: def.type, label: Ids.nextLabel(parts, def.type), values: {} };
    const kind = def.place.kind;
    if (kind === 'span') {
      if (a.holeA == null || a.holeB == null) return 'a span part needs holeA and holeB';
      const bad = [a.holeA, a.holeB].find(h => !parseHole(h));
      if (bad !== undefined) return `span hole ${JSON.stringify(bad)} is not a board address`;
      part.holes = [String(a.holeA).toLowerCase(), String(a.holeB).toLowerCase()];
    } else if (kind === 'footprint') {
      const dir  = String(a.direction == null ? '' : a.direction).toLowerCase();
      const legs = dir in ROTATION ? Parts.footprintLegs(def.type, a.hole, ROTATION[dir]) : null;
      if (!legs || legs.some(l => !l.hole || l.col >= COLS)) return `no legs for hole ${JSON.stringify(a.hole)}, direction ${JSON.stringify(a.direction)}`;
      part.holes = legs.map(l => l.hole);
    }
    for (const key of Object.keys(def.values || {})) {
      if (!WHERE.includes(key) && a[key] != null) part.values[key] = a[key];
    }
    return part;
  }

  // Wire ends that are one of `label`'s pins ("BAT1.0").
  function onPart(end, label) {
    const ref = Ids.parsePinRef(end);
    return !!(ref && ref.label && ref.label.toLowerCase() === String(label).toLowerCase());
  }

  // The AI's actions applied in order to a copy of `board`.
  // → { board, errors }, errors: [{ index, tool, why }] for each action
  // skipped (unknown label, wire id or tool). Never mutates its input.
  function apply(board, actions) {
    const out    = { parts: board.parts.map(copyPart), wires: board.wires.map(w => ({ id: w.id, from: w.from, to: w.to })) };
    const errors = [];
    (actions || []).forEach((a, index) => {
      const tool = a && a.tool;
      const fail = why => errors.push({ index, tool, why });
      const find = () => Ids.findByLabel(out.parts, a.part);

      if (tool === 'delete_all') {
        out.parts = [];
        out.wires = [];
      } else if (tool === 'add_wire') {
        if (a.from == null || a.to == null) return fail('add_wire needs from and to');
        const from = wireEnd(a.from, out.parts), to = wireEnd(a.to, out.parts);
        if (from.why || to.why) return fail(from.why || to.why);
        out.wires.push({ id: nextWireId(out.wires), from: from.end, to: to.end });
      } else if (tool === 'delete_wire') {
        const before = out.wires.length;
        out.wires = out.wires.filter(w => w.id !== a.wire);
        if (out.wires.length === before) fail(`no wire ${JSON.stringify(a.wire)} on the board`);
      } else if (tool === 'delete_part') {
        const gone = find();
        if (!gone) return fail(`no part ${JSON.stringify(a.part)} on the board`);
        out.parts = out.parts.filter(p => p !== gone);
        out.wires = out.wires.filter(w => !onPart(w.from, gone.label) && !onPart(w.to, gone.label));
      } else if (tool === 'set_value' || tool === 'set_control') {
        const part = find();
        if (!part) return fail(`no part ${JSON.stringify(a.part)} on the board`);
        const key = tool === 'set_value' ? 'values' : 'controls';
        part[key] = Object.assign({}, part[key], argsOf(a));
      } else if (tool === 'use_parts') {
        // Asks the server for more tools; the board doesn't change.
      } else if (typeof tool === 'string' && tool.startsWith('place_') && partFor(tool)) {
        const part = placed(partFor(tool), a, out.parts);
        if (typeof part === 'string') return fail(part);
        out.parts.push(part);
      } else {
        fail(`unknown tool ${JSON.stringify(tool)}`);
      }
    });
    return { board: out, errors };
  }

  // ── Board → simulator ──────────────────────────────────────

  // "a2" → { col: 1, row: 'a' }; "TP_50" → { col: 49, row: 'tp' }; else
  // null. Any case, rows lower-case, as App.parseHole reads them.
  function parseHole(s) {
    const m = /^(?:([a-j])(\d+)|(tp|tn|bn|bp)_(\d+))$/i.exec(String(s));
    if (!m) return null;
    return m[1] ? { col: Number(m[2]) - 1, row: m[1].toLowerCase() } : { col: Number(m[4]) - 1, row: m[3].toLowerCase() };
  }

  // A registry part's defaults, as elements() gets them: a choice's
  // overrides sit beside the choice's name.
  function defaultValues(def) {
    const out = {};
    for (const [key, spec] of Object.entries(def.values || {})) {
      out[key] = spec.default;
      if (spec.choices && spec.choices[spec.default]) Object.assign(out, spec.choices[spec.default]);
    }
    return out;
  }

  // A part's values filled in from its defaults; a part not in the
  // registry keeps its own values as given.
  function valuesOf(p) {
    const def = Parts.get(p.type);
    if (def) {
      const v = Object.assign(defaultValues(def), p.values || {});
      for (const [key, val] of Object.entries(p.values || {})) {
        const spec = def.values && def.values[key];
        if (spec && spec.choices && spec.choices[val]) Object.assign(v, spec.choices[val]);
      }
      return v;
    }
    return p.values ? Object.assign({}, p.values) : undefined;
  }

  // The board as Sim.analyze(components, wires) takes it, the records the
  // way App.place* leaves them: a label, one pin per leg, holeRefs as
  // { col (0-based), row }, and values filled in from the defaults.
  // Throws on a hole that isn't a board address or a wire end that names
  // no part's pin.
  function toSim(board) {
    const byLabel = new Map();
    const components = board.parts.map(p => {
      const def = Parts.get(p.type);
      const n = def ? def.pins.length : 2;   // every pre-registry part has 2 pins
      const holeRefs = p.holes ? p.holes.map(h => {
        const ref = parseHole(h);
        if (!ref) throw new Error(`${p.label} hole "${h}" is not a board address`);
        return ref;
      }) : null;
      if (holeRefs && holeRefs.length !== n) throw new Error(`${p.label} needs one hole per pin (${n})`);
      const comp = { type: p.type, label: p.label, pins: Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 })),
                     holeRefs, values: valuesOf(p) };
      if (comp.values === undefined) delete comp.values;
      if (p.controls) comp.controls = Object.assign({}, p.controls);
      byLabel.set(p.label, { comp, def });
      return comp;
    });

    const end = (s, side, id) => {
      const hole = parseHole(s);
      if (hole) return { [side + 'Hole']: hole };
      const m = /^([A-Za-z]+\d+)\.(\w+)$/.exec(String(s));
      if (!m) throw new Error(`${id}: wire end "${s}" is neither a hole nor LABEL.pin`);
      const owner = byLabel.get(m[1]);
      if (!owner) throw new Error(`${id}: wire end "${s}" names no part on the board`);
      const idx = /^\d+$/.test(m[2]) ? Number(m[2]) : owner.def ? owner.def.pins.indexOf(m[2]) : -1;
      if (!(idx >= 0 && idx < owner.comp.pins.length)) throw new Error(`${id}: wire end "${s}" names no pin of ${m[1]}`);
      return { [side + 'Comp']: owner.comp, [side + 'PinIdx']: idx };
    };
    const wires = board.wires.map(w => Object.assign({}, end(w.from, 'start', w.id), end(w.to, 'end', w.id)));
    return { components, wires };
  }

  // ── Board → actions ────────────────────────────────────────

  // The direction whose footprint legs sit in exactly `holes`, or null.
  function directionOf(type, holes) {
    const want = holes.map(h => String(h).toLowerCase()).join();
    return Object.keys(ROTATION).find(dir => {
      const legs = Parts.footprintLegs(type, holes[0], ROTATION[dir]);
      return legs && legs.map(l => l.hole).join() === want;
    }) || null;
  }

  // The actions that rebuild `board` from nothing (issue #84):
  // delete_all, a place_* per part in order (its values as arguments),
  // an add_wire per wire, then a set_control per part with controls.
  // Labels are re-predicted by placement order, so a board with gaps
  // (R1, R3) rebuilds as R1, R2. → { actions, labelMap }, labelMap old
  // label → new; LABEL.k wire ends are rewritten through it. Never
  // mutates `board`.
  function toActions(board) {
    const actions = [{ tool: 'delete_all' }], labelMap = {}, placedParts = [];
    for (const p of board.parts) {
      const def = Parts.get(p.type);
      const a = { tool: (def && def.ai && def.ai.tool) || 'place_' + p.type };
      const kind = def ? def.place.kind : (p.holes ? 'span' : 'off');
      if (p.holes && kind === 'footprint') {
        a.hole = String(p.holes[0]).toLowerCase();
        a.direction = directionOf(p.type, p.holes);
      } else if (p.holes) {
        a.holeA = String(p.holes[0]).toLowerCase();
        a.holeB = String(p.holes[1]).toLowerCase();
      }
      Object.assign(a, p.values || {});
      actions.push(a);
      const label = Ids.nextLabel(placedParts, p.type);
      labelMap[p.label] = label;
      placedParts.push({ label });
    }
    const end = e => {
      const m = /^([A-Za-z]+\d+)\.(\w+)$/.exec(String(e));
      return m ? `${labelMap[m[1]] || m[1]}.${m[2]}` : String(e).toLowerCase();
    };
    for (const w of board.wires) actions.push({ tool: 'add_wire', from: end(w.from), to: end(w.to) });
    for (const p of board.parts) {
      if (p.controls && Object.keys(p.controls).length) actions.push(Object.assign({ tool: 'set_control', part: labelMap[p.label] }, p.controls));
    }
    return { actions, labelMap };
  }

  return { ROTATION, empty, fromExample, apply, toSim, toActions };
});
