# Edison design system

A copy of §3, §4 and §4a of `docs/superpowers/specs/2026-10-01-edison-ui-revamp-design.md`, for agents working in `Plugged/edison/` and `circuit3d/css/theme-edison.css`. The spec is the source; if they differ, the spec wins. Tokens live in `edison/tokens.css` only, and `test/edison-design-guard.test.js` enforces §3.

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

**Guard:** `test/edison-design-guard.test.js` scans `Plugged/edison/**`, `circuit3d/css/theme-edison.css` and the Lab HUD's `circuit3d/css/edison-hud*.css`. It fails on:
- a banned font family;
- `text-transform: uppercase` (allowed in `edison-hud*.css` only: see "Editor: Lab HUD" below);
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
| `--pad-grid` | `#CFDCC3` | The pad's rules and borders |
| `--pad-grid-line` | `#E1E9D8` | The pad's 5 mm grid lines, 6% under `--pad` (used by `--pad-grid-image`) |
| `--graphite` | `#262927` | Text (pencil on paper) |
| `--graphite-2` | `#4D534E` | Secondary text (meets AA on `--pad`) |
| `--mask` | `#1D6A45` | Solder-mask green: primary actions, links, *Passed* |
| `--bus-red` / `--bus-blue` | `#C4333B` / `#2C5CC0` | The breadboard's bus stripes: power + / −, and *Check failed* (red only) |
| `--bezel` | `#1E2225` | Instrument panels: the 3D viewport frame, scope, readouts |
| `--ch1` / `--ch2` | `#E6B72E` / `#38B2D4` | Scope channel traces (CH1 yellow, CH2 cyan, as real scopes use) |
| `--sfu` | `#A6192E` | The course banner rule only |

The editor's 3D view reads two more from `tokens.css` (`circuit3d/js/scene.js`): `--scene-bg` (`#1E2225`, the bezel) for the background and `--scene-ground` (`#121416`) for the workbench plane, dark enough that under the scene's lights it reads as the bezel too.

### Type

- **Barlow** at 400/500/600, with Barlow Semi Condensed for dense tables. The interface voice, close to DIN technical lettering.
- **B612** for measured values only (`14.9 mA`, `1.99 Vpp`), with tabular figures so columns line up. A face drawn for cockpit displays. (B612 Mono's full-width period read `14.9` as `14. 9`.) Google's subset is Latin only, so `Ω` comes from the next face in `--font-num`.
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

## The landing page (landing v3, since #166)

The landing page doesn't follow the pad tokens above, and it knowingly breaks two §3 rules on Aarmen's brief (2026-10-02): it is always dark, and its HUD labels are caps mono. Refs are in `docs/design/landing-v3/`. Its palette lives in `edison/landing.css`, not `tokens.css`.

- **Palette, black only:**
  - `#101010` page and stage;
  - `#F4F4F4` ink;
  - `#676767` for 1 px lines only (as text it is 3.6:1 on black, under AA);
  - `#8A8A8A` for grey text (5.6:1).
  - There is no light mode: no toggle, no theme storage, no `data-theme`. The landing never writes `localStorage`.
- **Type:** DM Mono everywhere. No shadows, no gradients, no transitions, square corners.
- **The top (refs 01, 02), kept from v2 exactly:**
  - the small centred **EDISON** wordmark (#186: was PLUGGED WITH EDISON);
  - the light DM Mono headline;
  - the square **Ask Edison** box. Its placeholder, and what an empty box sends, is `Landing.EXAMPLES[0]`, "Build me a light bulb".
- **The stage (ref 04):** `section.ed-stage`, the page's only section, under the Ask box.
  - **Size:** edge to edge, black, no border. It fills the rest of the first screen, from 420 to 680 px tall (about 517 px at 1440 × 900), so its bottom row stays on a laptop's first screen.
  - **Corner brackets:** four `.ed-bracket` L shapes drawn with CSS borders, 1 px `#676767`, 24 px arms, 32 px in from the stage's corners (16 px arms and inset under 720 px).
  - **Title block, top left:** **BREADBOARD** (20 px, letter-spacing 0.1em, ink). Under it, the step line `SCHEMATIC / SKETCH / SIMULATE` (12 px, 0.12em), one `<span data-step>` per step.
    - The steps are grey at rest.
    - `[data-current]` puts a step in the ink at once, with no transition. The hero sequence sets it.
  - **Course link, bottom left:** **ENSC 220 COURSE +** to `course.html` (12 px caps, ink, underline on hover).
  - **The inset, bottom right:** `figure.ed-inset[hidden]`, a 288 × 162 px frame in 1 px `#676767` with the caption **SCHEMATIC VIEW** above it (11 px caps).
    - The CSS never sets its `display`, so `hidden` holds until the hero sequence removes it and fills it.
    - It is `display: none` under 720 px.
  - **`#hero-stage`:** fills the stage under the HUD and is empty here; the hero frame goes in it.
- **Caps labels:** written in capitals in the HTML, since the design guard bans `text-transform`. Labels are 11 to 12 px with letter-spacing 0.12em, in the ink; sublines are in the grey text colour.
- **The footer:** one quiet grey line, "Edison, built for Edison. Not an official SFU site." and the "Switch to classic UI" link.
- **Phone (720 px and under):** a 16 px HUD gutter, the title block kept, the inset hidden. No sideways scroll at 390 px.

v2's giant outlined EDISON, the three sections below the hero (line art, "+" buttons, the 3-column grid) and the dark/light toggle are gone.

## Editor: Lab HUD (since #189)

The editor's Edison skin (`?ui=edison`) carries the landing's language into its chrome, on Aarmen's pick of the Lab HUD pitch (2026-10-03). Mockups and their source are in `docs/design/editor-hud/`. Like the landing, it knowingly overrides §3 in one place.

- **The override:** caps labels. `text-transform: uppercase` is allowed in `circuit3d/css/edison-hud.css` and the later `edison-hud-*.css` files only; the design guard still bans it everywhere else. The DOM text stays as written ("ENSC 220 Labs", "Colours on", "Passives"): tests match it and classic shares the DOM.
- **Scope:** every HUD rule starts with `html[data-ui="edison"]` (the guard checks it), so classic is untouched. `edison-hud.css` loads after `theme-edison.css`.
- **Palette:** the landing's black: `#101010` chrome, `#242424` hairlines between cells, `#676767` for 1 px outlines only, `#F4F4F4` ink, `#8A8A8A` grey text. Neon only for status: `#3D7BFF` blue for on, `#FF3D7F` pink for a fault.
- **Type:** DM Mono is the skin's base font (`--font-ui`, loaded by `edison/fonts.css`). Labels are 11 px, letter-spacing 0.12em; part names 12 px with grey sublines.
- **The top bar (H1):** a 40 px strip of hairline cells: EDISON, FILE and the name (it shrinks first, with an ellipsis), RUNNING with the sim clock, Run (the one solid cell) or Stop, the Colours, Dots and Scope toggles, then the square "+" buttons Thévenin, Export CSV, ENSC 220 Labs and Download. Each toggle holds a 6 px `span.hud-led`, blue while `aria-pressed="true"`. `edison/skin.js` adds the LEDs (and puts them back after each relabel) and the RUNNING cell.
- **The parts sidebar (H1):** black, caps section headers with a CSS count ("PASSIVES 03"), and the part icons exactly as each part file draws them.
