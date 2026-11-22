// Uncle headset page: a head in a mirror frame, mouth driven by the reply audio.
// Quest: Start enters passthrough AR. Laptop: the same scene in the page.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { loadHead, createIdle, STAND_IN_URL } from "./head.js";
import { analyzeFrame, mouthShape, createSmoother } from "./mouth.js";
import { createPlayer } from "./player.js";
import { sampleVoice, liveVoice, isEndMarker } from "./voice.js";
import { createGaze } from "./gaze.js";
import { createCaption3d } from "./caption3d.js";
import { createChartPanel } from "./chartpanel.js";
import { createLooks } from "./looks.js";

const INK = 0x15130f;
const DUSK = 0x8a8378;
const PAPER = 0xf3eee4;

const params = new URLSearchParams(location.search);
const spectator = params.get("spectate") === "1";
const headName = params.get("head");
const headUrl = headName ? `/head/builds/${encodeURIComponent(headName)}/head.glb` : STAND_IN_URL;
const voiceMode = params.get("voice") === "live" ? "live" : "sample";
// Apparent age for the head's look (grey hair, skin, jaw). From the simulation once the server
// sends it (asked Ethan for a contract message); until then ?age= or 70.
const ageParam = Number(params.get("age"));
let apparentAge = Number.isFinite(ageParam) && params.has("age") ? ageParam : 70;

const ui = {
  caption: document.getElementById("caption"),
  status: document.getElementById("status"),
  start: document.getElementById("start"),
  end: document.getElementById("end"),
};

// Scene ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.localClippingEnabled = true; // the outfits are cut off below the chest (xr/looks.js)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local");
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const ink = new THREE.Color(INK);
scene.background = new THREE.Color(PAPER);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const key = new THREE.DirectionalLight(PAPER, 1.4);
key.position.set(0.4, 0.6, 1);
scene.add(key);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 20);

// The mirror: a dark backing and a thin Dusk grey frame. Lives 1 m in front of the viewer.
const FRAME_W = 0.34;
const FRAME_H = 0.58; // tall enough for the face and the shoulders (xr/looks.js)
const FRAME_CY = -0.07; // the frame's centre sits a little below the face
const mirror = new THREE.Group();
scene.add(mirror);

// In the headset the page overlay doesn't show, so caption and status also live under the mirror.
const caption3d = createCaption3d();
// In front of the shoulders (z toward the viewer) and drawn on top, so the upper body never hides it.
caption3d.mesh.position.set(0, -FRAME_H / 2 - 0.02, 0.15);
caption3d.mesh.visible = false;
mirror.add(caption3d.mesh);

// Upper body, outfit and backdrop from the server's wealth_tier and health_tier (CONTRACTS.md Look tiers).
const looks = createLooks();
mirror.add(looks.group);
function setStatus(text) {
  ui.status.textContent = text;
  caption3d.setStatus(text);
}

// Chart panel beside the mirror (server "chart" messages). Smaller and closer in on the
// laptop so it fits the fitted camera; full size, angled towards the viewer, in the headset.
const chartPanel = createChartPanel();
const CHART_POSE = {
  xr: { x: FRAME_W / 2 + 0.24, y: 0.02, z: -0.04, ry: -0.35, s: 1 },
  page: { x: FRAME_W / 2 + 0.16, y: 0.06, z: -0.1, ry: 0, s: 0.6 },
};
function homeChart(where) {
  const p = CHART_POSE[where];
  if (chartPanel.mesh.parent !== mirror) mirror.add(chartPanel.mesh);
  chartPanel.mesh.position.set(p.x, p.y, p.z);
  chartPanel.mesh.rotation.set(0, p.ry, 0);
  chartPanel.mesh.scale.setScalar(p.s);
}
homeChart("page");

function setCaption(text) {
  ui.caption.textContent = text;
  caption3d.setCaption(text);
}

// Laptop view: viewer at the origin, mirror 1 m ahead; back the camera off until the frame fits.
const EYE_Y = 0;
mirror.position.set(0, EYE_Y, -1);
// The frame fits in the space above the bottom panel (caption, status, button).
const PANEL_RESERVE_PX = 230; // two caption lines + status + button + padding
const TOP_MARGIN_PX = 24;
function fitCamera() {
  const W = innerWidth;
  const H = innerHeight;
  camera.aspect = W / H;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const availPx = Math.max(H * 0.4, H - PANEL_RESERVE_PX - TOP_MARGIN_PX);
  // World height the screen must show so the frame fills availPx, and the same for width.
  const viewH = Math.max((FRAME_H * H) / availPx, (FRAME_W * 1.15) / camera.aspect);
  const dist = viewH / 2 / tanV;
  // Screen centre sits below the frame centre by this many pixels; convert to metres.
  const offsetPx = H / 2 - (TOP_MARGIN_PX + availPx / 2);
  const offsetY = (offsetPx * viewH) / H;
  camera.position.set(0, EYE_Y + FRAME_CY - offsetY, -1 + dist);
  camera.lookAt(0, EYE_Y + FRAME_CY - offsetY, -1);
  camera.updateProjectionMatrix();
  if (!renderer.xr.isPresenting) renderer.setSize(innerWidth, innerHeight);
}
fitCamera();
addEventListener("resize", fitCamera);

// Head ----------------------------------------------------------------------
let head = null;
const idle = createIdle();
const gaze = createGaze();
const viewer = new THREE.Vector3();
const debug = {
  gazeAt: null,
  showCaption3d: (on) => (caption3d.mesh.visible = on),
  setAge: (age) => head?.setAge((apparentAge = age)),
  setLook: (wealth, health) => (looks.setTiers(wealth, health), looks.snap()),
  showChart: (chart) => onMessage({ type: "chart", chart }),
}; // Playwright checks: [x, y, z] in world space to look at instead of the viewer
const smooth = { jaw: createSmoother(), wide: createSmoother(), round: createSmoother() };
const mouth = { jaw: 0, wide: 0, round: 0 };

loadHead(headUrl, renderer)
  .then((h) => {
    head = h;
    head.setAge(apparentAge);
    looks.setSkin(h.skinTone);
    if (h.chinY != null) looks.setChin(h.chinY * 1.65);
    h.object.scale.setScalar(1.65);
    mirror.add(h.object);
    setStatus(h.hasMouth ? "" : "This head has no mouth shapes, so it won't move when talking");
    ui.start.disabled = false;
  })
  .catch((err) => {
    console.error(err);
    // Keep Start usable so the voice and captions can still be checked without a head.
    ui.start.disabled = false;
    setStatus(headName ? `Couldn't load the head "${headName}". Try another name, or leave it off for the stand-in.` : "Couldn't load the head. Check the connection and reload.");
  });

// Voice ---------------------------------------------------------------------
const player = createPlayer();
let replyDone = false;
let captionTimers = [];
let voice = null;

function onMessage(msg) {
  if (msg.type === "status") {
    setStatus({ listening: "Listening", thinking: "Thinking", speaking: "" }[msg.state] ?? "");
  } else if (msg.type === "reply") {
    if (isEndMarker(msg)) {
      // nothing to show or play; only marks the end of a streamed reply
    } else if (msg.audio) {
      const { start } = player.enqueue(msg.audio, msg.sampleRate || 24000);
      captionTimers.push(setTimeout(() => (setCaption(msg.sentence)), Math.max(0, (start - player.now()) * 1000)));
    } else {
      setCaption(msg.sentence); // text-only fallback
    }
    if (msg.done) replyDone = true;
  } else if (msg.type === "chart") {
    chartPanel.show(msg.chart);
  } else if (msg.type === "facts") {
    if (msg.apparent_age_at_70 != null) {
      apparentAge = msg.apparent_age_at_70;
      head?.setAge(apparentAge);
    }
    looks.setTiers(msg.wealth_tier, msg.health_tier);
  } else if (msg.type === "end") {
    if (renderer.xr.isPresenting) renderer.xr.getSession().end();
    player.stop?.();
    setCaption("Session ended.");
    setStatus("");
    voice?.close();
    voice = null;
    mic = null;
    if (ui.end) { ui.end.hidden = true; ui.start.hidden = false; ui.start.disabled = false; ui.start.textContent = "Start over"; }
  } else if (msg.type === "transcript") {
    setStatus(`You said: ${msg.text}`);
  } else if (msg.type === "error") {
    const text = String(msg.message || "Something went wrong").replace(/\.$/, "");
    setStatus(`${text[0].toUpperCase()}${text.slice(1)}.`);
    replyDone = false;
    ui.start.disabled = false;
  }
}

function speak() {
  replyDone = false;
  ui.start.disabled = true;
  captionTimers.forEach(clearTimeout);
  captionTimers = [];
  setCaption("");
  voice?.close();
  voice = null;
  if (spectator) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    voice = liveVoice(`${proto}://${location.host}/voice`, {type:"watch",mirror:params.get("mirror")}, onMessage);
  } else if (voiceMode === "live") {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    voice = liveVoice(`${proto}://${location.host}/voice`, { name: params.get("name") || "", sex: params.get("sex") || "male", apparent_age: 70, mirror:params.get("mirror") }, onMessage);
  } else {
    sampleVoice(new URL("sample/greeting.json", import.meta.url), onMessage);
  }
}

// Microphone (live mode only): Jeffrey's /mic.js sends 16 kHz PCM chunks; the server
// decides when the person stopped talking and ignores the mic while Uncle speaks.
let mic = null;
async function startMicOnce() {
  if (spectator || voiceMode !== "live" || mic) return;
  try {
    const { startMic } = await import("/mic.js");
    mic = await startMic((data, sampleRate) => voice?.send({ type: "audio", data, sampleRate }));
  } catch (err) {
    console.error(err);
    setStatus("The microphone is off, so Uncle can talk but can't hear you. Check the browser's microphone permission.");
  }
}

// AR ------------------------------------------------------------------------
let arSupported = false;
navigator.xr
  ?.isSessionSupported("immersive-ar")
  .then((ok) => {
    arSupported = ok;
    if (ok && !spectator) ui.start.textContent = "Start in the headset";
  })
  .catch(() => {});

let placeFrames = -1;
renderer.xr.addEventListener("sessionstart", () => {
  scene.background = null; // passthrough shows the real room
  caption3d.mesh.visible = true;
  homeChart("xr");
  placeFrames = 0;
  if (ui.end) { ui.end.hidden = false; ui.start.hidden = true; }
});
renderer.xr.addEventListener("sessionend", () => {
  placeFrames = -1;
  caption3d.mesh.visible = false;
  grabbedBy = null;
  chartPanel.held = false;
  homeChart("page");
  scene.background = new THREE.Color(PAPER);
  mirror.position.set(0, EYE_Y, -1);
  mirror.rotation.set(0, 0, 0);
  if (ui.end) { ui.end.hidden = true; ui.start.hidden = false; }
});

// Grab the chart panel: controller trigger or hand pinch (both are XR "select").
const raycaster = new THREE.Raycaster();
let grabbedBy = null;
for (const i of [0, 1]) {
  const c = renderer.xr.getController(i);
  scene.add(c);
  c.addEventListener("selectstart", () => {
    if (grabbedBy || !chartPanel.mesh.visible) return;
    raycaster.setFromXRController(c);
    if (!raycaster.intersectObject(chartPanel.mesh, false).length) return;
    c.attach(chartPanel.mesh); // keeps its place in the room, then follows the hand
    chartPanel.held = true;
    grabbedBy = c;
  });
  c.addEventListener("selectend", () => {
    if (grabbedBy !== c) return;
    mirror.attach(chartPanel.mesh); // stays where it was let go
    chartPanel.held = false;
    grabbedBy = null;
  });
}

// Put the mirror 1 m in front of where the viewer is looking, level, facing them.
function placeMirror() {
  const xrCam = renderer.xr.getCamera();
  const pos = new THREE.Vector3().setFromMatrixPosition(xrCam.matrixWorld);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(xrCam.quaternion);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  mirror.position.copy(pos).addScaledVector(fwd, 1);
  mirror.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
}

ui.start.addEventListener("click", async () => {
  if (spectator) {
    player.setMuted(false); await player.unlock();
    ui.start.hidden = true; return;
  }
  ui.start.disabled = true;
  try {
    // Ask for the AR session first, while the click still counts as a user gesture.
    if (arSupported && !renderer.xr.isPresenting) {
      const session = await navigator.xr.requestSession("immersive-ar", {
        optionalFeatures: ["local-floor", "hand-tracking", "dom-overlay"],
        domOverlay: { root: document.getElementById("panel") }, // caption, status and button stay visible in the headset
      });
      await renderer.xr.setSession(session);
    }
    await player.unlock();
  } catch (err) {
    console.error(err);
    setStatus("Couldn't start the headset view. Playing here instead.");
  }
  speak();
  startMicOnce(); // after the AR session so its permission prompt doesn't use up the tap
});

// End button: exits AR, closes voice, tells the mirror viewer to show "Session ended".
if (ui.end) {
  ui.end.addEventListener("click", () => {
    if (renderer.xr.isPresenting) renderer.xr.getSession().end();
    voice?.send({ type: "end" });
    voice?.close();
    voice = null;
    mic = null;
    player.stop?.();
    setCaption("Session ended.");
    setStatus("");
    ui.end.hidden = true;
    ui.start.hidden = false;
    ui.start.disabled = false;
    ui.start.textContent = "Start over";
  });
}

if (spectator) {
  player.setMuted(true);
  void player.unlock();
  ui.start.disabled = false; ui.start.textContent = "Enable laptop sound";
  speak();
  ui.start.disabled = false;
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin) return;
    if (e.data?.type === "uncle-end") {
      voice?.send({ type: "end" });
      voice?.close();
      voice = null;
      player.stop?.();
      setCaption("Session ended.");
    }
  });
}

// Loop ----------------------------------------------------------------------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (placeFrames >= 0 && ++placeFrames > 3) {
    placeMirror();
    placeFrames = -1;
  }
  chartPanel.update(dt);
  looks.update(dt);
  const frame = player.frame();
  const target = frame && player.speaking() ? mouthShape(analyzeFrame(frame.samples, frame.sampleRate)) : { jaw: 0, wide: 0, round: 0 };
  for (const k of Object.keys(smooth)) mouth[k] = smooth[k].step(target[k], dt);
  if (head) {
    const { blink, yaw, pitch } = idle(dt);
    head.apply({ ...mouth, blink });
    head.object.rotation.set(pitch, yaw, 0);
    // Eye contact: the eyes follow the viewer (headset or laptop camera) with a small lag.
    viewer.setFromMatrixPosition((renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).matrixWorld);
    head.object.updateWorldMatrix(true, true);
    if (debug.gazeAt) viewer.fromArray(debug.gazeAt);
    const [x, y, z] = gaze(viewer.toArray(), dt);
    head.lookAt(viewer.set(x, y, z));
  }
  if (replyDone && !player.speaking()) {
    replyDone = false;
    ui.start.disabled = false;
    ui.start.textContent = spectator ? "Enable laptop sound" : voiceMode === "live" ? "Start over" : "Play again";
  }
  renderer.render(scene, camera);
});

// Debug hook: Playwright checks read the mouth values from here.
window.uncle = { mouth, player, debug, get head() { return head; } };
