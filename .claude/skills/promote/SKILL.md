---
name: promote
description: Promote dev to main after a quick test - check CI is green on dev, walk the demo path in a real browser, then open a dev → main PR and merge it. Anyone can run it. Use when the user says promote, push to main, release, or "is dev good to go to main".
---

# Promote dev → main

`main` is what we'd demo. This takes a few minutes: it's a quick "does the demo still work", not a full QA pass. That's `/qa-pass`.

1. **Sync.** `git switch dev && git pull`. If there's nothing on `dev` that isn't on `main` (`git log --oneline main..dev` is empty), say so and stop.
2. **CI must be green.** Run `gh run list --branch dev --limit 1`. If the latest run on `dev`'s head commit isn't `success`, stop and show the failure (`gh run view <id> --log-failed`). Don't promote red.
3. **Checks locally.** From `Plugged/`, run `npm run check`, `npm test` and `npm run e2e`. Stop on any failure.
4. **Walk the demo path in a real browser** (Claude in Chrome or the Playwright MCP):
   - Start the app (`cd Plugged/backend && node server.js`) unless one is already running.
   - Follow `docs/PRD.md`'s demo story. Until it's written, use: open the editor, load the demo circuit via "Try it out", Run Simulation, press the button, and ask the AI "Build a single LED circuit with a current-limiting resistor." then Accept and simulate.
   - Note anything broken, any console errors, and anything that would look bad on stage.
   - This costs about a cent of DeepSeek credit.
5. **Decide.**
   - **Demo path works:**
     - Open `gh pr create --base main --head dev --title "Promote dev → main (<date>)" --body "<what's new since the last promotion, from git log main..dev; checks and demo walk results>"`.
     - Then merge it: `gh pr merge --merge`. This keeps `dev`'s commits as they are, and never deletes `dev`.
     - Then run `git switch dev`.
   - **Something broke:** don't promote. List what broke. Offer to file each as a `bug` issue (`--label bug`, plus `--label demo-critical` if it's on the demo path).
6. **Report.** Say what went to `main`, with the PR link, or why not. Stop any server this skill started.
