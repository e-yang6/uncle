# Uncle: the full plan (every agent reads this)

This is the complete spec for Uncle. BUILD.md says what to do next; this file says what we're building and how. CONTRACTS.md defines how the parts talk. If anything here conflicts with CONTRACTS.md, CONTRACTS.md wins; tell Person 1 on the board.

## The idea

Uncle puts you in a headset and sits you across from yourself at 70: a 3D version of your own head, aged, talking in an aged version of your own voice. Everything it tells you about your money and health comes from a Monte Carlo simulation we built, fed by official Canadian data, and spoken by a model we fine-tuned so it can't invent numbers. Drag a slider in the headset, like "save $50 more a month" or "exercise twice a week," and your future self changes in front of you.

One-liner: "Meet the future you, who can't make things up."

Why it matters: people treat their future selves like strangers, so they under-save and under-invest in their health. In Hal Hershfield's research, people who saw an aged image of themselves put nearly twice as much into a retirement fund as people who saw their current face.

What's new compared with earlier "talk to your future self" projects (MIT Media Lab's Future You, Mirror8, TalkTuahFutureYou): a full 3D head of you built from a short video and aged visually in mixed reality; your own voice, aged by our own audio code; a simulation using real Canadian data; a fine-tuned model that can only point to the simulation's numbers; and sliders in the headset that reshape your future self, money and health.

## Prize tracks we're building for

| Track | What it needs from us |
|---|---|
| The Canada Life Future Me Challenge (main track) | Help Gen Z take meaningful action toward their financial future through motivation, visualization and nudges; turn uncertainty into confidence |
| Best Health Hack by Sun Life | A creative technical solution to a real health problem; show who it helps and the impact. Health is half our simulation, not a side note |
| Overall prizes, Organizers' Choice: Most Adventurous | Wow and technical depth |
| MLH: Vultr | Vultr GPUs run the fine-tune, serve it, and run face aging; a Vultr server hosts the app |
| MLH: Gemini API | Gemini turns the interview into the simulation's fields (structured output) and is the fallback voice |
| MLH: Entire | Our agents' workflow runs through Entire (Sessions, Graph, Brain, Trails) |
| MLH: GoDaddy Registry | Uncle's domain |
| MLH: Solana (only if Part 6 is built) | The commitment vault |

What Canada Life's research means for every word Uncle says: Gen Z responds to perseverance and agency, not fear, and to saving framed as flexibility and control rather than a fixed retirement number. Auto-enrolment and default contributions work best. So the future self is warm, talks about the options saving gave them, and the session ends with one concrete action.

## The experience (about 4 to 5 minutes per person)

1. **Head scan (30 seconds).** A teammate films a 24-second video while the person slowly turns all the way around, neutral face. The 3D head starts building in the background (Part 3). For judging, scan judges on their first visit and save the head; a saved teammate head is the fallback.
2. **Quick interview (about 1 minute).** In a quiet corner we ask friendly questions out loud: age, roughly what they earn and save, and habits (exercise, sleep, smoking, drinking). This is both the voice sample (Part 4) and the simulation's input, pulled out by Gemini (Part 1).
3. **"Did we get this right?" (5 seconds).** A screen shows what we heard, like "age 21, saving $100 a month, exercise twice a week," and the person fixes anything misheard.
4. **Headset on.** Through passthrough they see the real room; across the table, in a mirror frame, is them at 70: their own face, aged, grey hair. It greets them by name in an older version of their own voice. (This is the wow moment.)
5. **Talk to them.** "Did we ever buy a house?" "Was I okay with money?" "How's my health?" Every number in every answer comes from the simulation.
6. **Change your future yourself.** Sliders for saving, exercise, sleep and smoking float beside the mirror. The person pinches and drags them (Quest hand tracking; controllers as backup), and the future self's face, numbers and words change live. The headset view is cast to a laptop so others can watch.
7. **Leave with one concrete next step.** A one-page summary: the one change that mattered most for money and health, its numbers, a link, and how to start it today (for example, the exact steps to set up an automatic $50 monthly transfer into a TFSA at their bank). If Part 6 is built, this is where the vault deposit happens. This is the "meaningful action" for Canada Life.

## Architecture

Three pipelines run side by side. The parts we build are the brain; outside services only transcribe, clone the voice, and host.

- **Numbers (Person 1):** interview answers -> simulation engine -> facts sheet -> ranked changes.
- **Voice (Person 2):** you speak -> speech-to-text -> fine-tuned model writes placeholders -> fill and check -> ElevenLabs voice clone -> our aging filter -> your older voice.
- **Face (Person 3):** 24-second head video -> 3D head build -> aging (skin, hair, shape) -> mouth driven by the audio -> you at 70 in AR.

The facts sheet ties the numbers to what the voice may say. The simulation also sets each future's apparent age for the face.

## Part 1: the life simulation engine (Person 1: sim/)

A Monte Carlo simulation of about 5,000 possible lives from today to age 100, reporting ranges, not a single guess. It must rerun in under 100 ms so the sliders feel live.

**Inputs** (defaults when not mentioned): age and sex (20, sex-averaged); province (Ontario); income (median for age); savings in RRSP, TFSA, other ($0); saving per month ($0); investment mix (60% stocks, 40% bonds); retirement age (65); smoking, exercise, sleep, alcohol (population average). Field names are in CONTRACTS.md.

**Getting inputs from the interview:** the transcript goes to Gemini with structured output and one job: fill the input fields, leaving anything not mentioned on its default. Show the result on the confirm screen before running anything. Measure accuracy on 20 recorded practice interviews.

**One simulated life, year by year:**
1. Money: draw that year's stock and bond returns and inflation by resampling real historical years. Add salary growth and contributions, respecting TFSA and RRSP limits.
2. Retirement: at the retirement age, stop contributing, add CPP and OAS income using the government's published rules and this year's amounts, and withdraw enough to keep spending steady.
3. Health: each year's chance of dying comes from Statistics Canada's life table for that age and sex, multiplied by each habit's extra risk from published research. The life ends when the simulated person dies.
4. Record the path: balances, income, age at death, healthy years.

**Outputs:**
- Ranges (10th, 50th, 90th percentile) for savings at 70, yearly retirement income, the chance the money lasts to 90, life expectancy and healthy years.
- The one change that matters most: rerun with each input nudged and rank which single change moves outcomes most.
- The facts sheet (CONTRACTS.md): every number the future self may say.

**Data (all public, cite every source in the app's "where this comes from" panel):** Statistics Canada life tables; CPP and OAS rules and current amounts (Canada.ca); TFSA and RRSP limits (Canada Revenue Agency); inflation (Statistics Canada CPI); historical stock and bond returns (one public dataset, cited); one published meta-analysis per habit. Never type these values from memory; read them from the source.

**Current values at startup:** a small script reads this year's CPP, OAS and TFSA/RRSP limits from Canada.ca when the app starts, saved with the source link and the time read. Never fetch during a conversation. Keep the last good copy as a backup.

**Proof:**
- Fixed-return mode compared with the federal Canadian Retirement Income Calculator on 10 to 20 profiles: within 5% each.
- With average habits, life expectancy matches Statistics Canada's published figure.
- Unit tests for the CPP, OAS and contribution-limit rules.
- 5,000 lives in under 100 ms on the demo laptop.

Kept simple on purpose (say so on screen): approximate taxes; no housing, kids or job changes.

## Part 2: the future self's words (Person 1: words/)

A small fine-tuned model writes everything the future self says, but never a number. It writes placeholders into the facts sheet, and our code fills in real values, so an invented number is impossible, not just caught.

**How a reply is made:**
1. The model gets the facts sheet, the user's answers and the question, and replies as the user at 70.
2. It writes placeholders, like: "By 70 I had about {savings_70.median} put away, and honestly, {one_change.label} is what made the difference."
3. Our code checks every placeholder exists in the facts sheet, then fills in the value, rounded the way people speak ("about four hundred thousand").
4. Advice comes only from the simulation's ranking; the model never invents recommendations.
5. A raw number or unknown placeholder means one rewrite; if it fails again, use a template sentence built from the facts sheet. The voice pipeline only ever receives checked text, sentence by sentence.

The future self may invent feelings and colour that claim no fact ("I still go walking every morning"). Anything about money, health or age must be a placeholder.

**Tone:** warm, never scary, never "you will die at 74." Agency and options, not fear or guilt. Health as "people with your habits, on average, live to between X and Y."

**The fine-tune:**
- Base: a small open-weight model with a permissive license (Qwen or Llama, about 3 to 8 billion parameters), LoRA with Unsloth on a Vultr cloud GPU.
- Data: 1,000 to 3,000 generated examples: random profile -> simulation -> facts sheet -> question -> reply with placeholders. Drop any example with an unknown placeholder. Generate replies with an open-weight model whose license allows training on its outputs.
- Serving: vLLM on the Vultr GPU (or llama.cpp on the Mac), streaming sentence by sentence.
- Timing: generate data from about hour 6, train overnight.
- Fallback: Gemini with the same placeholder format. Swapping it in changes nothing else.

**Proof** (200 test conversations, base vs fine-tuned vs Gemini): replies with zero invented numbers (100% for ours); blind-rated "sounds like an older you" (ours at least as high as Gemini); time to first word (faster than Gemini); replies needing a rewrite (under 10%).

## Part 3: your future head in AR (Person 3: head/, xr/)

A full 3D head built for free on our own Mac from the 24-second video, aged in skin, hair and shape according to the simulation, shown talking from a mirror frame in the headset.

**Building the head** (from [Punching Face](https://github.com/akashngb/punching-face), Hack the North 2026; its repo has no license):
1. Keep up to about 200 frames; remove the background with MediaPipe selfie segmentation. Need at least 24 overlapping views, 12 showing the face.
2. Recover camera positions with COLMAP.
3. Find MediaPipe's 468 face landmarks in the frames and triangulate them to 3D.
4. Warp an open-source MakeHuman head template (skull, ears, neck) onto the 3D landmarks; fit a smooth hair shape to the head's outline. (Check MakeHuman's asset license.)
5. Project the frames onto the head, mainly one frontal frame for the face, blended into the side views.

Skip the paid AI hair step (require a full turn instead) and skip Gaussian splats (31 to 33 mm off the face in their tests). Their run took about 3 minutes per head on an M5 Pro Mac, so start building the moment filming ends, and save every head.

**Aging** (skin, hair and shape together; only one of them aged looks creepy):
- Skin: an open-source face-aging model (candidate: the published SAM age-transformation model; check its license) on every frame used for painting, run on the Vultr GPU. If side views age inconsistently, use the aged front for the face and fill the sides with matched aged skin tone.
- Hair: tint toward grey and lighten, by an amount set by age.
- Shape: add the difference between the MakeHuman template at the person's age and at 70 (softer jaw, slight sagging, thinner lips). Keep it modest.
- Apparent age: the real age nudged by the health path (a smoking future looks a few years older), small and from a cited source.

**Instant sliders:** prepare about 10 aged skin versions at different apparent ages in advance. When a slider moves, the simulation reruns, the apparent age shifts, and the headset blends between the two closest skin versions while shifting shape and hair on the GPU.

**Showing it:**
1. Remove the triangles that seal the lips (MediaPipe's known set) so the mouth can open.
2. Drive the mouth from the audio as it plays: loudness opens the jaw; high versus low frequencies separate wide sounds ("ee") from round ones ("oo"). Add blinking and small head movements.
3. A WebXR app (three.js) in the Meta Quest browser, with passthrough, anchors the mirror frame across the table. Sliders float beside it, used with hand tracking (controllers as backup). Needs HTTPS (DEPLOY.md).
4. Cast the headset view to a laptop for onlookers.

**Fallbacks:** a saved head if a build or aging fails; the same head and voice on the laptop if the headset fails.

**Proof:** head build under 2 minutes; still recognizably the same person after aging (face-match score on 20 heads); slider-to-head update under 100 ms; lip-sync offset under 80 ms; steady headset frame rate while talking.

## Part 4: the voice (Person 2: voice/, server/)

The interview is the voice sample: ElevenLabs Instant Voice Clone copies the current voice, then our own code ages it, in a streaming pipeline aiming for about 1.2 seconds from the end of the user's speech to the first word back.

**Recording the interview:** quietest spot available; a good mic close to the mouth, not the laptop's; about a minute of natural speech from open-ended questions. Pick one mic for the headset conversation (the Quest's own mic through the browser, or a laptop mic) and measure delay with that exact setup.

**Pipeline, sentence by sentence:** listen (stream speech-to-text, detect the end of speech) -> think (stream the model's reply) -> check (Part 2, per sentence) -> speak (ElevenLabs streaming text-to-speech with the cloned voice) -> age (our filter) -> play. The AR head reads this same audio to move its mouth.

**The aging filter (our code):** pitch (a small shift; women's voices tend to drop with age and men's can rise slightly), wobble (tiny pitch and loudness variation), breathiness (a little shaped noise), pace (slightly slower without changing pitch), tone (slightly less brightness). Amounts set by the future's age and health path. Check sizes against voice-aging research and cite it; too much sounds like a cartoon.

**Keep everything:** save heads and voice clones after each session, so a returning judge doesn't redo the scan or interview. Fallbacks if cloning fails: a ready-made older voice from ElevenLabs' library, then text.

**Proof:** median delay about 1.2 s, slowest 5% under 2.5 s; 9 of 10 listeners pick the aged clip as older; "still sounds like the same person" averages 4 or more out of 5.

## Part 5: the experiment (only if someone is free after hour 20)

A small rerun of Hershfield's study with other hackers. Laptop only, anonymous, no head scan or voice. A coin flip: half get the full experience, half see the same numbers on a plain screen. Then everyone splits an imaginary $1,000 between chequing, a gift, a night out and a retirement fund. Report each group's average share to retirement, the difference, and its uncertainty (resampling). Write the plan in BUILD.md before collecting data, and report the result whatever it is. Aim for 15 to 20 people. Limits: small student sample, imaginary money, an immediate choice.

## Part 6: the commitment vault (the very last step; cut first)

Only after everything else works. At the end, Uncle asks the person to start the one change now: lock their first few test dollars in a Solana vault their future self holds until a chosen date.

- A small Anchor (Rust) program on Solana devnet with a test token; no real money anywhere. Its own vault/ folder.
- Instructions: `create_vault` (owner, unlock date, optional goal), `deposit`, `withdraw` (refused before the unlock date unless the goal is reached).
- Each vault is owned by the program (a program-derived address from the owner's wallet), so nobody holds a key that can empty it.
- QR code via Solana Pay's transaction request standard; the person approves in a wallet app (Phantom or Solflare on devnet). Keep a demo wallet with test funds for judges.
- Self-check: total vault balances equal the tokens the program holds, or the transaction fails.
- The facts sheet gets the vault's balance and dates, so Uncle can mention it via placeholders.
- Demo moment: try to withdraw early and show Solana refuse it.
- Pitch: a savings lock, not crypto investing; a test-network prototype; a real version would use a locked TFSA or workplace plan.

## Risks and fallbacks

| Risk | Fallback |
|---|---|
| Voice delay too long | Stream per sentence; a short "thinking" sound; worst case, text with voice playback |
| Aged head looks creepy | More stylized look, gentler aging |
| Head build fails or is slow | Scan judges early and save heads; a saved teammate head |
| Interview misheard | The confirm screen |
| Fine-tune sounds flat | Gemini with the same placeholder format |
| Startup data fetch fails | Last good copy, with its date shown |
| Headset fails | Same head and voice on the laptop |
| Wi-Fi dies | Phone hotspot; a recorded run-through |
| Numbers look wrong to a finance judge | Show the calculator validation; ranges, not single numbers |
| Too much to build | Thin version first; cut Part 6, then Part 5, then the fine-tune (use Gemini) |

## Ethics and privacy (part of the product)

- Never state a death age. Use ranges labelled as population estimates.
- Ask judges if they'd like to take part before scanning or recording them.
- "Not financial or medical advice" on screen, plus the source panel for every number.
- Warm, never shaming. Anyone can use the sample person instead.

## Demo script (about 4 minutes)

| Time | What happens | What we say |
|---|---|---|
| 0:00 | Open on the problem | "Most of us treat our future selves like strangers. Research shows that seeing your future self changes how much you save. So we built a way to sit across from yours." |
| 0:20 | Quick interview | "Just talk to us for a minute. This is also how we learn your voice." |
| 1:20 | Confirm screen | "Fix anything we misheard." |
| 1:30 | Headset on; their aged self says their name | Nothing. Let it land. |
| 2:00 | They ask a question | "Everything it says about your life comes from our simulation, with official data." |
| 2:30 | They drag the savings slider | "One change, and here's a different you." |
| 3:00 | Headset off; architecture slide | "We built the head from a 24-second video, aged it ourselves, and fine-tuned a model that can't invent a single number." |
| 3:40 | Proof slide | Grounding results, delay, calculator validation |
| 3:55 | Close | "Uncle: meet the future you, who can't make things up." |

Backup: a recorded session in another tab, a saved head, headset wipes.
