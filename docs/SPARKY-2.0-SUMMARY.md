# Sparky 2.0: where we are and what's next

*Written 2026-09-27 for the Edison team (Aarmen, Guneev, Manav, Armaan). The event is Oct 3–4 at SFU Burnaby: 24 hours, with the theme revealed at the opening ceremony. Judging covers Technical Complexity, Design, Pitch and Originality, through a 3-minute live pitch plus 1 minute of Q&A.*

## 1. What we have today: Plugged
`Plugged/` is a working app that runs locally:
- **3D breadboard editor** (browser, Three.js). Place resistors, LEDs, a 9 V battery, buzzers and push buttons, wire them, and save or open circuits.
- **A real circuit simulator.** It uses nodal analysis, the same method SPICE uses. It gets parallel branches, voltage dividers and batteries in series right, and it catches shorts, open circuits and backwards LEDs.
- **An AI tutor that builds circuits.** Ask "build an LED circuit" and it proposes the parts as a see-through preview; nothing changes until you press Accept. One Ctrl+Z undoes the whole build. It runs on DeepSeek through our backend, so the key never reaches the browser.
- **Accounts and sharing.** Google sign-in, a dashboard of your circuits, and a shared "Sparks" gallery, on our Firebase project `plugged-hackathon`.
- **Tests:** 53 unit tests, 4 browser tests that walk the demo path, and lint, all running in CI.

To run it: `cd Plugged/backend && node server.js`, then open http://localhost:5001. You need `Plugged/backend/.env` with an AI key; ask Aarmen, and never commit it.

*Credit: Plugged builds on "Sparky" by Enes Yilmaz and Colin Lee, used with their permission. We credit them in the presentation.*

## 2. How we work
- **Equal say.** Any shared change (API contract, architecture, dependencies, config) needs the person proposing it plus **one other teammate** agreeing.
- **Roles:**
  - **Aarmen:** architecture, fixing the bugs QA files, and testing features as they land.
  - **Guneev:** QA/QC. Runs real-use tests (AI prompts, whether the logic is right) from `docs/QA.md` with `/qa-pass`, and decides when `dev` is ready to promote to `main`. Writes very little code.
  - **Manav and Armaan:** fast feature sprints from GitHub issues.
- **Branches: feature → `dev` → `main`.**
  - Feature PRs go into `dev` and merge as soon as their checks pass.
  - Guneev's QA pass promotes `dev` to `main`, with one other approval.
  - `main` is always demo-ready.
- **Claude Code does most of the coding.** `/start-task <issue>` is an orchestrator that runs specialist agents:
  - **scout:** reads the issue and code and plans the change.
  - **test-writer:** writes failing tests first.
  - **builder:** writes the code until the tests pass.
  - **reviewer:** fresh eyes on the diff.

  Then `/ship` opens the PR. Small cosmetic tasks skip the scout and test-writer.
- **The rules and guides:** team rules are in `AGENTS.md`, and the code rules are in `Plugged/AGENTS.md`.

## 3. What the research found (4 parallel explorations)
1. **ENSC 220 is running right now** (Fall 2026, taught by Zhida Li, Tue/Thu). We can talk to and test with real students **this week**.
2. **Only Lab 1 fits our simulator today.**
   - Lab 1, KCL/KVL with resistors and a multimeter: fits now.
   - Labs 2–5 need op-amps (TL072), capacitors and inductors, time-based simulation (RC/RLC step response), frequency sweeps and a virtual oscilloscope.
   - So "more components" should mean *the parts these labs use*.
3. **The AI can't see the simulator's results yet.** It gets the board layout but not the calculated voltages. Fixing this takes about half a day, and every idea below depends on it. It's also our edge over "photograph it into ChatGPT": **the model proposes, the simulator proves.** The research names that as the winning pattern.
4. **What judges reward** (from about 1,300 winning projects in 2026):
   - one named user and one hard number
   - an agent that takes real, checkable actions
   - verification the judges can see
   - getting beyond a text box (voice, vision)
   - a live demo in the first 30 seconds

   They dismiss generic tutors and chat-with-X apps. A photo-to-circuit project similar to ours won Best AI Hack at a Canadian event, so judges like this shape, but we need our own edge.
5. **Academic integrity.** A tool that solves graded pre-labs or quizzes would never be adopted by instructors. So: **check, don't answer.** The student enters their own answer and gets a ladder of hints, never the final number. Debugging a physical board stays unrestricted.
6. **Prizes aren't announced yet.** The Devpost shows no tracks or sponsor prizes so far. Possible targets:
   - MLH ElevenLabs (voice) and MLH Gemini (vision), if MLH runs them here
   - Best Design
   - Most Likely to Become a Startup
   - IEEE SFU

## 4. Scope map
| Idea | Why it matters | Effort | Risk | Proposed timing |
|---|---|---|---|---|
| AI sees simulator results, and can set part values | Foundation for everything | ~0.5 day | Low | Build week, first |
| **"Check my board":** enter multimeter readings, and it finds the first point where they differ from the simulation | Our real differentiator; it's how a TA debugs | ~1 day | Low | Build week |
| **Photo → circuit.** The first version gets the parts and which ones connect; you correct it in the preview, then the simulator checks it. | The judges' #1 wow | ~2 days | High on an unseen live board: rehearse with known boards, measure accuracy on 20–30 photos | Build week |
| **Voice (ElevenLabs).** Talk to Sparky and it talks back; voice commands actually act, for when your hands are busy at the bench | Cheap, gets beyond the text box, possible prize | 1–1.5 days | Low. Just reading replies aloud would look like a wrapper, so it has to act. | Build week |
| **Guided ENSC 220 Lab 1** with check-don't-answer hints | Local framing, avoids the integrity problem | 1–2 days plus content | Low | Build week |
| Capacitor + time-based simulation + virtual oscilloscope (RC step response) | Biggest technical complexity, and the most visual proof a fix worked | 4–5 days | Medium | **Undecided:** stretch goal or sprint |
| Potentiometer, switch, diode, multimeter probe | Parts the labs use | ~0.5 day each, +1 day to support 3-pin parts | Low | Sprint, as needed |
| Op-amp (Lab 2) | Opens up Labs 2–5 | 1–2 days | Medium | Sprint or later |
| Quizzes and coursework | Pulls toward a generic tutor; needs content and integrity safeguards | 2+ days | Integrity | After the project |
| AC/Bode plots, RLC, AM radio, transistors, multiple breadboards, class integration | The long-term vision | Large | | After the project |

**Candidate demo story (not decided):** hold up a real, broken ENSC 220 breadboard and snap a photo. Plugged rebuilds it in 3D, the simulator shows what *should* happen, and "check my board" finds the part in the wrong row. Ask by voice "why doesn't it work?", accept the fix, and watch the simulation agree. Then move the real wire. Close with where this goes: a pilot with ENSC 220 TAs.

## 5. Decisions we need to make together
1. **The headline.** Photo in, diagnosis out (recommended: it combines the judges' #1 wow with our real differentiator), or lead with the lab debugger, or lead with the oscilloscope and time-based simulation.
2. **Oscilloscope and time-based simulation in build week?** It's the most impressive item and the most expensive: 4–5 days.
3. **Vision model:** DeepSeek (already set up, but we don't know yet whether it can read images and call tools in the same request) or Gemini (stronger vision, a possible prize, already supported in the backend).
4. **The named user and the hard number.** Who talks to 5–10 ENSC 220 students this week, and what do we measure? Candidates: photo-to-circuit accuracy on 20–30 real boards; time to find a fault versus waiting for a TA.

## 6. Next steps
1. Everyone reads this, then we settle the 4 decisions above.
2. Fill in `docs/PRD.md` (user, pitch, demo story) and `docs/ARCHITECTURE.md` / `docs/API-CONTRACT.md` from those decisions.
3. Cut the build-week work into GitHub issues (`/new-task`), and each person starts with `/start-task`.
4. Guneev turns the demo story into `docs/QA.md` cases.
5. Deploy a live URL before the event, and record a backup demo video.
