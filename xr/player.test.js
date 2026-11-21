import { test } from "node:test";
import assert from "node:assert/strict";

test("muted mirror animates from reply PCM without needing AudioContext autoplay", async()=>{
  const {createPlayer}=await import('./player.js');
  const player=createPlayer();player.setMuted(true);await player.unlock();
  const pcm=Buffer.alloc(24000*2);for(let i=0;i<24000;i++)pcm.writeInt16LE(i%2?12000:-12000,i*2);
  player.enqueue(pcm.toString('base64'),24000);
  assert.equal(player.speaking(),true);
  const frame=player.frame();assert.equal(frame.sampleRate,24000);
  assert.ok(frame.samples.some(n=>Math.abs(n)>.3));
});

