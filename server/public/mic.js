// Microphone for the /voice socket. Any page on this server can use it, including the
// headset page in xr/:
//
//   import { startMic } from "/mic.js";
//   const mic = await startMic((base64, sampleRate) => socket.send(JSON.stringify({ type: "audio", data: base64, sampleRate })));
//   ...
//   mic.stop();
//
// The browser asks the person for microphone permission (needs https or localhost).
import { resampleTo, toBase64Pcm16, makeChunker } from "/mic-pcm.js";

const WORKLET = `
class Grab extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice());
    return true;
  }
}
registerProcessor("uncle-mic-grab", Grab);
`;

export async function startMic(onChunk, { chunkMs = 100 } = {}) {
  // Echo cancellation matters in a headset: the mic can hear Uncle's voice from the speakers.
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const feed = makeChunker(ctx.sampleRate, (chunk) => onChunk(toBase64Pcm16(resampleTo(chunk, ctx.sampleRate, 16000)), 16000), chunkMs);

  let node;
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    node = new AudioWorkletNode(ctx, "uncle-mic-grab");
    node.port.onmessage = (e) => feed(e.data);
  } catch {
    // Older browsers: the deprecated but widely supported fallback.
    node = ctx.createScriptProcessor(2048, 1, 1);
    node.onaudioprocess = (e) => feed(new Float32Array(e.inputBuffer.getChannelData(0)));
  }
  // Pull audio through the graph without playing the mic back out loud.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(node);
  node.connect(mute);
  mute.connect(ctx.destination);

  return {
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
      node.disconnect();
      ctx.close();
    },
  };
}
