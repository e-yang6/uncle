import { test } from "node:test";
import assert from "node:assert/strict";
import { resampleTo, toBase64Pcm16, makeChunker } from "./public/mic-pcm.js";

test("48 kHz down to 16 kHz keeps a tone's frequency and length", () => {
  const from = 48000;
  const x = new Float32Array(from).map((_, n) => 0.5 * Math.sin((2 * Math.PI * 440 * n) / from)); // 1 s of 440 Hz
  const y = resampleTo(x, from, 16000);
  assert.equal(y.length, 16000);
  let crossings = 0;
  for (let i = 1; i < y.length; i++) if (y[i - 1] < 0 && y[i] >= 0) crossings++;
  assert.ok(Math.abs(crossings - 440) <= 2, `got ${crossings} cycles for 440 Hz`);
  assert.ok(Math.max(...y) > 0.45 && Math.max(...y) < 0.55, "level kept");
});

test("same rate is passed through untouched", () => {
  const x = new Float32Array([0.1, 0.2]);
  assert.equal(resampleTo(x, 16000, 16000), x);
});

test("base64 PCM matches what the server decodes: 16-bit little-endian", () => {
  const b64 = toBase64Pcm16(new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]));
  const buf = Buffer.from(b64, "base64");
  assert.equal(buf.length, 14);
  assert.equal(buf.readInt16LE(0), 0);
  assert.equal(buf.readInt16LE(2), 16384);
  assert.equal(buf.readInt16LE(4), -16383);
  assert.equal(buf.readInt16LE(6), 32767);
  assert.equal(buf.readInt16LE(8), -32767);
  assert.equal(buf.readInt16LE(10), 32767, "louder than full scale is clipped, not wrapped");
  assert.equal(buf.readInt16LE(12), -32767);
});

test("a long recording encodes without blowing the call stack", () => {
  assert.doesNotThrow(() => toBase64Pcm16(new Float32Array(16000 * 30)));
});

test("tiny audio blocks are collected into ~100 ms chunks, none lost", () => {
  const got = [];
  const feed = makeChunker(48000, (c) => got.push(c.length), 100); // 4800 samples per chunk
  for (let i = 0; i < 100; i++) feed(new Float32Array(128)); // 12800 samples in 128-sample blocks
  assert.deepEqual(got, [4800, 4800]);
  feed(new Float32Array(4800));
  assert.equal(got.length, 3);
});
