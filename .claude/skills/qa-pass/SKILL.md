---
name: qa-pass
description: QA the dev branch like a real user - run every case in docs/QA.md (AI prompts, simulator numbers, core flows) in a real browser, report pass/fail, file failures as bug issues, and open the dev → main promotion PR when it's clean. Use when Guneev (or anyone) says QA dev, run QA, test the build, is dev ready, or promote dev.
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
4. **Run the cases through the `qa-tester` subagent.**
   - Give it the app URL and the case IDs, all by default.
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
7. **Promotion verdict.**
   - **Every case passes** (skipped sign-in cases are fine if the user says so): offer to open the promotion PR with `gh pr create --base main --head dev --title "Promote dev → main (QA pass <date>)"`, with the results table as the body. It needs **one other teammate's approval**, so never merge it yourself.
   - **Anything fails:** say "not ready to promote", and list the blocking IDs.
8. Stop anything this skill started, such as the local server and any browser tabs it opened.
