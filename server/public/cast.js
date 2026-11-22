// Actual local window video, not a recreated scene. Nothing is uploaded to the server.
const connect = document.getElementById("connect");
const feed = document.getElementById("feed");
const status = document.getElementById("status");
let stream = null, pending = false, version = 0;
function stop(message = "Viewing stopped. The Quest session is still running.") {
  ++version;
  const previous = stream; stream = null;
  previous?.getTracks().forEach(track => track.stop());
  feed.srcObject = null; feed.hidden = true;
  connect.disabled = false; connect.textContent = "Show Quest view";
  status.textContent = message;
}
connect.onclick = async () => {
  if (stream) return stop();
  if (pending) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    status.textContent = "Open this page on your laptop in a browser that supports window sharing.";
    return;
  }
  pending = true; connect.disabled = true;
  const request = ++version;
  try {
    const selected = await navigator.mediaDevices.getDisplayMedia({
      video:{displaySurface:"window",frameRate:{ideal:30}},audio:false,
      selfBrowserSurface:"exclude",monitorTypeSurfaces:"exclude",
    });
    if (request !== version) { selected.getTracks().forEach(track => track.stop()); return; }
    stream = selected;
    const track = selected.getVideoTracks()[0];
    if (!track) throw new Error("No video track");
    track.addEventListener("ended", () => { if (stream === selected) stop(); });
    feed.srcObject = selected; feed.hidden = false;
    await feed.play();
    if (request !== version) return;
    connect.textContent = "Stop viewing";
    status.textContent = "Live USB video · sound plays on the Quest";
  } catch (error) {
    if (request !== version) return;
    stop(error.name === "NotAllowedError" ? "Sharing cancelled. Select the Quest mirror window to try again." : "Could not display the window. Keep the USB mirror open and try again.");
  } finally {
    pending = false;
    if (request === version) connect.disabled = false;
  }
};
addEventListener("pagehide", () => stop());
