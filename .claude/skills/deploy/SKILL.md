---
name: deploy
description: Deploy Uncle to the live server and check it works. Only Person 1's agents use this. Use when asked to deploy, put the app live, or ship.
---

# Deploy

1. Confirm your human is Person 1 (AGENTS.md). If not, stop and say only Person 1 deploys.
2. Read DEPLOY.md.
3. Run `git status` and make sure everything that should go live is committed and pushed. If not, ask your human before pushing anything.
4. Run the quick test if it exists, and stop if it fails.
5. Run `bash deploy.sh` and watch the output.
6. Check the result:
   - `ssh root@144.202.9.158 'systemctl status uncle --no-pager'` says active (running).
   - The live address loads (use `curl -sI` on it and look for `200`).
7. If anything fails, read `journalctl -u uncle -n 50` on the server, fix only what's in Person 1's folders or deploy.sh, and tell your human what broke.
8. Add a line to BUILD.md's log: the time, "deployed," and the commit.
9. Tell your human it's live and remind them to check it in the Quest.
