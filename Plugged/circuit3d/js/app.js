// ─────────────────────────────────────────────────────────────
//  app.js — State, placement, wire drawing, selection, render loop
// ─────────────────────────────────────────────────────────────

(function (App) {

  // ── Application State ───────────────────────────────────────
  App.state = {
    mode:             'select',
    pickedType:       null,
    placementRotation: 0,      // 0 = horizontal, 1 = vertical (toggled with R)
    wireStart:        null,    // { world, holeRef, pinMesh }
    tempWire:         null,    // dashed preview line
    wireColor:        0xef4444,
    selected:         null,    // { item, kind }
    components:       [],      // placeholders ({ unknown: true, group: null }) keep their slot
    wires:            [],
    unknownWires:     [],      // saved wires to a placeholder, kept for the next save
    breadboard:       null,
    circuitName:      'Untitled',
    circuitId:        null,    // assigned on first auto-save
    // Cached hover holes (set by interaction.js during hover)
    _hoverHoleA: null,
    _hoverHoleB: null,
  };

  // ── Local project storage helpers ───────────────────────────
  // Whoever the dashboard last signed in, or "guest".
  const LS_KEY = SparkyStorage.projectsKey(SparkyStorage.currentUid(localStorage));

  function lsProjects() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
  }
  function lsSave(projects) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(projects)); } catch {}
  }

  // Find the next available "Untitled (N)" name
  function nextUntitledName() {
    const names = new Set(lsProjects().map(p => p.name));
    if (!names.has('Untitled')) return 'Untitled';
    let n = 1;
    while (names.has(`Untitled (${n})`)) n++;
    return `Untitled (${n})`;
  }

  // Span constants: columns (or rows) between leads. The one table;
  // interaction.js and chat.js read App.SPANS, the old names are aliases.
  App.SPANS = { resistor: 4, led: 2, buzzer: 2, button: 3 };
  App.RESISTOR_SPAN = App.SPANS.resistor;
  App.LED_SPAN      = App.SPANS.led;
  App.BUZZER_SPAN   = App.SPANS.buzzer;
  App.BUTTON_SPAN   = App.SPANS.button;

  // How far past the board's end a battery sits (user and AI placement).
  App.BATTERY_MARGIN = 2.5;

  // Where the AI's battery goes: just past the right-hand end of the board,
  // right behind the top + and − rails so its wires drop straight in.
  App.batterySpot = function () {
    const { BOARD_W, ROW_Z } = App.BOARD_GEOMETRY;
    return { x: BOARD_W / 2 + App.BATTERY_MARGIN, z: (ROW_Z.tp + ROW_Z.tn) / 2 };
  };

  const state = App.state;

  // ── Render Loop ─────────────────────────────────────────────

  const _camThreshold = 0.5;

  function _isCamDefault() {
    const p = App.camera.position, t = App.controls.target;
    const { pos, target } = App.CAMERA.home;
    return Math.abs(p.x - pos[0])    < _camThreshold &&
           Math.abs(p.y - pos[1])    < _camThreshold &&
           Math.abs(p.z - pos[2])    < _camThreshold &&
           Math.abs(t.x - target[0]) < _camThreshold &&
           Math.abs(t.y - target[1]) < _camThreshold &&
           Math.abs(t.z - target[2]) < _camThreshold;
  }

  function animate() {
    requestAnimationFrame(animate);
    App.controls.update();
    App.renderer.render(App.scene, App.camera);

    const resetBtn = document.getElementById('reset-cam-btn');
    if (resetBtn) resetBtn.style.display = _isCamDefault() ? 'none' : 'flex';
  }

  // ── Sidebar ──────────────────────────────────────────────────

  // The part items are generated from the registry (sidebar.js); one
  // listener on #sidebar serves them and the hand-written Wire tool.
  function initSidebar() {
    Sidebar.render(document.getElementById('part-list'), document.getElementById('part-search'), Parts.all());
    document.getElementById('sidebar').addEventListener('click', e => {
      const btn = e.target.closest('.comp-item[data-type]');
      if (!btn) return;
      const type = btn.dataset.type;
      if (type === 'wire') {
        setMode('wire');
        document.getElementById('wire-color-row').style.display = 'block';
      } else {
        state.pickedType = type;
        setMode('place');
        document.getElementById('wire-color-row').style.display = 'none';
      }
    });

    document.querySelectorAll('.mode-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });

    document.querySelectorAll('.swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        state.wireColor = parseInt(sw.dataset.color, 16);
      });
    });
  }

  // ── Mode ─────────────────────────────────────────────────────

  const MODE_HINTS = {
    select: 'Click a component or wire to select it · DEL to delete',
    place:  'Hover over the board to preview · Click to place · R to rotate · ESC to cancel',
    wire:   'Click any hole or gold pin to start a wire · click again to complete',
  };

  App.setMode = function (m) {
    if (m !== 'wire')   App.cancelWire();
    if (m !== 'select') App.deselect();
    state.mode = m;

    document.querySelectorAll('.mode-btn[data-mode]').forEach(b =>
      b.classList.toggle('active', b.dataset.mode === m));
    document.querySelectorAll('.comp-item').forEach(b => {
      b.classList.toggle('active',
        (m === 'place' && b.dataset.type === state.pickedType) ||
        (m === 'wire'  && b.dataset.type === 'wire'));
    });

    document.getElementById('wire-color-row').style.display  = m === 'wire' ? 'block' : 'none';
    document.getElementById('rotate-badge').style.display    = m === 'place' ? 'block' : 'none';
    App.setHint(MODE_HINTS[m]);
  };

  function setMode(m) { App.setMode(m); }

  // ── Hint ─────────────────────────────────────────────────────

  let hintTimer = null;

  App.setHint = function (text, durationMs) {
    const box = document.getElementById('hint-box');
    document.getElementById('hint-text').textContent = text || '';
    box.className = text ? '' : 'hint-hidden';
    clearTimeout(hintTimer);
    if (durationMs) hintTimer = setTimeout(() => { box.className = 'hint-hidden'; }, durationMs);
  };

  // ── Placement ────────────────────────────────────────────────
  // Every part goes on the board through App.placePart (hand placement,
  // rebuildBoard, chat.js). Its optional last `opts`: opts.label keeps a
  // saved label (R2, BAT1…), otherwise the part gets the next free one.

  function partLabel(type, opts) {
    return (opts && opts.label) || App.nextLabel(state.components, type);
  }

  // ── Registry placement ──────────────────────────────────────
  // The values a part keeps from `values`: each of its own keys that
  // Parts.checkValue accepts. A refused one is dropped with a warning, so
  // the part keeps its default; keys it doesn't have (an old file's derived
  // or retired ones, such as a buzzer's resistance) are dropped quietly.
  function checkedValues(type, values) {
    const def = Parts.get(type);
    const given = {};
    for (const [key, v] of Object.entries(values || {})) {
      if (!Object.hasOwn(def.values || {}, key)) continue;
      const check = Parts.checkValue(type, key, v);
      if (check.ok) given[key] = check.value;
      else console.warn(`${def.name} value ignored: ${check.reason}`);
    }
    return App.componentValues(type, given);
  }

  // A new record's controls, each at its default; undefined for a part with none.
  function controlDefaults(type) {
    const specs = Parts.get(type).controls;
    if (!specs) return undefined;
    const out = {};
    for (const [key, c] of Object.entries(specs)) out[key] = c.default;
    return out;
  }

  // An off-board part sits at least BATTERY_MARGIN past either end of the board.
  function offboardX(wx) {
    const margin = state.breadboard.BOARD_W / 2 + App.BATTERY_MARGIN;
    return wx >= 0 ? Math.max(wx, margin) : Math.min(wx, -margin);
  }

  // An off-board model is drawn around (0, 0, 0): move it, and its pins, to (x, z).
  function atSpot(built, x, z) {
    built.group.position.set(x, 0, z);
    return { group: built.group, pinPositions: built.pinPositions.map(p => p.clone().add(built.group.position)) };
  }

  // Puts a model built by App.buildPart on the board as a new record.
  // holeRefs: one { col, row } per pin, or null off the board.
  function addPart(type, built, values, holeRefs, opts) {
    App.scene.add(built.group);
    const record = {
      type, label: partLabel(type, opts), group: built.group, pins: built.pinPositions, pinMeshes: [], values, holeRefs,
    };
    const controls = controlDefaults(type);
    if (controls) record.controls = controls;
    addPinMarkers(record);
    state.components.push(record);
    refreshCounts();
    return record;
  }

  // One placement for every registry part; rebuilding a board (load, undo)
  // uses it. where: the board holes, one per pin, or { x, z } off the board.
  App.placePart = function (type, where, values, opts) {
    const def = Parts.get(type);
    if (!def) return null;
    pushHistory();
    const vals = checkedValues(type, values);
    if (def.place.kind === 'offboard') {
      const built = App.buildPart(type, Parts.legsOf({ type, holeRefs: null }), vals);
      return addPart(type, atSpot(built, offboardX(where.x), where.z), vals, null, opts);
    }
    const holeRefs = where.map(h => ({ col: h.col, row: h.row }));
    return addPart(type, App.buildPart(type, Parts.legsOf({ type, holeRefs }), vals), vals, holeRefs, opts);
  };

  // Flips a part's `pressed` control (the button's). Kept for the tests and
  // the AI; a click on the part while simulating goes through
  // App.partGesture. The cap moves in its view.update, after the next
  // simulation.
  App.toggleButton = function (comp) {
    const def = comp && Parts.get(comp.type);
    if (!def || !def.controls || !Object.hasOwn(def.controls, 'pressed')) return;
    comp.controls = comp.controls || {};
    comp.controls.pressed = !comp.controls.pressed;
  };

  // ── Edits (the AI's set_value, set_control, delete_part) ────
  // Each changes one part in place, keeping its label, holes and wires, and
  // records one undo step (inside an AI build's batch, the build's one step).

  // Draws a part's model again, for its current values, where it stands.
  // A selected part stays selected (the inspector stays on it).
  function redrawPart(comp) {
    const def = Parts.get(comp.type);
    if (!def) return;
    const wasSelected = !!(state.selected && state.selected.item === comp);
    if (wasSelected) App.deselect();
    (comp.pinMeshes || []).forEach(pm => App.scene.remove(pm));
    if (comp.group) App.scene.remove(comp.group);
    let built;
    if (def.place.kind === 'offboard') {
      const at = comp.group ? comp.group.position : { x: 0, z: 0 };
      built = atSpot(App.buildPart(comp.type, Parts.legsOf({ type: comp.type, holeRefs: null }), comp.values), at.x, at.z);
    } else {
      built = App.buildPart(comp.type, Parts.legsOf(comp), comp.values);
    }
    App.scene.add(built.group);
    comp.group = built.group;
    comp.pins = built.pinPositions;
    comp.pinMeshes = [];
    addPinMarkers(comp);
    if (wasSelected) App.selectItem(comp, 'component');
  }

  // values: already checked with Parts.checkValue, e.g. { resistance: 1000 }.
  App.setValues = function (comp, values) {
    pushHistory();
    comp.values = App.componentValues(comp.type, Object.assign({}, comp.values, values));
    redrawPart(comp);
    refreshCounts();
    if (App.simRunning) App.runSimulation();
  };

  // controls: e.g. { pressed: true }, each one the part has.
  App.setControls = function (comp, controls) {
    pushHistory();
    comp.controls = Object.assign({}, comp.controls, controls);
    if (App.simRunning) App.runSimulation();
  };

  // Removes the part and the wires on its pins.
  App.deletePart = function (comp) {
    pushHistory();
    if (state.selected && state.selected.item === comp) App.deselect();
    removeComponent(comp);
    refreshCounts();
    if (App.simRunning) App.runSimulation();
  };

  // ── Gestures ─────────────────────────────────────────────────
  // A click (or a scroll) on a part's model while the simulation runs
  // moves the control its `gestures` names. gestures.js throttles the
  // re-simulation and makes one gesture one undo step. A control that
  // isn't saved (a button's press) leaves nothing to undo, so it records
  // no step: undo would only stop the simulation.
  let gestureSaved = false;
  const gestures = Gestures.create({
    now:          () => performance.now(),
    setTimeout:   (fn, ms) => setTimeout(fn, ms),
    clearTimeout: id => clearTimeout(id),
    simulate:     () => { if (App.simRunning) App.runSimulation(); },
    pushHistory:  () => { if (gestureSaved) pushHistory(); },
  });

  // One tick of a gesture on control `key`: next(now, spec) is its new setting.
  function controlTick(comp, key, kind, next) {
    const spec = Parts.get(comp.type).controls[key];
    gestureSaved = spec.saved;
    gestures.tick(kind, () => {
      comp.controls = comp.controls || {};
      const now = Object.hasOwn(comp.controls, key) ? comp.controls[key] : spec.default;
      comp.controls[key] = next(now, spec);
    });
  }

  // kind: 'click' | 'scroll'; dir: +1 / −1 for a scroll. false when comp
  // has no control for that gesture.
  App.partGesture = function (comp, kind, dir) {
    const def = comp && Parts.get(comp.type);
    const key = def && def.gestures && def.gestures[kind];
    if (!key) return false;
    controlTick(comp, key, kind, (now, spec) => (spec.type === 'slider'
      ? Math.min(spec.max, Math.max(spec.min, now + (dir || 1) * spec.step))
      : !now));
    if (kind === 'click') gestures.release();
    return true;
  };

  // The inspector's controls, through the same dispatcher: a toggle is one
  // tick and done; a slider drag ticks on every move and is done on release
  // (one undo step for a saved control, a throttled re-simulation). A
  // momentary control moves only while simulating, like a click. false when
  // nothing changed.
  App.controlEdit = function (comp, key, value, done) {
    const def  = comp && Parts.get(comp.type);
    const spec = def && def.controls && Object.hasOwn(def.controls, key) ? def.controls[key] : null;
    if (!spec) return false;
    if (spec.type === 'momentary' && !App.simRunning) return false;
    controlTick(comp, key, 'drag', () => value);
    if (done) gestures.release();
    if (spec.saved) scheduleAutoSave();
    return true;
  };

  // ── Pin Markers ──────────────────────────────────────────────

  const PIN_GEO = new THREE.SphereGeometry(0.10, 11, 11);
  const PIN_MAT = () => new THREE.MeshLambertMaterial({
    color: 0xf5c518, emissive: 0x3a2800, emissiveIntensity: 0.4,
  });

  function addPinMarkers(record) {
    record.pins.forEach((worldPos, idx) => {
      const pm = new THREE.Mesh(PIN_GEO, PIN_MAT());
      pm.position.copy(worldPos);
      pm.userData.ownerComp   = record;
      pm.userData.pinIndex    = idx;
      pm.userData.world       = worldPos.clone();
      pm.userData.isWireStart = false;
      App.scene.add(pm);
      record.pinMeshes.push(pm);
    });
  }

  // ── Wire Drawing ─────────────────────────────────────────────
  // endPin: { world: Vector3, holeRef: { col, row } | null }

  App.finishWire = function (endPin) {
    if (!state.wireStart) return;
    pushHistory();

    const startWorld  = state.wireStart.world;
    const endWorld    = endPin.world;
    const startHole   = state.wireStart.holeRef;
    const endHole     = endPin.holeRef;

    // Capture component-pin references for battery / off-board pins.
    // These let simulate.js connect free pins (e.g. battery terminals) to
    // the breadboard graph even though they carry no holeRef.
    const sPm = state.wireStart.pinMesh;
    const ePm = endPin.pinMesh || null;

    // Build the wire visual (coloured arc with leg stubs into holes)
    const wireGroup = buildWireGroup(startWorld, endWorld, state.wireColor);
    App.scene.add(wireGroup);

    // Reset start-pin highlight
    const sp = state.wireStart.pinMesh;
    if (sp) { sp.userData.isWireStart = false; sp.material.emissiveIntensity = 0.4; }

    state.wires.push({
      group:        wireGroup,
      startWorld,   endWorld,
      startHole,    endHole,          // breadboard hole refs (null for off-board pins)
      startComp:    sPm?.userData.ownerComp  ?? null,
      startPinIdx:  sPm?.userData.pinIndex   ?? -1,
      endComp:      ePm?.userData.ownerComp  ?? null,
      endPinIdx:    ePm?.userData.pinIndex   ?? -1,
    });

    state.wireStart = null;
    if (state.tempWire) { App.scene.remove(state.tempWire); state.tempWire = null; }
    App.setHint(MODE_HINTS['wire']);
    refreshCounts();
  };

  App.cancelWire = function () {
    if (state.wireStart?.pinMesh) {
      state.wireStart.pinMesh.userData.isWireStart = false;
      state.wireStart.pinMesh.material.emissiveIntensity = 0.4;
    }
    state.wireStart = null;
    if (state.tempWire) { App.scene.remove(state.tempWire); state.tempWire = null; }
  };

  // Wire visual: colored arc + two leg stubs going into holes
  function buildWireGroup(start, end, hexColor) {
    const g   = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: hexColor });
    const LEG_H = 0.28;

    // Leg stubs only for board-level pins (y ≈ 0); skip for elevated terminals
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, LEG_H, 7);
    [start, end].forEach(p => {
      if (p.y > 0.15) return;   // battery/elevated pins — no leg into the board
      const leg = new THREE.Mesh(legGeo, mat.clone());
      leg.position.set(p.x, -LEG_H / 2 + 0.06, p.z);
      g.add(leg);
    });

    // Use actual pin height for arc endpoints (fall back to 0.06 for board holes)
    const startY = start.y > 0.15 ? start.y : 0.06;
    const endY   = end.y   > 0.15 ? end.y   : 0.06;

    // Arc body — mid-point rises above the higher of the two endpoints
    const dist = start.distanceTo(end);
    const mid  = new THREE.Vector3(
      (start.x + end.x) / 2,
      Math.max(startY, endY) + dist * 0.22 + 0.38,
      (start.z + end.z) / 2
    );
    const curve   = new THREE.CatmullRomCurve3([
      new THREE.Vector3(start.x, startY, start.z),
      mid,
      new THREE.Vector3(end.x,   endY,   end.z),
    ]);
    const tubeGeo = new THREE.TubeGeometry(curve, 26, 0.043, 7, false);
    const tube    = new THREE.Mesh(tubeGeo, mat.clone());
    tube.castShadow = true;
    g.add(tube);

    return g;
  }

  // ── Selection ────────────────────────────────────────────────

  const origEmissive = new Map();

  App.selectItem = function (item, kind) {
    if (kind === 'component' && item && item.unknown) return;   // not drawn, can't be picked
    App.deselect();
    state.selected = { item, kind };
    if (kind === 'component') Inspector.show(item);

    if (kind === 'component') {
      const label = App.formatValue(item);
      App.setHint(label ? `${item.type} · ${label}` : item.type, 4000);
    }

    const root = kind === 'component' ? item.group : item.group;
    if (!root) return;
    root.traverse(obj => {
      if (!obj.isMesh) return;
      origEmissive.set(obj, { hex: obj.material.emissive.getHex(), int: obj.material.emissiveIntensity });
      obj.material = obj.material.clone();
      obj.material.emissive.setHex(0x1a5a99);
      obj.material.emissiveIntensity = 0.65;
    });
  };

  App.deselect = function () {
    Inspector.hide();
    if (!state.selected) return;
    const { item } = state.selected;
    const root = item.group;
    if (root) root.traverse(obj => {
      if (!obj.isMesh || !origEmissive.has(obj)) return;
      const { hex, int } = origEmissive.get(obj);
      obj.material.emissive.setHex(hex);
      obj.material.emissiveIntensity = int;
    });
    origEmissive.clear();
    state.selected = null;
  };

  // ── Delete ───────────────────────────────────────────────────

  function removeComponent(item) {
    (item.pinMeshes || []).forEach(pm => App.scene.remove(pm));
    if (item.group) App.scene.remove(item.group);
    state.components = state.components.filter(c => c !== item);
    state.unknownWires = state.unknownWires.filter(w => w.startComp !== item && w.endComp !== item);
    // Wires anchored to this component's pins would keep pointing at the
    // deleted record, so take them with it.
    state.wires = state.wires.filter(w => {
      if (w.startComp !== item && w.endComp !== item) return true;
      App.scene.remove(w.group);
      return false;
    });
  }

  App.deleteSelected = function () {
    if (!state.selected) return;
    const { item, kind } = state.selected;
    pushHistory();
    App.deselect();

    if (kind === 'component') {
      removeComponent(item);
    } else if (kind === 'wire') {
      App.scene.remove(item.group);
      state.wires = state.wires.filter(w => w !== item);
    }
    refreshCounts();

    // Re-evaluate simulation with the remaining circuit
    if (App.simRunning) App.runSimulation();
  };

  // ── Save / Load ──────────────────────────────────────────────

  // ── Isometric thumbnail capture ──────────────────────────────
  // Renders one frame from App.CAMERA.thumb, hands the canvas to draw()
  // (which returns the image), then puts the user's camera back.
  function withThumbView(draw) {
    // Stash camera
    const prevPos    = App.camera.position.clone();
    const prevTarget = App.controls.target.clone();

    // Isometric view
    const { pos, target } = App.CAMERA.thumb;
    App.camera.position.set(...pos);
    App.controls.target.set(...target);
    App.camera.lookAt(...target);
    App.renderer.render(App.scene, App.camera);

    const out = draw(App.renderer.domElement);

    // Restore camera
    App.camera.position.copy(prevPos);
    App.controls.target.copy(prevTarget);
    App.camera.lookAt(prevTarget);
    App.controls.update();

    return out;
  }

  function captureIsometricThumb() {
    // Downsample to 320-wide thumbnail
    return withThumbView(src => {
      const scale = Math.min(1, 320 / src.width);
      const th  = document.createElement('canvas');
      th.width  = Math.round(src.width  * scale);
      th.height = Math.round(src.height * scale);
      th.getContext('2d').drawImage(src, 0, 0, th.width, th.height);
      return th.toDataURL('image/jpeg', 0.72);
    });
  }

  App.saveCircuit = function () {
    const name = state.circuitName || 'Untitled';

    // Build a raw serializable state (cols/rows, not world coords)
    const data = {
      version:   1,
      name,
      thumbnail: captureIsometricThumb(),
      // A part this build doesn't know is written back as it was loaded.
      components: App.recordsFor(state.components, c => {
        const rec = {
          type:     c.type,
          id:       App.componentId(state.components, c),
          label:    c.label,             // on each part, never at file level
          values:   c.values,
          holeRefs: App.saveHoleRefs(c), // with pin names; null for battery
          position: c.group
            ? { x: +c.group.position.x.toFixed(3), z: +c.group.position.z.toFixed(3) }
            : null,
        };
        const controls = savedControls(c);   // saved ones only, never a button's pressed
        if (controls) rec.controls = controls;
        return rec;
      }),
      wires: wireRecords(),
    };

    // Also ensure the local project entry is up-to-date
    if (state.circuitId) _doAutoSave();

    const safeName = name.replace(/[^\w\s\-]/g, '').trim() || 'circuit';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = safeName + '.sparky';
    a.click();
    URL.revokeObjectURL(url);
    App.setHint(`Saved "${name}"`, 2500);
  };

  // ── Internal: load a parsed circuit data object onto the board ─
  App.loadCircuitData = function (data) {
    App.clearAll();
    restoreBoard(data);

    // Sync circuit name + ID
    if (data.name) {
      state.circuitName = data.name;
      const nf = document.getElementById('circuit-name-field');
      if (nf) nf.textContent = data.name;
    }
    if (data.id) state.circuitId = data.id;

    const kept   = state.components.filter(c => c.unknown).length;
    const loaded = `Loaded "${data.name || 'circuit'}" — ${state.components.length - kept} components`;
    App.setHint(kept ? `${loaded} · ${keptHint(kept)}` : loaded, kept ? 8000 : 3000);
  };

  // Replaying a board re-runs the place/wire helpers, which would each record
  // an undo entry of their own. The caller records one entry for the replay.
  function restoreBoard(data) {
    _historyMuted = true;
    try { rebuildBoard(data); } finally { _historyMuted = false; }
  }

  // Rebuild components and wires from serialized data onto a cleared board.
  function rebuildBoard(data) {
    const bb = state.breadboard;

    // Rebuild components
    // One slot per saved part, so the wires below still find their parts by
    // index: null for a known part that could not be rebuilt (dropped), a
    // placeholder for a type this build doesn't know. rebuildComponents
    // fills in labels missing from files saved before labels existed.
    const knows = t => !!Parts.get(t);
    const rebuilt = App.rebuildComponents(data.components, c => {
      const before = state.components.length;
      const opts   = { label: c.label };
      const def    = Parts.get(c.type);
      if (!def) return null;               // kept as a placeholder
      if (def.place.kind === 'offboard') {
        if (c.position) App.placePart(c.type, c.position, c.values, opts);
      } else if (c.holeRefs?.length === def.pins.length) {
        const refs  = App.loadHoleRefs(c);   // pin order: by name, or by index in older files
        const holes = refs.map(r => r && bb.getHole(r.col, r.row));
        if (holes.every(Boolean)) App.placePart(c.type, holes, c.values, opts);
      }
      const placed = state.components.length > before ? state.components[state.components.length - 1] : null;
      // Saved controls come back as saved; the rest start at their defaults.
      if (placed && placed.controls && c.controls) {
        for (const [key, spec] of Object.entries(def.controls || {})) {
          if (spec.saved && Object.hasOwn(c.controls, key)) placed.controls[key] = c.controls[key];
        }
      }
      return placed;
    }, knows);
    state.components = rebuilt.filter(Boolean);   // placeholders included, in saved order

    // Rebuild wires, indexing into `rebuilt` (nulls and all) as saved. Wires
    // to a placeholder can't be drawn; keep them aside so the next save
    // writes them back. A wire to a dropped part is skipped below.
    const { known, unknown } = App.splitWires(data.wires, rebuilt);
    state.unknownWires = unknown;
    const savedColor = state.wireColor;
    for (const w of known) {
      state.wireColor = w.color ?? 0xef4444;

      let startWorld = null, startHole = null, startPinMesh = null;
      let endWorld   = null, endHole   = null, endPinMesh   = null;

      // A wire drawn from a pin sphere saved both the hole and the part:
      // keep both, so the part still knows the wire is on its own pin.
      const startPm = pinMeshOf(rebuilt, w.startCompIdx, w.startPin, w.startPinIdx);
      const endPm   = pinMeshOf(rebuilt, w.endCompIdx,   w.endPin,   w.endPinIdx);

      if (w.startHole) {
        const h = bb.getHole(w.startHole.col, w.startHole.row);
        if (h) { startWorld = h.world.clone(); startHole = { col: h.col, row: h.row }; startPinMesh = startPm; }
      } else if (startPm) {
        startWorld = startPm.userData.world.clone(); startPinMesh = startPm;
      }

      if (w.endHole) {
        const h = bb.getHole(w.endHole.col, w.endHole.row);
        if (h) { endWorld = h.world.clone(); endHole = { col: h.col, row: h.row }; endPinMesh = endPm; }
      } else if (endPm) {
        endWorld = endPm.userData.world.clone(); endPinMesh = endPm;
      }

      if (startWorld && endWorld) {
        state.wireStart = { world: startWorld, holeRef: startHole, pinMesh: startPinMesh };
        App.finishWire({ world: endWorld, holeRef: endHole, pinMesh: endPinMesh });
      }
    }
    state.wireColor = savedColor;

    // Parts from older files that break a placement rule load flagged: they
    // simulate as saved and warn, and are never moved or blocked.
    App.flagPlacements(state.components, state.wires);
  }

  // The pin sphere a saved wire end names on rebuilt[idx]: by pin name, or by
  // index in files from before names. null when that part or pin is gone.
  function pinMeshOf(rebuilt, idx, name, pinIdx) {
    const comp = idx >= 0 ? rebuilt[idx] : null;
    if (!comp || comp.unknown) return null;
    return (comp.pinMeshes || [])[App.pinIndex(comp, name, pinIdx)] || null;
  }

  App.loadCircuit = function () {
    const inp = document.createElement('input');
    inp.type   = 'file';
    inp.accept = '.sparky,.json';
    inp.onchange = async () => {
      const file = inp.files[0];
      if (!file) return;
      const text = await file.text();
      let data;
      try { data = JSON.parse(text); }
      catch { App.setHint('⚠️ Invalid file', 2500); return; }
      _showLoadPreview(data);
    };
    inp.click();
  };

  function _showLoadPreview(data) {
    const modal  = document.getElementById('load-preview-modal');
    const img    = document.getElementById('lpm-img');
    const ph     = document.getElementById('lpm-placeholder');
    const nameEl = document.getElementById('lpm-name');
    const metaEl = document.getElementById('lpm-meta');
    const btn    = document.getElementById('lpm-confirm');

    const name = data.name || 'Untitled';
    nameEl.textContent = name;

    const cc = data.components?.length ?? 0;
    const wc = data.wires?.length ?? 0;
    metaEl.textContent = `${cc} component${cc !== 1 ? 's' : ''} · ${wc} wire${wc !== 1 ? 's' : ''}`;

    if (data.thumbnail) {
      img.src = data.thumbnail;
      img.style.display = 'block';
      ph.style.display  = 'none';
    } else {
      img.style.display = 'none';
      ph.style.display  = 'flex';
    }

    btn.onclick = () => {
      modal.style.display = 'none';
      App.loadCircuitData(data);
    };

    modal.style.display = 'flex';
  }

  // ── Markdown Export (human-readable for AI) ──────────────────

  // Pin k of a part as the AI writes it: "BAT1.0" for a labelled part, the
  // old "battery_0_pin0" only for one with no label.
  function pinRef(comps, comp, k) {
    const id = App.componentId(comps, comp);
    return comp.label ? `${id}.${k}` : `${id}_pin${k}`;
  }

  // True when a part's elements have a direction (a diode, a source), so its
  // pin names matter: the LED's cathode and anode.
  function oneWay(def, c) {
    let els = [];
    try { els = def.elements(App.componentValues(c.type, c.values), c.controls || {}) || []; } catch { els = []; }
    return els.some(el => el.kind !== 'R' && el.kind !== 'SW');
  }

  App.exportMarkdown = function () {
    function holeStr(ref) {
      if (!ref) return null;
      return App.formatHole(ref);      // e.g. "e14", "tp_14"
    }

    // Parts this build doesn't know are left out: the AI can't use them, and
    // their wires are in state.unknownWires, not state.wires.
    const comps = state.components.filter(c => !c.unknown);
    const wires = state.wires;

    // ── Summary line ──
    const isEmpty = !comps.length && !wires.length;
    let md = isEmpty
      ? '**Board status: EMPTY — no components or wires placed yet.**\n\n'
      : `**Board status: ${comps.length} component(s), ${wires.length} wire(s).**\n\n`;

    // ── Component table ──
    md += '## Components\n';
    if (!comps.length) {
      md += '_None._\n';
    } else {
      md += '| id | type | value | pin_A | pin_B |\n';
      md += '|----|------|-------|-------|-------|\n';
      comps.forEach(c => {
        const id = App.componentId(comps, c);
        let pA = '—', pB = '—';
        if (c.holeRefs && c.holeRefs.length > 2) {
          // 3+ legs: every leg as "hole (pin)", the first in pin_A, the rest in pin_B.
          const legs = Parts.legsOf(c).map(l => `${l.row ? holeStr(l) : '?'} (${l.pin})`);
          pA = legs[0];
          pB = legs.slice(1).join(', ');
        } else if (c.holeRefs) {
          pA = holeStr(c.holeRefs[0]);
          pB = holeStr(c.holeRefs[1]);
          // A one-way part says which leg is which, from its pin names.
          const def = Parts.get(c.type);
          if (def && oneWay(def, c)) { pA += ` (${def.pins[0]})`; pB += ` (${def.pins[1]})`; }
        } else {
          // Off-board battery — show the wire reference names the AI must use
          pA = `off-board + → wire ref: ${pinRef(comps, c, 0)}`;
          pB = `off-board − → wire ref: ${pinRef(comps, c, 1)}`;
        }
        md += `| ${id} | ${c.type} | ${App.formatValue(c) || '—'} | ${pA} | ${pB} |\n`;
      });
    }

    // ── Battery wiring cheat-sheet ──
    const batteries = comps.filter(c => { const def = Parts.get(c.type); return def && def.place.kind === 'offboard'; });
    if (batteries.length) {
      md += '\n## Battery wiring (how to connect in add_wire actions)\n';
      batteries.forEach(b => {
        const id = App.componentId(comps, b);
        md += `- **${id}**: positive terminal → use \`"from": "${pinRef(comps, b, 0)}"\`  |  negative terminal → use \`"from": "${pinRef(comps, b, 1)}"\`\n`;
      });
    }

    // ── Wire table ──
    md += '\n## Wires\n';
    if (!wires.length) {
      md += '_None._\n';
    } else {
      md += '| from | to | color |\n';
      md += '|------|----|-----------|\n';
      wires.forEach(w => {
        const from = w.startHole
          ? holeStr(w.startHole)
          : (w.startComp ? pinRef(comps, w.startComp, w.startPinIdx) : '?');
        const to = w.endHole
          ? holeStr(w.endHole)
          : (w.endComp ? pinRef(comps, w.endComp, w.endPinIdx) : '?');
        const colorHex = '#' + (w.group?.children?.[0]?.material?.color?.getHex?.() ?? 0xef4444).toString(16).padStart(6, '0');
        md += `| ${from} | ${to} | ${colorHex} |\n`;
      });
    }

    // ── Simulation ── (solved fresh on every export, running or not)
    md += '\n## Simulation\n' + App.simulationSummary(comps, wires, App.componentId).join('\n') + '\n';

    // ── Topology ── (generated from App.BOARD_GEOMETRY, never typed by hand)
    md += '\n' + App.boardTopologyText() + '\n';
    return md;
  };

  // ── Hole map ───────────────────────────────────────────────
  // Hole name → what sits in it (docs/API-CONTRACT.md → "Legs and the hole
  // map"). Rebuilt from the records on every call, so it always follows the
  // last place, delete, undo, load or AI apply. Never patched, never saved.
  App.holeMap = function () {
    return App.buildHoleMap(state.components, state.wires);
  };

  // ── Export State (for AI / save-load) ────────────────────────

  App.exportState = function () {
    function holeStr(ref) {
      if (!ref) return null;
      return App.formatHole(ref);       // e.g. "e14", "tp_14"
    }

    const components = state.components.filter(c => !c.unknown).map(c => {
      const obj = { type: c.type.toUpperCase(), id: App.componentId(state.components, c) };
      if (c.holeRefs) {
        obj.holes = c.holeRefs.map(holeStr);
      } else if (c.group) {
        obj.position = {
          x: +c.group.position.x.toFixed(2),
          z: +c.group.position.z.toFixed(2),
        };
      }
      const value = App.formatValue(c);
      if (value) obj.value = value;
      return obj;
    });

    const wires = state.wires.map(w => {
      const from = w.startHole
        ? holeStr(w.startHole)
        : (w.startComp ? pinRef(state.components, w.startComp, w.startPinIdx) : null);
      const to = w.endHole
        ? holeStr(w.endHole)
        : (w.endComp ? pinRef(state.components, w.endComp, w.endPinIdx) : null);
      return { from, to };
    });

    return { components, wires };
  };

  // ── Clear All ─────────────────────────────────────────────────

  // Tear down every scene object, leaving the circuit's name and ID alone.
  function clearBoard() {
    App.stopSimulation?.();
    App.deselect();
    App.cancelWire();
    state.components.forEach(c => {
      (c.pinMeshes || []).forEach(pm => App.scene.remove(pm));
      if (c.group) App.scene.remove(c.group);
    });
    state.wires.forEach(w => App.scene.remove(w.group));
    state.components   = [];
    state.wires        = [];
    state.unknownWires = [];   // unknown parts go with the rest of the board
  }

  App.clearAll = function () {
    pushHistory();
    clearBoard();
    // New blank circuit — get a fresh ID and name
    state.circuitId   = null;
    const newName = nextUntitledName();
    state.circuitName = newName;
    const nf = document.getElementById('circuit-name-field');
    if (nf) nf.textContent = newName;
    refreshCounts();
  };

  // ── Undo / Redo ───────────────────────────────────────────────
  // Every board-changing command snapshots the board before it runs, and undo
  // replays a snapshot rather than inverting the command. Replaying rebuilds
  // the wire-to-component references from scratch, which inverting cannot do
  // once a component record has been thrown away.

  const HISTORY_LIMIT = 60;
  const history = App.createHistory({
    snapshot, apply: applySnapshot, limit: HISTORY_LIMIT, afterBatch: refreshCounts,
  });
  App.history = history;   // chat.js groups an accepted AI build into one undo step
  let _historyMuted = false;

  // Undo snapshots and autosave. A placeholder's saved record goes back
  // unchanged, and the wires kept for it follow the drawn ones.
  function serializeBoard() {
    return {
      components: App.recordsFor(state.components, c => {
        const rec = {
          type:     c.type,
          label:    c.label,
          values:   c.values,
          holeRefs: App.saveHoleRefs(c),
          position: c.group ? { x: +c.group.position.x.toFixed(3), z: +c.group.position.z.toFixed(3) } : null,
        };
        const controls = savedControls(c);
        if (controls) rec.controls = controls;
        return rec;
      }),
      wires: wireRecords(),
    };
  }

  // A part's saved controls (ControlSpec saved: true), or null for none.
  function savedControls(c) {
    const specs = (Parts.get(c.type) || {}).controls || {};
    const out = {};
    for (const [key, spec] of Object.entries(specs)) {
      if (spec.saved && c.controls && Object.hasOwn(c.controls, key)) out[key] = c.controls[key];
    }
    return Object.keys(out).length ? out : null;
  }

  // Every wire as a saved record: the drawn ones, then the ones kept for
  // parts this build doesn't know, re-pointed at where those parts now sit.
  function wireRecords() {
    return state.wires.map(w => Object.assign(App.wireRecord(w, state.components), {
      color: w.group?.children?.[0]?.material?.color?.getHex?.() ?? state.wireColor,
    })).concat(App.unknownWireRecords(state.unknownWires, state.components));
  }

  // "1 part from a newer version was kept but isn't shown."
  function keptHint(n) {
    return n === 1
      ? "1 part from a newer version was kept but isn't shown."
      : `${n} parts from a newer version were kept but aren't shown.`;
  }

  function newCircuitId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function snapshot() {
    // Mint the id now if the autosave has not yet. A snapshot carrying a null
    // id would, once undone, make the next autosave file a second project row
    // for the same circuit.
    if (!state.circuitId) state.circuitId = newCircuitId();
    const snap = serializeBoard();
    snap.id   = state.circuitId;
    snap.name = state.circuitName;
    return snap;
  }

  function pushHistory() {
    if (!_historyMuted) history.push();
  }

  function clearHistory() {
    history.clear();
  }

  // A part selected before the undo (or redo) is selected again, found by
  // its label, so the inspector shows its restored values.
  function applySnapshot(snap) {
    const sel = state.selected && state.selected.kind === 'component' ? state.selected.item.label : null;
    clearBoard();
    restoreBoard(snap);
    const again = sel && state.components.find(c => c.label === sel && !c.unknown);
    if (again) App.selectItem(again, 'component');
    state.circuitId   = snap.id;
    state.circuitName = snap.name;
    const nf = document.getElementById('circuit-name-field');
    if (nf) nf.textContent = snap.name;
    refreshCounts();
  }

  App.undo = function () {
    if (!history.undo()) { App.setHint('Nothing to undo', 1500); return; }
    App.setHint('Undo · Ctrl+Shift+Z to redo', 1800);
  };

  App.redo = function () {
    if (!history.redo()) { App.setHint('Nothing to redo', 1500); return; }
    App.setHint('Redo', 1800);
  };

  // ── Helpers ───────────────────────────────────────────────────

  // ── Auto-save to localStorage ─────────────────────────────
  let _autoSaveTimer = null;
  function scheduleAutoSave() {
    clearTimeout(_autoSaveTimer);
    _autoSaveTimer = setTimeout(_doAutoSave, 800);
  }
  App.scheduleAutoSave = scheduleAutoSave;

  function _doAutoSave() {
    if (!state.components.length && !state.wires.length) return; // nothing to save

    if (!state.circuitId) {
      state.circuitId = newCircuitId();
    }

    // Lightweight thumbnail for auto-save (smaller than download)
    let thumb = null;
    try {
      thumb = withThumbView(src => {
        const th  = document.createElement('canvas');
        th.width  = 240; th.height = Math.round(240 * src.height / src.width);
        th.getContext('2d').drawImage(src, 0, 0, th.width, th.height);
        return th.toDataURL('image/jpeg', 0.55);
      });
    } catch {}

    const board = serializeBoard();
    const entry = {
      id:         state.circuitId,
      name:       state.circuitName,
      thumbnail:  thumb,
      updatedAt:  new Date().toISOString(),
      components: board.components,
      wires:      board.wires,
    };

    const projects = lsProjects();
    const idx = projects.findIndex(p => p.id === state.circuitId);
    if (idx >= 0) projects[idx] = entry; else projects.unshift(entry);
    lsSave(projects);
  }

  function refreshCounts() {
    const cc = document.getElementById('comp-count');
    const wc = document.getElementById('wire-count');
    if (cc) cc.textContent = state.components.filter(c => !c.unknown).length;
    if (wc) wc.textContent = state.wires.length;

    const clearBtn = document.getElementById('clear-all-btn');
    if (clearBtn) clearBtn.style.display =
      (state.components.length || state.wires.length) ? 'flex' : 'none';

    scheduleAutoSave();
  }

  // ── Inspector ────────────────────────────────────────────────
  // Controls follow each run and Stop (a momentary one is enabled only
  // while simulating, and Stop resets it).
  const _runSimulation  = App.runSimulation;
  const _stopSimulation = App.stopSimulation;
  App.runSimulation  = function () { _runSimulation();  Inspector.sync(); };
  App.stopSimulation = function () { _stopSimulation(); Inspector.sync(); };

  // ── Boot ─────────────────────────────────────────────────────
  // Must run AFTER all App.* methods are defined above.
  Inspector.mount(document.getElementById('inspector'));
  state.breadboard = App.createBreadboard();
  App.scene.add(state.breadboard.group);
  App.initInteraction();
  initSidebar();
  setMode('select');
  animate();

  // Auto-load circuit passed from dashboard via sessionStorage
  const _pending = sessionStorage.getItem('sparky_load_circuit');
  if (_pending) {
    sessionStorage.removeItem('sparky_load_circuit');
    try {
      const loaded = JSON.parse(_pending);
      // Restore project ID so auto-save updates the same entry
      if (loaded.id) state.circuitId = loaded.id;
      App.loadCircuitData(loaded);
      clearHistory();   // the opened circuit is the starting point, not an edit
    } catch (e) { console.warn('Auto-load failed', e); }
  } else {
    // New circuit — pick an auto-incremented untitled name
    const name = nextUntitledName();
    state.circuitName = name;
    const nf = document.getElementById('circuit-name-field');
    if (nf) nf.textContent = name;
  }

})(window.App = window.App || {});
