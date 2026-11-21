// The onboarding scan owns one person's selected head and one specific build job.
// Access codes are deliberately kept only in memory.
export class HeadScan {
  constructor(fetchFn = (...args) => fetch(...args)) {
    this.fetch = fetchFn;
    this.reset("");
  }
  reset(name) {
    this.name = name;
    this.saved = [];
    this.library = [];
    this.fallbackHead = null;
    this.head = null;
    this.job = null;
    this.key = "";
    this.enabled = false;
  }
  async json(url, options) {
    const response = await this.fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not reach the head library. Please try again.");
    return data;
  }
  async prepare(name) {
    if (this.name !== name) this.reset(name);
    const [library, config] = await Promise.all([
      this.json(`/api/heads?${new URLSearchParams({ q: name })}`, { cache: "no-store" }),
      this.json("/api/head-jobs/config", { cache: "no-store" }),
    ]);
    if (this.name !== name) return;
    this.saved = (library.heads ?? []).filter(head => head.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    this.enabled = config.enabled === true;
  }
  selectSaved(id) {
    this.selectFrom(this.saved, id);
  }
  async loadLibrary() {
    const data = await this.json("/api/heads", { cache: "no-store" });
    this.library = data.heads ?? [];
    return this.library;
  }
  selectLibrary(id) {
    this.selectFrom(this.library, id);
  }
  selectFrom(items, id) {
    const head = items.find(item => item.id === id);
    if (!head) throw new Error("That saved scan is no longer available. Check again.");
    this.head = head;
    this.fallbackHead = head;
    this.job = null;
    this.key = "";
  }
  async upload(video, key) {
    if (!this.enabled) throw new Error("New scans are unavailable right now. Use a saved head or continue without a scan.");
    if (!String(key).trim()) throw new Error("Enter the scan access code from the team.");
    const extension = video.name ? video.name.split(".").pop().toLowerCase() : video.type.includes("mp4") ? "mp4" : "webm";
    if (!["mov", "mp4", "m4v", "webm"].includes(extension) || !video.size || video.size > 250 * 1048576) throw new Error("Choose an MOV, MP4, M4V or WebM video up to 250 MiB.");
    const data = await this.json(`/api/head-jobs?${new URLSearchParams({ name: this.name, extension })}`, {
      method: "POST", headers: { Authorization: `Bearer ${key.trim()}`, "Content-Type": video.type || "application/octet-stream" }, body: video,
    });
    if (!data.job?.id) throw new Error("The server did not return a scan. Please try again.");
    this.key = key.trim();
    this.head = null;
    this.job = data.job;
    return this.job;
  }
  async poll() {
    if (!this.job) return null;
    if (["completed", "failed"].includes(this.job.status)) return { job: this.job };
    const id = this.job.id;
    const data = await this.json(`/api/head-jobs/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${this.key}` }, cache: "no-store" });
    if (this.job?.id !== id) return null;
    if (data.job?.id !== id) throw new Error("The server returned a different scan. Please check again.");
    if (data.job.status === "completed" && !data.job.head?.id) throw new Error("The finished scan has no saved head. Ask the team to check it.");
    this.job = data.job;
    if (this.job.status === "completed") {
      this.head = this.job.head;
      this.key = "";
    }
    if (this.job.status === "failed") this.key = "";
    return data;
  }
  useFallback() {
    this.head = this.fallbackHead ?? this.saved[0] ?? null;
    this.job = null;
    this.key = "";
  }
}

export function headsetLink(origin, { name, sex, head }) {
  const params = new URLSearchParams({ voice: "live", name });
  if (["male", "female"].includes(sex)) params.set("sex", sex);
  if (head?.id) params.set("head", head.id);
  return `${origin}/xr/?${params}`;
}
