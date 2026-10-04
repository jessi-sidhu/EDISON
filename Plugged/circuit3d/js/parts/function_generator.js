// ─────────────────────────────────────────────────────────────
//  parts/function_generator.js — the function generator (issue #120).
//  The rules are docs/API-CONTRACT.md → "Part file contract" and
//  "Pattern: off-board wave source".
//
//  Off the board, two terminals: 'out' (FG1.0) and 'com' (FG1.1, the
//  ref: ground). One V with a sine wave (offset + amplitude·sin(2π·f·t))
//  from an internal node '#src' to COM, behind 50 Ω to OUT, a real
//  generator's output resistance. The clock (#119) steps the wave; a
//  plain solve reads the offset.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build / view.update) runs only in the browser and draws
//  through ctx. The panel is an OffscreenCanvas texture.
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts.
//  Node:    require('./function_generator.js') (parts/index.js does it).
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const def = Parts.define(factory());
  if (node) module.exports = def;
})(typeof window !== 'undefined' ? window : null, function () {

  const R_OUT = 50;                   // Ω, the output resistance

  const W = 2.6, H = 1.2, D = 1.8;    // body; the pin positions below set where wires attach

  // The panel on the front face, and its canvas (power-of-two sizes, so
  // r128 never has to resize an OffscreenCanvas).
  const PANEL_W = W * 0.8, PANEL_H = H * 0.6;
  const CANVAS_W = 512, CANVAS_H = 256;
  const STRETCH = (PANEL_W / PANEL_H) / (CANVAS_W / CANVAS_H);   // the canvas is drawn this much wider on the panel

  const num  = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  // 1 → "1.0", 0.5 → "0.5", 0.25 → "0.25", 12.5 → "12.5"
  const hz   = f => (f >= 1 ? f.toFixed(1) : String(Number(f.toPrecision(2))));
  const sv   = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + ' V';   // signed volts, a real minus
  const sine = v => `${Number(v.amplitude).toFixed(2)} Vp`;

  // The panel's first row, kept in userData.text: "SINE 1.00 Vp · 1.0 Hz".
  const panelText = v => `SINE ${sine(v)} · ${hz(Number(v.frequency))} Hz`;

  // ── The panel: the set sine, then the present output while running
  //  (the offset otherwise). Drawn squeezed by 1/STRETCH. ──
  function drawPanel(panel, values, vout) {
    const c = panel && panel.userData.canvas;
    if (!c) return;
    const top = panelText(values);
    const rows = [[top, '#5affb0', 108],
                  [vout === null ? `OFFSET ${sv(Number(values.offset) || 0)}` : `OUT ${sv(vout)}`, '#ffd25a', 222]];
    const g = c.getContext('2d');
    const room = CANVAS_W * STRETCH - 40;   // usable width, in drawn units
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#10161c';
    g.fillRect(0, 0, c.width, c.height);
    g.setTransform(1 / STRETCH, 0, 0, 1, 0, 0);
    g.font = 'bold 72px monospace';
    const widest = Math.max(...rows.map(([t]) => g.measureText(t).width));
    g.font = `bold ${Math.floor(72 * Math.min(1, room / widest))}px monospace`;
    for (const [t, colour, y] of rows) {
      g.fillStyle = colour;
      g.fillText(t, 20, y);
    }
    panel.userData.text = top;
    panel.userData.texture.needsUpdate = true;
  }

  // ── The model: a dark blue case with the panel on its front face and
  //  two terminal posts (red OUT, black COM) on the lid ──
  function build(ctx, values) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    const cylinder = (r, h, m) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 14), m);

    const body = box(W, H, D, ctx.mat.body(0x2f4a6b));
    body.position.y = H / 2;
    body.castShadow = true;
    group.add(body);

    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(CANVAS_W, CANVAS_H);
      const texture = new THREE.CanvasTexture(canvas);
      const screen = ctx.mat.label(0xffffff);   // a label material, so the ghost and selection treat it like the rest
      screen.map = texture;
      screen.emissiveMap = texture;
      screen.emissive.setHex(0xffffff);
      screen.emissiveIntensity = 0.6;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), screen);
      panel.position.set(0, H / 2, D / 2 + 0.01);
      panel.name = 'readout';
      panel.userData.canvas = canvas;
      panel.userData.texture = texture;
      group.add(panel);
      drawPanel(panel, values || {}, null);
    }

    // Terminal posts: OUT (left, red), COM (right, black)
    const posts = [[-0.45, 0xdd2222], [0.45, 0x111111]];
    for (const [x, hex] of posts) {
      const post = cylinder(0.12, 0.3, ctx.mat.label(hex));
      post.position.set(x, H + 0.15, D * 0.25);
      group.add(post);
    }

    return {
      group,
      pinPositions: posts.map(([x]) => new THREE.Vector3(x, H + 0.3, D * 0.25)),   // out, com
    };
  }

  // Readings each frame; {} (and r null) on Stop shows the offset again.
  function update(obj, m, r) {
    const group = obj && obj.group;
    if (!group) return;
    const values = (r && r.values) || obj.values || {};
    drawPanel(group.getObjectByName('readout'), values, m && num(m.vout) !== null ? m.vout : null);
  }

  // The present output: V(out) − V(com), null when unconnected.
  function measure(r) {
    const out = num(r.pins.out), com = num(r.pins.com);
    return { vout: out === null || com === null ? null : out - com };
  }

  const setSine = r => `sine ${sine(r.values)} at ${hz(Number(r.values.frequency))} Hz`;
  const offsetText = r => (Number(r.values.offset) ? `, offset ${sv(Number(r.values.offset))}` : '');
  const number = label => String(label || '').replace(/^\D+/, '');

  return {
    type:     'function_generator',
    name:     'Function generator',
    sub:      'sine · 0–10 Vp · 0.1–100 Hz',
    category: 'Sources',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="22" height="16" rx="2" ' +
              'fill="currentColor" fill-opacity="0.1"/><rect x="3" y="6" width="22" height="16" rx="2"/>' +
              '<path d="M6 13c1.5-4 3-4 4.5 0s3 4 4.5 0"/><circle cx="20" cy="11" r="1.3"/>' +
              '<circle cx="10" cy="18.5" r="1.3"/><circle cx="18" cy="18.5" r="1.3"/></svg>',
    prefix:   'FG',
    pins:     ['out', 'com'],
    ref:      'com',
    place:    { kind: 'offboard' },
    values:   {
      amplitude: { unit: 'V',  default: 1, min: 0,   max: 10 },
      frequency: { unit: 'Hz', default: 1, min: 0.1, max: 100 },
      offset:    { unit: 'V',  default: 0, min: -10, max: 10 },
    },

    elements: v => [{ kind: 'V', id: 'src', pins: ['#src', 'com'], volts: v.offset,
                      wave: { kind: 'sine', amp: v.amplitude, freq: v.frequency, offset: v.offset } },
                    { kind: 'R', id: 'rout', pins: ['#src', 'out'], ohms: R_OUT }],
    measure,
    report:   (r, m) => `${setSine(r)}${offsetText(r)}, output now ${m.vout === null ? 'not connected' : sv(m.vout)}`,
    headline: (r, m) => ({
      text: `Function generator ${number(r.label)}: ${setSine(r)}${offsetText(r)}` +
            (num(m.vout) === null ? '' : ` · output ${sv(m.vout)}`),
      cls:  'sim-info',
    }),

    ai: {
      about:    'A function generator beside the board: a sine wave between OUT (FG1.0) and COM (FG1.1, ground), ' +
                'amplitude (peak V) around an offset, at a frequency in Hz, through 50 Ω.',
      keywords: ['sine', 'signal', 'wave', 'function generator', 'oscillate', 'fade', 'breathe'],
      listed:   'in-play',
      guide:    'Wire FG1.0 (OUT) to tp_N (red) and FG1.1 (COM = ground) to tn_N (black). The output swings ' +
                'offset ± amplitude. To fade or breathe an LED: amplitude 5, offset 5 (0–10 V, so the LED is never ' +
                'reversed), frequency 1, then a place_resistor of 470 Ω from tp to the anode of a place_led whose ' +
                'cathode goes to tn.',
      recipe:   {
        name:  'A breathing LED: the generator at 5 Vp, 5 V offset, 1 Hz (0–10 V) into 470 Ω and a red LED',
        parts: [{ type: 'function_generator', label: 'FG1', values: { amplitude: 5, offset: 5, frequency: 1 } },
                { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 470 } },
                { type: 'led', label: 'LED1', holes: ['c8', 'c6'] }],       // cathode c8, anode c6 (toward OUT)
        wires: [['FG1.0', 'tp_63'], ['FG1.1', 'tn_63'], ['tp_3', 'a2'], ['a8', 'tn_8']],
        // A plain solve reads the offset: (5 − 2.0) / 520.1 = 5.8 mA.
        expect: { LED1: { on: true, current: [5.6, 6.0] }, FG1: { vout: [4.6, 4.8] } },
      },
    },

    view: { build, update },

    examples: [
      {
        name:  'A 1 Vp sine with a 2 V offset into 1 kΩ: a plain solve reads the offset through 50 Ω, 1.905 V',
        parts: [{ type: 'function_generator', label: 'FG1', values: { offset: 2 } },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 1000 } }],
        wires: [['FG1.0', 'tp_50'], ['FG1.1', 'tn_50'], ['tp_9', 'b10'], ['b14', 'tn_15']],
        expect: { FG1: { vout: [1.9, 1.91] } },
      },
    ],
  };
});
