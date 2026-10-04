// ─────────────────────────────────────────────────────────────
//  interaction.js — Pointer events, raycasting, ghost preview,
//                   rotation, hole-based wire placement
//
//  KEY BEHAVIOURS
//  • Place mode: hover shows a transparent ghost; click places component.
//    R key rotates the ghost 90°. A footprint part (3+ legs) is anchored
//    on the hovered hole, R cycles its allowed rotations, and one sphere per
//    leg shows where it lands: red, with the reason as the hint, when
//    Parts.checkPlacement refuses it.
//  • Wire mode:  click any breadboard HOLE or component pin sphere to start
//    a wire; click again to complete it.  The wire plugs into both holes.
//  • Select mode: click a component body or wire tube to select it.
// ─────────────────────────────────────────────────────────────

(function (App) {

  function initInteraction() {
    const { scene, camera, state } = App;
    const canvas    = document.getElementById('canvas');
    const holeLabel = document.getElementById('hole-label');

    // ── Raycasting ──────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouseNDC  = new THREE.Vector2();
    const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    function updateRay(e) {
      const r   = canvas.getBoundingClientRect();
      mouseNDC.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;
      mouseNDC.y = -((e.clientY - r.top)  / r.height) * 2 + 1;
      raycaster.setFromCamera(mouseNDC, camera);
    }

    function getAllComponentMeshes() {
      const out = [];
      // Parts this build doesn't know have no group: nothing to hit.
      state.components.forEach(c => { if (c.group) c.group.traverse(o => { if (o.isMesh) out.push(o); }); });
      return out;
    }

    // The placed part whose model holds obj, or null. Parts this build
    // doesn't know have no group.
    function ownerOf(obj) {
      for (let o = obj; o; o = o.parent) {
        const comp = state.components.find(c => c.group && c.group === o);
        if (comp) return comp;
      }
      return null;
    }

    function getAllPinMeshes() {
      const out = [];
      state.components.forEach(c => (c.pinMeshes || []).forEach(pm => out.push(pm)));
      return out;
    }

    // A part that sits beside the board (the battery), not in its holes.
    function isOffboard(type) {
      const def = Parts.get(type);
      return !!(def && def.place.kind === 'offboard');
    }

    // A part placed from an anchor hole and a rotation (3 or more legs).
    function isFootprint(type) {
      const def = Parts.get(type);
      return !!(def && def.place.kind === 'footprint');
    }

    // Columns (or rows) between a span part's two leads, from its
    // place.span.default; 0 for any other part.
    function defaultSpan(type) {
      const def = Parts.get(type);
      return def && def.place.kind === 'span' ? def.place.span.default : 0;
    }

    // ── Ghost management ─────────────────────────────────────
    // The ghost preview group, recreated when type or rotation changes.
    let ghostGroup   = null;
    let ghostType    = null;
    let ghostRot     = null;  // 0 or 1

    // F: the picked 2-lead part goes in facing the other way (its two holes
    // swapped). Lasts for this pick; App.setMode clears it.
    let flipped      = false;

    function canFlip(type) {
      return state.mode === 'place' && Parts.isFlippable(Parts.get(type));
    }

    function syncGhost() {
      const t = state.pickedType;
      const r = state.placementRotation;
      if (state.mode !== 'place' || !t || isFootprint(t)) {
        destroyGhost();
        return;
      }
      if (ghostGroup && ghostType === t && ghostRot === r) return; // already built

      destroyGhost();
      const bb   = state.breadboard;
      const span = defaultSpan(t);
      ghostGroup = App.buildPreview(t, span, bb.HS, r);
      ghostGroup.visible = false;
      scene.add(ghostGroup);
      ghostType = t;
      ghostRot  = r;
    }

    function destroyGhost() {
      if (ghostGroup) { scene.remove(ghostGroup); ghostGroup = null; }
      ghostType = ghostRot = null;
    }

    // The hole under the current ray, or null.
    function holeUnderRay() {
      const bbBody = scene.getObjectByName('bb-body');
      if (!bbBody) return null;
      const hits = raycaster.intersectObject(bbBody, false);
      if (!hits.length) return null;
      const pt = hits[0].point;
      return state.breadboard.getNearestHole(pt.x, pt.z, null);
    }

    // Holes under the current ray: the anchor hole and the far end of the
    // component footprint. Hover and click both resolve through this, so a tap
    // that never produced a hover still commits the hole it landed on.
    function holesUnderRay(type) {
      const holeA = holeUnderRay();
      if (!holeA) return null;

      const span  = defaultSpan(type);
      return { holeA, holeB: state.breadboard.getSpanHole(holeA, span, state.placementRotation) };
    }

    function positionGhost(holeA, holeB) {
      if (!ghostGroup || !holeA) { if (ghostGroup) ghostGroup.visible = false; return; }
      if (!holeB) { ghostGroup.visible = false; return; }

      const midX = (holeA.x + holeB.x) / 2;
      const midZ = (holeA.z + holeB.z) / 2;
      ghostGroup.position.set(midX, 0, midZ);
      ghostGroup.visible = true;
    }

    // ── Footprint parts ─────────────────────────────────────
    // The rotation starts at the part's first allowed one each time a part
    // is picked (App.setMode('place')), and R steps through the rest.
    let fpType = null;
    let fpStep = 0;

    function footprintRotation(type) {
      const rots = Parts.get(type).place.rotations;
      if (fpType !== type) { fpType = type; fpStep = 0; }
      return rots[fpStep % rots.length];
    }

    // The footprint part's legs from the hovered hole: { legs, holes, check,
    // rotation }, where holes[i] is leg i's board hole (null off the board)
    // and check is Parts.checkPlacement's answer. null off the body holes.
    function footprintUnderRay(type) {
      const anchor = holeUnderRay();
      if (!anchor) return null;
      const rotation = footprintRotation(type);
      const legs = Parts.footprintLegs(type, { col: anchor.col, row: anchor.row }, rotation);
      if (!legs) return null;
      const holes = legs.map(l => (l.row ? state.breadboard.getHole(l.col, l.row) : null));
      const G     = App.BOARD_GEOMETRY;
      const check = Parts.checkPlacement(type, legs, App.holeMap(), { cols: G.COLS, bodyRows: G.BODY_ROWS });
      return { anchor, legs, holes, check, rotation };
    }

    // One hover sphere per leg on the board, red when the placement is refused.
    const LEG_OK  = new THREE.MeshLambertMaterial({ color: 0x22cc55, emissive: 0x115522, emissiveIntensity: 0.9 });
    const LEG_BAD = new THREE.MeshLambertMaterial({ color: 0xef4444, emissive: 0x551111, emissiveIntensity: 0.9 });
    const legSpheres = [];

    function showLegs(holes, refused) {
      holes.forEach((h, i) => {
        if (!legSpheres[i]) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), LEG_OK);
          m.name = 'hover-leg';
          scene.add(m);
          legSpheres[i] = m;
        }
        legSpheres[i].material = refused ? LEG_BAD : LEG_OK;
        legSpheres[i].position.set(h.x, 0.12, h.z);
        legSpheres[i].visible = true;
      });
      for (let i = holes.length; i < legSpheres.length; i++) legSpheres[i].visible = false;
    }

    // The footprint ghost: the part's own view.build, in ghost materials, at
    // its legs. Rebuilt only when the legs move.
    let fpGhost    = null;
    let fpGhostKey = null;

    function showFootprintGhost(type, fp) {
      const key = `${type}|${fp.rotation}|${fp.anchor.col}|${fp.anchor.row}`;
      if (key === fpGhostKey) { if (fpGhost) fpGhost.visible = true; return; }
      hideFootprintGhost();
      const built = App.buildPart(type, fp.legs, undefined, { ghost: true });
      if (!built || !built.group) return;
      fpGhost = built.group;
      fpGhostKey = key;
      scene.add(fpGhost);
    }

    // Removes the ghost and frees what it uploaded: each build makes its
    // own geometries and materials, so nothing here is shared.
    function hideFootprintGhost() {
      if (fpGhost) {
        scene.remove(fpGhost);
        fpGhost.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          for (const m of [].concat(o.material || [])) m.dispose();
        });
      }
      fpGhost = fpGhostKey = null;
    }

    function clearFootprint() {
      showLegs([], false);
      hideFootprintGhost();
    }

    // A refused footprint placement shows its reason as the hint; once the
    // part fits again the place-mode hint comes back.
    let placeHint   = '';
    let refusalHint = null;   // the refusal the hint shows now, or null

    function showRefusal(text) {
      if (refusalHint === text) return;
      refusalHint = text;
      App.setHint(text);
    }

    function clearRefusal() {
      if (refusalHint === null) return;
      refusalHint = null;
      App.setHint(placeHint);
    }

    // ── Drag detection ──────────────────────────────────────
    // Pointer events, not mouse events: they cover mouse, touch and pen, and
    // OrbitControls calls preventDefault() on pointerdown, which suppresses the
    // compatibility mousedown entirely — so the old mousedown guard never ran
    // and every orbit ended in a placement.
    let downPos       = null;
    let downPointerId = null;
    let wasDragged    = false;
    const DRAG_THRESH = 8;  // px — must exceed this to be treated as orbit, not click

    canvas.addEventListener('pointerdown', e => {
      if (!e.isPrimary || e.button !== 0) return;
      downPointerId = e.pointerId;
      downPos       = { x: e.clientX, y: e.clientY };
      wasDragged    = false;
    });

    // ── Scroll gestures ─────────────────────────────────────
    // While simulating, the wheel on or near (SCROLL_NEAR_PX) a part with a
    // scroll gesture moves its control instead of zooming (bug #59: small
    // parts are easy to miss by a few pixels). Caught on the way down,
    // before OrbitControls on the canvas sees it.
    const SCROLL_NEAR_PX = 15;
    const scrollBox      = new THREE.Box3();
    const scrollCorner   = new THREE.Vector3();

    function scrollKey(comp) {
      const def = comp && Parts.get(comp.type);
      return (def && def.gestures && def.gestures.scroll) || null;
    }

    // A model's on-screen outline: its Box3 projected through the camera,
    // as a page-pixel rect { x, y, w, h } (top-left, y down).
    function screenRect(group) {
      scrollBox.setFromObject(group);
      const r = canvas.getBoundingClientRect();
      const { min, max } = scrollBox;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const X of [min.x, max.x]) for (const Y of [min.y, max.y]) for (const Z of [min.z, max.z]) {
        scrollCorner.set(X, Y, Z).project(camera);
        const sx = r.left + (scrollCorner.x + 1) / 2 * r.width;
        const sy = r.top  + (1 - scrollCorner.y) / 2 * r.height;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    // The scroll-gesture part under the pointer, else the nearest one within
    // SCROLL_NEAR_PX of it on screen, else null. Needs updateRay(e) first.
    function scrollPartAt(e) {
      const hits = raycaster.intersectObjects(getAllComponentMeshes(), false);
      const hit  = hits.length ? ownerOf(hits[0].object) : null;
      if (scrollKey(hit)) return hit;
      const candidates = state.components
        .filter(c => c.group && scrollKey(c))
        .map(c => ({ id: c.label, rect: screenRect(c.group), comp: c }));
      const picked = Gestures.pickScrollPart({ x: e.clientX, y: e.clientY }, candidates, SCROLL_NEAR_PX);
      return picked ? picked.comp : null;
    }

    // While simulating, hovering a scroll-gesture part names the gesture and
    // the control's value; off it, the mode hint comes back. Only a change
    // of text touches the hint.
    let scrollHint = null;   // the scroll hint shown now, or null

    function showScrollHint(comp) {
      const key  = scrollKey(comp);
      const def  = key && Parts.get(comp.type);
      const spec = def && def.controls && Object.hasOwn(def.controls, key) ? def.controls[key] : null;
      let text = null;
      if (spec) {
        const now = comp.controls && Object.hasOwn(comp.controls, key) ? comp.controls[key] : spec.default;
        text = `Scroll to change ${key} · ${Parts.withUnit(now, spec.unit)}`;
      }
      if (text === scrollHint) return;
      const had  = scrollHint !== null;
      scrollHint = text;
      if (text !== null) App.setHint(text);
      else if (had) App.setHint(placeHint);
    }

    canvas.parentElement.addEventListener('wheel', e => {
      if (!App.simRunning || e.target !== canvas) return;
      updateRay(e);
      const comp = scrollPartAt(e);
      if (!comp || !App.partGesture(comp, 'scroll', e.deltaY < 0 ? 1 : -1)) return;
      e.preventDefault();
      e.stopPropagation();
      showScrollHint(comp);
    }, { capture: true, passive: false });

    canvas.addEventListener('pointerleave', () => showScrollHint(null));

    canvas.addEventListener('pointercancel', e => {
      if (e.pointerId !== downPointerId) return;
      downPointerId = null;
      downPos       = null;
    });

    // ── Hover indicator spheres (show both pin snap positions) ─
    const hoverSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 12),
      new THREE.MeshLambertMaterial({ color: 0x22cc55, emissive: 0x115522, emissiveIntensity: 0.9 })
    );
    hoverSphere.visible = false;
    scene.add(hoverSphere);

    // Second sphere for the second pin (holeB)
    const hoverSphereB = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 12),
      new THREE.MeshLambertMaterial({ color: 0x22cc55, emissive: 0x115522, emissiveIntensity: 0.9 })
    );
    hoverSphereB.visible = false;
    scene.add(hoverSphereB);

    // Highlighted wire-start pin (stored so we can reset it)
    let wireStartPinMesh = null;

    // The last pointer move, so R can redraw the footprint where it is.
    let lastPointer = null;

    // ── pointermove ─────────────────────────────────────────
    canvas.addEventListener('pointermove', e => {
      if (downPos && e.pointerId === downPointerId) {
        const dx = e.clientX - downPos.x;
        const dy = e.clientY - downPos.y;
        if (dx * dx + dy * dy > DRAG_THRESH * DRAG_THRESH) wasDragged = true;
      }
      lastPointer = e;
      handleHover(e);
      if (App.simRunning) showScrollHint(scrollPartAt(e));
      else showScrollHint(null);
    });

    // quiet: leave the hint alone (R has just set it).
    function handleHover(e, quiet) {
      const mode = state.mode;
      updateRay(e);

      // ── PLACE mode ──────────────────────────────────────
      if (mode === 'place') {
        syncGhost();
        const type = state.pickedType;

        if (isFootprint(type)) {
          hoverSphere.visible  = false;
          hoverSphereB.visible = false;
          const fp = footprintUnderRay(type);
          if (!fp) {
            clearFootprint();
            holeLabel.style.display = 'none';
            if (!quiet) clearRefusal();
            return;
          }
          const onBoard = fp.holes.filter(Boolean);
          showLegs(onBoard, !fp.check.ok);
          if (onBoard.length === fp.holes.length) showFootprintGhost(type, fp);
          else hideFootprintGhost();
          if (!quiet) {
            if (fp.check.ok) clearRefusal();
            else showRefusal(`${App.nextLabel(state.components, type)} can't go here: ${fp.check.reason}`);
          }
          holeLabel.style.display = 'block';
          holeLabel.textContent   = `Col ${fp.anchor.col + 1}  Row ${fp.anchor.row.toUpperCase()}  ·  ${fp.rotation}°`;
          return;
        }
        clearFootprint();

        if (isOffboard(type)) {
          hoverSphere.visible  = false;
          hoverSphereB.visible = false;
          holeLabel.style.display = 'none';
          // Position ghost at cursor, clamped outside the board
          const pt  = new THREE.Vector3();
          const hit = raycaster.ray.intersectPlane(boardPlane, pt);
          if (hit && ghostGroup) {
            const margin  = state.breadboard.BOARD_W / 2 + App.BATTERY_MARGIN;
            const clampX  = pt.x >= 0 ? Math.max(pt.x, margin) : Math.min(pt.x, -margin);
            ghostGroup.position.set(clampX, 0, pt.z);
            ghostGroup.visible = true;
          } else if (ghostGroup) {
            ghostGroup.visible = false;
          }
          return;
        }

        const holes = holesUnderRay(type);
        if (!holes) {
          hoverSphere.visible  = false;
          hoverSphereB.visible = false;
          holeLabel.style.display = 'none';
          if (ghostGroup) ghostGroup.visible = false;
          return;
        }

        const holeA = holes.holeA;
        const holeB = holes.holeB;

        // Update hover spheres on holeA and holeB
        hoverSphere.position.set(holeA.x, 0.12, holeA.z);
        hoverSphere.visible = true;
        if (holeB) {
          hoverSphereB.position.set(holeB.x, 0.12, holeB.z);
          hoverSphereB.visible = true;
        } else {
          hoverSphereB.visible = false;
        }

        // Update ghost
        syncGhost();
        positionGhost(holeA, holeB);
        if (ghostGroup) {
          ghostGroup.rotation.y = (state.placementRotation === 1 ? Math.PI / 2 : 0) + (flipped ? Math.PI : 0);
        }

        // Hole label
        holeLabel.style.display = 'block';
        holeLabel.textContent   = `Col ${holeA.col + 1}  Row ${holeA.row.toUpperCase()}` +
          (holeB ? `  →  Col ${holeB.col + 1}  Row ${holeB.row.toUpperCase()}` : '  (no room)');
        return;
      }

      // ── WIRE mode ───────────────────────────────────────
      if (mode === 'wire') {
        destroyGhost();
        clearFootprint();
        hoverSphere.visible  = false;
        hoverSphereB.visible = false;
        holeLabel.style.display = 'none';

        // Highlight nearest hole (breadboard InstancedMesh)
        const { holesMesh, holeData } = state.breadboard;
        const holeHits = raycaster.intersectObject(holesMesh, false);
        const pinHits  = raycaster.intersectObjects(getAllPinMeshes(), false);

        // Reset all pin emissives
        getAllPinMeshes().forEach(pm => {
          if (pm === wireStartPinMesh) return;
          pm.material.emissive.setHex(0x3a2800);
          pm.material.emissiveIntensity = 0.4;
        });

        // Highlight hovered hole or pin
        if (pinHits.length) {
          const pm = pinHits[0].object;
          if (pm !== wireStartPinMesh) {
            pm.material.emissive.setHex(0x00aa44);
            pm.material.emissiveIntensity = 1.0;
          }
          hoverSphere.position.copy(pm.userData.world);
          hoverSphere.position.y += 0.06;
          hoverSphere.visible = true;
        } else if (holeHits.length) {
          const h = holeData[holeHits[0].instanceId];
          if (h) {
            hoverSphere.position.set(h.x, 0.12, h.z);
            hoverSphere.visible = true;
            holeLabel.style.display = 'block';
            holeLabel.textContent   = `Col ${h.col + 1}  Row ${h.row.toUpperCase()}`;
          }
        }

        // Update temp-wire preview
        updateTempWire(e);
        return;
      }

      // ── SELECT mode ─────────────────────────────────────
      destroyGhost();
      clearFootprint();
      hoverSphere.visible  = false;
      hoverSphereB.visible = false;
      holeLabel.style.display = 'none';
    }

    // ── Temp wire preview line (while mid-draw) ─────────────
    function updateTempWire(e) {
      if (!state.wireStart) {
        if (state.tempWire) { scene.remove(state.tempWire); state.tempWire = null; }
        return;
      }
      if (state.tempWire) scene.remove(state.tempWire);

      const target = new THREE.Vector3();
      raycaster.ray.intersectPlane(boardPlane, target);
      if (!target) return;

      const pts = [state.wireStart.world, target];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({ color: 0x22cc55, dashSize: 0.3, gapSize: 0.15 });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      scene.add(line);
      state.tempWire = line;
    }

    // ── pointerup ────────────────────────────────────────────
    canvas.addEventListener('pointerup', e => {
      if (e.pointerId !== downPointerId) return;
      // Final distance check — catches drags pointermove may have missed
      if (downPos) {
        const dx = e.clientX - downPos.x;
        const dy = e.clientY - downPos.y;
        if (dx * dx + dy * dy > DRAG_THRESH * DRAG_THRESH) wasDragged = true;
      }
      downPointerId = null;
      downPos       = null;
      if (wasDragged) return;
      updateRay(e);
      handleClick(e);
    });

    function handleClick(e) {
      const mode = state.mode;

      // ── PLACE ──────────────────────────────────────────
      if (mode === 'place') {
        const type = state.pickedType;

        if (isOffboard(type)) {
          const pt  = new THREE.Vector3();
          const hit = raycaster.ray.intersectPlane(boardPlane, pt);
          if (hit) App.placePart(type, { x: pt.x, z: pt.z });
          return;
        }

        if (isFootprint(type)) {
          const fp = footprintUnderRay(type);
          if (!fp) return;
          if (!fp.check.ok) {
            const text = `${App.nextLabel(state.components, type)} not placed: ${fp.check.reason}`;
            refusalHint = text;
            App.setHint(text, 6000);
            return;
          }
          App.placePart(type, fp.holes);
          return;
        }

        const holes = holesUnderRay(type);
        if (!holes || !holes.holeB) return;
        // Flipped: the first pin goes in the far hole, the second in the hovered one.
        const hA = flipped ? holes.holeB : holes.holeA;
        const hB = flipped ? holes.holeA : holes.holeB;

        // Registry parts are checked first; a refusal is the hint, word for word.
        if (Parts.get(type)) {
          const G     = App.BOARD_GEOMETRY;
          const legs  = Parts.legsOf({ type, holeRefs: [{ col: hA.col, row: hA.row }, { col: hB.col, row: hB.row }] });
          const check = Parts.checkPlacement(type, legs, App.holeMap(), { cols: G.COLS, bodyRows: G.BODY_ROWS });
          if (!check.ok) {
            App.setHint(`${App.nextLabel(state.components, type)} not placed: ${check.reason}`, 6000);
            return;
          }
        }

        App.placePart(type, [hA, hB]);
        return;
      }

      // ── SELECT ─────────────────────────────────────────
      if (mode === 'select') {
        const compMeshes = getAllComponentMeshes();

        // also allow clicking wire tubes (stored as group children)
        const allWireMeshes = [];
        state.wires.forEach(w => {
          if (w.group) w.group.traverse(o => { if (o.isMesh) allWireMeshes.push(o); });
        });

        const all  = [...compMeshes, ...allWireMeshes];
        if (!all.length) { App.deselect(); return; }

        const hits = raycaster.intersectObjects(all, false);
        if (!hits.length) { App.deselect(); return; }

        const hitObj = hits[0].object;

        // Is it a wire?
        for (const w of state.wires) {
          let found = false;
          if (w.group) w.group.traverse(o => { if (o === hitObj) found = true; });
          if (found) { App.selectItem(w, 'wire'); return; }
        }

        // The owning component. While simulating, a click on a part with a
        // click gesture (a button) works its control instead of selecting it.
        const comp = ownerOf(hitObj);
        if (comp && App.simRunning && App.partGesture(comp, 'click')) return;
        if (comp) { App.selectItem(comp, 'component'); return; }

        App.deselect();
        return;
      }

      // ── WIRE ───────────────────────────────────────────
      if (mode === 'wire') {
        // Resolve click target: prefer pin sphere, then hole
        const pinHits  = raycaster.intersectObjects(getAllPinMeshes(), false);
        const { holesMesh, holeData } = state.breadboard;
        const holeHits = raycaster.intersectObject(holesMesh, false);

        let clickHoleRef  = null;  // { col, row }
        let clickWorld    = null;  // Vector3
        let clickPinMesh  = null;

        if (pinHits.length) {
          const pm = pinHits[0].object;
          // Map pin back to its breadboard hole ref via ownerComp.holeRefs
          const comp    = pm.userData.ownerComp;
          const pidx    = pm.userData.pinIndex;
          const hRef    = comp?.holeRefs?.[pidx];
          clickHoleRef  = hRef || null;
          clickWorld    = pm.userData.world.clone();
          clickPinMesh  = pm;
        } else if (holeHits.length) {
          const h = holeData[holeHits[0].instanceId];
          if (h) { clickHoleRef = { col: h.col, row: h.row }; clickWorld = h.world.clone(); }
        }

        if (!clickWorld) return;

        if (!state.wireStart) {
          // Start wire
          state.wireStart = { world: clickWorld, holeRef: clickHoleRef, pinMesh: clickPinMesh };
          wireStartPinMesh = clickPinMesh;
          if (clickPinMesh) {
            clickPinMesh.userData.isWireStart = true;
            clickPinMesh.material.emissive.setHex(0x884400);
            clickPinMesh.material.emissiveIntensity = 1.1;
          }
          App.setHint('Click another hole or pin to complete the wire · ESC to cancel');
        } else {
          // Complete wire — pass pinMesh so simulate.js can resolve component pins
          App.finishWire({ world: clickWorld, holeRef: clickHoleRef, pinMesh: clickPinMesh });
          wireStartPinMesh = null;
        }
      }
    }

    // ── Keyboard ─────────────────────────────────────────────
    document.addEventListener('keydown', e => {
      const el = document.activeElement;
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) App.redo(); else App.undo();
        return;
      }
      if (e.ctrlKey || e.metaKey) return;   // leave browser shortcuts alone

      if ((e.key === 'r' || e.key === 'R') && state.mode === 'place' && isFootprint(state.pickedType)) {
        // Step through the part's allowed rotations, and redraw it in place.
        const type = state.pickedType;
        footprintRotation(type);
        fpStep++;
        refusalHint = null;
        if (lastPointer) handleHover(lastPointer, true);
        App.setHint(`Rotation: ${footprintRotation(type)}° · R to rotate`, 1800);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        // Toggle rotation (0 ↔ 1)
        state.placementRotation = state.placementRotation === 0 ? 1 : 0;
        // Force ghost rebuild
        ghostType = null;
        syncGhost();
        App.setHint(`Rotation: ${state.placementRotation === 0 ? 'Horizontal' : 'Vertical'} · R to rotate`, 1800);
        return;
      }

      if ((e.key === 'f' || e.key === 'F') && canFlip(state.pickedType)) {
        flipped = !flipped;
        ghostType = null;
        syncGhost();
        if (lastPointer) handleHover(lastPointer, true);
        App.setHint(flipped ? 'Flipped: + and − swapped · F to flip back' : 'Normal · F to flip', 1800);
        return;
      }

      switch (e.key) {
        case 's': case 'S': App.setMode('select'); break;
        case 'p': case 'P': App.setMode('place');  break;
        case 'w': case 'W': App.setMode('wire');   break;
        case 'Escape':
          App.setMode('select');
          break;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          App.deleteSelected();
          break;
      }
    });

    // ── Clear All guard ──────────────────────────────────────
    // The button calls App.clearAll() from an inline onclick, so confirm here
    // in the capture phase, before the event reaches it. Clear All is undoable,
    // but a whole board is a lot to lose to a stray click.
    // App.clearAll itself stays silent: loading and AI actions call it too.
    document.addEventListener('click', e => {
      if (!e.target.closest?.('#clear-all-btn')) return;
      const n = state.components.length + state.wires.length;
      if (!n) return;
      if (!confirm(`Delete all ${n} item${n === 1 ? '' : 's'} on the board? You can undo this with Ctrl+Z.`)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    // Clean up ghost when mode changes
    const _origSetMode = App.setMode.bind(App);
    App.setMode = function (m) {
      _origSetMode(m);
      if (m !== 'place') destroyGhost();
      clearFootprint();
      fpType      = null;   // a (re)picked footprint part starts at its first rotation
      flipped     = false;  // and a (re)picked flippable part starts facing the normal way
      refusalHint = null;
      scrollHint  = null;
      placeHint   = document.getElementById('hint-text').textContent;
      hoverSphere.visible  = false;
      hoverSphereB.visible = false;
      holeLabel.style.display = 'none';
      wireStartPinMesh = null;
    };
  }

  App.initInteraction = initInteraction;

})(window.App = window.App || {});
