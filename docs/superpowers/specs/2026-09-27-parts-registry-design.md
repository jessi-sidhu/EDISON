# Parts registry: design

*2026-09-27. Status: **draft for review** (Aarmen approved the design in conversation; Manav to OK as the second teammate). The contract itself is in `docs/API-CONTRACT.md` → "Part file contract". This note records why, what it costs, and the build order.*

## Goal
Adding a part means writing **one file**: `Plugged/circuit3d/js/parts/<type>.js`. Today a part type is known in 10+ places:
- `app.js` place functions and tables
- `components.js` models plus a second copy for ghosts
- `simulate.js` `PROPS`, the LED special case and result text
- `server.js` tools, prompt, `CONDUCTORS` and value checks
- `chat.js` `PLACE` and `VALUE_KEY`
- `ids.js` prefixes
- `viewer.html`'s own copy
- `index.html` sidebar

Phase 2 adds about 15 parts, mostly written by Manav and by Claude Code agents from issues. Each one has to be a copy-and-edit job that the tests check automatically.

**In scope:** Phases 1–4 (through the op-amp), with a clear path for Phase 5–6 capacitors, inductors, and time/frequency simulation.

## Decisions (and the options rejected)
| # | Decision | Rejected |
|---|---|---|
| 1 | **Parts are built from standard building blocks** (`R V I SW D E G`, with `C L` reserved). Only the simulator core knows the maths. | Each part writes its own matrix stamps: every author needs nodal analysis, and each switching part reinvents the LED loop. Data-only "kinds": new behaviours (7-seg, relay, supply) mean core edits again. |
| 2 | **One file, two halves.** A Node-safe definition (the server and Vitest load it) and a browser-only `view`. The ghost is the real model with ghost materials. | Separate definition and view files, which breaks "one file". Separate ghost models, which have already drifted (the button ghost's leads are the wrong height). |
| 3 | **Any value within min–max, plus a kit hint** (`series: 'E12'` → "closest kit value: 1.2 kΩ"). | Kit values only: too rigid for textbook problems. Free values with no hint: students build values that aren't in their kit. |
| 4 | **Live controls through both a 3D gesture and an inspector slider.** | Inspector only loses "click the button". Gestures only are awkward for sensors, and hard to test. |
| 5 | **One on/off loop for every mode block** (diode, Zener, clamped source, relay contact), with anti-cycling, reporting `'unsettled'` instead of wrong numbers. | Keeping the LED special case and adding more beside it. |
| 6 | **A closed switch is 1 mΩ, never an ideal short.** | 0 V source: two closed switches in parallel make the maths unsolvable. Union-find merge (today's button): it gives no current reading. |
| 7 | **Every leg's column and row is stored per pin**, and a **hole map is rebuilt from the records after every change**. | Storing anchor + rotation and working the legs out each time. Updating the hole map as things change, which can drift out of sync with the parts. |
| 8 | **2-lead parts have `span: {min, max, default}`.** Placement outside the range is refused everywhere, and the message states the range. | Fixed spans (today's "exactly 4 columns"). Unlimited spans, e.g. a resistor stretched 30 columns. |
| 9 | **AI tools are generated from the registry. Per request, `selectTools` sends only what's needed (≤ 12)**, plus a parts catalogue and `use_parts` for anything missed. Parts carry an optional `guide` and `recipe`, and recipes are tested in the simulator. | Sending every tool on every request (about 20 at the end of Phase 2). One generic `place_part` tool: kept as the fallback if DeepSeek struggles. |
| 10 | **A strict vocabulary and hard limits**, rejected at registration. | Open-ended fields: they give "degrees of freedom that are too wide". |

## Cons we accept (and how we contain them)
- **The on/off loop can take many rounds or go in circles** when many mode blocks interact (op-amp rails + diodes + relay). The cap plus the anti-cycling rule contain it, and the result is `'unsettled'` rather than wrong numbers. The relay is the likeliest trouble; it's last on the list and can be cut.
- **Deliberate behaviour and text changes:**
  - A pressed button reports a current instead of `null`.
  - The LED's messages move into `led.js`.
  - The AI's sizing lines become ranges.
  
  Some simulator tests, browser tests and QA prompts need updating in issues B, C and D.
- **During the migration there are two simulator paths**, the old per-type code and the registry, until issue C deletes the old one. If C slips, the duplication lingers.
- **Rebuilding the five existing models may shift how they look slightly.** The browser tests catch breakage; someone has to eyeball them.
- **Scroll-over-pot turns the knob instead of zooming.** It could surprise people, and it's one line to switch to drag.
- **The overlap and span checks change hand placement.** You can't stack leads or over-stretch parts any more. Old files still load, flagged.
- **Tool selection makes AI behaviour depend on which tools were sent.** The server logs the tool list per request. Keyword misses cost one `use_parts` round, a second or two.
- **Generated prompt wording shifts AI behaviour.** Re-run QA AI-06 to AI-08 and the demo path after D.
- **Strict limits will sometimes block a legitimate part.** Loosening one is a one-line contract change and needs a teammate's OK.
- **Viewer and dashboard script order:** a missing `<script>` fails silently, so the browser test covers the viewer.

## Build order (Phase 1 foundation issues)
| Issue | Scope | Depends on | Can run alongside |
|---|---|---|---|
| **G** | 63-column board. The prompt's "Columns 1–N" is generated. | none | everything |
| **A** | Registry core (`Parts.define`, validation, browser + Node loading, `checkValue`, `nearestKit`, `checkPlacement` span rules, `legsOf`, `App.holeMap`). Simulator blocks `R`, `V`, `SW`. **The resistor moved over end to end.** Tests 1–4, 6 and 7, plus the browser loop (8). | contract | G |
| **B** | LED: the `D` block, the generic on/off loop with anti-cycling, and the LED's `measure`/`warnings`/`report`/glow. | A | C, E, F |
| **C** | Battery (off-board, `ref`), buzzer and button (controls + gestures). **Deletes the old per-type code paths.** | A | B, E, F |
| **D** | AI: generated tools and prompt sections, `set_value`/`set_control`/`delete_part`/`use_parts`, `selectTools`, server checks from blocks, and `viewer.html` on the registry. | B, C | E, F |
| **E** | Footprint placement, rotation, edge and straddle rules, and the overlap check for hand and AI placement, tested with a 3-pin test-only part. | A | B, C, D, F |
| **F** | Inspector (values, kit hint, controls, undo) and a generated sidebar (categories, search, icons). | A | B–E |

**Cut line for tonight:** the contract, A, B, C and G. D, E and F can finish tomorrow morning while Manav starts the easy Phase 2 parts, which need A–C.

**Blocks that arrive later, with the parts that first need them:** `I` with the current source, and `E`/`G` with dependent sources, which become the op-amp in Phase 4.

## How Phase 2 uses it
- **Aarmen builds the first part of each kind:**
  - potentiometer: the first footprint part and the first slider plus gesture
  - 7-segment: several diodes in one part, straddling the gap
  - bench supply: off-board, 3 terminals, and a current limit as a mode
  - dependent sources: `E`/`G`
  - relay: coil current drives a contact
  
  Each one adds its pattern to the contract with an example.
- **Manav copies those patterns:**
  - bulb, diode, Zener, current source and motor: need only A–C
  - switches, LDR and thermistor: after the pot
  - RGB LED: after the 7-segment

## Success criteria
- Adding a Phase 2 part touches exactly one new file (plus its QA case), and the automatic tests cover it without anyone writing new test scaffolding.
- No per-type table exists outside `parts/` once C and D land. Test: a source check finds no `'resistor'`, `'led'`, `'battery'`, `'buzzer'` or `'button'` string literals in `app.js`, `interaction.js`, `simulate.js`, `chat.js` or `server.js`.
- The demo path and every existing browser test pass after each issue.
