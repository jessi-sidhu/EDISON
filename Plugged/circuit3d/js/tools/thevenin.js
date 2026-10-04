// ─────────────────────────────────────────────────────────────
//  tools/thevenin.js — the Thévenin card (issue #93).
//  While simulating, #thevenin-btn (beside Stop) enters pick mode: click
//  two holes, each marked on the board, and #thevenin-card shows Vth, Rth
//  and In (Norton) between them, from readings.thevenin(a, b) of the
//  latest plugged:sim. Esc cancels a pick or closes the card; Stop clears
//  everything.
//
//  While picking (issue #196) the button is pressed (aria-pressed), the
//  hint asks for the first, then the second hole, and the canvas has a
//  crosshair (.th-picking, tools.css). Clicking the button again cancels.
//  When the pick ends, the hint that was there before comes back, unless
//  something else has changed the hint since.
//
//  While picking, pointerdown and pointerup on the canvas are caught on
//  window in the capture phase and stopped, so interaction.js, equations.js
//  and the orbit controls never see a pick.
//
//  Hole colours follow the shared convention (colouring.js, connections.js):
//  ensureInstanceColours once, and put back only the colours this file
//  changed that are still our mark. Before colouring.js recolours (a solve,
//  the colour toggle) the marks are lifted, and put back on top after.
//
//  LOADING
//  ───────
//  Browser: a <script> after readings.js. Does nothing in Node.
// ─────────────────────────────────────────────────────────────

(function () {
  if (typeof document === 'undefined') return;

  const MARK    = new THREE.Color(0xff8c00);   // orange, on plain and tinted holes
  const DRAG_PX = 8;                           // as interaction.js: more is an orbit, not a click
  const HINT_1  = 'Thévenin: click the first hole · Esc to cancel';
  const HINT_2  = 'Thévenin: click the second hole · Esc to cancel';

  let latest  = null;   // readings of the last solve while simulating
  let picking = false;
  let picked  = [];     // hole names, at most 2
  let marked  = [];     // [{ hole, idx, prev: Color }]
  let down    = null;
  let card    = null;
  let raycaster = null;
  let before  = null;   // the hint before the pick: { text, shown }, or null

  // Idempotent: the board looks the same before and after.
  function ensureInstanceColours(m) {
    if (m.userData.plainColour) return;
    m.userData.plainColour = m.material.color.clone();
    for (let i = 0; i < m.count; i++) m.setColorAt(i, m.userData.plainColour);
    m.material.color.set(0xffffff);
    m.instanceColor.needsUpdate = true;
    m.material.needsUpdate = true;   // r128 recompiles to use instance colours
  }

  // The connection glow saves the colour under it; drop it first so it
  // never saves or restores our mark (the canvas pointerdown we stop
  // would have cleared it too).
  function dropGlow() { if (window.Connections) window.Connections.onBoardChange(App.state); }

  const isMark = c => Math.abs(c.r - MARK.r) + Math.abs(c.g - MARK.g) + Math.abs(c.b - MARK.b) < 1e-4;

  function mark(hole) {
    const bb = App.state.breadboard, mesh = bb.holesMesh;
    const { col, row } = App.parseHole(hole);
    const h = bb.getHole(col, row);
    if (!h) return;
    dropGlow();
    ensureInstanceColours(mesh);
    const prev = new THREE.Color();
    mesh.getColorAt(h.idx, prev);
    mesh.setColorAt(h.idx, MARK);
    mesh.instanceColor.needsUpdate = true;
    marked.push({ hole, idx: h.idx, prev });
  }

  // Puts back what is under each mark; → the holes that were marked, in order.
  function lift() {
    if (!marked.length) return [];
    const holes = marked.map(m => m.hole);
    dropGlow();
    const mesh = App.state.breadboard.holesMesh, now = new THREE.Color();
    // Newest first, so a hole picked twice ends on its first saved colour.
    for (const m of marked.reverse()) {
      mesh.getColorAt(m.idx, now);
      if (isMark(now)) mesh.setColorAt(m.idx, m.prev);
    }
    mesh.instanceColor.needsUpdate = true;
    marked = [];
    return holes;
  }

  function unmark() { lift(); }

  function startPick() {
    clearAll();
    picking = true;
    btn.setAttribute('aria-pressed', 'true');
    if (App.renderer) App.renderer.domElement.classList.add('th-picking');
    before = { text: document.getElementById('hint-text').textContent,
               shown: !document.getElementById('hint-box').classList.contains('hint-hidden') };
    App.setHint(HINT_1);
  }

  // Unpresses the button, drops the crosshair and puts back the hint from
  // before the pick, if the hint still shows ours.
  function endPick() {
    picking = false;
    btn.setAttribute('aria-pressed', 'false');
    if (App.renderer) App.renderer.domElement.classList.remove('th-picking');
    if (!before) return;
    const now = document.getElementById('hint-text').textContent;
    if (now === HINT_1 || now === HINT_2) App.setHint(before.shown ? before.text : '');
    before = null;
  }

  function clearAll() {
    endPick();
    picked = [];
    down = null;
    unmark();
    if (card) card.hidden = true;
  }

  const row = (name, value) => {
    const el = document.createElement('div');
    el.textContent = `${name} = ${value}`;
    return el;
  };

  function showCard(a, b, x, y) {
    if (!card) {
      card = document.createElement('div');
      card.id = 'thevenin-card';
      document.body.appendChild(card);
    }
    const th = latest ? latest.thevenin(a, b) : { why: 'Run the simulation first.' };
    const title = document.createElement('div');
    title.className = 'th-title';
    title.textContent = `Thévenin ${a} → ${b}`;
    card.replaceChildren(title);
    if (th.why) {
      const why = document.createElement('div');
      why.className = 'th-why';
      why.textContent = th.why;
      card.append(why);
    } else {
      card.append(row('Vth', `${th.Vth.toFixed(2)} V`), row('Rth', `${th.Rth.toFixed(1)} Ω`),
                  row('In', `${th.In.toFixed(2)} mA`));
    }
    card.hidden = false;
    const w = card.offsetWidth, h = card.offsetHeight;
    card.style.left = Math.max(4, Math.min(x + 12, window.innerWidth - w - 4)) + 'px';
    card.style.top  = Math.max(4, Math.min(y + 12, window.innerHeight - h - 4)) + 'px';
  }

  // The hole nearest the click on the board, within half a pitch, or null.
  function holeAt(e) {
    const r = App.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster = raycaster || new THREE.Raycaster();
    raycaster.setFromCamera(ndc, App.camera);
    const pt = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!pt) return null;
    let best = null, bestD = App.BOARD_GEOMETRY.HS / 2;
    for (const h of App.state.breadboard.holeData) {
      const d = Math.hypot(h.x - pt.x, h.z - pt.z);
      if (d < bestD) { best = h; bestD = d; }
    }
    return best ? App.holeName(best) : null;
  }

  const onCanvas = e => picking && App.renderer && e.target === App.renderer.domElement;

  window.addEventListener('pointerdown', e => {
    if (!onCanvas(e)) return;
    e.stopPropagation();
    down = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  }, true);

  window.addEventListener('pointerup', e => {
    if (!onCanvas(e)) return;
    e.stopPropagation();
    if (!down || e.pointerId !== down.id) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX;
    down = null;
    const hole = moved ? null : holeAt(e);
    if (!hole) return;
    picked.push(hole);
    mark(hole);
    if (picked.length < 2) { App.setHint(HINT_2); return; }
    endPick();
    showCard(picked[0], picked[1], e.clientX, e.clientY);
  }, true);

  // The button sits beside Stop (after the colour toggle) and shows only while simulating.
  const btn = document.createElement('button');
  btn.id = 'thevenin-btn';
  btn.className = 'btn-colouring';
  btn.title = 'Pick two holes to see the Thévenin and Norton equivalent between them';
  btn.textContent = 'Thévenin';
  btn.setAttribute('aria-pressed', 'false');
  btn.hidden = true;
  const after = document.getElementById('colouring-toggle') || document.getElementById('sim-stop-btn');
  if (after) after.after(btn);

  // A second click while picking cancels.
  btn.addEventListener('click', () => {
    if (picking) clearAll();
    else startPick();
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') clearAll(); });

  // colouring.js forgets a hole it finds under our mark, so lift the marks
  // before it recolours (window capture runs first) and mark again after.
  let lifted = [];
  const onToggle = e => e.target && e.target.closest && e.target.closest('#colouring-toggle');
  window.addEventListener('click', e => { if (onToggle(e)) lifted = lift(); }, true);
  document.addEventListener('click', e => {
    if (!onToggle(e)) return;
    lifted.forEach(mark);
    lifted = [];
  });
  window.addEventListener('plugged:sim', () => { lifted = lift(); }, true);

  // After colouring.js's listener: thevenin.js loads after it.
  document.addEventListener('plugged:sim', e => {
    const d = e.detail || {};
    // A first run that fails never starts the simulation, so no Stop follows.
    const running = App.simRunning || (d.result && d.result.status === 'ok');
    latest = running && d.readings ? d.readings : null;
    btn.hidden = !running;
    const holes = lifted;
    lifted = [];
    // A picked hole that went floating ends the pick: nothing to show.
    if (!latest || holes.some(h => latest.voltage(h) === null)) clearAll();
    else holes.forEach(mark);
  });

  // On window in the capture phase, so our marks go back before
  // colouring.js puts back its tint underneath them.
  window.addEventListener('plugged:sim-stop', () => {
    latest = null;
    btn.hidden = true;
    clearAll();
  }, true);
})();
