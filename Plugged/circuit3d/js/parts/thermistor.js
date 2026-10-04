// ─────────────────────────────────────────────────────────────
//  parts/thermistor.js — the NTC thermistor, a registry part (issue #41).
//  The rules are docs/API-CONTRACT.md → "Part file contract"; it copies
//  parts/ldr.js (a 2-lead span part with a saved slider and scroll).
//
//  Two leads on one row, 2–4 columns apart. Its state is the saved slider
//  control `temperature` (−20–120 °C), which the scroll wheel over the
//  model (gestures.scroll) and the inspector move. Electrically one R,
//  re-made from the controls on every simulation (the beta model):
//    R = r25 · exp(B · (1/(T + 273.15) − 1/298.15)),  B = 3950
//  where r25 is the resistance at 25 °C. Over the slider's range it stays
//  407 Ω–105 kΩ for r25 = 10 kΩ, so there is no clamp.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws
//  through ctx, or on the group view.build returned.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./thermistor.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory(Parts));
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function (Parts) {

  const BETA   = 3950;
  const KELVIN = 273.15;
  const T25    = 25 + KELVIN;

  const tempOf = c => (c && Number.isFinite(c.temperature) ? c.temperature : 25);
  const r25Of  = v => (v && Number.isFinite(v.r25) ? v.r25 : 10000);

  // The thermistor's resistance in ohms at the given values and controls.
  function ohms(values, controls) {
    return r25Of(values) * Math.exp(BETA * (1 / (tempOf(controls) + KELVIN) - 1 / T25));
  }

  const elements = (values, controls) => [{ kind: 'R', pins: ['1', '2'], ohms: ohms(values, controls) }];

  const measure = r => ({ resistance: ohms(r.values, r.controls), temperature: tempOf(r.controls) });

  // "25 °C · 10 kΩ": the temperature, then the resistance.
  const report = (r, m) => `${m.temperature} °C · ${Parts.withUnit(m.resistance, 'Ω')}`;

  // ── The model: two leads up to a small epoxy bead ──
  //  The bead is marked userData.thBead; update() tints it warmer with the
  //  temperature (cosmetic), from cool blue at −20 °C to hot red at 120 °C.
  const warmth = t => Math.min(1, Math.max(0, (t + 20) / 140));

  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);
    const B = ctx.holeWorld(legs[1].col, legs[1].row);
    const midX = (A.x + B.x) / 2;
    const midZ = (A.z + B.z) / 2;
    const LEAD_H = 0.45;
    const BEAD_R = 0.22;

    // Upright leads, then two leads leaning in to the bead
    const top = new THREE.Vector3(midX, LEAD_H + BEAD_R * 0.6, midZ);
    for (const p of [A, B]) {
      group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, LEAD_H, p.z), 0.025));
      const from = new THREE.Vector3(p.x, LEAD_H, p.z);
      const to   = from.clone().lerp(top, 0.8);
      if (from.distanceTo(to) > 0.01) group.add(ctx.lead(from, to, 0.025));
    }

    // The bead, a slightly squashed sphere of epoxy
    const bead = new THREE.Mesh(new THREE.SphereGeometry(BEAD_R, 20, 14), ctx.mat.body(0x2f5d7c));
    bead.scale.set(1, 1.15, 1);
    bead.position.copy(top);
    bead.castShadow = true;
    bead.userData.thBead = true;
    group.add(bead);
    setBead(bead, tempOf(controls));

    return { group, pinPositions: [new THREE.Vector3(A.x, 0, A.z), new THREE.Vector3(B.x, 0, B.z)] };
  }

  function setBead(bead, t) {
    const m = bead.material;
    if (!m || !m.emissive) return;
    m.emissive.setHex(0xff5a1f);
    m.emissiveIntensity = 0.6 * warmth(t) * warmth(t);
  }

  // The bead follows the temperature: r.controls after a simulation, or the
  // record's own controls when there is no result (Stop).
  function update(obj, m, r) {
    const group = obj && obj.group;
    if (!group) return;
    const t = tempOf(r ? r.controls : obj.controls);
    group.traverse(o => { if (o.userData.thBead) setBead(o, t); });
  }

  return {
    type:     'thermistor',
    name:     'Thermistor',
    sub:      'NTC · 2 leads',
    category: 'I/O',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<ellipse cx="14" cy="10" rx="6" ry="7" fill="currentColor" fill-opacity="0.1"/><ellipse cx="14" cy="10" rx="6" ry="7"/>' +
              '<line x1="11" y1="16" x2="10" y2="27"/><line x1="17" y1="16" x2="18" y2="27"/>' +
              '<line x1="21" y1="4" x2="24" y2="4"/><line x1="21" y1="8" x2="24" y2="8"/></svg>',
    prefix:   'TH',
    pins:     ['1', '2'],
    place:    { kind: 'span', span: { min: 2, max: 4, default: 3 }, rotations: ['h', 'v'] },
    values:   { r25: { unit: 'Ω', default: 10000, min: 1000, max: 100000 } },
    controls: { temperature: { type: 'slider', default: 25, min: -20, max: 120, step: 1, unit: '°C', saved: true } },
    gestures: { scroll: 'temperature' },

    elements,
    measure,
    report,

    ai: {
      about:    'A thermistor (NTC temperature sensor): two leads on one row, 2–4 columns apart. Its resistance falls ' +
                'as it heats (10 kΩ at 25 °C, 3.6 kΩ at 50 °C). The user scrolls it hotter while simulating.',
      keywords: ['thermistor', 'ntc', 'temperature sensor', 'heat', 'thermometer', 'temperature'],
      guide:    'Temperature alarm (buzzer sounds when hot), all in series: wire tp_3 → a2; ' +
                'place_thermistor holeA b2, holeB b5; resistor c5–c9 at 3300; buzzer d9–d11; wire a11 → tn_11. ' +
                'Silent at 25 °C; sounds above about 39 °C.',
    },

    view: { build, update },

    examples: [
      {
        name:  '9 V → 10 kΩ → thermistor at 25 °C (10 kΩ): 4.5 V across the sensor',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['b10', 'b14'], values: { resistance: 10000 } },
                { type: 'thermistor', label: 'TH1', holes: ['c14', 'c17'], controls: { temperature: 25 } }],
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_10', 'a10'], ['a17', 'tn_17']],
        expect: { TH1: { resistance: [9999, 10001] } },
      },
      {
        name:  '9 V → 10 kΩ → thermistor at 50 °C (3.59 kΩ): 2.38 V across the sensor',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['b10', 'b14'], values: { resistance: 10000 } },
                { type: 'thermistor', label: 'TH1', holes: ['c14', 'c17'], controls: { temperature: 50 } }],
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_10', 'a10'], ['a17', 'tn_17']],
        expect: { TH1: { resistance: [3500, 3700] } },
      },
    ],
  };
});
