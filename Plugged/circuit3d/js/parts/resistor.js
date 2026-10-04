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

  // ── The model: a carbon-film dog-bone (bulged end caps, a slimmer waist)
  //  lying just above the board, its four colour bands following the
  //  body's curve, and two tinned leads bent down into the holes. ──
  const AXIS_H = 0.3;                    // the body's centre line above the board
  const END_R = 0.16, WAIST_R = 0.134;   // radius at the end caps and the waist
  // Where each band sits along the body (0 → 1 from pin 0): three on the
  // first cap and the waist, the tolerance band on the far cap.
  const BAND_AT = [[0.14, 0.21], [0.30, 0.36], [0.42, 0.48], [0.77, 0.84]];

  const smooth = x => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  // The body's radius at t (0 → 1 along it): a rounded end, the cap's bulge, then the waist.
  function radiusAt(t) {
    const e = Math.min(t, 1 - t);
    const end = e < 0.07 ? Math.sqrt(1 - Math.pow(1 - e / 0.07, 2)) : 1;
    return (WAIST_R + (END_R - WAIST_R) * (1 - smooth((e - 0.2) / 0.09))) * end;
  }

  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);
    const B = ctx.holeWorld(legs[1].col, legs[1].row);
    const along = new THREE.Vector3().subVectors(B, A);
    const len = Math.min(1.0, Math.max(0.5, along.length() - 0.42));   // room left for the bends
    along.normalize();
    const mid = A.clone().add(B).multiplyScalar(0.5);

    // The body is drawn along +y, then laid along the leads.
    const body = new THREE.Group();
    body.position.set(mid.x, AXIS_H, mid.z);
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
    group.add(body);
    // The outline from t0 to t1, its y measured from `at` (a band's own centre, so it sorts by position).
    const profile = (t0, t1, grow, n, at = 0.5) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = t0 + (t1 - t0) * i / n;
        pts.push([radiusAt(t) + grow, (t - at) * len]);
      }
      return pts;
    };
    const shell = new THREE.Mesh(ctx.lathe(profile(0, 1, 0, 64), 36),
                                 ctx.mat.surface(BODY, { roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35 }));
    shell.castShadow = true;
    body.add(shell);

    // Colour bands: the real 4-band code for this resistor's value
    bandsFor(values.resistance).forEach((hex, i) => {
      const metal = hex === GOLD || hex === SILVER;
      const paint = ctx.mat.surface(hex, metal ? { metalness: 0.75, roughness: 0.35 } : { roughness: 0.45, clearcoat: 0.3 });
      const [t0, t1] = BAND_AT[i], tc = (t0 + t1) / 2;
      const band = new THREE.Mesh(ctx.lathe(profile(t0, t1, 0.003, 8, tc), 36), paint);
      band.position.y = (tc - 0.5) * len;
      body.add(band);
    });

    // Leads: out of each end cap, a rounded bend, straight down into the hole.
    for (const [hole, sign] of [[A, -1], [B, 1]]) {
      const cap = mid.clone().addScaledVector(along, sign * (len / 2 - 0.03)).setY(AXIS_H);
      group.add(ctx.bentLead([cap, new THREE.Vector3(hole.x, AXIS_H, hole.z), new THREE.Vector3(hole.x, -0.05, hole.z)], 0.026, 0.09));
    }

    return { group, pinPositions: [new THREE.Vector3(A.x, 0, A.z), new THREE.Vector3(B.x, 0, B.z)] };
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
      everyday: true,
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
