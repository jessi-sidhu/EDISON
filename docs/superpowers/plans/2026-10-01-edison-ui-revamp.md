# Edison UI revamp and ENSC 220 course hub — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo each task is one GitHub issue, worked through `/start-task <n>` (scout → test-writer → builder → reviewer) and finished with `/ship`. The test-writer writes the test steps; the builder writes the implementation steps.

**Goal:** an opt-in "Edison" identity for Plugged (landing page, editor skin) and an ENSC 220 course hub with real labs, a live lab sheet and textbook, and dummy grades, Canvas sync and TA view. The classic UI stays the default and untouched.

**Architecture:**
- **Everything Edison lives in new files:** `Plugged/edison/` holds the pages, tokens, flag and course sections; `circuit3d/css/theme-edison.css` holds the editor skin.
- **A tiny flag script** sets `<html data-ui="edison|classic">`.
- **The classic UI gets only additive hooks:** two tags in `index.html`, a CSS-variable read in `scene.js`, `?circuit=` in `viewer.html`, `?lab=` in `labs.js`, two links, and two dummy routes.
- **Data comes from JS modules** (UMD, testable in Node), because the static server never serves `.json`.

**Tech stack:** vanilla JS (UMD modules), CSS custom properties, three.js r128 (existing), Google Fonts (Barlow, Barlow Condensed, Barlow Semi Condensed, B612, STIX Two Text), Node `http` server (existing), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-edison-ui-revamp-design.md`. Read §3 (the tells), §4 (tokens) and §4a (the steal map) before any visual work.

## Global constraints

- Classic stays the default. `?ui=classic` must give today's UI exactly, and the full classic e2e suite must pass with Edison off.
- Never edit an existing classic CSS rule. Edison overrides live only in Edison files, scoped under `html[data-ui="edison"]`.
- **Tokens** (verbatim from spec §4):

  | Token | Hex |
  |---|---|
  | `--pad` | `#E9EFE2` |
  | `--pad-grid` | `#CFDCC3` |
  | `--graphite` | `#262927` |
  | `--graphite-2` | `#4D534E` |
  | `--mask` | `#1D6A45` |
  | `--bus-red` | `#C4333B` |
  | `--bus-blue` | `#2C5CC0` |
  | `--bezel` | `#1E2225` |
  | `--ch1` | `#E6B72E` |
  | `--ch2` | `#38B2D4` |
  | `--sfu` | `#A6192E` |

- **Fonts:** Barlow 400/500/600, Barlow Semi Condensed, Barlow Condensed 600, B612 (measured values only), STIX Two Text (textbook only).
- **Banned** (enforced by the design guard):
  - Inter, Space Grotesk, Geist, Instrument Serif, Fraunces;
  - `text-transform: uppercase`, `backdrop-filter`, `background-clip: text`;
  - gradients except the pad grid;
  - `→` in button or link text;
  - emoji in the nav;
  - purple hues (250–290°, saturation above 40%);
  - `A · B · C` meta strings.
- **Type scale:** 13 / 16 / 20 / 25 / 31 / 39 / 49 px. Body is 16 px at 1.5 (STIX at 1.6). Lines are 75 characters or fewer.
- **Shape:** radius 2 px on controls, 4 px on panels, 0 on bezels. No box-shadows.
- **Copy:** sentence case. Buttons name what they do.
- **The name line, verbatim:** "Edison: electrical design and interactive simulation of networks."
- **SFU:** no SFU logo. The footer reads "A demo course page. Not an official SFU site." No real person's name anywhere; the instructor is "Instructor".
- **Dummy features** say so in the UI ("Sample data", "(demo)").
- **Each issue** is about 300 changed lines or fewer, in its own worktree at `.worktrees/<n>`.
- **Browser tests** run with `--workers=1` and a distinct `E2E_PORT`, and aim at 3D parts only after a drawn frame (the `drawn(page)` helper in `e2e/bench-supply-two-channel.spec.js`).
- **Golden prompt files** (`test/fixtures/prompts/`) must not change.

## Review focus

1. **Deployed hosting has no Node server**, so `/api/course/*` is a 404 there. The Canvas push and the TA feed must fall back to built-in sample data and still show "(demo)", never an error. (Tests: E8, E9.)
2. **Blocked localStorage** (private window, blocked storage): `?ui=edison` must still render Edison for that page load, and the page must never throw. (Test: E1.)
3. **Unknown `?lab=` or a bad `?circuit=` path**, such as `?lab=lab9` or `?circuit=../backend/server.js`: the editor loads normally with a hint, and the viewer refuses anything outside `edison/` or `circuit3d/labs/`, or anything not ending in `.sparky`. (Tests: E1 viewer, E5.)
4. **Switching UI mid-session**, such as opening a lab from the course in Edison and then switching to classic: the lab sheet keeps working, and no Edison styles leak into classic. (Test: E2.)
5. **Lab checks while the circuit is half-built**: missing parts and floating nodes show *Not yet*, never *Check failed* or a crash. (Test: E5.)

---

## File map

| File | Status | Responsibility | Task |
|---|---|---|---|
| `docs/API-CONTRACT.md` | modify | New section "Edison and the course hub" | E0 |
| `Plugged/edison/tokens.css` | create | The only source of Edison colours, type, radius and grid | E1 |
| `Plugged/edison/fonts.css` | create | The Google Fonts import (Edison pages and the skin only) | E1 |
| `Plugged/edison/ui-flag.js` | create | `UiFlag.resolve/apply/switchTo`, `<html data-ui>`, corner switch | E1 |
| `Plugged/edison/DESIGN.md` | create | A copy of spec §3, §4 and §4a for agents | E1 |
| `Plugged/test/edison-design-guard.test.js` | create | Scans Edison files for banned patterns | E1 |
| `Plugged/test/ui-flag.test.js` | create | Flag logic | E1 |
| `Plugged/circuit3d/js/scene.js` | modify (1 hook) | Scene background from `--scene-bg` when set | E1 |
| `Plugged/circuit3d/viewer.html` | modify (1 hook) | `?circuit=` with a path allow-list | E1 |
| `Plugged/circuit3d/index.html` | modify (2 tags) | Load `ui-flag.js`, `fonts.css`, `tokens.css`, `theme-edison.css` | E2 |
| `Plugged/circuit3d/css/theme-edison.css` | create | Editor skin, scoped to `html[data-ui="edison"]` | E2 |
| `Plugged/edison/skin.js` | create | Value highlighting and part-label annotations in the chat | E2 |
| `Plugged/edison/index.html`, `landing.css`, `landing.js` | create | The Edison landing page | E3 |
| `Plugged/edison/demo/inverting-amp.sparky` | create | The landing demo circuit | E3 |
| `Plugged/edison/course.html`, `course.css`, `course.js` | create | Course shell, nav, hash routes, Home, Labs table | E4 |
| `Plugged/edison/course-data.js` | create | Course content and sample data (UMD) | E4 |
| `Plugged/edison/sections/{textbook,grades,ta}.{js,css}` | create (stubs in E4) | One file per section | E4, then E7/E8/E9 |
| `Plugged/landing.html`, `Plugged/dashboard.html` | modify (1 link each) | "Try the Edison UI" | E4 |
| `Plugged/circuit3d/labs/sheets.js` | create | Lab-sheet data (UMD): steps and checks | E5 (Lab 1), E6 (Lab 2) |
| `Plugged/circuit3d/js/tools/lab-sheet.js` | create | Panel and live check evaluation | E5 |
| `Plugged/circuit3d/css/lab-sheet.css` | create | Lab sheet styles, classic tokens with Edison overrides | E5 |
| `Plugged/circuit3d/js/tools/labs.js` | modify | Honour `?lab=`, list Lab 2 | E5, E6 |
| `Plugged/backend/server.js` | modify | `POST /api/course/canvas/sync`, `GET /api/course/ta-feed` | E8, E9 |

**Parallel groups:**
- **G1:** E0 → E1, in order.
- **G2:** E2, E3, E4, E5 in parallel. E2 and E5 both add a tag to `circuit3d/index.html`; the second to ship rebases.
- **G3:** E6 (needs E5), plus E7, E8, E9 (need E4) in parallel.
- **G4:** E10.

---

### Task E0: Contract — Edison and the course hub

**Files:** modify `docs/API-CONTRACT.md` (a new top-level section before "Testing contract").

**Interfaces:** consumes nothing; produces every name used below.

- [ ] **Step 1: Add the section, verbatim**

```markdown
## Edison and the course hub (spec 2026-10-01-edison-ui-revamp)

### UI flag (`Plugged/edison/ui-flag.js`, `window.UiFlag`)
- `UiFlag.resolve(search, stored)` → `'edison' | 'classic'`. `search` is `location.search`; `stored` is the saved value or null. `?ui=edison|classic` wins, then a valid stored value, else `'classic'`.
- `UiFlag.apply(doc, ui)` sets `doc.documentElement.dataset.ui = ui`.
- `UiFlag.switchTo(ui)` saves `ui` (try/catch) and reloads without the `ui` query param.
- Storage key: `plugged.ui`. Loaded first in `<head>`; never throws.

### Page hooks
- `circuit3d/index.html?lab=<id>` loads that lab's starter circuit and opens its lab sheet. An unknown id shows a hint and loads nothing.
- `circuit3d/viewer.html?circuit=<path>` renders that `.sparky`. Only paths under `edison/` or `circuit3d/labs/` that end in `.sparky` are allowed; anything else falls back to `../demo.sparky`.
- `circuit3d/js/scene.js` uses the CSS variable `--scene-bg` (a hex colour) as the scene background when it is set on `<html>`.

### Lab sheets (`circuit3d/labs/sheets.js`, `window.LabSheets`)
- `LabSheets.get(id)` → `Sheet | null`. `LabSheets.ids()` → `string[]`.
- `Sheet = { id, code, title, week, starter, steps: Step[] }`. `code` is like "LAB-02"; `starter` is a path relative to `circuit3d/`.
- `Step = { n, text, hint, check }`.
- `check` is one of:
  - `{ kind: 'part', label, near?: string }`: the part exists (optionally across the centre gap).
  - `{ kind: 'measure', label, quantity: 'I'|'V', expect, unit: 'mA'|'V', tol }`: |measured − expect| ≤ tol × |expect|.
  - `{ kind: 'peak', label, pin, expect, unit: 'V', tol }`: the largest |V| seen at that pin since Run.
  - `{ kind: 'manual' }`: the student ticks it.
- `LabSheets.evaluate(check, readings, board, memo)` → `'passed' | 'failed' | 'pending'`. It never throws; anything missing or floating gives `'pending'`. `memo` is a per-run object for `peak`.

### Course data (`Plugged/edison/course-data.js`, `window.CourseData`)
- `{ course: { code, title, term, instructor: 'Instructor' }, announcements[{ date, text }], labs[{ id, code, title, due, status: 'open'|'done'|'locked', opens? }], chapters[{ n, title, sections[{ n, title, body, figure? }] }], grades: { students[{ name, lab1, lab2, prelab1 }], sample: true }, heatmap: { lab, cells[{ hole, count, note }], total }, feed[{ minsAgo, lab, step, label, text }] }`
- Sample names are invented. `grades.sample` is always true.

### Dummy endpoints (local server only)
- `POST /api/course/canvas/sync` → `200 { ok: true, demo: true, syncedAt: <ISO> }`
- `GET /api/course/ta-feed` → `200 { demo: true, events: [{ at: <ISO>, lab, step, label, text }] }` (sample events, timestamps relative to now)
- Callers fall back to `CourseData` sample data when these 404 (deployed hosting has no Node server).
```

- [ ] **Step 2:** `cd Plugged && npm run check && npm test` (docs only, so both stay green).
- [ ] **Step 3:** commit "Contract: Edison flag, lab sheets, course data and dummy course endpoints", then `/ship`.

---

### Task E1: Tokens, fonts, flag, design guard and the two engine hooks

**Files:**
- Create: `Plugged/edison/tokens.css`, `fonts.css`, `ui-flag.js`, `DESIGN.md`
- Create tests: `test/ui-flag.test.js`, `test/edison-design-guard.test.js`, `test/viewer-circuit-param.test.js`
- Modify: `circuit3d/js/scene.js` (1 hook), `circuit3d/viewer.html` (1 hook)

**Interfaces:**
- Consumes: the E0 contract.
- Produces: `UiFlag.resolve/apply/switchTo`; CSS tokens `--pad … --sfu`, `--font-ui`, `--font-num`, `--font-text`, `--font-display`; the `--scene-bg` hook; `viewer.html?circuit=`; and `allowedCircuit(path)` exported from `edison/ui-flag.js` as `UiFlag.allowedCircuit`, used by the viewer.

- [ ] **Step 1: Write the failing tests**

```js
// test/ui-flag.test.js
import { test, expect } from 'vitest';
const UiFlag = require('../edison/ui-flag.js');

test.each([
  ['?ui=edison', null, 'edison'], ['?ui=classic', 'edison', 'classic'],
  ['', 'edison', 'edison'], ['', null, 'classic'], ['', 'purple', 'classic'],
  ['?ui=EDISON', null, 'classic'], ['?lab=lab2&ui=edison', null, 'edison'],
])('resolve(%s, %s) → %s', (search, stored, want) => {
  expect(UiFlag.resolve(search, stored)).toBe(want);
});

test('apply sets data-ui on <html>', () => {
  const doc = { documentElement: { dataset: {} } };
  UiFlag.apply(doc, 'edison');
  expect(doc.documentElement.dataset.ui).toBe('edison');
});

test.each([
  ['edison/demo/inverting-amp.sparky', true], ['circuit3d/labs/lab1.sparky', true],
  ['../backend/server.js', false], ['edison/../backend/x.sparky', false],
  ['edison/demo/x.js', false], ['https://evil.example/x.sparky', false], ['', false],
])('allowedCircuit(%s) → %s', (p, ok) => {
  expect(UiFlag.allowedCircuit(p)).toBe(ok);
});
```

```js
// test/edison-design-guard.test.js — fails when Edison drifts into AI-UI tells (spec §3)
import { test, expect } from 'vitest';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const files = () => {
  const out = [];
  const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p); else if (/\.(css|html|js)$/.test(f.name)) out.push(p);
  } };
  walk(path.join(ROOT, 'edison'));
  const skin = path.join(ROOT, 'circuit3d/css/theme-edison.css');
  if (fs.existsSync(skin)) out.push(skin);
  return out;
};
const RULES = [
  [/font-family[^;]*\b(Inter|Space Grotesk|Geist|Instrument Serif|Fraunces)\b/i, 'banned font'],
  [/text-transform\s*:\s*uppercase/i, 'all-caps text'],
  [/backdrop-filter/i, 'glass blur'],
  [/background-clip\s*:\s*text/i, 'gradient text'],
  [/box-shadow\s*:(?!\s*none)/i, 'box-shadow (use borders)'],
  [/<(button|a)\b[^>]*>[^<]*→/, 'arrow welded to a button or link'],
  [/\s·\s[^<\n]*\s·\s/, 'A · B · C meta string'],
];
test('Edison files exist', () => { expect(files().length).toBeGreaterThan(0); });
test.each(RULES)('no %s', (re, what) => {
  const hits = files().filter(f => re.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(ROOT, f));
  expect(hits, `${what} in`).toEqual([]);
});
test('gradients only in the pad grid', () => {
  const hits = [];
  for (const f of files()) for (const line of fs.readFileSync(f, 'utf8').split('\n'))
    if (/(linear|radial)-gradient/.test(line) && !/--pad-grid-image/.test(line)) hits.push(`${path.relative(ROOT, f)}: ${line.trim()}`);
  expect(hits).toEqual([]);
});
test('no purple', () => {
  const purple = hex => {
    const n = parseInt(hex, 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return false;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const hue = (h * 60 + 360) % 360, sat = d / (1 - Math.abs(mx + mn - 1));
    return hue >= 250 && hue <= 290 && sat > 0.4;
  };
  const hits = files().flatMap(f => [...fs.readFileSync(f, 'utf8').matchAll(/#([0-9a-f]{6})\b/gi)]
    .filter(m => purple(m[1])).map(m => `${path.relative(ROOT, f)} #${m[1]}`));
  expect(hits).toEqual([]);
});
test('the tokens file holds the spec palette', () => {
  const css = fs.readFileSync(path.join(ROOT, 'edison/tokens.css'), 'utf8');
  for (const [k, v] of Object.entries({ pad: 'E9EFE2', 'pad-grid': 'CFDCC3', graphite: '262927', mask: '1D6A45',
    'bus-red': 'C4333B', 'bus-blue': '2C5CC0', bezel: '1E2225', ch1: 'E6B72E', ch2: '38B2D4', sfu: 'A6192E' }))
    expect(css).toMatch(new RegExp(`--${k}\\s*:\\s*#${v}`, 'i'));
});
```

```js
// test/viewer-circuit-param.test.js — the viewer reads ?circuit= through UiFlag.allowedCircuit
import { test, expect } from 'vitest';
const fs = require('node:fs');
test('viewer.html loads ui-flag.js and gates ?circuit= with allowedCircuit', () => {
  const html = fs.readFileSync(require.resolve('../circuit3d/viewer.html'), 'utf8');
  expect(html).toMatch(/<script src="\.\.\/edison\/ui-flag\.js"><\/script>/);
  expect(html).toMatch(/UiFlag\.allowedCircuit\(/);
});
```

- [ ] **Step 2:** run `npx vitest run test/ui-flag.test.js test/edison-design-guard.test.js test/viewer-circuit-param.test.js`. Expected: FAIL (`Cannot find module '../edison/ui-flag.js'`, no Edison files).

- [ ] **Step 3: Implement `edison/ui-flag.js`**

```js
// ─────────────────────────────────────────────────────────────
//  edison/ui-flag.js — which UI a page shows (spec §6, contract
//  "Edison and the course hub"). Loaded first in <head>; never throws.
// ─────────────────────────────────────────────────────────────
(function (root, factory) {
  const UiFlag = factory();
  if (typeof module === 'object' && module.exports) module.exports = UiFlag;
  if (root) { root.UiFlag = UiFlag; UiFlag.boot(root); }
})(typeof window !== 'undefined' ? window : null, function () {
  const KEY = 'plugged.ui';
  const UIS = ['edison', 'classic'];

  function resolve(search, stored) {
    const q = new URLSearchParams(search || '').get('ui');
    if (UIS.includes(q)) return q;
    return UIS.includes(stored) ? stored : 'classic';
  }
  function apply(doc, ui) { doc.documentElement.dataset.ui = ui; }

  function read(win) { try { return win.localStorage.getItem(KEY); } catch { return null; } }
  function save(win, ui) { try { win.localStorage.setItem(KEY, ui); } catch { /* blocked storage: this load still shows ui */ } }

  function switchTo(ui, win = window) {
    save(win, ui);
    const url = new URL(win.location.href);
    url.searchParams.delete('ui');
    win.location.assign(url.toString());
  }

  // Only .sparky files under edison/ or circuit3d/labs/, no traversal, no scheme.
  function allowedCircuit(p) {
    return typeof p === 'string' && /^(edison|circuit3d\/labs)\/[\w\-/]+\.sparky$/.test(p) && !p.includes('..');
  }

  function boot(win) {
    const ui = resolve(win.location.search, read(win));
    if (new URLSearchParams(win.location.search).get('ui') === ui) save(win, ui);
    apply(win.document, ui);
  }

  return { KEY, resolve, apply, switchTo, allowedCircuit, boot };
});
```

- [ ] **Step 4: Implement `edison/tokens.css` and `edison/fonts.css`**

```css
/* edison/fonts.css — Edison pages and the editor skin only */
@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Semi+Condensed:wght@500&family=Barlow+Condensed:wght@600&family=B612+Mono:wght@400;700&family=STIX+Two+Text:ital,wght@0,400;0,600;1,400&display=swap');
```

```css
/* edison/tokens.css — the only source of Edison's look (spec §4). */
html[data-ui="edison"] {
  --pad: #E9EFE2;  --pad-grid: #CFDCC3;
  --graphite: #262927;  --graphite-2: #4D534E;
  --mask: #1D6A45;  --bus-red: #C4333B;  --bus-blue: #2C5CC0;
  --bezel: #1E2225;  --ch1: #E6B72E;  --ch2: #38B2D4;  --sfu: #A6192E;
  --font-ui: 'Barlow', system-ui, sans-serif;
  --font-dense: 'Barlow Semi Condensed', 'Barlow', sans-serif;
  --font-display: 'Barlow Condensed', 'Barlow', sans-serif;
  --font-num: 'B612', ui-monospace, monospace;
  --font-text: 'STIX Two Text', Georgia, serif;
  --t-13: 13px; --t-16: 16px; --t-20: 20px; --t-25: 25px; --t-31: 31px; --t-39: 39px; --t-49: 49px;
  --r-control: 2px; --r-panel: 4px;
  --pad-grid-image: linear-gradient(var(--pad-grid) 1px, transparent 1px), linear-gradient(90deg, var(--pad-grid) 1px, transparent 1px);
  --scene-bg: #1E2225;
}
html[data-ui="edison"] .ed-pad { background-color: var(--pad); background-image: var(--pad-grid-image); background-size: 20px 20px; }
html[data-ui="edison"] .ed-num { font-family: var(--font-num); font-variant-numeric: tabular-nums; }
```

The pad grid's 6% weight comes from `--pad-grid` on `--pad` (a contrast of about 1.1:1); no extra opacity is needed.

- [ ] **Step 5: The scene hook** (`circuit3d/js/scene.js` line 12)

```js
  const scene = new THREE.Scene();
  // Edison (spec §5.4) sets --scene-bg on <html>; classic leaves it unset.
  const sceneBg = getComputedStyle(document.documentElement).getPropertyValue('--scene-bg').trim();
  scene.background = new THREE.Color(/^#[0-9a-f]{6}$/i.test(sceneBg) ? sceneBg : 0xdcdad4);
```

- [ ] **Step 6: The viewer hook** (`circuit3d/viewer.html`)
  - Add `<script src="../edison/ui-flag.js"></script>` before the three.js tag.
  - Replace `fetch('../demo.sparky')` with:

```js
    const want = new URLSearchParams(location.search).get('circuit');
    const src  = want && UiFlag.allowedCircuit(want) ? `../${want}` : '../demo.sparky';
    fetch(src)
```

- [ ] **Step 7:** write `edison/DESIGN.md` as a copy of spec §3, §4 and §4a (the design guard needs at least one Edison file; this is it until E2/E3).
- [ ] **Step 8:** run the three test files. Expected: PASS. Then run `npm run check && npm test`, plus `E2E_PORT=5301 npm run e2e -- e2e/viewer*.spec.js --workers=1` if a viewer spec exists (`ls e2e | grep -i viewer`).
- [ ] **Step 9:** commit "Edison foundation: tokens, fonts, UI flag, design guard, scene and viewer hooks", then `/ship` (full e2e: `circuit3d/` changed).

---

### Task E2: The editor's Edison skin

**Files:**
- Create: `circuit3d/css/theme-edison.css`, `edison/skin.js`
- Modify: `circuit3d/index.html`, the `<head>` only
- Test: `test/edison-skin.test.js`, `e2e/edison-skin.spec.js`

**Interfaces:**
- Consumes: the E1 tokens and `UiFlag`.
- Produces: `EdisonSkin.highlightValues(html)` → html, and `EdisonSkin.labelsIn(text, labels)` → string[].

- [ ] **Step 1: Failing unit test**

```js
// test/edison-skin.test.js
import { test, expect } from 'vitest';
const Skin = require('../edison/skin.js');
test.each([
  ['LED1 gets 14.9 mA.', 'LED1 gets <span class="ed-num ed-val">14.9 mA</span>.'],
  ['Vout is −5.0 V and 1.99 Vpp', 'Vout is <span class="ed-num ed-val">−5.0 V</span> and <span class="ed-num ed-val">1.99 Vpp</span>'],
  ['Use 470 Ω, 10 kΩ or 1 Hz', 'Use <span class="ed-num ed-val">470 Ω</span>, <span class="ed-num ed-val">10 kΩ</span> or <span class="ed-num ed-val">1 Hz</span>'],
  ['Step 3 of 5', 'Step 3 of 5'],
  ['<b>12 V</b>', '<b><span class="ed-num ed-val">12 V</span></b>'],
])('highlightValues(%s)', (inp, out) => { expect(Skin.highlightValues(inp)).toBe(out); });
test('labelsIn finds part labels as whole words only', () => {
  expect(Skin.labelsIn('LED1 is backwards; R1 and R12 are fine', ['LED1', 'R1', 'R2'])).toEqual(['LED1', 'R1']);
});
```

- [ ] **Step 2: Failing browser test** (`e2e/edison-skin.spec.js`)
  - **Edison case:** open `/circuit3d/index.html?ui=edison` and assert:
    - `html[data-ui="edison"]`;
    - `getComputedStyle(document.body).fontFamily` contains `Barlow`;
    - the scene background `App.scene.background.getHexString() === '1e2225'`;
    - the top bar background is `rgb(233, 239, 226)`;
    - a stubbed `/api/ask` reply "LED1 gets 14.9 mA" renders `.ed-val` with the text `14.9 mA` and draws one `.ed-leader` whose end lies inside LED1's on-screen box (aim after `drawn(page)`).
  - **Then** load `?ui=classic` and assert `data-ui="classic"`, the scene background `dcdad4`, no `.ed-val`, and no `<link>` with `theme-edison` applied (its rules are scoped, so check the computed top-bar background is `rgb(250, 249, 246)`).
  - No console errors.
  - Expected today: FAIL (`data-ui` missing).

- [ ] **Step 3: `index.html` head.** Insert before line 7, so the flag runs before first paint:

```html
  <script src="../edison/ui-flag.js"></script>
  <link rel="stylesheet" href="../edison/fonts.css" media="print" onload="this.media='all'" />
  <link rel="stylesheet" href="../edison/tokens.css" />
```

After `css/tools.css`, add `<link rel="stylesheet" href="css/theme-edison.css" />`, and before `</body>`, add `<script src="../edison/skin.js"></script>`.

- [ ] **Step 4: `theme-edison.css`.** Every rule starts with `html[data-ui="edison"]`. First remap the classic variables (from `circuit3d/css/style.css` lines 13–24):

```css
html[data-ui="edison"] {
  --bg-canvas: var(--bezel); --bg-sidebar: var(--pad); --bg-topbar: var(--pad);
  --border: var(--pad-grid); --border-dark: #B7C7A9; --text-primary: var(--graphite);
  --text-muted: var(--graphite-2); --text-sub: var(--graphite-2);
  --accent: var(--mask); --accent-hover: #155234; --danger: var(--bus-red); --selected-bg: #D7E6CC;
}
html[data-ui="edison"] body, html[data-ui="edison"] button, html[data-ui="edison"] input { font-family: var(--font-ui); }
html[data-ui="edison"] #topbar h1, html[data-ui="edison"] .sidebar-section-label { font-family: var(--font-display); letter-spacing: 0; }
html[data-ui="edison"] #canvas-wrap { border: 1px solid rgba(0,0,0,.4); border-radius: 0; }
html[data-ui="edison"] .chat-msg.ai .ed-val { color: var(--mask); font-weight: 700; }
html[data-ui="edison"] .ed-leader { position: fixed; pointer-events: none; border-top: 1px dashed var(--graphite); transform-origin: 0 0; }
html[data-ui="edison"] .ed-leader::after { content: ''; position: absolute; right: -3px; top: -3px; width: 6px; height: 6px; border-radius: 50%; background: var(--graphite); }
```

Then go file by file through `chat.css`, `sidebar.css`, `inspector.css` and `tools.css`. For each hard-coded colour or font, add a scoped override using tokens. The scope and mistakes panels get `background: var(--bezel)`, with traces using `--ch1`/`--ch2`. Don't change any classic file.

- [ ] **Step 5: `edison/skin.js`** (UMD). Pure functions plus the DOM wiring when `document.documentElement.dataset.ui === 'edison'`:

```js
(function (root, factory) {
  const Skin = factory();
  if (typeof module === 'object' && module.exports) module.exports = Skin;
  if (root) { root.EdisonSkin = Skin; if (root.document && root.document.documentElement.dataset.ui === 'edison') Skin.wire(root); }
})(typeof window !== 'undefined' ? window : null, function () {
  // A number (optional sign incl. U+2212) + optional SI prefix + a unit. Text nodes only, never inside tags.
  const VALUE = /([−-]?\d+(?:\.\d+)?\s?(?:[pnµumkM])?(?:Vpp|V|A|Ω|W|Hz|F|s))(?![\w])/g;
  function highlightValues(html) {
    return html.split(/(<[^>]+>)/).map(part => part.startsWith('<') ? part
      : part.replace(VALUE, '<span class="ed-num ed-val">$1</span>')).join('');
  }
  function labelsIn(text, labels) {
    return labels.filter(l => new RegExp(`(^|[^\\w])${l}(?![\\w])`).test(text));
  }
  function wire(win) {
    const log = win.document.getElementById('sparky-messages') || win.document.body;
    new win.MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof win.HTMLElement) || !n.matches('.chat-msg.ai')) continue;
        n.innerHTML = highlightValues(n.innerHTML);
        annotate(win, n);
      }
    }).observe(log, { childList: true, subtree: true });
  }
  function annotate(win, msg) {
    const App = win.App; if (!App || !App.state) return;
    const labels = labelsIn(msg.textContent, App.state.components.map(c => c.label));
    const comp = labels.length && App.state.components.find(c => c.label === labels[0]);
    if (!comp || !comp.group) return;
    const box = new win.THREE.Box3().setFromObject(comp.group);
    const p = box.getCenter(new win.THREE.Vector3()).project(App.camera);
    const r = App.renderer.domElement.getBoundingClientRect();
    const to = { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
    const from = msg.getBoundingClientRect();
    const dx = to.x - from.left, dy = to.y - (from.top + 12);
    const line = win.document.createElement('div');
    line.className = 'ed-leader';
    line.style.left = `${from.left}px`; line.style.top = `${from.top + 12}px`;
    line.style.width = `${Math.hypot(dx, dy)}px`; line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    win.document.querySelectorAll('.ed-leader').forEach(l => l.remove());
    win.document.body.appendChild(line);
  }
  return { highlightValues, labelsIn, wire };
});
```

Check the chat container id with `grep -n "getElementById" circuit3d/js/chat.js | head`. If it isn't `sparky-messages`, use the real id in `wire()`.

- [ ] **Step 6:** run the unit and browser tests. Expected: PASS. Then run the full classic e2e with `ui` unset, which must be all green.
- [ ] **Step 7:** take a screenshot of `?ui=edison` with a lab loaded, attach it to the issue, and check it against spec §3. Commit "Edison skin for the editor: pad chrome, bezel viewport, chat values and leaders", then `/ship`.

---

### Task E3: The Edison landing page

**Files:**
- Create: `edison/index.html`, `edison/landing.css`, `edison/landing.js`, `edison/demo/inverting-amp.sparky`
- Test: `test/edison-landing.test.js`, `e2e/edison-landing.spec.js`

**Interfaces:**
- Consumes: the E1 tokens, `UiFlag`, `viewer.html?circuit=`.
- Produces:
  - `Landing.EXAMPLES` (string[]);
  - `Landing.ANNOTATION` (`{ label, value, text }`);
  - `Landing.editorUrl(prompt)`, which gives `../circuit3d/index.html?ui=edison&ask=<encoded>`.
  - The editor side is in this task too: `edison/skin.js` reads `?ask=` once on load, puts the text in `#sparky-input` and submits it through the existing send button (`#sparky-send`; check the id with `grep -n "getElementById('sparky" circuit3d/js/chat.js`). `chat.js` doesn't change.

- [ ] **Step 1: Failing unit test.** The demo circuit is honest: the annotation value comes from the real solve.

```js
// test/edison-landing.test.js
import { test, expect } from 'vitest';
const fs = require('node:fs');
const Sim = require('../circuit3d/js/simulate.js');
const Readings = require('../circuit3d/js/readings.js');
const Landing = require('../edison/landing.js');
test('the demo circuit solves and its annotation matches the solve', () => {
  const data = JSON.parse(fs.readFileSync(require.resolve('../edison/demo/inverting-amp.sparky'), 'utf8'));
  const res = Sim.analyze(data.components, data.wires);
  const r = Readings.from(res, data);
  const u = r.part(Landing.ANNOTATION.label);
  expect(u, 'the annotated part is on the board').toBeTruthy();
  expect(u.V).toBeCloseTo(Landing.ANNOTATION.value, 1);
});
test('examples are plain requests, editorUrl encodes them', () => {
  expect(Landing.EXAMPLES.length).toBeGreaterThanOrEqual(3);
  expect(Landing.editorUrl('Build me an LED, 9 V')).toBe('../circuit3d/index.html?ui=edison&ask=Build%20me%20an%20LED%2C%209%20V');
});
```

Check the exact `Sim`/`Readings` require paths and the `Readings.from` arguments against `test/tl072.test.js` before running.

- [ ] **Step 2: Failing browser test** (`e2e/edison-landing.spec.js`). Load `/edison/index.html` and assert:
  - `data-ui="edison"` (the page sets it);
  - the black strip's text contains "Lab 2 is open";
  - the `h1` is a single colour (every child's computed colour equals the `h1`'s);
  - the name line has the exact spec text;
  - the viewer iframe's `src` contains `circuit=edison/demo/inverting-amp.sparky` and its canvas draws;
  - the prompt box's text changes over time and shows at least 2 different `EXAMPLES` within 12 s (poll; frame-rate-proof);
  - typing "Build me a voltage divider" and pressing Enter goes to the editor URL with `ask=`;
  - no console errors;
  - `prefers-reduced-motion` (`page.emulateMedia({ reducedMotion: 'reduce' })`) shows the first example statically.

- [ ] **Step 3: Build the demo circuit.** In the editor, build a TL072 inverting amplifier: the bench supply in series ±12 V, Rin 10 kΩ, Rf 100 kΩ, and a 0.5 V input from a second supply (the LG-13 board). Save it as `edison/demo/inverting-amp.sparky`. Set `Landing.ANNOTATION = { label: 'U1', value: -5.0, text: 'U1 holds the output at −5.0 V' }`, with the value confirmed by Step 1's test.

- [ ] **Step 4: Build the page** following the spec §5.1 wireframe and §4a:
  - **Diode:** the black strip (`<a href="course.html#labs">Open it</a>`), and the hero board large on `.ed-pad`.
  - **atopile:** an inline SVG of traces in `--pad-grid` behind the hero, ending on 2.54 mm-pitch dots, generated in `landing.js` from a seeded walk so it's stable across loads.
  - **Liquid:** the prompt box absolutely positioned to overlap the board frame's top edge by 32 px, typing `EXAMPLES` at 45 ms per character with a 1.8 s pause. With reduced motion it shows `EXAMPLES[0]` statically.
  - **Quindar:** one dashed leader from the annotation text to U1's position. Use a fixed % position in the iframe frame; the demo camera is fixed.
  - **Buttons:** a solid `--mask` "Open the ENSC 220 course" (to `course.html`) next to an outlined "Open the board" (to `../circuit3d/index.html?ui=edison`).
  - **Headline:** Barlow Condensed 600, 49 px (31 px on mobile), graphite, left-aligned.
  - **Name line:** Barlow 16 px, graphite-2.
  - **Footer:** one row with the "Switch to classic UI" link (calls `UiFlag.switchTo('classic')`).

  Reuse this skeleton:

```html
<!doctype html><html lang="en" data-ui="edison"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Plugged with Edison</title>
<script src="ui-flag.js"></script>
<link rel="stylesheet" href="fonts.css"><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="landing.css">
</head><body class="ed-pad">
<a class="ed-strip" href="course.html#labs">Lab 2 is open: op-amps and the sine source. Open it</a>
<header class="ed-nav"><span class="ed-brand">Plugged with Edison</span>
  <nav><a href="course.html">Course</a><a href="../circuit3d/index.html?ui=edison">Open the board</a></nav></header>
<main class="ed-hero">
  <h1>Build circuits with Edison, then watch them run.</h1>
  <p class="ed-name">Edison: electrical design and interactive simulation of networks.</p>
  <svg class="ed-traces" aria-hidden="true"></svg>
  <form class="ed-ask" aria-label="Ask Edison"><label for="ask">Ask Edison</label>
    <input id="ask" autocomplete="off"><button type="submit">Ask Edison</button></form>
  <figure class="ed-board"><iframe title="Live breadboard: an inverting amplifier" src="../circuit3d/viewer.html?circuit=edison/demo/inverting-amp.sparky&ui=edison"></iframe>
    <figcaption class="ed-annot"></figcaption></figure>
  <p class="ed-ctas"><a class="ed-btn" href="course.html">Open the ENSC 220 course</a><a class="ed-btn ed-btn-ghost" href="../circuit3d/index.html?ui=edison">Open the board</a></p>
</main>
<footer><button type="button" onclick="UiFlag.switchTo('classic')">Switch to classic UI</button></footer>
<script src="landing.js"></script></body></html>
```

- [ ] **Step 5:** run the tests. Expected: PASS. Take screenshots at 1440×900 and 390×844, check them against spec §3 (no centred hero, no cards, single-colour headline) and fix anything that drifts. Commit "Edison landing page", then `/ship`.

---

### Task E4: The course hub shell, Home and the Labs table

**Files:**
- Create: `edison/course.html`, `course.css`, `course.js`, `course-data.js`
- Create stubs: `edison/sections/{textbook,grades,ta}.{js,css}`
- Modify: `landing.html` and `dashboard.html` (one link each)
- Test: `test/course-data.test.js`, `e2e/edison-course.spec.js`

**Interfaces:**
- Consumes: the E1 tokens, `UiFlag`, the E0 `CourseData` shape.
- Produces:
  - `Course.section(id, { title, render(el, data) })`, which registers a section;
  - `Course.show(id)`;
  - the hash routes `#home` (default), `#labs`, `#textbook`, `#grades`, `#ta`.
  - Each `sections/*.js` calls `Course.section(...)` on load.

- [ ] **Step 1: Failing unit test**

```js
// test/course-data.test.js
import { test, expect } from 'vitest';
const D = require('../edison/course-data.js');
test('course header is generic and the term is set', () => {
  expect(D.course).toMatchObject({ code: 'ENSC 220', title: 'Electric Circuits I', term: 'Fall 2026', instructor: 'Instructor' });
});
test('labs 1–5 in order; 1–2 open, 3–5 locked with an opening week', () => {
  expect(D.labs.map(l => l.code)).toEqual(['LAB-01', 'LAB-02', 'LAB-03', 'LAB-04', 'LAB-05']);
  expect(D.labs.slice(0, 2).every(l => l.status !== 'locked')).toBe(true);
  expect(D.labs.slice(2).every(l => l.status === 'locked' && /^Opens week \d+$/.test(l.opens))).toBe(true);
});
test('sample data is marked sample and uses no real names', () => {
  expect(D.grades.sample).toBe(true);
  expect(D.grades.students.length).toBeGreaterThanOrEqual(8);
  for (const s of D.grades.students) expect(s.name).toMatch(/^Student [A-Z]\.?$/);
});
test('every heat-map cell is a real breadboard hole, and each count is at most the class total', () => {
  for (const c of D.heatmap.cells) {
    expect(c.hole).toMatch(/^[a-j](?:[1-9]|[1-5]\d|6[0-3])$/);
    expect(c.count).toBeGreaterThan(0);
    expect(c.count).toBeLessThanOrEqual(D.heatmap.total);
  }
});
test('copy rules: no all-caps words over 3 letters except codes, no meta dots', () => {
  const text = JSON.stringify(D);
  expect(text).not.toMatch(/\s·\s.*\s·\s/);
  expect(text.replace(/ENSC|LAB-\d\d|TL072|SFU|LED\d?|CH\d/g, '')).not.toMatch(/\b[A-Z]{4,}\b/);
});
```

Sample student names are "Student A" to "Student L": invented and plainly sample. Write `course-data.js` with real ENSC 220 topics (Ohm's law, KCL/KVL, dividers, op-amps, RC) and the five labs: Series-parallel resistors; Op-amps and the sine source; RC charging; Thévenin equivalents; AM radio front end.

- [ ] **Step 2: Failing browser test** (`e2e/edison-course.spec.js`). Load `/edison/course.html` and assert:
  - the nav has 5 text links in sentence case, with no emoji (each link's text matches `/^[A-Z][a-z]+( [a-z]+)*$|^TA view$/`);
  - the banner has a `--sfu` rule, the computed `border-left-color` is `rgb(166, 25, 46)`, and the footer has the exact demo line;
  - Home's procedure card shows `LAB-02`, 5 step rows and a stepper with 5 stages;
  - the `Open Lab 2` link is `../circuit3d/index.html?lab=lab2&ui=edison`;
  - `#labs` shows a `<table>` with 5 rows, where rows 3–5 have `aria-disabled="true"` and read "Opens week …";
  - `#textbook`, `#grades` and `#ta` each render their stub section heading;
  - Back and Forward move between hashes;
  - no console errors.
  - Also: `landing.html` and `dashboard.html` each have a link to `edison/index.html`.

- [ ] **Step 3: Build the shell** (spec §5.2 wireframe):
  - **Left nav:** Barlow 16 px, the current item marked with a 2 px `--mask` left bar plus `aria-current="page"`. That's a state indicator, not decoration, so it isn't the "coloured left border on cards" tell.
  - **The banner (Astranis):** a full-bleed `<img>`, a still render of our breadboard, saved as `edison/img/course-banner.jpg`. Grab it with Playwright from `circuit3d/viewer.html?circuit=circuit3d/labs/lab1.sparky` at 1600×500 with the camera at `[18, 6, 22]`, via a one-off script in the scratchpad (not committed). The title sits over it in Barlow Condensed 49 px with a 6 px `--sfu` rule on the left.
  - **Home:** the procedure card (Epsilon3). A header row holds `LAB-02` (B612 13 px), the title (Barlow 600 20 px) and a week tag (13 px, outlined). Step rows each hold a number, the text and a status pill (*Passed* in `--mask`, *Not yet* outlined graphite-2, *Check failed* in `--bus-red`), separated by 1 px `--pad-grid` rules. The footer reads "Status: building", with the stepper (Pre-lab, Build, Measure, Analyze, Submit) as 5 dots joined by a 1 px line, the current one filled. Announcements are a `<ul>` of date and text.
  - **Labs:** a `<table>`: Lab, Title, Due, Status, plus the action.
  - **Footer:** the demo line.
  - **Stubs:** each `sections/x.js` registers `{ title, render(el){ el.innerHTML = '<h2>Title</h2><p>This section is being built.</p>' } }`. The stubs are replaced in E7–E9.

- [ ] **Step 4:** run the tests. Expected: PASS. Screenshot, check against §3, commit "ENSC 220 course hub: shell, Home and the Labs table", then `/ship`.

---

### Task E5: The lab sheet in the editor (Lab 1)

**Files:**
- Create: `circuit3d/labs/sheets.js`, `circuit3d/js/tools/lab-sheet.js`, `circuit3d/css/lab-sheet.css`
- Modify: `circuit3d/js/tools/labs.js` (`?lab=`), `circuit3d/index.html` (one script tag and one link)
- Test: `test/lab-sheets.test.js`, `e2e/lab-sheet.spec.js`

**Interfaces:**
- Consumes: `Readings` (`part(label)` → `{ V, I }` with I in mA), the `plugged:sim` event (`detail: { result, readings, t? }`), `Labs.urlFor`, `App.loadCircuitData`.
- Produces: `LabSheets.get/ids/evaluate` (contract E0), and `LabSheet.open(id)` / `LabSheet.close()`.

- [ ] **Step 1: Failing unit test** (real solves, no mocks)

```js
// test/lab-sheets.test.js
import { test, expect } from 'vitest';
const fs = require('node:fs');
const Sim = require('../circuit3d/js/simulate.js');
const Readings = require('../circuit3d/js/readings.js');
const LabSheets = require('../circuit3d/labs/sheets.js');
const lab1 = () => JSON.parse(fs.readFileSync(require.resolve('../circuit3d/labs/lab1.sparky'), 'utf8'));
const solve = b => Readings.from(Sim.analyze(b.components, b.wires), b);

test('Lab 1 sheet: 4–6 numbered steps, code LAB-01, starter is the lab file', () => {
  const s = LabSheets.get('lab1');
  expect(s).toMatchObject({ id: 'lab1', code: 'LAB-01', starter: 'labs/lab1.sparky' });
  expect(s.steps.map(x => x.n)).toEqual(s.steps.map((_, i) => i + 1));
});
test('every measure check on Lab 1 passes on the finished starter circuit', () => {
  const b = lab1(); const r = solve(b); const memo = {};
  for (const st of LabSheets.get('lab1').steps.filter(x => x.check.kind === 'measure'))
    expect(LabSheets.evaluate(st.check, r, b, memo), `step ${st.n}`).toBe('passed');
});
test('I(R1) is 4.31 mA on Lab 1 (the QA value)', () => {
  expect(solve(lab1()).part('R1').I).toBeCloseTo(4.31, 1);
});
test('a wrong value fails, a missing part is pending, never throws', () => {
  const b = lab1(); b.components.find(c => c.label === 'R1').values.resistance = 4700;
  const r = solve(b);
  const c = { kind: 'measure', label: 'R1', quantity: 'I', expect: 4.31, unit: 'mA', tol: 0.05 };
  expect(LabSheets.evaluate(c, r, b, {})).toBe('failed');
  expect(LabSheets.evaluate({ ...c, label: 'R9' }, r, b, {})).toBe('pending');
  expect(LabSheets.evaluate(c, null, b, {})).toBe('pending');
  expect(LabSheets.evaluate({ kind: 'nope' }, r, b, {})).toBe('pending');
});
test('peak tracks the largest |V| seen across calls', () => {
  const memo = {}; const check = { kind: 'peak', label: 'U1', pin: 'out1', expect: 10, unit: 'V', tol: 0.05 };
  const fake = v => ({ part: () => ({ opamps: [{ pin: 'out1', vout: v }] }) });
  expect(LabSheets.evaluate(check, fake(4), {}, memo)).toBe('pending');
  expect(LabSheets.evaluate(check, fake(-10.1), {}, memo)).toBe('passed');
});
test('unknown ids', () => { expect(LabSheets.get('lab9')).toBe(null); expect(LabSheets.ids()).toContain('lab1'); });
```

- [ ] **Step 2: Failing browser test** (`e2e/lab-sheet.spec.js`):
  - **The lab loads:** open `/circuit3d/index.html?lab=lab1`. The circuit loads (4 parts), and `#lab-sheet` shows `LAB-01` with all steps *Not yet*.
  - **Steps pass:** click Run, and poll until the measure steps read *Passed*.
  - **A wrong value fails, with a hint but not the answer:** set R1 to 4.7 kΩ in the inspector. The I(R1) step reads *Check failed* and shows its hint; the hint text doesn't contain `4.31`.
  - **An unknown lab:** `?lab=lab9` shows the hint "There's no lab9" and no sheet.
  - **Edison styling:** in `?lab=lab1&ui=edison`, the sheet uses the pad background `rgb(233, 239, 226)`.
  - No console errors.

- [ ] **Step 3: Implement `circuit3d/labs/sheets.js`** (UMD). Lab 1 data, with the checks matching Step 1's values:

```js
(function (root, factory) {
  const L = factory();
  if (typeof module === 'object' && module.exports) module.exports = L;
  if (root) root.LabSheets = L;
})(typeof window !== 'undefined' ? window : null, function () {
  const SHEETS = {
    lab1: { id: 'lab1', code: 'LAB-01', title: 'Series-parallel resistors', week: 'Week 2', starter: 'labs/lab1.sparky', steps: [
      { n: 1, text: 'Set the bench supply to 10 V.', hint: 'Select PS1 and check its voltage in the inspector.', check: { kind: 'part', label: 'PS1' } },
      { n: 2, text: 'Measure the current through R1.', hint: 'R1 carries the whole circuit current. Compare R1 with R2 and R3 in parallel.', check: { kind: 'measure', label: 'R1', quantity: 'I', expect: 4.31, unit: 'mA', tol: 0.03 } },
      { n: 3, text: 'Measure the voltage across R2.', hint: 'R2 and R3 share the same two nodes.', check: { kind: 'measure', label: 'R2', quantity: 'V', expect: 5.69, unit: 'V', tol: 0.03 } },
      { n: 4, text: 'Measure the current through R3.', hint: 'Use KCL at the node where R2 and R3 meet.', check: { kind: 'measure', label: 'R3', quantity: 'I', expect: 1.72, unit: 'mA', tol: 0.03 } },
      { n: 5, text: 'Write down your readings for the report.', hint: 'Export them with the CSV button.', check: { kind: 'manual' } },
    ] },
  };
  const get = id => SHEETS[id] || null;
  const ids = () => Object.keys(SHEETS);
  function evaluate(check, readings, board, memo) {
    try {
      if (!check || !readings) return 'pending';
      if (check.kind === 'part') return (board.components || []).some(c => c.label === check.label) ? 'passed' : 'pending';
      if (check.kind === 'measure') {
        const p = readings.part(check.label); const v = p && p[check.quantity];
        if (typeof v !== 'number' || !Number.isFinite(v)) return 'pending';
        return Math.abs(Math.abs(v) - Math.abs(check.expect)) <= check.tol * Math.abs(check.expect) ? 'passed' : 'failed';
      }
      if (check.kind === 'peak') {
        const p = readings.part(check.label); const op = p && p.opamps && p.opamps.find(o => o.pin === check.pin);
        if (!op || typeof op.vout !== 'number') return 'pending';
        const key = `${check.label}.${check.pin}`; memo[key] = Math.max(memo[key] || 0, Math.abs(op.vout));
        return Math.abs(memo[key] - check.expect) <= check.tol * check.expect ? 'passed' : 'pending';
      }
      return 'pending';
    } catch { return 'pending'; }
  }
  return { get, ids, evaluate };
});
```

If Step 1 shows that V(R2) or I(R3) differ on the real board (a different topology than assumed), change `expect` to the solved value and say so in the issue.

- [ ] **Step 4: Implement `lab-sheet.js`:**
  - **Open:** `LabSheet.open(id)` builds `#lab-sheet` (an `<aside>`, left of the canvas): a header with the code, title and week; an `<ol>` of steps, each with a status pill; a stepper footer; and a close button.
  - **Live checks:** on `plugged:sim`, evaluate each step with `App.state` as the board and a memo that's reset on `plugged:sim-stop`. *Passed* and *Check failed* animate their pill colour only (150 ms), and a failed step expands its hint.
  - **Manual steps** toggle on click.
  - **`labs.js`** reads `?lab=` and returns the sheet id. It loads `LabSheets.get(id).starter` through the existing `load()`, then calls `LabSheet.open(id)`; an unknown id calls `App.setHint("There's no " + id, 4000)`.
  - **`lab-sheet.css`:** classic tokens by default, with `html[data-ui="edison"] #lab-sheet` overrides (pad, mask, Barlow, B612 for codes).

- [ ] **Step 5:** run the tests. Expected: PASS. Run the full e2e. Screenshot classic and Edison, commit "Lab sheet: live step checks in the editor, Lab 1", then `/ship`.

---

### Task E6: Lab 2 on the lab sheet (re-scopes #122)

**Files:** modify `circuit3d/labs/sheets.js` (add `lab2`) and `circuit3d/js/tools/labs.js` (list Lab 2); create `circuit3d/labs/lab2.sparky`. Test: extend `test/lab-sheets.test.js`, and add one case to `e2e/lab-sheet.spec.js`.

**Interfaces:** consumes `LabSheets.evaluate`'s `peak` check, the TL072, the function generator and the scope.

- [ ] **Step 1: Failing tests**
  - **Unit:** `LabSheets.get('lab2')` has code `LAB-02`. Its peak check on U1.out1 passes after time-stepping the finished `lab2.sparky` for 2 s: use the time-solve pattern in `test/function-generator.test.js` and call `evaluate` each step with one shared memo. The starter circuit (the chip placed, nothing wired) leaves every measure or peak step *pending*.
  - **Browser:** `?lab=lab2&ui=edison` loads the starter; wiring it via `App.finishWire` to the finished board and pressing Run turns the peak step *Passed*. Wait on sim time 2 s, never wall time.
- [ ] **Step 2: Build `lab2.sparky`** (starter: the TL072 at f30, the bench supply and the function generator placed, unwired). Lab 2 is an inverting amplifier: the generator at 1 Vp, 1 Hz into Rin 10 kΩ; Rf 100 kΩ; ±12 V series supply; the scope probe on OUT1. Expected Vout peak is 10 V (gain −10, under the ±10.5 V clip).
- [ ] **Step 3: Add the steps:**
  1. Place the TL072 across the centre gap (`part` U1).
  2. Wire the ±12 V supply to pins 8 and 4 (`manual`).
  3. Connect the generator through Rin to pin 2 (`part` R1).
  4. Add Rf from pin 1 to pin 2 (`part` R2).
  5. Run and read the output peak on the scope (`peak` U1.out1, expect 10, tol 0.05).
  6. Explain the phase flip in one sentence (`manual`).
- [ ] **Step 4:** tests pass, full e2e, then `/ship`. Close #122 with "Re-scoped onto the lab sheet in E6; shipped in <sha>".

---

### Task E7: The textbook

**Files:** replace `edison/sections/textbook.js` and `textbook.css`; extend `edison/course-data.js` `chapters`; create `edison/figures/*.sparky` (3–4 figures). Test: `test/course-textbook.test.js`, `e2e/edison-textbook.spec.js`.

**Interfaces:** consumes `Course.section`, `viewer.html?circuit=` and `CourseData.chapters`.

- [ ] **Step 1: Failing tests**
  - **Unit:** 3 chapters (Ohm's law and power; Kirchhoff's laws and dividers; The op-amp), sections numbered 1.1, 1.2 and so on. Every `figure` path passes `UiFlag.allowedCircuit` and exists on disk. Every figure solves with `Sim.analyze`, with no `error`. Each chapter body is 120–400 words, and each paragraph is at most 75 characters per line when rendered (check by word count per paragraph ≤ 120).
  - **Browser:** `#textbook` lists the chapters. Opening chapter 3 renders STIX body text (computed `fontFamily` contains `STIX`). Each figure iframe's `src` has `circuit=edison/figures/…`. "Open in the editor" links to `../circuit3d/index.html?ui=edison&open=edison/figures/<f>.sparky`, and the editor honours `?open=` (add a 6-line handler in `labs.js` that reuses `load()` with an `allowedCircuit` path). No console errors.
- [ ] **Step 2: Build it:**
  - **Chapter openers (Elodin):** Barlow Condensed 49 px with a square inset live figure.
  - **Body:** STIX Two 18 px / 1.6 on `.ed-pad`, max-width 68ch.
  - **Static diagrams (Synthetic Sciences):** inline SVG fine-line engravings, 1 px `--graphite` strokes, hatching for ground: an op-amp symbol and a KVL loop.
  - **Copy:** written as plain explanatory text at first-year level.
- [ ] **Step 3:** tests pass, screenshot against §3, then `/ship`.

---

### Task E8: Grades and the Canvas dummy

**Files:** replace `edison/sections/grades.{js,css}`; modify `backend/server.js` (one route). Test: `test/course-endpoints.test.js` (canvas half), `e2e/edison-grades.spec.js`.

- [ ] **Step 1: Failing tests**
  - **Unit** (the real server module, as `test/ai-timeout.test.js` does): `POST /api/course/canvas/sync` returns 200 with `{ ok: true, demo: true }` and `syncedAt` as a parseable ISO date within 5 s of now. A `GET` on the same path returns 404 or 405, not 200.
  - **Browser:**
    - `#grades` shows a `<table>` with a caption containing "Sample data", 12 student rows, and lab and pre-lab columns, with numbers in B612.
    - Clicking "Push grades to Canvas" sets the status to "Synced with Canvas just now (demo)".
    - With `page.route('**/api/course/canvas/sync', r => r.fulfill({ status: 404 }))`, the same click still shows "(demo)" and no error.
    - No console errors (allow the routed 404).
- [ ] **Step 2: Server route.** Add it next to `/api/health`:

```js
  if (req.method === 'POST' && req.url === '/api/course/canvas/sync') {
    return sendJSON(res, 200, { ok: true, demo: true, syncedAt: new Date().toISOString() });
  }
```

- [ ] **Step 3: The section.** A Barlow Semi Condensed table with numeric cells right-aligned in B612 and the caption "Sample data. Names are invented." The button is solid `--mask`. On a failure (`!res.ok` or a network error), fall back to a local `{ syncedAt: new Date().toISOString(), demo: true }`.
- [ ] **Step 4:** tests pass, then `/ship` (full e2e: `server.js` changed).

---

### Task E9: The TA view (mission control)

**Files:** replace `edison/sections/ta.{js,css}`; modify `backend/server.js` (one route). Test: `test/course-endpoints.test.js` (feed half), `test/course-ta.test.js`, `e2e/edison-ta.spec.js`.

**Interfaces:** consumes `CourseData.heatmap` and `.feed`, and `Board` hole geometry: the breadboard grid from `circuit3d/js/board-geometry.js` (columns 1–63, rows a–j, plus rails).

- [ ] **Step 1: Failing tests**
  - **Unit:**
    - `GET /api/course/ta-feed` returns `{ demo: true, events }`, with 5–8 events, each `at` within the last 30 minutes and sorted newest first.
    - `TA.isoPoint(hole)` maps `'a1'` and `'j63'` to the drawing's corners, and every heat-map hole to a point inside the outline.
    - `TA.colourFor(count, max)` is monotonic and uses a sequential scale from `--pad` to `--bus-red`, with no purple (the guard covers it).
    - Every sentence in the summary contains its number, as in "14 of 82 students …".
  - **Browser:**
    - `#ta` shows an inline SVG isometric breadboard outline with one dot per heat-map cell, coloured by count, plus a legend with min and max.
    - At least 2 dashed leaders (`stroke-dasharray`) end on dots, with their notes.
    - The feed `<ol>` shows events and refreshes within 20 s (poll for a change in its first `<time>`).
    - With the feed route 404'd, it falls back to `CourseData.feed` and still says "(demo)".
    - No console errors.
- [ ] **Step 2: Server route**

```js
  if (req.method === 'GET' && req.url === '/api/course/ta-feed') {
    const now = Date.now();
    const SAMPLE = [
      { lab: 'LAB-02', step: 2, label: 'U1', text: 'V+ (pin 8) not wired' },
      { lab: 'LAB-01', step: 2, label: 'LED1', text: 'LED backwards' },
      { lab: 'LAB-02', step: 5, label: 'U1', text: 'Output clipping at +10.5 V' },
      { lab: 'LAB-01', step: 3, label: 'R2', text: 'R2 is 220 Ω, expected 2.2 kΩ' },
      { lab: 'LAB-02', step: 3, label: 'R1', text: 'Rin wired to pin 3 instead of pin 2' },
      { lab: 'LAB-01', step: 4, label: 'R3', text: 'Measured across the wrong pair of holes' },
    ];
    const shift = Math.floor(now / 15000) % SAMPLE.length;
    const events = SAMPLE.map((e, i) => ({ ...SAMPLE[(i + shift) % SAMPLE.length],
      at: new Date(now - (i * 4 + 1) * 60000).toISOString() }));
    return sendJSON(res, 200, { demo: true, events });
  }
```

- [ ] **Step 3: The section (Quindar + Godela):**
  - **The drawing:** an isometric line-art breadboard in SVG, 1 px `--graphite` strokes, from `TA.isoPoint`.
  - **The data:** heat dots from the sequential scale, with dashed leaders to the top 2 cells' notes ("LED1 backwards: 14 students, step 3").
  - **The summary:** a plain sentence block at the top.
  - **The feed:** a right-hand `<ol>` with `<time>` elements, polling every 15 s.
  - **The label:** "Sample data (demo)" next to the heading.
- [ ] **Step 4:** tests pass, then `/ship`.

---

### Task E10: Demo walk, QA rows and the default decision

**Files:** modify `docs/QA.md` (rows for each Edison page and the flag round-trip), and `docs/PRD.md` (the demo story's Edison beat). If the walk passes, set `UiFlag.resolve`'s fallback to `'edison'` and update its test row `['', null, 'edison']`.

- [ ] **Step 1:** walk the spec §1 demo beat in a real browser with `?ui=edison` three times, then with `?ui=classic` once, looking for console errors. Use the real AI for the landing prompt, three times.
- [ ] **Step 2:** take a screenshot of every Edison page and check each against spec §3 one last time. Fix any drift in the owning section's files.
- [ ] **Step 3:** if all are clean, flip the default (one line plus its test), run `npm run check && npm test` and the full e2e. Classic tests that assume the classic look must set `?ui=classic`; if any fail on the flip, revert the flip and leave classic as the default.
- [ ] **Step 4:** `/ship`, then `/promote`.

---

## Self-review notes

- **Spec coverage:**

  | Spec section | Task |
  |---|---|
  | §1 demo beat | E10 |
  | §2 constraints | Global constraints, E1 |
  | §3 tells and guard | E1 |
  | §4 tokens | E1 |
  | §4a steals | E2 (Godela chat), E3 (Diode, atopile, Liquid, Quindar leader), E4 (Astranis, Epsilon3), E7 (Elodin, Synthetic Sciences), E9 (Quindar, Godela heat-map) |
  | §5.1 landing | E3 |
  | §5.2 hub | E4, E7, E8, E9 |
  | §5.3 lab sheet | E5, E6 |
  | §5.4 skin | E2 |
  | §6 mechanics | E0, E1, E8, E9 |
  | §7 testing | in each task |
  | §8 order | the parallel groups |
  | §10 decisions | E4 (instructor), E10 (default flip) |

- **Spec correction:** spec §5.3 says `circuit3d/labs/<id>.json`, but the server never serves `.json`, so the sheets live in `circuit3d/labs/sheets.js`. The contract (E0) records this.
- **Names used across tasks:** `UiFlag.allowedCircuit` (E1, used in E3, E7), `LabSheets.evaluate` (E5, E6), `Course.section` (E4, E7–E9), `EdisonSkin.highlightValues` (E2). All are checked consistent.
