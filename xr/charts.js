// Drawing the server's chart messages (CONTRACTS.md: {kind: line|bar|range, title, labels,
// datasets}) onto a 2D canvas, for the floating panels beside the mirror.
// Values come only from the message; this file only formats and places them.
// No three.js import here, so the layout maths runs under node --test.

export const COLORS = { ink: "#15130f", paper: "#f3eee4", dusk: "#8a8378", amber: "#c8893a" };
const FONT = '"IBM Plex Sans", system-ui, sans-serif';

// A round axis top at or above max: 1, 2, 2.5 or 5 times a power of ten.
export function niceMax(max) {
  if (!(max > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= max) return m * p;
  return 10 * p;
}

// Money is anything 1000 or more ("$412k", "$1.2M"); smaller values are years or counts.
export function formatValue(v) {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}$${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}$${trim(a / 1e3, a < 1e4 ? 1 : 0)}k`;
  return `${sign}${Math.round(a)}`;
}
const trim = (x, digits = 1) => String(+x.toFixed(digits));

// Is the message something we can draw?
export function validChart(c) {
  if (!c || !["line", "bar", "range"].includes(c.kind)) return false;
  if (!Array.isArray(c.labels) || !Array.isArray(c.datasets) || !c.datasets.length) return false;
  return c.datasets.every((d) => Array.isArray(d?.data) && d.data.length === c.labels.length && d.data.every((v) => Number.isFinite(Number(v))));
}

// Map a value to a pixel between lo and hi for an axis 0..top.
export const scale = (v, top, lo, hi) => lo + (hi - lo) * (top > 0 ? v / top : 0);

// Draw the chart filling a W x H canvas. Returns false if the message can't be drawn.
export function drawChart(ctx, chart, W, H) {
  ctx.clearRect(0, 0, W, H);
  if (!validChart(chart)) return false;
  const u = H / 100; // layout unit
  ctx.fillStyle = COLORS.ink;
  ctx.globalAlpha = 0.88;
  roundRect(ctx, 0, 0, W, H, 3 * u);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLORS.paper;
  ctx.font = `600 ${7 * u}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(String(chart.title || ""), 6 * u, 10 * u, W - 12 * u);
  const box = { x0: 6 * u, x1: W - 6 * u, y0: 22 * u, y1: H - 14 * u, u };
  ({ line: drawLine, bar: drawBar, range: drawRange })[chart.kind](ctx, chart, box);
  return true;
}

function drawLine(ctx, chart, b) {
  const { u } = b;
  const data = chart.datasets[0].data.map(Number);
  const top = niceMax(Math.max(...data));
  const x0 = b.x0 + 14 * u;
  const n = data.length;
  const X = (i) => (n > 1 ? x0 + ((b.x1 - x0) * i) / (n - 1) : (x0 + b.x1) / 2);
  const Y = (v) => scale(v, top, b.y1, b.y0);
  // axis labels: top, zero, first and last x label
  ctx.font = `400 ${4.5 * u}px ${FONT}`;
  ctx.fillStyle = COLORS.dusk;
  ctx.textAlign = "right";
  ctx.fillText(formatValue(top), x0 - 2 * u, Y(top));
  ctx.fillText("0", x0 - 2 * u, Y(0));
  ctx.strokeStyle = COLORS.dusk;
  ctx.lineWidth = Math.max(1, 0.4 * u);
  ctx.beginPath();
  ctx.moveTo(x0, Y(0));
  ctx.lineTo(b.x1, Y(0));
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillText(`Age ${chart.labels[0]}`, x0, b.y1 + 6 * u);
  ctx.textAlign = "right";
  ctx.fillText(`Age ${chart.labels[n - 1]}`, b.x1, b.y1 + 6 * u);
  // the line, in the one accent
  ctx.strokeStyle = COLORS.amber;
  ctx.lineWidth = 1.2 * u;
  ctx.lineJoin = "round";
  ctx.beginPath();
  data.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
  ctx.stroke();
  // highest point labelled
  const peak = data.indexOf(Math.max(...data));
  ctx.fillStyle = COLORS.paper;
  ctx.font = `600 ${5 * u}px ${FONT}`;
  ctx.textAlign = peak > n * 0.7 ? "right" : "center";
  ctx.fillText(formatValue(data[peak]), X(peak), Y(data[peak]) - 4 * u);
}

function drawBar(ctx, chart, b) {
  const { u } = b;
  const groups = chart.labels.length;
  const sets = chart.datasets.length;
  const gw = (b.x1 - b.x0) / groups;
  const legendH = 7 * u;
  const y1 = b.y1 - legendH;
  chart.labels.forEach((label, g) => {
    // each group gets its own scale: savings and yearly income differ by 20x
    const vals = chart.datasets.map((d) => Number(d.data[g]));
    const top = niceMax(Math.max(...vals));
    const bw = (gw * 0.7) / sets;
    vals.forEach((v, s) => {
      const x = b.x0 + g * gw + gw * 0.15 + s * bw;
      const y = scale(v, top, y1, b.y0 + 6 * u);
      ctx.fillStyle = s === sets - 1 ? COLORS.amber : COLORS.dusk;
      ctx.fillRect(x + bw * 0.08, y, bw * 0.84, y1 - y);
      ctx.fillStyle = COLORS.paper;
      ctx.font = `600 ${4.5 * u}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(formatValue(v), x + bw / 2, y - 3 * u);
    });
    ctx.fillStyle = COLORS.dusk;
    ctx.font = `400 ${4.5 * u}px ${FONT}`;
    ctx.fillText(String(label), b.x0 + g * gw + gw / 2, y1 + 5 * u, gw * 0.95);
  });
  legend(ctx, chart.datasets.map((d, s) => [d.label, s === sets - 1 ? COLORS.amber : COLORS.dusk]), b.x0, b.y1 + 4 * u, u);
}

function drawRange(ctx, chart, b) {
  const { u } = b;
  // datasets are low, median, high (server/charts.js); rows are the labels
  const [lo, mid, hi] = [0, 1, 2].map((i) => chart.datasets[Math.min(i, chart.datasets.length - 1)].data.map(Number));
  const all = [...lo, ...hi];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = Math.max(1, (max - min) * 0.15);
  const a = Math.floor(min - pad);
  const z = Math.ceil(max + pad);
  const xs = b.x0 + 30 * u;
  const X = (v) => xs + ((b.x1 - xs) * (v - a)) / (z - a || 1);
  const rows = chart.labels.length;
  const rh = (b.y1 - b.y0) / rows;
  chart.labels.forEach((label, r) => {
    const y = b.y0 + rh * (r + 0.5);
    ctx.fillStyle = COLORS.paper;
    ctx.font = `400 ${4.8 * u}px ${FONT}`;
    ctx.textAlign = "left";
    ctx.fillText(String(label), b.x0, y, 28 * u);
    ctx.fillStyle = COLORS.dusk;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(X(lo[r]), y - 3 * u, X(hi[r]) - X(lo[r]), 6 * u);
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.amber;
    ctx.fillRect(X(mid[r]) - 0.6 * u, y - 4.5 * u, 1.2 * u, 9 * u);
    ctx.font = `400 ${4 * u}px ${FONT}`;
    ctx.fillStyle = COLORS.dusk;
    ctx.textAlign = "center";
    ctx.fillText(formatValue(lo[r]), X(lo[r]), y + 7.5 * u);
    ctx.fillText(formatValue(hi[r]), X(hi[r]), y + 7.5 * u);
    ctx.fillStyle = COLORS.paper;
    ctx.font = `600 ${4.8 * u}px ${FONT}`;
    ctx.fillText(formatValue(mid[r]), X(mid[r]), y - 8 * u);
  });
  ctx.fillStyle = COLORS.dusk;
  ctx.font = `400 ${4 * u}px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("Bar: 10th to 90th percentile. Mark: median. Population estimate.", b.x0, b.y1 + 7 * u, b.x1 - b.x0);
}

function legend(ctx, items, x, y, u) {
  ctx.font = `400 ${4.2 * u}px ${FONT}`;
  ctx.textAlign = "left";
  for (const [label, color] of items) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 1.5 * u, 3 * u, 3 * u);
    ctx.fillStyle = COLORS.dusk;
    ctx.fillText(String(label), x + 4.5 * u, y);
    x += 4.5 * u + ctx.measureText(String(label)).width + 6 * u;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
