# Uncle

Uncle lets you meet yourself at 70 in mixed reality, with your own face and aged voice. You can ask about money, health and the choices you make today, then see how changing those choices affects the projection. Built at Hack Western.

## Try Uncle

**[Open the live app](https://uncle.health)**

Start on a laptop or phone to choose a face and complete the interview. The Ready screen gives you a four-letter code: open the same website in Quest Browser, choose **I have a pairing code**, and enter it to load your prepared session.

You can browse onboarding and the saved-face library without a headset. The full mixed-reality experience runs in the Quest.

## The experience

1. **Bring your face.** Record or upload a head-turn video, reuse a saved scan, or choose a face from the searchable library. A new scan builds in the background while you continue.
2. **Tell us about yourself.** Give a short spoken interview about your finances and habits. Review the extracted answers and correct anything misheard before continuing.
3. **Meet your future self.** Your scanned head appears aged in the headset, speaks in an older version of your voice, and animates its mouth as it talks. Captions, clothing and a background complete the scene.
4. **Ask a real question.** Explore how your savings could grow, what you would need to reach a goal, or what changes if you save more, exercise more or quit smoking. The matching chart appears alongside the answer.
5. **Try a different path.** Adjust inputs with Quest controllers and compare the new projection with where you started. Charts can be grabbed and repositioned; hand tracking is optional.

Choosing another saved face changes the avatar while keeping your own voice and confirmed profile. Outfit and backdrop tiers follow simulated savings, while posture follows the healthy-years tier.

## How it works

The simulation runs many possible lives using Canadian financial inputs, investment returns, mortality data and habit adjustments. Runs are seeded: the same inputs produce the same outcomes, so a before-and-after comparison reflects the change you made rather than a new random draw.

Gemini extracts interview answers, selects calculations for questions and writes the conversation. Our code does the maths. Replies refer to computed values through placeholders, which are checked and filled before speech. If a draft fails the checks, it is retried or replaced with a calculation-based or template response. The fine-tuned model and evaluation code remain available; Gemini is the default for the live app.

The head pipeline recovers camera positions from the video, triangulates face landmarks, fits a head template, and builds textures and mouth shapes. WebXR displays the result with simulation-driven aging. Voice cloning, an aging filter and sentence-by-sentence playback make the conversation sound like an older version of the person.

## Showing it on a laptop

The website includes a viewer for the actual Quest video. Connect the headset over USB, authorize debugging and run the scrcpy mirror. From Ready, choose **Show Quest video**, then select the mirror window in the browser's sharing dialog.

The viewer can play Uncle's existing voice stream, including thinking lines, without starting another microphone or conversation. Video capture stays local to the laptop. The USB mirror is video-only; laptop speech comes from Uncle's voice stream, rather than capturing Quest system sounds.

## Run locally

Use **Node.js 22.13 or newer**:

```bash
npm ci
cp .env.example .env
npm start
```

Open `http://localhost:3000`. Configure `GEMINI_API_KEY` and `ELEVENLABS_API_KEY` in the private `.env` for live interview and voice features. The server starts without provider keys and reports unavailable services at `/health`.

Head reconstruction runs through a separately prepared Mac worker, connected with `HEAD_SERVER_URL` and `HEAD_WORKER_TOKEN`. Staff GLB uploads use `HEAD_LIBRARY_TOKEN`; onboarding users do not enter that key. A fresh clone does not include people's scans, recordings, provider credentials or downloaded head-building models.

Run the JavaScript tests with `npm test`. The reconstruction pipeline has separate Python tests under `head/tests/`. Setup details live alongside each component.

## Source

- [server/](server/) — website, onboarding, face library, scan queue, question tools and voice sockets.
- [sim/](sim/) — seeded simulation, financial scenarios, goal calculations and source data.
- [voice/](voice/) — interview extraction, speech recognition, cloning, aging and reply checks.
- [head/](head/) — video reconstruction, face landmarks, template fitting, textures and mouth shapes.
- [xr/](xr/) — headset scene, avatar, charts, captions and controller interaction.
- [words/](words/) — model training and evaluation.

## What the results mean

These are simplified simulated scenarios, not guarantees about an individual's future. Charts labelled **Middle 50%** show the simulation's actual 25th–75th percentiles; spoken low/high figures retain their 10th–90th percentile meaning. Narrowing the displayed band does not remove outcomes from the model.

Tax on growth in ordinary savings accounts is not modelled. Account-room answers describe this year's new room, rather than a verified contribution history. New scans depend on the Mac worker being online. Saved faces are publicly accessible through the app, so scan only with the person's permission.

Garment and panorama credits are recorded in `xr/assets/CREDITS.md`.
