// ─────────────────────────────────────────────────────────────
//  parts/multimeter.js — the multimeter, a registry part (issue #96).
//  The rules are docs/API-CONTRACT.md → "Part file contract".
//
//  Off the board, like the battery. Two probes, 'red' (MM1.red) and
//  'black' (MM1.black), each a wire end, so a probe goes in any hole.
//  A mode value picks what it is to the circuit:
//    V  one R of 10 MΩ red–black: reads V(red) − V(black)
//    A  one R of 0.1 Ω: reads mA red → black; FUSE above 10 A, so an
//       ammeter wired in parallel (across the battery) blows it
//    Ω  nothing: the main solve doesn't read ohms. ohms() does, on a copy
//       of the board, and only with the probes' circuit unpowered.
//  The AI places it (#123): its tool goes when a request names a meter.
//
//  The definition half is pure: no THREE, no page. The view half
//  (view.build) runs only in the browser; tools/meter-display.js (#97)
//  is its screen, and hands the model's LCD the same reading (view.show).
//
//  LOADING
//  ───────
//  Browser: a <script> after parts/registry.js; defines on window.Parts,
//           and ohms() is window.Multimeter.ohms.
//  Node:    require('./multimeter.js') (parts/index.js does it) gives the
//           definition's fields plus ohms().
// ─────────────────────────────────────────────────────────────

(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const Parts = node ? require('./registry.js') : root.Parts;
  const { def, ohms } = factory();
  Parts.define(def);
  if (node) module.exports = Object.assign({ ohms }, def);
  else root.Multimeter = { ohms };
})(typeof window !== 'undefined' ? window : null, function () {

  const V_OHMS    = 10e6;    // V mode: the meter's input resistance
  const A_OHMS    = 0.1;     // A mode: the shunt
  const FUSE_MA   = 10000;   // A mode: the fuse blows above 10 A
  const TEST_AMPS = 0.001;   // Ω mode: the test current ohms() pushes

  const UNIT = { V: 'V', A: 'mA', 'Ω': 'Ω' };

  function elements(v) {
    if (v.mode === 'A') return [{ kind: 'R', pins: ['red', 'black'], ohms: A_OHMS }];
    if (v.mode === 'Ω') return [];
    return [{ kind: 'R', pins: ['red', 'black'], ohms: V_OHMS }];
  }

  // V: volts red − black (a probe in no powered circuit reads 0 V).
  // A: mA through the shunt, + from red to black. Ω: '--', see ohms().
  function measure(r) {
    const mode = r.values.mode;
    if (mode === 'Ω') return { mode, reading: '--', unit: UNIT[mode], fuse: false };
    if (mode === 'A') {
      const mA = r.current[0] || 0;
      return { mode, reading: mA, unit: UNIT[mode], fuse: Math.abs(mA) > FUSE_MA };
    }
    return { mode, reading: (r.pins.red ?? 0) - (r.pins.black ?? 0), unit: UNIT[mode], fuse: false };
  }

  // The display: '4.50 V', '14.9 mA', 'FUSE', '-- Ω'.
  function shown(m) {
    if (m.fuse) return 'FUSE';
    if (m.mode === 'V') return `${m.reading.toFixed(2)} V`;
    if (m.mode === 'A') return `${m.reading.toFixed(1)} mA`;
    return '-- Ω';
  }

  const number = label => String(label || '').replace(/^\D+/, '');

  // The reading is a headline, not a line(): a headline is shown on every
  // path, the short circuit an ammeter across the battery makes included,
  // so FUSE always shows. With no solve (m is {}) it names the mode.
  const headline = (r, m) => ({
    text: `Multimeter ${number(r.label)}: ${m.mode ? shown(m) : r.values.mode + ' mode'}`,
    cls:  m.fuse ? 'sim-err' : 'sim-info',
  });

  // Ohms between the probes of meter `label`: the board copied with the
  // meter swapped for a 1 mA current source, out of red and back into
  // black, and V / I read off it. A source anywhere in the probes'
  // circuit (joined by wires or any part's elements) would spoil the
  // reading, so it refuses; a source on a separate circuit doesn't matter.
  function ohms(components, wires, label) {
    const Sim = typeof module === 'object' && module.exports ? require('../simulate.js') : window.Sim;
    const meter = components.find(c => c.label === label);

    const graph = Sim.buildGraph(components, wires);
    const uf = new Sim.UnionFind();
    graph.forEach(g => g.part && g.part.els.forEach(e => e.nodes.forEach(n => uf.union(e.nodes[0], n))));
    const probes = graph.find(g => g.comp === meter).nodes.map(n => uf.find(n));
    const powered = graph.some(g => g.part && g.part.def.ref !== undefined && g.nodes.some(n => probes.includes(uf.find(n))));
    if (powered) return { reading: '--', unit: 'Ω', why: 'Ω mode reads with the power off: turn the power off first' };

    // current_source pins are [from, to] and its current leaves `to`: so
    // pin 0 (from) takes the meter's black wires and pin 1 (to) its red.
    const probe = { type: 'current_source', label, pins: meter.pins, values: { current: TEST_AMPS } };
    const swap = c => (c === meter ? probe : c);
    const flip = (c, i) => (c === meter ? 1 - i : i);
    const copy = wires.map(w => Object.assign({}, w, {
      startComp: swap(w.startComp), startPinIdx: flip(w.startComp, w.startPinIdx),
      endComp:   swap(w.endComp),   endPinIdx:   flip(w.endComp, w.endPinIdx),
    }));
    const result = Sim.analyze(components.map(swap), copy);
    const m = result.status === 'ok' && result.parts[label] ? result.parts[label].m : null;
    if (!m || m.voltage == null) return { reading: 'OL', unit: 'Ω' };   // no path between the probes
    return { reading: m.voltage / TEST_AMPS, unit: 'Ω' };
  }

  // ── The model: a yellow handheld meter propped on its stand beside the board ──
  //  A rubber holster round a charcoal face: the LCD at the top end, the
  //  rotary dial in the middle with its positions printed round it (the
  //  pointer sits on V, A or Ω), and the red and black probe sockets at
  //  the bottom end, whose tops are the pins. The probes are the wires
  //  drawn from those sockets (MM1.red / MM1.black). The meter is drawn
  //  face up in `frame`, tipped back on its stand, then every piece is
  //  moved to the model's own group: the dial is its only nested group
  //  (tools/meter-display.js turns the mode on a click inside it), every
  //  other piece a direct child. While simulating the LCD shows the
  //  meter's own reading (show).
  const DIAL = { V: -0.6, A: 0, 'Ω': 0.6 };   // pointer angle per mode, radians

  const W = 2.5, D = 3.6, T = 0.6;     // the holster: width, length (top end at −z), thickness
  const RIM = 0.2;                     // the holster's lip round the face
  const FACE = T - 0.07;               // the face, recessed below the lip
  const TILT = 0.26;                   // tipped back on the stand, the LCD end up
  const LCD = { z: -1.02, w: 1.62, d: 0.74 };
  const DIAL_Z = 0.36, KNOB_R = 0.44, MARKS_R = 0.7;
  const SOCKET_Z = 1.26;
  const SOCKETS = [[0.36, 0xc8161d], [0.8, 0x141416]];   // red, black: x, colour
  const HOLD_X = -0.74;

  // A rounded rectangle's outline (x, z), each corner a quarter circle, no point repeated.
  function outline(THREE, w, d, r) {
    const x = w / 2 - r, z = d / 2 - r, pts = [];
    for (const [cx, cz, a0] of [[x, -z, -Math.PI / 2], [x, z, 0], [-x, z, Math.PI / 2], [-x, -z, Math.PI]]) {
      for (let i = 0; i <= 6; i++) {
        const a = a0 + (i / 6) * Math.PI / 2;
        pts.push(new THREE.Vector2(cx + r * Math.cos(a), cz + r * Math.sin(a)));
      }
    }
    return pts;
  }

  // ── The LCD: seven-segment digits on a grey-green ground ──
  const SEGS = { 0: 0x3f, 1: 0x06, 2: 0x5b, 3: 0x4f, 4: 0x66, 5: 0x6d, 6: 0x7d, 7: 0x07, 8: 0x7f, 9: 0x6f,
                 '-': 0x40, O: 0x3f, L: 0x38, F: 0x71, U: 0x3e, S: 0x6d, E: 0x79 };
  const LCD_UNIT = { V: 'V', A: 'mA', 'Ω': 'Ω' };

  // What the LCD shows for the panel's own text (meter-display's reading():
  // '7.00 V', '14.9 mA', 'FUSE', '1.00 kΩ', 'OL', '--'): its number and unit.
  function lcdShows(mode, text) {
    const unit = LCD_UNIT[mode] || 'V', dc = mode !== 'Ω';
    const t = String(text == null ? '--' : text).trim();
    if (t === 'FUSE') return { text: 'FUSE', unit: '', dc: false };
    if (t === 'OL') return { text: 'OL', unit, dc };
    const n = /^(-?[\d.]+)\s*(\S+)$/.exec(t);
    if (n) return { text: n[1], unit: n[2], dc };
    return { text: '----', unit, dc };
  }

  // A pointed bar from (x1, y1) to (x2, y2), level or upright, slanted by k.
  function segment(g, x1, y1, x2, y2, th, base, k) {
    const e = th / 2;
    const pts = y1 === y2
      ? [[x1, y1], [x1 + e, y1 - e], [x2 - e, y1 - e], [x2, y1], [x2 - e, y1 + e], [x1 + e, y1 + e]]
      : [[x1, y1], [x1 + e, y1 + e], [x1 + e, y2 - e], [x1, y2], [x1 - e, y2 - e], [x1 - e, y1 + e]];
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x + (base - y) * k, y) : g.moveTo(x + (base - y) * k, y)));
    g.closePath();
    g.fill();
  }

  function drawLcd(g, Wc, Hc, s) {
    g.clearRect(0, 0, Wc, Hc);
    const ground = g.createLinearGradient(0, 0, 0, Hc);
    ground.addColorStop(0, '#525b4c');
    ground.addColorStop(0.1, '#717b69');
    ground.addColorStop(1, '#7b8572');
    g.fillStyle = ground;
    g.fillRect(0, 0, Wc, Hc);
    const ink = '#0e120f';
    const font = (wt, px) => `${wt} ${Math.round(px)}px "Helvetica Neue", Arial, sans-serif`;

    // Annunciators: AUTO, and DC (a bar over three dashes) in V and A
    g.fillStyle = ink;
    g.font = font(700, Hc * 0.12);
    g.textBaseline = 'top';
    g.fillText('AUTO', Wc * 0.04, Hc * 0.08);
    if (s.dc) {
      const x = Wc * 0.045, y = Hc * 0.3, w = Wc * 0.075, t = Hc * 0.025;
      g.fillRect(x, y, w, t);
      for (let i = 0; i < 3; i++) g.fillRect(x + i * w * 0.38, y + t * 2.2, w * 0.24, t);
    }

    // The digits, right-aligned in four (or more) cells; a minus sits left of them
    let text = s.text, neg = false;
    if (/^-\d/.test(text)) { neg = true; text = text.slice(1); }
    const cells = [];
    for (const ch of text) {
      if (ch === '.' && cells.length) cells[cells.length - 1].dp = true;
      else cells.push({ bits: SEGS[ch] || 0, dp: false });
    }
    while (cells.length < 4) cells.unshift({ bits: 0, dp: false });
    const x0 = Wc * 0.15, x1 = Wc * 0.8, p = (x1 - x0) / cells.length;
    const w = p * 0.66, h = Hc * 0.52, y0 = Hc * 0.26, th = Math.min(h * 0.12, w * 0.21), gap = th * 0.28, k = 0.08, base = y0 + h;
    const mid = y0 + h / 2;
    const bars = dx => [
      [dx + gap, y0, dx + w - gap, y0], [dx + w, y0 + gap, dx + w, mid - gap], [dx + w, mid + gap, dx + w, base - gap],
      [dx + gap, base, dx + w - gap, base], [dx, mid + gap, dx, base - gap], [dx, y0 + gap, dx, mid - gap],
      [dx + gap, mid, dx + w - gap, mid],
    ];
    cells.forEach((c, i) => {
      const dx = x0 + i * p;
      bars(dx).forEach((b, bit) => {
        g.fillStyle = c.bits & (1 << bit) ? ink : 'rgba(14, 18, 15, 0.08)';   // unlit segments show faintly
        segment(g, b[0], b[1], b[2], b[3], th, base, k);
      });
      g.fillStyle = c.dp ? ink : 'rgba(14, 18, 15, 0.08)';
      g.fillRect(dx + w + th * 0.8, base - th, th, th);
    });
    if (neg) { g.fillStyle = ink; segment(g, x0 - p * 0.55, mid, x0 - p * 0.12, mid, th, base, k); }

    // The unit
    g.fillStyle = ink;
    g.textBaseline = 'alphabetic';
    let px = Hc * 0.42;
    g.font = font(600, px);
    const room = Wc * 0.97 - (x1 + p * 0.1);
    const wide = g.measureText(s.unit).width;
    if (wide > room) { px *= room / wide; g.font = font(600, px); }
    g.fillText(s.unit, x1 + p * 0.1, base);
  }

  // The dial's positions round the knob: [angle (as DIAL), what]. Only V, A
  // and Ω are this meter's modes; the rest are printed, as on a real dial.
  const STOPS = [[-1.95, 'beep'], [-1.27, 'V~'], [DIAL.V, 'V'], [DIAL.A, 'A'], [DIAL['Ω'], 'Ω'], [1.27, 'diode'], [1.95, 'Hz'],
                 [Math.PI, 'OFF']];

  // The face's printing: the dial's positions and the labels by the sockets
  // and the hold button. The print spans x ±pw/2 and z from z0 to z0 + pd.
  function drawFace(g, Wc, Hc, mode, pw, z0) {
    const s = Wc / pw, X = x => (x + pw / 2) * s, Z = z => (z - z0) * s;
    const cx = X(0), cz = Z(DIAL_Z);
    const font = (wt, u) => `${wt} ${Math.round(u * s)}px "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineCap = 'round';
    for (const [a, what] of STOPS) {
      const ours = Object.hasOwn(DIAL, what), on = what === mode;
      const colour = on ? '#f4c21a' : ours ? '#eef0f2' : '#8c9096';
      const at = r => [cx + Math.sin(a) * r * s, cz - Math.cos(a) * r * s];
      g.strokeStyle = colour;
      g.lineWidth = 0.018 * s;
      g.beginPath();
      g.moveTo(...at(KNOB_R + 0.07));
      g.lineTo(...at(KNOB_R + 0.13));
      g.stroke();
      const [lx, lz] = at(MARKS_R + (ours ? 0.04 : 0));
      g.fillStyle = colour;
      g.strokeStyle = colour;
      g.lineWidth = 0.014 * s;
      if (what === 'beep') {
        g.beginPath();
        g.arc(lx - 0.05 * s, lz, 0.016 * s, 0, Math.PI * 2);
        g.fill();
        for (const r of [0.04, 0.07]) { g.beginPath(); g.arc(lx - 0.05 * s, lz, r * s, -0.7, 0.7); g.stroke(); }
      } else if (what === 'diode') {
        const u = 0.05 * s;
        g.beginPath();
        g.moveTo(lx - u, lz - u); g.lineTo(lx - u, lz + u); g.lineTo(lx + u * 0.6, lz); g.closePath();
        g.fill();
        g.fillRect(lx + u * 0.6, lz - u, 0.014 * s, 2 * u);
      } else if (what === 'V') {
        g.font = font(700, ours ? 0.17 : 0.11);
        g.fillText('V', lx - 0.04 * s, lz);
        g.fillRect(lx + 0.03 * s, lz - 0.05 * s, 0.09 * s, 0.014 * s);            // DC: a bar over dashes
        for (let i = 0; i < 3; i++) g.fillRect(lx + (0.03 + i * 0.034) * s, lz - 0.015 * s, 0.022 * s, 0.014 * s);
      } else {
        g.font = font(700, ours ? 0.17 : what === 'OFF' ? 0.09 : 0.11);
        g.fillText(what, lx, lz);
      }
    }
    g.fillStyle = '#c9ccd0';
    g.font = font(600, 0.07);
    g.fillText('VΩmA', X(SOCKETS[0][0]), Z(SOCKET_Z + 0.215));
    g.fillText('COM', X(SOCKETS[1][0]), Z(SOCKET_Z + 0.215));
    g.fillText('HOLD', X(HOLD_X), Z(SOCKET_Z + 0.215));
  }

  function build(ctx, values) {
    const THREE = ctx.THREE;
    const group = new THREE.Group();
    const frame = new THREE.Group();       // face up, then tipped back
    const mode = values && values.mode;
    const put = (geo, mat, x, y, z, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      (parent || frame).add(m);
      return m;
    };

    // The holster: a yellow rubber ring, its lip standing proud of the face,
    // with a yellow back under the meter
    const BEV = 0.07;
    const ring = new THREE.Shape(outline(THREE, W - 2 * BEV, D - 2 * BEV, 0.36));
    ring.holes.push(new THREE.Path(outline(THREE, W - 2 * RIM + 2 * BEV, D - 2 * RIM + 2 * BEV, 0.2)));
    const ringGeo = new THREE.ExtrudeGeometry(ring, { depth: T - 2 * BEV, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV,
                                                      bevelSegments: 4, curveSegments: 6 });
    ringGeo.rotateX(-Math.PI / 2);
    ringGeo.translate(0, BEV, 0);
    const yellow = ctx.mat.surface(0x9c6800, { roughness: 0.6, clearcoat: 0.2, clearcoatRoughness: 0.45 });
    put(ringGeo, yellow, 0, 0, 0).castShadow = true;
    put(ctx.roundBox(W - 2 * RIM - 0.04, 0.08, D - 2 * RIM - 0.04, 0.03), yellow, 0, 0.04, 0);

    // The meter itself: a charcoal case whose top is the face
    const body = put(ctx.roundBox(W - 2 * RIM + 0.06, FACE - 0.06, D - 2 * RIM + 0.06, 0.08),
                     ctx.mat.surface(0x161719, { roughness: 0.7, clearcoat: 0.1 }), 0, 0.06 + (FACE - 0.06) / 2, 0);
    body.castShadow = true;

    // The LCD: a dark bezel, the reading (a canvas show() repaints) and a glass sheen
    put(ctx.roundBox(LCD.w + 0.2, 0.05, LCD.d + 0.2, 0.06), ctx.mat.surface(0x1d1e21, { roughness: 0.4, clearcoat: 0.5 }),
        0, FACE + 0.015, LCD.z);
    const shows = lcdShows(mode, '--');
    const lcd = put(new THREE.PlaneGeometry(LCD.w, LCD.d),
                    ctx.ghost ? ctx.mat.surface(0x7b8572)
                              : ctx.mat.surface(0xc4cabd, { map: ctx.paint(680, 310, (g, Wc, Hc) => drawLcd(g, Wc, Hc, shows)), roughness: 0.5 }),
                    0, FACE + 0.042, LCD.z);
    lcd.rotation.x = -Math.PI / 2;
    if (!ctx.ghost) {
      lcd.userData.meterLcd = JSON.stringify(shows);   // what it shows: show() repaints it
      const glass = put(new THREE.PlaneGeometry(LCD.w, LCD.d),
                        ctx.mat.surface(0xffffff, { roughness: 0.06, clearcoat: 1, opacity: 0.1, depthWrite: false }), 0, FACE + 0.046, LCD.z);
      glass.rotation.x = -Math.PI / 2;
    }

    // The face's printing round the dial and by the sockets
    const PW = W - 2 * RIM - 0.02, Z0 = LCD.z + LCD.d / 2 + 0.12, PD = D / 2 - RIM - Z0;
    if (!ctx.ghost) {
      const marks = ctx.print(PW, PD, (g, Wc, Hc) => drawFace(g, Wc, Hc, mode, PW, Z0), 480);
      marks.position.set(0, FACE + 0.002, Z0 + PD / 2);
      frame.add(marks);
    }

    // The dial: a black well, and in it the knob (a disc with a grip bar
    // across it, its white end the pointer) turned to the mode
    put(new THREE.CylinderGeometry(KNOB_R + 0.05, KNOB_R + 0.06, 0.02, 64), ctx.mat.surface(0x151618, { roughness: 0.5 }),
        0, FACE + 0.008, DIAL_Z);
    const dial = new THREE.Group();
    dial.position.set(0, FACE, DIAL_Z);
    const black = ctx.mat.surface(0x17181a, { roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    const disc = put(ctx.lathe([[0, 0], [KNOB_R, 0], [KNOB_R, 0.09], [KNOB_R - 0.02, 0.115], [KNOB_R - 0.05, 0.125], [0, 0.125]], 72),
                     black, 0, 0.012, 0, dial);
    disc.castShadow = true;
    const grip = put(ctx.roundBox(0.3, 0.11, KNOB_R * 2 - 0.04, 0.05), ctx.mat.surface(0x1e1f22, { roughness: 0.38, clearcoat: 0.45 }),
                     0, 0.17, 0, dial);
    grip.castShadow = true;
    put(ctx.roundBox(0.06, 0.012, KNOB_R * 0.62, 0.005), ctx.mat.surface(0xf1f2f3, { roughness: 0.4 }), 0, 0.226, -KNOB_R * 0.55, dial);
    dial.rotation.y = -(DIAL[mode] || 0);
    frame.add(dial);

    // The probe sockets: a coloured shroud round a dark hole with a bright metal contact
    const metal = ctx.mat.surface(0xc9ccd1, { metalness: 0.9, roughness: 0.28 });
    const dark  = ctx.mat.surface(0x060606, { roughness: 0.9 });
    for (const [x, hex] of SOCKETS) {
      put(ctx.lathe([[0.155, 0], [0.16, 0.05], [0.15, 0.1], [0.135, 0.11], [0.095, 0.11], [0.088, 0.09], [0.088, 0.02]], 40),
          ctx.mat.surface(hex, { roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide }), x, FACE, SOCKET_Z)
        .castShadow = true;
      put(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 32), dark, x, FACE + 0.045, SOCKET_Z);
      put(ctx.lathe([[0.036, 0], [0.052, 0], [0.052, 0.085], [0.036, 0.085]], 24), metal, x, FACE, SOCKET_Z);
    }

    // The hold button: orange, in a dark collar
    put(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 36), ctx.mat.surface(0x1b1c1e, { roughness: 0.5 }), HOLD_X, FACE + 0.015, SOCKET_Z);
    put(ctx.lathe([[0.1, 0], [0.1, 0.05], [0.085, 0.075], [0, 0.08]], 32),
        ctx.mat.surface(0xe0640c, { roughness: 0.35, clearcoat: 0.5 }), HOLD_X, FACE + 0.02, SOCKET_Z);

    // Tip it back: the bottom end on the table, centred where it stands
    frame.rotation.x = TILT;
    frame.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(frame);
    frame.position.set(0, -box.min.y, -(box.min.z + box.max.z) / 2);
    frame.updateMatrixWorld(true);
    const pinPositions = SOCKETS.map(([x]) => new THREE.Vector3(x, FACE + 0.13, SOCKET_Z).applyMatrix4(frame.matrixWorld));
    for (const o of frame.children.slice()) group.attach(o);

    // The stand: a dark bail, two struts from a pivot on the back near the
    // top end down to a bar on the table
    const bail = ctx.mat.surface(0x232427, { roughness: 0.55, clearcoat: 0.2 });
    const hinge = new THREE.Vector3(0, 0.02, -D / 2 + 0.75).applyMatrix4(frame.matrixWorld);
    const foot = new THREE.Vector3(0, 0.05, hinge.z - 0.45);
    const along = foot.clone().sub(hinge);
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), along.clone().normalize());
    for (const x of [-0.66, 0.66]) {
      const strut = put(ctx.roundBox(0.12, 0.05, along.length(), 0.02), bail, x, (hinge.y + foot.y) / 2, (hinge.z + foot.z) / 2, group);
      strut.quaternion.copy(turn);
      strut.castShadow = true;
    }
    put(ctx.roundBox(1.44, 0.1, 0.12, 0.04), bail, 0, foot.y, foot.z, group).castShadow = true;
    put(new THREE.CylinderGeometry(0.045, 0.045, 1.44, 12), bail, 0, hinge.y, hinge.z, group).rotation.z = Math.PI / 2;

    return { group, pinPositions };
  }

  // Paints the LCD with the panel's reading, r = { text }: tools/meter-display.js
  // calls it for every meter on each run (a short's FUSE and Ω mode included)
  // and with '--' on Stop, so the LCD and #meter-reading always agree. A
  // canvas is repainted only when what it shows changes.
  function show(obj, r) {
    const group = obj && obj.group;
    if (!group) return;
    const s = lcdShows((obj.values && obj.values.mode) || 'V', r && r.text);
    const key = JSON.stringify(s);
    group.traverse(o => {
      if (typeof o.userData.meterLcd !== 'string' || o.userData.meterLcd === key) return;
      const tex = o.material && o.material.map;
      if (!tex || !tex.image) return;
      drawLcd(tex.image.getContext('2d'), tex.image.width, tex.image.height, s);
      tex.needsUpdate = true;
      o.userData.meterLcd = key;
    });
  }

  const def = {
    type:     'multimeter',
    name:     'Multimeter',
    sub:      'V · A · Ω · red and black probes',
    category: 'Instruments',
    icon:     '<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.7" ' +
              'stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="16" height="24" rx="2" ' +
              'fill="currentColor" fill-opacity="0.1"/><rect x="6" y="2" width="16" height="24" rx="2"/>' +
              '<rect x="9" y="5" width="10" height="5" rx="1"/><circle cx="14" cy="16" r="3"/>' +
              '<circle cx="10.5" cy="22.5" r="1"/><circle cx="17.5" cy="22.5" r="1"/></svg>',
    prefix:   'MM',
    pins:     ['red', 'black'],
    place:    { kind: 'offboard' },
    wireColors: { red: 0xef4444, black: 0x000000 },   // the probe leads (#108, #133)
    values:   { mode: { choices: { V: {}, A: {}, 'Ω': {} }, default: 'V' } },

    elements,
    measure,
    report:   (r, m) => `${m.mode} mode, reading ${shown(m)}`,
    headline,

    ai: {
      about:    'A multimeter beside the board. V mode reads the voltage across a part, A mode the current ' +
                'through it (in series), Ω mode its resistance with the power off.',
      keywords: ['multimeter', 'meter', 'voltmeter', 'ammeter', 'measure', 'probe'],
      listed:   'in-play',
      values:   ['mode'],
      guide:    'The probes are wire ends, MM1.red and MM1.black. V (default): keep the circuit and add_wire ' +
                "MM1.red to a free hole in the column of the part's + side, MM1.black to one in its − side. " +
                'A: in series, never straight across a source. Ω: power off. A divider to measure is two ' +
                'place_resistor in series (see the recipe).',
      recipe:   {
        name:  'V mode across R2 of a 1 kΩ / 1 kΩ divider on 9 V: MM1.red on the + side of R2 (column 6), MM1.black on its − side (column 10): reads 4.50 V',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['b2', 'b6'], values: { resistance: 1000 } },
                { type: 'resistor', label: 'R2', holes: ['c6', 'c10'], values: { resistance: 1000 } },
                { type: 'multimeter', label: 'MM1', values: { mode: 'V' } }],
        wires: [['BAT1.0', 'tp_63'], ['BAT1.1', 'tn_63'], ['tp_2', 'a2'], ['a10', 'tn_10'],
                ['MM1.red', 'd6'], ['MM1.black', 'd10']],
        expect: { MM1: { mode: 'V', reading: [4.49, 4.51], fuse: false } },
      },
    },

    view: { build, show },

    examples: [
      {
        name:  'V mode across R2 of a 1 kΩ / 1 kΩ divider on 9 V reads 4.50 V',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 1000 } },
                { type: 'resistor', label: 'R2', holes: ['b14', 'b18'], values: { resistance: 1000 } },
                { type: 'multimeter', label: 'MM1' }],
        wires: [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1'], ['tp_10', 'c10'], ['c18', 'tn_18'],
                ['MM1.red', 'd14'], ['MM1.black', 'd18']],
        expect: { MM1: { mode: 'V', reading: [4.49, 4.51], fuse: false } },
      },
      {
        name:  'A mode in series with a 470 Ω red LED loop on 9 V reads 14.9 mA',
        parts: [{ type: 'battery', label: 'BAT1' },
                { type: 'resistor', label: 'R1', holes: ['a10', 'a14'], values: { resistance: 470 } },
                { type: 'led', label: 'LED1', holes: ['b18', 'b14'] },
                { type: 'multimeter', label: 'MM1', values: { mode: 'A' } }],
        wires: [['BAT1.0', 'tp_1'], ['BAT1.1', 'tn_1'], ['tp_10', 'c10'], ['c18', 'MM1.red'], ['MM1.black', 'tn_18']],
        expect: { MM1: { mode: 'A', reading: [14.85, 14.95], fuse: false } },
      },
    ],
  };

  return { def, ohms };
});
