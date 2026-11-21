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
