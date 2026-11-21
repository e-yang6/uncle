import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createApp } from "./index.js";
import { createHeadJobs, LEASE_MS } from "./head-jobs.js";
import { processHeadJob, workerConfig, runHeadBuild } from "./head-worker.js";

const video = Buffer.from([0,0,0,20, ...Buffer.from("ftypqt  "), 0,0,0,0, 0,0,0,0]);
function glb() {
  const source = JSON.stringify({ asset: { version: "2.0" }, meshes: [{ primitives: [] }] });
  const text = Buffer.from(source.padEnd(Math.ceil(source.length / 4) * 4, " "));
  const out = Buffer.alloc(20 + text.length);
  out.write("glTF"); out.writeUInt32LE(2,4); out.writeUInt32LE(out.length,8);
  out.writeUInt32LE(text.length,12); out.writeUInt32LE(0x4e4f534a,16); text.copy(out,20);
  return out;
}
const headers = key => ({ Authorization: `Bearer ${key}` });

async function withServer(fn, workerToken = "worker-secret") {
  const dir = mkdtempSync(path.join(tmpdir(), "uncle-video-jobs-"));
  const headsDir = path.join(dir, "heads"), jobsDir = path.join(dir, "jobs");
  const server = createApp({ headsDir, headJobsDir: jobsDir, headLibraryToken: "team-secret", headWorkerToken: workerToken }).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try { await fn({ dir, headsDir, jobsDir, base: `http://127.0.0.1:${server.address().port}` }); }
  finally { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); }
}
const upload = base => fetch(`${base}/api/head-jobs?name=Isaac&extension=mov`, { method: "POST", headers: headers("team-secret"), body: video });

test("queue persists, claims each job once, renews leases, and fails/cleans expired builds", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "uncle-job-store-"));
  let time = Date.now();
  try {
    const store = createHeadJobs(dir, { now: () => time });
    const queued = store.reserve("Isaac", "mov");
    writeFileSync(store.videoPath(queued.id, "mov"), video);
    store.uploaded(queued.id);
    const reopened = createHeadJobs(dir, { now: () => time });
    assert.equal(reopened.status(queued.id).job.status, "queued");
    const assignment = reopened.claim();
    assert.equal(store.claim().job, null, "a second worker cannot claim an active job");
    assert.throws(() => store.progress(queued.id, "wrong-lease", "frames"), /lease/);
    time += LEASE_MS - 1;
    store.progress(queued.id, assignment.lease, "cameras");
    time += LEASE_MS - 1;
    assert.equal(store.status(queued.id).job.stage, "cameras");
    time += 2;
    const failed = reopened.status(queued.id);
    assert.equal(failed.job.status, "failed");
    assert.match(failed.job.error, /disconnected/);
    assert.equal(existsSync(store.videoPath(queued.id, "mov")), false);
    assert.throws(() => store.complete(queued.id, assignment.lease, () => assert.fail("stale worker must not save")), /lease/);
    const interrupted = store.reserve("Maya", "mp4");
    writeFileSync(store.videoPath(interrupted.id, "mp4"), video);
    time += 31 * 60000;
    assert.equal(store.status(interrupted.id).job.status, "failed");
    assert.equal(existsSync(store.videoPath(interrupted.id, "mp4")), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("queue validates names/extensions and caps unfinished jobs", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "uncle-job-cap-"));
  try {
    const store = createHeadJobs(dir);
    assert.throws(() => store.reserve("", "mov"), /name/);
    assert.throws(() => store.reserve("Isaac", "../../secret"), /video/);
    assert.throws(() => store.videoPath("../private", "mov"), /identifier/);
    for (let i = 0; i < 10; i++) store.reserve("Isaac", "mov");
    assert.throws(() => store.reserve("Isaac", "mov"), error => error.status === 429);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("video APIs authenticate, reject invalid files, and keep source videos private", async () => withServer(async ({ base, jobsDir }) => {
  assert.equal((await fetch(base + "/api/head-jobs/config")).status, 200);
  assert.equal((await fetch(base + "/api/head-jobs", { method: "POST", body: video })).status, 401);
  assert.equal((await fetch(base + "/api/head-worker/claim", { method: "POST", headers: headers("team-secret") })).status, 401);
  const invalid = await fetch(`${base}/api/head-jobs?name=Isaac&extension=mov`, { method: "POST", headers: headers("team-secret"), body: "not video" });
  assert.equal(invalid.status, 400);
  assert.equal(readdirSync(jobsDir).filter(f => f.endsWith(".mov")).length, 0);
  const response = await upload(base);
  assert.equal(response.status, 202);
  const { job } = await response.json();
  assert.equal((await fetch(`${base}/api/head-jobs/${job.id}`)).status, 401);
  const state = await (await fetch(`${base}/api/head-jobs/${job.id}`, { headers: headers("team-secret") })).json();
  assert.equal(state.workerOnline, false);
  assert.equal(state.job.status, "queued");
  assert.equal((await fetch(`${base}/captures/head-jobs/${job.id}.mov`)).status, 404);
  const assignment = await (await fetch(base + "/api/head-worker/claim", { method: "POST", headers: headers("worker-secret") })).json();
  assert.equal(assignment.job.id, job.id);
  assert.equal((await fetch(`${base}/api/head-worker/${job.id}/video`, { headers: { ...headers("worker-secret"), "X-Head-Lease": "wrong" } })).status, 409);
  const source = await fetch(`${base}/api/head-worker/${job.id}/video`, { headers: { ...headers("worker-secret"), "X-Head-Lease": assignment.lease } });
  assert.deepEqual(Buffer.from(await source.arrayBuffer()), video);
}));

test("worker runs download/build/save through real HTTP routes; completion retry produces one saved head", async () => withServer(async ({ base, dir, jobsDir }) => {
  const { job } = await (await upload(base)).json();
  const assignment = await (await fetch(base + "/api/head-worker/claim", { method: "POST", headers: headers("worker-secret") })).json();
  const built = path.join(dir, "result.glb");
  const workDir = path.join(dir, "worker-inputs");
  const result = await processHeadJob({ baseUrl: base, token: "worker-secret", assignment, workDir,
    buildFn: async ({ video: input, onStage, id }) => {
      assert.equal(id, job.id);
      assert.deepEqual(readFileSync(input), video);
      onStage("assemble");
      writeFileSync(built, glb());
      return built;
    } });
  assert.equal(result.job.status, "completed");
  assert.equal(result.job.head.name, "Isaac");
  assert.equal(existsSync(path.join(jobsDir, `${job.id}.mov`)), false);
  assert.equal(existsSync(path.join(workDir, job.id)), false);
  const saved = await fetch(base + result.job.head.url);
  assert.deepEqual(Buffer.from(await saved.arrayBuffer()), glb());
  const retry = await fetch(`${base}/api/head-worker/${job.id}/complete`, { method: "POST", headers: { ...headers("worker-secret"), "X-Head-Lease": assignment.lease, "Content-Type": "model/gltf-binary" }, body: glb() });
  assert.equal((await retry.json()).job.head.id, result.job.head.id);
  assert.equal((await (await fetch(base + "/api/heads")).json()).heads.length, 1);
}));

test("failed worker builds report a safe error and remove their source videos", async () => withServer(async ({ base, dir, jobsDir }) => {
  const { job } = await (await upload(base)).json();
  const assignment = await (await fetch(base + "/api/head-worker/claim", { method: "POST", headers: headers("worker-secret") })).json();
  await assert.rejects(() => processHeadJob({ baseUrl: base, token: "worker-secret", assignment, workDir: path.join(dir, "inputs"),
    buildFn: async () => { const error = new Error("Private /Users/isaac/capture.mov details"); error.reason = "views"; throw error; } }));
  const { job: failed } = await (await fetch(`${base}/api/head-jobs/${job.id}`, { headers: headers("team-secret") })).json();
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /full turn/);
  assert.doesNotMatch(failed.error, /Users|isaac|capture.mov/);
  assert.equal(existsSync(path.join(jobsDir, `${job.id}.mov`)), false);
}));

test("missing worker configuration disables video uploads without breaking the app", async () => withServer(async ({ base }) => {
  assert.equal((await (await fetch(base + "/api/head-jobs/config")).json()).enabled, false);
  assert.equal((await upload(base)).status, 503);
  assert.equal((await fetch(base + "/heads.html")).status, 200);
}, ""));

test("worker accepts only secure app origins and never stores credentials in the URL", () => {
  assert.equal(workerConfig({ HEAD_SERVER_URL: "http://127.0.0.1:3000", HEAD_WORKER_TOKEN: "test" }).baseUrl, "http://127.0.0.1:3000");
  for (const url of ["http://example.com", "https://user:secret@example.com", "https://example.com/private"]) {
    assert.throws(() => workerConfig({ HEAD_SERVER_URL: url, HEAD_WORKER_TOKEN: "test" }));
  }
  assert.throws(() => workerConfig({}), /HEAD_WORKER_TOKEN/);
});

test("worker subprocess reports real step boundaries and classifies capture failures", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "uncle-worker-process-"));
  const stages = [];
  const spawnScript = script => (_python, args, options) => {
    assert.deepEqual(args.slice(0, 3), ["-u", "-m", "uncle_head.build"]);
    assert.equal(options.cwd, dir);
    return spawn(process.execPath, ["-e", script], options);
  };
  try {
    const output = await runHeadBuild({ video: "sample.mov", id: "test-id", headDir: dir, onStage: stage => stages.push(stage),
      spawnFn: spawnScript("console.log('frames: ready'); console.log('cameras: ready'); console.log('landmarks: ready')") });
    assert.deepEqual(stages, ["frames", "cameras", "landmarks", "assemble"]);
    assert.equal(output, path.join(dir, "builds", "test-id", "head.glb"));
    await assert.rejects(() => runHeadBuild({ video: "sample.mov", id: "test-id", headDir: dir, onStage() {},
      spawnFn: spawnScript("console.error('Only 10 usable views'); process.exit(1)") }), error => error.reason === "views");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("worker stops a head subprocess that exceeds its time limit", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "uncle-worker-timeout-"));
  try {
    await assert.rejects(() => runHeadBuild({ video: "sample.mov", id: "timeout-test", headDir: dir, onStage() {}, timeoutMs: 150,
      spawnFn: (_python, _args, options) => spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], options) }), error => error.reason === "timeout");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
