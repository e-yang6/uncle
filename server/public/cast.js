import { createPlayer } from "/xr/player.js";
import { liveVoice } from "/xr/voice.js";
// Actual local window video, not a recreated scene. Nothing is uploaded to the server.
const connect = document.getElementById("connect");
const feed = document.getElementById("feed");
const status = document.getElementById("status");
const audioButton = document.getElementById("audio");
const audioStatus = document.getElementById("audio-status");
const watchToken = new URLSearchParams(location.hash.slice(1)).get("watch");
let player = null, voice = null, audioVersion = 0, audioPending = false;
function stopAudio(message = "") {
  ++audioVersion;
  voice?.close(); voice = null;
  player?.stop(); player = null;
  audioButton.textContent = "Enable sound";
  audioStatus.textContent = message;
}
async function startAudio() {
  if (voice || audioPending) return;
  if (!watchToken) { audioStatus.textContent = "Open Show Quest video from your Ready screen to connect Uncle’s sound."; return; }
  audioPending = true; audioButton.disabled = true;
  const request = ++audioVersion;
  const current = createPlayer(); player = current;
  try {
    await current.unlock();
    if (request !== audioVersion) { current.stop(); return; }
    const proto = location.protocol === "https:" ? "wss" : "ws";
    voice = liveVoice(`${proto}://${location.host}/voice`, {type:"watch",mirror:watchToken,liveOnly:true}, message => {
      if (request !== audioVersion) return;
      if (message.type === "reply" && message.audio) current.enqueue(message.audio,message.sampleRate || 24000);
      else if (message.type === "error") stopAudio(message.message || "Sound disconnected. Try enabling it again.");
      else if (message.type === "end") stopAudio("Session ended.");
    });
    audioButton.textContent = "Mute sound";
    audioStatus.textContent = "Uncle’s live voice connected";
  } catch { if (request === audioVersion) stopAudio("Could not start sound. Click Enable sound to try again."); }
  finally { audioPending = false; audioButton.disabled = false; }
}
audioButton.onclick = () => voice ? stopAudio() : startAudio();
let stream = null, pending = false, version = 0;
function stop(message = "Viewing stopped. The Quest session is still running.") {
  ++version;
  stopAudio();
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
  if (watchToken) void startAudio();
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
    status.textContent = "Live USB video";
  } catch (error) {
    if (request !== version) return;
    stop(error.name === "NotAllowedError" ? "Sharing cancelled. Select the Quest mirror window to try again." : "Could not display the window. Keep the USB mirror open and try again.");
  } finally {
    pending = false;
    if (request === version) connect.disabled = false;
  }
};
addEventListener("pagehide", () => stop());
