// The Edison landing page, edison/index.html (issue #166, Edison landing v3
// 1/4): the page cut to the top, all black, and a HUD stage frame under the
// Ask box (refs docs/design/landing-v3/01, 02, 04). What only a real page
// shows: the kept wordmark, headline and Ask box; the stage with its corner
// brackets, title block, step line, course link and hidden inset; no giant
// word, no sections, no toggle; #101010; 390 px; localStorage never written;
// another prompt opening the editor (an empty Ask plays the hero from #164).
//
// The pure half (EXAMPLES[0], editorUrl, no theme exports) is
// test/edison-landing.test.js. The hero inside #hero-stage, the schematic,
// the callouts and the sequence are L2–L4's, not this issue's.
//
// #164 (Edison landing v3 3/4) adds the hero sequence, section 4 below: click
// Ask Edison → the schematic draws in the stage → it shrinks into the
// SCHEMATIC VIEW inset → the parts draw onto the glass board → it becomes the
// simulator → the LED lights → "Open in the simulator +". What only a real
// page shows: the stages in real time (the order, the step line, the
// schematic drawing, the frame dimming then driven empty → lineart → solid →
// lit, the button only at the end), Landing.seek('done')'s end state, reduced
// motion jumping to it, a second click mid-run ignored, a replay, the 3D
// CDNs being down (the venue Wi-Fi case: the run still ends on the full-size
// schematic and the button), and another prompt still opening the editor.
// The pure half (Landing.TIMELINE, Landing.plays, the schematic's
// markup) is test/edison-landing.test.js and test/hero-schematic.test.js.
// #164 changed two #166 checks the sequence supersedes: an EMPTY Ask now
// plays the sequence (test 2 now asks another prompt and checks no sequence
// starts), and #hero-stage now holds the hero frame instead of being empty.
// Not here: the frame's own stages and look (e2e/viewer-hero.spec.js, #167),
// and a browser with no WebGL at all (step 10's other case), which needs a
// GPU-less browser; left to QA. The CDN-down case runs the same fallback.
//
// #166 removed v2's tests (#162): the giant EDISON across the width behind
// #hero-stage; the sections below the hero (centred sentences, hairlines,
// the "+" buttons, the 3-column grid into the course, the line-art
// thumbnails, the Tab walk through them); the dark/light toggle (corner,
// squares, flip, reload, blocked storage); dark-when-the-OS-prefers-light;
// the light-mode contrast checks; and the reduced-motion stillness check
// (nothing moves on v3's page until L4). The gradient and shadow sweep is
// left to test/edison-design-guard.test.js, which scans edison/*.css.
//
// Seams assumed (stated so the builder matches):
// - <html data-ui="edison" data-ui-fixed>, with no data-theme. Body
//   background rgb(16, 16, 16) (#101010), text rgb(244, 244, 244) (#F4F4F4).
//   Grey LINES are rgb(103, 103, 103) (#676767); grey TEXT is the 5.6:1 hint
//   (#8A8A8A), since all text must pass WCAG AA (4.5:1 under 24 px).
// - Kept from v2: <header> holding the wordmark "EDISON" (#186: was "PLUGGED WITH EDISON"),
//   centred; the h1 "Breadboard circuits, built and simulated with AI"; the
//   form.ed-ask with a textbox labelled "Ask Edison" and an "Ask Edison"
//   button. The textbox's placeholder is Landing.EXAMPLES[0], "Build me a
//   light bulb", and an empty box asks for it (#164: by playing the hero).
//   DM Mono on every piece of text.
// - <section class="ed-stage" aria-label="Edison builds a light bulb"> after
//   the form, its top at or below the form's bottom, edge to edge (0 to the
//   viewport's width), at least 420 px tall at 1440 × 900, with no border.
//   It is the page's only <section>. Inside it:
//   - four .ed-bracket elements, one nearest each corner of the stage (within
//     64 px of it), each 16–40 px across, each drawing its L with CSS borders:
//     a visible 1 px border in the grey on the two sides that face its corner
//     (top + left for the top-left one), none on the other two;
//   - an element whose own text is "BREADBOARD" in the stage's top-left
//     quarter, and below it, on one row, three [data-step] elements reading
//     SCHEMATIC, SKETCH, SIMULATE (in that order, written in capitals: the
//     design guard bans text-transform). None has data-current at rest, and
//     none is in the ink; a step given data-current turns the ink at once;
//   - a link reading "ENSC 220 COURSE +" to course.html, in the stage's
//     bottom-left quarter;
//   - one <figure class="ed-inset" hidden> with a <figcaption> "SCHEMATIC
//     VIEW". With hidden removed (as L3 will), it shows in the stage's
//     bottom-right quarter at 1440, and stays display: none under 720 px;
//   - the existing #hero-stage, holding the hero frame (#164).
// - No .ed-giant, .ed-sec or .ed-theme, no button named "Switch to light/dark
//   mode", and no element outside the <header> whose whole text is "EDISON"
//   (the header's wordmark reads EDISON since #186).
// - The footer is one line: "Not an official SFU site." and the "Switch to classic UI" link to
//   ../landing.html?ui=classic.
// - The landing never writes localStorage (no setItem, removeItem or clear),
//   on load or on Ask.
// - #164, the sequence:
//   - On boot the landing mounts ONE <iframe> in #hero-stage:
//     src ../circuit3d/viewer.html?mode=hero&circuit=edison/demo/led.sparky
//     &stage=empty, title "An LED circuit on a breadboard", aria-hidden="true",
//     tabindex="-1"; CSS pointer-events: none, color-scheme: normal, no border.
//     The frame is same-origin: its window.Hero (#167: STAGES ['empty',
//     'lineart', 'solid', 'lit'], &stage=empty starts bare, Hero.stage(name)
//     goes either way, Hero.ready, Hero.current()) is read directly.
//   - section.ed-stage carries data-hero = the current TIMELINE stage: idle
//     (or no attribute) at rest, then schematic, inset, sketch, solid, lit,
//     done after a click.
//   - The schematic is HeroSchematic.schematicSvg()'s svg.ed-schematic. In
//     'schematic' it is in the stage, outside the inset, its paths drawing
//     (computed stroke-dashoffset going 1 → 0); the frame dims (opacity under
//     0.5 on it or its parents). From the FLIP on it sits INSIDE figure.ed-inset
//     (shown), fully drawn, and the frame is back to opacity 1.
//   - [data-step][data-current]: SCHEMATIC in schematic, SKETCH in inset and
//     sketch, SIMULATE in solid, lit and done.
//   - a.ed-open "Open in the simulator +" (the "+" in <span aria-hidden="true">),
//     href ../circuit3d/index.html?ui=edison&open=edison/demo/led.sparky, at
//     the stage's bottom centre; not showing (hidden, or opacity 0) until done.
//   - Landing.seek(stage) returns a Promise and resolves at that stage's end
//     state with no animation (so the button is at full opacity at once).
//   - A click with an empty box fills it with "Build me a light bulb" and
//     plays; a click on a box with a light-bulb / LED request plays and keeps
//     the visitor's text; a click while a run is going changes nothing (each
//     stage is written once); a click after done replays: data-hero back
//     through schematic, the schematic full size again, the frame back to
//     'empty'.
//   - Reduced motion: a click goes to done at once.
//   - The frame fails (no Hero, as when cdnjs and unpkg are unreachable): the
//     run goes schematic → done within ~15 s, the schematic stays where and
//     as big as it drew, in #hero-stage, the inset stays hidden, the step line
//     stops on SCHEMATIC, the button shows, and the landing itself logs no
//     error (the frame's own "THREE is not defined" and the failed CDN loads
//     are the frame's).
// - #168, the callouts (ref docs/design/landing-v3/04; the pure half, the data,
//   calloutsFor, leaderPath and labelAt, is test/hero-callouts.test.js):
//   - one svg.ed-callouts over the frame in .ed-stage draws them, in the
//     landing's own requestAnimationFrame loop, from the frame's
//     Hero.anchors() (x, y: 0 … 1 of the frame; mapped to the page through
//     the iframe's rect). The loop runs only while the stage is on screen.
//   - each callout's pieces carry data-callout="<id>" on themselves or an
//     ancestor: .ed-callout-dot (its centre is the dot on the part),
//     .ed-callout-line (an SVG path from the dot, a diagonal, then a
//     horizontal run ending at the label), .ed-callout-label (the caps title,
//     in the ink) and .ed-callout-sub (the subline, in the grey text colour,
//     rgb(138, 138, 138)). A callout not showing is gone, display: none,
//     visibility: hidden or opacity 0; one showing is at full opacity.
//   - idle: HOLE GRID (on 'holes') and POWER RAILS (on 'rail'); from the
//     sketch on: LED1, R1 470 Ω, CIRCUIT PATH ('path', #171) and TRANSPARENT
//     CASING ('casing', #171); from solid: BAT1 9 V. A callout whose anchor is
//     missing or visible:false stays hidden. Under 720 px only one shows (the
//     rails at idle, LED1 from the sketch on).
//   - the labels sit in fixed columns and never move; only the dots and lines
//     follow the turning board. They cover neither each other, the HUD, the
//     inset nor the end button, and the links under the SVG stay clickable.
//
// No network: Google Fonts is answered with empty CSS, /api/ask is stubbed
// (never called), and the editor an Ask opens is a stub page (only its URL is
// checked). The hero frame loads Three.js from its CDN, as every 3D test does
// (the CDN-down test aborts it).
// Guest only; sign-in is a manual QA case. WebKit-safe (no CDP): the builder's
// E2E_WEBKIT=1 project runs this file in Safari's engine too.
const { test, expect } = require('@playwright/test');

const PAGE   = '/edison/index.html';
const COURSE = '/edison/course.html';
const EDITOR = '/circuit3d/index.html';
const BULB   = 'Build me a light bulb';
const AMP    = 'Build me an inverting amplifier, gain −10';   // doesn't play the hero (Landing.plays)
const STAGE  = 'Edison builds a light bulb';
const STEPS  = ['SCHEMATIC', 'SKETCH', 'SIMULATE'];
const BLACK  = 'rgb(16, 16, 16)';
const INK    = 'rgb(244, 244, 244)';
const GREY   = 'rgb(103, 103, 103)';
const DM_MONO = /^\s*["']?DM Mono["']?\s*(,|$)/;

// Errors on the page or in the hero frame. Chrome's software WebGL notes a
// "GPU stall due to ReadPixels" on its own; that one is not the page's.
function watchErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !/GPU stall due to ReadPixels/.test(m.text())) errors.push('console: ' + m.text());
  });
  return errors;
}

// The landing's own errors, for a test where the hero frame is meant to fail:
// the frame's (its scripts and viewer.html are under /circuit3d/) and the
// blocked CDNs' are left out, by where each comes from.
const NOT_THE_LANDING = /\/circuit3d\/|cdnjs\.cloudflare\.com|unpkg\.com/;
function watchLandingErrors(page) {
  const errors = [];
  page.on('pageerror', e => { if (!NOT_THE_LANDING.test(String(e.stack || ''))) errors.push(`pageerror: ${e.message} | ${e.stack}`); });
  page.on('console', m => {
    if (m.type() !== 'error' || /GPU stall due to ReadPixels/.test(m.text()) || NOT_THE_LANDING.test(m.location().url || '')) return;
    errors.push(`console: ${m.text()} (${m.location().url || 'no location'})`);
  });
  return errors;
}

// Fonts answered with empty CSS, /api/ask stubbed, the editor a stub page.
async function stubNetwork(page) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/api/ask', route => route.fulfill({ json: { reply: '', actions: [] } }));
  await page.route(url => url.pathname === EDITOR, route =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Editor stub</title>' }));
}

// Measuring helpers on window.__probe, installed before the page's own
// scripts. They only read the page.
function installProbe() {
  const clear = c => !c || c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c);
  const bg = el => {
    for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; if (!clear(c)) return c; }
    return 'rgb(255, 255, 255)';
  };
  const rect = b => ({ left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height });
  const box = el => rect(el.getBoundingClientRect());
  const textBox = el => { const r = document.createRange(); r.selectNodeContents(el); return rect(r.getBoundingClientRect()); };
  const text = el => el.textContent.replace(/\s+/g, ' ').trim();
  const ownText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  const shown = el => !el.closest('script, style, noscript, template') && el.getClientRects().length > 0;
  const name = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : ''}` +
    ` "${(el.textContent || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40)}"`;

  // A visible border's width on one side (0 when there's none to see).
  const line = (el, side) => {
    const cs = getComputedStyle(el);
    const w = parseFloat(cs[`border${side}Width`]), style = cs[`border${side}Style`], c = cs[`border${side}Color`];
    return w > 0 && style !== 'none' && style !== 'hidden' && !clear(c) && c !== bg(el) ? w : 0;
  };

  // Text that can't be read (WCAG AA): under 4.5:1 with what's behind it,
  // or 3:1 for large text (24 px, or 18.66 px at weight 700 or more).
  const lum = c => {
    const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const needs = cs => (parseFloat(cs.fontSize) < (Number(cs.fontWeight) >= 700 ? 18.66 : 24) ? 4.5 : 3);
  const unreadable = () => [...document.querySelectorAll('body *')]
    .filter(e => shown(e) && ownText(e) && !e.closest('[aria-hidden="true"]'))
    .map(e => { const cs = getComputedStyle(e); return { e, c: cs.color, b: bg(e), min: needs(cs), size: cs.fontSize }; })
    .filter(x => contrast(x.c, x.b) < x.min)
    .map(x => `${name(x.e)}: ${x.c} on ${x.b} = ${contrast(x.c, x.b).toFixed(2)}:1 at ${x.size}, needs ${x.min}:1`);

  window.__probe = { clear, bg, box, textBox, text, ownText, shown, name, line, unreadable };
}

async function open(page, { width = 1440, height = 900 } = {}) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(installProbe);
  await page.goto(PAGE);
  await page.waitForLoadState('load');
}

// ── 1. The first screen and the stage ─────────────────────────

test('the first screen: the kept wordmark, headline and Ask box ("Build me a light bulb"), then the HUD stage (four corner brackets, BREADBOARD over SCHEMATIC / SKETCH / SIMULATE, the course link, a hidden SCHEMATIC VIEW inset, #hero-stage holding the hero frame); no giant word, sections or toggle; all black; console clean', async ({ page }) => {
  const errors = watchErrors(page);
  await stubNetwork(page);
  await open(page);

  // Kept from v2 (refs 01, 02): the wordmark, the headline, the Ask box.
  await expect.soft(page.getByRole('banner'), 'the header wordmark').toHaveText('EDISON');
  await expect.soft(page.getByRole('heading', { level: 1 })).toHaveText('Breadboard circuits, built and simulated with AI');
  const askBox = page.getByRole('textbox', { name: 'Ask Edison' });
  await expect(askBox, 'the Ask box').toBeVisible();
  await expect.soft(page.getByRole('button', { name: 'Ask Edison' }), 'the Ask button').toBeVisible();
  expect.soft(await askBox.getAttribute('placeholder'), 'the Ask box placeholder').toBe(BULB);
  expect.soft(await page.evaluate(() => window.Landing && Landing.EXAMPLES[0]), 'the placeholder is Landing.EXAMPLES[0]')
    .toBe(await askBox.getAttribute('placeholder'));

  // What the page shows, read in one pass.
  const F = await page.evaluate(monoSource => {
    const P = window.__probe, root = document.documentElement, vw = root.clientWidth, mono = new RegExp(monoSource);
    const mark = document.querySelector('header'), form = document.querySelector('form.ed-ask');
    const m = mark ? P.textBox(mark) : null;
    const out = {
      vw,
      html: { ui: root.dataset.ui, fixed: root.hasAttribute('data-ui-fixed'), theme: root.getAttribute('data-theme') },
      body: { bg: getComputedStyle(document.body).backgroundColor, fg: getComputedStyle(document.body).color },
      markCentre: m ? (m.left + m.right) / 2 : null,
      gone: {
        '.ed-giant': document.querySelectorAll('.ed-giant').length,
        '.ed-sec': document.querySelectorAll('.ed-sec').length,
        '.ed-theme': document.querySelectorAll('.ed-theme').length,
        'section other than .ed-stage': document.querySelectorAll('section:not(.ed-stage)').length,
        'a theme toggle button': [...document.querySelectorAll('button')]
          .filter(b => /switch to (light|dark) mode/i.test(b.getAttribute('aria-label') || b.textContent)).length,
        'an element reading just EDISON outside the header': [...document.querySelectorAll('body *')].filter(e => !e.closest('header') && P.shown(e) && P.text(e) === 'EDISON').length,
      },
      notMono: [...document.querySelectorAll('body *')]
        .filter(e => P.shown(e) && (P.ownText(e) || e.matches('input, button')))
        .filter(e => !mono.test(getComputedStyle(e).fontFamily)).map(P.name),
      unreadable: P.unreadable(),
      stage: null,
    };

    // The footer: the vertical centres of its text runs.
    const foot = document.querySelector('footer');
    if (foot) {
      const walker = document.createTreeWalker(foot, NodeFilter.SHOW_TEXT), mids = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        for (const q of r.getClientRects()) mids.push((q.top + q.bottom) / 2);
      }
      out.footSpread = mids.length ? Math.max(...mids) - Math.min(...mids) : null;
      out.footText = P.text(foot);
      const classic = [...foot.querySelectorAll('a')].find(a => /Switch to classic UI/.test(a.textContent));
      out.classic = classic ? new URL(classic.href).pathname + new URL(classic.href).search : null;
    }

    const stage = document.querySelector('section.ed-stage');
    if (!stage) return out;
    const s = P.box(stage), cx = (s.left + s.right) / 2, cy = (s.top + s.bottom) / 2;
    const quad = b => `${(b.top + b.bottom) / 2 < cy ? 'top' : 'bottom'}-${(b.left + b.right) / 2 < cx ? 'left' : 'right'}`;
    const SIDES = ['Top', 'Right', 'Bottom', 'Left'];

    const title = [...stage.querySelectorAll('*')].find(e => P.ownText(e) && P.text(e) === 'BREADBOARD');
    const course = [...stage.querySelectorAll('a[href]')].find(a => /^ENSC 220 COURSE\s*\+$/.test(P.text(a)));
    const insets = stage.querySelectorAll('figure.ed-inset');
    const hero = document.getElementById('hero-stage');

    out.stage = {
      label: stage.getAttribute('aria-label'),
      box: s,
      belowForm: form ? s.top >= form.getBoundingClientRect().bottom - 0.5 : false,
      bg: P.bg(stage),
      borders: SIDES.map(side => P.line(stage, side)),
      brackets: [...stage.querySelectorAll('.ed-bracket')].map(b => {
        const r = P.box(b), q = quad(r), [v, h] = q.split('-'), cs = getComputedStyle(b);
        const facing = [v === 'top' ? 'Top' : 'Bottom', h === 'left' ? 'Left' : 'Right'];
        return {
          q, width: r.width, height: r.height, gap: Math.max(Math.abs(r[v] - s[v]), Math.abs(r[h] - s[h])),
          facing: facing.map(x => P.line(b, x)), colour: facing.map(x => cs[`border${x}Color`]),
          away: SIDES.filter(x => !facing.includes(x)).map(x => P.line(b, x)),
        };
      }),
      title: title ? { quad: quad(P.textBox(title)), bottom: P.textBox(title).bottom, shown: P.shown(title) } : null,
      steps: [...stage.querySelectorAll('[data-step]')].map(e => ({
        text: P.text(e), current: e.hasAttribute('data-current'), colour: getComputedStyle(e).color, top: P.box(e).top, shown: P.shown(e),
      })),
      course: course ? { path: new URL(course.href).pathname, quad: quad(P.box(course)), shown: P.shown(course) } : null,
      insets: insets.length,
      hero: hero ? { inStage: stage.contains(hero), frames: hero.querySelectorAll('iframe').length } : null,
    };

    // The inset: hidden at rest; shown (as L3 will), bottom-right at 1440.
    const inset = insets[0];
    if (inset) {
      const cap = inset.querySelector('figcaption');
      out.stage.inset = { hidden: inset.hidden, shownAtRest: P.shown(inset), caption: cap ? P.text(cap) : null };
      inset.hidden = false;
      out.stage.inset.unhidden = { display: getComputedStyle(inset).display, quad: P.shown(inset) ? quad(P.box(inset)) : null };
      inset.hidden = true;
    }
    return out;
  }, DM_MONO.source);

  expect.soft(F.html, '<html>: Edison, fixed, no theme').toEqual({ ui: 'edison', fixed: true, theme: null });
  expect.soft(F.body, 'all black: the body\'s background and text').toEqual({ bg: BLACK, fg: INK });
  expect.soft(Math.abs(F.markCentre - F.vw / 2), 'the wordmark is centred (px off the viewport centre)').toBeLessThanOrEqual(4);
  expect.soft(F.gone, 'v2 leftovers on the page').toEqual({
    '.ed-giant': 0, '.ed-sec': 0, '.ed-theme': 0, 'section other than .ed-stage': 0,
    'a theme toggle button': 0, 'an element reading just EDISON outside the header': 0,
  });
  expect.soft(F.notMono, 'text not set in DM Mono').toEqual([]);
  expect.soft(F.unreadable, 'text under 4.5:1 contrast (3:1 when large)').toEqual([]);

  // The footer: one line, the classic link kept.
  expect.soft(F.footText, 'the footer').toBe('Not an official SFU site. Switch to classic UI');
  expect.soft(F.footSpread, 'the footer is one line (spread of its text runs\' centres, px)').toBeLessThanOrEqual(4);
  expect.soft(F.classic, 'Switch to classic UI goes to').toBe('/landing.html?ui=classic');

  // The stage (ref 04).
  expect(F.stage, `<section class="ed-stage" aria-label="${STAGE}">`).not.toBeNull();
  const S = F.stage;
  await expect.soft(page.getByRole('region', { name: STAGE }), 'the stage, named for screen readers').toBeVisible();
  expect.soft(S.belowForm, 'the stage sits below the Ask box').toBe(true);
  expect.soft([Math.round(S.box.left), Math.round(S.box.right)], 'the stage runs edge to edge (left, right px)').toEqual([0, F.vw]);
  expect.soft(S.box.height, 'the stage height at 1440 × 900 (about min(64vh, 680px), px)').toBeGreaterThanOrEqual(420);
  expect.soft(S.bg, 'the stage is black').toBe(BLACK);
  expect.soft(S.borders, 'the stage has no border').toEqual([0, 0, 0, 0]);

  expect.soft(S.brackets.map(b => b.q).sort(), 'one .ed-bracket at each corner of the stage')
    .toEqual(['bottom-left', 'bottom-right', 'top-left', 'top-right']);
  for (const b of S.brackets) {
    expect.soft(b.gap, `the ${b.q} bracket sits in its corner (px from it)`).toBeLessThanOrEqual(64);
    expect.soft(Math.min(b.width, b.height), `the ${b.q} bracket is about 24 px (smaller side)`).toBeGreaterThanOrEqual(16);
    expect.soft(Math.max(b.width, b.height), `the ${b.q} bracket is about 24 px (larger side)`).toBeLessThanOrEqual(40);
    expect.soft(b.facing, `the ${b.q} bracket's L: 1 px on the two sides facing its corner`).toEqual([1, 1]);
    expect.soft(b.colour, `the ${b.q} bracket's L is in the grey`).toEqual([GREY, GREY]);
    expect.soft(b.away, `the ${b.q} bracket draws nothing on its other two sides`).toEqual([0, 0]);
  }

  expect.soft(S.title, 'BREADBOARD in the stage').not.toBeNull();
  if (S.title) expect.soft(S.title.quad, 'the title block sits top-left').toBe('top-left');
  expect.soft(S.steps.map(s => s.text), 'the step line: three [data-step]').toEqual(STEPS);
  expect.soft(S.steps.filter(s => s.current).map(s => s.text), 'no step is current at rest').toEqual([]);
  expect.soft(S.steps.filter(s => s.colour === INK).map(s => s.text), 'no step is in the ink at rest').toEqual([]);
  if (S.steps.length) {
    expect.soft(Math.max(...S.steps.map(s => s.top)) - Math.min(...S.steps.map(s => s.top)), 'the steps sit on one row (px)').toBeLessThanOrEqual(2);
    if (S.title) expect.soft(Math.min(...S.steps.map(s => s.top)), 'the step line sits under BREADBOARD').toBeGreaterThanOrEqual(S.title.bottom - 1);
  }

  expect.soft(S.course, 'a link "ENSC 220 COURSE +" in the stage').not.toBeNull();
  if (S.course) {
    expect.soft(S.course.path, 'the course link goes to').toBe(COURSE);
    expect.soft(S.course.quad, 'the course link sits bottom-left').toBe('bottom-left');
  }

  expect.soft(S.insets, 'one figure.ed-inset in the stage').toBe(1);
  if (S.inset) {
    expect.soft(S.inset.caption, 'the inset caption').toBe('SCHEMATIC VIEW');
    expect.soft([S.inset.hidden, S.inset.shownAtRest], 'the inset is hidden at rest (hidden, painted)').toEqual([true, false]);
    expect.soft(S.inset.unhidden.display, 'the inset shows at 1440 once L3 removes hidden (display)').not.toBe('none');
    expect.soft(S.inset.unhidden.quad, 'the inset sits bottom-right').toBe('bottom-right');
  }

  // #164: the landing mounts the hero frame in #hero-stage on boot.
  expect.soft(S.hero, '#hero-stage in the stage, holding the hero frame (#164)').toEqual({ inStage: true, frames: 1 });

  // The current step is the one in the ink (L4 sets data-current).
  if (S.steps.length === STEPS.length) {
    const lit = await page.evaluate(() => {
      const steps = [...document.querySelectorAll('.ed-stage [data-step]')];
      steps[1].setAttribute('data-current', '');
      const colours = steps.map(e => getComputedStyle(e).color);
      steps[1].removeAttribute('data-current');
      return colours;
    });
    expect.soft(lit[1], 'SKETCH with data-current is in the ink').toBe(INK);
    expect.soft([lit[0], lit[2]].filter(c => c === INK), 'the other steps stay grey').toEqual([]);
  }

  expect(errors).toEqual([]);
});

// ── 2. Another prompt, and no storage ─────────────────────────

// #164 changed this test: an EMPTY Ask now plays the hero (section 4), so the
// editor handoff is checked with a prompt that doesn't play it. Pin: any
// prompt other than a light bulb / LED still opens the editor, as before.
test('another prompt ("Build me an inverting amplifier, gain −10") opens the editor with that ?ask= and starts no sequence; the landing writes nothing to localStorage on load or on Ask', async ({ page }) => {
  const errors = watchErrors(page);
  await stubNetwork(page);
  // Every localStorage write and every data-hero the stage takes, reported to
  // the test as it happens (survives the navigation to the editor).
  const writes = [], heroes = [];
  await page.exposeFunction('__storageWrite', (op, key) => { writes.push(`${op}(${key}) on ${new URL(page.url()).pathname}`); });
  await page.exposeFunction('__heroEvent', what => { heroes.push(what); });
  await page.addInitScript(() => {
    for (const op of ['setItem', 'removeItem', 'clear']) {
      const real = Storage.prototype[op];
      Storage.prototype[op] = function (...args) {
        if (this === window.localStorage) window.__storageWrite(op, args[0]);
        return real.apply(this, args);
      };
    }
    if (window.top !== window) return;
    document.addEventListener('submit', () => window.__heroEvent('submit'), true);
    new MutationObserver(records => {
      for (const r of records) if (r.target.matches('section.ed-stage')) window.__heroEvent('data-hero=' + r.target.getAttribute('data-hero'));
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-hero'] });
  });
  await open(page);

  const stored = () => page.evaluate(() => Object.keys(localStorage));
  expect(await stored(), 'localStorage after the landing loaded').toEqual([]);
  expect(writes, 'localStorage writes on load').toEqual([]);

  const ask = page.getByRole('textbox', { name: 'Ask Edison' });
  await ask.fill(AMP);
  await Promise.all([
    page.waitForURL(u => u.pathname === EDITOR),
    page.getByRole('button', { name: 'Ask Edison' }).click(),
  ]);
  const url = new URL(page.url());
  expect(url.searchParams.get('ask'), 'the request in ?ask=').toBe(AMP);
  expect(url.searchParams.get('ui'), 'the editor opens in Edison').toBe('edison');
  const afterAsk = heroes.slice(heroes.indexOf('submit') + 1);
  expect(heroes, 'the Ask was submitted').toContain('submit');
  expect(afterAsk.filter(h => h !== 'data-hero=idle'), 'stages the landing played after the Ask (none: it went to the editor)').toEqual([]);

  expect(await stored(), 'localStorage for the origin after the Ask').toEqual([]);
  expect(writes, 'localStorage writes by the landing').toEqual([]);
  expect(errors).toEqual([]);
});

// ── 3. A phone ────────────────────────────────────────────────

test('at 390 × 844: no sideways scroll, the title block stays inside the 16 px gutter, and the inset stays hidden even once shown (under 720 px)', async ({ page }) => {
  const errors = watchErrors(page);
  await stubNetwork(page);
  await open(page, { width: 390, height: 844 });

  const m = await page.evaluate(() => ({ scrollWidth: document.scrollingElement.scrollWidth, vw: document.documentElement.clientWidth }));
  expect(m.scrollWidth, 'no sideways scroll (scrollWidth vs the viewport width)').toBeLessThanOrEqual(m.vw);

  const stage = page.getByRole('region', { name: STAGE });
  const title = stage.getByText('BREADBOARD', { exact: true });
  const steps = stage.locator('[data-step]');
  await expect(title, 'BREADBOARD on a phone').toBeVisible();
  await expect(steps, 'the step line on a phone').toHaveText(STEPS);
  for (const [what, el] of [['BREADBOARD', title], ...STEPS.map((s, i) => [s, steps.nth(i)])]) {
    await expect(el, `${what} on a phone`).toBeVisible();
    const b = await el.boundingBox();
    expect(b.x, `${what}: left edge vs the 16 px gutter (px)`).toBeGreaterThanOrEqual(15.5);
    expect(b.x + b.width, `${what}: right edge vs the 16 px gutter (px)`).toBeLessThanOrEqual(m.vw - 15.5);
  }

  // Shown the way L3 will (hidden removed), the inset still hides under 720 px.
  const inset = page.locator('.ed-stage figure.ed-inset');
  await expect(inset, 'the inset').toHaveCount(1);
  const display = await inset.evaluate(f => { f.hidden = false; const d = getComputedStyle(f).display; f.hidden = true; return d; });
  expect(display, 'the inset at 390 px with hidden removed (display)').toBe('none');
  expect(errors).toEqual([]);
});

// ── 4. The hero sequence (#164) ───────────────────────────────

const RUN       = ['schematic', 'inset', 'sketch', 'solid', 'lit', 'done'];   // what a click plays, after idle
const PLAYING   = /^(schematic|inset|sketch|solid|lit|done)$/;
const STEP_OF   = { schematic: 'SCHEMATIC', inset: 'SKETCH', sketch: 'SKETCH', solid: 'SIMULATE', lit: 'SIMULATE', done: 'SIMULATE' };
const FRAME_RUN = ['empty', 'lineart', 'solid', 'lit'];                       // HeroModel.STAGES (#167)
const OPEN_END  = 'circuit3d/index.html?ui=edison&open=edison/demo/led.sparky';
const LED_ASK   = 'Make an LED light up';                                     // plays (Landing.plays), and isn't the placeholder

// Runs before the landing's scripts (in every frame; it records only in the
// top one). What the sequence does, on window.__hero, all times
// performance.now():
//   submits  [t] each submit of the Ask form
//   log      [{ stage, t }] each value data-hero takes on .ed-stage, in order,
//            repeats dropped (from MutationObserver records, so two values set
//            in one task are both kept: record i's new value is record i+1's
//            old one)
//   writes   [{ stage, t }] the same, repeats kept: every write of data-hero,
//            even of the value it already has (a restarted run shows here)
//   states   [{ t, hero, steps, where, open, frame }] each change seen on an
//            animation frame: the current [data-step]s, where the showing
//            schematic is ('stage' | 'inset' | null), whether a.ed-open shows,
//            and the frame's Hero.current() (null before it has a Hero)
//   drawing  { [stage]: true } stages in which a showing schematic had a path
//            part-drawn (0 < stroke-dashoffset < 1)
//   dim      { [stage]: least opacity of the frame, with its parents, seen }
function installRecorder() {
  if (window.top !== window) return;
  const R = { submits: [], log: [], writes: [], states: [], drawing: {}, dim: {} };
  window.__hero = R;
  const now = () => performance.now();
  document.addEventListener('submit', () => R.submits.push(now()), true);

  new MutationObserver(records => {
    const t = now(), recs = records.filter(r => r.target.matches('section.ed-stage'));
    recs.forEach((r, i) => {
      const stage = i + 1 < recs.length ? recs[i + 1].oldValue : r.target.getAttribute('data-hero');
      R.writes.push({ stage, t });
      const prev = R.log[R.log.length - 1];
      if (!prev || prev.stage !== stage) R.log.push({ stage, t });
    });
  }).observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-hero'] });

  const opacity = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const showing = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && opacity(el) > 0.01;
  const frameStage = () => {
    try { const H = document.querySelector('#hero-stage iframe').contentWindow.Hero; return H && typeof H.current === 'function' ? H.current() : null; } catch { return null; }
  };
  const partDrawn = p => { const v = parseFloat(getComputedStyle(p).strokeDashoffset); return v > 0.001 && v < 0.999; };
  let last = '';
  const tick = () => {
    const stage = document.querySelector('section.ed-stage');
    if (stage) {
      const hero  = stage.getAttribute('data-hero');
      const steps = [...stage.querySelectorAll('[data-step][data-current]')].map(e => e.textContent.trim());
      const svg   = [...document.querySelectorAll('svg.ed-schematic')].find(showing) || null;
      const where = svg ? (svg.closest('.ed-inset') ? 'inset' : 'stage') : null;
      const open  = showing(document.querySelector('a.ed-open'));
      const frame = frameStage();
      const key = JSON.stringify([hero, steps, where, open, frame]);
      if (key !== last) { last = key; R.states.push({ t: now(), hero, steps, where, open, frame }); }
      if (svg && [...svg.querySelectorAll('path')].some(partDrawn)) R.drawing[hero] = true;
      const f = document.querySelector('#hero-stage iframe');
      if (f) R.dim[hero] = Math.min(hero in R.dim ? R.dim[hero] : 1, opacity(f));
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// The recorder's entries from submit n up to submit `next` (by default the
// next one; pass a later index when the submits between belong to the same
// run, as a click the landing ignored).
function runOf(R, n, next = n + 1) {
  const from = R.submits[n], to = next < R.submits.length ? R.submits[next] : Infinity;
  if (from === undefined) return { log: [], writes: [], states: [] };
  const inRun = x => x.t >= from && x.t < to;
  return { log: R.log.filter(inRun), writes: R.writes.filter(inRun), states: R.states.filter(inRun) };
}
// The stages a run played, a leading reset to idle (or no attribute) left out.
const played  = log => { const s = log.map(e => e.stage); while (s.length && (s[0] === 'idle' || s[0] === null)) s.shift(); return s; };
// The last state seen while data-hero was `hero`.
const settled = (states, hero) => states.filter(s => s.hero === hero).pop() || {};
const dedupe  = xs => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
const recorded   = page => page.evaluate(() => window.__hero);
const nextFrames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// a.ed-open's opacity with its parents' (0 when there is none).
const openOpacity = page => page.evaluate(() => {
  const a = document.querySelector('a.ed-open');
  let o = a ? 1 : 0;
  for (let e = a; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
  return o;
});

// Wait until the hero frame has a Hero and it is ready.
async function frameReady(page) {
  await page.waitForFunction(() => {
    try { return !!document.querySelector('#hero-stage iframe').contentWindow.Hero; } catch { return false; }
  }, null, { timeout: 15_000 });
  await page.evaluate(() => document.querySelector('#hero-stage iframe').contentWindow.Hero.ready.then(() => true));
}

// The end state, read in one pass.
function readEnd(page) {
  return page.evaluate(() => {
    const opacity = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
    const showing = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && opacity(el) > 0.01;
    const box = el => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
    const stage = document.querySelector('section.ed-stage');
    const inset = document.querySelector('.ed-stage figure.ed-inset');
    const svg   = inset && inset.querySelector('svg.ed-schematic');
    const f     = document.querySelector('#hero-stage iframe');
    const open  = document.querySelector('a.ed-open');
    const plus  = open && open.querySelector('span[aria-hidden="true"]');
    let frame = null;
    try { frame = f.contentWindow.Hero.current(); } catch { /* no frame, or no Hero */ }
    return {
      hero: stage.getAttribute('data-hero'),
      stage: box(stage),
      inset: inset ? { showing: showing(inset), box: box(inset) } : null,
      schematics: [...document.querySelectorAll('svg.ed-schematic')].filter(showing).map(s => ({ inInset: !!(inset && inset.contains(s)), box: box(s) })),
      // In the inset's schematic: strokes not fully drawn, dots and labels not fully faded in.
      undrawn: svg ? [...svg.querySelectorAll('path')].filter(p => { const cs = getComputedStyle(p); return cs.strokeDasharray !== 'none' && parseFloat(cs.strokeDashoffset) > 0.001; }).length : null,
      faint: svg ? [...svg.querySelectorAll('text, circle')].filter(e => Number(getComputedStyle(e).opacity) < 0.99).map(e => e.textContent.trim() || 'a dot') : null,
      steps: [...stage.querySelectorAll('[data-step][data-current]')].map(e => e.textContent.trim()),
      frame,
      frameOpacity: f ? opacity(f) : null,
      open: open ? { showing: showing(open), opacity: opacity(open), href: open.getAttribute('href'), plus: plus ? plus.textContent.trim() : null, box: box(open) } : null,
    };
  });
}

// The end state both seek('done') and reduced motion must give.
function expectEndState(E, when) {
  expect.soft(E.hero, `${when}: data-hero`).toBe('done');
  expect.soft(E.inset && E.inset.showing, `${when}: the SCHEMATIC VIEW inset shows`).toBe(true);
  expect.soft(E.schematics.map(s => s.inInset), `${when}: each svg.ed-schematic showing, and whether it is in the inset (one, in it)`).toEqual([true]);
  if (E.inset && E.schematics.length === 1) {
    const s = E.schematics[0].box, i = E.inset.box;
    expect.soft([s.left >= i.left - 1, s.top >= i.top - 1, s.right <= i.right + 1, s.bottom <= i.bottom + 1],
      `${when}: the schematic fits inside the inset (left, top, right, bottom)`).toEqual([true, true, true, true]);
  }
  expect.soft(E.undrawn, `${when}: strokes of the inset's schematic not fully drawn`).toBe(0);
  expect.soft(E.faint, `${when}: dots and labels of the inset's schematic not fully shown`).toEqual([]);
  expect.soft(E.frame, `${when}: the frame's Hero.current()`).toBe('lit');
  expect.soft(E.steps, `${when}: the current step`).toEqual(['SIMULATE']);
  expect.soft(E.open && E.open.showing, `${when}: "Open in the simulator +" shows`).toBe(true);
}

test('Landing.seek("done") gives the end state at once: data-hero done, the schematic drawn in the SCHEMATIC VIEW inset, the frame lit, SIMULATE current, "Open in the simulator +" at the stage\'s bottom centre to the editor with the demo circuit; the frame is a mute background (pointer-events none, &stage=empty); console clean', async ({ page }) => {
  const errors = watchErrors(page);
  await stubNetwork(page);
  await open(page);

  expect(await page.evaluate(() => typeof (window.Landing && window.Landing.seek)), 'Landing.seek, the test hook').toBe('function');
  expect(await page.evaluate(async () => {
    const p = window.Landing.seek('done');
    if (!p || typeof p.then !== 'function') return 'seek did not return a Promise';
    await p;
    return 'resolved';
  }), 'Landing.seek("done")').toBe('resolved');

  const E = await readEnd(page);
  expectEndState(E, 'after seek("done")');
  expect.soft(E.frameOpacity, 'the frame is not dimmed at the end (opacity)').toBe(1);

  // The button: its words, its name, its link, its place. seek has no
  // animation, so it is at full opacity at once.
  await expect.soft(page.locator('a.ed-open'), 'the end button').toHaveText('Open in the simulator +');
  await expect.soft(page.getByRole('link', { name: 'Open in the simulator', exact: true }), 'the button\'s name for a screen reader (the "+" is aria-hidden)').toBeVisible();
  if (E.open) {
    expect.soft(E.open.opacity, 'the button\'s opacity after seek').toBe(1);
    expect.soft(E.open.plus, 'the "+" sits in a <span aria-hidden="true">').toBe('+');
    expect.soft(E.open.href, 'the button\'s href').toMatch(new RegExp(`${OPEN_END.replace(/[.?]/g, '\\$&')}$`));
    const mid = b => [(b.left + b.right) / 2, (b.top + b.bottom) / 2];
    const [bx, by] = mid(E.open.box), [sx, sy] = mid(E.stage);
    expect.soft(Math.abs(bx - sx), 'the button is centred in the stage (px off its centre)').toBeLessThanOrEqual(4);
    expect.soft([by > sy, E.open.box.bottom <= E.stage.bottom + 0.5], 'the button sits in the stage\'s bottom half, inside it').toEqual([true, true]);
  }

  // The frame: the demo circuit, starting bare, a background nobody can click or tab to.
  const F = await page.evaluate(() => {
    const frames = [...document.querySelectorAll('#hero-stage iframe')], f = frames[0];
    if (!f) return { count: 0 };
    const cs = getComputedStyle(f), u = new URL(f.getAttribute('src') || '', location.href);
    return {
      count: frames.length,
      path: u.pathname, mode: u.searchParams.get('mode'), circuit: u.searchParams.get('circuit'), stage: u.searchParams.get('stage'),
      title: f.getAttribute('title'), ariaHidden: f.getAttribute('aria-hidden'), tabindex: f.getAttribute('tabindex'),
      pointerEvents: cs.pointerEvents, colorScheme: cs.getPropertyValue('color-scheme').trim(),
      border: ['Top', 'Right', 'Bottom', 'Left'].map(s => parseFloat(cs[`border${s}Width`]) || 0),
    };
  });
  expect.soft(F, 'the hero frame in #hero-stage').toEqual({
    count: 1, path: '/circuit3d/viewer.html', mode: 'hero', circuit: 'edison/demo/led.sparky', stage: 'empty',
    title: 'An LED circuit on a breadboard', ariaHidden: 'true', tabindex: '-1',
    pointerEvents: 'none', colorScheme: 'normal', border: [0, 0, 0, 0],
  });
  expect(errors).toEqual([]);
});

test('a click on Ask Edison with an empty box plays the hero in real time: the box reads "Build me a light bulb"; data-hero goes schematic → inset → sketch → solid → lit → done within 20 s; the schematic draws in the stage while the frame dims, then sits in the inset; the steps follow; the frame goes empty → lineart → solid → lit; the button shows only at the end; a click mid-run is ignored; a click after done replays; console clean', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await stubNetwork(page);
  await page.addInitScript(installRecorder);
  await open(page);

  const stage  = page.locator('section.ed-stage');
  const ask    = page.getByRole('textbox', { name: 'Ask Edison' });
  const button = page.getByRole('button', { name: 'Ask Edison' });
  await expect(ask, 'the box is empty').toHaveValue('');
  await button.click();
  await expect(stage, 'an empty Ask plays the hero on the landing (data-hero leaves idle) rather than opening the editor')
    .toHaveAttribute('data-hero', PLAYING, { timeout: 5000 });
  expect(new URL(page.url()).pathname, 'still on the landing').toBe(PAGE);
  await expect(ask, 'the empty box fills with the request it plays').toHaveValue(BULB);
  // A second click while the schematic draws (a double click, an impatient
  // visitor) must change nothing; checked from the recording below.
  await expect(stage, 'still drawing the schematic, for the mid-run click').toHaveAttribute('data-hero', 'schematic');
  await button.click();
  await expect(stage, 'the run ends (data-hero done) within 20 s of the click').toHaveAttribute('data-hero', 'done', { timeout: 20_000 });
  // Let the button finish fading in, so the recorder has seen it.
  await expect.poll(() => openOpacity(page), { message: 'the end button fades in to full opacity', timeout: 3000 }).toBeGreaterThan(0.99);
  await nextFrames(page);

  // Submits 0 and 1 (the mid-run click) are one run; the replay will be 2.
  const R = await recorded(page), run = runOf(R, 0, 2);
  const fixed = await page.evaluate(() => window.Landing.TIMELINE.filter(s => s.stage === 'schematic' || s.stage === 'inset').reduce((a, s) => a + s.ms, 0));
  expect(R.submits.length, 'submits so far: the click and the mid-run click').toBe(2);
  expect(played(run.log), 'the stages the click played, in order').toEqual(RUN);
  const done = run.log.find(e => e.stage === 'done'), took = done ? Math.round(done.t - R.submits[0]) : null;
  expect.soft(took, 'click → done, ms (about 8–9 s; at most 20 s)').toBeLessThanOrEqual(20_000);
  expect.soft(took, `click → done, ms: at least TIMELINE's schematic + inset (${fixed} ms), so it really played`).toBeGreaterThanOrEqual(fixed);

  // The mid-run click was ignored: it landed in schematic, every stage was
  // written exactly once (a restart rewrites schematic), and once in the inset
  // the schematic stayed there.
  const at = name => (run.log.find(e => e.stage === name) || {}).t;
  expect.soft([R.submits[1] >= at('schematic'), R.submits[1] < at('inset')], 'the mid-run click landed during schematic (after it began, before inset)').toEqual([true, true]);
  expect.soft(played(run.writes), 'every data-hero write from the first click to done: each stage exactly once').toEqual(RUN);
  expect.soft(run.states.filter(s => ['sketch', 'solid', 'lit', 'done'].includes(s.hero) && s.where !== 'inset').map(s => `${s.hero}: ${s.where}`),
    'states after inset with the schematic anywhere but the inset (put back in the stage, or gone)').toEqual([]);

  // The step line marks each phase as it starts.
  expect.soft(Object.fromEntries(RUN.map(s => [s, settled(run.states, s).steps])), 'the current step at the end of each stage')
    .toEqual(Object.fromEntries(RUN.map(s => [s, [STEP_OF[s]]])));

  // The schematic draws in the stage while the board dims, then sits in the inset.
  expect.soft(R.drawing.schematic, 'during schematic a path is part-drawn (0 < stroke-dashoffset < 1)').toBe(true);
  expect.soft(Object.fromEntries(['schematic', 'sketch', 'solid', 'lit', 'done'].map(s => [s, settled(run.states, s).where])),
    'where the schematic shows at the end of each stage').toEqual({ schematic: 'stage', sketch: 'inset', solid: 'inset', lit: 'inset', done: 'inset' });
  expect.soft(R.dim.schematic, 'the frame dims while the schematic draws (its least opacity)').toBeLessThan(0.5);
  expect.soft(R.dim.done, 'the frame is back to full by the end (its least opacity in done)').toBeGreaterThanOrEqual(0.99);

  // The button shows only at the end.
  expect.soft(run.states.filter(s => s.open && s.hero !== 'done').map(s => s.hero), 'stages in which the end button showed before done').toEqual([]);
  expect.soft(settled(run.states, 'done').open, 'the end button shows at done').toBe(true);

  // The frame, driven through its stages (needs #167's 'empty').
  expect.soft(dedupe(run.states.map(s => s.frame).filter(Boolean)), 'the frame\'s Hero.current() through the run').toEqual(FRAME_RUN);

  // A second click replays: back through schematic, full size, the board bare again.
  await button.click();
  const replay = async () => runOf(await recorded(page), 2);
  await expect.poll(async () => played((await replay()).log)[0] ?? null, { message: 'a second click replays: the first stage it plays', timeout: 5000 }).toBe('schematic');
  await expect.poll(async () => (await replay()).states.some(s => s.hero === 'schematic' && s.where === 'stage'),
    { message: 'the replay draws the schematic full size in the stage again', timeout: 5000 }).toBe(true);
  await expect.poll(async () => (await replay()).states.some(s => s.frame === 'empty'),
    { message: 'the replay puts the frame back to the empty board (#167\'s \'empty\')', timeout: 5000 }).toBe(true);
  expect(new URL(page.url()).pathname, 'still on the landing after the replay').toBe(PAGE);
  expect(errors).toEqual([]);
});

test('with reduced motion, a click on a light-bulb request goes straight to the end: done with no stage played in between (at most a flash), nothing drawing, the schematic in the inset, the frame lit, the button showing; the box keeps the visitor\'s text', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await stubNetwork(page);
  await page.addInitScript(installRecorder);
  await open(page);

  await expect(page.locator('#hero-stage iframe'), 'the hero frame in #hero-stage').toHaveCount(1);
  await frameReady(page);
  const ask = page.getByRole('textbox', { name: 'Ask Edison' });
  await ask.fill(LED_ASK);
  await page.getByRole('button', { name: 'Ask Edison' }).click();
  await expect(page.locator('section.ed-stage'), 'reduced motion: the click reaches done').toHaveAttribute('data-hero', 'done', { timeout: 5000 });
  expect(new URL(page.url()).pathname, 'still on the landing').toBe(PAGE);
  await expect(ask, 'a box with a request keeps it (only an empty box is filled)').toHaveValue(LED_ASK);
  await nextFrames(page);

  const R = await recorded(page), run = runOf(R, 0);
  const done = run.log.find(e => e.stage === 'done');
  expect.soft(done ? Math.round(done.t - R.submits[0]) : null, 'click → done with the frame ready, ms (at once)').toBeLessThanOrEqual(1500);
  // Time spent in each stage before done; stages set in the same task as the
  // next one take 0 ms (never painted).
  const between = run.log.map((e, i) => ({ stage: e.stage, ms: i + 1 < run.log.length ? run.log[i + 1].t - e.t : 0 }))
    .filter(e => e.stage !== 'done' && e.stage !== 'idle' && e.stage !== null);
  expect.soft(between.reduce((a, e) => a + e.ms, 0), `time in stages before done, ms (at most a flash): ${JSON.stringify(between)}`).toBeLessThanOrEqual(250);
  expect.soft(Object.keys(R.drawing), 'stages in which a schematic path was seen part-drawn (none: no animation)').toEqual([]);

  expectEndState(await readEnd(page), 'reduced motion');
  expect(errors).toEqual([]);
});

// The likely venue failure: the 3D CDNs unreachable, so the frame never gets a
// Hero ("THREE is not defined" inside it). The landing must still end the run
// cleanly on what it has: the schematic, full size, and the button.
test('with the 3D CDNs down (cdnjs and unpkg unreachable), a click still ends cleanly: done within 15 s, the schematic stays drawn and full size in #hero-stage (never in the inset, which stays hidden), the steps stop on SCHEMATIC, "Open in the simulator +" shows; no error from the landing itself', async ({ page }) => {
  test.setTimeout(45_000);
  const errors = watchLandingErrors(page);
  await stubNetwork(page);
  // page.route also catches the hero frame's requests.
  await page.route('https://cdnjs.cloudflare.com/**', route => route.abort());
  await page.route('https://unpkg.com/**', route => route.abort());
  await page.addInitScript(installRecorder);
  await open(page);

  // The showing schematics: their box, and where each sits.
  const schematics = () => page.evaluate(() => {
    const opacity = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
    const showing = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && opacity(el) > 0.01;
    return [...document.querySelectorAll('svg.ed-schematic')].filter(showing).map(s => {
      const b = s.getBoundingClientRect();
      return { inHeroStage: !!s.closest('#hero-stage'), inInset: !!s.closest('.ed-inset'), box: [b.left, b.top, b.width, b.height].map(Math.round) };
    });
  });

  const stage = page.locator('section.ed-stage');
  await page.getByRole('button', { name: 'Ask Edison' }).click();
  await expect(stage, 'the run starts on the schematic').toHaveAttribute('data-hero', 'schematic', { timeout: 5000 });
  const whileDrawing = await schematics();
  expect(whileDrawing.map(s => s.inHeroStage), 'the schematic drawing in #hero-stage').toEqual([true]);
  await expect(stage, 'with no frame, the run still ends (data-hero done) within 15 s').toHaveAttribute('data-hero', 'done', { timeout: 15_000 });
  await expect.poll(() => openOpacity(page), { message: 'the end button fades in to full opacity', timeout: 3000 }).toBeGreaterThan(0.99);
  await nextFrames(page);

  const atEnd = await schematics();
  expect.soft(atEnd.map(s => ({ inHeroStage: s.inHeroStage, inInset: s.inInset })), 'the schematics showing at the end: one, in #hero-stage, not in the inset')
    .toEqual([{ inHeroStage: true, inInset: false }]);
  if (atEnd.length === 1 && whileDrawing.length === 1)
    expect.soft(atEnd[0].box, 'the schematic stays full size: its box (left, top, width, height) as while it drew').toEqual(whileDrawing[0].box);
  const left = await page.evaluate(() => {
    const svg = document.querySelector('#hero-stage svg.ed-schematic'), inset = document.querySelector('.ed-stage figure.ed-inset');
    return {
      insetHidden: !!inset && inset.hidden && inset.getClientRects().length === 0,
      undrawn: svg ? [...svg.querySelectorAll('path')].filter(p => { const cs = getComputedStyle(p); return cs.strokeDasharray !== 'none' && parseFloat(cs.strokeDashoffset) > 0.001; }).length : null,
      faint: svg ? [...svg.querySelectorAll('text, circle')].filter(e => Number(getComputedStyle(e).opacity) < 0.99).map(e => e.textContent.trim() || 'a dot') : null,
    };
  });
  expect.soft(left, 'the inset stays hidden; the schematic left in the stage is fully drawn, its dots and labels shown')
    .toEqual({ insetHidden: true, undrawn: 0, faint: [] });
  await expect.soft(page.locator('.ed-stage [data-step][data-current]'), 'the step line stops on SCHEMATIC').toHaveText(['SCHEMATIC']);

  const R = await recorded(page), run = runOf(R, 0);
  expect.soft(played(run.log), 'the stages the run played: the schematic, then done (nothing it can\'t show)').toEqual(['schematic', 'done']);
  expect.soft(run.states.filter(s => s.where === 'inset').map(s => s.hero), 'stages in which the schematic showed in the inset').toEqual([]);

  const endButton = page.locator('a.ed-open');
  await expect(endButton, '"Open in the simulator +" still shows').toBeVisible();
  await expect.soft(endButton, 'the end button').toHaveText('Open in the simulator +');
  expect.soft(await endButton.getAttribute('href'), 'the button\'s href').toMatch(new RegExp(`${OPEN_END.replace(/[.?]/g, '\\$&')}$`));
  expect(errors, 'errors from the landing itself (the frame\'s and the blocked CDNs\' left out)').toEqual([]);
});

// ── 5. The callouts on the turning board (#168) ───────────────

// Each callout's caps label → the Hero.anchors() key its dot sits on
// (test/hero-callouts.test.js pins the data).
const CALLOUT_ANCHOR = {
  'HOLE GRID': 'holes', 'POWER RAILS': 'rail', 'LED1': 'LED1', 'R1 470 Ω': 'R1',
  'CIRCUIT PATH': 'path', 'TRANSPARENT CASING': 'casing', 'BAT1 9 V': 'BAT1',
};
const IDLE_CALLOUTS = ['HOLE GRID', 'POWER RAILS'];
const HINT      = 'rgb(138, 138, 138)';   // grey TEXT (#8A8A8A)
const DOT_PX    = 12;                     // a dot within this of its anchor's place on the page
// The follow check turns the board faster: OrbitControls turns it per frame,
// and headless software WebGL draws ~13 frames a second, so at the hero's 0.6
// an anchor moves ~1.5 px a second. At 8 it moves ~20 px a second, ~1.6 px a
// frame. The landing still reads the real Hero.anchors().
const FAST_SPIN = 8;

// Runs before the page's scripts (top frame only). window.__callouts() reads
// every callout in one pass, keyed by its label: how much its title and dot
// show (0 … 1, opacity with the parents'), the dot's centre, its anchor's
// place on the page (null when Hero.anchors() has no such key), the label's
// and subline's boxes, their paint, and its leader's ends in page px.
function installCalloutProbe(ANCHOR) {
  if (window.top !== window) return;
  const opacity = el => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const seen   = el => (el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' ? opacity(el) : 0);
  const rect   = el => { const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; };
  const centre = el => { const b = el.getBoundingClientRect(); return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 }; };
  const text   = el => el.textContent.replace(/\s+/g, ' ').trim();
  const paint  = el => (el instanceof SVGElement ? getComputedStyle(el).fill : getComputedStyle(el).color);
  // A point along an SVG path, in page (client) px.
  const along  = (path, at) => { const p = path.getPointAtLength(at), m = path.getScreenCTM(); return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }; };
  const idOf   = el => { const h = el && el.closest('[data-callout]'); return h ? h.getAttribute('data-callout') : null; };
  window.__callouts = () => {
    const f = document.querySelector('#hero-stage iframe'), fr = f && f.getBoundingClientRect();
    let anchors = null;
    try { anchors = f.contentWindow.Hero.anchors(); } catch { /* no frame, or no Hero yet */ }
    const out = {};
    for (const label of Object.keys(ANCHOR)) {
      const title = [...document.querySelectorAll('.ed-callout-label')].find(e => text(e) === label) || null;
      const id = idOf(title);
      const part = cls => (id === null ? null : [...document.querySelectorAll(cls)].find(e => idOf(e) === id) || null);
      const dot = part('.ed-callout-dot'), line = part('.ed-callout-line'), sub = part('.ed-callout-sub');
      const a = anchors && anchors[ANCHOR[label]];
      let ends = null;
      try {   // a path with no d yet (a callout never drawn) has no points
        const len = line.getTotalLength();
        ends = { start: along(line, 0), end: along(line, len), nearEnd: along(line, Math.max(0, len - 4)) };
      } catch { /* no line, or nothing drawn */ }
      out[label] = {
        id, title: seen(title), dotSeen: seen(dot),
        dot: dot ? centre(dot) : null,
        anchor: a && fr ? { x: fr.left + a.x * fr.width, y: fr.top + a.y * fr.height, visible: !!a.visible } : null,
        titleBox: title ? rect(title) : null, subBox: sub ? rect(sub) : null,
        paint: title ? paint(title) : null, subPaint: sub ? paint(sub) : null,
        line: ends,
      };
    }
    return out;
  };
}

const callouts = page => page.evaluate(() => window.__callouts());
// 'shown' (title and dot at full opacity), 'hidden' (neither shows) or 'partial'.
const stateOf  = c => (c.title > 0.99 && c.dotSeen > 0.99 ? 'shown' : c.title < 0.01 && c.dotSeen < 0.01 ? 'hidden' : 'partial');
const summary  = C => ({
  shown:   Object.keys(C).filter(l => stateOf(C[l]) === 'shown').sort(),
  partial: Object.keys(C).filter(l => stateOf(C[l]) === 'partial').sort(),
});
const gap      = (p, q) => (p && q ? Math.hypot(p.x - q.x, p.y - q.y) : Infinity);
const toBox    = (p, b) => (p && b ? Math.hypot(Math.max(b.left - p.x, 0, p.x - b.right), Math.max(b.top - p.y, 0, p.y - b.bottom)) : Infinity);
const union    = (a, b) => (!a ? b : !b ? a : { left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) });
const overlap  = (a, b) => !!a && !!b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

// The HUD pieces a label must not cover, where they show.
const hudBoxes = page => page.evaluate(() => {
  const box = sel => {
    const e = document.querySelector(sel);
    if (!e || !e.getClientRects().length || getComputedStyle(e).visibility === 'hidden') return null;
    const b = e.getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  };
  const inset = box('.ed-stage figure.ed-inset'), cap = box('.ed-stage figure.ed-inset figcaption');
  return {
    'the BREADBOARD title block': box('.ed-hud-title'),
    'the course link': box('.ed-hud-link'),
    'the SCHEMATIC VIEW inset': inset && cap ? { left: Math.min(inset.left, cap.left), top: Math.min(inset.top, cap.top), right: Math.max(inset.right, cap.right), bottom: Math.max(inset.bottom, cap.bottom) } : inset,
    'the end button': box('a.ed-open'),
  };
});

// Each shown label's block (title and subline) against the others' and the HUD's.
function clashes(C, shown, hud) {
  const blocks = shown.map(l => [l, union(C[l].titleBox, C[l].subBox)]);
  const out = [];
  blocks.forEach(([l, b], i) => {
    for (const [m, c] of blocks.slice(i + 1)) if (overlap(b, c)) out.push(`${l} overlaps ${m}`);
    for (const [name, h] of Object.entries(hud)) if (overlap(b, h)) out.push(`${l} overlaps ${name}`);
  });
  return out;
}

test('at idle the turning board carries two callouts, HOLE GRID and POWER RAILS: each dot sits on its anchor (within 12 px, through the frame\'s rect) and follows it as the board turns while the labels never move; caps titles in the ink over grey sublines, clear of the HUD; under 720 px only POWER RAILS; console clean', async ({ page }) => {
  test.setTimeout(45_000);
  const errors = watchErrors(page);
  await stubNetwork(page);
  await page.addInitScript(installCalloutProbe, CALLOUT_ANCHOR);
  await open(page);
  await frameReady(page);

  await expect.poll(async () => summary(await callouts(page)), { message: 'the callouts showing at idle', timeout: 5000 })
    .toEqual({ shown: IDLE_CALLOUTS, partial: [] });
  expect.soft(await page.locator('.ed-stage svg.ed-callouts').count(), 'one svg.ed-callouts over the frame').toBe(1);
  const C = await callouts(page);
  for (const l of IDLE_CALLOUTS) {
    expect.soft([C[l].paint, C[l].subPaint], `${l}: the title in the ink, the subline in the grey`).toEqual([INK, HINT]);
    expect.soft(gap(C[l].dot, C[l].anchor), `${l}: dot to anchor, px`).toBeLessThanOrEqual(DOT_PX);
  }
  expect.soft(clashes(C, IDLE_CALLOUTS, await hudBoxes(page)), 'labels covering each other or the HUD').toEqual([]);

  // ~1.2 s of a faster turn, read every ~50 ms: the dots stay on the moving
  // anchors, and the labels don't move at all.
  const spin = await page.evaluate(speed => {
    const c = document.querySelector('#hero-stage iframe').contentWindow.App.controls, was = c.autoRotateSpeed;
    c.autoRotateSpeed = speed;
    return was;
  }, FAST_SPIN);
  const samples = await page.evaluate(ms => new Promise(resolve => {
    const out = [], t0 = performance.now();
    const tick = () => { out.push(window.__callouts()); if (performance.now() - t0 < ms) setTimeout(tick, 50); else resolve(out); };
    tick();
  }), 1200);
  await page.evaluate(was => { document.querySelector('#hero-stage iframe').contentWindow.App.controls.autoRotateSpeed = was; }, spin);

  const moved = Math.max(...IDLE_CALLOUTS.flatMap(l => samples.map(S => gap(S[l].anchor, samples[0][l].anchor))));
  expect(moved, 'the board turned: the farthest an idle anchor moved over the samples, px').toBeGreaterThan(5);
  for (const l of IDLE_CALLOUTS) {
    expect.soft(Math.max(...samples.map(S => gap(S[l].dot, S[l].anchor))), `${l}: the dot's farthest from its moving anchor over ${samples.length} reads, px`).toBeLessThanOrEqual(DOT_PX);
    const drift = Math.max(...samples.flatMap(S => ['titleBox', 'subBox'].flatMap(k => (S[l][k] && samples[0][l][k]
      ? ['left', 'top', 'right', 'bottom'].map(e => Math.abs(S[l][k][e] - samples[0][l][k][e])) : [Infinity]))));
    expect.soft(drift, `${l}: how far its title or subline moved while the board turned, px`).toBe(0);
  }

  // A phone: room for one, the rails.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => summary(await callouts(page)), { message: 'under 720 px: only the rails', timeout: 5000 })
    .toEqual({ shown: ['POWER RAILS'], partial: [] });
  const N = await callouts(page);
  expect.soft(gap(N['POWER RAILS'].dot, N['POWER RAILS'].anchor), 'under 720 px: the rails dot to its anchor, px').toBeLessThanOrEqual(DOT_PX);
  expect(errors).toEqual([]);
});

test('after seek("done") the callouts point at the circuit: LED1 and R1 470 Ω, dots on their anchors, each leader from its dot to a horizontal run at its label; HOLE GRID and POWER RAILS gone; BAT1 9 V, CIRCUIT PATH and TRANSPARENT CASING exactly when Hero.anchors() has BAT1 / path / casing in view (#171); no label covers another, the HUD, the inset or the end button, and both links stay clickable; console clean', async ({ page }) => {
  test.setTimeout(45_000);   // the hero frame renders in software WebGL
  const errors = watchErrors(page);
  await stubNetwork(page);
  await page.addInitScript(installCalloutProbe, CALLOUT_ANCHOR);
  await open(page);
  expect(await page.evaluate(async () => { await window.Landing.seek('done'); return document.querySelector('section.ed-stage').getAttribute('data-hero'); }), 'after seek("done"), data-hero').toBe('done');

  const has = await page.evaluate(() => {
    const a = document.querySelector('#hero-stage iframe').contentWindow.Hero.anchors(), inView = k => !!(a[k] && a[k].visible);
    return { path: inView('path'), casing: inView('casing'), BAT1: inView('BAT1'), keys: Object.keys(a).sort() };
  });
  // A callout shows exactly when its anchor is in view. path and casing come
  // with #171, which also moves BAT1's anchor to the battery's front face (in
  // view at solid, lit and done); until then each missing one is checked hidden.
  const missing = [['path', 'CIRCUIT PATH'], ['casing', 'TRANSPARENT CASING'], ['BAT1', 'BAT1 9 V']].filter(([k]) => !has[k]);
  if (missing.length)
    test.info().annotations.push({ type: 'note', description: `Hero.anchors() at done: ${has.keys.join(', ')}. Not in view (#171): ${missing.map(([k, l]) => `${k}, so ${l} is checked hidden`).join('; ')}.` });

  await expect.poll(async () => stateOf((await callouts(page)).LED1), { message: 'the LED1 callout shows at done', timeout: 5000 }).toBe('shown');
  await expect.poll(async () => summary(await callouts(page)).partial, { message: 'every callout settled, fully in or out', timeout: 3000 }).toEqual([]);
  const C = await callouts(page);
  const want = ['LED1', 'R1 470 Ω', ...(has.BAT1 ? ['BAT1 9 V'] : []), ...(has.path ? ['CIRCUIT PATH'] : []), ...(has.casing ? ['TRANSPARENT CASING'] : [])].sort();
  expect.soft(summary(C).shown, 'the callouts showing at done (each one whose anchor is in view)').toEqual(want);
  expect.soft(IDLE_CALLOUTS.map(l => stateOf(C[l])), 'HOLE GRID and POWER RAILS at done').toEqual(['hidden', 'hidden']);

  for (const l of summary(C).shown) {
    const c = C[l];
    expect.soft(gap(c.dot, c.anchor), `${l}: dot to anchor, px`).toBeLessThanOrEqual(DOT_PX);
    expect.soft(c.line, `${l}: its leader, a .ed-callout-line path`).not.toBeNull();
    if (!c.line) continue;
    expect.soft(gap(c.line.start, c.dot), `${l}: the leader starts at the dot, px`).toBeLessThanOrEqual(2);
    expect.soft(Math.abs(c.line.end.y - c.line.nearEnd.y), `${l}: the leader ends in a horizontal run (y change over its last 4 px)`).toBeLessThanOrEqual(0.5);
    expect.soft(toBox(c.line.end, c.titleBox), `${l}: the leader ends at its title, px from the title's box`).toBeLessThanOrEqual(16);
  }
  expect.soft(clashes(C, summary(C).shown, await hudBoxes(page)), 'labels covering each other, the HUD, the inset or the end button').toEqual([]);

  const hits = await page.evaluate(() => ['.ed-hud-link', 'a.ed-open'].map(sel => {
    const e = document.querySelector(sel), b = e.getBoundingClientRect(), t = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    return !!t && e.contains(t);
  }));
  expect.soft(hits, 'a click at the course link\'s and the end button\'s centres reaches them (the callouts\' SVG doesn\'t cover them)').toEqual([true, true]);
  expect(errors).toEqual([]);
});

test('the callouts\' loop runs only while the stage is on screen: the landing\'s requestAnimationFrame calls climb while it shows, stay flat over 500 ms once it is scrolled out of view, and climb again when it is back; console clean', async ({ page }) => {
  test.setTimeout(45_000);   // the hero frame renders in software WebGL
  const errors = watchErrors(page);
  await stubNetwork(page);
  // Count the landing window's rAF calls (the frame's own loop is its window's, not counted).
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const real = window.requestAnimationFrame;
    window.__rafCalls = 0;
    window.requestAnimationFrame = function (cb) { window.__rafCalls++; return real.call(window, cb); };
  });
  await open(page);
  await frameReady(page);
  const callsIn = ms => page.evaluate(ms => new Promise(r => { const a = window.__rafCalls; setTimeout(() => r(window.__rafCalls - a), ms); }), ms);
  const stageBottom = () => page.evaluate(() => document.querySelector('section.ed-stage').getBoundingClientRect().bottom);

  // Just after Hero.ready the frame is still warming software WebGL and the
  // bloom, and the page gets only ~4–6 frames a second: let it settle, then
  // count over a full second.
  await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
  expect(await callsIn(1000), 'the landing\'s rAF calls in 1 s with the stage on screen (the callouts\' loop runs)').toBeGreaterThanOrEqual(2);

  // Room to scroll past the stage, then down until it is above the viewport.
  await page.evaluate(() => {
    const room = document.createElement('div');
    room.style.height = '3000px';
    document.body.appendChild(room);
    window.scrollTo(0, document.scrollingElement.scrollHeight);
  });
  await expect.poll(stageBottom, { message: 'the stage is scrolled out of view (its bottom, px)' }).toBeLessThan(0);
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));   // the IntersectionObserver's callback lands
  expect(await callsIn(500), 'the landing\'s rAF calls in 500 ms with the stage off screen').toBe(0);

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(stageBottom, { message: 'the stage is back in view (its bottom, px)' }).toBeGreaterThan(0);
  await expect.poll(() => callsIn(1000), { message: 'the landing\'s rAF calls in 1 s once the stage is back', timeout: 6000 }).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});
