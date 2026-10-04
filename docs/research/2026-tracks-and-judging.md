# 2026 projects: tracks, sponsor prizes and judging (plus Edison)

Research date: 2026-09-26. Edison is on **Oct 3-4, 2026**, one week from now.

This doc covers how tracks, sponsor prizes and judging are set up across 2026 student projects, and everything we could find on Edison. Other research docs list individual winners by region.

**How this was gathered**
- **Devpost pages:** read with WebFetch. WebFetch passes each page through a summariser, so text marked "verbatim" is what came back as a quote. Plain `curl` gets HTTP 403 from every `*.devpost.com` URL.
- **Exact prize wording:** one sub-agent re-read the MLH prize text through the Chrome extension (`get_page_text`) to get it word for word.
- **HackMIT 2026 guides:** read in full as Google Docs text exports.
- **Edison site:** a SvelteKit app. It was read through its JSON data files (`/data/faq.json`, `/data/sponsors.json`) and SFU Surge's public GitHub repos.

**Legend:**
- **[V]**: verified on the primary page.
- **[U]**: unverified or inferred.
- **(2025)**: an event from the 2025 calendar year, included because it is the latest edition.

---

## 0. TL;DR for our team

1. **Edison has published its judging criteria, but not its tracks or prizes.**
   - The 2026 Devpost lists four criteria, the same four as 2025 [V]: **Technical Complexity, Design, Pitch, Originality / Creativity**. No weights are given.
   - The theme is "Revealed during Opening Ceremony" [V].
   - The prize section says only "1 non-cash prize to be revealed" [V].
2. **The 2025 Edison judging format was short.** Each team gave a **3-minute live pitch plus 1 minute of Q&A**, to between 1 and 3 different judges, in the AQ South Hallway (2025) [V]. Plan for the same in 2026 [U].
   - "Pitch" is one of four criteria (a quarter if weighted equally [U]), and each judge gets about 3 minutes.
   - So the rubric rewards a tight, rehearsed, demo-first story more than hidden technical depth.
3. **Agentic AI is the headline 2026 trend in sponsor prizes, not in organiser tracks.**
   - Organiser tracks are still mostly Health, Sustainability, Education, Entertainment, Social good, Beginner, Hardware and Design.
   - Sponsors now routinely run "build an agent" prizes (at about 16 of the 28 events surveyed). Many of them explicitly penalise a "one-shot chatbot" or a "thin wrapper".
   - Several 2026 events added **anti-AI-wrapper prizes or rubric lines**:
     - Bitcamp: "Bitcamp Unwrapped"
     - SwampHacks: "Least Vibecoded"
     - QHacks: "Look beyond basic LLM implementation"
     - MLH guide: a project "should not be a reskin of an existing AI tool"
4. **MLH prizes are the cheapest to stack.**
   - Edison 2025 offered four: Gemini API, ElevenLabs, Snowflake and .Tech [V].
   - Hack the North 2026 is in the same MLH season as Edison (the 2027 season). It offered Gemini, ElevenLabs, MongoDB Atlas, Snowflake, Vultr, Tiger Data and GoDaddy [V]. Edison will probably get a similar set [U].
   - MLH's contest terms do **not** stop one project from winning several MLH categories [V].
   - For an AI-agent web app, the best combination is **Gemini API (the agent's LLM) + ElevenLabs (voice) + MongoDB Atlas (memory/state) + Snowflake Cortex (one extra LLM call) + a GoDaddy or .Tech domain**.

---

## 1. Tracks: taxonomy across 2026 events

### 1.1 Events surveyed (28)

These are the 2026 calendar-year events, plus the latest edition of the fall events whose 2026 edition has not happened yet.

| # | Event | Dates | Size | Organiser tracks / theme | Source |
|---|---|---|---|---|---|
| 1 | **Edison 2025** (SFU) (2025) | Oct 4-5 2025, 24h | 768 reg, 217 subs | No themed tracks. Category prizes only (see section 4) | https://Edison2025.devpost.com/ |
| 2 | **Hack the North 2026** (Waterloo) | Sep 18-20 2026, 36h | 1,045 | No tracks. "Finalists" (12) plus sponsor prizes | https://hackthenorth2026.devpost.com/ |
| 3 | **HackMIT 2026** | Sep 19-20 2026, 24h | 1,000+ | **Healthcare, Sustainability, Education, Interactive Media (Entertainment)**. At most 1 track per team | hackmit.org JS bundle; Hacker Guide Google Doc |
| 4 | **Cal Hacks 12.0** (2025) | Oct 24-26 2025 | 2,161 | Tags: Beginner, ML/AI, Open Ended. Prizes: Hardware, Most Creative, Greatest Social Impact, Beginner | https://cal-hacks-12-0.devpost.com/ |
| 5 | **UC Berkeley AI Project 2026** (Cal Hacks team) | Jun 20-21 2026 | 1,097 | 4 grand-prize tracks ("Ddoski's World, Toolbox, Lab, Playground", $5k each); UI/UX, Solo, Most Technical, Beginner, Hacker's Choice | https://ai-project-2026.devpost.com/ |
| 6 | **PennApps XXVI** (2025) | Sep 20-21 2025 | 257 | 14 categories: Transit, Privacy/Security, EdTech, Entertainment, Computer Vision, Blockchain, Statistics, Beginner, Design, AR/VR, Creative, Useless, Technical Complexity, AI | https://pennapps-xxvi.devpost.com/ |
| 7 | **TreeHacks 2026** (Stanford) | Feb 14-15 2026, 36h | 1,096 | Most Creative, Most Impactful, Most Technically Complex, Hardware, Beginner. Sponsor-run tracks: AI, Healthcare, Human Flourishing, Sustainability, Education, Edge AI, Inference, Cloud | https://treehacks-2026.devpost.com/ |
| 8 | **HackIllinois 2026** | Feb 27-Mar 1 2026, 36h | 678 | Two paths, General and "HackVoyagers" (experienced). Beginner, Most Popular, Social Impact, UI/UX, Most Creative, Most Useless | https://hackillinois-2026.devpost.com/ |
| 9 | **Hacklytics 2026** (Georgia Tech) | Feb 20-22 2026 | 729 | Finance, Sports Analytics, Healthcare, Entertainment, "Pure Imagination" | https://hacklytics-2026.devpost.com/ |
| 10 | **SwampHacks XI** (UF) | Jan 23-25 2026, 36h | 411 | Education/Accessibility/Social Impact, Sustainability, Game Design, Everyday Life & Wellbeing, Beginner, Hardware, Creative Media, User Design, "Least Vibecoded" | https://swamphacks-xi.devpost.com/ |
| 11 | **HackNYU Fall 2025** (2025) | Nov 15-16 2025 | 193 | Fintech, Entertainment, Education, Sustainability, Healthcare; First Time, Funny, "Best AI Wrapper Hack" | https://hacknyu-fall-2025.devpost.com/ |
| 12 | **Bitcamp 2026** (UMD) | Apr 10-12 2026, 36h | 662 | Hardware, First Time, UI/UX, Moonshot, Social Good, Gamification, Sustainability, People's Choice, "Bitcamp Unwrapped" (not an AI wrapper). Tracks: App Dev, Game Jam, Quantum, Data Science, ML | https://bitcamp-2026.devpost.com/ |
| 13 | **HackDavis 2026** | May 9-10 2026, 24h | 426 | Social Good, Beginner, Interdisciplinary, Hacker's Choice, Social Justice, Most Creative, Hardware, Most Technically Challenging, UI/UX, User Research, Entrepreneurship, Statistical Model | https://hackdavis-2026.devpost.com/ |
| 14 | **LA Hacks 2026** (UCLA) | Apr 24-26 2026, 36h | 974 | **Sustainability, Healthcare, Education, Productivity**; Organizers' Choice, Social Impact, UI/UX, Hardware, "Sponsormaxxing", "Most Questionable Use of 36 Hours" | https://la-hacks-2026.devpost.com/ |
| 15 | **HackPrinceton Spring '26** | Apr 17-19 2026, 36h | 410 | **Healthcare, Sustainability, Business & Enterprise, Entertainment & Media, Education**; Rookie, Hardware, Game | https://hackprinceton-spring-26.devpost.com/ |
| 16 | **HackPrinceton Fall 2025** (2025) | Nov 7-9 2025 | 596 | Healthcare, Sustainability, Business & Enterprise, Entertainment & Education; Rookie, Hardware, Best AI | https://hackprinceton-fall-2025.devpost.com/ |
| 17 | **MHacks 2025** (2025) | Sep 27-28 2025 | 380 | Greenprint (sustainability), Lifeline (health), Overdrive, Portal, Brainrot | https://mhacks-2025.devpost.com/ |
| 18 | **HackGT 12** (2025) | Sep 27-28 2025, 36h | 910 | Emerging (beginner); museum-themed tracks: Hall of Illusions, Curator's Cause (social good), Crypt of Data, Gadget Gallery (hardware) | https://hackgt-12.devpost.com/ |
| 19 | **Hack the 6ix 2026** (Toronto) | Jul 17-19 2026 | 389 | Hardware, Environmental, Beginner, People's Choice | https://hackthe6ix2026.devpost.com/ |
| 20 | **SpurHacks** (2025) | Jun 20-22 2025 | 902 | Venture, Startup and Hack tracks. Each has AI, Quantum, Web3, Solo, Hardware, "Best GPT-Wrapper", "Best Vibe Coded", Meme | https://spurhacks.devpost.com/ |
| 21 | **nwHacks 2026** (UBC, Vancouver) | Jan 17-18 2026, 24h | 631 / 169 subs | Design, Beginner, Game, Potential Community Impact (accessibility), Team Choice | https://nwhacks-2026.devpost.com/ |
| 22 | **UofTHacks 13** | Jan 16-18 2026, 36h | 520 / 160 | Theme **"Identity"** [U, inferred from winners]; Beginner, Best UofT, Hardware, Ignobel | https://uofthacks-13.devpost.com/ |
| 23 | **McHacks 13** | Jan 17-18 2026, 24h | 485 / 127 | No theme; People's Choice, Beginner, Design, "Chaotic Evil" | https://mchacks13.devpost.com/ |
| 24 | **DeltaHacks 12** | Jan 10-11 2026, 24h | 521 / 144 | Accessibility, Environmental, Health (plus a "positive change" framing) | https://deltahacks-12.devpost.com/ |
| 25 | **ConUHacks X** | Jan 24-25 2026, 24h | 877 / 260 | Hardware, Beginner (plus a sponsor-heavy prize list; pool $41k CAD) | https://conuhacks-x.devpost.com/ |
| 26 | **QHacks 2026** | Feb 6-8 2026, 36h | 225 / 77 | Theme **"The Golden Age"** (quality of life for vulnerable communities / aging industries) | https://qhacks-2026.devpost.com/ |
| 27 | **JourneyHacks 2026** (SFU Surge, beginner, 12h) | Jan 10 2026 | 222 / 59 | Best UI, Best Pitch, Surge Choice, Lone Wanderer (solo) | https://journeyhacks2026.devpost.com/ |
| 28 | **HackCamp 2026** (nwPlus, UBC; upcoming) | Nov 7-8 2026 | - | "learn, connect, and build with AI"; Most Accessible Design, Best Problem-Solution Fit, Best Design, nwChoice, Hardware | https://hackcamp-2026.devpost.com/ |

Not covered:
- **Cal Hacks 13.0** (Oct 2026, Palace of Fine Arts, 36h, $100k pool) has not published tracks yet ("Sponsors coming soon", calhacks.io).
- **PennApps 2026** and **MHacks 2026**: no 2026 page was found.
- **HackGT 13**: not checked.

### 1.2 Taxonomy with rough frequencies

The counts are the number of the 28 events above where the category appears **as an organiser track or organiser category prize**. The "+S" column is the number of extra events where only a sponsor offers it. The counts are approximate: names vary, and some pages were only partly readable.

| Category | Organiser count (/28) | +S | Examples of names |
|---|---|---|---|
| **Beginner / first-time / rookie** | ~21 | - | Best Beginner (usually "at least half the team first-timers"), Emerging, Rookie, First Time |
| **Hardware** | ~15 | +2 | Best Hardware Hack, Gadget Gallery |
| **People's / Hacker's / Organisers' choice** | ~11 | - | Surge Choice Award, Team Choice, nwChoice, Most Popular |
| **Design / UI/UX** | ~12 | +1 | Best Design, Best UI/UX, User Design, User Research |
| **Sustainability / climate / environment** | ~12 | +2 | Sustainability, Environmental, Greenprint, UN SDGs, Green AI |
| **Health / wellness / healthcare** | ~11 | +4 | Healthcare, Lifeline, Catalyst for Care, Everyday Life & Wellbeing |
| **Social good / impact / community** | ~10 | +2 | Social Impact, Social Good, Curator's Cause, Human Flourishing, Social Justice |
| **Entertainment / games / media** | ~10 | +2 | Best Game, Interactive Media, Game Jam, Gamification, Creative Media |
| **Silly / useless / meme** | ~9 | - | Rube Goldberg, Most Useless, Brainrot, Ignobel, Chaotic Evil, Most Questionable Use of 36h |
| **Education** | ~8 | +1 | Education, EdTech, Light the Way |
| **AI / ML (organiser-run)** | ~7 | many | Best AI, ML track, AI track (TreeHacks, via OpenAI) |
| **Creativity / "most creative"** | ~6 | - | Most Creative, Moonshot, Razzle Dazzle |
| **Data / analytics / statistics** | ~5 | +2 | Statistics, Crypt of Data, Data Science, Statistical Model |
| **Fintech / finance / business** | ~4 | +8 | Business & Enterprise, Fintech, Finance. Capital One, National Bank, CC&L and Visa run most of these |
| **Accessibility** | ~4 | - | Most Accessible Design, Accessibility, Community Impact |
| **Most technically complex** | ~4 | - | Most Technically Complex / Challenging, Most Technical Hack |
| **Solo** | ~4 | - | Best Solo Project, Lone Wanderer |
| **Entrepreneurship / startup** | ~4 | +6 | Most Likely to Become a Startup, Entrepreneurship. Sponsor versions: YC, Neo, Human Capital, Telora, SkyDeck |
| **Developer tools** | ~0 | +6 | Almost always **Warp "Best Developer Tool"** (HTN, HackMIT, Hack the 6ix, HackGT, nwHacks, TreeHacks). Also Stripe Best Web API |
| **Security / privacy** | ~1 | +5 | 1Password Best Security Hack, CSE, D3 Security |
| **Productivity** | 1 | +3 | LA Hacks "Flicker to Flow"; Ramp "Save time, save money" |
| **AR/VR / portable / wearable** | ~3 | +1 | AR/VR, Portal, ColorStack Most Portable |
| **Web3 / blockchain** | ~2 | MLH Solana almost everywhere | |
| **Quantum** | 2 | - | SpurHacks, Bitcamp |
| **Anti-AI-wrapper / anti-vibe-coding** | ~3 | - | "Bitcamp Unwrapped", "Least Vibecoded", and QHacks' rubric line. The ironic versions ("Best GPT-Wrapper", "Best AI Wrapper Hack", "Best Vibe Coded") appear at 2 events |

**What this means:**
- Across the whole scene, the most common named themes are **Health, Sustainability, Education and Entertainment**. HackMIT, LA Hacks and both HackPrinceton editions use nearly this exact set.
- **Social good / impact** is the next most common.
- **Beginner, Hardware, Design and People's Choice** are near-universal category prizes.
- **"Most technically complex" as its own prize is uncommon**; complexity is usually a judging criterion instead.

### 1.3 New in 2026: agentic AI, voice, MCP, local AI

**Agent prizes (sponsor-run) appeared at about 16 of the 28 events.** Most striking examples:

| Event | Agent-oriented prize (sponsor) | Requirement snippet |
|---|---|---|
| Hack the North 2026 | Rox **Best AI Agent** ($10k / $2k) | "systems leveraging LLMs operating on real-world, messy data taking meaningful actions" |
| Hack the North 2026 | Cloudflare **Best Agent with a Brain** | "agent doing more than chat; memory, tools, state, workflows, real-world actions powered by Cloudflare Workers" |
| Hack the North 2026 | Elastic "Find the Signal"; Huawei **openJiuwen Multi-Agent**; Composio; Federato insurance agent; RBC agent via **MCP**; Browserbase web agents | Multi-agent "genuine agent collaboration—task decomposition, communication, tool use, coordination" |
| HackMIT 2026 | Maximor **Build an Agent for Financial Workflows** ($4k/$2k/$1k + fast-track interviews) | "A one-shot chatbot, extraction pipeline, or hard-coded accounting workflow is not enough." Wants multi-step reasoning, learning from previous runs, human review when uncertain |
| HackMIT 2026 | ElevenLabs Challenge | "Agentic Depth: Does the project go beyond simple text-to-speech? We prioritize autonomous agents…" |
| HackMIT 2026 | Dimensional (agentic robotics), Meta "Muse" connectors, Dropbox "files into action" agent, Deepgram voice | |
| TreeHacks 2026 | Anthropic **Best Use of Claude Agent SDK**; Greylock **Best Multi-Turn Agent**; Elastic **Best End-to-End Agentic System**; Fetch.ai Agentverse (best agent / multi-agent / monetised agent); Warp Agents; Decagon conversation assistant; Zingage **Voice AI for Healthcare** | |
| Cal Hacks 12.0 (2025) | Fetch.ai (weighted: Functionality 25, Fetch tech 20, Innovation 20, Impact 20, UX 15); Letta **stateful agent** (Memory 35, Tech 25, Impact 25, Demo 15); Elastic Agent Builder exposed **via MCP**; Creao "Smartest AI Agent" and "**Best MCP Integration**" | |
| Berkeley AI Project 2026 | Claude (health/education/economic opportunity with Claude Code); Fetch.ai Agentverse ("more than a chatbot or a thin wrapper around an API"); Browserbase; Orkes; Band ("at least 2 agents collaborating"); Pika **MCP** | |
| UofTHacks 13 | Foresters **"The Multi-Agent Mind"** ("Orchestrate 3+ specialized agents"); Backboard adaptive memory / model switching | |
| McHacks 13 | Botpress "Best Use of AI / AI Agents"; Athena AI agent for students; Gumloop; MLH **Auth0 for AI Agents** | |
| SwampHacks XI | Morgan & Morgan: AI **orchestrator** routing to specialist agents (including a Voice Bot Scheduler) with swipe accept/reject feedback | |
| HackPrinceton S26 | Eragon "Build What Actually Runs Monday" (**30% Depth of Action, 30% Context Quality, 40% Workflow Usefulness**); Photon agents in iMessage; Dedalus **Agent Swarm** | |
| LA Hacks 2026 | Fetch.ai Agentverse (the 2027 site makes Agentverse a 5th main track); Cognition "make AI coding agents measurably more capable"; MLH Auth0 AI Agents | |
| Bitcamp 2026 | Microsoft "TerpAI Ultimate Agent Showdown"; "Neelbauer Agentic Revolution Award" | |
| Hack the 6ix 2026 | Phoebe "AI to Coordinate the Real World"; Backboard multi-agent; ElevenLabs "autonomous agents beyond simple TTS" | |
| HackGT 12 / MHacks 2025 | Cedar agentic copilot, Mastra agents / Fetch.ai, AgentMail, **Solana MCP** | |

Other 2026 patterns:
- **Voice AI is everywhere.** ElevenLabs is an MLH or sponsor prize at almost every event. HackMIT and the Berkeley AI Project also ran Deepgram prizes. At the Canadian winter events, voice agents were common among winners (per the Canadian-events sub-agent).
- **MCP is explicitly named at about 5 events:** HTN 2026 (RBC, Sentry, Zip), Cal Hacks 12 (Elastic, Creao "Best MCP Integration"), Berkeley AI (Pika MCP) and MHacks (Solana MCP). It is usually a way to integrate rather than a track of its own.
- **Local and edge AI:** QNX (at 4 events), ASUS GX10 (LA Hacks), Zetic on-device, NVIDIA Edge / DGX Spark, Qualcomm / Arduino UNO Q and Tether local AI.
- **Coding-agent prizes:** Cognition Devin (HTN, HackMIT, Berkeley AI, LA Hacks); OpenAI "Codex as 5th teammate" (HTN, HackMIT); Warp.
- **LLM cost and ops:** The Token Company (HackMIT, Berkeley AI), Arize, Sentry "AI monitoring".
- **Startup-outcome prizes:** YC interviews, Human Capital $50k per person, Neo, Telora $40k, SkyDeck.
- **Devpost AI Trends Report 2026:** reports that "1 in 4 community project submissions is agentic" (https://info.devpost.com/blog/devpost-ai-trends-report-2026; quoted by a sub-agent, not re-checked [U]). An agent alone no longer stands out; what counts is the *depth* of the agent (tools, memory, real actions, evaluation).

---

## 2. Sponsor prizes

### 2.1 MLH prizes: frequency and requirements

MLH's official catalogue is at https://www.mlh.com/events/prizes (hack.mlh.io/prizes redirects there; mlh.io/prizes returns 404).

"Freq." is how many of the ~24 MLH-member events surveyed offered the prize (approximate).

| MLH prize | Freq. | Prize | Official text (key sentence) | Minimum to qualify [U, inferred] |
|---|---|---|---|---|
| **Best Use of Gemini API** | ~21 | Google swag kit / mechanical keyboards | "Check out the Gemini API to build AI-powered apps that make your friends say WHOA." | At least one Gemini API call that matters to the product. Free key from AI Studio. Some events ran a **Gemma** variant (LA Hacks, BearHacks) |
| **Best Use of ElevenLabs** | ~20 | Wireless earbuds / AirPods | "Deploy natural, human-sounding audio with ElevenLabs… give your project a voice" | ElevenLabs TTS or Conversational Agent producing audio in the demo. MLH gives a 3-month free subscription code during event week |
| **Best Use of Snowflake API** | ~14 | Arduino Tiny ML Kit / Raspberry Pi 4 | "…can be as simple as a single CURL command to Snowflake's REST API" (120-day student trial) | One Snowflake Cortex LLM REST call |
| **Best Use of Solana** | ~15 | Ledger Nano S Plus | "Harness Solana's… fast execution and near-zero transaction costs" | A devnet program or transactions. Poor fit for an agent unless it involves payments |
| **Best Use of MongoDB Atlas** | ~11 | M5GO IoT kit per member | "Build a hack using MongoDB Atlas" ($50 credit or free tier) | Atlas free-tier cluster as the app's database (agent memory, logs, state) |
| **Best Use of Vultr** | ~10 | Portable screens | "Take your next hack to the cloud with Vultr" | Host the backend or model on Vultr |
| **.Tech domain** | ~9 | Desktop mic + 10-yr .tech domain | "Win a .Tech Domain Name for up to 10 years" | Register a .tech domain at get.tech/mlh with the event promo code. The prize goes to the *most creative* domain |
| **GoDaddy Registry domain** | ~8 | Digital gift card | "Register your domain name with GoDaddy Registry for a chance to win" | Register a domain through mlh.link/GoDaddyRegistry with the promo code |
| **Auth0** | ~5 | Wireless headphones per member | "…use any of the Auth0 APIs" | Auth0 login on the app |
| **Auth0 for AI Agents** (new 2026) | ~4 | Varies | "most innovative implementation of Auth0 for AI Agents… secure agent-to-user interactions" | Token Vault or user-scoped agent auth. **Fits an AI-agent project naturally** |
| **DigitalOcean (Gradient AI)** | ~6 | Retro mouse | Droplets / App Platform / Gradient AI; $200 credits | Deploy on DigitalOcean |
| **Presage** | ~4 | Fitbit + credits | Camera-based heart rate / breathing / emotion SDK | Use a Presage SDK. Good for health or wellness |
| **Cloudflare** (AI) | ~2 | Arduino kit | "Deploy AI using Cloudflare Workers AI" (HackGT, MHacks) | Workers AI |
| **Tiger Data** (new, 2027 season) | 1 (HTN 2026) | Stream Deck Mini | "most innovative, impactful, and performance-driven use of Tiger Data" | Tiger Cloud (TimescaleDB) |

**MLH set for Edison [U]:**
- Edison 2025 offered **Gemini API, ElevenLabs, Snowflake API and .Tech** [V].
- Hack the North 2026 is the closest comparable event in the current season. It offered **ElevenLabs, Gemini (2 winners), Tiger Data (2), Vultr, Snowflake, MongoDB Atlas (2) and GoDaddy Registry** [V].
- Expect Edison to fall somewhere between these two sets.

**Rules on stacking:**
- **MLH Contest Terms** (https://github.com/MLH/mlh-policies/blob/main/contest-terms.md): "Individuals and Teams are limited to one (1) Application for each Category in each Event." Nothing stops one project from winning several MLH categories [V].
- **MLH Organizer Guide:** recommends organisers let teams submit to multiple challenges [V].
- **How MLH categories are judged:** equally on **Technology, Design, Completion and Learning**. The rules explicitly *exclude* "How well you pitch" and "How good the idea is" (MLH Standard Project Rules) [V]. So MLH judges want to see the sponsor tech working, not a pitch.
- **Code must stay public** after the event to remain prize-eligible (MLH rule 13) [V].
- **Caps set by organisers vary:**
  - PennApps: max 3 tracks, MLH not counted.
  - HackIllinois: max 2 organiser + 3 company prizes, with MLH unlimited.
  - HackDavis: max 4 tracks, excluding MLH and sponsor tracks.
  - Bitcamp: 3 Bitcamp + 2 sponsor + 1 track challenge.
  - Hack the North: sponsor prizes must be selected by Saturday 2 PM.
  - Edison 2025 published no cap [U].
- A sub-agent saw one small Aug 2026 event (305 HackFiesta) require an extra **MLH-side opt-in submission** for the Gemini prize. Watch for this at Edison [U].

### 2.2 Company prizes that recur in 2026

| Company | Where seen | Typical requirement |
|---|---|---|
| **Warp: Best Developer Tool** | HTN 26, HackMIT 26, Hack the 6ix 26, HackGT 12, nwHacks 26, TreeHacks 26 (Warp Agents) | Improve any part of the developer lifecycle. Using Warp is *not* required. Prize: Keychron keyboards |
| **Fetch.ai (Agentverse / ASI:One)** | Cal Hacks 12, Berkeley AI, TreeHacks, LA Hacks, MHacks | Register an agent on Agentverse, discoverable via ASI:One, that takes real action. Cash $500-$2,500 |
| **Cognition (Devin)** | HTN 26, HackMIT 26, Berkeley AI, LA Hacks | Build with Devin; $5k in credits or cash |
| **OpenAI (API + Codex)** | HTN 26, HackMIT 26, TreeHacks, HackIllinois | Use the OpenAI API, and in the demo show one concrete way Codex helped |
| **Anthropic / Claude** | Cal Hacks 12 (tungsten cube + $5k credits), Berkeley AI ($5k credits), TreeHacks (Agent SDK, Human Flourishing), HackDavis ($750 credits), HackMIT top prize option (Claude Max) | Creative, impactful use of Claude / Claude Code / Agent SDK |
| **Elastic** | HTN 26, HackMIT 26, TreeHacks, Cal Hacks 12 | Agentic system with Elasticsearch as the context layer |
| **Browserbase** | HTN 26 ($2k), Berkeley AI, TreeHacks | Web agent automating work for humans |
| **Backboard.io** | HTN 26, UofTHacks, Hack the 6ix, HackDavis | AI memory and model routing |
| **QNX** | HTN 26, Berkeley AI, Hack the 6ix | AI in an embedded real-time OS (hardware) |
| **Capital One (Nessie)** | PennApps, HackGT, SwampHacks, HackIllinois, Bitcamp | Finance hack |
| **Huawei** | Edison 2025 (2 challenges), HTN 26 (multi-agent, OMNI) | Algorithmic or agent challenge statements |
| **Modal, Runpod, Deepgram, Sentry, Regeneron, Visa, YC, 1Password** | Several events each | See the event rows in section 1.3 |

### 2.3 What stacks cheaply onto one AI-agent web project

Proposed baseline: a **Next.js on Vercel** app with an **agent loop** (LLM + tools) and a **voice** front end.

| Add-on | Effort | Prize(s) it unlocks | Notes |
|---|---|---|---|
| Use **Gemini** as (one of) the agent's LLMs | Low (swap model or add a route) | MLH Gemini | The most common MLH prize. If we prefer Claude or OpenAI for the core, use Gemini for a visible sub-task such as vision or summarisation |
| **ElevenLabs** TTS or Conversational Agent for the agent's voice | Low-Med | MLH ElevenLabs; also ElevenLabs' own "agentic depth" criteria where offered | A voice demo also helps the 3-minute pitch |
| **MongoDB Atlas** for agent memory, run logs and user data | Low | MLH MongoDB | Free tier. Also shows "memory/state", which agent prizes like to see |
| **Auth0** login; **Auth0 for AI Agents** if offered | Low (login) / Med (agent tokens) | MLH Auth0 / Auth0 AI Agents | Letting the agent call third-party APIs *on the user's behalf* via Auth0 Token Vault is a strong fit if that category is offered |
| **.Tech or GoDaddy domain** pointed at the Vercel deploy | ~10 min | MLH .Tech / GoDaddy | Needs the event promo code; the prize is for the most creative name |
| **Snowflake Cortex** REST call (e.g. classification or summary step) | Low | MLH Snowflake | One cURL call counts |
| **Vultr / DigitalOcean** hosting for a backend worker | Low-Med | MLH Vultr / DO | Only if offered. Otherwise Vercel (a Edison sponsor) is fine |
| **Cloudflare Workers AI / Agents** | Med | MLH Cloudflare, or a Cloudflare "Agent with a Brain" prize | Only if offered |

Caveats:
- MLH judges score Technology, Design, Completion and Learning, and sponsors increasingly check "the sponsor's tech or just the sponsor's logo" (Lauren Lee, dev.to, Sep 2026, via sub-agent [U]).
- So every stacked integration must be **visible in the demo and in the repo**. Two or three real integrations beat seven token ones.
- The overall-prize rubric still dominates.

---

## 3. Judging

### 3.1 Criteria published in 2026 rubrics

| Event | Criteria (verbatim names) | Weights | Format / time |
|---|---|---|---|
| **Edison** | Technical Complexity; Design; Pitch; Originality / Creativity | none stated | TBA (see section 4) |
| **HackMIT 2026** | Innovation; Technical Complexity; Impact; Learning & Collaboration | **30 / 30 / 30 / 10** | Expo judging 12-2:30 PM, presentations "ideally 5-7 minutes", then **panel judging** of selected teams; 2 judging zones |
| **Hack the North 2026** | WOW factor; Technical ability; Originality; Design | none | Round 1: judging rooms, **5 min** live demo ("not a slide show, product pitch"). Round 2 (top 2 per room): expo, 4 min demo + 1 min Q&A. 12 "Finalists" |
| **Cal Hacks 12.0 / Berkeley AI 2026** | Application; Functionality/Quality; Creativity; Technical Complexity | none | **2-min pitch + 2-min Q&A** at the table; recorded video required |
| **TreeHacks 2026** | Creativity; Technical Complexity; Social Impact | none | not stated |
| **LA Hacks 2026** | Technical Depth; Product Thinking & Impact; Execution & Polish; Originality & Insight | none | In person; 2-3 min video |
| **HackPrinceton S26 / F25** | Creativity; Utility; Charity; Avidity | none | **2-min** in-person presentation; initial + final rounds |
| **SwampHacks XI** | Technical Execution; Innovation & Creativity; Impact & Purpose; Clarity & Communication; Completion & Scope; Track relevance | none | **Expo** at tables |
| **Bitcamp 2026** | Technical Difficulty ("just some lipstick on an API?"); Originality; User Experience | none | In-person demos |
| **Hacklytics 2026** | Creativity; Impact; Scope & Technical Depth; Clarity; Soundness & Accuracy; Video | none | 2-min video |
| **Hack the 6ix 2026** | Technical Difficulty; Uniqueness ("or commonly seen at projects?"); Design; Completeness | none | In-person pitches, video required |
| **MHacks 2025** | Innovation; Technical Complexity; Usability; Adherence to Theme | none | - |
| **PennApps XXVI** | Technology; Design; Completion; Learning (MLH standard) | none | 1-min video |
| **McHacks 13** | Execution; Technical Complexity; Impact; Creativity ("Has this idea been done at projects before?") | none | - |
| **DeltaHacks 12** | Social/Industry Impact; Technical; Originality; Presentation | none | In-person expo |
| **ConUHacks X** | Working Demo; Presentation Quality; Design & Aesthetics; Potential Impact/Creativity; Technical Difficulty | none | - |
| **QHacks 2026** | Implementation; Design & UX; Innovation & Social Impact; Pitch & Presentation; Theme Alignment ("**Look beyond basic LLM implementation**") | none | - |
| **UofTHacks 13** | Idea & Innovation; Technicality; Design; Pitching Clarity; Time; Completion; Theme | none | **5 min general, 3 min sponsor** |
| **nwHacks 2026** | "Completion - Functionality of project" (only one shown) | - | - |
| **JourneyHacks 2026** (SFU Surge) | Technical Complexity; Creativity; Design; Pitch; Scalability | none | **3-min pitch + 2-3 min Q&A** to 2-3 judge pairs |
| **HackCamp 2026** (UBC) | Problem & User Research; Innovation; Technical Implementation; Design & UX; Presentation | none | Video up to 4 min recommended |
| **BearHacks 2026** (via sub-agent) | Execution; Impact; Creativity; Presentation | **40 / 20 / 20 / 20** | - |
| **MLH standard (MLH categories)** | Technology; Design; Completion; Learning | equal | Excludes pitch and idea |
| **MLH Contest Terms** | Originality/creativity; Technical complexity; Theme; Practical implementation | 25% each | - |
| **Devpost default** | Technological Implementation; Design; Potential Impact; Quality of the Idea | equal | - |

**Common denominator** (how often a criterion appears across the ~24 rubrics above):

| Criterion | Share of rubrics |
|---|---|
| **Technical complexity / implementation** | ~100% |
| **Originality / creativity / innovation** | ~90% |
| **Impact / usefulness / real-world application** | ~70% |
| **Design / UX** | ~65% |
| **Completion / working demo / polish** | ~50% |
| **Presentation / pitch** | ~40%, including **Edison** |
| **Theme fit** | ~20% |
| **Learning** | ~15% (MLH, HackMIT) |

- **Weights are rarely published.** Where they are, the split is roughly equal (MLH 25 x 4; Devpost equal). HackMIT uses 30/30/30/10 and BearHacks puts Execution at 40%.

### 3.2 Judging formats and time per team

- **MLH-recommended format** (https://guide.mlh.com/general-information/judging-and-submissions/judging-plan):
  - Science-fair (expo) judging at the tables.
  - **4 minutes per project:** 2 minutes of presentation + demo, 1 minute of questions and 1 minute of judge travel.
  - Each project is seen by 3 judges.
  - Each judge brings back a top 3, and MLH aggregates the rankings.
  - Finalist stage demos get about 7 minutes (3-5 minutes presenting).
  - Videos should be "a demo of their hack, not a presentation."
  - Judges are told to "focus on learning over profit" and not on the business aspect [V via sub-agent].
- **What 2026 events actually did:**
  - **2-3 min pitch + 1-2 min Q&A:** Edison 2025, JourneyHacks, Cal Hacks, HackPrinceton, HackNYU.
  - **4-5 min:** Hack the North, UofTHacks.
  - **5-7 min at expo:** HackMIT, then a finalist panel.
- **Two-stage judging (expo, then a finalist stage) is standard at large events.** Edison 2025 had a "Finalists" prize (3 winners), which suggests a final round [U: we found no Edison 2025 description of a stage round].
- **Video:** required at Cal Hacks, LA Hacks, HackIllinois, Hacklytics, Hack the 6ix, UofTHacks and PennApps; optional elsewhere. Edison accepts "a link to view your project (ie. Figma, Git Repo, pitch slides, live demo etc)" [V].

### 3.3 Practical advice from judges and winners

| Advice | Source |
|---|---|
| "Presentations in the expo judging period will ideally be 5-7 minutes long… Most teams will go for a set of slides and a project demo" | HackMIT 2026 Hacker Guide [V] |
| Round 1 must be "focused on a live demo… not a slide show, product pitch"; "It doesn't need to become a real startup with a business plan or solve major world problems!" | Hack the North 2026 rules (via sub-agent) |
| "Pitches and presentations are discouraged… you'll only hurt yourself by not showing a demo." | MLH Standard Project Rules |
| The demo running was "the single largest score differentiator"; say what it is in the first sentence; narrow scope beats "a platform in 36 hours"; admitting a limitation raised scores; keep a 60-second backup screen recording; judges rank you "against the six they just saw" | Magomed Kurbaitaev, dev.to, Jul 2026 (via sub-agent [U]) |
| Expo is "4-5 minutes each, hear the pitch, watch the demo, ask one question, score on a phone"; panels clone only 5-6 of 60 repos; sponsors check "the sponsor's tech or just the sponsor's logo" | Lauren Lee, dev.to, Sep 2026 (via sub-agent [U]) |
| "Simple but complete can beat ambitious but unclear"; be honest about what AI did | Amit Kumar Singh, dev.to, Jun 2026 (via sub-agent [U]) |
| A RAG layer over a stock model failed an unstated "originality gate" | Daniel Nwaneri, dev.to, Sep 2026 (via sub-agent [U]) |
| "A polished pitch deck with a broken demo loses to a rough pitch deck with a working MVP every time." | Arbitrum / Ben Greenberg, dev.to, Feb 2026 (via sub-agent [U]) |
| Set the scene in a few sentences, then demo; skip mundane flows such as sign-up; pre-fill inputs | Devpost blog, Brandon Kessler |
| Sponsor judges push against shallow integrations: Backboard "We judge ambition. Not polish, not pitch decks."; Sentry "not just whether the SDK is installed"; Rox "agents that don't just work in clean demos"; Zip "one strange idea that half works over a polished version of something obvious" | HTN 2026 prize text |
| OpenAI's prize demo must "show the working product, explain how the OpenAI API is used, and share one concrete way Codex improved your process" | HackMIT 2026 challenge doc [V] |

**Synthesis for a 3-minute Edison pitch:**
1. One sentence on who it's for and what it does.
2. A live demo of the single best flow within the first 30 seconds, with inputs pre-filled and sign-up skipped.
3. 20-30 seconds on the technically hard part: the agent's tools, memory and how it recovers from errors. This covers **Technical Complexity**.
4. One line on what's novel, and why it isn't just a wrapper. This covers **Originality**.
5. A clean, finished UI. This covers **Design**.
6. Keep a 60-second backup video, and make the repo public and buildable.

---

## 4. Edison

### 4.1 Edison (what's published as of 2026-09-26)

| Item | Detail | Source |
|---|---|---|
| Dates | **Oct 3-4, 2026**. Devpost rules window: "October 3, 2026 at 9:00 AM – October 5, 2026 at 5:00 PM" | Edison.com [V]; https://Edison2026.devpost.com/rules [V] |
| Venue | SFU Burnaby, **AQ Building**, 8888 University Dr W | Devpost [V] |
| Format | In person, **24 hours**, teams of **up to 4**, free, food provided. Travel not reimbursed. The 2026 FAQ drops the 2025 mention of "overnight accommodation" | /data/faq.json [V] |
| Eligibility | "currently enrolled in a post-secondary institution, or recently graduated within the last 4 months"; must attend in person | Devpost rules [V] |
| Billing | "West Canada's Largest Project"; MLH member event (MLH trust badge, 2026/2027 season) | Edison.com [V] |
| Applications | Closed **Sep 19, 11:59 PM** (mentor applications the same day) | Instagram / Facebook snippets [V via search snippets] |
| Theme / "What to build" | **"Revealed during Opening Ceremony"** | Devpost [V] |
| Prizes | "1 non-cash prize to be revealed" (a placeholder) | Devpost [V] |
| Judges | "To Be Revealed" | Devpost [V] |
| **Judging criteria** | **Technical Complexity; Design; Pitch; Originality / Creativity** (no descriptions, no weights) | Devpost [V] |
| Submission | "a link to view your project (ie. Figma, Git Repo, pitch slides, live demo etc)". "Only 1-2 people maximum are needed to present" | Devpost [V] |
| Sponsors so far | **Vercel, Arc'teryx, GitHub, Transoft Solutions, Pure Buttons** | /data/sponsors.json [V] |
| Registered on Devpost | 6, which means Devpost registration has barely started | Devpost [V] |
| Site extras | "The Studio" 3D workshop (studio.Edison.com); a webtoon ("Shades of Time"). The /info copy says: "Build the thing that excites you, the thing that scares you a little… Not the one you'd solely do just to get brownie points from judges." | Edison.com [V] |
| Portal | SFU Surge's **hacker-portal** repo (github.com/sfusurge/hacker-portal, updated 2026-09-26) has team submissions ("Only One Submission Per Team… You can't edit this form once it's submitted"), judge assignments with per-project scoring forms, and a **user-vote** (people's-choice) table. Edison may run submissions, judging or voting through this portal instead of, or as well as, Devpost [U] | GitHub [V code; U usage] |

Not yet published anywhere we could read:
- Tracks
- Prize list
- MLH categories
- Judging format and time per team
- Criterion weights

These will almost certainly be announced at the opening ceremony and on Discord or the portal.

**Planning assumptions for 2026, based on 2025 [U]:**
- A 3-minute pitch plus about 1 minute of Q&A, to 1-3 judge pairs.
- A Finalists round.
- MLH Gemini / ElevenLabs (and probably MongoDB / Snowflake / domain) prizes.
- Organiser category prizes: Beginner, Hardware, Game, Solo, Design, Startup and Surge Choice.
- Club and sponsor challenges posted at the opening.

### 4.2 Edison 2025 (NOT 2026): Oct 4-5, 2025

Source: https://Edison2025.devpost.com/ and project pages.

- **Scale:** 768 registered, **217 submissions**, "$CAD 32,600+" in prizes, 78 judges (Microsoft, Amazon, EA and others).
- **Timing:** submissions open Oct 4 12:00 PM PDT, close **Oct 5 1:15 PM PDT**. Rules window Oct 4 9 AM - Oct 5 5 PM. Site FAQ: 24 hours, overnight accommodation provided.
- **Judging criteria (verbatim):** Technical Complexity, Design, Pitch, Originality / Creativity. No weights.
- **Judging format (verbatim):** "A live presentation (maximum 3 minutes) followed by Q&A (maximum 1 minute) to judges in the AQ South Hallway", "Present minimum 1 time, maximum 3 times to different judges", and "Only 1-2 people maximum are needed to present the project".
- **Sponsors:**
  - Platinum: Scalar, Transoft, AMD, Vercel, Huawei, Wondershare, Trulioo, Safe Software.
  - Bronze: Kardium, Centre for Digital Media, Microsoft, ColorStack, Ekohe, Chang Institute, Synexus, MentorMates, Costco Business Center.
  - In-kind: EA, T1, n8n, InWorld AI, CodeCrafters, Balsamiq and others. (From the SH25-final repo's `SponsorList.json` [V].)
- **No themed tracks.** The prizes were:

| Prize | Value (CAD) | Winners | Description |
|---|---|---|---|
| Finalists | $2,640 | 3 | Sony headphones, CodeCrafters VIP, Microsoft office tour |
| Surge Choice Award | $360 | 1 | "most creative and inspiring project" |
| Best Beginner | $400 | 1 | "At least half of the team needs to be first time hacker" |
| Best Hardware | $400 | 1 | |
| **Best Game** | **$2,960** | 1 | "most engaging, creative, and well-designed game" |
| Best Solo Project | $800 | 1 | |
| Best Design | $240 | 1 | UX / visual appeal |
| **Most Likely to Become a Startup** | **$3,760** | 3 | "clear market need, scalability, and a path toward becoming a viable business" |
| Huawei Challenge #1: Interactive Landscape Graphics | $940 | 2 | real-time ray-marched procedural terrain |
| Huawei Challenge #2: Automatic Decision for Re-computation | $940 | 2 | operator scheduling under a memory limit |
| Safe Software Best Modern C++ | $600 | 1 | |
| ColorStack Most Portable Project | $960 | 1 | mobile / wearable / AR / VR |
| Charles Chang Institute Entrepreneurship | $250 | 1 | |
| UN SDGs (Enactus) | $460 | 3 | |
| CSSS Rube Goldberg | $280 | 1 | |
| Software Systems Prize | $280 | 1 | SoSy students |
| BluePrint Social Good | $280 | 1 | |
| SEE Sustainable Engineering | $100 | 1 | |
| IEEE SFU | $250 | 1 | |
| MLH Best Use of .Tech | - | 1 | Blue Snowball + domain |
| MLH Best Use of Gemini API | - | 1 | keyboards |
| MLH Best Use of ElevenLabs | - | 1 | AirPods |
| MLH Best Use of Snowflake API | - | 1 | Arduino Tiny ML Kit |
| Best Use of SFU Courses API | $50 | 2 | api.sfucourses.com |

**Edison 2025 winners** (27 winning projects, prizes copied from each Devpost page):

| Project | Prize(s) | What it is | Stack highlights |
|---|---|---|---|
| SurvivalChess | **Finalist**; Best Game | Chess mixed with a timed survival game | TS, PixiJS |
| Mapd | **Finalist**; UN SDG; Best Design | AI plain-language impact summaries of Vancouver developments from open data | React, FastAPI, OpenAI, MongoDB |
| IntervU | **Finalist** | AI mock-interview platform: resume + job posting → questions, code runner, hireability score | Next.js, Go, **Gemini, ElevenLabs**, OpenAI, MongoDB |
| EcoDepot | Surge Choice; SEE Sustainable | CV smart recycling bin with student-ID cash-back | Arduino, TensorFlow, Next.js, Supabase |
| Track2Give | Best Beginner; UN SDG; Most Likely Startup | Food-expiry tracker suggesting donation | Express, **Gemini**, MongoDB |
| ASL Express | Best Hardware | Sign-language food ordering (MediaPipe + Gemini) to an ESP32 display | Python, **Gemini**, ESP32, **ElevenLabs** |
| Qount | Best Solo | Memory game | SwiftUI |
| Rehabit | Most Likely Startup | Webcam rehab coach with a **Gemini**-written clinician report | Python, **Gemini, ElevenLabs** |
| Encore | Most Likely Startup | Concert companion app | Expo, Firebase |
| Music March; Optimized Ray-marching | Huawei #1 | Ray-marched terrain | C++, GLSL |
| Hooray-For-Huawei; Racoon Works | Huawei #2 | Recomputation scheduling | C++ |
| GANPI | Safe Software C++ | **Gemini** terminal assistant with a C++ CLI | C++, Next.js |
| Punchly | ColorStack Portable | NFC punch card | React Native |
| LockedIn | Chang Entrepreneurship | **Gemini** screen and gaze focus agent | Electron |
| EcoTag | UN SDG | Laser tag plus litter classification | React, OpenAI Vision |
| Hello World Rube Goldberg | CSSS Rube Goldberg | Physical chain reaction | Arduino |
| ConnectSFU | Software Systems | SFU club events hub with AI search | React, Supabase, Gemini |
| **GuardianEye** | BluePrint Social Good | Camera-feed elderly safety monitor with SMS alerts | FastAPI, YOLOv8, **Gemini, MCP, Strands Agents**, Twilio |
| FretNot | IEEE | Laser guitar chord guide | ESP32, React |
| GemiDice | MLH .Tech | Gemini dungeon master with voice | **Gemini, ElevenLabs** |
| M.I.R.A | MLH Gemini | Desktop focus companion | **Gemini, ElevenLabs** |
| Carrie | MLH ElevenLabs | Emotion-aware AI therapy video chat | **ElevenLabs**, LiveKit, ViT |
| Air Command | MLH Snowflake | Sip-and-puff accessibility input device plus Snowflake Cortex | BeagleBone, **Snowflake** |
| SFU Grad Map; EduFind | SFU Courses API | Prerequisite graph; course builder | D3, Gemini |

**Takeaways from 2025:**
- **Gemini appears in 11 of the 27 winners** and ElevenLabs in 6, so stacking them is normal here.
- Only one winner (GuardianEye) was explicitly agentic (Strands Agents + MCP).
- The biggest cash prizes were **Most Likely to Become a Startup ($3,760 over 3 teams)** and **Best Game ($2,960)**.
- Local, SFU-specific prizes (SFU Courses API, Software Systems, CSSS, IEEE, Enactus) are low-competition extras.

### 4.3 Earlier editions (NOT 2026, for trend context)

| Edition | Dates / size | Tracks | Criteria / format |
|---|---|---|---|
| Edison Oct 2024 ("Surge x Enactus x MSESS") | Oct 5-6 2024, 181 participants, 60 subs, $2,895 | **Social Good, Environment & Sustainability, Entertainment, Artificial Intelligence, Innovation** | "Be creative…" (no rubric). **Max 4-min live presentation to 2-3 judge pairs** (SUB Dining Lounge). https://Edisonoctober2024.devpost.com/ |
| Edison May 2024 | May 18-19 2024, $6,445 | **Health & Wellness, Environment & Sustainability, Social/Connectivity, Artificial Intelligence**; Best Beginner; Design 1st/2nd | Live presentation of at most 5 min, or a recorded demo. https://Edison.devpost.com/ |
| Edison 2023 | May 20-21 2023, 93 participants, $12,550 | 1st-3rd, Best UI/UX, **Best Pitch**, EdTech | **Technical Proficiency 25%, Wow Factor 25%, Design 25%, Pitch 25%**. https://Edison-2023.devpost.com/ |

**Trend:** Edison grew from about 93 participants (2023) to 768 (2025). Themed tracks were dropped in 2025 in favour of category and sponsor prizes. **Pitch has been a judging criterion every year** that published a rubric: 25% explicitly in 2023, and listed in 2025 and 2026.

---

## 5. Blocked or failed sources (what to fix)

| URL | Problem |
|---|---|
| `https://*.devpost.com/*` via curl | **HTTP 403** (bot protection). WebFetch and the Chrome extension work. Paths that reliably failed even in WebFetch: `Edison-2025.devpost.com` (403; the real slug is `Edison2025`) and most `/rules` tabs (navigation only) |
| `https://www.facebook.com/sfusurge/posts/...` | Login wall; only the first line was readable |
| `https://www.instagram.com/sfusurge/` | Partial captions only (application deadline, Clubs Day Sep 15-17 Table 107, webcomic). Individual posts not readable |
| LinkedIn posts | Readable only through a summariser (e.g. the SFU Grad Map winner post) |
| `https://journeyhacks.sfusurge.com/`, `https://www.Edison.com/` | JS-rendered. For Edison.com, read `/data/faq.json` and `/data/sponsors.json` directly instead |
| HackIllinois 2026 attendee guide (`go.hackillinois.org/attendee-guide`) | Redirects to a 2027 countdown; the 2026 judging criteria are lost |
| `https://mlh.io/prizes` | Redirects to a 404; use https://www.mlh.com/events/prizes |
| `get.tech/mlh` | 403 in WebFetch; loads in a browser |
| Reddit `old.reddit.com/.../.json` | 403 |
| WebSearch | The sub-agent hit a 200-search session budget, so there was no HN, LinkedIn or YouTube sweep for judge advice |
| `hackmit2026.devpost.com`, `hacknyu-2026`, `hackwestern-12`, `hackthe6ix-2026` (hyphenated) | 404. HackMIT uses its own "Plume" platform; Hack the 6ix's slug is `hackthe6ix2026` |

**To get the Edison tracks and prizes before Oct 3:** join the Edison Discord (the 2025 invite was discord.gg/3tYyU6GXZ7 [U: may have changed]), check the hacker portal after acceptance, and re-check https://Edison2026.devpost.com/ during event week.
