// ─────────────────────────────────────────────────────────────
//  parts/buzzer.js — the active buzzer, a registry part (issue #26).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Two leads, 2 columns apart. Electrically one fixed 42 Ω R; it sounds
//  from 1 mA. The tone starts and stops in view.update, after each
//  simulation (and with {} on Stop).
//
//  The definition half is pure: no THREE, no page, no audio at load. The
//  view half (view.build / view.update) runs only in the browser.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./buzzer.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const OHMS      = 42;   // coil resistance: about 17.6 mA behind 470 Ω on 9 V
  const SOUND_MA  = 1;    // sounds from 1 mA

  // The one current through the part, in mA, as a positive magnitude.
  const through = r => Math.abs(Object.values(r.current)[0] || 0);

  function measure(r) {
    const current = through(r);
    return { sounding: current >= SOUND_MA, current };
  }

  // ── The model: two leads, stubs, a dark cylinder, +/− marks ──
  //  legs[0] = lead1 (−), legs[1] = lead2 (+).
  function build(ctx, values, controls, legs) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const A = ctx.holeWorld(legs[0].col, legs[0].row);
    const B = ctx.holeWorld(legs[1].col, legs[1].row);
    const ax = A.x, az = A.z, bx = B.x, bz = B.z;
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;
    const LEAD_H  = 0.70;
    const BODY_R  = 0.28;
    const isHoriz = Math.abs(az - bz) < 0.01;

    // Upright leads
    for (const p of [A, B]) group.add(ctx.lead(new THREE.Vector3(p.x, 0, p.z), new THREE.Vector3(p.x, LEAD_H, p.z)));

    // Stubs from the lead tops to the body edge
    const stub = (from, to) => { if (from.distanceTo(to) > 0.01) group.add(ctx.lead(from, to)); };
    if (isHoriz) {
      stub(new THREE.Vector3(ax, LEAD_H, az), new THREE.Vector3(midX + Math.sign(ax - midX) * BODY_R, LEAD_H, az));
      stub(new THREE.Vector3(bx, LEAD_H, bz), new THREE.Vector3(midX + Math.sign(bx - midX) * BODY_R, LEAD_H, bz));
    } else {
      stub(new THREE.Vector3(ax, LEAD_H, az), new THREE.Vector3(ax, LEAD_H, midZ + Math.sign(az - midZ) * BODY_R));
      stub(new THREE.Vector3(bx, LEAD_H, bz), new THREE.Vector3(bx, LEAD_H, midZ + Math.sign(bz - midZ) * BODY_R));
    }

    // Body and the dark membrane on top
    const body = new THREE.Mesh(new THREE.CylinderGeometry(BODY_R, BODY_R, 0.45, 18), ctx.mat.body(0x222222));
    body.position.set(midX, LEAD_H + 0.225, midZ);
    body.castShadow = true;
    group.add(body);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.06, 18), ctx.mat.body(0x111111));
    top.position.set(midX, LEAD_H + 0.48, midZ);
    group.add(top);

    // "+" by lead2, "−" by lead1
    for (const [w, d] of [[0.04, 0.16], [0.16, 0.04]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.01, d), ctx.mat.label(0xff4444));
      m.position.set(bx, 0.03, bz);
      group.add(m);
    }
    const minus = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.01, 0.04), ctx.mat.label(0x4466ff));
    minus.position.set(ax, 0.03, az);
    group.add(minus);

    return { group, pinPositions: [new THREE.Vector3(ax, 0, az), new THREE.Vector3(bx, 0, bz)] };
  }

  // ── The tone: a low square wave while it sounds ──
  let audio = null;
  const tones = new WeakMap();   // placed record → { osc, gain }

  function audioContext() {
    if (audio) return audio;
    const w = typeof window !== 'undefined' ? window : null;
    const Ctx = w && (w.AudioContext || w.webkitAudioContext);
    if (Ctx) audio = new Ctx();
    return audio;
  }

  function startTone(obj) {
    try {
      const ctx  = audioContext();
      if (!ctx) return;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 220;   // low, buzzy tone
      gain.gain.value = 0.12;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      tones.set(obj, { osc, gain });
    } catch {}
  }

  function stopTone(obj) {
    const tone = tones.get(obj);
    tones.delete(obj);
    try {
      tone.gain.gain.setTargetAtTime(0, audio.currentTime, 0.02);
      setTimeout(() => { try { tone.osc.stop(); } catch {} }, 80);
    } catch {}
  }

  // Sound while measure() says so; quiet otherwise (m is {} on Stop).
  function update(obj, m) {
    if (!obj) return;
    const on = !!(m && m.sounding);
    if (on && !tones.has(obj)) startTone(obj);
    else if (!on && tones.has(obj)) stopTone(obj);
  }

  return {
    type:     'buzzer',
    name:     'Buzzer',
    sub:      '2 leads · active',
    category: 'I/O',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><ellipse cx="14" cy="9" rx="9" ry="3"/>' +
              '<line x1="5" y1="9" x2="5" y2="18"/><line x1="23" y1="9" x2="23" y2="18"/>' +
              '<path d="M5 18 A9 3 0 0 0 23 18" fill="currentColor" fill-opacity="0.1"/><path d="M5 18 A9 3 0 0 0 23 18"/>' +
              '<line x1="11" y1="9" x2="13.5" y2="9" stroke-width="1.3"/>' +
              '<line x1="12.2" y1="7.8" x2="12.2" y2="10.2" stroke-width="1.3"/>' +
              '<line x1="10" y1="21" x2="10" y2="26"/><line x1="18" y1="21" x2="18" y2="26"/></svg>',
    prefix:   'BZ',
    pins:     ['lead1', 'lead2'],
    place:    { kind: 'span', span: { min: 2, max: 2, default: 2 }, rotations: ['h', 'v'] },

    elements: () => [{ kind: 'R', pins: ['lead1', 'lead2'], ohms: OHMS }],
    measure,
    report:   (r, m) => `buzzer ${m.sounding ? 'ON (sounding)' : 'OFF (silent)'}, ${m.current.toFixed(1)} mA`,
    line:     (r, m) => (m.sounding ? { text: `  🔔 BUZZER ON  (${m.current.toFixed(1)} mA)`, cls: 'sim-on' } : null),

    ai: {
      about:    'A buzzer: two leads on one row, exactly 2 columns apart. Sounds when current flows through it; ' +
                'put a resistor in series.',
      keywords: ['buzzer', 'beep', 'sound', 'alarm', 'noise', 'tone'],
      everyday: true,
      guide:    'Put a resistor in series with the buzzer (place_resistor). Each part shares a column with the next, or no ' +
                'current flows: resistor b{C}–b{C+4}, buzzer c{C+4}–c{C+6}, wires tp_{C+1} -> a{C} and a{C+6} -> tn_{C+6}. ' +
                'With a button first: button b{C}–b{C+3}, resistor c{C+3}–c{C+7}, buzzer d{C+7}–d{C+9}, ' +
                'wires tp_{C+1} -> a{C} and a{C+9} -> tn_{C+9}.',
    },

    view: { build, update },

    examples: [
      {
        name:  'A buzzer behind 470 Ω on 9 V sounds at about 17.6 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['b4', 'b8'] },
                { type: 'buzzer', label: 'BZ1', holes: ['c8', 'c10'] }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_3', 'a4'], ['a10', 'tn_10']],
        expect: { BZ1: { sounding: true, current: [17.5, 17.7] } },
      },
      {
        name:  'A buzzer with no way back to the battery stays silent',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['b4', 'b8'] },
                { type: 'buzzer', label: 'BZ1', holes: ['c8', 'c10'] }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_3', 'a4']],
        expect: { BZ1: { sounding: false } },
      },
    ],
  };
});
