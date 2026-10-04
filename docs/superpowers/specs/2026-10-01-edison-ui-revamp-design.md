# Edison UI revamp and the ENSC 220 course hub — design

**Status:** draft for Aarmen's review (2026-10-01). Work runs on the Mac. The school computer has the photo work (#134–#145).

## 1. What this is

Two linked pieces of work, built for **the judges' demo**:

1. **The Edison UI**: an opt-in visual identity for Plugged. It's a new skin for the editor and a new landing page. The classic UI stays the default and stays untouched, and one flag switches between them.
2. **The ENSC 220 course hub**: one page that makes Plugged look like it lives inside a real SFU course. It has labs, an interactive textbook, grades and a TA view.

**The demo beat (about 30 s of the 3 minutes):**
1. Open the Edison landing page and ask Edison to build something.
2. Open the ENSC 220 course and click **Lab 2**. It opens on the board with the lab sheet beside it.
3. Build or Run. The lab steps turn to *Passed* as the measured values come in, and the scope shows the sine.
4. Back in the course, the **TA view** shows where in the lab students go wrong.

**Success:**
- A judge believes it's a course tool, not a project toy.
- Nothing on screen reads as generic AI UI (§3).
- `?ui=classic` brings back today's UI exactly.

**The name:** Edison stands for **Electrical Design and Interactive Simulation of Networks** (Aarmen, 2026-10-01). It's written as a plain sentence: "Edison: electrical design and interactive simulation of networks." The initials aren't coloured or capitalised, so it stays clear of the accented-word tell. It appears on the landing page under the headline, in the course hub's About line, and in the editor's chat header on hover.

## 2. Constraints

- **Separate and revertible:**
  - Edison is **new files only**, plus a handful of additive hooks in existing files (listed in §6).
  - Classic CSS rules are never edited.
  - Turning Edison off is one flag, and deleting its folder removes it.
- **Real where the judge clicks, dummy everywhere else:**
  - **Real:** labs, the lab sheet's live checks, the textbook's live figures.
  - **Dummy:** grades, Canvas sync, the TA feed. They're labelled as sample data or demos in the UI.
- **SFU-inspired, not SFU-branded:**
  - We use the course code, the term and SFU red as an accent.
  - No SFU logo or wordmark. A footer reads: "A demo course page. Not an official SFU site."
  - No real instructor or TA names on sample data.
- **We take patterns from the reference sites, never their assets, logos or copy.**
- **Timing:** the event is Oct 3–4. Each issue is about 300 lines or fewer; one browser lane runs at a time on the Mac.

## 3. Staying away from "obvious AI UI"

Researched 2026-10-01. Sources: Developers Digest's 16 vibe-coded patterns, the `avoid-ai-design` catalogue, 925 Studios, and the frontend-design guidance. **Edison never uses:**

| Tell | Edison instead |
|---|---|
| Inter, Space Grotesk, Geist, Instrument Serif, Fraunces | Barlow (interface), B612 (measured numbers only), STIX Two (textbook) |
| Purple/indigo, gradient washes, gradient text, coloured glows, glass/backdrop blur | Flat colour from the bench (§4); borders instead of shadows |
| Permanent dark mode; grey body text below WCAG AA | Light pad surfaces with dark instrument bezels; every text pair meets AA (body text at least 7:1) |
| Cream + terracotta; near-black + one acid green | Engineering-pad green paper + solder-mask green + bus red/blue |
| All-caps labels, tracked eyebrows, mono small labels, `A · B · C` meta strings, `WORD — fragment` labels | Sentence case everywhere; hierarchy from size and weight; meta as plain short sentences or table cells |
| One accented word in the headline | Headlines in one colour and weight |
| Centered hero over three icon cards, a badge above the H1, a stat-banner row, coloured left borders on cards, emoji nav, fake window dots | Left-aligned layouts built around the board; tables and procedure cards; numbers inside sentences; text nav |
| 01 / 02 / 03 decoration | Numbers only where the content is a sequence (lab steps, textbook sections) |
| Fade-up on every section, count-up stats, bounce easing, arrows on buttons, "Get started / Elevate / Seamless" | One load moment (the demo circuit wires itself once); motion only in reply to actions; buttons named for what they do ("Open Lab 2") |

**Guard:** `test/edison-design-guard.test.js` scans `Plugged/edison/**` and `circuit3d/css/theme-edison.css`. It fails on:
- a banned font family;
- `text-transform: uppercase`;
- `backdrop-filter`;
- `background-clip: text`;
- a `linear-gradient`/`radial-gradient` outside an allow-list (the pad grid is the only allowed one);
- `→` inside button or link text;
- emoji in the nav;
- any hex in the purple range (hue 230–290°, which also catches Tailwind's indigo, saturation above 40%).

## 4. The design system ("engineering pad and bench instrument")

Locked here and copied to `Plugged/edison/DESIGN.md`. Every Edison page reads its tokens from `edison/tokens.css` and nothing else.

### Colour

| Token | Hex | Role |
|---|---|---|
| `--pad` | `#E9EFE2` | Page and reading surfaces: the green-tinted engineering computation pad |
| `--pad-grid` | `#CFDCC3` | The pad's 5 mm grid, rules and borders |
| `--graphite` | `#262927` | Text (pencil on paper) |
| `--graphite-2` | `#4D534E` | Secondary text (meets AA on `--pad`) |
| `--mask` | `#1D6A45` | Solder-mask green: primary actions, links, *Passed* |
| `--bus-red` / `--bus-blue` | `#C4333B` / `#2C5CC0` | The breadboard's bus stripes: power + / −, and *Check failed* (red only) |
| `--bezel` | `#1E2225` | Instrument panels: the 3D viewport frame, scope, readouts |
| `--ch1` / `--ch2` | `#E6B72E` / `#38B2D4` | Scope channel traces (CH1 yellow, CH2 cyan, as real scopes use) |
| `--sfu` | `#A6192E` | The course banner rule only |

### Type

- **Barlow** at 400/500/600, with Barlow Semi Condensed for dense tables. The interface voice, close to DIN technical lettering.
- **B612** for measured values only (`14.9 mA`, `1.99 Vpp`). A face drawn for cockpit displays.
- **STIX Two Text** for textbook body and maths.
- **Scale** (1.25 ratio): 13 / 16 / 20 / 25 / 31 / 39 / 49 px. Body is 16 px with 1.5 line-height (1.6 for STIX). Lines are 75 characters or fewer.
- All from Google Fonts, loaded only by Edison pages and only when the flag is on.

### Shape and texture

- **Radius:** 2 px on controls, 4 px on panels, 0 on instrument bezels. Pills only for status.
- **Shadows:** none. Borders are 1 px `--pad-grid` on pad surfaces and 1 px `#000` at 40% on bezels.
- **The pad grid:** one CSS `background-image` (the allowed gradient), at 6% contrast and only on reading surfaces.

### The signature element: Edison's annotations (the thread through the loud moments in §4a)

Edison's remarks about the board appear as **leader lines to real parts**: a thin `--graphite` line ending in a small dot on the part, with the note in Barlow and its values in B612 on `--mask`. Think of a TA's notes on a lab report, or Quindar's callouts.

They appear:
- in the landing demo;
- in the editor, when Edison mentions a part label in a reply (for example "LED1");
- in the TA view.

They're never decorative: every line points at something real.

### Motion

- **One orchestrated moment:** on the landing page, the demo circuit's wires draw in once while Edison builds it. That's real, since the AI is building it.
- **Everything else** moves only in answer to an action: a lab step turning *Passed*, a panel opening.
- `prefers-reduced-motion` turns off the draw-in.

### Copy

- Sentence case and plain verbs.
- Buttons say what happens: "Open Lab 2", "Ask Edison", "Push grades to Canvas".
- Errors say what to do next. Empty states invite an action.

## 4a. The steal map: heavy YC inspiration, page by page

Aarmen's brief: **lean hard on the YC pages.** We lift their signature **compositions, illustration styles, components and interactions** wholesale. We don't copy their assets or copy. We drop only the few micro-habits on the §3 list, and where a page's move sits on that list, the replacement keeps its spirit.

| YC page | Signature move (from the screenshots) | Where Edison uses it, and how hard |
|---|---|---|
| **Diode** | A thin black news strip on top; one photoreal hero object (the board) huge and centred on a pale ground; nothing else on screen | **Landing page, full steal.** A black strip ("Lab 2 is open: op-amps and the sine source. Open it"). The live 3D breadboard is the hero object, large, on the pad. The first screen holds the headline, the board and the prompt, nothing more |
| **atopile** | A circuit-trace pattern routed behind the hero; a solid button next to an outlined one; footer links in a quiet row | **Landing and course banner.** Faint traces (in `--pad-grid`) run behind the hero and terminate in breadboard-hole dots, generated from the real board's hole grid. The solid `--mask` + outlined button pair is used everywhere |
| **Quindar** | Isometric **line-art hardware** with **dashed leader callouts** to status notes; a huge condensed headline; an outlined call to action | **TA view and the annotation system, full steal.** An isometric line-art breadboard (drawn in SVG from the board model) with dashed leaders to anomaly notes ("LED1 backwards: 14 students, step 3"). The huge condensed headline is kept in Barlow Condensed 600, mixed case. Edison's editor annotations use the same dashed-leader style |
| **Epsilon3** | The **procedure card**: an ID header, step rows with status pills, a status footer; a **lifecycle stepper** (plan, build, test, operate, sustain) | **Lab sheet and course home, full steal.** The `LAB-02` card has a week tag, step rows with *Passed / Not yet / Check failed* pills and a status footer ("Status: measuring"). The stepper reads Pre-lab, Build, Measure, Analyze, Submit, with a dot on the current stage |
| **Astranis** | A full-bleed hero image band with the headline over it; wide nav | **Course hub banner.** A full-bleed render of *our* breadboard (a still from our own 3D view at a low, cinematic angle) with the course title over it, instead of a stock space photo |
| **Elodin** | A thin grid of lines over the whole page; huge widely spaced headline type; a square inset window into the product | **Section openers in the textbook and course.** The pad grid shows through at a 6% line weight; chapter openers use very large Barlow Condensed with generous spacing, mixed case; a square inset frame shows a live figure |
| **Synthetic Sciences** | Engraved, fine-line illustration on a dark field; a quiet editorial voice | **Textbook figures.** Static diagrams (the op-amp symbol, Kirchhoff's loops) drawn as fine-line engravings in `--graphite` on the pad, beside the live figures |
| **Liquid Instruments** | A prompt box **overlapping the hardware render**, typing example requests | **Landing page, full steal.** The "Ask Edison" box overlaps the top edge of the live board, cycling real examples ("Build me an inverting amplifier, gain −10"). Enter sends it to the editor |
| **Godela** | Chat on the left with **key numbers highlighted**; a simulation field on the right with a colour scale | **Editor skin and TA heat-map.** Edison's replies highlight values (B612 on `--mask`). The TA view's breadboard heat-map has a proper colour scale and legend, Godela's thermal-field style applied to where mistakes cluster |

**The bold moments, in order of loudness:**
1. Landing: the Diode-style hero board with the Liquid prompt overlapping it.
2. TA view: Quindar line art with dashed callouts.
3. Lab sheet: Epsilon3 procedure card and stepper.

Everything else stays quiet so these three land.

## 5. Pages

### 5.1 The Edison landing page (`Plugged/edison/index.html`)

```
 ┌───────────────────────────────────────────────────────────────┐
 │ Lab 2 is open: op-amps and the sine source.  Open it          │  ← black strip (Diode)
 ├───────────────────────────────────────────────────────────────┤
 │ Plugged with Edison           Course   Open the board  Classic│
 │                                                               │
 │ Build circuits with Edison,     · · ─┐  traces (atopile) · ·  │
 │ then watch them run.                 └──·                     │
 │                         ┌ Ask Edison ─────────────────────┐   │  ← overlaps the board (Liquid)
 │                         │ Build me an inverting amp, −10▌ │   │
 │   ┌─────────────────────┴─────────────────────────────────┴─┐ │
 │   │            live 3D breadboard: the hero object          │ │  ← Diode
 │   │       ╌╌╌ "LED1 gets 14.9 mA"  (dashed leader, Quindar) │ │
 │   └─────────────────────────────────────────────────────────┘ │
 │ [Open the ENSC 220 course]   (Open the board)                 │  ← solid + outlined (atopile)
 └───────────────────────────────────────────────────────────────┘
```

- **Composition:** headline left-aligned on top; the board is the large hero object below it; the prompt box overlaps the board's top edge.
- **The prompt box** (the Liquid steal) cycles real example requests by typing them. Pressing Enter opens the editor with that request sent.
- **The viewer** loads `edison/demo/inverting-amp.sparky` through the new `viewer.html?circuit=` option, and an annotation leader points at a real part.
- **Under the headline:** the name, as one quiet line: "Edison: electrical design and interactive simulation of networks."
- **Below the prompt:** one plain line linking the ENSC 220 course. No feature cards, no stats.

### 5.2 The ENSC 220 course hub (`Plugged/edison/course.html`)

```
 ┌──────────────┬────────────────────────────────────────────────┐
 │ ENSC 220     │ ▌Electric Circuits I, Fall 2026  (SFU-red rule)│
 │ Fall 2026    │                                                │
 │              │ This week: Lab 2, op-amps and the sine source  │
 │ Home         │ ┌ procedure card LAB-02 ─────────────────────┐ │
 │ Labs         │ │ 1 Place the TL072 across the gap   Passed  │ │
 │ Textbook     │ │ 2 Wire the ±12 V supply            Not yet │ │
 │ Grades       │ │ …                                          │ │
 │ TA view      │ │ [Open Lab 2]                               │ │
 │              │ └────────────────────────────────────────────┘ │
 │              │ Announcements and due dates (a plain list)      │
 └──────────────┴────────────────────────────────────────────────┘
```

- **Left nav** in text, sentence case. Sections are hash routes on one page (`#labs`, `#textbook`, `#grades`, `#ta`), all drawn from `edison/course-data.js`.
- **Home:** the course header, *This week* as the current lab's procedure card, and announcements and due dates as a list.
- **Labs (real):** a table of Labs 1–5 with status and due date.
  - Labs 1–2 open `circuit3d/index.html?lab=lab1|lab2&ui=edison`.
  - Labs 3–5 are greyed with "Opens week 6" and the like.
- **Textbook (real):** three short chapters:
  - Ohm's law and power;
  - Kirchhoff's laws and dividers;
  - the op-amp.

  Text is STIX on the pad. Each figure is a live `viewer.html?circuit=` frame with an "Open in the editor" button, and sections are numbered.
- **Grades (dummy):**
  - a real `<table>` of labs and pre-labs per student, with sample data, labelled as such;
  - "Push grades to Canvas" calls `POST /api/course/canvas/sync`, and the status line then reads "Synced with Canvas just now (demo)".
- **TA view (dummy):**
  - a **breadboard outline heat-map** of where students' mistakes sit, plus a short live feed;
  - numbers live inside sentences ("14 of 82 students have LED1 backwards at step 3");
  - the feed polls `GET /api/course/ta-feed`, which returns rotating sample events.

### 5.3 The lab sheet in the editor (real; works in both UIs)

- **Opening:** `?lab=lab2` loads the lab's starter circuit (today's labs loader) and opens a **lab sheet** panel on the left. It's the Epsilon3 procedure card: a lab ID, numbered steps and a status per step.
- **Data:** the lab sheets live in `circuit3d/labs/sheets.js`, a JS data module, because the static server never serves `.json`. Each lab has, holding the steps, each step's check, and its hint. A check is something like `{ measure: 'I(R1)', expect: 4.31, unit: 'mA', tol: 0.05 }`, or a structural rule like "TL072 placed across the gap".
- **Live checks:** on every `plugged:sim`, the sheet evaluates its checks against `Readings` and turns a step *Passed* or *Check failed*. A failed step shows the hint, never the answer.
- **Look:** classic tokens in classic, Edison tokens in Edison.

### 5.4 The editor's Edison skin

`circuit3d/css/theme-edison.css`, active when `<html data-ui="edison">`:
- **Variables:** redefines the existing CSS variables (`--bg-sidebar`, `--accent` and the rest, about 125 uses across 5 files) to the pad, mask and graphite tokens.
- **Viewport:** the 3D scene background becomes `--bezel`, read from a new `--scene-bg` variable by a small hook in `scene.js`.
- **Chat:**
  - Edison's replies get B612 values on `--mask`, wrapped by `edison/skin.js` with no change to `chat.js`;
  - an annotation leader to any part label mentioned.
- **Scope and readouts:** bezel styling with the CH1/CH2 trace colours.

## 6. Mechanics

- **The flag:** `edison/ui-flag.js` is loaded first by each page that supports it.
  - `?ui=edison` or `?ui=classic` saves the choice in `localStorage` (inside try/catch) and sets `<html data-ui>`.
  - Default: classic.
  - Both UIs show a small "Switch to Edison / classic UI" control in the corner.
- **Additive hooks in existing files** (the whole footprint on classic):
  - `circuit3d/index.html`: two tags (the flag script and the theme stylesheet);
  - `scene.js`: read `--scene-bg` if set;
  - `viewer.html`: a `?circuit=` path, restricted to `.sparky` files under `edison/` or `circuit3d/labs/`;
  - `labs.js`: honour `?lab=`;
  - `landing.html` and `dashboard.html`: one "Try the Edison UI" link each;
  - `backend/server.js`: two dummy routes.
- **Dummy endpoints** (contract lines in `docs/API-CONTRACT.md`):
  - `POST /api/course/canvas/sync` → `200 { ok: true, demo: true, syncedAt }`.
  - `GET /api/course/ta-feed` → `200 { demo: true, events: [{ at, lab, step, label, text }] }`, sample events with timestamps relative to now.
- **Data:** `edison/course-data.js` (UMD, testable in Node) holds the course, labs, chapters, announcements, sample grades and sample heat-map cells. The lab JSON files hold the steps and checks.

## 7. Testing

- **Vitest:**
  - the design guard (§3);
  - flag logic;
  - the course-data shape;
  - lab-check evaluation against real `Sim.analyze` + `Readings` for Labs 1 and 2;
  - the value-highlighting function;
  - the dummy endpoints' shapes.
- **Playwright** (about 1–2 per issue, frame-rate-proof, `--workers=1`, aim after a drawn frame):
  - the flag round-trip, ending with classic unchanged;
  - landing to editor;
  - course to Lab 2 to steps passing;
  - textbook figure to editor;
  - the Canvas push status;
  - the TA feed renders.
- **Classic is unchanged:** the full classic e2e suite passes with Edison off, and the golden prompts don't move.
- **Visual review:** a screenshot of each page goes into its issue, checked against §3 before `/ship`.

## 8. Issue cut and order

1. **E0 contract:** flag, endpoints, `?lab=`, `?circuit=`, lab JSON, course-data shapes.
2. **E1 tokens and flag:** `tokens.css`, fonts, `ui-flag.js`, the corner switch, the theme loader hooks, `DESIGN.md`, the design guard test.
3. **Then in parallel:**
   - **E2 editor skin:** the variable remap, bezel viewport, chat values and annotations, scope;
   - **E3 landing page:** the prompt box, viewer `?circuit=`, the draw-in moment;
   - **E4 course hub shell:** nav, Home, `course-data.js`, entry links.
4. **E5 lab sheet:** `?lab=`, lab JSON and live checks for Lab 1, plus the Labs table.
5. **E6 Lab 2:** re-scope #122 onto the lab sheet (TL072 + function generator + scope).
6. **E7 textbook:** three chapters with live figures.
7. **E8 grades and the Canvas dummy.**
8. **E9 TA view:** the heat-map, plus the `ta-feed` dummy.
9. **E10 demo walk:** QA rows, screenshots, and Aarmen's decision on the demo default.

## 9. Out of scope

- A light/dark toggle inside Edison.
- Real Canvas/LTI.
- Real accounts or rosters.
- Labs 3–5 content.
- Reskinning the photo screens (the school computer's; they can adopt the tokens later).
- Mobile beyond "doesn't break".

## 10. Decisions (Aarmen delegated these, 2026-10-01: "I trust your call")

1. **Surfaces:** light pad for reading surfaces with dark bezels for instruments, not all-dark. Permanent dark mode and near-black + one accent are both on the AI-tell lists.
2. **Default UI:** classic stays the default while Edison is built; the demo uses `?ui=edison`. At E10, if the full demo walk passes on Edison, flip the default to Edison for judging. It's a one-line change, reversible.
3. **Course header:** a generic "Instructor". No real names on the page or in sample data.
