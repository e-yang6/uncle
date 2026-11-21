# Uncle: start here

You are one of several Claude Code agents building Uncle at Hack Western, a 36-hour hackathon, for a team of three humans. These files tell you everything about the project. They're loaded below, so you have them now:

@AGENTS.md
@PLAN.md
@BUILD.md
@CONTRACTS.md

Read these when your task touches them:
- DESIGN-RULES.md: before anything visual (AR scene, screens, website, slides).
- DEPLOY.md: before anything about the server or deploying.
- JOBS.md: the routine, the briefs, and the special-job agents and when they start.
- DEVPOST.md: when your work matters to a prize track (instructions at its top).

## At the start of every session

1. **Find your role.** If your human hasn't told you which role you are, ask once: "Am I your agent for your folders, a second agent for one task (which?), or a special-job agent (which)?" Then confirm which person they are (Person 1, 2 or 3; see the owner table in AGENTS.md).
2. **Find where the team is.** Run `date` and compare it with the kickoff time in BUILD.md to know which phase we're in. Read BUILD.md's steps and log to see what's done.
3. **Check the board** with `tools/board unread`, and again before each new task. Don't leave `tools/board wait` running: credits are tight (JOBS.md).
4. **Plan before code.** Propose your next step as a short plan (use plan mode for anything bigger than a small fix) and wait for your human's OK.

## How to work

- **Stay in your folders** (AGENTS.md). Need something from another folder? Ask on the board and tag the owner.
- **Contracts first.** If you need to change how parts connect, propose the change to CONTRACTS.md on the board (only Person 1 edits it), and don't build against it until it's agreed.
- **Never invent numbers.** Money, health and age figures come from the simulation or a cited source, never from you. The future self's words use placeholders (PLAN.md Part 2).
- **Windows teammates:** run shell commands (including `tools/board` and `deploy.sh`) in Git Bash, not Command Prompt or PowerShell.
- **Keep secrets out of git.** API keys go in `.env` (see `.env.example`), which is never committed. Code must start without a key and say which feature is off.
- **Commit small and often.** Before pushing: `git pull --rebase`, then `git push`. Never force-push.
- **Prove it works.** Every "done" comes with a test result, a screenshot, or a measured number.
- **Test on the live link**, not only localhost, once the app is deployed: the headset only uses the live HTTPS address.
- **Only Person 1 deploys** (DEPLOY.md and the deploy skill).
- **Respect the phase.** Follow BUILD.md's order. After the "stop adding features" time in BUILD.md, only fix bugs, test, and write. The commitment vault (PLAN.md Part 6) is the very last step and only starts if everything else works.
- **Cut, don't stall.** If something fails for 20 minutes, stop and tell your human, with the simpler fallback from PLAN.md's risks table.

## When you finish a task

1. Add a line to BUILD.md's log: time, who, what happened (only Person 1 edits other parts of BUILD.md; others post on the board).
2. If it matters to a prize track, update that track's Part in DEVPOST.md, with real measured numbers only.
3. If a teammate depends on it, post on the board and tag them.
4. **Update Entire** (MLH prize track): run `entire brain remember "..."` with the key decision or result from the task. If the task relates to an open trail, update it. Run `entire brain distill` after a long session to extract facts.
5. End your reply to your human with:
   - What changed
   - Why
   - How to check it (a command, a link or a screenshot)
   - What you're unsure about

<!-- entire-agent:begin -->
<!-- Entire agent instructions are inherited through AGENTS.md. -->
<!-- entire-agent:end -->
