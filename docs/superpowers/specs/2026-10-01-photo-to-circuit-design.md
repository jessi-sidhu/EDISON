# Photo → circuit, Tier 1 (design)

*Status: design approved by Aarmen in chat, 2026-10-01. Every claim about existing code was checked against `dev` (d788f3a); the file:line references are inline. Author: Aarmen with Claude Code. The tasks are built on the school computer.*

## Goal
*(Edison is the product's new name; in the code the assistant is still the Sparky chat: `chat.js`, `sparkyAsk`. Maya is the student in the demo story.)*

Maya photographs her real breadboard, and Edison rebuilds it on the simulator so the simulator can find what's wrong. This is the climax of the demo: "her real board doesn't work → a photo → the simulator says LED1 is backwards → she flips it and the real LED lights".

**What testing showed, and why Tier 1 is built this way:**
- No published system reads "which hole each lead is in" from a photo of an ordinary breadboard. Vision models are close to random at tracing breadboard wires (arXiv 2507.13361).
- Our own spike (6 real photos, 76 hand-labelled leads, deepseek-flash): 23–34% of leads in the exact hole, 30–45% in the right node, part *count* 86–98% right, and its confidence meant nothing.
- So in Tier 1 **the model makes the first guess and Maya confirms every lead before anything is built**. A better model means fewer taps, never a different result. The simulator, not the model, finds the fault.

**Success:**
- From a photo, Maya gets a correct board in under a minute: 4 corner taps, a few dot corrections, Build.
- The build is one undo step, never overwrites her open saved circuit, and simulates straight away.
- The problems panel names the fault, and Edison answers her question from the simulator's numbers.
- It works offline on stage with the rehearsed photo (fixture), and degrades to a friendly message when the AI is down.
- `npm run check`, `npm test`, CI and the demo `ai-eval` stay green; the demo prompt and its golden files don't change.

## What Maya does
1. In the chat she types her question ("My LED won't light, why?") and presses **📷**.
2. **She picks a photo:** a file (AirDrop from her phone lands in Downloads), a photo dragged onto the chat, or **Use sample photo** (the rehearsed one).
3. **She taps the board's 4 corner holes** in order: a1, a<N>, j<N>, j1 (N = 63 on a full board; a 30/63 toggle for half boards). A labelled grid appears over the photo. **Looks right** or **Redo**.
4. **"Reading your board…"** (the photo goes to `/api/photo`).
5. **The confirm screen** (below). She checks every dot against her real board and fixes what's wrong.
6. **Build it.** The circuit appears in 3D (one undo step), the simulation starts, the problems panel names the fault, and Edison answers her question.

## How it's built
```
browser                                         server
photo.js        pick, drop, sample; corner taps
photo-grid.js   flatten; hole centres; snap  ──► POST /api/photo
                                                 photo-reader.js
                                                 Gemini → deepseek-flash → fixture
                ◄──────────────────────────────  returns a Reading (no actions)
photo.js        confirm screen
photo-import.js confirmed Reading → legal actions + labels + flags
SparkyChat.applyBuild(actions) → App.runSimulation() → problems panel → sparkyAsk(question, {context})
```
- **The server only reads the photo; the browser builds.** `photo-grid.js` and `photo-import.js` are pure UMD modules (Node + browser), so unit tests, the fixtures and the future photo-eval all use exactly the code the page runs.
- **New files:** `circuit3d/js/photo-grid.js`, `circuit3d/js/photo-import.js`, `circuit3d/js/photo.js` (DOM), `backend/photo-reader.js`, `circuit3d/samples/*.jpg` + their corner taps, `test/fixtures/photo/`.
- **Script order** (`circuit3d/index.html`, enforced by a new `test/wiring.test.js` case): `photo-grid.js` and `photo-import.js` after `ids.js` and before `app.js` (in the browser `photo-import` uses `window.Parts`, `Ids` on `window.App` and `App.BOARD_GEOMETRY`, all loaded earlier); `photo.js` after `chat.js`. `board-model.js` is not needed on the page: the nets invariant is checked in Node tests.

## The grid (`photo-grid.js`)
- **Real-board geometry in pitch units (0.1"):** columns 1…N at x = 0…N−1, column 1 on the left. The ten rows sit at y = 0–4 and 7–11 (the centre gap is 0.3", 3 pitches): **which of rows a or j is on top is chosen from the taps so the flattened image is never a mirror image** (the spike's `geom.py` `orientation()`). On most boards j is on top when the numbers read upright (j–f at y = 0–4, e–a at y = 7–11); a board photographed upside down still flattens upright, because the taps name the holes. Our 3D model draws the gap as 2.75 pitches (`board-geometry.js:28-35`); that only affects drawing, never the photo grid.
- **Homography** from the 4 taps (a1, aN, jN, j1) to their positions in that frame: an 8×8 solve in plain JS. Reject near-collinear taps.
- **Flattened image:** 30 px per pitch, the top-left body hole (j1 or a1) at (90, 190), rail zones of 5 pitches above the top row and below the bottom row, a 40 px label band top and bottom with every column number (every 5th bold), row letters at both ends, column numbers also in the centre channel. No lines over holes. About 2,048 × 710 px for 63 columns.
- **Snapping:** a point maps to the nearest body hole within 0.45 pitch, to `gap` (between e and f), or to a rail zone. Rail points: inner vs outer by distance from the body, cross-checked with the model's label. Rails are named by side: the strips next to row a are the **a-side** rails, the strips next to row j the **j-side** rails. The rail's column is the nearest body column (cosmetic: each rail is one node, `simulate.js:105-111`).

## The Reading (what `/api/photo` returns)
Points are pixels `[x, y]` in the flattened image. Each provider adapter converts its own format (Gemini returns `[y, x]` on 0–1000).
- `board`: `visible`, `cols` (63 or 30), `rails` (the printed sign of each strip: `aOuter`, `aInner`, `jInner`, `jOuter`, each `+`, `-` or `?`), `split` (a break in the rail lines mid-board).
- `parts[]`: `id`, `type` (`resistor`, `led`, `other` in Tier 1), `what` (e.g. "red 5 mm LED"), `value` (Ω, 0 = unknown), `bands[]`, `color`, `leads[]` (each `{hole, pt, role}`; `hole` is `c14`, `rail:aOuter:14`, `gap`, `off` or `?`; `role` is `anode`, `cathode`, `none` or `unknown`), `box` (`[x0, y0, x1, y1]`), `confidence`, `unsure[]`.
- `wires[]`: `id`, `color`, `ends` (2 × `{hole, pt}`), `confidence`, `unsure[]`.
- `power[]`: `kind` (`battery_9v`, `bench_supply`, `unknown`), `volts` (0 = unknown), `plus` and `minus` endpoints, `unsure[]`.
- One zero-dependency `validateReading()` coerces or drops bad entries and records why, for every provider.

## The confirm screen
- **Overlay** reusing the `#load-preview-modal` pattern (`index.html:207-220`): the flattened photo with a faint grid on the left, a parts list on the right.
- **Every lead and wire end is a dot** at its snapped hole, joined by a line, labelled with its Reading id (#178): the same name its amber why-text uses, with `PhotoImport`'s key when an id is missing or repeated (`part<n>`/`wire<n>`, `<id>#2`); a battery keeps its app label (BAT1). The built board's labels come from `PhotoImport`'s `labels` map, which the confirm screen no longer shows for parts and wires. On the built board, parts: `Ids.nextLabel` order, the same as `Chat.predictLabels` (`chat.js:226-238`; a skipped part shifts later numbers). **Wires:** `predictLabels` returns null for `add_wire` (`chat.js:231`); wire ids come from `nextWireId` in `add_wire` order (`app.js:460-467`), so `PhotoImport` counts its `add_wire` actions in output order (the battery's two leads and any bridge jumpers take W1, W2… first). The build starts from an empty board, so the numbers match.
- **Move:** tap a dot, then tap the right hole; it snaps exactly.
- **LED polarity:** the anode dot is marked **+**. She compares it with the long leg on her real LED. **⇄** swaps the two legs here, before the build, so no new flip function is needed.
- **List actions:** value dropdown for resistors (the reading's value, the decoded bands, nearby E12 values); LED colour (red, yellow, green, blue, white only: `led.js:27-33`); wire colour (red, yellow, green, blue, black, white: `chat.js:50-53`); **×** deletes a made-up part; **+ Add a part** = pick resistor, LED or wire, then tap its legs; the battery row with its voltage (1–24 V; unread → 9 V, flagged) and + / − dots on the rails.
- **Amber** marks a part with any flag. Each flag says why ("polarity unsure", "drawn shorter: on your board it spans 10→17").
- **While the overlay is open it swallows keydown in the capture phase.** Today a focused `<select>` lets Backspace delete the selected part and Ctrl+Z undo (`interaction.js:701-703`, `748-751`).
- **Build it** runs `photo-import` on the confirmed Reading. If it reports any refusal, that's a bug: it must never happen (tests assert zero refusals).

## From Reading to board (`photo-import.js`)
A lead's **node** is its column plus half (a–e top, f–j bottom), a rail, or an off-board pin. Rows inside a half never change the circuit.

1. **Validate** and drop malformed entries with notes; drop exact duplicate parts and wires.
2. **Resolve every endpoint:** the hole from the confirmed dot (after confirmation, the dot is the truth). Rails map to `tp`/`tn`/`bp`/`bn` **by side and printed sign**: a-side + → `tp`, a-side − → `tn`, j-side + → `bp`, j-side − → `bn` (our model has row a next to `tp`/`tn`; BB830-style boards print "+ −" in the same order on both edges, so one side's + strip is the inner one, while our model has + outer on both sides, #61). **Fallback:** if a side's signs are `?` or both read the same, use our position default (outer = +, inner = −) and flag `rails`; the confirm screen has a **swap + / −** toggle per side. Nets only need each strip mapped to one rail, one to one.
3. **Types (Tier 1):** resistor, LED, wire, battery. Anything else is not placed and is listed ("not built: IC / button / …").
4. **Power:** `place_battery {voltage}`, then `add_wire {from:'BAT1.0', to:<+ rail hole>}` and `{from:'BAT1.1', to:<− rail hole>}` (`battery.js:119`, `chat.js:27-36`). A bench supply maps to a battery in Tier 1. No source seen but rails used → 9 V, flagged.
5. **Track every taken hole, including wire ends.** `finishWire` never checks (`app.js:469-505`) and Accept checks parts only against `holeMap()` (`board-io.js:182-205`), so `photo-import` keeps its own running map.
6. **Place each 2-lead part legally, keeping both nodes**, checking every placement in order with `Parts.checkPlacement` against that running map (as `server.js:615-690` does). `Board.apply` doesn't check legality (`docs/API-CONTRACT.md:213`).
   - Both leads in the body, same half, span in range (resistor 3–5 columns, LED 1–3; `registry.js:576-595`): put both on one row, preferring the photo's row, else any row with both holes free. This also straightens diagonal leads.
   - **The bridge**, for a span out of range, a part running diagonally across the gap, both leads in one node, **or a lead in a rail** (the registry refuses one leg on a rail and one in the body, `registry.js:594`): place the part legally from one real node to a free helper column-half H within span, then `add_wire` from H to the other real node. Electrically exact. A part with both legs in rails needs two helpers. Search order for H: the same half on both sides within the span, then the same column across the gap (a vertical placement). Flag it ("drawn shorter", "drawn with a jumper"). No helper free → flag `mismatch`, don't place.
   - Two leads in one hole: move the second to a free hole in the same column-half. A 6th lead into a full column-half is impossible: flag `position`.
   - **LED polarity is kept exactly as confirmed.** `place_led {holeA: cathode, holeB: anode, color}` (`led.js:201`, `215`). Never pick the direction that makes the circuit work: that would hide the fault.
7. **Wires** as given (wires have no span rules). An end on a taken hole moves within its node. A wire with both ends in one node is dropped and listed.
8. **Output:** `{ actions, labels, flags, skipped }`. Actions: the battery, then every part, then every wire, battery leads and bridge wires included (wire ends take holes, so parts go first). No `delete_all` (see below). **Invariant, checked in tests:** the nets of the built board equal the nets of the confirmed Reading for every built part.

## Build, then help
- **New `SparkyChat.applyBuild(actions)`** in the browser part of `chat.js`. Today the board helper `acceptBuild` needs is private (`chat.js:299-326`). It does what `sparkyAcceptChanges` does (`chat.js:528-541`): clear any pending preview first, `acceptBuild(actions, board)` (one undo step through `history.batch`), `App.frameCircuit()`, and post "Built N parts from your photo. Undo (Ctrl+Z) brings back the empty board."
- **Never overwrite her saved circuit.** If the board isn't empty, start a new circuit first with `App.clearAll()` (a new "Untitled"; her old circuit stays in My Circuits). Then build without `delete_all`. `delete_all` uses `keepCircuit: true` (`app.js:1092-1100`) and autosave would write the photo board over the open circuit.
- **Chat history:** add one `model` entry ("I built your board from the photo: R1 c10–c14, LED1 c15–c16, …") so follow-ups like "make R1 bigger" have context.
- **Then `App.runSimulation()`** (`app.js:1282-1285`). The problems panel lists the fault. A row whose label is in `window.PhotoFlags` gets a small "read from photo, unsure" badge (about 10 lines in `mistakes.js` `row(p)`; `photo.js` owns the set and clears it on the next photo or a cleared board).
- **Edison answers her question:** `sparkyAsk(question, { context })`, a new option: the context is **appended to the `message` field** of the `/api/ask` request (`question + "\n\n" + context`), so the server and contract don't change; her chat bubble shows only the question; `chatHistory` stores the message as sent (question + context) with role `user`, plus the reply. The context line is "Built from a photo of my real breadboard. Unsure readings: LED1 direction." It **must not contain part keywords** (e.g. "light", "lamp", "diode" select tools by whole word, `server.js:455-479`, `1248`) **or `NEW_BUILD` words** (`server.js:1135`). A unit test asserts `selectTools(question + context)` equals `selectTools(question)` and the `NEW_BUILD` match is unchanged. No question typed → "What's wrong with my circuit?".
- **She fixes it** with Edison's existing "Fix it" preview (#85) or by hand. Thandi flips the real part.

## The `/api/photo` route
- **Request:** `{ image, grid, sample? }`. `image` is a JPEG/PNG/WebP data URL of the **flattened** image, at most 2,048 px wide. `grid` is `{ cols, pitch, x0, y0, width, height }`. `sample` is a rehearsed photo's id.
- **Response 200:** `{ reading, provider, model, ms }`.
- **Errors**, each with a friendly `reply` and the sample offered: 400 `BAD_IMAGE` / `BAD_GRID`, 413 `TOO_LARGE`, 422 `NO_BOARD`, 429 (6 photos a minute per IP), 502 `AI_FAILED`, 504 `AI_TIMEOUT` (`PHOTO_TIMEOUT_MS`, default 45 s).
- **Body cap:** pull the 256 KB read out of the `/api/ask` handler (`server.js:1369`, `1413-1424`) into `readBody(req, res, max)`; `/api/photo` uses 4 MB. `/api/ask` stays at 256 KB.
- **Rate limit:** generalise `askRateLimited` (`server.js:1371-1395`) to `rateLimited(req, hits, max)`; photos get their own map.
- **Providers** (`PHOTO_PROVIDERS`, default `gemini,deepseek`; `fixture` for replay only). The key is the existing `GEMINI_API_KEY` (`server.js:40`); DeepSeek uses `DEEPSEEK_API_KEY`.
  - **Gemini:** pinned model `PHOTO_GEMINI_MODEL` (never a `-latest` alias), key in the `x-goog-api-key` header, JSON output with a response schema, the highest media resolution, per-attempt deadline 25 s.
  - **deepseek-flash** only, `json_object`, whatever time is left. **Never deepseek-v4-pro: it has no vision**, so the #130 fallback must not apply to this route.
  - Fall back on a timeout, 5xx, 429, network error, empty reply, or invalid JSON/Reading. Never on a 4xx bad request or key.
- **Fixtures:** `PHOTO_PROVIDERS=fixture` replays only. `PHOTO_RECORD=1` saves `test/fixtures/photo/<key>.json` (`{ sample, sha256, reading, provider, model }`). The key is the `sample` id, else the SHA-256 of the decoded image. In live mode, if every provider fails and the sample has a fixture, return it with `provider: 'fixture'`. Fixtures store the **Reading**, so `photo-import` changes never make them stale.
- **Page timeout:** `photo.js` gives up after `PHOTO_PAGE_TIMEOUT_MS` = 60 s (above the server's 45 s deadline, as `chat.js`'s `ASK_TIMEOUT_MS` = 75 s is for `/api/ask`) and shows the friendly message with the sample offered.
- **Logging:** one line per request (`[photo] sample=… provider=gemini model=… 8.2s parts=3 wires=3 fallback=no 612KB`). Never the image or upstream bodies.
- **The key** is server-side only (`backend/.env` or the environment). CORS is open (`server.js:1357`), so the per-IP limit matters; set `TRUST_PROXY` correctly if deployed behind a proxy. Firebase Hosting has no `/api` backend: like `/api/ask`, this route needs the Node server.

## Capture
- **Tier 1:** `<input type=file accept="image/*">` (AirDrop from the phone lands in Downloads), **drag-and-drop** onto the chat, and **Use sample photo** (`circuit3d/samples/*.jpg`, served as `.jpg`; `server.js:1447-1453`). The sample comes with stored corner taps, so it skips step 3. **The taps live in `circuit3d/samples/samples.js`**, a plain script that sets `window.PhotoSamples = { 'demo-board': { file, cols, taps } }` (a `.json` there wouldn't load: the static server leaves `.json` out on purpose, `server.js:1445-1446`).
- The browser resizes the original to at most 3,000 px before flattening, and sends the flattened JPEG (quality 0.9).
- **Stretch (#145):** the iPhone as a live camera through macOS Continuity Camera (`getUserMedia`, works on localhost): a device picker, a live view, **Snap**. A webcam frame is about 1920 × 1080, less than a still photo, so compare accuracy with AirDrop before using it on stage.

## Testing
- **Vitest:**
  - `photo-grid`: identity and trapezoid round trips; hole centres (j1 at y = 0, f1 at y = 4, e1 at y = 7, a63 at y = 11 in the j-on-top frame; the a-on-top frame chosen when that's the unmirrored one); snapping in the body, the gap and the rail zones; collinear taps rejected.
  - `photo-import`, known answers: a clean LED circuit (exact actions, no flags); a diagonal resistor; an 8-column resistor (bridge); an LED with both legs in one column-half (bridge, simulates shorted and dark); a leg in a rail (bridge); both legs in rails; two leads in one hole; a 6th lead in a full column-half (flag); a wire e10 → f10; bottom + mapped to `bp` on a BB830-order board; a taken rail hole; no source (9 V, flagged); a 30-column board; LED polarity never changed; every action passes `Parts.checkPlacement` in order; **the nets of the built board equal the confirmed Reading's**, also on the hand-labelled truth of the 6 spike photos (`test/fixtures/photo/web/`).
  - **The demo board:** 9 V, 470 Ω and a red LED in backwards simulate to the LED dark with a "backwards" problem; flipped, about 14.9 mA.
  - The route with a fake `fetch`: the Gemini request shape (pinned model, key header, schema); Gemini 503 → deepseek-flash, and never `deepseek-v4-pro`; both failing → 502; a slow fake → 504 under a small timeout; 413, 400, 429; fixture by sample and by hash; `/api/ask` still capped at 256 KB.
  - The context line changes neither `selectTools` nor `NEW_BUILD`.
  - `wiring.test.js`: the script order and the 📷 button.
- **Playwright (3):**
  1. `setInputFiles` with a fixture photo, stored corner taps, `/api/photo` stubbed: the dots appear, moving one works, Build places the parts, the simulation shows the LED backwards, the follow-up `/api/ask` (stubbed) carries the question and the context. No console errors.
  2. `/api/photo` stubbed to answer 504 `AI_TIMEOUT` → the friendly message and the sample button (and a hang with the page timeout shortened through a test hook).
  3. Use sample photo sends `sample` and skips the corner step.

## Prototype results (2026-10-01)
A throwaway `photo-grid.js` + `photo-import.js` (in `photo-reference/prototype/`, run with `node check-photos.js`, `check-edges.js`, `check-demo.js`) was run through the app's real `Board.apply`, the Accept path (`Chat.applyActions`) and the server's placement checks:
- **The 6 real photos** (hand-labelled truth as the confirmed Reading): zero refusals, zero stacked holes, and **the built board's nets equal the truth on all 6**. 27 two-lead parts imported, **17 of them bridged** (resistors 8–10 columns apart, legs in rails, a standing resistor 1 column apart).
- **Edge cases 14/14**, plus a 400-board fuzz: 570 bridges, 0 refusals, nets always equal; a deliberately wrong bridge is caught.
- **The demo board:** backwards LED → LED1 off, 0.00 mA, and `Readings.problems()` gives `backwards` for LED1 ("LED is backwards. Current cannot flow from cathode to anode. Flip it around."); flipped → 14.89 mA, "💡 LED ON (14.9 mA)", no problems.
- **The grid** matches the spike's `geom.py` to 1e-7 px with 4 taps; 484/484 snap probes right.

Rules this added (already folded into the sections above or below):
- **Labels can't be chosen** (`place_*` takes none; `Ids.nextLabel` numbers in order), so a skipped part shifts later labels. That's why the confirm screen names parts and wires by their Reading ids (#178), not by `labels`, which only names the built board.
- **Emit all parts first, then all wires**, since wire ends take holes.
- **The confirm screen draws rails by their printed sign**, not by our model's position (our model draws + outer on both sides; on a BB830 the bottom + is inner).
- **Unknown LED polarity:** the importer takes the first dot as the anode and flags it; the confirm screen makes her choose before Build is enabled.
- **The assumed battery** (no source seen) wires every rail pair in use, like a power module would, flagged `source`.
- **Snapping in the centre channel** goes to the nearest e or f hole with `zone: 'gap'` (the spike's `snap()` fell through to a rail).
- **More than 4 taps:** normalise coordinates before the least-squares fit (with exactly 4 the fit is exact).
- **The stage board:** put the resistor fully in the main holes with a jumper from the + rail (the app's own recipe shape), so it imports with zero bridges and zero flags.

**Found, not in Tier 1:** a part with both legs in one strip (shorted) isn't diagnosed: the simulator shows 0 mA and "No output components", and `Readings.problems()` returns nothing. A `shorted` problem kind is a separate mistake-rule change (Aarmen's call).

## Tasks, in order (built on the school computer)
Every issue is self-contained: claim it with a "Claimed by" comment, one worktree per issue, `/start-task`, `/ship`.

| Issue | Task | Blocked by | Lane |
|---|---|---|---|
| #134 | Contract: `/api/photo`, Reading v1, `PhotoGrid`, `PhotoImport`, `SparkyChat.applyBuild`, `sparkyAsk(msg, {context})`; env names | — | docs |
| #135 | `photo-grid.js`: homography, real-board rows, hole centres, snapping, warp | #134 | light |
| #136 | `photo-import.js` core: Reading → actions, rails by sign, battery, wires, same nets | #134 | light |
| #137 | `photo-import.js` legalising: the bridge, two-in-a-hole, full column-half, real-board truth test | #136 | light |
| #138 | `/api/photo` route: `readBody`, `rateLimited`, errors, fixture provider, logging | #134 | light |
| #139 | Live readers: Gemini, deepseek-flash, conversion to Reading v1, prompt golden | #138 | light |
| #140 | 📷 capture: file / drop / sample, corner taps with the live grid, flatten and send, key swallowing | #135, #138 | browser |
| #141 | Confirm screen 1: dots, move, ⇄, ×, Build it | #137, #140 | browser |
| #142 | Confirm screen 2: + Add, values and colours, battery, amber flags, not-built list | #141 | browser |
| #143 | Build and help: `SparkyChat.applyBuild`, new circuit if not empty, simulate, problems badge, `sparkyAsk` with context, chat history | #141 | browser |
| #144 | Rehearsed demo board: real samples, recorded readings, tuned prompt, pinned model, QA rows | #139, #140, #143, real photos, a Gemini key | light |
| #145 | Stretch: iPhone live camera (Continuity Camera) | #140 | browser |

#135, #136 and #138 can run in parallel after #134 (unit tests only). #140–#143 are browser work: one at a time on a laptop.

**Reference material in the repo:** `docs/superpowers/specs/photo-reference/` (the spike's `geom.py`: homography, orientation, rectifier, grid overlays, snapping) and `Plugged/test/fixtures/photo/web/` (6 real photos with corner taps and hand-labelled truth; licences in `ATTRIBUTION.md`).

**Tier 2 (sprint), its own spec later:** code finds which holes are occupied (dark-hole detection on the flattened image) and assigns leads to occupied holes near each part's box by footprint, so most dots arrive right; wires by colour; a crop-and-point pass; `npm run photo-eval` (20 boards Thandi builds in Edison first, then for real) for the pitch number.

## Reliability on stage
- **The board:** 2 identical boards, a 9 V clip, 470 Ω (yellow-violet-brown), a red 5 mm LED with untrimmed legs and the anode bent so polarity shows from above, flat pre-cut red and black jumpers, column numbers near the circuit uncovered.
- **The photo:** top-down, even light, no flash, matte background.
- **Fallback order:** live photo → the sample ("here's the photo I took this morning") → fixture mode (no network) → the backup video. Phone hotspot for the internet; check `/api/health` before going on.

## Risks
| Risk | Mitigation |
|---|---|
| The model's first guess is poor | The confirm step makes the result right regardless; Tier 2 improves the first guess |
| Many taps make the demo slow | A clean demo board; the rehearsed sample; Tier 2 |
| A photo build overwrites a saved circuit | A new circuit when the board isn't empty |
| Keyboard shortcuts fire inside the overlay | Swallow keydown while it's open |
| The Gemini free tier rate-limits on stage | Paid key before the event; deepseek-flash, then the fixture |
| deepseek-v4-pro has no vision | The photo route never uses it |
| The context line pulls in AI tools | No part or build keywords; a unit test |

## Out of scope (Tier 1)
- Reading ICs (TL072), buttons, switches, capacitors, pots and other parts from a photo: listed as "not built".
- Reading resistor values reliably: she picks from the dropdown.
- Split rails in the simulator (flagged only).
- Live video, multiple photos, automatic corner finding.
- Check-my-board against a lab's intended circuit (later).
