// Uncle headset page: a head in a mirror frame, mouth driven by the reply audio.
// Quest: Start enters passthrough AR. Laptop: the same scene in the page.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { loadHead, createIdle, STAND_IN_URL } from "./head.js";
import { analyzeFrame, mouthShape, createSmoother } from "./mouth.js";
import { createPlayer } from "./player.js";
import { sampleVoice, liveVoice } from "./voice.js";

const INK = 0x15130f;
const DUSK = 0x8a8378;
const PAPER = 0xf3eee4;

const params = new URLSearchParams(location.search);
const headName = params.get("head");
const headUrl = headName ? `/head/builds/${encodeURIComponent(headName)}/head.glb` : STAND_IN_URL;
const voiceMode = params.get("voice") === "live" ? "live" : "sample";

const ui = {
  caption: document.getElementById("caption"),
  status: document.getElementById("status"),
  start: document.getElementById("start"),
};
const setStatus = (text) => (ui.status.textContent = text);

// Scene ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local");
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const ink = new THREE.Color(INK);
scene.background = ink;
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
const key = new THREE.DirectionalLight(PAPER, 1.4);
key.position.set(0.4, 0.6, 1);
scene.add(key);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 20);

// The mirror: a dark backing and a thin Dusk grey frame. Lives 1 m in front of the viewer.
const FRAME_W = 0.34;
const FRAME_H = 0.44;
const mirror = new THREE.Group();
const backing = new THREE.Mesh(
  new THREE.PlaneGeometry(FRAME_W, FRAME_H),
  new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.9 }),
);
backing.position.z = -0.12;
mirror.add(backing);
const BAR = 0.003;
const frameMat = new THREE.MeshBasicMaterial({ color: DUSK });
for (const [w, h, x, y] of [
  [FRAME_W + BAR, BAR, 0, FRAME_H / 2],
  [FRAME_W + BAR, BAR, 0, -FRAME_H / 2],
  [BAR, FRAME_H + BAR, FRAME_W / 2, 0],
  [BAR, FRAME_H + BAR, -FRAME_W / 2, 0],
]) {
  const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, BAR), frameMat);
  bar.position.set(x, y, -0.12);
  mirror.add(bar);
}
scene.add(mirror);

// Laptop view: viewer at the origin, mirror 1 m ahead; back the camera off until the frame fits.
const EYE_Y = 0;
mirror.position.set(0, EYE_Y, -1);
function fitCamera() {
  camera.aspect = innerWidth / innerHeight;
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const needV = (FRAME_H * 1.35) / 2 / Math.tan(vfov / 2);
  const needH = (FRAME_W * 1.15) / 2 / Math.tan(hfov / 2);
  const dist = Math.max(needV, needH);
  // Shift up a little so the panel at the bottom doesn't cover the chin.
  camera.position.set(0, EYE_Y - FRAME_H * 0.12, -1 + dist);
  camera.lookAt(0, EYE_Y - FRAME_H * 0.12, -1);
  camera.updateProjectionMatrix();
  if (!renderer.xr.isPresenting) renderer.setSize(innerWidth, innerHeight);
}
fitCamera();
addEventListener("resize", fitCamera);

// Head ----------------------------------------------------------------------
let head = null;
const idle = createIdle();
const smooth = { jaw: createSmoother(), wide: createSmoother(), round: createSmoother() };
const mouth = { jaw: 0, wide: 0, round: 0 };

loadHead(headUrl, renderer)
  .then((h) => {
    head = h;
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
    if (msg.audio) {
      const { start } = player.enqueue(msg.audio, msg.sampleRate || 24000);
      captionTimers.push(setTimeout(() => (ui.caption.textContent = msg.sentence), Math.max(0, (start - player.now()) * 1000)));
    } else {
      ui.caption.textContent = msg.sentence; // text-only fallback
    }
    if (msg.done) replyDone = true;
  } else if (msg.type === "transcript") {
    setStatus(`You said: ${msg.text}`);
  } else if (msg.type === "error") {
    setStatus(`${msg.message}.`);
    replyDone = false;
    ui.start.disabled = false;
  }
}

function speak() {
  replyDone = false;
  ui.start.disabled = true;
  captionTimers.forEach(clearTimeout);
  captionTimers = [];
  ui.caption.textContent = "";
  voice?.close();
  voice = null;
  if (voiceMode === "live") {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    voice = liveVoice(`${proto}://${location.host}/voice`, { name: params.get("name") || "", sex: params.get("sex") || "male", apparent_age: 70 }, onMessage);
  } else {
    sampleVoice(new URL("sample/greeting.json", import.meta.url), onMessage);
  }
}

// AR ------------------------------------------------------------------------
let arSupported = false;
navigator.xr
  ?.isSessionSupported("immersive-ar")
  .then((ok) => {
    arSupported = ok;
    if (ok) ui.start.textContent = "Start in the headset";
  })
  .catch(() => {});

let placeFrames = -1;
renderer.xr.addEventListener("sessionstart", () => {
  scene.background = null; // passthrough shows the real room
  placeFrames = 0;
});
renderer.xr.addEventListener("sessionend", () => {
  placeFrames = -1;
  scene.background = ink;
  mirror.position.set(0, EYE_Y, -1);
  mirror.rotation.set(0, 0, 0);
});

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
});

// Loop ----------------------------------------------------------------------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  if (placeFrames >= 0 && ++placeFrames > 3) {
    placeMirror();
    placeFrames = -1;
  }
  const frame = player.frame();
  const target = frame && player.speaking() ? mouthShape(analyzeFrame(frame.samples, frame.sampleRate)) : { jaw: 0, wide: 0, round: 0 };
  for (const k of Object.keys(smooth)) mouth[k] = smooth[k].step(target[k], dt);
  if (head) {
    const { blink, yaw, pitch } = idle(dt);
    head.apply({ ...mouth, blink });
    head.object.rotation.set(pitch, yaw, 0);
  }
  if (replyDone && !player.speaking()) {
    replyDone = false;
    ui.start.disabled = false;
    ui.start.textContent = "Play again";
  }
  renderer.render(scene, camera);
});

// Debug hook: Playwright checks read the mouth values from here.
window.uncle = { mouth, player, get head() { return head; } };
