# Charts in the headset: what we show, from which data

Owner: Person 3 (drawing, xr/charts.js). The server picks and fills the charts (server/charts.js, Person 1). See them drawn: `/xr/chart-styles.html`.

Style: ProjectionLab's phone app is the inspiration (Isaac's screenshots, Sat Nov 21), redrawn in DESIGN-RULES colours. What we take: one big headline number with a small spaced-caps label, a calm curve with a soft fill and almost no axes, only two or three labelled points, a dashed marker for "left at 90", one stacked bar for what the money is made of, milestones with "In N years" pills and progress rings, a life drawn as a row of year ticks. What we don't take: their blue/teal/purple colours, the night-sky scene, the cartoon avatar (we have the real face), big rounded cards.

Ethics in the drawing code (tested in xr/charts.test.js): life expectancy only ever appears as a range; no chart marks a single death age; only the retirement goal gets an "In N years" pill.

Rule for every chart: each number comes from the simulation or from the person's own interview answers. Ranges, not single guesses, for anything about the future. No red, no countdowns, no death age (life expectancy only as a range for "people with your habits").

## What we collect at onboarding (CONTRACTS.md interview fields)
name, age, sex, province, income per year, savings (TFSA, RRSP, other), saving per month, retirement age, habits (exercise per week, sleep hours, smoker, drinks per week).

## What the simulation returns today (sim/engine.js `simulate`)
savings at 70 (10/50/90), yearly income in retirement (10/50/90), chance money lasts to 90, life expectancy (10/50/90), healthy years (10/50/90; an age, about 73, not years from now), apparent age at 70, the one change that matters most. The server also draws a median-return savings path by age (server/charts.js).

## The charts

| # | Chart | Kind | Shows | Data | Status |
|---|---|---|---|---|---|
| 1 | Savings over a lifetime | `line` | Headline: peak savings and the age; smooth curve, "left at N" marker | server savings path | In contract, drawn |
| 2 | Before and after a change | `bar` | Headline: the gain at 70 ("+$51k"); a row per measure, Dusk = now, amber = with the change | sim rerun with the slider | In contract, drawn |
| 3 | How long, how healthy | `range` | Headline: the range ("61 to 94", people with your habits); bands for life expectancy and healthy years | facts ranges | In contract, drawn |
| 4 | Saved today | `snapshot` | Headline: total saved now; one stacked bar TFSA / RRSP / other with shares | interview answers only | Proposed kind; data exists now |
| 5 | Will the money last | `chance` | Ring and percentage: share of simulated lives where money lasts to 90 | `money_lasts_to_90_chance` | Proposed kind; data exists now |
| 6 | Milestones | `milestones` | Retirement and healthy until about; ring = how far along; an "In N years" pill only on the goal (retirement), no countdown to anything else | age, retirement age, healthy years median | Proposed kind; data exists now |
| 7 | Your life as a timeline | `timeline` | Year ticks to 100: past, working (Paper), retired (amber); dots at retirement and healthy-until; "44 working years, then retired". No dot at life expectancy (no death age) | same as 6 | Proposed kind; data exists now |

Proposed message shapes (same envelope as CONTRACTS.md; `now` = current age):
```json
{ "kind": "snapshot", "title": "Saved today", "labels": ["TFSA", "RRSP", "Other"], "datasets": [{ "label": "Balance", "data": [2000, 0, 500] }] }
{ "kind": "chance", "title": "Money lasting", "labels": ["Money lasts to 90"], "datasets": [{ "label": "of simulated lives that reach 90", "data": [0.77] }] }
{ "kind": "milestones", "title": "Milestones", "now": 21, "labels": ["Retirement", "Healthy until about"], "datasets": [{ "label": "Age", "data": [65, 76] }] }
{ "kind": "timeline", "title": "Your life", "now": 21, "labels": ["Retire", "Healthy to about"], "datasets": [{ "label": "Age", "data": [65, 76] }] }
```
(Values above are the CONTRACTS.md sample person: balances from the interview fields, chance and healthy-until from one simulate() run; real ones come from the server for each person. `xr/sample/make-charts.mjs` builds all seven from a real simulate() run for the style page.)

## Ideas that need new simulation output (ask Person 1 first)
8. **Range of outcomes over time** (fan): 10th / 50th / 90th savings at every age instead of one median path. Most honest wealth picture; "turn uncertainty into confidence" for Canada Life. Needs `simulate()` to record percentiles by age.
9. **Where retirement income comes from**: stacked bar of CPP, OAS and your own savings per year. The sim already computes CPP and OAS; needs the split returned.
10. **What each habit is worth**: one bar per slider (saving +$50, exercise, sleep, quit smoking) in years of life and dollars at 70. The sim already reruns each nudge in `rankBestChange`; needs all results returned, not only the winner. The best "nudge" chart.
11. **TFSA room used**: saving per month x 12 against this year's TFSA limit (read from Canada.ca at startup), as a gauge: "you use 17% of your room". Inputs + fetched limit; tiny server change. Good Gen Z nudge with the concrete next step.
12. **Healthy years vs the rest**: one bar of life split into healthy and not (healthy years median vs life expectancy median). Data exists; could be a variant of `range`.
13. **Your face over time** (not a chart): the apparent age at 70 now vs with the change, shown as two small renders of the head. Head aging already exists in xr/.

## Which chart when (suggested, server decides)
- Session start (after the greeting): 4 Saved today, then 7 Your life.
- Money questions: 1, then 5 if they ask "will it be enough".
- Health questions: 3 (and 12).
- "What should I change" and every slider move: 2 (and 10 once it exists).
- The goodbye: 6 Milestones, with the one change.
