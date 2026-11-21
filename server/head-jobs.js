import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";

export const MAX_VIDEO_BYTES = 250 * 1048576;
export const LEASE_MS = 90000;
export const STAGES = ["downloading", "frames", "cameras", "landmarks", "assemble", "saving"];
const idPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export class JobError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function createHeadJobs(dir, { now = Date.now } = {}) {
  const stamp = () => new Date(now()).toISOString();
  function videoPath(id, extension) {
    if (!idPattern.test(id) || !["mov", "mp4", "m4v", "webm"].includes(extension)) throw new JobError("Invalid scan identifier.");
    return path.join(dir, `${id}.${extension}`);
  }
  const clean = row => {
    const file = videoPath(row.id, row.extension);
    try { unlinkSync(file); } catch (err) { if (err.code !== "ENOENT") throw err; }
  };
  const publicJob = row => row && ({ id: row.id, name: row.name, status: row.status, stage: row.stage,
    createdAt: row.createdAt, updatedAt: row.updatedAt, error: row.error, head: row.head ? JSON.parse(row.head) : null });

  function dbCall(fn) {
    mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, ".jobs.sqlite"));
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, extension TEXT NOT NULL,
        status TEXT NOT NULL, stage TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        expires INTEGER, lease TEXT, error TEXT, head TEXT);
        CREATE TABLE IF NOT EXISTS worker (id INTEGER PRIMARY KEY CHECK(id=1), lastSeen INTEGER NOT NULL);`);
      db.exec("BEGIN IMMEDIATE");
      try {
        const expired = db.prepare("SELECT * FROM jobs WHERE status IN ('building','uploading') AND expires < ?").all(now());
        for (const row of expired) {
          db.prepare("UPDATE jobs SET status='failed', stage='failed', error=?, updatedAt=? WHERE id=?")
            .run(row.status === "building" ? "The head builder disconnected. Please upload the video again." : "The video upload was interrupted. Please try again.", stamp(), row.id);
          clean(row);
        }
        const result = fn(db);
        db.exec("COMMIT");
        return result;
      } catch (err) { db.exec("ROLLBACK"); throw err; }
    } finally { db.close(); }
  }
  const get = (db, id) => {
    const row = db.prepare("SELECT * FROM jobs WHERE id=?").get(String(id));
    if (!row) throw new JobError("Scan not found.", 404);
    return row;
  };
  function leased(db, id, lease) {
    const row = get(db, id);
    if (!lease || row.lease !== lease || !["building", "completed"].includes(row.status)) throw new JobError("This scan's worker lease has ended.", 409);
    return row;
  }
  const online = db => (db.prepare("SELECT lastSeen FROM worker WHERE id=1").get()?.lastSeen ?? 0) > now() - LEASE_MS;

  return {
    videoPath,
    reserve(name, extension) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 60 || /[\x00-\x1f\x7f]/.test(name)) throw new JobError("Enter a name of up to 60 characters.");
      if (!["mov", "mp4", "m4v", "webm"].includes(extension)) throw new JobError("Choose an MOV, MP4, M4V or WebM video.");
      return dbCall(db => {
        if (db.prepare("SELECT count(*) AS n FROM jobs WHERE status IN ('uploading','queued','building')").get().n >= 10) throw new JobError("The scan queue is full. Please try again after a build finishes.", 429);
        const id = randomUUID();
        db.prepare("INSERT INTO jobs (id,name,extension,status,stage,createdAt,updatedAt,expires) VALUES (?,?,?,'uploading','uploading',?,?,?)")
          .run(id, name.trim(), extension, stamp(), stamp(), now() + 30 * 60000);
        return publicJob(get(db, id));
      });
    },
    uploaded(id) {
      return dbCall(db => {
        const row = get(db, id);
        if (row.status !== "uploading") throw new JobError("This upload has expired.", 409);
        if (!existsSync(videoPath(id, row.extension))) throw new JobError("The video upload is missing.");
        db.prepare("UPDATE jobs SET status='queued', stage='queued', expires=NULL, updatedAt=? WHERE id=?").run(stamp(), id);
        return publicJob(get(db, id));
      });
    },
    uploadFailed(id) {
      return dbCall(db => {
        const row = get(db, id);
        db.prepare("UPDATE jobs SET status='failed',stage='failed',error='The video upload failed. Please try again.',updatedAt=? WHERE id=?").run(stamp(), id);
        clean(row);
      });
    },
    status(id) { return dbCall(db => ({ job: publicJob(get(db, id)), workerOnline: online(db) })); },
    claim() {
      return dbCall(db => {
        db.prepare("INSERT INTO worker VALUES (1,?) ON CONFLICT(id) DO UPDATE SET lastSeen=excluded.lastSeen").run(now());
        const row = db.prepare("SELECT * FROM jobs WHERE status='queued' ORDER BY createdAt,id LIMIT 1").get();
        if (!row) return { job: null };
        const lease = randomUUID();
        db.prepare("UPDATE jobs SET status='building',stage='downloading',lease=?,expires=?,updatedAt=? WHERE id=?").run(lease, now() + LEASE_MS, stamp(), row.id);
        return { job: { id: row.id, name: row.name, extension: row.extension }, lease };
      });
    },
    source(id, lease) { return dbCall(db => { const row = leased(db, id, lease); if (row.status !== "building") throw new JobError("This scan is already finished.", 409); return videoPath(id, row.extension); }); },
    progress(id, lease, stage) {
      if (!STAGES.includes(stage)) throw new JobError("Unknown build stage.");
      return dbCall(db => {
        const row = leased(db, id, lease);
        if (row.status !== "building") throw new JobError("This scan is already finished.", 409);
        db.prepare("UPDATE jobs SET stage=?,expires=?,updatedAt=? WHERE id=?").run(stage, now() + LEASE_MS, stamp(), id);
        db.prepare("UPDATE worker SET lastSeen=? WHERE id=1").run(now());
        return { ok: true };
      });
    },
    complete(id, lease, save) {
      return dbCall(db => {
        const row = leased(db, id, lease);
        if (row.status === "completed") return publicJob(row);
        const head = save(row.name);
        db.prepare("UPDATE jobs SET status='completed',stage='completed',head=?,updatedAt=? WHERE id=?").run(JSON.stringify(head), stamp(), id);
        clean(row);
        return publicJob(get(db, id));
      });
    },
    fail(id, lease, reason) {
      const messages = {
        views: "Not enough usable views. Film a slow full turn, starting and ending facing the camera, in even light.",
        alignment: "The views did not line up reliably. Film again with a still, neutral face and a slower turn.",
        timeout: "The build took too long. Please try a shorter video with a clear full turn.",
        build: "The head build failed. Ask the team to check the builder, then try again.",
      };
      return dbCall(db => {
        const row = leased(db, id, lease);
        if (row.status === "completed") return publicJob(row);
        db.prepare("UPDATE jobs SET status='failed',stage='failed',error=?,updatedAt=? WHERE id=?").run(Object.hasOwn(messages, reason) ? messages[reason] : messages.build, stamp(), id);
        clean(row);
        return publicJob(get(db, id));
      });
    },
  };
}
