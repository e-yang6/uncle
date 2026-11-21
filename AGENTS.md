# Uncle: team rules (every agent reads this)

Uncle: meet yourself at 70, in AR, talking in your own aged voice. Every number comes from our simulation.

## Who owns what

| Area | Owner | Folders |
|---|---|---|
| Numbers + words: simulation, facts sheet, fine-tune, fill-and-check | @e-yang6 | sim/, words/ |
| Voice + server: interview, speech-to-text, voice clone, aging filter, streaming, deploy | @jeffreywongg | voice/, server/ |
| Head + AR: 3D head build, aging, mouth animation, WebXR app, sliders | @personalisaacw | head/, xr/ |
| Commitment vault (very last step, PLAN.md Part 6) | Whoever finishes first, assigned by Person 1 | vault/ |

Shared files (AGENTS.md, PLAN.md, BUILD.md, CONTRACTS.md, DESIGN-RULES.md, DEPLOY.md, JOBS.md, deploy.sh) belong to Person 1. Change them only through Person 1. Anyone may add a line to BUILD.md's log. DEVPOST.md is shared: each track's owner keeps their Part current.

Each folder has a README.md saying what lives there. Read it before working in that folder.

## The board (pinned GitHub issue)

Every agent reads and posts on the pinned "Message Board" issue with `tools/board`.

- Start every post with whose agent it is, e.g. `[Ethan's Claude]`. Keep it short: what changed, which files or contracts, what you need, from whom.
- Write so the humans can follow along. After the prefix, every post has:
  1. `In plain English:` one sentence, no jargon.
  2. `Needs:` what you need and from whom (tag them, e.g. @e-yang6), or `none`.
  3. Technical details below, only if needed.
- Words used on the board: **facts sheet** = the list of numbers the future self may say; **contract** = the agreed data format between two parts (CONTRACTS.md); **placeholder** = a slot like `{savings_70.median}` that our code fills with a real number.
- Tag teammates by GitHub username: @e-yang6 (Ethan, Person 1), @jeffreywongg (Jeffrey, Person 2), @personalisaacw (Isaac, Person 3), or @all.
- Tagged (or @all)? Do the work and reply. Not tagged? Read it, and only change course if it affects your folders. Don't reply just to say "got it."
- When you finish something a teammate depends on, or need something from them, post and tag them.
- Check the board with `tools/board unread` at the start of a session and before each new task. Don't leave `tools/board wait` running; it costs credits every time it wakes you.

Board commands: `tools/board unread` (new posts, marks read; flags MENTION), `tools/board read -n 20`, `tools/board post "[Name's Agent] text"` (or pipe stdin), `tools/board wait` (blocks until someone else posts), `tools/board whoami`. Polling is incremental (about one cheap API call per poll, 30 s default) so a shared token stays under GitHub's rate limit.

**Stay in the loop:**
- Claude Code: the committed hooks (`.claude/settings.json`) show unread posts at session start and on every prompt.
- Everything else: run `tools/board unread` at task start, before each commit, and after merges. Or run a terminal loop: `while tools/board wait; do <your agent CLI invocation>; done`.

## Rules

- Only edit the folders your human owns. To change someone else's, ask on the board and wait for the owner or Person 1.
- Changing how parts connect? Update CONTRACTS.md first, then post on the board with @all.
- Never write a number the simulation didn't produce. The future self's words use placeholders (see CONTRACTS.md).
- Keep DEVPOST.md current. When you finish something a track's judges care about, update that track's Part in DEVPOST.md right away, following the instructions at the top of that file. Only what's true now, every number from a real measurement, anything unbuilt left as [TODO].
- Only Person 1 deploys.

## Chain of command

Humans over agents. Only Person 1 moves work between people.
