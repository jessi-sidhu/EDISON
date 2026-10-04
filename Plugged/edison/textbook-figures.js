// ─────────────────────────────────────────────────────────────
//  edison/textbook-figures.js — the textbook spread's two op-amp figures
//  and the page's explorable maths (issue #181).
//
//  FIGURES holds each schematic as data, in viewBox units: the op-amp, the
//  resistors (label, the state key their value comes from, ends), the
//  terminals (Vin, Vout), the − input node, the wires as polylines (some
//  tagged with the term they belong to), the grounds and the junction dots.
//  Each figure also names the .sparky its "Test in lab +" button opens and
//  its starting values. Both draw the op-amp in the same place with R2 over
//  the top, so only where Vin and ground connect changes between them.
//
//  The maths is pure and needs no simulator: gainInv / gainNon, vout()
//  clamped to the TL072's swing (±10.5 V on ±12 V, 1.5 V inside each rail),
//  clipped(), the E12-ish resistor steps, the 0.1 V Vin steps, the number
//  formats and the "Check yourself" answers.
//
//  figureSvg(id, state) and plotSvg(id, state) return SVG markup;
//  plotGeometry() is the transfer plot as numbers; labHref(id, state) is a
//  page's "Test in lab +" link with its current values. mount(doc) is the thin
//  browser layer: it draws both figures and plots, and wires the
//  scrubbable values, the linked hover and the check inputs.
//
//  Browser: window.TextbookFigures (and mounts itself).  Node: module.exports.
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  const TextbookFigures = factory();
  if (typeof module === 'object' && module.exports) module.exports = TextbookFigures;
  if (root) {
    root.TextbookFigures = TextbookFigures;
    const doc = root.document;
    if (doc) {
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => TextbookFigures.mount(doc));
      else TextbookFigures.mount(doc);
    }
  }
})(typeof window !== 'undefined' ? window : null, function () {

  // ── The maths ───────────────────────────────────────────────

  const RAIL = 10.5;                      // a TL072 on ±12 V swings to 1.5 V inside each rail
  const gainInv = (r1, r2) => -r2 / r1;
  const gainNon = (r1, r2) => 1 + r2 / r1;
  const vout    = (gain, vin, rail = RAIL) => Math.max(-rail, Math.min(rail, gain * vin));
  const clipped = (gain, vin, rail = RAIL) => Math.abs(gain * vin) > rail + 1e-9;

  // E12 from 1 kΩ to 1 MΩ, plus 2.0 so 20 kΩ (the gain-of-3 answer) can be dialled in.
  const MANTISSAS = [10, 12, 15, 18, 20, 22, 27, 33, 39, 47, 56, 68, 82];
  const RES_STEPS = [100, 1000, 10000].flatMap(k => MANTISSAS.map(m => m * k)).concat([1000000]);
  const VIN = { min: -2, max: 2, step: 0.1 };

  // n steps up or down from r (an off-list r snaps to the nearest step first).
  function stepOhms(r, n) {
    let i = RES_STEPS.indexOf(r);
    if (i < 0) i = RES_STEPS.reduce((best, s, k) => (Math.abs(s - r) < Math.abs(RES_STEPS[best] - r) ? k : best), 0);
    return RES_STEPS[Math.max(0, Math.min(RES_STEPS.length - 1, i + n))];
  }
  // Vin in tenths, so it never drifts: 0.5 + 0.1 is 0.6.
  const snapVin = v => Math.max(VIN.min, Math.min(VIN.max, Math.round(v * 10) / 10));
  const stepVin = (v, n) => snapVin(v + n * VIN.step);

  // ── Formats (− is U+2212) ───────────────────────────────────
  const trim = x => String(Number(x.toFixed(2)));
  function fmtOhms(r) {
    if (r >= 1e6) return trim(r / 1e6) + ' MΩ';
    if (r >= 1e3) return trim(r / 1e3) + ' kΩ';
    return trim(r) + ' Ω';
  }
  // One decimal, or two when the second one counts: 0.5 V, −5.0 V, −2.35 V.
  function fmtVolts(v) {
    if (Math.abs(v) < 0.005) return '0.0 V';
    let s = Math.abs(v).toFixed(2);
    if (s.endsWith('0')) s = s.slice(0, -1);
    return (v < 0 ? '−' : '') + s + ' V';
  }
  const fmtGain = g => (g < 0 ? '−' : '') + String(parseFloat(Math.abs(g).toPrecision(3)));

  // ── Check yourself ──────────────────────────────────────────
  //  "-2.35", "−2.35 V", "-2.35v" → −2.35.   "20k", "20 k", "20 kΩ", "20000" → 20000.
  //  Both questions keep the figure's R1 = 10 kΩ.
  function parseVolts(s) {
    const m = /^\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*(m)?\s*(?:v|volts?)?\s*$/i.exec(String(s).replace(/−/g, '-'));
    return m ? Number(m[1]) / (m[2] ? 1000 : 1) : null;
  }
  function parseOhms(s) {
    const m = /^\s*(\d+\.?\d*|\.\d+)\s*([kKmM])?\s*(?:Ω|ohms?)?\s*$/.exec(String(s));
    if (!m) return null;
    const mult = !m[2] ? 1 : /k/i.test(m[2]) ? 1e3 : 1e6;
    return Number(m[1]) * mult;
  }
  const CHECKS = {
    inverting:       { question: 'With R2 = 47 kΩ, what is Vout for 0.5 V in?', answer: -2.35, tol: 0.05, parse: parseVolts },
    'non-inverting': { question: 'What R2 gives a gain of 3?',                 answer: 20000, tol: 100,  parse: parseOhms },
  };
  function check(id, text) {
    const c = CHECKS[id], v = c ? c.parse(text) : null;
    return v !== null && Math.abs(v - c.answer) <= c.tol + 1e-9;
  }

  // ── The drawings ────────────────────────────────────────────

  // The shared op-amp (left edge x, centre y, width, height): − input on
  // top, + input below, 20 units in from the corners.
  const OPAMP = { label: 'U1', part: 'TL072', x: 200, y: 110, w: 84, h: 96 };
  const IN_MINUS = [OPAMP.x, OPAMP.y - OPAMP.h / 2 + 20];   // (200, 82)
  const IN_PLUS  = [OPAMP.x, OPAMP.y + OPAMP.h / 2 - 20];   // (200, 138)
  const OUT      = [OPAMP.x + OPAMP.w, OPAMP.y];            // (284, 110)

  // What both figures share: the − node and its stub to the − input, the
  // feedback loop over the top through R2, and the output to Vout.
  const NODE_MINUS = [170, 82], NODE_OUT = [312, 110];
  const R2_ENDS = [[205, 32], [245, 32]];
  const SHARED_WIRES = [
    { pts: [NODE_MINUS, IN_MINUS], term: 'minus' },
    { pts: [NODE_MINUS, [170, 32], R2_ENDS[0]] },
    { pts: [R2_ENDS[1], [312, 32], NODE_OUT] },
    { pts: [OUT, [342, 110]], term: 'Vout' },
  ];
  const VOUT = { label: 'Vout', at: [346, 110], side: 'right' };

  const FIGURES = {
    inverting: {
      id: 'inverting',
      n: '1.1',
      title: 'Inverting amplifier',
      circuit: 'edison/figures/inverting.sparky',
      defaults: { r1: 10000, r2: 100000, vin: 0.5 },
      set: { r1: 'R1.resistance', r2: 'R2.resistance', vin: 'PS2.voltage' },   // where each value lives in the circuit
      viewBox: [0, 0, 400, 200],
      opamp: OPAMP,
      resistors: [
        { label: 'R1', key: 'r1', ends: [[96, 82], [136, 82]] },
        { label: 'R2', key: 'r2', ends: R2_ENDS },
      ],
      terminals: [{ label: 'Vin', at: [60, 82], side: 'left' }, VOUT],
      minus: { node: NODE_MINUS, tag: 'virtual ground, 0 V' },
      wires: [
        { pts: [[64, 82], [96, 82]], term: 'Vin' },          // Vin to R1
        { pts: [[136, 82], NODE_MINUS] },                     // R1 to the − node
        ...SHARED_WIRES,
        { pts: [IN_PLUS, [180, 138], [180, 166]] },           // the + input down to ground
      ],
      grounds: [[180, 166]],
      dots: [NODE_MINUS, NODE_OUT],
    },
    'non-inverting': {
      id: 'non-inverting',
      n: '1.2',
      title: 'Non-inverting amplifier',
      circuit: 'edison/figures/non-inverting.sparky',
      defaults: { r1: 10000, r2: 10000, vin: 0.5 },
      set: { r1: 'R1.resistance', r2: 'R2.resistance', vin: 'PS2.voltage' },
      viewBox: [0, 0, 400, 200],
      opamp: OPAMP,
      resistors: [
        { label: 'R1', key: 'r1', ends: [[110, 82], [150, 82]] },
        { label: 'R2', key: 'r2', ends: R2_ENDS },
      ],
      terminals: [{ label: 'Vin', at: [60, 138], side: 'left' }, VOUT],
      minus: { node: NODE_MINUS },
      wires: [
        { pts: [[64, 138], IN_PLUS], term: 'Vin' },           // Vin straight into the + input
        { pts: [[150, 82], NODE_MINUS] },                     // R1 to the − node
        { pts: [[110, 82], [92, 82], [92, 98]] },             // R1 down to ground
        ...SHARED_WIRES,
      ],
      grounds: [[92, 98]],
      dots: [NODE_MINUS, NODE_OUT],
    },
  };

  const stateOf = (id, s) => Object.assign({}, FIGURES[id].defaults, s);
  function solve(id, s) {
    s = stateOf(id, s);
    const gain = id === 'inverting' ? gainInv(s.r1, s.r2) : gainNon(s.r1, s.r2);
    return { gain, vout: vout(gain, s.vin), clipped: clipped(gain, s.vin) };
  }
  // What the worked line and the figure's Vout label read.
  const voutText = r => (r.clipped ? 'clipped at ' + fmtVolts(r.vout) : fmtVolts(r.vout));

  // A resistor between two points on one horizontal line: six peaks, a
  // short straight lead at each end.
  function zigzag(a, b) {
    const y = a[1], lead = 4, peaks = 6, amp = 5;
    const x0 = a[0] + lead, step = (b[0] - a[0] - 2 * lead) / peaks;
    const pts = [a, [x0, y]];
    for (let i = 0; i < peaks; i++) pts.push([x0 + step * (i + 0.5), y + (i % 2 ? amp : -amp)]);
    pts.push([b[0] - lead, y], b);
    return pts;
  }
  const triangle = o => [[o.x, o.y - o.h / 2], [o.x + o.w, o.y], [o.x, o.y + o.h / 2]];
  // A ground: three bars, each shorter, under the wire's end.
  function ground(p) {
    const [x, y] = p;
    return [[[x - 11, y], [x + 11, y]], [[x - 7, y + 5], [x + 7, y + 5]], [[x - 3, y + 10], [x + 3, y + 10]]];
  }

  // ── Markup helpers ──────────────────────────────────────────
  const num = n => String(Math.round(n * 100) / 100);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const pathData = (pts, closed) => 'M' + pts.map(p => num(p[0]) + ' ' + num(p[1])).join('L') + (closed ? 'Z' : '');
  const path = (pts, closed) => '<path d="' + pathData(pts, closed) + '"/>';
  // A wide invisible stroke, so a 1.3-unit line is easy to point at.
  const hit = pts => '<path class="tb-hit" d="' + pathData(pts) + '"/>';
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];

  const SERIF = 'font-family="\'STIX Two Text\', \'Times New Roman\', serif"';
  const MONO  = 'font-family="\'DM Mono\', ui-monospace, \'SF Mono\', Menlo, monospace"';

  // "R1" → an italic serif R with a subscript 1; "Vout" → V with "out".
  function variable(label, x, y, anchor) {
    return '<text class="tb-fig-label" x="' + num(x) + '" y="' + num(y) + '" text-anchor="' + anchor + '" ' + SERIF
      + ' font-size="17" fill="currentColor" stroke="none"><tspan font-style="italic">' + esc(label[0]) + '</tspan>'
      + '<tspan font-size="12" dx="1" dy="4">' + esc(label.slice(1)) + '</tspan></text>';
  }
  function note(text, x, y, anchor, attrs, size = 11) {
    return '<text x="' + num(x) + '" y="' + num(y) + '" text-anchor="' + anchor + '" ' + MONO
      + ' font-size="' + size + '" fill="currentColor" ' + attrs + '>' + esc(text) + '</text>';
  }
  // A value the reader can drag: a slider in the accessibility tree.
  const scrubAttrs = (key, label, text) => 'class="tb-scrub tb-fig-value" data-var="' + key + '" tabindex="0" role="slider"'
    + ' aria-label="' + esc(label) + '" aria-valuetext="' + esc(text) + '"';
  const shown = (key, s) => (key === 'vin' ? fmtVolts(s.vin) : fmtOhms(s[key]));

  const describe = f => 'Figure ' + f.n + ': ' + f.title.toLowerCase() + ', with ' + f.resistors.map(r => r.label).join(' and ')
    + ' and op-amp ' + f.opamp.label + ' ' + f.opamp.part + '.';

  function figureSvg(id, s) {
    const f = FIGURES[id];
    if (!f) return '';
    s = stateOf(id, s);
    const o = f.opamp, r = solve(id, s), out = [];
    const wiresOf = term => f.wires.filter(w => w.term === term);
    out.push('<svg class="tb-fig-svg" xmlns="http://www.w3.org/2000/svg" viewBox="' + f.viewBox.join(' ') + '"'
      + ' role="img" aria-label="' + esc(describe(f)) + '" data-figure-id="' + f.id + '">');
    out.push('<g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">');

    // The plain lines: wires that belong to no term, the op-amp, the grounds, the output node.
    out.push('<g class="tb-fig-lines">');
    f.wires.filter(w => !w.term).forEach(w => out.push(path(w.pts)));
    out.push(path(triangle(o), true));
    f.grounds.forEach(g => ground(g).forEach(bar => out.push(path(bar))));
    f.dots.filter(p => !same(p, f.minus.node)).forEach(p =>
      out.push('<circle cx="' + num(p[0]) + '" cy="' + num(p[1]) + '" r="3" fill="currentColor" stroke="none"/>'));
    out.push('</g>');

    // The parts a term in the text can point at.
    f.resistors.forEach(res => {
      const cx = (res.ends[0][0] + res.ends[1][0]) / 2, y = res.ends[0][1], text = fmtOhms(s[res.key]);
      const zz = zigzag(res.ends[0], res.ends[1]);
      out.push('<g class="tb-part" data-term="' + res.label + '">' + hit(zz) + path(zz)
        + variable(res.label, cx, y - 13, 'middle')
        + note(text, cx, y + 21, 'middle', scrubAttrs(res.key, res.label, text) + ' stroke="none"') + '</g>');
    });
    f.terminals.forEach(t => {
      const left = t.side === 'left', x = t.at[0] + (left ? -10 : 10), y = t.at[1];
      const ws = wiresOf(t.label).map(w => hit(w.pts) + path(w.pts)).join('');
      const value = t.label === 'Vin'
        ? note(fmtVolts(s.vin), x, y + 22, 'end', scrubAttrs('vin', 'Vin', fmtVolts(s.vin)) + ' stroke="none"')
        : note(voutText(r), 396, y + 23, 'end', 'class="tb-fig-value tb-fig-vout" data-show="vout" stroke="none"');
      out.push('<g class="tb-part" data-term="' + t.label + '">' + ws
        + '<circle class="tb-hit" cx="' + num(t.at[0]) + '" cy="' + num(t.at[1]) + '" r="9"/>'
        + '<circle cx="' + num(t.at[0]) + '" cy="' + num(t.at[1]) + '" r="4"/>'
        + variable(t.label, x, y + 5, left ? 'end' : 'start') + value + '</g>');
    });
    // The − input: its node, its stub, its mark, and (inverting) a tag that shows on hover.
    const m = f.minus.node;
    out.push('<g class="tb-part" data-term="minus">'
      + wiresOf('minus').map(w => hit(w.pts) + path(w.pts)).join('')
      + '<circle class="tb-hit" cx="' + num(m[0]) + '" cy="' + num(m[1]) + '" r="8"/>'
      + '<circle cx="' + num(m[0]) + '" cy="' + num(m[1]) + '" r="3" fill="currentColor" stroke="none"/>'
      + '<text x="' + num(o.x + 10) + '" y="' + num(IN_MINUS[1] + 5) + '" text-anchor="middle" ' + MONO
      + ' font-size="14" fill="currentColor" stroke="none">−</text>'
      + (f.minus.tag ? '<g class="tb-fig-tag"><rect x="42" y="113" width="126" height="19" fill="none" stroke="currentColor" stroke-width="0.8"/>'
        + note(f.minus.tag, 105, 126, 'middle', 'stroke="none"', 10) + '</g>' : '')
      + '</g>');
    out.push('<text x="' + num(o.x + 10) + '" y="' + num(IN_PLUS[1] + 5) + '" text-anchor="middle" ' + MONO
      + ' font-size="14" fill="currentColor" stroke="none">+</text>');
    out.push('</g>');

    // The op-amp's name, small and grey.
    out.push(note(o.label, o.x + 32, o.y + 4, 'middle', 'class="tb-fig-part"'));
    out.push(note(o.part, o.x + 38, o.y + o.h / 2 + 12, 'start', 'class="tb-fig-part"'));
    out.push('</svg>');
    return out.join('');
  }

  // ── The transfer plot: Vout against Vin, −2 to 2 V ──────────
  const PLOT = { w: 250, h: 154, x0: 128, xs: 46, y0: 80, ys: 5.2, vmin: -2, vmax: 2 };
  const sx = v => PLOT.x0 + v * PLOT.xs;
  const sy = v => PLOT.y0 - v * PLOT.ys;
  const vinAt = x => snapVin((x - PLOT.x0) / PLOT.xs);

  // The line's corners (−2 V, any clipping knees, 2 V), the flat runs long
  // enough to label, and the dot at the current Vin.
  function plotGeometry(gain, vin, rail = RAIL) {
    const xs = [PLOT.vmin, PLOT.vmax];
    if (gain) [-rail / gain, rail / gain].forEach(k => { if (k > PLOT.vmin && k < PLOT.vmax) xs.push(k); });
    xs.sort((a, b) => a - b);
    const line = xs.map(x => [sx(x), sy(vout(gain, x, rail))]);
    const flats = [];
    for (let i = 1; i < xs.length; i++) {
      const mid = (xs[i - 1] + xs[i]) / 2, v = vout(gain, mid, rail);
      if (clipped(gain, mid, rail) && sx(xs[i]) - sx(xs[i - 1]) > 34) flats.push({ x: sx(mid), y: sy(v), side: v > 0 ? 'top' : 'bottom' });
    }
    return { line, flats, dot: [sx(vin), sy(vout(gain, vin, rail))], clipped: clipped(gain, vin, rail) };
  }

  function plotSvg(id, s) {
    s = stateOf(id, s);
    const r = solve(id, s), g = plotGeometry(r.gain, s.vin);
    const top = sy(RAIL), bottom = sy(-RAIL), left = sx(PLOT.vmin), right = sx(PLOT.vmax);
    const tick = (t, x, y, anchor) => note(t, x, y, anchor, 'class="tb-plot-tick"', 10);
    return '<svg class="tb-plot" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PLOT.w + ' ' + PLOT.h + '"'
      + ' data-plot-id="' + id + '" aria-hidden="true">'
      + '<g class="tb-plot-axes" fill="none" stroke="currentColor" stroke-width="1">'
      + path([[left, PLOT.y0], [right, PLOT.y0]]) + path([[PLOT.x0, 16], [PLOT.x0, PLOT.h - 6]])
      + '<path class="tb-plot-rail" d="' + pathData([[left, top], [right, top]]) + 'M' + num(left) + ' ' + num(bottom) + 'L' + num(right) + ' ' + num(bottom) + '"/>'
      + '</g>'
      + tick('−2', left, PLOT.y0 + 13, 'start') + tick('2', right, PLOT.y0 + 13, 'end')
      + tick('10.5', left - 4, top + 3.5, 'end') + tick('−10.5', left - 4, bottom + 3.5, 'end')
      + '<text class="tb-plot-axis" x="' + num(right + 5) + '" y="' + num(PLOT.y0 + 4) + '" ' + SERIF + ' font-size="13" fill="currentColor">'
      + '<tspan font-style="italic">V</tspan><tspan font-size="9" dy="3">in</tspan></text>'
      + '<text class="tb-plot-axis" x="' + num(PLOT.x0) + '" y="11" text-anchor="middle" ' + SERIF + ' font-size="13" fill="currentColor">'
      + '<tspan font-style="italic">V</tspan><tspan font-size="9" dy="3">out</tspan></text>'
      + '<path class="tb-plot-line" d="' + pathData(g.line) + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>'
      + [0, 1].map(i => note('clipped', 0, 0, 'middle', 'class="tb-plot-clip" data-clip="' + i + '" visibility="hidden"', 10)).join('')
      + '<circle class="tb-plot-dot" cx="' + num(g.dot[0]) + '" cy="' + num(g.dot[1]) + '" r="4.5" fill="currentColor"/>'
      + '</svg>';
  }

  // ── The browser layer ───────────────────────────────────────
  // "Test in lab +" opens the figure's circuit, already simulating, with the
  // values the page shows (tools/labs.js setsFromSearch applies ?set=). PS2
  // can't go below 0 V, so a negative Vin keeps the circuit's own.
  function labHref(id, state) {
    const f = FIGURES[id];
    const s = state || f.defaults;
    const pairs = Object.entries(f.set)
      .filter(([k]) => !(k === 'vin' && s.vin < 0))
      .map(([k, at]) => `${at}:${Number(s[k].toFixed(k === 'vin' ? 2 : 0))}`);
    return `../circuit3d/index.html?ui=edison&open=${f.circuit}&run=1&set=${pairs.join(',')}`;
  }

  //  Each page (article[data-fig]) keeps its own { r1, r2, vin }. Values
  //  update in place, never by redrawing, so a drag keeps its pointer.

  const PX_PER_STEP = { r1: 10, r2: 10, vin: 7 };

  function mount(doc) {
    doc.querySelectorAll('[data-figure]').forEach(el => { el.innerHTML = figureSvg(el.dataset.figure); });
    doc.querySelectorAll('[data-plot]').forEach(el => { el.innerHTML = plotSvg(el.dataset.plot); });
    doc.querySelectorAll('article[data-fig]').forEach(page => wirePage(page, page.dataset.fig));
    doc.querySelectorAll('input[data-check]').forEach(input => {
      const tick = input.parentNode.querySelector('.tb-tick');
      input.addEventListener('input', () => { tick.textContent = check(input.dataset.check, input.value) ? '✓' : ''; });
    });
  }

  function wirePage(page, id) {
    const s = stateOf(id);
    const step = (key, v, n) => (key === 'vin' ? stepVin(v, n) : stepOhms(v, n));
    const set = (key, v) => { if (s[key] !== v) { s[key] = v; update(); } };

    function update() {
      const r = solve(id, s);
      page.querySelectorAll('[data-var]').forEach(el => {
        const t = shown(el.dataset.var, s);
        el.textContent = t;
        el.setAttribute('aria-valuetext', t);
      });
      page.querySelectorAll('[data-show="gain"]').forEach(el => { el.textContent = fmtGain(r.gain); });
      page.querySelectorAll('[data-show="vout"]').forEach(el => { el.textContent = voutText(r); });
      page.querySelectorAll('[data-show="worked"]').forEach(el => { el.textContent = r.clipped ? voutText(r) : fmtVolts(r.vout) + ' out'; });
      page.classList.toggle('is-clipped', r.clipped);
      page.querySelectorAll('a.tb-lab').forEach(a => a.setAttribute('href', labHref(id, s)));
      const svg = page.querySelector('.tb-plot');
      if (svg) {
        const g = plotGeometry(r.gain, s.vin);
        svg.querySelector('.tb-plot-line').setAttribute('d', pathData(g.line));
        const dot = svg.querySelector('.tb-plot-dot');
        dot.setAttribute('cx', num(g.dot[0]));
        dot.setAttribute('cy', num(g.dot[1]));
        svg.querySelectorAll('.tb-plot-clip').forEach((el, i) => {
          const f = g.flats[i];
          el.setAttribute('visibility', f ? 'visible' : 'hidden');
          if (f) { el.setAttribute('x', num(f.x)); el.setAttribute('y', num(f.y + (f.side === 'top' ? -5 : 12))); }
        });
      }
    }

    // Scrubbing: drag left or right, or the arrow keys once focused.
    page.querySelectorAll('.tb-scrub').forEach(el => {
      const key = el.dataset.var;
      let drag = null;
      el.addEventListener('pointerdown', e => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, v: s[key] };
        page.classList.add('is-scrubbing');
        el.classList.add('is-dragging');
      });
      el.addEventListener('pointermove', e => {
        if (drag) set(key, step(key, drag.v, Math.round((e.clientX - drag.x) / PX_PER_STEP[key])));
      });
      const end = () => { drag = null; page.classList.remove('is-scrubbing'); el.classList.remove('is-dragging'); };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('keydown', e => {
        const n = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
        if (n) { e.preventDefault(); set(key, step(key, s[key], n)); }
      });
    });

    // The plot: press anywhere to put the dot there, then drag.
    const plot = page.querySelector('.tb-plot');
    if (plot) {
      let dragging = false;
      const toVin = e => {
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(plot.getScreenCTM().inverse());
        set('vin', vinAt(p.x));
      };
      plot.addEventListener('pointerdown', e => {
        e.preventDefault();
        plot.setPointerCapture(e.pointerId);
        dragging = true;
        page.classList.add('is-scrubbing');
        toVin(e);
      });
      plot.addEventListener('pointermove', e => { if (dragging) toVin(e); });
      const end = () => { dragging = false; page.classList.remove('is-scrubbing'); };
      plot.addEventListener('pointerup', end);
      plot.addEventListener('pointercancel', end);
    }

    // Linked hover: a term anywhere on the page lights every element with that term.
    let hot = null;
    const light = term => {
      if (term === hot) return;
      hot = term;
      page.querySelectorAll('[data-term]').forEach(el => el.classList.toggle('is-hot', el.dataset.term === term));
    };
    page.addEventListener('pointerover', e => {
      if (page.classList.contains('is-scrubbing')) return;
      const t = e.target.closest && e.target.closest('[data-term]');
      light(t && page.contains(t) ? t.dataset.term : null);
    });
    page.addEventListener('pointerleave', () => light(null));

    update();
  }

  return {
    RAIL, RES_STEPS, VIN, CHECKS, FIGURES, PLOT,
    gainInv, gainNon, vout, clipped, solve,
    stepOhms, stepVin, snapVin, fmtOhms, fmtVolts, fmtGain, parseVolts, parseOhms, check,
    zigzag, figureSvg, plotSvg, plotGeometry, labHref, mount,
  };
});
