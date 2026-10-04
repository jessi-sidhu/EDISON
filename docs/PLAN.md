# Plan

<!-- Shared: anyone edits, one other teammate agrees. The big picture: phases, order, checkpoints. Individual tasks live in GitHub Issues, not here. -->

## Build week (pre-event)
<!-- Every serious team pre-builds. Goal: arrive with the core demo working on real code. Adjust dates. -->
- [ ] Repo, harness, deploy pipeline (a blank page live on the hosting URL)
- [ ] `dev` branch created; branch protection on `main` (one approval required)
- [ ] Stack chosen; AGENTS.md commands filled in; formatter + linter + typecheck working
- [ ] PRD, ARCHITECTURE, API-CONTRACT first drafts
- [ ] `docs/QA.md` covers the demo path, and a first `/qa-pass` runs clean on `dev`
- [ ] Dry run: each teammate completes one real issue end to end with /start-task and /ship. Turn every mistake into a Gotcha or a hook.
- [ ] Foundations: auth, UI shell and navigation, API wrappers, ML/agent core (behind the contract)
- [ ] Core product built for real: demo path works end to end on real implementations, deployed
- [ ] Modules kept swappable behind the contract, ready to reshape for the tracks
- [ ] Pitch draft and demo script written; first backup demo video recorded

## Track drop
- [ ] Someone runs `/adapt-to-tracks`, a second teammate agrees, and the updated PRD and issue list go to the team.
- [ ] Guneev adds the new demo path to `docs/QA.md`.

## Sprint (T = hacking starts; adjust to the real schedule)
| Time | Checkpoint |
|---|---|
| T+0:00 | Track drop re-plan done; everyone has an issue |
| T+1:00 | Kickoff: each person states their first issue |
| T+4:00 | Track-specific changes visible on `dev` (mocks OK for new parts); first sprint `/qa-pass` |
| T+10:00 | New parts real; sponsor integrations in; `/qa-pass` clean, promote `dev → main` |
| T+14:00 | Checkpoint: cut anything that isn't nearly done |
| T+18:00 | **Feature freeze.** Only demo-path bugs and polish after this; final `/qa-pass` and promotion |
| T+20:00 | `/demo-check` passes 3 times in a row on the deployed `main`; record a backup demo video |
| T+22:00 | Submission written (Devpost etc.), pitch rehearsed twice |
| T+23:00 | Submitted. Nothing merges to `main` after this |

## Risks
<!-- Risk, and what we do if it happens (e.g. API rate limit, so we fall back to cached responses). -->
