# Usable baseline — design

Date: 2026-09-27
Status: awaiting review

## Goal

Make Sparky run correctly on a local machine: a correct simulator, an AI tutor
whose builds apply the way they were previewed, and no data loss. This is the
foundation for later "2.0" work, which is out of scope here.

## Scope

In scope: every issue in the 2026-09-26 code review except deployment.

Out of scope:
- Deployment (Render, Firebase Hosting, the Firebase authorized-domain setting).
  The project stays local, with no GitHub remote.
- New features, including the AI checking its own build (upstream issue #15).
- Renaming the app.

## 1. Tooling

- **Git.** A local repository, already created, with a baseline commit.
  Each fix below is committed separately.
- **Vitest.** Move `test/simulate.test.js` from `node:test` to Vitest and add
  the `tdd-guard-vitest` reporter, so tdd-guard can read the results. This
  means:
  - `package.json` gets `"test": "vitest run"`.
  - A `vitest.config.js` at the root, with the reporter's `projectRoot` set.
  - The tests keep `node:assert`, since Vitest accepts any thrown error.
- `npm install` also installs the Remotion video dependencies, because they
  share the root `package.json`. That's accepted.

## 2. Simulator rewrite (upstream #8, #9, #11)

Replace the path search in `circuit3d/js/simulate.js` with nodal analysis
(modified nodal analysis, MNA), keeping the module's UMD shape and its
browser API (`App.runSimulation`, `App.stopSimulation`).

### Nodes
`buildGraph` is unchanged: holes, wires and pressed buttons are merged into
nodes with Union-Find.

### Element models

| Element | Model |
| --- | --- |
| Resistor, buzzer | Conductance 1/R |
| Battery | Ideal voltage source, pin 0 (+) to pin 1 (−). Its current is an extra MNA unknown. |
| LED, off | Open circuit |
| LED, on | Forward voltage Vf in series with R_on = 0.1 Ω, stamped as its Norton equivalent |
| Button, released | Open circuit |
| Button, pressed | Already merged into one node by `buildGraph` |

Two stabilisers:
- **gmin** = 1e-9 S from every node to the reference node, so a floating part
  can't make the matrix singular.
- The **reference node** is the negative terminal of the first battery.

R_on = 0.1 Ω keeps the existing expected values within their 0.01 mA
tolerance. For example, the series circuit gives 7 / 470.1 = 14.890 mA against
14.894 expected. It also makes identical parallel LEDs share current equally.

### Deciding which LEDs are on
LEDs are piecewise-linear, so the solver searches for a consistent on/off
state:

1. Start with every LED off.
2. Solve.
3. Find the LED whose state is most wrong: an off LED with V(anode) − V(cathode)
   above Vf, or an on LED carrying negative current.
4. Flip only that LED, then solve again.
5. Stop when nothing is wrong. Stop anyway after 4 × (number of LEDs) + 10
   rounds, and then show a "could not settle" warning.

This is deterministic: the same circuit always gives the same result.

### Solving
Gaussian elimination with partial pivoting, in plain JavaScript, with no
dependency. If a pivot is below 1e-12, the circuit can't be solved, for
example because batteries are wired directly in parallel. The result is then
`status: 'unsolvable'` with an explanation, and no exception is thrown.

### Detecting problems

| Condition | Reported as |
| --- | --- |
| A battery's + and − share a node | Short circuit: a wire straight across the battery. Checked before solving. |
| Current through a battery above 1 A | Short circuit. If an LED is in that loop, the existing LED-specific message with the suggested resistor. |
| LED on and current ≥ its `thresholdCurrent` | `💡 LED ON (x mA)`, plus the over-current line when above `maxCurrent` |
| LED off with V(cathode) − V(anode) ≥ its Vf | "LED is backwards…" |
| Buzzer carrying ≥ its `thresholdCurrent` | Buzzer on. Either direction counts. |
| Battery current below 1 µA and nothing on | "Circuit open — no complete path", plus the existing "terminals not connected" check |
| Empty board, or no battery | Unchanged |

### Result
```
{ status: 'empty' | 'no-battery' | 'ok' | 'unsolvable',
  lines, ledsOn, buzzersOn,          // unchanged, used by the UI
  nodeVoltages: { [nodeId]: volts },
  currents: [amps per component index],   // + means pin 0 → pin 1 inside the part
  shorted: boolean }
```

The `branches` field and the path-cap warnings are removed, and so is
`findAllPaths`. `PROPS` and `propsOf` are unchanged.

### Tests
- The tests marked "WRONG TODAY" are deleted.
- The three skipped tests (#8, #9, #11) are switched on, rewritten against
  `currents` and `nodeVoltages`.
- The short-circuit test changes from `branches` to `shorted`.
- New tests:
  - two LEDs of different colours in parallel: only the lower-Vf one lights
  - a floating part does not break the solve
  - a button toggling a circuit on and off

## 3. AI chat

### Move the chat code into its own module
- The inline script in `circuit3d/index.html` moves to
  `circuit3d/js/chat.js`.
- The logic that turns actions into board changes becomes pure functions,
  exported the same UMD way as `simulate.js` so Vitest can load them.
- The DOM-handling code stays in the same file but is kept separate from the
  pure functions.

### One way of naming components
- Everywhere uses per-type indexes: `battery_0` is the first battery,
  `led_1` the second LED. This is what the system prompt, the server's checks
  and the code that applies actions already assume.
- `App.exportMarkdown`, `App.exportState` and the `id` field in saved files
  switch from global indexes to per-type indexes.
- `exportState` gets the full `<type>_<n>_pin<k>` form. It currently writes
  `battery_pin0`.
- The copy of `parseHole` inside `index.html` is deleted in favour of
  `App.parseHole`.

### Accurate apply count
Each action reports whether it was applied. "Applied N changes" counts only
those that were, and adds "M could not be applied" when any fail.

### One undo step per AI build
A new `App.batch(fn)` records one history entry, runs `fn` with history
recording muted, and runs `refreshCounts` once at the end. Accepting an AI
build runs through it.

### Remove dead code
`remove_component` and `remove_wire`, both in the preview and in the code
that applies actions, are deleted. The server never offers these tools to the
AI.

## 4. Server

- **Delete the unused routes:** Google OAuth (`/api/auth/*`), Cloudant
  (`/api/circuits*`), and their environment variables and startup warnings.
  This also removes the `postMessage(d, "*")` token leak.
- **Rate limit by the real visitor:** when `TRUST_PROXY=1`, key the limit on
  the first `X-Forwarded-For` address. Otherwise use `remoteAddress`, as now.
- **Request size limit:** stop reading the body at 256 KB and respond
  `413 Request too large`.
- **Make it testable:** `server.js` only calls `listen()` when run directly
  (`require.main === module`), and exports `findCircuitProblems`, the
  rate-limit key function and the request handler for tests.

## 5. Saved circuits and signing out

Storage becomes per user.

| Before | After |
| --- | --- |
| `sparky_local_projects` | `sparky_local_projects:<uid>` |
| `sparky_starred` | `sparky_starred:<uid>` |

- **The editor** reads the current user's id from `sparky_current_uid`, which
  the dashboard writes. With no id it uses `guest`, for example when opened
  from the landing page's "Try it out".
- **Signing in:** the dashboard sets `sparky_current_uid`, and moves any
  circuits under `guest` or the old unkeyed `sparky_local_projects` into that
  user's list. The moved keys are then removed.
- **Signing out:** removes `sparky_current_uid`, `sparky_username` and the
  pending-load session key. Circuits are no longer deleted.
- **Privacy:** after a sign-out, the next person to sign in sees only their
  own circuits in the app. localStorage is not a security boundary, which is
  the same as before this change.
- The key logic goes in a small module, `circuit3d/js/storage.js`, loaded by
  both the editor and the dashboard and tested with Vitest.

## 6. Small fixes

- **`rebuildBoard`** (`app.js`): record `null` for a part that fails to
  rebuild, so wire indexes still line up. Wires pointing at a `null` part are
  skipped.
- **Clear All confirmation:** drop "This cannot be undone." and say
  "You can undo this with Ctrl+Z."
- **`viewer.html`:** pass saved values (resistance, LED colour) to the
  component builders.
- **`firebase.json`:** add `test/**`, `docs/**`, `vitest.config.js` and
  `*.png` to the hosting ignore list. No page uses the PNG screenshots.
- **Test comments:** fix the wrong mA figures in `simulate.test.js`. This
  happens as part of the rewrite in §2.
- **Docs:**
  - README: remove the OAuth and Cloudant sections, document `npm test` and
    `TRUST_PROXY`.
  - `features.md`: update the simulator limitations and the sign-out
    behaviour.

## Testing and verification

- Every behaviour change is driven by a failing Vitest test first, as
  tdd-guard requires.
- **Browser check at the end:** run the backend with `AI_PROVIDER=fixture`
  and, in the browser:
  - place parts and wire a circuit
  - simulate
  - accept the recorded AI build, then undo it in one step
  - save and reload
  - load the demo circuit
- A real Gemini call is only checked if a key is available.

## Order of work

1. Vitest and tdd-guard reporter.
2. Simulator rewrite.
3. AI chat changes.
4. Server changes.
5. Storage changes.
6. Small fixes and docs.
7. Browser check.

Each is its own commit.
