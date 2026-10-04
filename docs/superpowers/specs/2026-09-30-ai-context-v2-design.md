# AI context v2: part packs, a repair loop and edit-in-place (design)

*Status: approved by Aarmen, 2026-09-30. Built from two research reports (outside research on context engineering and circuit agents; an audit of our own AI pipeline). Author: Aarmen with Claude Code.*

## Goal
The AI tutor is going to carry much more: Phase 3's readings, the op-amp (Phase 4), lab circuits, edits instead of rebuilds. Today every request sends every part's rules, the AI never sees whether its own build works, and it can only rebuild from scratch. This design fixes all three, so the AI stays reliable as the part catalog grows.

**Success:**
- A real-AI eval script grades the AI with our own checker and simulator. The demo prompts pass 3 runs out of 3, before and after every change here.
- Adding a part no longer changes the demo request.
- The AI checks and repairs its own build before the user sees it.
- "Fix it." and "Add a second LED" keep the correct parts and wires where they are.
- `npm test`, `npm run check` and `npm run e2e` stay green.

## What the research says (short)
- **No RAG / vector DB.** At 20–50 parts, a keyed lookup of the registry is more accurate, predictable and testable.
- **The server picks the context, not the model.** A small fast model skips or delays "look it up" calls. Send a fixed core plus packs for the parts in play. `use_parts` stays as the fallback for a part the selector missed.
- **Build → check → repair is the proven win** (SPICE feedback took one circuit agent from 15% to 91%). Feedback must be specific and located: "LED1 is backwards: its anode is on the ground rail." Our checker already produces that; it just goes to the user today.
- **Edits work with** short stable ids, a compact what-connects-to-what view, small edit tools, and a server that checks every id.
- **Examples:** 1–2 relevant worked builds do as well as all of them.
- **Reliability comes from evals graded by code**, run several times each. Cost is not a concern (~$0.001 per round).
- **Not adopted:** a vector DB, a planner agent, the model critiquing itself, rearranging the prompt to chase caching.

## Architecture
```
browser ── { markdown, board, message, history } ──► /api/ask
                                                        │
   Context.build(message, board) ─► core + packs(parts in play) + board + message
                                                        │
   DeepSeek tool loop ─► actions ─► Board.apply(board, actions) ─► Check.run(result board)
                                         ▲                               │
                                         └──── repair round (≤ 2) ◄──────┘ problems, located
                                                        │
                                  reply + actions (+ "Heads up" for what's left) ─► preview
```

### 1. Board model: `circuit3d/js/board-model.js` (loads in Node and the browser, like `simulate.js`)
- **The shape** is the existing Example shape (`docs/API-CONTRACT.md` → "Example"): `{ parts: [{ type, label, holes, values, controls }], wires: [{ id, from, to }] }`.
- `Board.apply(board, actions)` → `{ board, errors[] }`. It applies place_*, add_wire, delete_wire, delete_part, delete_all, set_value and set_control in order, the way `chat.js` does on accept. It never mutates its input. An unknown label or wire id is an error, not a crash.
- `Board.toSim(board)` → the `(components, wires)` that `Sim.analyze` takes. This is what `test/parts-examples.test.js` does inline today; the test switches to it.
- **Wire ids** (`W1`, `W2`, …) follow the part-label rules: stable, saved with the circuit, never renumbered on delete.

### 2. The browser sends the board
`POST /api/ask` gains `board` (the Example shape, from a new `App.exportBoard()`), next to the `markdown` it already sends. The markdown stays: it is what the model reads. The server uses `board` to judge edits against the board as it will look, which removes the `fullRebuild` special case (`server.js:859`). Old clients that send no `board` get today's behaviour.

### 3. Part packs: `Context.build`
The system prompt becomes:
1. **Core, the same bytes every request:** layout, hole names, battery, wiring rules, building behaviour, the part catalogue and label prefixes (one short line each, for every part), and the one-LED worked build.
2. **Packs, for the parts in play only, sorted by type:** pin roles, values, sizing, guide, controls and recipe. "In play" is the same selector that already picks the tools: on the board, named in the message, or the everyday set.
3. `set_value` and `set_control` are built per request, from the same parts.
4. The hand-written parallel, series, branch and button recipes move into packs: the LED pack and the button pack.

The always-sent tools stop counting toward `MAX_TOOLS`, so a request can carry up to 12 part tools, not 5. `use_parts` returns the full pack of the part it adds.

**Budget tests replace the single `DEMO_BUDGET`:**
- Registering an extra test part leaves the demo request byte-identical, apart from its one catalogue line.
- The demo request has a lowered budget, set after packs land.
- A heavy mixed request (LEDs, a button, a motor and a diode) has its own budget.

### 4. Repair loop
After the model's final actions, the server runs `Board.apply` on the sent board, then the checks: placement, `findCircuitProblems` and a simulation. If any fail, the model gets one tool-result message listing each problem with the part or wire id, the hole, the rule, and a suggested fix. At most 2 repair rounds, then the reply goes to the user with a "Heads up" only for what is still wrong. The repair rounds and what they fixed are logged.

### 5. Edit-in-place
- New `delete_wire { wire: 'W3' }` tool. The board markdown's Wires table shows each wire's id.
- The BUILDING BEHAVIOR rules change from "never patch, always rebuild" to: keep every correct part and wire; change only what is wrong; to add, place only the new parts and wires; `delete_all` only for "start over" or "build something new". A `delete_all` in reply to an edit request is logged as a warning (not refused).
- For "Fix it.", the reply says what was wrong before what it changed.
- **Chat history records what actually happened.** An applied build is sent back as its action list; a declined one says it was declined.

### 6. Real-AI eval script: `Plugged/scripts/ai-eval.js`
- Cases live in `Plugged/scripts/ai-eval-cases.js`, taken from the AI cases in `docs/QA.md`, plus edit cases: "Fix it." on a backwards LED, "Add a second LED in parallel", "make the resistor 1k".
- Each case: a starting board, a message, and checks graded by code: no checker problems; a simulator reading in a range (e.g. LED1 5–20 mA); parts that must survive an edit still exist with the same holes.
- `node scripts/ai-eval.js [--runs 3] [--only demo]` calls the real server `ask` path with the real key from `.env`, prints pass/fail per run, and reports pass³ for demo cases. It is not part of `npm test` (it costs calls and needs the key).
- It replaces the manual three-run demo check in `/ship` and `AGENTS.md`'s golden-file gotcha.

### 7. Clear All keeps the circuit
Clear All empties the board but stays on the same circuit and name (`keepCircuit: true`, as the AI's `delete_all` already does). Undo still brings it back. New circuits come from the dashboard.

## Contract changes (Aarmen decides; this spec is the record)
Additive to `docs/API-CONTRACT.md`:
- `/api/ask` request: optional `board` (Example shape, with wire ids).
- `Board.apply`, `Board.toSim` and the wire id rules.
- The `delete_wire` action.

## Build order (one lane)
1. **Eval script** on today's pipeline, with the current behaviour recorded as the baseline. *(Needs `Board.apply` for grading, so the board model starts here: apply + toSim, no wire ids yet.)*
2. **Part packs** + the new budget tests. Eval: demo pass³ before and after.
3. **Repair loop** (full rebuilds first, since the server knows the whole board then).
4. **The browser sends the board + wire ids + `delete_wire`.**
5. **Edit-in-place rules + history fix.** Eval: the edit cases pass.
6. **Clear All keeps the circuit** (independent; any time).

Goldens are updated deliberately at steps 2, 3 and 5, each with an eval run.

## Testing
- **Vitest:** `Board.apply` on every action, including errors (unknown label, unknown wire, action after `delete_all`); `toSim` against today's `parts-examples` answers; `Context.build` picks the right packs (demo, bench supply, a mixed request, a part only on the board); the byte-identical test; the repair loop with a fake model (a backwards LED fixed in round 1; still broken after 2 rounds gives a Heads up; a good build sends no repair round); `delete_wire`; history entries for applied and declined builds.
- **Playwright** (2–4): "Add a second LED" keeps LED1 and its wires in place; Clear All keeps the circuit name and undo restores it.
- **Real AI:** `scripts/ai-eval.js`, 3 runs, before and after steps 2, 3 and 5.

## Risks
| Risk | Mitigation |
|---|---|
| Packs drop a rule the demo relied on | The eval baseline before step 2; demo pass³ required after. |
| Repair rounds make replies slow | At most 2; skipped entirely when the checks pass (the common case). |
| The model patches badly and leaves half-fixed boards (why "never patch" existed) | The repair loop runs on edits too; edit cases in the eval; `delete_all` still allowed for "start over". |
| The browser board and the markdown disagree | Both come from the same state in one call; a test pins that every part in `board` appears in `markdown`. |
| Other AI modes drift (Claude mode skips the checks; Gemini sends everything) | Out of scope; DeepSeek is the product path. Noted for later. |

## Out of scope (Stage C, with Phase 4)
Netlist-level tools (the AI connects pins, code picks holes), the lab library, the AI reading Phase 3's readings, one prompt path for every AI mode.
