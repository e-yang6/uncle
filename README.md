# Uncle

Meet the future you, who can't make things up. Built at Hack Western.

## For the team: putting these files in the repo

1. Make the repo from the hackathon-agent-board template (see the setup doc, Step 3).
2. Copy everything in this folder into the repo's main folder, including the hidden `.claude/`, `.env.example` and `.gitignore`.
3. **Merge, don't overwrite:**
   - `AGENTS.md`: use ours. It already has the board rules; if the template's version has board commands ours doesn't mention, paste them into ours.
   - `.claude/settings.json`: keep the template's file (it has the board hooks). Add this inside its top-level braces so commits don't credit Claude:

     ```json
     "attribution": { "commit": "", "pr": "", "sessionUrl": false }
     ```

   - `.gitignore`: if the template has one, add our lines to it.
4. Replace every `[bracket]`: GitHub usernames and names in AGENTS.md and BUILD.md, the times in BUILD.md's Timing section, the server details in DEPLOY.md, and the IP in deploy.sh.
5. Copy `.env.example` to `.env` and fill in the keys. Never commit `.env`.
6. Commit and push. Everyone pulls, then opens `claude` in the repo.

## How Claude knows what to do

Claude Code reads `CLAUDE.md` automatically, and it loads AGENTS.md, PLAN.md, BUILD.md and CONTRACTS.md. Every agent starts by asking its human which role it is, checks the time against BUILD.md, reads the board, and proposes a plan before writing code.

| File | What it's for |
|---|---|
| CLAUDE.md | Start here: how every agent starts and works |
| AGENTS.md | Who owns which folder, the board rules |
| PLAN.md | The full spec: what Uncle is and how each part works |
| BUILD.md | Timing, the steps in order, sponsor notes, the log |
| CONTRACTS.md | How the parts talk: the data formats |
| JOBS.md | The prompts for each person's agent, an optional second agent, and the special-job agents; how to save credits |
| DESIGN-RULES.md | How anything visual must look |
| DEPLOY.md | The server and how to deploy |
| DEVPOST.md | The submission, kept current all weekend |
| .claude/skills/ | Shared skills: design-review, prize-page, deploy |
| [folder]/README.md | What lives in each folder and who owns it |
