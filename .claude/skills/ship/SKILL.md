---
name: ship
description: Finish the current task - run checks, review, commit, rebase onto the latest dev and push straight to dev, then close the issue. Use when the user says ship it, push this, or is done with a task.
---

# Ship the current task

`dev` is the shared workspace: shipping means pushing to it once the checks pass. No PR, no waiting on anyone. Only `/promote` touches `main`.

1. **Branch check.**
   - On a local task branch (`<first name>/<issue#>-<slug>`): take the issue number from its name.
   - On `dev` itself: fine, but ask which issue this closes, if any.
   - On `main`: stop. Move the work onto `dev` first.
2. **Check.** This is the gate. From `Plugged/`:
   - Run `npm run check` (lint) and `npm test`.
   - Also run the **full** `npm run e2e` if any file under `circuit3d/`, `*.html`, `firebase-config.js` or `e2e/` changed. Never swap it for a subset of specs, even if the builder ran some or CI is fast: features clash through shared UI, and only the full suite sees it.
   - Fix any failures this change caused. Never push red.
   - **AI prompt changed?** If `Plugged/test/fixtures/prompts/` changed (the golden prompt files), this change alters what the AI is sent. Before pushing, run the real-AI demo check: start the app with the real key and send "Build a single LED circuit with a current-limiting resistor." 3 times. Each must Accept cleanly and light the LED. Report the results. Never update the golden files just to make the test pass.
3. **Review.**
   - If `/start-task`'s reviewer already said SHIP IT for this exact diff, skip this step.
   - Otherwise, run the **reviewer** subagent with the issue text.
   - On FIX, fix the listed items, run the checks again, and run the reviewer once more. If it still says FIX, stop and show the user.
   - Remove debug logs, commented-out code and anything out of scope.
4. **Circuit physics.** If the diff changes a part's model or rating, a simulator rule, a mistake rule, a lab circuit or an expected value in `docs/QA.md`, ask the user whether Thandi has checked it. If not, stop until he has.
5. **Commit.** Stage only this task's files, never `.env*`. Use a short imperative message, ending with `Closes #<n>` when there's an issue.
6. **Rebase and push to `dev`.**
   - Run `git fetch origin dev && git rebase origin/dev`.
   - On conflicts, keep both sides' intent, show the user what you chose, and re-run step 2's checks.
   - If a conflict touches someone else's module or is unclear, stop and ask.
   - Then push: `git push origin HEAD:dev`. Never force-push.
   - If the push is rejected because `dev` moved, fetch, rebase and check again, then retry once.
7. **Tidy up.**
   - On a task branch in the main checkout: run `git switch dev && git pull && git branch -d <task branch>`.
   - On a task branch in a worktree (`.worktrees/<n>`): from the main checkout, run `git worktree remove .worktrees/<n>`, then `git branch -d <task branch>`. Never leave a finished worktree behind.
   - If the commit message didn't close the issue, run `gh issue close <n> --comment "Shipped to dev in <sha>"`.
8. **Report.** Give the commit on `dev`, and remind the user that CI runs on it now (`gh run list --branch dev --limit 1`). It reaches `main` at the next `/promote`.
