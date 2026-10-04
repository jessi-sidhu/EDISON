# Serious, software-only AI/agent winners: Part 1 (Hack the North, HackMIT, LA Hacks 2026)

Sources: `2026-winners-canada.md` (HTN), `2026-winners-us-east.md` (HackMIT) and `2026-winners-us-west-midwest.md` (LA Hacks). I checked unclear rows on their Devpost pages or through the Plume API. I also fetched the LA Hacks gallery pages 1-4, because the notes had full detail for only 28 of its 65 winners.

**Filter (all must hold):** (1) an LLM, AI model or agents is load-bearing at runtime; (2) software-only (a laptop, phone, iPhone LiDAR or webcam is fine; no robots, ESP32, sensors, wearables, glasses or headsets); (3) a serious product (educational games with a clear audience stay; party games and jokes go).

**Prize counting:** each distinct prize line on the project page counts as 1. "1st Place + Grand Prize" in one GiveCampus line counts as 1. HTN "Finalist" counts as 1. HTN has no ranked top 3: 12 unranked finalists are its top tier.

**Archetypes:** the 11 given tags plus 4 new ones, added only where nothing fit:
- **BACKOFFICE-AGENT**: agents automate a business workflow (finance close, procurement, fundraising ops) with human review.
- **COMMERCE-AI**: AI shopping, merchant or storefront experience.
- **SEARCH-MATCH**: AI search, recommendation or matching of people and resources.
- **APPLIED-ML**: a trained non-agent model does one bounded prediction or extraction job.

| Event | Winners reviewed | Kept | Excluded |
|---|---|---|---|
| Hack the North 2026 | 74 | 40 | 34 |
| HackMIT 2026 | 50 | 32 | 18 |
| LA Hacks 2026 | 65 | 49 | 16 |
| **Total** | **189** | **121** | **68** |

---

## Hack the North 2026 (Sept 18-20, Waterloo)

Only 2 of the 12 finalists are pure software AI (Bricked, Settlers of Solana). Composition (phone-only AR) and CADEX (photo to CAD) are kept as software, which makes 4 kept finalists.

| # | Project | Link | Prizes won | N | What it does | For whom | How AI/agents are used | Archetype |
|---|---|---|---|---|---|---|---|---|
| 1 | Composition | https://devpost.com/software/composition | HTN Finalist; MLH Best Use of Gemini API | 2 | Move your phone like a camera to direct agentic AI video generation | Filmmakers, creatives | Gemini manages scene state with typed, validated tool edits; Gemini Live voice direction; vision on frames; Veo/Seedance generation | CREATIVE-MEDIA |
| 2 | CADEX | https://devpost.com/software/cadex | HTN Finalist | 1 | Photo + measurements to manufacturable CAD, drawings and assembly steps | Makers without CAD skills | OpenAI vision + structured outputs; Codex CLI as an autonomous CAD agent writing CadQuery with a self-validation loop (the 3D print was only demo output) | BUILDER |
| 3 | Bricked | https://devpost.com/software/a-feuvb1 | HTN Finalist | 1 | Text to 3D LEGO model; you watch the agents plan, build and validate, and can steer them | LEGO fans | Multi-agent: Sonnet planner + per-layer builders, deterministic inspector, Opus vision critic, grammar-constrained BrickGPT | BUILDER |
| 4 | Settlers of Solana | https://devpost.com/software/_solanasim | HTN Finalist; Solana Best Use of Solana ($5k or $2.5k) | 2 | 100+ LLM agents work and trade in a debt-based economy on Solana | Crypto/econ-sim audience | Autonomous agents with 11 tools execute real on-chain transactions; models compared via Baseten | SIMULATION |
| 5 | AdLib | https://devpost.com/software/living-canvas-gz360v | Rox Best AI Agent ($10k 1st or $2k 2nd; which one is not shown) | 1 | Listens while you present and draws diagrams, charts and images live; edit by voice | Presenters | Local Whisper -> decision agent with structured tool calls; SDXL-Lightning; code guardrails (numbers must appear in the transcript, destructive actions need confirmation) | CREATIVE-MEDIA |
| 6 | Jevis | https://devpost.com/software/skillweaver | Rox Best AI Agent ($10k or $2k) | 1 | Browser agent learns a web task once, then replays it as a skill with zero model calls | Devs/businesses automating the web | Computer-use browser agent; Claude synthesizes reusable skill code; voice input | ACTION-AGENT |
| 7 | Pixie | https://devpost.com/software/pixie-8vlj7g | Intact Quoting Interface of the Future; Federato Insurance Agent ($3,500) | 2 | One inspectable risk engine for commercial underwriting and consumer quoting | Underwriters, insurance customers | Multi-agent (Intake, Hazard, Portfolio, Appetite), MCP tool calling, vector retrieval, guardrails that block model numbers missing from computed facts | EXPERT-COPILOT |
| 8 | Signal | https://devpost.com/software/temp-project-0sp3zv | RBC Signal in the Noise | 1 | Q&A over financial research with line-level citations; flags conflicts and gaps | Financial analysts | Multi-agent OpenAI + Composio tools; hybrid RAG (Elastic keyword + vector); GPTZero flags AI-written passages | EXPERT-COPILOT |
| 9 | FinRet | https://devpost.com/software/finret | RBC Signal in the Noise | 1 | Evidence-first finance research harness with cited, auditable answers (29/30 on the unseen corpus) | Financial analysts | Bounded agent tool loop, hybrid retrieval, citation verification, audit trail | EXPERT-COPILOT |
| 10 | Squawk | https://devpost.com/software/atc | MLH Best Use of ElevenLabs | 1 | ATC copilot: conflict-free routing, catches wrong pilot readbacks | Air traffic controllers | Fine-tuned Whisper (WER 0.708 -> 0.159); cross-encoder readback check; GLM agent with a budgeted tool loop; Elastic RAG; ElevenLabs pilot voices | EXPERT-COPILOT |
| 11 | Dealify | https://devpost.com/software/bazaar-wgv16i | Shopify Hack Shopping with AI | 1 | AI shopkeeper negotiates within merchant rules; a "Gym" simulates 300 shoppers | Shopify merchants + shoppers | LLM picks from a code-generated offer menu (the LLM chooses, code writes the menu); ElevenLabs voice | COMMERCE-AI |
| 12 | Bloxify | https://devpost.com/software/bloxify | Shopify Hack Shopping with AI | 1 | Shopify storefronts inside Roblox with heatmaps; an agent runs layout experiments | Merchants selling to Roblox players | Autonomous marketing agent on CF Workers; tool calls to Shopify Admin, Roblox APIs and Studio MCP; memory | COMMERCE-AI |
| 13 | Twinventory | https://devpost.com/software/project-name-s0vg5w | MLH Best Use of MongoDB Atlas | 1 | Digitize your wardrobe, AI try-on, 3D previews | Online shoppers | Image-gen try-on, embedding search, voice input | COMMERCE-AI |
| 14 | plus1 | https://devpost.com/software/plus1-1imlbz | Browserbase Best Use of Browserbase ($2,000) | 1 | AI participant joins Google Meet with a face and voice, acts and screenshares | Insurance professionals in meetings | Voice agent with barge-in; multi-hop tool calls (quoting, underwriting, browser automation) | ACTION-AGENT |
| 15 | Whim | https://devpost.com/software/idk-man-794g6v | Linq Best Use of Linq; Cloudflare Best Agent with a Brain | 2 | AI widgets in iMessage group chats: games, party shopping, end-to-end trip booking | Group chats | Autonomous tool-calling agent (web research, bookings, shopping) with CF memory/state/workflows | ACTION-AGENT |
| 16 | Providence | https://devpost.com/software/providence-tn6m4h | Aramco Best Beginner Hack | 1 | "Superagent" coordinates agents across your devices and carries context between them | Multi-device power users | Codex-based multi-agent delegation; computer use on Mac/Win; ElevenLabs voice (web core; Watch/Quest optional) | ACTION-AGENT |
| 17 | YourCall | https://devpost.com/software/yourcall-0epzc4 | Zip Best Use of Zip | 1 | Approve procurement requests with an iMessage voice note | Managers / procurement | Gemini parses intent only; deterministic policy engine; human confirmation; read-only Zip MCP | BACKOFFICE-AGENT |
| 18 | neoKernel | https://devpost.com/software/neokernel | Baseten Best Use of Baseten | 1 | Agent loop auto-optimizes an LLM inference engine (4.3x, 932 tok/s, token-identical) | ML infra engineers | Coding agents propose whole-file changes; unit-test repair loop; correctness gate | BUILDER |
| 19 | ChatGPU | https://devpost.com/software/ji-review | Sentry Best Use of Sentry | 1 | Agent adapts, validates and runs code across heterogeneous GPU/CPU workers | Devs with mixed hardware | GPT planning + function-calling loop; numerical validation | BUILDER |
| 20 | Tinker | https://devpost.com/software/tinker-pwamby | Backboard Built on Backboard; MLH Best Use of Gemini API | 2 | "Vibe code hardware": describe a machine, get design, sim, blueprint and build steps | Software devs new to hardware | Gemini vision QA; openJiuwen multi-agent verification; Composio tools | BUILDER |
| 21 | Parity | https://devpost.com/software/parity-8n5zbf | Huawei openJiuwen Multi-Agent Challenge | 1 | Agent swarm migrates a codebase to a new language and proves equivalence with tests | Engineering teams | ReAct agents with compile/run tools; escalates to Claude on failure | BUILDER |
| 22 | Agentigram | https://devpost.com/software/clankergram | Tether Best Sovereign App | 1 | Coding agents on different laptops detect conflicting changes and negotiate interfaces | Teams running Claude Code/Codex/Gemini CLI | Local 1B Llama (QVAC, grammar-constrained); hooks into CLI agents; deterministic collision detection | AGENT-DEVTOOLS |
| 23 | Agent-Gate | https://devpost.com/software/agent-wall-hqrjvb | Zip Best Use of Zip | 1 | Policy firewall that intercepts agent tool calls before they run | Enterprises running agents | 5-node LLM judge + deterministic rules; MCP proxy; hybrid retrieval | SAFETY-PRIVACY |
| 24 | Aegishmesh | https://devpost.com/software/aegismesh-oj813b | Tether Best Sovereign App | 1 | Zero-trust mesh: 7 specialist agents investigate, then gated execution with signed capabilities | Orgs deploying autonomous agents | Multi-agent (openJiuwen), OpenAI verification, local QVAC inference, trust scoring (Pi only an optional edge demo) | SAFETY-PRIVACY |
| 25 | Minny | https://devpost.com/software/minny | CSE Log & Order | 1 | Names the insider threat in web logs with evidence; red-team stress test | Security analysts | Claude "blue agent" proposes detection rules; autonomous red team generates evasions; deterministic validation gates | SAFETY-PRIVACY |
| 26 | WatchTower | https://devpost.com/software/cadify | CSE Log & Order | 1 | HTTP logs to provable incident response | SecOps | Isolation forest + rules; LLM summaries cross-checked against evidence tables | SAFETY-PRIVACY |
| 27 | Trace | https://devpost.com/software/loggr | CSE Log & Order | 1 | Unsupervised log anomaly detection | SecOps | Classic ML (GMM, autoencoder); tested LLM triage and found classic ML better (borderline on the AI criterion) | SAFETY-PRIVACY |
| 28 | Snitch (HTN) | https://devpost.com/software/snitch-ldyzh9 | GPTZero Best Use of GPTZero API | 1 | Flags AI-assisted cheating moments in remote interviews | Recruiters | GPTZero detection; LLM CV-consistency checks; visual prompt-injection canaries | SAFETY-PRIVACY |
| 29 | Sham | https://devpost.com/software/cool-ppl-from-amplify | GPTZero Best Use of GPTZero API | 1 | Chrome extension risk-scores online stores using review authenticity and social signals | Online shoppers | GPTZero on reviews; LLM extraction; deterministic orchestration | SAFETY-PRIVACY |
| 30 | MedBot | https://devpost.com/software/medbot-2e40oh | GPTZero Best Use of GPTZero API | 1 | Fact-checks viral health claims against the literature; makes explainer videos | Social-media users | Transcription + claim extraction; RAG over Europe PMC/MedlinePlus; citation validation; narration | RESEARCH-AGENT |
| 31 | Triviality | https://devpost.com/software/rbc-buddies | MLH Best Use of Vultr | 1 | Agent swarms attack open math problems, verified in Lean | Mathematicians | 6-role agent swarm + formal verification | RESEARCH-AGENT |
| 32 | S.L.O.P. | https://devpost.com/software/north-inc | MLH Best Domain Name (GoDaddy) | 1 | Originality checker for project/startup ideas | Hackers, builders | Multi-agent debate + citation verification + coach | RESEARCH-AGENT |
| 33 | hereafter | https://devpost.com/software/physical-studio-code | Elastic Find the Signal | 1 | "Version control for your future": simulates life-decision paths using live web research | Individuals making life decisions | OpenAI planning/narration; Elastic Agent Builder ES\|QL tools; Pydantic schemas stop invented stats | SIMULATION |
| 34 | Gods Plan | https://devpost.com/software/shift-t15x3m | Cognition Best Use of Devin | 1 | 3D city sandbox with thousands of AI residents to stress-test policy | Urban planners | openJiuwen ReAct specialists; resident swarms on multiple LLMs; action validation | SIMULATION |
| 35 | YiQun | https://devpost.com/software/project-ki3u7vwhj0x8 | Huawei openJiuwen Multi-Agent Challenge | 1 | Voice-commanded simulated 512-robot disaster-rescue swarm | Incident commanders | Gemini multimodal + audio voice; 4 role agents; GRPO fine-tuning; graceful degradation (simulation only) | SIMULATION |
| 36 | Project Orion | https://devpost.com/software/project-atlas-icfow4 | MLH Best Use of MongoDB Atlas | 1 | AI crew plans a trip, then flies you through it in photoreal 3D | Travelers | 4 GPT agents (scout, judge critic loop, narrator, director with vision); routing in code (web version; Quest optional) | ACTION-AGENT |
| 37 | VoiceBridge | https://devpost.com/software/voicebridge-xh0nv9 | Baseten Best Use of Baseten | 1 | Recovers dysarthric speech and re-speaks it in the user's own voice | People with dysarthria | LoRA fine-tuned ASR on dysarthric data; voice-clone TTS; confirmation step | COMPANION-VOICE |
| 38 | PawTrace | https://devpost.com/software/tailsignal | Elastic Find the Signal | 1 | Finds lost pets by fusing sightings and doorbell footage into a probability map | Pet owners, shelters | Agent with 13 tools; YOLOv8 + DINOv2 image matching | SPATIAL-VISION |
| 39 | DominIQ | https://devpost.com/software/dominiq | Dominion Dynamics WHITEOUT | 1 | Simulated drone swarm geolocates a ship; voice mission assistant | Defence/maritime operators | Custom YOLO; GPT-4o + Whisper + ElevenLabs voice assistant grounded in telemetry (simulation only) | SPATIAL-VISION |
| 40 | Save My Rims | https://devpost.com/software/detect-pot | MLH Best Use of Tiger Data | 1 | Phone-IMU pothole detection and pothole-avoiding routing | Drivers | Transformer on phone IMU data; ElevenLabs voice navigation | APPLIED-ML |

**Excluded (34):** hardware: Reflex, Orbis Engine (Quest), Combadge, Keymaeleon, TakeOne, Aircade (AirPods as motion controller), Granny Waymo, ARDB, EyeMelody, SpideyIRL, Hedge The North, Realbot, GitIRL Bot, PrintDnD, Badminbuddy, Gestura, Feel The Music, You Light I Lift, LeLamp Play Pack, Octavius, Goosetriever, Scout, PiHive, Otto, bingbong, Among Us IRL. No runtime AI: Concerto, DogWatch, Shadow Stalker, Cospray, HumanCraft (Devin-built), fly VS worm (minor). Party/novelty: punching-face (Finalist + Sentry; borderline) and messageMAFIA.

---

## HackMIT 2026 (Sept 19-20, MIT)

The whole overall podium used hardware (Peel, GPU, CareChair). The best kept projects are track and sponsor winners.

| # | Project | Link | Prizes won | N | What it does | For whom | How AI/agents are used | Archetype |
|---|---|---|---|---|---|---|---|---|
| 1 | Elute | https://plume.hackmit.org/project/afzbr-ptgza-tcorl-mrobb | OpenAI 2nd - The Fifth Teammate; Regeneron Grand Prize - Clinical Trials & Biostatistics | 2 | Stress-tests drug-disease hypotheses before companies invest in them | Pharma / drug-discovery teams | Agentic orchestrator decomposes the hypothesis into subtasks, routes them to real tools (Harvard ToolUniverse, Open Targets), surfaces weakest links | RESEARCH-AGENT |
| 2 | Rumi | https://plume.hackmit.org/project/aajnp-oqnis-ttafi-kbgks | Ramp 2nd - Save Time. Save Money; Long Lake Winner - Convince a Non-Believer | 2 | Turns your room, taste and budget into an editable 3D plan made from real products | Budget/dorm room furnishers | OpenAI design/shopping agent reads inspiration images, searches stores (Exa), places items in 3D (iPhone LiDAR RoomPlan scan) | COMMERCE-AI |
| 3 | Money Maxer | https://plume.hackmit.org/project/nlhtb-gqmiu-yvcyw-pibeg | Ramp 3rd - Save Time. Save Money; Maximor 4th - Office of the CFO Agent | 2 | Agent finance team that saves a company money | Finance teams | Claude Agent SDK; tiered models under budgets; deterministic checks on a single write path | BACKOFFICE-AGENT |
| 4 | VistaAI | https://plume.hackmit.org/project/cslzr-pathl-qrbxv-xahcq | Maximor 1st - Office of the CFO Agent ($4k) | 1 | AI operating layer for private-equity roll-ups: ingests messy CSV/XLSX and proposes schema mappings | PE portfolio finance teams | Multi-agent ingestion + mapping proposals with a human review queue | BACKOFFICE-AGENT |
| 5 | CFO-Sabbatical | https://plume.hackmit.org/project/zwjij-edzdv-vmitm-apwhq | Maximor 2nd - Office of the CFO Agent ($2k) | 1 | Agent system that runs the CFO office over Gmail and Stripe invoices | Small-company finance | 15 Grok agents with tool use | BACKOFFICE-AGENT |
| 6 | Sherlock | https://plume.hackmit.org/project/cxwit-mchwb-zrdld-pegqj | Maximor 3rd - Office of the CFO Agent ($1k) | 1 | AI finance team investigates discrepancies, reconciles and reports | Finance teams | 22-role LangGraph "finance org"; traceable calculations; checkpointed human-in-the-loop | BACKOFFICE-AGENT |
| 7 | TrueUp | https://plume.hackmit.org/project/bktpj-dafuf-nalsl-ctlel | Maximor 5th - Office of the CFO Agent | 1 | End-to-end accrual agent | CFOs / controllers | LLM agents reason over ambiguous documents; deterministic code owns dollar math | BACKOFFICE-AGENT |
| 8 | Stewardship Sam | https://plume.hackmit.org/project/alqmf-ljbou-vlpzr-ujkfk | GiveCampus 2nd + Most Production Ready | 1 | Relationship-intelligence "steward" agent over a donor graph | University fundraisers | OpenAI grounded explanations and plain-English Q&A over a NetworkX graph; deterministic signal detection | BACKOFFICE-AGENT |
| 9 | EvidenceAtlas | https://plume.hackmit.org/project/tmycj-brjsr-utych-ogsug | Regeneron Runner-Up | 1 | Links trial registrations to publications to expose missing (failed) trials that bias effect sizes | Trial designers, biostatisticians | LLM extracts hazard ratios and judges paper-to-registration matches; Elastic retrieval | RESEARCH-AGENT |
| 10 | ReBind | https://plume.hackmit.org/project/sebhi-dhiaw-sewec-fuigt | Regeneron Honorable Mention | 1 | Drug repurposing by binding-site residue similarity instead of chemical similarity | Drug-repurposing researchers | Agentic pipeline: LLM ranks targets from the literature and runs folding (Boltz-2), docking and similarity tools | RESEARCH-AGENT |
| 11 | Kingdom | https://plume.hackmit.org/project/joohi-tssln-wtyad-hmqnd | Cognition Best Use of Devin ($5k) | 1 | Each hypothesis over a big dataset becomes an autonomous "Mission" that runs, branches or is killed | Quant/data researchers | One Devin session per hypothesis; results feed a live research thread | RESEARCH-AGENT |
| 12 | nullMap | https://plume.hackmit.org/project/cuqqq-zpzje-qzyls-tmbjd | Elastic 2nd - Find the Signal | 1 | Searchable medical null results | Medical researchers | Vector search; LLM reads full papers and labels results positive/negative/null | RESEARCH-AGENT |
| 13 | Wattson | https://plume.hackmit.org/project/bluya-csoqu-usczi-bcgww | Arrowstreet Best Textual Analysis Hack | 1 | Checks data-centre renewable claims against 4.45M hours of federal meter data | Asset managers / ESG analysts | LLM extracts claims from 354 filings; OpenAI tool-calling Q&A; Grok day-vs-night screen | RESEARCH-AGENT |
| 14 | Scutaris | https://plume.hackmit.org/project/unojd-vdowr-qonmp-vqagq | SpaceXAI Make it Legendary | 1 | Orbital safety command center finds risks in real CelesTrak data | Space-ops analysts | Elastic risk search; Grok turns each threat into a mission briefing | EXPERT-COPILOT |
| 15 | Ebby | https://plume.hackmit.org/project/wwbic-swtyw-xygde-nrzcc | Regeneron Honorable Mention | 1 | Context-aware clinical assistant: contactless vitals from camera/mic plus visit tracking | Clinicians, trial visits | Agent tracks the visit agenda; LLM reasoning over camera vitals and voice features; wav2vec2 (iPhone + web) | EXPERT-COPILOT |
| 16 | FRIDAY | https://plume.hackmit.org/project/fkbzo-xqhff-jgchs-azula | OpenAI 3rd - The Fifth Teammate | 1 | Describe a room in a sentence and shop it in browser 3D | Furniture shoppers | Deepgram voice -> NL compiled to a constraint DSL -> Elastic catalogue query | COMMERCE-AI |
| 17 | PIXX-AR | https://plume.hackmit.org/project/cgagh-xingl-zlnht-aiqyg | Visa Reimagine Shopping ($5k) | 1 | Spatial shopping: snap your room, place items, check out across retailers | Students furnishing rooms | Gemini reads the room photo; AI stand-in objects; agentic multi-retailer checkout via Visa Trusted Agent Protocol | COMMERCE-AI |
| 18 | camp | https://plume.hackmit.org/project/froib-urbmc-nphhn-ugmor | Ramp 1st - Save Time. Save Money | 1 | Mac-notch lunch ordering that batches delivery fees across coworkers | Office workers | OpenAI natural-language "craving" search over menus; scoring recommender (AI is light) | COMMERCE-AI |
| 19 | Burrow | https://plume.hackmit.org/project/iecbs-pgvcb-vklxe-bfbtl | Education Track Winner | 1 | Browser bunny tutor watches you work and teaches Socratically without leaking answers | Students | Browser/computer-use agent: bounded observe-decide-execute-verify loop over ~25 validated actions; memory; server-side answer-leak guardrails | TUTOR-EDU |
| 20 | MathMatch | https://plume.hackmit.org/project/givtb-jfvaz-amjmc-dtcuf | Beginner Track Winner | 1 | Swipe-and-duel proof math with Elo matching | Students learning proofs | GPT grades typed/spoken proofs and generates/matches problems; Deepgram STT | TUTOR-EDU |
| 21 | Braillie | https://plume.hackmit.org/project/qhrlf-bsrzd-xinnt-pvcbe | Deepgram Build Something Worth Talking To | 1 | Phone camera tracks your finger on printed braille and coaches you by voice | Blind / low-vision learners | CV finger tracking + Deepgram voice tutor, fully voice-operated | TUTOR-EDU |
| 22 | Scenar.io | https://plume.hackmit.org/project/rpbsx-etzty-tttwk-fhnlt | ElevenLabs 3rd | 1 | Immersive language learning in generated real-world scenarios | Language learners | OpenAI generates scenario, NPCs and goals; ElevenLabs two-way speech (desktop Unity) | TUTOR-EDU |
| 23 | RSpace | https://plume.hackmit.org/project/gmbqz-ythjg-mqrfp-aklbo | ElevenLabs Winner | 1 | One-button voice companion that remembers you and introduces you to people with shared interests | Older adults | Voice agent with cross-conversation memory + matching | COMPANION-VOICE |
| 24 | Recall | https://plume.hackmit.org/project/cocds-fxbwj-czmjd-uzpbs | Dropbox 1st - Digital Chaos | 1 | Proactively calls people with dementia for active-recall sessions | People with dementia + families | Proactive voice agent grounded in a family-photo knowledge graph (RAG) | COMPANION-VOICE |
| 25 | btw | https://plume.hackmit.org/project/eelwb-vsngo-fgsei-tovgv | Meta 3rd - Bringing People Closer Together | 1 | Personalized prompts that get families and grandparents talking | Families | Meta model reads photos, text and voice to write prompts | COMPANION-VOICE |
| 26 | Mozaic | https://plume.hackmit.org/project/jupxp-mskne-ykjyb-vpygr | Regeneron Honorable Mention | 1 | Patient "passport" to find, join and follow clinical trials | Trial patients + clinic staff | Meta model writes study briefs, answers from the record, peer explanations | COMPANION-VOICE |
| 27 | ReconMed | https://plume.hackmit.org/project/zvpok-azzil-txodm-okxid | Regeneron Honorable Mention | 1 | Voice agent phones trial participants to review medications before visits | Trial coordinators / participants | Local LLM voice agent doing structured med reconciliation by phone | ACTION-AGENT |
| 28 | Pilot | https://plume.hackmit.org/project/miaaf-vqolp-etbqr-beghb | Token Company LLM Cost Saving Winner | 1 | Agent explores a site once and compiles a reusable, versioned extraction function | Agent builders | Browser agent + code synthesis; MCP; later agents skip browser automation | AGENT-DEVTOOLS |
| 29 | cliQue | https://plume.hackmit.org/project/lsvot-fzttd-zfhap-wkzsw | Warp Best Developer Tool | 1 | Pools a team's local devices into one shared LLM endpoint for coding | Dev teams | Local-LLM routing, chat, code edits, MCP | AGENT-DEVTOOLS |
| 30 | ClubHub | https://plume.hackmit.org/project/caruu-rcnjn-yzrse-akiwz | Dropbox 2nd - Digital Chaos | 1 | Makes sense of messy campus websites and matches students to clubs | University students | Claude extraction from posters/PDFs; Voyage embeddings matching | SEARCH-MATCH |
| 31 | GiveMore | https://plume.hackmit.org/project/spviw-pijif-gzrma-stlme | GiveCampus Best Beginner + Early Prize | 1 | Identifies top potential donors | Major gift officers | Trained model predicts donation amounts (no LLM) | APPLIED-ML |
| 32 | Erbgut | https://plume.hackmit.org/project/mwrat-butaa-qmvaa-aebuw | Sustainability Track Winner | 1 | DNA data-storage codec tuner with channel simulator | DNA-storage researchers | Small CNN decoder + learned risk model (no LLM) | APPLIED-ML |

**Excluded (18):** hardware: Peel (1st Overall), GPU (2nd), CareChair (3rd, 4 prizes), Spidey Sense, Keiko, Klick, Lil-Vro (ESP32 box), Memory Palace (Ray-Ban), MixMind, Newton's Playground (kiosk + GX10), Paw Patrol, Prompt Grass, SignalHound, Spatium, The PenPal. No load-bearing AI: DonoRex (deterministic), ROFL (CUDA kernels). Party game: ClashMIT.

---

## LA Hacks 2026 (Apr 24-26, UCLA)

LA Hacks gave its 1st and 3rd Overall to software AI-agent devtools.

| # | Project | Link | Prizes won | N | What it does | For whom | How AI/agents are used | Archetype |
|---|---|---|---|---|---|---|---|---|
| 1 | codebreaker | https://devpost.com/software/codebreaker-la | 1st Overall; Cognition Company Challenge | 2 | Detects, validates and auto-fixes vulnerabilities; ships its own CVE benchmark | Dev / security teams | Security-specialized agent harness (CVE lookup, DeepWiki, exploit reasoning) around frontier models (+34% on its benchmark); Devin reproduce-then-patch loop | AGENT-DEVTOOLS |
| 2 | Autopsy | https://devpost.com/software/autopsy-zq5d84 | 3rd Overall; Cognition Company Challenge | 2 | Flight recorder + failure knowledge graph for coding agents; injects warnings into future runs | Teams using coding agents | Semantic retrieval + 3-hop graph traversal into the system prompt; rules + optional LLM classifier; postflight lint/test | AGENT-DEVTOOLS |
| 3 | MultiEval | https://devpost.com/software/multival | Fetch.ai Agentverse; Cognition Company Challenge | 2 | Eval platform for multi-agent orchestration with traces and A/B tests | Agent builders | "Agentic Evolve" Claude meta-agent reads a harness, forms hypotheses, generates benchmarks, runs evals, iterates | AGENT-DEVTOOLS |
| 4 | Lore IDE | https://devpost.com/software/lore-ide-the-first-ide-for-agentic-code | Cognition Company Challenge | 1 | Captures the reasons behind code from agent session logs and serves them to agents | Devs using coding agents | LLM distillation + 3-layer retrieval exposed as an MCP server | AGENT-DEVTOOLS |
| 5 | ACG | https://devpost.com/software/acg | Cognition Company Challenge | 1 | Predicts which files each agent task touches so parallel agents don't collide (-54% prompt tokens) | Teams running parallel coding agents | Multi-agent coordination infrastructure | AGENT-DEVTOOLS |
| 6 | MarkCodePolo | https://devpost.com/software/markcodepolo-by-freakmont-warriors | MLH Best Domain Name (GoDaddy) | 1 | Navigable codebase relationship graphs that cut agent token use | Engineers + coding agents | Gemini annotations/embeddings; 6-agent uAgents bureau | AGENT-DEVTOOLS |
| 7 | Litho | https://devpost.com/software/ai-rtl-agent | Cognition Company Challenge | 1 | VSCode agent that designs chips: NL -> Verilog -> tests -> waveform debug | Hardware designers (HDL only) | 4 agents (Orchestrator, Spec, Writer, Tester) with focused context windows | BUILDER |
| 8 | Conjure | https://devpost.com/software/conjure-m960jz | Fetch.ai Agentverse | 1 | Prompt -> walkable 3D interior in the browser | Designers, hobbyists | Sequential planning agents -> parallel build agents -> validation agents | BUILDER |
| 9 | beehyv | https://devpost.com/software/beehyv | Organizers' Choice | 1 | Finds gaps in ~100k arXiv papers and writes cross-pollinated research proposals with code | Researchers | Hierarchical multi-agent "Queen Bee" orchestrator + paper/planning/coding/judge workers (GX10 optional) | RESEARCH-AGENT |
| 10 | Talantis | https://devpost.com/software/talantis | Figma Make Challenge | 1 | Maps school-to-company internship pipelines; an AI guide answers questions | Recruiters, students | Claude agent loop over 6 tools, on Agentverse | RESEARCH-AGENT |
| 11 | Veritas | https://devpost.com/software/veritas-98njsx | Arista Connect the Dots | 1 | Real-time YouTube fact-checking extension | YouTube viewers | Gemma claim extraction + verdicts; uAgent retrieval over Wikipedia and Google Fact Check | RESEARCH-AGENT |
| 12 | WebMedica | https://devpost.com/software/luma-ai-powered-personalized-health-context | Figma Make Challenge | 1 | Turns health articles into personalized briefs, bias checks and doctor questions | Women researching their health | Local Gemma summarizes against a health profile + grounded chat | RESEARCH-AGENT |
| 13 | Polaris | https://devpost.com/software/polaris-mh7rd8 | Best Social Impact Hack | 1 | Agentic hospital paging: classify alerts, route to the right clinician, SBAR handoff | Nurses, hospital operators | 4 agents (orchestrator, priority, case, risk sentinel); deterministic fallback at every LLM call | EXPERT-COPILOT |
| 14 | IMPULSE (EMT) | https://devpost.com/software/erewhon | Figma Make Challenge | 1 | iPhones as smart bodycams + dispatcher view with semantic video search and 3D reconstruction | EMTs, dispatchers | On-device multimodal models + local agent with memory | EXPERT-COPILOT |
| 15 | OceanOps | https://devpost.com/software/oceanops | ASUS Company Challenge | 1 | Mission control for ocean alkalinity enhancement: simulate, route, verify carbon removal | Marine carbon-removal operators | Multi-agent Gemma (geochemist, spatial, route agents) on a local box | EXPERT-COPILOT |
| 16 | Jarvis | https://devpost.com/software/jarvis-eifsyq | Fetch.ai Agentverse | 1 | Proactive browser copilot: inbox briefings, meeting detection, suggestions | Busy professionals | Orchestrator + specialized Agentverse agents; structured JSON with fallback | ACTION-AGENT |
| 17 | CareLoop | https://devpost.com/software/careloop-agentverse-care-companion | Fetch.ai OmegaClaw Skill Forge | 1 | Coordinates prescriptions, appointments, payments and caregiver updates | Older adults + caregivers | Specialist agents + browser-use; deterministic flows for payment, safety and booking | ACTION-AGENT |
| 18 | MAVN | https://devpost.com/software/mavn | Figma Make Challenge | 1 | Voice assistant finds in-network providers and books appointments | Patients | Voice agent + headless Playwright form-filling agent | ACTION-AGENT |
| 19 | Scaena OS | https://devpost.com/software/scaena-os | Figma Make Challenge | 1 | 4 agents book gigs: venue research, pitches, follow-ups | Musicians, comedians | Multi-agent with a learning loop (analytics agent retrains research/pitch agents); Gmail | ACTION-AGENT |
| 20 | startupOS | https://devpost.com/software/startupos | World U Challenge | 1 | Agent creates jobs/campaigns; verified workers apply and do tasks | Small businesses, gig workers | OpenAI agent; Browserbase/Stagehand browser auto-apply | ACTION-AGENT |
| 21 | StandIn | https://devpost.com/software/standin-skpgje | MLH Best Use of Auth0 AI Agents | 1 | Per-person agents gather status updates and handle low-stakes tasks to cut meetings | Professionals, orgs | Gemini routing; local Gemma redaction; uAgents; RAG over workspace | ACTION-AGENT |
| 22 | Pols 15 | https://devpost.com/software/pols-15 | Fetch.ai Agentverse | 1 | Stress-tests local candidates' policies with simulated voters, then drafts and posts | Local political candidates | 12 coordinated agents incl. demographic simulation and Composio posting | SIMULATION |
| 23 | NeuralLens | https://devpost.com/software/neurolens-2qgdm8 | Fetch.ai Agentverse | 1 | Predicts brain response to marketing visuals, then rewrites images/copy to raise engagement | Small businesses | 6-agent pipeline + optimize loop over Meta TRIBE v2 / DeepGaze | CREATIVE-MEDIA |
| 24 | Dots | https://devpost.com/software/dots-y5r21j | Catalyst for Care (Healthcare track); Fetch.ai Agentverse | 2 | Floor plans -> ADA tactile maps with a QR voice Q&A about the venue | Blind visitors, venues | Gemini extraction/generation; Fetch.ai Q&A agent; ElevenLabs voice agent per map | COMPANION-VOICE |
| 25 | Accent | https://devpost.com/software/accent-cdw2qi | Light the Way (Education track); Figma Make Challenge | 2 | macOS hotkey: speak your intent in any language; it highlights the right UI element and talks you through | Elderly and non-English users | Vision (RF-DETR UI detector) + Gemini intent resolution + ElevenLabs voice; guides rather than acts | COMPANION-VOICE |
| 26 | Northstar | https://devpost.com/software/northstar-7lcg45 | Fetch.ai Agentverse; Zetic Company Challenge | 2 | Hiker fall detection -> local voice triage -> camera vitals -> SOS, offline | Hikers | On-device Qwen triage (Zetic) + agent swarm coordination (phone only) | COMPANION-VOICE |
| 27 | PhysioPal | https://devpost.com/software/physiopal-r148d6 | Zetic Company Challenge | 1 | Corrects PT form, adapts routines to Health data, escalates to the physio | Home PT patients, elderly | On-device Qwen personalization; MediaPipe pose; fall detection | COMPANION-VOICE |
| 28 | My Voice | https://devpost.com/software/my-voice-w67t8v | MLH Best Use of Gemma | 1 | Webcam eye-tracking so motor-impaired patients can type and speak | Post-stroke / locked-in patients | Gemma phrase suggestions; ElevenLabs voice clone; MediaPipe face mesh | COMPANION-VOICE |
| 29 | Just Replay | https://devpost.com/software/just-replay | MLH Best Use of Vultr | 1 | Guided low-intensity versions of favourite activities with pose feedback | Seniors with limited mobility | Gemma conversational coach; MediaPipe pose; ElevenLabs | COMPANION-VOICE |
| 30 | Knova | https://devpost.com/software/knova-ekxagv | Zetic Company Challenge | 1 | Offline-first on-device AI tutor | Elementary students without reliable internet | On-device Gemma lessons + Bayesian knowledge tracing | TUTOR-EDU |
| 31 | Sage | https://devpost.com/software/sage-yvlpqb | Cloudinary Company Challenge | 1 | Teachers generate curriculum; students get grounded tutoring and simulations | Teachers + students | Staged LLM curriculum pipeline; grounded tutor; WebLLM; voice; Tavily research | TUTOR-EDU |
| 32 | StudyO | https://devpost.com/software/studyo-mju34e | Cloudinary Company Challenge | 1 | Turns tabs, PDFs and lectures into flashcards, quizzes, maps and explainer videos | Students | Gemma content generation; Vapi voice tutor | TUTOR-EDU |
| 33 | J.I.T. | https://devpost.com/software/j-i-t | MLH Best Use of MongoDB Atlas | 1 | Scan a textbook barcode to talk to an AR avatar about the book | Students | RAG over book content (Atlas Vector Search) + voice (phone AR) | TUTOR-EDU |
| 34 | Overseer.exe | https://devpost.com/software/entelecheia | ROBLOX Civility Challenge | 1 | Roblox game where you catch grooming/scam patterns in NPC chats | Kids on Roblox | LLM generates live NPC roleplay containing unsafe requests | TUTOR-EDU |
| 35 | Residue | https://devpost.com/software/residue | Fetch.ai Agentverse | 1 | Acoustic focus profiles, generated soundscapes and study-buddy matching | College students | Multi-agent (perception, correlation, intervention, matching); on-device Qwen | TUTOR-EDU |
| 36 | Sera | https://devpost.com/software/sera-lvthzo | Figma Make Challenge | 1 | Music discovery by predicted brain response | Listeners, music creators | TRIBE v2 neural model fingerprints + Agentverse agent | SEARCH-MATCH |
| 37 | Obi | https://devpost.com/software/obi-mise-en-place-for-your-data | Figma Make Challenge | 1 | Local-first "second brain" with hybrid search over your files | Knowledge workers | Local Gemma chat + embedding RAG | SEARCH-MATCH |
| 38 | Impulse (hiring) | https://devpost.com/software/impulse-khf8l4 | World U Challenge | 1 | Hiring platform with verified humans, trust ratings and matching | Applicants, recruiters | Gemini agents build trust ratings and matches | SEARCH-MATCH |
| 39 | Banter Mart | https://devpost.com/software/banter-mart | World U Challenge | 1 | Swipe marketplace where AI agents haggle for buyer and seller | Marketplace buyers/sellers | Gemini negotiation agents (strict JSON); human approval + USDC | COMMERCE-AI |
| 40 | autoGear | https://devpost.com/software/autogear | Figma Make Challenge | 1 | Recommends your next desk/ergonomic upgrade with live prices | Students, remote workers | COCO-SSD webcam scan of your gear; Gemma explains deterministic scores | COMMERCE-AI |
| 41 | Scrubs | https://devpost.com/software/scrubs | Zetic Company Challenge | 1 | On-device redaction of PHI (names, MRNs, faces) from clinical photos | Healthcare workers | On-device face detection + PHI classifier + OCR | SAFETY-PRIVACY |
| 42 | TimeHole | https://devpost.com/software/timehole | Arista Connect the Dots | 1 | Network proxy blocks distracting content and lets task-relevant content through | Focus-seekers, households | Gemma classifies traffic against the user's goals | SAFETY-PRIVACY |
| 43 | SPECTRA | https://devpost.com/software/spectra-qbj2gf | Flicker to Flow (Productivity track); Zetic Company Challenge | 2 | Upsamples iPhone LiDAR to dense metric depth on-device in real time | Robotics / AR devs | Custom 2 MB CoreML CNN (phone only) | SPATIAL-VISION |
| 44 | Sentinel.ai | https://devpost.com/software/sentinel-ai-ls7eq5 | MLH Best Use of Solana | 1 | Watches camera feeds and sends timestamped event alerts with summaries | Security operators | YOLOv8 + ResNet + face embeddings; Gemma summaries | SPATIAL-VISION |
| 45 | Cropt | https://devpost.com/software/croppers | Zetic Company Challenge | 1 | Offline crop disease detection from photos with voice advice | Smallholder farmers | On-device Gemma (NPU) diagnosis + advisory agent + multilingual TTS | SPATIAL-VISION |
| 46 | GoTrail | https://devpost.com/software/gotrail | Figma Make Challenge | 1 | Offline plant-ID "Pokédex" hiking app | Hiking-prescription patients, beginners | On-device plant classifier (no LLM) | SPATIAL-VISION |
| 47 | Snitch (LA) | https://devpost.com/software/snitch-ackp1s | Figma Make Challenge | 1 | Money-on-the-line focus sessions; webcam detects distraction | Procrastinating students | MediaPipe gaze/phone/pose detection | SPATIAL-VISION |
| 48 | Waste2Wealth | https://devpost.com/software/waste2wealth-0o4tah | Cloudinary Company Challenge | 1 | Report litter, clean it, verify it, get paid in SOL | Communities | Cloudinary AI Vision verifies before/after photos | SPATIAL-VISION |
| 49 | NeighborFridge | https://devpost.com/software/neighborfridge | Best UI/UX; Figma Make Challenge | 2 | Scan receipts, predict expiry, share surplus food locally | Students, neighbourhoods | Tesseract OCR + local Gemma receipt parsing (not agentic) | APPLIED-ML |

**Excluded (16):** hardware: RIIS (2nd Overall + ASI:One), Bridge, Edith (Ray-Ban), Drip, AgriMind, Aegis Edge, A-Eye (camera glasses), Nimbus (also no AI). Joke: YES? or YES!. No or minor runtime AI: Pixel Truth, Inbox Invaders, Hack-A-Ton, Mindful Egg, Grouper, Cloudcam, Roman Road.

The prize lists for gallery-only projects come from single page fetches. Every sponsor's winner slots add up, so no multi-prize project should be missing.

---

## Archetype counts (all 3 events)

| Archetype | Projects | HTN / MIT / LAH | Total prizes | Multi-prize winners | Multi-prize projects |
|---|---|---|---|---|---|
| RESEARCH-AGENT | 13 | 3 / 6 / 4 | 14 | 1 | Elute (2) |
| COMPANION-VOICE | 11 | 1 / 4 / 6 | 14 | 3 | Dots (2), Accent (2), Northstar (2) |
| ACTION-AGENT | 12 | 5 / 1 / 6 | 13 | 1 | Whim (2) |
| AGENT-DEVTOOLS | 9 | 1 / 2 / 6 | 12 | 3 | codebreaker (2), Autopsy (2), MultiEval (2) |
| TUTOR-EDU | 10 | 0 / 4 / 6 | 10 | 0 | - |
| EXPERT-COPILOT | 9 | 4 / 2 / 3 | 10 | 1 | Pixie (2) |
| COMMERCE-AI | 9 | 3 / 4 / 2 | 10 | 1 | Rumi (2) |
| SAFETY-PRIVACY | 9 | 7 / 0 / 2 | 9 | 0 | - |
| BUILDER | 8 | 6 / 0 / 2 | 9 | 1 | Tinker (2) |
| SPATIAL-VISION | 8 | 2 / 0 / 6 | 9 | 1 | SPECTRA (2) |
| BACKOFFICE-AGENT | 7 | 1 / 6 / 0 | 8 | 1 | Money Maxer (2) |
| SIMULATION | 5 | 4 / 0 / 1 | 6 | 1 | Settlers of Solana (2) |
| APPLIED-ML | 4 | 1 / 2 / 1 | 5 | 1 | NeighborFridge (2) |
| SEARCH-MATCH | 4 | 0 / 1 / 3 | 4 | 0 | - |
| CREATIVE-MEDIA | 3 | 2 / 0 / 1 | 4 | 1 | Composition (2) |
| **Total** | **121** | 40 / 32 / 49 | **137** | **16** | |

The table is sorted by total prizes. The 4 new tags are defined at the top.

### Kept projects that reached the top tier (overall top 3 or HTN Finalist)
| Event | Project | Tier | Archetype |
|---|---|---|---|
| LA Hacks | codebreaker | 1st Overall (+ Cognition) | AGENT-DEVTOOLS |
| LA Hacks | Autopsy | 3rd Overall (+ Cognition) | AGENT-DEVTOOLS |
| HTN | Bricked | Finalist | BUILDER |
| HTN | CADEX | Finalist | BUILDER |
| HTN | Settlers of Solana | Finalist (+ Solana) | SIMULATION |
| HTN | Composition | Finalist (+ Gemini) | CREATIVE-MEDIA |
| HackMIT | none (the podium was all hardware) | Best software AI: Elute (Regeneron Grand Prize + OpenAI 2nd), VistaAI (Maximor 1st, $4k), PIXX-AR (Visa, $5k) | - |

Next tier of organizer awards at LA Hacks: beehyv (Organizers' Choice, RESEARCH-AGENT) and Polaris (Best Social Impact, EXPERT-COPILOT).
