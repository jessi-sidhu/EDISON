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

**Design note:** decisions, trade-offs and the build order are in `docs/superpowers/specs/2026-09-27-parts-registry-design.md`.

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
| `values` | `{ [key]: ValueSpec }` | Editable settings, saved. |
| `controls` | `{ [key]: ControlSpec }` | Live settings (knob, switch). |
| `gestures` | `{ click?: key, scroll?: key }` | Map 3D gestures onto a control key. The core (not the part) throttles: while a gesture continues, re-simulate **at most every 100 ms**, plus one final run when it stops. **One gesture = one undo step**; a scroll ends after 300 ms without a tick. |
| ● `elements` | `(values, controls) → Element[]` | The simulator's building blocks. Pure function. |
| `measure` | `(r: PartResult) → object` | Flat, JSON-safe outputs, e.g. `{ on: true, current: 14.9 }`. Drives visuals and results. |
| `warnings` | `(r, m) → string[]` | Advice, e.g. `"LED1 is backwards"`. Each ≤ 120 chars. |
| ● `report` | `(r, m) → string` | One results line, ≤ 80 chars, e.g. `"ON, 14.9 mA"`. |
| `headline` | `(r, m) → { text, cls }` | One line at the top of the results panel, e.g. `Battery 1: 9V` (`sim-info`). Headlines are in board order, with sources (parts with `ref`) after the others. Before a solve (or when there is none) it gets `r` without readings and `m = {}`. |
| `line` | `(r, m) → { text, cls } \| null` | Replaces the generic `💡 NAME ON (x.x mA)` line for this part, e.g. the buzzer's `🔔 BUZZER ON (x.x mA)`. `null`: no line. |
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
//   Phase 1 spans: resistor {3,5,4} · LED {1,3,2} · buzzer {2,2,2} · button {3,3,3} (fixed).

{ kind: 'footprint', legs: [[dCol, dRow], ...], straddle?: boolean, rotations: [0, 180] | [0, 90, 180, 270] }
//   3+ lead parts. One offset per pin, in pin order, from the anchor (pin 0).
//   straddle: true = chip across the centre gap (legs in rows e and f); rotations limited to [0, 180].

{ kind: 'offboard' }
//   Battery, bench supply, instruments. Sits beside the board; legs have hole: null.
```

### `ValueSpec`
```js
{ unit: 'Ω'|'V'|'A'|'F'|'H'|'%'|'°C'|'lux', default: number, min: number, max: number, series?: 'E12'|'E24' }
//   Any number in [min, max] is allowed. `series` only powers the "closest kit value" hint.
{ choices: { [name]: { ...overrides } }, default: name }
//   e.g. LED colour: { red: { vf: 2.0 }, green: { vf: 2.2 }, ... }. A choice may set other values.
```
The default must be valid. `Parts.checkValue` is the only validator, and the inspector, AI path and file loading all use it.

### `ControlSpec`
```js
{ type: 'toggle',    default: boolean, saved: boolean }
{ type: 'momentary', default: false,   saved: false }            // button: true only while held/pressed
{ type: 'slider',    default: number,  min, max, step, unit?, saved: boolean }
```

### `Element` (the simulator's building blocks)
The element `pins` name the part's pins, or internal nodes written `'#name'` (private to the part). The optional `id` names the element for `r.current[id]`.

| `kind` | Fields | Notes |
|---|---|---|
| `R` | `pins:[a,b], ohms` | `ohms > 0` |
| `V` | `pins:[plus,minus], volts` | Adds one unknown. |
| `I` | `pins:[from,to], amps` | Arrives with the first part that needs it. |
| `SW` | `pins:[a,b], closed` | Closed = 1 mΩ, open = removed. Never an ideal short. |
| `D` | `pins:[anode,cathode], vf, ron, vz?` | Mode block: `off` / `on` / (`breakdown` if `vz`). Replaces today's LED special case. |
| `E` | `out:[+,−], ctrl:[+,−], gain, clamp?:[lo,hi]` | Voltage-controlled voltage source. `clamp` makes it a mode block (`linear` / `low` / `high`): the op-amp's rails. Arrives with dependent sources. |
| `G` | `out:[from,to], ctrl:[+,−], gain` | Voltage-controlled current source. Arrives with dependent sources. |
| `C` | `pins:[a,b], farads, vmax?, polarised?` | Open in a plain solve. With `analyze(components, wires, { dt, state })` it is the backward-Euler companion: `G = C/h` plus a current source `G·v_prev`. `vmax` and `polarised` are for the mistake checker. |
| `L` | none | **Reserved.** Rejected until Phase 5–6. |

**Mode blocks** (`D`, and `E` with `clamp`) are solved by one generic loop:
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
}
```
- `ai: false` instead of an object: the part is never offered to the AI as a tool or listed in the prompt (e.g. the multimeter, the capacitor).

### `ViewSpec` (browser only)
```js
{
  build(ctx, values, controls, legs) → { group: THREE.Group, pinPositions: THREE.Vector3[] },
  //   One pin position per pin, in pin order. The ghost is this same build drawn with ghost materials.
  //   ctx: { THREE, lead(from,to), mat.{body,metal,glass,label}, holeWorld(col,row), boardGeometry }
  update?(obj, measured, r) → void,   // glow, spin, sound; called after every simulation
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
- Request: `{ markdown, message, history, board? }`. `board` is `App.exportBoard()`. A request without it (an older client) behaves as before #84.
- Every live wire has an id `W<n>` (highest in use + 1, never renumbered; after the AI's `delete_all` it starts again at W1). The markdown Wires table is `| id | from | to | color |`.
- Server checks: a reply with `delete_all` is checked from its last one, as before. An edit with a `board` is checked on `Board.apply(board, actions).board`, rebuilt by `Board.toActions` so it gets the full checker and the simulator, with the rebuild's labels mapped back to the board's own in the problems. An edit reports only the problems it introduces: the board after it minus the board before, compared in the board's own labels, so unfinished wiring already on the board is never reported. The repair loop and the Heads up both use this. An edit without a `board` is not checked. The actions sent back are always the reply's own.

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
- **Optional third argument `{ dt, state }`** (additive): `analyze(components, wires, { dt, state })` runs one time step of length `dt`.
  - Each `C` starts at its voltage in `state` (0 V when missing, i.e. discharged).
  - `state` and `result.state` are keyed `"<label>.<elementId>"` (e.g. `"C1.c"`), in volts, + from the `C`'s pin `a` to pin `b`.
  - `result.state` holds each capacitor's voltage after the step. Early returns (short wire across a source, parallel-source fight, unsolvable, unsettled, current source with no path) carry **no** `state`; the caller keeps its previous state.
  - Each capacitor's current is `result.parts[label].r.current[elementId]`, in mA, + from `a` to `b`.
  - A capacitor carrying current (≥ 1 µA) counts as a complete path, so "Circuit open — no complete path." is not shown while one charges or discharges.
  - Without `dt`, a `C` is an open circuit.
  - Called without the third argument on a board with no `C` elements, it behaves exactly as today.
- **`Sim.pickDt(tauMin)`** → the page's step in seconds: `tauMin / 50`, clamped to 10 µs–10 ms; 1 ms when `tauMin` is not a positive finite number.
- **The page's time run (#103):** Run on a board with any `C` starts a `requestAnimationFrame` loop instead of one solve. It steps up to 200 times per frame at `dt = pickDt(τ)` (τ estimated as the smallest R × the smallest C), carrying `state`, so sim time keeps pace with real time (`(slowed)` when it can't). Each frame shows `t = <s> s` at the top of `#sim-results`, then sends `plugged:sim` with that frame's result. A control change keeps `state`; Stop cancels the loop and clears it. A board with no `C` solves once, as before.

### `Readings` (`circuit3d/js/readings.js`)
- **Owner:** readings (`circuit3d/js/readings.js`). A plain module that loads in Node, like `simulate.js`. It never changes the solver.
- **Called by:** the tools (`circuit3d/js/tools/`), and `simulate.js`, which builds the readings for `plugged:sim`.
- **Units:** V, mA and W, the same as the results panel. `energy` is in µJ.
- **Input:** `Readings.from(result, board)`. `result` is from `Sim.analyze`; `board` is `{ components, wires }`, the same arguments given to `Sim.analyze`. In Node that is `Board.toSim(board)`'s output; in the page it is `App.state`. Readings are recomputed from the latest result.
- **Output:** an object with:
  - `netOf(hole)` → `{ id, holes[], pins[] }`
  - `voltage(hole | net)` → volts, or `null` when floating
  - `part(label)` → `{ V, I, P, rating, over, energy? }`
    - V is the voltage across the part's outer pins, I is its current, and P = V·I, in W (I is in mA, so P = V × I ÷ 1000).
    - `rating` comes from the part's own values where it has one. Resistors are rated **¼ W**. A part with no rating has none.
    - `energy` is ½CV², in µJ, for capacitors only.
  - `kcl(net)` → `[{ label, pin, amps }]`: each element current into the net, signed, in mA. It sums to 0 within 1 µA.
  - `thevenin(a, b)` → `{ Vth, Rth, In }` or `{ why }`. It solves copies of the board when called, never on every solve. `{ why }` when there is no source, or when a and b are on the same net.
  - `problems()` → `[{ kind, labels[], why }]`, built from the simulation result. It covers shorts, LEDs with no resistor, backwards parts, open circuits and parts over their rating. `why` is plain English.
- **`Readings.nets(board)`:** which holes and pins are joined, with no solve needed (for the connection highlight). `board` is `{ components, wires }`, as for `Readings.from`.
- **Errors:** never throws. `voltage` gives `null` when floating; `thevenin` gives `{ why }`; `part(label)` for an unknown label and `netOf(hole)` for a hole not on the board give `null`.
- **Mock:** none. Tests build a real result in Node with `Board.toSim` and `Sim.analyze`.

### Page events (`plugged:sim`, `plugged:sim-stop`)
- **`plugged:sim`** on `document`, with `detail: { result, readings }`. Sent after every solve, and once per frame while time runs.
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
- **Tool selection** is `selectTools(message, boardTypes) → tool[]`, a pure function that's tested. Per request it sends:
  1. the always-sent tools
  2. the tools for parts on the board
  3. keyword matches
  4. if nothing else matched, the everyday set (resistor, LED, button, buzzer)

  It sends **at most 12 part tools**, plus the always-sent tools (#76). The prompt always carries a one-line catalogue of every part.
- **Generated prompt sections:** label prefixes, sizing lines built from `span`/`legs` (e.g. `"resistor: 3–5 columns apart on one row (4 is typical)"`), pin names, and the guides of the tools being sent. Recipes stay hand-written.
- **The server's circuit checks** read `elements`: `R` and `SW` conduct, and `D` conducts one way. Placement goes through `Parts.checkPlacement`.

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
