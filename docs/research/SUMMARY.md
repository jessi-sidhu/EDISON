# What wins in 2026: summary

Synthesis of ~1,300 winning projects from ~90 projects held in 2026, plus Edison' own history. Detail and links are in the other files in this folder:
- [Canada](2026-winners-canada.md)
- [US East](2026-winners-us-east.md)
- [US West and Midwest](2026-winners-us-west-midwest.md)
- [AI-agent events](2026-winners-ai-agents.md)
- [Tracks and judging](2026-tracks-and-judging.md)

No event published its judges' reasoning, so every "why it won" below is inferred from who placed.

## Edison: what we know
- **Oct 3–4, 2026**, SFU Burnaby (AQ). 24 hours, in person, teams of up to 4.
- **Theme is revealed at the opening ceremony.** No tracks or prizes are published yet.
- **Judging:** Technical Complexity, Design, Pitch, Originality/Creativity (no weights). In 2025 this was a **3-minute live pitch plus 1 minute of Q&A**, given 1–3 times to different judges.
- **Sponsors so far:** Vercel, GitHub, Arc'teryx, Transoft, Pure Buttons. MLH prizes are likely but unconfirmed.
- **2025 context:**
  - There were no themed tracks.
  - The biggest prizes were Most Likely to Become a Startup ($3,760) and Best Game ($2,960).
  - All 3 finalists were software.
  - Gemini appeared in 11 of 27 winners, but only one winner was an explicit agent project. **An agent project stands out more here than at most events.**
- **To do in event week:** join the Edison Discord and re-check Edison2026.devpost.com for tracks and prizes.

## The winning formula (appears in every region)
1. **One named user plus one hard number.** Pick a specific person with a specific pain ("aphasia survivors", "Kingston seniors"), and back it with a statistic or a measured result ("35% complete PT", "+34% on our benchmark"). A local angle wins often.
2. **The agent takes a real, checkable action.** For example, it places a phone call, fills a government form in a browser, opens a PR, books something, drives hardware, or runs a job. Chat, summary and "chat with your data" apps win only "Best Use of X" sponsor prizes.
3. **Deterministic code at the core, the model at the edges, and visible verification.** The model proposes and code decides. Show verifier or adversarial agents, citations, evals and human approval before anything irreversible *on screen*. Several 2026 rubrics say outright "not a chatbot wrapper".
4. **Get out of the text box.** Use voice (ElevenLabs, Deepgram, Gemini Live), vision, browser or computer use, or hardware. Or reach users where they already are: SMS, phone lines, the IDE. A live outbound phone call on stage stood out repeatedly.
5. **Multi-agent only when the roles mirror a real team and the trace is visible.** A single agent with tools doing a visible job usually beat complex orchestration in the overall rankings.
6. **Depth plus proof wins grand prizes:** on-device or custom-trained models, real data, a domain expert consulted, a real user already trying it.
7. **Demo craft:** a live demo in the first 30 seconds, one sentence on who it's for, a narrow scope that's actually finished, honesty about what the AI does, and a 60-second backup video. About 87% of US East winners had a demo video.

## Domains that won most
- Healthcare, eldercare and accessibility (the largest cluster everywhere)
- Emergency response and wildfire (relevant to BC)
- Developer tools for the AI era ("Cursor for X", tools that make coding agents better, with a measured gain)
- Civic, government forms, and newcomers
- Sustainability and agriculture (often with sensors)
- Hardware plus a voice or vision agent is the strongest combination at "wow"-judged events (10 of 12 Hack the North finalists were physical). But pure-software agents won at ConUHacks, QHacks, GenAI Genesis, and all of Edison 2025's finalists.

## What gets dismissed
- Generic assistants or coaches, and chat-over-data apps
- Impressive AI-built code with no clear user
- Unconstrained autonomy in high-stakes settings
- Agent swarms that exist only because of a sponsor's SDK
- Sponsor logos without real use (sponsors check)

## Prize stacking
- Stacking 2–3 prizes is normal; one project won 12.
- MLH allows one project to win several MLH categories. MLH judges on technology, design, completion and learning, not the pitch.
- A cheap stack for an agent app, each piece visibly doing real work in the demo:
  - Gemini as the agent's model
  - ElevenLabs for voice
  - MongoDB Atlas for memory
  - Auth0 for AI Agents, if it's offered
  - Deploy on Vercel (a Edison sponsor)
  - A .Tech or GoDaddy domain

## Implication for us
The theme is only revealed at the start, and everyone pre-builds. So we pre-build a **theme-flexible agent core** that already has the winning traits:
- real actions
- verification and approval gates
- voice or other interfaces beyond text
- deployed

At the event, we wrap it around the theme with one named user and one hard number.
