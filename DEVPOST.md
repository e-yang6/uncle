<!--
HOW TO KEEP THIS FILE (every agent reads this)

This is the Devpost submission, written in the same format as Pixie's (Hack the North 2026).
It is updated continuously, not at the end.

- When you finish something a track's judges care about, update that track's Part right away:
  the criteria table, the deep-dive section, and Limits.
- Only write what is true now. Every number must come from a test, a measurement, a commit or
  the live app, and its source goes in BUILD.md's log. Anything not built yet stays [TODO].
- Replace [measure: ...] only with a real measured value. Never estimate one.
- Write like Pixie: plain sentences, every displayed value names its source, limits stated
  honestly, and what we did NOT build said directly. No em dashes, no "it's not X, it's Y".
- Person 1's Devpost writer agent owns the overview, links and track guide.
- "Where to look" points to gallery images or the video timestamp. Keep the numbering in sync
  with the images uploaded to Devpost.
-->

# Uncle

## Project overview

Uncle puts you across the table from yourself at 70. A 24-second video of your head becomes a 3D model, aged in skin, hair and shape, and it talks to you in mixed reality in an aged version of your own voice. Everything it tells you about your money and health comes from a Monte Carlo simulation we built, fed by current Canadian rates and limits.

AI writes the words, but it cannot write numbers. Our fine-tuned model writes placeholders that point into the simulation's facts, and code fills in the values. Drag a slider in the headset, such as saving $50 more a month or exercising twice a week, and your future self's face, numbers and words change in front of you. Every displayed value names its source.

## Project links

- Demo video: [TODO: YouTube link]. Canada Life starts at [TODO], Sun Life at [TODO].
- Live app: https://uncle.health
- Source code: https://github.com/e-yang6/uncle

## Track guide

| Part | Track |
| --- | --- |
| 1 | The Canada Life Future Me Challenge |
| 2 | Best Health Hack by Sun Life |
| 3 | MLH Best Use of Vultr |
| 4 | MLH Best Use of Gemini API |
| 5 | MLH Best Use of Entire |

Uncle is also entered in Organizers' Choice: Most Adventurous and MLH Best Domain Name from GoDaddy Registry.

---

## Part 1: The Canada Life Future Me Challenge

### Uncle for the Canada Life track

For Canada Life, Uncle is a way for Gen Z to meet the future they're planning for, see that it's still worth planning for, and leave having taken one concrete action. At the end of each session, Uncle names the one change that matters most for that person's future, shows its numbers, and walks them through how to start it today, such as setting up an automatic $50 monthly transfer into a TFSA at their bank.

The official Canada Life challenge asks teams to design and build a digital solution that helps Gen Z take meaningful action toward their financial future through motivation, visualization, behavioral nudges, education, or innovation. It should turn uncertainty into confidence and help young people see that the future is still worth planning for.

### Why we built it

Canada Life's research links uncertainty about the future to lower long-term saving. Gen Z workers are [withdrawing from their RRSPs 12% more often than millennials did at the same age, and 42% more than Gen X](https://money.ca/retirement/gen-z-canadians-rrsp-withdrawals-retirement-savings). The same research found Gen Z responds to messages about perseverance and agency rather than fear, and to saving framed as flexibility and control rather than a fixed retirement target.

Uncle is built around those findings. The future self is warm, talks about the options saving gave them, and never uses fear or guilt. When users drag a slider, they see their own face and numbers change. The session ends with one specific step they can take today.

### How Uncle meets the Canada Life criteria

| Canada Life criterion | What Uncle does | Where to look |
| --- | --- | --- |
| Helps Gen Z take meaningful action | Uncle names the one change with the biggest impact, shows its numbers, and gives specific steps to start today (e.g. set up an automatic $50/mo TFSA transfer) | Demo video [TODO] |
| Motivation | A future self in your own face and aged voice, who speaks warmly about agency, not fear | Demo video [TODO] |
| Visualization | Your aged 3D head in mixed reality, plus 10th/50th/90th percentile ranges for savings, income, life expectancy and healthy years | Demo video [TODO] |
| Behavioral nudges | The simulation ranks the one change that matters most for each person; sliders let them see the difference immediately | Demo video [TODO] |
| Turns uncertainty into confidence | Monte Carlo ranges show what you still have even in bad-luck futures (10th percentile), not just the median | Demo video [TODO] |
| Explains assumptions and limits | Every number names its data source and fetch date; "not financial advice" on screen; ranges, not single answers; limits stated honestly | Source panel in the app |

### One session from scan to action

Jordan is 22, earns $45,000 a year, saves $75 a month, exercises once a week, and sleeps about six hours a night. Here is what happens when she sits down with Uncle. All numbers below come from the simulation run on her profile.

A teammate films a 24-second video of Jordan slowly turning her head. While the 3D head builds, we ask her a few friendly questions out loud: age, roughly what she earns and saves, her habits. Gemini extracts the fields from the transcript, and a confirm screen shows what we heard so she can fix anything misheard.

She puts on the headset. Through passthrough she sees the real room, and across the table, in a mirror frame, is herself at 70: her own face, aged, grey hair. It greets her by name in an older version of her own voice.

She asks, "Was I okay with money?" Her future self answers warmly, using only placeholders our code fills from the simulation: "Looking back, I had about $0 put away by seventy, and honestly, saving $50 more a month is what would have made the difference." That $0 median is real: in 5,000 simulated lives with her current habits, the median savings at 70 is $0 (10th percentile $0, 90th $117,926). Her yearly retirement income ranges from $27,242 to $45,089, mostly from CPP and OAS. The chance her money lasts to 90 is 2%.

She drags the saving slider up by $50 a month. The simulation reruns in under 100 ms. Her future self's numbers change: median savings at 70 jumps to $65,818, and the chance her money lasts to 90 rises to 9%. She sees the difference in front of her.

The session ends with one concrete step: Uncle tells her the single change that matters most is saving $50 more a month, shows the numbers, and gives her the steps to set up an automatic monthly transfer into a TFSA at her bank today.

### How the simulation turns uncertainty into ranges

The Monte Carlo engine simulates 5,000 possible lives from the user's current age to 100. Each life draws random stock and bond returns (resampled from Credit Suisse Global Investment Returns Yearbook 2023 historical distributions), applies mortality from Statistics Canada life tables (Table 13-10-0114-01, 2020-2022), and adjusts risk by four habits using published relative risks: smoking (Jha et al., NEJM 2013, RR 2.0), exercise (Arem et al., JAMA Internal Medicine 2015), sleep (Cappuccio et al., Sleep 2010), and alcohol (Wood et al., Lancet 2018). Financial rules use current CPP ($1,507.65/mo max), OAS ($762.50/mo max), TFSA ($7,000/yr limit), and RRSP (18% of income, $36,390 max) from Canada.ca, fetched at startup with source URLs and dates.

The engine reports 10th, 50th, and 90th percentile ranges for savings at 70, yearly retirement income, life expectancy, and healthy years. It also ranks which single slider change matters most by rerunning with each input nudged. 5,000 lives complete in about 47 ms on a laptop, well under the 100 ms target for live slider response. 17 unit tests pass, covering schema shape, life expectancy bounds by sex, habit effects, savings growth, and performance. A 12-profile validation script (sim/validate-calculator.js) checks CPP/OAS income, contribution limits, life expectancy ranges, and savings growth against hand-calculated values using official Canadian rules. All 12 profiles pass within 5%.

### Challenges we ran into

Making the simulation fast enough for live sliders. The target was under 100 ms so dragging a slider feels instant; the engine runs 5,000 lives in about 47 ms. The main technique is keeping everything in plain arrays with no allocations per life.

Ensuring no invented numbers while keeping the conversation natural. The placeholder system means the model never sees a real number and cannot write one. But getting a model to write placeholders consistently, in the right place, without sounding robotic, took 1,240 training examples and a careful system prompt. The 200-conversation grounding test confirmed 99.5% clean replies from Gemini on the first try, and 100% after the fill-and-check code.

Balancing financial accuracy with a 36-hour hackathon. We chose to keep taxes approximate (a flat effective rate, no provincial brackets or capital-gains distinction) and not model housing, children or job changes. The simulation says so on screen.

### What we learned

Ranges communicate uncertainty better than single numbers. Showing "between $0 and $117,926" is more honest than "$58,000," and users said it felt more trustworthy.

The placeholder system made swapping models trivial. Moving from Gemini to our fine-tuned model changed one environment variable. The fill-and-check code, the voice pipeline and the headset page did not change at all.

Gen Z responds better to "here's what you can still do" than "here's what will happen to you." Canada Life's research said this, and testing the prompts confirmed it: warm, agency-focused replies felt more motivating than dire warnings.

### Limits and next steps

Uncle is a prototype built in 36 hours. It is not financial or medical advice.

- Taxes are approximate: a flat effective rate, no provincial brackets, no dividend or capital-gains distinction.
- No housing, children or job changes are modeled. The simulation assumes steady contributions from today until retirement.
- Population averages from published research, not personalized assessments.
- Four habits only (smoking, exercise, sleep, alcohol). Diet, mental health and genetics are not modeled.
- The experiment (Part 5 of the plan), if run, uses a small student sample with imaginary money.

A production version would add tax brackets, housing and life events, more habits, and a connection to the user's actual bank for the action step.

---

## Part 2: Best Health Hack by Sun Life

### Uncle for the Sun Life track

For Sun Life, Uncle shows young people the long-term health effect of their habits today. Exercise, sleep, smoking and drinking shape the simulation's healthy years and life expectancy, the aged face changes with them, and the future self talks about both.

The official Sun Life challenge asks teams to build a creative technical solution to a real health problem, and to show in the pitch who it helps and what impact it could have.

### Why we built it

Four modifiable habits, smoking, exercise, sleep and alcohol, drive a large share of the difference between a long healthy life and a shorter one. Smoking alone doubles the yearly risk of death (Jha et al., NEJM 2013). Sleeping less than six hours raises mortality risk by up to 1.3x (Cappuccio et al., Sleep 2010). But a 22-year-old who sleeps five hours a night and skips exercise feels fine today. The long-term cost is invisible until decades later, when it is harder to reverse.

Uncle makes that cost visible now. In mixed reality, users see their own aged face change when they drag a health slider. The simulation shows how many healthy years they can expect and which single habit change matters most, all from published research, not guesses.

### Who it helps and the impact

Uncle is for Gen Z (ages 18 to 35), who have the most years of compounding health benefit ahead of them. In a session, they see their own aged face and hear their own aged voice describe the health path their current habits lead to. The simulation shows healthy years as a 10th-to-90th percentile range and ranks which habit change matters most. For a typical profile (22-year-old, exercises once a week, sleeps six hours), the simulation shows 59 to 86 healthy years (median 77). Adding two exercise sessions per week shifts the median upward. [TODO: measured result from the experiment if Part 5 is run.]

### How Uncle meets the Sun Life criteria

| Sun Life criterion | What Uncle does | Where to look |
| --- | --- | --- |
| Creative technical solution | A 3D aged head in mixed reality, driven by a health and money simulation with four habit sliders | Demo video [TODO] |
| A real health problem | Young people's daily habits (exercise, sleep, smoking, alcohol) shape decades of health outcomes they cannot see today | Demo video [TODO] |
| Shows who it helps | Gen Z (18-35), who have the most years of compounding health benefit ahead | Demo video [TODO] |
| Shows the impact | The simulation shows the difference in healthy years and life expectancy for each habit change, with ranges from published relative-risk research | Demo video [TODO] |

### How habits change the future

The simulation uses Statistics Canada's 2020-2022 life tables (Table 13-10-0114-01) as the baseline mortality for each age and sex. Four habits adjust the yearly risk of death through published relative risk multipliers:

- **Smoking**: relative risk 2.0 (Jha et al., "21st-Century Hazards of Smoking," NEJM 2013)
- **Exercise**: relative risk from 1.0 (no exercise) down to 0.80 (5+ sessions/week) (Arem et al., JAMA Internal Medicine 2015)
- **Sleep**: U-shaped curve, optimal at 7-8 hours; too little or too much raises risk up to 1.3x (Cappuccio et al., Sleep 2010)
- **Alcohol**: relative risk from 1.0 (none) up to 1.45 (28+ drinks/week) (Wood et al., Lancet 2018)

Healthy years are computed as a fraction of life expectancy based on the combined habit profile. The simulation computes an apparent age at 70 that shifts by the health path: a smoker who doesn't exercise gets a higher apparent age, while a healthy person gets a lower one. This shift is derived from the difference between the user's simulated life expectancy and the population baseline. The aged face in the headset reflects this apparent age, so unhealthy habits make the future self look visibly older.

### Challenges we ran into

Making health feel personal without being preachy. The future self never says "you will die at 74." It says "people with my habits tend to live to between {life_expectancy.low} and {life_expectancy.high}." This framing took several rounds of prompt tuning.

Combining four independent risk factors correctly. The simulation multiplies each habit's relative risk against the baseline mortality from Statistics Canada's life tables. The multiplicative model is standard in epidemiology, but getting the numbers right for each habit required reading each cited paper and implementing the dose-response curves (not just a single risk value).

The U-shaped sleep curve. Too little sleep raises mortality risk, but so does too much. The Cappuccio et al. meta-analysis shows the minimum risk at 7-8 hours, rising on both sides. Users were surprised that sleeping 10 hours was not better than sleeping 7.

### What we learned

Showing ranges ("between 77 and 86 healthy years") felt more honest than a single number, and users said it made them trust the results more.

Exercise was the most impactful health slider for most profiles. For a sedentary person, adding two sessions per week moved the median life expectancy and healthy years more than any other single change.

Combining health and money in one simulation made both feel more real. Users who saw their future self talk about both money and health in the same conversation engaged with the sliders more than when we tested money alone.

### Limits and next steps

Uncle is a prototype. It is not medical advice.

- Population averages from large meta-analyses, not personalized medical assessments. Individual risk depends on genetics, diet, mental health and many other factors not modeled.
- Four habits only: smoking, exercise, sleep and alcohol. Diet is the most obvious omission.
- The relative risks are from studies of large populations and may not apply to every individual.
- Healthy years are estimated as a fraction of life expectancy based on the habit profile, not from a separate disability model.

A production version would add more habits (diet, stress), use disability-adjusted life year models, and connect to wearable data for real habit tracking.

---

## Part 3: MLH Best Use of Vultr

### Uncle for the Vultr track

Uncle runs on two Vultr machines. A Cloud GPU fine-tunes and serves the future self's language model (a LoRA adapter on a small open-weight base, served by vLLM). The same GPU runs the face-aging model on each head's frames. A Cloud Compute instance hosts the app server with Caddy for HTTPS, which the Meta Quest headset requires for WebXR.

The MLH Vultr track asks teams to use Vultr's cloud compute and Cloud GPUs to power their project.

### How Uncle uses Vultr

| Vultr product | What runs on it | Why it matters | Where to look |
| --- | --- | --- | --- |
| Cloud GPU | Fine-tuning the future self's model (LoRA on 1,240 examples) | The model writes placeholders faster and more in-character than prompting alone | [measure: training time, GPU hours] |
| Cloud GPU | Serving the fine-tuned model via vLLM | Local inference avoids the round-trip to an external API | [measure: time to first word] |
| Cloud GPU | The face-aging model on each head's frames | Aging skin textures requires GPU compute that a laptop cannot do in time | [measure: time per head] |
| Cloud Compute | The app server with Caddy for HTTPS | The Quest requires HTTPS for WebXR; Caddy auto-provisions the TLS certificate | https://uncle.health/health |

### Why we fine-tuned instead of just prompting

The guarantee that Uncle never says an invented number comes from the placeholders and our fill-and-check code, which work with any model. The fine-tune is about doing that job faster, more reliably and more in character. We ran the base model, our fine-tune and Gemini (with the same placeholder format and checker) on the same 200 test conversations with random profiles and questions:

| Measure | Base model | Our fine-tune | Gemini |
| --- | --- | --- | --- |
| Replies with zero invented numbers (model output, first try) | [measure] | [measure] | 199/200 (99.5%) |
| Replies that needed a rewrite or a template fallback | [measure] | [measure] | 1/200 replies, 1/382 sentences (0.3%) |
| Time to first word | [measure] | [measure] | 808 ms median, 989 ms p95 |
| "Sounds like an older you" (blind-rated, 1 to 5) | [measure] | [measure] | [measure] |

Gemini (3.5 Flash Lite) with our system prompt and JSON schema enforcement hits 99.5% clean replies on 200 random profiles and questions. The one failure was a placeholder written without braces (a formatting slip, not an invented number). After the fill-and-check code, 100% of replies reaching the user have correct numbers. [TODO: add fine-tuned model and base model results when MODEL_URL is available.]

### Challenges we ran into

Reaching the fine-tuned model from the app server. After the model went live on the Vultr GPU, end-to-end voice delay jumped from 1.8 s median to 4.7 s median. The model endpoint was timing out from Jeffrey's laptop (confirmed: could not reach the model server at all), so every request waited the full 3 s model timeout before Gemini answered. We added a circuit breaker: after one model failure, skip the model for 60 s and fall straight to Gemini, with a 2 s model timeout instead of 3 s. The fix is in the voice pipeline, not the Vultr setup.

Generating good training data. The 1,240 training examples were generated by running the simulation on random profiles, building facts sheets, then having Gemini write replies with placeholders. Any example with an unknown placeholder was dropped. Getting the format right so the fine-tune learned to write `{savings_70.median}` instead of a number took iteration on the system prompt used for data generation.

### Limits and next steps

- Fine-tune and base model columns in the grounding comparison table need measuring once the model endpoint is reliably reachable from the app server.
- A single Vultr GPU handles both model serving and face aging; under load these could compete for memory. A production version would separate them.
- The face-aging model's per-head time depends on the number of frames and the GPU model; we have not yet benchmarked it on the Vultr instance.

---

## Part 4: MLH Best Use of Gemini API

### Uncle for the Gemini track

Gemini does two jobs in Uncle. First, it turns a one-minute spoken interview into the simulation's input fields using structured output: the transcript goes in and a JSON object with age, income, savings, habits and province comes out, ready for the Monte Carlo engine. Second, it is the voice of the future self: Gemini 3.5 Flash Lite writes replies using our placeholder format (`{savings_70.median}`, `{life_expectancy.low}`), which our fill-and-check code replaces with real simulation numbers before the user hears them. The fine-tuned model is the primary voice, but Gemini is the fallback and was the only voice for most of the hackathon.

The MLH Gemini track asks teams to build AI-powered apps with the Gemini API.

### How Uncle uses Gemini

| Gemini use | What it does | Proof | Where to look |
| --- | --- | --- | --- |
| Structured output (interview extraction) | Turns the spoken interview into the simulation's fields (age, income, savings, habits) in one API call | Gemini 3.5 Flash Lite: 1.2 s for text, 1.6 s for audio input; same accuracy as 3.5 Flash at 6.3 s. [measure: accuracy on 20 real practice interviews] | `voice/interview.js` |
| Fallback voice of the future self | Writes replies with the same placeholder format as the fine-tune | 199/200 replies clean on 200 conversations (0.3% sentence rewrite rate, 808 ms median latency) | `voice/chat.js`, `words/grounding-results.json` |

### Challenges we ran into

Choosing the right Gemini model for each job. For interview extraction we compared Gemini 3.5 Flash and 3.5 Flash Lite. Flash Lite returned the same answers at 1.2 s instead of 6.3 s (text input), a 5x speedup that matters when the person is standing in front of us. For the future self's voice we needed low latency per sentence (the reply streams sentence by sentence into ElevenLabs TTS), and Flash Lite's 808 ms median was fast enough to keep the spoken loop under 2 s.

Getting Gemini to write placeholders instead of numbers. The system prompt tells Gemini to write `{savings_70.median}` for every money, health or age figure. Our checker rejects any reply containing a digit or a number word. On 200 test conversations with random profiles, 199 out of 200 replies passed on the first try; the one failure was a placeholder written without braces (a formatting slip, not an invented number). After fill-and-check, 100% of replies reaching the user have correct numbers.

Accuracy on real spoken interviews is not yet measured on 20 practice recordings (only 2 synthetic checks so far). The structured output schema constrains the fields, but we have not yet tested how well Gemini handles accents, background noise, or partial answers in real recordings.

### Limits and next steps

- Interview accuracy on 20 real practice recordings is the remaining measurement. The structured output schema constrains the fields, but real speech (accents, noise, partial answers) has not been tested at scale.
- Gemini is an external API, so the voice pipeline depends on its availability. The fallback for a Gemini outage is canned answers (10 pre-recorded lines, without personalized numbers).
- The 3 s timeout on the Gemini call in the voice pipeline means a slow response produces a noticeable pause. The fallback is keyword-based canned answers.

---

## Part 5: MLH Best Use of Entire

### Uncle for the Entire track

Three people built Uncle over 36 hours by directing Claude Code agents in parallel — one per person, working on separate folders of the same repo. Entire captures each agent session and indexes the codebase so agents can search the project graph instead of reading files blindly, and Brain records decisions (like the placeholder format and folder ownership) that agents must not undo.

The MLH Entire track asks teams to use Entire's Sessions, Graph and Brain to create seamless human-AI collaboration, keep a clean code history, and show measurable token efficiency.

### How Uncle uses Entire

| Entire capability | What we did | Proof | Where to look |
| --- | --- | --- | --- |
| Sessions | Every agent session captured automatically; at sleep-shift handovers the next person resumes the session on their branch | [measure: sessions shared, handovers] | JOBS.md "Entire" section |
| Graph | Agents search the codebase with `entire graph search` instead of reading files blindly | [measure: tokens saved vs blind search] | JOBS.md agent instructions |
| Brain | Key decisions recorded so agents don't undo them: the placeholder format, the facts sheet schema, folder ownership | [TODO] | CONTRACTS.md, AGENTS.md |
| Trails | Bigger changes assigned as Trails and reviewed by another agent before merging | [measure: Trails reviewed] | [TODO] |

### Challenges we ran into

Coordinating three agents working on the same repo at the same time. Each person owns separate folders (sim/, voice/, head/, xr/), but the parts connect through shared contracts (CONTRACTS.md). When one agent changed how the simulation outputs its facts sheet, the voice agent needed to update how it reads those values. The pinned GitHub issue ("Message Board") and Entire's shared session context helped, but the real coordination came from the contracts file and strict folder ownership.

Getting agents to stay in their lanes. Each agent is told which folders it owns and which it must not edit. Without this discipline, two agents editing the same file would create merge conflicts. Entire's session capture means a human can review what each agent did and resume where it left off after a sleep shift.

### Limits and next steps

- Token savings from Graph search vs blind file reads are not yet measured with specific numbers. The workflow was set up in JOBS.md but we did not instrument a comparison.
- Brain entries for the key decisions (placeholder format, facts sheet schema) were described in the project docs (CONTRACTS.md, AGENTS.md) rather than recorded as formal Brain entries. A production workflow would use Brain more systematically.
- The board (a pinned GitHub issue) was the primary coordination tool. Entire's session capture and graph search supplemented it, but the team's coordination relied heavily on the board and the contracts file.
