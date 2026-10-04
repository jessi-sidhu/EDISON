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
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const along = new THREE.Vector3().subVectors(B, A).setY(0).normalize();
    const HEAD = 0.5;                    // the disc's underside above the board
    const DISC_R = 0.3, DISC_H = 0.1;

    // The head turns with the part: local +x runs lead 1 → lead 2.
    const head = new THREE.Group();
    head.position.set(mid.x, HEAD, mid.z);
    head.rotation.y = Math.atan2(-along.z, along.x);
    group.add(head);

    // The ceramic disc: a pale rim with rounded edges
    const outline = [[0, 0], [DISC_R * 0.92, 0], [DISC_R, DISC_H * 0.3], [DISC_R, DISC_H * 0.7], [DISC_R * 0.94, DISC_H], [0, DISC_H]];
    const disc = new THREE.Mesh(ctx.lathe(outline, 44), ctx.mat.surface(0xe7d7bf, { roughness: 0.6 }));
    disc.castShadow = true;
    head.add(disc);

    // The face: the orange CdS film and its interleaved serpentine track,
    // under a clear glaze. It brightens with the light (setFace).
    const film = ctx.ghost ? null : ctx.paint(512, 512, (g, W, H) => {
      g.fillStyle = '#d9772f';
      g.beginPath(); g.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#6b2e14';
      g.lineWidth = W * 0.035;
      g.lineJoin = 'round';
      const n = 7, top = H * 0.16, bottom = H * 0.84;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const x = W * 0.16 + (W * 0.68) * i / n;
        if (i === 0) g.moveTo(x, top);
        if (i % 2 === 0) { g.lineTo(x, top); g.lineTo(x, bottom); }
        else { g.lineTo(x, bottom); g.lineTo(x, top); }
      }
      g.stroke();
      g.fillStyle = '#b9bcc2';   // the two electrode pads
      g.fillRect(W * 0.06, H * 0.3, W * 0.08, H * 0.4);
      g.fillRect(W * 0.86, H * 0.3, W * 0.08, H * 0.4);
    });
    const face = new THREE.Mesh(new THREE.CircleGeometry(DISC_R * 0.86, 44),
                                ctx.mat.surface(0xffffff, Object.assign({ roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 },
                                                                        film ? { map: film, emissiveMap: film } : {})));
    face.rotation.x = -Math.PI / 2;
    face.position.y = DISC_H + 0.002;
    face.userData.ldrFace = true;
    head.add(face);
    setFace(face, lightOf(controls));

    // Leads: out of the disc's underside at its electrodes, splayed to the holes
    const legPath = (hole, sign) => {
      const top = mid.clone().addScaledVector(along, sign * 0.17).setY(HEAD + 0.02);
      const end = new THREE.Vector3(hole.x, -0.05, hole.z);
      if (Math.hypot(top.x - end.x, top.z - end.z) < 0.02) return [top, end];
      return [top, top.clone().setY(HEAD * 0.6), new THREE.Vector3(hole.x, HEAD * 0.28, hole.z), end];
    };
    group.add(ctx.bentLead(legPath(A, -1), 0.024, 0.05));
    group.add(ctx.bentLead(legPath(B, 1), 0.024, 0.05));

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
