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
//  ai: false: the AI is never sent a tool or a prompt line for it.
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
  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);   // plus
    const B = ctx.holeWorld(legs[1].col, legs[1].row);   // minus
    const ax = A.x, az = A.z, bx = B.x, bz = B.z;
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;

    const LEAD_H = 0.3;
    const CAN_H  = 0.9;
    const CAN_R  = 0.28;

    // Upright leads, then stubs in to the can's foot
    for (const p of [A, B]) group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, LEAD_H, p.z)));
    const stub = (from, to) => { if (from.distanceTo(to) > 0.01) group.add(ctx.lead(from, to)); };
    const toward = (x, z) => {
      const d = new THREE.Vector3(x - midX, 0, z - midZ);
      const len = d.length();
      return len > CAN_R ? d.multiplyScalar(CAN_R * 0.6 / len) : d;
    };
    for (const p of [A, B]) {
      const t = toward(p.x, p.z);
      stub(new THREE.Vector3(p.x, LEAD_H, p.z), new THREE.Vector3(midX + t.x, LEAD_H, midZ + t.z));
    }

    // The can: dark blue sleeve, silver top
    const can = new THREE.Mesh(new THREE.CylinderGeometry(CAN_R, CAN_R, CAN_H, 24), ctx.mat.body(0x1f3a7a));
    can.position.set(midX, LEAD_H + CAN_H / 2, midZ);
    can.castShadow = true;
    group.add(can);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(CAN_R * 0.92, CAN_R * 0.92, 0.02, 24), ctx.mat.metal(0xb8b8b8));
    top.position.set(midX, LEAD_H + CAN_H + 0.01, midZ);
    group.add(top);

    // The minus stripe, down the side of the can that faces the minus lead
    const minusDir = new THREE.Vector3(bx - midX, 0, bz - midZ).normalize();
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.1, CAN_H * 0.96, 0.1), ctx.mat.label(0xd8d8d8));
    stripe.position.set(midX + minusDir.x * (CAN_R - 0.03), LEAD_H + CAN_H / 2, midZ + minusDir.z * (CAN_R - 0.03));
    stripe.rotation.y = Math.atan2(minusDir.x, minusDir.z);
    group.add(stripe);

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

    ai: false,

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
