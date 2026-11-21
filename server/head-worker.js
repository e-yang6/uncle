// Run on the prepared head-building Mac. Only outbound HTTPS is needed.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, createWriteStream, readFileSync, rmSync } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { MAX_VIDEO_BYTES } from "./head-jobs.js";
import { validateGlb } from "./head-library.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const jobPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

export function workerConfig(env = process.env) {
  const baseUrl = new URL(env.HEAD_SERVER_URL || "https://uncle.health");
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || baseUrl.pathname !== "/") throw new Error("HEAD_SERVER_URL must be the app's origin, without a path or credentials.");
  if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname))) throw new Error("HEAD_SERVER_URL must use HTTPS (HTTP is allowed only for localhost testing).");
  if (!env.HEAD_WORKER_TOKEN?.trim()) throw new Error("Set HEAD_WORKER_TOKEN to match the app server.");
  return { baseUrl: baseUrl.origin, token: env.HEAD_WORKER_TOKEN };
}

export async function workerRequest(baseUrl, token, endpoint, { lease, ...options } = {}) {
  const response = await fetch(baseUrl + endpoint, { ...options, redirect: "error", signal: options.signal ?? AbortSignal.timeout(180000),
    headers: { ...options.headers, Authorization: `Bearer ${token}`, ...(lease ? { "X-Head-Lease": lease } : {}) } });
  if (!response.ok) {
    const error = new Error(`Head server returned ${response.status}. Check the worker key, connection and job status.`);
    error.status = response.status;
    await response.body?.cancel();
    throw error;
  }
  return response;
}

export function runHeadBuild({ video, id, headDir, onStage, signal, timeoutMs = 20 * 60000, spawnFn = spawn }) {
  return new Promise((resolve, reject) => {
    const python = path.join(headDir, ".venv", "bin", "python");
    const child = spawnFn(python, ["-u", "-m", "uncle_head.build", video, id], { cwd: headDir, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let log = "", pending = "", timedOut = false, forceTimer;
    const terminate = () => {
      const kill = sig => { try { if (process.platform !== "win32") process.kill(-child.pid, sig); else child.kill(sig); } catch {} };
      kill("SIGTERM");
      forceTimer = setTimeout(() => kill("SIGKILL"), 3000);
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    const abort = () => terminate();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const collect = chunk => { log = (log + chunk.toString()).slice(-12000); };
    child.stderr.on("data", collect);
    child.stdout.on("data", chunk => {
      collect(chunk);
      pending += chunk.toString();
      const lines = pending.split("\n"); pending = lines.pop().slice(-2000);
      for (const line of lines) {
        if (line.startsWith("frames:")) onStage("cameras");
        else if (line.startsWith("cameras:")) onStage("landmarks");
        else if (line.startsWith("landmarks:")) onStage("assemble");
      }
    });
    const cleanup = () => { clearTimeout(timer); clearTimeout(forceTimer); signal?.removeEventListener("abort", abort); };
    child.once("error", err => { cleanup(); reject(err); });
    child.once("close", code => {
      cleanup();
      if (timedOut || signal?.aborted || code !== 0) {
        const error = new Error(timedOut ? "Head build timed out." : "Head build failed; inspect the local build report.");
        error.reason = timedOut ? "timeout" : /Only \d+ (usable views|views show|frames could)/.test(log) ? "views" : /reprojection|line up|registered/.test(log) ? "alignment" : "build";
        console.error(`[head-worker] ${id}:`, log);
        reject(error);
      } else resolve(path.join(headDir, "builds", id, "head.glb"));
    });
    onStage("frames");
  });
}

export async function processHeadJob({ baseUrl, token, assignment, headDir = path.join(root, "head"), workDir = path.join(root, "captures", "head-worker"), buildFn = runHeadBuild, heartbeatMs = 10000, signal }) {
  const { job, lease } = assignment;
  if (!jobPattern.test(job?.id ?? "") || !["mov", "mp4", "m4v", "webm"].includes(job.extension) || typeof lease !== "string") throw new Error("The server returned an invalid head job.");
  const destination = path.resolve(workDir, job.id);
  if (path.dirname(destination) !== path.resolve(workDir)) throw new Error("Invalid worker output directory.");
  mkdirSync(destination, { recursive: true });
  const video = path.join(destination, `source.${job.extension}`);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const endpoint = `/api/head-worker/${job.id}`;
  let stage = "downloading", reporting = false;
  async function progress() {
    if (reporting) return;
    reporting = true;
    try { const response = await workerRequest(baseUrl, token, `${endpoint}/progress`, { method: "POST", lease,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }), signal: AbortSignal.timeout(15000) }); await response.json(); }
    catch (err) { if ([401, 409].includes(err.status)) controller.abort(); console.error("[head-worker] Progress update failed:", err.message); }
    finally { reporting = false; }
  }
  const heartbeat = setInterval(progress, heartbeatMs);
  try {
    await progress();
    const response = await workerRequest(baseUrl, token, `${endpoint}/video`, { lease, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180000)]) });
    let received = 0;
    const limit = new Transform({ transform(chunk, _encoding, callback) {
      received += chunk.length;
      callback(received > MAX_VIDEO_BYTES ? new Error("Video exceeds the worker's size limit.") : null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(video, { flags: "w" }));
    const glbPath = await buildFn({ video, id: job.id, headDir, signal: controller.signal, onStage: value => { stage = value; void progress(); } });
    stage = "saving";
    await progress();
    if (controller.signal.aborted) throw new Error("The worker lease ended.");
    const glb = readFileSync(glbPath);
    if (glb.length > 50 * 1048576) throw new Error("The finished GLB exceeds the library's upload limit.");
    validateGlb(glb);
    // Retry a lost completion response without creating a second library entry.
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const saved = await workerRequest(baseUrl, token, `${endpoint}/complete`, { method: "POST", lease,
          headers: { "Content-Type": "model/gltf-binary" }, body: glb });
        return await saved.json();
      } catch (err) {
        lastError = err;
        if (err.status && err.status < 500) break;
        await delay(1000);
      }
    }
    throw lastError;
  } catch (err) {
    console.error(`[head-worker] ${job.id}:`, err.message);
    try { const response = await workerRequest(baseUrl, token, `${endpoint}/fail`, { method: "POST", lease,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: err.reason ?? "build" }) }); await response.json(); }
    catch (reportError) { console.error("[head-worker] Could not report failure:", reportError.message); }
    throw err;
  } finally {
    clearInterval(heartbeat);
    signal?.removeEventListener("abort", abort);
    // Only the validated per-job input directory is removed; saved heads stay in head/builds/.
    if (path.dirname(destination) === path.resolve(workDir)) rmSync(destination, { recursive: true, force: true });
  }
}

export function checkHeadSetup(headDir = path.join(root, "head")) {
  for (const file of [".venv/bin/python", "models/base.obj", "models/face_landmarker.task", "models/selfie_multiclass_256x256.tflite", "template/anchors.json"]) {
    if (!existsSync(path.join(headDir, file))) throw new Error(`Head setup is missing ${file}. Use Isaac's prepared Mac or run head/setup.sh first.`);
  }
  const result = spawnSync(path.join(headDir, ".venv", "bin", "python"), ["-c", "import cv2, mediapipe, pycolmap, scipy, PIL, pygltflib"], { cwd: headDir, encoding: "utf8", timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error("Head Python dependencies are not ready. Check head/setup.sh on the builder Mac.");
}

async function main() {
  const config = workerConfig();
  checkHeadSetup();
  if (process.argv.includes("--check")) { console.log("Head worker configuration and local build dependencies are ready."); return; }
  console.log(`Head worker polling ${config.baseUrl}. Keep this Mac awake; press Ctrl+C to stop.`);
  const shutdown = new AbortController();
  process.once("SIGINT", () => shutdown.abort());
  process.once("SIGTERM", () => shutdown.abort());
  while (!shutdown.signal.aborted) {
    try {
      const response = await workerRequest(config.baseUrl, config.token, "/api/head-worker/claim", { method: "POST", signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(15000)]) });
      const assignment = await response.json();
      if (assignment.job) {
        console.log(`[head-worker] Building ${assignment.job.id}`);
        await processHeadJob({ ...config, assignment, signal: shutdown.signal });
        console.log(`[head-worker] Saved ${assignment.job.id}`);
        continue;
      }
    } catch (err) { console.error("[head-worker]", err.message); }
    try { await delay(5000, undefined, { signal: shutdown.signal }); } catch { break; }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => { console.error(err.message); process.exitCode = 1; });
}
