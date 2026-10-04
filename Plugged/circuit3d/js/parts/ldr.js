// ─────────────────────────────────────────────────────────────
//  parts/ldr.js — the light sensor (LDR), a registry part (issue #40).
//  The rules are docs/API-CONTRACT.md → "Part file contract"; it copies
//  parts/potentiometer.js's "Pattern: footprint + slider", as a span part.
//
//  Two leads on one row, 2–4 columns apart. Its state is the saved slider
//  control `light` (1–10000 lux), which the scroll wheel over the model
//  (gestures.scroll) and the inspector move. Electrically one R, re-made
//  from the controls on every simulation:
//    R = r10 · (light / 10)^−0.7, clamped to 100 Ω–1 MΩ
//  where r10 is the resistance at 10 lux.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws
//  through ctx, or on the group view.build returned.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./ldr.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory(Parts));
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function (Parts) {

  const MIN_OHMS = 100, MAX_OHMS = 1e6;
  const GAMMA    = 0.7;

  const lightOf = c => (c && Number.isFinite(c.light) ? c.light : 300);
  const r10Of   = v => (v && Number.isFinite(v.r10) ? v.r10 : 10000);

  // The sensor's resistance in ohms at the given values and controls.
  function ohms(values, controls) {
    const r = r10Of(values) * Math.pow(Math.max(lightOf(controls), 1e-9) / 10, -GAMMA);
    return Math.min(MAX_OHMS, Math.max(MIN_OHMS, r));
  }

  const elements = (values, controls) => [{ kind: 'R', pins: ['1', '2'], ohms: ohms(values, controls) }];

  const measure = r => ({ resistance: ohms(r.values, r.controls), light: lightOf(r.controls) });

  // "300 lux · 925 Ω": the light, then the resistance.
  const report = (r, m) => `${m.light} lux · ${Parts.withUnit(m.resistance, 'Ω')}`;

  // ── The model: two leads, a round red-brown disc, a face with a track ──
  //  The face is marked userData.ldrFace; update() brightens it with the
  //  light (cosmetic), on a log scale from 1 lux (dark) to 10000 (bright).
  const brightness = light => Math.min(1, Math.max(0, Math.log10(Math.max(light, 1)) / 4));

  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);
    const B = ctx.holeWorld(legs[1].col, legs[1].row);
    const midX = (A.x + B.x) / 2;
    const midZ = (A.z + B.z) / 2;
    const isHoriz = Math.abs(A.z - B.z) < 0.01;
    const LEAD_H = 0.40;
    const DISC_R = 0.30;

    // Upright leads, then stubs in to the disc's rim
    for (const p of [A, B]) group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, LEAD_H, p.z), 0.025));
    const stub = (from, to) => { if (from.distanceTo(to) > 0.01) group.add(ctx.lead(from, to, 0.025)); };
    const off = DISC_R * 0.8;
    if (isHoriz) {
      stub(new THREE.Vector3(A.x, LEAD_H, midZ), new THREE.Vector3(midX - Math.sign(midX - A.x) * off, LEAD_H, midZ));
      stub(new THREE.Vector3(B.x, LEAD_H, midZ), new THREE.Vector3(midX + Math.sign(B.x - midX) * off, LEAD_H, midZ));
    } else {
      stub(new THREE.Vector3(midX, LEAD_H, A.z), new THREE.Vector3(midX, LEAD_H, midZ - Math.sign(midZ - A.z) * off));
      stub(new THREE.Vector3(midX, LEAD_H, B.z), new THREE.Vector3(midX, LEAD_H, midZ + Math.sign(B.z - midZ) * off));
    }

    // The disc body, flat on top of the leads
    const body = new THREE.Mesh(new THREE.CylinderGeometry(DISC_R, DISC_R, 0.14, 24), ctx.mat.body(0x8a4b2a));
    body.position.set(midX, LEAD_H + 0.07, midZ);
    body.castShadow = true;
    group.add(body);

    // The face: a lighter disc on top that brightens with the light
    const face = new THREE.Mesh(new THREE.CylinderGeometry(DISC_R * 0.88, DISC_R * 0.88, 0.02, 24), ctx.mat.body(0xd9a441));
    face.position.set(midX, LEAD_H + 0.15, midZ);
    face.userData.ldrFace = true;
    group.add(face);
    setFace(face, lightOf(controls));

    // The zig-zag track across the face
    const track = ctx.mat.label(0x5a2d14);
    for (let i = -2; i <= 2; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34 - Math.abs(i) * 0.05, 0.012, 0.03), track);
      bar.position.set(midX, LEAD_H + 0.165, midZ + i * 0.08);
      if (!isHoriz) { bar.rotation.y = Math.PI / 2; bar.position.set(midX + i * 0.08, LEAD_H + 0.165, midZ); }
      group.add(bar);
    }

    return { group, pinPositions: [new THREE.Vector3(A.x, 0, A.z), new THREE.Vector3(B.x, 0, B.z)] };
  }

  function setFace(face, light) {
    const m = face.material;
    if (!m || !m.emissive) return;
    m.emissive.setHex(0xffe08a);
    m.emissiveIntensity = 0.05 + 0.6 * brightness(light);
  }

  // The face follows the light: r.controls after a simulation, or the
  // record's own controls when there is no result (Stop).
  function update(obj, m, r) {
    const group = obj && obj.group;
    if (!group) return;
    const light = lightOf(r ? r.controls : obj.controls);
    group.traverse(o => { if (o.userData.ldrFace) setFace(o, light); });
  }

  return {
    type:     'ldr',
    name:     'Light sensor',
    sub:      'LDR · 2 leads',
    category: 'I/O',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<circle cx="14" cy="12" r="8" fill="currentColor" fill-opacity="0.1"/><circle cx="14" cy="12" r="8"/>' +
              '<polyline points="9,9 19,9 9,12 19,12 9,15 19,15"/>' +
              '<line x1="10" y1="20" x2="10" y2="27"/><line x1="18" y1="20" x2="18" y2="27"/></svg>',
    prefix:   'LDR',
    pins:     ['1', '2'],
    place:    { kind: 'span', span: { min: 2, max: 4, default: 3 }, rotations: ['h', 'v'] },
    values:   { r10: { unit: 'Ω', default: 10000, min: 1000, max: 100000 } },
    controls: { light: { type: 'slider', default: 300, min: 1, max: 10000, step: 1, unit: 'lux', saved: true } },
    gestures: { scroll: 'light' },

    elements,
    measure,
    report,

    ai: {
      about:    'A light sensor (LDR, photoresistor): two leads on one row, 2–4 columns apart. Its resistance falls ' +
                'as light rises (10 kΩ at 10 lux, 925 Ω at 300 lux). The user scrolls it darker while simulating.',
      keywords: ['ldr', 'light sensor', 'photoresistor', 'night light', 'light dependent'],
      guide:    'Night light (LED on in the dark), LED in parallel with the LDR, fed through 4.7 kΩ: ' +
                'wire tp_3 → a2; resistor b2–b6 at 4700; LED anode c6, cathode c8; place_ldr holeA d6, holeB d9; ' +
                'wires a8 → tn_8 and a9 → tn_9. Light keeps the LED off; dark turns it on.',
    },

    view: { build, update },

    examples: [
      {
        name:  '9 V → 10 kΩ → LDR at 10 lux (10 kΩ): 4.5 V across the sensor',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['b10', 'b14'], values: { resistance: 10000 } },
                { type: 'ldr', label: 'LDR1', holes: ['c14', 'c17'], controls: { light: 10 } }],
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_10', 'a10'], ['a17', 'tn_17']],
        expect: { LDR1: { resistance: [9999, 10001] } },
      },
      {
        name:  '9 V → 10 kΩ → LDR at 1000 lux (398 Ω): 0.34 V across the sensor',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['b10', 'b14'], values: { resistance: 10000 } },
                { type: 'ldr', label: 'LDR1', holes: ['c14', 'c17'], controls: { light: 1000 } }],
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_10', 'a10'], ['a17', 'tn_17']],
        expect: { LDR1: { resistance: [397, 400] } },
      },
    ],
  };
});
