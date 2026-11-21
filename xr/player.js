// Plays reply sentences back to back (no gaps) and exposes an analyser the mouth reads.
import { decodePcm16 } from "./pcm.js";

export function nextStartTime(now, queuedUntil) {
  return Math.max(now, queuedUntil);
}

export function createPlayer() {
  let ctx = null;
  let analyser = null;
  let output = null;
  let muted = false;
  let queuedUntil = 0;
  let silent = [];
  const now = () => muted ? performance.now() / 1000 : ctx ? ctx.currentTime : 0;
  const buf = new Float32Array(1024);

  function ensure() {
    if (ctx) return;
    ctx = new AudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    output = ctx.createGain();
    output.gain.value = muted ? 0 : 1;
    analyser.connect(output);
    output.connect(ctx.destination);
  }

  return {
    setMuted(value) { muted = value; queuedUntil = 0; silent = []; if (output) output.gain.value = value ? 0 : 1; },
    // Call from a user gesture (Start button) so the browser allows audio.
    async unlock() {
      if (muted) return;
      ensure();
      if (ctx.state !== "running") await ctx.resume();
    },
    // Queue one contract reply's audio. Returns the time (s, context clock) it starts.
    enqueue(base64, sampleRate) {
      const samples = decodePcm16(base64);
      if (muted) {
        const start = nextStartTime(now(), queuedUntil);
        queuedUntil = start + samples.length / sampleRate;
        silent.push({samples,sampleRate,start,end:queuedUntil});
        return {start,end:queuedUntil};
      }
      ensure();
      const audio = ctx.createBuffer(1, samples.length, sampleRate);
      audio.copyToChannel(samples, 0);
      const src = ctx.createBufferSource();
      src.buffer = audio;
      src.connect(analyser);
      const start = nextStartTime(ctx.currentTime, queuedUntil);
      src.start(start);
      queuedUntil = start + audio.duration;
      return { start, end: queuedUntil };
    },
    // Latest audio frame being played, for mouth analysis. Null before audio exists.
    frame() {
      if (muted) {
        const time = now();
        silent = silent.filter(item => item.end > time);
        const item = silent.find(item => item.start <= time);
        if (!item) return null;
        const offset = Math.floor((time - item.start) * item.sampleRate);
        buf.fill(0); buf.set(item.samples.subarray(offset, offset + buf.length));
        return {samples:buf,sampleRate:item.sampleRate};
      }
      if (!analyser) return null;
      analyser.getFloatTimeDomainData(buf);
      return { samples: buf, sampleRate: ctx.sampleRate };
    },
    now() {
      return now();
    },
    speaking() {
      return now() < queuedUntil;
    },
  };
}
