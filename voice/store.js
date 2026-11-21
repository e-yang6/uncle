// Saved voice clones, so a judge who comes back doesn't redo the interview (PLAN.md Part 4).
// Stored on disk under voice/saved/ (clone list) and recordings/ (the audio). Both are
// git-ignored: people's voices never go in git.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// "Jeffrey W." -> "jeffrey-w". Used as the lookup key and in file names.
export function slug(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function createStore({ dir = path.join(root, "voice", "saved"), recordingsDir = path.join(root, "recordings") } = {}) {
  const file = path.join(dir, "clones.json");

  function load() {
    try {
      return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    } catch {
      return {}; // a damaged file should not take the app down
    }
  }
  function write(all) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify(all, null, 2));
  }

  // Confirmed interview answers (the profile the simulation uses), saved next to the clones.
  const profFile = path.join(dir, "profiles.json");
  const loadProfiles = () => {
    try {
      return existsSync(profFile) ? JSON.parse(readFileSync(profFile, "utf8")) : {};
    } catch {
      return {};
    }
  };

  return {
    getProfile: (name) => loadProfiles()[slug(name)] ?? null,
    saveProfile(name, profile, speech = "") {
      const key = slug(name);
      if (!key) throw new Error("a name is needed");
      const all = loadProfiles();
      all[key] = { profile, speech: String(speech ?? "").slice(0, 3000), confirmedAt: new Date().toISOString() };
      mkdirSync(dir, { recursive: true });
      writeFileSync(profFile, JSON.stringify(all, null, 2));
      return all[key];
    },
    deleteProfile(name) {
      const all = loadProfiles();
      delete all[slug(name)];
      mkdirSync(dir, { recursive: true });
      writeFileSync(profFile, JSON.stringify(all, null, 2));
    },
    // Delete everything we kept for one person: their recordings, as well as the clone entry.
    deleteRecordings(name) {
      const key = slug(name);
      if (!key || !existsSync(recordingsDir)) return 0;
      let n = 0;
      for (const f of readdirSync(recordingsDir)) {
        if (f.startsWith(`${key}-`)) (rmSync(path.join(recordingsDir, f)), n++);
      }
      return n;
    },
    find: (name) => load()[slug(name)] ?? null,
    list: () => Object.values(load()),
    save({ name, voiceId }) {
      const key = slug(name);
      if (!key) throw new Error("a name is needed");
      const all = load();
      all[key] = { name: String(name).trim().slice(0, 60), key, voiceId, createdAt: new Date().toISOString() };
      write(all);
      return all[key];
    },
    remove(name) {
      const all = load();
      const found = all[slug(name)] ?? null;
      delete all[slug(name)];
      write(all);
      return found;
    },
    saveRecording({ name, audio, ext }) {
      mkdirSync(recordingsDir, { recursive: true });
      const p = path.join(recordingsDir, `${slug(name)}-${Date.now()}.${ext}`);
      writeFileSync(p, audio);
      return p;
    },
  };
}
