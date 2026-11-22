# Money questions: test plan and implementation plan

Kept by Isaac's agent (Sat Nov 21, 22:40). Use this to carry on from any device: everything you need is in git. Untested items, team-wide, are also in `xr/TO-TEST.md`.

## Where things stand
- **PR #4** (https://github.com/e-yang6/uncle/pull/4), branch `isaac/ask-tools`: open, not merged, not deployed. It holds:
  - `server/ask.js`: the 8 tools, Gemini call 1, the writer brief, guards and the template fallback;
  - `sim/scenarios.js`: project, solveGoal, position, room;
  - `sim/engine.js`: every saved dollar counts; `lump_now`, `start_delay_years`, `pause`, `income_change_pct`; `simulatePath`, `chanceAtLeast`;
  - `voice/fillers.js`: the thinking lines;
  - small edits to `voice/chat.js` (`extra` brief), `server/brain.js` and `server/voice-socket.js` (`respondAsk`);
  - `CONTRACTS.md` notes;
  - `server/ask-eval.mjs`: offline scoring against real Gemini;
  - `server/ask-live.mjs`: asks typed questions over the real socket.
- **On main and live:** the headset draws the goal line (`target`) and puts the headline at the goal's age (`focus_age`). Older servers simply don't send those fields.
- **How it works:**
  1. A filler line plays at once.
  2. Gemini call 1 (function calling) picks one tool and copies only numbers the person said.
  3. The seeded simulation computes, and the chart is sent.
  4. Gemini call 2 writes, seeing the values, but says them only through `answer.*` placeholders.
  5. Fill and check (existing code).
  6. Speak.

  Any failure falls back to the old path. `ASK_TOOLS=0` turns it off, `FILLERS=0` turns fillers off, and `FILLER_VOICE=clone` uses each person's own voice.
- **Measured** (Sat 22:20, real gemini-3.5-flash-lite from Isaac's laptop, 27 questions):
  - right tool 27/27, key argument 20/20, writer passed the checker 27/27;
  - median call 1 512 ms, compute 62 ms, call 2 655 ms;
  - "$1M at 70" gives $630 a month (51% chance);
  - `npm test` 242 pass on the branch.
- **Baseline on live today** (old path, `node server/ask-live.mjs --name Isaac`, Sat 22:35):
  - no filler;
  - "How will my investment grow right now?" got a `snapshot` chart, and the words mixed today and the future ("$299,000 right now");
  - first words about 1.0 s.

  This is the before for the after-deploy comparison.

## Before you start on a new device
1. `git pull`, then `git checkout isaac/ask-tools` for the server work (main for headset work).
2. `npm install` (Ethan added the `qrcode` package; tests fail to load without it).
3. A `.env` with `GEMINI_API_KEY` for the evals (never commit it). Without a key the ask path is off and the tests still pass.
4. Run shell commands in Git Bash on Windows. `node --test xr/` doesn't work on Node 24; use `node --test "xr/**/*.test.js"`.
5. Board: `tools/board unread`.
6. sim/, server/, voice/ and CONTRACTS.md are Ethan's and Jeffrey's: change them by pull request, as with #2, #3 and #4. Only Ethan deploys.

---

# Part 1: test plan

## A. Automated (any machine, no headset)
| # | Check | How | Pass when |
|---|---|---|---|
| A1 | Unit and integration tests | `npm test` on `isaac/ask-tools` | All pass. The only known flake: sim "5000 lives under 150 ms" when every suite runs at once (passes alone) |
| A2 | Tool choice and arguments against real Gemini | `node --env-file=.env server/ask-eval.mjs` | Right tool ≥ 25/27 and key argument ≥ 19/20 |
| A3 | Whole answer against real Gemini | `node --env-file=.env server/ask-eval.mjs --write` | Writer passes the checker ≥ 25/27, and **read every reply** for meaning: the checker can't catch a number used the wrong way |
| A4 | Timing | the last line of A3 | Median call 1 < 700 ms, compute < 150 ms (p95 < 450), call 2 < 900 ms |
| A5 | No invented numbers, broader | words/ grounding test (BUILD.md log Sat 10:10), rerun with replies built through `replyFactsFor` | 100% after fill and check |

**What to read for in A3** (each was a real bug once):
- "chance it lasts" never said as "chance it runs out";
- life expectancy only as a range, never "around 82";
- no numbers at all in concept, chat or decline answers;
- a lump sum is never called "within this year's room" when it's bigger than about $12k;
- "less" and "more" rather than "minus";
- today vs the future never mixed ("right now" only with today's balances).

## B. Live site after Ethan deploys PR #4 (laptop, no headset)
Run `node server/ask-live.mjs --name Isaac` (the name must have a saved interview on uncle.health, or money tools give no numbers).

| # | Pass when |
|---|---|
| B1 | Every question shows `filler "…" at` well under 500 ms (needs the filler lines made: the first session after a restart may have none for a few seconds) |
| B2 | The chart arrives before the first words, for every money question |
| B3 | "$1M at 70" gives a `line +goal` chart and a monthly amount; "invest double" gives a two-line chart with more money than "grow right now" at the same age; "and at 65?" keeps the doubling |
| B4 | First words median under 2.3 s; no question without an answer |
| B5 | Server log lines start `[ask]` with the tool and timings; no `[ask] falling back` except when Gemini is really down |
| B6 | Kill switch: with `ASK_TOOLS=0` set on the server, the old answers still work |

## C. In the Quest (Isaac)
Live link: https://uncle.health/xr/?head=isaac&voice=live&name=Isaac. Ask out loud, in this order:
1. "How much do I need to invest to have a million dollars when I'm seventy?"
2. "How will my investment grow right now?"
3. "What if I invest double?"
4. "And what about at sixty-five?"
5. "When will I have a hundred thousand dollars?"
6. "How much TFSA room do I have?"
7. "What's a TFSA?"
8. "Should I buy Tesla stock?"

Pass when:
- a "hmm" line starts right after you stop talking;
- the chart floats up before or as Uncle answers;
- no silence longer than about a second;
- the spoken numbers match the chart;
- the goal line and its label are readable at arm's length;
- the filler voice isn't jarring next to the cloned voice. If it is, try `FILLER_VOICE=clone`.

Also from the board (Ethan, Sat 02:48): collar fit of the new garments on Isaac's head, and the curved panorama's placement in passthrough.

## D. What to record
After each run, add one line to BUILD.md's log: time, who, what, with the real numbers (tool score, timings, any wrong reply quoted). Tick items in `xr/TO-TEST.md` only with evidence.

---

# Part 2: implementation plan for more questions

## How to add a tool (the recipe)
1. **Maths first** in `sim/scenarios.js` (or a new sim file), with unit tests against the simulation directly, e.g. "the answer fed back in gives the target". Every number from the simulation, an interview answer, or a sourced and dated rule.
2. **Declare it** in `TOOLS` in `server/ask.js`: name, a description that says when to use it (with example questions), and typed parameters with enums where possible. Keep descriptions distinct from the neighbouring tools.
3. **`COMPUTE[name](args, ctx)`** returns:
   - `answer`: pre-formatted text values (`money()`, `pct()`), never raw numbers;
   - `chart`;
   - `notes`: what each value means, plus honest limits.
4. **`templateFor`:** add a plain sentence built from `answer`, used if the writer fails twice.
5. **Guards:**
   - if the tool should say no numbers, add it to `NO_NUMBERS`;
   - if any facts placeholder could be misread, add its meaning to `FACT_MEANINGS`.
6. **Tests and evals:**
   - add questions (and a follow-up) to `server/ask-eval.mjs`'s BANK with an argument check;
   - add a test in `server/ask.test.js`;
   - run A2 and A3 and read the replies.
7. **Chart:** if it needs a new kind or field, add it to `xr/charts.js` (Isaac), document it in CONTRACTS.md, and make old headsets ignore it safely.

## Next phases (in order; cut from the end)

### Phase 3: accounts and tax (the TFSA tax question)
- **Data:** `sim/tax.js` + `sim/tax-brackets.json`, holding this year's federal and provincial income-tax brackets.
  - Read from the CRA, like `sim/fetch-rates.js` does for CPP, OAS and the TFSA limit: source URL, date read, last good copy kept.
  - Start with Ontario (the default province), then the others.
  - Function: `marginalRate(income, province)`.
- **Tool `account_tax`:** `question`: one of `tfsa_tax_saved | rrsp_refund | tfsa_vs_rrsp | taxable_drag`, plus `amount`, `years`, `at_age`.
  - **TFSA saving:** the same contributions grown on the same seeded lives, tax-free vs with each year's growth taxed at the marginal rate. State the simplification: one blended treatment of returns.
  - **RRSP refund:** amount × marginal rate.
  - **TFSA vs RRSP:** marginal rate now vs the rate on retirement income. That needs Phase 4's income split, so give a plain rule until then.
- **Engine:** an optional yearly tax drag on the part saved above registered room, so "invest double" gets more honest.
- **Chart:** `bar` with "Taxable account" vs "TFSA" (TFSA in amber).
- **Tests:**
  - the saving is 0 at a 0% rate;
  - it grows with income and with years;
  - the refund equals the amount × the rate;
  - the brackets match the CRA page values (written into the test with the source).
- **Questions to add:** "How much tax am I saving in my TFSA?", "What refund would I get if I put $2,000 in an RRSP?", "Should I use a TFSA or RRSP first?", "How much do taxes eat if I don't use a TFSA?"

### Phase 4: retirement income and comparisons
- **`retirement_income`:**
  - `breakdown`: CPP, OAS and your savings per year. The simulation already computes CPP and OAS, so return the split.
  - `cpp_start_age`: 60 to 70, using Canada.ca's published early and late percentages, stored in a rules sheet with source and date.
  - `spend_lasts`: how long savings last at a monthly spend. Needs a spend input in the engine; today it's fixed at 70% of income.
  - `sustainable_spend`: the spend that lasts to 90 in most lives (search, like solveGoal).
- **`compare`:** two or three named `project` settings side by side ("$100 / $200 / $400 a month", "start now / in five years", "fees 0.25% / 2%").
  - Fees and stock share become engine inputs (`fee_pct` as a yearly drag; `stock_share` instead of the fixed 60%).
- **`explain_concept` with `illustrate`:** "how does compound growth work?" shows their own money growing (a `project` chart), with words still number-free.
- **`explain_fact` with a rules sheet** (`sim/rules.json`, sourced and dated): TFSA over-contribution penalty, TFSA withdrawals coming back as room next year, OAS clawback threshold, RRSP rate and maximum.
- **Charts (Isaac, xr/charts.js):**
  - `stack`: one bar split into CPP, OAS and savings;
  - `band`: the 10th to 90th percentile fan on `line`, for "best and worst case";
  - up to 3 lines for `compare`;
  - `gauge`: share of this year's room used.

### Phase 5: polish
- Category-aware second filler ("that one needs a bit of maths") if the answer isn't ready about 1.5 s after the first line.
- Caching per session: the base path is computed on every question today, so keep it until a slider moves.
- Pre-make the filler lines when the server starts, not on the first session.
- Prompt trims if call 1 creeps over 700 ms; try a bigger model only if tool accuracy drops below 90% on a larger bank.
- **The meters (sliders) in the headset are still unbuilt** (Isaac, xr/). The server side (seeded sim, `chartForSlider`, the `facts` message) is live. Build them with Quest controllers (PLAN.md now says controllers first, hand tracking optional).

## Open decisions
1. Filler voice: stock (default, no credits) or clone (`FILLER_VOICE=clone`, about six short ElevenLabs lines per person).
2. Goals: middle outcome by default, with "9 in 10" only when asked (current behaviour).
3. "Am I saving enough for my age?" needs a cited Canadian benchmark. Left out until one is found.
4. Province-specific tax: Ontario first, or all provinces at once.
