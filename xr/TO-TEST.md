# Not tested yet (come back to these)

Kept by Isaac's agent. Tick an item only with a result: a screenshot, a number or a log line, and who checked it. Newest at the top of each section.

## Needs the Quest (Isaac)
- [ ] Head aging in passthrough: `https://uncle.health/xr/?head=isaac&voice=live&name=Isaac&age=70`. Grey hair, older skin, not creepy; also try `age=85`. (Built Sat 17:05; only checked in headless Chromium.)
- [ ] Captions under the mirror readable at arm's length, and not doubled if the page overlay ever shows.
- [ ] Chart panel: ask "how much will I have saved?", a panel floats up beside the mirror, fades after about 20 s; grab it with a controller trigger, then with a hand pinch, let go, it stays.
- [ ] New chart style readable in the headset (text sizes were only checked on a laptop, `/xr/chart-styles.html`).
- [ ] Quest pairing: four-letter code from the Ready screen opens the right name and face (Ethan's, built Sat 23:41 and 00:03; physical Quest check pending).
- [ ] Laptop mirror of the headset session (Ethan's, Sat 00:03): head and replies show on the laptop, starts muted, no second mic.
- [ ] Bigger floating head with no black panel (Ethan's change to xr/main.js, Sat 00:03): still framed well, captions and chart panel still placed sensibly around it.
- [ ] Casting the Quest view to the laptop (BUILD.md step, not started).

## Needs a real person or device
- [ ] Live scan end to end on uncle.health: film a head-turn in Begin, the Mac worker builds it, the head opens in the headset (uploads went live Sat 22:05; never run live).
- [ ] Phone camera recording in Begin on iPhone Safari and Android Chrome.
- [ ] Interview reading on 20 real recorded interviews (only 20 scripted ones so far, Jeffrey).
- [ ] Voice delay with the headset mic in a noisy room (measured only from a laptop).
- [ ] Aging on heads other than Isaac's (amounts tuned on one head; dark fringes grey less than the crown).

## Waiting on a fix or a feature
- [ ] PR #2 (seeded sim, savings by age, slider charts vs session start) merged and deployed by Ethan; then check on uncle.health: same question twice gives the same chart, the savings line rises, and a slider move sends 'When you started' / 'Now'.
- [ ] Savings chart is flat: server/charts.js savingsPath string/number bug (reported to Ethan Sat 00:10). Re-check the line chart and regenerate `xr/sample/charts.json` after the fix.
- [ ] Before/after chart gain is mostly Monte Carlo noise (+$78k on one run, +$806 on the next, different "one change" picked each time). Needs the same random draws for the base and nudged runs (reported to Ethan). Re-check after.
- [ ] Headset follows the simulation's age (`facts` message) instead of `?age=`: not wired in xr/main.js yet (Isaac, with the sliders).
- [ ] Sliders in the headset with hand tracking (Isaac, next).
- [ ] Proposed chart kinds (snapshot, chance, milestones, timeline) sent by the server (proposal to Ethan; the headset already draws them).

## Known flaky
- sim "5000 lives in under 150 ms" fails only when the whole `npm test` runs in parallel on a laptop (passes alone, about 60 ms).
