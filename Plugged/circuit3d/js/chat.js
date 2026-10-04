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

  const PLACE = { place_resistor: 'placeResistor', place_led: 'placeLED',
                  place_buzzer: 'placeBuzzer', place_button: 'placeButton' };

  // The one value each part takes from the AI; buzzers and buttons take none.
  const VALUE_KEY = { place_resistor: 'resistance', place_led: 'color', place_battery: 'voltage' };

  // The values an action names for its part, e.g. { resistance: 1000 }, or {}
  // for the part's defaults. The server has already dropped bad ones.
  function partValues(a) {
    const key = VALUE_KEY[a.tool];
    return key && a[key] != null ? { [key]: a[key] } : {};
  }

  // A registry part's placement, checked against the board as it is now
  // (docs/API-CONTRACT.md → Parts.checkPlacement). The refusal, or null.
  function placementRefusal(type, hA, hB, board) {
    if (!Parts || !Parts.get(type)) return null;   // legacy parts join as they move
    const legs  = Parts.legsOf({ type, holeRefs: [{ col: hA.col, row: hA.row }, { col: hB.col, row: hB.row }] });
    const map   = board.holeMap ? board.holeMap() : new Map();
    const check = Parts.checkPlacement(type, legs, map, { cols: GEOMETRY.COLS, bodyRows: GEOMETRY.BODY_ROWS });
    return check.ok ? null : `${Ids.nextLabel(board.components(), type)} not placed: ${check.reason}`;
  }

  function applyOne(a, board) {
    if (PLACE[a.tool]) {
      const hA = holeOf(a.holeA, board), hB = holeOf(a.holeB, board);
      if (!hA || !hB) return false;
      const refusal = placementRefusal(a.tool.slice('place_'.length), hA, hB, board);
      if (refusal) {
        if (board.note) board.note(refusal);
        return false;
      }
      board[PLACE[a.tool]](hA, hB, partValues(a));
      return true;
    }
    if (a.tool === 'place_battery') {
      // The board says where an AI battery goes (App.batterySpot in a page).
      const { x, z } = board.batterySpot();
      board.placeBattery(x, z, partValues(a));
      return true;
    }
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
  // action that places nothing. Mirrors what App.place* does on Accept:
  // Ids.nextLabel over the board as it will be, with delete_all emptying it.
  function predictLabels(actions, components) {
    let parts = (components || []).slice();
    return (actions || []).map(a => {
      if (a.tool === 'delete_all') { parts = []; return null; }
      if (!a.tool || !a.tool.startsWith('place_')) return null;
      const type = a.tool.slice('place_'.length);
      const label = Ids.nextLabel(parts, type);
      parts.push({ type, label });
      return label;
    });
  }

  return { resolveEndpoint, applyActions, acceptBuild, predictLabels, partValues, colorHex };
});

// ── Browser panel ─────────────────────────────────────────────
//  Everything below touches the DOM or THREE, so it only runs in a page.
if (typeof window !== 'undefined') (function (App, Chat) {

  const chatHistory = [];   // {role:'user'|'model', text} pairs for conversation memory

  // The real board, in the shape applyActions expects.
  const board = {
    components:    () => App.state.components,
    batterySpot:   () => App.batterySpot(),
    parseHole:     s => App.parseHole(s),
    getHole:       (col, row) => App.state.breadboard.getHole(col, row),
    placeResistor: (a, b, v) => App.placeResistor(a, b, v),
    placeLED:      (a, b, v) => App.placeLED(a, b, v),
    placeBuzzer:   (a, b, v) => App.placeBuzzer(a, b, v),
    placeButton:   (a, b, v) => App.placeButton(a, b, v),
    placeBattery:  (x, z, v) => App.placeBattery(x, z, v),
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

    // Pin positions of batteries that do not exist yet, so wire ghosts can
    // reach them. Keyed (lower case) by the label Accept will give each one
    // ("bat1.0") and by the old form ("battery_0_pin0"). A delete_all ahead
    // of them means numbering restarts.
    const pendingPins = {};
    const H = 2.6;                   // battery body height (must match buildBattery)
    const labels = Chat.predictLabels(actions, App.state.components);
    let batteryIdx = App.state.components.filter(c => c.type === 'battery').length;
    actions.forEach((a, i) => {
      if (a.tool === 'delete_all') batteryIdx = 0;
      if (a.tool === 'place_battery') {
        const { x, z } = board.batterySpot();
        const pins = [new THREE.Vector3(x - 0.32, H + 0.54, z), new THREE.Vector3(x + 0.32, H + 0.24, z)];
        pins.forEach((p, k) => {
          pendingPins[`${labels[i]}.${k}`.toLowerCase()] = p;
          pendingPins[`battery_${batteryIdx}_pin${k}`] = p;
        });
        batteryIdx++;
      }
    });

    for (const a of actions) {
      let ghost = null;

      if (['place_resistor', 'place_led', 'place_buzzer', 'place_button'].includes(a.tool)) {
        const type = a.tool.replace('place_', '');
        const hA = Chat.resolveEndpoint(a.holeA, board);
        const hB = Chat.resolveEndpoint(a.holeB, board);
        if (hA && hA.hole && hB && hB.hole) {
          const rotation = hA.hole.col === hB.hole.col ? 1 : 0;
          ghost = App.buildPreview(type, App.SPANS[type] || 2, bb.HS, rotation, Chat.partValues(a));
          ghost.position.set((hA.hole.x + hB.hole.x) / 2, 0, (hA.hole.z + hB.hole.z) / 2);
        }
      } else if (a.tool === 'place_battery') {
        const spot = board.batterySpot();   // the same spot Accept uses
        ghost = App.buildPreview('battery', 0, bb.HS, 0);
        ghost.position.set(spot.x, 0, spot.z);
      } else if (a.tool === 'add_wire') {
        ghost = buildWireGhost(a.from, a.to, a.color, pendingPins);
      }
      // delete_all: no ghost mesh

      if (ghost) { App.scene.add(ghost); _pendingGhosts.push(ghost); }
    }

    document.getElementById('sparky-pending-bar').style.display = 'flex';
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

})(window.App, window.SparkyChat);
