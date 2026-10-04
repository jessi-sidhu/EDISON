// ─────────────────────────────────────────────────────────────
//  edison/landing.js — the Edison landing page (issues #166 and #164,
//  landing v3).
//
//  The pure half (Node can load it): the example requests for the "Ask
//  Edison" box, the editor link, which requests play the hero (plays) and
//  the hero sequence as data (TIMELINE). The page half is a thin DOM layer:
//  it mounts the hero frame in #hero-stage, wires the "Ask Edison" form and
//  runs the sequence (the schematic draws, shrinks into the inset, the frame
//  sketches, solidifies and lights the LED, then "Open in the simulator +").
//  The page is always black: there is no theme, and it never writes
//  localStorage.
//
//  Browser: window.Landing (boots itself; uses window.HeroSchematic for the
//  schematic and window.HeroCallouts for the callouts).  Node: module.exports.
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  const Landing = factory();
  if (typeof module === 'object' && module.exports) module.exports = Landing;
  if (root && root.document) { root.Landing = Landing; Landing.boot(root); }
})(typeof window !== 'undefined' ? window : null, function () {

  // The first one is the box's placeholder, and what an empty box sends.
  const EXAMPLES = [
    'Build me a light bulb',
    'Build me an inverting amplifier, gain −10',
    'Divide 5 V down to 3.3 V',
    'Why is LED1 not lighting up?',
    'Show a 1 kHz sine on the scope',
  ];

  function editorUrl(prompt) {
    return '../circuit3d/index.html?ui=edison&ask=' + encodeURIComponent(prompt);
  }

  // An empty box (it asks for the placeholder) or a light-bulb / LED request
  // plays the hero; anything else goes to the editor.
  function plays(text) {
    const t = String(text == null ? '' : text).trim();
    return t === '' || /light ?bulb|\bled\b/i.test(t);
  }

  // The hero sequence, in order. ms: schematic and inset are fixed (the
  // schematic draws, then FLIPs into the inset); sketch, solid and lit first
  // await the frame's Hero.stage(), then hold for ms.
  const TIMELINE = [
    { stage: 'idle',      ms: 0 },
    { stage: 'schematic', ms: 2800 },   // HeroSchematic.DRAW_MS, the labels, a beat
    { stage: 'inset',     ms: 700 },
    { stage: 'sketch',    ms: 1500 },
    { stage: 'solid',     ms: 0 },
    { stage: 'lit',       ms: 400 },
    { stage: 'done',      ms: 0 },
  ];
  const STEP_OF  = { schematic: 'SCHEMATIC', inset: 'SKETCH', sketch: 'SKETCH', solid: 'SIMULATE', lit: 'SIMULATE', done: 'SIMULATE' };
  const FRAME_OF = { idle: 'empty', schematic: 'empty', inset: 'empty', sketch: 'lineart', solid: 'solid', lit: 'lit', done: 'lit' };

  const FRAME_SRC   = '../circuit3d/viewer.html?mode=hero&circuit=edison/demo/led.sparky&stage=empty';
  const FRAME_WAIT  = 10000;   // no Hero.ready by then (no WebGL, CDN down): end on the schematic
  const INSET_WIDTH = 3.4;     // the schematic's stroke in the inset, viewBox units (about 1 px there)
  const EASE        = 'cubic-bezier(0.65, 0, 0.35, 1)';

  // ── The page ────────────────────────────────────────────────

  function boot(win) {
    const doc = win.document;
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => mount(win));
    else mount(win);
  }

  function mount(win) {
    const doc = win.document;
    const form = doc.querySelector('.ed-ask'), input = form && form.querySelector('input');
    const stage = doc.querySelector('.ed-stage'), host = doc.getElementById('hero-stage');
    const inset = stage && stage.querySelector('.ed-inset');
    const hero = stage && host && inset ? sequence(win, stage, host, inset) : null;
    if (hero) Landing.seek = hero.seek;

    // The request plays the hero or goes to the editor as ?ask=, never as a native GET.
    if (input) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const text = input.value.trim();
        if (!hero || !plays(text)) { win.location.assign(editorUrl(text || EXAMPLES[0])); return; }
        if (hero.busy()) return;
        if (!text) input.value = EXAMPLES[0];
        hero.play();
      });
    }
  }

  // The hero: the frame, the schematic and the run through TIMELINE.
  function sequence(win, stage, host, inset) {
    const doc = win.document;
    const msOf = name => TIMELINE.find(s => s.stage === name).ms;
    const reduced = () => !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const frame = doc.createElement('iframe');
    frame.src = FRAME_SRC;
    frame.title = 'An LED circuit on a breadboard';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    host.appendChild(frame);
    stage.dataset.hero = 'idle';
    if (win.HeroCallouts) win.HeroCallouts.attach(win, stage, frame);   // the leader-line callouts (#168)

    // The frame's Hero, once it is ready. Same origin, so read it directly.
    const heroIn = () => { try { return frame.contentWindow.Hero || null; } catch { return null; } };
    const heroReady = new Promise((resolve, reject) => {
      const take = () => { const H = heroIn(); if (H) H.ready.then(() => resolve(H), reject); return !!H; };
      if (take()) return;
      frame.addEventListener('load', () => {
        let page = '';
        try { page = frame.contentWindow.location.pathname; } catch { /* not ours */ }
        if (/viewer\.html$/.test(page) && !take()) reject(new Error('the hero frame has no Hero'));
      });
    });
    heroReady.catch(() => {});

    let run = 0, busy = false;
    const timers = new Set();
    const wait = ms => new Promise(resolve => {
      const t = win.setTimeout(() => { timers.delete(t); resolve(); }, ms);
      timers.add(t);
    });
    const within = ms => Promise.race([heroReady.catch(() => null), wait(ms).then(() => null)]);

    // A new run: the old one stops at its next step, its timers cleared.
    function begin(instant) {
      run++;
      timers.forEach(t => win.clearTimeout(t));
      timers.clear();
      if (instant) stage.setAttribute('data-hero-instant', '');
      else stage.removeAttribute('data-hero-instant');
      return run;
    }

    function setStage(name, step) {
      stage.dataset.hero = name;
      const want = step === undefined ? STEP_OF[name] : step;
      stage.querySelectorAll('[data-step]').forEach(el => {
        el.toggleAttribute('data-current', !!want && el.textContent.trim() === want);
      });
    }

    // The schematic: a fresh copy each time, so its drawing starts over.
    function placeSchematic(where) {
      doc.querySelectorAll('svg.ed-schematic').forEach(s => s.remove());
      if (!win.HeroSchematic) return null;
      where.insertAdjacentHTML('beforeend', win.HeroSchematic.schematicSvg());
      return where.lastElementChild;
    }

    function reset() {
      doc.querySelectorAll('svg.ed-schematic').forEach(s => s.remove());
      inset.hidden = true;
      setStage(stage.dataset.hero, null);
    }

    // Where the drawing shows inside an svg's box (viewBox, meet).
    function drawn(svg, box) {
      const vb = svg.viewBox.baseVal, k = Math.min(box.width / vb.width, box.height / vb.height);
      return { left: box.left + (box.width - vb.width * k) / 2, top: box.top + (box.height - vb.height * k) / 2, width: vb.width * k };
    }

    // FLIP the stage's schematic into the inset: transform only (plus its
    // stroke, so it ends at the inset's weight), then move it in for good.
    async function intoInset(svg, ms, id) {
      inset.hidden = false;
      const box = svg.getBoundingClientRect(), from = drawn(svg, box);
      const pad = inset.getBoundingClientRect(), to = drawn(svg, {
        left: pad.left + inset.clientLeft, top: pad.top + inset.clientTop, width: inset.clientWidth, height: inset.clientHeight,
      });
      if (to.width > 0) {
        const k = to.width / from.width;
        const x = to.left - box.left - k * (from.left - box.left), y = to.top - box.top - k * (from.top - box.top);
        svg.style.zIndex = '2';   // over the inset's panel until it lands in it
        svg.style.transition = `transform ${ms}ms ${EASE}, stroke-width ${ms}ms ${EASE}`;
        svg.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
        svg.style.strokeWidth = String(INSET_WIDTH);
      } else {
        // No inset on a phone: the schematic fades out instead.
        svg.style.transition = `opacity ${ms}ms ${EASE}`;
        svg.style.opacity = '0';
      }
      const ended = new Promise(resolve => svg.addEventListener('transitionend', resolve, { once: true }));
      await Promise.all([wait(ms), Promise.race([ended, wait(ms + 300)])]);
      if (id !== run) return;
      svg.removeAttribute('style');
      inset.appendChild(svg);
    }

    // A run that can't finish: it ends at done, on whatever it has drawn.
    function end(id, step) { if (id === run) { setStage('done', step); busy = false; } }

    async function play() {
      const id = begin(false);
      busy = true;
      if (reduced()) return seek('done', id);
      reset();
      const now = heroIn();
      if (now && now.current && now.current() !== 'empty') now.stage('empty').catch(() => {});

      setStage('schematic');
      const svg = placeSchematic(host);
      await wait(msOf('schematic'));
      if (id !== run) return;
      const H = await within(FRAME_WAIT);
      if (id !== run) return;
      if (!H) return end(id, STEP_OF.schematic);   // no frame: the schematic stays, full size

      try {
        setStage('inset');
        if (svg) await intoInset(svg, msOf('inset'), id);
        else await wait(msOf('inset'));
        for (const name of ['sketch', 'solid', 'lit']) {
          if (id !== run) return;
          setStage(name);
          await H.stage(FRAME_OF[name]);
          if (id !== run) return;
          await wait(msOf(name));
        }
      } catch { /* the frame failed a stage: end where we are */ }
      end(id);
    }

    // Straight to a stage's end state, with no animation. Resolves once there.
    async function seek(name, id) {
      if (!(name in FRAME_OF)) throw new Error(`Landing.seek: no stage "${name}"`);
      if (id === undefined) id = begin(true);
      else stage.setAttribute('data-hero-instant', '');
      reset();
      if (name === 'schematic') placeSchematic(host);
      else if (name !== 'idle') { inset.hidden = false; placeSchematic(inset); }

      const H = await within(FRAME_WAIT);
      if (id !== run) return;
      if (!H) {
        if (name !== 'idle' && name !== 'schematic') { inset.hidden = true; placeSchematic(host); }
        setStage(name, name === 'idle' ? null : STEP_OF.schematic);
        busy = false;
        return;
      }
      try { await H.stage(FRAME_OF[name]); } catch { /* the frame failed: keep the page's half */ }
      if (id !== run) return;
      setStage(name);
      busy = false;
    }

    return { play, seek: name => seek(name), busy: () => busy };
  }

  // Landing.seek(stage) is the page's (mount puts it here); without a stage it rejects.
  const Landing = { EXAMPLES, TIMELINE, editorUrl, plays, boot,
    seek: name => Promise.reject(new Error(`Landing.seek("${name}"): no hero on this page`)) };
  return Landing;
});
