# Status and handoff

**Read this first when you pick the project up on any machine.** It's the shared memory: where things stand, what's next, what we learned, and how Aarmen likes to work. Claude Code's own memory lives on one laptop only, so anything worth keeping goes here. Update it at the end of each session (Claude: do it as part of wrapping up).

*Last updated: 2026-10-04 ~5:45 am, Mac session.*

## Morning of 2026-10-04: read this first (all on `dev` at eb44795; `main` NOT promoted yet)
Overnight, all shipped to `dev`:
- **#15** `leds-buttons` and **#16** `ensc-lab` (Aarmen's ENSC 220 bench): hard-coded photo samples. A sample shows its photo with "Reading your board…" for 1 s, then builds a fixed board, with no AI.
- **#17 Thandi's upload (the demo's photo beat):**
  - Upload `~/Downloads/thandi-board-1.jpg` (or `-2` / `-3`; the originals are IMG_2011–2013 in Messages), then tap the 4 corners and press Looks right.
  - It builds the board **as photographed**: U1 turned around and 2 columns off, and pin 4 (V−) not wired.
  - Edison's first answer names both mistakes. Type **"fix it"**: the canned fix moves U1 to e32 facing left and adds a29 → tn_29. Accept, and the LED blinks.
  - The photo is recognised by its file's SHA-256, so it has to be **that exact file**, picked on localhost. A phone re-save or an http LAN address goes to Gemini instead.
  - The fix triggers on "fix", "correct", "repair" or "solve". It's also a sample tile, as a fallback.
- **#18 simulator:** an op-amp with positive feedback now snaps between its rails with hysteresis, so the blinker blinks (Thandi's board: period 1.23 s; 60 s with every step ok). Before, it stuck at about 0.5 s; then it froze at 5.4 s, which was fixed after review.
- **Checked in the real browser (Mac Chrome)** on eb44795: upload → corners → broken board → Edison → "fix it" → Accept → LED on 5.1 mA / off, repeating, "CIRCUIT OK" throughout, no console errors.
- **Screenshots for Aarmen** are in `~/Downloads/edison-morning/`:
  - `1-side-by-side.jpg` (photo vs app);
  - the broken, LED-on and LED-off shots;
  - Thandi's photo with every lead marked, and the decode notes.
- **Testing was lean, at Aarmen's call** (2026-10-04, "it just needs to run and be correct"): #16 and #17 shipped on lint, unit and the photo/chat specs, without a full browser run. **Run the full `npm run e2e` in `/promote`.**

**For Aarmen to decide in the morning:**
1. Look at `1-side-by-side.jpg` (does the app board match Thandi's photo?), then `/promote`.
2. **Ask Thandi to check 4 hidden ends** on the real board: j32, j22, i26, g36 (`thandi-board-decode.md`). Also, R3 is 5.6 kΩ (green-blue-red), not 10 kΩ.
3. **The app mirrors real breadboards:** a DIP's pins can't sit at a photo's printed holes, so Thandi's board is stored with its rows flipped (A↔J). The 3D view looks like IMG_2013, which is why that's the sample photo.
4. **Polish:** after the fix, U1's callout says "clipped… fine for a comparator; in an amplifier lower the gain". Accurate, but off-message for a blinker.
5. **The server checker's false alarm on `ensc-lab`:** R3 "not between power and ground" (a comparator input resistor).
6. **Small things:** a stale comment in `test/tl072.test.js` section 4 (the 5.4 s freeze was at the lower threshold); `fingerprint()` hashes any picked file (cap it at, say, 50 MB).
7. **Not done:** the course labs with hard-coded steps (Aarmen: a separate job, later).

## Where things are

- **`main`** = `dev`, promoted in PR #211: Edison UI, Lab HUD, the parts redo, the photo feature, and the 2026-10-03 bug-fix round below. This is the demo branch.
- **`dev`** is the workspace; promote it to `main` with `/promote` at natural points.
- **One repo now: `github.com/jessi-sidhu/EDISON`** (`~/Desktop/EDISON`). The old `aarmens702-hub/myproject` checkout was removed; its GitHub repo still holds two small commits that aren't here (a Firebase-config comment and a docs line).
- **The op-amp repair checks (`docs/TODO.md` task 5):** the old branch `aarmen/204-opamp-repair-checks` was lost with the old myproject checkout; the checks were rebuilt as #10 (on `dev` with the fixes merge).
- **The lab paper is on dev:** in the Edison editor a lab's sheet is a white lab manual pulled from the board's left edge (it pushes the board over; the parts fold to icons). Labs 1 and 2 are written out in full (objective, equipment, pre-lab checked as typed, procedure, a data table filled from the sim, questions), open from the ENSC 220 Labs menu with their paper, and start at step 1. Lab 1 starts from the bench supply alone and is built step by step. Lab 2 is the AI test set's case 11 (gain −10 on ±12 V, a 0.5 V sine, the multimeter on the output; about −5.0 V at the input's peak): its TL072 comes seated, and a step checks the meter's probes are on the output and ground. Every step confirms itself, with no ticking: a value set, parts placed, a loop closed and the ±12 V supply (read at U1's pins) confirm as they're built, between runs too; measurements and the peak on a Run; the last step from a written answer. The current step has Give me (builds that step, one undo step, and says where each piece went), Hint and Explain (asks Edison). Labs in Edison open on the whole board. Next: the ENSC 220 course page in black, then textbook and landing polish.
- **The editor's EDISON (top left) goes to the Edison landing** in the Edison UI (it went to the classic dashboard).
- **Reasoning is on by default** (#205, #4): 32 000 `max_tokens`, a 240 s server deadline and a 255 s page timeout. `DEEPSEEK_THINKING=0` turns it off (see "Running the AI test set" below).

### The 2026-10-03 bug-fix round (on `main` since PR #211)
- **#197 bench rules:** at most 1 bench supply, 1 function generator and 2 multimeters (`circuit3d/js/bench.js`). Every instrument the AI places gets its own spot in a row in front of the board, never stacked. The server refuses a 2nd supply or generator, or a 3rd meter, while the model is still answering.
- **#198 one supply, wired the lab way:** CH1 + to the red rail, CH1 COM to the blue rail, CH2's white COM2 grounded, one wire per post. An op-amp's input comes from FG1 (its offset as the DC input), never a second supply.
- **#199 whole or nothing:** a fix that names wires or parts not on the board is refused (the model hears why) or dropped whole. If Accept fails on any step, the whole build is undone and the chat names the failed steps. The model is told the build failed, not that the student declined it.
- **Named pins:** the page now resolves `MM1.red` / `MM1.black` / `PS1.com2` like the server does. Before, AI meter probes never landed in the browser (the eval didn't notice, because it applies builds in Node).
- **#200 photo samples:** only `demo-board` was offered, and the button went straight to it. #15 adds `leds-buttons`, so the picker shows.
- **#201:** the inspector sits inside the canvas frame, not over the chat. Result callouts never draw lines off the canvas.
- **#202 the AI test set:** Aarmen's 16 prompts (`docs/AI-TEST-SET.md`) with a grader that checks the wiring as well as the readings.

## To do, in order

The full detail of each task (why, files, steps, done-when) is in **`docs/TODO.md`**. Work it top to bottom. Issue numbers like #197 in commits and code comments are labels from the old GitHub issues, which have been deleted; `docs/TODO.md` is the task list now (one GitHub issue, #210, mirrors task 2).

| # | Task (docs/TODO.md) | Why now |
|---|---|---|
| 1 | Done (#4): reasoning on by default | 32 000 `max_tokens` (cases 06 and 16 ran out at 16 000), 240 s server / 255 s page timeouts; `DEEPSEEK_THINKING=0` turns it off. Left: a `deepseek-v4-pro` run, then Aarmen picks flash vs Pro. |
| 2 | TL072 guide: a sine input sets the generator's amplitude | Case 11 built a DC input every time because our own guide says "offset = DC in". |
| 3 | Done (#6): the repair loop keeps the best build | The fewest problems wins (a tie goes to the later one), a build the round cap cut off is never sent, and wire fixes are asked for and folded into the build. |
| 4 | Checker false positives (superdiode, back-to-back LEDs): **done in #3** | The clean BANK-07 and BANK-15 builds no longer get a Heads up. |
| 5 | The op-amp repair checks (branch `aarmen/204-opamp-repair-checks`) | Built; waits for task 3. |
| 6 | Wire on-board parts by pin name | Only if hole-level mistakes remain. |
| 7 | Aarmen's call: the LED current floor in case 12 (4.9 mA vs a 5 mA floor) | |
| 8 | `/demo-check` on main (PR #211 skipped the browser demo walk for time) | |
| 9 | Voice: ElevenLabs V1–V3 | Not started; needs `ELEVENLABS_API_KEY`. |
| 10 | Older items: photo-answer wording, the Edison demo walk, stage-board photos (Thandi), iPhone camera (stretch) | |

## The AI: what we learned (2026-10-03)

Measured on the AI test set, 16 cases × 3 runs, graded in the simulator with wiring checks:

| Setting | Runs passed | Notes |
|---|---|---|
| `deepseek-flash`, thinking **off** (the app before #4) | **11/48** | Cases 1, 13, 14 pass 3/3; 8 passes 2/3; the rest fail. |
| Same, plus an exact TL072 pin map in the prompt (#203) | 11/48 | No gain, so it wasn't shipped. Prompt wording isn't the lever. |
| `deepseek-flash`, thinking **on** (#205; the app's default since #4) | **24/48** | Median 36.6 s per build (8–195 s), about 0.6¢ a build. Cases 02 and 03 went from 0/3 to 3/3. Cases 06 and 16 returned nothing (reasoning used the whole `max_tokens`); 11 built a DC input instead of a sine; 12 ran the LED at 4.9 mA (floor 5). Per case in `docs/AI-TEST-SET.md`. |

Why builds failed, by impact:
1. **Thinking was off** (now on by default, #4; turning it on doubled the pass rate). The model is fast and cheap but didn't reason. Its mistakes were reasoning mistakes: op-amp inputs swapped, the meter on the wrong row of the TL072, wrong gain resistors.
2. **The repair loop was our bug** (fixed in #6). When the checker finds a problem, the model is told to rebuild the whole circuit from scratch. The first repair fixed 11 of 31 builds; the second fixed 2 of 13, and some repairs added problems. The 12-round cap cut second rebuilds off after the parts and before the wires.
3. **Hole bookkeeping.** Every connection is a hole address, and a hole takes one lead. The leftover problems were mostly hole-level: wrong row (14 runs), two leads in one hole (6), supply unwired (5). `docs/TODO.md` task 6 removes this if it still matters after reasoning.
4. **Our checker's false positives** on BANK-07 and BANK-15 (fixed in #3).
5. **Our own TL072 guide** taught "offset = DC input", so a sine was built as DC (task 2).
6. **Reasoning can run out of tokens** before it builds anything (cases 06 and 16, at 16 000; the default is 32 000 since #4).

Cost: `deepseek-flash` with thinking is about 0.6¢ a build. `deepseek-v4-pro` is about 3–4× the token price. DeepSeek's balance was $5.72 after all of the day's testing; Aarmen planned to add about $20.

### Running the AI test set
From `Plugged/`, with `DEEPSEEK_API_KEY` in the environment or in `backend/.env`:
- `npm run ai-eval -- --only bank` runs the 16 cases × 3 (48 calls), with reasoning on (the default since #4).
- `DEEPSEEK_THINKING=0 npm run ai-eval -- --only bank` runs with reasoning off.
- Add `DEEPSEEK_MODEL=deepseek-v4-pro` for the Pro model.
- `--json <file>` saves every reply and grade; each line shows seconds per build.
- `npm run ai-eval -- --only demo` is the demo check (must be 3/3 before shipping a prompt change).

## Setting up a new laptop

1. Clone `github.com/jessi-sidhu/EDISON`. Use the personal GitHub account `aarmens702-hub`, not the work one.
2. `cd Plugged && npm ci && npx playwright install chromium`.
3. Create `Plugged/backend/.env` from `.env.example` and fill in the keys by hand: `DEEPSEEK_API_KEY` (the app's AI) and `GEMINI_API_KEY` (photo reading). Never commit it, and copy the keys over privately (not through the repo or chat). Agents are blocked from touching `.env` files.
4. Run the app: `cd Plugged/backend && node server.js`, then open http://localhost:5001 (Edison is at `/circuit3d/index.html?ui=edison`). `AI_PROVIDER=fixture node server.js` runs with no AI cost.
5. Checks: `npm run check` (lint), `npm test` (unit, about 2900), `npm run e2e` (browser, about 340; about 20 min on a laptop).
6. Claude Code: the project's skills, agents and hooks come with the repo (`.claude/`). Work happens in worktrees at `.worktrees/<issue#>`; those are local only, so push before switching machines.

## How Aarmen likes to work

- **Aarmen decides** code, architecture, the plan and the circuit physics. Thandi (he/him) checks circuits against real parts, as advice.
- **Status and timing:** give honest status and timing, and say what's running. When the checks pass, push; don't re-run them for no reason.
- **Visual work:** screenshot the key frames and get his yes before building the rest. He thinks in reference images.
- **One heavy lane:** one browser-test run at a time on a laptop. A second lane is fine only for unit tests or docs.
- **UI scope:** laptop and demo size only, no phone or responsive work. Prefer direct manipulation (drag, probe, hover) over buttons. Keep UI tests light (2–4 browser tests per issue).
- **Tests for logic:** use complex circuits (mixed parts, branches, several sources) with hand-computed answers, in Vitest. Keep 2–4 browser tests per issue, and never mock the thing under test.
- **Small CSS or HUD fixes:** lint, unit and the touched specs once, plus one review. Run the full browser suite for logic, simulator or demo-path changes and for `/promote`.
- **The bench, as in his lab:**
  - one bench supply: CH1 + to the red rail, CH1 − (black) to the blue rail, CH2's white wire grounded, one wire per post;
  - one function generator;
  - at most 2 multimeters, never stacked;
  - an op-amp's input from the generator, a wire off the + rail, or a pot.
- **AI provider:** DeepSeek for now (steady while Gemini returned 503s). Gemini is a maybe near the end. If switching, pin the model and keep DeepSeek as the fallback.

## Known flaky browser tests

These fail under full-suite load and pass alone, so rerun them alone before calling a run red:
- `equations.spec.js:54`
- `mistake-checker.spec.js:112`
- `inspector.spec.js:251`
- `button.spec.js:43`
- `capacitor.spec.js:265`
- `multimeter.spec.js:103`
- `thevenin.spec.js:225`
- `voltage-colouring.spec.js:130`
- `edison-landing.spec.js:705`
- `ai-timeout.spec.js:9`
