# Uncle

Uncle is a Hack Western project that lets you meet yourself at 70 in mixed reality, with your own scanned face and aged voice. A seeded life simulation computes the money and health projections; Gemini turns those results into a conversation using checked placeholders.

## Try Uncle

- [Open the live app](https://uncle.health)
- [Browse the saved-face library](https://uncle.health/heads.html)
- [Open the laptop Quest viewer](https://uncle.health/cast.html)
- [Browse the source](https://github.com/e-yang6/uncle)

The main app guides you through choosing a face, recording an interview, confirming your answers and opening your prepared session in the Quest. A new head needs the team's head-building worker to be online; saved faces can be used immediately.

## Meet your future self

The experience combines your face, voice and interview answers with a simulation of possible futures.

- Record or upload a head-turn video, reuse your saved scan, or choose a face from the searchable library.
- Give a spoken interview about your finances and habits, then correct the extracted answers before continuing.
- Enter the four-letter pairing code in the Quest browser to open the prepared session.
- Talk to an aged version of yourself, with animated speech, captions, an outfit and a background driven by the simulation.
- Ask about savings growth, a financial goal, saving more, retirement or changes to your habits.
- Explore green charts and before-and-after projections. Quest controllers are the primary input for sliders and grabbing charts; hand tracking is optional.

Choosing someone else's saved face changes the avatar only. Your confirmed profile and voice stay your own. Outfit and backdrop tiers are visual choices driven by simulated savings; posture follows the healthy-years tier.

## Questions and calculations

For a question such as “What if I save twice as much?” or “How much would I need to save to reach my goal?”, Gemini selects a calculation. The seeded simulation runs it, the matching chart is sent, and Gemini writes an answer using placeholders for the computed values. A number-free thinking line can play while the calculation and reply are prepared.

The same inputs and seed produce the same simulated outcomes, so a slider comparison shows the effect of the change rather than a different random draw. The model's drafts are checked before their placeholders are filled; failed drafts are retried or replaced with a calculation-based or template response.

Gemini is the default reply writer. The fine-tuned model and evaluation work remain in the repository; `MODEL_FIRST=1` explicitly enables that path.

## Present it

1. Prepare a saved face before the demo, or keep the Mac head worker running for a live build.
2. Open the main app on the laptop, complete the interview and confirm the answers.
3. Open `uncle.health` in Quest Browser, choose **I have a pairing code**, enter the Ready-screen code and start the headset session.
4. Ask a savings or habit question, then change a slider to compare the new projection with the session's starting point.

For the actual headset video, connect the Quest to the laptop over USB and run [scrcpy](https://github.com/Genymobile/scrcpy) with USB debugging authorized. From Ready, open **Show Quest video** and select the mirror window in the browser's window picker. The website displays that local video and can play Uncle's existing voice stream without starting another microphone or conversation. The USB capture used in the demo is video-only; Quest system sounds are not included. Browser sharing requires a user click and window selection.

See the [submission notes](DEVPOST.md), [build and verification log](BUILD.md) and [remaining device checks](xr/TO-TEST.md).

## Run it

The app requires **Node.js 22.13 or newer**. From the repository root:

```bash
npm ci
cp .env.example .env
npm start
```

Fill the private `.env` with your provider configuration before using live services. Never commit it. The server starts without provider keys and reports which features are unavailable at `/health`.

| Component | Default port | Entry points |
| --- | ---: | --- |
| App server | 3000 | `/`, `/heads.html`, `/xr/`, `/cast.html`, `/health` |
| Head worker | No inbound port | Outbound requests to the app server; runs on the prepared Mac |

`GEMINI_API_KEY` enables interview extraction and question tools. `ELEVENLABS_API_KEY` enables voice cloning and speech. `HEAD_WORKER_TOKEN` connects the server and the prepared head worker; `HEAD_LIBRARY_TOKEN` protects staff GLB uploads. Main onboarding obtains a limited scan session automatically, so users do not enter the staff key.

A fresh clone does not include people's heads or recordings, the head-building Python environment, downloaded models, voice records or provider credentials. Follow the [head setup guide](head/README.md) for the Mac/Python 3.11 pipeline and the [server guide](server/README.md) for worker configuration and storage. The Node app does not install or run the reconstruction tools on the app server.

Run the automated checks with `npm test`. For a serial run that avoids contention in the simulation timing check:

```bash
node --test --test-concurrency=1 "server/**/*.test.js" "sim/**/*.test.js" "xr/**/*.test.js" "voice/**/*.test.js"
```

Head reconstruction has a separate Python test suite documented in [head/README.md](head/README.md). Deployment instructions are in [DEPLOY.md](DEPLOY.md). Quest microphone, passthrough, controller and physical audio/video checks still require the device.

## Calculation and data boundaries

Code computes projections and scenario results. Gemini selects tools and explains their outputs. Placeholder checks reject unsupported numbers, but do not prove that every interpretation or explanation is correct.

- Health and financial results are simplified population-based scenarios, not individual guarantees or professional advice.
- Charts with **Middle 50%** labels show the actual 25th–75th percentiles of simulated outcomes. Spoken low/high facts retain their 10th–90th percentile meaning. The display choice does not delete outcomes from the model.
- Savings above registered-account room count in an ordinary account; tax on that account's growth is not modelled. Account-room answers describe this year's new room, not a verified history of unused contributions.
- Saved faces and their catalog entries are publicly readable through the app. Scan only with the person's permission.
- Uploaded build videos live in a private queue and are removed after a completed or failed job. Saved GLBs and their SQLite catalog remain on one server; backups must include the whole builds directory.
- The browser's selected Quest window stays local to the laptop video viewer. The voice subscription receives Uncle's existing replies, not a recording of every headset sound.

## Repository map

| Path | Purpose |
| --- | --- |
| [server/](server/README.md) | HTTP app, onboarding, head library and job queue, question tools, voice sockets and laptop viewer |
| [sim/](sim/README.md) | Seeded life simulation, source data, scenarios and goal calculations |
| [voice/](voice/README.md) | Interview extraction, speech recognition, voice cloning, aging filter, fillers and reply checks |
| [head/](head/README.md) | Video reconstruction, face landmarks, template fitting, textures and mouth shapes |
| [xr/](xr/README.md) | WebXR scene, aged head, clothing and backdrops, charts, captions and controls |
| [words/](words/README.md) | Language-model training and evaluation work |
| [CONTRACTS.md](CONTRACTS.md) | Data formats shared by the simulation, server, head builder and headset |
| [BUILD.md](BUILD.md) | Measurements, verification results and deployment history |
| [DEVPOST.md](DEVPOST.md) | Sponsor-track submission notes and outstanding measurements |

Garment and panorama sources, authors, licences and modifications are listed in [asset credits](xr/assets/CREDITS.md). Team ownership and coordination rules are in [AGENTS.md](AGENTS.md).
