---
name: qa-pass
description: Full QA pass on dev like a real user - run every case in docs/QA.md (AI prompts, simulator numbers, core flows), the graded AI cases through npm run ai-eval and the rest in a real browser, report pass/fail and file failures as bug issues. For checkpoints (about daily, and before submitting), not every promotion. Use when the user says QA dev, run QA, or full test pass. For a quick check before moving dev to main, use /promote instead.
---

# QA pass on dev

This is black-box testing: use the app the way a person would, and judge it only against `docs/QA.md`. Don't read or edit the app's code, and don't fix anything you find. File it instead.

1. **Get dev running.**
   - Ask whether to test a deployed `dev` URL or run it locally.
   - For local, run `git switch dev && git pull` (stash nothing of anyone else's), then start the app with the setup in `docs/QA.md`, in the background. Wait until it responds.
   - If the AI key is missing, say so and skip the AI cases rather than failing them.
2. **Check `docs/QA.md`.** If it's empty or has no case for the demo path, stop and offer to draft cases from `docs/PRD.md`'s demo story.
3. **Sign-in first.**
   - Sign-in cases need a person: never type a password or Google account details.
   - Ask the user to sign in themselves in the browser now.
   - If they'd rather not, those cases get reported "skipped", not "passed".
4. **Run the cases.**
   - First run `npm run ai-eval` from `Plugged/`: it grades AI-01, 02, 06 and 08–23 (3 runs each), so those don't go to the browser. Report its results with the rest.
   - Run the remaining cases through the `qa-tester` subagent: the visual cases, the LG and CF cases, AI-03, AI-04, AI-05, AI-07, and one real-AI browser run of AI-01 (the demo). See the note in `docs/QA.md`.
   - Give it the app URL and those case IDs.
   - It can't edit files or run commands, so the pass is pure black-box testing.
   - Check its report: every case in `docs/QA.md` has a result, and every failure has evidence (an exact message or number, and a screenshot).
   - Re-run any case it missed, once.
5. **Report.**
   - A table of ID, result, and actual-when-failed.
   - Then the failures, ranked by how badly they'd hurt the demo.
   - Say plainly whether the AI cases were skipped.
6. **File the bugs.** Offer to turn each failure into a GitHub issue:
   - `gh issue create --label bug`, plus `--label demo-critical` when it's on the demo path.
   - Body: case ID, steps, the exact prompt or circuit, expected (from QA.md), actual, and the screenshot path.
   - Leave it unassigned so Aarmen or whoever is free picks it up. Show the drafts before creating anything.
7. **Verdict.** Say whether `dev` is demo-ready. If it is, suggest running `/promote`. If not, list the blocking case IDs.
8. Stop anything this skill started, such as the local server and any browser tabs it opened.
