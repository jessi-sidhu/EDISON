---
name: ship
description: Finish the current task - sync with dev, run checks, self-review, commit, push, open a PR into dev that closes the issue, and merge if allowed. Use when the user says ship it, open a PR, push this, or is done with a task.
---

# Ship the current task

Feature work always ships into `dev`. Only Guneev's promotion PR goes `dev → main`, and `/qa-pass` handles that.

1. **Branch check.** If you're on `main` or `dev`, stop and create the branch first (`<first name>/<issue#>-<slug>`). Take the issue number from the branch name, and ask if there isn't one.
2. **Sync.**
   - Run `git fetch origin dev`, then `git rebase origin/dev`.
   - On conflicts, keep both sides' intent, show the user what you chose, then run `git rebase --continue`.
   - If a conflict touches someone else's module or is unclear, stop and ask.
3. **Check.** This is the automatic gate that replaces waiting for a reviewer. From `Plugged/`:
   - Run `npm run check` (lint) and `npm test`.
   - Also run `npm run e2e` if any file under `circuit3d/`, `*.html`, `firebase-config.js` or `e2e/` changed.
   - Fix any failures this branch caused. If `dev` was already failing, say so and continue.
4. **Review.**
   - If `/start-task`'s reviewer already said SHIP IT for this exact diff, skip this step.
   - Otherwise, run the **reviewer** subagent with the issue text and branch name.
   - On FIX, fix the listed items, run the checks again, and run the reviewer once more. If it still says FIX, stop and show the user.
   - Remove debug logs, commented-out code and anything out of scope.
5. **Commit.** Stage only this task's files, never `.env*`. Use a short imperative message.
6. **Push.** `git push -u origin HEAD`. Never force-push.
7. **PR.** Run `gh pr create --base dev --title "<issue title>"`, with the body from `.github/pull_request_template.md` filled in, including `Closes #<n>`.
8. **Merge decision.**
   - **The diff touches a shared file** (the CODEOWNERS list: docs/, config, lockfiles, .claude/, .github/, schema, root layout). Say that one other teammate must approve, suggest the user ping one on the PR, and stop.
   - **Otherwise:** once CI passes (`gh pr checks --watch`), ask the user "merge into dev now?". On a yes, run `gh pr merge --squash --delete-branch`, then `git switch dev && git pull`.
9. Report the PR URL. Mention that the change reaches `main` only after Guneev's next clean `/qa-pass`.
