# Jobs: how each person runs their agents

Claude credits are tight, so each person runs **one agent** for their own work, two at most. A few special-job agents start at set times. Humans paste the prompts below; agents, follow the one that matches your role.

## Your agent (one per person)

Opened in one terminal tab, with `/remote-control` on so the human can check in from their phone. It works through both of its person's folders, one task at a time.

Paste:

> You're my agent. I'm [Person 1, 2 or 3] and I own [folders]. Read CLAUDE.md and everything it loads. Work on one task at a time in my folders: plan it, show me the plan before writing code, build it, prove it works, commit, and post on the board when a teammate depends on it. Start with my next unchecked step in BUILD.md. Check the board with `tools/board unread` before each new task.

For each task, give it a brief like this:

> Build: [the feature, in 2-3 sentences] in [folder]/. Read [folder]/README.md first. Follow the "[section]" part of CONTRACTS.md. Done means: [what should work], it runs without errors, and you've committed. Check it by: [running the tests / opening the page and taking a screenshot]. Then give me your summary (see CLAUDE.md).

## A second agent (only when it's worth it)

Open a second tab only when two tasks can really run at the same time, for example something long-running (the fine-tune, a head build, a batch of test conversations) while you work on something else. Give it the same brief format, keep it to a different folder from your first agent (or a separate `git worktree`), and close it when that task is done.

## Saving credits

- Run `/clear` between unrelated tasks, so the agent isn't re-reading a long old conversation with every message.
- Use Sonnet for routine work; switch to Opus (`/model`) only for hard problems like the simulation math or the head pipeline.
- Plan mode (Shift+Tab) first: a wrong 20-minute build is the most expensive thing an agent can do.
- Don't leave `tools/board wait` running in your agent; each wake-up costs credits. Check `tools/board unread` between tasks instead.
- Search the code with `entire graph search` instead of letting the agent read files blindly, and note the savings for the Entire prize page.

## The human's routine

- Check your agent every 10 to 15 minutes: read its summary, answer questions, give the next task.
- Stuck for 20 minutes: press Esc, explain it differently, or split the task smaller.
- Ask for proof of every "done."
- Every hour or so, ask your agent where your part is at in five sentences and what's risky.
- Someone always stays near the laptops; sleep in shifts.

## Special-job agents

Each opens in its own tab when its time comes.

| When | Who opens it | Agent | Paste this |
|---|---|---|---|
| From the start | Person 1 | Reviewer | "You're the reviewer. Read CLAUDE.md. Don't write features. Every 20 minutes, read the new commits and list anything that could break the demo, touches another owner's folder, leaks a secret, invents a number, or doesn't match CONTRACTS.md. Post serious problems on the board, tagged to the owner." |
| From the start | Person 1 | Devpost writer | "Read CLAUDE.md and DEVPOST.md. Keep DEVPOST.md current as features land: the overview, links and track guide, and nudge each track's owner on the board when their Part is behind. Only real measured numbers, each with its source in BUILD.md's log." |
| Hours 3 to 6 | Person 3 | Design rounds | "Read CLAUDE.md and DESIGN-RULES.md. Draw three different directions for the AR mirror, the sliders and the confirm screen as quick HTML mockups in xr/mockups/, and screenshot each one so I can compare them. Then put the one we pick into a single theme file of colors, type and sizes in xr/." |
| Hours 18 to 26 | Person 1 | Prize pages | "Use the prize-page skill to write each track's Part in DEVPOST.md from BUILD.md's sponsor notes and the measured results so far." |
| Hours 22 to 26 | Person 3 | Design check | "Use the design-review skill on every screen and the headset view, at laptop and phone sizes." |
| Stop-features time | Person 2 | Feature test | "Read CLAUDE.md. Open the live app. List every button and flow, try each like a first-time user, and write FEATURE-TEST.md as a pass/fail table. Post each fail on the board, tagged to its folder's owner." |
| Before submitting | Person 1 | Fact-check | "Read DEVPOST.md. For each number or claim, find where it comes from in the code, a test, BUILD.md's log or the live app. List anything you can't confirm, and every remaining [TODO] or [measure: ...]." |

## Entire (for the MLH Entire prize)

- Sessions: every agent session is captured automatically (`entire enable` was run). At a sleep-shift handover, the person taking over runs `entire session resume <branch>`.
- Graph: agents search the codebase with `entire graph search` instead of searching files blindly. Note token savings in BUILD.md's log for the prize page.
- Brain: record decisions agents must not undo (the placeholder format, the facts sheet's fields, folder owners).
- Trails: for bigger changes, assign the task as a Trail and have another agent review it before merging.
