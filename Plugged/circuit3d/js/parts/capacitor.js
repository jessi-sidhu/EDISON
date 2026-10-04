// ─────────────────────────────────────────────────────────────
//  parts/capacitor.js — an electrolytic capacitor, 1–4700 µF, 25 V (issue #104).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  One C element, polarised and rated 25 V. In a plain solve it is open;
//  in a time run (#102/#103) it charges and discharges. Pins: pin 0 =
//  plus (the + marked lead), pin 1 = minus (the striped side), so a
//  charged capacitor reads a positive V. Reversed by more than 1 V it
//  says "backwards"; past 25 V either way it is over. Readings turns
//  both into the mistake checker's rows and the smoke.
//  The AI places it (#123): its tool goes when a request names it.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build) runs only in the browser and draws through ctx.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./capacitor.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const VMAX      = 25;     // V, the kit's rating
  const REVERSE_V = 1;      // V, reversed by more than this is backwards
  const MOVING_MA = 0.05;   // mA, below this it is holding its charge

  // The kit, µF.
  const KIT = [1, 10, 47, 100, 220, 470, 1000, 4700];
  const CHOICES = {};
  for (const uF of KIT) CHOICES[uF + 'µF'] = { farads: uF * 1e-6 };

  // The C element's key in r.current.
  const C = 'c';
  const volts = v => (v == null ? 0 : v);   // a floating pin reads 0 V, as the solver's GMIN leaves it

  // V: V(+) − V(−). I: mA from + to − through it, so charging is +.
  // energy: ½CV² in µJ.
  function measure(r) {
    const V       = volts(r.pins.plus) - volts(r.pins.minus);
    const I       = (r.current[C] || 0) || 0;   // "|| 0": no −0
    const farads  = (r.values && r.values.farads) || 0;
    const energy  = 0.5 * farads * V * V * 1e6;
    return { V, I, energy };
  }

  // '12.5 mJ', '850 µJ', '1.24 J'.
  function energyText(uJ) {
    if (uJ >= 1e6) return (uJ / 1e6).toFixed(2) + ' J';
    if (uJ >= 1e3) return (uJ / 1e3).toFixed(1) + ' mJ';
    return uJ.toFixed(uJ >= 10 ? 0 : 1) + ' µJ';
  }

  function warnings(r, m) {
    const out = [];
    if (m.V < -REVERSE_V) {
      out.push(`Capacitor is in backwards (${(-m.V).toFixed(1)} V reversed). Turn it so its + lead goes toward +.`);
    }
    if (Math.abs(m.V) > VMAX) {
      out.push(`Capacitor has ${Math.abs(m.V).toFixed(1)} V across it, over its ${VMAX} V rating. Use a lower voltage.`);
    }
    return out;
  }

  function line(r, m) {
    const state = m.I >= MOVING_MA ? 'charging' : m.I <= -MOVING_MA ? 'discharging' : 'holding';
    return { text: `  CAPACITOR ${state} at ${m.V.toFixed(2)} V (${Math.abs(m.I).toFixed(1)} mA), ` +
                   `${energyText(m.energy)} stored`, cls: 'sim-info' };
  }

  function report(r, m) {
    return `${r.values.capacitance} capacitor, ${m.V.toFixed(2)} V, ${m.I.toFixed(1)} mA, ${energyText(m.energy)}`;
  }

  // ── The model: a radial can standing on two leads ─────────────
  //  legs[0] = plus, legs[1] = minus. A pale stripe runs down the minus
  //  side of the can, and a red + sits on the board by the plus lead.
  // The can's radius and height by value: a bigger capacitance is a bigger can.
  const CAN_SIZES = { '1µF': [0.2, 0.62], '10µF': [0.22, 0.7], '47µF': [0.25, 0.78], '100µF': [0.27, 0.86],
                      '220µF': [0.3, 0.92], '470µF': [0.33, 1.0], '1000µF': [0.37, 1.1], '4700µF': [0.45, 1.3] };

  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);   // plus
    const B = ctx.holeWorld(legs[1].col, legs[1].row);   // minus
    const ax = A.x, az = A.z, bx = B.x, bz = B.z;
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const [R, H] = CAN_SIZES[values.capacitance] || [0.3, 0.92];
    const BASE = 0.22;                                    // the can's foot above the board
    const toMinus = new THREE.Vector3(bx - ax, 0, bz - az).normalize();

    // The can: a glossy black sleeve with its crimp groove near the foot and
    // a rolled top edge, an aluminium lid scored with the vent's cross.
    const can = new THREE.Group();
    can.position.set(mid.x, BASE, mid.z);
    can.rotation.y = Math.atan2(-toMinus.x, -toMinus.z);   // local −z faces the minus lead
    group.add(can);
    const outline = [[R * 0.8, 0], [R * 0.95, 0.012], [R, 0.04], [R, 0.1], [R * 0.95, 0.125], [R, 0.15],
                     [R, H - 0.05], [R * 0.985, H - 0.02], [R * 0.93, H], [R * 0.88, H - 0.008]];
    const sleeve = new THREE.Mesh(ctx.lathe(outline, 48),
                                  ctx.mat.surface(0x161618, { roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
    sleeve.castShadow = true;
    can.add(sleeve);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.89, R * 0.89, 0.012, 40),
                               ctx.mat.surface(0xa4a8ae, { metalness: 0.8, roughness: 0.42 }));
    lid.position.y = H - 0.012;
    can.add(lid);
    for (const turn of [0, Math.PI / 2]) {
      const score = new THREE.Mesh(new THREE.BoxGeometry(R * 1.2, 0.006, 0.022), ctx.mat.surface(0x6c7076, { metalness: 0.7, roughness: 0.5 }));
      score.position.y = H - 0.004;
      score.rotation.y = turn + Math.PI / 4;
      can.add(score);
    }
    // The rubber bung under the can
    const bung = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.82, R * 0.82, 0.02, 32), ctx.mat.surface(0x3a3a3c, { roughness: 0.9 }));
    bung.position.y = 0.006;
    can.add(bung);

    // The print: a grey minus stripe down the side facing the minus lead,
    // its − marks, and the value and voltage up the sleeve beside it.
    if (!ctx.ghost) {
      const W = 1024, Hpx = 512;
      const print = ctx.paint(W, Hpx, (g) => {
        const stripe = W * 0.16, cx = W / 2;
        g.fillStyle = '#7f858d';
        g.fillRect(cx - stripe / 2, 0, stripe, Hpx);
        g.fillStyle = '#161618';
        for (let y = Hpx * 0.18; y < Hpx * 0.9; y += Hpx * 0.2) g.fillRect(cx - stripe * 0.22, y, stripe * 0.44, Hpx * 0.035);
        for (const u of [cx - stripe * 1.35, cx + stripe * 1.35, 0.04 * W, 0.96 * W]) {
          g.save();
          g.translate(u, Hpx / 2);
          g.rotate(-Math.PI / 2);
          g.fillStyle = '#c9ccd1';
          g.font = `600 ${Math.round(stripe * 0.42)}px "Helvetica Neue", Arial, sans-serif`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(`${values.capacitance} 25V`, 0, 0);
          g.restore();
        }
      });
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.004, R * 1.004, H - 0.2, 48, 1, true),
                                  new THREE.MeshStandardMaterial({ map: print, transparent: true, roughness: 0.35 }));
      wrap.position.y = 0.15 + (H - 0.2) / 2;
      can.add(wrap);
    }

    // Leads: out of the bung 2.5 mm apart, then splayed out to the holes
    const legPath = (hole, sign) => {
      const top = mid.clone().addScaledVector(toMinus, sign * 0.12).setY(BASE + 0.02);
      const end = new THREE.Vector3(hole.x, -0.05, hole.z);
      if (Math.hypot(top.x - end.x, top.z - end.z) < 0.02) return [top, end];
      return [top, top.clone().setY(BASE * 0.6), new THREE.Vector3(hole.x, BASE * 0.25, hole.z), end];
    };
    group.add(ctx.bentLead(legPath(A, -1), 0.026, 0.05));
    group.add(ctx.bentLead(legPath(B, 1), 0.026, 0.05));

    // A red + on the board by the plus lead
    const plusMat = ctx.mat.label(0xff3333);
    for (const [w, d] of [[0.04, 0.14], [0.14, 0.04]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), plusMat);
      m.position.set(ax, 0.03, az);
      group.add(m);
    }

    return { group, pinPositions: [new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, 0, bz)] };
  }

  return {
    type:     'capacitor',
    name:     'Capacitor',
    sub:      'electrolytic · 25 V',
    category: 'Passives',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="14" x2="11" y2="14"/>' +
              '<line x1="11" y1="6" x2="11" y2="22"/><path d="M18 6 Q15 14 18 22"/>' +
              '<line x1="16.5" y1="14" x2="27" y2="14"/><line x1="5" y1="6" x2="5" y2="10"/>' +
              '<line x1="3" y1="8" x2="7" y2="8"/></svg>',
    prefix:   'C',
    pins:     ['plus', 'minus'],
    place:    { kind: 'span', span: { min: 2, max: 5, default: 3 }, rotations: ['h', 'v'] },
    values:   {
      capacitance: { choices: CHOICES, default: '1000µF' },
    },

    elements: v => [{ kind: 'C', id: C, pins: ['plus', 'minus'], farads: v.farads, vmax: VMAX, polarised: true }],
    measure,
    warnings,
    line,
    report,

    ai: {
      about:    'A polarised electrolytic capacitor, rated 25 V: the + lead in holeA, the − (striped) lead in holeB. ' +
                'It charges and discharges in a time run.',
      keywords: ['capacitor', 'electrolytic', 'rc', 'time constant'],
      listed:   'in-play',
      values:   ['capacitance'],
      guide:    'Polarised: holeA is the + lead, holeB the − (striped) lead. The + lead goes toward the + voltage, ' +
                'the − lead toward ground (tn_N); reversed, it is in backwards. Keep it at 25 V or less. To charge ' +
                'it through a resistor (RC), put place_resistor between the + rail and its + lead. In a plain solve ' +
                'it is open; it charges in a time run.',
      recipe:   {
        name:  '9 V → 1 kΩ → 1000 µF: the + lead (holeA) on the resistor, the − lead (holeB) to ground; it charges to 9 V',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 1000 } },
                { type: 'capacitor', label: 'C1', holes: ['c6', 'c9'], values: { capacitance: '1000µF' } }],   // plus c6, minus c9
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a9', 'tn_9']],
        expect: { C1: { V: [8.99, 9.01], I: [-0.01, 0.01], energy: [40400, 40600] } },
      },
    },

    view: { build },

    examples: [
      {
        name:  '9 V → 1 kΩ → 1000 µF, settled (open in a plain solve): 9 V across, no current, 40.5 mJ stored',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 1000 } },
                { type: 'capacitor', label: 'C1', holes: ['b14', 'b17'], values: { capacitance: '1000µF' } }],   // plus b14, minus b17
        wires: [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1'], ['tp_10', 'c10'], ['c17', 'tn_17']],
        expect: { C1: { V: [8.99, 9.01], I: [-0.01, 0.01], energy: [40400, 40600] } },
      },
    ],
  };
});
