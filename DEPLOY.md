# Deploying Uncle

Only Person 1 deploys. The app lives on the live HTTPS link from the first hours, and everyone tests there, because the Quest's browser needs HTTPS for WebXR and the microphone.

## The server (filled in by Person 2 after setting it up)

- Provider: Vultr Cloud Compute, Toronto, Ubuntu 24.04
- IP address: 144.202.9.158
- Address: https://144-202-9-158.sslip.io (later: the GoDaddy Registry domain)
- Web server: Caddy, config at `/etc/caddy/Caddyfile`
- App service: `uncle` (systemd, `/etc/systemd/system/uncle.service`), runs `npm start` in `/root/uncle`
- App port: 3000
- Keys: `/root/uncle/.env` (copied up with `scp`, never committed)

## How the app must be set up

- `npm start` from the repo's main folder starts everything: the WebXR page and the API, on port 3000 (or `PORT` from `.env`).
- If the front end needs building, package.json has a `build` script; `deploy.sh` runs it.
- The app starts even when a key is missing, and says which feature is off.

## Deploying

1. Everyone has pushed what should go live.
2. Run the quick test (once it exists): it checks the main demo flow on the live link.
3. From the repo on Person 1's laptop: `bash deploy.sh`
4. Check: open the live address on a laptop and in the Quest.

`deploy.sh` logs into the server, pulls the code, installs packages, builds if needed, and restarts the app.

## Checking and fixing

| What you see | Fix |
|---|---|
| `systemctl status uncle` says failed | `journalctl -u uncle -n 50` on the server, and read the error |
| "502 Bad Gateway" | The app isn't running or isn't on port 3000 |
| Old code on the live link | Push first, then deploy again |
| A new API key doesn't work | `scp .env root@144.202.9.158:~/uncle/.env`, then `systemctl restart uncle` |
| No padlock / certificate error | `journalctl -u caddy -n 50`; check ports 80 and 443 are open (`ufw status`) |

To watch the app's logs live: `ssh root@144.202.9.158 'journalctl -u uncle -f'`.

## Saved head library

- Requires Node 22.13 or newer for built-in SQLite. Check `node --version` before deploying.
- `/heads.html` discovers saved heads already in `/root/uncle/head/builds/`, including Isaac's existing scan.
- Set `HEAD_LIBRARY_TOKEN` in `/root/uncle/.env` and restart `uncle` to enable uploads. Without the key, browsing and opening saved heads still work.
- Back up `/root/uncle/head/builds/` as a unit: it contains the GLBs and `.library.sqlite` catalog. Deploys retain this ignored directory; replacing the server requires restoring it. Files are readable by anyone with the app link, matching existing head URLs.

## Video-to-head worker activation

1. Deploy the app code, retaining `head/builds/` and `captures/head-jobs/` across deploys.
2. Keep `HEAD_LIBRARY_TOKEN` configured. Add a separate random `HEAD_WORKER_TOKEN` to the app server's `.env`, then restart `uncle`.
3. On Isaac's prepared Mac, pull the same code and run `npm ci` (Node >=22.13). Add `HEAD_SERVER_URL=https://uncle.health` and the same `HEAD_WORKER_TOKEN` to its private `.env`. Do not post either key on the board.
4. From the Mac's repository root, run `node --env-file-if-exists=.env server/head-worker.js --check`, then `caffeinate -i node --env-file-if-exists=.env server/head-worker.js`.
5. Open `/heads.html`, upload a permitted head-turn video using the team upload key, and check queued -> build stages -> saved head -> XR. Restart the app while another job is queued to verify persistence. Stop the worker to check that a queued job explains it is waiting for the Mac; an active job whose lease expires should fail with a retry message.

No new firewall rule or incoming Mac port is needed. The Mac must stay awake and the worker terminal must remain running. The queue has a cap of 10 unfinished videos, up to 250 MiB each. Server raw videos are removed on completion/failure; queued sources remain pending. The Mac retains the normal head pipeline's outputs and logs. This activation is separate from deploying the web app; until the Mac worker runs, uploaded jobs cannot build.

## GPU server (separate)

The fine-tune, its serving, and the face-aging model run on a separate Vultr Cloud GPU server, created when needed:
- IP address: [GPU_IP]
- What runs there: [fill in]
- Turn it off or destroy it when not in use, so credits aren't wasted.

## After stopping features

Small, safe fixes only, the quick test after every deploy, and a note in BUILD.md's log for each deploy.

Gemini is the default reply writer; the fine-tuned model stays available through MODEL_FIRST=1. To force a backend during deployment, use DEPLOY_MODEL_FIRST=0 bash deploy.sh (Gemini) or DEPLOY_MODEL_FIRST=1 (fine-tuned). This updates only MODEL_FIRST in the server .env; MODEL_URL and model files remain.
