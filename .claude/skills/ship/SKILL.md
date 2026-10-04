---
name: ship
description: Finish the current task - run checks, review, commit, rebase onto the latest dev and push straight to dev, then close the issue. Use when the user says ship it, push this, or is done with a task.
---

# Ship the current task

`dev` is the shared workspace: shipping means pushing to it once the checks pass. No PR, no waiting on anyone. Only `/promote` touches `main`.

1. **Branch check.**
   - On a local task branch (`<first name>/<issue#>-<slug>`): take the issue number from its name. It normally lives in its own worktree at `.worktrees/<n>`, made by `/start-task`, and this session is working there.
   - On `dev` itself: fine, but ask which issue this closes, if any.
   - On `main`: stop. Move the work onto `dev` first.
2. **Check.** This is the gate. From `Plugged/`:
   - Run `npm run check` (lint) and `npm test`.
   - Also run the **full** `npm run e2e` if any file under `circuit3d/`, `*.html`, `firebase-config.js` or `e2e/` changed. Never swap it for a subset of specs, even if the builder ran some: features clash through shared UI, and only the full suite sees it.
   - Fix any failures this change caused. Never push red.
   - **AI prompt changed?** If `Plugged/test/fixtures/prompts/` changed (the golden prompt files), this change alters what the AI is sent. Before pushing, run the real-AI demo check from `Plugged/`: `npm run ai-eval -- --only demo` (3 runs). Each must pass (3/3). When prompt text changed, also run the full `npm run ai-eval` and compare it with the last baseline. Report the results. Never update the golden files just to make the test pass.
3. **Review.**
   - If `/start-task`'s reviewer already said SHIP IT for this exact diff, skip this step.
   - Otherwise, run the **reviewer** subagent with the issue text.
   - On FIX, fix the listed items, run the checks again, and run the reviewer once more. If it still says FIX, stop and show the user.
   - Remove debug logs, commented-out code and anything out of scope.
4. **Commit.** Stage only this task's files, never `.env*`. Use a short imperative message, ending with `Closes #<n>` when there's an issue.
5. **Rebase and push to `dev`.**
   - Run `git fetch origin dev && git rebase origin/dev`.
   - On conflicts, keep both sides' intent, show the user what you chose, and re-run step 2's checks.
   - If a conflict touches someone else's module or is unclear, stop and ask.
   - Just before the push, re-read the issue: `gh issue view <n> --comments --json state,comments`. If it's already closed, or has a "Claimed by" or "Shipped to dev" comment from another session newer than ours, stop and show the user instead of pushing.
   - Then push: `git push origin HEAD:dev`. Never force-push.
   - If the push is rejected because `dev` moved, fetch, rebase, run step 2's checks and the issue re-check again, then retry once. Also run `git log origin/dev --oneline --grep "#<n>"`: if another session already shipped this issue, stop and show the user.
6. **Tidy up.**
   - On a task branch in a worktree (`.worktrees/<n>`, the normal case):
     - Find the main root first: `root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")`.
     - Leave the worktree: the ExitWorktree tool if the session entered it with EnterWorktree, otherwise `cd "$root"`.
     - Run `git -C "$root" worktree remove .worktrees/<n>`, then `git -C "$root" branch -d <task branch>`. Never leave a finished worktree behind.
     - Never switch branches in the main checkout. It stays on `dev`.
   - Worked directly on `dev` in the main checkout (the fallback): run `git pull`. There's no branch or worktree to remove.
   - Always run `gh issue close <n> --comment "Shipped to dev in <sha>"`. `Closes #<n>` only closes it when the commit reaches `main`, and other sessions' claim checks look for this comment.
7. **Report.** Give the commit on `dev`. CI is off (#165), so step 2's local checks were the gate. It reaches `main` at the next `/promote`.
