// ─────────────────────────────────────────────────────────────
//  tools/connections.js — connection highlight (issue #94).
//  Hovering a hole, a pin lead or a wire glows everything electrically
//  joined to it: every hole of its net, the pin leads in it and the wires
//  on it. Works while editing and while simulating; Place mode shows no
//  glow (the ghost wins).
//
//  Nets come from Readings.nets(App.state), recomputed after every board
//  change (app.js refreshCounts calls Connections.onBoardChange).
//
//  Holes glow through the 'bb-holes' InstancedMesh's instance colours,
//  shared with #91's voltage tint: ensureInstanceColours once, then only
//  the colours this file changed are put back. Pins and wire tubes glow
//  through material.emissive, restored to the exact prior values.
//
//  Browser:  window.Connections = { onBoardChange(board), lit() }
// ─────────────────────────────────────────────────────────────

(function () {

  const GLOW_HOLE     = new THREE.Color(0x00c8ff);   // bright cyan, on plain and tinted holes
  const GLOW_EMISSIVE = 0x33d6ff;
  const GLOW_INTENSITY = 0.9;

  let nets   = null;   // null: recompute on next hover
  let byHole = null, byPin = null;
  let litNet = null;   // the net glowing now, or null
  // What was changed, so exactly that is put back.
  let holesLit = [];   // [{ idx, name, prev: Color }]
  let meshesLit = [];  // [{ mesh, key, material, clone, hex, int }]
  let wiresLit = [];   // wire ids

  // Instance colours on the holes mesh, once, looking exactly as before.
  function ensureInstanceColours(mesh) {
    if (mesh.userData.plainColour) return;
    const plain = mesh.material.color.clone();
    mesh.userData.plainColour = plain;
    for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, plain);
    mesh.material.color.setHex(0xffffff);
    mesh.instanceColor.needsUpdate = true;
    mesh.material.needsUpdate = true;   // r128 recompiles to read instance colours
  }

  const pinKey = (comp, k) => comp.label + '.' + k;

  function pinIndex(comp, pin) {
    const def = window.Parts && Parts.get(comp.type);
    const k = def && def.pins ? def.pins.indexOf(pin) : -1;
    return k >= 0 ? k : Number(pin);
  }

  function ensureNets() {
    if (nets) return;
    nets = Readings.nets(App.state);
    byHole = new Map(); byPin = new Map();
    for (const net of nets) {
      net.holes.forEach(h => byHole.set(h, net));
      net.pins.forEach(p => byPin.set(p.label + '.' + p.pin, net));
    }
  }

  // The net a pin lead (comp, k) is in.
  function netOfPin(comp, k) {
    const def = window.Parts && Parts.get(comp.type);
    const pin = def && def.pins ? def.pins[k] : String(k);
    return byPin.get(comp.label + '.' + pin) || null;
  }

  // A wire end ("a3" or "BAT1.0") → its net.
  function netOfEnd(end) {
    if (byHole.has(end)) return byHole.get(end);
    const dot = end.lastIndexOf('.');
    if (dot < 0) return null;
    const comp = App.state.components.find(c => c.label === end.slice(0, dot));
    return comp ? netOfPin(comp, Number(end.slice(dot + 1))) : null;
  }

  function tubeOf(wire) {
    return wire.group ? wire.group.children.find(m => m.isMesh && m.geometry.type === 'TubeGeometry') : null;
  }

  // ── Glow ────────────────────────────────────────────────────

  function glowMesh(mesh, key, sharedMats) {
    const material = mesh.material;
    const rec = { mesh, key, material, clone: null, hex: material.emissive.getHex(), int: material.emissiveIntensity };
    if (sharedMats.has(material)) { rec.clone = material.clone(); mesh.material = rec.clone; }
    mesh.material.emissive.setHex(GLOW_EMISSIVE);
    mesh.material.emissiveIntensity = GLOW_INTENSITY;
    meshesLit.push(rec);
  }

  // Materials used by more than one mesh in the scene.
  function sharedMaterials() {
    const seen = new Set(), shared = new Set();
    App.scene.traverse(o => {
      if (!o.isMesh) return;
      if (seen.has(o.material)) shared.add(o.material);
      seen.add(o.material);
    });
    return shared;
  }

  function glow(net) {
    clear();
    litNet = net;
    const bb = App.state.breadboard, mesh = bb.holesMesh;
    ensureInstanceColours(mesh);
    for (const name of net.holes) {
      const ref = App.parseHole(name);
      const h = bb.getHole(ref.col, ref.row);
      if (!h) continue;
      const prev = new THREE.Color();
      mesh.getColorAt(h.idx, prev);
      mesh.setColorAt(h.idx, GLOW_HOLE);
      holesLit.push({ idx: h.idx, name, prev });
    }
    mesh.instanceColor.needsUpdate = true;

    const shared = sharedMaterials();
    for (const p of net.pins) {
      const comp = App.state.components.find(c => c.label === p.label);
      if (!comp || !comp.pinMeshes) continue;
      const k = pinIndex(comp, p.pin);
      const pm = comp.pinMeshes[k];
      if (pm) glowMesh(pm, pinKey(comp, k), shared);
    }
    for (const w of App.state.wires) {
      if (netOfEnd(App.wireEnds(w).from) !== net) continue;
      const tube = tubeOf(w);
      if (tube) glowMesh(tube, null, shared);
      wiresLit.push(w.id);
    }
  }

  // The buffer holds float32s, so compare to the glow colour loosely.
  const isGlow = c => Math.abs(c.r - GLOW_HOLE.r) + Math.abs(c.g - GLOW_HOLE.g) + Math.abs(c.b - GLOW_HOLE.b) < 1e-4;

  // Puts back what glow() changed, unless someone has changed it since
  // (a selection, wire mode's pin reset, #91's tint).
  function clear() {
    if (holesLit.length) {
      const mesh = App.state.breadboard.holesMesh, now = new THREE.Color();
      for (const h of holesLit) {
        mesh.getColorAt(h.idx, now);
        if (isGlow(now)) mesh.setColorAt(h.idx, h.prev);
      }
      mesh.instanceColor.needsUpdate = true;
    }
    for (const r of meshesLit) {
      if (r.clone) {
        if (r.mesh.material === r.clone) r.mesh.material = r.material;
        r.clone.dispose();
      } else if (r.mesh.material === r.material && r.material.emissive.getHex() === GLOW_EMISSIVE &&
                 r.material.emissiveIntensity === GLOW_INTENSITY) {
        r.material.emissive.setHex(r.hex);
        r.material.emissiveIntensity = r.int;
      }
    }
    holesLit = []; meshesLit = []; wiresLit = [];
    litNet = null;
  }

  // ── Hover ───────────────────────────────────────────────────

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // The net under the pointer, or null.
  function netUnder(e) {
    const el = App.renderer.domElement, r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, App.camera);
    const bb = App.state.breadboard;
    const targets = [bb.holesMesh];
    for (const c of App.state.components) (c.pinMeshes || []).forEach(pm => targets.push(pm));
    const tubes = new Map();
    for (const w of App.state.wires) { const t = tubeOf(w); if (t) { targets.push(t); tubes.set(t, w); } }
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    ensureNets();
    if (hit.object === bb.holesMesh) {
      const h = bb.holeData[hit.instanceId];
      return h ? byHole.get(App.formatHole(h)) || null : null;
    }
    if (tubes.has(hit.object)) return netOfEnd(App.wireEnds(tubes.get(hit.object)).from);
    const comp = hit.object.userData.ownerComp;
    return comp ? netOfPin(comp, hit.object.userData.pinIndex) : null;
  }

  function onMove(e) {
    if (!App.renderer || !App.camera || !App.state || !App.state.breadboard) return;
    if (App.state.mode === 'place') { clear(); return; }
    const net = netUnder(e);
    if (net === litNet) return;
    if (net) glow(net); else clear();
  }

  function attach() {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', () => clear());
    // Before a click selects a glowing wire or pin, so selection saves its
    // real colours, not the glow.
    canvas.addEventListener('pointerdown', () => clear());
  }

  window.Connections = {
    // The board changed: drop the glow and the cached nets.
    onBoardChange(board) {
      clear();
      nets = null;
    },
    // What glows now: hole names, pin leads (LABEL.k) and wire ids.
    lit() {
      return {
        holes: holesLit.map(h => h.name),
        pins:  meshesLit.filter(r => r.key).map(r => r.key),
        wires: wiresLit.slice(),
      };
    },
  };

  attach();
})();
