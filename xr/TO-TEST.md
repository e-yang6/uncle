# Not tested yet (come back to these)

Kept by Isaac's agent; updated Sat 21:10. Tick an item only with a result (a screenshot, a number or a log line) and who checked it. Add yours, or tell Isaac's agent on the board.

## In the Quest (Isaac). Live link: https://uncle.health/xr/?head=isaac&voice=live&name=Isaac
- [ ] Head aging in passthrough: grey hair, older skin, not creepy. The face now follows the server's age (`facts` message), so `?age=` is overridden once the session starts.
- [ ] Caption panel: now in front of the upper body and always drawn on top (moved Sat 21:05; the new torso hid it before). Readable at arm's length?
- [ ] Chart panel beside the mirror: appears for "how will my savings grow?", fades after about 20 s; grab with a controller trigger, then with a hand pinch; it stays where let go.
- [ ] Chart and card text readable in the headset (only checked on a laptop: `/xr/chart-styles.html`). Includes Jeffrey's big-number, habit and compare cards.
- [ ] Jeffrey's looks (xr/looks.js): backdrop size and distance in passthrough (a 1.3 m painting 0.3 m behind the head is a guess), how the shoulders sit against the real room, arms, watch, cane. On the laptop the neck looks long and stiff, with the head floating above the shoulders (told Jeffrey).
- [ ] End button: it lives in the page overlay, which the Quest doesn't show in passthrough, so it probably can't be reached in the headset (same cause as the old caption problem). Check, then decide: a 3D button or a controller gesture.
- [ ] Bigger floating head with no black panel (Ethan's change): still framed well with the looks.
- [ ] Quest pairing: four-letter code from the Ready screen opens the right name and face.
- [ ] Laptop mirror of the headset session: head and replies show on the laptop, starts muted, no second mic; End session on the laptop also ends the headset.
- [ ] Casting the Quest view to the laptop (BUILD.md step, not started).

## Live site, no headset needed
- [ ] Seeded simulation (merged from #2, live since Sat 01:45 per Ethan): ask the same savings question twice and get the same chart; the savings line rises instead of being flat.
- [ ] Live scan end to end: film a head-turn in Begin, the Mac worker builds it, the head opens in the headset.
- [ ] Tap-to-answer interview questions (cacd393) and the ten required tap questions on a real phone (iPhone Safari, Android Chrome), with a real mic.
- [ ] Interview reading on 20 real recorded interviews (only 20 scripted ones so far).
- [ ] Voice delay with the headset mic in a noisy room.
- [ ] Aging on heads other than Isaac's (tuned on one head).

## Waiting on a merge or a feature
- [ ] PR #3 (life charts, savings line to 90 with retire_age, habit "what to change" chart, present-tense questions get today's balances) merged and deployed by Ethan. Then check each chart appears for its question: "how much do I have right now?" (saved today), "do I have enough to retire?" (chance), "what are my goals?" (milestones), "when do I retire?" (timeline). A "saved today" panel should open each session with a saved profile.
- [ ] Meters (sliders) in the headset with controllers (hand tracking optional) (Isaac, next). Then check: the face ages and the chart changes after letting go, with the starting line dashed.

## Done (with evidence)
- [x] Flat savings chart: fixed (Jeffrey's string-age fix, then the simulation's own path in #2); savings line tests pass.
- [x] Before/after gain was Monte Carlo noise: fixed by the seeded simulation (#2); same input gives the same facts, and the +$50/month gain is +$81,674 on every run (sim/engine-seed.test.js).
- [x] Headset follows the simulation's age: Jeffrey wired the `facts` message to `head.setAge` in xr/main.js.

## Known flaky
- sim "5000 lives in under 150 ms" fails only when the whole `npm test` runs in parallel on a laptop (passes alone, about 60 ms).
