# API contract

<!-- Shared. This is how modules talk to each other. Agents build against it exactly.
     Changing it needs one other teammate to agree: propose it on the issue, and PRs touching this file need one other teammate's approval. -->

## Rules
- Every interface lists its input and output shapes, its error cases, and a mock response.
- Until the real implementation lands, callers use the mock response. Frontend work never waits on backend work.
- Changes are additive where possible (a new optional field, a new endpoint). A breaking change must list every caller that needs updating.

## Shared types
<!-- Core data shapes used across modules, as TypeScript types / JSON examples. -->

## Interfaces
<!-- Copy this block per endpoint / function / event. -->

### `<METHOD> /path` or `functionName()`
- **Owner:**
- **Called by:**
- **Input:**
- **Output:**
- **Errors:**
- **Mock:**
