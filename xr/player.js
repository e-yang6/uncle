// Plays reply sentences back to back (no gaps) and exposes an analyser the mouth reads.
import { decodePcm16 } from "./pcm.js";

export function nextStartTime(now, queuedUntil) {
  return Math.max(now, queuedUntil);
}

export function createPlayer() {
  let ctx = null;
  let analyser = null;
  let queuedUntil = 0;
  const buf = new Float32Array(1024);

  function ensure() {
    if (ctx) return;
    ctx = new AudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.connect(ctx.destination);
  }

  return {
    // Call from a user gesture (Start button) so the browser allows audio.
    async unlock() {
      ensure();
      if (ctx.state !== "running") await ctx.resume();
    },
    // Queue one contract reply's audio. Returns the time (s, context clock) it starts.
    enqueue(base64, sampleRate) {
      ensure();
      const samples = decodePcm16(base64);
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
      if (!analyser) return null;
      analyser.getFloatTimeDomainData(buf);
      return { samples: buf, sampleRate: ctx.sampleRate };
    },
    now() {
      return ctx ? ctx.currentTime : 0;
    },
    speaking() {
      return !!ctx && ctx.currentTime < queuedUntil;
    },
  };
}
