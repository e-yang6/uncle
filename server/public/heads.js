const $ = id => document.getElementById(id);
let heads = [], uploadsEnabled = false;

function render() {
  const query = $("search").value.trim().toLocaleLowerCase();
  const matches = heads.filter(h => h.name.toLocaleLowerCase().includes(query) || h.id.toLowerCase().includes(query));
  $("heads").replaceChildren();
  for (const head of matches) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.className = "person";
    name.textContent = head.name;
    const meta = document.createElement("span");
    meta.className = "meta muted";
    meta.textContent = `${new Date(head.createdAt).toLocaleString()} · ${(head.bytes / 1048576).toFixed(1)} MB`;
    const actions = document.createElement("div");
    actions.className = "actions";
    const open = document.createElement("a");
    open.href = head.xrUrl;
    open.textContent = "Meet your future self";
    const download = document.createElement("a");
    download.href = head.url;
    download.download = `${head.id}.glb`;
    download.textContent = "Download head";
    actions.append(open, download);
    item.append(name, meta, actions);
    $("heads").append(item);
  }
  $("library-status").textContent = !heads.length ? "No saved heads yet. Upload a finished scan below." :
    !matches.length ? "No heads match that name." : `${matches.length} saved ${matches.length === 1 ? "head" : "heads"}`;
}

async function load() {
  $("refresh").disabled = true;
  $("library-status").textContent = "Loading saved heads…";
  try {
    const response = await fetch("/api/heads", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load saved heads.");
    heads = data.heads;
    uploadsEnabled = data.uploadsEnabled;
    $("upload").disabled = !uploadsEnabled;
    if (!uploadsEnabled) $("upload-status").textContent = "Uploads are off. Ask the team to enable the upload key on the server.";
    render();
  } catch (err) { $("library-status").textContent = `${err.message} Press Refresh to retry.`; }
  finally { $("refresh").disabled = false; }
}

$("refresh").addEventListener("click", load);
$("search").addEventListener("input", render);
$("upload-form").addEventListener("submit", async event => {
  event.preventDefault();
  const file = $("file").files[0];
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".glb") || file.size > 50 * 1048576) {
    $("upload-status").textContent = "Choose a GLB head file up to 50 MiB.";
    return;
  }
  $("upload").disabled = true;
  $("upload-status").textContent = "Uploading and saving your head…";
  try {
    const response = await fetch(`/api/heads?${new URLSearchParams({ name: $("name").value.trim() })}`, {
      method: "POST", headers: { "Content-Type": "model/gltf-binary", Authorization: `Bearer ${$("key").value}` }, body: file,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save the head.");
    $("upload-form").reset();
    $("search").value = "";
    await load();
    $("upload-status").textContent = `${data.name}'s head is saved. Open it from the library above.`;
  } catch (err) { $("upload-status").textContent = err.message; }
  finally { $("upload").disabled = !uploadsEnabled; }
});
load();

// Keep only the job id between visits, never the team key or the source video.
let lastJobId = "", scanKey = "", pollTimer, scanBusy = false, scansEnabled = false;
try { lastJobId = localStorage.getItem("uncle-last-head-job") || ""; } catch {}
$("scan-resume").hidden = !lastJobId;
const stageLabels = {
  uploading: "Uploading your video…", downloading: "Sending the video to the head builder…",
  frames: "Selecting clear views and finding face landmarks…", cameras: "Matching views and recovering camera positions…",
  landmarks: "Reconstructing the face in 3D…", assemble: "Fitting the head, adding texture and preparing animation…", saving: "Saving your finished head…",
};

function setScanBusy(value) {
  scanBusy = value;
  $("scan-submit").disabled = value || !scansEnabled;
  $("scan-resume").disabled = value;
}

async function checkJob() {
  clearTimeout(pollTimer);
  try {
    const response = await fetch(`/api/head-jobs/${encodeURIComponent(lastJobId)}`, { headers: { Authorization: `Bearer ${scanKey}` }, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not check the scan.");
    const job = data.job;
    if (job.status === "completed") {
      $("scan-status").textContent = `${job.name}'s head is ready and saved in the library.`;
      const link = document.createElement("a");
      link.href = job.head.xrUrl;
      link.textContent = "Meet your future self";
      $("scan-result").replaceChildren(link);
      $("scan-key").value = scanKey = "";
      $("video").value = "";
      $("search").value = "";
      setScanBusy(false);
      await load();
      return;
    }
    if (job.status === "failed") {
      $("scan-status").textContent = job.error || "The head build failed. Please try another video.";
      $("scan-key").value = scanKey = "";
      setScanBusy(false);
      return;
    }
    $("scan-status").textContent = job.status === "queued" ? (data.workerOnline ? "Your scan is queued. It will start when the builder is free." : "Video saved. Waiting for the team's head-building Mac to come online.") : stageLabels[job.stage] || "Building your head…";
    pollTimer = setTimeout(checkJob, 3000);
  } catch (err) {
    $("scan-status").textContent = `${err.message} Enter the team key and use Check last scan to try again.`;
    scanKey = "";
    setScanBusy(false);
  }
}

$("scan-resume").addEventListener("click", () => {
  scanKey = $("scan-key").value;
  if (!scanKey) { $("scan-status").textContent = "Enter the team key to check the previous scan."; $("scan-key").focus(); return; }
  setScanBusy(true);
  void checkJob();
});

$("scan-form").addEventListener("submit", event => {
  event.preventDefault();
  if (scanBusy) return;
  const file = $("video").files[0];
  const extension = file?.name.split(".").pop().toLowerCase();
  if (!file || !["mov", "mp4", "m4v", "webm"].includes(extension) || file.size > 250 * 1048576) {
    $("scan-status").textContent = "Choose an MOV, MP4, M4V or WebM video up to 250 MiB.";
    return;
  }
  scanKey = $("scan-key").value;
  setScanBusy(true);
  $("scan-result").replaceChildren();
  $("scan-status").textContent = "Uploading your video…";
  $("scan-upload-progress").hidden = false;
  $("scan-upload-progress").value = 0;
  const request = new XMLHttpRequest();
  request.open("POST", `/api/head-jobs?${new URLSearchParams({ name: $("scan-name").value.trim(), extension })}`);
  request.setRequestHeader("Authorization", `Bearer ${scanKey}`);
  request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
  request.timeout = 30 * 60000;
  request.upload.onprogress = event => {
    if (event.lengthComputable) $("scan-upload-progress").value = Math.round(event.loaded / event.total * 100);
  };
  const uploadError = message => {
    $("scan-upload-progress").hidden = true;
    $("scan-status").textContent = message;
    scanKey = "";
    setScanBusy(false);
  };
  request.onerror = () => uploadError("The upload connection failed. Please try again.");
  request.ontimeout = () => uploadError("The upload timed out. Please try a smaller video.");
  request.onload = () => {
    $("scan-upload-progress").hidden = true;
    let data;
    try { data = JSON.parse(request.responseText); }
    catch { uploadError("The server could not accept the video. Please try again."); return; }
    if (request.status !== 202) { uploadError(data.error || "Could not upload the video."); return; }
    lastJobId = data.job.id;
    try { localStorage.setItem("uncle-last-head-job", lastJobId); } catch {}
    $("scan-resume").hidden = false;
    void checkJob();
  };
  request.send(file);
});

fetch("/api/head-jobs/config", { cache: "no-store" }).then(async response => {
  if (!response.ok) throw new Error("Could not check the head builder. Refresh to retry.");
  const config = await response.json();
  scansEnabled = config.enabled;
  setScanBusy(false);
  $("scan-status").textContent = scansEnabled ? "Upload a video to begin. The team's head-building Mac processes scans in order." : "Video builds are off. Ask the team to configure the head-building worker.";
}).catch(err => { $("scan-status").textContent = err.message; });
