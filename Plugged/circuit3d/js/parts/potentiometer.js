// ─────────────────────────────────────────────────────────────
//  parts/potentiometer.js — the potentiometer, a registry part (issue #31).
//  The rules are docs/API-CONTRACT.md → "Part file contract"; this file is
//  the example for its "Pattern: footprint + slider".
//
//  Three legs in a row (a footprint part): pin 1, the wiper, pin 3. Its
//  state is the saved slider control `position` (0–100 %), which the
//  scroll wheel over the model (gestures.scroll) and the inspector move.
//  Electrically two R elements, re-made from the controls on every
//  simulation: R(1, wiper) = p·R and R(wiper, 3) = (1 − p)·R, each at
//  least 1 Ω, with p = position / 100 (0 % puts the wiper at pin 1).
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws
//  through ctx, or on the group view.build returned.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./potentiometer.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const MIN_OHMS = 1;   // the short side never reaches 0 Ω

  const positionOf = c => (c && Number.isFinite(c.position) ? c.position : 50);

  // The two halves in ohms, before the 1 Ω floor: [R(1, wiper), R(wiper, 3)].
  function halves(values, controls) {
    const p = Math.min(1, Math.max(0, positionOf(controls) / 100));
    return [p * values.resistance, (1 - p) * values.resistance];
  }

  function elements(values, controls) {
    const [top, bottom] = halves(values, controls);
    return [
      { kind: 'R', id: 'top',    pins: ['1', 'wiper'], ohms: Math.max(top, MIN_OHMS) },
      { kind: 'R', id: 'bottom', pins: ['wiper', '3'], ohms: Math.max(bottom, MIN_OHMS) },
    ];
  }

  // 5000 → "5.0 kΩ", 300 → "300 Ω", 1e6 → "1.0 MΩ".
  function ohms(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MΩ';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + ' kΩ';
    return Math.round(n) + ' Ω';
  }

  function measure(r) {
    const w = r.pins ? r.pins.wiper : null;
    return { position: positionOf(r.controls), wiperVolts: Number.isFinite(w) ? w : null };
  }

  // "50 % · 5.0 kΩ | 5.0 kΩ": position, then R(1–wiper) | R(wiper–3).
  function report(r, m) {
    const [top, bottom] = halves(r.values, r.controls);
    return `${m.position} % · ${ohms(top)} | ${ohms(bottom)}`;
  }

  // ── The model: three leads, a blue square body, a shaft and a knob ──
  //  The knob is marked userData.potKnob; update() turns it with the
  //  position, from −135° at 0 % to +135° at 100 %.
  const KNOB_SWEEP = Math.PI * 1.5;
  const knobAngle  = position => -(position / 100 - 0.5) * KNOB_SWEEP;

  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const at = legs.map(l => ctx.holeWorld(l.col, l.row));
    const mid = at[1];
    const LEAD_H = 0.30;

    // Upright leads from each hole to the body
    for (const p of at) group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, LEAD_H, p.z), 0.025));

    // Square body over the three legs
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.30, 0.95), ctx.mat.body(0x2b5fb3));
    body.position.set(mid.x, LEAD_H + 0.15, mid.z);
    body.castShadow = true;
    group.add(body);

    // Shaft and knob; the knob carries a white pointer
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.14, 12), ctx.mat.metal());
    shaft.position.set(mid.x, LEAD_H + 0.37, mid.z);
    group.add(shaft);
    const knob = new THREE.Group();
    knob.position.set(mid.x, LEAD_H + 0.56, mid.z);
    knob.rotation.y = knobAngle(positionOf(controls));
    knob.userData.potKnob = true;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.32, 0.24, 20), ctx.mat.body(0x333333));
    cap.castShadow = true;
    knob.add(cap);
    const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.24), ctx.mat.label(0xf5f5f5));
    pointer.position.set(0, 0.125, -0.13);
    knob.add(pointer);
    group.add(knob);

    return { group, pinPositions: at.map(p => new THREE.Vector3(p.x, 0, p.z)) };
  }

  // The knob follows the position: r.controls after a simulation, or the
  // record's own controls when there is no result (Stop).
  function update(obj, m, r) {
    const group = obj && obj.group;
    if (!group) return;
    const position = positionOf(r ? r.controls : obj.controls);
    group.traverse(o => { if (o.userData.potKnob) o.rotation.y = knobAngle(position); });
  }

  return {
    type:     'potentiometer',
    name:     'Potentiometer',
    sub:      '3 leads · knob',
    category: 'Passives',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="5" y="9" width="18" height="12" rx="1.5" fill="currentColor" fill-opacity="0.1"/>' +
              '<rect x="5" y="9" width="18" height="12" rx="1.5"/>' +
              '<circle cx="14" cy="15" r="4"/><line x1="14" y1="15" x2="16.5" y2="12.5"/>' +
              '<line x1="9" y1="21" x2="9" y2="26"/><line x1="14" y1="21" x2="14" y2="26"/>' +
              '<line x1="19" y1="21" x2="19" y2="26"/></svg>',
    prefix:   'RV',
    pins:     ['1', 'wiper', '3'],
    place:    { kind: 'footprint', legs: [[0, 0], [1, 0], [2, 0]], rotations: [0, 90, 180, 270] },
    values:   { resistance: { unit: 'Ω', default: 10000, min: 100, max: 1e6, series: 'E12' } },
    controls: { position: { type: 'slider', default: 50, min: 0, max: 100, step: 1, unit: '%', saved: true } },
    gestures: { scroll: 'position' },

    elements,
    measure,
    report,

    ai: {
      about:    'A potentiometer (variable resistor with a knob): three legs in a row, pin 1, wiper, pin 3. ' +
                'The user turns it while the simulation runs.',
      keywords: ['potentiometer', 'pot', 'knob', 'variable resistor', 'dimmer', 'trimmer'],
      guide:    'Wiper is the middle pin. Ends go to + and −; the wiper gives the adjustable voltage. ' +
                'LED dimmer: place_potentiometer hole c2, direction right, resistance 1000 (pin 1 c2, wiper c3, pin 3 c4); ' +
                'wires tp_4 → a4 and a2 → tn_2; resistor b3–b7; LED holeA c9, holeB c7; wire a9 → tn_9.',
      mustWire: ['wiper'],
    },

    view: { build, update },

    examples: [
      {
        name:  '9 V across a 10 kΩ pot at 25 %: the wiper reads 6.75 V',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'potentiometer', label: 'RV1', holes: ['c10', 'c11', 'c12'], controls: { position: 25 } }],
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_10', 'a10'], ['a12', 'tn_12']],
        expect: { RV1: { wiperVolts: [6.7, 6.8] } },
      },
      {
        name:  'A 1 kΩ pot at 100 % dims a red LED behind 470 Ω to its brightest, about 14.8 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'potentiometer', label: 'RV1', holes: ['c2', 'c3', 'c4'], values: { resistance: 1000 },
                  controls: { position: 100 } },
                { type: 'resistor', label: 'R1', holes: ['b3', 'b7'] },
                { type: 'led', label: 'LED1', holes: ['c9', 'c7'] }],   // cathode c9, anode c7
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_4', 'a4'], ['a2', 'tn_2'], ['a9', 'tn_9']],
        expect: { LED1: { on: true, current: [14.7, 14.95] } },
      },
    ],
  };
});
