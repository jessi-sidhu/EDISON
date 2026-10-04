# Manav: start here

*Written 2026-09-28 by Aarmen. Open Claude Code in the repo and say: **"Read docs/MANAV.md and walk me through it."***

---

## For Claude: how to walk Manav through this
- **Go one section at a time.** After each, ask if he's ready before moving on. Keep explanations short and concrete.
- **Setup (section 3):** run each check command yourself and show him the result. Don't move on until it passes.
- **Never ask for, read, print or write the API key or any `.env` file.** The hooks block it anyway. Manav types the key into `Plugged/backend/.env` himself.
- **Don't start a task during the walkthrough.** At the end, ask which issue he wants to start, then run `/start-task <n>`.
- **If something here disagrees with the code or `AGENTS.md`, say so.** Don't guess.

---

## 1. What we're building
**Plugged (Sparky 2.0)** is a 3D virtual breadboard in the browser:
- a **real circuit simulator** (nodal analysis, like SPICE)
- an **AI tutor** that builds circuits for you as a preview you accept or undo

We're taking it to **Edison: Oct 3–4, SFU Burnaby, 24 hours.** The theme is revealed at the opening ceremony. Judging is Technical Complexity, Design, Pitch and Originality, via a 3-minute pitch.

**Our angle:** a lab partner for **ENSC 220** (Electric Circuits I). It covers the parts, measurements and "why doesn't my circuit work" help students need.

**This week's big job is the parts registry:** every part (resistor, LED, pot…) lives in **one file**, `Plugged/circuit3d/js/parts/<type>.js`. Adding a part should mean writing that one file and nothing else. Read the contract in `docs/API-CONTRACT.md` → "Part file contract" before your first task.

## 2. Your role
- **Fast sprints from GitHub issues.** Claude Code does most of the coding through our harness (section 5). You steer, test in the browser, and ship.
- **This week:**
  1. finish **Phase 1** (the rest of the registry foundation)
  2. then build **Phase 2** parts, copying patterns Aarmen sets
- **The others:**
  - **Aarmen:** architecture, the hard "first of their kind" parts, bug fixes.
  - **Guneev:** QA with `/qa-pass`.
  - **Armaan:** may take some Phase 2 parts and the front-end redesign.

## 3. One-time setup (about 20 minutes)
1. **GitHub access.** Send Aarmen your GitHub username and accept the invite to `aarmens702-hub/myproject`, which is private.
2. **Clone it.** Pick a folder outside your Desktop:
   ```bash
   git clone https://github.com/aarmens702-hub/myproject.git ~/code/myproject
   cd ~/code/myproject
   git switch dev
   ```
3. **Node 20+** (`node -v`). Then:
   ```bash
   cd Plugged && npm install && npx playwright install chromium && cd ..
   ```
4. **The AI key.** Aarmen sends you the DeepSeek key **privately**. Create `Plugged/backend/.env` yourself, in your editor, not through Claude. Use `.env.example` in the repo root for the variable names:
   ```
   AI_PROVIDER=deepseek
   DEEPSEEK_API_KEY=<the key>
   ```
   **Never commit it, paste it into chat, or put it anywhere else.** Each AI prompt costs a fraction of a cent.
5. **Run it:**
   ```bash
   cd Plugged/backend && node server.js
   ```
   Open http://localhost:5001, click **Try it out**, and ask Sparky "Build a single LED circuit with a current-limiting resistor". Press **Accept**, then **Run Simulation**, and the LED should light.
6. **Check the tests pass:**
   ```bash
   cd Plugged && npm test && npm run check && npm run e2e
   ```
7. **Always start Claude Code from the repo root:** `cd ~/code/myproject && claude`. Our agents, commands and safety hooks only load from there. A session opened anywhere else is missing all of them.

## 4. How we work (the rules)
- **`dev` is the shared workspace, and `main` is what we'd demo.**
  - Anyone pushes to `dev` through `/ship`.
  - Only `/promote` moves `dev` to `main`.
  - **Never push to `main` directly.**
- **One task per checkout.** To run a second task at the same time, it goes in a worktree **inside the repo**: `.worktrees/<issue#>`. Never next to the repo or on the Desktop. Just tell the second session: *"Another task is running in the main checkout, so work in a worktree at `.worktrees/<n>` per CLAUDE.md."*
- **Equal say.** Shared changes (the contract, config, dependencies, `docs/`) need **one other teammate's OK**. `/ship` will ask.
- **A GitHub issue is an approved design.** Don't redesign it. If it's wrong or unclear, the agents stop and say so; check with Aarmen or comment on the issue.
- **Test in the browser before shipping** anything labelled `demo-critical`.
- **After any change to `backend/server.js`, restart the server,** or you're testing old code.

## 5. The commands
| Command | What it does | When |
|---|---|---|
| `/start-task <n>` | Claims issue n, branches off `dev`, then runs the specialists: **scout** (plans) → **test-writer** (failing tests first) → **builder** (code until the tests pass) → **reviewer** (fresh-eyes review). Small text/style tasks skip the scout and test-writer. | Every task |
| `/ship` | Lint + unit tests + browser tests → commit → rebase onto `dev` → push → close the issue → delete the branch or worktree | When `/start-task` says it's ready and you've checked it in the browser |
| `/promote` | CI green + a quick walk of the demo in a browser → merges `dev` into `main` | End of the day, or after a big milestone |
| `/qa-pass` | The full `docs/QA.md` run in a real browser (about 40 minutes). Files failures as `bug` issues. | Checkpoints (Guneev usually) |
| `/new-task` | Turns a rough idea into a proper GitHub issue | When you find work that isn't an issue yet |
| `/demo-check` | Walks the demo on `main` | Before presenting |
| `/adapt-to-tracks` | Re-plans when the theme and tracks drop at the event | At kickoff |

**What enforces the rules, so you don't have to remember them:**
- The test-writer can only edit `test/` and `e2e/`, and the builder can't touch tests.
- `.env` files are blocked for every agent.
- Claude can't finish while unit tests fail.

**The loop for every task:**
```
/start-task 24  →  (agents run; answer if they ask)  →  test it in the browser  →  /ship  →  next issue
```
**If an agent stops with a "Blocker":** read it and pick an option. If you're unsure, paste it to Aarmen. **Never tell it to skip or delete a failing test.**

## 6. Your queue
### Phase 1: rest of the foundation (milestone "Phase 1 — Foundation", label `owner: manav`)
Starts after Aarmen ships **#23** (the resistor in the registry).

| Order | Issue | What | Needs |
|---|---|---|---|
| 1 | **#24** | Pin names in saved files, the hole map, placement checks | #23 |
| 1 | **#25** | The LED moves over, plus one on/off loop for every switching part (in `.worktrees/25`, alongside #24) | #23 |
| 2 | **#29** | Value inspector + generated parts sidebar | #23 |
| 3 | **#26** | Battery, buzzer, button move over; old per-type code deleted | #24, #25 |
| 3 | **#28** | Parts with 3+ legs, chips across the centre gap | #24 |
| 4 | **#27** | AI tools generated from the registry. Afterwards: restart the server, test the AI by hand (one LED, "add a second LED in parallel", "put two LEDs in series", "make the resistor 1k"), then `/promote`. | #25, #26 |

### Phase 2: parts (milestone "Phase 2 — DC parts", label `owner: manav`)
All of these start once Phase 1 is closed. Each one copies a pattern that already exists, so read the file it names first.

| Order | Issue | Part | Priority | Also needs |
|---|---|---|---|---|
| 1 | **#33** | Diode | **core** | none |
| 1 | **#32** | Toggle switch | **core** | none |
| 2 | #36 | Bulb | stretch | none |
| 2 | #37 | DC motor | stretch | none |
| 2 | #38 | Ideal current source (small simulator addition) | stretch | none |
| 2 | #35 | Zener diode | stretch | #33 |
| 3 | #40 | Light sensor (LDR) | stretch | #31 (Aarmen's pot) |
| 3 | #41 | Thermistor | stretch | #31 |
| 3 | #39 | Slide switch | stretch | #31, #32 |
| 3 | #42 | RGB LED | stretch | #31 |

**Aarmen builds the "first of their kind" Phase 2 parts that yours copy:**
- **#31** potentiometer: the first 3-pin part with a slider
- **#34** bench supply
- **#43** 7-segment display

**Every part is done when all of these pass:**
- the automatic registry, round-trip, placement and browser checks
- its known-answer circuit
- a real-AI prompt
- a `docs/QA.md` case

Each issue lists them.

## 7. Cut for now (risk), so don't start these
- **#44 Dependent sources** and **#45 Relay:** closed as not planned. They need new simulator logic and contract changes, and aren't needed for the demo. They come back after the event.
- **Bench supply constant-current mode:** #34 only *warns* over the limit.
- Also not this week: capacitors, inductors, the oscilloscope, Bode plots, schematic view, a second breadboard.

## 8. Read these (in this order)
1. `AGENTS.md`: team rules
2. `Plugged/AGENTS.md`: how the code is organised, commands, gotchas
3. `docs/API-CONTRACT.md` → **Part file contract**: what every part file must contain, the building blocks, and the tests
4. `docs/superpowers/specs/2026-09-27-parts-registry-design.md`: why it's designed this way, and the build order
5. `docs/QA.md`: what "working" means for the demo

## 9. When something goes wrong
- **Tests fail after a rebase:** someone else's change collided with yours. Let `/ship` show the conflict, keep both sides' intent, and re-run the checks. If it touches someone else's module, ask them.
- **The browser shows old behaviour:** hard-refresh (Cmd+Shift+R). If you changed `server.js`, restart the server.
- **The AI builds something odd:** run it 2–3 times, since it varies. If it's consistently wrong, file it with `/new-task` as a `bug`, with the prompt and a screenshot.
- **A port is taken:** another server is running. Stop it, or set `PORT=5002` in your `.env`.
- **You're stuck for more than 20 minutes:** message Aarmen with the issue number and what the agent said.
