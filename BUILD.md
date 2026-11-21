# Uncle

## Timing (Person 1 fills these in at kickoff)
- Kickoff (hour 0): [Friday, time]
- Stop adding features (hour 26): [day, time]
- Devpost deadline: [day, time]
- Judging / demo fair: [day, time]

Agents: run `date` and compare with these times to know which phase below we're in.

## The idea
Put on a headset and sit across from yourself at 70: your own head, aged, talking in your own aged voice. Everything it says comes from our Monte Carlo simulation, spoken by a model we fine-tuned so it can't invent numbers. Drag a slider and your future self changes.

## The demo has to show
1. Your own aged head, across the table in AR, says your name in your own aged voice.
2. Every number it says traces back to the simulation, and the simulation matches the government's retirement calculator.
3. Dragging a slider in the headset changes your future self's face, health and money.
4. The fine-tuned model never invents a number (measured on 200 test conversations).

## Steps
Hours 0 to 4: thin version. Done when: a saved head talks in the headset, end to end, on the live link.
- [x] Fake facts sheet + placeholder format (owner: @e-yang6)
- [ ] Voice loop in the headset: clone + aging filter, one line (owner: @jeffreywongg)
- [ ] Saved head in AR, mouth moving from audio (owner: @personalisaacw)
- [ ] Thin version deployed and opened in the Quest over HTTPS (owner: @e-yang6)

Hours 4 to 12
- [x] Monte Carlo engine, checked against the government calculator (owner: @e-yang6)
- [ ] Interview + Gemini field extraction + confirm screen (owner: @jeffreywongg)
- [ ] Live head build from a 24-second video (owner: @personalisaacw)
- [ ] Devpost project made and saved, first night (owner: @e-yang6)

Hours 12 to 20 (sleep in shifts)
- [ ] Generate training data, fine-tune on Vultr overnight (owner: @e-yang6)
- [ ] Streaming voice under 1.5 seconds (owner: @jeffreywongg)
- [ ] Visual aging: skin, grey hair, shape (owner: @personalisaacw)

Hours 20 to 26
- [ ] Official data from Canada.ca at startup, saved with dates (owner: @e-yang6)
- [ ] Fallbacks: sample voice, saved heads, hotspot (owner: @jeffreywongg)
- [ ] Sliders in the headset with hand tracking (owner: @personalisaacw)

Very last, only if everything above works (cut it first):
- [ ] Commitment vault on Solana devnet, Part 6 of the plan; if built, add a Solana Part to DEVPOST.md (owner: whoever finishes first)

Hour 26: stop adding features. Then the feature test, prize pages, one demo video recorded by hand, demo practice.

## Sponsor notes
### The Canada Life Future Me Challenge (owner: @e-yang6)
- Gen Z, uncertainty into confidence, meaningful action. Pitch agency and flexibility, not fear.
### Best Health Hack by Sun Life (owner: @e-yang6)
- Show who it helps and the impact.
### MLH: Vultr, Gemini, Entire, GoDaddy Registry, Solana if the vault is built (owners: Vultr and Gemini @jeffreywongg; Entire, GoDaddy Registry and Solana @personalisaacw)
- 

## Humans only
- [ ] Each person: Claude plan, `gh auth login`
- [ ] Vultr account + MLH credits; request GPU access
- [ ] App server with Caddy + deploy script
- [ ] Gemini API key
- [ ] ElevenLabs Starter account
- [ ] Entire account, connected to the repo
- [ ] Domain from GoDaddy Registry
- [ ] Quest charged; WebXR works in its browser

## Log
- [time] [who]: [what happened]
- Fri 22:15 Jeffrey's Claude: server skeleton done: npm start serves a placeholder page and /health (lists features that are off without keys); 3 tests pass; started with no .env.
- Fri 22:50 Ethan's Claude: first deploy done. Repo cloned on server, systemd uncle service created, Caddy reverse_proxy to 127.0.0.1:3000. /health returns JSON on https://144-202-9-158.sslip.io/health. deploy.sh works for future deploys.
- Fri 23:30 Ethan's Claude: fake facts sheet + placeholder fill-and-check done. sim/fake-facts.json has sample numbers matching CONTRACTS.md schema. sim/facts.js exports getFacts() and fillPlaceholders(). 9 tests pass: fills valid placeholders with human-readable values, rejects unknowns, catches raw numbers in templates.
- Sat 00:15 Ethan's Claude: Monte Carlo engine done. sim/engine.js simulates 5,000 lives with StatsCan life tables, CPP/OAS, TFSA/RRSP limits, historical returns, and habit risk multipliers. 5,000 lives in 47ms. Smoking reduces LE, more saving increases savings. Ranks best single change. 17 tests pass. Still needs: validation against government calculator on specific profiles.
- Sat 00:45 Ethan's Claude: fixed three sim bugs Jeffrey flagged (nested-null merge, savings at age 70, retirement income variation). Set up SSH deploy key on server. Deployed all code (voice, XR, sim fixes). /health, /xr/ live on https://144-202-9-158.sslip.io. Added profile endpoint to CONTRACTS.md.
- Fri 22:25 Jeffrey's Claude: voice test done: one line goes ElevenLabs -> our aging filter (pitch, pace, wobble, tone; breathiness removed, it sounded like a snare) -> WAV at /api/voice/test. Measured on this laptop: ElevenLabs first byte 434 ms, whole ~4.5 s line 671 ms, filter 55-69 ms. 13 tests pass. Aging amounts are provisional, not yet checked against research.
- Sat 00:10 Jeffrey's Claude: voice + interview built locally (not pushed): /voice WebSocket with start/age/status per CONTRACTS.md; voice clone from a recording (ElevenLabs); interview reading with Gemini (gemini-3.5-flash-lite, 1.2 s text / 1.6 s audio in one check, same answers as 3.5-flash at 6.3 s); confirm screen; 42 tests pass. Aging set by ear at 0.3 of the 'deep' table, amounts not yet checked against research. Accuracy on 20 real practice interviews NOT measured yet (only 2 synthetic checks).
- Sat 01:45 Isaac's Claude: headset page in xr/: stand-in head in a mirror frame, mouth driven by reply audio in the CONTRACTS.md voice format (sample greeting until /voice is live), blinking, passthrough AR with Start, captions in the headset via DOM overlay. 7 xr tests pass; checked in Playwright at 1440x900 and 390x844: jaw moves 0.1 to 0.82 while speaking, closes after, console clean. Not yet on the live link (server needs to serve /xr) or tested in the Quest.
- Sat 01:20 Jeffrey's Claude: microphone loop built locally: mic audio -> ElevenLabs realtime speech-to-text (ends speech itself) -> reply -> voice -> aging -> audio, over the /voice socket, with an echo guard (mic ignored while Uncle talks). MEASURED, 3 runs, stock voice reading clean audio, canned reply (NO language model in the loop yet): end of speech to first audio 758, 777, 1043 ms; end of speech to finished text 373-681 ms. 66 tests pass. Not yet measured: the fine-tuned model's time to first sentence, a real headset mic, a noisy room.
- Sat 02:30 Jeffrey's Claude: free-form chat built: Gemini writes the future self's words as placeholders (voice/chat.js), our checker rejects digits, number words and unknown placeholders, Ethan's fillPlaceholders fills real numbers; one rewrite, then the old keyword answers. Remembers the last 6 exchanges per session. MEASURED on real Gemini, 6 questions: 642-941 ms to write the reply, all 6 accepted, no invented numbers; the question asking for kids and a retirement year was answered without any. NOT measured: end-to-end delay with Gemini in the loop, 200-conversation grounding test. 80 tests pass.
