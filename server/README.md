# server/: the app server

Owner: Person 2. Spec: PLAN.md Architecture, DEPLOY.md.

Lives here: the server started by `npm start` on port 3000 that serves the WebXR app and connects the pipelines (session state, the confirm screen API, streaming audio to the headset), plus the summary page. It must start even when an API key is missing and say which feature is off.

## Saved head library

Open `/heads.html` to search saved scans, open one with live voice, download a GLB, or upload a finished `head.glb`. Files already copied into `head/builds/<id>/head.glb` appear automatically when the list loads. An upload gets a unique folder, so repeated scans of one person are kept separately. This saves finished heads; the head-building process still runs on Isaac's machine.

Set `HEAD_LIBRARY_TOKEN` in the server's `.env` to enable uploads, and enter that key in the upload form. Without it the library is readable and uploads are disabled. The key stays in memory only in the page and is cleared after a successful upload. The app's existing head files and catalog entries are publicly readable to anyone with the app link; obtain the person's permission before uploading.

Metadata uses Node's built-in SQLite (`node:sqlite`, Node 22.13 or newer) at `head/builds/.library.sqlite`; GLBs stay in their scan folders. Back up the **whole `head/builds/` directory** to retain both. Normal git deploys leave these ignored files in place; this is local persistent storage on one server, not an off-server backup. To remove a scan, the operator removes its folder; the next list request removes its catalog entry. No delete button is exposed.

Check with `node --test server/head-library.test.js`. The API is documented in CONTRACTS.md.
