// ─────────────────────────────────────────────────────────────
//  chat.js — Sparky AI chat panel
//
//  No model key in the browser. The system prompt, tool schema and action
//  validation live once in backend/server.js and are reached over /api/ask.
//
//  EXPORTS
//  ───────
//  Browser: window.SparkyChat, plus the panel's onclick handlers on window
//  Node:    module.exports = the pure action code, so a test runner can call it
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const Chat = factory();
  if (typeof module === 'object' && module.exports) module.exports = Chat;
  if (root) root.SparkyChat = Chat;
})(typeof window !== 'undefined' ? window : null, function () {

  const inNode   = typeof module === 'object' && module.exports;
  const Ids      = inNode ? require('./ids.js') : window.App;
  const Parts    = inNode ? require('./parts') : window.Parts;
  const GEOMETRY = inNode ? require('./board-geometry.js') : window.App.BOARD_GEOMETRY;
  const Bench    = inNode ? require('./bench.js') : window.Bench;

  // A wire end the AI names: a component pin by label ("BAT1.0") or the old
  // form ("battery_0_pin0"), or a hole. Pin k is the same index in both.
  // Returns { comp, pin } or { hole }, or null if it names nothing.
  function resolveEndpoint(str, board) {
    const ref = Ids.parsePinRef(str);
    if (ref) {
      const comp = ref.label
        ? Ids.findByLabel(board.components(), ref.label)
        : Ids.findComponent(board.components(), ref.type, ref.n);
      if (!comp) return null;
      // A pin by number ("PS1.2") or by its registry name ("MM1.red", as
      // the meter's guide teaches), as Board.apply's pinIndex reads it.
      const def = Parts && Parts.get(comp.type);
      const pin = typeof ref.pin === 'number' ? ref.pin : def ? def.pins.indexOf(ref.pin) : -1;
      return pin >= 0 && (!def || pin < def.pins.length) ? { comp, pin } : null;
    }
    const hole = holeOf(str, board);
    return hole ? { hole } : null;
  }

  function holeOf(str, board) {
    try {
      const { col, row } = board.parseHole(str);
      return board.getHole(col, row);
    } catch {
      return null;
    }
  }

  const COLOR_MAP = { red: 0xef4444, yellow: 0xfbbf24, green: 0x22c55e,
                      blue: 0x3b82f6, black: 0x111111, white: 0xffffff };

  function colorHex(name) { return COLOR_MAP[String(name || '').toLowerCase()] || COLOR_MAP.red; }

  // The registry part a place_<type> action names (its ai.tool, or
  // place_<type>), or null.
  function partFor(tool) {
    if (!Parts || typeof tool !== 'string') return null;
    return Parts.all().find(def => ((def.ai && def.ai.tool) || 'place_' + def.type) === tool) || null;
  }

  // The values an action names for its part, e.g. { resistance: 1000 }, or {}
  // for the part's defaults: only the part's own value keys, each checked
  // with Parts.checkValue. A refused one is left out, with its reason in
  // `refused` (the part keeps its default).
  function partValues(a, refused) {
    const def = partFor(a && a.tool);
    const out = {};
    for (const key of Object.keys((def && def.values) || {})) {
      if (a[key] == null) continue;
      const check = Parts.checkValue(def.type, key, a[key]);
      if (check.ok) out[key] = check.value;
      else if (refused) refused.push(check.reason);
    }
    return out;
  }

  // A registry part's legs, checked against the board as it is now
  // (docs/API-CONTRACT.md → Parts.checkPlacement). The refusal, or null.
  function placementRefusal(type, legs, board) {
    const map   = board.holeMap ? board.holeMap() : new Map();
    const check = Parts.checkPlacement(type, legs, map, { cols: GEOMETRY.COLS, bodyRows: GEOMETRY.BODY_ROWS });
    return check.ok ? null : `${Ids.nextLabel(board.components(), type)} not placed: ${check.reason}`;
  }

  const note = (board, text) => { if (board.note) board.note(text); };

  // A footprint part's direction as its rotation (docs/API-CONTRACT.md → AI tools).
  const ROTATION = { right: 0, down: 90, left: 180, up: 270 };

  // A footprint part's holes, one per pin, from { hole, direction }, or null
  // after a note saying why not.
  function footprintHoles(def, a, board) {
    const who = Ids.nextLabel(board.components(), def.type);
    const dir = String(a.direction == null ? '' : a.direction).toLowerCase();
    if (!(dir in ROTATION)) { note(board, `${who} not placed: direction must be right, left, up or down; got ${JSON.stringify(a.direction)}.`); return null; }
    if (!def.place.rotations.includes(ROTATION[dir])) {
      const can = Object.keys(ROTATION).filter(d => def.place.rotations.includes(ROTATION[d]));
      const name = def.name.split(' ').map(w => (/^[A-Z0-9-]{2,}$/.test(w) ? w : w.toLowerCase())).join(' ');
      note(board, `${who} not placed: the ${name} can't face ${dir}; use ${can.join(' or ')}.`);
      return null;
    }
    let anchor = null;
    try { anchor = board.parseHole(a.hole); } catch { anchor = null; }
    const legs = anchor && Parts.footprintLegs(def.type, anchor, ROTATION[dir]);
    if (!legs) { note(board, `${who} not placed: ${JSON.stringify(a.hole)} is not a body hole (a1–j${GEOMETRY.COLS}).`); return null; }
    // Checked before the holes are looked up: a leg past the edge has none.
    const refusal = placementRefusal(def.type, legs, board);
    if (refusal) { note(board, refusal); return null; }
    const holes = legs.map(l => board.getHole(l.col, l.row));
    return holes.every(Boolean) ? holes : null;
  }

  // place_<type> for any registry part: its holes (one per pin), or, off
  // the board, a spot of its own on the bench.
  function placeOne(a, board) {
    const def = partFor(a.tool);
    if (!def) {
      note(board, `${a.tool.slice('place_'.length)} not placed: there is no part type "${a.tool.slice('place_'.length)}".`);
      return false;
    }
    let where;
    if (def.place.kind === 'offboard') {
      // The bench's limits, then its next free spot (#197): the battery on
      // the board's battery spot (App.batterySpot in a page) while that is
      // free, an instrument in front of the board.
      const parts = board.components();
      const full  = Bench.refusal(def.type, parts);
      if (full) { note(board, `${Ids.nextLabel(parts, def.type)} not placed: ${full}`); return false; }
      where = Bench.spotFor(def.type, Bench.spotsOf(parts), board.batterySpot());
    } else if (def.place.kind === 'span') {
      where = [holeOf(a.holeA, board), holeOf(a.holeB, board)];
      if (!where.every(Boolean)) return false;
      const legs = Parts.legsOf({ type: def.type, holeRefs: where.map(h => ({ col: h.col, row: h.row })) });
      const refusal = placementRefusal(def.type, legs, board);
      if (refusal) { note(board, refusal); return false; }
    } else {
      where = footprintHoles(def, a, board);
      if (!where) return false;
    }
    const refused = [];
    const values = partValues(a, refused);
    for (const reason of refused) note(board, `${Ids.nextLabel(board.components(), def.type)} keeps its default: ${reason}`);
    board.placePart(def.type, where, values);
    return true;
  }

  // The keys of an edit action other than tool and part: { resistance: 1000 }.
  function editKeys(a) {
    const out = {};
    for (const [key, v] of Object.entries(a)) if (key !== 'tool' && key !== 'part' && v != null) out[key] = v;
    return out;
  }

  // A control's value, or null if the control can't take it.
  function controlValue(spec, v) {
    if (spec.type === 'slider') return typeof v === 'number' && v >= spec.min && v <= spec.max ? v : null;
    return typeof v === 'boolean' ? v : null;
  }

  // set_value / set_control / delete_part { part: 'R1', ... }. A refusal
  // changes nothing and says why in one note naming the part.
  function editOne(a, board) {
    const label = String(a.part == null ? '' : a.part);
    const comp  = label ? Ids.findByLabel(board.components(), label) : null;
    const refuse = why => { note(board, `${label || 'The part'} not changed: ${why}`); return false; };
    if (!comp) return refuse(`no part on the board is labelled ${label || '(none given)'}.`);
    if (a.tool === 'delete_part') { board.deletePart(comp); return true; }

    const def  = Parts.get(comp.type);
    const keys = editKeys(a);
    if (!Object.keys(keys).length) return refuse('the change names nothing to set.');
    const out = {};
    for (const [key, v] of Object.entries(keys)) {
      if (a.tool === 'set_value') {
        const check = Parts.checkValue(comp.type, key, v);
        if (!check.ok) return refuse(check.reason);
        out[key] = check.value;
      } else {
        const spec = def && def.controls && Object.hasOwn(def.controls, key) ? def.controls[key] : null;
        if (!spec) return refuse(`${label} has no control "${key}".`);
        const value = controlValue(spec, v);
        if (value === null) return refuse(`${key} can't be ${JSON.stringify(v)}.`);
        out[key] = value;
      }
    }
    if (a.tool === 'set_value') board.setValues(comp, out);
    else board.setControls(comp, out);
    return true;
  }

  const EDITS = ['set_value', 'set_control', 'delete_part'];

  function applyOne(a, board) {
    if (typeof a.tool === 'string' && a.tool.startsWith('place_')) return placeOne(a, board);
    if (EDITS.includes(a.tool))     return editOne(a, board);
    if (a.tool === 'delete_all')    { board.clearAll(); return true; }
    if (a.tool === 'delete_wire')   return board.deleteWire(String(a.wire));   // false: no such wire
    if (a.tool === 'add_wire') {
      const from = resolveEndpoint(a.from, board), to = resolveEndpoint(a.to, board);
      return !!(from && to && board.addWire(from, to, colorHex(a.color)));
    }
    return false;
  }

  // Apply the AI's actions in order. Returns how many took effect and how
  // many did not, so the chat can report what really happened, plus
  // `failedActions`, the actions that did not (the same objects; not
  // enumerable, so the result still reads { applied, failed }).
  function applyActions(actions, board) {
    let applied = 0, failed = 0;
    const failedActions = [];
    (actions || []).forEach(a => {
      let ok = false;
      try { ok = applyOne(a, board); } catch (e) { console.warn('Action failed:', a, e.message); }
      if (ok) applied++; else { failed++; failedActions.push(a); }
    });
    return Object.defineProperty({ applied, failed }, 'failedActions', { value: failedActions });
  }

  // An accepted AI build: all its actions as one undo step.
  function acceptBuild(actions, board) {
    return board.batch(() => applyActions(actions, board));
  }

  // The label each action will give its part when accepted, or null for an
  // action that places nothing. Mirrors what App.placePart does on Accept:
  // Ids.nextLabel over the board as it will be, with delete_all emptying it
  // and delete_part taking its part out.
  function predictLabels(actions, components) {
    let parts = (components || []).slice();
    return (actions || []).map(a => {
      if (a.tool === 'delete_all') { parts = []; return null; }
      if (a.tool === 'delete_part') { const gone = Ids.findByLabel(parts, a.part); parts = parts.filter(c => c !== gone); return null; }
      if (!a.tool || !a.tool.startsWith('place_')) return null;
      const def = partFor(a.tool);
      const type = def ? def.type : a.tool.slice('place_'.length);
      const label = Ids.nextLabel(parts, type);
      parts.push({ type, label });
      return label;
    });
  }

  // Where each action's off-board part will stand once accepted (#197), as
  // placeOne puts it: { x, z }, or null for an action that places nothing
  // off the board or that the bench's limits refuse. Like predictLabels, it
  // walks the board as it will be: delete_all empties it, delete_part takes
  // its part out.
  function predictSpots(actions, components, batterySpot) {
    let parts = (components || []).slice();
    return (actions || []).map(a => {
      if (a.tool === 'delete_all') { parts = []; return null; }
      if (a.tool === 'delete_part') { const gone = Ids.findByLabel(parts, a.part); parts = parts.filter(c => c !== gone); return null; }
      const def = typeof a.tool === 'string' && a.tool.startsWith('place_') ? partFor(a.tool) : null;
      if (!def) return null;
      const label = Ids.nextLabel(parts, def.type);
      if (def.place.kind !== 'offboard') { parts.push({ type: def.type, label }); return null; }
      if (Bench.refusal(def.type, parts)) return null;
      const spot = Bench.spotFor(def.type, Bench.spotsOf(parts), batterySpot);
      parts.push({ type: def.type, label, position: spot });
      return spot;
    });
  }

  // The HTML an AI reply shows: escaped first, so the model's text can never
  // be markup, then **x** turned into <strong>x</strong> (issue #62).
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function formatReply(text) {
    return String(text)
      .replace(/[&<>"']/g, ch => ESCAPES[ch])
      .replace(/\*\*(\S(?:[^*]*\S)?)\*\*/g, '<strong>$1</strong>');
  }

  // Whether a batch places a part: only then does Accept frame the circuit,
  // so an edit never snaps away the view the user zoomed to (issue #67).
  function placesParts(actions) {
    return (actions || []).some(a => !!a && typeof a.tool === 'string' && a.tool.startsWith('place_'));
  }

  // What the AI is told it did (issue #85): the model's history entry for a
  // reply. A plain answer stays as it is; an accepted build is the reply
  // plus one "Applied:" line naming each action that took effect (`failed`:
  // the ones that didn't, left out and counted); a declined one is only the
  // declined line, so the AI never thinks it built what it didn't. An
  // Accept taken back because steps failed (#199, `reverted`) is the
  // reverted line naming those steps: she didn't decline it, and the AI
  // needs to know what to change before it sends the build again.
  const DECLINED = '(The user declined this build; the board is unchanged.)';
  const REVERTED = steps => `(The user accepted this build, but these steps didn't match the board, so nothing was changed: ${steps}.)`;

  function describeAction(a) {
    if (!a || typeof a.tool !== 'string') return '?';
    if (a.tool === 'add_wire')    return `add_wire ${a.from}→${a.to}`;
    if (a.tool === 'delete_wire') return `delete_wire ${a.wire}`;
    if (EDITS.includes(a.tool)) {
      const keys = Object.keys(a).filter(k => k !== 'tool' && k !== 'part' && a[k] != null);
      return [a.tool, a.part, ...keys.map(k => `${k}=${a[k]}`)].join(' ');
    }
    if (a.holeA != null) return `${a.tool} ${a.holeA}/${a.holeB}`;
    if (a.hole != null)  return `${a.tool} ${a.hole}${a.direction ? ' ' + a.direction : ''}`;
    return a.tool;
  }

  function modelHistoryText(reply, actions, accepted, failed = [], reverted = false) {
    const text = String(reply == null ? '' : reply);
    if (!Array.isArray(actions) || !actions.length) return text;
    if (!accepted) return DECLINED;
    if (reverted) return REVERTED((failed || []).map(describeAction).join(', ') || 'unknown');
    const bad  = new Set(failed || []);
    const done = actions.filter(a => !bad.has(a));
    const n    = actions.length - done.length;
    return `${text}\nApplied: ${done.length ? done.map(describeAction).join(', ') : 'nothing'}` + (n ? ` (${n} could not be applied).` : '.');
  }

  // The line a photo build adds to her question (issue #143): "Built from a
  // photo of my real breadboard. Unsure readings: LED1 direction." `result`
  // is PhotoImport.build's. It goes into the /api/ask message, so it never
  // names a part keyword, a NEW_BUILD word or "fix": the server must treat
  // question + context exactly as the question alone.
  const UNSURE = { polarity: 'direction', value: 'value', moved: 'holes', shorted: 'shorted',
                   source: 'kind', position: 'holes', mismatch: 'holes', type: 'kind' };
  function photoContext(result) {
    const labels = (result && result.labels) || {};
    const said = ((result && result.flags) || []).map(f => {
      if (f.kind === 'rails') return 'rail signs';
      if (f.id == null)       return f.kind === 'source' ? 'no cell seen, a 9 V one assumed' : f.kind;
      if (!labels[f.id])      return `the photo's ${f.id} not added`;
      return `${labels[f.id]} ${UNSURE[f.kind] || f.kind}`;
    });
    const unique = [...new Set(said)];
    return 'Built from a photo of my real breadboard.' + (unique.length ? ` Unsure readings: ${unique.join(', ')}.` : '');
  }

  // The page's own guard on /api/ask (issue #129): longer than the server's
  // 60 s DeepSeek deadline, so the server's clear 504 normally arrives first.
  const ASK_TIMEOUT_MS = 75000;

  return { resolveEndpoint, applyActions, acceptBuild, predictLabels, predictSpots, placesParts, partFor, partValues, colorHex, formatReply, modelHistoryText, describeAction, photoContext, EDITS, ROTATION, ASK_TIMEOUT_MS };
});

// ── Browser panel ─────────────────────────────────────────────
//  Everything below touches the DOM or THREE, so it only runs in a page.
if (typeof window !== 'undefined') (function (App, Chat, Parts) {

  const chatHistory = [];   // {role:'user'|'model', text} pairs for conversation memory

  // The real board, in the shape applyActions expects.
  const board = {
    components:    () => App.state.components,
    batterySpot:   () => App.batterySpot(),
    parseHole:     s => App.parseHole(s),
    getHole:       (col, row) => App.state.breadboard.getHole(col, row),
    placePart:     (type, where, v) => App.placePart(type, where, v),
    setValues:     (comp, v) => App.setValues(comp, v),
    setControls:   (comp, c) => App.setControls(comp, c),
    deletePart:    comp => App.deletePart(comp),
    deleteWire(id) {
      const wire = App.state.wires.find(w => w.id === id);
      if (wire) App.deleteWire(wire);
      return !!wire;
    },
    clearAll:      () => App.clearAll({ keepCircuit: true }),   // same circuit, same saved record
    batch:         fn => App.history.batch(fn),
    holeMap:       () => App.holeMap(),
    note:          text => sparkyAddMsg(text, 'system'),
    addWire(from, to, hex) {
      const s = wireEnd(from), t = wireEnd(to);
      if (!s || !t) return false;
      const saved = App.state.wireColor;
      App.state.wireColor = hex;
      App.state.wireStart = s;
      App.finishWire(t);
      App.state.wireColor = saved;
      return true;
    },
  };

  // An endpoint from resolveEndpoint, as the { world, holeRef, pinMesh } finishWire takes.
  function wireEnd(e) {
    if (e.hole) {
      return { world: e.hole.world.clone(), holeRef: { col: e.hole.col, row: e.hole.row }, pinMesh: null };
    }
    const pm = e.comp.pinMeshes && e.comp.pinMeshes[e.pin];
    return pm ? { world: pm.userData.world.clone(), holeRef: null, pinMesh: pm } : null;
  }

  // explain (issue #169): an answer only, so the server offers the AI no tools.
  async function askSparky(markdown, userMsg, history, board, explain) {
    // A stalled AI ends in a clear message, not a minutes-long spinner (#129).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Chat.ASK_TIMEOUT_MS);
    let res, data = null;
    try {
      res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markdown, message: userMsg, history, board, ...(explain ? { explain: true } : {}) }),
        signal: controller.signal,
      });
      try { data = await res.json(); } catch (e) { if (controller.signal.aborted) throw e; /* else a non-JSON error page */ }
    } catch (e) {
      if (controller.signal.aborted) throw new Error('The AI took too long — try again.');
      throw e;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok || !data) {
      console.error('/api/ask failed:', res.status, data);
      throw new Error((data && data.reply) || 'Edison could not reach the AI service. Please try again in a moment.');
    }
    return { reply: data.reply || '(no response)', actions: data.actions || [] };
  }

  // ── Chat helpers ─────────────────────────────────────────────

  function sparkyAddMsg(text, role) {
    const welcome = document.getElementById('sparky-welcome');
    if (welcome) welcome.classList.add('hidden');
    const box = document.getElementById('sparky-messages');
    const el  = document.createElement('div');
    el.className   = 'chat-msg ' + role;
    if (role === 'ai') el.innerHTML = Chat.formatReply(text);   // escaped, then **bold**
    else               el.textContent = text;
    box.appendChild(el);
    box.scrollTop  = box.scrollHeight;
    return el;
  }

  function sparkyTyping() {
    const welcome = document.getElementById('sparky-welcome');
    if (welcome) welcome.classList.add('hidden');
    const box = document.getElementById('sparky-messages');
    const el  = document.createElement('div');
    el.className = 'chat-msg typing';
    el.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    return el;
  }

  // ── Preview / Accept / Decline ───────────────────────────────

  let _pendingActions = null;
  let _pendingGhosts  = [];
  let _pendingEntry   = null;   // the model's history entry for the preview: { entry, reply }

  // The pending preview's history entry, rewritten as accepted or declined.
  function settleHistory(actions, accepted, failed, reverted) {
    if (!_pendingEntry) return;
    _pendingEntry.entry.text = Chat.modelHistoryText(_pendingEntry.reply, actions, accepted, failed, reverted);
    _pendingEntry = null;
  }

  function sparkyPreviewActions(actions) {
    sparkyDeclineChanges();          // clear any stale preview first
    if (!actions || !actions.length) return;
    _pendingActions = actions;

    const bb = App.state.breadboard;

    // Off-board parts (the battery) are drawn first, so wire ghosts can
    // reach pins that do not exist yet. Their pin positions are keyed (lower
    // case) by the label Accept will give each one ("bat1.0") and by the old
    // form ("battery_0_pin0"). A delete_all ahead of them restarts numbering.
    // Each stands on the spot Accept will give it; one over the bench's
    // limits gets none, and no ghost (#197).
    const pendingPins = {};
    const ghosts = [];
    const labels = Chat.predictLabels(actions, App.state.components);
    const spots  = Chat.predictSpots(actions, App.state.components, board.batterySpot());
    const counts = {};
    const countOf = type => App.state.components.filter(c => c.type === type).length;
    actions.forEach((a, i) => {
      if (a.tool === 'delete_all') { for (const k of Object.keys(counts)) counts[k] = 0; return; }
      const def = Chat.partFor(a.tool);
      const spot = spots[i];
      if (!def || def.place.kind !== 'offboard' || !spot) return;
      const built = App.buildPart(def.type, Parts.legsOf({ type: def.type, holeRefs: null }), Chat.partValues(a), { ghost: true });
      built.group.position.set(spot.x, App.BENCH_Y || 0, spot.z);   // on the bench, where Accept puts it (#187)
      if (!(def.type in counts)) counts[def.type] = actions.slice(0, i).some(b => b.tool === 'delete_all') ? 0 : countOf(def.type);
      built.pinPositions.forEach((p, k) => {
        const at = p.clone().add(built.group.position);
        pendingPins[`${labels[i]}.${k}`.toLowerCase()] = at;
        if (def.pins[k] != null) pendingPins[`${labels[i]}.${def.pins[k]}`.toLowerCase()] = at;   // MM1.red, as Accept resolves it
        pendingPins[`${def.type}_${counts[def.type]}_pin${k}`] = at;
      });
      counts[def.type]++;
      ghosts[i] = built.group;
    });

    const notes = [];
    actions.forEach((a, i) => {
      let ghost = ghosts[i] || null;
      const def = Chat.partFor(a.tool);

      if (def && def.place.kind === 'span') {
        const hA = Chat.resolveEndpoint(a.holeA, board);
        const hB = Chat.resolveEndpoint(a.holeB, board);
        if (hA && hA.hole && hB && hB.hole) {
          const rotation = hA.hole.col === hB.hole.col ? 1 : 0;
          ghost = App.buildPreview(def.type, def.place.span.default, bb.HS, rotation, Chat.partValues(a));
          ghost.position.set((hA.hole.x + hB.hole.x) / 2, 0, (hA.hole.z + hB.hole.z) / 2);
        }
      } else if (def && def.place.kind === 'footprint') {
        // Drawn at its legs, when they all land on the board.
        let anchor = null;
        try { anchor = App.parseHole(a.hole); } catch { anchor = null; }
        const legs = anchor && Parts.footprintLegs(def.type, anchor, Chat.ROTATION[String(a.direction || '').toLowerCase()]);
        if (legs && legs.every(l => bb.getHole(l.col, l.row))) ghost = App.buildPart(def.type, legs, Chat.partValues(a), { ghost: true }).group;
      } else if (a.tool === 'add_wire') {
        ghost = buildWireGhost(a.from, a.to, a.color, pendingPins);
      } else if (Chat.EDITS.includes(a.tool)) {
        notes.push(editNote(a));   // an edit places nothing: a note, no ghost
      } else if (a.tool === 'delete_wire') {
        notes.push(wireNote(a));
      }
      // delete_all: no ghost mesh

      if (ghost) { App.scene.add(ghost); _pendingGhosts.push(ghost); }
    });
    notes.forEach(text => sparkyAddMsg(text, 'system'));

    document.getElementById('sparky-pending-bar').style.display = 'flex';
    App.requestRender();   // the reply arrives with no input to draw the ghosts
  }

  // What a delete_wire will do: "Remove wire W2 (BAT1.1 → tn_63)."
  function wireNote(a) {
    const wire = App.state.wires.find(w => w.id === a.wire);
    if (!wire) return `Remove wire ${a.wire}: no wire on the board has that id.`;
    const { from, to } = App.wireEnds(wire);
    return `Remove wire ${a.wire} (${from} → ${to}).`;
  }

  // What an edit will do, for the preview: "R1 → 1 kΩ", "Delete R1".
  function editNote(a) {
    const label = String(a.part == null ? '?' : a.part);
    if (a.tool === 'delete_part') return `Delete ${label} (and the wires on its pins).`;
    const comp = App.findByLabel(App.state.components, label);
    const keys = Object.keys(a).filter(k => k !== 'tool' && k !== 'part' && a[k] != null);
    if (a.tool === 'set_value' && comp) {
      const shown = App.formatValue({ type: comp.type, values: Object.assign({}, comp.values, pick(a, keys)) }, keys);
      if (shown) return `${label} → ${shown}`;
    }
    return `${label} → ${keys.map(k => `${k}: ${a[k]}`).join(', ')}`;
  }

  function pick(obj, keys) {
    const out = {};
    for (const k of keys) out[k] = obj[k];
    return out;
  }

  function buildWireGhost(fromStr, toStr, colorName, pendingPins) {
    function resolvePos(str) {
      const pending = pendingPins[String(str).toLowerCase()];
      if (pending) return pending.clone();
      const e = Chat.resolveEndpoint(str, board);
      if (!e) return null;
      if (e.hole) return new THREE.Vector3(e.hole.x, 0.06, e.hole.z);
      const end = wireEnd(e);
      return end ? end.world : null;
    }

    const start = resolvePos(fromStr);
    const end   = resolvePos(toStr);
    if (!start || !end) return null;

    const g    = new THREE.Group();
    const mat  = new THREE.MeshLambertMaterial({ color: Chat.colorHex(colorName), transparent: true, opacity: 0.42, depthWrite: false });
    const dist = start.distanceTo(end);
    const mid  = new THREE.Vector3(
      (start.x + end.x) / 2,
      Math.max(start.y, end.y) + dist * 0.22 + 0.38,
      (start.z + end.z) / 2
    );
    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 26, 0.043, 7, false), mat));
    return g;
  }

  function sparkyAcceptChanges() {
    if (!_pendingActions) return;
    const actions = _pendingActions;
    clearGhosts();
    _pendingActions = null;
    document.getElementById('sparky-pending-bar').style.display = 'none';

    const result = Chat.acceptBuild(actions, board);
    const { applied, failed } = result;
    // A fix lands whole or not at all (#199): a step that no longer matches
    // the board (it changed since Edison read it) takes the whole fix back.
    if (failed) {
      App.history.revert();
      settleHistory(actions, true, result.failedActions, true);
      const total = failed + applied;
      const what  = failed === total ? (total === 1 ? "Edison's change" : `Edison's ${total} changes`) : `${failed} of Edison's ${total} changes`;
      const which = result.failedActions.slice(0, 3).map(Chat.describeAction).join(', ') + (failed > 3 ? ', …' : '');
      sparkyAddMsg(`Nothing was changed: ${what} didn't match your board (${which}). Ask again.`, 'system');
      return;
    }
    settleHistory(actions, true, result.failedActions);
    if (Chat.placesParts(actions)) App.frameCircuit();   // new parts: big enough to see and click (#67)
    sparkyAddMsg(`✓ Applied ${applied} change${applied !== 1 ? 's' : ''} to your circuit.`, 'system');
  }

  function sparkyDeclineChanges() {
    if (!_pendingActions) return;
    settleHistory(_pendingActions, false);
    clearGhosts();
    _pendingActions = null;
    document.getElementById('sparky-pending-bar').style.display = 'none';
    sparkyAddMsg('Changes declined.', 'system');
  }

  function clearGhosts() {
    _pendingGhosts.forEach(g => App.scene.remove(g));
    _pendingGhosts = [];
    App.requestRender();
  }

  // An open preview, dismissed with no note: the history says it was declined.
  function dropPreview() {
    if (!_pendingActions) return;
    settleHistory(_pendingActions, false);
    clearGhosts();
    _pendingActions = null;
    document.getElementById('sparky-pending-bar').style.display = 'none';
  }

  // A confirmed photo's actions (issue #143) on a board of their own, as one
  // undo step. A board that isn't empty becomes a new "Untitled" circuit
  // first, so her open saved circuit is never overwritten (delete_all would
  // keep it, and autosave would write the photo over it).
  function applyBuild(actions) {
    dropPreview();
    if (App.state.components.length || App.state.wires.length) App.clearAll();
    const labels = Chat.predictLabels(actions, App.state.components);
    const result = Chat.acceptBuild(actions, board);
    App.frameCircuit();
    const bad    = new Set(result.failedActions);
    const placed = (actions || []).map((a, i) => (Chat.placesParts([a]) && !bad.has(a) ? [a, labels[i]] : null)).filter(Boolean);
    const n      = placed.length;
    sparkyAddMsg(`Built ${n} part${n !== 1 ? 's' : ''} from your photo. Undo (Ctrl+Z) brings back the empty board.`, 'system');
    const said = placed.map(([a, label]) => (a.holeA != null ? `${label} ${a.holeA}–${a.holeB}` : label));
    chatHistory.push({ role: 'model', text: `I built your board from the photo: ${said.join(', ')}.` });
    return result;
  }

  // ── Main ask ─────────────────────────────────────────────────

  // { context }: a line added to the message sent (and kept in the history),
  // never shown in her bubble (the photo build's, issue #143).
  // { explain }: this one ask wants an answer, not an edit (issue #169).
  async function sparkyAsk(overrideMsg, { context, explain } = {}) {
    const input = document.getElementById('sparky-input');
    const msg   = (overrideMsg !== undefined) ? overrideMsg : input.value.trim();
    if (!msg) return;
    const sent  = context ? msg + '\n\n' + context : msg;

    // If there's an open preview, dismiss it before sending a new message.
    dropPreview();

    sparkyAddMsg(msg, 'user');
    input.value = '';
    input.style.height = 'auto';

    const typingEl = sparkyTyping();

    try {
      const markdown = App.exportMarkdown ? App.exportMarkdown() : '_Board not ready._';
      const boardNow = App.exportBoard ? App.exportBoard() : undefined;   // the board model, wire ids included (#84)
      const data = await askSparky(markdown, sent, chatHistory.slice(-20), boardNow, explain === true);
      typingEl.remove();
      sparkyAddMsg(data.reply || '(no reply)', 'ai');

      const entry = { role: 'model', text: data.reply || '' };
      chatHistory.push({ role: 'user', text: sent });
      chatHistory.push(entry);

      if (data.actions && data.actions.length) {
        sparkyPreviewActions(data.actions);
        if (_pendingActions) _pendingEntry = { entry, reply: data.reply || '' };
      }
    } catch (err) {
      typingEl.remove();
      sparkyAddMsg('⚠️ ' + err.message, 'system');
    }
  }

  function sparkyQuick(msg) { sparkyAsk(msg); }

  // The panel's buttons call these from inline onclick attributes.
  Object.assign(window, { sparkyAsk, sparkyQuick, sparkyAcceptChanges, sparkyDeclineChanges });
  Chat.applyBuild = applyBuild;   // photo.js's Build it (issue #143)

  document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('sparky-input');
    if (!inp) return;
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sparkyAsk(); }
    });
    // Auto-resize textarea as user types
    inp.addEventListener('input', () => {
      inp.style.height = 'auto';
      inp.style.height = Math.min(inp.scrollHeight, 100) + 'px';
    });
  });

})(window.App, window.SparkyChat, window.Parts);
