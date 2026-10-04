# To do

The work queue, in order, with everything needed to pick a task up cold on any machine. `docs/STATUS.md` has the overview; this file has the detail. When a task is done, delete its section here and note the result in STATUS.md (and the numbers in `docs/AI-TEST-SET.md` for AI work).

Every AI task is measured on the AI test set (`docs/AI-TEST-SET.md`, 16 cases × 3 runs), not judged by eye:
- `npm run ai-eval -- --only bank --json <file>` runs it, from `Plugged/`.
- Add `DEEPSEEK_THINKING=1 DEEPSEEK_TIMEOUT_MS=300000` for reasoning, and `DEEPSEEK_MODEL=deepseek-v4-pro` for the Pro model.
- It costs well under a dollar a run.

Where the test set stands: **11/48 with reasoning off, 24/48 with reasoning on** (deepseek-flash, median 36.6 s per build).

---

## 1. Reasoning on by default, with the right model and limits

**Why.** Reasoning took the test set from 11/48 to 24/48, about 0.6¢ a build. The app still runs with it off, and two limits would break it if it were turned on as is:
- **Time:** builds take 8–195 s (median 37 s). The server gives up at 60 s (`DEEPSEEK_TIMEOUT_MS`) and the page at 75 s (`ASK_TIMEOUT_MS` in `Plugged/circuit3d/js/chat.js`).
- **Tokens:** cases 06 and 16 returned no build at all in all 6 runs, about 70–77 s each, with reply "(no response)" and 0 actions. That's most likely reasoning using the whole `max_tokens` (16000) before any tool call. The server now logs `[ask] DeepSeek stopped at max_tokens` when this happens.

**Steps.**
1. Run the test set with reasoning on and `DEEPSEEK_MAX_TOKENS=32000` (or `DEEPSEEK_REASONING_EFFORT` lower). Check that 06 and 16 now build. Record the results.
2. Run it on `deepseek-v4-pro` with reasoning on (about 3–4× flash's token price). Compare pass rate, median and worst seconds per build, and cents per build. **Aarmen picks the model.**
3. Make reasoning the default for builds in `Plugged/backend/ai-providers.js`. Explain mode stays off, and `DEEPSEEK_THINKING=0` stays as the off switch.
4. Set the server deadline and the page timeout above the slowest build seen, with the page's longer than the server's so the server's own message shows. Write the decision in `docs/ARCHITECTURE.md` under Key decisions.
5. Check that the chat's "Edison is thinking" indicator holds up through a 60 s wait.

**Done when.**
- Unit tests: the default request has thinking on; `DEEPSEEK_THINKING=0` turns it off; the page timeout is longer than the server's.
- `npm run ai-eval -- --only demo` passes 3/3, with the demo build's time noted.
- The full `npm run ai-eval` is compared with its last run.
- In a browser: "Build a single LED circuit with a current-limiting resistor" → preview → Accept → lit.

## 2. TL072 guide: a sine input sets the generator's amplitude (GitHub #210)

**Why.** Case 11 (ENSC 220 Lab 2, "a 0.5 V sine") failed all 3 runs only at the trough. The amplifier was right every time (−4.98 V, the meter agreeing), but FG1 was set to amplitude 0, offset 0.5: a steady 0.5 V. Our own TL072 guide and recipes teach "offset = DC input" with amplitude 0, and the model copies that even when a sine is asked for.

**Steps.**
1. In `Plugged/circuit3d/js/parts/tl072.js`, make `ai.guide` (at most 400 characters) say:
   - a sine input sets FG1's `amplitude` (peak volts) and `frequency`, with offset 0;
   - only a DC input uses `offset` with amplitude 0.
2. Keep one recipe with a sine input (the inverting amp, amplitude 0.5), so the model sees both forms.
3. This changes prompt text, so follow AGENTS.md's Gotchas: check the golden files' diff, then `UPDATE_GOLDEN=1 npm test`, then `npm run ai-eval -- --only demo` (3/3) and the full `npm run ai-eval`.

**Done when.**
- The guide fits 400 characters and names amplitude for a sine.
- The recipes still simulate to their expected outputs.
- With reasoning on, case 11 passes.

## 3. The repair loop: keep the best build, never send a half-finished one

**Why.** When the server's checker finds a problem in a build, `askDeepSeek`'s loop (`Plugged/backend/ai-providers.js`) tells the model to rebuild the whole circuit from scratch (`REPAIR_HEADING`). On the reasoning-off run:
- **Repairs barely help.** 31 first builds had a problem. The first repair cleaned 11; the second cleaned 2 of 13, and some repairs raised the problem count (1→2, 7→8).
- **Cut-off rebuilds get sent.** All 5 "parts placed, no wires" runs were a second rebuild cut off by the 12-round cap (`DEEPSEEK_MAX_ROUNDS`). Those runs log `[repair] round 2` with no `after round 2`, and `fromLastDeleteAll` then keeps only the unfinished rebuild.

**Steps.**
1. Each time the model ends its turn, keep that build and its problem count. When the loop ends (the model is done, repairs are used up, or the round cap hits), return the build with the fewest problems; a tie goes to the later one.
2. Never return a rebuild the round cap cut off. If the rounds run out after a repair's `delete_all`, return the best earlier build.
3. Ask for repairs as fixes, not rebuilds: list the build's wires with ids, as the board markdown's Wires table does, and ask for `delete_wire`, `add_wire` and `set_value` steps. Keep the rebuild wording only when the problems say the build is unusable (for example, nothing wired to a supply).
4. Log which build was kept: `[repair] kept round N: K problems`.

**Done when.**
- Unit tests with a scripted model:
  - a repair that makes things worse gets the first build back;
  - a rebuild cut off at the cap is never returned;
  - a repair that fixes everything is returned.
- Live: the test set beats its last run with no "parts, no wires" runs, and the demo check passes 3/3.

## 5. The op-amp repair checks (built; branch `aarmen/204-opamp-repair-checks`)

**What it is.** Four extra checks in the repair loop, built and unit-tested (2912 unit tests pass), on its own pushed branch:
1. An op-amp output wired straight to its own + input.
2. A wire into a half of the chip that isn't used.
3. A meter probe on nothing useful (for example, the unused half's input).
4. An op-amp clipped although it has negative feedback.

Each check names the part, the pins and the holes. It catches the exact mistake seen live: the divider into IN1−, OUT1 tied to IN1+, and the meter's black probe on IN2+. It's silent on every TL072 recipe and every clean build in the test set.

**Why it's waiting.** With today's repair loop, every extra problem triggers a full rebuild, which often makes the build worse. Do task 3 first.

**Steps.** After task 3: rebase the branch onto dev, run the test set and compare, then `/ship`.

## 6. Wire on-board parts by pin name (only if still needed)

**Why.** With reasoning off, the leftover problems were mostly about holes:
- a part on the wrong row (14 runs);
- two leads in one hole (6 runs);
- meter probes on the wrong row of the TL072 (cases 3, 10, 11).

Reasoning fixed cases 2 and 3, so **do this only if hole-level mistakes remain after tasks 1–4.**

**Steps.**
1. Let the AI write a wire end as `U1.in1p`, `R1.1` or `D1.cathode`. The server, in `finishAIReply` and in the tool loop's queued actions, rewrites it to the first free hole in that pin's column half (rows a–e or f–j), skipping holes a part or wire already holds. The page and the preview still see plain holes.
2. Tell the model it may use these names, and drop the prompt rule "never use R1.0 as a wire end". This changes the golden prompts; follow AGENTS.md's Gotchas.

**Done when.**
- `U1.in1p` on a TL072 at f30 becomes a free hole in column 32, rows f–j.
- Two wires to the same pin get different holes.
- A pin name the part doesn't have is refused.
- The test set beats its last run.

## 7. Aarmen's call: the LED current floor in case 12

Case 12 (an LED with a push button and a 1N4001 on the 5 V bench supply) builds a working circuit every time with reasoning on. But the LED runs at **4.9 mA**, and the pass rule is 5–20 mA, so all 3 runs fail on that alone. Either keep the rule (the model should pick a smaller resistor) or lower the floor to 4.5 mA. The rule is in `Plugged/scripts/ai-eval-cases.js` (BANK-12) and in `docs/AI-TEST-SET.md`.

## 8. Walk the demo on main

PR #211 promoted dev to main on lint and unit tests, plus the earlier full browser run of the bug fixes. The browser demo walk was skipped for time. Run `/demo-check` on main before showing it, and after each later `/promote`. `STATUS.md`'s "On dev since main" note is gone: as of PR #211, main and dev match.

## 9. Voice: ElevenLabs V1–V3

- **What:** server routes for speech-to-text and text-to-speech, hold-to-talk in the chat, and a spoken demo answer.
- **Needs:** `ELEVENLABS_API_KEY` in the backend env file (a person adds it).
- **Not started.**

## 10. Older open items

- **Photo answer wording:** after a photo build, Edison's answer says "The Simulation section lists…", internal wording leaking to the student.
- **The Edison demo walk:** the rows in `docs/QA.md` and the default-UI decision.
- **Stage-board photos:** a rehearsed real board for the photo demo. Needs Thandi's photos of the stage board.
- **Stretch:** an iPhone as Edison's camera (Continuity Camera).
