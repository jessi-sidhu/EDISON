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

  // A wire end the AI names: a component pin by label ("BAT1.0") or the old
  // form ("battery_0_pin0"), or a hole. Pin k is the same index in both.
  // Returns { comp, pin } or { hole }, or null if it names nothing.
  function resolveEndpoint(str, board) {
    const ref = Ids.parsePinRef(str);
    if (ref) {
      // Named pins ("U1.OUT") aren't wired up yet: pins are indexed by number.
      if (typeof ref.pin !== 'number') return null;
      const comp = ref.label
        ? Ids.findByLabel(board.components(), ref.label)
        : Ids.findComponent(board.components(), ref.type, ref.n);
      return comp ? { comp, pin: ref.pin } : null;
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

  // place_<type> for any registry part: its holes (one per pin), or the
  // board's spot for an off-board part.
  function placeOne(a, board) {
    const def = partFor(a.tool);
    if (!def) {
      note(board, `${a.tool.slice('place_'.length)} not placed: there is no part type "${a.tool.slice('place_'.length)}".`);
      return false;
    }
    let where;
    if (def.place.kind === 'offboard') {
      // The board says where an AI battery goes (App.batterySpot in a page).
      const { x, z } = board.batterySpot();
      where = { x, z };
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
    if (a.tool === 'add_wire') {
      const from = resolveEndpoint(a.from, board), to = resolveEndpoint(a.to, board);
      return !!(from && to && board.addWire(from, to, colorHex(a.color)));
    }
    return false;
  }

  // Apply the AI's actions in order. Returns how many took effect and how
  // many did not, so the chat can report what really happened.
  function applyActions(actions, board) {
    let applied = 0, failed = 0;
    (actions || []).forEach(a => {
      let ok = false;
      try { ok = applyOne(a, board); } catch (e) { console.warn('Action failed:', a, e.message); }
      if (ok) applied++; else failed++;
    });
    return { applied, failed };
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

  return { resolveEndpoint, applyActions, acceptBuild, predictLabels, partFor, partValues, colorHex, EDITS, ROTATION };
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
    clearAll:      () => App.clearAll(),
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

  async function askSparky(markdown, userMsg, history) {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown, message: userMsg, history }),
    });
    let data = null;
    try { data = await res.json(); } catch { /* upstream returned a non-JSON error page */ }
    if (!res.ok || !data) {
      console.error('/api/ask failed:', res.status, data);
      throw new Error((data && data.reply) || 'Sparky could not reach the AI service. Please try again in a moment.');
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
    el.textContent = text;
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

  function sparkyPreviewActions(actions) {
    sparkyDeclineChanges();          // clear any stale preview first
    if (!actions || !actions.length) return;
    _pendingActions = actions;

    const bb = App.state.breadboard;

    // Off-board parts (the battery) are drawn first, so wire ghosts can
    // reach pins that do not exist yet. Their pin positions are keyed (lower
    // case) by the label Accept will give each one ("bat1.0") and by the old
    // form ("battery_0_pin0"). A delete_all ahead of them restarts numbering.
    const pendingPins = {};
    const ghosts = [];
    const labels = Chat.predictLabels(actions, App.state.components);
    const counts = {};
    const countOf = type => App.state.components.filter(c => c.type === type).length;
    actions.forEach((a, i) => {
      if (a.tool === 'delete_all') { for (const k of Object.keys(counts)) counts[k] = 0; return; }
      const def = Chat.partFor(a.tool);
      if (!def || def.place.kind !== 'offboard') return;
      const spot = board.batterySpot();   // the same spot Accept uses
      const built = App.buildPart(def.type, Parts.legsOf({ type: def.type, holeRefs: null }), Chat.partValues(a), { ghost: true });
      built.group.position.set(spot.x, 0, spot.z);
      if (!(def.type in counts)) counts[def.type] = actions.slice(0, i).some(b => b.tool === 'delete_all') ? 0 : countOf(def.type);
      built.pinPositions.forEach((p, k) => {
        const at = p.clone().add(built.group.position);
        pendingPins[`${labels[i]}.${k}`.toLowerCase()] = at;
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
          ghost = App.buildPreview(def.type, App.SPANS[def.type] || def.place.span.default, bb.HS, rotation, Chat.partValues(a));
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
      }
      // delete_all: no ghost mesh

      if (ghost) { App.scene.add(ghost); _pendingGhosts.push(ghost); }
    });
    notes.forEach(text => sparkyAddMsg(text, 'system'));

    document.getElementById('sparky-pending-bar').style.display = 'flex';
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

    const { applied, failed } = Chat.acceptBuild(actions, board);
    sparkyAddMsg(`✓ Applied ${applied} change${applied !== 1 ? 's' : ''} to your circuit.` +
      (failed ? ` ${failed} could not be applied.` : ''), 'system');
  }

  function sparkyDeclineChanges() {
    if (!_pendingActions) return;
    clearGhosts();
    _pendingActions = null;
    document.getElementById('sparky-pending-bar').style.display = 'none';
    sparkyAddMsg('Changes declined.', 'system');
  }

  function clearGhosts() {
    _pendingGhosts.forEach(g => App.scene.remove(g));
    _pendingGhosts = [];
  }

  // ── Main ask ─────────────────────────────────────────────────

  async function sparkyAsk(overrideMsg) {
    const input = document.getElementById('sparky-input');
    const msg   = (overrideMsg !== undefined) ? overrideMsg : input.value.trim();
    if (!msg) return;

    // If there's an open preview, dismiss it before sending a new message
    if (_pendingActions) {
      clearGhosts();
      _pendingActions = null;
      document.getElementById('sparky-pending-bar').style.display = 'none';
    }

    sparkyAddMsg(msg, 'user');
    input.value = '';
    input.style.height = 'auto';

    const typingEl = sparkyTyping();

    try {
      const markdown = App.exportMarkdown ? App.exportMarkdown() : '_Board not ready._';
      const data = await askSparky(markdown, msg, chatHistory.slice(-20));
      typingEl.remove();
      sparkyAddMsg(data.reply || '(no reply)', 'ai');

      chatHistory.push({ role: 'user', text: msg });
      chatHistory.push({ role: 'model', text: data.reply || '' });

      if (data.actions && data.actions.length) sparkyPreviewActions(data.actions);
    } catch (err) {
      typingEl.remove();
      sparkyAddMsg('⚠️ ' + err.message, 'system');
    }
  }

  function sparkyQuick(msg) { sparkyAsk(msg); }

  // The panel's buttons call these from inline onclick attributes.
  Object.assign(window, { sparkyAsk, sparkyQuick, sparkyAcceptChanges, sparkyDeclineChanges });

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
