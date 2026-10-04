---
name: start-task
description: Begin work on a GitHub issue as its orchestrator - claim it, branch off dev, size it, then run the specialist subagents (scout, test-writer, builder, reviewer) in order until it's ready for /ship. Use when the user says start/pick up/work on issue N, or asks what to work on next.
argument-hint: "[issue number] [full]"
---

# Start a task (orchestrator)

The issue is an approved design, so don't brainstorm or write a spec. You are the orchestrator: you don't write the code yourself. You run the specialists in `.claude/agents/`, pass each one the previous one's output, and keep the user posted with one line per step.

## 1. Set up
1. **Pick the issue.**
   - If no number was given, list open unassigned issues with `gh issue list --search "no:assignee" --state open --label task` and `... --label bug`, and let the user choose.
   - Suggest `bug` issues first when the user is Aarmen, and otherwise the lowest-numbered `task` on the demo path.
2. **Read it.** Run `gh issue view <n> --comments`. If Goal, Files or Done-when is missing, or contradicts the docs, stop: tell the user what's unclear and suggest they ask the team on the issue.
3. **Claim it.** `gh issue edit <n> --add-assignee @me`.
4. **Branch.**
   - Don't commit or stash anyone else's work.
   - Run `git switch dev && git pull`, then `git switch -c <first name>/<n>-<short-slug>`. Take the first name from `git config user.name`, in lowercase.
   - Branches always come off `dev`, and stay local: `/ship` pushes the finished work straight to `dev`.

## 2. Size it (say which path and why, in one line)
**Full path: scout → test-writer → builder → reviewer.** Use it if **any** of these is true:
- The issue is labelled `demo-critical`, or is on the PRD's demo path.
- It changes logic (simulator, chat actions, storage, server) or anything in `docs/API-CONTRACT.md`.
- It creates a file or module, or touches more than 2 files.
- It's a `bug` issue. The test-writer first reproduces it.

**Lean path: builder → reviewer.** Use it only if **all** of these are true:
- 2 files or fewer.
- Text, style or layout only.
- Not on the demo path.

If the user said `full`, or says it at any point, use the full path. Never go lean unless every lean rule holds.

## 3. Run the specialists
Call each with the Agent tool, one at a time, and give it everything it needs, since it starts with no context:
1. **scout** (full path only). Pass the issue text. If its map has Blockers, stop and show them to the user, and don't guess.
2. **test-writer** (full path only). Pass the issue text and the change map. Check that it reports every new test failing for the right reason. If it can't make them fail properly, stop and show why.
3. **builder**. Pass the issue text, plus the change map and test report on the full path.
   - It has 2 attempts to get the tests passing.
   - If it reports "Stuck" or a test it thinks is wrong, stop and show the user. They decide, or ask on the issue.
4. **reviewer**. Pass the issue text and the branch name.
   - **SHIP IT:** move on to the end.
   - **FIX:** send the fix list to the builder **once**, then run the reviewer **once** more. If it still says FIX, stop and show the user both lists.

Every subagent reply is a report: check it before passing anything on. Never fake a step. If an agent failed or was skipped, say so.

## 4. End
Tell the user what was built, which tests prove it, anything left for manual checking (e.g. sign-in), and that it's ready for `/ship`. Say that the reviewer already approved this diff, so `/ship` can skip its own review unless the code changes again.
