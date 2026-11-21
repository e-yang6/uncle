// Where reply messages come from. Both sources hand CONTRACTS.md "Voice pipeline"
// messages to onMessage, so the page doesn't care which one is in use.

// Stand-in until the /voice socket exists: replays a saved greeting.
export async function sampleVoice(url, onMessage) {
  onMessage({ type: "status", state: "thinking" });
  let replies;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    replies = await res.json();
  } catch (err) {
    onMessage({ type: "error", feature: "voice", message: `Sample greeting didn't load (${err.message})` });
    return;
  }
  onMessage({ type: "status", state: "speaking" });
  for (const msg of replies) onMessage(msg);
}

// The real pipeline: wss://<host>/voice, one socket per session.
export function liveVoice(wsUrl, start, onMessage) {
  const ws = new WebSocket(wsUrl);
  let closedByUs = false;
  let failed = false;
  const fail = (message) => {
    if (closedByUs || failed) return;
    failed = true;
    onMessage({ type: "error", feature: "voice", message });
  };
  ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "start", ...start })));
  ws.addEventListener("message", (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return; // ignore anything that isn't a contract message
    }
    onMessage(msg);
  });
  ws.addEventListener("error", () => fail("Couldn't reach the voice server"));
  ws.addEventListener("close", () => fail("The voice server disconnected"));
  return {
    send: (msg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg)),
    close: () => {
      closedByUs = true;
      ws.close();
    },
  };
}
