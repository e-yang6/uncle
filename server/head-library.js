// The catalog and scans live together in the git-ignored builds folder.
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, lstatSync, writeFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const validId = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

export function validateGlb(data) {
  if (!Buffer.isBuffer(data) || data.length < 20 || data.toString("ascii", 0, 4) !== "glTF" ||
      data.readUInt32LE(4) !== 2 || data.readUInt32LE(8) !== data.length) {
    throw new Error("Choose a complete GLB version 2 head file.");
  }
  let offset = 12, document;
  while (offset < data.length) {
    if (offset + 8 > data.length) throw new Error("The GLB file is incomplete.");
    const size = data.readUInt32LE(offset), kind = data.readUInt32LE(offset + 4);
    if (size % 4 || offset + 8 + size > data.length) throw new Error("The GLB file is incomplete.");
    if (offset === 12) {
      if (kind !== 0x4e4f534a) throw new Error("The GLB is missing its scene description.");
      try { document = JSON.parse(data.toString("utf8", offset + 8, offset + 8 + size)); }
      catch { throw new Error("The GLB scene description is invalid."); }
    }
    offset += 8 + size;
  }
  if (document?.asset?.version !== "2.0" || !Array.isArray(document.meshes) || !document.meshes.length) {
    throw new Error("The GLB must contain a head mesh.");
  }
  for (const item of [...(document.buffers ?? []), ...(document.images ?? [])]) {
    if (item.uri !== undefined && (typeof item.uri !== "string" || !item.uri.startsWith("data:"))) {
      throw new Error("Export a self-contained GLB with embedded textures and buffers.");
    }
  }
}

function describe(row) {
  const params = new URLSearchParams({ head: row.id, voice: "live", name: row.name });
  return { ...row, url: `/head/builds/${encodeURIComponent(row.id)}/head.glb`, xrUrl: `/xr/?${params}` };
}

export function createHeadLibrary(dir) {
  function withDb(fn) {
    mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, ".library.sqlite"));
    try {
      db.exec("CREATE TABLE IF NOT EXISTS heads (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL, bytes INTEGER NOT NULL)");
      return fn(db);
    } finally { db.close(); }
  }

  function discover(db) {
    const found = new Set();
    const upsert = db.prepare("INSERT INTO heads (id, name, createdAt, bytes) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET bytes=excluded.bytes");
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !validId.test(entry.name)) continue;
      let stat;
      try { stat = lstatSync(path.join(dir, entry.name, "head.glb")); }
      catch (err) { if (err.code === "ENOENT") continue; throw err; }
      if (!stat.isFile()) continue;
      found.add(entry.name);
      const name = entry.name.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      upsert.run(entry.name, name, stat.mtime.toISOString(), stat.size);
    }
    // Files are the source of truth: missing files must not leave broken links.
    const remove = db.prepare("DELETE FROM heads WHERE id = ?");
    for (const row of db.prepare("SELECT id FROM heads").all()) {
      if (!found.has(row.id)) remove.run(row.id);
    }
  }

  return {
    list(query = "") {
      return withDb(db => {
        discover(db);
        const q = query.toLocaleLowerCase();
        return db.prepare("SELECT * FROM heads ORDER BY createdAt DESC, id").all()
          .filter(row => row.name.toLocaleLowerCase().includes(q) || row.id.toLowerCase().includes(q))
          .map(describe);
      });
    },
    add(name, data) {
      if (typeof name !== "string" || !name.trim() || name.trim().length > 60 || /[\x00-\x1f\x7f]/.test(name)) {
        throw new Error("Enter a name of up to 60 characters.");
      }
      validateGlb(data);
      return withDb(db => {
        const id = `scan-${randomUUID()}`;
        const staging = path.join(dir, `.upload-${randomUUID()}`);
        const destination = path.join(dir, id);
        const row = { id, name: name.trim(), createdAt: new Date().toISOString(), bytes: data.length };
        mkdirSync(staging);
        try {
          writeFileSync(path.join(staging, "head.glb"), data, { flag: "wx" });
          db.prepare("INSERT INTO heads (id, name, createdAt, bytes) VALUES (?, ?, ?, ?)")
            .run(row.id, row.name, row.createdAt, row.bytes);
          try { renameSync(staging, destination); }
          catch (err) { db.prepare("DELETE FROM heads WHERE id = ?").run(id); throw err; }
        } finally { rmSync(staging, { recursive: true, force: true }); }
        return describe(row);
      });
    },
  };
}
