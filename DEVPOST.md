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
- Person 1's Devpost writer agent owns the overview, links and track guide. Owners keep their
  track's Part current (see the owner line in each Part).
- "Where to look" points to gallery images or the video timestamp. Keep the numbering in sync
  with the images uploaded to Devpost.
-->

# Uncle: meet yourself at 70, who can't make things up

## Project overview

Uncle puts you across the table from yourself at 70. A 24-second video of your head becomes a 3D model, aged in skin, hair and shape, and it talks to you in mixed reality in an aged version of your own voice. Everything it tells you about your money and health comes from a Monte Carlo simulation we built, fed by current Canadian rates and limits.

AI writes the words, but it cannot write numbers. Our fine-tuned model writes placeholders that point into the simulation's facts, and code fills in the values. Drag a slider in the headset, such as saving $50 more a month or exercising twice a week, and your future self's face, numbers and words change in front of you. Every displayed value names its source.

## Project links

- Demo video: [TODO: YouTube link]. Canada Life starts at [TODO], Sun Life at [TODO].
- Live app: [TODO: domain]
- Source code: [TODO: GitHub link]

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

Owner: @e-yang6

### Uncle for the Canada Life track

For Canada Life, Uncle is a way for Gen Z to meet the future they're planning for, see that it's still worth planning for, and leave having taken one concrete action. [TODO: one sentence on the action, e.g. setting up an automatic contribution.]

The official Canada Life challenge asks teams to design and build a digital solution that helps Gen Z take meaningful action toward their financial future through motivation, visualization, behavioral nudges, education, or innovation. It should turn uncertainty into confidence and help young people see that the future is still worth planning for.

### Why we built it

Canada Life's research links uncertainty about the future to lower long-term saving. Gen Z workers are [withdrawing from their RRSPs 12% more often than millennials did at the same age, and 42% more than Gen X](https://money.ca/retirement/gen-z-canadians-rrsp-withdrawals-retirement-savings). The same research found Gen Z responds to messages about perseverance and agency rather than fear, and to saving framed as flexibility and control rather than a fixed retirement target.

Uncle is built around those findings. The future self is warm, talks about the options saving gave them, and never uses fear. [TODO: refine once the experience is final.]

### How Uncle meets the Canada Life criteria

| Canada Life criterion | What Uncle does | Where to look |
| --- | --- | --- |
| Helps Gen Z take meaningful action | [TODO: the action at the end of a session] | [TODO] |
| Motivation | A future self in your own face and aged voice, who speaks about agency, not fear | [TODO] |
| Visualization | Your aged 3D head in mixed reality, plus ranges for savings and income | [TODO] |
| Behavioral nudges | The simulation ranks the one change that matters most, and the sliders highlight it | [TODO] |
| Turns uncertainty into confidence | Monte Carlo ranges show what you still have even in bad-luck futures | [TODO] |
| Explains assumptions and limits | Every number names its source and date; ranges, not single answers | [TODO] |

### [TODO: deep-dive section, e.g. "One session from scan to action"]

[TODO: walk through one real session, Pixie's "Case 138" style, with real values from the app.]

### How the simulation turns uncertainty into ranges

[TODO: how many lives are simulated, which data sources, the 10th/50th/90th ranges, and the validation against the government's retirement calculator: [measure: profiles tested, average difference].]

### Challenges we ran into

[TODO]

### What we learned

[TODO]

### Limits and next steps

[TODO: e.g. taxes are approximate; no housing, kids or job changes; not financial advice; the experiment's sample size.]

---

## Part 2: Best Health Hack by Sun Life

Owner: @e-yang6

### Uncle for the Sun Life track

For Sun Life, Uncle shows young people the long-term health effect of their habits today. Exercise, sleep, smoking and drinking shape the simulation's healthy years and life expectancy, the aged face changes with them, and the future self talks about both.

The official Sun Life challenge asks teams to build a creative technical solution to a real health problem, and to show in the pitch who it helps and what impact it could have.

### Why we built it

[TODO: the health problem, with a sourced figure: young people rarely feel the long-term cost of today's habits.]

### Who it helps and the impact

[TODO: who (Gen Z), what changes for them, and any measured result from the experiment: [measure: ...].]

### How Uncle meets the Sun Life criteria

| Sun Life criterion | What Uncle does | Where to look |
| --- | --- | --- |
| Creative technical solution | A 3D aged head in mixed reality, driven by a health and money simulation | [TODO] |
| A real health problem | [TODO] | [TODO] |
| Shows who it helps | [TODO] | [TODO] |
| Shows the impact | [TODO] | [TODO] |

### How habits change the future

[TODO: the life tables used, how each habit adjusts risk (with the cited studies), how healthy years are computed, and how the face's apparent age follows the health path.]

### Challenges we ran into

[TODO]

### What we learned

[TODO]

### Limits and next steps

[TODO: e.g. population averages, not a diagnosis; not medical advice; small cited set of habits.]

---

## Part 3: MLH Best Use of Vultr

Owner: @jeffreywongg

### Uncle for the Vultr track

[TODO: one paragraph on what runs on Vultr.]

The MLH Vultr track asks teams to use Vultr's cloud compute and Cloud GPUs to power their project.

### How Uncle uses Vultr

| Vultr product | What runs on it | Why it matters | Where to look |
| --- | --- | --- | --- |
| Cloud GPU | Fine-tuning the future self's model | [measure: training time, GPU hours] | [TODO] |
| Cloud GPU | Serving the fine-tuned model | [measure: time to first word] | [TODO] |
| Cloud GPU | The face-aging model on each head's frames | [measure: time per head] | [TODO] |
| Cloud Compute | The app server, with HTTPS for the headset | [TODO] | [TODO] |

### Challenges we ran into

[TODO]

### Limits and next steps

[TODO]

---

## Part 4: MLH Best Use of Gemini API

Owner: @jeffreywongg

### Uncle for the Gemini track

[TODO: one paragraph.]

The MLH Gemini track asks teams to build AI-powered apps with the Gemini API.

### How Uncle uses Gemini

| Gemini use | What it does | Proof | Where to look |
| --- | --- | --- | --- |
| Structured output | Turns the spoken interview into the simulation's fields | [measure: fields correct on 20 practice interviews] | [TODO] |
| Fallback voice of the future self | Writes replies with the same placeholder format as the fine-tune | [measure: comparison with the fine-tune on 200 conversations] | [TODO] |

### Challenges we ran into

[TODO]

### Limits and next steps

[TODO]

---

## Part 5: MLH Best Use of Entire

Owner: @personalisaacw

### Uncle for the Entire track

Three people built Uncle by directing many Claude Code agents at once, and Entire kept those agents in sync. [TODO: refine.]

The MLH Entire track asks teams to use Entire's Sessions, Graph and Brain to create seamless human-AI collaboration, keep a clean code history, and show measurable token efficiency.

### How Uncle uses Entire

| Entire capability | What we did | Proof | Where to look |
| --- | --- | --- | --- |
| Sessions | Every agent session saved as a checkpoint and resumed by teammates at sleep-shift handovers | [measure: sessions shared, handovers] | [TODO] |
| Graph | Agents used `entire graph search` instead of searching files blindly | [measure: tokens saved] | [TODO] |
| Brain | Decisions agents must not undo, such as the placeholder format | [TODO] | [TODO] |
| Trails | One agent's change reviewed by another before merging | [measure: Trails reviewed] | [TODO] |

### Challenges we ran into

[TODO]

### Limits and next steps

[TODO]
