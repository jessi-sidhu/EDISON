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

  function initSidebar() {
    document.querySelectorAll('.comp-item').forEach(btn => {
      btn.addEventListener('click', () => {
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
  // Both placeResistor and placeLED now receive hole objects directly
  // (already resolved by interaction.js hover logic).
  // Every place* takes an optional last `opts`; opts.label keeps a saved
  // label (R2, BAT1…), otherwise the part gets the next free one.

  function partLabel(type, opts) {
    return (opts && opts.label) || App.nextLabel(state.components, type);
  }

  // A thin wrapper over the parts registry (parts/resistor.js), kept for
  // chat.js and file loading. A value the registry refuses is dropped, so
  // the part keeps its default.
  App.placeResistor = function (holeA, holeB, values, opts) {
    pushHistory();
    const given = {};
    for (const [key, v] of Object.entries(values || {})) {
      const check = Parts.checkValue('resistor', key, v);
      if (check.ok) given[key] = check.value;
      else console.warn('Resistor value ignored: ' + check.reason);
    }
    const vals = App.componentValues('resistor', given);
    const holeRefs = [{ col: holeA.col, row: holeA.row },
                      { col: holeB.col, row: holeB.row }];
    const { group, pinPositions: pins } = App.buildPart('resistor', Parts.legsOf({ type: 'resistor', holeRefs }), vals);
    App.scene.add(group);
    const record = {
      type: 'resistor', label: partLabel('resistor', opts), group, pins, pinMeshes: [], values: vals, holeRefs,
    };
    addPinMarkers(record);
    state.components.push(record);
    refreshCounts();
  };

  App.placeLED = function (holeA, holeB, values, opts) {
    pushHistory();
    const vals = App.componentValues('led', values);
    const { group, pins } = App.buildLED(holeA, holeB, vals.color);
    App.scene.add(group);
    const record = {
      type: 'led', label: partLabel('led', opts), group, pins, pinMeshes: [], values: vals,
      // pin 0 = cathode (−), pin 1 = anode (+)
      holeRefs: [{ col: holeA.col, row: holeA.row },   // cathode
                 { col: holeB.col, row: holeB.row }],   // anode
    };
    addPinMarkers(record);
    state.components.push(record);
    refreshCounts();
  };

  App.placeBuzzer = function (holeA, holeB, values, opts) {
    pushHistory();
    const { group, pins } = App.buildBuzzer(holeA, holeB);
    App.scene.add(group);
    const record = {
      type: 'buzzer', label: partLabel('buzzer', opts), group, pins, pinMeshes: [],
      values: App.componentValues('buzzer', values),
      holeRefs: [{ col: holeA.col, row: holeA.row },
                 { col: holeB.col, row: holeB.row }],
    };
    addPinMarkers(record);
    state.components.push(record);
    refreshCounts();
  };

  App.placeButton = function (holeA, holeB, values, opts) {
    pushHistory();
    const { group, pins, capMesh } = App.buildButton(holeA, holeB);
    App.scene.add(group);
    const record = {
      type: 'button', label: partLabel('button', opts), group, pins, pinMeshes: [],
      values: App.componentValues('button', values),
      holeRefs: [{ col: holeA.col, row: holeA.row },
                 { col: holeB.col, row: holeB.row }],
      pressed: false,
      capMesh,
    };
    if (capMesh) capMesh.userData.ownerComp = record;
    addPinMarkers(record);
    state.components.push(record);
    refreshCounts();
  };

  // ── Toggle button pressed state ──────────────────────────────
  // Animates the cap smoothly down (press) or back up (release).
  App.toggleButton = function (comp) {
    if (comp.type !== 'button') return;
    comp.pressed = !comp.pressed;

    const cap = comp.capMesh;
    if (cap) {
      // Ensure the cap has its own material so we can tint it independently
      if (!cap.userData.matCloned) {
        cap.material = cap.material.clone();
        cap.userData.matCloned = true;
      }

      const targetY   = comp.pressed ? cap.userData.capPressY : cap.userData.capRestY;
      const targetCol = comp.pressed ? 0x44cc44 : 0xe5e5e5;
      const targetEmi = comp.pressed ? 0x115511 : 0x000000;
      const targetEmiI = comp.pressed ? 0.6 : 0;

      // Kill any in-progress animation on this cap
      if (cap.userData._animId) cancelAnimationFrame(cap.userData._animId);

      const startY   = cap.position.y;
      const startCol = cap.material.color.getHex();
      const startEmi = cap.material.emissive.getHex();
      const startEmiI = cap.material.emissiveIntensity;
      const duration  = 80; // ms — snappy but visible
      const t0        = performance.now();

      const colA = new THREE.Color(startCol);
      const colB = new THREE.Color(targetCol);
      const emiA = new THREE.Color(startEmi);
      const emiB = new THREE.Color(targetEmi);

      function tick(now) {
        const p = Math.min((now - t0) / duration, 1);
        // Ease out cubic
        const e = 1 - Math.pow(1 - p, 3);

        cap.position.y = startY + (targetY - startY) * e;
        cap.material.color.lerpColors(colA, colB, e);
        cap.material.emissive.lerpColors(emiA, emiB, e);
        cap.material.emissiveIntensity = startEmiI + (targetEmiI - startEmiI) * e;

        if (p < 1) {
          cap.userData._animId = requestAnimationFrame(tick);
        } else {
          cap.userData._animId = null;
        }
      }

      cap.userData._animId = requestAnimationFrame(tick);
    }

  };

  App.placeBattery = function (wx, wz, values, opts) {
    pushHistory();
    const margin = state.breadboard.BOARD_W / 2 + App.BATTERY_MARGIN;
    const placedX = wx >= 0 ? Math.max(wx, margin) : Math.min(wx, -margin);
    const { group, pins } = App.buildBattery(placedX, wz);
    App.scene.add(group);
    const record = {
      type: 'battery', label: partLabel('battery', opts), group, pins, pinMeshes: [],
      values: App.componentValues('battery', values),
      holeRefs: null, // not on breadboard
    };
    addPinMarkers(record);
    state.components.push(record);
    refreshCounts();
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

  App.deleteSelected = function () {
    if (!state.selected) return;
    const { item, kind } = state.selected;
    pushHistory();
    App.deselect();

    if (kind === 'component') {
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
      components: App.recordsFor(state.components, c => ({
        type:     c.type,
        id:       App.componentId(state.components, c),
        label:    c.label,             // on each part, never at file level
        values:   c.values,
        holeRefs: App.saveHoleRefs(c), // with pin names; null for battery
        position: c.group
          ? { x: +c.group.position.x.toFixed(3), z: +c.group.position.z.toFixed(3) }
          : null,
      })),
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
    const PLACE = { resistor: App.placeResistor, led: App.placeLED,
                    buzzer: App.placeBuzzer, button: App.placeButton };
    const knows = t => t === 'battery' || !!PLACE[t];
    const rebuilt = App.rebuildComponents(data.components, c => {
      const before = state.components.length;
      const opts   = { label: c.label };
      if (c.type === 'battery' && c.position) {
        App.placeBattery(c.position.x, c.position.z, c.values, opts);
      } else if (PLACE[c.type] && c.holeRefs?.length === 2) {
        const refs = App.loadHoleRefs(c);   // pin order: by name, or by index in older files
        const hA = refs[0] && bb.getHole(refs[0].col, refs[0].row);
        const hB = refs[1] && bb.getHole(refs[1].col, refs[1].row);
        if (hA && hB) PLACE[c.type](hA, hB, c.values, opts);
      }
      return state.components.length > before ? state.components[state.components.length - 1] : null;
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
        if (c.holeRefs) {
          pA = holeStr(c.holeRefs[0]);
          pB = holeStr(c.holeRefs[1]);
          if (c.type === 'led') { pA += ' (cathode −)'; pB += ' (anode +)'; }
        } else {
          // Off-board battery — show the wire reference names the AI must use
          pA = `off-board + → wire ref: ${pinRef(comps, c, 0)}`;
          pB = `off-board − → wire ref: ${pinRef(comps, c, 1)}`;
        }
        md += `| ${id} | ${c.type} | ${App.formatValue(c) || '—'} | ${pA} | ${pB} |\n`;
      });
    }

    // ── Battery wiring cheat-sheet ──
    const batteries = comps.filter(c => c.type === 'battery');
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
      const v = c.values || App.componentValues(c.type);
      if (c.type === 'led') {
        obj.color = v.color;
        obj.value = v.forwardVoltage + 'V';
      } else if (c.type === 'resistor' || c.type === 'buzzer') {
        obj.value = v.resistance + 'Ω';
      } else if (c.type === 'battery') {
        obj.value = v.voltage + 'V';
      }
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
      components: App.recordsFor(state.components, c => ({
        type:     c.type,
        label:    c.label,
        values:   c.values,
        holeRefs: App.saveHoleRefs(c),
        position: c.group ? { x: +c.group.position.x.toFixed(3), z: +c.group.position.z.toFixed(3) } : null,
      })),
      wires: wireRecords(),
    };
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

  function applySnapshot(snap) {
    clearBoard();
    restoreBoard(snap);
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

  // ── Boot ─────────────────────────────────────────────────────
  // Must run AFTER all App.* methods are defined above.
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
