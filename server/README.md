# server/: the app server

Owner: Person 2. Spec: PLAN.md Architecture, DEPLOY.md.

Lives here: the server started by `npm start` on port 3000 that serves the WebXR app and connects the pipelines (session state, the confirm screen API, streaming audio to the headset), plus the summary page. It must start even when an API key is missing and say which feature is off.

## Main onboarding

The main `/` Begin flow now asks for a head after the person's name. It lists exact-name saved scans, or offers camera recording and original video upload without entering an access code. New builds run during the voice interview. After profile confirmation, an unfinished job shows its actual stage and worker availability; the completed job's specific head id is used in the headset link. Failed scans can be retried without repeating a confirmed interview, or the person can explicitly continue with a saved/stand-in head. Camera cancellation stops all video tracks. The browser obtains a two-hour, single-scan session automatically and keeps it only in memory.

**Choose from face library** opens a searchable picker inside the same onboarding. It lists all saved faces, including scans under other names, with an on-demand static 3D preview of the selected GLB. Selecting a library face changes only the XR head id; the user's name, cloned voice and confirmed simulation profile stay their own. Browsing/selecting a saved face needs no upload code. Preview failures leave selection usable. The preview uses the same pinned three.js version as XR, loads only on selection, and disposes replaced head resources.

Quest handoff: the Ready screen displays an four-letter pairing code valid for ten minutes. In Quest Browser, open uncle.health and choose **I have a pairing code** to load the exact prepared XR link. Codes allow retries, expire, and are cleared on server restart; they contain no staff/worker keys. The Ready screen uses a locally generated PNG from `/api/handoff-qr` and always exposes its direct XR link. It no longer depends on an external QR script; image errors leave the Ready screen and link usable. Tests in `server/onboarding.test.js` exercise the actual page handlers in a DOM with synthetic media/API responses, including upload denial, waiting, failure/retry, exact scan identity, cancellation and QR-image failure. `server/handoff-qr.test.js` verifies real PNG generation and rejects foreign links. Real microphone/camera and Quest checks remain device tests.

## Saved head library

Open `/heads.html` to search saved scans, open one with live voice, download a GLB, or upload a finished `head.glb`. Files already copied into `head/builds/<id>/head.glb` appear automatically when the list loads. An upload gets a unique folder, so repeated scans of one person are kept separately. This saves finished heads; the head-building process still runs on Isaac's machine.

Set `HEAD_LIBRARY_TOKEN` in the server's `.env` to enable uploads, and enter that key in the upload form. Without it the library is readable and uploads are disabled. The key stays in memory only in the page and is cleared after a successful upload. The app's existing head files and catalog entries are publicly readable to anyone with the app link; obtain the person's permission before uploading.

Metadata uses Node's built-in SQLite (`node:sqlite`, Node 22.13 or newer) at `head/builds/.library.sqlite`; GLBs stay in their scan folders. Back up the **whole `head/builds/` directory** to retain both. Normal git deploys leave these ignored files in place; this is local persistent storage on one server, not an off-server backup. To remove a scan, the operator removes its folder; the next list request removes its catalog entry. No delete button is exposed.

Check with `node --test server/head-library.test.js`. The API is documented in CONTRACTS.md.

## Video uploads and head worker

`/heads.html` also accepts an original MOV/MP4/M4V/WebM video up to 250 MiB and shows upload progress, queue state, and real pipeline stages. Successful scans appear automatically in the saved-head library. The last job id is kept in that browser; after a refresh, enter the team key and press **Check last scan**. Keys and videos are never stored in browser storage. Queued videos remain on the server until processed; builds that lose their worker fail visibly after the lease expires. Both the server's source video and the worker's downloaded source are removed after a completed or failed build.

Set `HEAD_WORKER_TOKEN` on the app server and the prepared Mac to the same secret, separate from `HEAD_LIBRARY_TOKEN`. Main onboarding obtains a scoped scan session automatically; the staff utility uses the upload key. The Mac needs Node >=22.13, the existing head Python environment/models/template anchors, and `HEAD_SERVER_URL=https://uncle.health` in its `.env`. From the repository root on that Mac:

```bash
npm ci
node --env-file-if-exists=.env server/head-worker.js --check
caffeinate -i node --env-file-if-exists=.env server/head-worker.js
```

The worker only makes outbound HTTPS requests. It does not expose a Mac HTTP server or require SSH access. It claims one job at a time and calls the existing `uncle_head.build` module with that job's unique id. Ctrl+C stops the worker and cancels the active build. Keep its terminal open while accepting scans. The server does not install or run COLMAP itself, so the model-training GPU is unaffected.

Private queue metadata and uploaded videos are in `captures/head-jobs/` (git-ignored, not statically served). The queue accepts at most 10 unfinished jobs; active builds renew a 90-second lease every 10 seconds and have a 20-minute worker timeout. Local generated head folders and per-step logs remain under `head/builds/<job-id>/` on the Mac, just as with manual builds. Do not point multiple worker processes at the same local checkout. Finished heads on the app server remain under `head/builds/`.

Tests: `node --test server/head-jobs.test.js` exercises queue persistence, exclusive claims, stale-worker handling, private source downloads, failures, and download/build/save through the real HTTP routes with a stand-in builder. A real video reconstruction through the worker still requires a run on Isaac's prepared Mac; those tests do not measure reconstruction quality or speed.


Main handoff now opens a muted, read-only laptop head/reply mirror automatically when Quest uses the pairing code (keep Ready open on the laptop). The mirror does not request a microphone or create a second conversation. Enable laptop sound explicitly if needed. The head is 1.65 times its previous size, with no backing plane or border; passthrough remains transparent.

Money questions now use server/ask.js: Gemini chooses a calculation, the seeded simulation computes it, the chart is sent before the answer, and the writer uses answer.* placeholders. ASK_TOOLS=0 disables this path; failures fall back. Stock-voice thinking fillers are cached; FILLERS=0 disables them. Savings above registered room count in an ordinary account; its growth tax is not modelled.

Actual headset video: open /cast.html on the laptop, keep the USB scrcpy mirror running, click Show Quest view and select its window. Capture stays local in the browser, requires a fresh browser window-selection approval, and stops on leaving or Stop viewing. Ready links here instead of embedding the recreated spectator scene. The existing spectator socket is a diagnostic reply viewer, not exact headset video.

The Ready-screen Show Quest video link includes the existing read-only watch token in its URL fragment. The video viewer uses the existing XR audio player to play Uncle's reply/filler PCM live, without a second microphone or model/TTS request. Show Quest view enables sound on its user click; Enable sound/Mute sound also controls it. Direct visits without a Ready token need the paired link for audio. Quest system sounds are not captured.
