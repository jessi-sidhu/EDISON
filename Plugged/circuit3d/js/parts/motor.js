// ─────────────────────────────────────────────────────────────
//  parts/motor.js — the small DC motor, a registry part (issue #37).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Electrically a plain resistor (10 Ω by default). It spins once the
//  current reaches startCurrent, faster up to full speed at 5 × that,
//  and turns the other way when the current reverses. Over 0.5 A (more
//  than a 9 V battery should give) it warns.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws through
//  ctx; update turns the shaft on requestAnimationFrame.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./motor.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const LIMIT_MA = 500;   // the most a 9 V battery should give
  const TURN     = 12;    // radians a second at full speed (about 2 turns)

  // The one current through the part, in mA, from pin 1 to pin 2.
  const through = r => Object.values(r.current || {})[0] || 0;
  const startOf = r => (Number(r.values && r.values.startCurrent) || 0.05) * 1000;

  function measure(r) {
    const i = Number(through(r)) || 0;
    const current = Math.abs(i);
    const start = startOf(r);
    const spinning = current >= start;
    return { spinning, speed: spinning ? Math.min(current / (5 * start), 1) : 0, direction: i < 0 ? -1 : 1, current };
  }

  function warnings(r, m) {
    if (!(m.current > LIMIT_MA)) return [];
    return [`Motor draws ${m.current.toFixed(0)} mA, over the 0.5 A a 9 V battery should give. Lower the voltage or add a resistor.`];
  }

  function line(r, m) {
    return m.spinning
      ? { text: `  ⚙️ MOTOR spinning (${m.current.toFixed(1)} mA)`, cls: 'sim-on' }
      : { text: `  MOTOR not spinning (${m.current.toFixed(1)} mA, needs ${startOf(r).toFixed(0)} mA to start)`, cls: 'sim-info' };
  }

  function report(r, m) {
    return `${r.values.resistance} ohm motor ${m.spinning ? 'spinning' : 'not spinning'}, ${m.current.toFixed(1)} mA`;
  }

  // ── The model: a 130-size DC motor lying on its side. A steel can with
  //  its two flats, the black end cap at the front with its brass tabs,
  //  leads from the tabs down into the holes, and the shaft out of the
  //  back carrying a small red propeller. The shaft and propeller sit on a
  //  pivot marked userData.motorShaft, which update() turns about its own
  //  y: the shaft's axis. ──
  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);
    const B = ctx.holeWorld(legs[1].col, legs[1].row);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const along = new THREE.Vector3().subVectors(B, A).setY(0).normalize();
    const R = 0.34, LEN = 0.92, AXIS_H = 0.42;

    // The motor's frame: its axis (local +y) points away from the front of
    // the board, square to the leads; the end cap faces the front.
    let back = new THREE.Vector3(-along.z, 0, along.x);
    if (back.z > 1e-6 || (Math.abs(back.z) < 1e-6 && back.x < 0)) back = back.negate();
    const frame = new THREE.Group();
    frame.position.set(mid.x, AXIS_H, mid.z);
    frame.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), back);
    group.add(frame);

    // The can: a steel cylinder with two flats (squashed across)
    const can = new THREE.Mesh(ctx.lathe([[R * 0.92, -LEN / 2], [R, -LEN / 2 + 0.04], [R, LEN / 2 - 0.05], [R * 0.9, LEN / 2],
                                          [0.12, LEN / 2], [0.1, LEN / 2 + 0.05], [0, LEN / 2 + 0.05]], 40),
                               ctx.mat.surface(0xbcc0c6, { metalness: 0.85, roughness: 0.32 }));
    can.scale.set(1, 1, 0.82);
    can.castShadow = true;
    frame.add(can);
    // The black end cap and its brass tabs
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.97, R * 0.97, 0.14, 40), ctx.mat.surface(0x1d1d1f, { roughness: 0.5 }));
    cap.scale.set(1, 1, 0.82);
    cap.position.y = -LEN / 2 - 0.06;
    frame.add(cap);
    const brass = ctx.mat.surface(0xc9a24a, { metalness: 0.85, roughness: 0.35 });
    const tabs = [];
    for (const s of [-1, 1]) {
      const tab = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.02), brass);
      tab.position.set(s * R * 0.62, -LEN / 2 - 0.18, 0);
      frame.add(tab);
      tabs.push(tab);
    }

    // The shaft out of the back and its propeller, on the spinning pivot
    const pivot = new THREE.Group();
    pivot.position.y = LEN / 2 + 0.05;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.34, 10), ctx.mat.metal());
    shaft.position.y = 0.17;
    pivot.add(shaft);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 16), ctx.mat.surface(0xd8402e, { roughness: 0.45 }));
    hub.position.y = 0.3;
    pivot.add(hub);
    for (const s of [-1, 1]) {
      const blade = new THREE.Mesh(ctx.roundBox(0.34, 0.03, 0.11, 0.012), ctx.mat.surface(0xe04e39, { roughness: 0.45 }));
      blade.position.set(s * 0.19, 0.3, 0);
      blade.rotation.x = s * 0.35;   // the pitch
      pivot.add(blade);
    }
    pivot.userData.motorShaft = true;
    frame.add(pivot);

    // Leads from the tabs, down and out to the holes
    group.updateMatrixWorld(true);
    const ends = tabs.map(tab => tab.getWorldPosition(new THREE.Vector3()));
    if (ends[0].distanceTo(A) > ends[1].distanceTo(A)) ends.reverse();   // each hole takes the tab on its side
    [A, B].forEach((hole, i) => {
      const p = ends[i];
      group.add(ctx.bentLead([p, new THREE.Vector3(p.x, 0.2, p.z), new THREE.Vector3(hole.x, 0.2, hole.z),
                              new THREE.Vector3(hole.x, -0.05, hole.z)], 0.022, 0.06));
    });

    return { group, pinPositions: [new THREE.Vector3(A.x, 0, A.z), new THREE.Vector3(B.x, 0, B.z)] };
  }

  // Turns the shaft at m.speed, reversed with m.direction, while m says
  // spinning; any other reading (or {} on Stop) stops it where it is. The
  // loop ends by itself once the part is redrawn or removed.
  function update(obj, m) {
    const group = obj && obj.group;
    if (!group) return;
    group.traverse(pivot => {
      if (!pivot.userData.motorShaft) return;
      const d = pivot.userData;
      if (d.spinId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(d.spinId);
      d.spinId = null;
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
      const rate = m && m.spinning ? TURN * (m.speed || 0) * (m.direction < 0 ? -1 : 1) : 0;
      if (!raf || !rate) return;
      let last = null;
      const tick = now => {
        if (obj.group !== group) { d.spinId = null; return; }
        if (last !== null) pivot.rotation.y += rate * Math.min(Math.max((now - last) / 1000, 0), 0.1);
        last = now;
        d.spinId = raf(tick);
      };
      d.spinId = raf(tick);
    });
  }

  return {
    type:     'motor',
    name:     'DC Motor',
    sub:      '2 leads · spins, no polarity',
    category: 'I/O',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<circle cx="14" cy="14" r="8" fill="currentColor" fill-opacity="0.1"/><circle cx="14" cy="14" r="8"/>' +
              '<text x="14" y="18" text-anchor="middle" font-size="10" font-family="sans-serif" fill="currentColor" ' +
              'stroke="none">M</text><line x1="1" y1="14" x2="6" y2="14"/><line x1="22" y1="14" x2="27" y2="14"/></svg>',
    prefix:   'M',
    pins:     ['1', '2'],
    place:    { kind: 'span', span: { min: 3, max: 5, default: 4 }, rotations: ['h', 'v'] },
    values:   {
      resistance:   { unit: 'Ω', default: 10,   min: 1,     max: 100 },
      startCurrent: { unit: 'A', default: 0.05, min: 0.001, max: 2 },
    },

    elements: v => [{ kind: 'R', pins: ['1', '2'], ohms: v.resistance }],
    measure,
    warnings,
    line,
    report,

    ai: {
      about:    'A small DC motor: two leads on one row, 3–5 columns apart. About 10 Ω, like a resistor; it spins ' +
                'faster with more current.',
      guide:    'The motor has no polarity: either way round works, and reversing it reverses the spin. Keep it under ' +
                '0.5 A: 9 V straight across is 900 mA, so set the battery to 3 V. To switch it, put place_toggle_switch ' +
                'in series and close it with set_control (closed: true).',
      keywords: ['motor', 'dc motor', 'fan', 'spin'],
      recipe: {
        name:  'The battery at 3 V, + into the switch, the switch into the motor, the motor to ground; closed, it spins at 300 mA',
        parts: [{ type: 'battery', label: 'BAT1', values: { voltage: 3 } },
                { type: 'toggle_switch', label: 'S1', holes: ['b2', 'b4'], controls: { closed: true } },
                { type: 'motor', label: 'M1', holes: ['c4', 'c8'] }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a8', 'tn_8']],
        expect: { S1: { closed: true, current: [299, 301] },
                  M1: { spinning: true, current: [299, 301] } },
      },
    },

    view: { build, update },

    examples: [
      {
        name:  '3 V straight across the motor draws 300 mA: spinning',
        parts: [{ type: 'battery', label: 'BAT1', values: { voltage: 3 } },
                { type: 'motor', label: 'M1', holes: ['b2', 'b6'] }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a6', 'tn_6']],
        expect: { M1: { spinning: true, current: [299.9, 300.1] } },
      },
      {
        name:  '3 V through 90 Ω leaves 0.3 V across the motor: 30 mA, not spinning',
        parts: [{ type: 'battery', label: 'BAT1', values: { voltage: 3 } },
                { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 90 } },
                { type: 'motor', label: 'M1', holes: ['c6', 'c10'] }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a10', 'tn_10']],
        expect: { M1: { spinning: false, current: [29.9, 30.1] } },
      },
    ],
  };
});
