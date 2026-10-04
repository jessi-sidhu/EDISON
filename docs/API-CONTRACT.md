# API contract

<!-- Shared. This is how modules talk to each other. Agents build against it exactly.
     Aarmen changes it; say what changed in the commit. -->

## Rules
- Every interface lists its input and output shapes, its error cases, and a mock response.
- Until the real implementation lands, callers use the mock response. Frontend work never waits on backend work.
- Changes are additive where possible (a new optional field, a new endpoint). A breaking change must list every caller that needs updating.

---

# Part file contract (parts registry)

**Why it exists:** adding a part means writing **one file**, `Plugged/circuit3d/js/parts/<type>.js`, and nothing else. The simulator, placement, 3D view, AI tools, save/load, sidebar and inspector all read the registry. There are no per-type tables anywhere else.


**Loading:**
- Each part file is a UMD module that calls `Parts.define({...})`.
- `parts/index.js` lists every part file. The browser loads it after `parts/registry.js` and before `components.js`, `interaction.js`, `simulate.js`, `ids.js` and `app.js`, in `index.html` and `viewer.html`.
- Node (`backend/server.js`, Vitest) calls `require('circuit3d/js/parts')`.
- The **definition half** of a part never touches `THREE`, `document` or `window`.
- The **view half** (`view`) runs only in the browser.

## Shared types

### `PartDefinition`
Passed to `Parts.define()`. **Required** fields are marked ●. Anything not listed here is rejected at registration.

| Field | Type | Rules |
|---|---|---|
| ● `type` | string | `/^[a-z][a-z0-9_]*$/`, unique. Saved in circuit files, so it's **never renamed**. |
| ● `name` | string | Sidebar title, ≤ 24 chars, e.g. `"Resistor"`. |
| ● `sub` | string | Sidebar subtitle, ≤ 32 chars, e.g. `"2 leads · axial"`. |
| ● `category` | enum | `Passives`, `Sources`, `Semiconductors`, `I/O` or `Instruments`. |
| ● `icon` | string | Inline `<svg>` markup, ≤ 2 KB. |
| ● `prefix` | string | Label prefix, `/^[A-Z]{1,3}$/`, unique (`R` → R1, R2…). |
| ● `pins` | string[] | 2–16 names, unique, `/^[A-Za-z0-9]+$/`, e.g. `['cathode','anode']`. **Files save the pin *name* with every hole and wire end**, so reordering is safe; **renaming a pin is not** (treat names like `type`). Only files saved before names were added rely on order. `LED1.anode` and `LED1.1` both refer to a pin. |
| `ref` | pin name | Only for sources: this pin can be ground (0 V). **Exactly one ground per connected circuit:** the `ref` pin of the *earliest-placed* source in that circuit (lowest index in `state.components`). Two separate circuits each get their own ground. A circuit with no `ref` pin is `'no-source'` and its voltages are `null`. |
| ● `place` | `Placement` | See below. |
| `wireColors` | `{ [pin]: 0..0xffffff }` | A new wire drawn from or to that pin takes this colour, whatever is picked; when both ends have one, the start end wins. Loads and undo keep each wire's saved colour (#133: the multimeter's probes, the bench supply's posts). |
| `values` | `{ [key]: ValueSpec }` | Editable settings, saved. |
| `controls` | `{ [key]: ControlSpec }` | Live settings (knob, switch). |
| `gestures` | `{ click?: key, scroll?: key }` | Map 3D gestures onto a control key. The core (not the part) throttles: while a gesture continues, re-simulate **at most every 100 ms**, plus one final run when it stops. **One gesture = one undo step**; a scroll ends after 300 ms without a tick. |
| ● `elements` | `(values, controls) → Element[]` | The simulator's building blocks. Pure function. |
| `measure` | `(r: PartResult) → object` | Flat, JSON-safe outputs, e.g. `{ on: true, current: 14.9 }`. Drives visuals and results. |
| `warnings` | `(r, m) → string[]` | Advice, e.g. `"LED1 is backwards"`. Each ≤ 120 chars. |
| ● `report` | `(r, m) → string` | One results line, ≤ 80 chars, e.g. `"ON, 14.9 mA"`. |
| `headline` | `(r, m) → { text, cls }` | One line at the top of the results panel, e.g. `Battery 1: 9V` (`sim-info`). Headlines are in board order, with sources (parts with `ref`) after the others. Before a solve (or when there is none) it gets `r` without readings and `m = {}`. |
| `line` | `(r, m) → { text, cls } \| null` | Replaces the generic `💡 NAME ON (x.x mA)` line for this part, e.g. the buzzer's `🔔 BUZZER ON (x.x mA)`. `null`: no line. |
| `reading` | `(r) → { V?, P?, channels? }` | Overrides what `Readings.part` gives for this part: `V` and `P` replace the defaults, and `channels` is added as is. The bench supply uses it so its V doesn't depend on pin order. |
| `pinout` | `{ title, style: 'dip', labels: string[] }` | The inspector's top-view pin-out diagram (#132). `labels`: one name per pin in pin order, each 1–6 characters. `dip` needs an even pin count and lists 1..n/2 down the left, n..n/2+1 down the right. Not sent to the AI. |
| ● `ai` | `AiSpec` | See below. |
| ● `view` | `ViewSpec` | Browser only. See below. |
| ● `examples` | `Example[]` | At least 1 known-answer circuit. See the testing contract. |

### `Placement`
Exactly one of these three kinds:

```js
{ kind: 'span', span: { min, max, default }, rotations: ['h'] | ['h','v'] }
//   2-lead parts. 'h': both legs on the SAME ROW; span = columns apart (a3→a7 = 4).
//   min ≤ default ≤ max. A fixed size is min = max = default.
//   The ghost and hand placement use `default`; the AI may use anything in range.
//   'v' is allowed ONLY to cross the centre gap: same column, one leg in rows a–e and one in f–j.
//   Vertical inside one half is refused (both legs would be the same node). Span limits apply to 'h' only.
//   Spans: resistor {3,5,4} · LED {1,3,2} · buzzer {2,2,2} · button {3,3,3} (fixed).

{ kind: 'footprint', legs: [[dCol, dRow], ...], straddle?: boolean, rotations: [0, 180] | [0, 90, 180, 270] }
//   3+ lead parts. One offset per pin, in pin order, from the anchor (pin 0).
//   straddle: true = chip across the centre gap (legs in rows e and f); rotations limited to [0, 180].

{ kind: 'offboard' }
//   Battery, bench supply, instruments. Sits beside the board; legs have hole: null.
```

### `ValueSpec`
```js
{ unit: 'Ω'|'V'|'A'|'F'|'H'|'%'|'°C'|'lux'|'Hz', default: number, min: number, max: number, series?: 'E12'|'E24' }
//   Any number in [min, max] is allowed. `series` only powers the "closest kit value" hint.
{ choices: { [name]: { ...overrides } }, default: name }
//   e.g. LED colour: { red: { vf: 2.0 }, green: { vf: 2.2 }, ... }. A choice may set other values.
```
The default must be valid. `Parts.checkValue` is the only validator, and the inspector, AI path and file loading all use it.
- Either form may add `ai: false`: the value is left out of the AI's `place_` tool and `set_value` (the inspector still shows it), e.g. the bench supply's `voltage2` / `limit2` (#124).
- Either form may add `activeWhen: { <control>: <option>, note }`: the value applies only while that `choice` control has that option; otherwise the inspector greys its row with `note` (1–24 chars) and refuses edits, e.g. the bench supply's `voltage2` / `limit2` with `{ mode: 'independent', note: 'tracks CH1' }` (#127).

### `ControlSpec`
```js
{ type: 'toggle',    default: boolean, saved: boolean }
{ type: 'momentary', default: false,   saved: false }            // button: true only while held/pressed
{ type: 'slider',    default: number,  min, max, step, unit?, saved: boolean }
{ type: 'choice',    default: name,    options: [name, ...], saved: boolean }   // 2+ names; the default is one of them
```
- Any type may add `ai: false`: the control is left out of `set_control`.
- Any type may add `clickAnytime: true`: its click gesture also works while editing, not only while simulating (one undo step).
- A `choice` control's click gesture moves it to its next option (wrapping).
- A model may mark one mesh `userData.clickTarget = true` (the bench supply's mode button): its click gesture then works only on that mesh, and a click elsewhere selects the part.

### `Element` (the simulator's building blocks)
The element `pins` name the part's pins, or internal nodes written `'#name'` (private to the part). The optional `id` names the element for `r.current[id]`.

| `kind` | Fields | Notes |
|---|---|---|
| `R` | `pins:[a,b], ohms` | `ohms > 0` |
| `V` | `pins:[plus,minus], volts, wave?, ref?` | Adds one unknown. `wave: { kind: 'sine', amp, freq, offset }` (V, Hz, V) replaces `volts`: `offset` in a plain solve, `offset + amp·sin(2π·freq·t)` in a time step at `t`. A wave with a non-finite `amp`, `freq` or `offset` falls back to `volts`. `ref` (one of its pins, on a source part) grounds that pin's circuit when this element is the earliest source there, after the part's own `ref` (#124: the bench supply's CH2 −). |
| `I` | `pins:[from,to], amps` | Arrives with the first part that needs it. |
| `SW` | `pins:[a,b], closed` | Closed = 1 mΩ, open = removed. Never an ideal short. |
| `D` | `pins:[anode,cathode], vf, ron, vz?` | Mode block: `off` / `on` / (`breakdown` if `vz`). Replaces today's LED special case. |
| `E` | `out:[+,−], ctrl:[+,−], gain, rout?, rails?:[vneg,vpos], headroom?, ilim?` | Voltage-controlled voltage source: `gain·(V(ctrl+) − V(ctrl−))` behind `rout` Ω (default 0). Adds one unknown, its output current. `rails` name pins whose voltages bound the output, `headroom` (V, default 0) keeps it inside them, `ilim` (A) limits its current. With `rails` or `ilim` it is a mode block (table below); without, always linear. `r.current[id]` is **+ when the E sources current out of `out+`** (not pin order). Not a `ref` source. |
| `G` | `out:[from,to], ctrl:[+,−], gain` | Voltage-controlled current source. Arrives with dependent sources. |
| `C` | `pins:[a,b], farads, vmax?, polarised?` | Open in a plain solve. With `analyze(components, wires, { dt, state })` it is the backward-Euler companion: `G = C/h` plus a current source `G·v_prev`. `vmax` and `polarised` are for the mistake checker. |
| `L` | none | **Reserved.** Rejected. |

**`E` modes** (`r.modes[id]`). Levels are node voltages: the drive `u = V(out−) + gain·vd`, `hi = V(vpos) − headroom`, `lo = V(vneg) + headroom` (±∞ with no `rails`; `ilim` ∞ when missing). `I` is the output current, + out of `out+`.

| Mode | Output | Consistent when |
|---|---|---|
| `linear` | `u` behind `rout` | `lo ≤ u ≤ hi` and `|I| ≤ ilim` |
| `high` | `hi` behind `rout` | `u ≥ hi` and `|I| ≤ ilim` |
| `low` | `lo` behind `rout` | `u ≤ lo` and `|I| ≤ ilim` |
| `isrc+` | `I = +ilim` | `V(out+) ≤ clamp(u, lo, hi) − rout·ilim` (the clipped drive would push more) |
| `isrc−` | `I = −ilim` | `V(out+) ≥ clamp(u, lo, hi) + rout·ilim` |
| `open` | `I = 0` (drives nothing) | Not a mode block; never flipped. Set for one of two reasons. **Unpowered**, before the solve: a `rails` pin reaches no source's `ref` pin through wires and the non-`E` elements (`unpoweredEs` leaves out every `E`, so no op-amp's output counts as a supply; an open `SW`, or a `C` outside a time step, doesn't join either). **A floating input** (#1), only when the first solve fails: an `E` with `rails` that has a `ctrl` pin no other pin reaches (only this E's own inputs on its node, through holes and wires) and an `out+` that reaches another part's pin. The board is solved once more with those open too, and each one is named in its part's `r.floatingInputs`. |

An `E` with `rails` whose rail pin isn't connected to any source has its output open (`open` above), so a chip with no supply drives nothing. When a board can't be solved, an `E` with a floating input and its output wired to another part is opened too, and the board is solved once more; "cannot be solved" only if that also fails (#1). A board that solves first time is unchanged. Boards with no E with `rails` are unaffected.

A board with no `E` solves exactly as before.

**Mode blocks** (`D`, and `E` with `rails` or `ilim`) are solved by one generic loop:
1. Solve.
2. Find the mode block most inconsistent with the result, and flip it.
3. Repeat, up to `4·n + 10` rounds, with anti-cycling.

If it doesn't settle, the status is `'unsettled'`. It never reports wrong numbers.

### `PartResult` (the core → a part's `measure` / `warnings` / `report`)
```js
{
  label: 'LED1', values, controls,
  pins:    { cathode: 0.00, anode: 2.00 },   // volts vs ground, null if floating
  pinMax?: { anode: 2.00 },                   // floating pins only: the highest the node could rise before an off diode on it
                                              // conducts (min over off D with anode there, cathode driven or itself capped, of V(cathode) + vf); null if uncapped
  current: { d: 14.9 },                       // mA, by element id (or index), + in pin order
  modes:   { d: 'on' },                       // mode blocks only
  open:    { d: 9.00 },                       // volts across each mode block with every mode block off
  swings?: true,                              // on every part when the board holds a sine that crosses 0 V (amplitude > |offset|)
  floatingInputs?: { op2: true },             // E ids the simulator opened for a floating input (#1, the `open` mode); absent when none
}
```

### `AiSpec`
```js
{
  tool?: 'place_<type>',       // default; must be unique
  about: '≤ 200 chars',        // tool description (ranges and kit series are appended automatically)
  keywords: ['pot', 'knob'],   // ≤ 8, lower case; used by tool selection
  values?: ['color'],          // the value keys the AI may set (its tool params); default: all of them
  guide?: '≤ 400 chars',       // wiring rules, sent only when this tool is sent
  everyday?: true,             // in the set sent when a message names no part
  mustWire?: ['wiper'],        // pins that must be wired; the server warns when one goes nowhere (optional)
  recipe?: Example,            // a worked build; must also pass the testing contract
  recipes?: Example[],         // more worked builds (#118), each like recipe; sent after it, one block each
  listed?: 'in-play',          // named in the catalogue, label-prefix and wiredBy prompt lines only when its tool
                               //   is sent (default: always named); SYSTEM_PROMPT (every tool) still names it (#118)
}
```
- `ai: false` instead of an object: the part is never offered to the AI as a tool or listed in the prompt (no part uses it today). The multimeter, the capacitor, the TL072 and the function generator are AI parts with `listed: 'in-play'`, named in the prompt only when their tool is sent (#123, #120).
- **The ai-eval cases** (`scripts/ai-eval-cases.js`, graded by `scripts/ai-eval.js`): a case or one of its `states` may carry `t` (seconds) and optionally `dt` (default 1 ms). Its board is then solved as one time step, `Sim.analyze(components, wires, { dt, state: {}, t })`, so a wave source reads its value at `t`, not only its offset (#120).

### `ViewSpec` (browser only)
```js
{
  build(ctx, values, controls, legs) → { group: THREE.Group, pinPositions: THREE.Vector3[] },
  //   One pin position per pin, in pin order. The ghost is this same build drawn with ghost materials.
  //   ctx: { THREE, ghost, lead(from,to), bentLead(points, r, bend), axial(A, B, len, h, r), capsule(r, len, e),
  //          lathe([[r, y], …], segs), roundBox(w, h, d, r), paint(W, H, draw) → CanvasTexture,
  //          print(w, h, draw, px) → label mesh, mat.{surface(hex, opts),body,metal,glass,label},
  //          holeWorld(col,row), boardGeometry }
  //   mat.surface is a physical material (roughness, metalness, clearcoat, opacity…) lit by scene.js's
  //   studio reflections; every mat.* is see-through in the ghost.
  update?(obj, measured, r) → void,   // glow, spin, sound; called after every simulation
  show?(obj, reading) → void,         // a part-specific display a tool drives (the multimeter's LCD, below)
}
```

### `Example` (known-answer circuit)
```js
{
  name: 'LED on 9 V with 470 Ω lights at ~14.9 mA',
  parts: [ { type: 'battery', label: 'BAT1' },
           { type: 'resistor', label: 'R1', holes: ['a2','a6'] },
           { type: 'led', label: 'LED1', holes: ['b8','b6'], values: { color: 'red' } } ],   // cathode b8, anode b6
  wires: [ ['BAT1.0','tp_50'], ['BAT1.1','tn_50'], ['tp_2','b2'], ['c8','tn_8'] ],        // one lead per hole
  expect: { 'LED1': { on: true, current: [14.0, 15.8] } },   // exact value or [lo, hi]; keys are measure() fields
}
// A part in `parts` may also set `controls` (same shape as the saved record), e.g.
//   { type: 'toggle_switch', label: 'SW1', holes: ['a10','a12'], controls: { closed: true } }
```

### Board model (`circuit3d/js/board-model.js`, `window.Board`; #81)
The board as plain data, no THREE or DOM, so an AI build can be applied and simulated in Node.
```js
{ parts: [ { type, label, holes?, values?, controls? } ],   // an Example part
  wires: [ { id: 'W1', from: 'BAT1.0', to: 'tp_50' } ] }    // ends: a hole or LABEL.k
```
- `Board.empty()` → `{ parts: [], wires: [] }`.
- `Board.fromExample(ex)` → a board: parts copied, wires `[from, to]` numbered `W1…Wn` in order.
- `Board.apply(board, actions)` → `{ board, errors }`. Never mutates its input. Actions run in order:
  - `delete_all`: empty board; labels and wire ids start again at 1.
  - `place_<type>`: label by `Ids.nextLabel` (highest number in use + 1, as `Chat.predictLabels`). `span` → `holes: [holeA, holeB]`; `footprint` → `Parts.footprintLegs(type, hole, Board.ROTATION[direction])`; `offboard` → no holes. Args that are the part's value keys go into `values`.
  - `add_wire { from, to }` → `{ id: 'W<n>', from, to }`, n = highest wire number in use + 1 (ids are never renumbered). A `LABEL.k` end is stored with the part's own label (`bat1.0` → `BAT1.0`), and a hole in lower case (`TP_3` → `tp_3`, as span holes are too).
  - `delete_part { part }`: removes the part and every wire with an end on one of its `LABEL.k` pins.
  - `delete_wire { wire }`, `set_value { part, ... }` and `set_control { part, ... }` (merged into `values` / `controls`).
  - A null argument is ignored: it neither sets a value nor clears one.
  - Errors: `errors.push({ index, tool, why })` (0-based action index); the action is skipped and the rest still apply. An action is an error when it has:
    - an unknown part label, wire id or tool
    - a wire end that is neither a board hole nor `LABEL.k` (e.g. the old `battery_0_pin0`), or that names no part or no such pin of that part
    - a span place missing `holeA` or `holeB`, or with a span hole that isn't a board address
    - a footprint place with a bad direction, or any leg off the board (outside columns 1…COLS or rows a–j)
    - an `add_wire` missing `from` or `to`
  - No range or placement-legality checks: the server does those.
- `Board.toSim(board)` → `{ components, wires }` for `Sim.analyze(components, wires)`, with values filled in from the part's defaults. Throws on a hole that isn't a board address or a wire end that names no pin.
- `Board.ROTATION` = `{ right: 0, down: 90, left: 180, up: 270 }`, the same as `Chat.ROTATION`.
- `Board.toActions(board)` → `{ actions, labelMap }` (#84): the actions that rebuild `board` from nothing. `delete_all`; one `place_*` per part in board order (span `holeA`/`holeB`, footprint `hole` + the `direction` whose legs are its holes, off-board none) with its values as arguments; one `add_wire { from, to }` per wire; then `set_control { part, ...controls }` per part with controls. Labels are re-predicted by placement order (a board with `R1, R3` rebuilds as `R1, R2`); `labelMap` maps old label → new, and `LABEL.k` wire ends are rewritten through it. Never mutates `board`.
- `App.exportBoard()` (#84) → the live board in this shape: parts by label (`holes` in pin order, none off-board; `values`; `controls` when it has any), wires `{ id, from, to }` with the same ends as the markdown Wires table.

### `POST /api/ask` (#84)
- Request: `{ markdown, message, history, board?, explain? }`. `board` is `App.exportBoard()`. A request without it (an older client) behaves as before #84.
- `explain` (#169), optional boolean: `true` asks for an answer only, never an edit. On DeepSeek every request of that ask leaves the `tools` and `tool_choice` keys out (not `tools: []`), the request goes at temperature 0, the system prompt is as without it, the user message gets one instruction after the question (`EXPLAIN_NOTE` in `ai-providers.js`: answer only from the Simulation section, whose list of problems is complete; name each problem, its part and holes and how to fix it by hand; suggest no other wiring changes; if it lists none, say so and what to check by hand; write no tool calls), the log says `[ask] explain: no tools` instead of the `[ask] tools: …` list, and the response is `{ reply, actions: [] }`: a tool call the model makes anyway queues nothing, tool-call markup written as text (DeepSeek DSML blocks, tags named after a tool such as `<delete_wire … />`) is cut from the reply, and a reply with no text left becomes `"I couldn't explain that just now."`. No repair round and no finish step run. Absent or `false`: unchanged. The Gemini, claude and fixture providers ignore it. The page sends it only from the photo's Build it with nothing typed (`sparkyAsk(msg, { context, explain: true })`); a typed question and every chat send go without it.
- Errors (#129): a DeepSeek ask past its deadline (`DEEPSEEK_TIMEOUT_MS`, default 240000 since #4, shared by every round, repairs included) → 504 `{ reply: 'The AI took too long — try again.', actions: [], code: 'AI_TIMEOUT' }`, unless the current run (the fallback's restart included, which keeps nothing from the primary's) has already ended a turn on a build (#7): then the attempt the repair loop would keep (below) is sent as a normal 200 reply, with a Heads up if it still has problems, and the server logs `[repair] deadline: kept round N: K problems`. Any other AI failure → 502 `{ reply, actions: [] }`. The page gives up on its own after `SparkyChat.ASK_TIMEOUT_MS` (255000) with the same message.
- Fallback model (#130): when one DeepSeek request takes longer than `DEEPSEEK_PRIMARY_TIMEOUT_MS` (default 25000), or answers 5xx, or can't be reached, the whole ask restarts once on `DEEPSEEK_FALLBACK_MODEL` (default `deepseek-v4-pro`; empty turns it off) inside the same `DEEPSEEK_TIMEOUT_MS` deadline. The restart after `DEEPSEEK_PRIMARY_TIMEOUT_MS` applies with reasoning off (`DEEPSEEK_THINKING=0`) or in explain mode only; with reasoning on (#4), only a 5xx or a network error falls back. A 4xx never falls back. The response shape is unchanged; only the server log adds ` (fallback <model>)`.
- Every live wire has an id `W<n>` (highest in use + 1, never renumbered; after the AI's `delete_all` it starts again at W1). The markdown Wires table is `| id | from | to | color |`.
- Server checks: a reply with `delete_all` is checked from its last one, as before. An edit with a `board` is checked on `Board.apply(board, actions).board`, rebuilt by `Board.toActions` so it gets the full checker and the simulator, with the rebuild's labels mapped back to the board's own in the problems. An edit reports only the problems it introduces: the board after it minus the board before, compared in the board's own labels, so unfinished wiring already on the board is never reported. The repair loop and the Heads up both use this. An edit without a `board` is not checked. The actions sent back are the reply's own, or, with a repair loop (#6), the attempt with the fewest problems (a tie to the later one, never one the round cap cut off; an attempt whose board has no part, such as a `delete_all` alone, never beats one with parts, #7), with any `delete_wire` of a wire the same build added folded out together with that `add_wire`.

### Placed-part record (runtime) and saved record
```js
// runtime (state.components[i])
{ type, label, values, controls, holeRefs: [{col,row}|null per pin], position?: {x,z}, group, pinMeshes, ... }

// saved (file, autosave, undo): today's shape, plus `controls` (saved ones only) and pin names
{ type, label, values, controls?, holeRefs: [{ pin: 'cathode', col, row }, ...], position }
// ONE holeRef per pin, each carrying its pin name. Off-board parts: holeRefs null, position set.
// Saved wires carry their id (#84): { id: 'W3', startHole, ... }. A file from before ids loads as
//   W1…Wn in its saved order.
// Saved wires name the pin at each end:  { ..., startPin: 'anode', endPin: '0' }  alongside today's
//   startPinIdx/endPinIdx (kept for older builds). Loading matches by NAME; only when a name is
//   missing (files from before this change) does it fall back to the index.
// Unknown types are kept as-is (#3).
```

### Legs and the hole map
```js
Parts.legsOf(comp) → [ { pin: 'cathode', col: 8, row: 'b', hole: 'b8' },
                       { pin: 'anode',   col: 6, row: 'b', hole: 'b6' } ]   // hole: null for off-board legs
App.holeMap() → Map<'b6', { label: 'LED1', pin: 'anode' } | { wire: 3, end: 'from' | 'to' }>
```
- **The stored legs are the truth.** The footprint is only used when placing.
- `Parts.footprintLegs(type, anchor, rotation) → [{ pin, col, row, hole }]`, one per pin in pin order, from an anchor hole (`'e20'`, pin 0) and one of the part's `place.rotations`. Offsets turn clockwise on the board (+col right, +row toward j): `0 (dc, dr)`, `90 (−dr, dc)`, `180 (−dc, −dr)`, `270 (dr, −dc)`; the AI's direction is right = 0, down = 90, left = 180, up = 270. Off-board legs still come back (a column outside the board, or row `null` past a or j) so `checkPlacement` can refuse them; a rotation the part doesn't allow gives `null`. Hand placement, `chat.js` and the server all use it.
- **The hole map is rebuilt from the records after every change** (place, delete, undo, load, AI apply). It is never patched as things change, and never saved. It replaces `breadboard.js`'s unused `occupied` flag.
- **The same map feeds** the overlap check, the AI board state, the stacked-holes check, and later the multimeter and check-my-board.

### Pattern: footprint + slider
The example is `Plugged/circuit3d/js/parts/potentiometer.js` (#31). The toggle switch, slide switch, LDR, thermistor and RGB LED copy it.
- **Footprint legs and rotation:** `place: { kind: 'footprint', legs: [[0,0],[1,0],[2,0]], rotations: [0, 90, 180, 270] }`, one leg per pin, pin 0 at the anchor. The user rotates with R; the AI sends `place_<type> { hole, direction }`, and `Parts.footprintLegs(type, anchor, rotation)` turns that into the legs. `view.build` draws from `legs` through `ctx`, so the ghost is the same model.
- **A saved slider:** `controls: { position: { type: 'slider', default: 50, min: 0, max: 100, step: 1, unit: '%', saved: true } }`. Saved means it goes into the file and each change is one undo step. The inspector shows it as a range input (step 1).
- **Elements from the controls:** `elements(values, controls)` is called again on every simulation with the record's current controls, so nothing is cached. The pot is two `R`s, `R(1, wiper) = max(p·R, 1 Ω)` and `R(wiper, 3) = max((1 − p)·R, 1 Ω)`, with `p = position / 100`.
- **The scroll gesture:** `gestures: { scroll: 'position' }`. While simulating, the wheel over the part moves the control: wheel up = +, wheel down = −. One tick is 1/20 of the control's range (5 % for 0–100), clamped to min–max, for every slider. One scroll gesture is one undo step, re-simulated at most every 100 ms (#26's dispatcher).
- **Measure from pin voltages:** `measure(r)` reads `r.controls` and `r.pins` (`wiperVolts = r.pins.wiper`, `null` when the wiper floats), and `report` gives `"50 % · 5.0 kΩ | 5.0 kΩ"`.

### Pattern: off-board multi-terminal source
The example is `Plugged/circuit3d/js/parts/bench_supply.js` (#34), the first off-board source with more than 2 pins.
- **Pins and ref:** `pins: ['pos', 'com', 'neg']`, `ref: 'com'` (COM is ground), `place: { kind: 'offboard' }`.
- **Terminal pairs come from the V elements:** each `V` element's `[plus, minus]` is one pair. The supply is `V(pos, com)` (id `pos`) and `V(com, neg)` (id `neg`); the battery's `V('0', '1')` is its one pair. `backend/server.js` checks every off-board source from these pairs: its ref pin and at least one other pin must be wired, wires alone across a pair are a short, and each part must sit between some pair's plus and minus.
- **Pin refs are `LABEL.k`**, `k` = the pin's index: `PS1.0` (+), `PS1.1` (COM), `PS1.2` (−). The i-th `place_<type>` in a build is `PREFIX<i+1>`. The battery's old `battery_n_pinK` form stays battery-only.
- **Board markdown:** a 2-pin off-board part prints as the battery always has. A 3+-pin one lists every pin, `off-board pos → wire ref: PS1.0`, and its wiring cheat-sheet line (`- **PS1**: …`) names every ref.
- **A limit that only warns:** `measure` gives each rail's mA and an over flag; `warnings` says `+ rail would current-limit: …`, and `view.update` lights a mesh named `limit-light`. There is no constant-current mode.

### The multimeter's 3D screen
- `view.show(comp, { text })` paints the meter model's LCD with the panel's own text (`'7.00 V'`, `'14.9 mA'`, `'FUSE'`, `'1.00 kΩ'`, `'OL'`, `'--'`). `tools/meter-display.js` calls it for every meter on each `plugged:sim` (a short's result and Ω mode included) and with `'--'` on `plugged:sim-stop`, so the LCD and `#meter-reading` always agree. The part reads no page state; its LCD mesh carries `userData.meterLcd` (JSON `{ text, unit, dc }`, what it shows).

### Pattern: off-board wave source
The example is `Plugged/circuit3d/js/parts/function_generator.js` (#120), a sine generator beside the board.
- **Pins and ref:** `pins: ['out', 'com']`, `ref: 'com'`, `place: { kind: 'offboard' }`; prefix `FG`, so `FG1.0` is OUT and `FG1.1` is COM.
- **Values:** `amplitude` (V, peak) 0–10, default 1; `frequency` (Hz) 0.1–100, default 1; `offset` (V) −10 to +10, default 0.
- **Elements:** one `V` from an internal node `'#src'` to `com` with `wave: { kind: 'sine', amp: amplitude, freq: frequency, offset }` (`volts` = offset), and an `R` of 50 Ω from `'#src'` to `out`, the output resistance. `backend/server.js` follows a `V` end on an internal node through the `R` joining it to an outer pin, so its terminal pair is (out, com).
- **Measure:** `{ vout }`, the present output `V(out) − V(com)`, `null` when unconnected. The headline reads `Function generator 1: sine 5.00 Vp at 1.0 Hz, offset 5.00 V · output 7.14 V`.
- **The view:** a mesh named `readout` whose `userData.text` is the panel's first row, `SINE 1.00 Vp · 1.0 Hz`; a value change redraws the part.

### Pattern: multi-element straddling part
The example is `Plugged/circuit3d/js/parts/seven_segment.js` (#43), the first part made of many elements that sits across the centre gap. DIP chips copy it.
- **Pins and footprint:** pins in datasheet order, `pins: ['e','d','com1','c','dp','b','a','com2','f','g']`. `place: { kind: 'footprint', straddle: true, rotations: [0, 180], legs: [[0,0],[1,0],[2,0],[3,0],[4,0],[4,-1],[3,-1],[2,-1],[1,-1],[0,-1]] }`: pins 1–5 run along the anchor's row (f) and pins 6–10 come back along the row across the gap (e), as a DIP is numbered. `Parts.checkPlacement` refuses any spot whose legs are not all in rows e and f with the straddle message.
- **Many elements, one internal node:** 8 × `D(<segment>, '#com', vf 2.0)` with `id` = the segment name, so `r.current.b` is segment b's mA and `r.modes.b` its mode. `SW(com1, '#com', closed)` and `SW(com2, '#com', closed)` tie the two common pins inside the part, so grounding either one works. Internal nodes (`'#name'`) never appear in the hole map or the AI's pins.
- **Measure reads every element:** a segment is lit when its `D` is `on` and carries ≥ 1 mA. `measure` → `{ segments: 'bc', digit: '1', dp: false }`; the digit comes from a pure table (with the common variants of 6, 7 and 9), `'?'` when nothing matches. `warnings` gives one line per element over its rating (`segment b is at 69.9 mA, …`), and `line` says `🔢 7-SEGMENT DISPLAY shows 1`.
- **The view:** leads stand in every hole, and the body and face are drawn in a group turned so its +x runs pin 1 → pin 5; the readout (the digit) is on the top face, facing the camera, with nothing tall in front of it. Each element that lights is its own mesh (`seg-a` … `seg-g`, `seg-dp`) in a `ctx.mat.*` material, so the ghost is see-through; `view.update` sets each one's emissive from `measure`, and darkens all of them on Stop.
- **AI:** `place_seven_segment { hole, direction }` like any footprint part. The guide gives one known-good layout (hole f30, right) and names `place_resistor`, so the resistor's tool is sent with it.

## Interfaces

### `Parts.define(def)`
- **Owner:** registry (`parts/registry.js`)
- **Called by:** every `parts/<type>.js`
- **Input:** a `PartDefinition`
- **Output:** the frozen definition
- **Errors:** throws `PartDefinitionError` naming the part and every rule broken. Examples:
  - an unknown field
  - a default outside its range
  - a duplicate prefix
  - `L` elements
  - a guide over 400 chars
  - a pin count that doesn't match the footprint
- **Mock:** none. The registry is the first thing built (issue A).

### `Parts.get(type)` / `Parts.all()`
- **Input:** `type` string / none
- **Output:** a definition or `null` / an array in category order, then name order
- **Errors:** none

### `Parts.checkValue(type, key, value)`
- **Output:** `{ ok: true, value, hint? }`, where `hint` is e.g. `"closest kit value: 1.2 kΩ"` when `series` is set and the value isn't in it. Or `{ ok: false, reason }`.
- **Errors:** `reason` examples:
  - `"resistance must be 1 Ω–10 MΩ; got −5"`
  - `"color must be one of red, yellow, green, blue, white"`

### `Parts.nearestKit(value, series)`
- **Output:** the nearest value in the E-series across decades. `1234, 'E12'` gives `1200`, and `470, 'E12'` gives `470`.

### `Parts.withUnit(n, unit)`
The one SI formatter: `withUnit(1234, 'Ω')` → `1.23 kΩ`. Used by the inspector, formatValue and the server's prompt lines.

### `Parts.checkPlacement(type, legs, holeMap, board)`
- **Called by:** hand placement (`interaction.js`), the AI apply path (`chat.js`), the server (`finishAIReply`, inside the AI's tool loop), and file loading, where it only flags, never blocks.
- **Flagged parts (loaded from an old file, breaking a rule): warn only.**
  - They load and simulate as saved, and show one warning line each in the results and the AI summary (`"R1: leads 30 columns apart; allowed 3–5"`).
  - They are **never auto-fixed and never block** editing anything else.
  - Moving a flagged part is a *new* placement, so it must land somewhere valid, which clears the flag.
  - Saving keeps it as-is.
- **Output:** `{ ok: true }` or `{ ok: false, reason }`
- **Errors:** `reason` always names the rule and the allowed range:
  - Span: `"R1 not placed: a resistor's leads must be 3–5 columns apart; a3 to a33 is 30."`
  - Overlap: `"LED1 not placed: b6 already holds R1's pin 2. A hole holds one lead; use another hole in column 6."`
  - Edge: `"U1 not placed: an 8-pin chip at column 62 would run past column 63."`
  - Straddle: `"U1 not placed: a chip must sit across the centre gap (rows e and f)."`
  - Vertical: `"R1 not placed: a part placed vertically must cross the centre gap (one leg in a–e, one in f–j)."`

### `Sim.analyze(components, wires)` (changed)
- **Output:** as today (`status, lines, nodeVoltages, currents, shorted, voltageAt`), plus:
  - `status` can also be `'unsettled'` or `'no-source'`
  - `parts: { [label]: { r: PartResult, m: measured, warnings: string[] } }`
- `ledsOn` and `buzzersOn` are gone (#26): the page reads `parts[label].m` and calls each part's `view.update`. `'no-source'` replaced `'no-battery'`.
- **Optional third argument `{ dt, state, t? }`** (additive): `analyze(components, wires, { dt, state, t })` runs one time step of length `dt`.
  - `t` is the time in seconds at the **end** of the step (the clock after it, which backward Euler solves for; the page passes `run.t + run.dt`, and the scope (#121) plots readings against it), for `V` elements with a `wave`; without `t` (or without `dt`) a wave reads its `offset`. A `V` with no `wave` ignores `t`.
  - Each `C` starts at its voltage in `state` (0 V when missing, i.e. discharged).
  - `state` and `result.state` are keyed `"<label>.<elementId>"` (e.g. `"C1.c"`), in volts, + from the `C`'s pin `a` to pin `b`.
  - `result.state` holds each capacitor's voltage after the step. Early returns (short wire across a source, parallel-source fight, unsolvable, unsettled, current source with no path) carry **no** `state`; the caller keeps its previous state.
  - Each capacitor's current is `result.parts[label].r.current[elementId]`, in mA, + from `a` to `b`.
  - A capacitor carrying current (≥ 1 µA) counts as a complete path, so "Circuit open — no complete path." is not shown while one charges or discharges.
  - Without `dt`, a `C` is an open circuit.
  - Called without the third argument on a board with no `C` elements, it behaves exactly as today.
- **`Sim.pickDt(tauMin, fmax?)`** → the page's step in seconds: `min(tauMin / 50, 1 / (50·fmax))`, clamped to 10 µs–10 ms. Without a positive finite `fmax` it is `tauMin / 50` clamped, or 1 ms when `tauMin` is not a positive finite number; without `tauMin` but with `fmax` it is `1 / (50·fmax)` clamped. `Sim.estimateFreqMax(components)` → the board's highest wave `freq` in Hz, or `undefined`.
- **The page's time run (#103, #119):** Run on a board with any `C` or any `V` with a `wave` starts a `requestAnimationFrame` loop instead of one solve. It steps up to 200 times per frame at `dt = pickDt(τ, fmax)` (τ estimated as the smallest R × the smallest C, `fmax` the highest wave frequency), carrying `state` and passing `t`, so sim time keeps pace with real time (`(slowed)` when it can't). Each frame shows `t = <s> s` at the top of `#sim-results`, then sends `plugged:sim` with that frame's result. A control change keeps `state`; Stop cancels the loop and clears it. A board with no `C` and no wave solves once, as before.

### `Readings` (`circuit3d/js/readings.js`)
- **Owner:** readings (`circuit3d/js/readings.js`). A plain module that loads in Node, like `simulate.js`. It never changes the solver.
- **Called by:** the tools (`circuit3d/js/tools/`), and `simulate.js`, which builds the readings for `plugged:sim`.
- **Units:** V, mA and W, the same as the results panel. `energy` is in µJ.
- **Input:** `Readings.from(result, board)`. `result` is from `Sim.analyze`; `board` is `{ components, wires }`, the same arguments given to `Sim.analyze`. In Node that is `Board.toSim(board)`'s output; in the page it is `App.state`. Readings are recomputed from the latest result.
- **Output:** an object with:
  - `netOf(hole)` → `{ id, holes[], pins[] }`
  - `voltage(hole | net)` → volts, or `null` when floating
  - `part(label)` → `{ V, I, P, rating, over, energy?, opamps?, channels? }`
    - `channels: [{ name, V }]` only from a part's `reading` hook: an independent bench supply gives `[{ name: 'CH1', V: pos − com }, { name: 'CH2', V: com2 − neg }]`, and its V is CH1's. In series its V is pos − neg, with no `channels`.
    - A part with `E` elements (an op-amp) has `opamps: [{ pin, vout, mode, iout, ilim, unused, floating }]`, one per E: its `out+` pin, Vout there (V vs ground, signed), the E's mode, Iout (mA, + sourcing out of `out+`), `ilim` (mA), `unused` (both `ctrl` pins floating: a half nobody wired), and `floating` (`true` when its PartResult's `floatingInputs` names this E: the simulator opened it because an input connects to nothing and its output is wired (#1); `false` otherwise, an unpowered chip included). Its V and I are op-amp 1's Vout and Iout, P is `null`.
    - V is the voltage across the part's outer pins, I is its current, and P = V·I, in W (I is in mA, so P = V × I ÷ 1000).
    - `rating` comes from the part's own values where it has one. Resistors are rated **¼ W**. A part with no rating has none.
    - `energy` is ½CV², in µJ, for capacitors only.
  - `kcl(net)` → `[{ label, pin, amps }]`: each element current into the net, signed, in mA. It sums to 0 within 1 µA. An `E` enters at its `out` pins: +Iout into the `out+` net, −Iout into the `out−` net.
  - `thevenin(a, b)` → `{ Vth, Rth, In }` or `{ why }`. It solves copies of the board when called, never on every solve. `{ why }` when there is no source, or when a and b are on the same net.
  - `problems()` → `[{ kind, labels[], why, info? }]`, built from the simulation result. It covers shorts, LEDs with no resistor, backwards parts, open circuits and parts over their rating, and op-amps: `no-supply`, `output-shorted` (an output at its current limit: tied straight to ground, a rail or the other output, or a load that takes too much current), `floating-input` (one row per chip with a half the simulator opened because an input connects to nothing, its `opamps[].floating` (#1); `why` is the chip's own warning(s) under one "U1: " lead; an unpowered chip is `no-supply` only, #8), and `clipped`, the only row with `info: true` (a note, never an error: a comparator clips on purpose; an unused half gives none). `why` is plain English.
  - `lines()` → `[{ label, title, sub: [string…], level }]`, one entry per part with something to say, for the Edison callouts (#191, `edison/result-callouts.js`). `level` is `'fault'` when a problem that isn't info names the part, `'warn'` when only an info one does, else `'ok'`. A fault or warn takes its title from the problem's kind ("No supply") and its `sub` from the `why`; an ok part takes its part name as the title and its own results-panel text (headline, line, or the ON line) as `sub`. A part with neither has no entry. Faults first, then warn, then ok, each in board order. No new wording for the physics.
- **`Readings.nets(board)`:** which holes and pins are joined, with no solve needed (for the connection highlight). `board` is `{ components, wires }`, as for `Readings.from`.
- **Errors:** never throws. `voltage` gives `null` when floating; `thevenin` gives `{ why }`; `part(label)` for an unknown label and `netOf(hole)` for a hole not on the board give `null`.
- **Mock:** none. Tests build a real result in Node with `Board.toSim` and `Sim.analyze`.

### Page events (`plugged:sim`, `plugged:sim-stop`)
- **`plugged:sim`** on `document`, with `detail: { result, readings, t? }`. Sent after every solve, and once per frame while time runs. `t` is the sim time in seconds, only on time-run frames (#121).
- **`plugged:sim-stop`** on `document`, sent on Stop.
- **Tools** live in `Plugged/circuit3d/js/tools/`. They only read `Readings`. A tool never calls the solver itself; the one exception is `thevenin()`.

### Legacy entry points (deleted in #27)
The per-type wrappers (`App.placeResistor` and the rest) and `chat.js`'s `PLACE` map are gone. Every placement goes through `App.placePart(type, where, values, opts)`, and the AI reaches it through the tools `server.js` generates from the registry. **Every change must keep the AI demo path working** ("Build a single LED circuit…" → preview → Accept → lit).

### AI tools (generated by `server.js` from the registry)
- **`span` parts:** `place_<type> { holeA, holeB, ...values }`. Existing names are unchanged.
- **`footprint` parts:** `place_<type> { hole, direction: 'right'|'left'|'up'|'down', ...values }`. `hole` = pin 0.
- **`offboard` parts:** `place_<type> { ...values }`.
- **Always sent:** `delete_all`, `add_wire`, `place_battery`, and:
  - `set_value { part: 'R1', <key>: value }`
  - `set_control { part: 'SW1', <key>: value }`
  - `delete_part { part: 'R1' }`
  - `delete_wire { wire: 'W3' }` (#84): the wire's id from the markdown Wires table. On Accept it is removed as the UI deletes a wire, in the same undo step; an unknown id is a failed action.
  - `use_parts { types: [...] }`, which adds those parts' tools and continues the same tool loop.
- **Whole or nothing (#199):**
  - In DeepSeek's tool loop, a `delete_wire`, `delete_part`, `set_value`, `set_control` or `add_wire` that names a wire or part the board doesn't have (and that wasn't placed earlier in the same reply) is answered `Refused: <why>. The board's wires are W1, W2… | The board's parts are R1, LED1…`, so the model can correct it in the same turn.
  - `finishAIReply` (every provider): if any `delete_wire`, `delete_part`, `set_value`, `set_control` or `add_wire` still names something not on the board (an `add_wire` end naming no part, or a pin its part doesn't have), `actions` becomes `[]` and the reply gains one line: `I couldn't make that change: it named X, not on your board. Nothing was changed. Ask me again.` (X is a wire id, a part label, or `the wire A → B`). A build that starts with `delete_all` is judged on its own.
  - On Accept (the page's Accept handler; `Chat.acceptBuild` itself, and the photo's `Chat.applyBuild`, still apply what they can), if any action fails, the whole batch is undone with `App.history.revert()` (an undo with no redo) and the chat says `Nothing was changed: <N of Edison's M changes | Edison's change> didn't match your board (<up to 3 failed steps, as describeAction gives them>). Ask again.` The model's history entry for that reply becomes `(The user accepted this build, but these steps didn't match the board, so nothing was changed: <failed steps>.)`, never the declined line. A half-applied fix never stays on the board.
  - Wire ends name a pin by number (`PS1.2`) or by its registry name (`MM1.red`, `PS1.com2`), on the page as in `Board.apply`.
- **The bench (#197, #198):** at most **1** `bench_supply`, **1** `function_generator` and **2** `multimeter`s (`window.Bench`, `circuit3d/js/bench.js`, Node-loadable, loaded before `app.js`).
  - `App.placePart` returns `null` for a new part over the limit, with the hint `PS2 not placed: the bench has one bench supply; use PS1's two channels` (the generator and meter versions name FG1, or MM1 and MM2). A part with a saved label (load, undo, redo) comes back as saved, so older files with a second supply still open.
  - The server refuses it first (`benchRefusal`, counted on the sent board with the reply's earlier steps): in DeepSeek's tool loop as `Refused: PS2 not placed: …`, and in `finishAIReply` as a note, after which the reply's wires to it drop the whole reply (above).
  - The page's `placeOne` notes the same line in the chat and counts it as a failed action, so Accept changes nothing.
  - Off-board parts the AI places go to `Bench.spotFor(type, taken, batterySpot)` (`taken` = `Bench.spotsOf(components)`): the AI battery keeps `App.batterySpot()` while it's free; everything else takes the first free slot, in its type's own order, of a row in front of the board (z = `BOARD_D/2 + MARGIN + 0.5`, slots 3.4 apart at x 6.8, 3.4, 0, −3.4, −6.8: a second battery first tries 6.8, the supply 3.4, the generator 0, the meters −3.4 then −6.8). A full row starts another 4 further out. Slots are wider and deeper than any instrument, so none overlap. `Chat.predictSpots(actions, components, batterySpot)` gives the preview's ghosts the same spots Accept uses, and a refused part gets no ghost.
  - The prompt says so: one bench supply PS1 (two channels), one function generator FG1, at most two multimeters, one wire per terminal. An op-amp's input comes from FG1 (its `offset` as the DC input), never a second supply.
- **Tool selection** is `selectTools(message, boardTypes) → tool[]`, a pure function that's tested. Per request it sends:
  1. the always-sent tools
  2. the tools for parts on the board
  3. keyword matches
  4. if nothing else matched, the everyday set (resistor, LED, button, buzzer)

  It sends **at most 12 part tools**, plus the always-sent tools (#76). The prompt always carries a one-line catalogue of every part.
- **Generated prompt sections:** label prefixes, sizing lines built from `span`/`legs` (e.g. `"resistor: 3–5 columns apart on one row (4 is typical)"`), pin names, and the guides of the tools being sent. Recipes stay hand-written.
- **The server's circuit checks** read `elements`: `R` and `SW` conduct, and `D` conducts one way. Placement goes through `Parts.checkPlacement`.

## Photo → circuit (#134)
Maya photographs her real breadboard, confirms every lead, and the app rebuilds it so the simulator can find the fault. **The server only reads the photo; the browser builds.**

```
photo.js  pick / drop / sample, corner taps → PhotoGrid.homography → PhotoGrid.warp (flattened image)
          → POST /api/photo → Reading → confirm screen at once (PhotoGrid.snap)
            ↳ photo-crops.js → POST /api/photo/leads, streamed → PhotoConfirm.place per item as it answers (#173)
          → Build it (any time) → PhotoImport.build
          → SparkyChat.applyBuild(actions) → App.runSimulation() → sparkyAsk(question, { context })
```
- **Loading:** `photo-grid.js` and `photo-import.js` are UMD modules (Node + browser, like `simulate.js`), after `ids.js` and before `app.js` in `circuit3d/index.html`; `samples/samples.js` and then `photo.js` (DOM) after `chat.js`. Node requires them from `circuit3d/js/`.
- **Coordinates:** every point is a pixel `[x, y]` in the **flattened image** (see `PhotoGrid`), never in the original photo.

### `POST /api/photo` (#138, #139)
- **Owner:** `backend/photo-reader.js`, routed by `backend/server.js`. **Called by:** `photo.js`.
- **Request:** `{ image, grid, sample? }`
  - `image`: a JPEG, PNG or WebP data URL of the flattened image, at most 2,048 px wide.
  - `grid`: `{ cols, pitch, x0, y0, width, height }`, the flattened image's frame (the `PhotoGrid` grid's fields of the same names).
  - `sample`: a rehearsed photo's id (a `window.PhotoSamples` key, e.g. `'demo-board'`), when a tile of the sample picker sent it (#182).
- **Response 200:** `{ reading, provider, model, ms, key }`. `reading` is a Reading v1 (below), with no actions. `provider` is `'gemini'`, `'deepseek'` or `'fixture'`; `model` the model that read it (a fixture gives the model it recorded); `ms` the server's time for the request; `key` the photo's fixture key (the `sample` id, else the hex SHA-256 of the image bytes; `null` for a sample that isn't a plain id).
- **Errors:** body `{ reply, code }` (429 has no `code`). The page shows `reply` with the **Use sample photo** button.

| Status | `code` | When | `reply` |
|---|---|---|---|
| 400 | `BAD_IMAGE` | `image` isn't a JPEG, PNG or WebP data URL | `"I can't read that file. Try a JPEG or PNG photo, or use the sample photo."` |
| 400 | `BAD_GRID` | `grid` missing, `cols` not 30 or 63, or another field not a positive number | `"Something went wrong lining up the board. Tap the four corners again, or use the sample photo."` |
| 413 | `TOO_LARGE` | the body is over 4 MB | `"That photo is too large. Try a smaller one, or use the sample photo."` |
| 422 | `NO_BOARD` | the Reading says `board.visible: false` | `"I couldn't find a breadboard in that photo. Try one from straight above with the whole board in view, or use the sample photo."` |
| 429 | | more than 6 photos a minute from one IP | `"Too many photos at once. Wait a minute and try again, or use the sample photo."` |
| 502 | `AI_FAILED` | every provider failed and no fixture matched | `"I couldn't read the photo just now. Try again, or use the sample photo."` |
| 504 | `AI_TIMEOUT` | past `PHOTO_TIMEOUT_MS` (default 45000) | `"Reading the photo took too long. Try again, or use the sample photo."` |

- **Body cap:** the body read moves into `readBody(req, res, max)`. `/api/photo` allows 4 MB (`4 * 1024 * 1024`); **`/api/ask` stays at 256 KB**.
- **Rate limit:** `askRateLimited` becomes `rateLimited(req, hits, max)`; photos get their own map, 6 a minute per IP (`TRUST_PROXY` as for `/api/ask`).
- **Providers:** `PHOTO_PROVIDERS`, tried in order, default `gemini` alone (#172; it was `gemini,deepseek`). The names are in `.env.example`.
  - `gemini`: model `PHOTO_GEMINI_MODEL`, default `gemini-robotics-er-2-preview` (a pinned version, never a `-latest` alias), key `GEMINI_API_KEY` in the `x-goog-api-key` header, JSON output with a response schema, `MEDIA_RESOLUTION_ULTRA_HIGH` on the image, temperature 1, `maxOutputTokens` 32768 (its thinking counts toward it). It gets the whole `PHOTO_TIMEOUT_MS`: no per-call cap.
  - **Gemini's retry rule (#172)**, `raceGemini` in `photo-reader.js`, shared with the crop round: a call that fails at once (503, 429, other 5xx, network error, empty reply, invalid JSON) is sent again, the same request, 1–2 s later (a 429 whose body has a `google.rpc.RetryInfo` `retryDelay` waits that long instead, when it is shorter than the time left); a call with no answer after `PHOTO_HEDGE_MS` (default 12000) gets one identical call alongside, the first good answer wins and the other is aborted; a 400/401/403 is never sent again. At most 4 calls to `PHOTO_GEMINI_MODEL` per box round (the fallback model's at most 2 come on top, #176). When every call has failed the round ends `AI_FAILED` at once; at the deadline, `AI_TIMEOUT` with every call aborted.
  - **The box round's fallback model (#176):** when Robotics-ER (`PHOTO_GEMINI_MODEL`), with its retries and resend, has no valid answer `PHOTO_FALLBACK_AT_MS` (default 25000) after the box round starts, the same request (same body, same key header) also goes to `PHOTO_FALLBACK_MODEL` (default `gemini-3.1-flash-lite`, pinned, never a `-latest` alias; set but empty turns it off) at `…/models/<model>:generateContent`, under the same retry rule with at most 2 calls. Robotics-ER using up its 4 calls before then brings the fallback in at once; a Robotics-ER 400/401/403 never does. The first valid answer from either model wins, through the same `boxesToReading`, and every other call is aborted. One model running out of calls doesn't end the round while the other is still out; both spent → `AI_FAILED` at once; nothing valid by `PHOTO_TIMEOUT_MS` → `AI_TIMEOUT`. The response's `model` is the model that answered (`provider` stays `'gemini'`), and the `[photo]` line says `fallback=yes` when the fallback model answered. Boxes only: the crop round (`/api/photo/leads`) never uses it.
  - **The box prompt** (`backend/photo-prompt.js`, golden `test/fixtures/prompts/photo.txt`), the same for both readers: every part and wire with its type, a value guess, `conf` and a `box_2d [ymin, xmin, ymax, xmax]` on 0–1000 enclosing the item including its metal legs, plus each rail's printed sign by side. No leg points: each part's 2 leads and each wire's 2 ends **start at the midpoints of its box's short edges** (in pixels), `hole: '?'`, with `'leads'` in `unsure`; the page snaps them. Parts and wires both keep the pixel box as `box` (the crop round cuts each crop from it). Types other than resistor, LED and wire become `other`. A forgiving parser (`parseLooseJSON`) takes a fence, prose, stray braces, trailing commas or a bare list, but not cut-off JSON.
  - `deepseek`: `deepseek-flash` only, `json_object`, whatever time is left of `PHOTO_TIMEOUT_MS`. **Never `deepseek-v4-pro`**: it has no vision, so the #130 fallback (`DEEPSEEK_FALLBACK_MODEL`) never applies to this route. Only when listed (`PHOTO_PROVIDERS=gemini,deepseek`).
  - **Moves to the next provider** only after Gemini fails with a 400/401/403 (a bad request or key), or a provider other than Gemini fails. **Never** after a timeout, and never after Gemini used up its calls on 503s and the like: deepseek-flash read 38% of leads right and only burned the time left.
  - Each provider converts its own output to Reading v1 (`box_2d` on 0–1000 → pixels: x = xn / 1000 · `grid.width`, y = yn / 1000 · `grid.height`), then everything goes through `validateReading()`.
- **Fixtures** (`Plugged/test/fixtures/photo/<key>.json`): the key is the `sample` id, else the hex SHA-256 of the image bytes decoded from the data URL.
  - `PHOTO_PROVIDERS=fixture` replays only: no fixture for the key → 502 `AI_FAILED`.
  - A request with `sample` whose fixture exists is answered from that fixture straight away (`provider: 'fixture'`, `fallback` false), unless `PHOTO_RECORD=1` (#157). A request is a sample by its `sample` field being a plain id, never by the key's shape.
  - In live mode, an image with no sample fixture (no `sample`, or a `sample` with no file) goes to the providers first; when they fail (every provider tried, or Gemini used up its calls) or the deadline passes, and a fixture exists for the key, it is returned with `provider: 'fixture'`.
  - `PHOTO_RECORD=1` always goes live, a sample included, and saves each live Reading as `{ sample, sha256, reading, provider, model }` (`sample` null when none). Fixtures store the **Reading**, so `PhotoImport` changes never make them stale.
- **Logging:** one line per request, e.g. `[photo] sample=demo-board provider=gemini model=… 8.2s parts=3 wires=3 fallback=no retries=0 612KB`. `retries` counts Gemini's calls sent again after a failure, the fallback model's included (on an error line too). `fallback=yes` when the answer came from a provider after the first listed, or from the box round's fallback model (#176), whose name is then `model`. Never the image or an upstream body.
- **Mock:** `{ reading: <the mock Reading below>, provider: 'fixture', model: 'deepseek-flash', ms: 12, key: 'demo-board' }`.

### `POST /api/photo/leads` (#159, #160, #173, #177)
The crop round: where each leg enters the board, one zoomed, labelled crop per part and wire. The backend has no image packages, so **the page cuts and labels the crops** (`photo-crops.js`) and this route only asks Gemini and does arithmetic.
- **Owner:** `backend/photo-leads.js` (`readLeads(body, opts)`, `opts.fetch` injectable like `readPhoto`'s), routed by `backend/server.js`. **Called by:** `photo-crops.js`.
  - The page crops only resistors, LEDs and wires: a part of type `other` is never built in Tier 1, so it isn't cropped or sent.
- **Request:** `{ key, items: [{ id, kind, type, value, image, window }] }`
  - `key`: the `key` `/api/photo` returned.
  - `id`: the Reading's id (`'R1'`, `'W1'`). `kind`: `'part'` or `'wire'`. `type`, `value`: from the Reading (`value` may be 0).
  - `image`: a JPEG or PNG data URL of the labelled crop, at most 2 MP.
  - `window`: `{ x, y, scale, padLeft, padTop, width, height }`. A crop pixel `(u, v)` is the flattened-image pixel `(x + (u − padLeft) / scale, y + (v − padTop) / scale)`; `width` and `height` are the crop image's own size.
- **Response 200:** `{ items, provider, model, ms }`, one entry per requested id, in request order:
  - `{ id, found, leads: [{ pin, pt, role }], conf }`: `pin` as Gemini named it (`'1'`, `'anode'`, `'?'`); `pt` is `[x, y]` in flattened-image pixels, rounded to 0.1, or `null` (the end leaves the crop or board); `role` is `'anode'`/`'cathode'` when Gemini named the pin so, `'none'` for resistors and wires, else `'unknown'`.
  - or `{ id, error: 'AI_TIMEOUT' | 'AI_FAILED' }`.
  - `provider` is `'fixture'` only when no item was answered live: a replay (a sample id with a file, or `PHOTO_PROVIDERS=fixture`), or saved answers filling in after every live call failed. Otherwise `'gemini'`, mixed rounds (some items live, some saved) included.
  - `model` is the model that answered (a saved file gives the model it recorded; `null` under `PHOTO_PROVIDERS=fixture` with no file), `ms` the server's time for the request.
  - **A valid request is always 200:** a failed item never fails the request.
- **Streamed (#173):** when the request's `Accept` includes `application/x-ndjson` (the page always sends it), the answer is `200` with `Content-Type: application/x-ndjson`: one line per item **as it settles, in finish order**, each exactly the entry above (`{ id, found, leads, conf }` or `{ id, error }`), then a last line `{ done: true, provider, model, ms }`. Every requested id gets exactly one line. Replays (a sample id with a file, `PHOTO_PROVIDERS=fixture`) and the no-key path stream the same way. Without that `Accept` the one JSON body above is unchanged (tests, recording, an older page). Errors before the stream starts (400, 413, 429) stay JSON.
  - `readLeads(body, opts)` takes `opts.onItem(entry)`: called once per item as it settles (an answer, an `AI_FAILED`, an `AI_TIMEOUT` at the cutoff), with the entry the resolved `items` will hold (so an image-hash item that failed live reports its saved answer). The route writes each as a line; the resolved `{ items, provider, model, ms }` is unchanged.
  - **Nobody listening (#177):** `readLeads(body, opts)` takes `opts.signal` (an `AbortSignal`). Aborting it ends the round at once, as the cutoff does without waiting for it: every call in flight is aborted, none goes out after (no queued first call, no pending retry, no stall resend), the timers are cleared, and `readLeads` resolves straight away: an item already answered keeps its answer, every other one is `AI_TIMEOUT`, in request order, `onItem` still once per id. The route aborts it when the response closes before it finished (the page's Cancel, close or Build it aborting its fetch; streamed or not); the `[photo-leads]` line is still written once, and nothing more is sent.
- **Errors:** body `{ reply, code }` (429 has no `code`). The page never shows them: it keeps its placeholder dots.

| Status | `code` | When | `reply` |
|---|---|---|---|
| 400 | `BAD_ITEMS` | `items` not a list of 1 to 24; an item's `id` not a non-empty string, its `image` not a JPEG or PNG data URL, its `window` missing or a field of it not a finite number, or `scale` ≤ 0 | `"Send 1 to 24 crops, each with an id, a JPEG or PNG image and its window."` |
| 413 | `TOO_LARGE` | the body is over 6 MB (its own `readBody` cap) | `"Those crops are too large."` |
| 429 | | more than 6 requests a minute from one IP (its own map, separate from `/api/photo`'s; `TRUST_PROXY` as for `/api/photo`) | `"Too many crop requests at once. Wait a minute and try again."` |

- **Gemini only** (no deepseek: much weaker at pointing). One call per item, at most `PHOTO_LEADS_CONCURRENCY` (default 16) first calls and retries in flight: model `PHOTO_GEMINI_MODEL` (as for `/api/photo`), key `GEMINI_API_KEY` in `x-goog-api-key`, the crop inline at `MEDIA_RESOLUTION_ULTRA_HIGH`, JSON with `PHOTO_CROP_SCHEMA`, temperature 1, `maxOutputTokens` 32768. No key: every item `AI_FAILED`, nothing sent.
  - **The crop prompt** (`PHOTO_CROP_PROMPT(item)` in `backend/photo-prompt.js`, golden `test/fixtures/prompts/photo-crop.txt`): "It shows a resistor (470)" (just the type when `value` is 0), or "a jumper wire" with "off" for an end that leaves the crop. The answer is `{"found":true,"type":"...","leads":[["1",[y,x]],["2",[y,x]]],"conf":0.8}`, a pin and a point `[y, x]` on 0–1000 over the whole crop, or `"off"`.
  - `parseLooseJSON` reads it, and a bare list is taken (`[{...}]` → its first object, `[["1",[y,x]], …]` → the leads). A point becomes crop pixels `(x / 1000 · width, y / 1000 · height)`, then flattened pixels through `window`; `"off"` → `pt: null`.
  - **Retries (#172):** each item follows Gemini's retry rule (`raceGemini`, see `POST /api/photo`): a call that fails at once (5xx, 429, network error, not JSON, cut off, empty) is sent again 1–2 s later, not at the resend; a call with no good answer after `PHOTO_HEDGE_MS` (default 12000, from when that call went out) gets one identical call alongside, the first good answer wins and the other call is aborted. At most 3 calls per item. A bad request or key (400/401/403) is never sent again.
  - **Cap in flight (#172):** at most `PHOTO_LEADS_CONCURRENCY` (default 16) first calls and retries are out at once across all items; the rest wait their turn and start as those calls end, first calls in item order. (24 at once drew 503s and 429s.) **A stall resend is exempt:** it goes out at `PHOTO_HEDGE_MS` even when the cap is full, never waits in the queue and never takes a slot. (With a cap of 10 covering resends, a live round had 9 of 13 crops time out with no 503 at all: the slow calls' resends queued behind waiting items and never went out.)
  - **Cutoff:** at `PHOTO_LEADS_TIMEOUT_MS` (default 40000 since #173, was 25000; the confirm screen no longer waits on it) every call is aborted and the items unanswered, or still waiting their turn, are `AI_TIMEOUT`. It runs from when the round starts, after the whole body is read and checked, so the page's own timeout must leave room for the upload too.
  - An item is `AI_FAILED` when its 3 calls failed, or a call got a 400/401/403; an item still unanswered at the cutoff is `AI_TIMEOUT`.
- **Saved leads** (`Plugged/test/fixtures/photo/leads/<key>.json` = `{ key, model, items }`, `items` as the response has them). Points are already flattened pixels, so a change to how crops are drawn never makes them stale. A key is an id, never a path: only a plain id (as for `/api/photo`'s `sample`) has a file.
  - A `key` that is a **sample id** (anything but 64 hex digits) with a file is answered from it straight away, with `provider: 'fixture'`; an id the file lacks is `AI_FAILED`.
  - A `key` that is an **image hash** (64 hex digits) goes live first; an item that fails or times out takes that id's saved answer when the file has one.
  - `PHOTO_PROVIDERS=fixture` replays only, never a fetch: no file → every item `AI_FAILED`.
  - `PHOTO_RECORD=1` always goes live and saves the answered items (a saved answer kept for an item that failed) as `{ key, model, items }`.
- **Logging:** one line per request, e.g. `[photo-leads] key=demo-board items=13 ok=12 timeout=1 failed=0 resent=3 retries=2 provider=gemini 22.1s 1.6MB` (a key that isn't a plain id shows as `?`; `resent` counts items that got the stall resend, `retries` the calls sent again after a failure). Never a crop, the API key or an upstream body.

### Reading v1 (what `/api/photo` returns)
The reader's first guess at the board. On the confirm screen Maya moves every wrong dot; the confirmed Reading (same shape) goes to `PhotoImport.build`.
```js
{
  board: { visible: true, cols: 63,                 // 63 or 30
           rails: { aOuter, aInner, jInner, jOuter }, // each strip's PRINTED sign: '+', '-' or '?'
           split: false },                         // a break in the rail lines mid-board
  parts: [ { id: 'R1', type: 'resistor',           // 'resistor' | 'led' | 'other' (Tier 1)
             what: '470 Ω resistor',               // free text, e.g. 'red 5 mm LED'
             value: 470,                           // Ω; 0 = unknown (LEDs: 0)
             bands: ['yellow', 'violet', 'brown', 'gold'],   // [] when none read
             color: '',                            // as seen: an LED's colour ('red'); '' when it doesn't matter
             leads: [ { hole, pt: [x, y], role } ],          // role: 'anode' | 'cathode' | 'none' | 'unknown'
             box: [x0, y0, x1, y1], confidence: 0.8, unsure: [] } ],
  wires: [ { id: 'W1', color: 'black', ends: [ { hole, pt }, { hole, pt } ],
             box: [x0, y0, x1, y1],                // as a part's; [] when unknown (#159)
             confidence, unsure: [] } ],
  power: [ { kind: 'battery_9v',                   // 'battery_9v' | 'bench_supply' | 'unknown'
             volts: 9,                             // 0 = unknown
             plus: { hole, pt }, minus: { hole, pt }, unsure: [] } ],
}
```
- **Endpoint `hole`:** a body hole `c14`; a rail `rail:<rail>:<col>` (e.g. `rail:aOuter:14`); `gap` (the centre channel); `off` (off the board); or `?` (not seen).
- **Rails are named by side:** `aOuter` and `aInner` are the strips next to row a, `jInner` and `jOuter` the strips next to row j. A rail's column is the nearest body column, cosmetic (each rail is one node).
- `confidence` is 0–1. `unsure` lists what the reader wasn't sure of, as short words (e.g. `'value'`, `'polarity'`).
- **`validateReading(raw)` → `{ reading, notes }`**, in `backend/photo-reader.js`, zero dependencies, run on every provider's output: it coerces each field to the shape above (an unknown enum becomes `other`, `unknown` or `?`, a missing number 0, a missing array `[]`), drops what it can't repair (a part with no leads, a wire without 2 ends), and records why in `notes` (strings).

#### Mock Reading (the demo board)
The demo board, in the **a-on-top** frame (row a at y = 190, rails a-side above it): a 9 V battery on the a-side rails, 470 Ω from the + rail to a14, and a red LED in **backwards** (cathode c14, anode c17), with a black wire from b17 to the − rail. Built and simulated, LED1 is dark with a `backwards` problem; flipped, about 14.9 mA. Every `pt` is that hole's `holeCentre` in this frame. R1's rail lead makes it import with a bridge and a `moved` flag; the real stage board (#144) follows the stage-board rule instead (R1 fully in the main holes, a jumper from the + rail), so it imports with no bridge and no flags.
```json
{
  "board": {
    "visible": true,
    "cols": 63,
    "rails": { "aOuter": "+", "aInner": "-", "jInner": "+", "jOuter": "-" },
    "split": false
  },
  "parts": [
    {
      "id": "R1", "type": "resistor", "what": "470 Ω resistor", "value": 470,
      "bands": ["yellow", "violet", "brown", "gold"], "color": "",
      "leads": [
        { "hole": "rail:aOuter:10", "pt": [360, 73], "role": "none" },
        { "hole": "a14", "pt": [480, 190], "role": "none" }
      ],
      "box": [345, 58, 495, 205], "confidence": 0.8, "unsure": []
    },
    {
      "id": "LED1", "type": "led", "what": "red 5 mm LED", "value": 0,
      "bands": [], "color": "red",
      "leads": [
        { "hole": "c14", "pt": [480, 250], "role": "cathode" },
        { "hole": "c17", "pt": [570, 250], "role": "anode" }
      ],
      "box": [465, 225, 585, 275], "confidence": 0.7, "unsure": []
    }
  ],
  "wires": [
    {
      "id": "W1", "color": "black",
      "ends": [
        { "hole": "b17", "pt": [570, 220] },
        { "hole": "rail:aInner:19", "pt": [630, 103] }
      ],
      "box": [555, 88, 645, 235], "confidence": 0.9, "unsure": []
    }
  ],
  "power": [
    {
      "kind": "battery_9v", "volts": 9,
      "plus": { "hole": "rail:aOuter:3", "pt": [150, 73] },
      "minus": { "hole": "rail:aInner:3", "pt": [150, 103] },
      "unsure": []
    }
  ]
}
```

### `PhotoGrid` (`circuit3d/js/photo-grid.js`, `window.PhotoGrid`; #135)
Photo pixels ↔ breadboard holes. Pure: no DOM, no THREE.

**The flattened image** (pitch = 0.1", one hole to the next):

| | |
|---|---|
| Scale | 30 px per pitch (`pitch: 30`) |
| Top-left body hole | (`x0`, `y0`) = (90, 190): a1 when `aTop`, else j1 |
| Columns | column 1 on the left, column c at x = 90 + 30·(c − 1) |
| Rows, `aTop` | a–e at 0–4 pitches below `y0`, f–j at 7–11 (the centre gap is 3 pitches): a 190 … e 310, f 400 … j 520 |
| Rows, j on top | j–f at 0–4, e–a at 7–11: j 190 … f 310, e 400 … a 520 |
| Rail zones | 5 pitches beyond the top and bottom body rows (y 40–190 and 520–670) |
| Rail lines | inner 2.9 and outer 3.9 pitches beyond the nearest body row (BB830, measured in the spike): y 103 and 73 at the top, 607 and 637 at the bottom |
| Label bands | 40 px top and bottom (y 0–40 and 670–710): every column number (every 5th bold), row letters at both ends, column numbers also in the centre channel. No lines over holes. |
| Size | `width` = 30·(cols − 1) + 180, `height` = 710: 2040 × 710 for 63 columns, 1050 × 710 for 30 |

**Which of a or j is on top is chosen from the taps, so the flattened image is never a mirror image** (the frame whose map to the photo has a positive Jacobian determinant, `geom.py` `orientation()`). A board photographed upside down still flattens upright, because the taps name the holes. Rail names follow the side, not the position in the image (with j on top, `jOuter` is the topmost strip).

- **`PhotoGrid.homography(taps, cols = 63)`** → a grid `{ cols, aTop, pitch, x0, y0, width, height, H, holeCentre, snap, toPhoto }`.
  - `taps`: `{ a1: [px, py], a63: [...], j63: [...], j1: [...] }` in the photo's pixels: the four corner holes a1, aN, jN, j1 (N = `cols`), or any 4 or more labelled body holes (least squares past 4, on normalised coordinates).
  - `H`: 3 × 3, row-major, maps a flattened-image pixel to a photo pixel.
  - **Errors:** throws an `Error` when the taps are degenerate (fewer than 4, repeated, or near-collinear).
- **`grid.holeCentre(hole)`** → `[x, y]` in the flattened image. A body hole `'c14'` gives its centre; `'rail:aOuter:14'` gives the point on that rail's line at column 14. Anything else (`gap`, `off`, `?`, a bad name) → `null`.
- **`grid.snap([x, y])`** → where a flattened-image point lands, in the Reading's endpoint vocabulary (`dist`: pitches to the snapped centre):
  - `{ hole: 'c14', zone: 'body', dist }`: the nearest body hole, within 0.45 pitch.
  - `{ hole: 'e14', zone: 'gap', dist }`: a point in the centre channel snaps to the nearest e or f hole of the nearest column. Confirm it.
  - `{ hole: 'rail:aOuter:14', zone: 'rail', rail: 'aOuter', col: 14, dist }`: a point in a rail zone. Inner when it's less than 3.4 pitches beyond the body row, else outer; `col` is the nearest body column (1…`cols`).
  - `{ hole: 'off', zone: 'off', dist: null }`: anywhere else (more than 0.6 pitch outside columns 1…N, beyond a rail zone, or between body holes farther than 0.45 pitch from each).
- **`grid.toPhoto([x, y])`** → the photo pixel under a flattened-image point (`H` applied), for drawing the live grid over the photo while tapping.
- **`PhotoGrid.warp(src, H, out)`** → `out`. `src` and `out` are RGBA images `{ width, height, data }` (an `ImageData`-like `Uint8ClampedArray`, 4 bytes per pixel); `out` is pre-sized to the grid's `width` × `height`. Each `out` pixel samples `src` at `H · (x, y)` (bilinear); points outside `src` get (40, 40, 40, 255). No DOM, so it runs in Node tests.
- **Mock:** none. Tests build grids from synthetic taps (identity and trapezoid round trips).

### `PhotoImport` (`circuit3d/js/photo-import.js`, `window.PhotoImport`; #136, #137)
A confirmed Reading → the legal actions that rebuild it. Pure: uses `Parts`, `Ids` and the board geometry (`require('./parts')` etc. in Node; `window.Parts`, `window.App`, `App.BOARD_GEOMETRY` in the browser).

- **`PhotoImport.build(reading, { components })`** → `{ actions, labels, flags, skipped }`. Never throws: anything it can't build lands in `flags` and `skipped`.
  - `components`: the parts already on the board (`{ type, label }`), for numbering labels with `Ids.nextLabel`. The page passes `[]`: a photo always builds on an empty board (see `SparkyChat.applyBuild`).
- **A lead's node** is its column plus half (a–e, f–j), a rail, or an off-board pin. Rows inside a half never change the circuit, so leads may move row; **every lead keeps its node**.
- **`actions`**, in this order, for `Chat.acceptBuild` (one undo step):
  1. the battery: `place_battery { voltage }` per power entry;
  2. every part: `place_resistor { holeA, holeB, resistance }`, `place_led { holeA: cathode, holeB: anode, color }`;
  3. every wire: the battery's leads `add_wire { from: 'BAT1.0', to: <+ rail hole>, color: 'red' }` and `{ from: 'BAT1.1', to: <− rail hole>, color: 'black' }`, the bridge jumpers, then the Reading's wires (`add_wire { from, to, color }`, colour mapped to red, yellow, green, blue, black or white).

  Parts go before wires because wire ends take holes. **No `delete_all`**. Rail holes are `tp_10`-style.
- **Rails by side and printed sign:**

| Side | `+` strip | `−` strip |
|---|---|---|
| a-side (`aOuter`, `aInner`) | `tp` | `tn` |
| j-side (`jInner`, `jOuter`) | `bp` | `bn` |

- **Rail fallback:** when a side's two signs are `?` or the same, outer → + and inner → − (our model's position default), flagged `rails`.
- **`labels`:** Reading id → app label. Each part → its `Ids.nextLabel` label (a skipped part shifts later numbers); each power entry, keyed `power:<i>`, → its battery label; each Reading wire → its wire id `W<n>`, counted over **every** `add_wire` in output order (battery leads and bridge jumpers take W1, W2… first), so it matches `nextWireId` on an empty board.
- **Keys** in `labels`, `flags` and `skipped`: the entry's Reading id; a missing or blank id → `part<n>` / `wire<n>` (1-based within `parts` / `wires`); a different entry reusing an id → `<id>#2`, `<id>#3`…. Only exact copies are dropped (a part with the same type, value and lead holes; a wire with the same two ends), listed in `skipped` under their own key.
- **`flags`:** `[{ kind, id, why }]`. `id` is the Reading id (`power:<i>` for power, `null` for the whole board); `why` is plain English for the confirm screen (e.g. `"drawn with a jumper: on your board it runs from the + rail to column 14"`).

| `kind` | When |
|---|---|
| `polarity` | an LED lead's `role` is unknown: the first dot is taken as the anode |
| `value` | a resistor value, LED colour or battery voltage unread or out of range: 470 Ω, red or 9 V used |
| `moved` | a lead or wire end was put in another hole of its node, or the part was drawn shorter or with a jumper (the bridge) |
| `shorted` | both leads of a part are in one node (built, so the simulator shows it) |
| `source` | no power entry but rails in use (a 9 V battery is assumed on them), or a bench supply or unknown source built as a battery |
| `position` | a lead or end still `?`, `gap` or `off`, or a 6th lead into a full column-half (not built) |
| `mismatch` | no free helper for a bridge (not built) |
| `type` | a part of type `other` (not built: IC, button, …) |
| `rails` | a side's rail signs fell back to the position default |

- **`skipped`:** `[{ id, type, why }]`, everything not built: `other` parts, unplaceable parts, and a wire with both ends in one node.
- **Invariants, checked in tests:**
  - **Zero refusals:** every `place_*` passes `Parts.checkPlacement` in order against the running hole map (wire ends included), and `Board.apply(Board.empty(), actions)` gives no errors.
  - **Same nets:** the nets of the built board equal the nets of the confirmed Reading for every built part.
  - **LED polarity is kept exactly as confirmed**, never chosen to make the circuit work.
- **Mock:** the mock Reading above builds to:
```js
{ actions: [ { tool: 'place_battery', voltage: 9 },
             { tool: 'place_resistor', holeA: 'a10', holeB: 'a14', resistance: 470 },   // bridged: its + lead is in a rail
             { tool: 'place_led', holeA: 'c14', holeB: 'c17', color: 'red' },           // cathode c14: backwards, as photographed
             { tool: 'add_wire', from: 'BAT1.0', to: 'tp_3',  color: 'red' },           // W1
             { tool: 'add_wire', from: 'BAT1.1', to: 'tn_3',  color: 'black' },         // W2
             { tool: 'add_wire', from: 'b10',    to: 'tp_10', color: 'white' },         // W3, the bridge jumper
             { tool: 'add_wire', from: 'b17',    to: 'tn_19', color: 'black' } ],       // W4, the Reading's W1
  labels:  { 'power:0': 'BAT1', R1: 'R1', LED1: 'LED1', W1: 'W4' },
  flags:   [ { kind: 'moved', id: 'R1', why: '…drawn with a jumper…' } ],
  skipped: [] }
```

### Page additions (photo; #140, #143)
- **`SparkyChat.applyBuild(actions)`** (browser half of `chat.js`) → `{ applied, failed }` from `Chat.acceptBuild`. It:
  1. clears any pending AI preview;
  2. if the board isn't empty, calls `App.clearAll()` first: a new "Untitled" circuit, so her open saved circuit is never overwritten (never `delete_all`, which keeps the circuit);
  3. `Chat.acceptBuild(actions, board)` with the page's board helper (one undo step), then `App.frameCircuit()`;
  4. posts `"Built N parts from your photo. Undo (Ctrl+Z) brings back the empty board."` and adds one `model` entry to the chat history naming each built part and its holes (`"I built your board from the photo: R1 a10–a14, LED1 c14–c17, …"`).
- **`sparkyAsk(msg, { context, explain })`** (new optional second argument; `sparkyAsk()` and `sparkyAsk(msg)` are unchanged):
  - the request's `message` is `msg + "\n\n" + context`. **The context needs no change to the server** (`explain` is the one body field added, #169).
  - The chat bubble shows only `msg`; the chat history stores the message as sent (with the context) as `user`, then the reply.
  - The context must not change tool selection: **no part keywords** (e.g. "light", "lamp", "diode") **and no `NEW_BUILD` words**. A unit test asserts `selectTools(msg + "\n\n" + context)` equals `selectTools(msg)` and the `NEW_BUILD` match is unchanged.
  - The photo's context line: `"Built from a photo of my real breadboard. Unsure readings: LED1 direction."` No question typed → `msg` is `"What's wrong with my circuit?"`, sent with `explain: true` (#169; see `POST /api/ask`). `explain` goes in that one request's body only; a typed question goes without it.
- **`window.PhotoFlags`:** a `Set` of app labels whose Reading entry has a flag (via `labels`). `photo.js` owns it: it fills it after a build and clears it on the next photo or a cleared board. `mistakes.js` `row(p)` gives a row whose labels include one a small "read from photo, unsure" badge, and treats a missing `PhotoFlags` as empty.
- **`window.PhotoSamples`** (`circuit3d/samples/samples.js`, a plain script; a `.json` there wouldn't be served): `{ '<id>': { file: 'samples/<id>.jpg', cols: 30 | 63, taps: { a1: [px, py], aN: [...], jN: [...], j1: [...] }, title, credit } }` — `demo-board` ("Demo: LED in backwards", the default) plus `piranha`, `resistors`, `multimeter`, `timer555` (#182: real eval photos, each recorded live in `test/fixtures/photo/<id>.json` and `leads/<id>.json`, so it replays with no AI call). An entry with `offered: false` (#200: piranha, resistors, multimeter, timer555, whose recordings don't build a whole circuit) stays for `npm run photo-eval` and the replay tests but is never offered on the page. Taps in the file's own pixels. The key is the `sample` sent to `/api/photo`; a sample skips the corner taps.
  - **`board` (optional, #15):** a hard-coded board, an action list in the AI's build shape (`place_*` with `holeA` / `holeB`, `add_wire { from, to }`, holes like `e3`, rails like `bp_23`, battery leads `BAT1.0` / `BAT1.1`), with no `delete_all` (`SparkyChat.applyBuild` clears the board itself). It wins over any recording, so such an entry needs no `taps` and no recording. Its tile shows the sample's own photo as it is (not flattened) with "Reading your board…" for `SAMPLE_READ_MS` (1 s, `photo.js`), then calls Build it's path with `{ actions: board, flags: [], labels: {}, skipped: [] }`: the board (one undo step), the simulation, and Edison's answer. It never posts `/api/photo` and shows no confirm screen; Escape or Cancel during that second builds nothing. First: `leds-buttons` (photo 2, "LEDs and buttons": a 9 V battery, 3 buttons each lighting its own LED, one shared 1.5 kΩ resistor).
- **Sample picker (#182, #200):** "Use sample photo" (`#photo-sample`) and the error card's `#photo-error-sample` open `#photo-samples`, a grid of tiles `[data-sample="<id>"]` (its photo, title, credit), one per offered sample; a tile sends that sample; Escape/Cancel close it. With 2 or more offered samples (today: `demo-board` and `leds-buttons`, #15) the picker shows; with one there is no picker: the button sends it straight away. The confirm screen shows the sample's credit in `#photo-credit` under the photo (empty for a chosen photo).
- **Page timeout:** `photo.js` gives up on `/api/photo` after `PHOTO_PAGE_TIMEOUT_MS` = 60000 (a page constant, not an env variable; above the server's 45 s) and shows the `AI_TIMEOUT` message with the sample offered.
- **The crop round on the page (#160, #161, #173):** after `/api/photo` answers, `photo.js` opens the confirm screen **at once** (`PhotoConfirm.open` with the box round's Reading, `'?'` snapped from the placeholders; `PhotoCapture.lastReading` is that Reading). Then, unless there is no `key`, nothing to crop, or the provider was `'deepseek'`: `PhotoConfirm.startPlacing(ids)`, the crops (`PhotoCrops.items`, `render`, `window`), and one `POST /api/photo/leads` with `Accept: application/x-ndjson`, read from `res.body` line by line as it arrives (a line may come in pieces). Each item line → `PhotoConfirm.place(id, entry)`. At `{ done }`, after `PhotoCapture.leadsTimeoutMs` (`PHOTO_LEADS_PAGE_TIMEOUT_MS` = 45000, the server's 40 s plus the upload; read when the request starts), on a non-200, a stream or network error, or any throw → `PhotoConfirm.stopPlacing()`; unplaced items keep their placeholders, no message. Cancel, Escape and Build it close the overlay and abort the request: nothing is applied after.
- **`PhotoConfirm` additions (#173):**
  - `placing`: a `Set` of the ids whose crop line hasn't arrived (empty when there is no round). Their rows in `#photo-parts` have the class `.photo-placing`, their dots are drawn faint, and `#photo-placing-note` above the list reads `"Placing legs N/M…"` (N lines in, M crops sent); all cleared by `stopPlacing()`.
  - `startPlacing(ids)`, `stopPlacing()`: set and clear that state (`open()` clears it too).
  - `place(id, entry)`: the id leaves `placing`. Unless she has touched that item since `open()` (moved one of its dots, ⇄, ×, changed its value, colour or volts; an item she added counts as touched), the entry is merged (`PhotoCrops.merge(reading, [entry])`: two points set its ends, `found: false` drops it, an error keeps its placeholders), its `'?'` ends snapped, then rebuilt, relisted and redrawn. A touched item ignores its line.
  - **The control she is using is never replaced (#177):** `place` updates the rows and the canvas at once, but the row holding the focused input or select in `#photo-parts` stays the same element (only its name and holes text refreshed), so it keeps its focus, what she has typed and an open picker; every other row is rebuilt around it. Every row control (value, colour, volts, ⇄) writes to the item in `PhotoConfirm.reading` as it is when it fires, looked up by id (`'power:N'` for a battery), since a merge replaces the Reading.
  - Build it works at any time: `PhotoImport.build` of the Reading as it is.

## Edison and the course hub

### UI flag (`Plugged/edison/ui-flag.js`, `window.UiFlag`)
- `UiFlag.resolve(search, stored)` → `'edison' | 'classic'`. `search` is `location.search`; `stored` is the saved value or null. `?ui=edison|classic` wins, then a valid stored value, else `'classic'`.
- `UiFlag.apply(doc, ui)` sets `doc.documentElement.dataset.ui = ui`.
- `UiFlag.switchTo(ui)` saves `ui`; on success drops the `ui` param, on a failed save keeps `ui=<ui>` so the switch still works this load.
- A page with `<html data-ui-fixed>` (an Edison-only page) is never changed by boot.
- A framed page (window.top !== window, or reading it throws) takes its UI from `?ui=` only (never the saved choice), applies it, and never saves.
- Storage key: `plugged.ui`. Loaded first in `<head>`; never throws.

### Page hooks
- `circuit3d/index.html?lab=<id>` loads that lab's starter circuit and opens its lab sheet. An unknown id shows a hint and loads nothing.
- `circuit3d/viewer.html?circuit=<path>` renders that `.sparky`. Only paths under `edison/` or `circuit3d/labs/` that end in `.sparky` are allowed; anything else falls back to `../demo.sparky`.
- `circuit3d/viewer.html?nozoom=1` turns off wheel zoom (`controls.enableZoom = false`), so the wheel scrolls the page around the frame. Only the textbook's figures pass it (E7).
- `circuit3d/viewer.html?mode=hero[&stage=empty][&ink=%23rrggbb]` (the Edison landing, #163, #167, #171 and #174; `js/hero-model.js`): an opaque `#101010`, non-interactive frame (its rim fades to the same black) drawing the board as a glass sketch (ref 04): a faint glass fill with white edges (ink `#f4f4f4` unless `&ink=`; a bad value keeps the default), square hole pockets, neon rails (+ `HeroModel.RAIL_POS` `#FF3D7F`, − `HeroModel.RAIL_NEG` `#3D7BFF`), a glass base layer, dashed construction lines down to a dashed ground rectangle, and dashed axes through the spin centre; turning slowly. The neon and the glass's edges bloom (an UnrealBloomPass on just those, added over the antialiased scene, from Three r128's `examples/js/postprocessing/`, which viewer.html loads only in hero mode; if one fails or they take over 4 s, the hero draws unbloomed and `Hero.ready` doesn't wait). The whole board is framed, in view at every turn at `'empty'` (on frames wider than 2:1 it is framed bigger and seen from a little lower, its ends reaching into the faded rim at the extremes of the turn but never past an edge; blended in to 2.5:1, so nothing jumps); from `'lineart'` on the camera is 8% nearer, a gentle push-in that keeps the board whole. Stages, in order (`HeroModel.STAGES`): `'empty'` (the bare board), `'lineart'` (the `?circuit=`'s on-board parts and wires in white edges; a part off the board, the battery, is not in the sketch, and its leads fade out as they leave the board), `'solid'` (the shaded model, the battery with it, no bloom), `'lit'` (the LED lit, with a red halo, no bloom). `&stage=empty` starts at `'empty'`; anything else at `'lineart'` (`HeroModel.startStage(location.search)`). It puts `window.Hero` on the frame: `Hero.ready` (Promise, resolves once the first stage is drawn, after any draw-in), `Hero.current()` → the stage last reached, `Hero.stage(name)` → Promise resolved when that stage is reached, from any stage, one neighbouring stage at a time (the first load starts from the stencil, the board's outline alone for 0.6 s from the first frame shown, then its rails and hole grid fade up over 0.6 s (storyboard 01 → 02); up from `'empty'` comes the build-up, about 3.5 s under a slow push-in, `HeroModel.BUILD_STEPS` in order: `'paths'` (each conductive strip and rail stretch the circuit uses, `HeroModel.usedStrips(circuit)`, a violet glow, `HeroModel.SKETCH_GLOW` `#B48CFF`), `'parts'` (the parts and wires draw in, staggered in build order over 1.2 s), `'led'` (LED1's violet sketch glow), `'glass'` (the glass's fill 5% → 10%, its edges brighter), `'underglow'` (a violet glow under the board, seen through it); every shader it needs is built and drawn once while the canvas is still hidden, so it doesn't stall; `'solid'` fades the bloom out with the cross-fade; `'solid'` cross-fades over 1.2 s; `'lit'` posts `{ type: 'edison:lit', x, y }` to `window.parent` once each time it lights, as the glow starts, x/y the dome's place in the frame, 0–1 from the top left, and its halo eases in over 0.25 s; down, `'lit'` → `'solid'` puts the light out, `'solid'` → `'lineart'` cross-fades back, `'lineart'` → `'empty'` takes the parts and the build-up's violet away and moves the camera out). Calls queue in order; an unknown name rejects; a stage that fails rejects only its own call. `Hero.ink(hex)` recolours the line art (edges, axes and construction lines) in place (anything but `#rrggbb` changes nothing; kept for embedders; the landing doesn't use it). `Hero.anchors()` → `{ LED1, R1, BAT1, rail, holes, path, casing }` (one entry per part label, plus `rail`, `holes`, `path` and `casing`), each `{ x, y, visible }` for the camera now (`HeroModel.anchorOf`): x/y 0–1 from the top left, held inside the frame (0 while the frame is 0×0); `visible` false outside the frame, behind the camera, or while that part is hidden (`path`: while the circuit paths aren't drawn, so not at `'solid'`/`'lit'`; `casing`: within about 15° of end-on, where the nearer edge swaps sides). `Hero.bloom()` → the bloom's strength now (0.4 on the glass, 0 at `'solid'` and `'lit'`). The points: an LED's dome top, the middle of an off-board part's face towards the camera's start (the battery's front, in frame at `'solid'`/`'lit'`), any other part's middle, the + rail beside the circuit, a hole near the board's middle, the first used strip (`path`), the middle of the glass board's long top edge nearer the camera (`casing`). Reduced motion: no turning, and the stencil, stages, build-up, camera moves and halo jump (as they also do while the frame has no size or its tab is hidden).
- `circuit3d/index.html?open=<path>` loads that `.sparky` (a path from `Plugged/`, allow-listed like the viewer's `?circuit=` by `UiFlag.allowedCircuit`). Anything else is never fetched, loads nothing and shows a hint. `?lab=` wins when both are present (E7; the textbook's "Open in the editor"). With `&run=1` the editor starts Simulate once that circuit has loaded (the textbook spread's "Test in lab +", #181); a failed load starts nothing.
- `circuit3d/js/scene.js` uses the CSS variable `--scene-bg` (a hex colour) as the scene background when it is set on `<html>`.
- `circuit3d/js/scene.js` uses the CSS variable `--scene-ground` (a hex colour) for the ground plane (named `'ground'`) when it is set on `<html>`; unset, the ground keeps its classic colour (E2). In Edison the editor hides that ground (kept in the scene: the hero finds it by name) and `circuit3d/js/scene-env.js` (`window.SceneEnv`, loaded only by `circuit3d/index.html`) draws the floor instead (#187): a group named `'scene-env'` holding a grid floor that fades out, at `SceneEnv.BENCH_Y` = `-(BOARD_THICK + 0.025)`. It runs only when `SceneEnv.shouldRun(<html>'s dataset)`: `data-ui="edison"` and not `data-mode="hero"`. It sets `App.BENCH_Y`, and off-board parts (instruments, the battery) stand at `App.BENCH_Y || 0`, so classic's stay at y = 0 on its unchanged ground.
- `circuit3d/index.html?ask=<text>` (Edison only): on load, puts `<text>` in the chat and sends it once through `window.sparkyAsk`, then removes `ask` from the URL with `history.replaceState` (E2; the landing page builds these URLs).

### Lab sheets (`circuit3d/labs/sheets.js`, `window.LabSheets`)
- `LabSheets.get(id)` → `Sheet | null`. `LabSheets.ids()` → `string[]`.
- `Sheet = { id, code, title, week, starter, steps: Step[] }`. `code` is like "LAB-02"; `starter` is a path relative to `circuit3d/`.
- `Step = { n, text, hint, check }`.
- `check` is one of:
  - `{ kind: 'part', label, near?: string }`: the part exists (optionally across the centre gap).
  - `{ kind: 'measure', label, quantity: 'I'|'V', expect, unit: 'mA'|'V', tol, needs?: string[] }`: |measured − expect| ≤ tol × |expect|.
  - `{ kind: 'peak', label, pin, expect, unit: 'V', tol, needs?: string[] }`: the largest |V| seen at that pin since Run, counting only samples where the op-amp is linear (a clipped or current-limited sample is ignored; a reading with no `mode` counts as linear). It passes once |peak − expect| ≤ tol × expect, and is `'pending'` until then, never `'failed'`.
  - `{ kind: 'manual' }`: the student ticks it.
  - `{ kind: 'supply', label, pins: { <pin>: volts }, tol }`: each named supply pin of the part (e.g. `vpos: 12, vneg: -12`) sits within tol × |volts| of its rail. `'pending'` while a pin is floating (not wired yet), `'failed'` when wired to the wrong voltage (a swapped supply).
  - `{ kind: 'answer', q }`: the paper's written answer to question `q` has at least four words (`LabSheets.written`). Classic, which has no answer boxes, ticks it like a manual step.
- `needs` on a measure or peak check lists the part labels it waits for: while any is missing from `board.components` the check is `'pending'`, never `'failed'`, as it is whenever the measured part is floating (its `V` is null), and while the measured part carries no current (|I| < 1e-6 mA: the loop isn't closed).
- `LabSheets.evaluate(check, readings, board, memo, answers?)` → `'passed' | 'failed' | 'pending'`. It never throws; anything missing or floating gives `'pending'`. `memo` is a per-run object for `peak`; `answers` maps a question number to its written answer, for `answer`.
- **The lab manual (the Edison lab paper), all optional:** a `Sheet` may also carry `due`, `objective`, `reading`, `equipment[{ label, text }]`, `prelab[{ n, q, answer, tol, unit? }]`, `data[{ name, expect, unit?, prelab?, read }]` `questions[{ n, q }]` and `seat` (how Give me expects the chip seated), and a `Step` may carry `give`. A sheet without them (Lab 1) is steps only.
  - `read` is `{ kind: 'value', label, key }` (a part's set value), `{ kind: 'peak', label, pin, needs? }` (as the peak check), `{ kind: 'gain', out, in, sign }` (two earlier rows' ratio, by index) or `{ kind: 'phase', in: { label }, out: { label, pin }, needs? }` (`'inverted'` or `'in phase'`). A row with `prelab` shows the student's own answer to that question as Expected, never the key.
  - `give` is `{ parts?[{ type, label, holes, values, says }], wires?[[from, to, says]], run?, says? }`, holes and sentences written with the chip's pins as `{pin}` or `{pin±k}` (that pin's column, plus or minus k).
- `LabSheets.checkAnswer(item, text)` → `'correct' | 'not yet' | 'empty'`: a pre-lab answer as typed ("−10", "10 V"), within `item.tol`.
- `LabSheets.readData(row, rows, readings, board, memo)` → `{ value, ok }`: a data row from a solve; `value` is null until it can be read, `ok` is within 3 % of `expect`. Never throws.
- `LabSheets.giveStep(step, holes, seat?)` → the step's `give` with its holes filled in from the chip's (`holes` is U1's pins by name, `{ out1: 'f30', … }`), or null: nothing to give, a pin the chip doesn't have, the chip not seated as `seat` says (the sheet's `seat`, e.g. `{ f: ['out1', 'in1n', 'in1p', 'vneg'], e: ['vpos'] }`: each pin in its row), or a hole off the board's 63 columns. Never throws.
- `LabSheets.written(text)` → true for a written answer of at least four words.

### Course data (`Plugged/edison/course-data.js`, `window.CourseData`)
- `{ course: { code, title, term, instructor: 'Instructor' }, announcements[{ date, text }], labs[{ id, code, title, due, status: 'open'|'done'|'locked', opens? }], chapters[{ n, title, sections[{ n, title, body, figure? }] }], grades: { students[{ name, lab1, lab2, prelab1 }], sample: true }, heatmap: { lab, cells[{ hole, count, note }], total }, feed[{ minsAgo, lab, step, label, text }] }`
- Sample names are invented. `grades.sample` is always true.

### Result callouts (`Plugged/edison/result-callouts.js`, `window.ResultCallouts`; #191)
- `ResultCallouts.MAX` (4): the clutter cap. `ResultCallouts.pick(lines)` → at most `MAX` of `Readings.lines()`: faults, then warn, then ok, stable within a level.
- `ResultCallouts.layoutCallouts(items, viewport, avoid?)` → one `{ label, left, top, width, height, side, leader }` per item `{ label, x, y, w, h }`, in order: inside `viewport { width, height }`, never overlapping; `leader` is the elbow's three `[x, y]` points from the dot. An item wider or taller than the viewport can't fit: `{ label, hidden: true }`, taking no room (#201).
- The page half, Edison only: `#result-callouts` over the canvas, one `.result-callout[data-label][data-level]` per shown line and a `.result-callout-dot[data-label]` on the part's group top centre, leaders in one SVG. A line whose part's anchor is off the canvas or behind the camera, or whose block can't fit, is hidden: no callout draws outside the canvas (#201). Redraws on `plugged:sim`, clears on `plugged:sim-stop`, re-projects on the orbit controls' `'change'` and on resize; no animation loop. `#sim-results` and the mistakes panel are unchanged. Nothing touches the DOM in Node.

### Dummy endpoints (local server only)
- `POST /api/course/canvas/sync` → `200 { ok: true, demo: true, syncedAt: <ISO> }`
- `GET /api/course/ta-feed` → `200 { demo: true, events: [{ at: <ISO>, lab, step, label, text }] }` (sample events, timestamps relative to now)
- Callers fall back to `CourseData` sample data when these 404 (deployed hosting has no Node server).

## Voice (V1, #12)
The student talks to Edison and hears the answer. ElevenLabs does the speech behind the server, so **the key never reaches the page**. The hold-to-talk UI is V2, a later issue.

### `POST /api/voice/stt` and `POST /api/voice/tts`
- **Owner:** `backend/voice.js` (`{ parseAudioDataUrl, voiceMode, transcribe, speak, VOICE_REPLY }`; `transcribe(clip, { env, fetch })` and `speak(text, { env, fetch })` default to `process.env` and the global `fetch`), routed by `backend/server.js`. **Called by:** the chat's voice UI (V2).
- **`/api/voice/stt` request:** `{ audio }`, a base64 data URL `data:audio/<webm|ogg|mp4|mpeg|wav>[;codecs=…];base64,…`, inside JSON as `/api/photo` sends its image (`readBody` decodes UTF-8, so raw binary would be corrupted). **Response 200:** `{ text }`, the transcript.
- **`/api/voice/tts` request:** `{ text }`, 1 to 600 characters after trimming. **Response 200:** `audio/mpeg` (`mp3_44100_128`), streamed as ElevenLabs sends it, `Cache-Control: no-store`.
- **Errors:** JSON `{ reply, code }`.

| Status | `code` | When | `reply` |
|---|---|---|---|
| 400 | `BAD_AUDIO` | stt: `audio` missing or not a base64 audio data URL of a listed type, or the body isn't JSON | `"That recording could not be read. Try again."` |
| 400 | `BAD_TEXT` | tts: `text` missing, not a string, blank, or over 600 characters after trimming, or the body isn't JSON | `"Nothing to say."` |
| 413 | `TOO_LARGE` | stt: the body is over 2 MB + 64 KB (about a minute of opus); tts: over 8 KB | `"That recording is too long."` / `"That reply is too long to speak."` |
| 429 | `RATE_LIMITED` | more than 20 voice requests a minute from one IP (stt and tts share one map, separate from `/api/ask`'s; `TRUST_PROXY` as for `/api/ask`), checked before the body is read | `"Too many voice requests. Wait a moment."` |
| 502 | `VOICE_FAILED` | ElevenLabs answered an error (its body is never read or passed on) or couldn't be reached | `"Voice failed. Try again or type your question."` |
| 503 | `VOICE_OFF` | `voiceMode()` is `'off'` | `"Voice is off on this server."` |
| 504 | `VOICE_TIMEOUT` | ElevenLabs past `VOICE_TIMEOUT_MS` (default 10000); the call is aborted | `"I didn't catch that in time. Try again."` |

- **Providers:** `VOICE_PROVIDER` = `elevenlabs | fixture | off`, read per request. Unset or blank, it is `elevenlabs` when `ELEVENLABS_API_KEY` is set, otherwise `off`; `elevenlabs` with no key is `off`. The names are in `.env.example`.
  - STT: `POST https://api.elevenlabs.io/v1/speech-to-text`, multipart `file` (the clip) and `model_id` (`ELEVENLABS_STT_MODEL`, default `scribe_v2`), the key in the `xi-api-key` header (no hand-set `Content-Type`: fetch writes the boundary). The 200's JSON `text` is the transcript.
  - TTS: `POST https://api.elevenlabs.io/v1/text-to-speech/<voice>/stream?output_format=mp3_44100_128`, JSON `{ text, model_id }` (`ELEVENLABS_TTS_MODEL`, default `eleven_flash_v2_5`), the key in `xi-api-key`. The voice is `ELEVENLABS_VOICE_ID`, default `JBFqnCBsd6RMkjVDRZzb`.
  - **Deadline:** one per ElevenLabs call, `VOICE_TIMEOUT_MS` (default 10000), on `setTimeout` and an `AbortController`. STT's covers reading the transcript; TTS's ends when the audio starts.
- **Fixtures** (`Plugged/test/fixtures/voice/`): `VOICE_PROVIDER=fixture` answers stt with `stt.json`'s `text` and tts with `tts.mp3`, never calling out, even with a key set. The Playwright server runs with it and unit tests stub `fetch`, so no test reaches ElevenLabs.
- **Health:** `GET /api/health` → `{ status, model, voice }`, `voice` being `voiceMode()`: `'elevenlabs'`, `'fixture'` or `'off'`. Never the key.
- **Logging:** one line per request that reached a provider, e.g. `[voice] stt 200 840 ms`, `[voice] stt 504 VOICE_TIMEOUT 10003 ms`, `[voice] tts 200 310 ms to first byte`. Never the audio, the transcript, an upstream body or the key.
- **Mock:** stt `{ text: 'Why is my output flat?' }`; tts the bytes of `tts.mp3`.

## Testing contract (a part is done when all of these pass)
1. **Registry check**, automatic for every part: every rule in `PartDefinition` and `Placement`.
2. **Known answers:** every `examples[]` entry is run through `Sim.analyze` and matches `expect`.
3. **Round trip**, automatic for every part: place → save → load gives back the same type, label, values, saved controls and legs.
4. **AI:** its generated tool is valid, and `selectTools` returns it for its keywords.
5. **Recipe**, if present: simulates to its `expect`, uses no hole twice, and passes `findCircuitProblems`.
6. **Placement**, for every 2-lead part: default span OK, `max + 1` and `min − 1` refused with the range in the message. For the resistor specifically: **a3→a33 is refused, and the message contains "3–5"**. A vertical placement inside one half (a3→c3) is refused; e3→f3 is allowed. For footprint parts: an edge placement is refused.
7. **Hole map:** after place, delete, undo and reload, `App.holeMap()` equals a fresh rebuild. Every part has one leg per pin.
8. **Browser**, one Playwright spec looping over `Parts.all()`: place from the sidebar, see the ghost, simulate, no console errors. The viewer page loads a circuit that uses every part.
9. **QA:** a `docs/QA.md` case with a real AI prompt that uses the part.
