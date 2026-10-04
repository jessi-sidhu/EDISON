---
name: demo-check
description: Run the app and walk the demo story from docs/PRD.md in a real browser, reporting anything broken. Runs against main (the demo-ready branch) by default. Use before the demo, or when the user asks whether the demo still works. To test dev and move it to main, use /promote instead.
---

# Demo check

1. Read "Demo story" in `docs/PRD.md` and "Commands" in `AGENTS.md`. If the demo story is still empty, ask for the steps and offer to write them into the PRD.
2. Decide the target: the deployed `main` URL (default) or a local dev server running `main`. For local, start the dev server in the background (skip this if one is already running) and wait until it responds.
3. Open the app in a browser (the Claude in Chrome tools if available, otherwise the Playwright MCP).
4. Follow every demo step exactly as a viewer would. At each step note:
   - whether it worked
   - how long it took
   - any console errors or failed network requests
   - anything that looks broken or unpolished
5. Check a narrow (mobile-width) viewport once.
6. Report pass/fail for each step, then the top issues ranked by how bad they'd look in the demo. Don't fix anything unless asked. Offer to turn each issue into a `demo-critical` GitHub issue.
