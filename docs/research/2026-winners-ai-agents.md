# What wins at AI / AI-agent projects in 2026

Research date: 2026-09-26. Scope: AI and AI-agent projects **held in 2026 with winners announced**: Anthropic/Claude, OpenAI, Google/Gemini, Meta, Mistral, xAI, Cerebral Valley, YC-hosted, agent-tooling sponsors, and large online Devpost AI competitions.

Purpose: help our Edison team choose an AI-agent idea.

## How this was researched, and what the labels mean

- **Verified** means I read the official winner post or the official gallery page myself, not just a search snippet. I pulled the text with curl and a markdown/HTML extractor.
  - Cerebral Valley (CV) publishes machine-readable galleries (`/e/{slug}/project/gallery.md`), and each project page lists its placement. I downloaded **every 2026 CV project gallery (33 events)** and the full text of all 184 placed or finalist projects.
  - For Devpost, I read the winner-announcement updates and every winning project's page (tagline, prize label, "Built With" tags, story).
- **[unverified]** means the fact comes only from a secondary source (news or blog recap, a LinkedIn post, or a search-engine summary). I could not read the official page.
- **"Agent usage"** is taken from the builders' own descriptions. I did not run the code.
- **n/s** = not stated on the page.

### Access problems: what was blocked and where

| What | Where | Problem | How to fix it |
|---|---|---|---|
| AI Tinkerers project results (190+ projects, many 2026 city events) | `https://aitinkerers.org/projects` and `*.aitinkerers.org/projects/*/results` | Cloudflare "Just a moment..." page for curl; HTTP 403 for WebFetch | Open in a real browser, or use the claude-in-chrome tool |
| X/Twitter winner threads (xAI Grokathon London, SpaceXAI Grokathon, Mistral London, OpenAI Codex project, Claude posts) | `x.com/...` | HTTP 403 | Open in a logged-in browser |
| xAI Grokathon page | `https://x.ai/grokathon` | HTTP 403 | Browser |
| ElevenLabs ElevenHacks | `https://hacks.elevenlabs.io/` | HTTP 429 (rate limited) | Retry later |
| algo-mania Mistral recap | algo-mania.com | HTTP 503 | Retry later |
| SpaceXAI Grokathon Devpost gallery | `spacexai-grokathon.devpost.com/project-gallery` | Gallery not public; page still says "Winners announced soon" | Winners are known only from X and news (see xAI section) |
| Mistral Worldwide Project global-final winner | worldwide-project.mistral.ai, Luma pages, recaps | Not published on any page I could reach; it is in the YouTube finals video (`youtube.com/watch?v=_awp1eVv81o`) | Watch the video, or check Mistral's X account |
| **WebSearch budget** | This session | Hit the 200-search cap near the end. Unfinished lookups: OpenEnv/Meta details, YC "Call My Agent" and "Conversational AI" winners, AGI House, LangChain/CrewAI/Composio/Vapi/Browserbase 2026 winners | Raise `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION`, or search by hand |

### Excluded because they were not 2026 or had no winners yet

- **ElevenLabs Worldwide Project** (GibberLink, Hugo Tour Guide; with a16z) was Feb 2025. Excluded.
- **AWS AI Agent Global Project** was Sep–Oct 2025. Excluded.
- **Google Cloud Gemini Project (EMEA)** was 2024. Excluded.
- **Build with Gemini XPRIZE** ($2M; 26,435 participants) ended Sep 25, 2026. Devpost says "Winners announced soon".
- These Cerebral Valley 2026 events have no public gallery or placements:
  - GLM-5.3 Flash Lightning (Aug 28)
  - RAISE Summit Paris (Jul 4)
  - Bengaluru Meets The Bay final (Jul 14)
- **Meta Llama**: I found no 2026 Llama-branded project with published winners. The LlamaCon project was May 2025. Meta is represented here by the OpenEnv Project; see section D.

---

## Events covered (index)

| # | Event | Dates (2026) | Host / sponsor | Scale | Official results |
|---|---|---|---|---|---|
| A1 | Built with Opus 4.6: a Claude Code project | Feb 10–17 (virtual) | Anthropic + CV | 13,000+ applied, 500 selected, 227 projects | [claude.com blog](https://claude.com/blog/meet-the-winners-of-our-built-with-opus-4-6-claude-code-project), [CV gallery](https://cerebralvalley.ai/e/claude-code-project/project/gallery) |
| A2 | Built with Opus 4.7: a Claude Code project | Apr 21–27 (virtual) | Anthropic + CV | 288 projects (CV says 20,000+ applicants for "Opus 4.7 project") | [claude.com blog](https://claude.com/blog/meet-the-winners-of-built-with-opus-4-7-claude-code-project), [CV gallery](https://cerebralvalley.ai/e/built-with-4-7-project/project/gallery) |
| A3 | Claude Build Day (Opus 4.8) | Jun 13 (12 h, SF) | Anthropic + CV | 1,500+ applied, 310 in person, 161 projects | [claude.com blog](https://claude.com/blog/meet-the-winners-of-our-claude-opus-4-8-build-day-project), [CV gallery](https://cerebralvalley.ai/e/claude-startups-build-day/project/gallery) |
| A4 | Built with Claude: Life Sciences | Jul 7–14 (virtual) | Anthropic + Gladstone + CV | 500 selected, 299 projects | [CV gallery](https://cerebralvalley.ai/e/built-with-claude-life-sciences/project/gallery); winners via recap [unverified] |
| A5 | Cartesia x Anthropic Voice Agents Project (hosted by Notion) | Feb 7–8 (SF) | Cartesia, Anthropic | 27 projects | [CV gallery](https://cerebralvalley.ai/e/cartesia-voice-agents-project/project/gallery) |
| A6 | Future of Agentic AI in Healthcare (Abridge x Anthropic x Lightspeed) | Jul 18 (SF) | Abridge, Anthropic | 114 projects | [CV gallery](https://cerebralvalley.ai/e/abridge-project/project/gallery) |
| B1 | OpenAI Codex Project | Feb 5 (SF) | OpenAI + CV | 53 projects | [CV gallery](https://cerebralvalley.ai/e/openai-codex-project/project/gallery) |
| B2 | The IDE Reimagined: JetBrains x OpenAI Codex | Apr 18–19 (SF) | JetBrains, OpenAI | 39 projects | [CV gallery](https://cerebralvalley.ai/e/jetbrains-x-openai-hack/project/gallery) |
| B3 | OpenAI Voice Hack Night | May 27 (6 h, SF) | OpenAI | 59 projects | [CV gallery](https://cerebralvalley.ai/e/openai-voice-hack-night/project/gallery) |
| B4 | **OpenAI Build Week** (Devpost, online) | Jul 13–21 | OpenAI | 46,697 registered, 8,000+ projects | [OpenAI blog](https://developers.openai.com/blog/build-week-winners) |
| B5 | GPT-6 Astra Project SF / NYC | Sep 8 / Sep 10 | OpenAI + CV | 72 / 67 projects | [SF](https://cerebralvalley.ai/e/openai-gpt-6-astra-sf/project/gallery), [NYC](https://cerebralvalley.ai/e/openai-gpt-6-astra-nyc/project/gallery) |
| C1 | **Gemini 3 Project** (Devpost, online) | ended ~Feb; winners ~mid-Apr | Google DeepMind | 35,522 participants, 4,500+ submissions | [Devpost winners update](https://gemini3.devpost.com/updates) |
| C2 | **Gemini Live Agent Challenge** (Devpost, online) | Feb 16 – Mar 16 | Google Cloud | 11,829 participants | [Winners update](https://geminiliveagentchallenge.devpost.com/updates/41944-announcing-the-challenge-winners) |
| C3 | Gemini 3 city tour (SuperHack SF, Bengaluru, Tokyo, Seoul, NYC, Singapore, Paris) | Jan 31 – Mar 14 | Google DeepMind + CV | 43–111 projects each | CV galleries (linked in section) |
| C4 | Zero to Agent: Vercel x DeepMind (SF / NYC / London) | Mar 21 | Vercel, Google DeepMind | 81 / 62 / 50 projects | CV galleries |
| C5 | Google I/O Project | May 23 (SF) | Google DeepMind | 152 projects | [CV gallery](https://cerebralvalley.ai/e/google-io-project/project/gallery) |
| C6 | Google DeepMind Bangalore Project | Jul 11 | Google DeepMind | 160 projects | [CV gallery](https://cerebralvalley.ai/e/google-deepmind-bangalore-project/project/gallery) |
| D1 | OpenEnv Project SF (RL environments; judges from Meta, HF, Berkeley and others) | Mar 7–8 | Meta / Hugging Face ecosystem | 104 projects, $100K+ cash | [CV gallery](https://cerebralvalley.ai/e/openenv-project-sf/project/gallery) |
| E1 | Mistral Worldwide Project (7 cities + online) | Feb 28 – Mar 1; final Mar 9 | Mistral AI | 7,000+ applied, 1,000 selected | Partial (city winners only) |
| F1 | xAI Grokathon London | Jan (12 h) | xAI | n/s | X / LinkedIn [unverified] |
| F2 | SpaceXAI Grokathon SF | Aug 8 (12 h) | SpaceXAI | 16 on Devpost (invite-only) | X / news [unverified]; [Devpost criteria](https://spacexai-grokathon.devpost.com/) |
| G1 | AI Engineer World's Fair Project ("edge of RSI") | Jun 27–28 (SF) | CV + AIE | 70 projects, $35K+ | [CV gallery](https://cerebralvalley.ai/e/aiewf-project-2026/project/gallery) |
| G2 | MongoDB agent projects: Agentic Orchestration (Jan 10 SF), Agentic Evolution (May 2 London), Persistent Context Sprint (Aug 13 SF) | — | MongoDB + CV | 6 finalists / 6 / 94 | CV galleries |
| G3 | Notion Developer Platform Project | May 16–17 (SF) | Notion | 49 projects | [CV gallery](https://cerebralvalley.ai/e/notion-developer-platform-project/project/gallery) |
| G4 | Hospitality 2030: Rosewood Sand Hill | May 16 | Rosewood | 61 projects | [CV gallery](https://cerebralvalley.ai/e/rosewood-hospitality-2030/project/gallery) |
| G5 | National Security Project (Army xTech) | May 2–3 (SF) | US Army | 102 projects, $50K cash | [CV gallery](https://cerebralvalley.ai/e/3rd-annual-natsec-project/project/gallery) |
| H1 | Browser Use Web Agents Project at YC | Feb 28 – Mar 1 | Browser Use, YC | 185 participants, 78 submissions, 42 judges, $180K+ | Secondary only [unverified] |
| I1 | GitLab AI Project (Devpost) | Feb 9 – Mar 25 | GitLab + Google Cloud + Anthropic | ~7,000 devs, 600+ agents/flows, $65K | [GitLab blog](https://about.gitlab.com/blog/gitlab-ai-project-2026-meet-the-winners/) |
| I2 | Solo.io MCP & AI Agents Project (online) | early Feb – early Apr | Solo.io | n/s | [Solo.io blog](https://www.solo.io/blog/celebrating-the-winners-of-the-2026-project-for-mcp-ai-agents) |
| I3 | Microsoft Agents League (AI Skills Fest) | winners Jul 23 | Microsoft | 31,000 developers, $55K, 14 winners | [MS Tech Community](https://techcommunity.microsoft.com/blog/educatordeveloperblog/%F0%9F%8F%86-agents-league-celebrating-the-builders-who-made-agents-battle-for-glory/4538007) |
| I4 | Amazon Nova AI Project (Devpost) | Feb 2 – Mar 16 | Amazon | 13,413 participants | [Devpost gallery](https://amazon-nova.devpost.com/project-gallery) |
| I5 | Agents Assemble: Healthcare AI (MCP + A2A + FHIR, Devpost) | Mar 4 – May 11 | Prompt Opinion | 4,299 participants | [Devpost gallery](https://agents-assemble.devpost.com/project-gallery) |
| I6 | UC Berkeley AI Project 2026 (Cal Hacks team) | Jun 20–21 | Berkeley / sponsors | 1,097 participants | [Devpost gallery](https://ai-project-2026.devpost.com/project-gallery) |

---

# A. Anthropic / Claude

## A1. Built with Opus 4.6: a Claude Code project (Feb 10–17, 2026)

- **Official pages:**
  - [Winners blog](https://claude.com/blog/meet-the-winners-of-our-built-with-opus-4-6-claude-code-project) (dated Apr 20, 2026)
  - [CV event](https://cerebralvalley.ai/e/claude-code-project)
  - [Gallery](https://cerebralvalley.ai/e/claude-code-project/project/gallery)
- **Format:** Virtual, one week. 500 people were picked from 13,000+ applicants; each got $500 in API credits. 227 projects were submitted and 6 reached the final.
- **Judging:** Judges were from the Claude team (the final demo was in front of Boris Cherny and Cat Wu, per CV's X post [unverified]).
- **Prizes:** $100K in Claude API credits across the winners (2nd place got $30K). Categories were 1st/2nd/3rd, a "Keep Thinking" prize, and a "Creative Exploration" special prize.
- **Organiser framing:** "four out of five winners were not professional developers." The winners were a personal injury lawyer, a cardiologist, a roads specialist, an electronic musician, and one software engineer.

| Place | Project | What it does | For | Stack | How it uses agents | Why it stood out (quotes) |
|---|---|---|---|---|---|---|
| 1st | **CrossBeam**, Mike Brown (personal injury lawyer). [GitHub](https://github.com/mikeOnBreeze/cc-crossbeam) | Upload an ADU permit correction letter and construction plans. It reads blueprints with vision, interprets each correction with code citations, researches state and city law live on the web, and drafts a response package for the engineer to sign. | CA homebuilders, and city permit reviewers (batch mode) | Claude Agent SDK, Opus 4.6 vision | "parallel sub-agents parse the documents, build a spatial index, and assign targeted agents to each discrete correction." Built on the Claude Agents SDK with **13 custom skills** (state ADU law, city research, blueprint extraction, corrections interpretation) that run concurrently. Output is an action plan in about 20 minutes. | A painful, quantified problem: "90%+ rejection rate on first submission… six-month delay that costs homeowners $30,000." A real city, Buena Park, is evaluating adoption. "I didn't write a single line of code… I didn't even read a line of code." |
| 2nd | **Elisa**, Jon McBee (software engineer). [GitHub](https://github.com/zoidbergclawd/elisa) | Block-based visual IDE where kids snap together Goals, Requirements, Minions (agents), Skills, Rules (hooks), Portals (MCP/CLI/hardware) and Deployments, then press Go. | Middle schoolers, educators | TypeScript/Python/React; 39K lines, 1,500 tests, 76 commits | A meta-planner turns the spec into a task DAG. Builder, Tester and Reviewer agents run it with live visibility. A teaching engine explains concepts as the agents work. | Personal origin (his 12-year-old daughter's science fair). Heavy engineering discipline (1,500 tests). The thesis that "specs and tests" replace source code. |
| 3rd | **PostVisit.ai**, Michał Nedoszytko (cardiologist). [GitHub](https://github.com/mnedoszytko/postvisit) · [site](https://postvisit.ai) | Records the visit ("reverse AI scribe"), then explains diagnoses in plain language, grounded in the patient's full record and clinical guidelines. The doctor stays in the loop. | Patients and physicians | Opus 4.6, 1M-token context, extended thinking, tool use | Tool use plus long context puts the whole record into one clinical picture. Physician review and escalation alerts are built in. | A real clinician's two-year itch; "tested in a real hospital." |
| Keep Thinking | **TARA**, Kyeyune Kazibwe (Uganda Ministry of Works). [GitHub](https://github.com/Kye256/tara-transport-assessment) | Dashcam footage becomes a full road investment appraisal: condition, NPV/EIRR, sensitivity, and an **equity score** for who benefits. | Infrastructure planners in low-budget agencies | Opus 4.6 vision | A frame-by-frame vision pipeline feeds automated economic modelling and a one-click PDF. More of a pipeline than an autonomous agent. | "$1–4 million… nine to 14 months" becomes "five hours"; tested on a real Ugandan road. |
| Creative Exploration | **Conductr**, Asep Bagja Priandana (musician). [GitHub](https://github.com/nanassound/conductr) | A browser MIDI instrument: you play chords and Claude "directs the band" (drums, bass, melody, harmony). | Musicians | C engine compiled to WASM, JS, about 4,800 LOC | Three timescales: the C engine emits notes every 15 ms, an analyzer summarises your playing, and Opus reshapes the arrangement. "The engine never waits for the AI"; there is a fallback director if the API fails. | "Latency is musically invisible." Real-time design around LLM latency. |

**Finalists who did not place** (useful contrast):
- **Zeppelin**: an S3-native vector DB written entirely by Opus in long autonomous sessions, with 21K lines of Rust, 451 tests and 26 TLA+ proofs.
- **FenceFlow**: an autonomous tournament-committee agent.
- **CARN**: drone search-and-rescue with a LangGraph 3-agent planner.

My read (inference): impressive autonomous engineering alone (Zeppelin) lost to a clear human problem with a named user (CrossBeam).

## A2. Built with Opus 4.7: a Claude Code project (Apr 21–27, 2026)

- **Official pages:**
  - [Winners blog](https://claude.com/blog/meet-the-winners-of-built-with-opus-4-7-claude-code-project) (Jun 15, 2026)
  - [CV gallery](https://cerebralvalley.ai/e/built-with-4-7-project/project/gallery)
- **Format:** Same as A1 (500 selected, $500 credits, one week, $100K credits pool).
- **Categories:** 1st, 2nd, 3rd, Most Creative Use of Opus 4.7, Keep Thinking Prize, and **Best Use of Claude Managed Agents**.

| Place | Project | What it does | For | Stack | How it uses agents | Why it stood out |
|---|---|---|---|---|---|---|
| 1st | **Medkit**, Bedirhan Keskin (physician turned engineer). [GitHub](https://github.com/bedriyan/medkit-app) | Voice-first virtual clinic. You take a history from AI patients (anxious, evasive, rambling), order labs, read imaging, diagnose and prescribe. | Medical students and junior doctors | Claude Managed Agents, voice (cloud provider), 3D game layer; built across 4 parallel Claude Code sessions, "talk, don't type" | Patients are **agents with personalities**. An **agentic grader** scores each encounter against published guidelines (NICE, ESC, AHA, GINA, GOLD). The grader "cannot fabricate guidance — its citations come from a curated registry." | Pilots are lined up with 3 Istanbul medical faculties and a pharma company. Verifiable, cited feedback: "That feedback loop doesn't exist anywhere else." |
| 2nd | **Wrench Board**, Alexis Chapellier (electronics repair technician). [GitHub](https://github.com/Junkz3/wrench-board) | Drop in a schematic and boardview, describe symptoms, and the agent tells you which pad to probe, reads your measurements, and updates its hypotheses. | Independent repair technicians | Opus 4.7 vision, Managed Agents memory store; designed in Claude Design, built in Claude Code multi-agent mode | Four agents (**Scout, Registry, Writers, Auditor**) produce a *verified* repair pack in about 2 minutes. Vision compiles the schematic PDF into a **queryable electrical graph**, and the agent "interrogates the graph instead of guessing," drives the boardview visually, and "never fabricates a reference designator." Per-device memory persists across sessions. | Dogfooded in his own shop. Visible reasoning: "watched Wrench Board's boardview light up step by step, arrows appearing." He was applying for "survival jobs" when he entered. |
| 3rd | **Maieutic**, Paula Vásquez-Henríquez (CS professor, Chile). [GitHub](https://github.com/pauvasquezh/maieutic) | An IDE that locks the editor until the student writes a precise spec. Autocomplete is off, and Claude answers reasoning questions with counter-questions. The "Intent-Diff Review" labels each gap between spec and code as drift, revision, or bug. | CS students and instructors | Python IDE, Claude | Claude acts as a Socratic gatekeeper plus a spec-vs-code diff classifier. An instructor dashboard gives a one-line cognitive summary per student and cohort-wide misconceptions. | Counter-trend idea (AI that *refuses* to write code). Researchers asked to co-author a paper. She spent 2 days on specs before coding. |
| Most Creative | **Virtual Puppet Theater**, Rene Hangstrup Møller. [GitHub](https://github.com/rhmoller/virtual-puppet-theater) | Webcam hand tracking drives a puppet. An AI puppet banters back, and spoken requests spawn 3D props. | Kids / play | Bun, Vite, TS, MediaPipe (WASM), Three.js at 60 fps, WebSocket, ElevenLabs, Web Speech API | "Two Claudes work in parallel": one performs the character (emotion, gaze, gesture) and one designs new props from Three.js primitives, refined with a **screenshot feedback loop**. | Delight, tested with his son. Tip: "reserve that entire last day just for producing the demo" video. |
| Keep Thinking | **MaestrIA**, Benjamin Torralbo (20, no prior coding). [GitHub](https://github.com/Benjxyg/MaestrIA) · [site](https://maestriachile.cl/) | Photo, voice and location give a master-level home-repair diagnosis (cause, material, severity, budget). A "committee of trades" argues on screen, then it matches you to local tradespeople and drafts a WhatsApp message. | Chilean homeowners, and tradespeople ("maestros") | Web app, Zod schemas, WhatsApp, streamed reasoning with animated bounding boxes | Streaming reasoning, a multi-trade agent debate, a **managed agent that checks prices against Chilean retail**, and a second agent that writes the WhatsApp message. A JSON domain file (17 rules, 7 woods, 19 prices) is injected into every diagnosis. | **Eval-first**: "an auditable 9-dimension eval against 12 real cases with ground truth recorded by my dad… If I did another project, the eval would be the first commit." The knowledge file raised the eval score from 74% to 81%. |
| Best Use of Managed Agents | **ARIA**, Idriss Benguezzou and Adam Hnaien. [GitHub](https://github.com/zestones/Aria) | Upload a machine manual PDF and answer 4 calibration questions; within 15 minutes the plant is profiled. Agents then watch live signals and issue work orders. | Factory maintenance engineers | Claude Managed Agents (sandboxed Python, session persistence, MCP dispatching), Opus 4.7 vision and extended thinking | Five agents "pass the problem like a real maintenance team passes a ticket": **KB Builder → Sentinel → Investigator** (writes and runs Python in Anthropic's sandbox to compute degradation rates) **→ Work Order Generator → Q&A**. | "Without Managed Agents, we'd have spent the week building infrastructure." They spent a full day planning milestones and acceptance criteria. IoT companies reached out afterwards. |

**Other finalists** (from the CV gallery):
- **OmniBridge**: an agent that identifies unknown serial protocols with 6 purpose-built tools, then compiles local parsers. About $0.20 per identification, with a 65% prompt-cache hit rate.
- **Archoff / Design Office**: architecture briefs become SketchUp, DXF and slides; "a chat that doesn't just answer — it acts."
- **Mobius**: physics paper to validated simulator. An Opus "conductor" runs 9 skills over a DAG, plus a parallel **science-integrity critic running 8 orthogonal checks**.

## A3. Claude Build Day, Opus 4.8 (Jun 13, 2026, 12 hours, SF)

- **Official pages:**
  - [Winners blog](https://claude.com/blog/meet-the-winners-of-our-claude-opus-4-8-build-day-project) (Jun 17)
  - [CV gallery](https://cerebralvalley.ai/e/claude-startups-build-day/project/gallery)
- **Scale:** 1,500+ applied, 310 took part, $500 credits each.
- **Categories:** Top 3 only; no special prizes were described.
- **Why it matters for Edison:** this is the closest 2026 analogue to a 24-hour, in-person student project.

| Place | Project | What it does | For | Stack | How it uses agents | Why it stood out |
|---|---|---|---|---|---|---|
| 1st | **Tekton**, Holly Tang (designer) and Austin Burgess. [GitHub](https://github.com/tangxiya-star/Tekton) · [live](https://tekton-build.vercel.app/) | Reconstructs lost historic timber buildings in 3D (Tang Dynasty, Notre-Dame spire) over 339 incremental construction states. Click any part to see its documented source ("evidence chain"). | Academics, restorers, cultural preservation | Opus 4.8, 3D web viewer | Claude researches schematics and documents, then assembles the model. "Independent **verifier sub-agents graded each reconstruction in isolated context windows**, and self-correction loops rechecked component placement until all 20 tests passed." | Evidence traceability plus a strong visual. Process: "an entire PRD and a Notion board with around 50 tickets," then parallel workflows. |
| 2nd | **Sim Francisco**, Tanmayi Priya Dasari and Tejas Prabhune (UC Berkeley EECS undergrads). [GitHub](https://github.com/tejasprabhune/simfrancisco) · [site](https://simfrancisco.org/) | A Census-seeded digital twin of San Francisco with 10,000 synthetic residents. It polls the whole city by neighbourhood and forecast the 2024 presidential vote at 81.3% (actual 83.8%) and Prop A at 70% (actual 70.38%). | Forecasting / policy (and the founder's post-training startup) | Opus 4.8 (full stack), Census data, Kalshi/Polymarket comparison | Thousands of persona agents. Claude worked "alongside a **verifier and an adversarial agent**" to match real demographic distributions. Claude invented an evolutionary clustering step (10K residents down to about 300 personas) that cut inference cost 10–100×. | **Measured accuracy against ground truth**, and cost engineering: "Don't settle for the first approach that works, especially when it's expensive." |
| 3rd | **Custom Universe**, Jake Stevens and Mauricio Pereira (met at the event). [GitHub](https://github.com/jss8649/image-edit-realtime-project) | A phone photo becomes an editable photoreal 3D scene you restyle with text in real time; synthetic data for robotics. | Robotics labs | Apple RealityKit, open-source models, remote NVIDIA H100 | Claude built everything end to end **and operated the remote H100**; it also researched which models gave the right output. | "Use Claude to choose your tools, not just to write the code." |

**Other finalists:**
- **Rewild Earth**: natural-language search over AlphaEarth satellite embeddings, "with verification so the answers are trustworthy."
- **Bel**: an SMS health companion. It sends an instant reply, then a specialist panel sends a deeper second text.
- **DogeHouse Babel**: a live multilingual voice room where Opus is an interpreter participant that catches cross-language misunderstandings.
- **Spark AI**: data-centre siting with web-search agents.

## A4. Built with Claude: Life Sciences (Jul 7–14, 2026)

- **Official pages:**
  - [CV event](https://cerebralvalley.ai/e/built-with-claude-life-sciences) (tracks, prizes)
  - [Gallery](https://cerebralvalley.ai/e/built-with-claude-life-sciences/project/gallery)
- **Winner source:** the CV gallery marks only "Finalist" labels. The winner breakdown below comes from a recap ([vidjinnangni.net](https://vidjinnangni.net/built-with-claude/)) and Claude's Threads post (search snippet) **[unverified placements]**.
- **Tracks:**
  - **Research**: use *Claude Science* on a biological question to produce "a finding, a trained model, an analysis others can reproduce."
  - **Build**: tools for scientists.
- **Prizes and support:** 500 selected; each got Claude Max 20x plus $200 credits. $100K in credits in total. Judges from Anthropic and Gladstone Institutes.

| Place [unverified] | Project | What it does | How it uses agents | Stood out |
|---|---|---|---|---|
| Research, 1st | **NCypher**, Faith Ogundimu. [GitHub](https://github.com/faith-ogun/ncypher) | Triages non-coding variants in paediatric brain cancer (DMG). Returns an "honest confidence flag" and promotes a variant only when independent evidence agrees. | Ships as an **MCP tool plus an Agent Skill "with a built-in sceptic"**, with a reproducibility gate. "Six independent stress tests, each re-derived by a **separate reviewer agent**." | A two-sided, honest finding instead of a "manufactured driver." |
| Research, 2nd | **Extremolith / Extremophilic Protein Translator**, Jaymin Patel. [GitHub](https://github.com/jayman1466/Extremophilic-Protein-Translator) | Trains a protein LM adapter to make heat, acid or salt-tolerant enzyme variants. | Claude set up many mini-experiments to remove bias, and kept a public lab notebook. | "A 6–12-month scoping project was compressed into 5 days." |
| Build, 1st | **Lazarus**, Dean Sherry. [PyPI](https://pypi.org/project/lazarus-bio/) · [GitHub](https://github.com/DoctorDean/lazarus) | Revives dead research repos from just a GitHub URL into a containerised, callable component with a smoke test. | **Claude Agent SDK** agent that "writes its own goal and a falsifiable success test," then loops build → run → read traceback → repair in a Docker sandbox. It fixed a 15-year-old C bug in fpocket, and upstreams fixes as PRs. | A real package (pip install, docs, CI). Six revived tools. |
| Build, 2nd | **Provinans**, Shereen Lee | Reconciles decades of cancer pathology records across changing staging rules. | Claude Sonnet "equipped with careful harnessing" for record linkage. | Done with a real lab (Dr Blake Gilks). |
| Gladstone special | **Trialign**, Jules Park and Neil Wang. [GitHub](https://github.com/itsjoopark/trial-ai-platform) | Patient-facing oncology trial matcher over SMART-on-FHIR. Shows which trials your *next* treatment would disqualify you from. | Reads the record into mCODE, asks only eligibility-changing questions, and screens live against ClinicalTrials.gov with criterion-by-criterion reasoning. | A research insight: "48% of patients who fell out… had already started an off-protocol therapy." |

## A5. Cartesia x Anthropic Voice Agents Project (Feb 7–8, 2026, SF, hosted by Notion)

- **Official page:** [CV gallery](https://cerebralvalley.ai/e/cartesia-voice-agents-project/project/gallery). 27 projects. Prizes were not stated on the page.

| Place | Project | What | Agent usage |
|---|---|---|---|
| 1st | **Shiprail**. [GitHub](https://github.com/brandonin/cartesia-project) | A speech coach built on phoneme-level dysfluency detection | Voice agent plus signal analysis (thin description) |
| 2nd | **Memento**. [GitHub](https://github.com/TanviBhardwaj24/memoryCatcher) | Voice and camera memory-care assistant (medication adherence) that syncs to Notion | Extended Cartesia's `LlmAgent` with custom tools (camera, Notion). Compared "discrete tool invocation versus continuous stream processing" for vision. |
| 3rd | **SuperPowered-VoiceAssistant**. [GitHub](https://github.com/Karthik-Ragunath/minicpm-o-4_5) | A browser-powered voice assistant | Voice plus browser actions |

## A6. Future of Agentic AI in Healthcare: Abridge x Anthropic x Lightspeed (Jul 18, 2026, SF)

- **Official page:** [CV gallery](https://cerebralvalley.ai/e/abridge-project/project/gallery). 114 projects.

| Place | Project | What | For | How it uses agents | Stood out |
|---|---|---|---|---|---|
| 1st | **HomeReady**. [GitHub](https://github.com/pistachiopranay/homeready-abridge-project) | Turns the Abridge discharge plan into a guided home walkthrough (iPhone scan) | Caregivers, discharge teams | An agent "runs the visit: reading the encounter note, deciding what to verify, asking adaptive questions, grading the home against the actual discharge plan," then routes findings to OT and social work and updates the chart. "Dumb client, smart backend." | "The decisive finding is a **measurement, not a vibe**: the bathroom doorway is too narrow for her walker." |
| 2nd | **AloraAI**. [GitHub](https://github.com/hazelwusy/AloraAI.git) | Case-manager co-pilot for behavioural-health transitions | Nurses | Listens to the live call, grounds each answer in the approved packet, catches oversell, and learns from outcomes. "Alora never places the call — the nurse does." | Human-in-the-loop by design |
| 3rd | **Twiage**. [GitHub](https://github.com/stat-guy/twiage) | Ambient ED-triage agent team | ED triage nurses | An orchestrator plus 4 specialists (**Scribe, Vitals, Acuity, Routing**) pick the Epic template and fill it live with **transcript-cited, confidence-scored values**, then propose ESI and routing. The nurse does "a single review and accept." | Fits the existing EHR workflow |

---

# B. OpenAI

## B1. OpenAI Codex Project (Feb 5, 2026, SF)

- **Official page:** [CV gallery](https://cerebralvalley.ai/e/openai-codex-project/project/gallery). 53 projects.
- **Judges:** Greg Brockman, Thibault Sottiaux, Sonya Huang, Lenny Rachitsky, Peter Steinberger.

| Place | Project | What | How it uses agents |
|---|---|---|---|
| 1st | **OpenCortex**, Vineet Reddy and Yann Bilien. [GitHub](https://github.com/vineet-reddy/agentscience) | A social science platform where humans and many AI agents post ideas, write papers, and peer-review each other. Ranked with a PageRank-style score. | "Any AI agent connects in one click and gets full autonomy to browse, publish, comment." A multi-agent ecosystem. |
| 2nd | **Evy**. [GitHub](https://github.com/SebastianBosma/evy_skills) | "Codex for everyone": auto-builds and runs integrations to any tool from chat | Codex generates its own integrations (skills) |
| 3rd | **Paradigm**. [GitHub](https://github.com/Codex53Project/vibe-skilling) | Improves the Codex agent proactively while you work | Meta-agent / skill learning |
| Finalist | **Yolodex**. [GitHub](https://github.com/qtzx06/yolodex) | A YouTube URL becomes a YOLO dataset and then a game-playing bot | A Codex Skill spins up **parallel Codex labeling agents**. A secondary source says it won $10K [unverified]. |

## B2. The IDE Reimagined: JetBrains x OpenAI Codex (Apr 18–19, 2026)

- **Official page:** [CV gallery](https://cerebralvalley.ai/e/jetbrains-x-openai-hack/project/gallery). 39 projects.
- **Prize:** each 1st place got $3,000 cash.

| Place | Project | What | How it uses agents | Stood out |
|---|---|---|---|---|
| 1st | **"thinking" / hyperreasoning**. [GitHub](https://github.com/amangalampalli/hyperreasoning) | A self-healing coding agent that searches over compact DSL plans before writing code | The LLM proposes branches, and a **Rainbow RL controller** picks which to refine, compile, or backtrack from using **compiler and test verifier feedback** | Gemma E2B (2B) matched Codex 5.4 Low's 80% solve rate with about 140× fewer tokens, on a MacBook. **A benchmark number.** |
| 2nd | **Scopecreep**. [GitHub](https://github.com/BhavikFTW/Scopecreep) | Turns the JetBrains IDE into an agentic hardware testbench | The agent writes Python into your project, **drives real lab instruments** (Digilent scope, bench PSU), writes results files, and uses a Supabase memory of instrument quirks | Real hardware in the demo |
| 3rd | **Mesh Code**. [GitHub](https://github.com/ayushozha/mesh-code) | Shared session state for coding agents | An MCP server gives Claude, Cursor and Codex a shared feature card and event ledger | Agent infrastructure |

**Finalists:** Periscope (a context-window visualiser), SecureLoop (Sentry alert → Codex fix → sandbox test → human approval), Pinpoint.

## B3. OpenAI Voice Hack Night (May 27, 2026, 6 hours)

- **Official page:** [CV gallery](https://cerebralvalley.ai/e/openai-voice-hack-night/project/gallery). 59 projects.

| Place | Project | What | How it uses agents |
|---|---|---|---|
| 1st | **Agentic OS for a Phone** | A voice-first mobile OS: "You talk, it answers, takes action, and builds the right interface in real time" (calendar, flights, email) | A voice agent with tool actions plus generative UI |
| 2nd | **Wagner** | A live voice meeting with two AI agents (a DevOps Lead and a CFO) that debate an infrastructure change | OpenAI Realtime API, **multi-agent voice**, and tool calls that pull up diagrams and budgets mid-debate |
| 3rd | **Surgical Triage**, by a practising hand surgeon | Answers the ER transfer line, talks to the referring doctor, reviews uploaded photos and X-rays during the call, flags missing imaging, checks surgeon criteria from "clinical skill files," and can call the OR | A voice agent plus vision, skills files, and outbound call actions |

## B4. OpenAI Build Week (Devpost, Jul 13–21, 2026): the biggest 2026 online AI competition I found

- **Official pages:**
  - [OpenAI winners blog](https://developers.openai.com/blog/build-week-winners)
  - [Devpost](https://openai.devpost.com/) (46,697 participants)
- **Scale:** 8,000+ projects from 186 countries.
- **Tracks:** Apps for Your Life, Work & Productivity, Developer Tools, Education.
- **Prizes:** $15K for 1st and $10K for 2nd in each track ($100K total). First place also got DevDay passes, time with the Codex team, and a year of ChatGPT Pro.
- **Judging:** "technical implementation, design and user experience, potential impact, and the quality of the idea."
- **Requirements:** Codex plus GPT-5.6, a demo video under 3 minutes, a public repo, and the Codex session ID.
- **Organiser framing:** "developers can take on more ambitious systems, while people with expertise in other fields can turn what they know into working software."

| Track / place | Project | What | For | Stack | How it uses AI / agents | Why it stood out (quotes) |
|---|---|---|---|---|---|---|
| Life, 1st | **Second Voice**, Ravitez Dondeti (solo). [Devpost](https://devpost.com/software/second-voice-uk1peq) · [GitHub](https://github.com/dondetir/SecondVoice) | Unclear or partial speech plus a personal phrasebook plus context gives 2–3 candidate sentences; the user confirms, then it speaks | People with dysarthria (ALS, cerebral palsy, stroke) | GPT-5.6, STT/TTS, Codex | The LLM proposes and **the human confirms**. "Zero training," and it "never puts words in someone's mouth." | "The smallest UX decisions carried the most weight… A technically working app is not enough if it is unusable in practice." |
| Life, 2nd | **AirBridge for Windows**, Adam Tarantino. [GitHub](https://github.com/atarantino/AirBridge) | Streams Windows audio to AirPlay speakers, with multi-room support and lip-sync correction | Windows plus Apple-speaker owners | C#/.NET, WASAPI, pyatv, GPT-5.6, Responses API | A GPT-5.6 voice agent controls the system, but "a **local policy layer** determines which actions are allowed and **verifies the result against the actual hardware**." | Solved a personal, long-standing annoyance; first project. |
| Work, 1st | **veTriage**, Erin Downes VMD (61, no coding background). [Devpost](https://devpost.com/software/veterinary-four-color-triage-app) · [prototype](https://vetriage.netlify.app/) | Phone-triage PWA for vet receptionists: gathers history, flags red-flag signs, routes by a four-colour urgency system | Vet clinic staff | Next.js, TS, GPT-5.6, Codex | GPT-5.6 "supports humans in efficiently handling the intake conversation **without making the medical decision**." Clinical need and capacity are handled separately. | **Already in live use** at her clinic ("screening all sick-pet calls"). Domain expert as builder. |
| Work, 2nd | **Pulse**, Mohamed Abu Taleb (cardiologist, Cairo). [Devpost](https://devpost.com/software/pulse-ewjaf9) · [GitHub](https://github.com/drmohpioneer/pulse) | Listens during a cardiac arrest and holds state: rhythm, shocks, drug timing, CPR cycles, hands-off time | Resuscitation team leaders | FastAPI, Next.js, Whisper/Groq, GPT-5.5/5.6, pytest | "Deterministic engine, **no LLM in the clinical loop**." Speech becomes evidence, evidence becomes events, and events drive a state machine; it asks the team to confirm when evidence is unclear. Handles code-switched Egyptian Arabic. | A high-stakes setting made safe by constraining the LLM to interpretation only. |
| Dev Tools, 1st | **Echo Canvas**, Kevin Yang. [Devpost](https://devpost.com/software/echo-canvas-ujzksi) · [demo](https://echo-canva.vercel.app/) | A browser "acoustic wireframe": sketch a room, place sources and listeners, change materials, hear the result | Game audio designers and devs | Next.js, Web Audio, Web Workers, GPT-5.6 | GPT-5.6 authors and explains scenes "within constrained schemas"; deterministic geometry and DSP do the physics. | "AI is most reliable as a **constrained authoring and explanation layer**, not as a replacement for geometry or real-time DSP." |
| Dev Tools, 2nd | **Sentinel**, Malik Bashaar Javaid (first project, new graduate). [Devpost](https://devpost.com/software/sentinel-way5bd) · [GitHub](https://github.com/BashaarJavaid/MCP-Sentinel) | A security scanner for **MCP servers** before they ship | Agent developers | Python, Semgrep, Docker, SARIF, GPT-5.6 | Static rules, then a *tightly constrained* GPT-5.6 review in source context, then **Docker-sandboxed probes**. The model "cannot invent executable probes, cite nonexistent code." Findings map to the OWASP Agentic Top 10 and feed GitHub code scanning. | "Constraining a model is harder than prompting one. Most of my work wasn't prompt engineering." |
| Education, 1st | **Mechanica**, Weiying Zhu, Yukun Li, Shan Wei. [Devpost](https://devpost.com/software/xiaoqiang) · [museum](https://mechanica-museum.vercel.app/) | A digital museum: 4 lost ancient Chinese machines as physically simulated, operable, take-apart 3D exhibits; every dimension traced to a text or artifact | Museum visitors, learners | React Three Fiber, Three.js, Vite, Responses API, Codex | An AI docent "designed to **cite the museum's evidence or decline to answer**." Competing reconstructions are shown where historians disagree. | Visual wow plus epistemic honesty. |
| Education, 2nd | **Dấu**, Robert Huynh (solo). [Devpost](https://devpost.com/software/d-u-see-your-vietnamese-tones) · [site](https://dau.huynhrobert.com/) | Record a Vietnamese word, see your pitch curve against a native reference and the meaning your tone produced, and get a physical correction | Vietnamese learners | gpt-realtime-2.1, gpt-4o-transcribe, gpt-image-2 | "**Deterministic signal processing evaluates the tone, and GPT-5.6 coaches**"; when unclear, "asks the learner to try again rather than confidently giving the wrong answer." | Personal story; "deciding what AI should not do." |

**Finalists:**
- Bander: preview what an assistant will do before it touches your accounts.
- SayAhead: phone calls for Deaf users.
- OpenCounsel: source-verified legal briefs.
- ResearchOS: every claim traceable.
- Emberframe, GenUI, Vibe Signal, LabSpace AI, Tomok, Canopy, Encore!, O2.

## B5. GPT-6 Astra Projects: SF (Sep 8) and NYC (Sep 10), 2026

- **Official pages:** [SF gallery](https://cerebralvalley.ai/e/openai-gpt-6-astra-sf/project/gallery), [NYC gallery](https://cerebralvalley.ai/e/openai-gpt-6-astra-nyc/project/gallery).
- **Prizes (SF page):** 1st $50K credits plus DevDay 2026 tickets, 2nd $25K credits, 3rd $15K credits. The winners demo on stage for OpenAI judges.

| Event | Place | Project | What | Agent usage |
|---|---|---|---|---|
| SF | 1st | **CAD Sandboxes**. [GitHub](https://github.com/peytoncasper/cad-sandboxes) | Gives Astra a VM with Fusion 360 wrapped in an HTTP API plus a live workspace stream; split-screen TUI | **Computer/tool use on real CAD software** in a sandbox |
| SF | 2nd | **Homebuddy**. [GitHub](https://github.com/areibman/homebuddy) | Astra renders your rooms in 3D, models furniture from catalogues, and places it | Spatial reasoning plus tool calls |
| SF | 3rd | **Pearl Atlas Mode**. [GitHub](https://github.com/Pearl-Passport/pearl-atlas-mode) | A "Jarvis-like" voice travel explorer that books on your behalf | Voice agent with booking actions |
| NYC | 1st | **Astra HQ**. [GitHub](https://github.com/nathanjcx/ahq) | "You are the CEO of a team of AI employees working 24/7. Set the goal, watch them collaborate, and approve their work." | Multi-agent company with human approval |
| NYC | 2nd | **Counterfactual Worlds**. [GitHub](https://github.com/henryhehehe/GPT6-hack) | Teacher-guided 3D history investigations; students revise explanations from evidence | Uses Astra "native **mid-turn steering**" so the teacher redirects generation live |
| NYC | 3rd | **Method (Factorio)**. [GitHub](https://github.com/method-ai-hq/method-factorio) | "Using Astra to beat Astra": continuous policy search for long-horizon tasks | Self-improvement / search loop, evaluated on repeated runs |

Notable NYC finalist, **Mixtape**: a DJ companion that "never hears audio," reads measured instrument state, and answers with strict Structured Outputs. "The domain layer rejects every model command, so your hands stay authoritative."

---

# C. Google / Gemini

## C1. Gemini 3 Project (Devpost, online; winners announced ~mid-April 2026)

- **Official pages:**
  - [Devpost](https://gemini3.devpost.com/)
  - [Winners update](https://gemini3.devpost.com/updates) ("The moment you've been waiting (so patiently!) for…")
  - [Gallery](https://gemini3.devpost.com/project-gallery)
- **Scale:** 35,522 participants, 4,500+ submissions. Judging slipped from Mar 4 to Apr 1, Apr 8, then Apr 13–17.
- **Prizes:** $100K cash: Grand $50K, 2nd $20K, 3rd $10K, 10 Honorable Mentions at $2K.
- **Judging:** Technical Execution 40%, Innovation/Wow 30%, Impact 20%, Presentation/Demo 10% ("Have they included documentation or an architectural diagram?").
- **Judges:** Google DeepMind staff were on the panel.

| Place | Project | What it does | For | Stack | How it uses agents | Stood out |
|---|---|---|---|---|---|---|
| Grand Prize | **Globot**. [Devpost](https://devpost.com/software/globot-341w9q) · [GitHub](https://github.com/Vector897/Globot) | "Supply chain chaos into confident decisions in 60 seconds": rerouting cargo during a Red Sea crisis | Logistics and risk managers | FastAPI, **CrewAI**, React, Deck.gl 3D globe, Gemini 3 Flash, Gemini Vision, embeddings (RAG), ChromaDB, Clerk | A **5-agent reasoning engine**: Market Sentinel (news signals), Risk Hedger ($ impact), Logistics Orchestrator (replans routes), Compliance Manager (500-page insurance policies via 2M context), and **Adversarial Debate** ("red-team tests every decision to prevent AI hallucinations"). **Satellite imagery cross-verification**, "Human On The Loop," token-usage management UI. | A concrete dramatic scenario ("Friday at 4:55 PM, the Red Sea crisis erupts"), a 3D globe demo, and a visible multi-agent trace |
| 2nd | **Aegis: Autonomous Multi-Agent Crisis Command**. [Devpost](https://devpost.com/software/aegis-autonomous-multi-agent-crisis-command) · [GitHub](https://github.com/iamdanishm/aegis) | Triage for 911 overload in mass-casualty events | Emergency dispatch | Next.js, Google Cloud, Maps, Antigravity | Coordinator → Triage (physics and context reasoning) → Surveillance (drone images cross-checked with live Google Search) → Logistics (routing) → Reporter (audit-ready situation report). "Protocol Zero" gates high-stakes decisions for human approval. | Move "from Data Visualization to Autonomous Triage" |
| 3rd | **Netra**. [Devpost](https://devpost.com/software/netra-empowering-the-visually-impaired) · [GitHub](https://github.com/ZentraHost/netra_project) | Real-time vision for blind users: reads text, recognises faces, reads social cues ("a smile, a wave") | Visually impaired people | FastAPI, WebSockets, Web Audio, Gemini | Agentic mode, navigation search, persistent memory | Accessibility plus real-time. (The write-up addresses judges directly: "We have not built a simple wrapper around an API.") |
| HM | **AgentGuard**. [Devpost](https://devpost.com/software/agentguard-the-semantic-firewall-for-the-agentic-web) | "SSL for AI agents": a semantic firewall that tells good shopping agents from scrapers | Merchants | GCP, Gemini, React | Classifies agent *intent* in real time | Infrastructure for the agentic web |
| HM | **BatteryForgeAI**. [Devpost](https://devpost.com/software/batteryforgeai) | Battery defect vision, charging optimisation, fleet safety | Battery makers | **Google ADK**, PyBaMM physics sim, ChromaDB | Multi-agent specialist "experts" via ADK, grounded in physics simulation | Physics grounding |
| HM | **Logic Lift**. [Devpost](https://devpost.com/software/the-bunny-ear-adventure) | "Logic archaeology": recovers business rules from legacy COBOL into Python "with 100% parity" | Banks and legacy teams | Gemini 3, GCP | Autonomous recovery plus **parity verification** | Verification claim |
| HM | **PROCSee**. [Devpost](https://devpost.com/software/procsee) | "Turns your system into a crime scene — and autonomously investigates every process" | Security teams | Gemini 3 Pro, psutil, FastAPI | Autonomous multi-turn investigator agent | — |
| HM | **Proofy.AI**. [Devpost](https://devpost.com/software/fakey-ai) | Explainable deepfake and AI-text verification plus a browser extension | Everyday users | Gemini, React, Three.js | Verification pipeline | Personal story (mother nearly scammed) |
| HM | **Agent-weaver**. [Devpost](https://devpost.com/software/agent-weaver) | Gemini as 5 specialised coding agents (Architect, PM, Dev, QA, Reviewer) with **shared persistent memory** and human-verified annotations | Dev teams | **55 MCP tools**, tree-sitter AST indexing, Next.js | Multi-agent plus MCP plus memory plus human verification | — |
| HM | **Orphafold**. [Devpost](https://devpost.com/software/orphafold) | Rare-disease research agents over Orphanet, UniProt, PubMed and AlphaFold | Researchers | Google GenAI SDK | Multi-agent research orchestration | — |
| HM | **Orbital Assets** | NASA asteroid data turned into physics-based financial valuations | Novelty | Gemini 3 Flash Thinking | Reasoning plus deterministic rules | — |
| HM | **Gemini GeoFlow** | LLM pipeline for archaeological site datasets | Archaeologists | Gemini, Google Earth | Pipeline | — |
| HM | **CineStream** | A2A "intelligence mesh" plus cinematic learning videos | Education | A2A, Gemini 3 | Multi-agent (A2A) | — |

## C2. Gemini Live Agent Challenge (Devpost, Feb 16 – Mar 16, 2026)

- **Official pages:**
  - [Devpost](https://geminiliveagentchallenge.devpost.com/). The subtitle is "Redefining Interaction: **From Static Chatbots to Immersive Experiences**."
  - [Winners update with judge one-liners](https://geminiliveagentchallenge.devpost.com/updates/41944-announcing-the-challenge-winners)
- **Rules:** use a Gemini model; build with the **GenAI SDK or ADK**; deploy on at least one Google Cloud service.
- **Categories:**
  - **Live Agents**: real-time audio and vision that can be interrupted.
  - **Creative Storyteller**: interleaved text, image, audio and video.
  - **UI Navigator**: agents that see and act on screens.
- **Prizes:** $80K. Grand Prize is $25K plus a trip to Google Cloud Next. Each category best is $10K, three subcategory awards are $5K, and there are honourable mentions.
- **Judging:** Innovation & Multimodal UX 40% ("Does the project break the 'text box' paradigm?… Is the experience 'Live' and context-aware, or does it feel disjointed and turn-based?"). Technical Implementation & Agent Architecture 30% ("handle errors gracefully… avoid hallucinations… evidence of grounding?"). Demo 30% ("visual proof of Cloud deployment").
- **Organiser's closing line:** "You moved past the 'chat box' and proved that the next generation of software will see, hear, and interact right alongside us."

| Award | Project | What | Stack | Agent usage | Judge comment (verbatim) |
|---|---|---|---|---|---|
| Grand Prize | **ORION**, Operating Room Intelligent Orchestration Node. [Devpost](https://devpost.com/software/orion-operating-room-intelligent-orchestration-node) · [GitHub](https://github.com/adityashukla8/orion) | Voice-directed co-pilot for robotic surgeons whose hands are locked on the da Vinci controls: live data, phase detection, photo capture, drug checker, complication advisory, real-time op-note | ADK, Gemini Live API, Vertex AI, Cloud Run, FastAPI, WebSocket | A live voice agent plus **UI navigation by voice**, sub-agents (drug checker, pre-op briefing), real-time report generation | (Grand prize, no one-liner.) The problem framing is concrete: "Surgeon's hands locked in." |
| Best of Live Agents | **drone-copilot**. [GitHub](https://github.com/BryenInsights/drone-copilot) | Talk to a DJI Tello: "Take off," "What do you see?", inspection mission, auto-generated annotated report | Gemini Live API on Cloud Run, djitellopy, OpenCV | Voice leads to **tool calls that command the drone**, with the live video feed as perception | "A masterclass in real-time interaction and low-latency feedback." |
| Best Creative Storyteller | **Sankofa**. [GitHub](https://github.com/Jeremiah-Sakuda/Sankofa) | A multimodal "AI griot": turns family-history fragments into narrated, illustrated heritage stories with trust tags (Historical / Cultural / Reconstructed) | Google ADK, Next.js | Interleaved narration and images placed "at emotionally resonant moments" | "Beautifully executed interleaved output that weaves narrative and media into a single, fluid experience." |
| Best UI Navigator | **Moonwalk**. [GitHub](https://github.com/OactoDev/Moonwalk) | A conversational macOS desktop agent (browse, book, tutor) with a routing engine and 5 UI modals | Electron, Chrome extension, Gemini 3, Google Workspace | **Computer use** plus visual comprehension plus memory | "Achieving a level of visual precision in screen navigation that felt like magic." |
| Best Multimodal UX | **Wand**. [GitHub](https://github.com/fuyuan-li/gemini_live_agent) | Point at the screen with your hand and speak; a live agent browses and clicks with you | ADK, MediaPipe, OpenCV, **Playwright**, Cloud | Voice plus gesture plus **browser use** | "The 'barge-in' and visual context-awareness here was seamless." |
| Best Innovation | **Rayan Memory**. [GitHub](https://github.com/yelnady/rayan) | Point your camera at life; it builds a walkable 3D "memory palace" you can talk to | Two **persistent Gemini Live agents** running simultaneously (capture plus recall), Three.js, Firestore, Terraform | **Long-term memory agent** | "For pushing the 'beyond text' paradigm into entirely new territory." |
| Best Technical Execution & Agent Architecture | **JohnKeats.AI**. [GitHub](https://github.com/johnkeats-ai/johnkeats-ai) | A voice companion that "holds uncertainty instead of solving it," reading prosody (pauses, pitch) | Gemini 2.5 Flash Native Audio, ADK, Cloud Run, Firestore | A "governed calibration pipeline that learns from every conversation" | "A robust, elegant backend architecture that showed us how professional-grade agents should be built on Google Cloud." |

**Honourable mentions:** NagarDrishti, Ekaette, Vibe cat, Call My Parts, Relay (voice and vision electronics lab tutor).

## C3. Gemini 3 city projects (Cerebral Valley + Google DeepMind, one day each)

- **Official pages:** CV galleries at `cerebralvalley.ai/e/{slug}/project/gallery`. Slugs:
  - gemini-3-superhack (SF, Jan 31)
  - gemini-3-bengaluru-project (Feb 14)
  - gemini-3-tokyo-project (Feb 21)
  - gemini-3-seoul-project (Feb 28)
  - gemini-3-nyc-project (Feb 28)
  - gemini-3-singapore-project (Mar 7)
  - gemini-3-paris-project (Mar 14)
- **Prizes:** not stated on the CV pages.

| City | 1st | 2nd | 3rd |
|---|---|---|---|
| **SuperHack SF** (Super Bowl theme) | **Gemini5Head**: real-time overlays for esports livestreams that make it easy to get into the game | **SkyStudio**: 12 coordinated autonomous drones capture multi-view sports footage for NeRF; directors create "impossible" camera paths; integrates Genie 3 | **Lattice**: game-physics simulation and prediction engine |
| **Bengaluru** | **TryOnAI**: chat in any language, browse *any* e-commerce site, and see yourself wearing the product on the page ("no retailer integration needed"). Browser agent plus image generation. | **Zeppy**: a voice agent that phones businesses for you in any language | Text prompt to animated Manim math/physics videos with Gemini TTS, in regional languages |
| **Tokyo** | **food-fight-robots**: turns food photos into fighting robots (game) | **Kaiju Voice**: shout into the mic to attack; Gemini scores your voice on power, creativity and emotion; Imagen scenes; Lyria live BGM | **PrompDojo**: multiplayer prompt battle with Gemini as game master and judge |
| **Seoul** | **GeminiSpace** (Hard Tech track): panoramas become a floor plan, routing graph and voxel map; natural language becomes a **ROS2 Nav2 payload** for a real robot | **Korean LLM security arena**: computer-use attacks on web UIs; a self-evolving **4-agent "court"** (prosecutor, defence, jury, judge) updates defence rules; live leaderboard | **MangstoonAI**: 3 sentences become a 30-panel editable webtoon |
| **NYC** | **Wall Street Bananas**: a 1980s trading floor with 22 NPC traders who each have a personality, **persistent relationship memory** and an exploitable weakness; all assets generated with Nano Banana, Veo and Lyria | **What IF?**: an agent swarm studio for indie filmmakers, with git-versioned worlds | **ArtLens AI**: point your phone at an artwork and get a cinematic micro-documentary |
| **Singapore** | **DefaultTaste**: "agent taste profiling as a service"; probes a model many times to reveal its aesthetic biases, then outputs a correction prompt (eval-style meta tool) | **Krashless**: agentic road-safety prototyping over 3D maps and CCTV, with a **human-in-the-loop review panel**; a rejected proposal is regenerated with the engineer's constraint | 3D BTO housing brochure viewer (sunlight, views) |
| **Paris** | **AdSuperSense**: blends product ads into natural scene transitions (Nano Banana 2 plus Veo) | **ShareLock**: witness memories become a facial reconstruction, merging multiple accounts | **VibeCheck**: a Playwright agent walks any product's signup flow, and Gemini 3.1 Pro produces a design-analysis storyboard |

Notable finalists:
- **Please Pass** (Singapore): Gemini picks building-code clauses, then calls **deterministic check tools**. "Zero hallucinated numbers." A live agent activity trace inside Revit.
- **SaralPhone** (Bengaluru): a voice "dignity layer" over real Android apps for elderly users.
- **StateShift** (Paris): binary search over video with Gemini, cutting calls by 99%.

## C4. Zero to Agent: Vercel x DeepMind (Mar 21, 2026; SF, NYC, London)

- **Official pages:** CV galleries zero-to-agent-sf, zero-to-agent-nyc, zero-to-agent-london.

| City | Place | Project | What / agent usage |
|---|---|---|---|
| SF | 1st | **blartclaw**. [GitHub](https://github.com/bfay1/blartclaw) | Scrapes public livestreams, **spawns watcher sub-agents** per stream to find anomalies, and reports to an orchestrator that decides whether to call authorities |
| SF | 2nd | **PlushPilot**. [GitHub](https://github.com/cyu60/zero-to-agent) | For a **real 26-year-old plush company**: a conversational agent finds your logo, designs the custom plush, gives multi-angle views, a 3D model, and AR placement |
| SF | 3rd | **Watchlog**. [GitHub](https://github.com/dimikot/vercelhack) | Ingests Vercel production logs, detects errors with Gemini, and **opens GitHub PRs that fix them** |
| NYC | 1st | **Ashkan + U Jin** (NYC site evaluation). [GitHub](https://github.com/ashkanrdn/hh) | Agentic zoning analysis plus vision across 10+ data sources, to evaluate development parcels in minutes |
| NYC | 2nd | **Chattermint** | AI accent coach: wav2vec2 phoneme scoring (deterministic) plus a Gemini agentic coach that builds a practice sequence |
| NYC | 3rd | **Ansr** | A voice host that answers restaurant phones (ElevenLabs), with menu-photo setup and structured order extraction into a live dashboard |
| London | 1st | **Jargon AI** | A Research Agent maps competitors' employees and their top LinkedIn posts into a knowledge graph; a Content Agent plans and writes posts in each employee's voice from voice memos |
| London | 2nd | **Enginuity** | Chat or drawing to parametric CAD: an agent runs build123d tool calls (sketch, extrude, fillet) with a live 3D render and a visible agent trace |
| London | 3rd | **Blake** | Routes issues to the best engineer based on git ownership history |

## C5. Google I/O Project (May 23, 2026, SF)

- **Official page:** [CV gallery](https://cerebralvalley.ai/e/google-io-project/project/gallery). 152 projects.
- **Prizes:** 1st $7,500 plus a call with Google's AI Futures Fund; 2nd $5,000; 3rd $2,500; Best Use of Managed Agents $5,000.

| Place | Project | What / agent usage |
|---|---|---|
| 1st | **Billie Gene**. [GitHub](https://github.com/WeiningLi/billiegene) | A raw pathogen sequence runs through an **agent-driven scientific workflow** and yields research-stage mRNA vaccine candidates in about 10 minutes |
| 2nd | **Sky Guardian** | A Mavic maps survivors and hazards with Gemini; a Tello is **flown by a single Gemini 3.5 Live session** that sees through the camera and takes a remote dispatcher's voice commands |
| 3rd | **AgentGym** | An RL environment for training your managed agents "in your voice" |

**Finalists:**
- Autonomous Infrastructure Auditor: an orchestrator dispatches ADA specialist agents over real terrain data and Street View vision; agents negotiate compound fixes.
- Gemini Lifeguard Rescue (drones).
- Autonomous Android Player Fleet.

## C6. Google DeepMind Bangalore Project (Jul 11, 2026)

- **Official page:** [CV gallery](https://cerebralvalley.ai/e/google-deepmind-bangalore-project/project/gallery). 160 projects.

| Place | Project | What / agent usage |
|---|---|---|
| 1st | **Kahani**. [GitHub](https://github.com/harshagw/kahani) | A one-line idea becomes a full "game bible." The pixel-art world is generated screen by screen; the image model traces its own hotspots; NPC dialogue is voiced and refereed live (a "heat meter") |
| 2nd | **Nirman.AI**. [GitHub](https://github.com/Anikets08/Nirman.AI) | Upload a government construction blueprint. It gives a measurable 3D model and a **5-agent pipeline** reads, measures, prices (live ₹ rates) and writes a Bill of Quantities into Google Sheets: "a 15-day manual takeoff into a 3-minute autonomous one." "Never a detached chatbot"; it "says so instead of inventing" a missing dimension. |
| 3rd | **Parallax** | Director-authored adaptive cinema: Gemini Omni localises "adaptive slots" in a film within visual guardrails |

**Finalists:**
- MELA: offline on-device Gemma 4 lost-and-found for crowds.
- no-signal: an offline Sense → Decide → Act → Check diagnostic agent.
- StoreUp: talk your shop onto ONDC with Gemini Live.

---

# D. Meta: OpenEnv Project SF (Mar 7–8, 2026)

- **Official page:** [CV gallery](https://cerebralvalley.ai/e/openenv-project-sf/project/gallery). 104 projects.
- **Prizes:** $100K+ cash pool.
- **Judges:** from Meta, Hugging Face, UC Berkeley, Unsloth, Snorkel, Patronus, Scale AI, CoreWeave, Cursor and others.
- **Affiliation:** OpenEnv is, to my knowledge, Meta PyTorch's RL-environment spec with Hugging Face **[unverified; my search budget ran out before I could confirm]**.
- **Theme:** build RL environments and train agents.

| Place | Project | What / agent usage | Stood out |
|---|---|---|---|
| 1st | **Kube SRE Gym**. [GitHub](https://github.com/sid-rp/kube-sre-gym) | A self-improving RL environment where Qwen3-1.7B learns to fix **real** Kubernetes incidents on a live GKE cluster via kubectl. An **adversarial designer (Claude)** creates incidents targeting the agent's tracked weaknesses; a curriculum controller escalates difficulty; GRPO training; an LLM judge with 3 expert personas | "Within 8 episodes, the agent learned…" A real environment, and measured learning |
| 2nd | **Zero Shot Cancer**. [GitHub](https://github.com/mhtruong1031/OpenENV-Project/) | An RL environment for "autonomous biologist agents" with 40+ bioinformatics tools; rewarded on recovering a hidden "true" world state | Verifiable reward |
| 3rd | **ShopRLVE-Gym**. [GitHub](https://github.com/owlgebra-ai/ShopRLVE-Gym) | E-commerce RL environment with verifiable rewards (HF blog write-up) | — |

---

# E. Mistral Worldwide Project (Feb 28 – Mar 1, 2026; 7 cities plus online; global final Mar 9)

- **Official page:** [worldwide-project.mistral.ai](https://worldwide-project.mistral.ai). It lists prizes but no winners.
- **Scale:** 7,000+ applied, 1,000+ selected.
- **Prizes:**
  - Global: $10K cash, $15K Mistral credits, and a hiring opportunity.
  - Per city: $3K, $2K and $2K in credits.
  - Special awards: Best Use of ElevenLabs, Best Video Game (Supercell), **Best Use of Agent Skills**, Best Architectural Modification, and "next unicorns" VC pitch.
- **Partners:** NVIDIA, AWS, W&B, Hugging Face, ElevenLabs, Supercell.

**Global winner: NOT FOUND.** See the access table.

City winners I could find **[unverified]**:

| City | Project | What / agent usage | Source |
|---|---|---|---|
| Paris, 1st | **Veristral** (Estéban S., Emma Grospellier, Godefroy Meynard) | Real-time fact-checking of live TV political debates. It exploits the broadcast delay: Voxtral STT, then Ministral claim analysis, then web-search verification, orchestrated with **Temporal** workflows. | [LinkedIn post](https://fr.linkedin.com/posts/esteban25_1%C3%A8re-place-au-project-mistral-ai-de-paris-activity-7434874948776591360-uuNQ) |
| London, winners | **Mistralverse** (@therealoliulv, @GeorgeJeffersn, @artfreebrey) | "The first ever agentic civilisation": every citizen is an agent with land, money and opinions, and they democratically elected a Mayor | Search snippet of an X post (x.com/etnshow) |
| Showcased in recap | Brickstral (LEGO 3D builder), Dispatch Ops (AI emergency dispatch with live mapping), LACUNA (cross-lingual divergence explorer) | — | [twyoon.com recap](https://twyoon.com/writings/mistral-worldwide-project-2026-recap/) (placements unclear) |

---

# F. xAI

## F1. Grokathon London (January 2026, 12 hours) [unverified: X is blocked]

- **Prize:** a trip to watch a Starship launch at Starbase.
- **1st: "Grok for Mayor (of London)"**
  - Team: Oliver Ulvebne, George Jefferson, Artem Murzin, Andrew Jefferson. The same team won Mistral London.
  - What it does: an autonomous agent with "20 UK government APIs" and "9 MCP servers." It audits government spending ("DOGE for the UK"), fact-checks claims, and **autonomously generated 1,000+ campaign articles and captioned videos posted to X** on a schedule.
  - Scale claims: "15,000 lines of code in 7 hours"; "served 500k+ requests."
  - Sources: [LinkedIn](https://www.linkedin.com/posts/andyjefferson_great-write-up-of-how-we-won-the-grok-london-activity-7419019485975576576-hsDv); X post by Marios Karatzias (snippet).

## F2. SpaceXAI Grokathon SF (Aug 8, 2026, 12 hours, invite-only)

- **Official page:** [Devpost](https://spacexai-grokathon.devpost.com/). Criteria are verified; winners are from X and news **[unverified]**.
- **Organiser guidance (verbatim):**
  - "Twelve hours is short enough that the safe idea and the ambitious one cost about the same, so we'd love to see the ambitious one… If your one-line pitch sounds like something that already exists, there's probably a more interesting version of it."
  - Judging criteria: **Usefulness** ("Would a real person want this tomorrow, or is it a slide?… Solve an actual problem for someone specific, not a hypothetical one for everyone") and **Beauty** ("Taste, craft… The demo should feel considered, not assembled"). The body text also says "Technical complexity: show us the part that was hard."
  - "If it doesn't call our models, it doesn't get judged."

| Place | Project | What / agent usage |
|---|---|---|
| 1st | **Nova** (Theo C, Supratik Panuganti, Henry Zhang) | A harness that makes Grok an **active reverse-engineering agent**: binaries become clean C via Ghidra static analysis **plus live emulator testing that watches memory and auto-corrects**. Went from Game Boy ROMs (33–262 KB, e.g. Kirby's Dream Land) to a 1995 BMW ECU runtime, rendered as a 3D engine simulator. ([techiexpert](https://techiexpert.com/team-nova-won-spacexai-grokathon-with-ai-reverse-engineering-system/)) |
| 2nd | **Signal** | Embeds your followers' bios, posts and engagement into a graph, and **A/B tests launches on simulated populations of your followers** |
| 3rd | **ThinkVoice** | Grok Voice plus brain/motor sensing: it suggests what you might want to say and you select with subtle motor movements |

---

# G. Cerebral Valley: other 2026 agent projects

## G1. AI Engineer World's Fair Project 2026 (Jun 27–28, SF): theme "the edge of recursive self-improvement (RSI)"

- **Official pages:** [event](https://cerebralvalley.ai/e/aiewf-project-2026), [gallery](https://cerebralvalley.ai/e/aiewf-project-2026/project/gallery).
- **Scale and prizes:** 70 projects, $35K+.
- **Sponsors seen in winners:** DigitalOcean, Gemini, MongoDB + Voyage, LiveKit, MiniMax.

| Place | Project | What | How it uses agents | Stood out |
|---|---|---|---|---|
| 1st | **SplatForge**, Jay Trivedi and Shivam Singh. [GitHub](https://github.com/ShivamSinghNow/SplatForge) · [video](https://www.youtube.com/watch?v=MrdXQv5wlB4) | Point a phone at a tabletop and get a Gaussian-splat digital twin. A robot then **teaches itself** to pick up the mug in a MuJoCo physics replica. | A closed loop with no human: an LLM curriculum generates scenario variations; the policy attempts them; a **VLM critic gives a pass/fail verdict**; successes are distilled into a LoRA fine-tune; failures become the next curriculum via vector search. A live success-rate chart climbs during the demo. | Measurable self-improvement on screen. Honest separation of what they built versus off-the-shelf parts. |
| 2nd | **PodMan**. [GitHub](https://github.com/karti-ai/podman) | A coordination layer for human-plus-agent dev teams: watches teammates' screens with Gemini Vision and local git, and alerts before two people touch the same file | LiveKit presence, on-device Gemma reasoning, MongoDB traces, and a self-tuning nudge policy | "Not a coding assistant; a coordination layer that improves itself." |
| 3rd | **Rote**. [GitHub](https://github.com/gorajing/rote) | A self-improving **computer-use** agent. The first time, Gemini Computer Use drives the app live; Rote records the run, **compiles it into a reusable skill, verifies it against ground truth**, and later replays it "with zero model calls" | Computer use, a skill library, verification, and recovery from UI drift | Gets faster and cheaper the more it works |

**Finalists:**
- field-ratchet: a self-improving PCB placer that only promotes changes that improve the score, verified by an independent EMI solver.
- EvoLoRA: an auditable, bounded LoRA self-improvement loop.
- FocalPoint: eye-tracking reward agent rewrites its own system prompt.

## G2. MongoDB agent projects (with CV)

- **Agentic Orchestration & Collaboration** (Jan 10, SF): $30K across three final teams, plus a Coinbase x402 track. The gallery shows 6 finalists with no placements.
  - Mongrate: a multi-agent Postgres-to-MongoDB migrator with tests and a report.
  - SOGA: spawns coding agents by voice from smart glasses.
  - Watch and Learn: browser agents learn from demonstrations retrieved from MongoDB.
  - Polaris: live-CVE threat intelligence for agents.
  - EvacuTrace, JustPrice.
- **The Agentic Evolution Project** (May 2, London; £15K):

  | Place | Project | What / agent usage |
  |---|---|---|
  | 1st | **Plan Pass AI**. [GitHub](https://github.com/rostam-sodagari/Builder-AI.git) | Enter a UK postcode and your extension plan. A **team of agents** checks local council rules, and if non-compliant **automatically redesigns the layout**, with 2D/3D visuals. Saves a £5,000+ architect feasibility fee. |
  | 2nd | **RunwayOps**. [GitHub](https://github.com/Bividib/MongoDBProject) | Payroll-risk command centre for small businesses. Coordinates evidence from invoices, bank events and replies, then **recommends human-approved actions** (emails, holds, voice follow-ups). A MongoDB audit trail. |
  | 3rd | **Volt Control**. [GitHub](https://github.com/AyushGupta05/Frequency-) | Grid demand-response operator. Detects stress from live UK grid signals and retrieves similar historical states; **low-risk actions are auto-dispatched and high-risk ones need approval**; everything is logged. |

  A finalist that did **not** place was **Glass Houses**: "using a chatbot to ask question about the data." That is the only placed-or-finalist entry I saw framed as a chatbot.
- **Persistent Context Sprint** (Aug 13, SF; $15K):

  | Place | Project | What / agent usage |
  |---|---|---|
  | 1st | **Amelia for the Deaf**. [GitHub](https://github.com/borisnezlobin/mongo-hacks) | Phone listens to group conversations. Every line is tied to a person by **voiceprint**; it remembers people and **tracks promises both ways**; say her name and she answers from memory and can speak aloud for you. Claude, Fireworks memory extraction, SpeechBrain, ElevenLabs, Mentra glasses, Atlas Vector Search. |
  | 2nd | **TraceCase**. [GitHub](https://github.com/Carldtitan/Tracecase) | Reproduces "can't repro" customer bugs by testing environment combinations in parallel. LangGraph durable workflow: retrieval → plan → reproduce → repair → verify → review. Returns the exact environment, video and logs. |
  | 3rd | **Perpetual**. [GitHub](https://github.com/rohangandotra18/perpetual) | Turns your Claude conversations into skills and takes over when you repeat a task |

## G3. Notion Developer Platform Project (May 16–17, SF)

| Place | Project | What / agent usage |
|---|---|---|
| 1st | **Dunder Mifflin Infinity**. [GitHub](https://github.com/brian-w-zhang/dmi-notion) | A generative-agent simulation of *The Office* (after Park et al. 2023): Big Five personalities, memory retrieval, Sims-style needs. A Phaser 2D world is the "body"; Notion custom agents are the "mind + memory." |
| 2nd | **SnoopyAI** | A phone agent for owner-operated small businesses (dry cleaners): Twilio, Gemini Live, and **16 Notion Workers tools** that read and write orders live during the call. The owner's Notion is the dashboard. "Onboarding takes under 10 minutes." |
| 3rd | **Cerebro (Optemization)** | An autonomous team "second brain": auto-captures from Slack, email and meetings into a 12-database Notion knowledge graph; every answer is **cited back to the source message** |

## G4. Hospitality 2030: Rosewood Sand Hill (May 16)

| Place | Project | What / agent usage |
|---|---|---|
| 1st | **Red Thread**. [GitHub](https://github.com/benikigai/redthread) · live at app.redthread.boutique | "Agentic OS for luxury hospitality." A reservation streams **nine visible steps of real Claude work** (CRM, gated web research, flight API, Haiku reasoning passes) into a guest brief where **every line cites its source**. It then shows a real **two-machine A2A negotiation** between the hotel's agent and a guest's personal agent (published at `/.well-known/agent.json`). |
| 2nd | **Holograph** | Voice-first staff coordination with guest-controlled privacy |
| 3rd | **Rosewood Living Profile** | Consent-aware guest memory turned into staff workflows |

Finalist tagline worth noting: "Stop building chatbots — this agent orchestrates your entire hotel stay invisibly."

## G5. National Security Project, Army xTech (May 2–3, SF; top 5 share $50K cash)

| Place | Project | What / agent usage |
|---|---|---|
| 1st | **Gallatin**. [GitHub](https://github.com/gallatinai/xtech26/) | A **radio agent** (cloud or edge) that listens to all channels, transcribes, categorises and acts, "fully autonomously where appropriate and with human in the loop where needed." Integrated with Army Maven and Navigator. |
| 2nd | **CANOPY**. [GitHub](https://github.com/787-10/CANOPY) | Cross-domain space-threat attribution. **Three agents: one names the adversary, a red team challenges it, and a reconciler outputs calibrated confidence.** Grounded in orbital mechanics and doctrine with rules of engagement; runs on a Jetson; ships an **evaluation harness**; "every step is visible and traceable on screen." |
| 3rd | **AWW (Aim With Words)** | English-language targeting that shows its reasoning, crosses out what it excluded, and **waits for approval** |
| 5th | **Icarus** | An offensive security swarm (recon, classifier, exploit, report) on a shared blackboard, with a live dashboard of every agent's tool calls; dry-run by default |

---

# H. YC-hosted

## H1. Browser Use Web Agents Project at YC (Feb 28 – Mar 1, 2026) [unverified: secondary sources]

- **Scale:** 185 participants, 78 submissions, 42 judges, $180K+ in prizes. 1st place got a guaranteed YC interview.
- **Tracks** ([HackHQ case study](https://hackhq.io/customers/browser-use-project)): Top 3 Overall, Founders Prize, Best Infra, Best Devtool, Best Design, Best Use of Real-Time Data, Most Viral. Nine winners in total; I could only confirm 1st.
- **1st: Browser Brawl** (Mehul Kalia, Richard Hruby and team). [GitHub](https://github.com/RichardHruby/browser-brawl)
  - An arena where an **attacker browser agent** (Claude Sonnet 4.6 via Browser-Use, Playwright MCP or Stagehand) tries to finish a web task while a **defender agent** (Haiku 4.5) injects JavaScript to disrupt it, on real websites.
  - Every match records tool calls, DOM snapshots and screenshots. They **turned the traces into SFT data and fine-tuned Qwen2.5-3B** within 24 hours.
  - Stack: Next.js, Convex, Laminar tracing, Unsloth on Modal, vLLM.
  - Source: [MiniMax recap](https://www.minimax.io/news/minimax-ycombinator-project-building-the-future-of-web)
- **Organiser advice** ([Browser Use "How to win projects"](https://browser-use.com/posts/how-to-win-projects)):
  - "Start with a problem."
  - "Plan for a visual wow factor" because judges can't assess technical depth.
  - Mock non-core features.
  - "Reserve… ideally 20 minutes, to plan your demo."
  - Pitch → problem → solution → demo.

## H2. Other YC 2026 events (winners not verified)

- **Call My Agent Project** (AgentPhone, May 17): agents that act via phone, SMS, email and browser. 1st place got a YC interview. Winners not found.
- **Conversational AI Project** (Moss, Jun 6–7) and **Voice Agents Project** (Pipecat, May 30): winners not found.
- **"Vital Link"** (Ayaan Gazali and team): securely brings personal device health data into ChatGPT. Reported "$120,000 in prizes" and 1st overall at a YC project, early 2026 [unverified; event name not stated].

---

# I. Agent-tooling sponsors and large online competitions

## I1. GitLab AI Project (Devpost, Feb 9 – Mar 25, 2026)

- **Official page:** [GitLab winners blog](https://about.gitlab.com/blog/gitlab-ai-project-2026-meet-the-winners/) (Apr 22).
- **Scale:** ~7,000 developers, 600+ agents and flows on the GitLab Duo Agent Platform.
- **Prizes:** $65K. Co-sponsored by Google Cloud and Anthropic.
- **Judging:** technical, design, impact, idea.

| Award | Project | What | Agent usage | Judge comment |
|---|---|---|---|---|
| Grand Prize | **LORE: Living Organizational Record Engine**. [Devpost](https://devpost.com/software/lore-living-organizational-record-engine) | Gives a codebase memory: captures merge-request review decisions, runs "pre-mortems," enforces past feedback, stops repeated mistakes | **8 agents with intelligent routing and circular-loop prevention**, a 5-layer MR review, a memory system, and **43 unit tests** | "This feels like a product, not a project project." (April Guo, Anthropic). Organiser: "a project project with 43 tests is rare." |
| Google Cloud Grand | **Gitdefender**. [Devpost](https://devpost.com/software/gitdefender) | Helps OSS maintainers triage the flood of AI-generated MRs, from triage to merge | Custom flows plus IDE agents, Claude via AI Gateway, an online adaptive random forest | "It spots the bug, writes the fix, and opens the code review. No developer needs to step in." |
| Anthropic Grand | **GraphDev**. [Devpost](https://devpost.com/software/graphdev) | Codebase to semantic graph; structural impact analysis for every PR | tree-sitter, HDBSCAN/UMAP, Claude agent | "Loved the demo and UX, super useful for understanding how the system evolved and what gets impacted by changes." |
| Anthropic Runner-up | **DocSync** | Keeps documentation in sync with code | **Detector, Writer and Reviewer agents**. High confidence opens an MR; low confidence opens an issue for a human | — |
| Most Technically Impressive | **Time-Traveler**. [Devpost](https://devpost.com/software/time-traveler-w3cxp0) | Previews risky DB migrations on isolated Docker clones of production before merge | 5 agents, real Postgres migrations on GCP | — |
| Most Impactful | **RedAgent**. [Devpost](https://devpost.com/software/redagent) | "The adversary your agent needs before production does": validates AI security findings before developers see them | Adversarial testing agents | "closing the trust gap between AI findings and developer action" |

Also awarded: Aegis (Google runner-up), Launch Control (Easiest to Use), GreenPipe (Green Agent), and sustainability bonuses (BugFlow, DELTA, CarbonLint, TFGuardian).

## I2. Solo.io MCP & AI Agents Project (online, Feb – Apr 2026)

- **Official page:** [Solo.io blog](https://www.solo.io/blog/celebrating-the-winners-of-the-2026-project-for-mcp-ai-agents).
- **Tracks and winners:**
  - **Building Cool Agents: Frugalia** (Salvador Arreola). An agentic FinOps platform on kagent, kgateway and kmcp that "autonomously detects, analyzes, and resolves infrastructure waste in Kubernetes." Judge: "practical and impactful… continuously help teams optimize cloud resource spending."
  - **Explore agentregistry:** a multi-cluster inventory controller.
  - **Starter:** a vision agent with an ASL accessibility mode. Judge: "His demo definitely made me smile."
  - **Open Source Contributions:** 9 PRs to agentgateway.
  - **Secure & Govern MCP:** MCP governance scoring. Runner-up MCP.STORE enforces auth at the protocol level.

## I3. Microsoft Agents League (AI Skills Fest 2026; winners Jul 23, 2026)

- **Official page:** [MS Tech Community](https://techcommunity.microsoft.com/blog/educatordeveloperblog/%F0%9F%8F%86-agents-league-celebrating-the-builders-who-made-agents-battle-for-glory/4538007).
- **Scale and prizes:** 31,000 developers; 14 winners across 8 categories; $55K.
- **Tracks:** Creative Apps (GitHub Copilot), Reasoning Agents (Microsoft Foundry), Enterprise Agents (M365 Copilot / Copilot Studio).

| Award | Project | What / why (organiser text) |
|---|---|---|
| Best Overall ($15K) | **Afterlogin: The Hunt**. [GitHub](https://github.com/jlynch160/afterlogin-the-hunt) | "One engine, two faces": a cinematic SOC night narrative plus a coached security-training game. "Fused genuinely creative design with a real-world use case… executed both at a high polish level." |
| Best Reasoning Agent | **DELPHAI**. [GitHub](https://github.com/jlynch160/delphai) | An **11-agent reasoning council** that "checks the maths, explains the risk, and refines its own answer before responding" |
| Best Enterprise Agent | **Archon**. [GitHub](https://github.com/upgradedev/archon_azure) | A 7-agent financial-intelligence pipeline for SMBs, **inside Microsoft Teams** |
| Best Creative App | **StudyMate** | Your own notes become a gamified, story-driven revision session |
| Best Use of IQ Tools | **CivicGrant IQ** | Grant analysis with grounded citations, specialist agents, GraphRAG evidence, guardrails, **evaluation coverage** |
| Accessibility | CLARO, SchemeSaathi, Solace | CLARO "combined **deterministic public-benefit rules** with grounded bilingual reasoning" |
| Hack for Good | Tell My Day, BRIEF, ARGUS | ARGUS: "cited, auditable risk assessment" |
| Top Student | Athenaeum, Narrative Alchemist, CurriculumCraft AI | Athenaeum: "exceptional engineering discipline with a deep safety and test harness" (611 tests per the summary) |

The organiser's "Patterns Worth Stealing" section:
1. "Multi-agent orchestration beats the monolithic prompt… decomposition and self-verification win."
2. "Meet users where they already work."
3. Testing discipline: "evidence of engineering discipline stood out to judges."
4. Accessibility-first.

Also: "the **single biggest disqualifier was a missing demo video**, followed by no listed repository."

## I4. Amazon Nova AI Project (Devpost, Feb 2 – Mar 16, 2026)

- **Official page:** [gallery](https://amazon-nova.devpost.com/project-gallery). 13,413 participants.
- **Judging:** Technical Implementation 60%; Impact 20%; Creativity 20% ("innovative use of **multi-agent systems** to solve real-world problems").

| Award | Project | What / agent usage |
|---|---|---|
| 1st Overall | **BackstageCommercials** | Personalised ads embedded into the *background objects* of films and TV (YOLO segmentation, FLUX + LoRA, Nova Act) instead of mid-roll interruptions |
| 2nd Overall | **Oracus AI** | Type a company name. Nova web-grounding detects its market; 100 demographically modelled persona agents react to a proposed change; you get 14 metrics and a playbook in about 2 minutes |
| Best Agentic System | **Sai** | A voice-native macOS co-pilot that **sees the screen** (Nova Lite routing, Nova Pro vision) and operates any app with pyautogui/AppleScript, "No DOM needed" (e.g. reads a LeetCode problem, writes the solution, clicks Submit) |
| Best Multimodal Understanding | **Project Memoria** | Dementia assistant: recalls conversations, **finds lost objects** (YOLO + camera), grounded answers; Strands agents |
| Best UI Automation | **Title AI** | **Browser agents autonomously search any of ~3,600 US county recorder websites** (no APIs, CAPTCHAs, session state) and produce a full title commitment report, with human-in-the-loop |
| Best Voice AI | **Flare** | Detects AWS anomalies, **phones the on-call engineer** with a root-cause analysis, and stays on the line as a voice triage agent pulling live infra data (Nova Sonic, Amazon Connect) |
| Best Student App | **SpatialMath AI** | Flat maths questions become explorable 3D scenes |

Many "Bonus Blog Post Prize" winners were generic resume, interview and support assistants. My inference: that is where the "assistant" ideas landed, not the podium.

## I5. Agents Assemble: The Healthcare AI Endgame (Devpost, Mar 4 – May 11, 2026)

- **Official page:** [gallery](https://agents-assemble.devpost.com/project-gallery). 4,299 participants. Host: Prompt Opinion.
- **Required stack:** MCP, A2A and FHIR.
- **Judging:**
  - "The AI Factor: Does the solution leverage Generative AI to address a challenge that **traditional rule-based software cannot**?"
  - Impact.
  - Feasibility: "Could this exist in a real healthcare system today?… privacy, safety, regulatory."

| Award | Project | What / agent usage |
|---|---|---|
| 1st | **LookCloser**, by an ED shift clinician. [Devpost](https://devpost.com/software/lookcloser) | "A multi-agent safety net for incidental imaging findings, because 1 in 5 follow-ups never happen, and no rule engine can read a visit note to know why." Four agents (starting with a Significance Classifier) close the follow-up loop. Built on FastMCP, A2A, HAPI FHIR, Claude Code; published as an A2A marketplace listing. |
| 3rd | **Ctrl+Alt+Heal** | Clinical coding-gap detection (ClinicalBERT, negspacy) exposed via MCP on Cloud Run |
| HM (x9) | Pre-Round Brief, NEST, TrustedRisk, RootCause, Discharge Coordinator, FHIR Forge, MaternalGuard, PediRounds, AMDT | Almost all are **multi-agent A2A orchestrations over FHIR** with citations or grounding and approval-before-write (e.g. FHIR Forge: "clinician review… approval-before-write"). The 2nd-place project was not labelled in the gallery. |

## I6. UC Berkeley AI Project 2026 (Jun 20–21, in person; Cal Hacks team; Devpost)

- **Official page:** [gallery](https://ai-project-2026.devpost.com/project-gallery). 1,097 participants. This is the closest match to a large student in-person AI project.
- **Prize structure:** four grand-prize tracks (Ddoski's World / Toolbox / Lab / Playground) plus many sponsor prizes (Fetch.ai Agentverse, Browserbase, Redis, Arize, Claude, The Token Company, QNX, SkyDeck).

| Award | Project | What / agent usage |
|---|---|---|
| Grand Prize, World track | **Lucid Voice**. [Devpost](https://devpost.com/software/lucid-voice) | Two or three taps become a full sentence **in the user's own cloned voice**, adapted to who they're talking to ("sweetie" to a daughter, "mijo" to a grandson). A personal "brain" graph learns their style; **on-device and offline** (MLX, Gemma, Coqui XTTS, Kuzu graph, Redis vector search); Arize Phoenix evals. For people with aphasia, ALS or cerebral palsy. |
| Grand Prize, Toolbox track | **IronBook** | Preserves retiring machinists' knowledge as a queryable 3D model of the shop floor plus an AI agent that navigates it |
| Grand Prize, Lab track (+ SkyDeck Grand Prize) | **Theracat** | A wristband and plush cat that detect anxiety from movement (ESP32 accelerometer, ML features) and **intervene before a panic attack peaks**, voiced with Claude and ElevenLabs. Built by a former clinician. "There's no app to open… it acts first." |
| Grand Prize, Playground track (+ Best UI/UX) | **Paper Cuts** | Brings back play: drawings become generated animations (diffusion, LoRA, tldraw) |
| Hacker's Choice | **Inspector**. [Devpost](https://devpost.com/software/inspector-23ser6) | An **MCP server that lets your coding agent QA its own app**: launches it in an E2B cloud desktop, uses **computer use** to click through, splits the UI into regions with **one parallel agent each**, verifies findings with **2-of-2 replay agreement**, and returns a structured fix list |
| Best Use of Claude | **SafeStreets** | Spots a street hazard in imagery, **proves it with city data**, and hands you the fix, funding source, the right official, and a before/after render |
| Redis, Creativity, Technical (3 prizes) | **Forge** | Safety-net clinics build permanent, **verified** operational tools from plain language; gets smarter with every tool |
| Fetch.ai Agentverse (x9) | LifeLink, AgriBroker, baymax, AeroFreight, CareLoop and others | Swarms of uAgents that negotiate, allocate and pay (Stripe). Sponsor-track fodder, not grand prizes. |

---

# Patterns: what wins, and what gets dismissed as "just a chatbot or wrapper"

Evidence base: about 45 events, roughly 250 placed or finalist projects, plus organiser and judge quotes. The quotes below are verbatim. Everything under "My read" is inference.

## 1. A specific person with a specific painful workflow, ideally a domain expert on the team

**Evidence:**
- Anthropic's A1 and A2 winners, and OpenAI Build Week's first places, were overwhelmingly domain experts: a lawyer (CrossBeam), cardiologists (PostVisit, Pulse), a physician (Medkit), a repair technician (Wrench Board), a vet (veTriage), a CS professor (Maieutic), a carpenter's son (MaestrIA), an ED doctor (LookCloser), a hand surgeon (Surgical Triage), a mental-health clinician (Theracat).
- xAI's criterion: "Solve an actual problem for someone specific, not a hypothetical one for everyone."
- OpenAI: "people with expertise in other fields can turn what they know into working software."

**For us:** pick a user we can name (for example "SFU TAs grading labs" or "Burnaby small-restaurant owners"). Get a real quote, or a real document from them, and a number ("90% rejection rate," "15-day takeoff → 3 minutes").

## 2. The agent does real, checkable work, with verification built in and shown

**The top 2026 differentiator.** Winners build a second layer that *checks* the first:
- Verifier sub-agents in isolated contexts (Tekton).
- A verifier plus an adversarial agent, and accuracy compared with real elections (Sim Francisco).
- A citation registry the grader cannot go beyond (Medkit).
- "Never fabricates a reference designator" (Wrench Board).
- A red team plus a reconciler with calibrated confidence (CANOPY, Globot's "Adversarial Debate").
- 2-of-2 replay agreement (Inspector).
- Skills verified against ground truth (Rote).
- A VLM critic pass/fail (SplatForge).
- Reviewer agents that re-derive stress tests (NCypher).
- An 8-check integrity critic (Mobius).
- A 9-dimension eval on 12 real cases (MaestrIA).
- 43 tests (LORE), 611 tests (Athenaeum), 1,500 tests (Elisa).

**Judges said so:** "decomposition and self-verification win" (Microsoft). "Does the agent avoid hallucinations? Is there evidence of grounding?" (Google).

## 3. Deterministic core, LLM at the edges: constrain the model

**Evidence:**
- Every OpenAI Build Week top-two said this in their own words:
  - Pulse: "no LLM in the clinical loop."
  - Echo Canvas: "AI is most reliable as a constrained authoring and explanation layer."
  - Sentinel: "Constraining a model is harder than prompting one."
  - Dấu: deterministic DSP judges, the LLM coaches.
  - AirBridge: a policy layer verifies against the hardware.
  - Mechanica: the docent "declines to answer when the evidence is not there."
- Also Please Pass ("Zero hallucinated numbers") and Mixtape ("The domain layer rejects every model command").
- Human confirmation before irreversible actions recurs everywhere: Second Voice, veTriage, Twiage "single review and accept," AWW waits for approval, Volt Control auto-dispatches only low-risk actions, and Aegis has "Protocol Zero."

## 4. Beyond the text box: voice, vision, screen or browser control, physical hardware

**Evidence:**
- Google made it 40% of the Live Agent score: "Does the project break the 'text box' paradigm?"
- Winners fly drones (drone-copilot, Sky Guardian), drive surgical UIs by voice (ORION), click through browsers and desktops (Wand, Moonwalk, Sai, Title AI, Rote, Inspector, TryOnAI), operate lab instruments (Scopecreep), CAD (CAD Sandboxes, Enginuity), robots (GeminiSpace to ROS2, SplatForge), or wearables (Theracat, Amelia).
- In my keyword scan of all 2026 CV gallery blurbs (84 top-3 projects against about 2,765 others; rough signal, blurbs are truncated):
  - voice, speech or calls appear in **19% of top-3 projects vs 10% of the rest**;
  - 3D, drones, robots or hardware appear in **11% vs 6%**;
  - "chatbot" appears in **0% vs 0.6%**.

## 5. Multi-agent only counts when the roles mirror a real team and the trace is visible

**Evidence:**
- Placed projects map agents to real-world jobs:
  - ARIA's agents "pass the problem like a real maintenance team passes a ticket."
  - Twiage has Scribe, Vitals, Acuity and Routing.
  - Wrench Board has Scout, Registry, Writers and Auditor.
  - Globot has Sentinel, Hedger, Orchestrator, Compliance and Debate.
- Winners stream the trace on screen: "Every step is visible and traceable" (CANOPY); "nine steps of real Claude work stream into the dashboard" (Red Thread); agent trace panels in Enginuity and Please Pass.
- Caveat: the keyword "multi-agent" appears at the same rate in winners and non-winners (about 3.5%). The *count* of agents is not the differentiator; legible roles plus verification are.

## 6. At developer-heavy SF events, the 2026 frontier is self-improving loops, RL environments and agent evals

**Evidence:**
- The AIEWF theme was RSI; its 1st to 3rd were all closed improvement loops: SplatForge, PodMan, Rote.
- OpenEnv's winners were RL gyms with adversarial curricula.
- Browser Brawl (YC 1st) made adversarial agent traces into fine-tuning data.
- JetBrains' 1st was RL-guided code search with a verifier.
- GPT-6 NYC 3rd was "Using Astra to beat Astra."
- Others: DefaultTaste (Singapore 1st), Agent Arena (AIEWF).
- The hook is always **a curve that goes up during the demo**.

## 7. Meet users where they already are

**Evidence:**
- Winners live inside existing surfaces: SMS (Bel), WhatsApp (MaestrIA), the phone line (Snoopy, Ansr, Flare, Surgical Triage, Zeppy), Teams (Archon), Notion (SnoopyAI), GitLab MRs (LORE, Gitdefender), JetBrains (Scopecreep), Epic templates (Twiage), the Abridge care plan (HomeReady), and existing e-commerce sites (TryOnAI).
- Microsoft: "Winning agents reduce friction by integrating into existing workflows rather than asking users to adopt a new destination."

## 8. Craft, a demo video, and a one-line pitch are table stakes, not extras

**Evidence:**
- Microsoft: "the single biggest disqualifier was a missing demo video, followed by no listed repository."
- Rene (Opus 4.7): reserve "that entire last day just for producing the demo."
- xAI judges "Beauty… The demo should feel considered, not assembled."
- Browser Use: "Plan for a visual wow factor" and a one-sentence pitch.
- Gemini 3 scored 10% on docs and an architecture diagram.
- Planning-first recurs among winners: Tekton's PRD plus ~50 tickets, Maieutic's 2 days of spec, ARIA's full planning day.

## What gets dismissed, and why

These are inferences from who placed vs who didn't, plus organiser language.

**Generic "AI assistant / coach / Q&A over your data":**
- Glass Houses ("using a chatbot to ask question about the data") reached finalist but did not place.
- On Amazon Nova, resume tailors, interview coaches and support bots landed only "Bonus Blog Post" prizes.
- Google titled a whole challenge "From Static Chatbots to Immersive Experiences."
- Winners go out of their way to say they're *not* a chatbot: "never a detached chatbot" (Nirman.AI), "Not a survey. Not a poll" (Oracus), "It's not autocomplete" (Lucid Voice), "not a coding assistant" (PodMan).

**Impressive AI-built engineering with no human user:**
- Zeppelin (21K lines of Rust, TLA+ proofs, fully Claude-built) reached finalist but lost to CrossBeam, a lawyer's permit tool.
- Judges reward the *problem*, not the line count.

**Unconstrained autonomy on high-stakes decisions:**
- Every medical, security and military winner kept a human approval gate or kept the LLM out of the decision itself.

**Sponsor-track fodder:**
- At Berkeley, the nine Fetch.ai "agent swarm negotiates and pays" projects won the sponsor prize but none took a grand prize.
- Agent-to-agent commerce without a grounded user problem reads as a demo of the SDK.

**"Wrapper" smell:**
- A single model call behind a nice UI, with no tools, no state, no verification, and no domain data.
- The Gemini 3 third-place team felt it had to tell judges "We have not built a simple wrapper around an API."
- My read: judges now use "wrapper" as the default critique, and projects win by showing the parts a wrapper doesn't have: tools that touch the world, memory, a verifier, domain knowledge files, and evals.

## Quick checklist for our Edison idea

This is derived from the patterns above.

1. **User and number:** a named user, a quantified pain, and a real artifact (document, form, call, dataset) to demo on.
2. **Agent that acts:** tool calls that touch something real: a browser or desktop, a phone call, an API that writes, or hardware.
3. **Verifier:** a second agent, or deterministic checks that confirm the output. Show a pass/fail or accuracy number, and cite sources.
4. **Human gate** on the irreversible step.
5. **Visible trace** in the UI (agents' steps streaming), plus one "wow" visual (map, 3D, live video, or a curve going up).
6. **Beyond text:** voice or vision where natural.
7. **Planning:** an hour of spec and tickets up front, a demo video started early, a public repo, and an architecture diagram.
