// Asks typed questions over the real /voice socket (live site or local) and prints, per question:
// whether a filler played, the chart kind and when it arrived, the answer text, and timings.
// No keys needed. Uses a saved interview profile when --name matches one on that server.
//   node server/ask-live.mjs                                   (uncle.health, built-in questions)
//   node server/ask-live.mjs --url ws://127.0.0.1:3000/voice --name Isaac "how much for a million at 70?"
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args.splice(i, 2)[1] : d;
};
const url = opt("--url", "wss://uncle.health/voice");
const name = opt("--name", "");
const QUESTIONS = args.length ? args : [
  "How much do I need to invest to have one million dollars when I'm 70?",
  "How will my investment grow right now?",
  "What about if I invest double?",
  "And what about at 65?",
  "When will I have a hundred thousand dollars?",
  "How much TFSA room do I have this year?",
  "Will my money last?",
  "What's a TFSA?",
];

const ws = new WebSocket(url);
const queue = [];
let waiter = null;
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  m.at = performance.now();
  if (waiter && waiter.until(m)) {
    const w = waiter;
    waiter = null;
    w.resolve([...queue, m]);
    queue.length = 0;
  } else queue.push(m);
};
const next = (until, ms = 20000) => new Promise((resolve, reject) => {
  waiter = { until, resolve };
  setTimeout(() => reject(new Error("timed out")), ms).unref?.();
});
await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = () => j(new Error(`can't connect to ${url}`)))));

ws.send(JSON.stringify({ type: "start", name, sex: "male", apparent_age: 70 }));
await next((m) => m.type === "reply" && m.done); // the greeting
console.log(`connected to ${url}${name ? ` as ${name}` : " (no name: the sample facts sheet, money tools give no numbers)"}\n`);

for (const q of QUESTIONS) {
  queue.length = 0;
  const t0 = performance.now();
  ws.send(JSON.stringify({ type: "text", question: q }));
  let msgs;
  try {
    msgs = await next((m) => m.type === "reply" && m.done);
  } catch {
    console.log(`?  ${q}\n   no answer in 20 s\n`);
    continue;
  }
  const ms = (m) => (m ? `${Math.round(m.at - t0)} ms` : "none");
  const filler = msgs.find((m) => m.type === "reply" && m.filler);
  const chart = msgs.find((m) => m.type === "chart");
  const answer = msgs.filter((m) => m.type === "reply" && !m.filler && m.sentence).map((m) => m.sentence).join(" ");
  const firstAnswer = msgs.find((m) => m.type === "reply" && !m.filler && m.sentence);
  const source = msgs.find((m) => m.timing)?.timing?.source ?? "";
  console.log(`Q  ${q}`);
  console.log(`   filler ${filler ? `"${filler.sentence}" at ${ms(filler)}` : "none"} | chart ${chart ? `${chart.chart.kind}${chart.chart.target ? " +goal" : ""} at ${ms(chart)}` : "none"} | first words ${ms(firstAnswer)} | ${source}`);
  console.log(`   "${answer}"\n`);
}
ws.close();
