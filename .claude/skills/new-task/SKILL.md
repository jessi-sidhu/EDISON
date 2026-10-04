---
name: new-task
description: Turn a rough description into one or more well-formed GitHub issues that a teammate's agent can finish without asking questions. Use when anyone wants to create, split or re-scope tasks, or to file a bug.
argument-hint: "[what needs doing]"
---

# Write a task issue

A good issue lets a less-experienced teammate's agent finish the work alone. The teammate should never need to understand the whole system.

1. **Ground it.** Read the relevant parts of `docs/PRD.md`, `docs/ARCHITECTURE.md` and `docs/API-CONTRACT.md`, and look at the actual files involved.
2. **Size it.** One issue is about 1 to 2 hours of work, one owner, about 300 changed lines or fewer, and touches one module. Split anything bigger into separate issues and note their order.
3. **Check the contract.** If the task needs an interface that isn't in `docs/API-CONTRACT.md`, stop and propose the contract addition on an issue first; it needs one other teammate to agree. Tasks build against contracts, never invent them.
4. **Fill in the template** from `.github/ISSUE_TEMPLATE/task.md`:
   - **Files** are exact paths inside the assignee's owned folder.
   - **Steps** are concrete and name the functions, components and contract interfaces to use.
   - **Done when** lists runnable checks and what's visible in the browser at which URL.
   - **Out of scope** names the tempting extras.
5. **Show the draft** to the user. On approval, run `gh issue create --title "..." --body-file <tmp> --label task` (use `--label bug` instead for a defect found in testing, and add `demo-critical` if it's on the demo path). Assign it only if the user names someone.
6. Report the issue URL(s).
