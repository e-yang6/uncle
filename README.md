# Uncle

Uncle puts you across the table from yourself at 70, in mixed reality, with your own face and aged voice. Ask about your money, health and the choices you make today, and hear an answer grounded in a simulation of possible futures. Built at Hack Western.

Most of us treat our future selves like strangers. We wanted to make that person someone you could sit down with and talk to, so long-term decisions feel personal rather than abstract.

## Try Uncle

- **[Open the live app](https://uncle.health)**
- [Watch the demo](https://www.youtube.com/watch?v=54cPOywvbCI)
- [Browse the source](https://github.com/e-yang6/uncle)

Start on a phone or laptop. You can browse the app and saved-face library there; the full mixed-reality conversation runs in a Meta Quest headset.

## The experience

1. **Add your face.** Choose a saved face, record a slow head-turn video or upload one. A new head builds in the background while you continue.
2. **Tell us about yourself.** Answer ten short questions about your finances and habits. Sensitive questions include “prefer not to say”, which uses a typical simulation value.
3. **Record your voice.** About 30 seconds provides the sample for voice cloning. Review the confirmation screen and correct any answers before continuing.
4. **Meet your future self.** Open the headset link or enter the four-letter pairing code in Quest Browser. Your aged face greets you by name, speaking in an older version of your voice, with your real room visible through passthrough.
5. **Explore another future.** Ask what saving more, changing a habit or working toward a goal would do. The simulation computes a fresh answer, and a chart floats beside your future self. Grab and reposition the panels while you talk.

Your future self's clothing and photographic backdrop reflect projected savings. Habits shape its apparent age at the start of the session. The saved-face library keeps completed heads available for later sessions, with a searchable catalog stored in SQLite.

## How it works

**The head.** A head-turn video becomes a textured 3D model. COLMAP recovers camera positions, MediaPipe finds face landmarks, a head template is fitted to the resulting geometry, and the video frames supply the skin texture. In the headset, a shader adds grey hair, older skin and a softer jaw. The mouth moves with the reply audio.

**The voice.** ElevenLabs clones the person's recorded voice, transcribes speech from the headset microphone and generates the spoken replies. Our own filter ages the output through changes to pitch, pace, wobble and tone. Replies can begin playing sentence by sentence while the rest is being prepared.

**The numbers.** Our Monte Carlo engine simulates 5,000 possible lives using historical investment returns, Statistics Canada mortality data, published habit risks and Canadian CPP, OAS, TFSA and RRSP rules. Seeded runs give the same outcomes for the same inputs, so a what-if comparison shows the effect of the change rather than a different random draw. Results are expressed as ranges rather than one promised future.

**The words.** We fine-tuned Qwen2.5-3B with LoRA on Vultr GPUs to write the future self's replies in character. It writes placeholders such as `{savings_70.median}`; our code checks them and fills in the simulation values before speech. Raw-number drafts are rejected and rewritten, with template responses as a fallback.

Gemini extracts interview answers, selects calculations for money questions through function calling, and writes the resulting answers using computed placeholders. It also takes over when the fine-tuned model is slow or unavailable. Vultr Cloud Compute hosts the Node app behind Caddy for HTTPS, while Vultr Cloud GPUs train and serve the language model through vLLM. The headset uses three.js and WebXR, with audio and charts delivered over a WebSocket.

## What we measured

- About **47 ms** to simulate 5,000 lives.
- **97.1 seconds** for the first full video-to-head build on a Mac.
- **200 test conversations** with no invented numbers after fill-and-check.
- The right calculation selected on **27 of 27** money-question tests.
- **12 hand-calculated profiles** checked within 5%.

These are individual build measurements, not guarantees across devices or workloads. Voice latency remains above our target, and the complete Quest experience has been tested in parts.

## Run locally

Use **Node.js 22.13 or newer**:

```bash
npm ci
cp .env.example .env
npm start
```

Open `http://localhost:3000`. Keep provider credentials in the private `.env`. Gemini and ElevenLabs enable the live interview and voice features; the fine-tuned model uses its configured model endpoint. The server starts without provider keys and reports unavailable services at `/health`.

Head reconstruction runs on a separately prepared Mac worker. A fresh clone does not include people's scans, voice records, downloaded head models or provider credentials. JavaScript checks run with `npm test`; head reconstruction has separate Python tests under `head/tests/`.

## Source

- [server/](server/) — website, onboarding, face library, build queue, question tools and voice sockets.
- [sim/](sim/) — life simulation, financial goals, scenarios and source data.
- [voice/](voice/) — speech recognition, voice cloning, aging, language-model integration and fine-tuning.
- [head/](head/) — video reconstruction, face landmarks, textures and mouth shapes.
- [xr/](xr/) — headset scene, avatar, captions, outfits, backdrops and charts.
- [words/](words/) — language-model training and grounding evaluations.

## Limits

Uncle is a hackathon prototype, not financial or medical advice. Health results describe populations, with four habits modelled: smoking, exercise, sleep and alcohol. Diet, genetics and mental health are not included. Healthy years are estimated from life expectancy and habits rather than a separate disability model.

Taxes are approximate, and housing, children and job changes are not modelled. What-if questions explore scenarios rather than promising an outcome. The face's apparent age is set at the start of the session; it does not change live with a spoken what-if question.

New heads depend on the Mac worker being online. Saved scans are accessible to anyone with the app link, so recording requires the person's permission. Garment and panorama credits are in `xr/assets/CREDITS.md`.
