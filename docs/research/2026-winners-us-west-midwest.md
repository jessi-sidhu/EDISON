# What won at US West Coast, Midwest and South projects in 2026

Researched 2026-09-26 for our Edison team. Only includes events held in calendar year 2026 that have already posted winners.

**How this was done.** Six parallel research passes read each event's Devpost overview, its project gallery (winner badges), and the Devpost page of each winning project, all through WebFetch. About 390 winner pages were read in total. `curl` to devpost.com is blocked by an AWS WAF bot challenge (HTTP 403 or a 202 JS challenge), so WebFetch was the only route. WebFetch summarises pages with a small model, so exact "Built with" strings and prize amounts may be slightly paraphrased.

**Big caveat: no event published judges' comments on any project page.** The "why it won" column says "none stated" unless a README, news article or sponsor blog gave a reason. Anything we inferred is labelled as an inference.

**Devpost quirk:** a project's "Winner" line often repeats the full "1st/2nd/3rd place" prize text, so placement within a sponsor prize is often unknown. Those rows say "placement not stated".

## Coverage

| Event | Region | 2026 dates | Devpost | Submissions | Winners read |
|---|---|---|---|---|---|
| TreeHacks 2026 (Stanford) | Bay Area | Feb 14-15 | https://treehacks-2026.devpost.com/ | ~378 | all 64 |
| UC Berkeley AI Project 2026 (Cal Hacks team; the only 2026 Cal Hacks-org event so far) | Bay Area | Jun 20-21 | https://ai-project-2026.devpost.com/ | ~400 | all 54 |
| Hack for Humanity 2026 (Santa Clara U) | Bay Area | Feb 28-Mar 1 | see section | 79 | all 12 |
| CruzHacks 2026 (UCSC) | Bay Area | Jan 16-18 | see section | 88 | all 26 |
| HackDavis 2026 | NorCal | May 9-10 | https://hackdavis-2026.devpost.com/ | 139 | all 20 |
| LA Hacks 2026 (UCLA) | SoCal | Apr 24-26 | https://la-hacks-2026.devpost.com/ | 307 | 26 of ~65 (rest from gallery taglines, marked) |
| SB Hacks XII (UCSB) | SoCal | Jan 10-11 | see section | 106 | 19 |
| DiamondHacks 2026 (UCSD; there was no "SD Hacks" in 2026) | SoCal | Apr 4-5 | see section | 134 | 29 |
| IrvineHacks 2026 (UCI) | SoCal | Feb 27-Mar 1 | see section | 113 | 12 |
| HackIllinois 2026 (UIUC) | Midwest | Feb 27-Mar 1 | https://hackillinois-2026.devpost.com/ | 226 | all 33 |
| WildHacks 2026 (Northwestern) | Midwest | Apr 11-12 | see section | 68 | all 16 |
| SpartaHack 11 (MSU) | Midwest | Jan 31-Feb 1 | see section | 106 | most (about 7 tagline-only) |
| HackKU26 (Kansas) | Midwest | Apr 18-19 | see section | 87 | main ones (about 12 tagline-only) |
| Hacklytics 2026 (Georgia Tech) | South | Feb 20-22 | https://hacklytics-2026.devpost.com/ | 234 | all |
| TAMUhack 2026 (Texas A&M) | South | Jan 24-25 | https://th26.devpost.com/ | 176 | all |
| SwampHacks XI (UF) | South | Jan 23-25 | https://swamphacks-xi.devpost.com/ | 112 | all 22 |
| UGAHacks 11 (UGA) | South | Feb 6-8 | https://ugahacks-11.devpost.com/ | 151 | all 17 |
| HackRice 16 (Rice) | South | Sep 11-13 | https://hackrice-16.devpost.com/ | 119 | all 18 |

### Not covered, and why

| Event | Status |
|---|---|
| Cal Hacks 13.0 | Not held yet. Scheduled for Oct 2026 in San Francisco (Oct 23-25 per a search result, unverified). Cal Hacks 12.0 (Oct 2025) is out of scope. |
| HackGT 13 | Running now (Sep 25-27, 2026). https://hackgt13.devpost.com/project-gallery says the gallery isn't published yet. **Re-check after Sep 27**: it will be the freshest large event before Edison. |
| HackTX 26 | Not held yet (Oct 24-25, 2026). |
| RowdyHacks XII | Not held yet (Oct 3-4, 2026). RowdyHacks moved to the fall, so there was no spring 2026 edition. rowdyhacks-2026 and rowdyhacks-xii Devpost slugs both return 404. |
| MHacks 2026 | Not held yet (Oct 3-4, 2026). |
| BoilerMake XIII (Purdue) | Held Jan 23-25, 2026, but **no public winners were found**. It isn't on Devpost: boilermake-xiii, boilermake-xiii-2026 and boilermake-2026 all return 404, and the Devpost API lists editions only up to XII (2025). boilermake.org/past has no winners. Its schedule.pdf couldn't be parsed. The winners may be on Instagram or LinkedIn, which need a login. |
| SD Hacks | No 2026 edition exists. DiamondHacks is covered as the UCSD event. |
| Hack the Mountains | An India-based series; the last edition was HTM 5.0 in Sept 2024. No US event by that name and no 2026 edition were found. hackthemountain.tech returned an empty page, and dorahacks.io/project/hackthemountains6 returned HTTP 405. A similarly named event, HackTheMountain in Montréal (May 2026), has no winners list that we could find. |
| SF Hacks 2026 | https://sfhacks-2026.devpost.com/ returns 404. |
| HackMerced XI, Citrus Hack 2026 | Both happened but are small (115 and 139 participants). Skipped. |
| MadHacks, RevolutionUC | No 2026 Devpost edition found. |

### Other access problems
- live.treehacks.com: DNS failure. treehacks.com now shows 2027.
- devpost.com/software/search-history-court (probably SB Hacks' "Best Joke Hack" winner): WebFetch returned empty content twice.
- Berkeley AI Project: the descriptions of its four $5k grand-prize tracks (World/Toolbox/Lab/Playground) were never published. Our interpretations are marked unverified.

---

# Stanford: TreeHacks 2026

## TreeHacks 2026 (Stanford)

- **Devpost:** https://treehacks-2026.devpost.com/ (gallery: https://treehacks-2026.devpost.com/project-gallery, 16 pages)
- **Event site:** https://www.treehacks.com/ (now shows TreeHacks 2027, Feb 12-14 2027; it lists last year's stats: "1K+ hackers, 505 universities, 378 projects, 36 sponsors, $1M+ prizes", and eight tracks: AI, Cloud, Edge, Education, Healthcare, Flourishing, Inference, Sustainability)
- **Dates:** Feb 14-15, 2026. A 36-hour project, Friday 9:30pm to Sunday 9:30am, at Stanford's Huang Engineering Center (Stanford Daily).
- **Size:** 1,096 participants on Devpost, picked from about 15,000 applicants (Stanford Daily). About **378 submissions**, and **64 projects have winner badges** (gallery pages 1-3; badges stop at item 16 of page 3).
- **Prize pool:** Devpost lists $1,030,875+. Stanford Daily says "more than $500,000 across 14 categories".
- **Judging criteria (Stanford Daily):** "creativity, technological complexity, and social impact." Organizers said they selected hackers who showed "excitement to go out and build stuff" and had personal side projects.
- **Keynote:** Sam Altman (Stanford OSE).
- **Caveat on placements:** the Devpost "Winner" line repeats the whole prize text, e.g. "1st Place: ... 2nd Place: ... 3rd Place: ...", so it usually does **not** show which place a team got. I only give a place when it comes from a separate source (GitHub README, sponsor blog, news article). Otherwise it says "placement not stated".

### Tracks & prizes

| Prize name | Sponsor | What it asked for (Devpost summary) | Reward |
|---|---|---|---|
| Grand Prize 1st | TreeHacks | Overall | $12,000 cash |
| Grand Prize 2nd | TreeHacks | Overall | $8,000 cash |
| Grand Prize 3rd | TreeHacks | Overall | iPhone 17 Pro Max 512GB per member |
| Most Creative | TreeHacks | Creativity | Pioneer DJ DDJ-FLX4 per member |
| Most Impactful | TreeHacks | Social impact | JBL Partybox 110 per member |
| Most Technically Complex | TreeHacks | Technical achievement | DJI Flip per member |
| Best Hardware Hack | TreeHacks | Hardware | Meta Ray-Bans per member |
| Best Beginner Hack | TreeHacks | Beginner team | Flipper Zero per member |
| Artificial Intelligence Track | OpenAI | AI projects | 1st: lunch at OpenAI + 1yr ChatGPT Pro + Michelin gift card + guaranteed interview + backpack; 2nd: 1yr ChatGPT Pro + backpack; 3rd: backpack |
| Healthcare Track Grand Prize | OpenEvidence | Healthcare innovation | $4,000 each for 2 winners + interview |
| Best Use of Clinical Information | OpenEvidence | Clinical data integration | 4 Apple Watches (2 winners) |
| Human Flourishing Track | Anthropic | Projects that promote human flourishing | 1st: 4 tungsten cubes; 2nd: 1yr Claude Pro; 3rd: 6mo Claude Pro |
| Best Use of Claude Agent SDK | Anthropic | Claude Agent SDK app | $2,500 Claude API credits |
| Inference Track | Modal | Inference / serving optimization | Grand: $5K Modal credits per person + paid SF/NY office visit; Runner-up: $1K credits + AirPods |
| Sandbox Challenge | Modal | Use of Modal Sandboxes | Same structure as Inference Track |
| Sustainability: Pain Point Solution | Stanford Ecopreneurship | "Best solves the user's pain point" | $1,500 + article feature |
| Sustainability: Prototyping Process | Stanford Ecopreneurship | "Best prototyping process" | $1,500 + article feature |
| Sustainability: Broader Context | Stanford Ecopreneurship | "Best incorporation of broader context (e.g. regulatory, competitive landscape) to improve venture viability" | $1,500 |
| Build an Iconic YC Company with AI | Y Combinator | AI startup potential | 1st: guaranteed YC interview; 2nd/3rd: office hours |
| Cloud AI Track | Google | Cloud AI apps | 1st: Pixel 10 + Buds; 2nd: Pixel Tablets; 3rd: Pixel Watches |
| Edge AI Track | NVIDIA | Edge AI | 1st: DGX Spark + $450 credits + Jetson; 2nd: DGX Spark + $300 + Jetson; 3rd: $200 + Jetson; honorable mentions |
| Open Models on DGX Spark | NVIDIA | Deploy open models | Jetson Orin Nano Super |
| Education Track | Zoom | Edtech | 1st: $1,000 + Meta Ray-Bans x4 + hoodies; 2nd: AirPods x4; 3rd: Sony headphones x4 |
| Best use of Zoom APIs + Render | Zoom / Render | Zoom API + Render deploy | Bose headphones x4 + $2,000 Render credits |
| Most Likely to Become a Product | Neo | Commercial potential | Team retreat (airfare + lodging) |
| Human Capital Fellowship Prize | Human Capital | "Exceptional engineers ready to tackle massive problems" | $50K equity-free per member (up to $200K) + fellowship |
| Best Multi-turn Agent | Greylock | Multi-turn agent | Warriors courtside tickets ($10K value) + Greylock office hours |
| The Generative Edge: Future of Commerce | Visa | Commerce innovation | $10,000 total |
| Build, launch & monetise AI Agents on Agentverse | Fetch.ai | Agents on Agentverse | Best Overall $2,500; Best Multi-Agent Workflow $1,500; Best Monetised $1,000 |
| Best use of Flash | Runpod | Runpod Flash | 1st $5,090 / 2nd $4,090 / 3rd $3,090 (or credits) |
| Best end-to-end Agentic System on Elasticsearch | Elastic | Agentic system on Elasticsearch | 1st $2,000; 2nd $1,000 |
| Best Use of Cloudflare Developer Platform | Cloudflare | Cloudflare platform | 1st: $250K credits + swag; 2nd: $100K credits |
| Best Creation with HeyGen Avatar API | HeyGen | HeyGen avatars | AirPods Pro 3 x4 + Creator license + interviews |
| Build with Poke | Interaction Company of California | Poke challenges: Most Useful / Most Impressive / Most Viral | iPhone Air / iPhone 17 Pro / iPhone Air per team; bonus up to $100K |
| Best Conversation Assistant | Decagon | Conversational AI | Switch 2 bundle + internship interviews |
| Best Web Automation with Stagehand | Browserbase | Web automation | $1,000 (3 winners) |
| Best Voice AI for Healthcare | Zingage | Healthcare voice AI | AirPods Max + fast-track superday |
| Most Likely to get Acquired | Graphite | Acquisition potential | OB-4 speaker |
| Best Use of Warp Agents | Warp | Warp agents | Keychron keyboard per member |
| Best Musical Hack | Suno | Music AI | 1st: interview + 1yr Premier; 2nd: interview + 1yr Pro |
| Best AI-Powered Web Data Hack | Bright Data | Web data + AI | 1st $500 + $1.5K credits; 2nd $350 + $1K; 3rd $250 + $500 |
| Best Use of Vercel | Vercel | Deployed on Vercel | $2,000 + $2,400 Pro credits |
| Best Use of Perplexity Sonar API | Perplexity | Sonar API | $250 per member (Devpost overview); winners' pages say $500 per member + office visit; 2 winners |

### Winners

I read the Devpost page of every project in the table except ZoneZero, which has no winner badge on Devpost. "Why it won" gives only reasons stated on the page or in an outside source. Where the page only lists accomplishments or metrics, I quote those. No judge comments were published for any project.

| Place / Prize | Project (Devpost) | GitHub | What it does / who for | Built with | AI / agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **Grand Prize 1st** ($12K) + OpenEvidence Healthcare Track Grand Prize + OpenEvidence Best Use of Clinical Info | [Shepherd](https://devpost.com/software/raising-cane) | github.com/tonywangs/shepherd | Motorized smart cane that uses iPhone LiDAR and CV to physically steer blind users around obstacles, plus GPS voice navigation. For about 1.7M legally blind Americans. Claimed ~1/20 the cost of existing devices. | Swift/SwiftUI, ARKit, CoreML, Vision, DeepLabV3, Arduino, C++, FreeRTOS, BLE, Vapi, GCP | Mostly classical CV (Apple Vision person detection, DeepLabV3, HSV terrain detection). Voice guidance via Vapi. No LLM agent. | Yes: ESP32-S3, DC motor on a white cane, phone mount, battery | None stated. Page stresses <50ms end-to-end latency and a "gap-seeking" steering algorithm. Stanford Daily: "can detect obstacles and steer its user using computer vision." |
| **Grand Prize 2nd** ($8K) | [Robosurge](https://devpost.com/software/we-use-nix) | github.com/quantum9Innovation/treehacks2026 | "Cursor for surgery": one surgeon controls AI-assisted robotic arms through natural language plus a VR interface. Claims to cut the team from 10 people to 1. For surgeons and hospitals facing shortages. | agent, hardware, lean, llm, nix, python, robotics, vr | LLM fusion ("GPT-4.2" as written on page, unverified) + Gemini Robotics-ER 1.5 for visual understanding and motion. SAM + YOLOv11 segmentation. NL commands become arm actions via grounding harnesses. Lean theorem prover used heavily. | Yes: 4 magnetically controlled robot arms (12-DOF), RealSense depth camera + ArUco, Meta Quest 3, ASUS Ascent GX10 | None stated. Page: "likely one of the first times the Lean theorem prover has been used so extensively... at any project." |
| **Grand Prize 3rd** + Suno Best Musical Hack | [ChromaChord](https://devpost.com/software/chromachord) | github.com/J4Joshua/JASS-APP | Reads live MIDI and suggests next chords from 24-D chroma vectors and a harmonic graph, then generates backing tracks. For jazz musicians and improvisers. | Claude, Next.js, Perplexity, Python, Vercel | Claude Agent SDK "reasoning" layer kept separate from fast deterministic harmonic analysis. Perplexity Sonar finds songs with similar progressions. | MIDI keyboard | None stated. Designed to "feel collaborative rather than automated." |
| **Most Creative** + Neo Most Likely to Become a Product | [diffuji](https://devpost.com/software/diffuji) | github.com/alexkranias/dispo (site diffuji.com) | Instant camera that restyles photos with image-to-image diffusion and prints them on thermal sticker paper. Can also identify objects and look up prices. For general and fun audiences. | Python, Raspberry Pi | Gemini 2.5 Flash Image, OpenAI image edit, FLUX.1-Kontext-dev on a Modal H100, Perplexity for object and price lookup. Generative pipeline, not an agent. | Yes: Pi Zero 2W, ArduCam, thermal printer, rotary encoder, OLED, 18650 batteries | None stated. "We made a very sleek and functional product, which was so fun to play with." |
| **Most Impactful** + OpenAI AI Track 1st (per GitHub title) | [Mira](https://devpost.com/software/mira-w65b0a) | github.com/nathanjzhao/treehacks2026 | Voice-first eldercare assistant on Ray-Ban Meta glasses. Reconstructs the home in 3D, finds lost objects ("where are my pills?"), and alerts caregivers. For dementia and Alzheimer's patients and their caregivers. | ~35 items incl. Gemini, GPT-5-mini, Grounded-SAM-2, Grounding DINO, Depth-Anything-v2, hloc/SuperPoint/LightGlue, MapAnything, Whisper, ElevenLabs, Perplexity Sonar, Twilio, Modal, Supabase, Next.js, Kotlin | Multi-tool function-calling agent (OpenRouter). Whisper STT + TTS voice loop. Open-vocabulary detection + CLIP matching over a 3D reconstruction. Perplexity Sonar for evidence-graded medical citations. PHI de-identified before the LLM. | Yes: Ray-Ban Meta glasses + Android bridge | None stated. Page cites "end-to-end voice to 3D object localization in under ten seconds." |
| **Most Technically Complex** + Human Capital Fellowship ($50K/member) | [Freak in the Sheets](https://devpost.com/software/freak-in-the-sheets-7jl542) | github.com/kognise/freak-in-the-sheets | LLVM backend that compiles arbitrary code to Google Sheets formulas (custom ISA, 2D memory, bytecode interpreter). For compiler nerds. A pure technical stunt. | C, C++, JavaScript, LLVM | None | No | None stated. Page cites a Unicode-glyph memory-packing trick (16,666 ints per cell). |
| **Best Hardware Hack** | [Sentinel](https://devpost.com/software/sentinel-c8ki50) | github.com/apple-314/treehacks26 | Agents that autonomously write and test bare-metal embedded code on real hardware, with FPGA-based GPIO tracing for verification. Built a ~16K-line Raspberry Pi OS in 24h. For embedded developers. | arm-assembly, gcc, C, claude-agent-sdk, claude-opus, FastAPI, Next.js, React, Python, rpi-zero-w | **Hierarchical multi-agent (Claude Opus via Claude Agent SDK):** orchestrator, research agent (web search for datasheets), parallel workers. Tools: file edit, bash, grep, web search. Hardware-in-the-loop testing. | Yes: Pi Zero W + PYNQ-Z2 FPGA with custom trace IP | None stated. "16,000 lines of embedded C code in just 24 hours... tested on physical hardware without human intervention." |
| **Best Beginner Hack** | [HeartStart](https://devpost.com/software/heartstart) | github.com/nicolewongbiz/cpr-robot | Mobile robot that detects cardiac arrest from a wearable heart-rate sensor, drives to the patient, performs CPR compressions, and alerts EMS. For at-risk households. | Arduino, C, CAD, OpenCV, Python, ROS2, Twilio, HTML/CSS/JS | None (OpenCV + AprilTags, no LLM) | Yes: Arduino, Pi, Arducam, depth sensors, BLE HR wearable, 3D-printed crank | None stated. The team's LinkedIn post calls it "1 of the 6 main prizes." |
| OpenAI AI Track (placement not on Devpost) | [VisionOS](https://devpost.com/software/visionos-5euxo7) | github.com/ledaniel0/treehacks2026 | Conversational agentic OS so blind users can shop, handle medical-aware purchases, and write code by voice instead of with a linear screen reader. For visually impaired people. | agentverse, elasticsearch, electron, langgraph, perplexity, stagehand, typescript | **Multi-agent LangGraph router.** Voice agent (GPT-4.1 mini + Cartesia TTS). **Computer use** via Stagehand (browser) + Agent-S (desktop). RAG memory in Elasticsearch/Jina. Perplexity Sonar. | No | None stated. Page emphasizes co-design with visually impaired users. |
| OpenAI AI Track (placement not on Devpost) | [ContainOS](https://devpost.com/software/containos) | github.com/maanitg/containment | Physics-grounded multi-agent copilot that fuses wind, terrain, infrastructure, and population data into prioritized wildfire alerts. For incident commanders. | claude, codex, FastAPI, Gemini, GPT-4o, React 19, Leaflet, websockets, Vercel, etc. | **4 GPT-4o agents in a structured agent graph** (fire behavior, risk, notifications, recommendations). Gemini adds historical context. A **deterministic physics validation layer constrains LLM output.** | No (tablet UI) | None stated. "Iterated directly with former CalFire leadership." |
| OpenEvidence Healthcare Track Grand Prize (2 winners, with Shepherd) | [ShadowGuard](https://devpost.com/software/shadowguard-l6yv7p) | github.com/shamanthak-hegde/ShadowGuard | Network-layer AI firewall that intercepts hospital HTTP(S) traffic and redacts PHI in real time. For hospital compliance teams. | mitmproxy, Python, Node, OpenAI, Vapi, D3 | Hybrid PHI detection: regex + NER + LLM contextual classification with layered scoring for latency | No | None stated |
| Anthropic Human Flourishing (placement not stated) | [Project Lend](https://devpost.com/software/project-lend) | github.com/PranavViswanath/project-lend | Autonomous food bank. A robot arm with Claude Vision sorts donations, and agents coordinate shelters and donors. **Actually moved 100+ lbs of food to Palo Alto shelters during the weekend.** | claude-agent-sdk, claude-code, Claude vision (Haiku), fetch.ai, Poke, Python, React, Warp | Multi-agent orchestration (sorting, scheduling, donor, allocation sub-agents). Claude Vision for food ID. Email agents via Fetch.ai. Text agent for donors. | Yes: Hiwonder xArm 1S robot arm + camera | None stated. Real-world traction: 3+ shelters scheduled deliveries, $100 raised by agents. |
| Anthropic Human Flourishing (placement not stated) | [Tribune](https://devpost.com/software/tribune) | github.com/arihantjain4/Tribune (trytribune.com) | "GitHub for democracy": scrapes city council agendas, AI phone agents interview residents, and policy revisions come out as diffs with every change cited to a resident quote. For city councils and residents. | Claude, Elasticsearch, FastAPI, Gemini, Jina, Mapbox, Next.js, OpenAI Realtime, Twilio, etc. | Claude Sonnet 4.5 multi-turn research agent with 8 Elasticsearch tools. OpenAI Realtime **voice interviewer over phone**. Gemini PDF extraction. Hybrid BM25 + vector RAG. Elastic Agent Builder A2A. | No | None stated. Processed ~200 real Palo Alto policies. Citation-first design. |
| Anthropic Human Flourishing (placement not stated) + Decagon Best Conversation Assistant | [Bloom](https://devpost.com/software/bloom-dvjpea) | github.com/Kevinxygu/treehacks | Voice-first AI caretaker for seniors. Does web tasks for them (pharmacy, Uber, insurance), screens speech for cognitive decline, offers reminiscence therapy, and gives the family a dashboard. | Browserbase, Claude, ElevenLabs, FastAPI, MongoDB, Next.js, React Native, Vercel AI SDK, OpenEvidence | Claude multi-turn agent with **browser-automation tools (Stagehand)**. Speech-pattern cognitive monitoring. ElevenLabs voice. | WHOOP wearable integration | None stated |
| Modal Inference Track (README: "Won 1st place") | [Mirage](https://devpost.com/software/synsplatt) | github.com/kyan-yang/treehacks-2026 | Prompt → LLM expansion → Veo3 video → Gaussian splat 3D scenes, giving synthetic edge-case training data for robots and AVs | GPU, Modal, Python | Generative pipeline (LLM prompt expansion + Veo3 + splatting). Not agentic. | Modal H100s (cloud) | None stated |
| Modal Inference Track + Bright Data (README: 3rd place) | [ShotSpot](https://devpost.com/software/shotspot-kfvp1n) | github.com/aedutta/shot-spot-treehacks-26 | Natural-language search over video (CLIP + Whisper + OCR) that returns timestamped clips for building training datasets. For ML engineers and sports analytics. | bright-data, clip, modal, mongodb, react, whisper | Multimodal embeddings + vector search (MongoDB Atlas). Bright Data scraping. | Cloud GPU | None stated. "What took our team 2 weeks... now takes 15 minutes." |
| Modal Inference Track (placement not stated) + Zoom x Render Best Use | [jiggle wiggle](https://devpost.com/software/jiggle-wiggle) | github.com/cindyzli/jigglewiggle | Webcam movement coach comparing your pose to YouTube, Zoom, or AI-generated reference video, with voice feedback. For dance, fitness, and PT learners. | ElevenLabs, Grok/Groq, HeyGen, MediaPipe, OpenAI, Perplexity, Python, Render, TS, Zoom SDK | GPT-4o-mini voice coaching, vision scoring, HeyGen avatar video generation, in-browser MediaPipe pose | Webcam | None stated |
| Stanford Ecopreneurship: Best Prototyping Process | [GridVeda](https://devpost.com/software/gridveda) | github.com/TheRaven5520/GridVeda | Edge AI that predicts power-transformer failures at substations and explains them to operators in plain English | gpt-oss, jetson-nano, nemotron, perplexity/sonar, react, three.js, vercel | Ensemble ML (XGBoost/LightGBM/CatBoost + a 6-qubit variational quantum classifier). Nemotron Nano 4B voice/NL explanations with screen-OCR context. Sonar retrieval. | Yes: Jetson Orin Nano Super | None stated. Reports 98.09% DGA fault classification accuracy. |
| Stanford Ecopreneurship: Broader Context | [Morro](https://devpost.com/software/morro) | github.com/Thaarak/graphcast | Geoengineering "OS" that uses GraphCast/Earth2Studio forecasts to simulate cloud-seeding interventions against droughts and cyclones. For agencies and regulators. | ChatGPT, Claude Code, Earth2Studio, Gemini, GraphCast, Python, RF classifier, Vercel, Warp | Pretrained weather models + RF classifiers. LLMs only as dev tools. No agents. | No | None stated. The prize itself rewards regulatory and competitive framing. |
| Stanford Ecopreneurship (per Stanford Daily; likely Pain Point, **unverified**) | [ZoneZero](https://devpost.com/software/zonezero) | none listed | Wildfire Zone-0 compliance scans from Street View imagery, with personalized landscaping advice and an insurer dashboard | Gemini, Google Street View, Vercel | Gemini Flash 2.0 vision classification and recommendations | No | None stated. **The Devpost page shows no winner badge.** |
| YC Build an Iconic YC Company with AI + Modal Sandbox Challenge | [Mobius](https://devpost.com/software/mobius-the-first-ai-agent-to-build-a-unicorn) | none listed (mobius-logs.vercel.app) | Long-running autonomous "founder agent" that did an 11+ hour, 3,000+ turn run and shipped a payroll SaaS (Paypilot) with market research, code, legal docs, and marketing | ai, anthropic, chatgpt, claude, elastic, jina, modal, python, vercel | **Claude Agent SDK long-horizon agent** with researcher/coder subagents. Modal sandboxes for code execution. Elastic + Jina long-term memory RAG. Browser automation. | No | None stated. Page cites the run length (11+ hrs, 3,000+ turns). |
| YC Iconic Company (placement not stated; 6 teams have this badge) | [TradeProof](https://devpost.com/software/tradeproof) | github.com/Yaga-Yoink/tradeproof | Electricians photograph their work, and Claude vision + RAG over the NEC code book checks compliance and builds a verified portfolio. Adds a Quest VR training sim and an employer marketplace. | C#, Claude, ChatGPT, Unity, MetaXR/OpenXR, Next.js, Stripe, Supabase, Perplexity | Claude vision + **RAG over NEC code**, with violations mapped to code sections | Yes: Meta Quest 2 | None stated. **Strong validation: 3 paying customers at $50, 8+ customer interviews, endorsed by the author of "Code Check".** |
| YC Iconic Company | [aesthetica](https://devpost.com/software/aesthetica) | github.com/socratesosorio/aesthetica | One gesture on Meta Ray-Bans captures an outfit. Garment segmentation + reverse image search build a "taste graph" and surface products. | FastAPI, Next.js, Supabase/Postgres, Redis/Celery, TF.js (BodyPix, MoveNet) | OpenAI style analysis, embeddings, vector retrieval, SerpAPI shopping search | Yes: Meta Ray-Ban glasses | None stated |
| YC Iconic Company | [HireUp](https://devpost.com/software/hireright) | github.com/pahu2353/HireUp | Scarcity-based job applications + a two-tower recommender ("TikTok's algorithm") + an AI recruiting assistant. For startup recruiting teams. | FastAPI, numpy, OpenAI, Python, React, SQLite, TS | Two-tower embedding model. OpenAI recruiter assistant agent. | No | None stated |
| YC Iconic Company | [Zeta](https://devpost.com/software/zeta-jwq9te) | github.com/aryans-15/treehacks-2026 | "Grammarly for Math": an Overleaf Chrome extension that translates LaTeX proofs to Lean with a fine-tuned model, compiles them, and suggests fixes | AWS, FastAPI, Lean4, LoRA, Modal, PEFT, PyTorch, vLLM, W&B | **LoRA fine-tuned** LaTeX→Lean translator (Herald). LLM compile-error repair loop. vLLM serving. | No | None stated. Accuracy went from 56% to 90% on perturbed inputs; latency from 15s to 3s. |
| YC Iconic Company | [evolve(browser)](https://devpost.com/software/evolve-browser) | github.com/adeng27/evolve-browser | Chromium fork where you describe an extension in natural language and a coding agent writes and auto-loads it | FastAPI, LangChain, NVIDIA NIM/Nemotron, OpenAI GPT-5, graph-RAG, networkx, React | Coding agent (GPT-5.2 or Nemotron Super 49B). Graph-RAG over the extension code. Memory-extraction LLM. Sandboxed tool calling. | No | None stated |
| Google Cloud AI Track (placement not stated) | [Hellocare](https://devpost.com/software/hellocare) | github.com/smallboar/HelloCare | Healthcare copilot. Voice agent calls clinics to book appointments, visit audio and paperwork become structured data, and a grounded chat answers from the patient's own data. For elderly and limited-English patients. | AssemblyAI, Claude, Firebase, Next.js, OpenAI, React, Tailwind | GPT-4o vision doc scan. GPT-4o-mini structured outputs. **Vapi outbound voice agent** calls clinics. RAG grounded in the user's own data with anti-hallucination guardrails. | No | None stated |
| Google Cloud AI Track + Browserbase Stagehand | [Bye! Buy!](https://devpost.com/software/bye-buy) | github.com/jpsingaraju/bye-buy | Agents cross-list your used items on FB Marketplace and Craigslist, negotiate with buyers (hidden floor price, scam screening), and run Stripe escrow | Browserbase, Claude, FastAPI, Next.js, OpenAI, Stripe, SQLite | **3-agent system:** listing (Stagehand + Playwright/CDP), negotiation (GPT-5.2, JSON), payment (Stripe webhooks). Coordination through a DB state machine. | No | None stated. "Agents successfully pushed prices higher than initial offers in most cases." |
| NVIDIA Edge AI Track (GitHub repo description: 1st place) | [TORQ](https://devpost.com/software/torq) | github.com/bryandong24/treehacks2026 | Retrofit self-driving on a 2018 Honda Accord using a Jetson Thor, openpilot-style control, a VLA model for high-level plans, and a rideshare iOS app | C++, CUDA, Holoscan, MQTT, NVIDIA, Python, Swift, Thor | NVIDIA Alpamayo R1 10.5B vision-language-action model for plans + natural-language explanations to passengers | Yes: Jetson AGX Thor, Holoscan sensor bridge/FPGA, IMX274 cameras, comma Red Panda CAN, a real car | None stated |
| NVIDIA Edge AI Track (README: "Winner") | [Sprout](https://devpost.com/software/greenguardian-microfarm) | github.com/lethan3/cactushacks | Gantry-robot microfarm. A Jetson Nano vision model identifies plant species and health, then waters each plant accordingly. | Arduino, Claude, CUDA, Jetson Nano, Ollama, Qwen, Python | On-device vision model + Qwen via Ollama on the Jetson. No agents. | Yes: Jetson Nano, 3-axis gantry, pump, 3D prints | None stated |
| NVIDIA Edge AI Track (README: **Honourable Mention**) | [Detour](https://devpost.com/software/detour-64kpds) | github.com/keanucz/detour | On-board agents screen satellite conjunctions from live TLE data and generate avoidance maneuvers. For LEO satellite operators. | agents, cloudflare, dgx-spark, llm, nextjs, nvidia, vercel | Multi-agent workflow on Nemotron-3-Nano-30B via vLLM. **Strict tool use: the LLM hands all math to the SGP4 propagator and only interprets results.** | DGX Spark (ASUS GX10) | None stated |
| NVIDIA Edge AI Track (placement not stated) | [CalTrack](https://devpost.com/software/caltrack-i0pq3n) | github.com/alangrewco/treehacks | Wildfire disaster intelligence: population density from aggregated Wi-Fi signals, Earth-2 fire risk, and an AI voice 911 triage with agentic data extraction | Docker, Earth2Studio, FastAPI, NVIDIA, Python, PyTorch, SQLite | CrewAI multi-agent (triage, geolocation agents). Vapi voice call center. | DGX Spark | None stated |
| Zoom Education Track 1st (per UNL news) + HeyGen Best Avatar | [Minerva](https://devpost.com/software/minerva-3sj6z0) | github.com/anton-3/minerva | A HeyGen avatar tutor that joins a Zoom call and generates Manim videos, Desmos/GeoGebra visuals, and HTML demos live. For K-12 through university learners. | Claude, HeyGen, Next, React, Render, Zoom | Claude Haiku with **tool calling** (Manim video generation delegated to Claude Opus, Desmos, GeoGebra, HTML demos). Web Speech STT feeds an avatar voice. | No | None stated. Built by a tutor with 8 years' experience. "Usable out of the box." |
| Zoom Education Track (placement not stated) | [Prereq](https://devpost.com/software/prereq-sg1thw) | github.com/jasonyi33/prereq | Live lecture → per-student knowledge graph of mastery gaps. Professor gets class heatmaps. Includes a Socratic tutor and peer matching. | Claude Haiku/Sonnet, Express, Flask, Next.js, Perplexity, Postgres, Socket.io, Supabase, Zoom RTMS | Sonnet extracts the concept graph from PDFs and powers a Socratic tutoring agent. Haiku does real-time concept detection. Sonar finds resources. | No | None stated |
| Zoom Education Track (placement not stated) | [TA-DA](https://devpost.com/software/ta-da-intelligent-teaching-assistant) | github.com/pb2323/TA-da | Native Zoom app that auto-generates concept cards during a lecture and answers side-panel Q&A | Elasticsearch, fetch.ai, JS, LangChain, Python, Zoom RTMS | Fetch.ai agents with tools (query_elastic_chunks, create_concept_card). RAG over the transcript. GPT-4/xAI. | No | None stated |
| Modal Sandbox Challenge | [Monolith](https://devpost.com/software/monolith-z10684) | github.com/WingchunSiu/Monolith | Coding-agent plugin that uses Recursive Language Models to keep shared repo context across developers and sessions | Claude, Cloudflare, MCP, Modal, OpenAI, Python, uv | RLM: root LM spawns sub-LMs in Modal sandboxes over context chunks. MCP tools. | No | None stated |
| Modal Sandbox Challenge | [Longshot](https://devpost.com/software/longshot) | github.com/andrewcai8/agentswarm | Orchestrator of 100+ parallel coding agents (peak 1,200+ commits/hr) that "built Minecraft" from one prompt | chatgpt, claude, cursor, modal, pidev, poke | Planner / subplanner / worker / reconciler agent swarm (GPT-5.2, GLM-5.0, Claude SDK). Isolated sandboxes, self-healing reconciliation. | No (Modal GPUs) | None stated |
| OpenEvidence Best Use of Clinical Information | [RescueRX](https://devpost.com/software/rescuerx) | github.com/Donglomur/TreeHacks | Mines failed and shelved late-stage trials to rank drug-repurposing candidates. For pharma researchers. | knowledge-graph, machine-learning, python | 9 agents in 3 layers (KG embeddings, trial scanner, FAERS, Perplexity literature RAG, cheminformatics). **"Adversarial court" of advocate / skeptic / judge agents.** | No | None stated |
| Anthropic Best Use of Claude Agent SDK ($2,500) | [Sunday](https://devpost.com/software/sunday-94odas) | github.com/priyanshbhatter24/sunday | iMessage group-chat concierge that researches restaurants, orders via DoorDash automation, creates Partiful invites, **phones restaurants to book**, and remembers everyone's preferences | anthropic-api, browserbase/stagehand, claude-agent-sdk, next.js, partiful, perplexity, supermemory, vapi, vercel-ai-sdk | Claude Agent SDK with **17 custom MCP tools**. Browser automation. Vapi voice calls in parallel. Supermemory persistent memory. Social graph. | No | None stated. "It actually works end-to-end in iMessage." The personality made users treat it as a friend. |
| Human Capital Fellowship ($50K/member) | [Keryx](https://devpost.com/software/keryx-k49dta) | github.com/WubbLord/treehacks-26 | FPV drone footage → navigable building graph → a VLM agent answers "where's the nearest printer?" For accessibility, events, and first responders. | apple-depth-pro, drones, FastAPI, Modal, OpenCV, PyTorch, Qwen VL, vLLM, Poke, React | Qwen3-VL embodied agent traverses the graph, requesting views at poses. Poke MCP for chat. | Yes: FPV drones | None stated. "Mapped a real building during TreeHacks." |
| Human Capital Fellowship ($50K/member) | [OnTab](https://devpost.com/software/ontab) | github.com/csaye/ontab | "Cursor Tab for everything": a Chrome extension predicts your next browser action and runs it when you press Tab | Anthropic, FastAPI, HF, Modal, ONNX, OpenAI, Plasmo, PyTorch, Stagehand, WebGPU, WebLLM | Haiku 4.5 task description → Sonnet 4.5 / GPT-5-mini action JSON. **Per-user KTO fine-tuning of Qwen2.5-1.5B LoRA** from accepts and rejects. On-device WebLLM fallback. | No | None stated. Acceptance rate doubled from 26% to 52% after post-training. |
| Greylock Best Multi-turn Agent | [Edamame](https://devpost.com/software/m-4f2iwy) | github.com/angelinaquan/edamame-treehacks | AI "clones" of employees built from Slack, Drive, Gmail, GitHub, Notion, and Jira, answering with citations. For onboarding and offboarding. | GPT-5.3, Mem0, Next.js, Supabase, Slack, Notion, Octokit, Whisper, TTS | Persona agents, pgvector RAG, voice I/O, continual fact extraction, live webhook updates | No | None stated |
| Greylock Best Multi-turn Agent | [aimogus](https://devpost.com/software/aimogus) | github.com/samarth-bhargav/treehacks-amogus | Among Us simulation for LLM agents, with deception, deduction, and alignment evals plus a GRPO post-training loop with inoculation prompting | flask, modal, openrouter, python, pytorch, transformers, wandb | Multi-agent social game (Qwen 7B + GPT/Gemini/Grok). **GRPO RL fine-tuning.** Alignment benchmarks. | Modal A100s | None stated |
| Greylock Best Multi-turn Agent | [Power Lever](https://devpost.com/software/power-lever) | none listed (prod-lever.vercel.app) | Agentic inference router that picks GPU and speculative-decoding config per request ("faster / cheaper / greener") | claude, fastapi, modal, node, openai, vercel, vllm | Claude Agent SDK router agent tool-calls hardware and spec-decode settings | Modal GPUs | None stated |
| Visa Generative Edge: Future of Commerce ($10K) | [Mira Mira on Da Wall](https://devpost.com/software/mira-3xqlos) | github.com/23jmo/mirrorless | Smart two-way mirror that overlays clothes on your reflection, gives voice styling advice from shopping history and calendar, and links purchases | ElevenLabs, Firecrawl, HeyGen, MediaPipe, MCP server, OpenAI, Perplexity Sonar, Poke, SerpAPI, React | OpenAI styling agent, voice, gesture, lip-synced avatar | Yes: two-way mirror + vertical monitor + webcam | None stated |
| Fetch.ai Agentverse (sub-prize unclear) | [Voider](https://devpost.com/software/voider) | github.com/Sohamiscurious/TreeHacks2026 | Voice shopping agent that compares DoorDash, Walmart, and Amazon prices in parallel and pays via a tokenized Visa flow | claude, elastic, fetch.ai, langchain, mcp, nextjs, python | Claude tool orchestration, ElevenLabs voice, uAgents payment protocol, Elastic/Jina recommendations | No | None stated. "Voice command to verified tokenized Visa payment... under 10 seconds." |
| Fetch.ai Agentverse (Stanford Daily: "One Agent Workflow" prize) + Runpod Flash 3rd (tie, per Runpod blog) | [HackOverflow](https://devpost.com/software/hackoverflow-stack-overflow-for-ai-agents-at-projects) | github.com/vrinda-inani/treehacks26 | "Stack Overflow for AI agents": a shared memory of verified solutions, with sandbox validation and escalation to humans | Claude, Cursor, Elasticsearch, Fetch.ai, Modal, Node, RunPod, v0, Vercel | 3 uAgents (specialist, orchestrator, coordinator). Elastic/Jina RAG. Agentverse skill discovery. | No | None stated. Claims 60% faster time-to-solution. |
| Fetch.ai Agentverse (sub-prize unclear) | [AgentPlace](https://devpost.com/software/agentplace) | github.com/patidararnav/agentplace | Marketplace where client agents haggle with contractor agents over price | asi:one, fetch.ai, python, ts, uagents | 24 uAgents doing negotiation, orchestration, and matching | No | None stated |
| Fetch.ai Agentverse + Runpod Flash **1st** (per Runpod blog) | [RepoRx](https://devpost.com/software/molecule-mcbob) | github.com/ezou1/tree26 | Agent pipeline for literature → protein targets → DiffDock docking to rank FDA-approved drugs for cancer repurposing | arxiv, diffdock, docker, fetch.ai, next.js, perplexity, pubchem, rdkit, runpod | Multi-agent pipeline with JSON handoffs. Sonar Deep Research. Agentverse agent. | Runpod Blackwell GPUs | Runpod: "turning months of research into minutes of compute." |
| Runpod Flash **2nd** (per Runpod blog) | [NeuroBlocks](https://devpost.com/software/neuroblocks-cz7n9k) | github.com/tupdaily/AIPlayground | Drag-and-drop blocks to build and train real PyTorch nets. For ML beginners and students. | anthropic, claude, fastapi, google-cloud, next.js, openai, postgres, pytorch, runpod, supabase | "BlockAI" agent reasons about architecture and drags blocks onto the canvas itself | No | None stated |
| Runpod Flash 3rd (tie, per Runpod blog) | [ADapt](https://devpost.com/software/adapt-ujvn5e) | github.com/ssiddhantsood/treehacks | One master video ad → AI-localized variants per audience segment | elasticsearch, fastapi, ffmpeg, MCP, GPT-5, Whisper, Sonar, poke, runpod, react | Orchestrator + transform planner with constraint-check review loop + market-research agent | No | None stated |
| Elastic Best Agentic System on Elasticsearch | [Gallop](https://devpost.com/software/gallop) | github.com/Eth007/gallop | Multi-agent SOC platform that turns eBPF telemetry into autonomous defensive actions | codex, eBPF, Elastic, Jina, Next.js, OpenAI, Rust, React | Orchestrator via Elastic Agent Builder, OpenAI agents, vector correlation | eBPF sensors (software) | None stated |
| Elastic Best Agentic System on Elasticsearch | [CareLink](https://devpost.com/software/carelink-k1pzeh) | github.com/JoyZhuoz/carelink | Voice agent phones patients 48h after discharge, reasons about complications, and flags urgent cases on a hospital dashboard | claude-sdk, elasticsearch, elevenlabs, esql, express, perplexity-sonar, rag, react, twilio | **Claude + ElevenLabs + Twilio outbound voice agent.** RAG via Sonar + Elastic/Jina. Elastic Agent Builder chatbot. | No | None stated |
| Cloudflare Best Use of Dev Platform (1st, $250K credits) | [4sight](https://devpost.com/software/4sight-neoslb) | github.com/kl527/4sight | Smartwatch biometrics + Ray-Ban video → "decision-risk" scores that trigger autonomous interventions (screen-time limits, iMessage nudges) | bangle.js, Cloudflare Workers/D1/Durable Objects/Containers, Expo, Gemma-3-4B, GPT-4o-mini, Modal, Poke | On-device XGBoost. Gemma 3 4B VLM captioning. GPT-4o-mini decides interventions. | Yes: Bangle.js 2 watch, Meta Ray-Bans | None stated |
| Poke "Build with Poke" (challenge not stated) + Browserbase Stagehand | [Concierge](https://devpost.com/software/concierge-1tjlf5) | github.com/andaero/treehacks26 | Your Poke agent talks to the recipient's Poke agent, mines iMessage and GSuite evidence, and finds a gift with checkout links | browserbase, bun, fastmcp, next.js, openai, poke, sqlite | **Agent-to-agent collaboration.** MCP tools (iMessage SQL, Browserbase). Validation subagent loops. | No | None stated |
| Poke "Build with Poke" (challenge not stated; likely Most Viral, **unverified**) | [The Orchestration Company of Palo Alto](https://devpost.com/software/the-orchestration-company-of-palo-alto) | github.com/FO214/treehacks | Apple Vision Pro "virtual office" where each Claude Code agent sits at a desk. You supervise them as they fix code in Modal sandboxes and open PRs. | browserbase, claude, cloudflare, elevenlabs, mcp, modal, realitykit, swiftui, visionos, etc. | Claude Agent SDK multi-agent, MCP sandbox tools, Stagehand validation, voice | Yes: Apple Vision Pro | None stated. Page cites 6,200+ Twitter interactions and 13K LinkedIn impressions during the event. |
| Browserbase Best Web Automation with Stagehand | [HIVE: Swarm Intelligence](https://devpost.com/software/hive-swarm-intelligence) | github.com/bossbobster/hive | Paste a list of tasks and parallel computer-use agents do email, docs, forms, and research | browserbase, claude, fetch.ai, modal | **Computer-use agents** (Claude Opus + Stagehand) under a "queen bee" orchestrator. Self-hosted GPT-OSS-120B with speculative decoding. Learns from recorded examples. | Modal B200 | None stated. Claims 24x throughput vs HF inference. |
| Zingage Best Voice AI for Healthcare | [.dot](https://devpost.com/software/dot-bringing-humanity-to-in-home-care) | github.com/o-bm/dot | Voice companion for elderly patients over their real medical chart, with medication barcode verification, emergency call escalation, and LED feedback | Anthropic, Arduino, barcode scanner, Browserbase, Jetson Nano, OpenAI, Perplexity, React, WebSockets | OpenAI Realtime voice. Custom wake word (OpenWakeWord). Function calling for emergencies and meds. Chart in context. | Yes: Arduino LED strip, barcode reader, mic/speaker, Jetson | None stated |
| Graphite Most Likely Acquired + Vercel Best Use | [Snappier](https://devpost.com/software/snappier) | github.com/nintang/snappier-treehacks | Record a browser workflow once and AI turns the video into an automation across 100+ SaaS apps | Claude, Gemini, Whisper, Composio, Cloudflare R2, React Flow, Vercel AI SDK, Zod | Gemini 3 Pro video understanding → Haiku intent summary → Sonnet tool-use planning via Composio | No | None stated |
| Warp Best Use of Warp Agents | [Arena](https://devpost.com/software/arena-lz2m84) | github.com/TomBinford/treehacks | Spawn several Warp Oz agents on one frontend task, compare their Vercel previews, and open a PR for the best one | express, github-api, next.js, probot, vercel-api, warp-oz-agent-sdk | Parallel competing coding agents | No | None stated |
| Suno Best Musical Hack | [Maestro](https://devpost.com/software/maestro-n0uqyz) | github.com/markmusic27/treehacks | Turns a broom into a playable guitar via hand tracking. Includes an AI coach and Suno track generation. | gx10, nvidia, perplexity, qwen2.5-vl, suno, vercel | Qwen2.5-VL technique analysis + NVIDIA Music Flamingo run in parallel. MediaPipe. Suno. | Yes: ASUS GX10, iPhone, broom | None stated |
| Bright Data Best AI Web Data Hack | [NextOp](https://devpost.com/software/nextop) | github.com/cocozxu/NextOp | AI career coach translating military careers into civilian résumés, training, and benefits | anthropic-sdk, brightdata, fastapi, hume, react, sqlite | Claude streaming tool calls fill in the résumé. Hume EVI emotion-aware voice interviews. Embedding memory. | No | None stated. Cites a 2024 RAND study and real employer friction. |
| Bright Data Best AI Web Data Hack | [kiru](https://devpost.com/software/kiru) | github.com/Pranav-Karra-3301/treehacks-26 | Voice agent phones customer support and negotiates your bill down while you watch the live transcript and its reasoning | asyncio, fastapi, nextjs, node | **Real outbound phone voice agent** (Twilio, Deepgram, OpenAI/Anthropic/vLLM). Pre-call research via Perplexity + Bright Data. Kill switch. | No | None stated |
| Perplexity Best Use of Sonar | [Tonguekeeper](https://devpost.com/software/tonguekeeper) | github.com/lourdrickvalsote/tonguekeeper | Agents crawl the web to compile vocabulary and grammar for any of 5,352 endangered languages into a searchable atlas. **Solo build.** | Claude API, BrightData MCP, Browserbase, Elasticsearch, Jina, HeyGen, Next.js, Whisper, etc. | Claude Haiku/Sonnet multi-agent with manual tool loops, discovery agent, vision OCR, cross-lingual RAG | No | None stated |
| Perplexity Best Use of Sonar | [Synapse](https://devpost.com/software/a-p1lt2h) | github.com/yravipati/TreeHacks-2026 | Claim-level fact forensics: breaks content into claims, traces citation lineage, and writes nuanced corrections | Claude API, Deepgram, FastAPI, networkx, Perplexity Sonar, Semantic Scholar, React | Multi-agent search + reasoning loops, citation classification | No | None stated |

**Prizes with no winner found in the gallery:** NVIDIA Open Models on DGX Spark, Cloudflare 2nd place, and the Sustainability "Pain Point" prize (possibly ZoneZero, unverified). Placement order within the OpenAI AI Track, Anthropic Human Flourishing, Google Cloud AI, Zoom Education, and YC tracks is also not available beyond the sources cited above.

### Blocked / notes
- https://live.treehacks.com/ gave DNS failure (ENOTFOUND). https://www.treehacks.com/ now shows the 2027 edition, so no 2026 prize or judging page was available there.
- Devpost pages all loaded fine through WebFetch. The only problem is the prize-text ambiguity described above.
- The Stanford Daily and Devpost prize totals disagree ($500K+ vs $1.03M+). The Devpost figure probably counts credits and equity at face value (unverified).
- Robosurge's page names a model "GPT-4.2". Recorded as written (unverified).
- I checked winners' GitHub READMEs with curl for placement claims. Results: Mirage "1st place Modal", Detour "Honourable Mention", ShotSpot "3rd Place Bright Data", Sprout "Winner", TORQ repo description "1st Place".

### Observations
- **Big overall prizes went to physical, human-centered builds.** Grand Prize 1st (Shepherd) and every "main" category winner except Freak in the Sheets and Sentinel are tangible things for a specific vulnerable group: blind people, dementia patients, cardiac patients, surgeons. Shepherd, the #1 project, uses **no LLM at all**. It won on a sharp problem (blind navigation, 1/20 the cost), a hardware demo that works, and low latency.
- **Agents dominated the sponsor prizes, not the grand prizes.** About 45 of the 64 winners use LLM agents. The common patterns: (a) multi-agent orchestrator + specialist subagents (Sentinel, ContainOS, Project Lend, RescueRX, Longshot, Mobius); (b) **real-world phone or voice agents that call actual businesses** (kiru, Sunday, Hellocare, CareLink, Tribune); (c) browser and computer-use agents (Bye! Buy!, HIVE, VisionOS, Bloom, Snappier); (d) long-horizon autonomy shown by run stats (Mobius 3,000+ turns, Longshot 1,200 commits/hr).
- **Grounding and guardrails were a recurring differentiator:** ContainOS limits LLM output with a deterministic physics layer, Detour forces all math through SGP4 tools, Tribune requires a citation for every policy diff, and Hellocare answers only from the user's own data.
- **Real-world proof beats slides.** Project Lend delivered 100+ lbs of food to real shelters. TradeProof had 3 paying customers and 8 interviews. Tribune used ~200 real city policies. Keryx mapped a real building. ContainOS iterated with former CalFire leaders. OnTab measured 26%→52% acceptance.
- **Prize-stacking:** many winners took 2-3 prizes by genuinely using several sponsor tools (Shepherd 3, Mira 2, ShotSpot 2, Bye! Buy! 2, HackOverflow 2, RepoRx 2, Snappier 2). Winning apps often have 10-30 "Built With" entries covering sponsor APIs: Perplexity Sonar, Elastic + Jina, Browserbase/Stagehand, Modal, Vapi/ElevenLabs, Fetch.ai.
- **Healthcare and eldercare were over-represented:** Shepherd, Mira, HeartStart, ShadowGuard, Bloom, Hellocare, CareLink, .dot, RescueRX, and RepoRx. Accessibility (blind users) won both Grand Prize 1st and an OpenAI track prize.
- A pure technical stunt with no AI (Freak in the Sheets, an LLVM→Sheets compiler) still took Most Technically Complex + $50K/member. Depth of engineering is rewarded on its own.

---

# Bay Area / NorCal 2026 projects: what won

Research date: 2026-09-26. Only events held in calendar year 2026 with posted winners are covered. All project details come from each project's Devpost page (read through WebFetch) unless marked otherwise.

## Scope notes (events checked and excluded)

- **Cal Hacks 13.0**: calhacks.io lists it at the Palace of Fine Arts, San Francisco. A web search result gives the dates as Oct 23–25, 2026 (unverified; the calhacks.io fetch did not show dates, only application deadlines of Sept 13/20 with decisions Sept 25). **It has not happened yet, so it has no winners.** Cal Hacks 12.0 was in Oct 2025 and is out of scope.
- **The 2026 Cal Hacks-team event that did happen is the UC Berkeley AI Project 2026** (Projects @ Berkeley, June 20–21, 2026). It is covered below and is by far the largest in-scope event (1,097 participants, about 400 submissions).
- **SF Hacks 2026 (SFSU)**: https://sfhacks-2026.devpost.com/ returned **HTTP 404**. sfhacks.io now advertises "SF Hacks 2027". I found no 2026 Devpost, so it was not covered.
- **HackMerced XI** (Mar 5–8, 2026, UC Merced, https://hackmerced-xi.devpost.com/): only 115 participants, and the overview page did not list winners. I left it out as too small and did not read its gallery.
- **Hack for Humanity Summer 2026** (hack-for-humanity-summer-26.devpost.com): this is a separate online event, not the SCU in-person project. Not covered.
- Stanford projects other than TreeHacks: none found with 2026 Devpost winners. TreeHacks and HackDavis are excluded by instruction.

---

## UC Berkeley AI Project 2026 (Projects @ Berkeley, the Cal Hacks team)

- Devpost: https://ai-project-2026.devpost.com/ (gallery: /project-gallery, 17 pages, "24 of 400" shown on page 1, so about **400 submissions**)
- Live site: https://live.hackberkeley.org/ · Org site: https://hackberkeley.org/
- Dates and location: **June 20–21, 2026**, MLK Jr. Student Union, UC Berkeley
- Participants: **1,097**. Prize pool: **$96,700+**. College students only, ages 18+. Devpost says teams of 2–4; the live site says 1–4 (a Best Solo Hack prize exists).
- Judging: expo-style. Judges visit tables with a hard **5-minute limit** per team for demo and presentation. Criteria: impact/application, functionality/quality, creativity, technical complexity. The top 10 teams were "Finalists". Winners were announced at the closing ceremony.
- Winners are posted (54 projects carry winner badges across gallery pages 1–3). The updates page has only a generic "judges have weighed in" post with no rationale.

### Tracks & prizes

| Prize | Sponsor | What it asked for | Reward |
|---|---|---|---|
| Grand Prize: Ddoski's World Track | Projects @ Berkeley | No description published (unverified guess from the winner: real-world/social impact) | $5,000 |
| Grand Prize: Ddoski's Toolbox Track | Projects @ Berkeley | No description published (unverified guess: tools/productivity) | $5,000 |
| Grand Prize: Ddoski's Lab Track | Projects @ Berkeley | No description published (unverified guess: science/health/hardware) | $5,000 |
| Grand Prize: Ddoski's Playground Track | Projects @ Berkeley | No description published (unverified guess: games/creative/fun) | $5,000 |
| Finalist (x10) | Projects @ Berkeley | Top 10 overall | Japanese tumblers |
| Best Use of The Agentverse | Fetch.ai | An AI agent discoverable on Agentverse that understands user intent and takes meaningful action on a real-world problem | 1st $1,500, 2nd $1,000, 3rd $500, plus internship interviews |
| Best Use of Claude | Anthropic | Projects built with Claude Code that tackle meaningful issues (health, education, economic opportunity...); "aspiration and effort matter more than outcome" | $5k API credits, office hours with the Applied AI team, SF office visit |
| Using Redis Beyond Caching / Best Creativity & Originality / Best Technical Implementation | Redis | Redis (Iris) for agent memory, vector search, and context retrieval; creative real problem; quality, scalable engineering | Mac Minis, 25k Redis Cloud credits, backpacks |
| Best Compression Model | The Token Company | Token/context compression; judged on depth of research, ingenuity, creativity | 1st $2,000 + Claude Code credits + interview; 2nd $1,000 |
| Best Use of Browserbase | Browserbase | Any agent that uses the web through Browserbase (browsers, search, fetch, Stagehand, Browse CLI) | 1st $2,000; 2nd/3rd merch and credits |
| Best Use of Orkes | Orkes | Make the agent reliable in production using Agentspan | 1st $750, 2nd $250, plus interview and tour |
| Best Use of Simular | Simular | Meaningful use of Sai / SimuLang / Agent S, plus a social post | ~$500 package (x2) |
| Best Use of QNX | QNX | Product runs on QNX OS in a "cannot-fail" embedded, real-time application with AI | $1,000 + 2 x $250 |
| Best Use of Arize | Arize | Evidence that Arize was used and actually improved the app | $1,000 gift cards |
| Best Use of Deepgram | Deepgram | Most creative, well-executed voice experience | 4x Nintendo Switch 2 |
| Best Use of Sentry API | Sentry | Strong technical execution with observability and error monitoring | 4x Switch 2 + interviews |
| Most Creative Use of Pika | Pika | Creative use of Pika MCP and AI workflows | $500 / $300 / $200 + credits |
| Best Use of Cognition | Cognition | Most interesting and technically impressive project built with Devin | Sunset cruise + $500 Devin credits (x3) |
| Best use of Band (agent-to-agent comms) | Band | At least 2 agents collaborating through Band as a key technology | $1,000 Amazon gift cards |
| Best Physical AI Hack | UFB | Code that closes the loop with a real or simulated robot, or evaluates the data and worlds that train one | $1,500 / $1,000 / $500 + invitation to perform at a June 26 SF show |
| Best Use of Cognichip | Cognichip | Solve a real chip-design problem | Tiny Tapeout credits |
| Best Use of Terac | Terac | Build an annotation app, collect human labels through Terac *during the event*, fine-tune a model, and show improvement | $1,000 / $400 |
| Best Use of TokenRouter | PaleBlueDot AI | Use TokenRouter (LLM routing) | $1,000 / $500 / $300 credits |
| SkyDeck Grand Prize | Berkeley SkyDeck | Startup potential | Guaranteed admission to Pad-13 incubator |
| Best UI/UX, Best Solo, Most Technical, Most Berkeley, Best Beginner, Hacker's Choice | Projects @ Berkeley | As named | Hardware prizes (camera, projector, 3D printer, etc.) |
| Best Use of ArmorIQ (secure agents) | ArmorIQ | Secure agents built on ArmorIQ | Nintendo Switch |

### Winners

The "Why it won" column records only reasons stated on the pages. None of the pages include judge comments, so most rows say "none stated".

| Place/Prize | Project | GitHub | What it does / who for | Built with (key) | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **Grand Prize: World Track** + Finalist | [Lucid Voice](https://devpost.com/software/lucid-voice) | github.com/dbhargav-uw/Lucid-Voice | Turns 2–3 tapped words into a full sentence spoken in a clone of the user's own voice. For people who can't speak (ALS, stroke, CP, aphasia, autism) | MLX, Gemma, Kuzu graph, Coqui XTTS, Faster-Whisper, Redis, Deepgram, FastAPI, React, Arize Phoenix, Claude (Code) | Fully **on-device/offline** LLM (Gemma via MLX) + voice cloning + Whisper STT; **personal knowledge-graph hybrid retrieval (RAG)**; style model trained with an RLHF-like preference setup | Apple Silicon laptop (no custom HW) | none stated |
| **Grand Prize: Toolbox Track** (Finalist per gallery order, unverified) | [IronBook](https://devpost.com/software/ironbook) | none listed | Photos of machines become a 3D Gaussian-splat scene plus an AI guide that answers questions by *flying the camera* to the relevant part. For manufacturing trainees learning from retiring experts | React/WebGL2, FastAPI, COLMAP, msplat, MLX, depth-anything, Claude, Deepgram, MongoDB, Sentry, Langfuse | **Claude vision** on the current 3D view + **structured-output tool actions** (fly_to, look_at, highlight, zoom; "MCP-style action protocol"); Deepgram voice input | Apple Silicon/Metal (no custom HW) | none stated |
| **Grand Prize: Lab Track** + Finalist + **SkyDeck Grand Prize** | [Theracat](https://devpost.com/software/theracat) | github.com/emilyLi2020/Theracat | Wristband detects rising anxiety from motion, delivers paced-breathing haptics, and a plush cat talks you through grounding. For people with anxiety/panic | ESP32, MPU6050, Arduino, BLE, ElevenLabs, Claude, Python | Claude for conversation logic and **safety screening** (routes risk language to 988); ElevenLabs voice; no agents | **Yes** (wearable + animated plush with servos) | none stated |
| **Grand Prize: Playground Track** + Finalist + **Best UI/UX** | [Paper Cuts](https://devpost.com/software/paper-cuts) | github.com/Jeremyliu-621/paper-cuts | Draw game pieces on an iPad; they are recognized, turned into sprites, composed into a playable multiplayer game with phones as controllers. For kids/young creators | Custom CNN, VLM, SD1.5/SDXL, InstructPix2Pix, LoRA, Redis vector search, AWS Trainium, tldraw, fal.ai, Pika | **Vision** recognition stack + **RAG-style recognition** over doodle embeddings + **fine-tuned** InstructPix2Pix/LoRA; neuro-symbolic "safe-by-construction" mechanics. No LLM agents | Yes (iPad, phones, projector) | none stated |
| Finalist + **Hacker's Choice** | [Inspector](https://devpost.com/software/inspector-23ser6) | github.com/wlu03/LoopBack | QA agent that lets coding agents (Claude Code/Cursor/Devin) test the apps they build. For dev teams using AI coding agents | FastMCP, Claude API, E2B Desktop, OmniParser (YOLOv8 + Florence-2), Next.js | **Multi-agent computer use**: parallel region-based agents drive the UI from screenshots; MCP tools launch_app/observe/act/verify | No | none stated |
| Finalist | [FirstResponder-Relay](https://devpost.com/software/firstresponder-relay) | none (demo on Vercel) | Triages 911 overflow calls in 13+ languages during wildfires, with live two-way translation. For dispatch centers | Claude Sonnet 4.6, Deepgram Nova-3/Aura-2, Mapbox, Redis, Shapely, Arize AX, Next.js | **Voice agent** (STT/TTS) + Claude urgency classification and extraction + **tool calling** (geocoding, wildfire-perimeter check); traces in Arize | No | none stated |
| Finalist | [Sentinel](https://devpost.com/software/sentinel-poyh3v) | github.com/sudarshan-krishnan/Sentinel_AIProject_Berkley_2026 | "AI security engineer": scans your app, proves vulnerabilities with real attack simulations, ships fixes. For vibe-coders/indie devs | Browserbase, Fetch.ai, Redis, Sentry, Next.js, CF Workers, Claude + OpenAI | **Multi-agent** (coordinator + secrets/auth/injection/rate-limit/supply-chain agents) + **browser automation** to validate exploits + LLM patch generation | No | none stated |
| Finalist | [StudForge](https://devpost.com/software/studforge) | github.com/kokonut121/studsim | Natural-language prompt becomes a physics-validated swarm-robotics simulation world | Claude, Redis, PyTorch, FastAPI, Deepgram, Midjourney | Claude schema-constrained generation; 3 observer **agents** with Redis memory; Deepgram voice; **LoRA fine-tuned** Qwen2.5-1.5B; "generative models strictly advisory, validation gates everything" | No (sim) | none stated |
| Finalist | [Percept](https://devpost.com/software/cerebra-diqop9) | github.com/edrlu/Percept.git | Generates short-form video ads for small businesses and improves them in a loop using predicted brain engagement | Claude, Pika (MCP), Meta TRIBE v2, Redis, YOLO, OpenCV, Supabase | **Agent loop**: LLM changes one creative lever per iteration based on TRIBE v2 scores; Pika MCP tool calls; Redis memory | No | Page stresses a closed "generate, measure, change, rerun" loop (self-described) |
| Finalist | [SnapCycle](https://devpost.com/software/rrr-s98zwc) | github.com/prithsk/RRR | Snap a photo of a bulky item and get the best local disposal option, then it acts (forms, calls, hauler bids). For college students | Gemini 2.5 Flash, Browserbase, Twilio, Arize, Sentry | **Vision** + 3-stage **multi-agent** (browsing agent, retrieval agent, action agent) + **RAG** vector store + web-form automation | No | Self-described: "helping users actually follow through" (action, not just info) |
| Fetch.ai Agentverse (placement unclear; Devpost shows 10 winners for this prize) | [Constructa](https://devpost.com/software/constructa) (also **Browserbase**) | github.com/vynx1/Constructa | Evaluates buildable land, renders 3D models from NL, and auto-fills permits. For contractors/architects | Fetch.ai ASI:One, 6 Agentverse agents, Browserbase, Redis, Three.js, Playwright, Arize | **Multi-agent** consensus with tiered fallbacks; web-scraping agent; document generation | No | none stated |
| Fetch.ai Agentverse | [Quorum](https://devpost.com/software/quoram) | github.com/mohiitt/Quorum | Validation middleware that stops hallucinations cascading through multi-agent pipelines (3 validators vote) | uAgents, Browserbase, Redis, Claude, FastAPI | **Multi-agent** consensus; Browserbase live fact-check; deployed on Agentverse with ASI:One chat | No | none stated |
| Fetch.ai Agentverse | [LifeLink](https://devpost.com/software/lifelink-soibwr) | none listed | Clinicians request blood in plain English; agents find, allocate, pay for, and track delivery | uAgents, Agentverse, ASI:One, Stripe, MongoDB, Pydantic AI, MCP | **Multi-agent** (hospital/discovery/center/donor/payment/courier) with an orchestrator | No | none stated |
| Fetch.ai Agentverse | [AeroFreight AI](https://devpost.com/software/aerofreight-ai) | github.com/aniketggg/AeroFreight-AI | Plans international shipments (routing, cost, payment) for US importers | uAgents, ASI-One, Claude, Stripe, GCP | 4-agent hub-and-spoke, typed schemas, human-in-loop approval | No | none stated |
| Fetch.ai Agentverse | [Fetch Health](https://devpost.com/software/fetch-health) | github.com/abhinavprkash/Fetch-Health | Organ-transplant donor/recipient matching sim with explainable scoring. For hospital staff (educational) | Claude, Fetch.ai, Deepgram, Redis, Sentry | Orchestrator plus specialist agents (docs/images/video), vision, Redis memory, voice debrief | Local HPC | none stated |
| Fetch.ai Agentverse | [baymax](https://devpost.com/software/baymax-1wumi3) | github.com/apollo-ullah/Baymax | Hospital agents predict shortages (weather/disease data) and negotiate supply transfers | uAgents, Claude Haiku/Sonnet, Redis, Arize Phoenix, OpenCV | Agent-per-hospital **autonomous negotiation**; Claude vision for inventory | No | none stated |
| Fetch.ai Agentverse | [AgriBroker](https://devpost.com/software/agribroker) | github.com/Ai-Project-2026-Berk/AgriBroker | Buyers request produce in NL; agents optimize across farmers and pay | uAgents, ASI, Stripe | Orchestrator/registry/farmer agents + deterministic optimizer | No | none stated |
| Fetch.ai Agentverse | [CareLoop](https://devpost.com/software/careloop-gsiy8w) | github.com/VishalDani1602/AIHACK26 | Voice-first healthcare concierge: triage, find providers, estimate cost, book | uAgents, ASI:One, Deepgram, Redis, Stripe, NPPES data | Voice + specialist agents (triage/search/cost/scheduling/payment) | No | none stated |
| Fetch.ai Agentverse + **QNX** | [Vanguard Telematics](https://devpost.com/software/vanguard-telematics) | github.com/bencejdanko/VanguardTelematics | Crash detection for fire trucks and first-responder vehicles, with auto-written incident reports | Raspberry Pi 5, QNX, STM32 Nucleo sensors, uAgents, OpenAI, Deepgram, Three.js | Sensor anomaly agent pipeline + LLM-grounded incident synthesis | **Yes** | none stated |
| Fetch.ai Agentverse | [FireflAI](https://devpost.com/software/fireflai) | github.com/Hrishikesh-Athreya/fireflai | Turns listing photos + 911 text into a hazard-annotated 3D building model with escape routes, for firefighters | Fetch.ai, Groq Llama 4 Scout, World Labs Marble, Browserbase, Deepgram, Arize | 6 stage agents + coordinator; **vision**; **LLM-as-judge** safety eval | No | none stated |
| **Best Use of Claude** (Anthropic) | [SafeStreets](https://devpost.com/software/safestreets-h6yprx) | none listed | Finds street hazards in Street View/satellite imagery, corroborates with crash data and 311 complaints, proposes fixes plus grant/funding info for city officials | Claude Haiku (vision), Claude Code, Browserbase, uAgents, Mapbox, Redis, Imagen-4 | Two-stage **vision** (blind analysis, then corroboration) + parallel data-gathering agents | No | none stated |
| **Redis** (Beyond Caching / Creativity / Tech Impl.) | [Forge](https://devpost.com/software/forge-z8v4qm) | github.com/arjvnv/forge | Safety-net clinics build operational tools from plain language, no engineers needed | Claude Opus 4 + Sonnet 4.6, RedisVL/JSON/Streams, Postgres, OpenAI embeddings, Synthea, Arize | **Code synthesis** with semantic routing (RAG over prior capabilities), AST check + sandbox + human approval gate | No | none stated |
| Token Company (compression) | [Accordion](https://devpost.com/software/accordion-jwarge) | github.com/a-Fig/Accordion-AI-hackBerkeley | Reversible context folding for AI coding agents | Claude, Qwen2.5-0.5B, Rust/Tauri, SvelteKit | Agent **tool call** to "unfold" compressed blocks; small-model relevance scoring | No | none stated |
| Token Company (compression) | [Re:Compress](https://devpost.com/software/re-compress) | github.com/Kart-ing/ReCompress | Query-aware rewriting compression for long context | Qwen2.5-1.5B LoRA, Unsloth, Modal H100, DeepSeek teacher | **Fine-tuning/distillation**; benchmarked on HotpotQA etc. | H100 (cloud) | none stated |
| Browserbase | [Narcore](https://devpost.com/software/narcore) | github.com/cibarbia05/narcore | Detects drug ads on social media for law enforcement; can pose as a buyer | Browserbase, Stagehand, Llama, Nomic, Redis Stack | Browser agents scraping + slang-drift embeddings + agentic outreach | No | none stated |
| Browserbase | [Traide](https://devpost.com/software/traid-h6db5a) | github.com/rishabhroyy/traide | Text a photo and a price range; the agent lists, prices, and negotiates across marketplaces | Claude, Browserbase/Stagehand, Orkes, Poke, Redis(VL) | **Computer use** (real browsers) + Claude orchestration via Orkes + vision | No | none stated |
| Orkes + TokenRouter | [Pulse AI](https://devpost.com/software/pulse-ai-ub9lxt) | github.com/2006-sk/AIhack | Connects patients with verified people who had the same procedure (no AI guessing) | Agentspan/Orkes, Claude, TokenRouter, Terac, Arize Phoenix | Tool-calling durable workflow; LLM routing; tracing to catch misattribution | No | none stated |
| Orkes | [BrailleAI](https://devpost.com/software/brailleai-a-two-way-voice-for-the-deafblind) | github.com/lili1501/Refreshable_Braille_Display | Low-cost refreshable Braille device for two-way DeafBlind conversation | ESP32-S3, RPi + QNX, Claude, Deepgram, Devin, Sai, Orkes | Voice STT/TTS + Claude summarizing; Devin/Sai used as dev agents | **Yes** | none stated |
| Simular | [Tendly](https://devpost.com/software/tendly-smolpq) | none listed | One button lets elderly patients voice needs; Claude triages to a caregiver dashboard | Claude, Deepgram, Simular, Redis, Next.js, Electron | Voice + structured triage; Claude generates Simular desktop automations | No | none stated |
| Simular | [STING](https://devpost.com/software/sting-bfqvia) | github.com/billionairebumblebee/cloak-sting-project-2026 | Browser extension guarding elderly users against scams/phishing | Claude, Chrome ext, Browserbase, Deepgram, Fetch.ai, Arize, Sentry, Simular | Deterministic signals + LLM explanations; multi-agent via ASI:One | No | none stated |
| QNX | [SafeTank](https://devpost.com/software/safetank) | none listed | Predictive maintenance for chemical storage tanks | C++, Python, RPi + gas/temp/vibration sensors | On-device ML (no LLM details) | **Yes** | none stated |
| QNX + Pika | [MOGGIE](https://devpost.com/software/moggie) | github.com/BeanyZoldyck/moggie | CV-driven party-game arcade kiosk | RPi 5 + QNX, MediaPipe, OpenCV, Pika | Vision (pose/face); LLMs used only as dev tools | **Yes** | none stated |
| Arize | [JUGAAD](https://devpost.com/software/jugaad-dpmqi7) | github.com/nergisRahimzade/jugaad | Guides Berkeley students to food/housing/aid resources | Claude, Fetch.ai (5 agents), Browserbase, Redis, Deepgram, Arize | Multi-agent + voice + RAG + live browsing + **LLM-as-judge** eval | No | none stated |
| Deepgram | [Aside.ai](https://devpost.com/software/aside-ai) | github.com/Da0t/AsideAI | Wearable camera narrates your day aloud in chosen personalities | RPi + camera, Claude Haiku 4.5 vision, Deepgram, Redis | Vision + TTS, single call for detection and narration | **Yes** | none stated |
| Sentry | [Canary](https://devpost.com/software/agi-14q6d3) | github.com/vikashftw/Canary | Autonomous agent finds silent bugs, fixes them, writes regression tests | Claude, Sentry, Browserbase, Playwright, Redis | **Computer-use** agent + Sentry traces as an oracle | No | none stated |
| Pika | [RESELLER.](https://devpost.com/software/reseller-mkjlfg) | none listed | Photo in; agents price, list, and post to 6 marketplaces and negotiate | GPT-4o, Browserbase, Stagehand, Pika | 3 agents (Researcher/Studio/Closer), **computer use**, vision | No | none stated |
| Pika | [Senya](https://devpost.com/software/senya) | github.com/Deeksha-Vaidyanathan/senya | Songs turned into ASL music videos for Deaf/HoH | Claude Sonnet 4.6, Whisper, Pika API, Lifeprint | LLM translation to ASL gloss + video generation pipeline | No | none stated |
| Cognition (Devin) | [BrowserDelta](https://devpost.com/software/browserdelta) | github.com/jaykbpark/browser-use-compaction-co | Cuts browser-agent context ~78% while matching the vision baseline | Playwright, Browserbase, GPT-4.1-mini, OCR, BrowserGym/MiniWoB++ | Computer-use context compression (DOM/pixel diffs) | No | none stated |
| Cognition | [Refactorika](https://devpost.com/software/refactorika) | github.com/Tanush-A/Refactorika | Agentic refactoring harness with deterministic tools and verify gates | Claude, FastMCP (12 tools), LibCST, pyright, pytest, Redis | MCP **tool calling**, state machine, hybrid RAG, bounded repair loop | No | none stated |
| Cognition | [AlphaResearch](https://devpost.com/software/alpharesearch-9fwk4m) | github.com/JasonLai150/AlphaResearch | Recursive sandboxed agents for autonomous research | Claude (Code harness), Modal, Browserbase, Redis, Sentry | PI agent plus researcher sub-agents in sandboxes | Cloud compute | none stated |
| Band (agent-to-agent) | [Triage](https://devpost.com/software/triage-y10mpq) | github.com/HansChundekad/Triage | GitHub issue URL in, confirmed bug reproduction out | Claude, Band, Browserbase, Stagehand, Arize | 3 agents over Band + computer use + screenshots | No | none stated |
| UFB Physical AI | [Omniscient](https://devpost.com/software/ribbit-rtnfvg) | github.com/matthehzhang/hackcal | VLM supervises robot fleets; hand-tracking teleop takeover | Claude structured output, LeRobot, ACT, MediaPipe, ESP32 | VLM watchdog, two-tier models | **Yes** (custom 5-servo hand) | none stated |
| UFB Physical AI | [AxisGen](https://devpost.com/software/axisgen) | none listed | One robot-task prompt expanded into diverse sim-ready scenarios | Isaac Lab, LeRobot, Nebius, LLM | LLM prompt expansion | No | none stated |
| UFB Physical AI | [Robo Jab](https://devpost.com/software/robo-jab) | github.com/abtonmoy/ai_project_calhacks | Phone video of a jab retargeted to a Unitree G1 humanoid, with a trained policy | YOLOv8, ViTPose, HMR2, GVHMR, Isaac Lab, MuJoCo | Vision mocap + RL/MLP policy (no LLM) | **Yes** | none stated |
| Cognichip | [SiliconYOLO](https://devpost.com/software/assistantai) | github.com/kejiwuxian/SiliconYOLO | Fixed-weight YOLOv10n chip, 26x more energy-efficient | SystemVerilog, Vivado FPGA, Claude Code, Cognichip, Sai | Sai orchestrating 2 coding agents | **Yes** (FPGA) | none stated |
| Terac | [MatchVision](https://devpost.com/software/match-vision) | github.com/bbioren/match-vision | Audio descriptions and voice Q&A of live soccer for blind fans | Claude, Deepgram, MCP, Terac, WebGazer | VLM fine-tuned on gaze/annotation data; voice Q&A | Webcam | none stated |
| Terac | [Captain Ddoski](https://devpost.com/software/captain-ddoski) | none listed | Source-trust scores for AI finance agents via API/MCP | Claude, Firecrawl, MCP, Terac, Arize | Exposes an MCP tool for other agents | No | none stated |
| TokenRouter | [311.ai](https://devpost.com/software/311-ai) | none listed | Voice 311 non-emergency call to dispatched work order in under 60s | Band, Deepgram, Browserbase, Redis, Arize, Mapbox | Voice + multi-agent + tool calling (permit filing) | No | none stated |
| TokenRouter | [Retention](https://devpost.com/software/retention) | none listed | Optimizes educational videos using Meta's TRIBE v2 brain model | Claude, TokenRouter, Pika, Deepgram, Band | Generator/evaluator agent loop | A100 (cloud) | none stated |
| Best Solo Hack | [ImmunoVerse](https://devpost.com/software/immunoverse-composable-in-silico-gene-therapy-screening) | github.com/Gr1nx-bitbit/ai_project_2026 | In-silico gene-therapy immunogenicity screening | uAgents/Agentverse, LangGraph, ESMFold, NetMHCpan, Claude | 7 specialist agents calling bio tools | No | none stated |
| Most Technical Hack | [Workbench](https://devpost.com/software/workbench-107jf2) | none listed | Cancer researchers predict drug response from tumor mutations | Claude, Codex, GraphRAG, Neo4j | **GraphRAG**, NL-to-Cypher tool calling, ML classifier; flags confirmed vs. predicted | No | none stated |
| Most Berkeley Hack | [Fizz Buzz](https://devpost.com/software/fizz-buzz) | none listed | Roommate-confrontation RPG to practice hard talks | Gemini, Deepgram | Voice conversation | No | none stated |
| Best Beginner Hack | [MarketVerse](https://devpost.com/software/marketverse-zgjmlv) | github.com/dhruvac29/marketverse | Simulates 24 months of startup market in 60s | Claude Sonnet/Haiku/Opus | Simulated persona agents | No | none stated |
| ArmorIQ (secure agents) | [Aegis](https://devpost.com/software/aegis-jtde8o) | github.com/ARP-source/aegis-dispatch | 911 dispatch copilot: transcribe, translate, protocol-ground | Claude, Deepgram, ElevenLabs, ArmorIQ, Redis | Multi-agent hierarchy, tool calling, voice, RAG | No | none stated |

### Observations

- **The four $5k grand prizes did not go to "agent platforms".** They went to specific human problems with a vivid demo: a voice for people who can't speak (Lucid Voice), knowledge transfer from retiring machinists (IronBook), anxiety intervention in a physical plush plus wristband (Theracat), and kids drawing playable games (Paper Cuts). Two of the four have custom hardware. All four have deep ML/infra underneath (on-device models, 3D splats, fine-tuning), not just an API call.
- **The agentic winners are agents that act on real software or the real world:** computer-use QA (Inspector, Canary, Triage), browser agents that sell or scrape (Traide, RESELLER., Narcore), and voice agents for emergencies (FirstResponder-Relay, Aegis, 311.ai). The pattern is a closed loop with verification: validation gates, LLM-as-judge, sandbox + approval, observability traces.
- **Sponsor-prize stacking is common.** Most winners list 4–8 sponsor tools (Redis + Deepgram + Arize + Browserbase + Fetch.ai). Fetch.ai's prize had about 10 badge winners, all multi-agent uAgents/ASI:One systems in health/logistics/civic domains.
- **Recurring domains:** healthcare/accessibility (Lucid Voice, BrailleAI, Senya, MatchVision, Tendly, CareLoop), emergency response/wildfire (FirstResponder-Relay, FireflAI, Aegis, Vanguard), and dev tooling for coding agents (Inspector, Canary, Accordion, Refactorika).
- No page contained judge comments. The judging format was a 5-minute table demo, so demo clarity mattered.

---

## Hack for Humanity 2026 (Santa Clara University, 13th annual social-good project)

- Devpost: https://hack-for-humanity-2026.devpost.com/ (gallery shows **79 projects**)
- Dates and location: **Feb 28 – Mar 1, 2026**, Heafey Hall, Santa Clara University
- Participants: **490**. Prize pool: $13,000+. College students, teams of 2–6.
- Theme: social good. Heavy presence of the ElevenLabs and AMD sponsors.

### Tracks & prizes

| Prize | Sponsor | What it asked for | Reward |
|---|---|---|---|
| 1st Place Overall | SCU / event | Best overall social-good hack | $2,250 + 3 mo ElevenLabs Pro |
| 2nd Place Overall | event | | $1,750 + ElevenLabs Pro |
| 3rd Place Overall | event | | $1,500 + ElevenLabs Pro |
| Best Use of WebSpatial | WebSpatial | Spatial web apps with the WebSpatial SDK | $1,000 |
| Future Unicorn Award | event | Most likely to become a startup | $1,000 |
| Best Use of AMD Tech | AMD | Use AMD hardware/cloud (e.g., MI300X) | $1,000 |
| Best Use of ElevenLabs | ElevenLabs | Voice AI | 6 mo Scale tier |
| Best Use of Responsible AI | event | Responsible AI | $750 |
| Best Graduate Hack | event | Grad-student team | $1,000 |
| Best Hack by Womxn in Tech | event | | $1,000 |
| Best Freshmen Hack | event | | $1,000 |
| Best in Play: Top Game | event | Game | $750 |

### Winners

| Place/Prize | Project | GitHub | What it does / who for | Built with | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **1st Overall** | [Savebox](https://devpost.com/software/mango-breaker) | github.com/j-his/smart_breaker | AI-enabled smart breaker box to plan, manage, and control household energy use (carbon/price-aware scheduling). For households | ESP32-S3, e-ink, current sensors, relays, PyTorch, FastAPI, Swift, OR-Tools, Groq, ElevenLabs | **Custom Temporal Fusion Transformer** (5.2M params) for load forecasting and appliance ID; CP-SAT optimizer; LLM (Groq) explains schedules; ElevenLabs narration. Not agentic | **Yes** (custom hardware + 3D-printed enclosure) | none stated |
| **2nd Overall** | [TriageAI](https://devpost.com/software/triageai-l14ney) | github.com/Lucalini/scuproject- | Offline handheld injury-triage device for untrained disaster responders | Raspberry Pi + AI HAT+ 2 (Hailo NPU), Qwen2-VL, picamera2, temp sensor, FastAPI | **Edge VLM** (vision injury classification + follow-up chat), fully offline | **Yes** | none stated |
| **3rd Overall** | [BlindSpot](https://devpost.com/software/navision) | github.com/Victor-JB/H4H2026 | Affordable navigation aid for blind users | ESP32 cam, mic/speaker, React Native, YOLOv8, ElevenLabs | Vision object detection + TTS | **Yes** | none stated |
| Best Use of WebSpatial | [Luminary](https://devpost.com/software/luminary-o35zs4) | github.com/ImpeccableJosh/luminary | Spatial AI tutor with a 3D teacher avatar and Manim lessons | WebSpatial, Gemini, ElevenLabs, Manim, Three.js, AMD MI300X | LLM lesson generation + voice + animation | Vision Pro | none stated |
| Future Unicorn | [FormWhisper](https://devpost.com/software/formwhisper) | github.com/Anmol-tech/FormWhisper | Elderly users fill government PDFs by voice conversation | Qwen2.5-VL-32B on AMD, Whisper, ElevenLabs, FastAPI, React | VLM extracts form fields, then a voice Q&A loop fills them | AMD cloud GPU | none stated |
| Best Use of AMD | [Prism](https://devpost.com/software/prism-3q067k) | github.com/sssynk/h4h-ar | Vision-assisted navigation for visually impaired users on Meta Ray-Ban glasses | YOLO, Qwen via vLLM on AMD, Swift, ElevenLabs | Vision + VLM + TTS | **Yes** (Meta Ray-Bans) | none stated |
| Best Use of ElevenLabs | [CRIS.ai](https://devpost.com/software/cris-ai) | github.com/Yuvraajb/H4H-2026 | Spatial voice + AR assistant guiding bystanders through emergencies | Llama 4 Scout (Groq), ElevenLabs, Whisper, Apple Vision, RealityKit | Voice agent + pose vision + LLM step-by-step guidance | visionOS/iOS | none stated |
| Best Responsible AI | [GovPolicy Hub](https://devpost.com/software/affordable-housing-visibility) | github.com/kirbb3/H4H-2026---team-Baka | Surfaces affordable-housing programs filtered by eligibility | React, Firebase, MongoDB, Python | AI organizes scraped program data | No | none stated |
| Best Graduate Hack | [FireProof](https://devpost.com/software/fire-proof) | github.com/Tian-Tan/fire-proof | Voice-first wildfire evacuation routing | NASA FIRMS, OpenRouteService, pgVector, vLLM on AMD, ElevenLabs | **RAG** over vetted safety docs + voice | No | none stated |
| Best Womxn in Tech | [Amber](https://devpost.com/software/amber-b8n0xw) | github.com/cheesken/Amber | DV survivors secretly document evidence inside a fake meditation timer; AI legal gap analysis | LangGraph, Reka, Groq, Twilio, Supabase, React Native | **4-agent LangGraph** (ingest/analysis/legal/watchdog), vision, voice calls | No | none stated |
| Best Freshmen Hack | [Compass](https://devpost.com/software/compass-1isend) | github.com/cyoungie/compass | AI life coach for foster youth aging out of care | Claude API, SwiftUI, Firebase, Google Maps | Conversational LLM with memory | No | none stated |
| Best in Play: Top Game | [MindGarden](https://devpost.com/software/mindgarden-l7d2ac) | github.com/LaurenKimura/HackForHumanity | Focus timer that grows a garden | React, Firebase | None | No | none stated |

### Observations

- **All top 3 overall are physical hardware with on-device or edge AI** (smart breaker box with a custom forecasting model, offline Pi triage device with a VLM, ESP32 navigation aid). None is an LLM agent. At this social-good event, tangible and specific human impact beat agent sophistication.
- The only true multi-agent winner is Amber (LangGraph, 4 agents), which won a demographic prize, not an overall place.
- Voice (ElevenLabs) appears in about 7 of 12 winners. It was a sponsor and was bundled into the top prizes.

---

## CruzHacks 2026 (UC Santa Cruz)

- Devpost: https://cruzhacks--2026.devpost.com/ (note the double hyphen; **88 projects**). Site: https://cruzhacks.com/. News: https://engineering.ucsc.edu/news/cruzhacks-2026/
- Dates and location: **Jan 16–18, 2026**, Stevenson Event Center, UCSC
- Participants: **278**. Prize pool: $18,670+. There are 26 winner-badged projects. The UCSC news search snippet says the four main-track winners were all UCSC students.

### Tracks & prizes

| Prize | Sponsor | What it asked for | Reward |
|---|---|---|---|
| Sustainability Hacks / Health Hacks / Justice Hacks / Education Hacks (4 main tracks) | CruzHacks | Theme tracks | $470–$700 cash + per-member gadget |
| Best Beginner / Best AI / Best UI/UX / Best SlugHacks (UCSC-centric) | CruzHacks | As named | $520–$740 + gadget |
| Best Use of Viam | Viam | Integrate Viam robotics platform | $1,000 (+ Viam Rover) |
| Best Hardware Hack (1st/2nd/3rd) | ROBOTIS, Joby, OpenMV, PCBWay | Hardware | 1st $3,000 + TurtleBot3; 2nd/3rd hardware credits |
| Best Productivity Hack (+ runner-up, 3rd) | Opennote | Reduce friction, boost efficiency | $1,200 + iPad Minis |
| Best Use of Opennote API | Opennote | Build with the API | $500 |
| Best Use of Vercel / Framer / Mobbin / Autodesk / IF Magic / n8n / Windborne | respective sponsors | Use their product | $300–$900 or credits/tours |
| Best Use of GenAI/LLMs | "GenAI" sponsor | Productive AI/LLM use | $100 gift card + Tensorpool credits |
| Most Start-up Potential | Startup Club | Business viability | $500 |
| Best Insights from Public Data | Unwrap | Insights from Reddit/X/etc. | $500 value |
| MLH: Auth0, DigitalOcean (Gradient AI), ElevenLabs, Gemini, MongoDB, Solana | MLH partners | Use the API | Swag/hardware |
| Most Ambitious, Most Wild, President's Pick | CruzHacks | As named | Small prizes |

### Winners

| Place/Prize | Project | GitHub | What it does / who for | Built with | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **Sustainability Hacks** | [Flood Risk Analysis](https://devpost.com/software/flood-risk-analysis) | github.com/danielrhee/MultimodalFloodRiskAnalysis | Multimodal deep learning flood-risk maps from satellite + elevation + rainfall | PyTorch (2 U-Nets), FastAPI, Next.js, MongoDB, Auth0, Gemini | Custom-trained **vision models**; Gemini chatbot for explanation | No | none stated |
| **Health Hacks** + IF Magic | [CaneYouSee](https://devpost.com/software/caneyousee) | github.com/j-silv/caneyousee | LiDAR cane that detects elevation changes for visually impaired people in underdeveloped regions | LiDAR, vibration motors, IF Magic, Python | None | **Yes** | none stated |
| **Justice Hacks** + Unwrap public-data | [U.S. Eco Glass](https://devpost.com/software/u-s-eco-glass) | github.com/eolaruhagen/cruzhacks-26-environmental-transparency | Climate-policy bill dashboard with vote patterns | Next.js, Supabase, pgvector, K-means | Embeddings + clustering (no LLM agent) | No | none stated |
| **Education Hacks** + MLH Auth0 | [Tide Party](https://devpost.com/software/tide-party-icnodv) | github.com/omrynskyi/TideParty | Identify tide-pool marine life (custom 94%-accuracy model) and learn ocean conservation | PyTorch/CoreML, Gemini, SwiftUI | On-device vision classifier + Gemini quizzes | Phone camera | none stated |
| **Best AI Hack** | [Entropy](https://devpost.com/software/entropy-36yt4l) | github.com/ChristianHuerta05/Entropy | Paste a URL; an AI agent navigates the site and demos XSS/SQLi vulnerabilities | Gemini 2.5 Flash, **browser-use**, LangChain, FastAPI, React | **Computer-use agent** + vision + tool calling, streamed logs | No | none stated |
| Best Beginner | [SlugLabs](https://devpost.com/software/sluglabs) | none listed | Find and apply to UCSC research opportunities | Gemini, n8n, MongoDB, Auth0 | LLM resume matching + n8n automation | No | none stated |
| Best UI/UX | [DOMO](https://devpost.com/software/pomo-nxzv73) | github.com/suaviloquence/domo | Cozy focus timer with a pet | React Native, Figma | None | No | none stated |
| Best SlugHacks | [Cruzly](https://devpost.com/software/cruzly) | github.com/flipadips/CruzHacks | Campus map for events/furniture/services | React, Express, Postgres | None | No | none stated |
| Viam + Best Hardware Hack (placement unclear) | [MakerSafe](https://devpost.com/software/makersafe) | github.com/justinsiek/Maker-Safe | CV safety monitoring of makerspaces | Viam, RPi 4, webcams, Flask, Supabase | Vision (face/object detection) | **Yes** | none stated |
| Best Hardware Hack (placement unclear) | [Hardware Hub](https://devpost.com/software/hardware-hub) | none listed | Roadmap platform to learn embedded dev | Supabase, OpenAI via Opennote | LLM quizzes | Embedded focus | none stated |
| Best Hardware Hack (placement unclear) | [AquaGuard](https://devpost.com/software/aquaguard-solar-powered-water-monitoring-robot-xsu5cg) | none listed | Solar floating water-quality robot | Sensors, Arduino/RPi | None | **Yes** | none stated |
| Opennote Best Productivity (1st) + MLH Gemini | [Smart-Browse](https://devpost.com/software/smart-browse) | github.com/rv-us/SmartBrowse-agentic-shopper | Agentic shopper: asks dynamic questions and compares products across retailers + Reddit | Gemini, OpenAI SDK, ElevenLabs, Flask, React | **Agent with tool calling** (scrapers), agent-driven UI, voice | No | none stated |
| Opennote Productivity runner-up | [Perch](https://devpost.com/software/perch-eq5sim) | github.com/alokthakrar/cruzhacks26 | Watches handwritten math and gives real-time feedback ("TA on your shoulder") | Gemini 2.5 Flash vision, Pix2Text, SymPy, HMM | Vision + symbolic-math **tool verification** | No | none stated |
| Opennote Productivity 3rd | [Noteva](https://devpost.com/software/notevi) | github.com/zeuzmakessoftware/broser | AI study browser (tab automation, research modes) | Electron/Chromium, Gemini, ElevenLabs | LLM features | No | none stated |
| Vercel | [Socratical](https://devpost.com/software/socratical) | github.com/vinngo/cruzhacks | Socratic AI whiteboard tutor | Claude Sonnet 4 vision, Vercel AI SDK, tldraw | Vision + tool calls that draw on the canvas | No | none stated |
| Startup Club (start-up potential) | [Trackstar](https://devpost.com/software/trackstar-muzsf1) | github.com/mjao1/trackstar | Hidden bike-theft detector with GPS alerts | ESP32, MPU-6050, GPS, React Native | None | **Yes** | none stated |
| n8n | [BasedNews](https://devpost.com/software/basednews) | github.com/leo-kildani/cruzhacks2026 | Bias-aware news aggregator | n8n, Exa, OpenAI, Supabase | Web-search agents + LLM bias analysis | No | none stated |
| Autodesk | [RosettaMD](https://devpost.com/software/rosettamd) | github.com/aayan158/cruz26-real | Portable device translating clinical instructions to plain language | ESP32 + mic/OLED, Deepgram, multiple LLMs, Fusion 360 | Voice STT + constrained LLM simplification | **Yes** | none stated |
| Framer | [Change](https://devpost.com/software/change-m932ik) | github.com/dzymachine/Change | Round-up donations to charity | Plaid, GlobalGiving, Next.js | None | No | none stated |
| Mobbin | [Poligraph](https://devpost.com/software/poligraph) | github.com/BenjaminTelanoff/gov_props | Tracks politicians' promises against sentiment | Gemini, Reddit API, Angular | LLM summarization | No | none stated |
| GenAI/LLMs | [Study Royale](https://devpost.com/software/study-royale-1iak3c) | github.com/rkhettry/Study-arena-game-Cruzhacks-26 | Multiplayer quiz battles generated from your notes | Gemini, Opennote API, Socket.IO | LLM OCR + question generation | No | none stated |
| MLH ElevenLabs + Windborne | [SlugRoute](https://devpost.com/software/slugroute) | github.com/karanideepak691/slugroute | Weather-aware campus navigation | Gemini, ElevenLabs, Windborne, Mapbox | LLM route analysis + voice | No | none stated |
| MLH MongoDB | [BuildPulse](https://devpost.com/software/buildpulse-6va4hk) | github.com/PranAD-dev/buildpulse | Construction progress tracking from photos, predicting delays | Gemini vision, MongoDB, Three.js | Vision analysis | No | none stated |
| MLH Solana + Most Ambitious | [SlugBites](https://devpost.com/software/slugbites-84raj1) | none listed | Campus food-delivery drones | Solana, n8n, TinkerCAD | None stated | Yes (drone design) | none stated |
| Most Wild | [Ghost Runner](https://devpost.com/software/ghost-runner-imy4e1) | github.com/raymonsadhra/Ghost-Runner | Audio-AR "ghost" opponent for runs | React Native, Mapbox | None | Phone | none stated |
| President's Pick | [Musica](https://devpost.com/software/musica-fo1xw8) | github.com/dhruvvk14/musica | AI piano tutor (sheet-music OMR + pitch detection + DTW grading) | HOMR, Basic-Pitch, Gemini, FastAPI | ML models, not agents | No | none stated |

I did not find winners for Best Use of Opennote API or MLH DigitalOcean among the 26 badged projects (possibly unawarded; unverified).

### Observations

- A small (278 participants), beginner-heavy event. Main-track winners were **domain-specific and often hardware or custom-trained ML** (flood U-Nets, LiDAR cane, tide-pool classifier), not LLM agents.
- The one explicit "Best AI Hack" went to **Entropy, a computer-use security agent** (browser-use + Gemini vision), the same "agent attacks your app" idea as Sentinel at Berkeley.
- Several prizes went to non-AI projects (DOMO, Cruzly, Change, Trackstar), so AI was not required to win here.

---

## Blocked / failed fetches

- https://sfhacks-2026.devpost.com/ returned **HTTP 404** (no 2026 SF Hacks Devpost found).
- The calhacks.io fetch returned Cal Hacks 13.0 pre-event info only; there are no winners because the event is in Oct 2026.
- None of the ai-project-2026 grand-prize track descriptions (World/Toolbox/Lab/Playground) were published on Devpost or the live site. Track meanings in the prizes table are my inference (unverified).
- Fetch.ai 1st/2nd/3rd placement order was not shown on project pages (each says "Best Use of The Agentverse"). The same applies to CruzHacks Best Hardware Hack placements.
- IronBook's project page lists only the Grand Prize. Its Finalist status is inferred from gallery ordering (unverified).
- Devpost pages were read through WebFetch (summarized by a small model). Details like "Built With" are as reported by that summarizer and were not character-verified.

---

# UC Davis: HackDavis 2026

## HackDavis 2026 (UC Davis)

- Devpost: https://hackdavis-2026.devpost.com/ (gallery: https://hackdavis-2026.devpost.com/project-gallery)
- Website: https://hackdavis.io/ (now shows "Registration for HackDavis 2026 is now closed"; no winners posted there)
- Dates: May 9-10, 2026. Venue: University Credit Union Center, 750 Orchard Rd, Davis, CA. Winners announced on Devpost May 17, 2026 (per search snippet of Devpost page).
- Size: 426 registered on Devpost; 139 projects in gallery (6 pages). 20 projects carry winner badges, all on gallery page 1 (page 2 checked: no badges).
- Theme: "// create for social good_". All prizes are non-cash (hardware/swag/credits).
- In scope: yes, happened in 2026 with winners posted.

### Tracks & prizes

| Prize | Sponsor | What it asked for | Reward | 2026 winner(s) |
|---|---|---|---|---|
| Best Hack for Social Good | HackDavis | "Encapsulate your authentic idea of social good" | 1st: MacBook Neo; 2nd: electric scooter | Aggie Street Smart, BrailleOut (which is 1st vs 2nd not shown on Devpost; unverified) |
| Best Beginner Hack | HackDavis | All team members beginners | KOORUI 24" curved monitor | FarmLens AI |
| Best Interdisciplinary Hack | HackDavis | At least one non-CS major on team | $50 Amazon gift card | No badged winner found in gallery |
| Hacker's Choice Award | HackDavis | Most votes from participants | HackDavis swag bag | Rekindle |
| Best Hack for Social Justice | HackDavis | Tackle social justice with "tangible solutions and/or raise awareness" | Google TV Streamer 4K | Sunpatch |
| Most Creative Hack | HackDavis | Originality, "out-of-the-box thinking" | Mini projector | V↑ (V-up!) |
| Best Hardware Hack | HackDavis | Working hardware component | Logitech G305 mouse | Baze |
| Most Technically Challenging Hack | HackDavis | Technical depth; "advanced technical tools + algorithms/data structures", "performance/scalability" | AULA F75 keyboard | Panacea |
| Best UI/UX Design | Figma | Well-designed UI made in Figma; wireframing, responsive design | Sony WH-1000XM5 | Rekindle |
| Best User Research | HackDavis | Well-researched, "inclusive design aimed to maximize accessibility" | ChatGPT Plus, 4 months | Crisper |
| Best Entrepreneurship Hack | HackDavis | No code needed; viability + presentation | North Face Borealis backpack | No badged winner found in gallery |
| Best Statistical Model | HackDavis | EDA, significance tests, evaluation metrics | Bluetooth speaker | EveryCent |
| Best Hack for Women's Center | HackDavis (nonprofit challenge) | Donation-tracking system for Wellspring Women's Center | Anker Nano 3-in-1 charger | Wellspring Women's Center Donation Tracker |
| Best AI/ML Hack | Anthropic | Unique AI functionality; "show how they collected their data" | $750 Claude API credits | Clair |
| Best Use of DAC Materials | Davis Autonomy Club | Use Vision-Language Models or VLAs | $10,000 Daytona infra credits | Aggie Street Smart, BrailleOut |
| Best Use of Reconstruct | Reconstruct | "Most creative use" of Reconstruct | $125 Visa gift card (2 winners) | Zilix, Warrant |
| Best Use of Gemini API | Google | AI app built on Gemini | Google swag kits | AgriScout AI |
| Best Use of ElevenLabs | ElevenLabs | "Natural, human-sounding audio" | Wireless earbuds | Rekindle |
| Best Use of Solana | Solana | Use Solana's speed/low fees | Ledger Nano S Plus | kali. |
| Best Use of Backboard | Backboard | AI app using Backboard for state/memory | Tile Essentials pack | EpiEat |
| Best Use of Vultr | Vultr | Deploy on Vultr | Portable screens | Metis |
| Best Use of MongoDB Atlas | MongoDB | Build on MongoDB Atlas | M5Stack IoT kit | DavisVerse |
| Best Domain Name from GoDaddy Registry | GoDaddy Registry | Register a domain via GoDaddy Registry | Digital gift card | PitchSlapped |

There is no overall grand prize. The top award is Best Hack for Social Good (1st/2nd).

### Winners

I read all 20 winning project pages on Devpost. None of them states a reason for winning, and there are no judges' comments.

| Place/Prize | Project (Devpost link) | GitHub | What it does / who for | Built with | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| Best Hack for Social Good (1st or 2nd, unverified) + Best Use of DAC Materials | [Aggie Street Smart](https://devpost.com/software/aggie-street-smart) | github.com/TheLickIn13Keys/hackdavis26 | Bike routing that colors route segments green/orange/red by safety risk rather than speed. For cyclists in college towns, especially older adults, women riding alone and students commuting at night. Live at aggiestreetsmarts.us | Gemini, Mapbox (routing, traffic, road design, crime data), Next.js, shadcn/ui | **Vision LLM.** Gemini vision tags street-view frames for lighting, foot traffic and hazards, streamed over SSE so routes load without waiting. No agent. | No | none stated |
| Best Hack for Social Good (1st or 2nd, unverified) + Best Use of DAC Materials | [BrailleOut](https://devpost.com/software/brailleout) | github.com/varunpalanisamy/Braille | Point a webcam at printed text (or paste text) and it comes out as physical Braille on a 3D-printed 6-pin display. For blind and visually impaired people who can't afford $1.5k-5k commercial Braille displays. | Anthropic, Arduino, C++, Gemini, OpenCV, Python, Tinkercad, TypeScript | **Vision + LLM pipeline.** Gemini Vision does OCR, Claude cleans up and simplifies the text, and a lookup table maps it to Grade 1 Braille. No agent. | **Yes**: Arduino, 6 servos, 3D-printed housing | none stated (team of 2) |
| Best Beginner Hack | [FarmLens AI](https://devpost.com/software/agro-2m35yf) | github.com/Simarjit09/FarmLensAI | Upload a crop photo and land size, get a health assessment, a 7-day weather-risk calendar and next steps. For small farmers who can't pay for crop consultants. | Express, React, TypeScript, Node, Vite, Tailwind, Lucide, Gemini API, Open-Meteo, OSM Nominatim | **Vision LLM, structured output.** Sends image + weather to Gemini with a structured prompt and gets a JSON report back. | No | none stated (solo) |
| Hacker's Choice + Best UI/UX Design (Figma) + Best Use of ElevenLabs | [Rekindle](https://devpost.com/software/rekindle-koiq9s) | github.com/Atticus-Wong/rekindle | Always-on ambient display for elderly relatives that gathers family updates, with large visuals and voice navigation. A mobile companion app lets younger family members post photos and notes, and it also pulls from Instagram and Telegram. | Anthropic, Composio, ElevenLabs, MongoDB, Next.js, S3, Tailwind, TypeScript, Vultr, Figma | **Voice agent with client tool calling.** ElevenLabs Conversational AI drives the UI through client tools. Claude (via Vercel AI SDK) turns image posts and chats into short descriptions. Composio handles integrations. | Yes (elder-facing display device, per page) | none stated. Won 3 prizes: judges' UI/UX award plus the popular vote |
| Best Hack for Social Justice | [Sunpatch](https://devpost.com/software/sunpatch) | none listed | Backyard/small-farm planner on satellite imagery, plus inventory, marketplace listings and a mobile app for buying from nearby growers. For home growers and local buyers. | Next.js, React, React Native/Expo, MongoDB Atlas, Leaflet, MapLibre, Three.js, Gemini API, Tailwind, TS | **LLM generation.** Gemini produces a farm plan for a chosen plot (crops, yield forecast, surplus, health metrics). No agent. | No | none stated |
| Most Creative Hack | [V↑ (V-up!)](https://devpost.com/software/v-18h2kj) | none listed | Conversational learning games (math, science, reading/ASL). Kids answer by speaking, fingerspelling in ASL, or showing handwritten work. For Deaf/HoH, neurodivergent and limb-difference kids. | ElevenLabs, FastAPI, Gemini, MediaPipe, Next.js, OpenCV, PyTorch, React, Three.js, WebSockets, Zustand | **Voice agent + vision.** ElevenLabs full-duplex conversational character. Gemini 3 Pro Vision annotates scratch work and generates quizzes from lecture videos. Custom PyTorch models (MLP + CNN on MediaPipe landmarks) recognize fingerspelling. Grading is deliberately deterministic in the client ("no hallucinated grading"). | Webcam only | none stated |
| Best Hardware Hack | [Baze](https://devpost.com/software/baze-25rxap) | none listed | Bike-mounted sensor that detects potholes, cracks and gravel and maps them for safer routing ("Waze for UC Davis biking"). For student cyclists. | Arduino, C++, accelerometer, camera, FastAPI, Python, MongoDB, Leaflet, CartoDB, OSRM, JS | **Multimodal LLM classification.** Sends a 5 s accelerometer time-series plus a camera image to Gemini 2.5 Flash, which returns a RED/ORANGE/GREEN severity and a description for cyclists. | **Yes**: Arduino Uno R4 WiFi + Grove MMA7660FC accelerometer | none stated |
| Most Technically Challenging Hack | [Panacea](https://devpost.com/software/panacea-mitads) | github.com/Viharitejomurtula/Panacea | Interactive pandemic-policy simulator: 6 disease presets and 4 policy sliders on an animated community map, with Monte Carlo uncertainty, Sobol sensitivity and cost accounting. For public health literacy. | Mesa (agent-based models), PyTorch, SALib, deck.gl, MapLibre, React, Vite, Gemini, ElevenLabs, Render | **Surrogate ML + LLM narration.** A PyTorch neural surrogate trained on 5,000 agent-based-model runs cuts each run from 30 s to milliseconds. Gemini explains the results and sensitivity rankings, and ElevenLabs reads them aloud. Not an LLM agent. | No | none stated. Real modeling depth (ABM + surrogate + Sobol) fits the criteria |
| Best User Research | [Crisper](https://devpost.com/software/crisper) | none listed (live: crisper-26.vercel.app) | Mobile web app to browse campus food-pantry inventory, find pantries on a map and filter by category, plus an admin view for staff. Aims to reduce stigma for students. | React, Vite, Tailwind, JS, HTML/CSS | **None** | No | none stated |
| Best Statistical Model | [EveryCent](https://devpost.com/software/everycent) | github.com/MrFiscus/EveryCent | Forecasts grocery prices and tells SNAP/budget families "Buy Now / Wait / Stable" based on budget and EBT reload date. | TimesFM 2.0, BigQuery ML, Claude API / Claude Haiku, BLS + USDA ERS data, pandas, Python, Express, React, Recharts, TS | **Foundation forecasting model + LLM with web search.** TimesFM 2.0 via BigQuery ML does the forecasting. Claude (Haiku) writes live market-context alerts using web search. | No | none stated |
| Best Hack for Women's Center | [Wellspring Women's Center Donation Tracker](https://devpost.com/software/wellspring-women-s-center) | github.com/Momchil-Gavrilov/Wellspring_Women_Center_NGO | Replaces a paper binder with a voice-logged donation tracker, item catalog and bookkeeper master sheet for a Sacramento nonprofit. | Claude, Figma, MongoDB, Node.js, Vercel, Web Speech API | **Minimal.** Claude was used to help build the app. Speech-to-text is the browser Web Speech API. No runtime LLM stated. | No | none stated (nonprofit-specific challenge) |
| **Best AI/ML Hack (Anthropic)** | [Clair](https://devpost.com/software/clair-ptjxhy) | github.com/justinsiek/HackDavis2026 (demo hackdavis-2026.vercel.app) | Records doctor-patient visits, transcribes them with speaker labels, extracts structured SOAP patient state and writes per-clinician "what changed since you last saw them" handoff summaries. For hospital clinicians, so patients stop having to repeat their story. | Claude Sonnet 4.6, Deepgram nova-3-medical, Next.js, React 19, Tailwind, Flask, Supabase Postgres, WebSockets, MediaRecorder | **LLM tool calling with strict schemas.** Two structured tool-use calls with strict input_schema: one extracts SOAP state, one writes the per-clinician diff narrative. Live medical ASR with diarization. Grounded by talking to a Harvard physician and following SOAP documentation standards. A pipeline, not an autonomous agent. | No | none stated. Page stresses domain grounding (physician consult, SOAP) |
| Best Use of Reconstruct | [Zilix](https://devpost.com/software/zilix) | github.com/brandontautuan/hackDavis-zilix | Mobile IDE for contributing to repos from a phone, filling the gap between GitHub Mobile and a real IDE. For developers without a computer. | React Native/Expo, Fastify, Groq, Ollama API, Tailscale, Zod, Zustand, TS | **LLM coding assistance** through Groq/Ollama (details not specified). Reconstruct used to split tasks and avoid context poisoning. | No (runs on phones) | none stated |
| Best Use of Reconstruct | [Warrant](https://devpost.com/software/warrant-t0o1c7) | github.com/bnha4212/Hack-Davis-Ice-Man | Real-time ICE-activity heatmap scraped from Reddit and refreshed every 15 min. A panic button records the encounter, explains your legal rights in English/Spanish and texts your contacts and a lawyer. Works offline (PWA). For undocumented immigrants. | React, Vite, Express, Node, MongoDB, Mapbox, Socket.io, Workbox, Claude API, Whisper API, Twilio | **LLM structured extraction + ASR.** Claude scores each scraped post for credibility (0-1) and extracts city/state/lat/lng. Whisper transcribes. Twilio sends the SMS. | No | none stated |
| Best Use of Gemini API | [AgriScout AI](https://devpost.com/software/agri-scout-ai) | github.com/rajashekarcs2023/davis-hack-26 | When satellite NDVI flags an anomaly, it sends a drone to confirm, then (with human approval) a ground robot to inspect leaves, probe soil and place markers. Produces an explainable work order: pest, water, nutrient or false alarm. For farmers with multi-zone fields. | Google ADK, Gemini 2.5 Pro, Gemini Robotics-ER 1.6, Gemma 4 (31B via Ollama) | **Autonomous agent orchestration + embodied VLM.** ADK LlmAgent/Runner/FunctionTool with Gemini 2.5 Pro sequencing about 12 tool calls per run. Robotics-ER outputs target points for closed-loop control. Gemma 4 runs a parallel VLM ensemble that flags disagreement. Human-in-the-loop approval gate. | **Simulated only** (Cesium drone sim, SO101 arm + LeKiwi base sim). Real hardware listed as "next" | none stated |
| Best Use of Solana | [kali.](https://devpost.com/software/kali-40emhw) | github.com/stephenhungg/kali-v0 (site kalilabs.ai) | One AI chat over roughly 70 tools across 13 nonprofit software connectors (Bloomerang, Salesforce NPSP, QuickBooks, Zoom...) with cited answers and audit logs. Adds HTTP 402/x402 agent-native USDC fundraising and "cause coin" bonding-curve tokens whose fees go to nonprofits. | Claude Sonnet 4.6, MCP, Inngest, pgvector, Voyage AI, OpenAI, Supabase, Drizzle, Next.js, Solana/web3.js, SPL-Token, Meteora, Streamflow, Privy, x402, USDC, TRM Labs, etc. | **Agentic tool calling.** Claude runs parallel tool calls streamed over SSE, uses MCP and prompt caching. pgvector (Voyage-3) handles entity resolution and retrieval (RAG-like). | No | none stated. Very broad scope from a 4-person team |
| Best Use of Backboard | [EpiEat](https://devpost.com/software/episcanner) | none listed (live travel-allergy-helper.replit.app) | Scans a menu, translates it, marks each dish safe or unsafe for your allergies (including cross-contamination scoring) and orders for you in the local language. For travelers and immigrants with food allergies. | Gemini, Figma, Replit (page also mentions Backboard, ElevenLabs) | **Vision LLM + memory-backed chat.** Gemini 2.0 Flash does OCR and allergen analysis (SSE streaming). Backboard gives the chat assistant persistent memory of preferences. ElevenLabs speaks the disclaimers aloud. | No | none stated |
| Best Use of Vultr | [Metis](https://devpost.com/software/metis-7uet0f) | none listed (trymetis.us) | Predicts brain responses to short-form video feeds (upload or Chrome extension). Shows cortical activity across 7 regions and labels patterns like "dopamine bait". For social-media users worried about "brainrot". | JavaScript, Python (Vultr GPU, FastAPI) | **Open research model inference.** Meta FAIR TribeV2 brain-encoding model (Llama-3.2 backbone) predicts BOLD signals across 20,484 cortical vertices. Not an agent. | No (cloud GPU only) | none stated (solo) |
| Best Use of MongoDB Atlas | [DavisVerse](https://devpost.com/software/davis-verse) | github.com/pavan-nuthi/hackdavis | 3D multiplayer UC Davis campus replica with live events, proximity interactions and chat rooms. For students. | React Three Fiber/Three.js, Blender (Blosm), Express, Socket.io, MongoDB Atlas, Mongoose, Clerk, Redux, Framer Motion | **None implemented.** LLM NPCs listed only as future work. | No | none stated |
| Best Domain Name (GoDaddy Registry) | [PitchSlapped](https://devpost.com/software/pitchslapped) | github.com/blanklavender/pitch-slapped (getpitchslapped.us) | Live "Shark Tank" simulator: you pitch by voice to 3 AI judge personas and get a scored report card. For students and first-time founders. | ElevenLabs Conversational AI, Claude, React, Express, Node, WebSocket, WebAudio, Vite | **Voice agent, multi-persona.** One ElevenLabs agent plays 3 judges using speaker tags. Claude extracts the pitch and writes a structured, scored report card. | No | none stated (prize is for the domain) |

### Observations

- **Social good beats raw AI here.** The top prize (Best Hack for Social Good) went to two projects built for a specific underserved group, each with a tangible, visual demo: a safety-first bike router and a $-cheap physical Braille display. Both use AI as a component (Gemini vision, Claude cleanup), not as an autonomous agent. Both also won the Davis Autonomy Club VLM prize, so vision-language models paid off twice.
- **Agents were rare, and they won sponsor prizes rather than the main award.** The only truly agentic winners were AgriScout AI (Google ADK multi-tool orchestration + Robotics-ER, simulated hardware), kali. (Claude parallel tool calling + MCP) and Rekindle/PitchSlapped/V↑ (ElevenLabs voice agents). Anthropic's Best AI/ML Hack went to Clair, a tightly scoped pipeline (medical ASR → Claude strict-schema tool calls → per-clinician diffs) grounded in a real clinical standard (SOAP) and a physician consult. Schema-constrained, domain-grounded LLM use won over open-ended autonomy.
- **Voice was a strong theme.** ElevenLabs Conversational AI shows up in 4 winners (Rekindle, V↑, PitchSlapped, Panacea's TTS, plus EpiEat's TTS). Rekindle's voice agent with client tool calling controlling the UI took 3 prizes (Hacker's Choice, UI/UX, ElevenLabs). Polish plus elder-friendly design plus voice won both the judges and the crowd.
- **"Deterministic core, LLM at the edges" was a recurring pattern.** V↑ judges answers in the client ("no hallucinated grading"). AgriScout separates the motor layer from VLM reasoning and ensembles two VLMs, flagging disagreement. Panacea uses a trained surrogate model and uses the LLM only to narrate. Clair uses strict input_schema.
- **Specific populations won repeatedly:** Deaf/limb-difference kids, blind people, SNAP families, undocumented immigrants, elderly relatives, one named nonprofit (Wellspring), campus pantry users, small farmers. Mobility/bike safety in Davis itself won twice (Aggie Street Smart, Baze).
- **Non-AI projects can still win the research/design tracks.** Crisper (Best User Research) and DavisVerse (MongoDB) have no AI at all.
- **Hardware was light but effective.** Only BrailleOut, Baze (Arduino + accelerometer) and arguably Rekindle's display are physical. The "drone + robot" AgriScout was entirely simulated and still won the Gemini prize.
- **Unawarded/unclear:** Best Interdisciplinary Hack and Best Entrepreneurship Hack have no winner badge in the gallery (pages 1-2 checked, and all winners appear on page 1). Devpost does not show which Social Good project was 1st and which was 2nd. Gallery order lists Aggie Street Smart first, which may suggest 1st (unverified).
- **Blocked/limitations:** Nothing was blocked. https://hackdavis-2026.devpost.com/rules returned no rules/judging text through WebFetch (the page body is mostly links to external policy docs). hackdavis.io lists prizes but no winners. No judges' comments were published on any winner page.

---

# Southern California projects, 2026 editions: what won

Researched 2026-09-26. All data comes from Devpost (event overview, project gallery, individual `/software/` pages) fetched with WebFetch. WebFetch summarizes each page with a small model, so the exact wording of prize amounts may be slightly garbled. Anything I could not confirm directly is marked "(unverified)". None of the project pages I read had judges' comments, so "Why it won" is "none stated" unless noted.

Scope check:
- **LA Hacks 2026** (UCLA, Apr 24-26 2026): happened, winners posted. Covered.
- **SB Hacks XII** (UCSB, Jan 10-11 2026): happened, winners posted. Covered.
- **DiamondHacks 2026** (ACM@UCSD, Apr 4-5 2026): happened, winners posted. Covered.
- **SD Hacks 2026**: I found no 2026 edition. The only Devpost result is the old `sdhacks.devpost.com`, which predates 2026. The main UCSD event in 2026 is DiamondHacks. Other UCSD 2026 events exist (DataHacks 2026, Apr 18-19; Hard Hack 2026; Triton Hacks 2026) but were not researched.
- **IrvineHacks 2026** (UCI, Feb 27-Mar 1 2026): happened, winners posted. Covered as the extra SoCal event.
- **Citrus Hack 2026** (UCR, Apr 18-19 2026, 139 participants, citrus-hack-2026.devpost.com): happened, but I did not cover it because it is small. I did not check its winners.

---

## LA Hacks 2026

- Devpost: https://la-hacks-2026.devpost.com/ | Website: https://lahacks.com/
- Dates: April 24-26, 2026, Pauley Pavilion, UCLA. Invite-only and in person.
- Size: 974 registered. **307 submissions** in the gallery. About 65 projects have winner badges (24 on page 1, 24 on page 2, 17 on page 3).
- Total prize pool: about $24.5k+.
- Themed tracks: Sustain the Spark (sustainability), Light the Way (education), Flicker to Flow (productivity), Catalyst for Care (healthcare).

### Tracks & prizes
| Prize name | Sponsor | What it asked for | Reward (as listed) |
|---|---|---|---|
| 1st / 2nd / 3rd Overall | LA Hacks | Best overall | Frontier GoWILD all-you-can-fly pass / Apple Watch SE 3 / Polaroid Now+ Gen 3 set |
| Sustain the Spark | LA Hacks | Sustainability | Arc'teryx Mantis 1 waist pack |
| Light the Way | LA Hacks | Education | Rocketbook Core |
| Flicker to Flow | LA Hacks | Productivity | Keurig K-Mini |
| Catalyst for Care | LA Hacks | Healthcare | Creative Pebble V3 speakers |
| Organizers' Choice, Best Social Impact Hack, Best UI/UX, Best Hardware Hack, High Quality Sponsormaxxing, Most Questionable Use of 36 Hours | LA Hacks | Special awards | Not detailed |
| Agentverse - Search & Discovery of Agents | Fetch.ai | "Build and Register AI Agents on Agentverse, discoverable via ASI:One, that turn user intent into real, executable outcomes." | Cash with tiered placings. **8 winners**. Exact amounts garbled in fetch (unverified) |
| OmegaClaw Skill Forge powered by Agentverse | Fetch.ai | Build specialist skills/agents that extend OmegaClaw via Agentverse | About $1,500 / $1,000 (unverified). 2 winners |
| Best Use of ASI:One | Fetch.ai | Late add-on: use ASI:One LLM | 1 winner |
| Cognition Company Challenge | Cognition (Devin/Windsurf) | "Build a tool, integration, or product that makes AI coding agents measurably more capable, or eliminates developer/professional toil that agents can't yet handle." | Cash + Devin ACUs + 1-yr Windsurf Pro. **6 winners** |
| ROBLOX Civility Challenge | Roblox | "Build a game that makes learning about digital well-being, safety, and civility feel like playtime." | Cash. 5 winners |
| Figma Make Challenge | Figma | Creative use of Figma Make during ideation, prototyping or pitching | Plushies. 13 winners |
| World U Challenge | World | "Build a Mini App with MiniKit or use IDKit to create a product for real humans on the internet." | Cash ($1,500/$900/$600, unverified) + fellowship. 3 winners |
| Cloudinary Company Challenge | Cloudinary | Use Cloudinary's React AI Starter Kit for innovative media apps | Cash / $500 Amazon GC per member. 5 winners |
| ASUS Company Challenge | ASUS | Use the ASUS Ascent GX10 (local AI supercomputer) for something surprising or impactful, with local AI | 1st: GX10 + monitors ($4k+). 2nd: ROG mice |
| Happy Hacking Keyboard Challenge | HHKB | An experience where the keyboard is the primary interaction medium | HHKB Hybrid keyboards. 1 winner |
| Zetic Company Challenge | ZETIC | "Build an AI-powered application using Melange to run AI models locally on end-user's smartphone." | Cash + Melange Pro+. 6 winners |
| Arista Networks: Connect the Dots Challenge | Arista | App that connects people to resources or routes useful data to solve a daily-life problem | Claude Pro + Bose/Logitech. 3 winners |
| MLH: Best Domain (GoDaddy Registry), MongoDB Atlas, Gemma, ElevenLabs, Solana, Vultr, Auth0 AI Agents | MLH partners | Use the named tech | Swag or hardware, 1 winner each |

### Winners
Only projects whose pages I read are listed with full details. Prize names are exactly as shown on each project page.

| Place/Prize | Project | GitHub | What it does / who for | Built with | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **1st Overall** + Cognition Challenge | [codebreaker](https://devpost.com/software/codebreaker-la) | github.com/KevinWu098/codebreaker | AI-native cybersecurity: detect, validate and auto-fix vulnerabilities. Includes its own CVE benchmark (ECVEBench, MITRE CWE Top 25 across npm/pip/maven/Go). For dev/security teams | Cloudflare Workers, Devin, Modal, React, TypeScript, GitHub | Security-specialized **agent harness** (custom prompts + tools such as CVE lookup, DeepWiki, exploit reasoning) around frontier models (GPT-5, Claude Sonnet, Kimi K2.6). The harness improved performance by up to 34% on their benchmark. **Devin runs an autonomous remediation loop** (reproduce exploit, then patch) | No | None stated. The project reports a measured benchmark gain (+34%) |
| **2nd Overall** + Fetch.ai Best Use of ASI:One | [RIIS](https://devpost.com/software/riis) | github.com/srinisriram/RIIS | Rapid Incident Intelligence System. A rover enters collapsed buildings, detects survivors, produces SBAR triage, makes multilingual voice contact and builds a 3D VR reconstruction for incident commanders | FastAPI, Fetch.ai uAgents, PyTorch, YOLOv8-pose, ElevenLabs, Raspberry Pi, React, Unity, MASt3R/InstantSplat, Meta Quest 2 | **Multi-agent (4 uAgents):** Scout (YOLO detection), Triage (LLM writes SBAR), Comms (ElevenLabs voice), Mapping (Gaussian splat) | **Yes**: PiCar-X rover (Pi 5), Quest 2 | None stated |
| **3rd Overall** + Cognition Challenge | [Autopsy](https://devpost.com/software/autopsy-zq5d84) | github.com/balebbae/Autopsy | Flight recorder and "institutional memory" for AI coding agents. Records every agent action, classifies failures and builds a failure knowledge graph. Injects warnings into the agent's system prompt on future tasks. For teams using coding agents | Python/FastAPI, Postgres + pgvector, opencode plugin, Next.js, Three.js, Claude, Gemma, Gemini embeddings, Docker | **Agent-infra tool.** Semantic retrieval + 3-hop graph traversal produce warnings that go into the prompt before the run. Deterministic rules plus an optional LLM classifier. Automated postflight lint/type/test checks | No | None stated |
| Organizers' Choice | [beehyv](https://devpost.com/software/beehyv) | github.com/justanotherinternetguy/Beehyv | Finds gaps in the research literature: builds a semantic map of about 100k arXiv papers, finds "voids" via Voronoi analysis and generates cross-pollinated research proposals with code. For researchers | CUDA, Ollama, Python, SQLite, TS/React, WebGL. Nemotron via OpenRouter, Gemma on ASUS GX10 | **Hierarchical multi-agent:** a "Queen Bee" orchestrator plus paper, planning, coding and judge worker agents in iterative loops | Uses GX10 | None stated |
| Best Social Impact Hack | [Polaris](https://devpost.com/software/polaris-mh7rd8) | github.com/angelinawwu/lahacks26 | Agentic hospital paging. Classifies clinical alerts, routes them to the right clinician in seconds and writes a short SBAR handoff (<100 words). For nurses and hospital operators | FastAPI, Flask, Next.js, uAgents, ASI-1 Mini, Socket.IO, AWS EC2 | **4 autonomous agents** (Operator orchestrator, Priority, Case, Sentinel risk observer). LLM does classification, ranking and SBAR. **Deterministic fallbacks at every LLM touchpoint.** Voice-to-page | No | None stated |
| Best Hardware Hack | [Bridge](https://devpost.com/software/bridge-4euwyt) | github.com/lozlrc/Bridge | Real-time refreshable braille display for **deafblind students**: classroom audio/images become physical braille pins | Claude API, Whisper, FastAPI, ESP32, stepper motors | LLM (Claude) + Whisper in the transcription pipeline. Not agentic | **Yes**: custom 3D-printed braille display | None stated |
| Best UI/UX + Figma Make | [NeighborFridge](https://devpost.com/software/neighborfridge) | github.com/sinaghadimi9081/LaHacks2026 | Scan grocery receipts, predict expiry, get reminders and share or sell surplus food locally. For students and neighbourhoods | React, Django, Tesseract OCR, Ollama (Gemma 2), AWS, Figma Make | Local LLM parses receipts. Not agentic | No | None stated |
| High Quality Sponsormaxxing + Arista Connect the Dots | [Nimbus](https://devpost.com/software/nimbus-q025jc) | github.com/smalex-z/nimbus | Open-source "EC2 on hardware you own": VMs in about 30s, S3 via MinIO, GPUs. Motivated by ACM@UCLA's $3.6k/yr AWS bill | Go, React, Proxmox, Bash | None | **Yes**: 5 repurposed laptops + GX10 | None stated |
| Most Questionable Use of 36 Hours | [YES? or YES!](https://devpost.com/software/yes-or-yes) | github.com/lukietee/YESorYES | Phone a number, describe a life problem, and real guppies "vote" between two bad options. An agent then executes the choice (sends messages, posts) | Claude Haiku 4.5, Twilio, Deepgram, ElevenLabs, Playwright, Next.js, Redis | **Voice agent with tool calling** (`present_options`, `wait_for_decision`, `dispatch_action`, `report_done`) and Playwright computer-use execution | **Yes**: fish tank, camera | Joke award |
| Track: Sustain the Spark | [Drip](https://devpost.com/software/drip-6ao9m2) | github.com/Lewin-B/lahacks2026 | Uses AI-server waste heat to drive membrane distillation that makes fresh water. Pitch: "every prompt generates water". For data-centre operators | Raspberry Pi 5, ASUS GX10, Gemma (Ollama), Go, Next.js, Cloudinary, Tailscale | Gemma inference is the *heat load*. AI is not the product | **Yes**: liquid cooling, Peltier, distillation chamber | They "verified [the] process actually works and generates fresh water" |
| Track: Catalyst for Care + Agentverse | [Dots](https://devpost.com/software/dots-y5r21j) | github.com/aryanmudgal-tech/dots | Turns floor plans into ADA-compliant tactile maps, with a QR code for voice/text Q&A about the venue. For blind visitors, architects and businesses | Python, FastAPI, Gemini, Fetch.ai ASI:One, ElevenLabs Conversational AI, Swift, SQLite | Gemini for image generation and context extraction. Fetch.ai agent for per-map Q&A. **ElevenLabs voice agent** with per-map prompt overrides | Tactile print output | None stated |
| Track: Light the Way + Figma Make | [Accent](https://devpost.com/software/accent-cdw2qi) | github.com/RyloRiz/accent | macOS accessibility copilot. Press a hotkey, speak your intent in any language, and it highlights the right UI element and talks you through it. For elderly and non-English users | Swift/AppKit, Gemini 3.1, RF-DETR (HF), Roboflow, ElevenLabs STT/TTS, LangChain, TensorRT, ONNX | **Vision + LLM screen understanding** ("gives LLMs sight"). UI-element detector + Gemini intent resolution. Guides the user rather than acting | No | None stated |
| Track: Flicker to Flow + Zetic | [SPECTRA](https://devpost.com/software/spectra-qbj2gf) | none listed (site spectra-website-jade.vercel.app) | Upsamples iPhone's sparse LiDAR (192x256) to dense metric depth (768x1024) on-device in real time. For robotics and AR devs | PyTorch, Swift, CoreML, FastAPI, GX10 | Custom CNN (MobileNetV2 encoder), 2 MB CoreML. No LLM | **Yes**: iPhone Pro LiDAR | None stated |
| Fetch.ai Agentverse | [Jarvis](https://devpost.com/software/jarvis-eifsyq) | github.com/saigudisa6/jarvis | Proactive browser copilot: inbox briefings, meeting detection, restaurant suggestions. "Acts before you ask" | Chrome MV3, FastAPI, Agentverse, ASI:One, Gmail/Calendar APIs | Python orchestrator + specialized agents on Agentverse. Structured JSON inference with a regex fallback | No | Team's thesis: "The intelligence is cheap. Knowing when to use it is everything" |
| Fetch.ai Agentverse | [NeuralLens](https://devpost.com/software/neurolens-2qgdm8) | github.com/anirudhmazumder/NeuralLens | Simulates brain response to marketing visuals (Meta TRIBE v2 fMRI model, DeepGaze), then autonomously rewrites images and copy to raise engagement. For small businesses | Fetch.ai, Cloudinary gen-AI, Replicate, RunPod, Stripe, React | **6-agent pipeline** (Payment, Orchestrator, Sensor, Interpreter, Strategist, Executor) with an optimize loop | Cloud GPU | None stated |
| Fetch.ai Agentverse + Cognition | [MultiEval](https://devpost.com/software/multival) | github.com/AlfredSjoqvist/multieval | Eval platform for **multi-agent orchestration**: graph/Gantt traces, A/B testing with confidence intervals, plus an "Agentic Evolve" meta-agent that improves harnesses on its own | Claude, Gemini, ASI:One, Inspect AI, MCP, OpenHands, Windsurf, React | Meta-agent (Claude Opus) reads a harness, forms hypotheses, generates benchmarks, runs evals and iterates within a budget | No | None stated |
| Fetch.ai Agentverse | [Residue](https://devpost.com/software/residue) | github.com/MaanPatel2005/Residue | Acoustic focus profiles and generated soundscapes for studying, plus study-buddy matching. For college students | Next.js, MongoDB, ElevenLabs, uAgents, ZETIC Melange (Qwen on iOS), Claude | Multi-agent (perception, correlation, intervention, orchestration, matching) | iOS phone | None stated |
| Fetch.ai Agentverse + Zetic | [Northstar](https://devpost.com/software/northstar-7lcg45) | github.com/continuitylabs/lahacks26 | Hiker fall detection → local voice triage → camera PPG vitals → SOS via satellite. Works offline | React Native, ZETIC (Qwen 3.5-4B local), YAMNet, Fetch.ai swarm, Twilio, ElevenLabs | On-device LLM triage + agent swarm coordination | Phone sensors | None stated |
| Fetch.ai Agentverse | [Pols 15](https://devpost.com/software/pols-15) | github.com/PranAD-dev/pols-15 | Stress-tests policies for local candidates: simulated voter reactions across 7 demographics, stakeholder map, social drafts and real posting | 12 Fetch.ai agents, ASI:One, Stripe, Composio, Mapbox, React | **12 coordinated agents** including simulation and posting via Composio tools | No | None stated |
| Fetch.ai Agentverse | [Conjure](https://devpost.com/software/conjure-m960jz) | github.com/pauligwe/WorldEdit | Prompt → fully walkable 3D interior in the browser | Agentverse, Gemini, Next.js, React Three Fiber | Sequential planning agents → parallel build agents → validation agents, with live "thinking" stream | No | None stated |
| Fetch.ai OmegaClaw Skill Forge | [Edith](https://devpost.com/software/edith-zbd6pg) | github.com/rishi-golla/lahacks2026 | Multimodal assistant on **Meta Ray-Ban glasses**: reads name badges, books reservations and sends follow-up emails hands-free. For conference attendees | Gemini Live, OmegaClaw, Agentverse, Meta Wearables DAT, Swift, Playwright MCP | Gemini Live for perception. OmegaClaw for intent and skill delegation. Agents for Gmail and **browser automation** | **Yes**: Ray-Ban Meta | None stated |
| Fetch.ai OmegaClaw Skill Forge | [CareLoop](https://devpost.com/software/careloop-agentverse-care-companion) | none listed | Coordinates prescriptions, appointments, OTC meds, payments and caregiver updates for older adults via ASI:One chat or Telegram | uAgents, Agentverse, ASI:One, Telegram, Google APIs, browser-use | Specialist agents. LLM for classification but **deterministic flows for payment, safety and booking** | No | None stated |
| Cognition | [Litho](https://devpost.com/software/ai-rtl-agent) | github.com/rtsmc/lahacks2026 | VSCode agent that designs chips: NL → Verilog → auto tests → waveform debug | Python, TS, Verilator | 4 agents (Orchestrator, Spec, Writer, Tester), each kept to a focused context window | No (HDL) | None stated |
| Cognition | [Lore IDE](https://devpost.com/software/lore-ide-the-first-ide-for-agentic-code) | none listed | "GitHub stores your code, Lore stores your reasons": captures decisions from Claude Code session logs and serves them to Devin/Windsurf/Claude Code via MCP. Includes a verification canvas | Tauri (Rust), React, SQLite, Claude Sonnet, MCP server | LLM distillation + 3-layer retrieval (semantic → graph → LLM rerank, <300 ms) exposed as an **MCP server** | No | None stated |
| Cognition | [ACG](https://devpost.com/software/acg) | none listed | Agent Context Graph: predicts which files each agent task touches and writes `agent_lock.json` so parallel coding agents don't collide. Prompt tokens cut 54% | Python, TS | Coordination infrastructure for multi-agent coding | No | Quantified token saving |
| Figma Make | [Scaena OS](https://devpost.com/software/scaena-os) | github.com/RC3371/Scaena-LAHacks2026 | 4 agents book gigs for musicians and comedians: venue research, pitch writing, follow-ups, learning loop | uAgents, ASI-1 Mini, Gemini 2.5 Flash w/ grounding, Gmail OAuth, React, Vultr | Multi-agent with a feedback loop (analytics agent retrains research and pitch agents) | No | None stated |
| Figma Make | [MAVN](https://devpost.com/software/mavn) | none listed | Voice healthcare assistant: finds in-network providers and **books appointments by filling clinic web forms** | ElevenLabs Conversational AI, Playwright, Tavily, FastAPI, React Native | **Voice agent + headless Playwright form-filling agent** | No | None stated |
| Figma Make | [IMPULSE](https://devpost.com/software/erewhon) | github.com/MarcDasilva/LAHacks2026 | iPhones as smart bodycams for EMTs, plus a dispatcher command view with semantic video search and 3D scene reconstruction | ZETIC Melange, YOLO, Qwen2.5-Omni 3B, COLMAP, pgvector, GPT-4o-mini, GX10 | On-device multimodal models + a local agent with memory | **Yes**: iPhone, GX10 | None stated |

Other LA Hacks badge winners (gallery tagline only, page not read; specific prize unverified):
- Likely Roblox Civility winners, by theme (unverified): Overseer.exe (teaches kids to spot grooming in Roblox), Hack-A-Ton (password-security game), Mindful Egg (self-care game), Pixel Truth (misinformation detective game), Inbox Invaders (anti-scam tower defense).
- Taglines only: Sera, GoTrail (hikes as prescriptions), Grouper, Snitch ("Lock in or pay up"), autoGear, Talantis (internship pipelines), WebMedica (medical studies → personalized insights for women), Obi (local file-context assistant), startupOS, Impulse (agent-powered hiring with a trust rating; possibly World U, unverified), Banter Mart ("Humans swipe, agents type"), StudyO, Cloudcam (Cloudinary), Waste2Wealth (Solana litter bounties), Sage (curriculum-grounded tutor), AgriMind, Aegis Edge (zero-trust triage for medical devices), OceanOps, Roman Road (HHKB-style typing tool, unverified), Knova (offline edge-AI tutor), PhysioPal, Cropt (offline crop disease detection), Scrubs (auto-redact PHI in photos), Veritas (real-time YouTube fact-check), TimeHole, MarkCodePolo, J.I.T., My Voice, A-Eye (camera → audio navigation for the blind), Sentinel.ai, Just Replay, StandIn.

### Observations
- **Agent-infrastructure-for-coding-agents dominated the top.** 1st place (codebreaker) and 3rd place (Autopsy) are both tools that make coding agents better, and both also won the Cognition challenge. MultiEval, Lore IDE and ACG won the same challenge. These are developer-tool projects whose output can be measured.
- The winners **quantify their results**: +34% on a benchmark (codebreaker), −54% prompt tokens (ACG), 2-5 s dispatch latency (Polaris), and a working physical distillation (Drip).
- Fetch.ai was the biggest source of prizes (8 + 2 + 1 winners). Most of these winners are 4-12-agent uAgents pipelines on Agentverse/ASI:One, so "multi-agent" was close to a requirement for that pool.
- A recurring design choice among AI winners is to **keep safety-critical paths deterministic**: Polaris has fallbacks at every LLM call, CareLoop runs payments and booking deterministically, and Autopsy keeps the LLM out of preflight.
- Health and accessibility carried the track and social-impact prizes (RIIS, Dots, Bridge, Polaris, Accent), usually for a very specific user (deafblind students, disaster victims, on-call nurses).
- Hardware plus agents scored well: 2nd overall was a rover with 4 agents. The ASUS GX10 local-AI box appears in many winners' stacks.

---

## SB Hacks XII

- Devpost: https://sb-hacks-xii.devpost.com/ | Website: https://www.sbhacks.com
- Dates: January 10-11, 2026, Corwin Pavilion, UCSB. 24 hours, invite-only.
- Size: 341 participants. **106 submissions**.
- Tracks: Entertainment, Health & Wellness, Education, Sponsor track (TwelveLabs).

### Tracks & prizes
| Prize name | Sponsor | What it asked for | Reward |
|---|---|---|---|
| Grand Prize 1st / 2nd / 3rd | SB Hacks | Best overall | iPad + Pencil / Meta glasses / Apple Watch |
| Best Education Hack | SB Hacks | Education track | AirPods |
| Best Health & Wellness Hack | SB Hacks | Health track | Ninja Creami |
| Best Entertainment Hack | SB Hacks | Entertainment track | Bose speaker |
| Best Use of AI | SB Hacks | Best AI use | Mini projector |
| Best Design | SB Hacks | Design | Owala bottle |
| Best Hardware Hack | SB Hacks | Hardware | Raspberry Pi |
| President's Pick | SB Hacks | Organizer pick | Wearable blanket |
| Best Joke Hack | SB Hacks | Humor | Weighted plushie |
| Drawing Contest | SB Hacks | Art | Prismacolor pencils |
| Deepgram API Challenge | Deepgram | Use Deepgram voice APIs | Steam Deck + credits (3 winners) |
| TwelveLabs API Challenge | TwelveLabs | Use TwelveLabs video understanding | 50/40/30 hrs video credits (3 winners) |
| [MLH] Best Use of Gemini API / Snowflake / Solana / Vultr / ElevenLabs / MongoDB Atlas | MLH partners | Use the named tech | Swag or hardware |

### Winners
| Place/Prize | Project | GitHub | What it does / who for | Built with | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **Grand Prize 1st** | [Hey Host!](https://devpost.com/software/hey-host) | github.com/nacsoprog/HeyHost | Say "Hey Host!" mid-podcast to ask a question and get an answer in the podcaster's (cloned) voice. Also saves clips and takes voice commands. For podcast listeners | ElevenLabs custom voices, Faster-Whisper, Porcupine wake word, Flask, Next.js, BeautifulSoup/RSS | **Voice agent**: wake word → STT → LLM over the transcript context → cloned-voice TTS | No | None stated |
| **Grand Prize 2nd** | [Lumenta](https://devpost.com/software/lumenta) | github.com/BhargavJakkaraju/Lumenta | Multi-camera AI monitoring that **acts** on custom natural-language rules (theft, child safety, packages, hazards) by triggering calls, emails and texts | Gemini, YOLOv8, ONNX Runtime Web, Next.js, MongoDB Atlas, **MCP** | YOLO detection + Gemini semantic interpretation + **MCP server for autonomous tool actions** | Cameras | None stated |
| **Grand Prize 3rd** | [Barracua](https://devpost.com/software/baracua) | github.com/ryunzz/sb_hacks | Chrome extension AI agent for blind and low-vision users: sees the screen and **controls the browser autonomously** by voice | Gemini (incl. **Computer Use API**), Deepgram Nova-2/Aura, Playwright, Python | **Computer-use agent** + voice agent | No | None stated |
| Best Education Hack | [Cognix](https://devpost.com/software/cognix-tv89ws) | github.com/Ved-P/keyllama | VS Code extension: keystroke analysis tells human work from AI-pasted code, plus a policy-bound tutor bot that gives hints, not answers. For CS students and instructors | Next.js, MongoDB Atlas, Gemini | Constrained LLM tutor (instructor-defined policy) + ML on keystrokes | No | None stated |
| Best Health & Wellness Hack | [EXCITE.AI](https://devpost.com/software/ex-cited) | none listed | Page gives almost no description ("AI Powered Tool") | Flask, OpenCV, PyTorch, Transformers, Raspberry Pi | Transformers model (details not given) | Yes (Raspberry Pi) | None stated |
| Best Entertainment Hack | [Vibe Check](https://devpost.com/software/vibe-check-m9ujqd) | github.com/aditya-v0921/SBhacks | Crowd "hype" tracking for DJs: optical-flow energy heatmaps, genre ranking and lighting sync | OpenCV, C++, InfluxDB, React, WebSocket | None (classical CV) | Camera/lighting | None stated |
| Best Use of AI | [Coherence](https://devpost.com/software/coherence-jga4uw) | github.com/ramizik/coherence | Presentation coach that flags "visual-verbal dissonance" (confident words, anxious body language) and gives a 0-100 coherence score. For students, professors and career centres | TwelveLabs, Deepgram, Gemini, FastAPI, React | Multimodal pipeline: 15+ TwelveLabs video queries + word-timestamped transcript → Gemini synthesis | No | None stated. Pitch cites "55% of communication is non-verbal" |
| Best Design | [GymIntel](https://devpost.com/software/gymintel) | none listed | Workout-video form feedback, muscle activation and benchmarking, plus an AI coach chat | YOLOv11 pose, MediaPipe, TwelveLabs, Gemini, FastAPI, Next.js | Vision + LLM coach | No | None stated |
| Best Hardware Hack | [ExtendAble](https://devpost.com/software/robotic-arm-j4fmbq) | github.com/nathanqiuUCSB/ExtendAble | Voice-commanded 6-DoF arm ("grab an orange") that finds the object and places it. For people with disabilities | Groq LLM, YOLO, OpenCV, LeRobot, SO-101 arm, React | LLM parses the command → YOLO locates → arm executes | **Yes**: SO-101 arm, 3D-printed | None stated |
| President's Pick + [MLH] Best Use of ElevenLabs | [flow.](https://devpost.com/software/flow-8pgm1k) | github.com/stephenhungg/flow | Speak a concept and step into an explorable 3D Gaussian-splat world with educational overlays | Deepgram, Gemini, ElevenLabs, Three.js/SparkJS, MongoDB, Vultr | Voice → Gemini orchestration, image generation and vision → splat generation + narration | No | None stated |
| Deepgram Challenge + [MLH] Best Use of Gemini API | [DispatchIQ](https://devpost.com/software/dispatchiq-usn87o) | github.com/declanhogg100/dispatchiq | Live 911-call transcription and structured incident extraction for dispatchers. An AI voice answers when no human is free | Deepgram, Gemini, OpenAI Realtime API, Twilio, Next.js, Supabase | **Voice agent** fallback (speech-to-speech) + LLM structured extraction | Phone (Twilio) | None stated |
| Deepgram Challenge + [MLH] Best Use of Solana | [Nomad](https://devpost.com/software/nomad-ha90qx) | github.com/SanjayMarathe/nomad | An AI agent sits in the group video call and builds a shared trip itinerary and map live as friends talk | Claude, Deepgram, LiveKit, Mapbox, Next.js, Solana | **Claude agent with function tools** (Yelp search, routes, itinerary) via **MCP**, listening live | No | None stated |
| Deepgram Challenge | [Cartify](https://devpost.com/software/cartify-10bjse) | github.com/Max-Changg/Cartify | Talk about health goals → recipes → shopping list → **items auto-added to your Weee! cart** | Deepgram, Gemini, Playwright, Next.js | Voice agent + browser-automation agent | No | None stated |
| TwelveLabs Challenge | [Owngoal](https://devpost.com/software/owngoal) | none listed | Personalized sports broadcast: a "director agent" picks the camera angle per viewer's preferences in real time | TwelveLabs Marengo, Gemini, Node, React | Video embeddings + persona embeddings + director agent (cosine similarity routing) | No | None stated |
| TwelveLabs Challenge | [Buildr](https://devpost.com/software/ezpc) | github.com/kevinwu098/buildr | Voice + vision PC-building assistant that identifies parts and guides assembly | Deepgram Flux, GPT (function calling), Cartesia, SAM→YOLOv11, LanceDB, LiveKit, TwelveLabs | Voice agent with **function calling + RAG** (PCPartPicker/YouTube knowledge) + real-time segmentation | Camera | None stated |
| TwelveLabs Challenge | [Reel-To-Real](https://devpost.com/software/reel-to-real) | github.com/pranavgowrish/reeltoreal | Travel reels → an optimized itinerary in about 2 minutes | TwelveLabs, spaCy, Gemini 2.5 Flash, Geoapify, FastAPI | Video landmark extraction + LLM validation + routing algorithm | No | None stated |
| [MLH] Best Use of Vultr | [GradeMeIn](https://devpost.com/software/grademein) | github.com/SBHacks-26/lms-sbhacks | Hidden prompt markers expose AI-written homework, plus an adaptive voice interview of the student | Gemini 2.5 Flash, Deepgram Voice Agent API, Next.js, Flask, MongoDB, Vultr | Voice agent interviews + LLM marker generation | No | None stated |
| [MLH] Best Use of MongoDB Atlas | [Thrift Tinder](https://devpost.com/software/thrift-tinder) | github.com/trevordodge/sbhacks-project | Swipe on Depop listings. The AI learns your style and recommends pieces | Flutter, Flask, Gemini, OpenAI, MongoDB Atlas | LLM tagging + recommendations | No | None stated |
| Drawing Contest | [Librarian Love: Fantasy Tycoon 3](https://devpost.com/software/librarian-love-fantasy-tycoon-3) | github.com/madhav-vis/librarian-love-fantasy-world | Reading-motivation game with collectible characters | React, Gemini, Procreate | Minor | No | Art contest |

Not found: winners of Best Joke Hack (probably [Search History Court](https://devpost.com/software/search-history-court), unverified), [MLH] Snowflake and the third Deepgram slot. **Blocked:** `https://devpost.com/software/search-history-court` came back as empty content from WebFetch twice, including with `?ref=gallery`. SB Hacks gallery page 2 showed no further winner badges.

### Observations
- All three overall winners were **voice- or vision-driven assistants that act**, not chatbots: a podcast voice agent, a camera monitor that triggers actions via MCP, and a Gemini Computer-Use browser agent for blind users.
- Voice (Deepgram/ElevenLabs) appears in about half the winners. Sponsor APIs strongly shaped the prize list.
- MCP or function-calling agents appear in 2nd place (Lumenta) and in Deepgram winners (Nomad, Buildr), even at this smaller event.
- Accessibility with a clear user (blind users, people with disabilities, deafblind users at LA Hacks) keeps showing up among podium finishers.

---

## DiamondHacks 2026 (UCSD)

- Devpost: https://diamondhacks-2026.devpost.com/ | Website: https://diamondhacks.acmucsd.com/
- Dates: April 4-5, 2026, UCSD (La Jolla). Run by ACM@UCSD, "San Diego's Largest Project".
- Size: 366 participants. **134 submissions**. Prize pool about $25.7k (overall: $4,500 / $3,000 / $1,800 cash).
- Themed tracks: Alchemy of the Earth (social impact/sustainability), Elixirs of Vitality (health), The Scholar's Spellbook (education), Enchanted Commerce (e-commerce), The Rogue's Ritual (wildcard).

### Tracks & prizes
| Prize name | Sponsor | What it asked for | Reward |
|---|---|---|---|
| 1st / 2nd / 3rd Overall | ACM@UCSD | Best overall | $4,500 / $3,000 / $1,800 cash + AirPods Pro 3 / Keychron / JBL + Browser Use credits |
| Alchemy of the Earth | ACM@UCSD | Environmental/social solutions | $250 + Owala |
| Elixirs of Vitality | ACM@UCSD | Health/wellness | $240 + Peak Design |
| Scholar's Spellbook | ACM@UCSD | Education | $270 + mini projector |
| Enchanted Commerce | ACM@UCSD | E-commerce/payments | $250 + AirTags |
| Rogue's Ritual | ACM@UCSD | Boundary-breaking wildcard | $250 + Sony speaker |
| CSE: Best Interactive AI | UCSD CSE | "AI to build interactive software focused on entertainment" | $3,350 + M4 iPad Air |
| Best Use of Browser Use | Browser Use | Impactful project using the Browser Use platform | $3,540 + iPhone 17 Pro, AirPods Max, hacker-house week |
| Best Use of Fetch.ai | Fetch.ai | Build agents on Agentverse | $300/$200/$150 + internship interviews |
| Qualcomm Multi-Device Track ("Build Across the Snapdragon Multiverse") | Qualcomm | Multi-device AI apps across Snapdragon platforms | $2,000 + Meta Quest 3 |
| TwelveLabs Video Understanding ("Build The Future of Video Understanding") | TwelveLabs | Video understanding | $650 + 50/40/30 hrs credits |
| Best Solo / Duo / Beginner / Mobile / UI/UX / AI/ML Hack | ACM@UCSD | As named | $140-$460 + gear |
| [MLH] Gemini API / ElevenLabs / Solana / Vultr / .Tech Domain | MLH partners | Use the named tech | Swag/hardware |

### Winners
| Place/Prize | Project | GitHub | What it does / who for | Built with | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **1st Overall** | [SODIUM](https://devpost.com/software/sodium) | none listed | "Jarvis for senior citizens": a voice-first care robot that follows the senior, holds conversations, sets medication reminders, **performs web tasks for them** and detects crises (calls family). Includes a caregiver dashboard | Svelte 5, Bun/TS, SQLite, Cerebras (Llama-class), AssemblyAI, ElevenLabs, **Browser Use**, Bland (outbound calls), ROS 2, YOLOX | **Voice agent with tool calling** ("can invoke tools instead of only chatting") that delegates to a Browser Use web agent. Crisis-language detection → escalation phone call | **Yes**: ROS 2 human-following robot (YOLOX + PID) | None stated |
| **2nd Overall** | [MedSurge AI](https://devpost.com/software/medsurge-ai) | github.com/d3pant/diamond-hacks | Upload a diagnosis PDF → real drug prices (GoodRx), exact surgery costs (hospital price-transparency files + CMS fee schedule), travel plan and calendar booked, insurance claim pre-filled. For patients after a serious diagnosis | Groq llama-3.3-70b, **Browser Use** cloud, Composio, GCP, Google Calendar/Places, pypdf | **Multi-agent**: Analyzer (structured JSON extraction), Medicine agent (Browser Use on GoodRx), Surgery-cost agent (CPT mapping + CMS data), Travel agent. **Human-in-the-loop confirmations** before actions | No | None stated. Grounded in real public datasets (CMS PPRRVU2026, price-transparency files) |
| **3rd Overall** | [Piggy.ai](https://devpost.com/software/piggy-ai) | none listed | "Brutally honest financial twin": analyzes a bank CSV and projects your future in one of 3 personas (disappointed parent, Wall St trader, Buddhist monk). For college students | React, Express, MongoDB, Gemini, ElevenLabs, Browser Use | Prompt-engineered LLM personas. Not really agentic | No | None stated. Likely humor and personality (unverified) |
| Track: Elixirs of Vitality (Health) | [LungIQ](https://devpost.com/software/lungiq) | github.com/krishkankure/lungiq | CT scan + records → similar historical cases, treatment patterns, matching trials and literature. For oncology teams | FastAPI, pydicom, SimpleITK, ChromaDB, OpenAI, Browser Use | Radiomics embeddings + **RAG over the cohort**. **Browser Use agents search ClinicalTrials.gov and PubMed live** | No | None stated |
| Track: Alchemy of the Earth | [Luna Grid](https://devpost.com/software/luna-grid) | github.com/Rebecca-J7/luna-grid | Live map of restroom pad/tampon stock via ESP32 cameras | Next.js, Leaflet, ESP32-CAM, Edge Impulse, Supabase | TinyML object detection on-device. No LLM | **Yes** | None stated |
| Track: Scholar's Spellbook | [SmartCookie](https://devpost.com/software/smartcookie) | github.com/lgullon/DiamondHacks2026 | Highlight dense text → matching YouTube videos, bullet notes and a quiz | Claude Haiku, YouTube Data API, FastAPI, Chrome ext | Single LLM calls (query gen, summary, quiz) | No | None stated |
| Track: Enchanted Commerce | [PriceWar](https://devpost.com/software/pricewar) | none listed | 3 autonomous shopping agents: find price drops and **negotiate refunds by live chat and AI voice calls**, detect and remove checkout dark patterns, and buy at the best price | Browser Use, Playwright, Firecrawl, Grok-3, **Vapi** voice, FastAPI, Chrome MV3 | **Browser agents on authenticated sessions + voice-calling agents**, with human approval gates on purchases | No | None stated |
| Track: Rogue's Ritual (Wildcard) | [Agent UX](https://devpost.com/software/agent-ux) | github.com/jadenseangmany/diamondhacks-2026 | AI personas (elderly user, first-timer...) **actually click through any website** to find usability issues, rank them and inject CSS/JS fixes with live preview. For small teams without research budgets | Gemini, Browser Use, Playwright, FastAPI, Chrome ext | 7-step async pipeline. Browser Use persona agents + a second LLM pass generates the fixes | No | None stated |
| CSE: Best Interactive AI | [inVISION](https://devpost.com/software/invision-5egbth) | github.com/MICH3LL3D/inVISION | 2D photo → 3D model you rotate and scale with hand gestures | MediaPipe, OpenCV, Pygame, NumPy | AI mesh generation + gesture CV | Webcam | None stated |
| Best Use of Browser Use | [Straightline](https://devpost.com/software/straightline) | github.com/Alex-Bonev/straightline | Explore a venue in a photorealistic 3D splat before visiting, with accessibility annotations. Agents check 10 ADA criteria. For about 18M Americans with mobility impairments | Next.js, Three.js Gaussian splats, World Labs Marble API, **Browser Use v3 + Claude Haiku**, Google Maps/Places, Supabase | **3 parallel Browser Use agents** (text, visual limited to 8 photo actions, resolver) + an annotator agent that navigates Street View | Cloud GPU | None stated |
| Best Use of Fetch.ai | [AgenticHire](https://devpost.com/software/agentichire-2xyk0z) | github.com/quachphu/UCSD-PROJECT | CEO types one sentence and 5 agents write the JD, find, rank (0-100) and email candidates | uAgents, ASI:One, cosmpy (on-chain), SendGrid, Twilio | 5-agent pipeline with FET micropayment | No | None stated |
| Best Use of Fetch.ai + TwelveLabs | [Kaimon](https://devpost.com/software/kaimon) | github.com/SanjayMarathe/barcodebot | Scan an object → a fleet of agents learns your buying habits and buys end-to-end, with a supply-chain risk globe | TwelveLabs Pegasus, Claude Haiku, **9 Fetch.ai uAgents**, Browser Use, Stripe | Orchestrator, search, ranker, treasury (budget approval) and 4 parallel buyer agents doing browser checkout | Camera | None stated |
| Best Use of Fetch.ai | [Boomer Browse](https://devpost.com/software/boomer-browse) | github.com/thouartmammal/DiamondHacks | Desktop app + extension for people with dementia: detects "memory conflicts" and adapts web content and conversations | Browser Use, Fetch.ai, Electron | 3-agent chain (perception, drift detection, memory) | No | None stated |
| Qualcomm Multi-Device | [Dio Design](https://devpost.com/software/dio-design) | github.com/Sanjith-Shan/Dio-Design | Voice-controlled AR 3D design workspace: speak and objects appear | Llama-3.3-70B on Qualcomm Cloud AI 100, Stable Diffusion, three.js | LLM generates three.js code, executed live in AR | **Yes**: Snapdragon X Elite PC, Galaxy S25 Ultra, Dragonwing board, 3D-printed headset | None stated |
| TwelveLabs | [WeSeeOn](https://devpost.com/software/weseeon-see-through-sound-feel-through-motion) | github.com/authentic-arc/WeSeeOn | Table tennis for blind players using haptic belt, audio cues and an AI coach | YOLOv8, Arduino, Fetch.ai uAgents, Gemini, Qualcomm QNN, ElevenLabs, MQTT | Agents for opponent, coach, umpire narration and metrics | **Yes**: Arduino UNO Q haptic belt, phone-as-racket | None stated |
| TwelveLabs | [Vigilens](https://devpost.com/software/safewatch-nkf7uq) | github.com/RyanDang363/DiamondHacks2026 | Workplace (commercial kitchen) safety and efficiency video monitoring | TwelveLabs, Fetch.ai, Browser Use | Multi-agent video-event interpretation | Cameras | None stated |
| Best Solo Hack | [dropper.ai](https://devpost.com/software/dropper-ai) | github.com/benhuang3/diamondhacks2026 | Automated website audits (accessibility, competitor pricing) for first-time e-commerce owners | Claude, Browser Use, Agentverse, FastAPI, Next.js | Parallel Claude agents. The orchestrator spawns more sites when anti-bot blocks one | No | None stated |
| Best Duo Hack | [FocusFlow](https://devpost.com/software/focusflow-fv2ock) | github.com/jujubesum/diamondhacks | Rebuilds webpages for ADHD, dyslexia and sensory or motor needs | Chrome MV3, Groq Llama 3.1 8B | LLM page summaries | No | None stated |
| Best Beginner Hack (x3) | [Quiz Stream](https://devpost.com/software/quiz-stream), [WorldTour](https://devpost.com/software/worldtour) (also [MLH] .Tech Domain), [CarePilot](https://devpost.com/software/carepilot-kqigca) | QuizStream: github.com/Ahmonemb/QuizStream. WorldTour: github.com/AndrewR270/WorldTour | Lecture-video quizzes / AI world-history map / wellness companion with web automation | TwelveLabs+Gemini / Gemini+Leaflet / Gemini+Browser Use | LLM features. CarePilot uses a Browser Use agent | No | None stated |
| Best Mobile Hack | [Mood Mapping](https://devpost.com/software/mood-mapping) | none listed | Mood log → coping strategies, with escalation to live support | Claude API, ASI:One, React | LLM recommendations + distress flagging | No | None stated |
| Best UI/UX | [Campion](https://devpost.com/software/campian) | none listed | Finds dispersed camping spots from topo data, Reddit and websites | Browser Use, FastAPI, Mapbox | Parallel Browser Use agents merge findings | No | None stated |
| Best AI/ML Hack | [SwarmSell](https://devpost.com/software/swarmsell) | github.com/adityasingh2400/SwarmSell | Film your stuff → a **swarm of browser agents** researches comps and posts live listings on FB Marketplace, Depop and Amazon while you watch | Browser Use, Gemini, Deepgram Nova-3, Groq Llama 4 Scout, OpenCV, CDP | Concurrent browser agents (optimized to about 200-400 MB per context) | No | None stated |
| [MLH] Gemini API | [DracoCare](https://devpost.com/software/blah-er32gb) | not read | Dragon-pet health companion with medical analysis and VAPI clinic booking | Gemini, Groq, VAPI, Playwright | Voice booking agent | No | None stated |
| [MLH] ElevenLabs | [Dead Ringer](https://devpost.com/software/deadly-ringer) | not read | AI detective chat game | Gemini, ElevenLabs | LLM character + clue extraction | No | None stated |
| [MLH] Solana | [Clipchain](https://devpost.com/software/clipchain) | not read | Upload rare video clips and earn SOL based on an AI rarity score | TwelveLabs, Gemini, Solana, Vultr | Video understanding → scoring | No | None stated |
| [MLH] Vultr | [Inbtwn](https://devpost.com/software/inbtwn) | not read | Canvas syllabi → calendar and reminders | Claude Sonnet 4 (OpenRouter), Gemini 3 Flash, Browser Use | LLM extraction | No | None stated |

### Observations
- **Browser agents were the dominant pattern.** Browser Use was a sponsor (and its credits were part of the overall prizes), and all three top AI placings (SODIUM, MedSurge, LungIQ), plus PriceWar, Agent UX, Straightline, SwarmSell and Campion, have an agent operating real websites for the user.
- 1st place combined a physical robot, a voice agent and web-task delegation for a very concrete user (seniors plus remote family). 2nd place grounded its agent in real government price data and added human-in-the-loop checkpoints.
- Agents taking consequential actions (buying, booking, calling, negotiating) consistently include **approval gates**: PriceWar, MedSurge, Kaimon's treasury agent.
- Accessibility-for-a-named-group again: seniors, dementia, blind table tennis, mobility-impaired venue scouting, ADHD/dyslexia.

---

## IrvineHacks 2026 (UCI)

- Devpost: https://irvinehacks-2026.devpost.com/ | Website: irvinehacks.com (unverified; Devpost is the main record)
- Dates: Feb 27 - Mar 1, 2026, UCI Student Center.
- Size: 388 registered. **113 submissions**. Prize pool about $10.2k.

### Tracks & prizes
| Prize name | Sponsor | What it asked for | Reward |
|---|---|---|---|
| Best Overall | IrvineHacks | Overall | $1,300 + Meta Quest 3S |
| Best Runner-Up | IrvineHacks | Overall | $1,520 + Hiboy scooter |
| Hacker's Choice | IrvineHacks | Peer vote | $1,420 + Bose headphones |
| Best Beginner Hack | IrvineHacks | Beginners | $300 + LEGO |
| Best Sustainable Hack | IrvineHacks | Sustainability | $500 + speaker |
| Most Innovative Use of Arduino UNO Q | Qualcomm | Build on the Arduino UNO Q board | $1,400 + starter kits |
| Best Use of AI in Real Estate (1st/2nd) | First American | AI for real estate / title / escrow | $600 + internship interview / interview |
| Best UI/UX Hack (1st/2nd) | Opennote | UI/UX | $2,000 + iPad / $800 |
| Best AI Safety Hack | AI Safety at UCI | AI safety | $200 + fellowship admission |
| Best Neuro Hack | Cognitive Science Assoc. | Neuro/cognition | $160 + drone |

### Winners
| Place/Prize | Project | GitHub | What it does / who for | Built with | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **Best Overall** | [Candid](https://devpost.com/software/candid-cmui2a) | github.com/kaylazhang07/IrvineHacksCandid | Takes real ballot measures, models the **financial impact on your household** (ZIP + income) and explains it in plain English with citations. For voters | FastAPI, scikit-learn, sentence-transformers, ChromaDB, Groq Llama 3.3 70B, Census data, OpenStates, Mapbox, Next.js | **RAG** (semantic retrieval + LLM rerank) + a regression budget model trained on Census data. Not agentic | No | None stated. Tagline stresses "REAL LEGISLATION. REAL BUDGET MODELS. REAL DATA." |
| **Best Runner-Up** | [ADYou](https://devpost.com/software/adyou) | github.com/AbhinavSatheesh12/IrvineHacks2026 | Can I build an ADU on my lot? Instant zoning check, RAG advisor on the CA HCD Handbook, financials and a rental marketplace. For CA homeowners | Next.js, Mapbox Draw, Turf.js, FastAPI, PyTorch, sentence-transformers, Groq Llama 3, Gemini | RAG + intent classification, answering "strictly on official documentation" | No | None stated |
| Hacker's Choice | [GeardUp!](https://devpost.com/software/geardup) | github.com/mhtruong1031/geardup | EMG muscle signals drive a car sim or RC vehicle. For people with ALS, stroke or spinal injury | Python, NumPy, SpikerBox, Arduino UNO Q | None | **Yes** (EMG) | Peer vote |
| Best Beginner Hack | [Paddle Pulse](https://devpost.com/software/paddle-pulse) | github.com/SihoChoii/pickleball_paddle_program | Sensorized pickleball paddle with swing analytics vs. pro benchmarks | Arduino UNO Q, IMU, piezo, InfluxDB, Three.js | None | **Yes** | None stated |
| Best Sustainable Hack | [EcoScape](https://devpost.com/software/ecoscape) | github.com/jasminemarwaha1234/sustainable-garden | ZIP-aware sustainable garden planner with an eco scorecard | Flask, React, OpenAI | LLM (details not given) | No | None stated |
| Qualcomm Arduino UNO Q | [Cibatus](https://devpost.com/software/cibatus) | github.com/gayathriy22/cibatus | Too much screen time and your real plant gets less water. Four bad days and servo scissors cut a stem | React Native, Supabase, Arduino UNO Q, Flask | None | **Yes** | None stated |
| AI in Real Estate 1st (First American) | [FASTer](https://devpost.com/software/faster-dh80x6) | github.com/KanecOlivares/IrvineHacks2026-FASTER | Redesign of First American's internal FAST escrow tool, plus a POA/deed Parsing Agent and a RAG Risk Analysis Agent. For escrow officers | Claude (Anthropic SDK, Haiku), Gemini, FastAPI, React | **2 agents**: parsing/validation, and a RAG risk agent over a 225-rule domain KB with document-grounded multi-turn chat | No | None stated. It targeted the sponsor's own internal tool |
| AI in Real Estate 2nd | [RedwoodAI](https://devpost.com/software/redwoodai) | github.com/diyadesai1/RedwoodAI | PII redaction on title docs + property climate-risk prediction | BERT NER (ONNX), regex, MLP ensemble, Express, React, MongoDB | Classical NER + ML. No LLM | No | None stated |
| Best UI/UX 1st (Opennote) | [Lily](https://devpost.com/software/lily-vo9tj0) | github.com/oliiviiak/IrvineHacks2026-LILY | Friendly flower-shaped device that helps seniors understand medical and financial documents by conversation | Claude (tool calls), React Native, Python, SQLite, Figma, Arduino UNO Q | **Claude with tool calls wired to hardware** (mic, camera) | **Yes**: flower device | None stated |
| Best UI/UX 2nd | [Looseleaf](https://devpost.com/software/looseleaf) | github.com/Nekorra/Looseleaf | Shared whiteboard with an AI partner that **draws on the canvas** rather than chatting | OpenAI multimodal, Next.js, Fastify, WebSockets, Supabase | Multimodal model outputs structured board "micro-ops" (a form of tool/action output) | No | None stated |
| Best AI Safety Hack | [Claw-Jail](https://devpost.com/software/claw-jail) | github.com/SeanSan06/claw-jail | Security middleware between an OpenClaw agent and the host: live dashboard, risk-scores each tool call 1-100 and pauses above a threshold for human approval | React, FastAPI, Docker, OpenClaw, Wispr Flow, Gemini | **Agent guardrail**: LLM risk-scores planned tool calls, with human-in-the-loop | No | None stated |
| Best Neuro Hack | [PocketZot](https://devpost.com/software/pocketzot) | github.com/antsuh1028/PocketZot | Browser extension grades your AI prompts for "cognitive offloading". A virtual pet's health reflects your habits | OpenAI (fine-tuned), FastAPI, React, Postgres | **Fine-tuned LLM classifier** on a custom Bloom's-taxonomy-style labeled dataset (-3 to +2 scale) | No | None stated |

### Observations
- The overall and runner-up prizes went to **RAG-grounded civic/consumer tools built on real public data** (ballot measures + Census, CA zoning handbook), not autonomous agents. "Grounded, cited and no hallucinations" was the pitch.
- Sponsor prizes rewarded fit to the sponsor: FASTer rebuilt First American's actual internal tool. The Qualcomm prize went to builds on the UNO Q board.
- Agent-safety themes appeared here too (Claw-Jail: human approval above a risk threshold).

---

## Cross-event takeaways (for Edison)
1. **Agents that act in the real world beat chatbots** at every event: browser agents booking, buying or listing (DiamondHacks), voice agents calling people (SODIUM, PriceWar, YES? or YES!), and an MCP-triggered alert system (Lumenta).
2. **Tools that make coding agents better** won the top of the largest event (LA Hacks 1st and 3rd). Judges there responded to measured benchmark gains.
3. **A specific, sympathetic user** comes up again and again: seniors, deafblind or blind users, disaster victims, patients facing costs, voters.
4. **Grounding and guardrails** are an explicit part of many winners: RAG on official docs, deterministic fallbacks, human-approval gates, and agent risk scoring.
5. **Sponsor fit matters**: most winners stacked 1-3 sponsor technologies (Fetch.ai, Browser Use, TwelveLabs, Deepgram, ElevenLabs) and won both a main prize and a sponsor prize.

---

# Midwest projects, 2026 editions: what won

Researched 2026-09-26. Sources: Devpost event pages, project-gallery pages and individual project pages, all fetched with WebFetch. A "Why it won" of "none stated" means the Devpost page has no judges' comments or rationale. The "Built with" and "AI/agent use" columns come from each project's own Devpost write-up and were not checked against the code.

**Scope status**
| Event | 2026 edition happened? | Winners public? | Covered |
|---|---|---|---|
| HackIllinois 2026 (UIUC) | Yes, Feb 27 – Mar 1, 2026 | Yes (Devpost) | All 33 winners; every project page read |
| BoilerMake XIII (Purdue) | Yes, Jan 23–25, 2026 (from boilermake.org / OSU listing) | **Not found** | Nothing is on Devpost (see blocked notes) |
| WildHacks 2026 (Northwestern) | Yes, Apr 11–12, 2026 | Yes (Devpost) | All 16 winners; every project page read |
| SpartaHack 11 (MSU) | Yes, Jan 31 – Feb 1, 2026 | Yes (Devpost) | Overall and track winners, plus most sponsor winners |
| HackKU26 (Kansas) | Yes, Apr 18–19, 2026 | Yes (Devpost) | Overall, themed and main special winners |
| MHacks 2026 (Michigan) | **No.** Scheduled Oct 3–4, 2026 (mhacks.org) | n/a | Out of scope. The last Devpost edition is MHacks 2024 (Sep 2024) |
| MadHacks (UW-Madison) | No 2026 edition on Devpost yet. The latest is "MadHacks Fall 2025" (Nov 22–23, 2025) | n/a | Out of scope |
| RevolutionUC (Cincinnati) | No 2026 Devpost page found. The latest is revolutionuc-2025 (Mar 2025) | n/a | Out of scope (unverified whether a 2026 edition ran on another platform) |

---

## HackIllinois 2026

- Devpost: https://hackillinois-2026.devpost.com/ ; site: https://hackillinois.org (prizes page: hackillinois.org/prizes)
- Dates: Feb 27 – Mar 1, 2026, at Siebel Center for Computer Science, UIUC. The theme and branding were "HackAstra", with a "HackVoyager" path.
- 678 participants and 226 submitted projects (10 gallery pages). Devpost lists a prize pool of $17,920+ in cash; a CliffsNotes page claims "$75K in prizes" (unverified).
- There are 33 winner badges, all on gallery pages 1–2.

### Tracks & prizes
| Prize | Sponsor | What it asked for | Reward |
|---|---|---|---|
| Best Voyager Hack (grand prize) | HackIllinois | Best overall project in the HackVoyager path: innovation, functionality, technical complexity, impact, execution | $5,000 |
| Best General Hack | HackIllinois | Best project in the general path | $2,500 |
| Best Beginner Hack | HackIllinois | Best beginner team | EPOMAKER keyboard per member |
| Most Popular | HackIllinois | Popular vote | Sony headphones per member |
| Best Social Impact | HackIllinois | Social impact | Marshall speakers + $50 charity donation per member |
| Best UI/UX Design | HackIllinois | Design | Instax Mini 12 per member |
| Most Creative | HackIllinois | Creativity | Ninja coffee machine per member |
| Most Useless | HackIllinois | Joke/useless hack | Nerf gun + walkie-talkie per member |
| Best Web API (1st/2nd) | Stripe | "Build a well-crafted API, focusing on the surface, developer experience, and correctness" | 1st: $2,000 + JBL Tour One M2 per member; 2nd: $500 + $100 Amazon per member |
| Best AI Inference (1st/2nd/3rd) | Modal | "Ambitious applications running inference on Modal to solve real-world problems" | 1st: $2,000 + $5k Modal credits per person + SF/NY office trip; 2nd: $500 + $1k credits + AirPods; 3rd: $1k credits + AirPods |
| Best AI Inspection (1st/2nd/3rd + 3 honorable mentions) | Caterpillar | AI for field operations and logistics: inspections, parts identification, site planning | 1st: $1,500 + Ray-Ban Meta glasses per member + executive pitch; 2nd: $700 + keyboard; 3rd: $300 + keyboard |
| Best Hardware Hack, "Mechathon" (1st + Easy/Medium/Hard + honorable mention) | John Deere | Hardware integration, from IoT to robotics. In practice the challenge was a sand-leveling robot | 1st: $2,500 + ranch ride-along + leadership call |
| Best Use of Developer Platform | Cloudflare | Build on Cloudflare (Workers, etc.) | $5,000 Cloudflare credits per member |
| Best Use of API | OpenAI | Use the OpenAI API | $5,000 OpenAI credits per member |
| Best Use of Nessie | Capital One | Use the Nessie project banking API | $300 gift card per member |
| Best Use of Supermemory | Supermemory | "App that remembers, understands, and adapts" (context/memory APIs) | Meta Ray-Bans per member |
| Best Use of Solana | Solana | Apps using fast execution and near-zero fees (games, DeFi, supply chain) | $5,000 in crypto + Ledger per member |
| Actian VectorAI DB (1st/2nd/3rd) | Actian | AI app using vector search: RAG, recommendations, semantic search | $300 / $120 + AmEx cards; 3rd: Anker hubs |
| Best Deployed on Aedify | Aedify | Most novel project deployed live on an external domain | $300 credits + 5 months of OpenClaw per member |
| MLH Best Use of ElevenLabs | MLH/ElevenLabs | Use ElevenLabs | Earbuds |
| MLH Best Use of Gemini API | MLH/Google | Use Gemini | Swag kits |
| MLH Best Use of AI (Reach Capital) | MLH/Reach Capital | Best use of AI | Logitech webcam + investor meeting |
| MLH Best Use of DigitalOcean | MLH | Use DigitalOcean | Mouse |
| MLH Best Use of Snowflake API | MLH | Use Snowflake | M5Stack Tab5 |
| MLH Best .Tech Domain | MLH | .tech domain | Microphone + 10-year domain |

### Winners
| Place/Prize | Project (Devpost link) | GitHub | What it does / who for | Built with | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **Best Voyager Hack (grand prize, $5k)** | [Orca](https://devpost.com/software/orca-net) | github.com/ryunzz/orca (demo: fire-orca.vercel.app) | Builds 3D "world models" of real buildings so firefighters and emergency responders can train on disaster scenarios without burn buildings. Multiple agents label the scenes | Next.js, React Three Fiber, Mapbox, Modal, PostgreSQL, Redis, Solana, Docker, FastAPI, TS, Python, World Labs API | **Autonomous multi-agent orchestration**: vision agents (Llama Vision, GPT-4 mini) are dropped into the 3D world model, navigate on their own, analyze the scene in parallel and share state over Redis. Their outputs are combined by consensus with confidence scores to cut hallucinations. Claude API handles reasoning and World Labs does the 3D reconstruction | No | None stated. The page pitches "multi-agent synthesis reduces error" |
| **Best General Hack ($2.5k)** + Best Use of Cloudflare | [Synapse](https://devpost.com/software/synapse-dx7hcr) | github.com/Aqtion/synapse | UX feedback loop for developers: captures a user tester's emotions (webcam), clicks and spoken feedback, then **automatically opens GitHub PRs** with the fixes | Cloudflare Workers/Durable Objects, Convex, Next.js, ElevenLabs, Gemini, Hume AI, Supermemory, GitHub API, Better Auth, Resend | **Agentic coding pipeline**: ElevenLabs STT feeds Gemini (condenses speech into instructions), then Cloudflare AI edits the code in sandboxes and a PR is opened. Hume detects emotion; Supermemory keeps long-term memory of prior edits. Also uses voice | No | None stated |
| Best Beginner Hack | [CATCare](https://devpost.com/software/catcare) | github.com/allanluo-illinois/hackIllinois2026 | Voice-first inspection for Caterpillar equipment: a technician talks and the app fills a structured checklist | Flutter, FastAPI, Firebase, Gemini 2.5 Flash, PyTorch, OpenCV, LibROSA, Silero VAD, SuperPoint/LightGlue | **Voice agent** with 2 Gemini personas (Inspector and Manager/Reviewer), structured JSON tool outputs and clarification loops. Also audio anomaly detection (MFCC) and CV zone localization | Phone / Meta Ray-Ban compatible | None stated (the fetch summarizer claimed "practical human-AI collaboration"; unverified) |
| Most Popular | [BrainrotTCG](https://devpost.com/software/brainrottcg) | none (demo evanlin23.github.io/BrainrotTCG) | Collectible trading-card pack-opening game with "brainrot" cards | JS, React, Vite | Gemini "Nano Banana 2" image generation for the card art | No | Popular vote |
| Best Social Impact | [Ligands](https://devpost.com/software/ligands) | none listed (ligands.tech) | Answers "does this drug bind this protein?" for computational biologists by automating docking screens | Python, FastAPI, Postgres, React, Three.js, AlphaFold, ESMFold, Boltz-2, GNINA, OpenMM, Modal, Docker | **LLM-orchestrated tool pipeline**: Claude picks the tools and spawns parallel subagents on Modal GPUs, then synthesizes a consensus across docking methods | No | None stated. Claimed result: independently rediscovered Gleevec among 50 anonymized molecules, and compressed a 5-hour NIH protocol to under 15 minutes |
| Best UI/UX Design | [Studuvalley](https://devpost.com/software/studuvalley) | not provided (studuvalley.vercel.app) | Shared study rooms, notes and focus timers, with collectible-pet rewards, for students | Next.js, Supabase, Tailwind, WebSocket | None | No | None stated |
| Most Creative + **Modal Best AI Inference 1st** + MLH Best Use of Gemini | [OpenReality](https://devpost.com/software/real-eyes-mra8n6) | github.com/bdavidzhang/Open-Reality | Real-time 3D mapping from a phone camera, with spatial Q&A, for first responders and accessibility users | Python, PyTorch, VGGT-1B, GTSAM, SAM3, CLIP, DINO, Flask, Socket.io, Three.js, Modal, Claude, Gemini | **Agentic spatial reasoning**: Claude does intent planning, continuous detection, retroactive search and spatial Q&A over a live 3D map. Vision models run on Modal GPUs | Phone camera only | None stated |
| Most Useless | [DILLIGAD](https://devpost.com/software/dilligad) | github.com/kristin-wiseman/DILLIGAD | Chrome extension that hides ducks on web pages for you to collect | JS/HTML/CSS | ChatGPT used only to help write the code | No | None stated |
| Stripe Best Web API 1st | [EcoApi (Recost)](https://devpost.com/software/ecoapi) | github.com/AndresL230/ecoapi | Dev tool plus VS Code extension that shows the hidden cost and carbon of the API/LLM calls in your code, with fixes | Cloudflare Workers, Hono, React, SQLite, D3, OpenAI API, VS Code Extension API | Cloudflare AI (Llama 3.1 8B) chat, plus OpenAI explaining issues in the IDE | No | None stated |
| Stripe Best Web API 2nd + Best Use of Supermemory | [Superstyle](https://devpost.com/software/superstyle) | github.com/danielxies/superstyle | Virtual try-on for online shoppers | Next.js, Hono, AWS Lambda, Gemini, ElevenLabs, Serper | Gemini 2.5 Flash vision and image generation; an OpenAI-powered text and **ElevenLabs voice agent** stylist; Supermemory graph memory of style preferences | No | None stated |
| Modal Best AI Inference 2nd | [LARYNX](https://devpost.com/software/voxlarynx) | github.com/Gladdonilli/hackillinois-2026 | Detects voice deepfakes by reconstructing the implied tongue and lip motion and flagging physically impossible articulator speeds. For content-verification teams | Python, Modal (B200), HuBERT, Cloudflare Workers/D1/R2/Vectorize, React, Three.js | ML pipeline (HuBERT, an acoustic-to-articulatory model, a gradient-boosting classifier with 89% accuracy across 73 TTS systems). No LLM agent | No | None stated |
| Modal Best AI Inference 3rd | [Vizem Flow](https://devpost.com/software/vizem-flow) | github.com/Akshath-Nagulapally/lipvisemes | Silent lip-reading text input ("5x faster than typing") for loud places or people with speech difficulties | MediaPipe, OpenCV, FastAPI, Modal, OpenAI, Supermemory | MediaPipe visemes are mapped to phonemes, then an OpenAI LLM reconstructs sentences, with Supermemory adapting to the user | Webcam | None stated |
| CAT Best AI Inspection 1st | [ease 'n spect](https://devpost.com/software/inspectus) | not provided | Mobile app for guided photo capture and automated assessment in heavy-machinery inspections | React Native/Expo, FastAPI, Supabase, Modal | Gemini 2.5 Flash vision, Whisper STT, Qwen 3 for part-replacement suggestions | Phone | None stated |
| CAT Best AI Inspection 2nd | [Cat Vision Copilot](https://devpost.com/software/cat-vision) | not provided | Live-video inspection that flags issues, ranks severity and writes reports, plus a chatbot for analytics | Python, React, OpenAI, YOLO, TensorFlow, OpenCV, HF, Ollama, Supabase, ElevenLabs | Vision detection plus an LLM chatbot that generates charts | No | None stated |
| CAT Best AI Inspection 3rd | [Cat-AR-pillar](https://devpost.com/software/cat-ar-pillar) | not provided | Hands-free AR part detection for inspectors | Unity, C#, YOLOv12-nano, Roboflow | On-device YOLO trained on 60 hand-labeled images. No LLM | **Meta Quest 3** | None stated |
| CAT honorable mention | [CATalyst Inspect](https://devpost.com/software/catalyst-inspect) | github.com/wadhwat/catalyst | Turns a walk-around video into a PASS/MONITOR/FAIL report, with corrosion detection | Expo, FastAPI, OpenCV, SQLite, OpenAI, Supermemory | YOLO, Qwen-VL, a fine-tuned corrosion model and an OpenAI report writer | Phone | None stated |
| CAT honorable mention + **MLH Best Use of AI (Reach Capital)** | [Symbiote](https://devpost.com/software/symbiote) | github.com/sujaldeshmukh1012/Symbiote | **Voice-agent** equipment diagnostics: inspectors talk instead of typing | FastAPI, Swift (iOS), React, Gemini, Ollama, Modal A10G | **Gemini 2.5 Flash with function calling** orchestrates the voice conversation; Qwen2-VL-7B compares photos against references and blueprints; a routing layer picks the knowledge base | iOS phone | None stated |
| CAT honorable mention | [ExcaVision](https://devpost.com/software/excavision) | github.com/gfires/caterpillar-ai-inspection | Image, text or voice input produces an editable excavator inspection report | React, Capacitor, FastAPI, Gemini Flash, Modal | Gemini Flash at temperature 0, run in parallel per part against deterministic criteria | Phone | None stated |
| John Deere Mechathon 1st + Easy Track | [TerraGlide](https://devpost.com/software/terraglide-ai) | not provided | Semi-autonomous sand-leveling rover with pedestrian-safety alerts | Arduino, ESP32, Python, PyTorch, React, YOLO | YOLO person detection | **Yes** (rover, ultrasonic sensors, 3D-printed blade) | None stated |
| John Deere Medium Track | [John Deere Sand Leveling Robot](https://devpost.com/software/john-deere-sand-leveling-robot) | not provided | 4-bar-linkage leveling robot | Arduino, C++, OnShape | None | Yes | None stated |
| John Deere Hard Track | [Mechathon Hard robot](https://devpost.com/software/mechathon-hard-robot) | not provided | Autonomous sand-plow robot | Arduino | None | Yes | None stated |
| John Deere honorable mention | [Track Team MEEP](https://devpost.com/software/john-deere-track-team-meep) | not provided | Corner-path autonomous leveler | C++ | None | Yes | None stated |
| OpenAI Best Use of API | [Aleithia](https://devpost.com/software/alethia-kelxoz) | github.com/gt12889/hackillinois2026 | Regulatory, market and political intelligence for small-business owners | Python, React, Modal, Actian VectorAI, GPT-4o, Docker, Clerk | Self-hosted Qwen3-8B on H100s, GPT-4o for deep-dive analysis and vision, BART/RoBERTa classifiers, YOLO for traffic | No | None stated |
| Capital One Nessie | [Velum](https://devpost.com/software/velum) | github.com/MarcDasilva/HackIllinois | Documents anchored on Solana, plus banking workflows through Nessie | Solana, Node, Python, TS | Adversarial ML to make documents unreadable to AI (prompt-injection overlays, UAP perturbations) | No | None stated |
| Solana Best Use | [TradeMaxxer](https://devpost.com/software/trademaxxer) | github.com/ArslanKamchybekov/trademaxxer | **Autonomous** news-to-trade bot for prediction markets: under 500 ms with no human in the loop | Python, FastAPI, Modal, Redis pub/sub, Solana, DFlow, Kalshi, Groq, Turnkey | Groq Llama 3.1 classifies each headline against markets and **decides and executes** BUY YES / BUY NO / SKIP | No | None stated |
| Actian VectorAI 1st | [Vigilante AI](https://devpost.com/software/vigilante-ai) | github.com/GALGALLOR/vigilant-ai | Makes CCTV footage searchable in natural language, with threat scoring, for security teams | Modal (A100), FastAPI, React, Actian VectorAI, Supermemory | YOLO11, CLIP embeddings, Qwen2.5-VL captions and Gemini reports; **multimodal RAG/semantic search** | No | None stated |
| Actian VectorAI 2nd | [Logian](https://devpost.com/software/team-habs) | github.com/bilalarif3197/LogianHackIllinois | BUY/SELL/HOLD signals from news for traders | FastAPI, React, Actian | FinBERT, MiniLM embeddings, vector search | No | None stated |
| Actian VectorAI 3rd | [LinkCare](https://devpost.com/software/linkcare-2fj4ya) | github.com/prabas007/patient-hub | Matches patients with peers who share their diagnosis and with doctors those peers trusted | Next.js, FastAPI, Modal, Actian, Gemini embeddings, Whisper, ElevenLabs | **Multi-agent consensus** from 3 Gemini specialist personas; voice in and out | No | None stated |
| Best Deployed on Aedify | [Model Behavior](https://devpost.com/software/model-behavior) | not listed (model-behaviour.aedify.ai) | Plague Inc.-style game where you play a rogue AI (AI-safety education) | React, Gemini, Actian, Aedify | Gemini, plus RAG (E5 embeddings and Gemma 3 4B) over news articles | No | None stated |
| MLH Best Use of ElevenLabs | [Syncr](https://devpost.com/software/syncr) | github.com/mohammed-alsalhi/syncr | Video dubbing that keeps the original voices, for creators | FastAPI, React, Modal, PyTorch, FFmpeg | faster-whisper, pyannote diarization, Demucs, GPT-4o translation, ElevenLabs voice cloning | No | None stated |
| MLH Best Use of DigitalOcean | [Nadir](https://devpost.com/software/nadir-co0wmk) | github.com/ianp-1/nadir | Disaster-damage detection from satellite imagery with Solana-based human verification | PyTorch, Next.js, Solana/Anchor, Prisma, Mapbox | CNN damage detection; uncertain regions go to human verifiers | No | None stated |
| MLH Best Use of Snowflake | [VanData](https://devpost.com/software/vandata) | not listed | Tracks vehicle pollution in Chicago from traffic video | FastAPI, OpenCV, Modal, Snowflake, Leaflet | Vehicle detection, plus a Snowflake RAG chatbot | No | None stated |
| MLH Best .Tech Domain | [BrightBet](https://devpost.com/software/brightbet) | github.com/EricSpencer00/HackIllinois26 | Prediction-market trade intelligence | Next.js, FastAPI, Cloudflare Workers, Groq, Polymarket, Finnhub | Groq Llama 3 sentiment and confidence scoring | No | None stated |

### Observations
- Both top prizes went to **agentic / multi-agent** systems. Orca's parallel vision agents with consensus in a 3D world, and Synapse's voice-to-code-to-PR pipeline, both took an agent loop to a **concrete end action** (labeled world model, merged-ready PR), not a chatbot.
- Modal was the dominant infrastructure: Orca, Ligands, OpenReality, LARYNX, Vizem Flow and at least 8 more winners ran GPU inference on Modal. Serious self-hosted models (VGGT-1B, Boltz-2, Qwen-VL, HuBERT) read as "technical depth".
- Claude was used as the **orchestrator or planner** in three of the top projects: Orca (reasoning), Ligands (tool selection and subagents), OpenReality (agentic spatial reasoning).
- Caterpillar's inspection track was crowded, and **voice-first plus vision** was the common pattern (CATCare, Symbiote, ease 'n spect). Symbiote's Gemini function-calling voice agent also took the general "Best Use of AI" prize.
- High-stakes, specific users (firefighters, drug discovery, inspectors, deepfake forensics) won most of the larger prizes. None of the pages carried judges' comments.
- Winners stacked prizes by integrating sponsor tech: OpenReality won 3 (Most Creative, Modal 1st, Gemini) and Synapse won 2 (General, Cloudflare).

---

## BoilerMake XIII (Purdue)

- Website: https://boilermake.org (it now shows "BoilerMake XIV"; /home still says "BoilerMake XIII – COMING JANUARY 2026").
- Dates: Jan 23–25, 2026, West Lafayette (from search snippets of boilermake.org and hack.osu.edu/boilermake-2026). Sponsors listed on boilermake.org include Caterpillar, D. E. Shaw, Roboflow, RunPod, Modal, Cartesia, Warp, Wolfram, Cockroach Labs, DigitalOcean, John Deere, Bloomberg, Palantir, Qualcomm, Capital One, sync.so and others. The site doesn't say which edition they sponsored (unverified).
- **Winners: NOT FOUND. The 2026 edition happened, but no public winners list was located.**

### What was tried (blocked / not found)
- `https://boilermake-xiii.devpost.com/` returned **HTTP 404**.
- `https://boilermake-xiii-2026.devpost.com/` and `https://boilermake-2026.devpost.com/` returned **HTTP 404**.
- The Devpost API (`devpost.com/api/projects?search=boilermake` and `?search=boilermake xiii`) lists editions only up to **BoilerMake XII (Feb 21–23, 2025)**, so XIII has no Devpost page.
- `https://boilermake.org/past` and `https://boilermake.org/` have no winners, project gallery or judging-platform link.
- `https://boilermake.org/schedule.pdf` (7.2 MB) downloaded but couldn't be parsed; poppler/pypdf are unavailable locally.
- Web searches ("BoilerMake XIII winner", Purdue Exponent, LinkedIn) returned nothing relevant; results were mostly about the Boilermaker road race.
- Conclusion: BoilerMake XIII probably judged off-Devpost. Winners might be on Instagram @boilermake or LinkedIn, which weren't fetched (both usually need a login).

---

## WildHacks 2026 (Northwestern)

- Devpost: https://wildhacks-2026.devpost.com/
- Dates: Apr 11–12, 2026, Technological Institute, Evanston IL. Theme: open-ended with "Past / Present / Future" tracks.
- 248 participants and 68 projects (3 gallery pages). All prizes were non-cash (14 prizes).
- Submissions required a public GitHub repo, a video of 2.5 minutes or less, and a write-up.

### Tracks & prizes
| Prize name | Sponsor | What it asked for | Reward |
|---|---|---|---|
| Overall 1st / 2nd / 3rd | WildHacks | Best overall | Anker headphones / Polaroid / JBL Go 3 |
| Track 1 – Past | WildHacks | Childhood games | MP3 player |
| Track 2 – Present | WildHacks | Community | Pickleball set |
| Track 3 – Future | WildHacks | Data storytelling | Mini projector |
| Crowd Favorite | WildHacks | Popular vote | Otamatone |
| Appifex AI (3 winners) | Appifex | Build with Appifex AI (an AI app builder) | Pro subscription + Amazon gift card |
| Claude AI (3 winners) | Anthropic/Claude | Use Claude | $50 Amazon gift card |
| MLH Best Use of Gemini API | MLH/Google | Use Gemini | Swag kits |
| MLH Best Use of ElevenLabs | MLH | Use ElevenLabs | Earbuds |
| MLH Best Use of Solana | MLH | Use Solana | Ledger |
| MLH Best Use of DigitalOcean | MLH | Use DigitalOcean | Mouse |
| MLH Best .Tech Domain | MLH | .tech domain | Mic + domain |

### Winners
| Place/Prize | Project (Devpost link) | GitHub | What it does / who for | Built with | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **1st Overall** | [Wildcat Arcade](https://devpost.com/software/game-k5v89x) | github.com/JeffersonWu25/wii-for-phone | Play Wii Sports Resort-style bowling with your phone as the Wii remote; no console needed | Node.js, React, Three.js, WebSockets | **None** | Phone as controller | None stated |
| **2nd Overall** | [Attenda Health](https://devpost.com/software/chud-hacks) | github.com/Bod1eF/wildhacks-2026 | Reworks the hospital call bell: nurses get personalized real-time task queues built from transcribed and translated patient requests | Next.js, React, Supabase, Claude, Gemini, ElevenLabs | Claude and Gemini transcribe, translate and summarize requests; ElevenLabs plays back translations. LLM pipeline, not autonomous agents | No | None stated |
| **3rd Overall** + Appifex AI | [Architec](https://devpost.com/software/audit-kc5eiw) | github.com/sarakhan7/wildhacks | Commercial-building energy audit in under 10 minutes from utility bills, weather and 5,000+ federal building records, with a 3D view. For building owners | React/Next, FastAPI, Three.js, Mapbox, Google Solar API, Gemini, ElevenLabs, scikit-learn, Supabase, DigitalOcean | Gemini OCR, reasoning and report generation; an **ElevenLabs conversational voice agent** with site-specific context injection | No | None stated |
| Track 1 – Past | [Paper Zoo](https://devpost.com/software/temp-w5idbp) | not listed (demo on vercel) | Origami tutorials with folds checked by camera; unlocks a pixel-art zoo | Next.js, Supabase, Gemini | Gemini 3.1 Flash Lite as tutor and **vision grader** (rubric JSON) | Camera | None stated |
| Track 2 – Present + Claude AI prize | [Haven](https://devpost.com/software/haven-kj3o4q) | github.com/Ayush7970/wildhacks_2026 | Sensory-aware navigation (noise, light, crowds) for neurodivergent people | Next.js, TensorFlow.js, Google Maps, Claude, Gemini, ElevenLabs, Supabase | Claude check-in messages, TF.js crowd detection, TTS | No | None stated |
| Track 3 – Future | [VascuSense](https://devpost.com/software/cerebrovascular-arterial-blood-vesel-analysis) | github.com/dustintliang/WildHacks26 | Segments brain-MRI vessels, flags stenosis or aneurysm and gives a risk score, for clinicians | Python, FastAPI, React, Three.js, Docker, Claude, Gemini | Gemini writes clinical narratives on top of CV segmentation | No | None stated |
| Crowd Favorite | [VibeBuild](https://devpost.com/software/vibe-builder) | github.com/nguyencomputing/VibeBuild | Describe a Minecraft structure in English and it gets built in-game, or exported as PDF blueprints | Claude API, Python, Java (Paper/Bukkit), Flask | **Two-pass Claude pipeline**: a "Designer" agent refines the spec, then an "Architect" agent emits block-coordinate JSON that the server plugin executes | No | None stated. The team says splitting plan from execution "dramatically improved output quality" |
| Appifex AI | [ForeSight](https://devpost.com/software/foresight-ai-dw8i6p) | not provided | Adaptive AI interview that predicts a startup's funding probability | React, FastAPI, scikit-learn, OpenAI, Claude, Gemini | LLM adaptive questioning, rubric scoring and memo writing; random forest plus k-NN over YC data | No | None stated |
| Appifex AI | [Screentime estimator](https://devpost.com/software/screentime-estimator) | github.com/mickeypark0323/screentimewasteai-mobile-cb51d009 | Reads Screen Time screenshots and projects usage | React, Gemini, Appifex | Gemini vision extraction | No | None stated |
| Claude AI | [volana](https://devpost.com/software/volana) | not provided | Neural volatility-surface simulator for options traders, with a voice agent | PyTorch, FastAPI, Three.js, ElevenLabs, Gemini | Gemini 2.5 Flash intent parsing plus an **ElevenLabs conversational voice agent** | No | None stated |
| Claude AI | [RenovateAI](https://devpost.com/software/renovateai) | github.com/tejprattipati/RenovateAI | Ranks property leads for contractors from permit and home data | React, Postgres, Claude, Gemini, Docker | Claude text processing; Gemini plain-English lead search | No | None stated |
| MLH Gemini | [Chronicles](https://devpost.com/software/linmats-team) | github.com/johnz4021/Chronicles | Multiplayer Oregon Trail for any historical era; players join by QR code | FastAPI, Next.js, WebSockets | Gemini 3 generates structured game state and narrative; Imagen art; Gemini TTS | No | None stated |
| MLH ElevenLabs | [Intelux](https://devpost.com/software/intelux) | github.com/aayush4515/intelux | Wearable that describes surroundings to blind users and answers questions | Raspberry Pi 5, Python, YOLOv8, Claude, ElevenLabs, OSRM | Claude Q&A over YOLO detections; voice out | **Yes** (Pi 5, camera, speaker) | None stated |
| MLH Solana | [Vouch It](https://devpost.com/software/vouch-96m2oz) | github.com/jasonlin1222/wildhacks2026 | On-chain reputation passport for gig workers | Anchor, Rust, Next.js, Solana | Coding agents used only during development | No | None stated |
| MLH DigitalOcean | [K-Means Bike](https://devpost.com/software/divvy-s7vz2x) | github.com/choeunice/kmeans-bike | Clusters 5.9M Divvy trips into route patterns (data story) | Python, pandas, sklearn, Folium, Streamlit | Classic ML only | No | None stated |
| MLH .Tech | [WildSnacks](https://devpost.com/software/wildsnacks-3ytk4m) | github.com/vi-yang-NU/wildhacks-2026 | Pricing, restocking and route dashboard for small vending-machine operators | React, Flask, Supabase, AWS | Demand/pricing ML; ElevenLabs voice | No | None stated |

### Observations
- **The 1st-overall winner used no AI at all.** It was a polished, instantly understandable, fun, demoable hack (phone as Wii remote). Demo delight beat AI depth at this smaller event.
- 2nd and 3rd went to specific-user, real-workflow tools (nurses' call bell, building energy audits) with voice layers.
- VibeBuild is the clearest "agent" winner: a planner/executor split across two Claude calls, with output executed in a real environment (the Minecraft server).

---

## SpartaHack 11 (Michigan State)

- Devpost: https://spartahack-11.devpost.com/
- Dates: Jan 31 – Feb 1, 2026, MSU STEM Building, East Lansing. Themes: Beginner Friendly, ML/AI, Social Good.
- 325 participants, 106 projects (5 gallery pages), $14,950+ in prizes. There are about 29 winner badges across gallery pages 1–2.

### Tracks & prizes
| Prize | Sponsor | What it asked for | Reward |
|---|---|---|---|
| Best Hack (all tracks) | SpartaHack | Overall | $1,400 |
| Runner-up (all tracks) | SpartaHack | Overall | $700 |
| Pixel and Play | SpartaHack | Interactive media | $300 |
| Branch and Flow | SpartaHack | Tools & workflow | $300 |
| Roots and Renewal | SpartaHack | Social impact | $300 |
| Stone and Stream | SpartaHack | Data, finance, security | $300 |
| Agentmania | (sponsor unverified) | AI agent systems | $500 |
| Desire Paths | (sponsor unverified) | Analyzing human behavior patterns | $500 |
| Teli AI Frontend Challenge (3) | Teli.ai | Build on Teli's voice/SMS AI agent API | $1,100 / $300 / $100 |
| MSU Blockchain Club (3) | MSU Blockchain Club | Blockchain | $800 / $500 / $350 |
| MSUFCU Community Class Act | MSUFCU | Community | $500 |
| Auto-Owners Insurance: Best Hack to Make Driving Safer | Auto-Owners | Driving safety | $100 + merch |
| Free-Wili (several winners) | Free Wili | Use the Free Wili hardware device | (not listed) |
| Best Accessibility / Prompt / Hardware / Game / Beginner / Demo Delivery | SpartaHack | As named | $100 each |
| MLH: Gemini, Solana, DigitalOcean, ElevenLabs, Snowflake, Presage | MLH | Use the sponsor tech | Swag/hardware |

### Winners
| Place/Prize | Project (Devpost link) | GitHub | What it does / who for | Built with | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **Best Hack (1st)** | [Drive Secure](https://devpost.com/software/drive-secure) | not provided | Authenticates vehicle sensor readings in real time (HMAC-SHA256) to catch spoofing, tampering and replay before they reach driving decisions | Python, Flask, OpenCV, SQLite, Raspberry Pi | **None** | **Yes** (Pi, camera, ultrasonic) | None stated |
| **Runner-up (2nd)** | [Auto Spot](https://devpost.com/software/otto-spot) | github.com/yourlocaljosh/auto-spot | Autonomous gym spotter: computer vision detects a failed rep and motors lift the bar. For solo lifters | OpenCV, Python, Teensy 4.1, motor controller | CV only (no LLM) | **Yes** | None stated |
| Pixel and Play | [Slacker](https://devpost.com/software/slacker-dab4qk) | github.com/Jos-Low/SpartaHackXI | Chrome extension that gamifies productive browsing | JS/HTML/CSS | None | No | None stated |
| Branch and Flow | [FLAI](https://devpost.com/software/flai-rvmona) | github.com/tessaSlice/spartahacks-11 | AR glasses that transcribe meetings and **auto-create tasks and send messages** in Calendar, Gmail, Slack and Jira | Python, Flask, Gemini | **Tool-calling agent**: Gemini function calling produces JSON actions and executes them against Google, Slack and Jira | **Mira AR glasses** | None stated |
| Roots and Renewal | [Lingo](https://devpost.com/software/culture-bridge) | github.com/wildal99/Codename--Diplomat | Flags idioms and slang in chat and suggests neutral phrasing, for global teams and immigrants | FastAPI, React, Gemini via OpenRouter | Prompted LLM returning a JSON schema | No | None stated |
| Stone and Stream | [PhishingMirror](https://devpost.com/software/phishingmirror) | github.com/Moedabaja10/phish-mirror | Voice call screening that questions callers and triggers SMS or callback verification when risk is high | Next.js, Firebase, Teli | **Voice agent** plus deterministic and LLM risk scoring | No | None stated |
| Agentmania | [AI is Doomed!](https://devpost.com/software/ai-is-doomed) | github.com/gmeeric/Spartahacks11 | Up to 10 **autonomous LLM agents** play a social-deduction survival game (trust and betrayal) | Flask, Groq, Render | Multi-agent simulation on Groq | No | None stated |
| Desire Paths | [Elite Ball Kalendar](https://devpost.com/software/elite-ball-kalendar) | github.com/zakellyputra/EliteBallKalendar | Scans your calendars and schedules work and recovery blocks | TS, Firebase, Google Calendar API, Gemini, ElevenLabs | Gemini chatbot for rescheduling | No | None stated |
| Teli AI Frontend Challenge (3 winners; places unverified) | [Bookd](https://devpost.com/software/booked-ropz6j), [GuardKall](https://devpost.com/software/guardkall), [Vetted](https://devpost.com/software/vetted-bd1s9m) | github.com/ArunimaV/bookd ; github.com/Yasrib69/guardKall ; n/a | An AI phone receptionist that books appointments; an AI call firewall against scam calls; AI voice interviews that screen candidates | Next.js, Supabase/Firebase, Teli AI, Gemini | **Voice agents** on phone lines (Teli) | Phone line | None stated |
| Best Accessibility | [Triad](https://devpost.com/software/the-four) | github.com/chess10kp/spartahack26 | Controls a computer by eye gaze, voice and gesture, for people with motor impairments | Python, OpenCV, pygaze, Gemini, ElevenLabs | Gemini interprets commands (computer-control) | Eye tracking | None stated |
| MLH Gemini | [Helios](https://devpost.com/software/helios-kduvlc) | github.com/kendalleasterly/project-helios-spartahack | "AI guide dog" on the phone for blind users | React Native, YOLO11x, Gemini 3, FastAPI, ChromaDB | YOLO obstacle detection, Gemini conversational guidance and a heuristic alerting engine | iPhone | None stated |
| MLH DigitalOcean | [PixelCut](https://devpost.com/software/pixelcut) | github.com/Chanuth-Jayatissa/PixelCut | Edit video by chatting | Gemini 3 Flash, LangChain, FFmpeg, FastAPI | **LangChain agent executes FFmpeg tool calls** | No | None stated |
| MLH Presage | [DayLight](https://devpost.com/software/daylight) | github.com/yashvijay222/DayLight | Budgets cognitive load across calendar events, with vitals read from the webcam | React, FastAPI, C++, Presage SDK, Gemini | Gemini classifies events | Webcam vitals | None stated |
| MLH Snowflake + Best Prompt | [AveloHealth](https://devpost.com/software/avelohealth) | n/a | HIPAA-style health diary over SMS and voice AI | Next.js, Snowflake, Teli AI | Voice/SMS agent | No | None stated |
| Auto-Owners + Best Beginner | [Road-Rater](https://devpost.com/software/road-rater) | n/a | Scores driving safety from dashcam footage | YOLOP | CV only | No | None stated |
| Best Hardware | [ALIGN](https://devpost.com/software/align-p2ze56) | n/a | IMU posture wearable with vibration feedback | Arduino, MPU6050, Node | None | Yes | None stated |
| MLH Solana | [TideUp](https://devpost.com/software/tideup) | n/a | Crypto rewards for beach-cleanup volunteers | Solana, Gemini 2.5 Flash | Gemini photo verification | No | None stated |
| Free-Wili | [Reality Check](https://devpost.com/software/truth-capture), [Wolf Hunt](https://devpost.com/software/wolf-hunt), [Potsticker](https://devpost.com/software/potsticker) | n/a | LLM fact-checking with an ESP32 camera; a Duck Hunt-style game; a self-evolving WiFi honeypot | Free Wili, OpenRouter, Gemini | Agents via OpenRouter (Reality Check); Gemini (Potsticker) | Yes | None stated |
| Other badges (prize names not read) | Counterfeit Mind (NFC + blockchain cash), STAMPD rewards (Solana loyalty), Volunteer Matchmaker (AI matching), Gap wrap (defense against MEV sandwich attacks), VendCred, Common Good (nonprofit CRM), SignBridge (ASL assessment) | | (gallery tagline only, page not read). Likely the Blockchain Club, MSUFCU, Best Game and Best Demo prizes (unverified) | | | | |

### Observations
- **Both overall winners were hardware hacks with no LLM**: vehicle-sensor security on a Pi, and a CV-plus-motor barbell spotter. Physical, safety-critical demos beat the AI entries here.
- The agent-focused winners were in sponsor tracks: Agentmania (a multi-agent game), Teli (phone voice agents, which took 3 prizes), FLAI (function-calling agent that acts in Slack and Jira) and PixelCut (LangChain FFmpeg agent).

---

## HackKU26 (University of Kansas)

- Devpost: https://hackku26.devpost.com/
- Dates: Apr 18–19, 2026, KU Engineering, Lawrence KS. 36 hours.
- 241 participants, 87 projects (4 gallery pages), $8,290+ in prizes. There are 20 winner badges on page 1.
- Judging criteria: tech stack, learning, documentation, code organization, UI, completeness, presentation, novelty and theme fit.

### Tracks & prizes
| Prize | Sponsor | What it asked for | Reward |
|---|---|---|---|
| Themed Track | HackKU | Event theme (theme wording not captured) | $1,200 + Meta glasses |
| General 1st / 2nd / 3rd | HackKU | Overall | $1,000 + Quest / $680 + Galaxy Tab / $600 + Beats |
| Hacker's Choice | HackKU | Peer vote | $360 + Instax |
| Best Hardware | HackKU | Hardware | $270 + Raspberry Pi 4 |
| Best Beginner / Most Creative UI/UX / Best High School | HackKU | As named | $240 / $240 / $160 + items |
| MongoDB Atlas | MLH/MongoDB | Use Atlas | M5GO IoT kit |
| Solana | Solana | Use Solana | $240 + Ledger |
| ElevenLabs / Gemini / DigitalOcean | MLH | Use the sponsor tech | Earbuds / swag / mouse |
| H&R Block Community Challenge | H&R Block | Community / financial | Gaming bundle |
| Security Benefit Financial Track | Security Benefit | Financial literacy | AirPods Pro, speaker, $50 |
| Ripple/XRPL (3) | Ripple | Build on XRPL | $1,000 in crypto |
| Lockton (3) | Lockton | Business-travel challenge (from the winner's description) | iPad, keyboard, headset |

### Winners
| Place/Prize | Project (Devpost link) | GitHub | What it does / who for | Built with | AI/agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **General 1st** | [NexusAid](https://devpost.com/software/nexusaid) | github.com/bhumikaguptaa/NexusAid | NGOs send stablecoin aid across borders at near-zero fees; an SMS gateway serves offline recipients | Next.js, Express, XRPL, RLUSD | **None** | No (SMS) | None stated |
| **General 2nd** + Security Benefit | [Hold the Line](https://devpost.com/software/hold-the-line-yoitlx) | github.com/XDTerminated/hackku_2026 | VR financial-life simulator for college students: bills, loans and phone calls from "family" | Unity 6, C#, OpenXR | Groq llama-3.1-8b drives free-form **voice conversations** with NPCs; ElevenLabs voices; Whisper STT | **Meta Quest 3** | None stated |
| **General 3rd** + XRPL | [LedgerShredder](https://devpost.com/software/ledgershredder) | github.com/gnichol479/KUHacks | Turns receipts into a shared expense ledger for roommates and groups | Flutter, Flask, MongoDB Atlas, XRPL, Gemini | Gemini receipt extraction and split calculation | No | None stated |
| **Themed Track ($1,200)** | [ParaSight](https://devpost.com/software/parasight) | not listed (site on github.io) | Camera-roll cleaner with a slime mascot that roasts your blurry photos while you swipe | React Native/Expo, FastAPI, Groq (Llama 4), Gemini, ElevenLabs | Groq writes personalized roasts; ElevenLabs voices the mascot; dHash duplicate detection | Phone | None stated |
| Hacker's Choice + Security Benefit | [Island Adventure](https://devpost.com/software/island-adventure) | github.com/FarrellJoswara/HackKU26 | 3D island game that teaches post-grad budgeting | React Three Fiber, Zustand, Solana | Gemini generates scenarios | No | None stated |
| Best Hardware | [NexusMesh](https://devpost.com/software/nexusmesh) | github.com/norman2k5/NexusMesh | Mesh of hard-hat sensors that monitor worker vitals and air | ESP32-C6, ESP-NOW, MAX30102, MQ135 | On-device statistical anomaly detection | **Yes** | None stated |
| Lockton | [Voyager](https://devpost.com/software/voyager-dwoqhs) | github.com/Gage-Weaver/Voyager | Agentic corporate-travel booking and expenses with policy checks | React, Express, Firestore, Mapbox, Duffel API, Ollama | **Tool-calling agent** on local Qwen2.5-7B: Foursquare, Tavily search, real Duffel booking; drafts approval requests | No | None stated |
| MLH ElevenLabs | [CCAD AI](https://devpost.com/software/firstresponse-ai-4us081) | github.com/Yadhunath2003/FirstResponseAI | Turns emergency radio traffic into live summaries, conflict alerts and maps for incident commanders | FastAPI, Next.js 16, Leaflet, ElevenLabs Scribe, Gemini | STT plus Gemini summarization and conflict detection | No | None stated |
| Other badges | Jayhawkers Against Hackers (tower-defense study game), Busy Bunny, Purr-Real? (cat-sighting map), Rise Behind the Walls, BetOnMe, Poise.ai (interview practice), CalEvent, MedLingual (multilingual medical triage AI), Post-Grad Panic, Block Party (XRPL ticketing), Lockey, Nexus | | (gallery tagline only, page not read) | | | | |

### Observations
- 1st place again used **no AI**. It was a crisp, domain-specific fintech pipeline (XRPL stablecoins plus offline SMS).
- Theme and sponsor tracks (finance and literacy) shaped the winners heavily; financial-literacy games took 3 prizes.

---

## Cross-event takeaways (Midwest 2026)
1. At the large, sponsor-heavy event (HackIllinois, 678 hackers), the top prizes went to **ambitious multi-agent or agentic pipelines with a concrete output**: Orca (vision agents labeling a 3D world model), Synapse (voice and emotion feedback turned into auto-PRs), Ligands (Claude orchestrating GPU docking subagents). They were technically deep, used self-hosted GPU inference (Modal) and targeted a specific professional user.
2. At the smaller events (WildHacks, SpartaHack, HackKU; 240–325 hackers), **1st place went to non-AI projects every time**: a phone-as-Wii-remote, sensor authentication on a Pi, and a stablecoin aid rail. Polish, a tangible demo and a clear story beat "yet another LLM wrapper".
3. **Voice agents** keep winning sponsor and track prizes: Symbiote, CATCare, Superstyle, PhishingMirror, the Teli trio, volana, Architec and Hold the Line.
4. The agent patterns that won were planner/executor splits (VibeBuild), parallel agents with consensus (Orca, LinkCare), function-calling agents that act in real tools (FLAI with Slack and Jira, PixelCut with FFmpeg, Voyager with Duffel bookings, Synapse with GitHub PRs), and fully autonomous loops (TradeMaxxer's trades).
5. Winners routinely **stacked sponsor prizes** by integrating 2–4 sponsor APIs (OpenReality 3, Synapse 2, Superstyle 2, Architec 2).

---

# US South projects, 2026 editions: what won

Researched 2026-09-26. Sources: Devpost event pages, project galleries and individual project pages, read with WebFetch. The WebFetch tool summarizes pages with a small model, so exact wording can differ slightly from the page. Project facts below come from each team's own Devpost write-up. **No Devpost page read for these events gave a judges' comment or a stated reason for a win.** Where a cell says "none stated", that is literal.

---

## Hacklytics 2026: "Golden Byte" (Georgia Tech)

- **Devpost:** https://hacklytics-2026.devpost.com/ (gallery: https://hacklytics-2026.devpost.com/project-gallery)
- **Website:** https://hacklytics.io/
- **Dates / place:** Feb 20–22, 2026, Klaus Advanced Computing Building, Georgia Tech, Atlanta GA
- **Size:** 729 registered participants, **234 submissions**
- **Theme:** Willy Wonka / "Enter the factory. Build something golden." It is a data-science project, and every track is data or analytics flavored.
- **Judging criteria (official):** Creativity & Originality; Impact & Relevance; Scope & Technical Depth; Clarity & Engagement; Soundness & Accuracy; Video Presentation & Communication. The judges scored a **demo video**.
- **Total prize pool:** $4,600+ in cash, plus goods. The top 3 overall also received Georgia Tech Create-X startup-program acceptance or priority.

### Tracks & prizes

Devpost gives a full description only for the prizes marked with a quote. For the rest, the "asked for" text is inferred from the prize name.

| Prize | Sponsor | What it asked for | Reward |
|---|---|---|---|
| Best Overall Hack 1st / 2nd / 3rd | Hacklytics | Best project overall, judged on the criteria above | 1st MacBook Air M4 + Create-X acceptance; 2nd AirPods Max + Create-X priority; 3rd Samsung 27" OLED monitor + Create-X priority |
| Finance track 1st / 2nd / 3rd | Hacklytics | Finance data project (inferred from name) | Nespresso + Create-X priority / JBL speaker / clay poker set |
| Sports Analytics track 1st / 2nd / 3rd | Hacklytics | Sports analytics project (inferred) | Apple Watch SE + Create-X priority / JBL / pickleball set |
| Healthcare track 1st / 2nd / 3rd | Hacklytics | Healthcare data project (inferred) | Theragun Mini + Create-X priority / Fitbit / Owala bottle |
| Entertainment track 1st / 2nd / 3rd | Hacklytics | Entertainment/media project (inferred) | Projector + Create-X priority / karaoke machine / turntable |
| Pure Imagination | Hacklytics | Wildcard, most imaginative (inferred from theme) | Ninja CREAMi |
| Most Unique Application of Sphinx | Sphinx (AI data-science copilot) | Most unique use of Sphinx | $400 cash + backpack |
| [MLH] Best Use of ElevenLabs | MLH / ElevenLabs | Use ElevenLabs voice | Wireless earbuds |
| [MLH] Best Use of Gemini API | MLH / Google | "Push the boundaries of what's possible with AI using Google Gemini" | Google swag kits |
| [MLH] Best Use of Solana | MLH / Solana | "Harness Solana's core advantages like blazing fast execution and near-zero transaction costs" | Ledger Nano S Plus |
| [MLH] Best Use of Presage | MLH / Presage | Use the Presage camera-based vitals SDK | Fitbit Inspire + credits |
| [MLH] Best Use of Vultr | MLH / Vultr | Deploy on Vultr cloud | Portable screens |
| [MLH] Best Use of Snowflake API | MLH / Snowflake | Use Snowflake | M5Stack Tab5 |
| GrowthFactor Challenge (2 winners) | GrowthFactor (retail site-selection company) | "Build customized applications, RAG powered chat bots, or embed AI-powered features." Both winners mapped parking lots from satellite imagery for retail site selection, so the brief was probably parking/retail-location analysis (unverified) | $1,900 across 2 winners |
| Best AI for Human Safety | SafetyKit | AI for human safety (inferred) | Arc'teryx Atom jacket per member |
| Best Use of Actian VectorAI DB (3 winners) | Actian | Use the Actian VectorAI vector database | $500 / $300 / $200 |
| Databricks Geo-Insight Challenge (3 winners) | Databricks | Geographic analysis on Databricks | Backpacks, bottles, credits ($1,750 total listed) |
| Figma Make: Most Creative Data Visualization (2 winners) | Figma | Creative data visualization built with Figma Make | Backpack / $50 gift card |

### Winners

The gallery showed 32 winner badges, and I read every one of those project pages. By count, 35 prize slots exist. BraceML won two prizes, and I could identify only 2 of the 3 Databricks winners.

| Place / Prize | Project | GitHub | What it does / who for | Built with | AI / agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **1st Overall** | [Alleaf](https://devpost.com/software/alleaf) | github.com/Gustavo-Galvao-e-Silva/Alleaf | Detects stress in real time from heart-rate (RR-interval) data, then intervenes with bilateral haptic therapy and AI-guided meditation. For people with stress, anxiety or depression. | ESP32, Python, scikit-learn, numpy, pandas, Next.js, Firebase, Gemini, Actian VectorDB | A stress classifier trained on the WESAD dataset, served by Flask. RAG-based meditation-support agents (LangChain + vector DB). Gemini (role unspecified). | **Yes**: ESP32 BLE heart sensor + haptic device | None stated |
| **2nd Overall** | [Lumos AI](https://devpost.com/software/lumos-ai) | github.com/hxxtsxxh/lumos.ai | Real-time safety score for your location or route, built from 48 GB of FBI crime data + 11 live APIs. Offers predictive safe routing and **AI emergency calls**. For pedestrians, students, travelers. | React/TS, FastAPI, XGBoost, Gemini 2.5 Flash, Vapi, ElevenLabs, Twilio, Mapbox, Google Maps, Vultr, Firebase, many public APIs | XGBoost model (25 features, trained on 59M incidents). Gemini for safety tips and score validation. **Vapi voice agent that calls 911 while streaming live GPS**. ElevenLabs TTS. | No | None stated |
| **3rd Overall** | [Crisis Averted](https://devpost.com/software/crisis-averted) | github.com/GodlyDonuts/Hacklytics-GoldenByte | 3D globe "command center" that maps humanitarian funding gaps in real time, driven by an AI voice agent. For funders and humanitarian responders. | Next.js, Three.js/react-globe.gl, FastAPI, Kafka, Databricks, Delta Lake, Actian Vector DB, Vultr, Gemini, OpenRouter (Llama/Qwen), ElevenLabs, sentence-transformers, WebRTC | **Voice agent** (WebRTC + ElevenLabs). Gemini 3 Pro **function calling to break spoken commands into steps and run them**. Gemini Flash writes the narrative. Vector RAG over 18k projects. | No (cloud VM with 192 cores) | None stated. The only comment on the page is an informal peer post, not a judge. |
| Finance 1st | [Veritais](https://devpost.com/software/veritais) | github.com/8pxl/veritas | Scores how truthful executives are from video: audio, face and text signals, plus fact-checking of the claims they make. For retail investors and journalists. | Next.js, Bun, FastAPI, librosa, Praat, py-feat, scikit-learn | Most agentic winner here. An LLM scrapes YouTube and judges relevance. A **RAG multi-turn agent** works out who is speaking. A VLM picks key frames. An **agentic verification loop with web search + multi-turn tool use** checks claims. Whisper transcribes. | No | None stated |
| Finance 2nd | [BlindSpot](https://devpost.com/software/blindspot-azf0i1) | github.com/Hidhayath-Nisha/blindspot | Directs humanitarian capital by crisis severity rather than media attention. For donors and UN coordinators. | Streamlit, Databricks, Actian, scikit-learn, Plotly | TF-IDF RAG over 2,388 UN documents. Gemini 2.5 Flash assistant restricted to this domain. PCA severity score, XGBoost forecasting, and a SciPy allocation optimizer. | No | None stated |
| Finance 3rd | [Nexus](https://devpost.com/software/nexus-6tr249) | github.com/UpStackLabs/nexus-backend (+ -frontend) | Predicts how news events ripple into market shocks across countries, sectors and tickers. For analysts. | React, NestJS, FastAPI, AWS (ECS/CDK/CloudFront), Actian, TensorFlow LSTM, BART-MNLI, Mistral 7B, OpenAI embeddings, GDELT/ACLED/Finnhub | Zero-shot event classifier. **117 per-ticker LSTMs trained on GT's Phoenix supercomputer**. RAG "AI analyst" on live market data. | No (trained on the HPC cluster) | None stated |
| Sports 1st (+ Figma Make Most Creative Data Viz) | [BraceML](https://devpost.com/software/braceml) | github.com/jiekaitao/BRACE | "A biomechanics lab in your browser": injury-risk and fatigue detection plus coaching from any camera. For athletes and coaches. | YOLO11, HybrIK, CLIP-ReID, TensorRT, FastAPI, Next.js 15, Three.js, SwiftUI, Unity (Quest 3), Gemini 2.0 Flash, ElevenLabs, MongoDB, Actian, Figma Make | Pose estimation / CV pipeline. Gemini runs a conversational injury intake, classifies activity, and **reads jersey numbers with Gemini Vision**. | Yes: iPhone 240 fps capture, Meta Quest 3 app | None stated |
| Sports 2nd | [MomentumShift](https://devpost.com/software/momentumshift) | github.com/rishyendra333/hacklytics-2026 | Visualizes NBA game momentum and predicts scoring runs. For fans and analysts. | Python, React | scikit-learn models only; no LLM | No | None stated |
| Sports 3rd | [DarkHorse](https://devpost.com/software/darkhorse) | github.com/WorldCup-UnderDog/DarkHorse_WorldCup | Flags likely World Cup upsets before kickoff ("DarkScore"). For fans and analysts. | React/Vite, Python | XGBoost on a web-scraped dataset; no LLM | No | None stated |
| Healthcare 1st | [Vigil](https://devpost.com/software/vigil-b8uatr) | github.com/aishanibal/hacklytics2026 | Wearable + camera system that detects medical emergencies (e.g. POTS fainting) at large events and alerts staff with the location. | Flutter, Kotlin/WearOS, Raspberry Pi, YOLOv8, OpenCV, FastAPI, Gemini, BLE | YOLOv8 CV on Raspberry Pi. Gemini writes an instant incident summary for medics. | **Yes**: Galaxy Watch, Raspberry Pis, cameras, BLE localization | None stated |
| Healthcare 2nd | [Conduit](https://devpost.com/software/conduit-y8gqoj) | github.com/kwaiidev/conduit | Controls a computer by voice, EEG, eye tracking or ASL. For people with disabilities. | Electron, TypeScript, FastAPI, OpenCV, Gemini, ElevenLabs | Gemini classifies intent from transcribed speech. ElevenLabs STT. Custom MobileNetV2 recognizes ASL. | **Yes**: Muse EEG headset, webcam | None stated |
| Healthcare 3rd | [HeartScape](https://devpost.com/software/heartscape) | github.com/SohamAg/hacklytics2026 | Interactive 3D heart models from medical imaging, including congenital anomalies. For students and clinicians. | Flask, PyVista, Gemini, Sphinx.AI, Actian VectorAI, Docker | Gemini "Lens" explains a selected 3D region. Sphinx generates analysis notebooks. Vector retrieval does patient matching. | No | None stated |
| Entertainment 1st | [A Spark in the Dark](https://devpost.com/software/a-spark-in-the-dark) | github.com/sadie2488/Hacklytics-SSL | Hand-drawn video game controlled by hand motion, with an AI narrator. For gamers. | HTML/CSS/JS, MediaPipe, Gemini, ElevenLabs | Gemini + ElevenLabs generate and speak the narration. MediaPipe tracks hands. | Webcam only | None stated |
| Entertainment 2nd | [Tempr](https://devpost.com/software/tempr) | github.com/aidenerard/tempr | Makes Spotify playlists from a mood, an image or a calendar event. For listeners facing choice paralysis. | React Native/Expo, Supabase, Spotify, Gemini | Gemini turns text or an image into a "vibe vector", which is matched by cosine similarity against Spotify audio features | No | None stated |
| Entertainment 3rd | [DataFables](https://devpost.com/software/hacklytics-2026) | github.com/jaimeb18/datafables | Turns any topic into an illustrated, branching kids' storybook in 10 languages. For children. | TS/Python, Gemini, ElevenLabs, Snowflake, VectorAI | Gemini writes the story and illustrations and runs a SafetyKit content check. Vector search drives vocabulary reinforcement. ElevenLabs narrates. | No | None stated |
| Pure Imagination | [WonkaLift](https://devpost.com/software/wonkalift) | github.com/rkothari3/Hacklytics | Gamified strength training: a wristband counts reps and scores form and tempo | ESP32, C++, Swift, React Native, TensorFlow, Databricks | 1D CNN that runs **on the device** to classify rep quality; no LLM | **Yes**: ESP32 + 9-DOF IMU wristband | None stated |
| Sphinx: Most Unique Application | [PatchLab](https://devpost.com/software/patchlab) | github.com/NSang22/hacklytics26 | Game playtest analytics that combine webcam emotion, heart rate and gameplay video. For game studios. | React, FastAPI, MediaPipe, OpenCV, Gemini, Snowflake, Actian, Vultr | Gemini Vision reads game state from pixel art. Sphinx copilot answers plain-English data queries. Embeddings power cross-session search. | Yes: Apple Watch BLE | None stated |
| [MLH] Best Use of ElevenLabs | [Janulus.ai](https://devpost.com/software/janulus-ai) | github.com/ConicalDrupe/janulus.ai | Anki add-on for pronunciation-first language learning | Python, SQLite, Gemini, ElevenLabs, Google Translate | Gemini generates sentences. ElevenLabs TTS. | No | None stated |
| [MLH] Best Use of Gemini API | [Playwright](https://devpost.com/software/playwright) | github.com/akabandaru/Playwright | Turns screenplays into storyboards and video. For writers and filmmakers. | React, FastAPI, Gemini, HuggingFace, Databricks, ElevenLabs, Figma | Gemini splits the script into beats. Stable Diffusion draws frames. TTS narrates and music is generated. | No | None stated |
| [MLH] Best Use of Solana | [VERA](https://devpost.com/software/vera-r3gp7l) | not listed | Environmental due diligence for lenders: searches NEPA reviews for litigation-risk patterns | FastAPI, Ollama Qwen2.5-3B, FAISS, Actian, Solana | Local LLM spots 8 litigation patterns across 61k reviews. FAISS search. Attestations on Solana devnet. | No | None stated |
| [MLH] Best Use of Presage | [UnderPressure](https://devpost.com/software/underpressure) | github.com/ethernetvan/Hacklytics-Horde | Game that adapts to the player's heart rate, breathing and facial emotion | React, Swift, Presage, MediaPipe, Gemini, ElevenLabs | Gemini generates dialogue. MediaPipe reads facial expression. | iPhone (Presage vitals) | None stated |
| [MLH] Best Use of Vultr | [Synaptix](https://devpost.com/software/synaptix) | github.com/Sanjavan7/Drugreuse | AI drug-repurposing platform over a biomedical knowledge graph with 97k entities. For researchers. | React/Three.js, FastAPI, RDKit, NetworkX, TransE, Gemini, Actian, Vultr | **Four autonomous research agents scan PubMed, ClinicalTrials.gov and PubChem to extend the graph**. Gemini writes explanations and powers an assistant. TransE scores links. | No | None stated |
| [MLH] Best Use of Snowflake | [Graption](https://devpost.com/software/graption) | github.com/Dinofish32/hacklytics-2026 | Live captions placed next to each speaker in group conversations. For deaf and hard-of-hearing people. | Swift, Python, Snowflake, ElevenLabs | Fine-tuned Wav2Vec detects emotion. Snowflake Cortex summarizes meetings, with RAG over past meetings. | iPhone AR | None stated |
| GrowthFactor Challenge | [Polaris](https://devpost.com/software/parasite-2dri43) | github.com/V-prajit/Polaris | Counts parking capacity from satellite imagery to score retail sites | FastAPI, React, Vultr | SegFormer segmentation + YOLO stall detection; no LLM | No | None stated |
| GrowthFactor Challenge | [CitySpot](https://devpost.com/software/cityspot) | github.com/Kairavparikh/CitySpot | Deep learning maps every Atlanta parking lot, plus a business-advisor chatbot. For retail site scouts and planners. | Python, JS | **Claude Sonnet 4 + RAG (Actian VectorAI, MiniLM embeddings)** advisor chatbot | No | None stated |
| SafetyKit: Best AI for Human Safety | [ATLRisk](https://devpost.com/software/atlrisk) | github.com/IshaMadanu/hacklytics-atl-risk | Safety checks for first-time meetups (e.g. marketplace deals) in Atlanta. For students and women. | Flask, Pandas, Gemini | Gemini "VibeCheck" scans chats for manipulation and threats | No | None stated |
| Actian VectorAI DB (place not shown) | [Aura](https://devpost.com/software/aura-h35p7t) | github.com/BonelessWater/Aura | Interpretable ML that surfaces autoimmune-disease risk from everyday data | React Native, Databricks, Actian, sklearn | **Fine-tuned an 8B quantized LLM** to predict diagnoses (80% accuracy claimed). RAG. | No | None stated |
| Actian VectorAI DB (place not shown) | [PayBack](https://devpost.com/software/payback-tnauqm) | github.com/Itz-Vigvy/payBack | "AI that fights your hospital bill": finds billing errors and writes dispute letters. For patients. | FastAPI, React, MongoDB, **LangGraph**, Actian | **LangGraph StateGraph pipeline**: Gemini OCR → rule checks for upcoding and unbundling → vector match against past dispute precedents → Gemini 2.5 Pro writes the dispute letter | No | None stated |
| Actian VectorAI DB (place not shown) | [RxGuard](https://devpost.com/software/guess-xp546j) | github.com/gt12889/hacklytics2026 | Semantic search over FDA adverse-event reports to find drug-safety signals. For pharmacovigilance researchers. | React, Python, Actian, Sphinx, Gemini | Embeddings + RAG | No (Vultr) | None stated |
| Databricks Geo-Insight | [Data Saves Lives](https://devpost.com/software/data-saves-lives-dsl) | github.com/Angelr327/DSL-Hackalytics | Maps humanitarian needs against funding. For UN advocates. | Databricks, FastAPI, React | Databricks Genie natural-language queries | No | None stated |
| Databricks Geo-Insight | [CrisisLens](https://devpost.com/software/crisislens-rlebdw) | github.com/Michael-RDev/CrisisLens | Crisis intelligence that ranks countries for response teams | Databricks, Next.js, Three.js, PyTorch | Genie Mode natural-language analytics. Gesture and voice input. | No | None stated |
| Databricks Geo-Insight (3rd winner) | not identified | — | — | — | — | — | Not found among the gallery winner badges |
| Figma Make Most Creative Data Viz | [FarmCast](https://devpost.com/software/the-last-human-internet) | not listed | Weather app for small farms (growing-degree-day engine) | React, TS, Supabase, NOAA, USDA | None | No | None stated |

### Observations

- **Five of the 12 main placings are "humanitarian funding gap" or "risk" platforms.** The sponsor dataset evidently pushed teams toward UN / crisis-funding data (Crisis Averted, BlindSpot, Data Saves Lives, CrisisLens, plus several non-winners). Crisis Averted took 3rd overall by adding a voice-agent, function-calling "command center" on a 3D globe on top of that shared theme.
- **Both top-2 overall winners pair ML with a physical or real-world action.** Alleaf pairs its ML with ESP32 haptic hardware. Lumos pairs an XGBoost model on 59M records with a **voice agent that actually places an emergency call**. In both, the AI does something, not just chats.
- **The most "agentic" winner is Veritais (Finance 1st):** an agentic verification loop with web search and multi-turn tool use, plus a VLM and RAG agents. Synaptix's four autonomous literature-scanning agents and PayBack's LangGraph pipeline are the other agent-style winners.
- **Heavy sponsor-tool stacking:** many winners list 3–5 sponsor tools (Gemini + ElevenLabs + Actian + Vultr + Snowflake/Databricks). Actian VectorAI shows up across most winners' stacks, not only the Actian prize.
- **Hardware helps in healthcare and wildcard tracks:** Vigil, Conduit (EEG), Alleaf and WonkaLift all had real devices.
- Judges score a video, so polished demo videos matter here.

---

## TAMUhack 2026 (Texas A&M)

- **Devpost:** https://th26.devpost.com/ (gallery: https://th26.devpost.com/project-gallery). The guessed slug `tamuhack-2026.devpost.com` returned **HTTP 404**.
- **Website:** https://th26.tamuhack.org/
- **Dates / place:** Devpost lists Jan 24–29, 2026 (probably the submission/judging window; the in-person hack was the weekend of Jan 24–25, unverified). Memorial Student Center, College Station TX.
- **Size:** 504 participants, **176 submissions**
- **Format:** beginner-friendly, open-ended, teams of up to 4. Every team had to submit a 2-minute demo video and a GitHub link (for software). To qualify for overall, a team picks either "Software Hack" or "Hardware Hack", and everyone must demo in person.

### Tracks & prizes

| Prize | Sponsor | What it asked for | Reward |
|---|---|---|---|
| 1st / 2nd / 3rd Overall **Software** | TAMUhack | Best software hack | MacBook Air M2 / iPad A16 / SteelSeries keyboard |
| 1st / 2nd / 3rd Overall **Hardware** | TAMUhack | Best hardware hack | Gotrax e-scooter / Neptune 3 Pro 3D printer / Sony WH-CH720N |
| Best Design (Software) | TAMUhack | "Clear design and usability intentions" | Polaroid Now camera |
| Best Beginner Hack (Software) | TAMUhack | Teams that are 50%+ first-time hackers | 40" smart TV |
| Best IoT Device Hack (Hardware) | TAMUhack | IoT / "smarter interconnected systems" | Soldering kit + multimeter |
| Best Medical Device Hack (Hardware) | TAMUhack | Hardware for "real-world medical needs" | Marshall speaker |
| Best Beginner Hack (Hardware) | TAMUhack | First-time hardware builders | Arduino R4 starter kit |
| Software / Hardware "track winners" (3 each, opt-in) | TAMUhack | Opt-in track prizes | Not specified; I could not match specific winners to these |
| American Airlines Challenge (3 winners) | American Airlines | Improve "passenger experience, employee experience, or operational efficiencies" | 75k / 50k / 25k AAdvantage miles per member |
| NorthMark Compute & Cloud Challenge (3 winners) | NorthMark | App that lets "a non-expert submit a compute job to an HPC cluster" | PS5 / Meta glasses Gen 2 / JBL speaker per member |
| USAA Challenge | USAA | "Utilize Generative AI and transform the output in a novel and interesting way" for financial services | Galaxy Buds per member |
| Capital One Challenge | Capital One | "Best Financial Hack" (Nessie API optional) | $300 Giftogram per member |
| Toyota Challenge (3 winners) | Toyota | "E-commerce recommendation engine for a caravan marketplace" with semantic search and personalization | $500 / $350 / $150 Amazon gift cards |
| Figma Challenge | Figma | Best use of Figma (shared link + screen recording) | Figma merch bag |
| Mai Shan Yun Challenge | Mai Shan Yun (local restaurant) | Inventory and operations system: order taking, table layout, kitchen printer | $75 gift card |
| MLH: Gemini API / Presage / Solana / Vultr / ElevenLabs / Auth0 / MongoDB Atlas / .Tech domain | MLH + sponsors | Best use of each tool | Swag, earbuds, headphones, IoT kits, etc. |
| Best Solo Hack / Best Fruity Hack / Best Devpost / Best Custom Print | TAMUhack | Fun or general prizes | Keurig / Echo Dot / film camera / Polaroid |

### Winners

The gallery showed 33 winner badges, and I read every one of those project pages.

| Place / Prize | Project | GitHub | What it does / who for | Built with | AI / agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **1st Overall Software** | [CORTEX](https://devpost.com/software/cortex-67ueyq) | github.com/ryunzz/cortex, github.com/premiumfriedrice/CortexiOSApp | "Put something down, we remember where. Scan your bag, we tell you when it lands." Tracks lost items and luggage at airports, with a 3D map of the terminal and a voice airline assistant. For travelers. | Swift/ARKit/CoreML, OpenCV, Gaussian Splatting, Three.js, Gemini 2.0 Flash, ElevenLabs, MongoDB, Auth0, Solana, Vultr (GPU) | **Voice agent** (Gemini + ElevenLabs STT/TTS, under 2 s latency) for airline questions. CV hand and object tracking. 3D reconstruction with Gaussian splats. | iPhone (ARKit) + GPU VM | None stated. The write-up frames a concrete $2B/yr lost-luggage problem with 4 working features. |
| **2nd Overall Software** (also NorthMark-themed) | [HPC Runner](https://devpost.com/software/slurmglue) | github.com/Shlok-Bhakta/HPC-Runner | "Run supercomputer-scale jobs from a clean UI **or through AI agents via MCP**." For researchers and students with no cluster expertise. | Next.js, Flask, Python, SLURM, Gemini, **MCP**, MongoDB, Auth0 | Multi-stage Gemini pipeline analyzes code, finds entrypoints and classifies the workload. An **MCP server lets outside AI agents submit jobs and fetch results on their own**. | Real SLURM cluster | None stated |
| **3rd Overall Software** | [Haggle](https://devpost.com/software/haggle-admqhc) | github.com/rtalla1/tamuhack26 | "AI negotiator that reads your stress and uses it against you." Salary-negotiation practice. | Next.js, SwiftUI, Socket.IO, Presage SmartSpectra, ElevenLabs Conversational AI, Gemini 2.5 Flash, Railway | **Voice agent** (ElevenLabs Conversational AI, with Gemini doing the reasoning). Live heart-rate and breathing stress readings from the phone camera are **fed into the agent every 2 s via `sendContextualUpdate()`** so it adapts its tactics. | iPhone camera (contactless vitals) | None stated |
| **1st Overall Hardware** | [MediBot](https://devpost.com/software/medibot-as2980) | not listed | "Real-time AI agent using computer vision to identify injuries" and give calm, step-by-step first aid by voice, with a robotic arm holding the first-aid kit. For bystanders in emergencies. | Raspberry Pi + CSI camera, LeRobot, HuggingFace, Roboflow, ElevenLabs, LiveKit Agents, Groq Llama 3.3 70B, GPT-4V/Gemini, Deepgram | Vision LLM classifies the injury. **LiveKit real-time voice agent** (Deepgram → Groq Llama → ElevenLabs). The vision result triggers the robot arm and the voice guidance. | **Yes**: Pi, robot arm | None stated |
| **2nd Overall Hardware** | [Autonomous Surgical Light](https://devpost.com/software/autonomous-surgical-light) | not listed (demo: prestonpro.github.io/autonomous-surgical-light-v2) | Surgical light that follows the surgeon's head and gaze, so no hands are needed | Arduino Nano 33 BLE + Uno, servos, NeoPixels, MediaPipe, OpenCV, React, Flask, SolidWorks | None (classical CV head-pose) | **Yes** | None stated |
| **3rd Overall Hardware** | [Celcii PixiPen](https://devpost.com/software/pixipen) | not listed | Pen that writes in mid-air | ESP32, custom PCB, C++, Python | None | **Yes** | None stated |
| Best Design (Software) | [FruitoType](https://devpost.com/software/fruitotype) | not listed | Generates a personalized "speculative biology" fruit from face analysis | Next.js, Three.js, GSAP, OpenCV, Flask | No LLM (CV + procedural generation) | Webcam | None stated |
| Best Beginner (Software) + NorthMark 3rd | [PocketPlay](https://devpost.com/software/pocketplay) | github.com/Rishbhu/tamuhack26 | Simulates and visualizes football plays with ML and HPC. For coaches and fans. | React/TS, Python, Gemini, Auth0 | Gemini "agent" critiques plays (no tool calling) | No | None stated |
| Best IoT Device (Hardware) | [CarPort](https://devpost.com/software/carport-6reqk3) | github.com/MiguelCan13/TAMU-HACK-2026 | Parking-lot occupancy from sensor nodes at the entrances | ESP32, ESP32-CAM, HC-SR04, NRF24, LVGL, Ultralytics | "LLM" listed but not explained | **Yes** | None stated |
| Best Medical Device (Hardware) | [IR Vein Finder](https://devpost.com/software/ir-vein-finder) | github.com/RohanP1506/IR-Vein-Finder | IR LEDs + a modified webcam make veins visible for injections (housed in a Pringles can) | OpenCV, Python | None | **Yes** | None stated |
| Best Beginner (Hardware) | [Mini Haptic Steering Wheel](https://devpost.com/software/haptic) | github.com/ANGELOREYES-afk/FFBwheelACtelemtry | Force-feedback mini wheel for racing games | STM32, Moteus motor, Arduino, C++ | None | **Yes** | None stated |
| American Airlines 1st | [AIsle0](https://devpost.com/software/idk-yet-8ba2hz) | github.com/sarvesh-tech/tamuhack26 | Guided aircraft-turnaround inspections that produce step-by-step compliance evidence as they happen. For ground and flight crews. | React/Expo, Vite, Supabase, OpenAI | OpenAI tags hazard severity and does planning, feeding an "AI Hazard Tagging Audit Log" | Phone | None stated |
| American Airlines 2nd + [MLH] Best Use of Vultr | [Aria: Multimodal AI Kiosk](https://devpost.com/software/aria-the-multimodal-ai-kiosk) | github.com/luvadlamudi/TAMUHack26 | Voice-first airport concierge kiosk that recognizes your face and knows your flight | React/Vite, Python, **LangGraph**, Vultr Serverless Inference (Kimi-K2), MongoDB Atlas Vector Search, ElevenLabs | **LangGraph agent with tool calling** (flight, weather, maps, destinations), state and streaming. RAG over the airport FAQ. Face recognition. Voice. | Kiosk (implied) | None stated |
| American Airlines 3rd | [Stowed](https://devpost.com/software/stowed) | github.com/joshuale2007/STOWED-TAMUHACK-2026 | Identifies lost bags visually and predicts overhead-bin space | React, Prisma, OpenAI API, AviationAPI | OpenAI image search for bag matching | No | None stated |
| NorthMark 1st | [Constellation](https://devpost.com/software/constellation-qcb483) | github.com/aathul-raj/constellation | "HPC-native IDE with seamless agentic AI integration." You describe a goal and it builds, runs and debugs parallel workflows. For researchers new to HPC. | Next.js, Monaco, Reagraph, Gemini, AWS Batch/EC2/S3, Firebase | **Orchestrator + worker agent architecture** that edits and runs workflows. The team says the hard part was "constraining agent behavior". | AWS compute | None stated |
| NorthMark 2nd + Best Solo Hack | [Cinder Control](https://devpost.com/software/fsim) | github.com/Tarunls/fire-sim | Wildfire-spread forecasts up to 96 h with cellular automata, controlled by voice. For first responders. | Next.js, FastAPI, Mapbox, NOAA, OSM, OpenAI, Gemini, ElevenLabs | OpenAI turns spoken input into simulation parameters and writes the answers. ElevenLabs narrates. | No | None stated |
| USAA Challenge | [Sigma Predictor](https://devpost.com/software/sigma-predictor) | github.com/KoalaisMad/TAMUHACK2026 | Forecasts personal account balances and gives finance insights | Next.js, Express, MongoDB, Vultr, Gemini, ElevenLabs | Gemini/ElevenLabs listed; their use is not described | No | None stated |
| Capital One Challenge | [Drift](https://devpost.com/software/pff) | github.com/aadit2805/drift | Monte Carlo simulation of whether you'll reach your financial goals | Next.js, Express, Python, Nessie, Gemini, ElevenLabs, Three.js | AI parses the user's goals; ElevenLabs TTS | No | None stated |
| Toyota 1st | [RideIQ](https://devpost.com/software/rideiq) | github.com/joshuaraja1/HackTamu2026 | Semantic-search car marketplace with recommendations | Next.js, Supabase, pgvector | Embeddings + vector similarity search | No | None stated |
| Toyota 2nd | [CarBaba](https://devpost.com/software/carbaba) | github.com/exa2022/FINAL_HACK26 | Natural-language car search and recommendations, with voice | React, FastAPI, MongoDB, Gemini, (ElevenLabs) | Gemini chatbot + voice | No | None stated |
| Toyota 3rd | [Treat Me To A Toyota](https://devpost.com/software/toyota-truefit) | github.com/Lukeyp43/TamuHack-2026-Dream-Team | Voice agent that talks shoppers to the right Toyota | Next.js, Supabase/Postgres, **Vapi**, Claude, Groq | **Claude Opus 4.5 with tool calling that writes SQL queries**, plus a Vapi voice agent | No | None stated |
| Figma Challenge | [MaiPOS](https://devpost.com/software/mai-shan-yun-tabler) | not listed | Point-of-sale system for the Mai Shan Yun restaurant | Next.js, TS, Tailwind | None | Kitchen printer | None stated |
| Mai Shan Yun Challenge | [WaiterDock](https://devpost.com/software/waiterdock) | github.com/ajari17/TamuHack2026 | Real-time seating, orders, kitchen tickets and analytics for the restaurant | React, Express, Firebase, WebSockets, AWS | None | No | None stated |
| [MLH] Gemini API | [zephyr](https://devpost.com/software/zephyr-x0rwqc) | not listed | AI avatar companion for anxious flyers, triggered when CV detects stress | Next.js, Three.js, Gemini, Auth0, MongoDB, Vultr | Gemini generates audio and images. CV detects stress. | Camera | None stated |
| [MLH] Presage | [helm](https://devpost.com/software/helm-o7vdq6) | github.com/Jurassic001/helm | Real-time security-threat detection from video + vitals | C++, OpenCV, Presage | None | Webcam | None stated |
| [MLH] Solana | [NFTicket](https://devpost.com/software/nfticket-bvpq87) | github.com/ShalyJay/TamuHack26 | NFT ticketing on Solana | React, Solana, Auth0, MongoDB | None | No | None stated |
| [MLH] ElevenLabs | [Emergency Crops!](https://devpost.com/software/emergency-crops) | github.com/04kyeong/TAMUHack26 | Unity game that teaches financial literacy | Unity/C#, Gemini, ElevenLabs, Vultr | Gemini + ElevenLabs TTS | No | None stated |
| [MLH] Auth0 | [AeroAssist](https://devpost.com/software/th26-aa) | github.com/SaiNithin001/th26-aa-challenge | Explains flight delays and offers rebooking and compensation options | Next.js, Postgres, Docker, Auth0 | GenAI rewrites operational data into calm explanations | No | None stated |
| [MLH] MongoDB Atlas | [Dispatch](https://devpost.com/software/dispatch-z5wdxg) | github.com/akshaygajjala1/TamuHack2026 | "Stop-loss engine" for airline operations: weighs maintenance against on-time performance | Next.js, Node, Python | **RAG "AI Oracle" over 1,000-page maintenance manuals** returns GO / CONDITIONAL / NO-GO with citations | No | None stated |
| [MLH] .Tech Domain | [Simify](https://devpost.com/software/simify) | github.com/sreevikramr/simify | Text-to-interactive-simulation for STEM learning | React, Gemini 3 Flash, MongoDB, Auth0 | Two-stage agents: a Gemini "pedagogical architect" writes a spec, then a constrained agent emits JSON for a deterministic renderer | No | None stated |
| Best Devpost | [Rover](https://devpost.com/software/dinner-submission) | github.com/actuallyarjun/rover | Multimodal voice assistant for visually impaired users: calls, messages, web tasks | Claude 4.5 Sonnet orchestrator (AWS EC2), VAPI, Stagehand, Composio, MCP, Pinecone, Supabase, Swift | **Most agentic entry: Claude orchestrator + Stagehand vision browser automation (computer use) + VAPI phone agents + Composio/MCP tools + RAG memory + local LLM credential check** | Glasses with a video pipeline (beta) | Won only "Best Devpost" (the write-up), not a placing |
| Best Fruity Hack | [Fruity Drop](https://devpost.com/software/fruity-drop) | github.com/joaquin822/Project-26 | Two-player webcam game using face and hand tracking | Python, pygame, OpenCV, MediaPipe | None | Webcam | None stated |
| Best Custom Print | [Luma-Fume](https://devpost.com/software/luma-fume) | not listed | Soldering fume extractor + light | — (the write-up is a joke placeholder) | None | Yes (implied) | None stated |

### Observations

- **Overall Software placings went to agent-shaped projects:** a voice agent tied to a real CV/AR product (CORTEX), an **MCP server that lets AI agents drive a SLURM cluster** (HPC Runner), and a voice agent **whose context is updated live from biometric sensors** (Haggle). In each, the agent was wired into a real system or sensor, not a plain chatbot.
- **Hardware overall had one AI project and two with no AI:** MediBot (LiveKit voice agent + vision + robot arm) took 1st, while 2nd and 3rd used no LLM at all. Hardware judging rewarded polished physical builds.
- **Sponsor challenges were narrowly specified** (non-expert HPC submission, Toyota semantic search, restaurant POS), and the winners answered the brief literally. NorthMark's HPC brief produced two agentic winners (Constellation and HPC Runner).
- **Voice is everywhere:** ElevenLabs, Vapi or LiveKit appear in CORTEX, Haggle, MediBot, Aria, Treat Me To A Toyota and Cinder Control.
- The most technically ambitious agent project (Rover: Claude orchestrator + browser computer-use + phone agents + MCP) did **not** place overall and won only "Best Devpost". Breadth of agent plumbing alone did not beat a focused, demoable product.

---

## HackRice 16 (Rice University)

- **Devpost:** https://hackrice-16.devpost.com/ (gallery: https://hackrice-16.devpost.com/project-gallery)
- **Website:** https://hackrice.com/
- **Dates / place:** Sep 11–13, 2026 (36 hours), Rice Memorial Center / Student Center, Houston TX. Devpost submissions were due Sun Sep 13 at 9:00 am.
- **Size:** 365 registered on Devpost (the site says "500+ hackers"). The gallery shows **119 projects, 18 with winner badges**.
- **Themes:** Fintech, Health, ML/AI. Each hacker picks at most 1 track but can enter several challenges.
- **Judging criteria:** relevance to the track or challenge, originality/creativity, practicality/impact, UX/design, technical rigor. A 3–4 minute video was required.

### Tracks & prizes

| Prize | Sponsor | What it asked for | Reward |
|---|---|---|---|
| 1st / 2nd / 3rd Place | HackRice / MLH | Overall | Ruko drone / Kodak PixPro camera / Whoop tracker (+ MLH pins) |
| Healthcare Track | HackRice | Health-domain projects | Ninja air fryer |
| Finance Track | HackRice | Financial-services projects | Espresso machine |
| Games & Gamification Track | HackRice | Gameplay or gamification | Poker set |
| Work & Productivity Track | HackRice | Productivity solutions | Mini projector |
| "Trust the Process" | Notability | Best use of Notability Pro for ideation and wireframing | Surprise prize |
| "Prove You're Human" | Persona | Require verified-human access | Surprise prize |
| Best Financial Hack | Capital One | Finance innovation | $250 Giftogram |
| Best Use of MathWorks | MathWorks | MATLAB and related tools | Article feature + prize |
| Best Project Built with ElevenLabs | ElevenLabs | Audio integration | 3 months of Scale tier |
| Best Use of Gemini API | MLH / Google | AI with Gemini | Swag kits |
| Best Use of ElevenLabs | MLH / ElevenLabs | Natural audio | Earbuds |
| Best Use of Solana | MLH / Solana | Blockchain apps | Ledger Nano S Plus |
| Best Use of Tiger Data | MLH / Tiger Data | High-performance data (TimescaleDB) | Stream Deck Mini |
| Best Use of Presage | MLH / Presage | Human sensing via SmartSpectra | Fitbit + credits |
| Best Use of Vultr | MLH / Vultr | Cloud or GPU infrastructure | Portable screens |
| Best Use of Backboard | MLH / Backboard | AI memory and state management | Tiles pack |
| Best Domain Name | MLH / GoDaddy Registry | Domain | Gift card |
| "Best Use of AI" | Lilie Labs | AI solving pressing problems | $50 Amazon + ~$100 grant |

### Winners

All 18 winning project pages were read (by the helper agent).

| Place / Prize | Project | GitHub | What it does / who for | Built with | AI / agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **1st Place** | [Poker Face](https://devpost.com/software/poker-face-nf8qha) | github.com/Egglessbonek/poker-face | Multiplayer Texas Hold'em against AI opponents that **read your face** through the webcam. Spectators can make predictions, and a post-game reveal shows which tells drove each AI decision. For casual players. | Next.js/React, Tailwind, MediaPipe, OpenRouter, ElevenLabs, Railway | **Multi-model agents:** each AI seat is a different LLM (Claude, GPT, Gemini, Grok via OpenRouter). A strategy layer feeds each seat hand strength, pot odds, opponent tendencies and observed tells. Vision via MediaPipe facial tells + Presage pulse and breathing. A distinct ElevenLabs voice per AI. | Webcam only | None stated |
| **2nd Place** | [GitFit](https://devpost.com/software/gitfit-47lu5m) | github.com/DaudHTM/gitfit | Arm-motion exercise games that track calories | ESP32, 2× MPU6050 IMU, NimBLE, Three.js | None | **Yes** | None stated (solo builder) |
| **3rd Place** + Persona "Prove You're Human" | [aide](https://devpost.com/software/aide-194x2p) | github.com/anishalle/hackrice26 | Companion for people with ALS. It tracks speech, motor and vision decline, adapts the UI, and a personal agent handles forms, scheduling and insurance appeals. | Next, React Native, FastAPI, Postgres, TigerData | **Autonomous tool-using agent** ("Hermes") with a tool registry, permission scopes, human confirmation gates, audit log and versioned skills. **ElevenLabs voice agent** for weekly check-ins, with structured-data tools and voice cloning. ASR drift detection. | Partial (iOS sensors, webcam eye tracking) | None stated |
| Healthcare Track | [Bryan](https://devpost.com/software/bryan-nokxfp) | none listed | Turns Ray-Ban Meta smart glasses into a longevity coach: watches diet, outdoor time and screen time, coaches you out loud, and reports at the end | Swift, FastAPI, Gemini, OpenAI, ElevenLabs, OpenCV, Fitbit/Google Health | **Two-tier vision pipeline:** Gemini Flash-Lite tags frames continuously, and a rule gate calls GPT only when a behavior persists. The response is spoken via ElevenLabs. | **Yes**: Meta glasses | None stated |
| Finance Track | [nectarly](https://devpost.com/software/nectarly) | github.com/Mungbeanbeanie/nectarly | Finds cheaper equivalent products at checkout through a web app or browser extension | FastAPI, React, Postgres, Redis, OpenAI, Vultr | Embeddings similarity only | No | None stated |
| Games Track | [tiji](https://devpost.com/software/tiji-1n3gro) | github.com/charlienguyen7/tijify | Maps body gestures to keyboard keys so you can play games with your body | Electron, MediaPipe, OpenCV | CV only | Webcam | None stated |
| Work & Productivity Track | [Callback](https://devpost.com/software/callback-73cyk2) | github.com/DanielEnis01/Callback | Voice mock interviewer that also reads body language and biometrics and tracks recurring weaknesses across sessions | Node, Python, TS | **Voice agent** interviewer. Gemini scores transcripts as structured JSON alongside a deterministic scorer. Webcam vision. | Webcam | None stated |
| Notability | [Baton](https://devpost.com/software/baton-kld5u6) | github.com/AndrewMao268/HackRice-2026-9_11_26-2 | Handoff summaries for teams working across time zones | Firebase, Gemini, TS | Gemini summarization and Q&A (user-triggered) | No | None stated |
| Capital One | [Larp City](https://devpost.com/software/temp-6yaocn) | github.com/cayden-h/LarpCity | Simulates your financial life from age 22 to retirement | Pixi.js, TS, Gemini, ElevenLabs, Nessie | Gemini writes personalized explanations | No | None stated |
| MLH Backboard + MathWorks | [Scallion](https://devpost.com/software/scallion) | github.com/Odey340/Scallion | Biological-age score from blood panels, webcam pulse and lifestyle, with one next step | Gemini, ElevenLabs, Backboard, MATLAB, Presage, Persona, TigerData, Vultr | Gemini extracts data from lab PDFs. **ElevenLabs voice agent with client tools + Backboard memory**. A validator gate blocks LLM-invented numbers. | Webcam | None stated. It stacked about 10 sponsor tools. |
| ElevenLabs + MLH ElevenLabs | [SingBack](https://devpost.com/software/singback) | github.com/drewthedude24/SingBack | Karaoke game: hear a clip once, sing it back, get scored | React, FastAPI, Librosa, ElevenLabs, Gemini | ElevenLabs transcription and narration; Gemini feedback | No | None stated |
| MLH Gemini | [outrunn](https://devpost.com/software/tamu-8zs5vy) | github.com/krishh-12/outrun | iOS app estimating biological age and recovery from a camera scan + wearable data | Swift, HealthKit, Gemini, Presage | Gemini as a guarded planner: numbers only, 8 calls/day cap, blended with a local engine | Phone camera | None stated |
| MLH Solana | [Call the Bluff](https://devpost.com/software/call-the-bluff) | github.com/bthiriveedhi03/fraud-sense | Fraud-analyst dashboard; every decision is logged to Solana | Vue/Nuxt, Express, Postgres, Solana, Gemini | Gemini only generates seed data | No | None stated |
| MLH Tiger Data | [AcuPill](https://devpost.com/software/acupill) | github.com/ythapacs29-lgtm/AcuPill_HackRice | Smart pill-bottle sleeve tracking adherence and tremor | Arduino R4, TimescaleDB, React | None | **Yes** | None stated |
| MLH Presage | [Tempo](https://devpost.com/software/tempo-a7g32p) | github.com/SuryaThirukonda/hackrice | Your phone becomes a motion controller for browser sports games, with AI coaching | Phaser/PlayCanvas, React, OpenAI, ElevenLabs, MediaPipe | OpenAI "corner coach" agents run separately from the 120 Hz game loop, with scripted fallbacks | Phone IMUs | None stated |
| MLH Vultr | [Checkpoint](https://devpost.com/software/checkpoint-tey0sk) | github.com/Phyvlik/checkpoint_rice_hacks | Trust layer for teams mixing AI agents and humans: agents claim and submit tasks, but only Persona-verified humans can approve them | **MCP**, Gemini, ElevenLabs, Persona, Backboard, Postgres, Vultr | **MCP server that external agents connect to**; multi-agent governance | No | None stated |
| MLH Domain | [PaperTrails](https://devpost.com/software/temporary-n1pk2z) | github.com/okyoiu/PaperTrail | Gamified city exploration | React, Google Places | None | No | Domain (papertrail.photo) |
| Lilie Labs Best Use of AI | [current.surf](https://devpost.com/software/current-surf) | github.com/CodedMed/current | "Agentic cash flow" for small businesses: invoice OCR, cash-gap forecasts, anomaly flags | FastAPI, Express, Ollama, Tesseract, Gemini, sklearn, ElevenLabs | Local extraction → Gemini reasoning on an allowlisted context → owner approval | No | None stated |

### Observations

- The top 3 were a multi-LLM game driven by webcam tells, a hardware fitness game with no AI, and an ALS agent with human-in-the-loop gates. **Novel sensing** (camera vitals, IMUs, smart glasses) was far more common among winners than pure chat apps.
- The agent-style winners stress **guardrails**: permission scopes and confirmation gates (aide), agents that can't approve their own work over MCP (Checkpoint), validator gates against invented numbers (Scallion), and capped LLM calls (outrunn). That judges reward "AI with guardrails" is an inference; no judge said so.
- Presage camera vitals appear in about 5 winners and ElevenLabs voice in about 8.
- This is the only fall-2026 US South event whose winners are already posted. It ran 2 weeks ago.

---

## HackGT 13 (Georgia Tech): in progress, no winners yet

- **HackGT 13 "Seaside Market" runs Sep 25–27, 2026** at the Klaus Center, Atlanta. Submissions are due Sep 27 at 12:00 PM EDT, and 319 are registered on Devpost.
- https://hackgt13.devpost.com/project-gallery says "The project managers haven't published this gallery yet."
- Prizes, for reference: Overall 1st/2nd/3rd (Canon camera + 10k OpenAI credits; Switch 2 + 5k; iPad + 1k), Impiricus HCP Engagement ($3k/$2k/$1k), Visa Reimagine Shopping ($5k), a Meta AI track (invites to Meta's Menlo Park project), plus Aramco, NSA, SpaceX, Notability and MLH tracks.
- HackGT 12 (Sep 26–28, 2025) is out of scope. **Worth re-checking after Sep 27**, since it will be the freshest large event before Edison.

## HackTX 26 (UT Austin): not yet held

- Scheduled for **Oct 24–25, 2026**, Austin TX, per the MLH 2027-season list (https://www.mlh.com/seasons/2027/events).
- https://hacktx.com/ returned only the title "HackTX 26 — Freetail Hackers". I found no 2026 Devpost. HackTX 2025 is out of scope.

## RowdyHacks (UTSA): no 2026 edition yet

- RowdyHacks moved from spring to fall. RowdyHacks X ran Oct 26–27, 2024 and RowdyHacks XI ran Oct 25–26, 2025; both are out of scope. **There was no spring 2026 edition.**
- **RowdyHacks XII is Oct 3–4, 2026**, San Antonio (MLH list; https://rowdyhacks.org/ says registration closes Oct 2).
- **Blocked or 404:**
  - https://rowdyhacks-2026.devpost.com/ returned 404.
  - https://rowdyhacks-xii.devpost.com/ returned 404.
  - https://rowdyhacks.org/faq returned an empty page.

## Hack the Mountains: India-based, no US event and no 2026 edition found

- "Hack The Mountains" (HTM) is an **India-based** community project series, founded in 2020. Its LinkedIn lists HQ as Kathua, Jammu & Kashmir, and its site is hackthemountain.tech.
- **Past editions:**
  - HTM 1.0: virtual, Oct 2020.
  - HTM 4.0: offline, Oct 29, 2023, Masters' Union, Gurugram (htm4.devpost.com).
  - HTM 5.0: Sept 2024, hybrid, Marwadi University, Rajkot (DoraHacks).
- **No 2025 or 2026 edition found.**
- **No US project by this name found.** A similarly named "HackTheMountain" (hackthemountain.ca) at Polytechnique Montréal, Canada, ran May 23–24, 2026, but I found no winners list for it (unverified whether any were posted).
- **Blocked or empty:**
  - https://hackthemountain.tech/ returned only a title, no content.
  - https://hackthemountains.netlify.app/ returned only a title, no content.
  - https://dorahacks.io/project/hackthemountains6/detail returned HTTP 405.

---

## SwampHacks XI (University of Florida)

- **Devpost:** https://swamphacks-xi.devpost.com/
- **Website:** https://xi.swamphacks.com/
- **Dates / place:** Jan 23–25, 2026, Newell Hall, UF, Gainesville FL
- **Size:** 411 participants, **112 submissions**. 22 winner badges, and all 22 project pages were read (by the helper agent).
- **Themes:** Beginner Friendly, Education, Open Ended.
- **Judging criteria:** Technical Execution; Innovation & Creativity; Impact & Purpose; Clarity & Communication (pitch/demo); Completion & Scope; Track Relevance.
- **Placements:** Devpost does not rank the 3 Best Overall winners. A LinkedIn post by team member Jerry He says SignHero was **2nd**. Which of ReStory and OffTrails was 1st and which 3rd is unverified, and so is the order of the Morgan & Morgan places.

### Tracks & prizes

| Prize | Sponsor | What it asked for | Reward |
|---|---|---|---|
| Best Overall (3) | Vobile | Top projects | $1,250 / $750 / $500 |
| Best Education, Accessibility & Social Impact | SwampHacks | — | JBL headphones |
| Best Sustainability | SwampHacks | — | Power bank + bottle |
| Best Game Design | SwampHacks | — | LEGO Game Boy |
| Best Everyday Life & Wellbeing (Human-Centered Design) | SwampHacks | — | Mini projector |
| Best Beginner Hack | SwampHacks | Team at least 50% first-time hackers | LEGO set |
| Best Integration of Hardware | SwampHacks | "Most effective and meaningful use of hardware components including sensors, microcontrollers, wearables, or IoT devices" | Raspberry Pi 5 |
| Best Creative Media | SwampHacks | Visual design, storytelling, animation, audio | Wacom pad |
| Best User Design | SwampHacks | UX/UI, accessibility | Mechanical keyboard |
| Best Finance Hack | Capital One | Fintech: payments, shopping, financing, literacy | $1,000 |
| **Tender for Lawyers (3)** | **Morgan & Morgan** | **"Design an AI Orchestrator processing multi-channel inputs, identifying actionable next steps, and routing tasks to specialized AI agents"** | $1,000 / $500 / $250 |
| MLH Best Use of Gemini / Solana / DigitalOcean / ElevenLabs / Snowflake / MongoDB Atlas | MLH + sponsors | Best use of each tool | Swag / hardware |
| GitHub "Ship It" | GitHub | Public repo, README, 10+ commits, 3+ PRs, 1+ review, 5+ issues, a version tag | Swag |
| Hidden: Least Vibecoded Project | A CISE professor | "Strong engineering fundamentals… clean, maintainable code" | Apple Magic Mouse + keyboard |

### Winners

| Place / Prize | Project | GitHub | What it does / who for | Built with | AI / agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **Best Overall, 2nd** (per LinkedIn) + Best Game Design | [SignHero](https://devpost.com/software/signhero) | github.com/MsMarion/ASL-Fun-Training | Guitar-Hero-style game that teaches ASL fingerspelling through the webcam | Next.js/T3, FastAPI, PyTorch, MediaPipe, MongoDB, S3 | No LLM. **Custom-trained** MobileNetV2 + attention CNN on MediaPipe landmarks (26 classes, ~30–50 ms) | Webcam | None stated |
| **Best Overall** (1st or 3rd, unverified) | [ReStory](https://devpost.com/software/restory) | github.com/retromonos/SwampHacks11FIH | Wearable that recognizes faces and voices and shows who you're talking to, with context about them. For Alzheimer's patients. | Raspberry Pi 5, PyTorch, ChromaDB, WhisperX, SpeechBrain, Gemini (OpenRouter), FastAPI | ArcFace face + ECAPA voice embeddings stored in ChromaDB. WhisperX diarization. Gemini 3 Flash turns transcripts into structured JSON "lore" about each person. A pipeline, not an agent. | **Yes**: Pi 5 wearable, RTX 5090 backend | None stated |
| **Best Overall** (1st or 3rd, unverified) | [OffTrails](https://devpost.com/software/offtrails) | github.com/blohse8/OffTrails | Off-trail wilderness route planner (USGS elevation + Sentinel-2 imagery, custom A*, GPX export). For backcountry hikers. | Python, rasterio, Leaflet, OSM | Minimal: "AI" used to optimize a hiking-energy cost function; the core is A* + GIS | No | None stated |
| Education / Accessibility / Social Impact | [gatorlator](https://devpost.com/software/live-translation-extension) | github.com/suupreme/gatorlator | Chrome extension that translates live lectures into speech + subtitles. For ESL students. | JS, Deepgram, DeepL, ElevenLabs, Gemini | STT → translate → TTS pipeline | No | None stated |
| Sustainability | [9Lives](https://devpost.com/software/9lives-5kpg7h) | github.com/Jaidenmagnan/swamphacks | Extension that finds second-hand alternatives for the product you're viewing | Plasmo, React, Gemini | Gemini turns page HTML into a search query and estimates CO2 saved | No | None stated |
| Everyday Life & Wellbeing | [MEALCRAFT](https://devpost.com/software/mealcraft) | github.com/Eric-Zhang-Developer/mealcraft | Fridge photo → gamified recipes | Next.js, OpenRouter (Gemini 3 Pro) | Vision LLM detects ingredients and writes recipes | No | None stated |
| Capital One Finance | [Pay Pals](https://devpost.com/software/project-c1nomzfei7a0) | github.com/GridGxly/PayPals | Social savings goals with friendly bets | React, FastAPI, MongoDB, Nessie, Solana, Gemini | Gemini (use not described) | No | None stated |
| Morgan & Morgan (place unverified) | [CaseForwardAI](https://devpost.com/software/caseforwardai) | github.com/kofki/CaseForwardAI | Personal-injury case intake: uploads, emails and transcripts become "Action Cards" for attorneys to review | Next.js 16, MongoDB, Gemini 2.5, R2, Auth0 | **Multi-agent "Round Table"**: an orchestrator + 3 specialist agents (Client Guru, Evidence Analyzer, Settlement Valuator). Conflicts are resolved and the output is Zod-validated structured cards with human review. | No | None stated. It matches the orchestrator brief exactly. |
| Morgan & Morgan (place unverified) | [ADJOURNED](https://devpost.com/software/adjourned) | github.com/BonelessWater/Swamphacks | Fraud-case data → summaries, drafts and AI-assisted calls. For fraud lawyers and their clients. | Google ADK, Azure, Flask, React | **Parallel multi-agent system (Google ADK)** + RAG, with human review | No | None stated |
| Morgan & Morgan (place unverified) | [TenderYes](https://devpost.com/software/tenderyes) | github.com/annikasingh03/TenderYes | Detects tender offers in documents and routes them to agents that draft emails and do research; the user picks by swiping | React Native, FastAPI, Gemini | Gemini orchestrator → a 3-step chain (summarize, draft at 3 tones, Google-Search-grounded research) | No | None stated |
| Best Beginner | [Aegis](https://devpost.com/software/aegis-axf8et) | github.com/AndrewFesenko/SwampHacksXI | Worksite PPE checkpoint: badge in, the camera checks gear, entry is blocked if anything is missing | React, Flask, Node, OpenCV, YOLO, Gemini, MongoDB | YOLO detection + Gemini explains what is missing | **Yes**: camera, RFID, numpad, 3D-printed case | None stated |
| Best Hardware Integration | [SwampRise](https://devpost.com/software/swamp-rise) | github.com/ethantayl/SwampRise | Alarm clock synced to live bus tracking | ESP32, FreeRTOS, C++ | None | **Yes** | None stated |
| Best Creative Media | [StudyVerse](https://devpost.com/software/studyverse-mxbws8) | github.com/dshal20/StudyVerse | Multiplayer hand-drawn pixel-art campus with voice study rooms | Next.js, Supabase Realtime | None (deliberately no AI art) | No | None stated |
| Best User Design | [Neuroview](https://devpost.com/software/neuroview) | github.com/CodingWithKantecki/NeuroView | Collaborative 3D brain-MRI viewer with annotation | Three.js, FastAPI, NiBabel | None | No | None stated |
| MLH Gemini | [Explainable](https://devpost.com/software/explainable) | github.com/eren-s-chang/explainable | Voice tutor with 2 age personas, on the web or by phone | React, Flask, Gemini, ElevenLabs, Twilio, Redis | **Voice agent** (speech → Gemini → ElevenLabs streaming) on a Twilio phone line | No | None stated |
| MLH Solana | [Nova](https://devpost.com/software/nova-ody7lm) | none listed | Crypto invoicing dashboard | Next.js, Solana, MongoDB | None | No | None stated |
| MLH DigitalOcean | [Talkio](https://devpost.com/software/talkio) | github.com/Ackberry/swamp-hacks | Post-call analysis for sales reps, plus sales-training simulations | Next.js, Twilio, OpenRouter (Gemini/Opus), ElevenLabs, DigitalOcean | Several LLM agents. ElevenLabs conversational agents play simulated buyers. Onboarding and supervisor agents. | No | None stated |
| MLH ElevenLabs | [ATC-Trainer](https://devpost.com/software/atc-trainer) | github.com/lucasmcclean/atc-view | Voice-controlled air-traffic-control simulator | Godot, Python, Gemini, ElevenLabs | Voice → Gemini parses the ATC command → ElevenLabs pilot reply | No | None stated |
| MLH Snowflake | [DataSmart](https://devpost.com/software/datamart-c0j52n) | github.com/NSang22/swamphacks26 | Dataset marketplace with plain-English queries paid per query on Solana | FastAPI, Snowflake, DuckDB, Solana, Gemini, Groq | RAG + NL-to-SQL with an automatic SQL-repair loop | No | None stated |
| MLH MongoDB | [FortBox](https://devpost.com/software/fortbox) | github.com/matheusmaldaner/FortBox | Roblox 1v1 build battles with ELO matchmaking | Lua, MongoDB, Gemini, ElevenLabs | Gemini coach + voiced commentary | No | None stated |
| GitHub "Ship It" | [KoalaKite](https://devpost.com/software/koalakite) | github.com/RJ-Tabelon/SwamphacksXI | Privacy-respecting parental-monitoring extension | Chrome MV3, Gemini 2.0 Flash | Vision LLM classifies screenshots (strict JSON) | No | Prize criteria: repo hygiene |
| Hidden: Least Vibecoded | [Pocket Money](https://devpost.com/software/pocket-money-bhrtio) | github.com/anduytran/pocketmoney | Budgeting app with grocery barcode scanning | React Native, Supabase, Gemini | Minor | No | Prize criteria: clean engineering |

### Observations

- **Morgan & Morgan explicitly asked for an agent orchestrator that routes tasks to specialist agents ($1,750).** All 3 winners built multi-agent legal pipelines. CaseForwardAI (orchestrator + named specialists + structured output + human review) is the cleanest pattern.
- **None of the 3 Best Overall winners is an LLM-agent app.** Each had a specific user and a working demo: ASL learners with a custom-trained CNN, Alzheimer's patients with a Pi wearable, backcountry hikers with GIS + A*.
- Gemini appears in 17 of 22 winners (driven by MLH). Voice on phone lines (Twilio + ElevenLabs) won 3 prizes.
- The "Least Vibecoded" and GitHub "Ship It" prizes reward engineering process, not just the demo.

---

## UGAHacks 11 (University of Georgia)

- **Devpost:** https://ugahacks-11.devpost.com/
- **Website:** https://11.ugahacks.com/ (recap page: https://11.wrapped.ugahacks.com/)
- **Dates / place:** Feb 6–8, 2026, Miller Learning Center, Athens GA. Theme: "Ignite the Magic Within".
- **Size:** 514 participants on Devpost (the recap says 955 registrations), **151 submissions**. 17 winner badges, and all 17 pages were read (by the helper agent).
- **Not awarded:** No winner badge for [MLH] Best Use of DigitalOcean; it was probably not awarded (unverified).
- **Judging:** A general expo. Sponsor tracks used each company's own criteria; no rubric was published.

### Tracks & prizes

| Prize | Sponsor | What it asked for | Reward |
|---|---|---|---|
| Best Overall Hack | UGAHacks | Top project | Gaming monitor |
| Best General AI Hack | Tractian | Outstanding AI implementation | Swag + Apple gift cards |
| Best Ground Up Model Hack | UGAHacks | A custom ML model built from scratch | Echo Dot |
| Best Hardware / Game / First Time / Solo Hack | UGAHacks | — | Drone / keyboard / headphones / projector |
| Most Magical Hack | UGAHacks | Best take on the theme | LED light bar |
| MLH Gemini / Presage / Solana / ElevenLabs / .Tech / DigitalOcean | MLH + sponsors | Best use of each tool | Swag / hardware (DigitalOcean: no winner found) |
| MLH Best Use of AI | Reach Capital | "Build an AI-powered solution for frontline workers" | Webcam + a meeting with investors |
| Cox Automotive Track (2) | Cox Automotive | "A working web application from scratch that leverages AI and focuses on a sustainability initiative local to Georgia" | not listed |
| Inventory Health Monitor | NCR Voyix | "Simple dashboard predicting stockouts and suggesting reorder timing" | not listed |
| Good Neighbor Challenge (2) | State Farm | "Create a product that will benefit your community" | not listed |

### Winners

| Place / Prize | Project | GitHub | What it does / who for | Built with | AI / agent use | HW? | Why it won |
|---|---|---|---|---|---|---|---|
| **Best Overall** | [Guardian Angel](https://devpost.com/software/guardian-angel-kzlehw) | github.com/saachivar/guardian-angel-ugahacks11 | Real-time fall detection that alerts caregivers by app, phone call and Alexa. For seniors. | Python, Flutter, MediaPipe, OpenCV, AWS, MongoDB | No LLM. **Custom-trained TFLite Transformer** on pose keypoints, running on the device | Partial (edge inference, Alexa) | None stated |
| Best General AI + State Farm | [AURA](https://devpost.com/software/ra-bot) | none listed (aura-hub.tech) | "24/7 RA" chatbot for UGA dorm residents: answers housing questions, books RA meetings, checks recyclability | Node, OpenRouter (GPT-3.5 + Gemini), LangChain | **RAG over 8 real UGA housing-policy documents**. Stacked vision (Gemini identifies, GPT classifies) for recycling checks. | No | None stated |
| Best Ground Up Model | [Mulberry ASL Translator](https://devpost.com/software/mulberry-asl-translator) | none listed | Two-way ASL translator | React Native, PyTorch, Google Cloud STT/TTS/Translate | Custom PyTorch sign-recognition model | Phone | None stated |
| Best Hardware | [Levionic](https://devpost.com/software/levionics) | github.com/aaaronqu/levionic | Motorized back-assist exoskeleton for lifting. For construction and warehouse workers. | VEX V5, IMU, motors, LiPo, C++ | None | **Yes** | None stated |
| Best Game | [Wizard Quest](https://devpost.com/software/wizard-quest) | github.com/carn181/ugahacks-11 | GPS/AR spell-duel game | Next.js, ar.js, Three.js, Socket.io | None | Phone | None stated |
| Best First Time | [SafeSense](https://devpost.com/software/safesense-peinl6) | github.com/kavyakavime/safeSense | $30 hazard detector: camera AI and sensors must agree before it alerts | Arduino, YOLOv8, Flask, Twilio | YOLOv8 + sensor-agreement logic | **Yes** | None stated |
| Best Solo | [WisprClaw](https://devpost.com/software/wisprclaw) | github.com/arjun-sa/wisprclaw | macOS push-to-talk voice layer for an AI agent | Swift, Python, Whisper, LLMLingua | **Voice front-end for an OpenClaw agent**: local Whisper STT, LLMLingua-2 prompt compression, streaming over WebSocket | Mac | None stated |
| Most Magical | [Magic Yahoos](https://devpost.com/software/magic-yahoos) | github.com/JinTheLin/Magic-Yahoos | Draw in the air with an LED wand and a 3D printer draws it live | ESP32, OpenCV, OctoPrint, G-code | Classic CV tracking only | **Yes** | None stated (fits the theme) |
| MLH Gemini | [Storacle](https://devpost.com/software/storacle-mol2fp) | github.com/braxtoons/storacle | Shelf photos → stock counts → stockout forecasts | Next.js, FastAPI, Gemini, Darts | Gemini Vision counts items + a time-series forecast | No | None stated |
| MLH Presage | [Focus Wizard](https://devpost.com/software/focus-wizard) | github.com/IsaacThoman/focus-wizard | Pomodoro wizard that scolds you by voice when you get distracted; optional Solana stake | Electron, React, Gemini, ElevenLabs, Presage, Solana | Gemini classifies on-task vs off-task; ElevenLabs voice | No | None stated |
| MLH Solana | [Loop](https://devpost.com/software/loop-iq5cfn) | github.com/vingupta22/UGAHacksXI | Staked GPS scavenger hunts that bring foot traffic to local businesses | Next.js, Anchor/Rust, Solana, Gemini | Gemini generates a structured JSON quest route | No | None stated |
| MLH Best Use of AI (Reach Capital) + Cox Automotive | [Sorcer](https://devpost.com/software/sorcer) | github.com/Korirussell/Sorcer | Carbon-aware LLM router: sends prompts to the greenest grid and defers non-urgent jobs | FastAPI, Next.js, LangGraph, Vertex AI (Gemini/Claude/Llama), ChromaDB, Redis, WattTime, Electricity Maps | **Agentic scheduler**: LangGraph state, "Agentic Deferral", multi-model routing on live grid-carbon data | No | None stated (won 2 prizes) |
| MLH ElevenLabs | [Lifeline](https://devpost.com/software/the-second-responder) | github.com/pranayjoshi/ugahacks11 | AI 911 overflow dispatcher: takes calls when no human is free and triages them for a dispatcher dashboard | Twilio, Gemini 2.0 Flash, ElevenLabs, Firebase, Node | **Real-time phone voice agent**: Twilio audio over WebSocket → Gemini extracts structured fields → calm ElevenLabs voice, 29+ languages | No (phone line) | None stated |
| MLH .Tech | [KnockLock](https://devpost.com/software/who-s-there-wr2kq3) | github.com/bainblan/KnockLock | Lock that opens on a knock pattern | Microcontroller, React, Supabase, Gemini | Gemini generates knock patterns | **Yes** | None stated |
| Cox Automotive | [Supa Idle](https://devpost.com/software/supa-idle) | github.com/SpicyNachos03/ugahacks-11 | Concept for moving AI data-center load onto idle consumer devices | Flask, React, Gemini, Jupyter | Gemini impact analysis | No | None stated |
| NCR Voyix | [Stockd](https://devpost.com/software/stockd) | github.com/stockd-ai/ugahacks11 | Restaurant inventory forecasting and reorder suggestions | Node, Postgres, Gemini, Chart.js | Gemini forecasting + natural-language "AI Copilot" | No | None stated |
| State Farm | [Spellcaster Academy](https://devpost.com/software/placeholder-i7k3fe) | github.com/Jayyk09/Spellcaster_Academy | RPG where you fight monsters with ASL signs | PyGame, MediaPipe, scikit-learn | RandomForest on custom-collected data | Webcam | None stated |

### Observations

- **Best Overall again went to a specific vulnerable user plus a physical-world trigger** (falls among seniors), using a custom-trained on-device model rather than an LLM agent.
- **The agent-heavy winners took the AI and sponsor categories:** Sorcer (LangGraph agentic scheduler, 2 prizes), Lifeline (real-time 911 phone voice agent), WisprClaw (voice front-end for an agent), and AURA (RAG grounded in real local policy documents).
- ASL/accessibility vision projects won at both UGAHacks and SwampHacks. Small custom-trained models (TFLite, RandomForest, PyTorch CNN) scored well in the "ground-up" and overall categories.
- 5 of the 17 winners are hardware.
- **Nothing was blocked.**
- **Some facts are not published anywhere:**
  - SwampHacks 1st vs 3rd overall (ReStory vs OffTrails)
  - The order of the Morgan & Morgan places
  - Any judges' reasons at either event
  - The UGAHacks DigitalOcean winner

---

## Cross-event takeaways (US South, 2026)

1. **Most overall winners solve a narrow human problem with a live, physical demo.** Examples:
   - Alleaf: stress, with haptic hardware.
   - Lumos: safety, with an agent that places a 911 call.
   - Guardian Angel: falls among seniors.
   - ReStory: Alzheimer's.
   - SignHero: ASL.
   - CORTEX: lost luggage.
   - MediBot: first aid.
   Several had no LLM agent at all.
2. **When agents did win overall, the agent was wired into a real system or sensor**, not a chat window:
   - HPC Runner: an MCP server that drives SLURM.
   - Haggle: biometrics injected into a voice agent's context every 2 s.
   - Crisis Averted: voice + function calling on a 3D globe.
   - Poker Face: several LLM opponents reading webcam tells.
   - aide: a tool-using agent with permission gates.
   - MediBot: a LiveKit voice agent + vision + robot arm.
3. **Sponsor briefs that ask for agents produce agent winners.** Examples: Morgan & Morgan's orchestrator (SwampHacks), NorthMark's non-expert HPC (TAMUhack), and Reach Capital's AI for frontline workers (UGAHacks). Read the sponsor briefs; they are where multi-agent designs win outright.
4. **Guardrails and human-in-the-loop show up repeatedly in agent winners:**
   - CaseForwardAI: attorney review of Action Cards.
   - aide: confirmation gates.
   - Checkpoint: agents can't approve their own work.
   - Scallion: a validator gate against invented numbers.
   - Dispatch: a GO/NO-GO answer with citations.
5. **Voice is the dominant agent interface.** ElevenLabs, Vapi, LiveKit and Twilio appear in top winners at every event.
6. **No event published judges' reasons for any win.** The "why" above is inferred from track fit and demo scope.

---

# Patterns (across all 18 events)

These are inferences from about 390 winner pages. No judge wrote down a reason, so treat them as correlations, not stated criteria.

## 1. The top overall prize usually goes to a specific person with a specific problem, and often to hardware
Grand and overall 1st places: Shepherd (a smart cane for blind people, no LLM), Lucid Voice (a voice for people who can't speak), Theracat (anxiety wristband and plush), Savebox (smart breaker box), SODIUM (care robot for seniors), Alleaf (stress-detection haptics), Guardian Angel (fall detection for seniors), MediBot (first-aid robot), Orca (firefighter training).

The pitch names the user ("1.7M legally blind Americans", "ALS patients", "incident commanders") and shows a working demo. Most winners at the smaller events used **no LLM at all**: WildHacks, SpartaHack, HackKU, the SwampHacks overall top 3, the UGAHacks overall winner, the Hack for Humanity top 3 and TreeHacks 1st place.

## 2. Agents won big when they did something real, not when they chatted
Agent projects that won overall or grand prizes closed a loop with a real-world action:
- opened GitHub PRs (Synapse)
- placed a 911 call with live GPS (Lumos)
- phoned businesses to negotiate bills or book tables (kiru, Sunday)
- drove a real SLURM cluster over MCP (HPC Runner)
- wrote and tested firmware on a real Raspberry Pi (Sentinel)
- delivered 100+ lbs of food to shelters (Project Lend)
- booked travel and checked real drug prices (MedSurge)
- browsed the web for blind users (Barracua)
- remediated CVEs with Devin (codebreaker)

"Agent platform" or chat-wrapper projects rarely won overall. TAMUhack's most elaborate agent project (Rover: orchestrator, computer use, phone agents and MCP) won only "Best Devpost".

## 3. Winning agents had guardrails and grounding, and the teams said so
Common patterns:
- **A deterministic core, with the LLM only at the edges.** ContainOS checks agent output against a physics model. Detour sends all math through SGP4 tools. Polaris and CareLoop keep fallbacks and payments deterministic.
- **Strict schemas and structured output.** Clair uses strict tool `input_schema`. CaseForwardAI validates output with Zod.
- **Human approval before consequential actions.** MedSurge, CaseForwardAI, aide, Claw-Jail and PriceWar all gate on approval.
- **Verification in the loop.** Orca uses consensus among vision agents, Checkpoint won't let agents approve their own work, and Scallion's validator rejects invented numbers.
- **Citations and RAG over official data.** Tribune requires a citation for every policy change, and the IrvineHacks winners grounded answers in Census data and a zoning handbook.

## 4. Voice is the default agent interface, and phone calls are the "wow" moment
ElevenLabs, Vapi, Deepgram, LiveKit and Twilio appear in winners at every event: roughly 7 of 12 winners at Hack for Humanity and about 8 of 18 at HackRice. Real outbound phone calls stand out: kiru, Sunday, Lumos (911), Lifeline (911), SODIUM (calls family) and FirstResponder-Relay (wildfire triage in 13+ languages). A voice agent that receives live sensor context (Haggle updates stress readings every 2 s) or controls the UI through tool calls (Rekindle, 3 prizes) goes beyond a plain voice chatbot.

## 5. Tools that make coding agents better are a proven winning category in 2026
- LA Hacks, the biggest SoCal event: 1st place codebreaker (a security agent harness, +34% on its own benchmark) and 3rd place Autopsy (records coding-agent failures and warns future runs).
- Berkeley: Inspector (multi-agent computer-use QA exposed as MCP tools for Claude Code, Cursor and Devin) was a finalist and won Hacker's Choice. Sentinel-Berkeley (an agent that proves exploits) was also a finalist.
- HackIllinois: Synapse (user-test feedback turned into automatic PRs) won Best General.
- CruzHacks: Entropy (a computer-use security agent) won Best AI.

Judges in this category responded to **measured numbers**: benchmark gains, token savings, latency.

## 6. Multi-agent designs win mainly where a sponsor asks for them, and prize-stacking is normal
- **Fetch.ai prizes:** about 10 winners at Berkeley and 8+ at LA Hacks, nearly all uAgents/ASI:One multi-agent pipelines.
- **Agent-shaped sponsor briefs:** Morgan & Morgan (SwampHacks: "an orchestrator routing to specialist agents"), NorthMark (TAMUhack: non-expert HPC) and Cognition (LA Hacks) produced agent winners that followed the brief literally.
- **Stacking:** most winners list 4-8 sponsor tools and many took 2-3 prizes. Examples: Shepherd 3, Rekindle 3, OpenReality 3, Teli 3, Synapse 2, Mira 2.
- **Common infrastructure:** Modal for GPU inference, Browserbase/Browser Use for browser agents, Perplexity Sonar, Redis, Arize/Langfuse for observability.

## 7. Depth and proof beat polish alone, but demo polish decides the ties
**Technical depth:** grand-prize winners at TreeHacks, Berkeley and HackIllinois had real depth under the demo:
- on-device models (Lucid Voice: Gemma via MLX, voice cloning)
- 3D Gaussian splats (IronBook) and world models (Orca)
- custom-trained models (Savebox's forecasting model, Guardian Angel's TFLite model)
- self-hosted science models (Ligands: Boltz-2 and AlphaFold on Modal)

TreeHacks also gave "Most Technically Complex" to Freak in the Sheets, an LLVM-to-Google-Sheets compiler with no AI.

**Real-world proof:** real deliveries (Project Lend), paying customers (TradeProof), 200 real city policies (Tribune), iteration with ex-CalFire leaders (ContainOS), a physician consult (Clair), and a rediscovered drug, Gleevec (Ligands).

**Judging formats reward a crisp demo:**
- Berkeley: 5-minute table demos.
- Hacklytics: scored a demo video.
- TAMUhack and HackRice: required 2-4 minute videos.

## 8. Domains that kept winning
- **Healthcare, eldercare and accessibility:** blind users, ALS, seniors, dementia, ASL, deafblind students.
- **Emergency response and wildfire:** ContainOS, Orca, FirstResponder-Relay, Lumos, HeartStart, Aegis. This is relevant to BC.
- **Developer and agent tooling:** see pattern 5.
- **Civic tools on public data:** ballot measures, zoning, 311, policy.

## Implications for an AI-agent team at Edison (our read)
- Pick **one named user with a sharp, expensive problem**, not "an agent platform".
- Have the agent **take one real, verifiable action live on stage**, such as a call, a PR, a booking or a filed form. Show its tool-call trace.
- Add **visible guardrails**: an approval gate, schema validation, a deterministic check, citations. Name them in the pitch.
- Consider **voice** as the interface, and consider cheap hardware or sensor input if it fits the story.
- **Read the sponsor briefs at track drop** and stack 2-3 sponsor tools you genuinely use.
- Show a **number**: a benchmark result, time saved, cost reduction or accuracy.
