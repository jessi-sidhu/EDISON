# Demo

The pitch and the 3-minute demo. When it settles, the steps move into `docs/PRD.md` under "Demo story", which is the path that must never break.

## The pitch

Circuits are learned on paper and tested in a lab you get a few hours a week. Edison is a lab bench you can use anywhere: the textbook, the pre-lab and the lab itself run on one live breadboard. And when your real board doesn't work, you take a photo and Edison finds the mistake.

Lines to use:
- "Every circuits student spends lab time hunting one backwards wire."
- "You can't take the bench supply, the function generator and the scope home. Now you can."
- "The mistakes the class makes become teaching data for the TA."

## The story: Maya's ENSC 220 week

Maya is a second-year SFU engineering student in ENSC 220. Her labs need equipment that only exists in the lab, and her lab time is short. The demo follows her through one week.

| # | Time | On screen | What we say | Status |
|---|------|-----------|-------------|--------|
| 1 | 0:00–0:20 | **Landing.** Type "Build me a light bulb". The schematic draws itself, flies into the SCHEMATIC VIEW inset, the glass breadboard sketches the circuit in, it becomes the real simulator, and the LED lights. | Silence until the LED lights. Then: "That's what every circuits student does for three hours a week, in a room they can only use three hours a week." | On `edison`. The labels (#168) and the storyboard build-up (#171) are built and in review. |
| 2 | 0:20–0:45 | **Textbook.** Course hub, Textbook, a chapter with a live figure. Change the resistor and the current changes in the figure. "Open in the editor" puts the same circuit on the bench. | "The textbook stops being pictures. Every figure is a circuit you can run." | On `edison` (E7). |
| 3 | 0:45–1:30 | **Pre-lab at home.** Lab 2, the TL072 inverting amp, with the lab sheet beside the board. Maya wires the bench supply (series, ±12 V), the function generator and the scope. The scope trace is flat. She holds a key and asks out loud: "Edison, why is my output flat?" Edison answers by voice: pin 4 (V−) isn't connected to the negative supply. She fixes it, the scope shows the inverted sine at gain −10, and the lab-sheet checks turn green. | "She doesn't own a bench supply, a generator or a scope. She doesn't need to." Then let the voice carry it. | Lab 2 and the lab sheet are on `edison` (E6). **Voice is not built.** **The answer about the missing V− is not checked yet.** |
| 4 | 1:30–2:20 | **In the real lab.** Her real board doesn't work. She takes a photo. Edison reads it into the simulator (confirm screen), the simulator finds the backwards LED, and the 3D board shows the fix. She flips the LED on the real board, and **a real LED on the table lights up.** | "This is the part no simulator does. It reads her real board." | Photo to circuit is on `dev` (#134–#177). The recorded sample replays instantly (#157). The backwards-LED answer is #169. **A recorded sample of our demo board is not made yet (#144).** |
| 5 | 2:20–2:45 | **The teacher's side.** The TA view: where the class got stuck on the board ("12 of 40 missed the negative supply", which is sample data). The pre-lab grades sync to Canvas. | "Her mistake isn't wasted. The TA sees where the whole class gets stuck and teaches that." | On `edison`, with sample data and a demo Canvas sync (E8, E9). |
| 6 | 2:45–3:00 | **Close.** Back to the landing, or a still of the real LED lit. | One impact line, then one line of future work (below). | Script only. |

### Extra moments (pick one at most)

- **Fail safely.** In the pre-lab, take out the resistor: the LED overloads, scorches and puffs smoke. "In the real lab that's a burnt part and ten minutes. Here it's a lesson." It's built (`tools/smoke.js`, #99), and it fits into beat 3 in about 10 s.
- **Ask about a figure.** In the textbook: "Why is this LED dimmer?" Edison answers with numbers from the live simulation.
- **One hard number.** The photo reading got 19 of 19 legs right on a real board photo with live Gemini (#160). Say it in beat 4.

## Future work (one line in the close, the rest for questions)

- **Live camera overlay:** point your phone at the board and see the fix drawn on it. It's the photo feature, made continuous.
- **Hardware in the loop:** a $15 ESP32 probe streams real voltages, and Edison shows where the real board departs from the simulation. A digital twin of your bench.
- **Labs written in one sentence:** an instructor types "RC low-pass, check the −3 dB point", and gets the lab sheet and its auto-graded checks. Then a real Canvas integration (LTI).
- **More courses and more students:** digital logic and microcontrollers next. A full lab for students without lab seats: remote, part-time, high schools.

## What's missing

| Gap | Why it matters | Size |
|-----|----------------|------|
| **One demo build.** Edison work is on `edison` and the photo work is on `dev`. | Beats 1, 2, 3 and 5 are on `edison`; beat 4 is on `dev`. The demo needs both in one place: the edison→dev PR, then `/promote` to `main`. | Small, but Aarmen decides when. |
| **Voice** (ElevenLabs). | Beat 3's best moment. Push-to-talk, speech to text, the existing Edison answer, then the reply spoken. The research is done (Scribe and Flash TTS through the server, Web Speech as fallback). | About half a day. |
| **Edison's answer to "why is my output flat?"** | It has to name the missing V− every time. Add it as an `npm run ai-eval` case and run it until it's 3/3. | Small. |
| **A recorded photo of our demo board** (#144). | Beat 4 must replay instantly on stage. A live read takes about 39 s, so live is the backup only. | Needs Thandi's board and photos. |
| **Landing labels and build-up** (#168, #171). | Beat 1. | Built; review, stack and push left. |
| **Props.** | A real breadboard with a deliberately backwards LED, a spare LED and a battery. A phone to take the photo, or a pre-taken photo ready to drop in. | Thandi. |
| **Rehearsal.** | The full path 5 times in a row without error, on the build we demo from. | Before the demo. |

## On the day

- Open tabs in order: the landing, the course hub (Textbook), Lab 2, the photo flow, the TA view.
- Reset between runs: clear the landing (a reload), reload Lab 2, and put the backwards LED back on the real board.
- If the network is bad: the landing keeps the schematic and the button when the 3D library can't load, the photo uses the recorded sample, and the voice falls back to the browser's own speech.
- Have a screen recording of the whole run as the last resort.
