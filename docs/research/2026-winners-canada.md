# What won at Canadian projects in 2026

Research for Edison (SFU, Oct 3-4, 2026). Compiled 2026-09-26.

**Scope:** only 2026 editions of Canadian projects. Edison 2025 is included at the end, clearly marked **NOT 2026, CONTEXT ONLY**, because it is the previous edition of the event we are entering.

## How this was researched, and how far to trust it

- **Coverage:** every winning project page on Devpost was read for each event covered, about 330 project pages in total. Winners are the projects with a Devpost "Winner" ribbon, and prize names come from those ribbons.
- **How pages were read:** mostly WebFetch, which returns a model summary of the page. For nwHacks and Edison, the ribbons, "Built with" tags and links were also checked against the raw HTML.
  - The "Built with" tags and quotes are close to verbatim. Treat the "what it does" and "AI use" columns as summaries.
  - I spot-checked the ribbons and tags of ViniClip, Orca and Reflex myself; all three matched.
- **"Why it won": no event published judges' reasoning.** Not on Devpost, not on organizer LinkedIn, Instagram or websites. That column therefore says "none stated" unless the project page itself gives:
  - a metric, or
  - a team claim, which is labelled as the team's own claim.

  Every "why" in the Patterns section is an inference from who won, measured against the published judging criteria.
- **Model names:** names such as "GPT-6 Astra", "GPT-Live", "Claude Opus 5" and "Gemini 3.5 Flash" are as the 2026 project pages list them.
- Items marked **(unverified)** could not be confirmed from a primary page.

## Access problems (what was blocked, and where)

- **Devpost:** no login walls, Cloudflare blocks or rate limits through WebFetch. The obvious slugs are often wrong, though. These returned 404 or 403:

  | Tried (failed) | Correct slug |
  |---|---|
  | `uofthacks13` | `uofthacks-13` |
  | `mchacks-13` | `mchacks13` |
  | `conuhacks-2026` | `conuhacks-x` |
  | `Edison-2025` | `Edison2025` |
  | `Edison-2026` | `Edison2026` |

  Raw `curl` to devpost.com returned **403** in one session but 200 in another, so fetching varies with the client.
- **Websites that render only in the browser:**
  - `hackthenorth.com`: WebFetch got only the title.
  - `Edison.com/faq`: the content was recovered from `https://www.Edison.com/data/faq.json`.
- **Behind a login (not attempted):**
  - DeltaHacks portal (`portal.deltahacks.com`)
  - Hack the 6ix 2026 dashboard (`2026.dash.hackthe6ix.com`), which is where its own website says 2026 results live
  - Instagram, where content is mostly gated
- **LinkedIn:**
  - Personal profiles return **HTTP 999** (bot block).
  - Company pages load partially, but only show generic "congrats winners" posts.
- **SpurHacks 2026:**
  - `spurhacks-2026.devpost.com` returns 404.
  - `spurhacks.com` is now a parked domain; WebFetch failed with an SSL certificate error.
  - `x.com/SpurHacks` returns **403**.
  - No 2026 edition was found.
- **Hack the Valley:** no 2026 edition has been held yet (HtV 11 is Oct 16-18, 2026). `hack-the-valley-xi` and `hack-the-valley-11` on Devpost both return 404.
- **ConUHacks X:** the sponsor challenge briefs were never published on Devpost or conuhacks.io. They are inferred from the winners (unverified).

## Overview of the events

| Event | Dates (2026) | Devpost | Projects / winners | Top placings | Published judging criteria |
|---|---|---|---|---|---|
| DeltaHacks 12 (McMaster) | Jan 10-11 | https://deltahacks-12.devpost.com/ | 144 / 18 | 1 Quota, 2 deltawash, 3 ReelJobs | Social/industry impact, technical excellence, originality, presentation |
| UofTHacks 13 (UofT) | Jan 16-18 | https://uofthacks-13.devpost.com/ | 160 / 22 | 1 Identity Matrix, 2 Project Horizon, 3 Shop-A-Sketch | Idea, technicality, design, pitching clarity, time, completion, **theme relevance** |
| uOttaHack 8 (uOttawa) | Jan 16-18 | https://uottahack8.devpost.com/ | 175 / 31 | 1 CyberSea, 2 Snowy Day, 3 WingIt | Innovation, technical complexity, completion, presentation |
| nwHacks 2026 (UBC, Vancouver) | Jan 17-18 | https://nwhacks-2026.devpost.com/ | 169 / 20 | Finalists: Rehabify (claims 1st in its own write-up; unverified), SpeakCode, Atlasic | "Completion: functionality of project" |
| McHacks 13 (McGill) | Jan 17-18 | https://mchacks13.devpost.com/ | 127 / 20 | 1 McGill Go, 2 WaterYouDoin, 3 Bloomscroll | Execution, technical complexity, impact, creativity |
| ConUHacks X (Concordia) | Jan 24-25 | https://conuhacks-x.devpost.com/ | 260 / 32 | 1 ViniClip, 2 Pinscher, 3 JungleBank | Working demo, presentation, design, impact and creativity, technical difficulty |
| QHacks 2026 (Queen's) | Feb 6-8 | https://qhacks-2026.devpost.com/ | 77 / 15 | 1 Orca, 2 Atlas, 3 Willow | Implementation, design/UX, innovation and social impact, pitch, theme ("look beyond basic LLM implementation") |
| Hack Canada 2026 (Waterloo) | Mar 6-8 | https://hack-canada-2026.devpost.com/ | 208 / 40 | 1 wallhacks., 2 GlossPlusOne, 3 49th | Technical execution 40%, innovation 25%, design 20%, presentation 15% |
| GenAI Genesis 2026 (UofT) | Mar 13-15 | https://genai-genesis-2026.devpost.com/ | 249 / 20 | Top in-person: Axiom, Shipyard | Not recorded |
| cuHacking7 (Carleton) | Jul 10-12 | https://cuhacking07.devpost.com/ | 60 / 14 | 1 Surgy, 2 Proteus, 3 BioReactPi | Not recorded |
| Hack the 6ix 2026 (Toronto) | Jul 17-19 | https://hackthe6ix2026.devpost.com/ | 133 / 27 | 1 Praxis, 2 TraceLoop, 3 MIRL | Technical difficulty, uniqueness, design, completeness |
| Hack the North 2026 (Waterloo) | Sep 18-20 | https://hackthenorth2026.devpost.com/ | 349 / 74 | 12 unranked finalists (Reflex, Orbis Engine, Combadge, Composition, Concerto, CADEX, bingbong, Keymaeleon, Bricked, punching-face, TakeOne, Settlers of Solana) | WOW factor, technical ability, originality, design |
| Hack the Valley 11 (UTSC) | Oct 16-18 (upcoming) | not live | n/a | Not held yet | n/a |
| SpurHacks 2026 | n/a | not found | n/a | No 2026 edition found | n/a |
| **Edison (SFU): our event** | **Oct 3-4 (upcoming)** | https://Edison2026.devpost.com/ | n/a | Theme "Revealed during Opening Ceremony" | Technical complexity, design, pitch, originality/creativity |

Event sections follow in date order. Each has links, tracks/prizes and a winners table.

---

## DeltaHacks 12 (McMaster University)

**Links**
- Devpost: https://deltahacks-12.devpost.com/ (gallery: https://deltahacks-12.devpost.com/project-gallery)
- Website: https://www.deltahacks.com/ (now shows DH13; the DH12 portal is portal.deltahacks.com and needs a login)

**Dates and location:** Jan 10-11, 2026, McMaster University PGCLL, 1280 Main St W, Hamilton. 521 participants, 144 projects. Tagline: "The annual project for change". Devpost tags: Social Good, Education, Beginner Friendly.

**Judging criteria:** Social/Industry Impact, Technical Excellence, Originality, Presentation Quality, plus category-specific criteria. Presentations were in person in PGCLL M21.

**Rules:** Public repo required (must stay public), max 4 members, no prior work.

### Tracks / prizes (18 on Devpost, all non-cash)

| Prize | Criteria / brief | Reward |
|---|---|---|
| First Place | general criteria | Bose QC headphones + MLH pins + $200/mo Vercel credit x6 months per member |
| Second Place | general criteria | Garmin vivoactive 5 + $100/mo Vercel x6 |
| Third Place | general criteria | Corsair K70 + $100/mo Vercel x6 |
| Best Accessibility Hack | accessibility effectiveness, innovation, UX, impact, scalability | Echo Dot |
| Best Environmental Hack | environmental impact, data-driven insights, sustainability, awareness | Air purifier |
| Best Health Hack | well-being, access to health info, tracking, healthy behaviour | Massage gun |
| Beasley Neighbourhood Assoc. - Best Community Building Hack | coordinating service providers, community connection, inclusivity, sustainability, UX | Digital camera + golf shirt + jacket |
| Swift Student Challenge (Apple) | "innovative and creative app using Swift code to solve a real-world problem" | Custom Apple Vision Pro briefing in Toronto with Apple DevRel |
| James Dyson Innovation Challenge | "Identify a pressing issue ... design a creative solution"; product, system or service | Dyson product per member |
| Tailscale Challenge | Connect 2+ devices over Tailscale, restrict with ACLs, expose a public endpoint or private services | AMA with Tailscale's Head of DevRel + Raspberry Pi 4 per member |
| Edge AI Challenge (Moorcheh) | "Build an AI application that leverages efficient memory": deploy their boilerplate, plug in a unique dataset, build frontend and agent logic | Interview at Moorcheh.ai + $100 gift card |
| [MLH] Best Use of MongoDB Atlas | - | M5GO IoT kit per member |
| [MLH] Best Use of Gemini API | - | Google swag |
| [MLH] Best Use of ElevenLabs | - | Wireless earbuds |
| [MLH] Best Use of Vultr | - | Portable screens |
| [MLH] Best Use of Solana | - | Ledger Nano S Plus |
| [MLH] Best Use of Presage (Human Sensing) | Use vitals, movement, emotion or focus sensing | SenseCAP Watcher |
| [MLH] Best .Tech Domain | - | Mic + .tech domain |

### Winners (18 projects, one per prize)

| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| **First Place** | Quota | https://devpost.com/software/quota-fg4pzi | github.com/dwseoh/Quota (site: innovation-without-going-broke.tech, demo: quota-snowy.vercel.app) | "The first linter for your budget": a VS Code extension flags expensive API and LLM calls as you type, with a cost heatmap and cheaper alternatives. Also a React Flow sandbox that predicts infrastructure cost for an architecture | Developers and startups watching cloud and AI spend | AST, Gemini, HTML, JS, LangChain, MongoDB, Next.js, Python, React, React Flow, Tailwind, Tree-sitter, TypeScript, VS Code | **RAG**: Gemini via LangChain with a FAISS vector store for architecture recommendations. Custom AST/Tree-sitter parsing estimates token usage | No | Not stated. Very specific developer pain, a sharp one-line pitch, and it lives in a real tool (the IDE) |
| **Second Place** | deltawash | https://devpost.com/software/deltawash | github.com/Goldenstar2660/DeltaWash (site: deltawash.tech) | A camera checks each step of WHO hand-washing in real time and logs compliance to a dashboard | Hospitals and clinics | C++, CSS, Python, PyTorch, TensorFlow, Raspberry Pi, PiCam, ESP8266, React, Tailwind | **Custom CV model** (CNN-LSTM ensemble trained on hand-washing video) running on the Pi. No LLM | **Yes**: RPi + PiCam + ESP8266 + LEDs | Not stated. Pitch opens with a hard statistic ("Only 1/3 of doctors wash their hands with the full WHO procedure...") |
| **Third Place** | ReelJobs | https://devpost.com/software/reeljobs | github.com/Scr4tch587/DeltaHacks12 | Turns job listings into TikTok-style vertical videos with AI-scripted characters, and helps you apply | Gen Z / millennial job seekers | bcrypt, boto3, DO Spaces, docker, expo-video, expo, ffmpeg, fish.audio, google-gemini, hls, jwt, mongodb-atlas, motor, playwright, python, react-native, typescript, vultr-object-storage, vultr-vm, whisper | **LLM + TTS + automation**: Gemini writes scripts and embeddings for semantic search and helps with applications. Fish.audio TTS, Whisper. Playwright is listed, so likely browser automation for applying (unverified) | No | Not stated |
| Best Accessibility Hack | Communico | https://devpost.com/software/communico-i5opvc | github.com/xafn/communico | A multimodal AAC app: symbol tiles, sentence building, drawing, transcription, and emotion-aware reply suggestions | Nonverbal and autistic users | ElevenLabs, face-api.js, Gemini, OpenRouter, OpenSymbols, TypeScript | **LLM**: Gemini via OpenRouter for next-tile prediction, simplification and emotion-aware replies. face-api.js reads emotion from the webcam. ElevenLabs TTS | Webcam | Not stated |
| Best Environmental Hack | bloomguard | https://devpost.com/software/bloomguard | github.com/brandonli5211/bloomguard | Detects and forecasts Lake Erie algal blooms from satellite and wind data, then generates drone response plans | Environmental and water managers | CSS, Gemini, Mapbox GL, Next.js 14, OpenRouter, FastAPI, React, Sentinel Hub, Tailwind, TypeScript, Weather API | **LLM summarization**: Gemini 2.0 Flash turns model outputs into an operational report | Simulated drone plans only (no physical HW evident) | Not stated. A local, specific problem (Lake Erie, near Hamilton) |
| Best Health Hack | Patelloscope | https://devpost.com/software/patelloscope | github.com/arishs24/deltahacks12 (demo: hostingpatelloscope.vercel.app) | Turns a knee MRI into a patient-specific FEA knee model and a safe rehab plan | Clinicians and physios treating knee injuries | AWS, Gemini, ML, MongoDB, Moorcheh.ai, Next.js, Node.js, Python, Vercel, Vultr | **RAG**: Moorcheh.ai retrieves peer-reviewed rehab literature. Gemini is limited to choosing from "a finite, clinically accepted exercise set" and explains the biomechanics | No | Not stated. Team includes a BME student who is a Harvard Med/JHU researcher (domain credibility) |
| Beasley NA - Community Building | B(AI)MAX | https://devpost.com/software/b-ai-max-m406t9 | github.com/v5run/BAIMAX | A physical emergency trigger alerts nearby certified first-aiders through an iOS app, with patient info prepared | Neighbourhood residents in medical distress | Arduino, ESP32, Swift, Xcode | **LLM summarization**: Gemini prepares patient info and incident reports | **Yes**: motion sensor, Arduino/ESP32, LCD, buttons | Not stated |
| Swift Student Challenge | LavaLock | https://devpost.com/software/lavalock | github.com/anthonyhana04/Delta-Hacks-2026 | A password manager and 2FA app seeded with entropy from a real lava lamp filmed by an ESP32 camera (Cloudflare-style) | Security-conscious users | AWS, S3, C, C++, ESP32, Gemini, Go, PostgreSQL, RDS, Swift | Gemini makes image variations to add entropy (gimmicky use) | **Yes**: ESP32-CAM + lava lamp | Not stated |
| James Dyson Innovation | BRL+ | https://devpost.com/software/brl | github.com/KabirK-05/BRL-Plus | Converts a normal 3D printer into a braille embosser for under $10 in parts. Turns text, images, PDFs and YouTube into braille | Visually impaired people | CAD, Electron, ElevenLabs, Flask, Gemini, Python, TypeScript, YouTube | **Voice agent**: ElevenLabs conversational agent, Gemini content processing | **Yes**: modified 3D printer with an embossing head | Not stated. Low cost and a physical product fit Dyson's brief |
| Tailscale Challenge | tailSync | https://devpost.com/software/rc-project | github.com/calvinkarthik/tailSync | A two-device secure mini-workspace (files, screenshots, chat) over a tailnet, using ACLs as the auth boundary | Pairs collaborating on the fly | acls, docker, electron, express, multer, node, react, tailscale-serve, tailwind, typescript, vite, ws | None | No | Not stated. Hits all of Tailscale's listed requirements |
| Edge AI Challenge (Moorcheh) | Protosynthesis | https://devpost.com/software/protosynthesis | github.com/penguinpush/deltahacks-12 | A drag-and-drop node canvas for building AI and API workflows (n8n-style) | Developers and no-code builders | apis, atlas, auth, calendar, elevenlabs, gemini, gpt-4, integrations, maps, mongodb, openai, productivity, sheets, stripe, twilio, voice | **Agentic + RAG**: a Gemini 2.0 Flash agent builds workflows itself through multi-step function calling. Claude Sonnet 4 does docs RAG Q&A with citations | No | Not stated |
| [MLH] MongoDB Atlas | Cision | https://devpost.com/software/cision | github.com/Lemirq/cision (site: cisionai.tech) | "Cursor for City Planning": a 3D collision-data map where AI redesigns intersections, with stakeholder persona agents | City planners | geminiapi, mapboxgl, nanobananapro, nextjs, react, shadcn, tailwind, vercelaisdk | **Multi-persona agents + image gen + voice**: Gemini 2.5 Flash cyclist, engineer and policymaker perspectives, Nano Banana redesign images, ElevenLabs voices, Vercel AI SDK | No | Not stated |
| [MLH] Gemini API | Avocado | https://devpost.com/software/avocado-c6vkps | github.com/lukajvnic/Avocado | A Chrome extension that fact-checks TikTok videos with a credibility score and claim breakdown | Social media users | Chrome, CSS3, FastAPI, Gemini, HTML, JS, Python, Supadata | **LLM**: Gemini Flash via OpenRouter on transcripts, with structured output | No | Not stated |
| [MLH] ElevenLabs | immi | https://devpost.com/software/immi-325jt0 | github.com/Bobai0o0/immi | Real-time translation, conversation role-play practice and face recognition to help newcomers adapt | Immigrants and non-native speakers | (tags not fully captured) ElevenLabs, facial recognition API, Raspberry Pi (unverified tag list) | **Voice agent**: ElevenLabs conversational agents for role-play, multilingual TTS | **Yes**: RPi 4 one-button translator with mic and speaker | Not stated |
| [MLH] Vultr | Neuralearn.tech | https://devpost.com/software/neuralearn-tech | github.com/Abdullah73k/neuraLearn | A voice-driven AI tutor that organizes chats into a branching knowledge graph | Students and neurodivergent learners | CSS, ElevenLabs, Gemini, Google Cloud, Google GenAI, Google Search API, Google Embeddings, HTML, JS, MongoDB Atlas (+ Vector Search), Next.js, Node, React, Tailwind, TypeScript, Vercel, Vultr, Web Speech API | **LLM + voice + vector search**: Gemini 2.0 Flash, ElevenLabs TTS, Atlas vector similarity | No | Not stated |
| [MLH] Solana | Ranked Showers | https://devpost.com/software/shower-cxbfr9 | github.com/AndrewW7123/deltahacks12 | A gamified shower leaderboard on Solana, verified by a custom shower-proof sensor | University students (joke/hygiene) | FastAPI, JavaScript, MongoDB, Python, Solana, TypeScript | Gemini 2.5 Flash classifies audio as "likely a person showering" | **Yes**: 3D-printed enclosure, ultrasonic and humidity sensors, AirPod mic, RPi | Not stated |
| [MLH] Presage | Frontline | https://devpost.com/software/frontline-noyxp0 | github.com/seifotefa/deltahacks-12 | A 10-second video gives touchless vitals and injury detection, then a voice agent guides first aid | Bystanders in emergencies | C++, ElevenLabs, Express, Gemini, Node, Presage, React, Tailwind | **Vision + voice agent**: Presage extracts vitals from video, Gemini does image recognition and a triage summary, and an ElevenLabs "911 operator" agent talks you through it | No | Not stated |
| [MLH] .Tech Domain | GoFish | https://devpost.com/software/gofish-csronz | github.com/asrfz/GoFish | A fishing social app with AI hotspot heatmaps and fish species ID | Recreational anglers (Ontario) | atlas, fastapi, maplibre, mongodb, moorcheh, next.js, ontario-habitat-geojson, open-meteo-api, python, pytorch, tailwind, typescript | **Vision + RAG**: PyTorch fish classifier, Moorcheh vector memory of community knowledge, Atlas vector search | No | Domain-name prize |

### DeltaHacks observations
- **The top 3 are well-scoped products with obvious users, not agent demos:**
  - Quota: dev-tool cost linter (RAG)
  - deltawash: custom CV on edge hardware, no LLM
  - ReelJobs: an AI content pipeline

  2nd place had no LLM at all. This matches the "project for change" framing and impact-first judging.
- **Hardware does well here.** 7 of 18 winners have real hardware: deltawash, B(AI)MAX, LavaLock, BRL+, immi, Ranked Showers, and bloomguard (drone plans only, borderline).
- **Social-good categories went to projects for specific groups with a specific problem.** Examples: nonverbal/ASD users (Communico), Lake Erie algae (bloomguard), knee rehab from MRI (Patelloscope), braille for under $10 (BRL+).
- **Agentic and tool-calling use is lighter than at UofTHacks.** Clear examples are Protosynthesis (autonomous workflow building via function calling), Cision (persona agents), Frontline and BRL+ (ElevenLabs voice agents). Most others use an LLM for summarizing or generation.
- **Gemini is in about 14 of 18 winners and ElevenLabs in about 7.** Both are MLH-sponsored and were present at both events.
- No judges' comments were found on Devpost, the DeltaHacks LinkedIn or deltahacks.com.

---
## UofTHacks 13 (University of Toronto)

**Links**
- Devpost: https://uofthacks-13.devpost.com/ (gallery: https://uofthacks-13.devpost.com/project-gallery)
- Website: https://uofthacks.com/ (now shows UofTHacks 14)
- Challenges microsite: https://uofthacks13-challenges.vercel.app/
- Faculty page: https://www.engineering.utoronto.ca/student-group/uofthacks/

**Dates and location:** Jan 16-18, 2026, 36 hours, Myhal Centre, 55 St George St, Toronto. Devpost says 520 registered. The UofT engineering page says "over 550 participants". The gallery has 160 projects. Submissions closed Jan 18, 8:30am EST.

**Theme:** Devpost only says "We will have a theme ... we ask hackers to relate their project to in some way." Almost every winner's tagline talks about identity, so the theme was very likely **"Identity"** (unverified, inferred from project text). Theme relevance was an explicit judging criterion.

**Judging criteria (Devpost):**
- Idea and Innovation
- Technicality
- Design
- Pitching Clarity
- Time adherence (5 min general judging / 3 min sponsor judging)
- Completion
- Theme relevance

### Tracks / prizes (23 on Devpost)

| # | Prize | Sponsor brief (from challenges site where available) | Reward |
|---|---|---|---|
| 1 | Overall 1st | - | Nintendo Switch 2 + "Beyond Cracking the Coding Interview" book, per member |
| 2 | Overall 2nd | - | DJI Osmo Action 4, per member |
| 3 | Overall 3rd | - | HUION Note tablets, per member |
| 4 | Best Beginner Hack | - | Portable chargers + book |
| 5 | Best "UofT" Hack | - | UofT Bookstore swag + 1-yr ONRamp membership |
| 6 | Best Hardware Hack | - | Reachy Mini Lite robots (Pollen Robotics) |
| 7 | Ignobel Prize | - | Mystery prize |
| 8 | Shopify: Hack Shopping with AI | "Build something that makes us say 'wait, that's possible?' Experiment where AI meets commerce" | Shopify keyboard + Meta Ray-Bans per member |
| 9 | Amplitude: Build Self-Improving Products | "Combine behavioral data + AI to create the data -> insights -> action loop" | Paid internships per member |
| 10 | Foresters: The Multi-Agent Mind | "Orchestrate 3+ specialized agents to solve complex problems in financial services" | Paid internships (up to 4) |
| 11 | 1Password: Best Security Hack | "creative security-focused project with simplicity and usability at its core" | $100 Best Buy card + 1 yr 1Password + recruiter chat |
| 12 | Backboard.io: Memory Lane: Adaptive AI Journeys | "AI that adapts based on user history and intelligently switches between models" | $500 gift certificate |
| 13 | TwelveLabs: Build the Future of Video Understanding | Use Pegasus and Marengo to search, summarize and analyze video | 50/40/30 hrs API credits (1st/2nd/3rd) |
| 14 | LeLamp (Human Computer Lab): Hack the Human-Robot Experience | "apps, games, and companions for an expressive robot that feels alive" | Bambu A1 3D printer + LeLamp (2 winners) |
| 15 | Verily: The Future of Health Care | Advance the "Quintuple Aim" (patient experience, outcomes, cost, clinician well-being, equity); judged async by video + GitHub | Possible final-round internship interviews |
| 16 | [MLH] Best Use of Gemini API | - | Google swag |
| 17 | [MLH] Best Use of Solana | - | Ledger Nano S Plus |
| 18 | [MLH] Best Use of Vultr | - | Portable screens |
| 19 | [MLH] Best Use of ElevenLabs | - | Wireless earbuds |
| 20 | [MLH] Best Use of Snowflake API | - | Arduino Tiny ML kit |
| 21 | [MLH] Best Use of MongoDB Atlas | - | M5GO IoT kit |
| 22 | [MLH] Best .Tech Domain Name | - | Desktop mic + .tech domain |
| 23 | Backboard.io: Humanity Award | Created on the spot during the event | (1 winner) |

### Winners

GitHub links are as listed on the Devpost pages. "none listed" means the page has no repo link. For every project, the "why it won" column reports whether the Devpost page gives a reason.

| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| **Overall 1st** + Best "UofT" Hack | Identity Matrix | https://devpost.com/software/temp-sqyptg | github.com/qiuethan/UofTHacks-Project | A persistent multiplayer pixel world. Your AI avatar keeps living, socializing and making choices after you log out, using the personality learned from an onboarding interview | People curious about online presence and identity (social sim) | AI, FastAPI, Gemini, Grok, OpenAI, OpenRouter, Phaser.js, React, Supabase | **Autonomous agents**: Grok 4 via OpenRouter runs the onboarding interview, dialogue and sentiment/intent. A custom Python utility-scoring engine picks each avatar's actions. Gemini 3 Pro Image turns photos into pixel sprites | No | Not stated on Devpost. Team members' LinkedIn posts confirm 1st place; one describes it as a "real-time multiplayer simulation that explores ... digital persistence and the evolution of personal identity" (seen only in search snippets). Fits the likely identity theme closely |
| **Overall 2nd** + Backboard.io Memory Lane + TwelveLabs | Project Horizon | https://devpost.com/software/project-horizon-8iodp2 | none listed | Turns third-person sports broadcast footage into first-person POV video of any player you click | Sports fans and viewers | backboard, Gemini, OpenAI, Python, React, TypeScript | **Vision + generative video**: Gemini and TwelveLabs describe the scene, depth estimation adds 3D cues, and a fine-tuned Wan 2.1 I2V 14B model with LoRA generates the video. Trained and served on Modal H100s | No (cloud GPUs only) | Not stated on Devpost. A LinkedIn snippet says "2nd Place Overall ... 1st place in the TwelveLabs and Backboard.io tracks" (unverified, snippet only). Heavy ML depth (fine-tuning a video diffusion model in 36 hours) |
| **Overall 3rd** | Shop-A-Sketch | https://devpost.com/software/shop-a-sketch | github.com/clairez308/uofthacks26 (site: shop-a-sketch.tech) | Draw a sketch and get matching real products with prices and ratings | Shoppers who think visually | Docker, Figma, Gemini, JSX, Node.js, Python, React, Render, Tailwind, Vite | **Vision LLM**: Gemini reads the sketch, then the app queries Google Shopping | No | Not stated |
| Best Beginner Hack | GenUI | https://devpost.com/software/genui-dgk0ex | github.com/andrewwu13/uofthacks-13 (demo: trygetui.tech) | A storefront that rewrites its own layout and styling in real time based on each user's behavior | E-commerce merchants | FastAPI, LangGraph, MongoDB, Python, React, Redis, SSE, TypeScript | **Multi-agent (LangGraph)**: a "Context Analyst" agent and a "Variance Auditor" agent, with cheap math-based signal processing to limit LLM calls | No | Not stated |
| Best Hardware Hack | DDRK (Dance Dance Revolution Keyboard) | https://devpost.com/software/ddrk-dance-dance-revolution-keyboard | none listed | A foot-pad keyboard: you type letters by stepping in patterns | Desk workers who need exercise (joke/fun) | C, ESP, Python | None | **Yes**: plywood, buttons, ESP8266 then ESP32, sponges | Not stated |
| Ignobel Prize | 67Ranked | https://devpost.com/software/67-ranked | none listed (sites: 67ranked.com + a very long joke .tech domain) | A sub-minute webcam game: do "67" hand reps as fast as you can, with a global leaderboard and duels | Meme/fun audience | CSS, MediaPipe, Next.js, React, Supabase, Tailwind, TypeScript | On-device pose CV (MediaPipe), no LLM | Camera only | Not stated (a meme project; the Ignobel prize rewards humor) |
| Shopify: Hack Shopping with AI | Predictify | https://devpost.com/software/oracle-news-project | github.com/TejasviniChawla/predictify | Uses prediction-market signals (Polymarket) to give Shopify merchants risk and pricing recommendations inside Shopify | Shopify merchants | ElevenLabs, Gemini, Node.js, Polymarket API, React, Shopify API, Solana | **Multi-agent**: 3+ Gemini 3 Flash agents (Risk Analyst, Pricing Strategist) with handoffs, plus human-in-the-loop approve/reject that feeds learning. ElevenLabs voice gives a daily briefing | No | Not stated |
| Amplitude: Self-Improving Products | Adaptive Ascend | https://devpost.com/software/amplitude-project | github.com/MrFibonacc1/amplitudeProject | A gesture-controlled space shooter that adjusts difficulty from Amplitude behavioral analytics | Gamers; demo of the analytics-to-AI loop | amplitude, anthropic, claude, mediapipe, nextjs, react, tensorflow | **LLM**: Claude Haiku/Sonnet writes live coaching and post-game difficulty analysis. TF.js/MediaPipe does hand tracking | Webcam | Not stated. Directly implements the sponsor's "data -> insights -> action" loop |
| Foresters: Multi-Agent Mind | Squill \| Write Freely | https://devpost.com/software/squill-write-freely | github.com/replicant005/SOPcopilot | Guides students through writing personal statements and scholarship essays with reflective questions | Students applying to scholarships and grad school | Cohere, Figma, Flask, LangGraph, Next.js, Procreate | **Multi-agent (LangGraph)** on Cohere Command A: question-generation and guidance agents, PII redaction and verification steps, live agent tracing for interpretability | No | Not stated. Meets the sponsor's "3+ agents" requirement |
| 1Password: Best Security Hack | Alias | https://devpost.com/software/decompiler | github.com/Leo-Zh9/uofthacks13 (site: 4lias.tech) | Decompiles an .exe into readable C and rates it safe, suspicious or unsafe | Non-technical users who download files | CSS, Dockerfile, Gemini, HTML, JS, Next.js, PowerShell, PyGhidra, Python, Shell, TypeScript | **LLM pipeline**: Ghidra pseudo-C is cleaned up by LLM4Decompile, then Gemini refactors and assesses it. No agents | No | Not stated |
| TwelveLabs (+ Best Use of Solana) | Brick by Brick | https://devpost.com/software/lego-6928rf | github.com/GabrielAndrus/UofTHacks13 | Turns video of a real space or object into a buildable LEGO set with instructions | Nostalgic hobbyists | Backboard, Gemini, Next.js, Python, Rebrickable, TwelveLabs, TypeScript | **Video understanding + LLM**: TwelveLabs Pegasus and Marengo extract spatial semantics, Gemini Pro/Flash generate the build logic and manual, and Backboard handles memory and complexity-based model routing | No (camera video input) | Not stated. TwelveLabs placing (1st/2nd/3rd) not shown |
| TwelveLabs | ShopEcho | https://devpost.com/software/rip-dom | github.com/andrearcaina/uofthacks-2026 | Helps small Shopify vendors understand their brand identity, judge whether a trend fits them, and draft campaigns and videos | Small Shopify merchants | Backboard, Claude, ElevenLabs, FastAPI, Gemini, Polaris, Python, Remix, Shopify, TwelveLabs, TypeScript | **Agentic**: Claude agent runs over Backboard.io via MCP, TwelveLabs does video brand analysis, ElevenLabs does voiceover | No | Not stated |
| LeLamp (winner 1 of 2) | Red Lamp | https://devpost.com/software/red-lamp | github.com/Hackm0/lelampv3 | A robotic lamp companion that listens, talks and reacts with motion | People who want companionship or emotional connection | JSON, LLM, Motor, OpenCV, Python, Raspberry Pi, Servo, YOLO | **Voice LLM + vision**: conversational LLM (model not named) and YOLO presence detection | **Yes**: LeLamp kit, servos, RPi, 3D prints | Not stated |
| LeLamp (winner 2 of 2) | Wattson | https://devpost.com/software/wattson-r7wxug | github.com/cindyyzhu/wattson | A desk-lamp sidekick that uses gestures, voice and sentiment to encourage students working alone | Isolated students | hardware, lelamp, pi5, python, raspberry, ssh | **Voice + sentiment**: persona prompt, sentiment analysis of voice tone (model not named) | **Yes**: RPi 5, 5-axis servo arm | Not stated |
| [MLH] Best Use of Gemini API | Stitch | https://devpost.com/software/stitch-30p6ly | github.com/Phalanyx/stitch | A browser video editor where you edit the timeline in natural language, with full manual control and undo | Video creators | CSS, ElevenLabs, FFmpeg, Gemini, Next.js, Node.js, PostgreSQL, Prisma, React, SQL, Supabase, Tailwind, Twelve Labs, TypeScript, VEO, Zustand | **Tool-calling agent**: the Gemini "Lilo Agent" calls structured edit commands on timeline state. TwelveLabs does semantic video search, ElevenLabs does TTS, VEO generates transitions | No | Not stated |
| [MLH] Best Use of Vultr | Wavelength | https://devpost.com/software/wavelength-5iacbt | github.com/Badbird5907/uofthacks-2026 (site: usewavelength.tech) | A recruiting platform that crawls candidate profiles, runs live AI interviews and matches candidates to company values | Recruiters and job seekers | AI, Drizzle, Flask, Gemini, Next.js, PostgreSQL, Python, React, TwelveLabs, TypeScript, Vultr | **Autonomous agents + voice**: web-scraping agents, Gemini 3 Flash parses resumes, Gemini Live runs voice interviews, TwelveLabs analyzes the interview video | No | Not stated |
| [MLH] Best Use of ElevenLabs | Slotify | https://devpost.com/software/slotify-avmxe8 | github.com/jweng121/slotify | Finds natural ad slots in a podcast, generates a voice-matched sponsor read and exports the final episode | Podcasters | ElevenLabs, Express.js, FFmpeg, librosa, Node.js, OpenAI, Python, React, TypeScript, Vite | **LLM + voice**: OpenAI writes the ad copy and chooses slots, ElevenLabs voices the read, Whisper transcribes (optional), librosa analyzes audio | No | Not stated |
| [MLH] Best Use of Snowflake API | Badge | https://devpost.com/software/badge | github.com/RajanChavada/Badge | Builds a professional profile, AI talking points per company, and networking practice with analysis of recorded conversations | Students at career fairs and projects | Clerk, Convex, ElevenLabs, Gemini, GitHub, HTML, JS, React, Snowflake, TypeScript | **LLM + voice**: Gemini extracts identity from a resume and writes talking points, Gemini Flash 2.5 practice chatbot, ElevenLabs STT, Backboard memory | No | Not stated |
| [MLH] Best Use of MongoDB Atlas | Salus | https://devpost.com/software/salus-9javs3 | github.com/mricardo888/salus | Stacks insurance benefits and government aid to push a patient's medical bill toward $0, with privacy protection | Patients with medical bills | 1password, fastapi, gemini, javascript, langgraph, mongodb, next.js, python, tailwind, typescript, vercel | **Multi-agent + vision + RAG**: 4 LangGraph agents (Extractor, Actuary, Social Worker, Coordinator), Gemini vision reads the bill, Atlas Vector Search over eligibility law, ElevenLabs multilingual voice | No | Not stated beyond the prize. Uses Atlas Vector Search for eligibility-law retrieval |
| [MLH] Best .Tech Domain | Big Brother | https://devpost.com/software/big-bro-tsv0i9 | none listed (site: big-bro-please-help-me-with-this-new.tech) | A Chrome extension that walks you through confusing website tasks step by step and can act on the page | Older adults and people who struggle with digital interfaces | agentic-ai, backboard, beautiful-soup, context-graphs, cypher, elevenlabs, fast-api, mongodb, neo4j, openai-api, pytest, python, react, shopify-api, tailwind, typescript, vector-search, vite, voyage-api | **Browser agent / computer use**: finds DOM elements, clicks and fills forms, uses RAG over docs, Neo4j context graph, Backboard memory, ElevenLabs voice | No | Domain-name prize (the domain is the joke) |
| Backboard.io: Humanity Award | Chorus | https://devpost.com/software/chorus-wx1l79 | github.com/samtjhia/uofthacks | An AAC "operating system" that predicts what a non-verbal user wants to say and voices it with emotional tone | Non-verbal AAC users | Backboard, DALL-E 3, ElevenLabs, Gemini API, MongoDB, Next.js, OpenAI Whisper, Tailwind, TypeScript | **Multi-agent + voice**: a Gemini "Conductor" runs 7 signal agents (audio, schedule, location, habits, grammar), Whisper listens to the conversation partner, DALL-E generates symbols, ElevenLabs does expressive TTS, Backboard stores memory | No (targets existing tablets) | Devpost gives no reason. Backboard's Rob Imbeault posted about it on LinkedIn: "Many non-verbal users have full cognitive brilliance, but their tools cannot keep up." He framed it as closing the gap between 150 wpm speech and 15 wpm AAC: "not just faster output. It is restored agency" |
| Verily: Future of Health Care | **No winner found** | - | - | No project in the gallery carries a Verily badge. Judging was async, so it may not have been recorded on Devpost | | | | | |

### UofTHacks observations
- **Almost every winner uses AI.** Only DDRK (hardware) and 67Ranked (MediaPipe CV) have no LLM.
- **Multi-agent orchestration is everywhere**, mainly LangGraph (GenUI, Squill, Salus) and custom "conductor" setups (Chorus, Predictify). Sponsors asked for it directly: Foresters wanted 3+ agents and Backboard wanted memory and model switching.
- **Voice is common.** ElevenLabs appears in 8 of 21 winners. Gemini is in almost every stack.
- **Sponsor stacking pays off.** Horizon won 3 prizes, Brick by Brick and Identity Matrix won 2 each. Teams deliberately built on 3-4 sponsor APIs (Backboard, TwelveLabs, ElevenLabs, Gemini).
- **Nearly every tagline ties back to "identity"** (the likely theme, unverified). Identity Matrix, the 1st-place winner, put the theme at the core of its concept.
- **The top 3 are each one clear, demoable "wow" idea:**
  - Identity Matrix: your avatar lives on after you log out
  - Project Horizon: any player's POV from broadcast footage
  - Shop-A-Sketch: draw it, buy it
- The hardware winners (DDRK, LeLamp bots) are physical and playful.
- No judges' reasoning was published anywhere I could reach.

---
## uOttaHack 8

- Devpost: https://uottahack8.devpost.com/ (gallery: https://uottahack8.devpost.com/project-gallery, 8 pages, 175 projects)
- Website: https://2026.uottahack.ca/ ; live site: https://live.uottahack.ca/
- Dates: **January 16-18, 2026**, 36 h, uOttawa CRX building. 568 registered on Devpost (a search snippet says "850+ hackers", unverified).
- Judging criteria (from Devpost): Innovation, Technical Complexity, Completion, Presentation.

### Tracks / prizes (22)

| Prize | Sponsor | Reward / brief |
|---|---|---|
| 1st / 2nd / 3rd Place Overall | uOttaHack/MLH | Meta Quest 3S each / Bambu Lab A1 Mini each / portable monitor each |
| Solace: Agent Mesh | Solace | Up to $1,000 Amazon GC. Build a multi-agent system on Solace Agent Mesh |
| QNX: Hardware Project on the QNX OS | QNX (BlackBerry) | $1,000 GC + Raspberry Pi. Real-time OS on embedded hardware |
| Ross Video: FPGA Challenge | Ross Video | $200/$100/$50 Visa. Video processing in SystemVerilog |
| SurveyMonkey: The Future of Feedback - Natural and AI-Driven | SurveyMonkey | Amazon GCs. AI-driven feedback collection |
| YellowCake: Yellowcake API Project | Yellowcake | $500/$300/$200. Web data extraction |
| Sentry: Best Use of Sentry | Sentry | $1,000 Visa + $5K credits. Best instrumentation |
| Thales: Northern Shield, Maritime Strategy Simulator Challenge | Thales | GCs. Arctic RTS maritime strategy sim |
| NAV Canada: Trajectory Insight Challenge | NAV CANADA | Drones/headphones/speakers. Flight-planning conflict insights |
| uOttawa IT: Agentic Compare | uOttawa IT | 5x$50 GC. Compare multiple agentic AI frameworks |
| Vercel: Smart Edge Load Balancer with AI Guard | Vercel | $50/participant. Bot-detecting edge load balancer |
| [MLH] Best Use of Gemini API / Presage / Solana / DigitalOcean / ElevenLabs / MongoDB Atlas / .Tech Domain | MLH partners | Swag/hardware/credits |
| Best Hardware Hack | uOttaHack | Hardware prize box |
| Best Designed Hack | uOttaHack | $120 split |

### Winners (all 31 badge-holders, every page read)

| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| **1st Place Overall** + Thales Northern Shield | CyberSea | https://devpost.com/software/cybersea-h5kgvf | github.com/jstxw/CyberSea | Real-time 3D strategy simulator for Arctic patrol and resource-protection operations, with AI asset analysis and a command dashboard | Military commanders / planners | gemini, gsap, next.js, numpy, pandas, sketchfab, tailwindcss, three.js | Gemini (via OpenRouter) analyzes military assets and adds tactical annotations. LLM is a feature, not the core | No | none stated |
| **2nd Place Overall** | Snowy Day ("Waymo for snow plows") | https://devpost.com/software/snowy-day-3nfbgm | github.com/ryushen-tan/uOttaHack8-Maze (site: snowyday.tech) | Coordinated route optimization for autonomous snowplows on real city road graphs | City snow-clearing departments | dqn, osmnx, python, react, reinforcement-learning | **No LLM**. Multi-agent **reinforcement learning** (DQN): each plow is its own agent | No | none stated |
| **3rd Place Overall** + NAV Canada + Best Use of Sentry | WingIt | https://devpost.com/software/wingit-4s1gbk | github.com/T0mGates/flight-planner | Visualizes hundreds of flights, detects mid-air conflicts and applies schedule fixes in one click | ATC / flight schedulers | ai, fastapi, gemini, python, react, typescript | Gemini assistant answers operators' follow-up questions about the proposed changes | No | none stated |
| Best Hardware Hack + [MLH] Best .Tech Domain | Ground Unit Response Tank (G.U.R.T) | https://devpost.com/software/ground-unit-response-tank-g-u-r-t | github.com/mizly/gurt (gurt.tech) | Real robotic tank that web players control in 60-second mixed-reality shooter matches, with optional SOL wagering | Gamers | Arduino, C, C++, JavaScript, NumPy, Python, QNX, Raspberry Pi, Solana | None | **Yes**: RPi 4 on QNX 8, Pi camera, 3D-printed parts, custom camera driver | none stated |
| Best Designed Hack | Plante | https://devpost.com/software/plante | github.com/JowiAoun/Plante (plante-flame.vercel.app) | Automated mini-greenhouse with a gamified remote-care app | Indoor plant owners | Arduino, Gemini, MongoDB, Next.js, Raspberry Pi, React, Twilio | Voice-enabled Gemini chatbot for plant advice | **Yes**: Arduino, RPi, servos, pump, temp/humidity sensors | none stated |
| Solace: Agent Mesh | Smart Appetite Manager | https://devpost.com/software/smart-appetite-manager | github.com/tungtuhoccode/Smart-Appetite-Manager | Scans receipts, tracks pantry, suggests recipes, and optimizes shopping across 13 Canadian grocery chains | Canadian grocery shoppers | agent-based-systems, ai/llm-text-processing, docker, event-driven-architecture, postgresql, python, rest-apis, solace-agent-mesh, yaml | **Multi-agent + tool calling** (Inventory, Chef and Shopper agents; price scraping; Google Maps checks) | No | none stated |
| QNX: Hardware Project on the QNX OS | Puck Buddy | https://devpost.com/software/air-hockey-with-yourself | github.com/PencilAmazing/uottahack-QNX | Camera-tracked robotic air-hockey opponent | Air-hockey players | 3dprinting, C++, IPC, QNX | None (CV tracking, no LLM) | **Yes**: RPi 5, camera, motors, 3D-printed parts | none stated |
| Ross Video: FPGA Challenge | ESPN LIVE | https://devpost.com/software/espn-live | github.com/MelvynAV/fpga-ross-gp8 | FPGA-rendered 1080p soccer broadcast with overlays | FPGA/broadcast | Verilog, Vivado | None | **Yes** FPGA | none stated |
| Ross Video: FPGA Challenge | Fire Automaton | https://devpost.com/software/fire-automata | github.com/blue-jay3/UOttaHack8-FPGA | Flame-like cellular automaton rendered on FPGA | FPGA hobbyists | FPGA, SystemVerilog, Verilog | None | **Yes** FPGA | none stated |
| Ross Video: FPGA Challenge | FlapPGA | https://devpost.com/software/flappga | github.com/Bou6-mohamed/ross-UottaHack-NTL | Flappy Bird running entirely in FPGA hardware, with a self-play mode | FPGA learners | Verilog, Xilinx | None | **Yes** FPGA | none stated |
| SurveyMonkey: Future of Feedback | Gorilla Survey | https://devpost.com/software/gorilla-survey | github.com/neelshah27/GorillaSurvey (+ SAM_GorillaSurvey, YellowCake_Reddit_Scrapper) | Replaces survey forms with AI conversations on social media, turned into structured insights | Businesses collecting product feedback | HTML, JavaScript, OpenAI, Python, Solace, SurveyMonkeyAPI, Yellowcake | **Multi-agent** (conversation, qualification via Solace SAM, and response-conversion agents; OpenAI) | No | none stated |
| SurveyMonkey: Future of Feedback | Champanzee | https://devpost.com/software/2026champs | github.com/rbous/champanzee (champanzee.tech) | Kahoot-style async survey quiz rooms with AI follow-ups and insights | Companies running surveys | CSS, Docker, Gemini API, Go, JavaScript, JSON, MongoDB, Next.js, Node.js, Redis, TypeScript, WebSocket | Gemini grades open answers, extracts themes/sentiment, and generates follow-up questions | No | none stated |
| SurveyMonkey: Future of Feedback | Health Guard | https://devpost.com/software/health-guard-jdvhfm | github.com/cshariq/Health-Guard | Voice symptom check, preliminary diagnosis, live medication locator, and family emergency alerts | Patients | Android, Dart, ElevenLabs, Flutter, Gemini, Google Cloud, iOS, OpenStreetMap, Solace, Speech, SurveyMonkey, Yellowcake | **Multi-agent** (Triage, Diagnosis and Sentiment agents on Gemini) + **voice** | Phone only | none stated (solo) |
| YellowCake: Yellowcake API Project | LettuceEat | https://devpost.com/software/lettuceeat-clb6ve | github.com/arohao/uOttaHack8 | Restaurant discovery + group meal planning | University students | Express.js, Gemini, Node.js, React, Tailwind, TypeScript, Yellowcake | Gemini (details unspecified) | No | none stated |
| YellowCake: Yellowcake API Project | MarketSnipe | https://devpost.com/software/marketsnipe | github.com/CaptainCrasi/uottahack2026 | Scrapes Reddit pain points to find target customers for small businesses | Small businesses | CSS, HTML5, JavaScript, Python, TypeScript | Gemini turns user prompts into scraping-API templates | No | none stated |
| YellowCake: Yellowcake API Project | GameScout | https://devpost.com/software/gamescout-smart-steam-deal-web-scraper-game-comparison | github.com/ehan5000/GameScout-Smart-Steam-Deal-Web-Scraper-and-game-comparison | Buy-or-wait recommendations for Steam games + side-by-side comparison | Steam gamers | Express.js, HTML, JavaScript, Node.js, Tailwind CSS, YellowCakeAPI | None stated | No | none stated (solo) |
| YellowCake: Yellowcake API Project | NestFinder | https://devpost.com/software/nestfinder | github.com/Homeless-Gonnabe-5-0/Nestfinder | Apartment finder that optimizes real multi-modal commutes for couples | Couples apartment hunting | CSS, Next.js, Python, React, Solace-Agent-Mesh, TypeScript, YellowCakeAPI | Multi-agent (Solace SAM; listings, geocoding and commute agents), OpenAI scoring | No | none stated |
| Sentry: Best Use of Sentry | Sky Web | https://devpost.com/software/atlas-vnqxte | github.com/King-Mart/Atlas | Web visualization of air-traffic issues and upcoming traffic | ATC | Cesium, JavaScript, Sentry.io | None stated | No | none stated |
| Sentry: Best Use of Sentry | Silent Manor | https://devpost.com/software/silent-manor | github.com/BradyKearley/2026UOttawaHack (itch.io) | Sound-focused horror game | Horror gamers | elevenlabs, flstudio, gdscript, godot | ElevenLabs audio generation only | No | none stated |
| Thales: Northern Shield | Arctic Argus | https://devpost.com/software/arctic-argus | github.com/BradleyNgu/uOttaHack-8 (arcticargus.xyz) | Gamified Arctic tactical sim with a custom physical controller | Defence planners | Arduino, CSS, JavaScript, React | None | **Yes**: Arduino controller | none stated |
| Thales: Northern Shield | CANshield | https://devpost.com/software/canshield | github.com/Sam-Drake-2007/CANshield | RTS Arctic maritime patrol sim | Strategy/defence sim | .tech, CSS, HTML, JavaScript, MapBox, MongoDB, OpenStreetMap, React, recharts, Vercel | None stated | No | none stated |
| NAV Canada: Trajectory Insight | planNAV | https://devpost.com/software/plannav | github.com/seofernando25/planNAV (plannav.ohrats.party) | Flight-schedule collision detector/solver (continuous collision detection + KDE) | ATC | FastAPI, HTMX, Mapbox, Python | None | No | none stated (solo) |
| NAV Canada: Trajectory Insight | ATC Flight Tracker Simulator | https://devpost.com/software/atc-flight-tracker-simulator | github.com/OminousOne/NAV-Canada-Simulator (nav-canada-simulator.vercel.app) | ATC sim with conflict detection, route optimization and fuel/emissions reporting | ATC / aviation researchers | API, CSS, Database, HTML, JSON, Node.js, React, SVG, TSX, TypeScript | None stated | No | none stated |
| uOttawa IT: Agentic Compare | Agent Arena | https://devpost.com/software/agent-arena-el2duw | github.com/peter-bf/AgentArena (agent-arena-uottahack.vercel.app) | Visual benchmark: LLM agents (GPT, Gemini, DeepSeek) play Tic-Tac-Toe, Connect-4 and Battleship; compares how they reason and fail | Teams evaluating agent systems | next.js, react, tailwind, typescript | **Agent planning loops** with JSON-schema validation, retries and error feedback; live streaming + replays + leaderboard | No | none stated |
| Vercel: Smart Edge Load Balancer with AI Guard | Guard | https://devpost.com/software/guard-z42uyb | github.com/teamy2/guard | Edge load balancer with ML bot detection, rate limiting and observability | API/platform operators | hCaptcha, Next.js, PostgreSQL, PyTorch, Redis, Sentry, Vercel | PyTorch bot classifier + heuristics; Sentry Seer AI | No | none stated |
| [MLH] Best Use of Gemini API | DataDiet | https://devpost.com/software/datadiet | github.com/CameronIzadi/DataDiet (datadiet.vercel.app) | Photo food log that surfaces medically relevant patterns and produces doctor-ready reports correlated with bloodwork | Patients + doctors | auth, expo.io, firebase, firestore, gemini, next.js, react-native, tailwind | **Vision** (Gemini 3 Flash food recognition) + chat over meal history | Phone app | none stated |
| [MLH] Best Use of Presage | Synapse | https://devpost.com/software/synapse-3xkhji | github.com/Nautilus001/projectuOttahack8 | Real-time facial-emotion detection to time ads when viewers are emotionally vulnerable (deliberately provocative framing) | Advertisers | C++, Docker, Presage, Python, React, Solace, TypeScript, Yellowcake | Presage emotion sensing + a Solace agent for product suggestions | Webcam | none stated |
| [MLH] Best Use of Solana | Spectra | https://devpost.com/software/s-e-n-t-r-a | github.com/boshyxd/Spectra (spectra-prod-gamma.vercel.app) | Surveillance, kill switch and compliance for **AI agent wallets** on Solana | Developers of autonomous on-chain agents | Next.js 15, React 19, TypeScript, Solana, Web3.js, Shadcn/UI, Tailwind, Supabase, PostgreSQL, SQLite, WebGL, Three.js, Vercel, GitHub Actions, AWS | Monitors and classifies AI-agent behaviour, with a "Rogue Mode" sim (agent oversight) | No | none stated |
| [MLH] Best Use of DigitalOcean | Rain Maker | https://devpost.com/software/rain-maker | github.com/PakmanGames/uottahack8 | Roguelike speedrun game: drag infrastructure components, generate Terraform, deploy to DigitalOcean for real | Devs learning IaC | bash, digitalocean, nextjs, terraform, typescript | None | No | none stated |
| [MLH] Best Use of ElevenLabs | Pitch Perfect | https://devpost.com/software/pitch-perfect-scxa4z | github.com/bradleyyang/pitch-perfect-v2 (+ -server) (pitchperfec.tech) | Feedback on pitch delivery (pacing, fillers) and slide content | Hackers / founders | ElevenLabs, FastAPI, Gemini, JavaScript, Python | **Voice**: ElevenLabs STT with word timestamps + Gemini coach feedback | No | none stated |
| [MLH] Best Use of MongoDB Atlas | Unbiased | https://devpost.com/software/unbiased-0iosvd | github.com/RaiyanAziz55/unbiased | Classifies the political lean of social posts from a URL and shows your media-diet bias | Social media users | dashboarding, data-pipeline, fastapi, gemini, javascript, llm-council, mongodb, react, supadata, vector-embedding, yellowcake | **LLM council**: 4-5 models (Grok, Gemini, Llama) vote, then Claude 3.5 Sonnet acts as "chairman" to synthesize | No | none stated |

### Observations: uOttaHack 8
- **The top 3 overall went to specific, sponsor-shaped problems, not AI chatbots.** 1st (CyberSea) also won the Thales Arctic simulator challenge. 3rd (WingIt) also won the NAV Canada challenge. 2nd (Snowy Day) used reinforcement learning, not an LLM. Stacking the overall win on top of a sponsor challenge was a winning pattern.
- WingIt won 3 prizes (3rd overall + NAV Canada + Sentry): one sponsor problem, done well, plus extra sponsor tooling layered on.
- Far more hardware and FPGA than GenAI Genesis: QNX, Ross FPGA (3), GURT, Plante, Arctic Argus.
- Agent-framework prizes (Solace Agent Mesh, uOttawa Agentic Compare) went to multi-agent designs with clear roles. The "LLM council" pattern (Unbiased) and agent-benchmarking (Agent Arena) also won.
- No stated judging rationale on any page.

---
## nwHacks 2026

- **Devpost:** https://nwhacks-2026.devpost.com/ (gallery: https://nwhacks-2026.devpost.com/project-gallery, 169 projects over 8 pages)
- **Website:** https://nwhacks.io/ (now shows **nwHacks 2027: Jan 16-17, 2027, UBC Life Sciences Institute, "12th iteration"**, with an interest form only)
- **Dates / venue:** Jan 17-18, 2026 (24 hours), UBC Life Sciences Institute, 2350 Health Sciences Mall, Vancouver. Organizer: nwPlus. Devpost lists 631 registered participants.
- **Theme:** none. It is an open project ("Create a project, learn new skills, and have fun").
- **Judging criteria on Devpost:** only **"Completion: Functionality of project"**. The judges are listed as "nwHacks Judges", with no names.
- **Prize pool:** $CAD 2,525 in cash plus non-cash prizes.
- **Sponsors (from the Devpost sponsor list):** PCCA, IdeaMatch.ai, Vidigami, Telus, BCIT SA, Arc'teryx, Block, Centre for Digital Media, CSE CST, Connor Clark & Lunn, 1Password, GitHub, Investly, UBC Student Alumni Connect, InternDB, Warp, BobaTalks, Lovable, Microsoft, SCTY, NationGraph, plus food and venue partners.

### Tracks / prizes (verbatim names from the Devpost prizes section)

| Prize | # winners | Description / reward |
|---|---|---|
| nwHacks 2026 Finalists | 3 | 1st: Arc'teryx jacket + toque + mug, Microsoft office tour, NationGraph shirt + coffee chat. Runners-up: Arc'teryx backpack + toque, JBL Go 3, MS office tour, NationGraph coffee chat |
| Best Design Project | 1 | "exceptional creativity, functionality and user experience". Wacom Intuos tablets |
| Best Beginner Project | 1 | "at least 2-3 first time hackers". JBL headphones, Anker power bank |
| Best Game Project | 1 | "Engaging gameplay, design, and narrative!" Xbox controller, Govee LED strip |
| Potential Community Impact | 1 | "most potential positive impact on an underrepresented community... accessibility... empowerment and equity". Portable monitor |
| nwHacks Team Choice Award | 1 | Chosen by the organizers: "most creative and inspiring". Deskmat, Logitech keyboard |
| [PCCA] Best Wellness Related Hack | 1 | $325 cash |
| [Connor, Clark & Lunn] Best Financial Hack | 1 | $400. "how different data can inform global equity investing... Bonus points for incorporating ML/LLMs" |
| [1Password] Best Security Hack | 1 | $400 (Best Buy cards, 1Password year, recruiter chat) |
| [Warp] Best Developer Tool | 1 | Keychron keyboards |
| [Block] Best Real-World Ready AI Product | 1 | $400. "best demonstrates real-world viability, thoughtful design, and responsible use of AI" |
| [Lovable] Best use of Lovable | 1 | 3 months of Lovable Pro |
| [Telus] The Edge of Innovation | 1 | $1,000 in gift cards + co-op interview offers (largest cash prize) |
| [MLH] Best Use of Vultr / Gemini API / Snowflake API / Elevenlabs / Solana / Presage; Best .Tech Domain Name | 1 each | Hardware and swag |

### Winners (20 winning projects; all read on Devpost; badges verified)

"1st place" note: all three finalists carry the same badge, "nwHacks 2026 Finalists". Only **Rehabify's own write-up** says "🏆 1st PLACE OVERALL". That is self-reported, and I found no official confirmation (unverified). SpeakCode and Atlasic are therefore the runners-up by elimination (unverified).

| Prize | Project | Devpost | GitHub | What it does | For whom | Built with (Devpost tags) | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| Finalists (self-reported **1st overall**) | Rehabify | devpost.com/software/rehabify-y2f5mu | github.com/obro79/Rehabify (live: rehabify.tech) | Webcam PT coach with real-time form correction, voice coaching and a physiotherapist dashboard | Home-physio patients + physiotherapists | deepgram, elevenlabs, javascript, mediapipe, neon, react, sql, typescript, vapi, vercel | **Voice agent** (Vapi: Deepgram STT → Gemini → ElevenLabs TTS); Gemini generates personalized plans; **vision** via MediaPipe Pose in the browser (WASM), with no video leaving the device | Webcam only | No judges' comments. Team cites a validated problem ("Only 35% of patients complete prescribed exercises") and PT feedback ("Every PT we talked to lit up when they saw the dashboard") |
| Finalists | SpeakCode | devpost.com/software/speakcode-mxv98c | github.com/armanchinai/nwHacks2026 | Mock technical interview that grades both the code and the verbal explanation | FAANG-track interview candidates | Tags only: node.js, passport-js. The write-up also names React, Vite, Monaco, Flask, WebSockets, OpenAI GPT-4, Whisper, Librosa, Parselmouth, Docker, Fly.io | **Voice**: Whisper STT; GPT-4 as a "Critical Interviewer" grader; acoustic features (pitch, pace, filler words) via Librosa/Parselmouth. A pipeline, not an agent | No | None stated |
| Finalists | Atlasic | devpost.com/software/atlasic | None listed (VS Code Marketplace: atlasic.atlasic) | VS Code extension that renders a codebase's dependency graph interactively | Devs onboarding to large codebases | gemini, rust, typescript | Gemini for debugging help with JIRA-ticket context and git-diff review | No | None stated. Team: tested on the VS Code and Linux kernel codebases; Rust via NAPI-RS for speed |
| Best Design Project | Get Clipped! | devpost.com/software/clipper-ph49un | github.com/daniel-mwj/clipped | Study app that snaps an embarrassing photo when you leave it and posts it to a friends' "Clip Feed" | Students / study groups | fastapi, firebase, python, react-native, websockets | None | Phone camera | None stated |
| Best Beginner Project + [PCCA] Best Wellness Related Hack | SteadyScript | devpost.com/software/steadyscript | github.com/SteadyScript/SteadyScript | Biofeedback pen + web app with guided exercises for hand steadiness | Parkinson's, stroke and brain-injury patients | arduino, c++, fastapi, opencv, python, react, real-time, tailwind, typescript, vite, websockets | None (classical CV: HSV segmentation) | **Yes**: Arduino pen with LEDs | None stated |
| Best Game Project | Dance CV | devpost.com/software/dance-cv | github.com/douglasichen/DanceCV | Upload a dance video, then get scored live via webcam against it | Dance learners | gemini, mediapipe, opencv, react, tailwind, typescript, vite | Gemini for video analysis, splitting the dance into chunks, and **voice commands** ("Restart the song!"); MediaPipe pose scoring | Webcam | None stated |
| Potential Community Impact | Embers | devpost.com/software/concord-d6txpr | github.com/Mesh-Forest-Fire (api-gateway, client-side, mesh) | Offline mesh network of edge-AI sentry nodes that detect wildfires | First responders in the wildland-urban interface | computervision, express.js, mongodb, netify, node.js, python, railway, raspberry-pi, react, tensorflowlite | Edge **vision** (MobileNetV2 → TFLite) + sensor fusion; no LLM | **Yes**: Raspberry Pi 4 nodes, Android sensors, ad-hoc Wi-Fi mesh | None stated |
| nwHacks Team Choice Award | clip | devpost.com/software/clip-y8jugr | github.com/jaykbpark/giggles | Voice-activated memory capture + semantic search for Meta Ray-Ban glasses | Dementia patients and caregivers, general users | clip, cloudflare, elevenlabs, fastapi, gemini, milvus, sqlite, swift | **RAG**: CLIP embeddings in Milvus; Gemini answers; ElevenLabs STT/TTS voice | **Yes**: Meta Ray-Ban glasses + iOS | None stated |
| [Connor, Clark & Lunn] Best Financial Hack | MarketMind | devpost.com/software/marketmind-vlobg1 | github.com/dewgong5/nwhacks2026 | Sandbox market simulation populated by LLM trader agents | Beginner investors | fastapi, gemini, lovable, openrouter, python, react, recharts, typescript | **Multi-agent simulation**: LLM agents via OpenRouter with personas (quant, value, retail); Gemini chatbot gives live market commentary | No | None stated. The prize text said "Bonus points for incorporating ML/LLMs" |
| [1Password] Best Security Hack | Trojan | devpost.com/software/trojan | github.com/jkuo630/Trojan | Scans a repo for vulnerabilities and auto-generates fixes | Small dev teams without security staff | javascript, langgraph, next.js, oauth, openai, python, supabase, vercel, websockets | **Multi-agent (LangGraph)**: 4 parallel specialist agents (auth, injection, sensitive data, crypto) on GPT-4o-mini, then triage and fix generation, streamed via SSE | No | None stated |
| [Warp] Best Developer Tool + [MLH] Best Use of Snowflake API | CodeAncestry | devpost.com/software/codeancestory | github.com/OM200401/nwHacks-2026 | Turns git commit history into a searchable Q&A knowledge base | Devs on legacy codebases, new joiners | 1password, cortex, fastapi, gemini, github, oauth, python, rag, react, snowflake, vite | **RAG**: Snowflake Cortex embeddings + COMPLETE; Gemini classifies queries (semantic/temporal/hybrid); cites commits | No | None stated |
| [Block] Best Real-World Ready AI Product | BizBot | devpost.com/software/bizbot-1m45lk | github.com/elijahzhao24/BizBot | Robot event photographer that captures, curates and publishes candid photos | Event organizers and attendees | arduino, fastapi, gemini, opencv, pytorch, supabase, yolo | Gemini multimodal **vision** scores technical photo quality (0-1); YOLO detection; deterministic pipeline + admin fallback, not an agent | **Yes**: Arduino mobile robot + phone camera | No judges' comments. Team: "We really focused on reliability and responsibility, not just a cool AI feature"; they deliberately do not ask Gemini to judge attractiveness or demographics. This matches the prize wording ("responsible use of AI"), but that link is my inference |
| [Lovable] Best use of Lovable | Emergency Eye | devpost.com/software/emergency-eye | github.com/dave22r/alertstream-live (live: ee-mu-sand.vercel.app) | Turns phones into live emergency broadcast cams with GPS for responders | First responders, bystanders | api, leaflet.js, loveable, python, react, render, typescript, vercel | **Vision** weapon/threat flagging via Gemini (OpenRouter) | Phones | None stated |
| [Telus] The Edge of Innovation | MelaNone | devpost.com/software/melanone | github.com/jasonkwok475/MelaNone | Scanning chamber that photographs skin from several angles and classifies spots for melanoma | Patients, clinics | c, cv, flask, python, pytorch, react, solidworks, vite | Pretrained PyTorch classifier (vision); no LLM | **Yes**: repurposed 3D printer, 3 webcams on steppers, ESP32 | None stated |
| [MLH] Best Use of Vultr | Nexus | devpost.com/software/nexus-g349ko | None listed (nexusapp.tech) | AI-native event-planning platform for student clubs, integrated with Slack, Sheets and GitHub | Club executives | asyncio, fastapi, httpx, langchain, langgraph, lucide, mongodb, motor, next.js, python, radix, react, redis, shadcn, tailwind, typescript, uvicorn, voltr | **Agentic**: LangGraph workflow splits tasks across role agents (finance, events); **tool calling via MCP**; Gemini + ChatGPT | No | None stated |
| [MLH] Best Use of Gemini API | ListenMe | devpost.com/software/anomiaaid | github.com/Bardia-Masudy/nwHacks-listen.me | Suggests forgotten words live during conversation | Stroke survivors with anomic aphasia; SLPs | fastapi, firebase, google-gemini-live-api, indexeddb, oauth, react, tailwind-css, typescript, vercel, vite, web-audio-api | **Real-time voice**: Gemini Live native-audio bidirectional streaming detects pauses and hesitations | No | None stated |
| [MLH] Best Use of Elevenlabs | HUDson | devpost.com/software/hudson-uw5kn7 | github.com/iancdev/hudglasses | Wearable that visualizes sound (direction/speech) through AR glasses and haptics | Deaf / hard-of-hearing people | 3dprinting, c++, elevenlabs, esp32, kotlin, python | ElevenLabs speech processing | **Yes**: mic neckband, AR glasses, haptic wristbands, ESP32, 3D-printed parts | None stated |
| [MLH] Best Use of Solana | Argus | devpost.com/software/argus-fgtsu5 | github.com/JohnsonL111/argus | "Git for quant researchers": versions model and dataset runs, tracked on-chain | Quant researchers | gemini, python, rust, solana, textual, vultr | Gemini summarizes runs and metrics | No | None stated |
| [MLH] Best .Tech Domain Name | Play It Forward | devpost.com/software/toyshare | github.com/vvictort/nwhacks-2026 | Community platform for donating and requesting used toys | Families in need, donors | css, docker, express.js, firebase, gemini, github, html, javascript, lovable, node.js, react.js, recaptcha, scp, snowflake, tailwind-css, typescript, vite, vultr | Gemini **vision** auto-categorizes toy photos (category, age, wear) to fill forms | No | None stated |
| [MLH] Best Use of Presage | VibeSense | devpost.com/software/vibesense | github.com/havido/VibeSense | Converts facial expressions into audio cues | Blind / low-vision people | arduino, deepface, flask, presage, python, sdk, swift | DeepFace emotion detection; Gemini refines emotion from recent detection history | **Yes**: Arduino + buzzer | None stated |

### nwHacks observations
- Only 20 of 169 projects won anything, and the gallery's second page has no winners.
- The only published judging criterion is "Completion: Functionality of project", which favours working demos.
- **About 16 of 20 winners use an LLM or ML model.** Gemini is the most common model by far (about 11 winners); OpenAI appears in 2. Truly agentic builds (multi-agent orchestration, tool calling or MCP) are a minority, and they won sponsor tracks: Trojan (1Password), MarketMind (CC&L), Nexus (Vultr). The finalists use AI as a pipeline component (voice coaching, grading), not as autonomous agents.
- **Voice is common among top projects:** Rehabify (Vapi voice agent), SpeakCode (Whisper), ListenMe (Gemini Live), clip, Dance CV.
- **Hardware is well represented:** 7 of 20 winners (SteadyScript, Embers, clip, BizBot, MelaNone, HUDson, VibeSense). Many more use webcam CV (MediaPipe/OpenCV).
- **Health and accessibility dominate** (Rehabify, SteadyScript, MelaNone, ListenMe, HUDson, VibeSense, clip, Embers). The projects that sound like judge magnets have a named, specific user (for example, stroke survivors with anomic aphasia) and a concrete statistic.
- No project page includes judges' comments. Rehabify is the only one claiming 1st place, and it is self-reported.

---
## McHacks 13

**Links**
- Devpost: https://mchacks13.devpost.com/ (gallery: https://mchacks13.devpost.com/project-gallery)
- Website: https://mchacks.ca/ (2026 site: https://2026.mchacks.ca/), app portal https://app.mchacks.ca/
- LinkedIn: https://ca.linkedin.com/company/mchacks (HackMcGill)

**Event facts**
- Dates: **January 17-18, 2026**. In person at the McGill SSMU Building, 3480 Rue McTavish, Montreal.
- Scale: 485 registered participants, **127 projects** in the gallery (6 pages), **20 winning projects**.
- Format: non-themed, open-ended, beginner-friendly. The theme wording is about "magic" ("great technology can feel a little like magic"), but projects are not required to follow it.
- Prize pool: $8,600+.
- Judging criteria: **Execution** (functionality, usability, UI/aesthetics), **Technical Complexity**, **Impact** (real-world problem, scalability), **Creativity**.
- Also ran a **"Bot or Not" post-project challenge** ($1,000 / $500, deadline Feb 14 2026), per 2026.mchacks.ca.
- Sponsors on the site: HoloRay, Athena AI, Gumloop, National Bank, Bassili AI, Dobson Centre, Backboard.io, Desjardins, Finance Montreal, PureButtons, Sourcebot. MLH prizes were also offered.

**Tracks / prizes**

| Prize | Reward | Brief (as given on Devpost) |
|---|---|---|
| 1st Place | $2,000 cash | Overall, open-ended |
| 2nd Place | Meta Ray-Ban glasses per member | Overall |
| 3rd Place | Bose NC headphones per member | Overall |
| People's Choice | McGill CS merch per member | Community vote |
| Best Beginner Hack | Bluetooth speaker per member | Newcomers |
| Best Design | Wacom tablets per member | Aesthetics / UX |
| Chaotic Evil | Snuggies for team | Humorous or unhinged hack |
| Best Use of AI / AI Agents (Botpress) | $400 cash + $100 Amazon GC per member | AI / agents |
| HoloRay "Anchored Insight: Motion-Tracked Annotations for Live Medical Video" | $1,200 ($300 CAD per member) + internship fast-track | Annotations that stay locked to anatomy in moving medical video |
| Best Athena AI Agent for University Students | Premium trials, gift boxes, merch, interviews, promo to 3M+ users (multiple winners) | Build an agent on the Athena AI platform for students |
| Best AI project using the Gumloop API | $1,000 / $500 / $250 | AI project using Gumloop workflows |
| National Bank High-Frequency Trading Strategy Development Competition | $2,000 cash | HFT strategy / market data |
| MLH: Best Use of ElevenLabs, Auth0, Gemini API, MongoDB Atlas, DigitalOcean, Solana | Swag / tech prizes | Standard MLH sponsor prizes |

**Winners** (all 20 badge-holders; every Devpost page below was read)

| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| **1st Place** | McGill Go | https://devpost.com/software/exchange-v1hmq8 | https://github.com/yufei002/McHacks-13 | Finds courses at partner universities that count toward a McGill degree for exchange planning | McGill students planning an exchange | Claude, Cursor, FastAPI, Gemini, MongoDB, Next.js, Python, React, Selenium | Claude and Gemini are tagged but the page doesn't say how they're used. Selenium scraping of course data is the core. | No | Not stated |
| **2nd Place** | WaterYouDoin | https://devpost.com/software/wateryourdoin | https://github.com/memoud0/WaterYourDoin | Browser extension that classifies prompts locally before they reach an AI, sends factual queries to search, and blocks low-value requests ("save water" from AI compute) | Developers and heavy AI users | JavaScript, Node.js, TypeScript, Vite, Vitest | Anti-LLM angle: local NLP heuristics plus an optional ML fallback, with no LLM calls | No | Not stated |
| **3rd Place** + Gumloop prize | Bloomscroll | https://devpost.com/software/brain-rejuvenate | https://github.com/jackolsen0171/mchacks_13 | Turns study material into a vertical "reels" feed with spaced repetition | Students who doomscroll | Gumloop, JavaScript, MongoDB, Svelte, Tailwind | Gumloop AI workflows generate learning content from material (model not stated) | No | Not stated |
| People's Choice | DeskBuddy | https://devpost.com/software/skibidi-y1fbqp | https://github.com/ChrisYx511/mchacks13-desktop-companion (+ `-backend`) | Desktop avatar widget that shows your study state so friends can see each other studying, with no calls or cameras | Students studying alone | Electron, React, Ruby on Rails, TypeScript | None stated | No | Not stated (community vote) |
| Best Beginner Hack | SIY - Style It Yourself | https://devpost.com/software/siy-style-it-yourself | https://github.com/Paullitsc/Style-It-Yourself | Upload clothes, get colour-based pairing recommendations, virtual try-on, digital closet | Fashion-conscious people with decision fatigue | FastAPI, Gemini, Next.js, Python, Supabase, Tailwind, TypeScript | Gemini image generation for virtual try-on. ColorThief for colour extraction. | No | Not stated |
| Best Design | Doppel | https://devpost.com/software/doppel | None listed | AI "doppelgängers" of users hold turn-based conversations with other users' personas. A separate judge model scores compatibility before the real people are introduced. | People networking, dating, or looking for mentors or collaborators | Gumloop, Next.js, React, Supabase, Tailwind, TypeScript, Vercel | Multi-agent: persona agents talk to each other, plus an LLM-as-judge scorer (model not stated) | No | Not stated |
| Chaotic Evil | LookBack | https://devpost.com/software/lookback-n8eap4 | https://github.com/vladmateirusu/McHacks2026 | "Never walk in blind": smart-glasses concept that recognizes faces and shows the person's name, shared interests, and mutual friends | Partygoers and networkers | Flask, Gemini, Python, Swift | Vision (face detection and recognition) plus Gemini profile summarization | Designed for smart glasses, prototyped on a phone because no glasses were available | Not stated. The privacy-invasive premise fits "Chaotic Evil". |
| Best Use of AI / AI Agents (Botpress) | Ascend | https://devpost.com/software/ascend-eaiqno | https://github.com/Swagat404/Ascend | Autonomous agent that keeps A/B testing UI variants (button placement, copy), reads click data, and ships the statistically better version | Small, fast-moving businesses | agentic-ai, FastAPI, Gemini, React | Autonomous Gemini agent loop that proposes variants, splits users, analyzes, and decides, with guardrails | No | Not stated |
| HoloRay Anchored Insight | Holoray Project | https://devpost.com/software/holoray-project | https://github.com/Ryan-C-Marshall/McHacks2026/tree/interface | Real-time polygon and freeform annotations that track moving medical video | Surgeons, ultrasound techs, educators | Python, OpenCV, Flask, JavaScript, HTML, CSS | None. Classical CV tracking with OpenCV. | No | Not stated |
| Best Athena AI Agent (1 of 3) | Rubric | https://devpost.com/software/herculesai | https://github.com/achneerov/mchacks13 | Dashboard that pulls together Moodle, tools, and an AI study assistant | University students | Athena, DigitalOcean, Express.js, React, TypeScript | "Athena" chatbot makes quizzes from course PDFs. Custom **MCP server** supplies course context. | No | Not stated |
| Best Athena AI Agent (2 of 3) | Care Compass | https://devpost.com/software/care-compass-zmpdn5 | https://github.com/fias06/CareCompass | Ranks hospitals and clinics by fastest time to care (traffic, wait times, urgency) instead of distance | People who need urgent care | Athena AI, CSS, Google Maps, JavaScript, Next.js, React, TypeScript | Athena AI front end, AI severity triage, ElevenLabs TTS/STT for accessibility | No | Not stated |
| Best Athena AI Agent (3 of 3) | Synthframe | https://devpost.com/software/synthframe-3c9qkb | https://github.com/alyssayuan17/synthframe | Turns a napkin sketch or text into a structured UI wireframe, then refines it through conversation | Designers and developers | Athena, Figma, Gemini API, JavaScript, MongoDB, Python | OpenCV contour detection **plus** Gemini 2.5 Flash producing structured JSON layouts. 4-level fallback (hybrid, vision-only, text-only, default). Conversational edits. | No | Not stated |
| Gumloop prize (rank not shown) | AIly | https://devpost.com/software/personalcfo | https://github.com/Lstl04/AIly (demo on AWS Amplify) | Handles schedules, invoices, and expenses for small businesses | Small-business owners | AWS, Auth0, ElevenLabs, FastAPI, Gumloop, JavaScript, MongoDB, Python, React | Chatbot with access to business history that **launches Gumloop workflows** (tool use). ElevenLabs STT for voice-driven invoices and calendar events. | No | Not stated |
| Gumloop prize (rank not shown) + Best Use of Auth0 | Consensus Capital | https://devpost.com/software/consensuscapital | https://github.com/nic5694/ConsensusCapital | Links a stock portfolio to live Polymarket prediction-market odds to surface macro risks and correlations | Stock traders and portfolio managers | Auth0, Docker, FastAPI, Gemini, MongoDB, Proxmox, Python, React, Spring Boot | Gumloop workflows for stock classification and noise filtering. Embedding cosine similarity matches stocks to events. Gemini. | No | Not stated |
| National Bank HFT | Market Wizard | https://devpost.com/software/market-wizard | https://github.com/carterj-c/mchacks13 (live: mchacks13-7gvi.vercel.app) | Real-time market-regime classifier (normal, stressed, HFT-dominated, flash crash) from bid/ask microstructure | Quant traders and algo systems | AI, Cloud, Node.js, Python, React, XGBoost | Classical ML (XGBoost). No LLM. | No | Not stated. The team's LinkedIn post (via the HackMcGill page) describes the build but gives no judges' reasoning. |
| MLH Best Use of ElevenLabs | GoAction | https://devpost.com/software/goaction | https://github.com/GeorgesAbiChahine/goaction | Hands-free "second brain": records conversations, transcribes them, and turns spoken action items into calendar events and tasks | Clubs, professionals, founder communities | Auth0, Gemini, Gumloop, Next.js, TypeScript | ElevenLabs Scribe for real-time STT, plus an **ElevenLabs Conversational AI voice agent with tool calling** over WebRTC. Gemini 2.5 Flash extracts actions as JSON. | Optional: works with Meta glasses or any mic | Not stated |
| MLH Best Use of Gemini API | ORBIT | https://devpost.com/software/orbit-b1t3np | https://github.com/shanvinluo/orbit (live: orbitfinancial.vercel.app) | 3D force-graph of relationships and board interlocks across S&P 500 companies, with news impact analysis | Investors and analysts | Next.js 14, TypeScript, Tailwind, Framer Motion, Three.js, Node.js, Gemini 2.0 Flash | Gemini for entity extraction and bullish/bearish sentiment on news, with multi-layer JSON validation | No | Not stated |
| MLH Best Use of MongoDB Atlas | MIRR.AI | https://devpost.com/software/fashion-mxr7e3 | https://github.com/AntoDono/McHacks2026 | Chrome extension for virtual try-on of any clothing item on any shopping site, from 7 angles | Online shoppers and retailers (returns) | Flask, Gemini, Google Cloud, MongoDB, Node.js, Plasmo, React, TypeScript, Vertex AI | Vertex AI diffusion for avatars and garment transfer. Gemini 2.5 Flash runs as 7 parallel workers via Gumloop. U2-Net segmentation. FashionSigLIP embeddings for recommendations. | No | Not stated |
| MLH Best Use of DigitalOcean | reLive | https://devpost.com/software/relive-24jzoe | https://github.com/areeeeeeeb/reLive | Detects which concert a fan-shot video came from (GPS and time, Setlist.fm) and assembles relivable shows | Concert-goers | DigitalOcean, Ionic, React, TypeScript | None | No | Not stated |
| MLH Best Use of Solana | MTL Minted | https://devpost.com/software/black-beauty | https://github.com/zaifnatra/solana | Local artists tokenize their identity and release badges or fractional tokens to supporters | Local artists and fans | CSS, HTML, JavaScript, Rust, SQL, TypeScript | None | No | Not stated |

**McHacks 13 observations**
- The **top 3 are not the most technically complex projects.** All three solve very specific, relatable student or dev problems with a clear hook: exchange course equivalency at McGill, "stop wasting AI compute on dumb prompts", and "doomscroll but study". McGill Go is hyper-local, built for McGill students.
- 2nd place is an **anti-AI / AI-restraint** idea with no LLM at all. The concept and framing stood out from the flood of LLM apps.
- Agentic work mostly wins **sponsor prizes**, not the overall ranking: Botpress went to Ascend (autonomous A/B agent), Athena to three agents, and ElevenLabs to GoAction (voice agent with tool calling).
- Gemini appears in about 10 of 20 winners. Gumloop appears in 5 winners (including Doppel and GoAction, which weren't Gumloop winners).
- Almost no hardware. LookBack was designed for glasses but demoed on a phone.
- No judges' reasoning is published anywhere I could reach.

---
## ConUHacks X (10th edition; Devpost slug "conuhacks-x")

**Links**
- Devpost: https://conuhacks-x.devpost.com/ (gallery: https://conuhacks-x.devpost.com/project-gallery)
- Website: https://www.conuhacks.io/ (organizer HackConcordia: https://www.hackconcordia.io/)
- Socials: https://www.instagram.com/conuhacks/, https://linktr.ee/ConUHacks, https://x.com/ConUHacks

**Event facts**
- Dates: **January 24-25, 2026** (24 hours). Concordia JMSB, 1455 De Maisonneuve Ouest, Montreal.
- Scale: 877 registered participants, **260 projects** (11 gallery pages), **32 winning projects**.
- Devpost themes: Beginner Friendly, Education, Open Ended. Requirement: "Something cool and impressive. Surprise us!!"
- **Jungle / adventure flavour:** several Desjardins winners (JungleBank, Desjungles, "Jungle Bank", adventure banking) point to a jungle/adventure theme and an **environment-adaptive banking** brief for Desjardins (inferred from winners; brief not published) (unverified).
- Prize pool: CAD $41,351+.
- Judging criteria: **Working Demo**, **Presentation Quality**, **Design & Aesthetics**, **Potential Impact & Creativity**, **Technical Difficulty**.

**Tracks / prizes**

| Prize | Reward | Brief |
|---|---|---|
| 1st Place, General Challenge | CAD $7,359: MacBook Air M4 per member | Overall |
| 2nd Place, General | CAD $3,220: Steam Deck OLED per member | Overall |
| 3rd Place, General | CAD $1,380: Sony WH-1000XM4 per member | Overall |
| [HackConcordia] Best Hardware | CAD $1,150: Raspberry Pi 5 + AI kit per member | Hardware |
| [HackConcordia] Best Beginner | CAD $805: LG 27" monitor per member | All members first-time hackers |
| Desjardins (5 winners) | CAD $2,300 total ($200 down to $50 prepaid per member) | Brief not published. Winners all built adaptive, environment-aware banking apps with a jungle/adventure flavour (inferred). |
| Deck (3 winners) | CAD $4,079 total (1st $1,500 USD + skateboard; 2nd $1,000 USD; 3rd $500 USD) | Brief not published. Drop'edthe.tech says its team "worked a lot with browser automation... so we thought the deck challenge would be perfect", so it is likely a browser or web automation challenge (unverified). |
| SAP (3 winners) | CAD $400 + lunch with executives | Brief not published. All 3 winners are **AI lost-and-found** systems, so the brief was likely lost-and-found matching (unverified). |
| D3 Security (2 winners) | CAD $1,000 (Amazon cards, D3 interview, RSA Conference pass) | Brief not published. Both winners turn security logs or events into explainable, prioritized cases (SOC alert fatigue) (unverified). |
| Beenox | Gaming keyboard, headset, CoD BO7 per member | Games (winner: Vulkan C++ game) |
| Druide (2 winners) | Antidote+ subscription per member | "Best Use of Language (Presentation)": quality of language in the presentation |
| MentorMates | CAD $100 | Not published |
| Talsom | CAD $400 | Not published |
| Dialogue (3 winners) | Cursor Pro 1-year, swag, office visit, 5à7 | Brief not published. All 3 winners are AI health agents that triage and **book clinic appointments** (unverified). |
| Front Row Ventures, Investor Pitch Award | 30-min pitch meeting with FRV investment team | Most investable / pitch |
| MLH: Gemini API, Solana, Vultr, ElevenLabs, Snowflake API, MongoDB Atlas, .Tech domain | Swag / hardware kits | Standard MLH |

**Winners** (all 32 badge-holders; every Devpost page below was read)

| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| **1st Place, General** | ViniClip | https://devpost.com/software/viniclip | https://github.com/mahutt/ViniClip | "Opinionated" automatic video editor that cuts pauses and mistakes **live while you record** in the browser, then can post to Instagram Reels | Content creators | ffmpeg, Python, React, TypeScript (also FastAPI, WebSockets per the write-up) | **Agentic.** Moonshine STT, then the OpenAI Responses API with **function calling** decides which segments to cut and triggers the Reel upload. Real-time async event queue. | No | Not stated |
| **2nd Place, General** | Pinscher | https://devpost.com/software/pinscher | https://github.com/katkes/ConUHacksX | Hands-free Mac control with hand gestures and voice: present slides, move through docs, run tasks. Also generates slide decks and speaker notes from recorded sessions. | Presenters. Accessibility for limited mobility. | Electron, Gemini, JavaScript, marp-cli, OpenCV, Python, React | **Computer-use-style OS control.** Gemini 2.0 Flash parses intent from voice and summarizes video. Vosk offline STT. OpenCV hand tracking. | Webcam only | Not stated |
| **3rd Place, General** | JungleBank | https://devpost.com/software/junglebank | https://github.com/afsans1/JungleBank (live: junglebank.onrender.com) | Finance-education banking platform: expense tracking, stock investing, and a Godot treasure-hunt game with a day/night cycle | Children and young teens | React, Express, Godot, GDScript, HTML, CSS, JS, ElevenLabs, Gemini | "Gemini AI Banker" assistant plus ElevenLabs voice | No | Not stated. Also aimed at the Desjardins theme. |
| [HackConcordia] Best Hardware | PETER the ProtectoBot | https://devpost.com/software/peter-the-protecto-bot | https://github.com/aburiz/Conuhacks2026 | 2-wheel sentry robot with camera and speaker. Runs in teleop, gesture, and autonomous modes. | Home security, robotics hobbyists | Fusion 360, C++, CUDA, ESP32, imitation learning, Python, PyTorch | Not an LLM: custom ResNet (transfer learning) plus **imitation learning** on data collected at the project. Predicts the scene 1 s ahead to hide Wi-Fi camera lag. | **Yes**: 3D-printed chassis, ESP32-S3 Sense, hand-soldered op-amp speaker circuit | Not stated. The tagline stresses "True Full Stack" (hardware to ML). |
| [HackConcordia] Best Beginner | FOMO | https://devpost.com/software/fomo-91dnsu | https://github.com/yansvassi/FOMO | iOS map of where crowds are gathering right now. Ask location-tied questions to people who are there. | People looking for local events | ChatGPT, Firebase, Firestore, Swift, Xcode | ChatGPT is tagged but its use isn't described | No | Not stated (all first-time hackers) |
| Desjardins (1 of 5) | TheGardens | https://devpost.com/software/thegardens | https://github.com/MinhVo2005/ConuHack | Adaptive banking app across mobile, web, and a game, controlled by a **gesture haptic glove** | People who can't use standard input (work conditions, disabilities) | C++, CSS3, Dart, ESP32, Flutter, HTML5, IMU, JS, Python, SQLite, TS | None stated | **Yes**: ESP32 + IMU haptic glove, BT/Wi-Fi | Not stated |
| Desjardins (2 of 5) | Desjungles | https://devpost.com/software/desjungles | https://github.com/cristina-trofimov/desjungles | Banking app that adapts to surroundings: multiple faces on camera trigger a secret TTS "spy mode", ambient light sets the theme, motion triggers a jungle mode | Desjardins customers | BlazeFace, Expo, MongoDB, Node.js, React Native, TypeScript, Whisper | On-device vision (BlazeFace face count) plus Whisper speech | Phone sensors only | Not stated |
| Desjardins (3 of 5) | Jungle Bank | https://devpost.com/software/jungle-bank | https://github.com/LucasMontion/JungleBank/tree/main_v2 | Banking app simulated for people in wild environments | Not stated | Expo Go, MongoDB, React Native, Python, TypeScript | None | No | Not stated |
| Desjardins (4 of 5) | Desjardins ConUHacks Adventure Banking App | https://devpost.com/software/desjardins-conuhacks-adventure-banking-app | https://github.com/MatthewBuzzetti/ConuHacks2026 | Banking plus adventure tools: auto-camouflage, compass, voice controls, ML detection of a second person to hide details | Not stated | CSS, Expo, HTML, JavaScript, ML | ML presence detection (model not stated) | Raspberry Pi sensors were planned but abandoned | Not stated |
| Desjardins (5 of 5) | Banq Pirate | https://devpost.com/software/banq-pirate | https://github.com/keatonnguyen/Pirate-Informatique | Banking app that adapts to darkness or no touchscreen: gestures and voice | People with low vision, varied environments | ElevenLabs, Google AI Edge, Java, SQLite, XML | ElevenLabs TTS, MediaPipe/AI Edge hand-gesture recognition, camera-based environment detection | ESP32 only planned | Not stated |
| Druide, Best Use of Language (Presentation) | CodeMafia | https://devpost.com/software/codemafia | https://github.com/rayyankhan47/codemafia (live: codemafia.vercel.app) | "Among Us meets competitive programming": fix bugs while a hidden impostor sabotages the code | Competitive programmers and gamers | Framer, PartyKit, Pyodide, Python, React, TypeScript, Zustand | None | No | Not stated (prize is for presentation language quality) |
| Druide, Best Use of Language (Presentation) | Nova Legends | https://devpost.com/software/nova-legends | https://github.com/tahakhalfi/EHC-NOVA_LEGENDS | 2D multiplayer knight shooter on a **custom engine built from scratch** (physics, audio, UI, netcode) | Gamers | Java, Socket, Vultr | None | No | Not stated |
| Deck (rank not shown) | Schooless | https://devpost.com/software/schooless | https://github.com/Luchiga19/conuhacks2026 | Tagline "Devtools Network AI". The page has almost no description. | Not stated | Amazon EC2, Angular, CLIP, MongoDB, Python, TypeScript | CLIP tagged. Details not stated. | No | Not stated |
| Deck (rank not shown) | llm in chrome | https://devpost.com/software/test-mszpgt | https://github.com/hanzili/llm-in-chrome | "Open-source Claude in Chrome that works with any LLM": a browser agent extension | Not stated | CSS, HTML, JavaScript | **Browser-use / computer-use agent** with any LLM (the write-up is thin; the team says Devpost banned detailed submissions) | No | Not stated |
| Deck (rank not shown) | Drop'edthe.tech | https://devpost.com/software/drop-edthe-tech | https://github.com/spilledthoughts/ConUHacks (site: dropedthe.tech) | Bot that drops you out of Concordia "at record speeds" through browser automation and backend APIs, with CAPTCHA and rate-limit workarounds | Concordia students (joke utility) | CSS3, HTML5, JavaScript (Puppeteer, Electron in the write-up) | None. Scripted browser automation. | No | Not stated. The team says its browser-automation experience made "the deck challenge perfect for us". |
| SAP (1 of 3) | One-Man-Crew | https://devpost.com/software/one-man-crew | https://github.com/NawarTurk/HACK_human-in-loop-lostfound | AI lost-and-found matching with a **human-in-the-loop**: admin verifies the top 5 suggested matches | Students and institutions | Cosine similarity, Flask, Gemini API, image and text embeddings, pandas, Python, React, SMTP | Gemini plus multimodal embeddings for ranking. Humans make the final decision. | No | Not stated |
| SAP (2 of 3) | SherLostHolmes | https://devpost.com/software/sherlostholmes | https://github.com/AndrewKaranu/SherLostHolmes | Gamified lost-and-found: AI matching, an AI "interrogation room" that checks ownership, and **smart locker** pickup | Concordia students | Cloudinary, LangChain, MongoDB, Python, React, Next.js 14, TS, Tailwind, Clerk, Framer Motion, FastAPI, OpenRouter, XIAO ESP32-S3 | LangChain + OpenRouter. Embeddings for matching. An LLM persona asks ownership questions under strict anti-leak prompting. | **Yes**: ESP32-S3 + servo lock + CardKB keypad | Not stated |
| SAP (3 of 3) | I LOST IT | https://devpost.com/software/i-lost-it | https://github.com/ayoubm85/ilostit (live: conuhacks10.vercel.app) | Photograph found items. Search by text or photo. Multimodal matching. | Campuses, gyms, workplaces | CLIP, DINOv2, FastAPI, Gemini, Milvus, Next.js, PyTorch, React, shadcn, Supabase, Tailwind, TS | DINOv2 + CLIP + sentence-transformer embeddings with weighted fusion in the Milvus vector DB. Gemini 2.0 Flash does captions, OCR, and verification questions. | No | Not stated |
| D3 Security (1 of 2) | Thornmail | https://devpost.com/software/sentinel-2sjz9f | https://github.com/meuhcow/Thornmail | Groups security events into explainable cases with risk scores and next steps | SOC analysts | FastAPI, Next.js 16, NumPy, **Ollama + Llama 3**, Pandas, React 19, SSE, Tailwind 4, TS | Local LLM (Llama 3 via Ollama) as a *support tool* inside a deterministic pipeline, "not the final decision maker" | No | Not stated |
| D3 Security (2 of 2) | D3CISION | https://devpost.com/software/d3cision | https://github.com/SohaibDM/ConuHacks-X-D3-Challenge | Turns raw logs into prioritized, explainable "attack stories" | SOC teams | Gemini API, ElevenLabs, MongoDB Atlas, Python, XGBoost, SHAP, Next.js, Framer Motion, Tailwind, TS, NetworkX, scikit-learn, React | XGBoost scoring with SHAP explanations. Gemini 3 Flash writes remediation plans, answers Q&A, and triggers **autonomous actions** (isolate host, block traffic). ElevenLabs voice briefings. | No | Not stated |
| Beenox | Vulkan Tank Online | https://devpost.com/software/topdown-tank-online | https://github.com/benyoon1/conuhacksX | Online PvP tank game written directly on Vulkan and GameNetworkingSockets in C++ | Gamers | C, C++, GameNetworkingSockets, Vulkan | None | No | Not stated. Low-level graphics work matches a game-studio sponsor. |
| Dialogue + MentorMates | HealthMe | https://devpost.com/software/healthme-cshbay | https://github.com/thomasballarddev/ConUHacksX | AI that **phones clinics** to find availability and book appointments while the user watches a live transcript | Patients | ElevenLabs, Express, Firebase, GCP, Gemini, Mapbox, Node.js, React, Twilio | **Autonomous voice agent** (ElevenLabs conversational AI + Twilio) holding real phone calls with receptionists. Gemini for health conversation. | No | Not stated |
| Dialogue | Dr.Bob | https://devpost.com/software/dr-bob | https://github.com/theganders/Dr.Bob | Symptom-triage chat that finds nearby clinics and stores a medical profile | People avoiding portals and phone queues | CSS3, Flask, Gemini, HTML5, JS, Python | Gemini chat for medical reasoning. No agentic features. | No | Not stated |
| Dialogue | BooBoo Buddy | https://devpost.com/software/booboo-buddy | https://github.com/mchoi-cs/BooBooBuddy | "Health companion that takes action": triage, then it **calls clinics** and books for you | People too sick to arrange care themselves | Google Directions, Next.js, OpenRouter, React, Twilio, TypeScript, Vercel | **Agentic tool calling** (GPT-4o-mini via OpenRouter) triggers Places search, Twilio outbound calls, transcript parsing, and slot booking. Web Speech API for voice input. | No | Not stated |
| Talsom + Front Row Ventures Investor Pitch Award | Donair | https://devpost.com/software/flowstate-7ihg10 | https://github.com/forkiron/donair (site: donair.tech) | "Instant Agentic Crowdfunding": finds and scores likely donors for events or nonprofits and enables instant payments | Nonprofits, event organizers, fundraisers | embeddings, Gemini, RAG, React, SQL, Supabase, TypeScript | **Gemini tool-calling agent** (`find_similar_recipients`, `search_web`, `get_event_leads`, `save_lead`) + RAG over Supabase pgvector + scoring on capacity, affinity, and timeliness | No | Not stated |
| MLH Best Use of Gemini API | Buildo | https://devpost.com/software/product-creator-temp-name-conu-x | https://github.com/chantalzhang/conuhacks26 (live: peter-griffin.tech) | Describe a hardware project and get a visualization, parts cart, firmware, and assembly steps | Makers and hardware hobbyists | BeautifulSoup, Flask, Gemini API, MongoDB, NES.css, Next.js 16, Python, React 19, Snowflake Cortex | Gemini 2.5 Flash for parts selection and image generation. Snowflake Cortex for firmware and instructions. Parallel multi-model orchestration. | Generates hardware plans (no physical build) | Not stated |
| MLH Best Use of Solana | retro secrets | https://devpost.com/software/retro-secrets | https://github.com/deltag0/ConUHacks | Hides AES-encrypted messages in AI-generated ASCII art stored on Solana | Not stated | AES, Gemini, MongoDB, Next.js, Solana, TypeScript | Gemini 2.5 Flash Image generates art that is converted to ASCII | No | Not stated |
| MLH Best Use of Vultr | Scale Or Fail | https://devpost.com/software/system-design-90lx1y | https://github.com/nic5694/ScaleOrFail | Voice-first system-design interview practice with AI grading against rubrics | Engineers preparing for interviews | Angular, C#, Docker, MongoDB, Python, Snowflake, Vultr | Azure STT, ElevenLabs and Vultr TTS, 6 Snowflake AI agent procedures, RAG via cosine similarity, LLM grading | No | Page credits use of Vultr compute, registry, and object storage |
| MLH Best Use of ElevenLabs | Nursie | https://devpost.com/software/nursie | https://github.com/rappphg/Nursie | Privacy-first fall detection and voice support for long-term-care residents (CHSLDs) with no cameras | Québec CHSLDs, seniors 65+, nurses | C++, ElevenLabs, FastAPI, Flask, JS, MongoDB, Python, React, ROS2 | ElevenLabs voice interface. Gemini triages transcripts into priority, intent, and summary. Local processing. | **Yes**: mmWave radar, floor vibration mat, ESP32 nodes (FreeRTOS), smartwatch, door and PIR sensors | Not stated |
| MLH Best Use of Snowflake API | AeroGuard.tech (A.E.G.I.S. Garden) | https://devpost.com/software/aeroguard-tech | https://github.com/GautamTalksDev/aeroguard-tech | SOC-style triage platform for disaster response and cyber incidents. Gallery tagline mentions DePIN edge nodes + Solana. | Emergency response teams, SOCs | CSS, JS, Python, TS | Gemini multimodal with function calling. OpenRouter model routing. Snowflake Cortex prediction. ElevenLabs voice alerts. | Edge nodes mentioned in the tagline (unverified) | Not stated |
| MLH Best Use of MongoDB Atlas | Socratic | https://devpost.com/software/socratic-xu768i | https://github.com/GitExcited/Socratic | VS Code mentor that teaches through guiding questions and never hands over the answer | Students learning to code | ElevenLabs, Gemini, JS, MongoDB, RAG, TS, VS Code | Gemini adaptive tutor. RAG over local JSON plus web search. ElevenLabs voice personas ("Sergeant Synthax"). | No | Not stated |
| MLH Best .Tech Domain | Love At First Bite | https://devpost.com/software/love-at-first-bite-kt3zca | https://github.com/Miro-vk/concordia-project (live: loveatfirstbite.tech) | Tinder-style swiping on restaurants. Natural-language preferences are parsed into Yelp filters. | Groups deciding where to eat | Framer Motion, Moonshine, Next.js, OpenAI, OpenRouter, pnpm, React, Tailwind, TS, Vercel, Yelp Fusion, Zod | GPT-4o-mini via OpenRouter turns "vibey" into structured JSON search params (Zod) | No | Not stated (domain-name prize) |

**ConUHacks X observations**
- **The overall top 2 are agentic and computer-use projects with live, visual demos.** ViniClip is an LLM function-calling agent that edits video *in real time while you record*. Pinscher is voice and gesture OS control. Both are easy to show on stage, which matches the published criteria ("Working Demo", "Presentation Quality").
- 3rd place (JungleBank) came from the **Desjardins sponsor theme** (kids' finance plus game). Designing for the sponsor theme and also placing overall is possible.
- Sponsor challenges clearly have **narrow, specific briefs** (lost-and-found for SAP, SOC alert triage for D3, clinic booking for Dialogue, adaptive banking for Desjardins, browser automation for Deck). The winners fit each brief closely. The briefs themselves are not public (only visible in-event).
- **Autonomous phone-calling voice agents** (Twilio + ElevenLabs or LLM) won 2 of 3 Dialogue slots.
- **Explainability / human-in-the-loop** is a recurring framing in the security and SAP winners (Thornmail: "AI not the final decision maker"; One-Man-Crew: human-verified; D3CISION: SHAP).
- Hardware appears in 5 of 32 winners (PETER, TheGardens glove, SherLostHolmes lockers, Nursie sensors, partly Buildo). Best Hardware went to a robot with on-site imitation learning.
- The general top 3 is much stronger on AI agents than McHacks' top 3.
- No judges' reasoning is published on Devpost, Instagram, or the website.

---
## QHacks 2026

- Devpost: https://qhacks-2026.devpost.com/ (gallery: https://qhacks-2026.devpost.com/project-gallery, 4 pages, 77 submissions)
- Website: https://qhacks.io (hello@qhacks.io)
- Dates: **Feb 6–8, 2026**. Location: Mitchell Hall, Queen's University, Kingston ON. 225 participants (Devpost count).
- Theme: **"The Golden Age"** (Kingston-focused; several winners target Kingston seniors or the city)
- Judging criteria: Implementation; Design & UX; Innovation & Social Impact (market need, feasibility, **target audience clarity**); Pitch & Presentation (demo effectiveness, Q&A); Theme Alignment, which explicitly says **"look beyond basic LLM implementation"** and checks understanding of AI concepts.
- Total prize pool: $13,400+

### Tracks / prizes

| Prize / Track | Reward | # winners |
|---|---|---|
| 1st place overall | Sony WH-1000XM5 headphones | 1 |
| 2nd place overall | MSI 27" 1440p monitor | 1 |
| 3rd place overall | JBL Go 4 speaker | 1 |
| National Bank of Canada | $500 cash per team member | 1 |
| City of Kingston | Invitation to a spring pitch competition, competing for $10,000 implementation funding | 3 |
| CSE | Swag. **This is a CTF competition prize, not a project track** | 1 |
| Gradium (voice AI, STT/TTS) | $300 cash + 1M credits | 3 |
| Best Use of Gemini API (MLH) | Google swag | 1 |
| Best Use of Solana (MLH) | Ledger Nano S Plus | 1 |
| Best Use of ElevenLabs (MLH) | Wireless earbuds | 1 |
| Best Use of Vultr (MLH) | Portable screens | 1 |
| Best Use of Snowflake API (MLH) | Arduino Tiny ML kit | 1 |
| QHacks Fund | $12,000 cash | 1. No description on Devpost; no project carries this badge (unverified what it is or who got it) |

Sponsors: Manulife, National Bank (Giga); COMPSA, ClearGov, CSE, DDQIC (Mega); Backboard.io, City of Kingston, Gradium, Poparide (Kilo).

### Winners (15 projects with a Winner badge; all pages read)

| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| **1st Place** | Orca | https://devpost.com/software/orca-4po0nm | github.com/Beebdoles/qhacks-2026 | Hum, sing or speak a musical idea and it builds a multi-instrument MIDI composition | Musicians and producers without instrument or production skills | agenticai, elevenlabs, fastapi, gemini, huggingface, mcp, next.js, python | **Agentic Gemini with tool calling** (audio segmentation, MIDI parsing, instrument-assignment tools, MCP). ElevenLabs STT. Custom audio-classification model. The team writes that "agentic AI beats pure generation for structured tasks" | No | None stated |
| **2nd Place** | Atlas | https://devpost.com/software/atlas-m8yot1 | github.com/MatthewLones/QHacks-2026 | Pick a place on a globe and an era, then explore an AI-generated 3D world with a live voice guide | History enthusiasts, educators, learners | Vite, React, TS, Three.js, Spark.js, GlobeGL, CartoDB, FastAPI, Gemini, Gradium, WebSockets, **World Labs API** | Gemini as the guide "decision layer" with **tool calling** (globe suggestions, era music, triggering world generation). **Real-time voice** via Gradium STT/TTS with VAD and interruption | No | None stated |
| **3rd Place** | Willow | https://devpost.com/software/willow-8f5wqn | github.com/regularpooria/willow_qhacks2026 | Control your computer with conversational voice commands instead of mouse and keyboard | Elderly and disabled users | C++, Python, JS, PowerShell, Shell, PyInstaller, ElevenLabs (+OpenAI, Playwright per writeup) | **Computer-use-style autonomous agent**: OpenAI interprets commands and **tool calls** drive the browser through Playwright. ElevenLabs STT/TTS narration | **Yes**: LILYGO ESP32 USB stick used as a plug-in installer/activator | None stated |
| National Bank of Canada | BiasLens | https://devpost.com/software/biaslens-2yd3g9 | github.com/AlpinSchool/QHacks_2026 | Detects overtrading, loss aversion and revenge trading in trade logs, then coaches the trader | Retail traders | Next.js, FastAPI, XGBoost, SHAP, scikit-learn, Gemini API, Docker, Recharts, etc. | XGBoost bias classifier (~83.5% CV accuracy) + SHAP explainability. **Gemini 1.5 Flash** for coaching reports, news interpretation and stateful chat | No | None stated |
| City of Kingston | Pinpoint | https://devpost.com/software/pinpoint-t1zdc7 | github.com/FarhaanAli05/pinpoint (live: usepinpoint.ca) | Map-first housing search that puts rental listings and roommate posts on one map | Queen's students and newcomers in Kingston | Next.js, Supabase/Postgres, Leaflet, Gemini, Google OAuth, Vercel | Gemini turns natural-language housing queries into filters. "Multiple AI agents" verify scraped Kijiji listings | No | None stated |
| City of Kingston | KingsView | https://devpost.com/software/kingview | github.com/Lemirq/qhacks (live: qhacks-seven.vercel.app) | 3D Kingston map for placing proposed buildings and simulating construction impact (traffic, emissions, noise, air) | City planners, officials, residents | Next.js, Three.js, GeoJSON, Gemini API, ElevenLabs TTS | Gemini explains impacts, and ElevenLabs narrates them as the user moves along the timeline | No | None stated |
| City of Kingston | KPark | https://devpost.com/software/kpark | github.com/NathanielCheung/QHacks_Meter | Real-time parking availability map with navigation and a chatbot | Kingston drivers | Arduino, C++, React, Leaflet, shadcn, Vite | Unnamed "AI chatbot" | **Yes**: Arduino + sensors on a scale-model parking lot | None stated |
| Gradium | Truffle, AI Voice Companion | https://devpost.com/software/truffle-ai-voice-companion | github.com/Vionahk/Truffle-Personal-Intelligence-Assistant | 3D voice companion that remembers you and adapts to your mood | People seeking emotional support or companionship | Backboard, ElevenLabs, Gemini, Gradium, Python, JS, OpenRouter | Gemini responses, emotion-matched TTS, persistent memory (Backboard) | No | None stated |
| Gradium | Compass | https://devpost.com/software/compass-w5iugc | github.com/MarcDasilva/QHacks2026 (live: compass-queens.vercel.app) | AI dashboard over municipal complaint data that surfaces community concerns and trends | Municipal leaders, residents without technical skills | Next.js, FastAPI, Postgres + pgvector, Supabase, sentence-transformers, UMAP, Plotly, Gemini, Gradium, Vultr, and more | **Agentic pipeline**: Gemini with **tool calling** (vector search, trend analysis, report generation), "autonomous deep research", voice conversation through Gradium | No | None stated |
| Gradium | OdysseyWalk | https://devpost.com/software/odysseywalk | (no GitHub listed; live: odyssey-walk.vercel.app) | Generates themed walking tours whose narration plays when you reach each stop (GPS geofence), with spoken Q&A | Tourists and city explorers | Next.js 14, Google Maps/Places/Directions, OpenRouter, Gradium, Web Speech API | LLM (OpenRouter) writes structured JSON tours and answers spoken questions. Voice via Gradium/Web Speech. No tool calling | Phone GPS only | None stated |
| Best Use of Gemini API | Golden Guide | https://devpost.com/software/golden-guide-ugoa6h | github.com/ManagementMO/GoldenGuide | **Agent that navigates Kingston municipal services for seniors**: checks eligibility, makes action plans, drafts emails, **places phone calls** | Kingston seniors (65+) with low digital literacy | Gemini, FastAPI, Next.js, Firecrawl, BeautifulSoup, Twilio, SendGrid, ElevenLabs, Docker | **Gemini 3.0 Flash native function calling, an autonomous 8-iteration loop with 11 tools** (service search, eligibility, transit data, plans, email, calls via ElevenLabs Conversational AI), plus Tavily web search | No | None stated |
| Best Use of Solana | Veritas | https://devpost.com/software/veritas-gbqc0h | github.com/armaansingla14/Veritas | Civic Q&A with cited sources, issue detection from photos, and every interaction logged on Solana | Kingston residents, city staff, francophone residents | Next.js, Gemini (embeddings + vision), Solana, SQLite/Drizzle, ElevenLabs, OSM/Leaflet | **RAG** (text-embedding-004 + cosine similarity) with Gemini 2.0 Flash; **Gemini Vision** for photos; ElevenLabs multilingual TTS | No | None stated |
| Best Use of ElevenLabs | ClarityAI | https://devpost.com/software/clarityai-ztxi0e | github.com/Jakefeldmanstarosta/clarity-ai | Speech-to-speech: transcribes hard-to-follow speech, simplifies it, and re-voices it clearly | ESL speakers, neurodivergent listeners, people with auditory-processing difficulties | Express, React, Gemini, Gradium, ElevenLabs | STT (Gradium websocket) → Gemini simplification → ElevenLabs TTS pipeline | No | None stated |
| Best Use of Vultr | Tab-it | https://devpost.com/software/tab-it | github.com/EvasiveJosh/Tab-It | Turns songs into editable guitar tabs | Guitar learners | Flask, React, audio-separator (Demucs), Basic Pitch, music21, Vultr | ML models only (Demucs stem separation, Basic Pitch audio-to-MIDI). No LLM | Cloud VM only | None stated |
| Best Use of Snowflake API | Golden Grants | https://devpost.com/software/golden-grants | github.com/mohammedz06/GoldenGrants | Chrome extension that checks grant eligibility and drafts applications from any grant page | Small nonprofits without grant writers | Express, Node, Postgres, React, Snowflake, TS | Snowflake Cortex LLM for extraction and drafting (chunking, caching, schema validation). Solo project | No | None stated |

Not found on Devpost: a CSE winner (the CSE prize was for a CTF) and a **QHacks Fund** winner ($12k). No project page carries either badge (unverified).

### Observations (QHacks)
- The top 3 are all **voice-first, agentic** projects: Orca (voice to music via a tool-calling agent), Atlas (voice guide + tool calling + generated 3D worlds), Willow (voice computer use with an ESP32 install stick). The rubric's "look beyond basic LLM implementation" line seems reflected in the results.
- **Local specificity pays off:** 5 of 15 winners target Kingston specifically (the 3 City of Kingston winners plus Golden Guide and Veritas). The theme "Golden Age" was read as seniors or the city's golden era.
- Voice is everywhere: about 10 of 15 use ElevenLabs or Gradium.
- Gemini tool calling is the most common agent pattern. Only one project uses an OpenAI model (Willow).
- Hardware appeared in 2 winners (Willow's ESP32 stick; KPark's Arduino parking model).

---
## Hack Canada 2026

- Devpost: https://hack-canada-2026.devpost.com/ (gallery: /project-gallery, 9 pages, 208 submissions; the 40 winners fill pages 1–2)
- Website: hackcanada.org (referenced on Devpost; I did not fetch it, unverified)
- Dates: **Mar 6–8, 2026**. Location: SPUR Innovation Centre, Waterloo ON. 679 participants. Second edition. $32k+ prize pool. MLH member event.
- Judging criteria (general): Technical Execution **40%**, Innovation & Creativity 25%, Design/UX 20%, Presentation 15%.

### Tracks / prizes

| Prize / Track | Criteria (abridged) | Reward | # winners |
|---|---|---|---|
| 1st/2nd/3rd Overall | General rubric | Sony headphones + ElevenLabs Pro / Samsung monitors / Opal travel routers | 3 |
| **Google - Build with AI** | Practical AI for a real problem of a Canadian small business, nonprofit or community org; prototype on Gemini or Google Cloud; show adoption potential | Demo day pitch for $10k seed + Google mentorship | **12** |
| **SPUR - Build a Real Canadian Startup** | A real Canadian business problem that could become a venture after the event | Top 3: $500 grant + $10k seed pitch + mentorship; Top 10: pipeline + seed pitch | 3 + 10 |
| **Most Technically Complex AI Hack** | "**agentic AI architecture or fine-tuned AI models**" | 1st $500 + interview for a $280k/yr role at a foundation-model lab; 2nd $200; 3rd/HM $100 | 4 |
| Best VR & WebXR Hack | Immersive web | $100 Best Buy cards | 1 |
| Reactiv - ClipKit Lab | Apple App Clip + Shopify mobile commerce; submit as a GitHub PR | $5k / $2.5k / $1k | 3 |
| Tailscale Integration Challenge | | Raspberry Pi 4 each | 1 |
| Stan - Build in Public | 3 or more LinkedIn posts about the build | $350 / $150 (individuals) | 2 |
| Cloudinary Challenge | | $500 Amazon cards (1st) | 3 |
| Backboard.io - Best Use | Stateful memory, multi-agent orchestration, document RAG | $500 | 1 |
| Vivirion - Best Practical Healthcare Hack | Healthcare education or clinical workflows | Mechanical keyboards | 1 |
| MLH x ElevenLabs | | 6-mo Scale tier + earbuds | 1 |
| MLH Google Antigravity | | Swag | 1 |
| MLH Gemini API | | Swag | 1 |
| MLH Solana | | Ledger | 1 |
| MLH Presage | | Fitbit + perks | 1 |
| MLH Vultr | | Portable screens | 1 |
| MLH Auth0 | | Headphones | 1 |
| Most Liked Project | Community vote | $50 card | 1 |

### Winners (40 projects with a Winner badge; every page read)

Ranking inside the 4 "Most technically complex AI hack" winners (1st/2nd/3rd/HM) is **not shown** on the badges (unverified).

| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| **1st Overall** | wallhacks. | https://devpost.com/software/wyfyre | github.com/zanebeeai/wallhacks | Handheld multi-sensor mmWave radar that detects people through walls, shown as AR pings and a radar heatmap | Search & rescue, tactical teams, occupancy mapping | ESP32, FFT, FMCW, RF, Tailscale, Three.js, WebXR | **None, pure signal processing** | **Yes**: 5× HLK-LD2450 mmWave sensors, 2× ESP32 | None stated |
| **2nd Overall** + SPUR Top 3 + SPUR Top 10 | GlossPlusOne (g+1) | https://devpost.com/software/glossplusone | github.com/sokmontrey/gloss-plus-one | Browser extension that gradually swaps words on any webpage into the target language (Krashen's i+1) | Language learners | Antigravity, Backboard, ElevenLabs, Gemini, Groq, React, shadcn, TS | Gemini (Groq fallback) for contextual translation and snippet generation, Backboard for learner memory, ElevenLabs pronunciation | No | None stated |
| **3rd Overall** + Google Build with AI | 49th | https://devpost.com/software/hack-canada-2026 | github.com/akashngb/roots | End-to-end AI settlement helper for newcomers to Canada, over WhatsApp, a dashboard, and a **browser agent that fills government forms** | New immigrants to Canada | Claude, Gemini API, ElevenLabs, Backboard, Auth0, Cloudinary, Twilio, React, Node | **Computer-use agent: Claude Vision drives the browser** (vision instead of DOM selectors), tool calling for forms; Gemini 2.5 Flash; ElevenLabs multilingual voice; Backboard memory | No | None stated |
| Most technically complex AI hack | Jarvis Eh? | https://devpost.com/software/jarvis-eh | github.com/nehadst/jarvis-eh | Real-time assistant on smart glasses for dementia patients: recognizes faces, grounds context, guides daily tasks by voice | People with dementia, caregivers | Antigravity, Backboard, Cloudinary, ElevenLabs, FastAPI, Gemini, Python, React | Gemini Vision scene/activity inference, Whisper STT, ElevenLabs TTS, InsightFace face recognition, optical-flow confusion detection | **Yes**: Meta smart glasses | None stated |
| Most technically complex AI hack | Mathphic | https://devpost.com/software/mathphic | github.com/nexus-x86/mathphic (live: mathphic.vercel.app) | 3Blue1Brown-style animated math explanations (with Desmos) from natural language | Students, educators | antigravity, claude, docker, fastapi, gemini, python, TS, vercel | **Multi-agent chain-of-thought pipeline**: Gemini plans and Claude compiles to a custom visual DSL ("Desq") | No | None stated |
| Most technically complex AI hack | Ghostplayer | https://devpost.com/software/ghostplayer | github.com/rayyankhan47/ghostplayer | Autonomous agent that plays games from screen frames toward goals given in natural language | Developers, researchers, gamers | backboard.io, Flask, Gemini, NumPy, pyautogui, Python, Quartz | **Computer-use / vision agent**: Gemini Vision perception and planning, state machine, raw HID mouse/keyboard, action verification loop | No (OS-level input control) | None stated |
| Most technically complex AI hack + Google Build with AI | Argus | https://devpost.com/software/argus-d8mgul | github.com/ryanzhou147/argus | Real-time global events on a 3D globe, with AI analysis of the impact on Canada's economy | Canadians who want context on the news | AWS EC2/S3, BeautifulSoup, Playwright, Cloudinary, ElevenLabs, FastAPI, React, SQLite, Three.js | Gemini copilot agent with **RAG**, Chutes AI geocoding, ElevenLabs voice input | No | None stated |
| Google Build with AI | ArtiCue | https://devpost.com/software/articue | github.com/tanvibatchu/hack-canada (live: articue-amber.vercel.app) | At-home AI speech-therapy exercises for kids with an animated companion | Children with speech disorders and their parents (cites a 920-day SLP waitlist) | Next.js 16, Firebase, Auth0, Gemini, ElevenLabs, Web Speech, Python | Gemini 2.5 Flash multimodal audio (phoneme grading, clarity), ElevenLabs voice, research chatbot over PubMed etc. | No | None stated |
| Google Build with AI | Transit Planner | https://devpost.com/software/transit-planner | github.com/evanzyang91/transit-planner | Sandbox for drawing subway lines on live maps with density and traffic overlays | Urban planners, transit advocates | next.js, supabase (+PostGIS) | Multi-agent AI streamed over SSE, reasoning over PostGIS results (model not named) | No | None stated |
| Google Build with AI | Ember (fire) | https://devpost.com/software/ember-xwdyzl | github.com/georgef166/Ember | AR HUD + command dashboard for firefighters: navigation through smoke and biometric monitoring | Firefighters, SAR, incident commanders | FastAPI, React, R3F, TensorFlow.js, WebRTC, WebXR | Edge CV (TF.js object detection). No LLM yet | **Yes**: WearOS watch biometrics, helmet AR | None stated |
| Google Build with AI | CoCivil | https://devpost.com/software/applicationai | github.com/Elliot-Sones/Hack_Canada | Copilot for civil engineering: zoning and servicing feasibility with cited sources and 3D views | Civil engineers, developers | celery, gemini, konva, postgis | Gemini multimodal + **RAG over Ontario planning law and Toronto standards**, with strict grounding and citations | No | None stated |
| Google Build with AI | PulmoScan | https://devpost.com/software/pyroshield | github.com/garvit1910/pulmoscan-hackcanada | Detects lung-cancer nodules in CT scans and shows them in a 3D lung model | Radiologists, clinicians | PyTorch, React, Three.js, VTK.js | Custom EfficientNet-B0 + Grad-CAM. No LLM | No | None stated |
| Google Build with AI | LegaLens | https://devpost.com/software/legalens | github.com/derek750/LegaLens | Scans contracts, flags risky clauses, suggests negotiation and rewrites | Everyday people signing leases, loans, job contracts | Gemini, LangChain, FastAPI, React, Auth0, ElevenLabs, Picovoice, GCP | **Multi-agent** Gemini + **RAG** over a legal KB; voice with a wake word | No | None stated |
| Google Build with AI | Pledgely | https://devpost.com/software/pledgely | github.com/Sarah06102/Pledgely | Tracks political promises and progress on them | Voters | Gemini, Backboard, NewsAPI, GNews, MongoDB, React, Auth0 | Gemini extracts promises from PDFs; a Backboard agent grades progress using news search | No | None stated |
| Google Build with AI + **Vivirion Best Practical Healthcare Hack** | Clarus | https://devpost.com/software/clarus-7werym | github.com/Rahbir1518/Clarus (live: useclarus.vercel.app) | No-code clinical workflow builder that routes lab results and missed appointments to patients via **AI voice calls**, SMS and calendar | Clinicians and clinic staff | Next.js 16, FastAPI, React Flow, Supabase, Twilio, ElevenLabs, Google Calendar, Auth0, and more | ElevenLabs Conversational AI voice agent runs the calls; trigger→condition→action graph | No | None stated |
| Google Build with AI | ERoute | https://devpost.com/software/eroute | github.com/phintruong/ERoute | Routes patients to the right ER; city simulation for hospital placement | Emergency patients, city planners | Mapbox, MongoDB, React, R3F, Three.js | Gemini symptom triage, ElevenLabs voice triage, NL "build a hospital" commands | No | None stated |
| Google Build with AI | Civica | https://devpost.com/software/civica-s8adcq | github.com/Shlok-Ippala/Civica | Policy stress test: 8 domain-specialist agents plus 50 StatsCan-based demographic personas | Canadian policymakers | Claude 3 Haiku, GPT-4o, Backboard, FastAPI, React, StatsCan API | **Multi-agent simulation**: GPT-4o specialists and Haiku personas, orchestrated through Backboard | No | None stated |
| SPUR Top 3 + Top 10 + **Backboard Best Use** | LaunchPilot | https://devpost.com/software/launchpilot-si9j8d | github.com/LegendaryAKx3/launchpilot | AI launch copilot: market research, positioning, execution plan, outreach to scored leads | Project and indie builders | auth0, backboard.io, fastapi, gemini, next.js | **3-agent orchestration** (research, positioning, execution) with persistent memory and **approval-gated actions** | No | None stated |
| SPUR Top 3 + Top 10 | datascale | https://devpost.com/software/datascale | github.com/t9nzin/datascale | AI-assisted image annotation that runs entirely on your tailnet | Teams with sensitive data (health, research, satellite) | Ollama, FastAPI, Express, React, SQLite, Tailscale | **Local LLM tool-calling agent** chaining vision models (MobileSAM, SAM2, YOLO-World, OpenCLIP); "annotate all dogs"; QA agent | Apple Silicon (on-device) | None stated |
| SPUR Top 10 | DepGuardAI | https://devpost.com/software/depguardai | github.com/Aliankhann/DepGuardAi | Multi-agent dependency-vulnerability investigator that checks real exploitability in your code | Dev teams, security, critical infrastructure | antigravity, backboard.io, fastapi, osv.dev, react, sqlite, vultr | 5 autonomous agents (Scan, Code, Context, Risk, Fix) on Claude Sonnet via Backboard, with memory | No | None stated |
| SPUR Top 10 + **Cloudinary Challenge** | OperaAI | https://devpost.com/software/operaai | github.com/smitsp11/HackCanada26 (live: operaai.vercel.app) | Video of broken HVAC → voiced step-by-step repair guide grounded in the manufacturer manual | Junior technicians, homeowners | Cloudinary, ElevenLabs, FastAPI, Gemini, Next.js, Web Speech | Gemini 2.5 Flash multimodal (video/audio/PDF) + **RAG on manuals**, ElevenLabs TTS, hands-free voice navigation | Phone only | None stated |
| SPUR Top 10 | Ember (dementia) | https://devpost.com/software/ember-n8m3yk | github.com/JJKSweaty/remembR | Pan/tilt camera that finds lost objects and sends photos; med reminders | Dementia patients, caregivers | Raspberry Pi, ESP32, Arduino, OpenCV, YOLO, Tailscale, 3D-printed parts | YOLO CV only | **Yes** | None stated |
| SPUR Top 10 + **Tailscale Integration** | tailhub (tailcloud + tailtv) | https://devpost.com/software/tailhub | github.com/hiatus770/canadahack | Private camera + storage stack native to the tailnet | Privacy-conscious homeowners | Go, FastAPI, FFmpeg, OpenCV, YOLOv8, Tailscale Serve/Funnel/Taildrive, WebDAV | Local CV (motion + person detection). No LLM | **Yes**: edge cameras | None stated |
| SPUR Top 10 | Wear_abouts | https://devpost.com/software/wear-abouts | github.com/SeBalderrama/HackCanada-2026 | P2P clothing rental and resale with AI style matching | Canadian shoppers | React 19, Express, MongoDB, Auth0, Cloudinary, Gemini 2.5 Flash, Backboard | Gemini vision tagging + Backboard vector search | No | None stated |
| SPUR Top 10 | StoryDrift | https://devpost.com/software/w-enxoy9 | github.com/CatherineSusilo/HackCanada2026 | Bedtime stories told in the parent's cloned voice, paced by the child's vitals read through the camera | Parents and kids | Swift, TS, JS (+Gemini, ElevenLabs, Presage) | Gemini 2.0 Flash story and image generation, ElevenLabs voice cloning | iPhone camera (Presage vitals) | None stated |
| SPUR Top 10 | Sanctii | https://devpost.com/software/sanctii | github.com/Ari-Khan/sanctii | Healthcare platform: AI triage, routing, scheduling, health-card OCR | Patients, doctors, hospitals | Auth0, Gemini, Groq, MongoDB, OpenCV, Presage, React, Three.js | Gemini triage and scheduling, Groq, OCR | No | None stated |
| Reactiv ClipKit Lab | Copped | https://devpost.com/software/copped | github.com/Tankman61/HackCanada2026 ; github.com/StockerMC/hack-canada-2026-backend | Shoppers record 15-second in-store reviews for rewards, shown to other shoppers through NFC/QR | Retail shoppers and stores | ClipKit, Swift/SwiftUI, Cloudflare Workers/R2, Hono, Neon | On-device Apple FoundationModels for video moderation | NFC tags | None stated |
| Reactiv ClipKit Lab | Reparo | https://devpost.com/software/reparo | github.com/Karan-Gupta07/RepairBOT ; github.com/4ppleSA0CE/reactivapp-clipkit-lab | Photo of a broken item → DIY repair guide + parts cart | Canadian consumers | antigravity, Gemini, Python, React, Reactiv, SerpAPI, Swift | Gemini vision + guide generation | No | None stated |
| Reactiv ClipKit Lab | ClipIn | https://devpost.com/software/rapidtriage-name-tbd | github.com/Ultra-bob/reactivapp-clipkit-lab ; github.com/ozzyDev27/HackCanada2026-Dashboard | ER patients submit vitals and symptoms from their seat via an App Clip; AI ranks them for nurses | ER patients, triage nurses | Antigravity, Apple OCR, Gemini, Next.js, Presage, Reactiv, Swift | Gemini Flash triage ranking and summaries | Camera vitals (Presage) | None stated |
| Stan Build in Public + **MLH Solana** | Slicefund | https://devpost.com/software/slicefund | github.com/sxnnywu/slicefund | "ETFs for prediction markets": NL thesis → basket across Polymarket, Kalshi, Manifold, with arbitrage detection | Retail and institutional traders | auth0, backboard, express, gemini, node, phantom, react, solana, supabase | 4 persistent Backboard agents; **Gemini 2.5 Flash-Lite function calling**; embeddings | No | None stated |
| Stan Build in Public | Sweet Ol' Memories | https://devpost.com/software/sweet-ol-memories | github.com/onetrick1/Sweet-Ol-Memories | Senior companion for meds, appointments and emergencies that speaks in loved ones' cloned voices | Seniors, dementia patients | antigravity, next, openai, qstash, react, tailwind, TS (+ElevenLabs) | ElevenLabs STT/TTS/voice cloning, GPT-4o-mini for scheduling | No | None stated (prize is for LinkedIn build-in-public posts) |
| Cloudinary Challenge | Estator | https://devpost.com/software/estator | github.com/ArnieDaDonut/Hack-Canada | Real-estate listing photo enhancement and virtual staging | Agents, buyers, owners | Cloudinary, React Leaflet, Repliers API, Stitch, Tailwind, Vercel | Cloudinary generative AI image transforms | No | None stated |
| Cloudinary Challenge | Outfitted | https://devpost.com/software/outfitted-k6ilta | github.com/S3yon/Outfitted | Photograph your clothes, get outfit combinations, try them on virtually | Anyone with decision fatigue about outfits | Auth0, Cloudinary, Gemini, Solana | Gemini 3.1 Flash Lite vision → JSON outfits; image generation for try-on | No | None stated |
| MLH x ElevenLabs Best Project | Dubbify | https://devpost.com/software/dubbify | github.com/malihashar/HackCan | Real-time translated conference and phone calls | Multilingual teams, call centers | ElevenLabs, FastAPI, Next.js, Twilio, TS | ElevenLabs voice agents for language detection and live translation | No | None stated |
| MLH Best Use of Gemini API + **Best VR & WebXR** | Blox | https://devpost.com/software/blox-ze4t71 | github.com/evanlambb/HackCanada2026 | "Blender with AI": browser 3D editor with AI concept art → image-to-3D → natural-language animation | Solo and indie game devs | Three.js, Gemini, Meshy, React | Gemini image generation and animation selection; Meshy image-to-3D and rigging | No | None stated |
| MLH Google Antigravity | commonground | https://devpost.com/software/commonground-mta3bz | github.com/athersaeed/hack_canada_project | Aggregates cultural-club events from Instagram across campuses | International and cultural students | Facebook Graph API, Gemini, Google Stitch, Next.js, Python | Gemini 3.1 flash-lite multimodal extraction of posts; Antigravity + Stitch MCP for design-to-code | No | None stated |
| MLH Presage | bystander | https://devpost.com/software/bystander | github.com/hackcanada2026-aaaa/bystander | 8-second emergency clip → injury severity, vitals, voice first-aid coaching, SMS alert to nearby first aiders | Bystanders at emergencies | Cloudinary, Docker, ElevenLabs, Gemini, Presage, Twilio, React | Gemini 2.5 Flash vision + chat, ElevenLabs voice coaching | Phone camera | None stated |
| MLH Vultr | CareSync | https://devpost.com/software/caresync-kj2ch4 | github.com/RohanGottipati/CareSync | Multi-agent "memory" layer shared by home-care workers, families and coordinators | PSWs, families, coordinators | Backboard, Auth0, Express, React, Vultr VPS/Object Storage | 3 agents (Handoff, nightly Medication Sentinel, Family Comms) with RAG over care plans | No | None stated |
| MLH Auth0 | ShieldClaw | https://devpost.com/software/shieldclaw | github.com/adamhjouj/shieldclaw | Security layer for OpenClaw autonomous agents: Auth0 JWT, FGA, token scoping | Teams deploying autonomous agents | auth0, backboard, python, JS | Agent **authorization guardrails** against prompt injection and dangerous actions | No | None stated |
| Most Liked Project | Scarecrow | https://devpost.com/software/scarecrow-ne1kit | github.com/TCrawley11/hack_canada_2026 | AI scarecrow that detects predators and intruders and plays adaptive voice deterrents | Canadian livestock farmers | ElevenLabs, FastAPI, Gemini, Python, React, WebSockets | Gemini threat classification + ElevenLabs voice deterrents | **Yes**: webcam, speaker, tripod, mask | Community vote |

### Observations (Hack Canada)
- **1st overall had no AI at all.** wallhacks is a hardware RF/mmWave see-through-walls rig with WebXR. With Technical Execution weighted 40%, a novel physical demo beat a crowd of Gemini apps.
- 2nd and 3rd overall are AI products with a very concrete user: language learners on any webpage, and newcomers to Canada where **Claude Vision drives a browser to fill government forms**.
- "Most technically complex AI" (criterion: agentic architecture or fine-tuned models) went to multi-agent pipelines (Mathphic: Gemini + Claude → DSL), a computer-use game agent (Ghostplayer), smart glasses (Jarvis Eh?) and a RAG globe (Argus).
- **Canadian framing** is heavy because of the Google and SPUR track criteria: newcomers, StatsCan personas, Ontario zoning law, Canadian SLP waitlists, Canadian farmers.
- Common stack: Gemini (in most winners), ElevenLabs, **Backboard.io** (memory and multi-agent orchestration, used by about 12 winners), Auth0, Antigravity.
- Hardware winners: wallhacks, Jarvis Eh?, Ember (fire), Ember (dementia), tailhub, Scarecrow, plus NFC in Copped.
- Several prizes stack. Clarus, LaunchPilot, OperaAI, tailhub, Slicefund, Blox and Argus each won 2 or more.

---
## GenAI Genesis 2026

- Devpost: https://genai-genesis-2026.devpost.com/ (gallery: https://genai-genesis-2026.devpost.com/project-gallery, 11 pages, 249 projects)
- Website: https://genaigenesis.ca/ (now shows a "GenAI Genesis 2027 - Coming Soon" landing page with no 2026 details)
- Dates: **March 13-15, 2026**, in person at UofT with an online track. Billed as "Canada's Largest AI Project".
- 809 registered. Prize pool $20,000+ CAD.
- Sponsors: Gold TD. Silver Sun Life, Bitdeer. Bronze AMD, Intuit. Partners Google, Shopify, Vector Institute, IBM, Georgian. Startups BorderPass, Yellowcake, ElevenLabs, Moorcheh.ai, Jobster.io, Railtown (maker of the "Railtracks" agent framework several winners used).

### Tracks / prizes

| Prize (exact Devpost name, from winner badges) | Sponsor | Reward |
|---|---|---|
| [Sponsored] TD Best AI Hack to Detect Financial Fraud (In-Person Only) | TD | DJI 4K drones |
| [Sponsored] Sun Life Best Health Care Hack Using Agentic AI (In-Person Only) | Sun Life | Projectors |
| [Sponsored] Bitdeer Beyond the Prototype: Best Production-Ready AI Tool (In-Person Only) | Bitdeer | Gaming chairs |
| [Sponsored] Moorcheh AI Best AI Application that Leverages Efficient Memory (In-Person Only) | Moorcheh.ai | Keyboards + co-op interview |
| [Sponsored] Google Best AI for Community Impact (In-Person Only) | Google | Echo Dots ("Eco Dots" on page) |
| [Sponsored] Google Best Sustainability AI Hack (Online Only) | Google | Gift cards |
| [Sponsored] Best AI Hack using IBM Technology (In-Person Only) | IBM | Office tour, resume review, career panel |
| [Sponsored] Borderpass Best hack for Demos and QA (In-Person Only) | BorderPass | $1,000 CAD |
| [GenAI Genesis] Best GenAI Hardware Hack (In-Person Only) | GenAI Genesis | Arduino starter kits |
| [GenAI Genesis] Top 2 Teams - Team 1 / Team 2 (In-Person Only) | GenAI Genesis | Meta Quest / Sony XM5 |
| [GenAI Genesis] Top 2 Teams - Team 1 / Team 2 (Online Only) | GenAI Genesis | Gift cards |
| [GenAI Genesis] Best AI Education Hack (In-Person Only) | GenAI Genesis | Lego Star Wars set |
| [GenAI Genesis] Best Beginner AI Hack (In-Person Only) | GenAI Genesis | Logitech webcam |
| [GenAI Genesis] TOP 10 Team - Finalists (In-Person Only) | GenAI Genesis | Recognition |

### Winners (all 20 badge-holders, every page read)

| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| **Top 2 Teams - Team 1 (In-Person)** + Top 10 Finalist (the top prize) | Axiom ("Claude Code for game development") | https://devpost.com/software/axiom-vrd28n | github.com/MankyDanky/genai-genesis-2026 | All-in-one platform: generate sprites, music, SFX and game code, then deploy/share in one click | Would-be game devs facing a high barrier to entry | anthropic, claude, elevenlabs, gemini, mcp, meshy, next, phaser.js, tailwindcss, three.js, typescript | **Tool-calling agent**: Claude Sonnet connected to an MCP server with 20+ tools through the Vercel AI SDK. Generates assets (Meshy 3D, ElevenLabs audio) and code, with web search | No | none stated |
| **Top 2 Teams - Team 2 (In-Person)** + Best Beginner AI Hack + Top 10 | Shipyard | https://devpost.com/software/shipyard-own7ys | github.com/ryanshabaneh/GenAI-Genesis-2026 | Scores a GitHub repo on 8 production-readiness dimensions, shows it as a 3D city, and AI agents write the fixes (Dockerfiles, CI, tests, configs) | Developers shipping code | Claude API, Framer Motion, Next.js 14, OAuth, React Three Fiber, Socket.IO, Tailwind, TypeScript, Zustand | **Multi-agent coding**: specialized Claude Sonnet agents read the codebase and generate repo-specific files in implement-evaluate-refine loops, with conversation summarization and a cross-agent change log | No | none stated |
| Top 2 Teams - Team 1 (Online) | Eco-Pulse | https://devpost.com/software/eco-pulse-fpbo15 | github.com/Lushenwar/Eco-Pulse | Turns thermal/heat-island data into green-infrastructure intervention plans with estimated cooling and cost | City planners / municipalities | FastAPI, Gemini, Google Maps, Google Street View, Next.js, Python, Railtracks, React, Tailwind, TypeScript | **Vision** (Gemini 2.5 Flash reads Street View imagery) + **generative inpainting** (Gemini image model renders the proposed greenery) + agentic workflow (Railtracks) | No | none stated |
| Top 2 Teams - Team 2 (Online) | ReefMind | https://devpost.com/software/reefmind | github.com/DoanGiaHuyVu/ReefMind | Autonomous AI researcher that runs thousands of simulated coral-reef restoration experiments overnight | Reef scientists / conservation orgs | api, chart.js-4.4, flask, gemini, html, javascript, python | **Autonomous research agent** (Gemini) that forms hypotheses, picks interventions, observes results and rewrites its own research program (program.md). Autoresearch-style loop | No | none stated (solo) |
| TD Best AI Hack to Detect Financial Fraud | OmenAI | https://devpost.com/software/omenai | github.com/Ma5terrr/prediction-market-fraud | Real-time dashboard that flags possible insider trading on prediction markets (Polymarket) from wallet/trade patterns | Regulators, compliance teams, prediction-market platforms | blockchain, fastapi, isolation-forest, next.js-15, polygon, polymarket-data-api, polymarket-gamma-api, postgresql, python, react-19, redis, scikit-learn, server-sent-events, sqlalchemy, tailwind-css, typescript, watsonx-ai | Classic ML (Isolation Forest anomaly detection) + LLM (watsonx.ai) that writes plain-English explanations for flagged wallets | No | none stated |
| Sun Life Best Health Care Hack Using Agentic AI | Callio Labs ("Agentic Genomics") | https://devpost.com/software/callio-labs | github.com/MarcDasilva/GenaiGenesis2026 | Automates PCR primer research, design and evaluation: weeks of manual work down to minutes | Biomedical researchers / biologists | Docker, FastAPI, FastMCP, Gemini API, JSON, LangFlow, Markdown, Modal, Next-Auth, Next.js, OpenAI, Python, Radix, React, ShadCN, Supabase, Tailwind, Three.js, TypeScript, Zod | **Multi-agent (LangGraph, 10 persona agents)** with **MCP tools** (NCBI database, web scraping, Primer3 API). Agents fan out in parallel and an evaluator agent synthesizes; AlphaFold/ColabFold for structure | No | none stated |
| Bitdeer Beyond the Prototype: Best Production-Ready AI Tool | dill.pkl | https://devpost.com/software/dill-pkl | github.com/jasmehar-k/dill.pkl | AutoML: CSV in, deployed and documented model out, with full audit trail of how and why | Dev teams without ML expertise | Docker, FastAPI, LightGBM, NumPy, OpenRouter, Optuna, Pandas, Pytest, Python, Radix, React, Recharts, Scikit-learn, SHAP, Tailwind, TypeScript, Uvicorn, Vite, XGBoost | **8 specialized agents** + a conversational orchestrator. Agents only *propose* actions through a controlled action registry and never execute directly (safety/auditability angle) | No | none stated |
| Moorcheh AI Best AI App that Leverages Efficient Memory | Revenant ("The AI Symbiote") | https://devpost.com/software/revenent | github.com/akashngb/revenant (site: omniate.ca) | Watches engineering workflows (GitHub, Slack, Jira, VS Code), builds org memory, and teaches best practices through an avatar | Engineering teams, new hires | Docker, FastAPI, Moorcheh AI, Python, RAG, React | **RAG + multi-namespace memory** (Moorcheh), habit detection, **voice** (ElevenLabs), avatar | No | none stated |
| Google Best AI for Community Impact (In-Person) | Agentropolis | https://devpost.com/software/agentropolis | github.com/Kaibo-Huang/Agentropolis (live: agentropolis-one.vercel.app) | Society simulation on a 3D map of Toronto: thousands of AI agents with homes, jobs and personalities that react to injected events | Urban/AI researchers, policy "what-if" users | FastAPI, Mapbox, Neon, Next.js, Python, React, TypeScript, Uvicorn | **Large-scale multi-agent simulation**: "archetype agents" decide for groups and "follower variation" agents personalize. Pre-fetched context instead of slow tool loops, with a deterministic fallback | No | none stated |
| Google Best Sustainability AI Hack (Online) | Janus | https://devpost.com/software/janus-u9e3cl | github.com/AP3008/Janus | Local Rust proxy that compresses tokens for coding agents (multi-stage compression + semantic cache) | Developers using coding agents (Claude etc.) | axum, crossterm, docker, fastembed, ratatui, redis, redisearch, rust, tokio, tree-sitter | **Middleware for agents**: sits between the agent and the LLM API, embeddings-based semantic cache, dedupes tool-call results | No | none stated (solo) |
| Best AI Hack using IBM Technology | Voxel | https://devpost.com/software/voxel-pnxmlc | github.com/georgef166/GenAIGenesis2026 | AR education app: generates and animates 3D models in physical space, plus spatial flashcards and a rocket-launch sim | Students and teachers | Dart, Flutter, ar_flutter_plugin_2, Shelf, Langflow, Watson AI, DB2, Meshy AI, HTML, Nix, Ruby, Shell, Swift | Text-to-3D (Meshy) with preview/refine, Watson for prompt refinement and JSON output, Langflow research agent | Yes (AR on phone/headset) | none stated |
| Borderpass Best hack for Demos and QA | Q Labs | https://devpost.com/software/q-labs | github.com/AdrianLuk12/genai-genesis-2026 | Turns any Docker image into an on-demand QA sandbox with smoke tests and an AI agent that explores the app and finds bugs | Software teams | Claude, DB2, Docker, Faker.js, FastAPI, IBM, Python, TypeScript | **Autonomous browsing/QA agent** (roughly computer use): Claude Haiku navigates by reading the DOM in real time, Claude Opus generates test tasks | No (Docker) | none stated |
| Best GenAI Hardware Hack + Top 10 Finalist | DeskClaw ("Copilot for your workshop") | https://devpost.com/software/deskclaw | github.com/taliamekh/DeskClaw | Voice-controlled mobile robot that fetches workshop tools while your hands are busy | Makers / workshop technicians | c++, fastapi, faster-whisper, opencv, python, yolo | **Voice agent loop**: Whisper ASR, then Gemini 2.5 Flash, then ElevenLabs TTS. **Vision** navigation with YOLO + ArUco | **Yes**: Raspberry Pi 5, Arduino servo arm, rover chassis, cameras, ultrasonic sensor | none stated |
| Best AI Education Hack + Top 10 | REEL (Rating Enhancement & Editing Layer) | https://devpost.com/software/reel-6ycpwu | github.com/ditsus/GenAI-Genesis-2026 | Cleans up video by regenerating problem segments (flashing lights, profanity, intimate scenes) while keeping the story | Families; photosensitive viewers | fastapi, ffmpeg, gemini, nextjs, python, railtracks, tailwind, typescript, veo | **Agentic video pipeline**: Gemini vision scene detection ("Sentinel"), then Veo 3.1 generative inpainting ("Forge"), then FFmpeg assembly | No | none stated |
| Top 10 Finalist | Sonify | https://devpost.com/software/sonify | github.com/TOMWANGZZ1236/Genesis_Sonify | Generative sheet-music copilot | Music learners / casual composers | abc-notation, musicxml, next.js, openai-gpt-4o, opensheetmusicdisplay, react, salamander-piano-samples, tone.js | GPT-4o generates ABC notation, with AI-assisted edits | No | none stated |
| Top 10 Finalist | MedUnity | https://devpost.com/software/medunity | github.com/archangelinux/medunity | AI triage that routes patients to the right facility using CTAS (Canadian ER standard), plus demand projections for providers | Canadian patients + EDs | FastAPI, Gemini 2.5 Flash, Google Cloud, Vertex AI, Mapbox, Next.js, Overpass API, Python, Railtracks, React, Supabase, Tailwind, TypeScript | **Fine-tuned Gemini** on Vertex for CTAS classification (77% val acc), Railtracks agent with deterministic tools (routing, clustering, capacity) | No | none stated (solo) |
| Top 10 Finalist | inferOpt | https://devpost.com/software/inferopt | github.com/cogniera/InfraOpt | Semantic cache/templating that cuts LLM tokens 55-75% | Apps paying for LLM APIs | Docker, JavaScript, Python, React, Redis | Embeddings for intent matching; calls the LLM only for uncertain slots (Ollama/OpenAI) | No | none stated |
| Top 10 Finalist | YapDraw | https://devpost.com/software/yapdraw | github.com/rickytang666/yapdraw (live: yapdraw.vercel.app) | Speak a system out loud and get an editable Excalidraw diagram in real time | Engineers | Dagre, Deepgram, Excalidraw, Next.js, Supabase, TypeScript | **Voice**: Deepgram streaming STT, then an LLM with few-shot prompts builds a structured graph (handles self-corrections) | No | none stated |
| Top 10 Finalist | Melfi | https://devpost.com/software/melfi | github.com/ayushmangupta624/melfi-ai (live: melfi-ai.vercel.app) | AI therapist that **phones you**, remembers past sessions, and renders your emotional history as a 3D terrain | People needing accessible mental-health support | Deepgram, Next.js, PostgreSQL, Python, PyTorch, Supabase, Twilio, TypeScript, Vapi | **Outbound voice agent** (Vapi/Twilio), **DPO fine-tuned Qwen3-8B**, Groq Llama 3 transcript analysis, pgvector memory | Self-hosted server only | none stated |
| Top 10 Finalist | Halo | https://devpost.com/software/halo-93qrf7 | github.com/Dhanika-Botejue/GenAI-Genesis-2026 | Automated voice check-ins for patients + fall-detection monitoring to cut clinicians' admin work | Hospital staff (Canada) | fastapi, flask, ibm-stt, ibm-tts, ibm-watson, mediapipe, mistral, mongodb, next.js, opencv, opensmile, python, react, rest | **Voice** (IBM STT/TTS), Mistral via watsonx for symptom normalization, **CV** fall detection (MediaPipe), acoustic analysis (OpenSMILE) | Camera (unclear if custom HW) | none stated |

### Observations: GenAI Genesis 2026
- **Almost every winner is agentic.** Common patterns: multi-agent pipelines with named personas (Callio 10 agents, dill.pkl 8, Shipyard per-domain agents), MCP tool servers (Axiom, Callio), autonomous loops (ReefMind, Q Labs), and voice agents (DeskClaw, Melfi, YapDraw, Halo).
- **Both in-person top prizes went to developer tools built on Claude**: Axiom (Claude + MCP, 20+ tools) and Shipyard (Claude agents that fix repos). Q Labs (Claude Haiku/Opus QA agent) won the demo/QA prize. Two more winners (Janus, inferOpt) are "make LLMs cheaper" infrastructure, which Google filed under sustainability.
- Sponsor tech mattered: Railtracks (Railtown) shows up in 3 winners (Eco-Pulse, REEL, MedUnity); IBM watsonx/Watson in 4 (OmenAI, Voxel, Q Labs, Halo); Moorcheh won its own prize.
- Winners pick specific users and workflows (PCR primer design, CTAS triage, Polymarket insider trading, workshop tool-fetching) rather than generic chatbots.
- Only one hardware winner (DeskClaw), and it paired voice with vision.
- No stated judging rationale on any winner page.

---
## cuHacking7 (Carleton, cuHacking 2026)

- Devpost: https://cuhacking07.devpost.com/ (gallery 3 pages, 60 projects). Site: https://cuhacking.ca/
- Dates: **July 10-12, 2026**, 36 h, Carleton University, Ottawa. 171 registered on Devpost (event text says "over 300 students").
- Themes: Beginner Friendly, DevOps, Education. QNX blog post: https://qnx.software/en/blog/2026/qnx-at-cuhacking-6 (unread)

### Tracks / prizes (13)

| Prize | Reward |
|---|---|
| 1st / 2nd / 3rd - Best Overall Hack | 24" 120Hz monitor / mechanical keyboard / Soundcore speakers (+ MLH pins) |
| Best Hardware Hack | Hardware toolkit |
| Best AI Hack | 20000mAh power bank |
| People's Choice | $20 Amazon GC |
| Marketing Challenge | Merry Dairy GC |
| QNX Challenge (3 winners) | from a $2,000 tech pool |
| [MLH] Best Use of Gemini API / ElevenLabs / Solana / DigitalOcean / MongoDB Atlas | Keyboards / earbuds / Ledger / mouse / M5Stack kit |

### Winners (all 14, every page read)

| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| **1st - Best Overall Hack** | Surgy | https://devpost.com/software/surgy | github.com/angelo-riv/surgy | Haptic force-feedback gloves + VR surgical training, with edge AI flagging abnormal hand movement | Surgical trainees / med schools | Arduino, C++, ESP32, Meta Quest, mlpack, QNX, Raspberry Pi, SteamVR | On-device KNN (mlpack) anomaly detection on hand telemetry; no cloud, no LLM | **Yes**: 3D-printed gloves, servos, pots, ESP32, Quest, RPi 5 | none stated |
| **2nd - Best Overall Hack** + [MLH] DigitalOcean | Proteus ("Cursor for DNA") | https://devpost.com/software/proteus-v7iq43 | github.com/SquaredPiano/evo | Natural-language goal in, scored DNA sequences + folded 3D protein structures out, live-editable | Bioinformaticians | CSS3, DigitalOcean, Drei, ESMFold, Evo2, FastAPI, Framer-Motion, Gemini, GSAP, JavaScript, Lucide, MongoDB, Next.js, NIM-API, NVIDIA, Python, Radix-UI, React, Tailwind, Three.js, TypeScript, WebSocket, Zustand | Evo 2 (NVIDIA NIM 40B) DNA foundation model + ESMFold; Gemini routes reasoning; agentic assist; streaming regeneration | No | none stated |
| **3rd - Best Overall Hack** | BioReactPi | https://devpost.com/software/bioreactpi-an-edgeai-bioreactor-controller-on-raspberry-pi | github.com/Anaskaysar/BioReact-Pi | Edge Pi bioreactor monitor: live sensors, growth model, camera, dashboard | Students, small labs, bio-hobbyists | 1-Wire, Chart.js, CSS3, DHT11, DS18B20, ElevenLabs, FastAPI, Flask, Google Gemini, HTML5, JavaScript, Linux, MongoDB, MongoDB Atlas, Picamera2, Pillow, Python, QNX, Raspberry Pi, RPi Camera Module, Three.js, Ubuntu, WebSocket | Gemini "advisor" button returns one concrete recommendation from sensor state | **Yes**: temp/humidity sensors, Pi camera | none stated |
| Best Hardware Hack | Primo - The Piano Glove | https://devpost.com/software/primo-the-piano-glove | (none listed; creator GitHub JowiAoun) | LED strip + vibration glove guide which key and finger to play; MIDI checks correctness | Piano learners | C++, ESP32-C3, ESP32-S3, Python | None | **Yes** | none stated (solo) |
| Best AI Hack | ReVolt | https://devpost.com/software/revolt-tvk2mr | github.com/noirbatman/revolt | Photograph a dead gadget and it finds salvageable parts, matches builds, simulates circuits, voice-guides assembly, and generates a 3D-printable body + PDF manual | Makers / e-waste repurposers | ElevenLabs, FastAPI, fpdf2, Gemini, Next.js, OpenSCAD, Pillow, Pollinations.ai, Python, React, React-PDF, React Three Fiber, SQLite, Tailwind, Three.js, Tripo3D, TypeScript, Web Speech API | **Vision** (Gemini) + conversational build agent + **voice** (ElevenLabs) + generated CAD (OpenSCAD) | Partial (salvaged parts) | none stated |
| People's Choice | CuRiding | https://devpost.com/software/curiding | github.com/akramboussanni/cuRiding-pi | Clip-on real-time ADAS for youth e-bikes: vision collision warning + emergency braking + BLE mesh tracking | Youth e-bike riders | C/C++, OpenCV, Python, QNX, Raspberry Pi, TensorFlow Lite | Edge TFLite vision, time-to-collision | **Yes** | none stated |
| Marketing Challenge | spotr. | https://devpost.com/software/spotr-khgabe | none | AI gym spotter using a Pi camera | Gym-goers | qnx, raspberry-pi, vscode | None stated | **Yes** | none stated |
| QNX Challenge | Rocko | https://devpost.com/software/rocko | none | Cave-rescue beacon that sends AI-classified distress messages through rock via magnetic signals | Cave explorers | bash, C, makefile, matplotlib, Python, PyTorch, Raspberry Pi, scikit-learn, TFLite | Whisper STT + local MobileNetV2 injury classifier | **Yes**: custom coil, TMR magnetometer | none stated |
| QNX Challenge | Quark | https://devpost.com/software/quark-1k0gjs | github.com/waaberi/qnx-project | Drowsiness-detection companion you can talk to | Drivers | ai, automotive, camera, codex, embedded, git, github, hardware, llama.cpp, llm, qnx, raspberry-pi, sdl3, ssh, tensorflow | **Local LLM** (llama.cpp) for voice conversation + TFLite | **Yes** | none stated |
| QNX Challenge | Clearshot | https://devpost.com/software/clearshot | none | Real-time image dehazing at the edge | Military / emergency UGV operators | C, OpenCV, Python, QNX, TFLite | LFD-Net CV model | **Yes** | none stated |
| [MLH] Best Use of Gemini API | Clascade | https://devpost.com/software/clascade | none | Turns slides into teacher-controlled, shared, fact-checked 3D lessons | Teachers | Gemini, Next.js, React, Tailwind, Three.js, Tripo AI, TypeScript, Vertex AI, WebGL | Gemini structured generation + **search grounding with citations** + safety screening + voice narration | No | none stated (same two members as GenAI Genesis's Revenant) |
| [MLH] Best Use of ElevenLabs | Wolf In Sheep's Clothing | https://devpost.com/software/wolf-in-sheep-s-clothing | github.com/jwt2706/wisc | Social-deduction game: you are the only human among AI agents that vote on who is human | Gamers | ai, elevenlabs, game, gemini, mongodb, react, tailwindcss, three.js, typescript, vite | Multiple Gemini agents + ElevenLabs voices | No | none stated |
| [MLH] Best Use of Solana | TradeX | https://devpost.com/software/tradex-0efat7 | github.com/benz16107/tradex | Marketplace where AI agents discover and pay for tools per call (USDC, HTTP 402/x402) | AI agents / agent builders | Next.js 16, x402 v2, Solana, PostgreSQL, Gemini API, MCP, Node.js, React, Rust, Solana Web3.js, SPL Token, TypeScript, Tailwind | **Tool-calling buyer agent** (Gemini function calling, search grounding, embeddings, 5-turn tool loop) + MCP | No | none stated |
| [MLH] Best Use of MongoDB Atlas | Provenance | https://devpost.com/software/provenance-6eo7rs | none (useprovenance.vercel.app) | Camera app that signs photos at capture and anchors proof on Solana | Insurers, journalists, landlords | Anchor, Expo.io, MongoDB, Node.js, React Native, Rust, Solana, TypeScript | None | Phone secure keys | none stated |

### Observations: cuHacking7
- **Hardware dominated.** The top 3 overall were a haptic VR surgical-training glove, a DNA-design IDE, and an edge Pi bioreactor. 10 of 14 winners involved physical hardware or QNX edge devices. QNX was the main sponsor presence.
- AI was mostly edge ML (KNN, TFLite, local llama.cpp) rather than cloud LLM agents. The explicitly agentic winners were sponsor-prize projects (ReVolt: Best AI; TradeX: Solana; Wolf in Sheep's Clothing: ElevenLabs).
- Repeat winners across Canadian 2026 projects: Talia M and Angelo Rivera (DeskClaw at GenAI Genesis, Surgy here); Jowi Aoun (Plante at uOttaHack, Primo here); Akash Nagabhirava and Omar Ibrahim (Revenant at GenAI Genesis, Clascade here); Akram Boussanni (Champanzee at uOttaHack, CuRiding here); Ben Zhou (Eco-Pulse at GenAI Genesis, TradeX here). Experienced hackers reuse strong patterns: hardware + voice/vision, and agent + sponsor tech.

---
## Hack the 6ix 2026

### Links and dates
- Devpost: https://hackthe6ix2026.devpost.com/ (gallery: https://hackthe6ix2026.devpost.com/project-gallery)
- Website: https://hackthe6ix.com/ (still shows the **2025** winners on its homepage: TurretGuard / IntelliDrive / Hermes; those are **not** 2026)
- Dates: **July 17-19, 2026**, UofT Bahen Centre, Toronto, 12th edition, 36 hours. 389 participants and **133 submitted projects**, of which **27 carry winner ribbons**. Winners are posted on Devpost.
- Judging criteria (Devpost): **Technical difficulty**, **Uniqueness** ("Is it commonly seen at projects, or is it something new?"), **Design** (UX), **Completeness** ("polished and in fully working order?").
- Judges: about 34, e.g. Voiceform, Okta, Shopify, TypeOS, Donna AI and others.
- Requirements: a demo video, an extensive write-up, a public GitHub repo, and a draft by 11:59 pm Saturday. Voting by attendees is mandatory for team eligibility (People's Choice).
- A web search summary wrongly called TurretGuard the 2026 1st place. The site confirms it was 2025.

### Tracks and prizes (26 prize tracks)
| Prize | # | Reward | What was asked |
|---|---|---|---|
| 1st / 2nd / 3rd Place | 3 | Hoverboard / Fitbit / projector + MLH pin | Overall |
| Best Hardware Hack | 1 | Studio speakers | |
| Best Environmental Hack | 1 | BLAHAJ | |
| Best Beginner Hack | 1 | Mech keyboard | 50%+ first-time hackers |
| Peoples' Choice | 1 | Djungelskog | Attendee vote |
| Base44 Venture Builder Challenge | 2 | $2,000 / $1,000 CAD | AI product with real customer value, built on Base44 |
| QNX: Best Use of QNX | 3 | $1,000 / $250 / $250 CAD | AI embedded system on QNX RTOS |
| Chexy: Make Every Payment Count | 1 | Product + resume review | End-to-end payment workflows, responsible finance |
| Deloitte: Green AI, and AI for Green | 2 | Meta Quest / Ray-Bans | Energy-efficient AI or AI for environmental problems |
| Warp: Best Developer Tool | 1 | Keychron | Dev experience |
| Freesolo: Best Model Trained on Freesolo | 1 | SF flight for interviews | Post-train an LLM on Freesolo |
| CORTEX BioSciences: GROUND TRUTH | 1 | $1,000 + work trial | Belief updating as evidence arrives, resisting manipulation |
| Qualcomm: Build at the Edge with Arduino UNO Q | 1 | Quest / Ray-Bans | Cloud-free edge AI + MCU control |
| Stay22: Peak Unhinged Big Brain Use | 2 | $800 / $50 | Unconventional hotel-data apps ("not another booking carousel") |
| Backboard: Most Innovative Use | 1 | $200 + $1k credits + VC intros | |
| Phoebe (spelled "Pheobe" on the page): AI to Coordinate the Real World | 1 | $100 | Agents automating real-world workflows |
| Blockchain for Good: AI Trading Strategies for Financial Inclusion | 1 | $400 USD | |
| Unifold: Best Use of Unifold | 1 | $1,000 USD | Stablecoin SDK |
| ElevenLabs: Best Project Built with ElevenLabs | 1 | 6-mo Scale tier | "Agentic depth", multimodal |
| MLH: MongoDB Atlas / Auth0 / Gemini API / Solana / Presage | 1 each | Various | |

### Winners: top 3 and main awards
| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| **1st Place** + QNX | **Praxis** | https://devpost.com/software/praxis-41b68v | https://github.com/n1mk1/ht6 | Turns a pen-tracing rehab exercise into objective metrics (deviation, time, tremor) + plain-language AI explanations | Therapists; stroke, Parkinson's and MS patients | C++, Claude, Gemini, MongoDB, Python, QNX, Raspberry Pi | On-device Qwen2.5-0.5B (llama.cpp on QNX) with schema-constrained summaries; Freesolo fine-tuned Qwen3.5-4B (SFT+GRPO) on Modal; Gemini dashboard help; "AI can add insight but can never alter a measurement" | Yes (Pi 5, camera, MPU6050 pen) | None stated |
| **2nd Place** | **TraceLoop** | https://devpost.com/software/traceloop | https://github.com/Hostileoracle0606/TraceLoop | "Cursor for firmware": an agent writes Zephyr C, compiles, simulates in Renode, finds root causes and patches | Embedded devs | TS, React, C, Zephyr, Renode, Modal, tRPC, Supabase, Inngest, Vercel AI SDK | Agentic loop generates code; **root cause comes from deterministic causal trace analysis**, with the LLM used only for explanations | Simulated STM32 (no physical HW) | None stated |
| **3rd Place** | **MIRL – Minecraft IRL** | https://devpost.com/software/mirl-minecraft-irl | https://github.com/Solaror0/HT62026-MIRL | Play Minecraft with your body: cardboard sword, shield and bow with IMUs, plus webcam pose | Minecraft players | C++, cardboard, ESP32, Fabric, Java, MPU6050, OpenCV | **None** | Yes | None stated |
| Best Hardware | **TinyVitals** | https://devpost.com/software/tinyvitals | https://github.com/anabor2008/tiny-vitals-ht6 | Smart nursery: contactless vitals (rPPG), sleep position, AI wellness summaries | Parents of infants | Pi 5 on QNX, IMU, radar, Presage SDK, Gemini, Flask | Gemini turns sensor data into natural-language summaries | Yes | None stated |
| Best Environmental | **PlotTwist** | https://devpost.com/software/plottwist-jc851k | https://github.com/snowxzf/Hack-the-6ix-2026 | Scan a backyard to get an optimised companion-planting garden layout | Novice gardeners | Auth0, MongoDB, Open-Meteo, PlantNet, Perenual, React | PlantNet vision ID; algorithmic layout; no LLM agent | No | None stated |
| Best Beginner + Base44 | **NaviNate** | https://devpost.com/software/navinate | https://github.com/katiehclau-art/NaviNate | Embeddable voice agent that navigates websites for users, explains each step and supports undo | Businesses and confused site users | Base44, JS, Node | OpenAI action selection, one action at a time with DOM rescans (**computer use**), ElevenLabs voice with interruption | No | None stated |
| Peoples' Choice | **Claude Whip 9000** | https://devpost.com/software/claude-whip-9000 | https://github.com/Dolev497/Claude-Whip-9000 | A physical whip that "motivates" Claude Code (joke hardware) | Devs (humour) | Claude, ESP32, glue, paper, scissors | Claude Code integration | Yes (servo whip, monitor "containment chamber") | Attendee vote; none stated |

### Winners: sponsor prizes
| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| Base44 + Phoebe | **Tabi ("We should go to Japan")** | https://devpost.com/software/a-nhsi8g | https://github.com/alextgu/hack-the-6ix | Telegram bot that pulls a group trip out of the group chat: parses constraints, nudges blockers by name, books via Stay22, mints a Solana coin | Friend groups | Claude, Gemini, Freesolo, ElevenLabs, FastAPI, MongoDB | LangGraph supervisor drafts 4 messages, self-scores and sends the best; tool calls for hotels and flights; two-way voice | No | None stated |
| QNX | **BuzzKill** | https://devpost.com/software/buzzkill-ig3p0b | https://github.com/dnexdev/buzzkill | Detects and tracks mosquitoes, then shoots foam darts at them | Campers/outdoors | Arduino, OpenCV, Pi camera, QNX, Pi | **None** (CV only) | Yes (pan/tilt launcher) | None stated |
| QNX | **Project AMPM** | https://devpost.com/software/project-ampm | https://github.com/pyturtle/ProjectAMPM | Swarm of robot cars searches for people (ArUco localisation, YOLO ReID, A*) | Search and rescue | Python, OpenCV, YOLOv11, TensorRT, ESP32 | No LLM; on-device CV; multi-robot coordination | Yes | None stated |
| Chexy | **split** | https://devpost.com/software/split-ai-q1r970 | https://github.com/jjohngrey/split | Receipt photo to exact per-person shares via private links | Groups splitting bills | Auth0, Backboard, Gemini, MongoDB, Next.js | Gemini vision with a strict JSON schema; deterministic reconciliation; Backboard advisory agents that "cannot modify totals" | No | None stated |
| Deloitte | **SwipeForChange** | https://devpost.com/software/swipeforchange | https://github.com/zeukyr/SwipeForChange | Swipe-based discovery of Canadian petitions, then sign or email your MP | Canadian citizens | Auth0, Backboard, MongoDB, Next.js, Represent API | Gemini embeddings for matching; generated MP emails/posts | No | None stated |
| Deloitte | **Cultiva** | https://devpost.com/software/caas-0vht5u | https://github.com/amy-dao/Cultiva | Plant/weed ID + crop-rotation plans that cut emissions | Canadian row-crop farmers | Gemini, MongoDB, Python | Gemini vision with structured output; XGBoost on CPU (no LLM) for rotation | No | None stated |
| Warp | **Forge** | https://devpost.com/software/forge-2vdzoc | https://github.com/efebolukbasi/hackthe6ix26 | AI teammate joins meetings and draws live diagrams grounded in the repo | Engineering teams | Anthropic, ElevenLabs, Express, React, WebRTC | Claude agent with repo indexing, tool-calling code search (RAG), voice with VAD | No | None stated |
| Freesolo | **PokéClanker 9b** | https://devpost.com/software/tiny-pokemon-clanker | https://github.com/Dmrgn/GeminiPlaysPokemonLive | Fine-tuned 9B Qwen plays Pokémon FireRed to the first gym; claims "600x smaller, 1000x cheaper" than frontier models | SLM researchers | Cerebras, Freesolo, Gemini, Gemma, Qwen, Python | SFT + distillation from Gemini; tool-calling game harness; autonomous agent | Emulator | Page gives the 100%-accuracy / cost claims; no judge comments |
| CORTEX GROUND TRUTH | **HUME** | https://devpost.com/software/the-industry-standard | https://github.com/Ollienel777/GROUND-TRUTH-HT6 | Deterministic scientific belief revision (Bayesian log-odds, quarantine of single-source claims) | Researchers | Python | **Explicitly no LLM/NN** ("mathematical firewall" against injection) | No | None stated (same GitHub owner as HTN's DogWatch) |
| Qualcomm Arduino UNO Q | **Pomme** | https://devpost.com/software/autoagrinator | https://github.com/DanielWLiu07/hack-the-6ix | Autonomous fruit-picking and grading rover (SLAM, arm, ripeness model) | Orchards facing labour shortages | Arduino UNO Q, Edge Impulse, LiDAR, SLAM, React, MongoDB | On-device ripeness CV; "FarmHand" small LM turns English into validated robot commands; no cloud | Yes | None stated |
| Stay22 | **Check-in Champions** | https://devpost.com/software/check-in-champions | https://github.com/raihanCarder/hackthe6ix | FIFA-Ultimate-Team-style hotel card packs and brackets; the winner is bookable | Travelers | Auth0, ElevenLabs, Gemini, Next.js | Gemini copy/commentary; ElevenLabs voice + karaoke | No | None stated |
| Backboard | **Recompile** | https://devpost.com/software/recompile | none (site https://recompile-web.vercel.app/) | Developer-wellbeing tracker (rPPG vitals, WakaTime, calendar) shown as a growing or wilting cherry tree | CS students/devs | Auth0, Backboard, Electron, ElevenLabs, Gemini, Gmail/GCal/Spotify APIs, Presage | Backboard multi-agent (6 role threads), Gemini pattern analysis, tool calls, voice | Webcam | None stated |
| Blockchain for Good | **Constant.** | https://devpost.com/software/costant | https://github.com/mmiraly/hackthe6ix2026 | Stablecoin remittance wallet that times FX conversion against inflation | Families receiving remittances in high-inflation countries | FastAPI, Next.js, Postgres, OpenRouter (DeepSeek) | Deterministic strategy engine; LLM only explains decisions after the fact | No | None stated |
| Unifold | **Tomo Together** | https://devpost.com/software/orbit-6tnwm0 | https://github.com/a4ye/ht6-app | Hangout app with pixel avatars and stablecoin stakes for showing up (NFC tap) | Friends | Auth0, Express, MongoDB, React Native, Unifold | **None** | NFC taps | None stated |
| ElevenLabs | **feetball** | https://devpost.com/software/feetball | https://github.com/notjackl3/ht6 | 22 behaviour-cloned football agents play while 1,100 betting agents trade a live market with AI commentary | Sports/sim fans | ElevenLabs, Freesolo, R3F, Three.js, Next.js, RL | Behavioural cloning on World Cup tracking data; SFT/GRPO betting policy; pre-generated voice commentary | No | None stated |
| MLH Gemini | **INN-SIGHT** | https://devpost.com/software/inn-sight-know-what-to-build-before-you-build-it | https://github.com/Minifigures/hack_the_6ix | Stress-test a hotel design on a real Toronto parcel against a heat-wave weekend, then produce an investor memo (cost, carbon, grid) | Developers, architects, lenders | Gemini, Auth0, Backboard, FastAPI, MapLibre, Mongo, Three.js | 6 specialist agents + manager; deterministic Python engine does the maths; ElevenLabs voice agent; "every number sourced" | No | None stated |
| MLH Solana | **Clyma** | https://devpost.com/software/clyma | https://github.com/Heatch/clyma | Climate-risk prediction markets for hedging droughts and hurricanes | Communities, hedgers | Freesolo, Gemini, MongoDB, Rust, Solana | Gemini generates markets from climate data; Freesolo fine-tuned oddsmaker | No | None stated |
| MLH Presage | **Dispatchlingo** | https://devpost.com/software/codeblue-hxnuaj | https://github.com/Dhanika-Botejue/hackthe6ix-2026/ | Duolingo-style 911-dispatcher training with panicked AI voice callers; your vitals are monitored | Emergency dispatch training programs | Auth0, ElevenLabs, Gemini, Next.js, Presage | ElevenLabs voice agents as callers; Gemini grades the call; Presage webcam vitals | Webcam | None stated |
| MLH MongoDB | **TechTO** | https://devpost.com/software/twin-sli6v1 | https://github.com/RohanGottipati/TechTO | "Claude Code of city planning": simulate interventions on a digital twin of Toronto | Municipal planners | MongoDB Atlas, Next.js, FastAPI, Backboard, FreeSolo, MapLibre | 11 Claude assistants via Backboard with tool calling and code exec; fine-tuned Qwen "CitizenReactionLM"; RAG + Atlas Vector Search | No | None stated |
| MLH Auth0 | **SunPay** | https://devpost.com/software/sunpay-cp7xyi | https://github.com/Anth1337/ht6-2026 | Group checkout: one organiser buys and each member's saved card is charged their share | Group travel/tickets | Next.js, TS | **None** | No | None stated |

Unassigned: all 27 winner-ribboned projects are mapped above. (Praxis, NaviNate and Tabi each won 2 prizes.)

### Observations (Hack the 6ix 2026)
- **The top 3 are split:** 1st is a QNX/Pi rehab **medical-hardware** device with on-device + fine-tuned LLMs; 2nd is a software **dev-tool agent** (firmware); 3rd is **zero-AI** full-body Minecraft hardware. Hardware is heavily represented (1st, 3rd, Best Hardware, 2 of the 3 QNX winners, Qualcomm, People's Choice).
- **The judging emphasises completeness/polish and uniqueness,** which differs from HTN's "WOW factor". Many winners use the same "AI can explain but never alter the measurement/total" guardrail framing (Praxis, TraceLoop, split, Constant., INN-SIGHT, HUME).
- **Sponsor-SDK stacking is common:** Auth0, Backboard, Freesolo, Gemini, ElevenLabs and MongoDB appear across many winners. Freesolo fine-tuning shows up in 6 winners (Praxis, Tabi, PokéClanker, Clyma, feetball, TechTO).
- **Targets are concrete:** stroke/Parkinson's rehab, infants, 911 dispatcher training, row-crop farmers, remittance families, municipal planners.
- The event is smaller (389 hackers, 133 projects) than HTN (1,045 hackers, 349 projects).

---
## Hack the North 2026

### Links and dates
- Devpost: https://hackthenorth2026.devpost.com/ (gallery: https://hackthenorth2026.devpost.com/project-gallery)
- Website: https://hackthenorth.com/ (WebFetch returned only the page title, because the site is JS-rendered)
- Dates: **Sept 18-20, 2026**, University of Waterloo (E5/PSE), invite-only. Devpost status: "This project has ended". There were 1,045 participants and **349 submitted projects**, of which **74 carry winner ribbons**. Winners are posted.
- Organizer LinkedIn post: "The final projects have been presented, the winners have been crowned and Hack the North 2026 is officially a wrap." It doesn't name winners or give reasoning.
- Judging criteria (Devpost): **WOW factor** ("Projects that stand out and leave a lasting impression"), **Technical ability**, **Originality** ("Tackle a new problem, approach a current problem a new way"), and **Design** ("user-friendly experience").
- Format: there is no 1st/2nd/3rd. Instead "top projects become finalists" (**12 finalists**) and "The prizes for becoming a finalist are a surprise!"
- Judges included VCs (Upfront, First Round, SPC, Basecase, 1517, Garage, Two Small Fish, BDC), plus people from OpenAI, Google DeepMind, Cerebras, Baseten, Rox, Warp, Docker, Netflix, Apple, Aramco and others.
- Submission requirements: a source-code link, the badge ID of every member, sponsor prizes selected by 2 PM Saturday, and an optional demo video.

### Tracks and prizes (39 prize categories, all non-cash on the Devpost summary, though several carry cash)
| Prize | # winners | Reward | What the sponsor asked for (1-line) |
|---|---|---|---|
| Hack the North 2026: Finalists | 12 | Surprise | Top overall projects (WOW, tech, originality, design) |
| OpenAI: API Prizes | 3 | Dinner with OpenAI staff + ChatGPT Pro, swag | Best use of the OpenAI API |
| RBC: Signal in the Noise | 2 | Camera / Wooting keyboard | Agent ingesting big research datasets via MCP tools that answers precise questions; surprise dataset on judging day |
| Shopify: Hack Shopping with AI | 2 | Shop Cash | AI for merchant ops or customer experience |
| Warp: Best Developer Tool | 1 | Keychron keyboards | Improve the dev lifecycle, with a focus on DX and WOW |
| GPTZero: Best Use of GPTZero API | 3 | AirPods Pro 3 + $2k credits each... | AI-detection / anti-AI-slop |
| QNX: Embedded System with QNX that Uses AI | 3 | $1,500 / $500 / $500 | QNX OS + open-source AI, real-time |
| Dryft: Company Challenge | 1 | $2,000 | Speed up autoregressive token generation on H100s (kernels or agent-driven search) |
| Elastic: Find the Signal (Best Use of Elasticsearch) | 2 | Quest 3S / Bose | Messy data to intelligence, with hybrid search + agentic workflows |
| Baseten: Best Use of Baseten | 2 | SF trip + interviews / AirPods | Use Baseten inference/training |
| Rox: Best AI Agent | 2 | **$10,000 / $2,000** | Agents handling messy real-world data, with validation, error handling and decisions |
| CSE: Log & Order | 3 | (Discord) | Detect security anomalies in traffic logs |
| Tether: Best Sovereign App | 2 | $1,000 / $500 USD | Local-first AI app on the Pear/QVAC starter |
| Intact: Quoting Interface of the Future | 1 | Gift cards + interview | Reimagine car/tenant insurance quoting with AI agents |
| Dominion Dynamics: WHITEOUT | 3 | $2k/$1k/$500 + interviews | Coordinate heterogeneous autonomous fleets to find and track targets in an Arctic sim |
| Expo: Best Mobile Experience | 1 | $150 + swag each | Mobile app built with Expo |
| Bracket Bot: Best Use of Bracket Bot Hardware | 4 | Bambu A1 Mini / robot kits | Use the BracketBot robot |
| Sentry: Best Use of Sentry | 3 | Guaranteed interviews | Use Sentry |
| Aramco Americas: Best Beginner Hack | 2 | - | All members have attended at most 1 project |
| Human Computer Lab: Build with LeLamp SDK | 3 | Bambu A1 + LeLamp | Build on the LeLamp robot lamp |
| Backboard.io: Built on Backboard | 1 | Interviews + $400 | Use Backboard |
| Huawei: openJiuwen Multi-Agent Challenge | 2 | Watch GT 6 + internship opp. | Multi-agent on openJiuwen |
| Huawei: OMNI Live Challenge | 2 | Watch GT 6 / FreeClip 2 | Use Huawei OMNI multimodal |
| MLH: Best Use of ElevenLabs | 1 | Earbuds | |
| MLH: Best Use of Gemini API | 2 | Swag | |
| MLH: Best Use of Tiger Data | 2 | Stream Deck Mini | |
| MLH: Best Use of Vultr | 1 | Portable screens | |
| MLH: Best Use of Snowflake API | 1 | Raspberry Pi 4 | |
| MLH: Best Use of MongoDB Atlas | 2 | M5Stack kits | |
| MLH: Best Domain Name from GoDaddy Registry | 1 | Gift card | |
| Solana: Best Use of Solana and Badge Hack | 2 | $5,000 + Ledger / $2,500 | |
| Federato: Building the Federato Insurance Agent | 1 | $3,500 | Agent that ingests submissions, enriches with risk data, and produces underwriting insights |
| Browserbase: Best Use of Browserbase | 1 | $2,000 | |
| Linq: Best Use of Linq | 2 | $1,000 + credits / $500 | iMessage API |
| Cloudflare: Best Agent with a Brain | 1 | - | Agent with memory, tools, state and workflows on Workers |
| Zip: Best Use of Zip | 2 | JBL speaker / $50 + bag | Procurement via the Zip API/MCP |
| Composio | 1 | 6 months free + $10k credits | |
| Unto Labs: Best Use of Thru | 1 | Switch each | Thru blockchain |
| Cognition: Best Use of Devin | 1 | $5,000 Devin credits | |

### Winners: the 12 Finalists (the top-3 equivalent; unranked)
| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| Finalist | **Reflex** | https://devpost.com/software/reflex-e0jkih | https://github.com/ZechariahWang/htn-2026/ | Robotic exoskeleton glove driven by natural language, or teleoperated to record demos that train a VLA to reproduce skills | Robotics / skill-learning (piano copilot demo) | ROS 2, Gazebo, FastAPI, Next.js, Three.js, PyTorch, LeRobot, Docker, Foxglove | Claude via **MCP controlling servos in real time**; fine-tuned **SmolVLA** on demos; **Qwen Omni** multimodal (voice+vision) copilot; MediaPipe + RealSense vision | Yes (ST3215 servos, RealSense, ESP32/STM32) | None stated |
| Finalist + OpenAI API Prize | **Orbis Engine** | https://devpost.com/software/temp-jcyltx | https://github.com/dtpu/OrbisEngine | Turns ordinary video into explorable 4D/VR scenes where you can talk to the characters | XR users, media | OpenAI API, Codex, Devin, Gaussian splatting/gsplat, LaMa, LHM, Modal, PyTorch, Three.js, WebXR, World Labs Marble, Meta Quest | OpenAI for scene description, validation and object sizing; **Realtime API voice conversations with characters**; Codex ran autonomous research/eval on GPUs; vision (depth, pose, reconstruction) | Yes (Meta Quest) | None stated |
| Finalist + QNX | **Combadge** | https://devpost.com/software/combadge | https://github.com/orgs/Combadge-HTN/repositories | Star-Trek-style chest-worn AI communicator (voice, camera, email, calendar, Shopify, phone handoff) | People who want ambient, screenless assistance | Python, C, custom Bluetooth driver, OpenAI, Composio, Shopify, Twilio, Gmail, GCal, Browserbase, QNX, BTStack | **Voice agent** (GPT-Live) + GPT-6 Astra for reasoning and **tool calling** (Composio, Gmail, Calendar, Shopify, web search via Browserbase), **vision** via camera | Yes (Pi 5 on QNX 8, conductive thread sewn into a shirt, haptics) | None stated |
| Finalist + MLH Gemini | **Composition** | https://devpost.com/software/composition | https://github.com/justinlam747/Composition | AR "physical harness" for AI video: move your phone as a virtual camera to direct agentic video generation | Creatives/filmmakers | ARKit, Gemini, Gemini Live, Veo, Hunyuan Motion, Seedance, ElevenLabs, Three.js, Node, Zod | **Agentic**: Gemini manages scene state and proposes validated typed edits (tool use); Gemini Live **voice** direction; vision on viewport frames; Veo/Seedance video generation | Yes (iPhone AR + motion) | None stated |
| Finalist | **Concerto** | https://devpost.com/software/concerto-0wd9zs | https://github.com/nicholasching/HackTheNorth | Turns the audience's phones into a distributed orchestra: locates each phone optically, assigns parts, plays in sync | Live events and audiences | Codex (only tag) | Essentially none at runtime (Codex/Claude used to build it); CV decodes phone IDs with Hamming codes; NTP-style sync | Yes (cameras, projector, audience phones) | None stated |
| Finalist | **CADEX** | https://devpost.com/software/cadex | https://github.com/justinbaduaa/htn2026 | Photo + measurements to manufacturable CAD, drawings and assembly instructions | Makers without CAD skills | CadQuery, Codex, Hono, Node, OpenAI, React, Tailwind, Vite | OpenAI Structured Outputs + **vision** to find the needed dimensions; **Codex CLI as an autonomous CAD agent** writing CadQuery, with a self-validation/iteration loop | Yes (3D-printed the badge case; "every screw lined up") | None stated |
| Finalist | **bingbong** | https://devpost.com/software/bing-bong-z7rsny | https://github.com/sophiayduan/bingbong | 4-player rhythm party game using hacked HTN PCB badges as wireless controllers | Project attendees / party gamers | badge, CAD, ESP-NOW, firmware | **None** | Yes (ESP32-C6 badges, custom firmware) | None stated |
| Finalist | **Keymaeleon** | https://devpost.com/software/keymaeleon | https://github.com/macto2024/Keymealeon.git | Mechanical keyboard with an OLED in every keycap that adapts to the app and its state (Git, tests, debugger in VS Code) | Developers | Arduino, C++, ESP32, Python, SolidWorks | OpenAI API generates control profiles and suggested actions for unsupported apps | Yes (custom keyboard) | None stated |
| Finalist | **Bricked** | https://devpost.com/software/a-feuvb1 | https://github.com/GuyOnWifi/hack-the-north | Text to 3D LEGO model; you watch agents plan, build and validate, and can steer them | LEGO fans | nextjs, python ("larp", "vibe") | **Multi-agent**: Claude Sonnet planner + per-layer builders, deterministic inspector, **Opus vision critic**; BrickGPT grammar-constrained generation | No | None stated |
| Finalist + Sentry | **punching-face** | https://devpost.com/software/punchface | https://github.com/akashngb/punching-face | Scans a person's head into 3D, then you punch it with physics-based deformation; multi-device arena via QR | Fun / party | COLMAP, GPT-6-Astra, LiveKit, MediaPipe, Meshy, Open3D, OpenAI, Qwen3.5-Omni, Three.js, WebGPU/WASM, Sentry, Warp | GPT-6-Astra infers back-of-skull geometry; **Qwen Omni voice coach**; MediaPipe hand tracking | Webcam/phones only | None stated |
| Finalist | **TakeOne** | https://devpost.com/software/takeone-erqv3l | https://github.com/3-rt/TakeOne | AI robotic film studio: describe a shot, it plans and simulates it, drives camera and light arms on a rover, then helps edit | Solo creators / small film teams | OpenAI, LeRobot, MuJoCo, ESP32, CAN-bus, OpenCV, MediaPipe, FFmpeg, React, Three.js, WebRTC | OpenAI Responses for script/shot planning; **GPT-Live voice direction via constrained function calls**; vision tracking with PID | Yes (RC truck base, 2x SO-101 arms, CAN motors) | None stated |
| Finalist + Solana | **Settlers of Solana** | https://devpost.com/software/_solanasim | https://github.com/leakyhose/agent-economy | 100+ LLM agents choose jobs and trade in a simulated economy where coins exist only through borrowing, on Solana | Crypto/econ-sim audience | Solana, Anchor, Rust, Baseten, Claude/Anthropic API, OpenAI, Three.js, React | **Autonomous agents with 11 tools** (place_order, borrow, repay...) that execute real on-chain transactions; models compared via Baseten | No | None stated |

### Winners: sponsor and track prizes (all project pages read)
| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| OpenAI API | Orbis Engine | (above) | | | | | | | |
| OpenAI API | **Aircade** | https://devpost.com/software/aircade-m4n6zv | https://github.com/apollo-ullah/Aircade | Hacked the AirPods motion SDK into a Wii-remote-style controller; play tennis against AI | Casual gamers | Swift, Core Motion, OpenAI, gpt-6-astra, Codex, Baseten, Solana, Vercel | GPT-6 Astra picks the opponent's shots from game state; Codex also **plays the game via computer use/vision** | Yes (AirPods as controller) | None stated |
| OpenAI API | **Granny Waymo** | https://devpost.com/software/granny-waymo | https://github.com/0vp/htn-2026 | Autonomous wheelchair-like robot doing accessibility tasks (e.g. flipping light switches) by voice | Elderly / mobility-limited | ESP32-S3, Expo, Python, React, OpenAI ("agentic") | GPT-Live **voice** + tool-call delegation; GPT Astra for spatial planning and control; lidar/camera vision; memory | Yes (toy ATV chassis, robot arm, hacked badge as remote) | None stated |
| RBC Signal in the Noise | **Signal** | https://devpost.com/software/temp-project-0sp3zv | https://github.com/liamma06/searchGM/tree/main | Q&A over financial research corpora with line-level citations; flags conflicts and gaps instead of guessing | Financial analysts | MongoDB, Python | Multi-agent OpenAI with Composio tool calling; **hybrid RAG** (Elasticsearch keyword+vector); GPTZero flags AI-written passages | No | None stated |
| RBC Signal in the Noise | **FinRet** | https://devpost.com/software/finret | https://github.com/pravinpaudel/ai-harnesss-htn-2026 | "Evidence-first" finance research harness: cited, auditable answers | Financial analysts | agent, openai, python, react | Bounded agent tool loop, hybrid retrieval, citation verification, full audit trail | No | Page states it **scored 29/30 on an unseen RBC corpus**; no judge comments |
| Shopify | **Dealify** | https://devpost.com/software/bazaar-wgv16i | https://github.com/Maristanez/bazaar | AI shopkeeper that negotiates within merchant-set rules, plus a "Gym" simulating 300 synthetic shoppers | Shopify merchants + shoppers | Backboard, ElevenLabs, GraphQL, Liquid, OpenAI, Postgres, Supabase, Shopify, React | LLM (via Backboard) interprets requests and **picks from a code-generated offer menu** ("the AI picks from a menu; code writes the menu"); voice via ElevenLabs | No | None stated |
| Shopify | **Bloxify** | https://devpost.com/software/bloxify | https://github.com/werdna533/Bloxify | Shopify storefronts inside Roblox games with player heatmaps; an agent runs layout experiments | Merchants selling to Roblox players | Cloudflare, Lua, MCP, Next.js, OpenAI, Roblox | Autonomous marketing agent on CF Workers; tool calls to the Shopify Admin API, Roblox APIs and Studio MCP; D1/R2 memory | No | None stated |
| Warp Best Dev Tool | **ARDB: AR Debugger** | https://devpost.com/software/ardb | https://github.com/ColonelParrot/ardb-web , https://github.com/PyneKoyne/AR-Debugger/ | AR view of live sensor data from many embedded devices, with live parameter tuning | Embedded/IoT devs | AR, ESP32, MQTT, Raspberry Pi, WebXR | **None** | Yes (Quest Pro, ESP32/Pi/Arduino) | None stated |
| GPTZero | **Snitch** | https://devpost.com/software/snitch-ldyzh9 | https://github.com/amelialon/Snitch | Flags suspicious (AI-assisted) moments in remote interviews: behaviour, AI-language detection, CV checks, "visual canaries" | Recruiters | FastAPI, Firebase, GPTZero, Next.js, OpenAI, AssemblyAI | GPTZero detection; LLM CV-consistency checks; visual prompt-injection canaries | No | None stated |
| GPTZero | **Sham** | https://devpost.com/software/cool-ppl-from-amplify | https://github.com/venniseho/hack-the-north-2026 | Chrome extension that risk-scores online stores from Reddit/Instagram signals and review authenticity | Online shoppers | backboard.io, FastAPI, GPTZero, React, WXT | GPTZero on reviews (deliberately no LLM touches the text before scoring); LLM extraction via Backboard; deterministic orchestration | No | None stated |
| GPTZero | **MedBot** | https://devpost.com/software/medbot-2e40oh | https://github.com/RayanMalki/htn-2026.git | Fact-checks viral health claims against literature and makes shareable explainer videos | Social-media users | Elasticsearch, OpenAI, React, TS | Transcription + claim extraction, RAG over Europe PMC/MedlinePlus, citation validation, narration | No | None stated |
| QNX | Combadge | (above) | | | | | | | |
| QNX | **EyeMelody** | https://devpost.com/software/dual-vision-glasses | https://github.com/pravoslavzilka/htn-gaze | Eye-tracking headset: look at a coloured object to play a note | People with ALS / spinal injuries | Huawei OMNI, ElevenLabs, ONNX, OpenCV, PyTorch, Raspberry Pi, Sentry, TigerData | OMNI multimodal object recognition + voice assistant; custom CNN; ElevenLabs TTS; circuit breakers for graceful degradation | Yes (Pi 5 on QNX, 2 cameras) | None stated |
| QNX | **SpideyIRL** | https://devpost.com/software/sixth-sense-pk24ul | https://github.com/adi-padmarajan/SpideyIRL | Wearable "spidey sense": directional head haptics for obstacles + a voice AI that describes the scene | Spatial awareness (implied: low-vision) | QNX Neutrino, Qwen 3.5 Omni Flash, YOLO, Vosk, Piper, ultrasonic sensors, Pi | Qwen Omni multimodal reasoning over a structured scene state; local STT/TTS | Yes (2 Pis, ultrasonic, vibration motors) | None stated |
| Dryft | **Hedge The North** | https://devpost.com/software/solana-prediction-mkt | https://github.com/Erenius-Valoraen/pred-market | On-chain prediction market on project events; bet by tapping your HTN badge | HTN attendees | BLE, ESP32, Lua, Rust, Solana, Vite | **None** (LLM only in future plans) | Yes (badge) | None stated. (Odd match for Dryft's stated H100 token-speed challenge; unverified whether the prize label is correct) |
| Elastic | **hereafter** | https://devpost.com/software/physical-studio-code | https://github.com/archangelinux/hereafter | "Version control for your future": simulates life-decision paths using live web research | Individuals making life decisions | Browserbase, Elasticsearch, OpenAI, React | OpenAI extraction/planning/narration; Jina embeddings + reranking; Elastic Agent Builder with ES\|QL tools; Pydantic schemas stop it inventing stats | No | None stated |
| Elastic | **PawTrace** | https://devpost.com/software/tailsignal | https://github.com/joeyhlu/htn | Finds lost pets by fusing community sightings and doorbell/camera footage into a probability search map | Pet owners, shelters | Elasticsearch, FastAPI, Next.js | Agent with 13 tools; YOLOv8 + DINOv2 image matching | Camera footage (no custom HW) | None stated |
| Baseten | **neoKernel** | https://devpost.com/software/neokernel | https://github.com/cogniera/neoKernel | Agent loop that auto-optimises an LLM inference engine: **932 tok/s, 4.3x speedup** on Qwen3-4B, with token-identical output | ML infra engineers | Claude, Codex, CUDA, Python | Coding agents (Claude/Codex/GLM/Kimi via Baseten) propose whole-file changes, with a unit-test repair loop and a correctness gate | GPU (H100/L4) | Page gives the 4.3x benchmark; no judge comments (it also mirrors Dryft's eval, but only the Baseten prize is listed) |
| Baseten | **VoiceBridge** | https://devpost.com/software/voicebridge-xh0nv9 | https://github.com/rickytang666/hackthenorth | Recovers dysarthric speech and re-speaks it in the user's own voice | People with dysarthria (stroke, Parkinson's) | Baseten, Cohere, NeMo, LoRA/PEFT, OpenVoice, MeloTTS, PyTorch | LoRA fine-tuned ASR (Parakeet, Cohere Transcribe) on dysarthric data; voice-clone TTS; confirmation step | No (cloud GPUs) | None stated |
| **Rox Best AI Agent ($10k)** | **AdLib** | https://devpost.com/software/living-canvas-gz360v | https://github.com/Marcus990/adlib | Listens while you present and generates diagrams, charts and images live on a canvas; edit by voice | Presenters | Baseten, Codex, OpenAI, Python, Rust, Tauri | Local Whisper -> "Luna" decision agent emitting structured tool calls; SDXL-Lightning; **code guardrails** (numbers must appear in the transcript, destructive actions need confirmation); <2 s speech to pixels | Laptop only | None stated (1st vs 2nd not shown) |
| Rox Best AI Agent | **Jevis** | https://devpost.com/software/skillweaver | https://github.com/evanzyang91/htn-2026 | Browser agent that learns a task once and then replays it as a skill with **zero model calls** | Devs/businesses automating the web | Chrome, Jev, OpenAI | **Computer-use** browser agent; Claude synthesises skill code; voice input | No | None stated |
| CSE Log & Order | **Minny** | https://devpost.com/software/minny | none listed | Names the insider threat in web logs with evidence "receipts"; watchdog; red-team stress test | Security analysts | anthropic-claude, Composio, Elasticsearch, FastAPI, pandas, Sentry | Claude Opus 5 "blue agent" proposes detection rules; autonomous red team generates evasive variants; deterministic validation gates | No | None stated |
| CSE Log & Order | **WatchTower** | https://devpost.com/software/cadify | https://github.com/Hayden9898/Hack-the-North-2026 | HTTP logs to provable incident response (rules + isolation forest) | SecOps | FastAPI, Postgres/Timescale, scikit-learn, Playwright, Slack, Sentry | LLM writes summaries, but "every claim is cross-checked against deterministic evidence tables" | No | None stated |
| CSE Log & Order | **Trace** | https://devpost.com/software/loggr | https://github.com/JeremyFriesenGitHub/htn26 (live: https://trace.cooking) | Unsupervised log anomaly detection | SecOps | Flask, PyOD, PyTorch, scikit-learn | Mostly classic ML (GMM, autoencoder); tested GPT-5/Opus for triage, found classic ML better; OpenAI integration | No | None stated |
| Tether Sovereign App | **Agentigram** | https://devpost.com/software/clankergram | https://github.com/ParthB21/agentigram | Coordination layer so coding agents on different laptops detect conflicting changes and negotiate interfaces | Teams running Claude Code/Codex/Gemini CLI | Electron, Pear, QVAC, Tether | Local 1B Llama via QVAC (grammar-constrained); hooks into CLI coding agents; deterministic collision detection | Local only | None stated |
| Tether Sovereign App | **Aegishmesh** | https://devpost.com/software/aegismesh-oj813b | https://github.com/asma675/Hack-the-North-2026 | Zero-trust security mesh: 7 specialist agents investigate, then gated execution with signed capabilities | Orgs deploying autonomous agents | Browserbase, Cloudflare DO/KV/Queues, jiuwenswarm, Pear, QVAC, React | Multi-agent (openJiuwen), OpenAI verification, local QVAC inference, trust scoring | Yes (Pi edge enforcement demo) | None stated |
| Intact + Federato | **Pixie** | https://devpost.com/software/pixie-8vlj7g | https://github.com/benz16107/pixie-htn2026 (demo https://youtu.be/O47V32zbv20) | One inspectable risk engine for commercial underwriting and consumer quoting | Underwriters + insurance consumers | Elastic, Expo, FastAPI, Next.js, OpenAI, Sentry, Federato | Multi-agent (Intake, Hazard, Portfolio, Appetite), **MCP tool calling**, guardrails that block model numbers absent from computed facts, vector retrieval | No (Expo mobile app) | None stated. It won 2 insurance prizes with one engine |
| Dominion WHITEOUT | **DogWatch** | https://devpost.com/software/bump-pets | https://github.com/Ollienel777/HTN_WHITEOUT | C2 for 4 ArduPilot vehicles tracking a vessel via CV + probabilistic belief | Defence sim | ArduPilot, Gazebo, MAVLink, OpenCV, Docker | **None** (classical CV) | Sim drones | None stated |
| Dominion WHITEOUT | **DominIQ** | https://devpost.com/software/dominiq | https://github.com/savirsingh/DominIQ | Drone swarm geolocates a ship from camera geometry; voice mission assistant | Defence/maritime | Python, TS | Custom YOLO; GPT-4o + Whisper + ElevenLabs **voice assistant grounded in telemetry logs** | Sim drones | None stated |
| Dominion WHITEOUT | **Shadow Stalker** | https://devpost.com/software/temp-p5ogjk | https://github.com/malekhammoud/Drone-Sim | Detects AIS-dark "shadow vessels" with air and ground assets | Maritime security | Python, WireGuard, Tether | **None** (custom 3-layer CV) | Sim | None stated |
| Expo | **Cospray** | https://devpost.com/software/fresco-b1riws | https://github.com/McMuf/htn26 | Geo-anchored persistent AR graffiti that others can see | Street-art / social | Expo, React Native, ARKit/ARCore, Swift, CF Workers, WidgetKit, Dynamic Island | **None** | Phone AR | None stated |
| Bracket Bot | **Realbot** | https://devpost.com/software/realbot | https://github.com/ariobarin/RealBot | Remote-controlled robot property tours with interactable objects | Landlords/realtors, renters | BracketBot, LiveKit, Supabase, Three.js | **None** (SLAM, gestures) | Yes | None stated |
| Bracket Bot | **GitIRL Bot** | https://devpost.com/software/house-bot | none (site https://gitirl.health/) | Git version control for physical objects in a room; ask in English and the robot fetches the item | Teams/households | BracketBot, Gaussian splatting, OpenAI, YOLO, VLA, Mongo, Elastic, Sentry | OpenAI NL queries; perception to voxel map to YAML in git; VLA manipulation | Yes | None stated |
| Bracket Bot | **PrintDnD** | https://devpost.com/software/printdnd | none (site https://printdnd.vercel.app/) | Bimanual robot clears finished 3D prints | Print farms/makers | BracketBot | Fine-tuned **pi0.5 VLA** on 100+ Quest-teleop episodes; voice commands | Yes | None stated |
| Bracket Bot | **Badminbuddy** | https://devpost.com/software/badminbuddy | none listed | Robot finds and stacks badminton shuttles | Badminton players | BracketBot, PyTorch, YOLO | YOLO11s + pi0.5 VLA | Yes | None stated |
| Sentry | punching-face | (above) | | | | | | | |
| Sentry | **ChatGPU** | https://devpost.com/software/ji-review | https://github.com/ji24077/HTN | Agent adapts, validates and runs code across heterogeneous GPU/CPU workers (CUDA to ROCm, etc.) | Developers with mixed hardware | OpenAI Agents SDK, vLLM, CUDA/ROCm, Sentry, Fastify, Postgres | GPT-6 Astra planning + function-calling loop; numerical validation | GPU cluster | Page: Sentry traces tie distributed jobs to failures; no judge comments |
| Sentry | **HumanCraft** | https://devpost.com/software/humancraft | https://github.com/elijahzhao24/minecraft_hack_the_north | iPhone LiDAR puts real people into Minecraft as point clouds with hitboxes | Gamers | Swift, ARKit, LiDAR, MediaPipe, Fabric, Sentry, SentryMCP | Built largely by **Devin** (33k LOC); MediaPipe | iPhone LiDAR | None stated |
| Aramco Beginner | **Providence** | https://devpost.com/software/providence-tn6m4h | https://github.com/hni-z/Providence/tree/codex/htn-main | "Superagent" coordinating agents across multiple devices, carrying context between them | Multi-device power users | TS, Node, Swift, WebXR, Cloudflare | Codex-based multi-agent delegation, **computer use** on Mac/Win, ElevenLabs voice (Watch/iPhone/Quest) | Watch/Quest clients | None stated |
| Aramco Beginner | **Gestura** | https://devpost.com/software/gestura-6m3xfv | https://github.com/Eben-Siyabalapitiya/Gestura | Motion + voice gloves as game controller (Minecraft) | Gamers | C++, ESP32, Gemini, OnShape | Gemini listed; usage unclear | Yes (ESP32-S3 gloves, IMUs) | None stated |
| LeLamp SDK | **Feel The Music** | https://devpost.com/software/feel-the-music | https://github.com/Karanvir1729/feelthemusic | Music to synchronized haptics, light and robot-lamp choreography | Deaf / hard-of-hearing people | LeLamp SDK, ESP32, Pi, Core Haptics, OpenAI, MediaPipe | OpenAI; agents cross-check commands before they reach hardware | Yes | None stated |
| LeLamp SDK | **You Light, I Lift** | https://devpost.com/software/you-light-i-lift | none (Google Drive link) | Asymmetric co-op game: a physical lamp is the spotlight, a tracked stick becomes a platform | Couch co-op players | Codex, LeLamp, Python, Unity | **None** at runtime | Yes | None stated |
| LeLamp SDK | **LeLamp Play Pack** | https://devpost.com/software/wip-qdk9hm | https://github.com/tessaSlice/lelamp-play-pack/tree/main | Optics mods + 2 games for the LeLamp | Desk-toy users | C#, Codex, Python, Unity | Codex for dev only; CV head direction | Yes (Fresnel lens, servos, LEDs) | None stated |
| Backboard + MLH Gemini | **Tinker** | https://devpost.com/software/tinker-pwamby | https://github.com/aman-a-shah/tinker | "Vibe code hardware": describe a machine and get a design, sim, blueprint and build steps | Software devs new to hardware | Backboard, Codex, Composio, Elastic, Gemini, OpenAI, openJiuwen, Rapier, Unity | Gemini vision QA; openJiuwen multi-agent verification; Composio tools | Hardware-focused output | None stated |
| Huawei openJiuwen | **蚁群 YiQun** | https://devpost.com/software/project-ki3u7vwhj0x8 | https://github.com/ImperialKoi/swarm-robotics-openJiuwen | 512-robot simulated disaster-rescue swarm commanded by voice | Incident commanders | Python, Godot, CNN, RL, auctions | Gemini 3.5 Flash multimodal + GPT-audio-mini voice; 4 role agents; GRPO fine-tuning; swarm keeps working if the LLM fails | Simulated | None stated |
| Huawei openJiuwen | **Parity** | https://devpost.com/software/parity-8n5zbf | https://github.com/KenC2006/htn2026 | Agent swarm migrates a codebase to a new language and proves equivalence with tests | Engineering teams | openJiuwen, SwarmFlow, OpenRouter, HarmonyOS/ArkTS, Rust | ReAct agents with compile/run tools; escalates to Claude on failure | No | None stated |
| Huawei OMNI | **Octavius** | https://devpost.com/software/octavius-nkl4x3 | https://github.com/savcode066/octavius | Cardboard backpack-mounted extra robotic arm, controlled by voice/photo | Fun/assistive | Arduino, Pi, Python | OMNI vision for object recognition | Yes | None stated |
| Huawei OMNI | **Goosetriever** | https://devpost.com/software/robot-pickup-helper | https://github.com/dark-sorceror/Goosetriever | Voice-controlled robot that finds and picks up dropped objects | People with limited mobility | LeRobot, ACT, lidar, QNX, RDK S100, Pi 5, YOLO | Qwen-Omni (audio+camera to speech + structured intent), YOLO-World, ACT grasp policy | Yes | None stated |
| MLH ElevenLabs | **Squawk** | https://devpost.com/software/atc | none (live http://squawk.fit) | ATC copilot: conflict-free routing, fine-tuned radio ASR, catches wrong pilot readbacks | Air traffic controllers | Baseten, Elasticsearch, ElevenLabs, Whisper, RoBERTa, deck.gl, Next.js | Whisper fine-tuned on ATC audio (**WER 0.708 to 0.159**); cross-encoder readback check; GLM agent with a hand-rolled tool loop (4-call / 5 s budget); Elastic RAG; ElevenLabs pilot voices | No | Page gives the WER metric; no judge comments |
| MLH Tiger Data | **Scout** | https://devpost.com/software/scoutable | https://github.com/aikhanjum/scout | Lidar robot auto-measures doorway widths against the 860 mm accessibility standard | Wheelchair users, accessibility auditors | Pi 4, RPLIDAR, C++, React, Three.js | **None** | Yes | Page: TimescaleDB streaming 3,600 rows/s, 96% compression |
| MLH Tiger Data | **Save My Rims** | https://devpost.com/software/detect-pot | https://github.com/Georgeyy07/HackTheNorth2026 | Phone-IMU pothole detection + pothole-avoiding routing | Drivers | Expo, FastAPI, PyTorch, TigerDB, OSM | Transformer on IMU data; ElevenLabs voice navigation | Phone sensors | None stated |
| MLH Vultr | **Triviality** | https://devpost.com/software/rbc-buddies | https://github.com/sharonbasovich/norththehackers/tree/main | Agent swarms attack open math problems, verified with Lean | Mathematicians | Docker, Lean, MongoDB, Redis, React | 6-role agent swarm (openJiuwen SwarmFlow) + formal verification | No | None stated |
| MLH Snowflake | **PiHive** | https://devpost.com/software/primacore | https://github.com/mariamelsahharr/htn-2026-dist-inf | 9 Raspberry Pis run a 30B LLM together, escalating to H100 then OpenAI | Privacy/cost-conscious devs | distributed-llama, Ansible, Baseten, Gemini, OpenAI, Snowflake Cortex, LoRA/Unsloth | Local Qwen3-30B; Gemini difficulty router; tiered cloud escalation | Yes (9x Pi 5) | None stated |
| MLH MongoDB | **Twinventory** | https://devpost.com/software/project-name-s0vg5w | https://github.com/djleamen/twinventory | Digitise your wardrobe, AI try-on, 3D previews | Online shoppers | Browserbase, Claude, Elastic, ElevenLabs, Meshy, MongoDB, OpenAI | Image-gen try-on, embeddings search, voice input | No | None stated |
| MLH MongoDB | **Project Orion** | https://devpost.com/software/project-atlas-icfow4 | https://github.com/Feiyang0303/Orion_HTN26 | AI crew plans a trip, then flies you through it in photoreal 3D/VR | Travelers | GPT-4o, ElevenLabs, Google 3D Tiles/Routes, MongoDB, Unity, OpenXR | 8 agents (4 LLM: scout, judge, narrator, director); critic loops; routing done in code to avoid hallucination | Quest app | None stated |
| MLH GoDaddy domain | **S.L.O.P.** | https://devpost.com/software/north-inc | https://github.com/enkai-liu/htn-2026 | Originality checker for project ideas (slop.compare) | Hackers/builders | Baseten, Browserbase, Elastic, Exa, GPTZero, Jina, openJiuwen | Multi-agent debate + citation verification + coach | No | Domain prize (slop.compare) |
| Solana + Badge | Settlers of Solana | (above) | | | | | | | |
| Solana + Badge | **Among Us (IRL)** | https://devpost.com/software/among-us-lbrwjk | https://github.com/s-illly/htn-amongus | Real-life Among Us on ESP32 badges with NFC tasks, no server | Groups at venues | C++, ESP-NOW, ESP32-C3, NFC | **None** | Yes | None stated |
| Browserbase | **plus1** | https://devpost.com/software/plus1-1imlbz | https://github.com/DonaldKLee/plus1 | AI participant that joins Google Meet with a face and voice, takes actions and screenshares | Insurance professionals in meetings | Gemini, ElevenLabs, Browserbase, Playwright, MongoDB | Voice agent with barge-in; multi-hop tool calls (Intact quoting, Federato underwriting, **browser automation**) | No | None stated |
| Linq | **messageMAFIA** | https://devpost.com/software/robot-mt8uxc | https://github.com/lolasanchezz/text-mafia | Mafia game in an iMessage group chat with AI narration | Friend groups | Express, Linq, Supabase | Claude Opus narration; Haiku parses casual input | No | None stated |
| Linq + Cloudflare Agent w/ Brain | **Whim** | https://devpost.com/software/idk-man-794g6v | https://github.com/chang-07/htn-26 | AI widgets in an iMessage group chat: games, party shopping, end-to-end trip booking | Group chats | CF Workers/DO/D1/Vectorize/Workflows, GPT-5, Linq, Browserbase, Shopify, SwiftUI | Autonomous tool-calling agent (web research, bookings, shopping) | iMessage extension | None stated |
| Zip | **Agent-Gate** | https://devpost.com/software/agent-wall-hqrjvb | https://github.com/japneet250/Agent-Gate | Policy firewall that intercepts agent tool calls before they run | Enterprises running agents | Claude, CF, LangGraph, LangFuse, MCP proxy, Zip | 5-node LLM judge + deterministic rules; hybrid retrieval | No | None stated |
| Zip | **YourCall** | https://devpost.com/software/yourcall-0epzc4 | https://github.com/leojia8/YourCall | Approve procurement requests by iMessage voice note | Managers/procurement | Gemini, Linq, Zip | Gemini parses intent only; deterministic policy engine; human confirmation; Zip MCP read-only | No | None stated |
| Composio | **Otto** | https://devpost.com/software/dean-your-personal-agent-at-your-command | https://github.com/Vibhor7-7/HackTheNorth-OTTO | Push-to-talk wearable voice agent that completes multi-step tasks across apps | General users | Composio, ESP32, OpenAI, WebSockets | OpenAI Realtime voice + Responses planning; Composio tool calling; approval gating | Yes (ESP32 wearable) | None stated |
| Unto Labs Thru | **fly VS worm** | https://devpost.com/software/fly-vs-worm | https://github.com/MarcDasilva/htn-2026 | Simulates fly and worm connectomes on-chain (neuron = account, synapse = tx) reacting to crypto prices | Crypto/neuro nerds | C, Thru, Gemini, ElevenLabs | Minor (Gemini/ElevenLabs); core is deterministic | No | None stated |
| Cognition Devin | **Gods Plan** | https://devpost.com/software/shift-t15x3m | https://github.com/ManagementMO/shift | 3D god-mode city sandbox with thousands of AI residents to stress-test policy | Urban planners | Babylon.js, SUMO, openJiuwen, OpenRouter, Mongo, Elastic, Sentry | openJiuwen ReAct specialists; resident swarms on multiple LLMs; action validation; Devin did code review and deploy | No | Page describes how Devin was used; no judge comments |

### Observations (HTN 2026)
- **Hardware dominates the finalists.** 10 of 12 finalists involve physical hardware or devices (exoskeleton glove, wearable combadge, robotic film rig, OLED keyboard, hacked badges, 3D-printed CAD output, VR/AR). Only **Bricked** and **Settlers of Solana** are pure software. The "WOW factor" criterion appears to reward live physical demos (inference).
- **Almost every winner uses LLMs, usually agentically.** Common patterns: voice-first agents (GPT-Live, Realtime API, Qwen/OMNI, ElevenLabs), tool calling/MCP, multi-agent orchestration (openJiuwen, planner/critic), vision/VLA for robots (SmolVLA, pi0.5, ACT), and computer use (Jevis, Aircade, Providence).
- **A recurring winning pattern is "LLM proposes, deterministic code verifies."** Dealify ("AI picks from a menu; code writes the menu"), WatchTower, Pixie, YourCall, Agent-Gate, FinRet, Project Orion and neoKernel all do this. Sponsor tracks (RBC, Rox, Federato, Intact) explicitly asked for validation and error handling.
- **Many projects carry measurable claims:** neoKernel 4.3x, Squawk WER 0.708 to 0.159, FinRet 29/30, Scout 3,600 rows/s. No judge comments confirm these mattered.
- **Prize stacking is common.** 11 projects won 2 prizes, e.g. Pixie (Intact + Federato), Whim (Linq + Cloudflare), Tinker (Backboard + Gemini), and finalists plus a sponsor prize.
- **Winners without AI** exist, but mostly in hardware, badge, AR or robotics tracks: bingbong, ARDB, Cospray, Among Us, Scout, Realbot, DogWatch, Shadow Stalker, You Light I Lift.
- **Targets are specific:** dysarthria, ALS, deaf users, air traffic controllers, underwriters, insider-threat analysts, doorway accessibility auditors.

---
## Hack the Valley (UTSC): no 2026 edition held yet

**There was no 2026 edition held as of 2026-09-26.**
- **Hack the Valley 11** is scheduled for **Oct 16–18, 2026** at UofT Scarborough (about 750 hackers, 36 h). Source: https://hackthevalley.io/, which says applications are open. It is upcoming, so there are no winners yet.
- The latest completed edition is **Hack the Valley X, held Oct 3–5, 2025** (https://hack-the-valley-x.devpost.com/, gallery at /project-gallery). By the brief's rule that is a 2025 event, not 2026, so I did not record its winners.
- HtV X prizes, for reference (from its Devpost): 1st Meta Quest 3S; 2nd Apple Watch SE; 3rd Galaxy Buds; category prizes (AI, finance, CI/CD, etc.); JT Award for Future Impact ($500 × 3); SDGs@UofT AI for Inclusive Futures Challenge ($1,000).
- Access checks: `hack-the-valley-xi.devpost.com` and `hack-the-valley-11.devpost.com` both returned **HTTP 404**, so the HtV 11 Devpost page is not live or uses another slug (unverified). "ValleyHacks 2026" (valleyhacks2026.devpost.com) is an unrelated event.

---
## Other large Canadian 2026 projects: selection and coverage

| Event | Dates | Where | Size (Devpost registrants) | Covered? |
|---|---|---|---|---|
| **GenAI Genesis 2026** | Mar 13-15, 2026 | UofT, Toronto | 809 registered, 249 submissions | YES, full (all 20 winners read) |
| **uOttaHack 8** | Jan 16-18, 2026 | uOttawa CRX, Ottawa | 568 registered on Devpost ("850+ hackers" per search snippet, unverified), 175 submissions | YES, full (all 31 winners read) |
| **cuHacking7** | Jul 10-12, 2026 | Carleton, Ottawa | 171 registered, 60 submissions | YES, full (all 14 winners read) |
| SpurHacks 2026 | ? | Waterloo | ? | **NOT FOUND.** See note below |
| ElleHacks 2026 | Jan 30-Feb 1, 2026 | Toronto (York) | 305 | Prizes only (below), winners not read |
| Hacked 2026 (UAlberta) | Feb 20-22, 2026 | Edmonton | 332 | Prizes only |
| Cursor Project Toronto Tech Week | May 27, 2026 (1 day) | BrainStation Toronto | 154 | Prizes only |
| HackCamp 2026 (UBC) | Nov 2026 (future) | Vancouver | n/a | Not held yet |

**SpurHacks 2026 access problem:** `https://spurhacks.devpost.com/` is the **2025** event (June 20-22, 2025; 902 participants; $106,250+ CAD prize pool with Venture/Startup/Hack tracks). `https://spurhacks-2026.devpost.com/` returned **HTTP 404**. `https://spurhacks.com/` is now a **parked domain**: curl returned a parklogic ad-redirect page, and WebFetch failed with an SSL "unable to get local issuer certificate" error. `https://x.com/SpurHacks` returned **HTTP 403**. Luma (luma.com/m9sseyrj) covers only the 2025 launch. Web searches turned up nothing on a 2026 edition. **Conclusion (unverified): SpurHacks does not seem to have run in 2026, or at least not on Devpost.**

---
## Other 2026 Canadian events (prizes only, winners not researched)

- **ElleHacks 2026** (https://ellehacks-2026.devpost.com/, site ellehacks.com): Jan 30-Feb 1, 2026, Toronto (York/Accolade East), 305 participants, 10th anniversary, women and gender-diverse students. Prizes: 1st (Porter flights + software subscriptions), 2nd, 3rd; Wealthsimple Kids' Digital Banking (3 winners); MLH Gemini / Presage / Solana / DigitalOcean / ElevenLabs / MongoDB. Judging: 3-min pitch + 2-min Q&A.
- **Hacked 2026** (https://hacked-2026.devpost.com/): Feb 20-22, 2026, UAlberta Edmonton, 332 participants, $5,718+ CAD. Tracks: Software, Hardware, Civil/Environmental/Mining/Petroleum, Energy/Power, Diversity.
- **Cursor Project Toronto Tech Week** (https://cursor-project-ttw.devpost.com/): May 27, 2026, one day, BrainStation Toronto, 154 participants. Tracks: Best Project; Best Project Built with ElevenLabs; Most Likes on LinkedIn/X; Voice Agent for SE Asian Customer Problems (Valsea); **Most Revenue During Project**; Best Project Using Voice AI ($1,000, General Magic). Teams could enter only one track. Heavily voice-AI themed.
- **HackCamp 2026** (https://hackcamp-2026.devpost.com/): UBC's beginner project, usually November, so not yet held.
- **SpurHacks 2026**: not found (see the SpurHacks note in the section above).
## Edison (the event we are entering; upcoming Oct 3-4, 2026)

- **Status as of 2026-09-26: upcoming, 1 week away.** Oct 3-4, 2026. Devpost rules give **Oct 3, 2026 9:00 AM – Oct 5, 2026 5:00 PM**, which appears to be the submission and judging window.
- **Devpost:** https://Edison2026.devpost.com/ (no hyphen; it exists and returns HTTP 200). `https://Edison-2026.devpost.com/` returns **HTTP 404**.
- **Website:** https://www.Edison.com/ (SvelteKit site; content is in https://www.Edison.com/data/faq.json and /data/sponsors.json). Info page: /info. 3D workshop portal: https://studio.Edison.com/.
- **Venue:** SFU Burnaby. Devpost says **AQ Building**, 8888 University Dr W. In person only.
- **Theme / what to build:** Devpost says **"Revealed during Opening Ceremony"**. No tracks or prizes are published yet: Devpost shows a single placeholder prize, "1 non-cash prize... To be revealed". Judges are "To Be Revealed".
- **Judging criteria (Devpost, same as 2025):** Technical Complexity; Design; Pitch; Originality / Creativity.
- **Submission rules:** "You MUST submit a link to view your project (ie. Figma, Git Repo, pitch slides, live demo etc)". "Only 1-2 people maximum are needed to present the project."
- **Eligibility:** in person; enrolled post-secondary or graduated within the last 4 months. Teams of up to 4. Free, with food provided.
- **Sponsors listed on Edison.com (sponsors.json):** Vercel, Arc'teryx, GitHub, Transoft Solutions, Pure Buttons. A search-snippet summary also mentioned "Major League Hacking, Microsoft, AMD, Safe Software, Huawei, Vercel, Scalar" as attending professionals and companies (unverified; I could not find this text on the current site). The MLH 2027-season trust badge is on the site, so MLH "Best Use of X" prizes are likely (unverified).
- **Info page framing (verbatim excerpt):** "Build the thing that excites you, the thing that scares you a little... Not the one you'd solely do just to get brownie points from judges... Shipping something imperfect and real instead of waiting until you're ready."
- **Applications:** closed Sept 19, 2026, 11:59 PM (per search results and a Facebook post title, unverified in full). Devpost showed 6 participants registered at research time.
- **Socials:** Instagram post https://www.instagram.com/p/DboVsRylAoL/ (readable via WebFetch; it only restates the dates and venue). The Facebook post body was truncated, and the Fable page (fable.social/event/5e6bd14dace6491c) has only the date. The LinkedIn (ca.linkedin.com/company/sfu-surge) was not fetched.

---
## [NOT 2026, CONTEXT ONLY] Edison 2025 (previous edition of our event)

- **Devpost:** https://Edison2025.devpost.com/ (note: no hyphen. `Edison-2025.devpost.com` gives **HTTP 403** via WebFetch). Gallery: https://Edison2025.devpost.com/project-gallery (10 pages; Devpost lists 768 participants; one winner's page says "778 participants").
- **Website (then):** Edison.com (now shows 2026). Organizer: **SFU Surge**. MLH member event.
- **Dates / venue:** Oct 4-5, 2025 (24 hours), SFU Burnaby. Winners were announced Oct 5, 4:00pm PDT.
- **Eligibility:** in person; enrolled post-secondary students or graduates of the last 4 months. Teams of up to 4.
- **Judging criteria (Devpost):** Technical Complexity; Design; Pitch; Originality / Creativity. **70+ judges** from Microsoft, Amazon, EA, Hootsuite, Trulioo, Arista, Mastercard, PwC, DigitalOcean, Red Hat, Asana, Rippling, Visier, Arc'teryx and others.
- **Prize pool:** $CAD 32,600+ (much of it Vercel/Inworld credits).
- **Sponsors:** AMD, Scalar, Transoft Solutions, Vercel, Wondershare, Trulioo, Safe Software, Huawei, Microsoft, EA, ColorStack, CodeCrafters, HUION, Hootsuite, MentorMates; partners included CDM, Kardium, Ekohe, Synexus Labs, SFSS, Charles Chang Institute, T1, n8n, Inworld, Balsamiq, and food/venue partners.

### Tracks / prizes

| Prize | # winners | Description (from Devpost) |
|---|---|---|
| Finalists | 3 | Headphones, CodeCrafters VIP, MS office tour |
| Best Game | 1 | "most engaging, creative, and well-designed game" |
| Most Likely to Become a Startup | 3 | "clear market need, scalability, and a path toward becoming a viable business". Vercel Pro + Inworld AI credits |
| Best Solo Project | 1 | "creativity, technical execution... complete and polished project without a team" |
| Best Beginner | 1 | At least half the team first-time hackers |
| Best Hardware | 1 | "best hardware hack" |
| Best Design | 1 | "intuitive user experience, visual appeal... functionality and accessibility" |
| Surge Choice Award | 1 | Chosen by the organizers |
| Huawei Challenge #1: Interactive Landscape Graphics | 2 | Real-time infinite procedural terrain via ray marching |
| Huawei Challenge #2: Automatic Decision for Re-computation | 2 | Operator scheduling under memory limits with recomputation |
| Safe Software Best Modern C++ | 1 | Clean interfaces, correctness/safety, performance |
| ColorStack Most Portable Project | 1 | Mobile, wearable or AR/VR |
| Charles Chang Institute of Entrepreneurship Prize Track | 1 | Entrepreneurial thinking, market potential ($250) |
| UN Sustainable Development Goals Enactus Challenge | 3 | Tackle UN SDGs |
| CSSS Rube Goldberg Challenge | 1 | Make a simple task hilariously complex |
| Software Systems Prize | 1 | At least 2 SoSy students on the team |
| BluePrint Social Good Track | 1 | Equity, accessibility, community well-being |
| SEE Sustainable Engineering Track | 1 | Engineering with environmental/social impact |
| IEEE SFU Prize Track | 1 | EE/computing principles for a real-world problem |
| [MLH] Best Use of .Tech / Gemini API / ElevenLabs / Snowflake API | 1 each | |
| Best Use of SFU Courses API | 2 | Uses api.sfucourses.com |

### Winners (27 winning projects; all read on Devpost; badges verified)

No official 1st/2nd/3rd order among the three finalists was found; the badge says only "Finalists".

| Prize | Project | Devpost | GitHub | What it does | For whom | Built with | AI/LLM use | HW? | Why it won |
|---|---|---|---|---|---|---|---|---|---|
| Finalists + Best Game | SurvivalChess | devpost.com/software/survivalchess | github.com/jpg157/SurvivalChess_Edison_2025 | Timed chess-survival game: move pieces off danger tiles | Gamers (not stated) | node.js, pixijs, typescript, vite | None | No | None stated |
| Finalists + UN SDG Enactus + Best Design | Mapd | devpost.com/software/mapd-urban-development-intelligence | github.com/LMSAIH/Edison2025 (mapd.tech) | Geospatial platform that pulls open data together to show what urban development means for your block | Residents, planners, civic groups | cloudflare, digitalocean, docker, fastapi, mongodb, openai, python, react, tailwind, vite | OpenAI for messy-data reconciliation, entity linking, and "What this means for your block" summaries | No | None stated |
| Finalists | IntervU | devpost.com/software/intervu-852wre | github.com/PaulP1406/IntervU_frontend, github.com/bnquon/Edison-BE (intervuai.tech) | AI mock interviews (behavioral + technical) with code execution and feedback | SWE job seekers | elevenlabs-api, go-piston, golang, google-gemini-api, mongodb, next.js, openai, react, render, typescript, vercel | Gemini generates questions, hints and feedback from resume + JD; ElevenLabs voice | No | None stated |
| Best Beginner + UN SDG Enactus + Most Likely Startup | Track2Give | devpost.com/software/track2give | github.com/abdullahmohammed1234/Edison2025 | Household food-expiry tracker that suggests donating soon-to-expire items | Households reducing food waste | cloudinary, css3, ejs, express.js, gemini, html5, javascript, mongodb, mongoose, node.js, passport | Gemini tag; implementation not detailed | No | None stated |
| Most Likely to Become a Startup | Rehabit | devpost.com/software/rehabit-c093se | github.com/KR13H/Rehabit | Webcam rehab coach with symmetry/ROM scores and AI clinical reports | Stroke/injury rehab patients, clinicians | css, elevenlabsapi, gemini, geminiapi, html, json, python | Gemini turns session JSON into plain-English reports; MediaPipe/OpenCV pose (from write-up); ElevenLabs | Webcam | None stated |
| Most Likely to Become a Startup | Encore | devpost.com/software/encore-vzilag | github.com/zhaojzn/encore-demo-app | Concert social app: see which friends are going, share seats | Concert-goers | expo.io, figma, firebase, tailwindcss | None | No | None stated |
| Best Hardware | ASL Express | devpost.com/software/sign2order-touchless-ai-food-ordering-assistant | github.com/KashfiRashid/ASL_Express (+ _Backend, _Hardware) | Touchless ordering kiosk that converts ASL gestures into menu orders | Deaf/mute customers, kiosks | Python, MediaPipe, OpenCV, Gemini API, ESP32/C++, PySerial, LCD, LEDs, ultrasonic, ElevenLabs (tags are garbled on the page) | Gemini for gesture reasoning and intent mapping; ElevenLabs voice | **Yes**: ESP32 kiosk | None stated |
| Best Solo Project | Qount | devpost.com/software/qount | github.com/nevadoj/boxgame | Memory game: count cubes before they vanish | Casual players | swift, swiftui | None | No (iOS) | None stated |
| Surge Choice + SEE Sustainable Engineering | EcoDepot | devpost.com/software/ecodepot | github.com/iancdev/recycle-sorter | Smart bin that sorts recyclables with CV and pays students deposits via ID scan | Students, campuses | arduino, autodesk-fusion-360, c++, netlify, nextjs, python, react, supabase, tensorflow | TensorFlow classifier (vision); no LLM | **Yes**: 3D-printed rotating bin, motors, camera | None stated. Same core team (Ian Chan, Shenghua Jin, Matthew Lin) later won MLH ElevenLabs at nwHacks with HUDson |
| Huawei #1 (Landscape Graphics) | Music March | devpost.com/software/the-ray-marching-band | github.com/ErykHalicki/ray_marcher | Real-time ray-marched terrain audio visualizer driven by FFT | Graphics/music enthusiasts | cpp, glsl, sdl | None | No | None stated |
| Huawei #1 (Landscape Graphics) | Optimized Ray-marching algorithm | devpost.com/software/optimized-procedural-heightfield-rendering | github.com/markharmon868/SphericalTrace | Optimized heightfield ray marching (Lipschitz sphere tracing, LOD, Illinois root finding); 37.8% fewer steps | Graphics devs | glsl | None | No | None stated (solo) |
| Huawei #2 (Re-computation) | Hooray-For-Huawei | devpost.com/software/hooray-for-huawei | github.com/Arnice123/Edison-Hooray-For-Huawei | DAG node ordering that minimizes peak memory via recompute decisions | ML systems | c++ | None | No | None stated |
| Huawei #2 (Re-computation) | Racoon Works Hua Wei CC 2 | devpost.com/software/racoon-works-hua-wei-cc-2 | github.com/notwinston/Racoon_Works_Storm_Hacks2025 | Scheduler comparing greedy, beam search and branch-and-bound | ML systems | c++ | None | No | None stated |
| Safe Software Best Modern C++ | GANPI | devpost.com/software/ganpi | github.com/chdrPE/GANPI | Terminal/web AI assistant for code generation and explanations | CLI beginners | c++, cmake, gemini, next.js, node.js | Gemini prompts + file summarization | No | None stated |
| ColorStack Most Portable Project | Punchly | devpost.com/software/punchly | github.com/Aneel-Badesha/Edison2025 | NFC tap-to-stamp digital loyalty punch card | Small businesses + customers | flask, python, react-native, sqlite, supabase | None | **Yes**: NFC tags | None stated |
| Charles Chang Entrepreneurship | LockedIn | devpost.com/software/lockedin-09v51s | github.com/yood2/lockedin | Desktop app that watches screen and webcam and calls you out when distracted | People with ADHD / focus issues | electron, gemini, javascript, react, streamlit, typescript, vite | Gemini **vision** on periodic screenshots (screen understanding, not computer control) | Webcam | None stated |
| UN SDG Enactus | EcoTag | devpost.com/software/taqr | github.com/fesenjuniors/qr-tag-arena (+ backend) | Phone-based QR laser tag plus gamified garbage scanning and sorting | Players, schools | typescript, websockets, "vision" (plus joke tags) | OpenAI Vision classifies trash and estimates CO2 saved | Phones + QR tags | None stated (team: "one of the top projects among 778 participants") |
| CSSS Rube Goldberg | Hello World Rube Goldberg | devpost.com/software/hello-world-rube-goldberg-the-Edison-experience | None (Drive link) | Physical machine that prints "hello world" the hard way | Fun | arduino, c++ | None | **Yes** | None stated |
| Software Systems Prize | ConnectSFU | devpost.com/software/connectsfu | github.com/avkap007/Edison-connectsfu | SFU club-event discovery + buddy matching | SFU students | canva, chatgpt, claude, css, figma, framer, gemini, geminiapi, html, procreate, react, supabase, tailwind, typescript, vercel | Gemini scores buddy matches; AI search | No | None stated |
| BluePrint Social Good | GuardianEye | devpost.com/software/guardianeye | github.com/ryanraen/GuardianEye | Camera dashboard that detects elderly falls, fire and distress, with Twilio alerts | Caregivers of the elderly | css, fastapi, figma, gemini, github, mcp, mediapipe, react, strands-agents, twilio, typescript, yolov8 | **Agentic**: Gemini through Strands Agents + MCP for "agentic analysis"; YOLOv8/MediaPipe vision | Cameras | None stated (personal motivation given) |
| IEEE SFU Prize Track | FretNot | devpost.com/software/fretnot | github.com/doruphin/fretnot | Clip-on guitar laser projector that shows chord finger positions | Guitar learners | arduino, onshape, react, tesseract, typescript | None (Tesseract OCR) | **Yes**: ESP32, lasers, 3D print | None stated |
| [MLH] Best Use of .Tech | GemiDice | devpost.com/software/anything-pxw2f5 | github.com/roilee1101/Edison2025 | AI Dungeon Master text adventure with dice | Solo RPG players | css, elevenlabs, flask, gemini, html5, javascript, python | Gemini as the DM narrator; ElevenLabs voice | No | None stated |
| [MLH] Best Use of Gemini API | M.I.R.A | devpost.com/software/m-i-r-a | github.com/irvincardoza/Edison2025 | Desktop activity tracker with a voice AI productivity assistant | Knowledge workers | c++, django, electron, elevenlabs, gemini, python, react, typescript | Gemini over screenshots (vision) + ElevenLabs STT/TTS **voice assistant** | No | None stated |
| [MLH] Best Use of ElevenLabs | Carrie | devpost.com/software/carrie-ai-therapy-in-your-pocket | github.com/TimSeah/Edison_LumberLoons | Emotion-aware AI therapy video companion | Burned-out workers | axios, bcrypt, ..., elevenlabs, huggingface, livekit, torch, transformers, vit-model, ... | ViT emotion detection; ElevenLabs Conversational AI **voice agent** with emotion-conditioned prompts | Webcam | None stated |
| [MLH] Best Use of Snowflake API | Air Command | devpost.com/software/air-command-smu9t0 | github.com/bsbhakti/Edison | Sip/puff Bluetooth input device; Cortex LLM maps spoken commands to keystrokes | People with limited mobility | beagley-ai, c, python, snowflake | Snowflake Cortex LLM maps natural language to HID key sequences | **Yes**: pressure sensor, BeagleY-AI, Bluetooth | None stated |
| Best Use of SFU Courses API | SFU Grad Map | devpost.com/software/sfu-grad-map | github.com/alexchen817/Edison2025-sfu-course-map | Interactive prerequisite graph of SFU courses | SFU students | aceternity, d3.js, gemini-flash, next.js, shadcn | Gemini Flash extracts structured JSON from prerequisite text | No | None stated |
| Best Use of SFU Courses API | EduFind | devpost.com/software/edufind-aveu6k | github.com/Edison-2025/ProjectCourseBuilder | Course recommendations + social features | SFU students | express.js, figma, git, react, supabase, tailwind | DeepSeek API for recommendations | No | None stated |

### Edison 2025 observations
- It is a much bigger, sponsor-heavy prize table (about 20 tracks and 34 prize slots) than nwHacks. Many niche tracks drew only a handful of entries: Huawei algorithm challenges, Rube Goldberg, the SFU Courses API, C++. **Picking a track is a real lever at this event.**
- **Stacking prizes works:** Mapd won 3 (Finalist + SDG + Design), Track2Give won 3 (Beginner + SDG + Startup), SurvivalChess won 2 (Finalist + Game), EcoDepot won 2.
- Judging criteria were Technical Complexity, Design, Pitch and Originality. They reward pitch and design more explicitly than nwHacks' "Completion".
- LLM use is common (about 15 of 27), again mostly Gemini, but shallow: summarization, extraction, question generation. Only GuardianEye (Strands Agents + MCP) is really agentic. Voice agents (Carrie, M.I.R.A) won MLH tracks.
- Hardware won 8 of 27 (ASL Express, EcoDepot, Punchly, Rube Goldberg, FretNot, Air Command, plus webcam projects), and the Best Hardware and IEEE tracks exist specifically for it.
- None of the three finalists is a hardware project. One is a pure game with no AI (SurvivalChess), which shows polish and fun can reach the finals.

---

---

## Patterns

Everything in this section is inference from *who won*, measured against each event's published judging criteria. No judges' reasoning was published for any 2026 event.

### The most instructive 2026 winners (for a team leaning toward AI agents)

| # | Project | Event / prize | Why it's instructive |
|---|---|---|---|
| 1 | **ViniClip** ([Devpost](https://devpost.com/software/viniclip)) | ConUHacks X, **1st overall** | An OpenAI function-calling agent cuts pauses and mistakes *while you are still recording*, then posts to Reels. The agent takes a real action, it is visible live, and the idea fits in one sentence. |
| 2 | **Orca** ([Devpost](https://devpost.com/software/orca-4po0nm)) | QHacks, **1st** | You hum and get a multi-instrument MIDI track. Gemini tool calling plus MCP tools handle the structured audio tasks. The team says "agentic AI beats pure generation for structured tasks", and the rubric said "look beyond basic LLM implementation". |
| 3 | **AdLib** ([Devpost](https://devpost.com/software/living-canvas-gz360v)) | HTN, **Rox Best AI Agent** ($10k or $2k; which one is not shown) | While you present, it draws diagrams and charts in under 2 s. A decision agent emits structured tool calls. Code guardrails stop it using numbers not in the transcript and make destructive edits ask for confirmation. |
| 4 | **Reflex** ([Devpost](https://devpost.com/software/reflex-e0jkih)) | HTN, **Finalist** | Claude drives the servos of an exoskeleton glove in real time over MCP, alongside a fine-tuned SmolVLA (a vision-language-action robot model). It is the clearest case of an agent plus hardware producing a "WOW" demo. |
| 5 | **49th** ([Devpost](https://devpost.com/software/hack-canada-2026)) | Hack Canada, **3rd** + Google Build with AI | A newcomer-to-Canada assistant. Its browser agent sees the page through Claude Vision, rather than reading the page code, and fills government forms. It serves a very specific user with a real, tedious task. |
| 6 | **Axiom** ([Devpost](https://devpost.com/software/axiom-vrd28n)) | GenAI Genesis, **Top team (in person)** | Pitched as "Claude Code for game dev": Claude plus an MCP server with 20+ tools generates assets and code and deploys the game. A developer tool built on an agent framework won Canada's biggest AI-only project. |
| 7 | **Rehabify** ([Devpost](https://devpost.com/software/rehabify-y2f5mu)) | nwHacks (Vancouver), **Finalist**; its own write-up claims 1st (unverified) | A webcam physio coach: a Vapi voice agent (Deepgram, then Gemini, then ElevenLabs) plus MediaPipe pose tracking. It pitched a validated statistic ("only 35% complete exercises") and feedback from physiotherapists. It is the most local reference for Edison. |
| 8 | **Praxis** ([Devpost](https://devpost.com/software/praxis-41b68v)) | Hack the 6ix, **1st** | A stroke and Parkinson's rehab device running QNX on a Raspberry Pi, with an on-device model and a fine-tuned LLM. It follows the principle "AI can add insight but can never alter a measurement": the LLM explains, and deterministic code measures. |
| 9 | **HealthMe** ([Devpost](https://devpost.com/software/healthme-cshbay)) / **Golden Guide** ([Devpost](https://devpost.com/software/golden-guide-ugoa6h)) | ConUHacks Dialogue + MentorMates / QHacks Best Use of Gemini | Voice agents that **place real phone calls** (Twilio plus ElevenLabs) to book clinics or reach city services. Golden Guide runs an 11-tool, 8-step Gemini function-calling loop for Kingston seniors. Phone-calling agents won several 2026 sponsor prizes. |
| 10 | **wallhacks.** ([Devpost](https://devpost.com/software/wyfyre)) / **WaterYouDoin** ([Devpost](https://devpost.com/software/wateryourdoin)) | Hack Canada **1st** / McHacks **2nd** | Counterexamples that used **no LLM at all**. wallhacks is a mmWave radar that sees through walls, displayed in augmented reality. WaterYouDoin is an extension that *blocks* low-value AI prompts. Novelty and a strong demo beat a crowd of Gemini apps. |

Also worth reading:
- **Quota** (DeltaHacks 1st): "the first linter for your budget".
- **Identity Matrix** (UofTHacks 1st): autonomous avatars that carry on after you log out. It fit the theme tightly.
- **TraceLoop** (Hack the 6ix 2nd): "Cursor for firmware". The agent loop writes code, but a deterministic trace finds the root cause.
- **Pixie** (HTN Intact + Federato): one multi-agent risk engine won two insurance prizes.
- **Bricked** (HTN finalist): a Claude planner and builder agents plus a vision critic build LEGO models, and users watch them work.
- **Callio Labs** (GenAI Genesis, Sun Life): 10 persona agents with MCP tools for PCR primer design.

### Patterns

1. **Every winner used AI, so using AI no longer distinguishes a project.** Roughly 85-95% of winners use an LLM or ML model. Gemini dominates, largely because MLH prizes push it, followed by ElevenLabs, OpenAI, Claude and Backboard.io.
   - What separated overall winners from MLH "Best Use of X" winners was **what the AI does**.
   - Top-placing agent projects **take real actions**: editing video, driving a browser or OS, making phone calls, moving servos, deploying code.
   - Summarize-this or chat-with-this projects mostly won API-usage prizes only.
   - Judges' criteria explicitly asked for more: QHacks said "look beyond basic LLM implementation", Hack Canada's AI track asked for "agentic AI architecture or fine-tuned models", and Rox and Federato asked for "validation, error handling and decisions".

2. **"The LLM proposes, deterministic code decides" is the most repeated design pattern among 2026 winners.**
   - Examples: AdLib, Dealify ("the AI picks from a menu; code writes the menu"), Pixie, WatchTower, FinRet, Praxis, TraceLoop, split, Constant., INN-SIGHT, Thornmail ("AI not the final decision maker"), One-Man-Crew (human in the loop), dill.pkl (agents only *propose* through an action registry), BizBot (won Block's "responsible use of AI" prize) and Patelloscope (Gemini limited to a fixed set of clinically accepted exercises).
   - Guardrails, approval gates, citations and audit trails show up constantly. They read as maturity to judges, especially those from sponsor companies.

3. **The best agents have one specific user and one concrete statistic.** Winners name the person:
   - stroke survivors with anomic aphasia
   - people with dysarthria
   - newcomers to Canada
   - Kingston seniors
   - air traffic controllers
   - insurance underwriters
   - Lake Erie algae managers

   Pitches open with a hard number: "35% complete PT", "1/3 of doctors wash hands properly", a 920-day speech-therapy waitlist, a speech-recognition error rate cut from 0.708 to 0.159, "4.3x speedup". **Hyper-local framing** also won: McGill Go for McGill students, 5 of 15 QHacks winners targeting Kingston, and Canada framing throughout Hack Canada. Generic "AI assistant for everyone" projects are almost absent from the winner lists.

4. **At the big "WOW factor" events, hardware wins disproportionately in the overall rankings.**
   - Hack the North: 10 of 12 finalists are physical or device-based.
   - Hack Canada: 1st is a radar rig.
   - Hack the 6ix: 1st and 3rd are hardware.
   - cuHacking: 1st is haptic VR gloves.
   - DeltaHacks: 2nd is a Raspberry Pi camera.
   - The strongest 2026 combination is **hardware plus a voice or vision agent** (Reflex, Combadge, TakeOne, DeskClaw, Praxis).
   - Pure-software agents still take the top spot where judging stresses demo, execution or completion: ConUHacks (ViniClip, Pinscher), QHacks (Orca, Atlas), GenAI Genesis (Axiom, Shipyard), Hack the 6ix 2nd (TraceLoop).
   - **Locally, nwHacks 2026 finalists and Edison 2025 finalists were all software.** Hardware at Edison 2025 won the Best Hardware, IEEE and SEE tracks instead.

5. **Winning demos are live, real-time and visual.** Examples:
   - ViniClip edits while you record.
   - Pinscher controls a Mac by gesture.
   - AdLib goes from speech to pixels in under 2 s.
   - Orca turns a hum into a song.
   - Atlas is a voice guide inside a generated 3D world.
   - Composition directs video with a phone camera.
   - Concerto turns the audience's phones into an orchestra.

   Judging criteria reward this directly: "WOW factor" (HTN), "Working Demo" and "Presentation Quality" (ConUHacks), "Pitch" (Edison). Voice is the most common interface: ElevenLabs, Gemini Live, OpenAI Realtime/GPT-Live, Vapi and Gradium appear in a large share of winners.

6. **Developer tools for AI-era developers win top prizes.**
   - Examples: Quota (DeltaHacks 1st), Axiom and Shipyard (GenAI Genesis top 2), TraceLoop (Hack the 6ix 2nd), Atlasic (nwHacks finalist), WaterYouDoin (McHacks 2nd), neoKernel, Agentigram, Janus, inferOpt.
   - "Cursor for X" or "Claude Code for X" is a common, effective one-line pitch.
   - Judges at these events are often engineers, so they understand the pain immediately (inference).

7. **Stacking prizes is normal, so pick 2-3 compatible tracks on purpose.**
   - Multi-prize winners: Project Horizon (3), Mapd (3), Track2Give (3), WingIt (3), Pixie (2), Praxis (2), and 11 projects at HTN with 2 each.
   - Sponsor briefs are narrow: lost-and-found for SAP, alert triage for D3, clinic booking for Dialogue, underwriting for Federato. Projects that fit the brief exactly took those prizes. A few overall winners also won a sponsor challenge: CyberSea for Thales, WingIt for NAV Canada, and JungleBank, built for the Desjardins brief.
   - Edison 2025 had about 20 tracks, including niche ones with very few entries (Huawei algorithms, SFU Courses API, Modern C++, Rube Goldberg).

8. **Multi-agent designs win when the roles are clear and visible**, not when the agents just chat with each other. Examples:
   - LangGraph specialist agents (Trojan, Salus, Squill)
   - planner, builder and critic (Bricked)
   - persona swarms for simulation (MarketMind, Civica, Agentropolis, Settlers of Solana)
   - an "LLM council" with a chairman model (Unbiased)

   These mostly won **sponsor or agent-framework prizes**, such as Foresters' 3+ agents, Solace Agent Mesh and openJiuwen. In the overall rankings, a single agent with tools doing a visible job usually beat a complex orchestration. The exceptions were Bricked and Settlers of Solana at HTN.

### What this implies for Edison (inference)

- **Criteria:** technical complexity, design, pitch, originality. Pitch and design are weighted explicitly, unlike nwHacks' criterion of completion only.
- **Theme:** revealed at the opening ceremony. UofTHacks and QHacks show that tying tightly to a theme wins.
- **Sponsors listed so far:** Vercel, Arc'teryx, GitHub, Transoft, Pure Buttons. MLH "Best Use of" prizes are likely (unverified), so Gemini, ElevenLabs and similar APIs are cheap extra tracks to target.
- **A profile that fits the 2026 winners:** a single, clearly scoped agent that takes real actions for a named user. It should include:
  - a live voice or visual demo
  - deterministic guardrails you can point to in the pitch
  - one hard statistic
  - optionally a small hardware element, if the team can make it reliable
  - 2-3 deliberately chosen sponsor/MLH tracks

---

## Appendix: researchers' per-group takeaways

UofTHacks 13 + DeltaHacks 12:

- **Neither event published judges' reasoning.** Any "why it won" beyond prize fit is inference.
- **UofTHacks (theme-driven, sponsor-heavy) rewarded ambitious AI and agent systems tied to the theme.** Sponsor stacking won several prizes per project.
- **DeltaHacks (impact-driven) rewarded concrete problem framing and hardware.** Its first prize went to a developer tool with a crisp one-liner.
- **Across both events, prizes went to specific users plus a strong one-sentence hook.** Examples: "linter for your budget", "Cursor for City Planning", "your avatar lives on after logout", a braille printer for under $10.
- **Voice (ElevenLabs) and multi-agent orchestration are the common patterns among 2026 winners.**

McHacks 13 + ConUHacks X:

1. For the top prizes, a **specific, relatable problem with a live "wow" moment** beats sprawling tech. McGill Go, WaterYouDoin, ViniClip, and Pinscher each fit in one sentence.
2. Agentic LLM use (tool calling, voice agents, computer use) is common among winners. At ConUHacks it reached the top 2. At McHacks it mostly won sponsor prizes.
3. Targeting 2 or 3 compatible sponsor or MLH prizes works: Bloomscroll (3rd + Gumloop), Consensus Capital (Gumloop + Auth0), HealthMe (Dialogue + MentorMates), Donair (Talsom + FRV).
4. Gemini is the most common LLM among winners at both events, largely because of MLH prizes. ElevenLabs voice is the second most common add-on.
