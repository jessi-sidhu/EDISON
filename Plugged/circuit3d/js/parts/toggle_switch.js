// ─────────────────────────────────────────────────────────────
//  parts/toggle_switch.js — the on/off toggle switch (SPST), a registry
//  part (issue #32). The rules are docs/API-CONTRACT.md → "Part file
//  contract".
//
//  Two leads, 2 columns apart. Its state is the toggle control `closed`
//  (default false, saved with the circuit), which a click on the model
//  flips while the simulation runs (gestures.click). Unlike the push
//  button it stays where it's left: Stop does not reset it. Electrically
//  one SW: closed (1 mΩ) exactly while closed. The rocker tips over and
//  lights green in view.update.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./toggle_switch.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  // The one current through the part, in mA, as a positive magnitude.
  const through  = r => Math.abs(Object.values(r.current || {})[0] || 0);
  const number   = label => String(label || '').replace(/^\D+/, '');
  const isClosed = r => !!(r && r.controls && r.controls.closed);

  const TILT = 0.16;   // the rocker's lean, in radians: pin 2's end down when on
  const OFF  = { color: 0x3a3d44, emissive: 0x000000, glow: 0 };
  const ON   = { color: 0x33cc55, emissive: 0x115522, glow: 0.7 };

  // ── The model: leads, a dark housing, a rocker on a pivot ──
  //  A flat rocker, so a click on the middle of its top always lands on
  //  it. The pivot is marked userData.isSwitchRocker, with its tilt axis
  //  and the rocker mesh, for update().
  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);
    const B = ctx.holeWorld(legs[1].col, legs[1].row);
    const midX = (A.x + B.x) / 2;
    const midZ = (A.z + B.z) / 2;
    const len = Math.hypot(B.x - A.x, B.z - A.z);
    const dx = len ? (B.x - A.x) / len : 1, dz = len ? (B.z - A.z) / len : 0;   // unit A → B
    const yaw = Math.atan2(-dz, dx);   // a box's long side along A → B
    const long = Math.max(len, 0.8) + 0.12;
    const LEAD_H = 0.30;

    // Upright leads
    for (const p of [A, B]) group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, LEAD_H, p.z), 0.025));

    // Housing
    const body = new THREE.Mesh(new THREE.BoxGeometry(long, 0.26, 0.40), ctx.mat.body(0x222428));
    body.position.set(midX, LEAD_H + 0.13, midZ);
    body.rotation.y = yaw;
    body.castShadow = true;
    group.add(body);

    // The rocker, on a pivot just above the housing; pin 2's end goes down when on
    const on = !!(controls && controls.closed);
    const look = on ? ON : OFF;
    const pivot = new THREE.Group();
    pivot.position.set(midX, LEAD_H + 0.30, midZ);
    const rocker = new THREE.Mesh(new THREE.BoxGeometry(long - 0.16, 0.10, 0.30),
                                  ctx.mat.body(look.color));
    rocker.rotation.y = yaw;
    if (rocker.material.emissive) {
      rocker.material.emissive.setHex(look.emissive);
      rocker.material.emissiveIntensity = look.glow;
    }
    pivot.add(rocker);
    pivot.userData.isSwitchRocker = true;
    pivot.userData.axis   = new THREE.Vector3(dz, 0, -dx);   // +angle sinks B's end, −angle lifts it
    pivot.userData.rocker = rocker;
    pivot.userData.angle  = on ? TILT : -TILT;
    pivot.quaternion.setFromAxisAngle(pivot.userData.axis, pivot.userData.angle);
    group.add(pivot);

    return { group, pinPositions: [new THREE.Vector3(A.x, 0, A.z), new THREE.Vector3(B.x, 0, B.z)] };
  }

  // Rocker down on pin 2's side and green while closed, down on pin 1's
  // side and dark otherwise, eased over 100 ms. The state is r.controls, or
  // the record's own controls when there is no result (Stop, or no
  // readings).
  function update(obj, m, r) {
    const group = obj && obj.group;
    if (!group) return;
    const on = r ? isClosed(r) : !!(obj.controls && obj.controls.closed);
    const target = on ? TILT : -TILT;
    const look = on ? ON : OFF;
    group.traverse(pivot => {
      if (!pivot.userData.isSwitchRocker) return;
      const d = pivot.userData;
      const mat = d.rocker.material;
      mat.color.setHex(look.color);
      if (mat.emissive) {
        mat.emissive.setHex(look.emissive);
        mat.emissiveIntensity = look.glow;
      }
      const start = typeof d.angle === 'number' ? d.angle : target;
      const set = e => {
        d.angle = start + (target - start) * e;
        pivot.quaternion.setFromAxisAngle(d.axis, d.angle);
      };
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
      if (d.animId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(d.animId);
      d.animId = null;
      if (!raf || start === target) { set(1); return; }
      const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const tick = now => {
        const p = Math.min(Math.max((now - t0) / 100, 0), 1);
        set(1 - Math.pow(1 - p, 3));   // ease out cubic
        d.animId = p < 1 ? raf(tick) : null;
      };
      d.animId = raf(tick);
    });
  }

  return {
    type:     'toggle_switch',
    name:     'Toggle Switch',
    sub:      '2 leads · on/off, stays put',
    category: 'I/O',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="5" y="15" width="18" height="8" rx="1.5" fill="currentColor" fill-opacity="0.1"/>' +
              '<rect x="5" y="15" width="18" height="8" rx="1.5"/>' +
              '<line x1="14" y1="15" x2="19" y2="6"/><circle cx="19" cy="6" r="2" fill="currentColor"/>' +
              '<line x1="9" y1="23" x2="9" y2="27"/><line x1="19" y1="23" x2="19" y2="27"/></svg>',
    prefix:   'S',
    pins:     ['1', '2'],
    place:    { kind: 'span', span: { min: 2, max: 2, default: 2 }, rotations: ['h', 'v'] },
    controls: { closed: { type: 'toggle', default: false, saved: true } },
    gestures: { click: 'closed' },

    elements: (v, c) => [{ kind: 'SW', pins: ['1', '2'], closed: !!(c && c.closed) }],
    measure:  r => ({ closed: isClosed(r), current: through(r) }),
    report:   (r, m) => (m.closed ? `ON · ${m.current.toFixed(1)} mA` : 'OFF'),
    headline: r => (isClosed(r)
      ? { text: `Switch ${number(r.label)}: 🟢 ON (closed)`, cls: 'sim-on' }
      : { text: `Switch ${number(r.label)}: ⭕ OFF (open) — click to flip`, cls: 'sim-info' }),

    ai: {
      about:    'An on/off toggle switch (SPST): two leads on one row, exactly 2 columns apart. It starts open (off) ' +
                'and stays where it is left.',
      guide:    'The switch starts open (off). After placing and wiring it, close it with set_control ' +
                '(closed: true) so the LED lights. The student can click it while the simulation runs to flip it off and on.',
      keywords: ['switch', 'toggle', 'on/off', 'spst'],
      recipe: {
        name:  '+ into the switch, the switch through 470 Ω to a red LED, LED to ground; closed, the LED lights',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'toggle_switch', label: 'S1', holes: ['b2', 'b4'], controls: { closed: true } },
                { type: 'resistor', label: 'R1', holes: ['c4', 'c8'], values: { resistance: 470 } },
                { type: 'led', label: 'LED1', holes: ['d10', 'd8'], values: { color: 'red' } }],   // cathode d10, anode d8
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a10', 'tn_10']],
        expect: { S1: { closed: true, current: [14.8, 15.0] }, LED1: { on: true, current: [14.8, 15.0] } },
      },
    },

    view: { build, update },

    examples: [
      {
        name:  'Closed, the switch lights the LED: 14.9 mA through it',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'toggle_switch', label: 'S1', holes: ['b2', 'b4'], controls: { closed: true } },
                { type: 'resistor', label: 'R1', holes: ['c4', 'c8'], values: { resistance: 470 } },
                { type: 'led', label: 'LED1', holes: ['d10', 'd8'], values: { color: 'red' } }],   // cathode d10, anode d8
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a10', 'tn_10']],
        expect: { S1: { closed: true, current: [14.8, 15.0] }, LED1: { on: true } },
      },
      {
        name:  'Open, the switch leaves the LED circuit open',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'toggle_switch', label: 'S1', holes: ['b2', 'b4'] },
                { type: 'resistor', label: 'R1', holes: ['c4', 'c8'], values: { resistance: 470 } },
                { type: 'led', label: 'LED1', holes: ['d10', 'd8'], values: { color: 'red' } }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a10', 'tn_10']],
        expect: { S1: { closed: false, current: 0 }, LED1: { on: false } },
      },
    ],
  };
});
