// ─────────────────────────────────────────────────────────────
//  parts/resistor.js — the resistor, a registry part (issue #23).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build) runs only in the browser and draws through ctx.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./resistor.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  // ── Colour code: digit, digit, decimal multiplier, tolerance ──
  const DIGIT_COLORS = [
    0x1a1a1a, 0x7b3f00, 0xd62828, 0xf77f00, 0xfcbf49,
    0x2a9d3f, 0x1d4ed8, 0x7c3aed, 0x9ca3af, 0xf5f5f5,
  ];
  const GOLD = 0xd4af37, SILVER = 0xc0c0c0;
  const BODY = 0xd4a96a;

  function multiplierColor(exp) {
    if (exp === -1) return GOLD;
    if (exp === -2) return SILVER;
    return DIGIT_COLORS[exp] ?? DIGIT_COLORS[0];
  }

  // 220 Ω → red, red, brown, gold
  function bandsFor(ohms) {
    let sig = Number(ohms), exp = 0;
    if (!(sig > 0)) return [DIGIT_COLORS[0], DIGIT_COLORS[0], DIGIT_COLORS[0], GOLD];
    while (sig >= 100) { sig /= 10; exp++; }
    while (sig < 10)   { sig *= 10; exp--; }
    sig = Math.round(sig);
    if (sig === 100) { sig = 10; exp++; }   // rounding carried, e.g. 99.6 Ω
    return [DIGIT_COLORS[Math.floor(sig / 10)], DIGIT_COLORS[sig % 10], multiplierColor(exp), GOLD];
  }

  // ── The model: two upright leads, two stubs, a tan body, four bands ──
  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);
    const B = ctx.holeWorld(legs[1].col, legs[1].row);
    const ax = A.x, az = A.z, bx = B.x, bz = B.z;
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;

    // Horizontal (same z) or vertical (same x)
    const isHoriz = Math.abs(az - bz) < 0.01;
    const LEAD_H  = 0.72;
    const BODY_R  = 0.10;

    // Body length = distance minus a bit so it doesn't reach the hole edges
    const bodyLen = Math.max(0.4, isHoriz ? Math.abs(bx - ax) * 0.56 : Math.abs(bz - az) * 0.56);

    // Upright leads from the holes to body height
    for (const p of [A, B]) group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, LEAD_H, p.z)));

    // Stubs from the lead tops to the body ends
    const hOff = bodyLen / 2 + 0.01;
    const stub = (from, to) => { if (from.distanceTo(to) > 0.01) group.add(ctx.lead(from, to)); };
    if (isHoriz) {
      stub(new THREE.Vector3(ax, LEAD_H, midZ), new THREE.Vector3(midX - hOff, LEAD_H, midZ));
      stub(new THREE.Vector3(midX + hOff, LEAD_H, midZ), new THREE.Vector3(bx, LEAD_H, midZ));
    } else {
      stub(new THREE.Vector3(midX, LEAD_H, az), new THREE.Vector3(midX, LEAD_H, midZ - hOff));
      stub(new THREE.Vector3(midX, LEAD_H, midZ + hOff), new THREE.Vector3(midX, LEAD_H, bz));
    }

    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R, BODY_R, bodyLen, 14), ctx.mat.body(BODY));
    body.castShadow = true;
    if (isHoriz) body.rotation.z = Math.PI / 2;
    else         body.rotation.x = Math.PI / 2;
    body.position.set(midX, LEAD_H, midZ);
    group.add(body);

    // Colour bands: the real 4-band code for this resistor's value
    const bands  = bandsFor(values.resistance);
    const bSpace = bodyLen / (bands.length + 1);
    bands.forEach((hex, i) => {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R + 0.004, BODY_R + 0.004, bodyLen * 0.1, 14), ctx.mat.body(hex));
      if (isHoriz) {
        band.rotation.z = Math.PI / 2;
        band.position.set(midX - bodyLen / 2 + bSpace * (i + 1), LEAD_H, midZ);
      } else {
        band.rotation.x = Math.PI / 2;
        band.position.set(midX, LEAD_H, midZ - bodyLen / 2 + bSpace * (i + 1));
      }
      group.add(band);
    });

    return { group, pinPositions: [new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, 0, bz)] };
  }

  // The one current through the part, in mA, from pin 0 to pin 1.
  const through = r => Object.values(r.current)[0] || 0;

  return {
    type:     'resistor',
    name:     'Resistor',
    sub:      '2 leads · axial',
    category: 'Passives',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="14" x2="7" y2="14"/>' +
              '<rect x="7" y="10" width="14" height="8" rx="1.5" fill="currentColor" fill-opacity="0.1"/>' +
              '<rect x="7" y="10" width="14" height="8" rx="1.5"/><line x1="11.5" y1="10" x2="11.5" y2="18"/>' +
              '<line x1="14" y1="10" x2="14" y2="18"/><line x1="16.5" y1="10" x2="16.5" y2="18"/>' +
              '<line x1="21" y1="14" x2="27" y2="14"/></svg>',
    prefix:   'R',
    pins:     ['lead1', 'lead2'],
    place:    { kind: 'span', span: { min: 3, max: 5, default: 4 }, rotations: ['h', 'v'] },
    values:   { resistance: { unit: 'Ω', default: 470, min: 1, max: 10e6, series: 'E12' } },

    elements: v => [{ kind: 'R', pins: ['lead1', 'lead2'], ohms: v.resistance }],
    measure:  r => ({ current: Math.abs(through(r)) }),
    report:   (r, m) => `${r.values.resistance} ohm resistor, ${m.current.toFixed(1)} mA`,

    ai: {
      about:    'A resistor: two leads on one row, 3–5 columns apart, or straight across the centre gap. ' +
                'Limits current, e.g. in series with an LED.',
      keywords: ['resistor', 'resistance', 'ohm', 'ohms', 'limit'],
    },

    view: { build },

    examples: [
      {
        name:  '9 V straight across 470 Ω draws 19.1 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'] }],
        wires: [['BAT1.0', 'tp_10'], ['BAT1.1', 'tn_14'], ['tp_9', 'b10'], ['b14', 'tn_15']],
        expect: { R1: { current: [19.1, 19.2] } },
      },
      {
        name:  '1 kΩ across 9 V draws 9.0 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a20', 'a24'], values: { resistance: 1000 } }],
        wires: [['BAT1.0', 'tp_20'], ['BAT1.1', 'tn_24'], ['tp_19', 'b20'], ['b24', 'tn_25']],
        expect: { R1: { current: [8.95, 9.05] } },
      },
      {
        name:  'In series with a red LED on 9 V, 470 Ω carries about 14.9 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a2', 'a6'] },
                { type: 'led', label: 'LED1', holes: ['b8', 'b6'] }],   // cathode b8, anode b6
        wires: [['BAT1.0', 'tp_50'], ['BAT1.1', 'tn_50'], ['tp_2', 'b2'], ['c8', 'tn_8']],
        expect: { R1: { current: [14.8, 15.0] } },
      },
    ],
  };
});
