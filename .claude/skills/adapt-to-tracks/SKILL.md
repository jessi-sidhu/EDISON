---
name: adapt-to-tracks
description: Re-plan the project when project tracks, themes or sponsor prizes are announced - pick targets, adjust the PRD and plan, and re-cut GitHub issues. Use at track drop or when anyone pastes track/prize info.
---

# Adapt to tracks

Speed matters: aim to finish in under 45 minutes so the team can get back to building.

1. **Collect.** Ask the user for the tracks, sponsor prizes, judging criteria and any required tech (pasted text or a URL). Read `docs/PRD.md`, `docs/ARCHITECTURE.md` and the open issues (`gh issue list --state open`).
2. **Score the fit.** For each track or prize, give a table row with: fit with what we've already built (high/med/low), extra work needed (hours), judging criteria we can hit, and any required tech. Include sponsor prizes we can stack cheaply, like "uses X API".
3. **Recommend.** Propose one primary track plus up to two cheap add-on prizes, with the smallest set of changes to the product and demo story that fits them. Prefer reshaping swappable modules over rebuilding. Wait for the user's decision, and remind them a second teammate has to agree before the re-plan stands.
4. **Update docs.** Edit `docs/PRD.md` (pitch, demo story, scope, tracks targeted), `docs/ARCHITECTURE.md` and `docs/API-CONTRACT.md` if modules change, and `docs/PLAN.md` checkpoints. Show the diff and get approval.
5. **Re-cut issues.**
   - Close issues that are now out of scope, with a comment explaining why.
   - Edit issues whose scope changed.
   - Create the new issues using the `/new-task` format.
   - Show the full list before creating anything.
6. **Brief the team.** Write a short message the user can paste to the team chat: the new pitch, the demo story, and who takes which issue first.
