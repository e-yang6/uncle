// Drawing the server's chart messages onto a 2D canvas, for the floating panels beside the
// mirror. CONTRACTS.md: { kind, title, labels, datasets: [{ label, data }] }.
// Style (xr/chart-styles.html): one big headline number, a calm curve or bar with almost no
// axes, only two or three labelled points; inspired by ProjectionLab's phone app, redrawn in
// DESIGN-RULES colours (Ink, Paper, Dusk, one Evening amber accent) and IBM Plex Sans.
// Values come only from the message; this file only formats and places them.
// No three.js import here, so the layout maths runs under node --test.

export const COLORS = { ink: "#15130f", paper: "#f3eee4", dusk: "#8a8378", amber: "#c8893a" };
const FONT = '"IBM Plex Sans", system-ui, sans-serif';

// Kinds in CONTRACTS.md today, then the ones proposed on the board (drawn if the server sends them).
export const KINDS = ["line", "bar", "range", "snapshot", "chance", "milestones", "timeline"];

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
// Money that can be small (a balance of $500): always with a dollar sign.
export const formatMoney = (v) => (Math.abs(v) >= 1e3 ? formatValue(v) : `$${Math.round(v)}`);
export const formatSigned = (v) => (v > 0 ? `+${formatMoney(v)}` : formatMoney(v));
export const formatPercent = (p) => `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`;

// Is the message something we can draw?
export function validChart(c) {
  if (!c || !KINDS.includes(c.kind)) return false;
  if (!Array.isArray(c.labels) || !Array.isArray(c.datasets) || !c.datasets.length) return false;
  const ok = c.datasets.every((d) => Array.isArray(d?.data) && d.data.length === c.labels.length && d.data.every((v) => Number.isFinite(Number(v))));
  if (!ok) return false;
  if (c.kind === "chance") return c.datasets[0].data.every((v) => v >= 0 && v <= 1);
  if (c.kind === "milestones" || c.kind === "timeline") return Number.isFinite(Number(c.now));
  return true;
}

// Map a value to a pixel between lo and hi for an axis 0..top.
export const scale = (v, top, lo, hi) => lo + (hi - lo) * (top > 0 ? v / top : 0);

// Monotone cubic (Fritsch-Carlson) through points: a smooth curve that never overshoots, so a
// savings line never dips below zero or bulges past a real value between the points.
// Returns [{x, y, c1x, c1y, c2x, c2y}] segments ending at each point after the first.
export function monotoneSegments(pts) {
  const n = pts.length;
  if (n < 2) return [];
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    m.push(dx[i] ? (pts[i + 1].y - pts[i].y) / dx[i] : 0);
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const s = 3 / Math.sqrt(h);
      t[i] = s * a * m[i];
      t[i + 1] = s * b * m[i];
    }
  }
  return pts.slice(1).map((p, i) => ({
    x: p.x, y: p.y,
    c1x: pts[i].x + dx[i] / 3, c1y: pts[i].y + (t[i] * dx[i]) / 3,
    c2x: p.x - dx[i] / 3, c2y: p.y - (t[i + 1] * dx[i]) / 3,
  }));
}

// The points of a line chart worth labelling: the highest point and the last one.
export function lineMarkers(data) {
  const peak = data.indexOf(Math.max(...data));
  const last = data.length - 1;
  return peak === last ? [last] : [peak, last];
}

// Phase of each year on the life timeline: "past" (before now), "work", "retired".
export function phaseOf(age, now, retire) {
  if (age < now) return "past";
  return age < retire ? "work" : "retired";
}

// Draw the chart filling a W x H canvas. Returns false if the message can't be drawn.
export function drawChart(ctx, chart, W, H) {
  ctx.clearRect(0, 0, W, H);
  if (!validChart(chart)) return false;
  const u = H / 100; // layout unit
  ctx.fillStyle = COLORS.ink;
  ctx.globalAlpha = 0.92;
  roundRect(ctx, 0, 0, W, H, 1.2 * u); // DESIGN-RULES: small corners
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.textBaseline = "alphabetic";
  const box = { x0: 7 * u, x1: W - 7 * u, y0: 7 * u, y1: H - 7 * u, u, W, H };
  DRAW[chart.kind](ctx, chart, box);
  return true;
}

// Small spaced caps label, then the big number under it.
function headline(ctx, b, label, value, note) {
  const { u } = b;
  text(ctx, String(label).toUpperCase(), b.x0, b.y0 + 4 * u, { size: 4 * u, color: COLORS.dusk, spacing: 0.12 });
  text(ctx, value, b.x0, b.y0 + 19 * u, { size: 14 * u, weight: 600, color: COLORS.paper });
  if (note) text(ctx, note, b.x0, b.y0 + 26.5 * u, { size: 4.4 * u, color: COLORS.dusk, max: b.x1 - b.x0 });
}

const DRAW = {
  // Savings over a lifetime: smooth curve, soft fill, the peak and the end labelled.
  // Two datasets (before / after a slider) draw the first as a quiet Dusk line.
  line(ctx, chart, b) {
    const { u } = b;
    const sets = chart.datasets.map((d) => d.data.map(Number));
    const main = sets[sets.length - 1];
    const n = main.length;
    const marks = lineMarkers(main);
    const peak = marks[0];
    headline(ctx, b, chart.title || "", formatValue(main[peak]), `at age ${chart.labels[peak]}`);
    const top = niceMax(Math.max(...sets.flat())) ;
    const x0 = b.x0;
    const x1 = b.x1 - 2 * u;
    const y0 = b.y0 + 40 * u;
    const y1 = b.y1 - 8 * u;
    const X = (i) => (n > 1 ? x0 + ((x1 - x0) * i) / (n - 1) : (x0 + x1) / 2);
    const Y = (v) => scale(v, top, y1, y0);
    const pts = (d) => d.map((v, i) => ({ x: X(i), y: Y(v) }));
    if (sets.length > 1) curve(ctx, pts(sets[0]), { color: COLORS.dusk, width: 0.7 * u, dash: [1.6 * u, 1.4 * u] });
    const mp = pts(main);
    // soft fill under the main curve
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "rgba(200,137,58,0.30)");
    g.addColorStop(1, "rgba(200,137,58,0)");
    ctx.beginPath();
    ctx.moveTo(mp[0].x, y1);
    ctx.lineTo(mp[0].x, mp[0].y);
    for (const s of monotoneSegments(mp)) ctx.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.x, s.y);
    ctx.lineTo(mp[n - 1].x, y1);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    curve(ctx, mp, { color: COLORS.amber, width: 1.1 * u });
    // the end: dashed marker and "left at 90"
    const last = n - 1;
    if (marks.includes(last) && last !== peak) {
      dashedV(ctx, X(last), Y(main[last]) - 2 * u, y1, u);
      dot(ctx, X(last), Y(main[last]), u);
      const right = X(last) > x1 - 20 * u;
      text(ctx, formatValue(main[last]), X(last) + (right ? -2.5 * u : 2.5 * u), Y(main[last]) - 7 * u, { size: 5.5 * u, weight: 600, color: COLORS.paper, align: right ? "right" : "left" });
      text(ctx, `left at ${chart.labels[last]}`, X(last) + (right ? -2.5 * u : 2.5 * u), Y(main[last]) - 2.5 * u, { size: 3.8 * u, color: COLORS.dusk, align: right ? "right" : "left" });
    }
    dot(ctx, X(peak), Y(main[peak]), u);
    // start and end ages only
    text(ctx, `Age ${chart.labels[0]}`, x0, b.y1, { size: 3.8 * u, color: COLORS.dusk });
    text(ctx, `Age ${chart.labels[last]}`, x1, b.y1, { size: 3.8 * u, color: COLORS.dusk, align: "right" });
    if (sets.length > 1) legend(ctx, chart.datasets.map((d, s) => [d.label, s === sets.length - 1 ? COLORS.amber : COLORS.dusk]), b.x1, b.y0 + 4 * u, u, "right");
  },

  // Before and after a change: the gain as the headline, one row of two bars per measure.
  bar(ctx, chart, b) {
    const { u } = b;
    const sets = chart.datasets.length;
    const first = chart.datasets[0].data.map(Number);
    const last = chart.datasets[sets - 1].data.map(Number);
    headline(ctx, b, chart.labels[0], formatSigned(last[0] - first[0]), chart.datasets[sets - 1].label);
    const rows = chart.labels.length;
    const y0 = b.y0 + 36 * u;
    const rh = (b.y1 - y0) / rows;
    chart.labels.forEach((label, r) => {
      const vals = chart.datasets.map((d) => Number(d.data[r]));
      const top = niceMax(Math.max(...vals)); // each row its own scale: savings and yearly income differ a lot
      const y = y0 + rh * r;
      text(ctx, String(label), b.x0, y + 4 * u, { size: 4.2 * u, color: COLORS.paper });
      vals.forEach((v, s) => {
        const by = y + 7 * u + s * 6.5 * u;
        const w = scale(v, top, 0, b.x1 - b.x0 - 22 * u);
        ctx.fillStyle = s === sets - 1 ? COLORS.amber : COLORS.dusk;
        roundRect(ctx, b.x0, by, Math.max(w, 1.2 * u), 4.2 * u, 0.6 * u);
        ctx.fill();
        text(ctx, formatValue(v), b.x0 + w + 2 * u, by + 3.6 * u, { size: 4 * u, weight: s === sets - 1 ? 600 : 400, color: s === sets - 1 ? COLORS.paper : COLORS.dusk });
      });
    });
    legend(ctx, chart.datasets.map((d, s) => [s === sets - 1 ? "With the change" : d.label, s === sets - 1 ? COLORS.amber : COLORS.dusk]), b.x1, b.y0 + 4 * u, u, "right");
  },

  // Ranges (low / median / high): the first row's median as the headline, each row a band.
  range(ctx, chart, b) {
    const { u } = b;
    const [lo, mid, hi] = [0, 1, 2].map((i) => chart.datasets[Math.min(i, chart.datasets.length - 1)].data.map(Number));
    // The headline is the range, never one age (PLAN.md ethics: no death age, population estimates).
    headline(ctx, b, chart.title || chart.labels[0], `${formatValue(lo[0])} to ${formatValue(hi[0])}`, "people with your habits, on average");
    const all = [...lo, ...hi];
    const pad = Math.max(1, (Math.max(...all) - Math.min(...all)) * 0.12);
    const a = Math.floor(Math.min(...all) - pad);
    const z = Math.ceil(Math.max(...all) + pad);
    const xs = b.x0 + 26 * u;
    const X = (v) => xs + ((b.x1 - xs) * (v - a)) / (z - a || 1);
    const y0 = b.y0 + 38 * u;
    const rh = (b.y1 - 9 * u - y0) / chart.labels.length;
    chart.labels.forEach((label, r) => {
      const y = y0 + rh * (r + 0.5);
      text(ctx, String(label), b.x0, y + 1.5 * u, { size: 4.2 * u, color: COLORS.paper, max: 24 * u });
      ctx.fillStyle = "rgba(138,131,120,0.35)";
      roundRect(ctx, X(lo[r]), y - 2.2 * u, X(hi[r]) - X(lo[r]), 4.4 * u, 2.2 * u);
      ctx.fill();
      dot(ctx, X(mid[r]), y, u, r === 0 ? COLORS.amber : COLORS.paper);
      text(ctx, formatValue(lo[r]), X(lo[r]), y + 8 * u, { size: 3.6 * u, color: COLORS.dusk, align: "center" });
      text(ctx, formatValue(hi[r]), X(hi[r]), y + 8 * u, { size: 3.6 * u, color: COLORS.dusk, align: "center" });
      text(ctx, formatValue(mid[r]), X(mid[r]), y - 4.5 * u, { size: 4.4 * u, weight: 600, color: COLORS.paper, align: "center" });
    });
    text(ctx, "Band: 10th to 90th percentile of simulated lives. Mark: the middle.", b.x0, b.y1, { size: 3.5 * u, color: COLORS.dusk, max: b.x1 - b.x0 });
  },

  // What you have today: the total, one stacked bar, a legend with shares.
  snapshot(ctx, chart, b) {
    const { u } = b;
    const vals = chart.datasets[0].data.map((v) => Math.max(0, Number(v)));
    const total = vals.reduce((s, v) => s + v, 0);
    headline(ctx, b, chart.title || "Saved today", formatMoney(total), null);
    const y = b.y0 + 34 * u;
    const order = vals.map((v, i) => i).sort((p, q) => vals[q] - vals[p]);
    const shade = [COLORS.amber, COLORS.paper, COLORS.dusk];
    const colorOf = (i) => shade[Math.min(order.indexOf(i), shade.length - 1)];
    const gap = 0.8 * u;
    const shown = vals.map((v, i) => i).filter((i) => vals[i] > 0);
    let x = b.x0;
    const span = b.x1 - b.x0 - gap * Math.max(0, shown.length - 1);
    if (!total) {
      ctx.fillStyle = "rgba(138,131,120,0.35)";
      roundRect(ctx, b.x0, y, b.x1 - b.x0, 3.6 * u, 1.8 * u);
      ctx.fill();
    }
    for (const i of shown) {
      const w = (span * vals[i]) / total;
      ctx.fillStyle = colorOf(i);
      roundRect(ctx, x, y, Math.max(w, 1.2 * u), 3.6 * u, 1.8 * u);
      ctx.fill();
      x += w + gap;
    }
    let lx = b.x0;
    chart.labels.forEach((label, i) => {
      const ly = y + 13 * u;
      dot(ctx, lx + 1.6 * u, ly - 1.4 * u, u * 0.75, colorOf(i), false);
      const name = String(label);
      text(ctx, name, lx + 4.4 * u, ly, { size: 4.2 * u, color: COLORS.paper });
      ctx.font = `400 ${4.2 * u}px ${FONT}`;
      const w1 = ctx.measureText(name).width;
      const share = total ? formatPercent(vals[i] / total) : "0%";
      text(ctx, share, lx + 4.4 * u + w1 + 1.8 * u, ly, { size: 4.2 * u, color: COLORS.dusk });
      ctx.font = `400 ${4.2 * u}px ${FONT}`;
      lx += 4.4 * u + w1 + 1.8 * u + ctx.measureText(share).width + 6 * u;
    });
    chart.labels.forEach((label, i) => {
      const ry = y + 24 * u + i * 8 * u;
      if (ry > b.y1) return;
      text(ctx, String(label), b.x0, ry, { size: 4.2 * u, color: COLORS.dusk });
      text(ctx, formatMoney(vals[i]), b.x1, ry, { size: 4.2 * u, weight: 600, color: COLORS.paper, align: "right" });
    });
  },

  // A chance (0..1): a ring and the percentage, plus what it's the chance of.
  chance(ctx, chart, b) {
    const { u } = b;
    const p = Number(chart.datasets[0].data[0]);
    const r = 17 * u;
    const cx = b.x0 + r + 2 * u;
    const cy = (b.y0 + b.y1) / 2 + 3 * u;
    ctx.lineCap = "round";
    ctx.lineWidth = 3 * u;
    ctx.strokeStyle = "rgba(138,131,120,0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS.amber;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.002, Math.min(1, p)));
    ctx.stroke();
    ctx.lineCap = "butt";
    text(ctx, formatPercent(p), cx, cy + 3 * u, { size: 9 * u, weight: 600, color: COLORS.paper, align: "center" });
    const tx = cx + r + 9 * u;
    text(ctx, String(chart.title || "").toUpperCase(), tx, b.y0 + 4 * u, { size: 4 * u, color: COLORS.dusk, spacing: 0.12 });
    text(ctx, String(chart.labels[0]), tx, cy - 2 * u, { size: 6 * u, weight: 600, color: COLORS.paper, max: b.x1 - tx });
    text(ctx, String(chart.datasets[0].label || ""), tx, cy + 6 * u, { size: 4.2 * u, color: COLORS.dusk, max: b.x1 - tx });
  },

  // Milestones: a row each with a progress ring, the age, and "in N years".
  milestones(ctx, chart, b) {
    const { u } = b;
    const now = Number(chart.now);
    const ages = chart.datasets[0].data.map(Number);
    const head = `TODAY · AGE ${now}`;
    text(ctx, head, b.x0, b.y0 + 4 * u, { size: 4 * u, color: COLORS.dusk, spacing: 0.12 });
    ctx.font = `400 ${4 * u}px ${FONT}`;
    const hw = ctx.measureText(head).width + head.length * 0.48 * u + 4 * u; // text plus letter spacing
    ctx.fillStyle = "rgba(138,131,120,0.5)";
    ctx.fillRect(b.x0 + hw, b.y0 + 2.6 * u, Math.max(0, b.x1 - b.x0 - hw), Math.max(1, 0.25 * u));
    const rows = chart.labels.length;
    const y0 = b.y0 + 12 * u;
    const rh = Math.min(22 * u, (b.y1 - y0) / rows);
    chart.labels.forEach((label, i) => {
      const cy = y0 + rh * (i + 0.5);
      const r = 6.5 * u;
      const cx = b.x0 + r + 0.6 * u;
      const frac = ages[i] > 0 ? Math.min(1, now / ages[i]) : 1;
      ctx.lineWidth = 1.3 * u;
      ctx.strokeStyle = "rgba(138,131,120,0.35)";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = i === 0 ? COLORS.amber : COLORS.paper;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.stroke();
      text(ctx, String(Math.round(ages[i])), cx, cy + 1.6 * u, { size: 4.4 * u, weight: 600, color: COLORS.paper, align: "center" });
      const tx = cx + r + 4.5 * u;
      text(ctx, String(label), tx, cy - 0.8 * u, { size: 5 * u, weight: 600, color: COLORS.paper, max: b.x1 - tx - 26 * u });
      text(ctx, `At ${Math.round(ages[i])}`, tx, cy + 5 * u, { size: 4 * u, color: COLORS.dusk });
      if (i > 0) return; // only the goal gets an "In N years" pill; no countdowns to anything else (DESIGN-RULES)
      const years = Math.round(ages[i] - now);
      const pill = years > 0 ? `In ${years} year${years === 1 ? "" : "s"}` : years === 0 ? "This year" : "Behind you";
      ctx.font = `600 ${4 * u}px ${FONT}`;
      const pw = ctx.measureText(pill).width + 5 * u;
      ctx.fillStyle = "rgba(138,131,120,0.22)";
      roundRect(ctx, b.x1 - pw, cy - 4 * u, pw, 7 * u, 0.8 * u);
      ctx.fill();
      text(ctx, pill, b.x1 - pw / 2, cy + 1.4 * u, { size: 4 * u, weight: 600, color: i === 0 ? COLORS.amber : COLORS.paper, align: "center" });
    });
  },

  // A whole life as a row of year ticks, shaded by phase, dots at the milestones.
  timeline(ctx, chart, b) {
    const { u } = b;
    const now = Number(chart.now);
    const ages = chart.datasets[0].data.map(Number);
    const retire = ages[0];
    const from = Math.max(0, Math.floor(now / 10) * 10 - 10);
    const to = Math.max(100, ...ages.map(Math.ceil));
    text(ctx, String(chart.title || "Your life").toUpperCase(), b.x0, b.y0 + 4 * u, { size: 4 * u, color: COLORS.dusk, spacing: 0.12 });
    text(ctx, `${Math.max(0, Math.round(retire - now))} working years, then retired`, b.x0, b.y0 + 15 * u, { size: 7 * u, weight: 600, color: COLORS.paper, max: b.x1 - b.x0 });
    const years = to - from + 1;
    const step = (b.x1 - b.x0) / years;
    const ty = b.y0 + 46 * u;
    const th = 9 * u;
    for (let a = from; a <= to; a++) {
      const ph = phaseOf(a, now, retire);
      ctx.fillStyle = ph === "past" ? "rgba(138,131,120,0.35)" : ph === "work" ? COLORS.paper : COLORS.amber;
      ctx.globalAlpha = ph === "work" ? 0.75 : 1;
      ctx.fillRect(b.x0 + (a - from) * step + step * 0.18, ty, Math.max(1, step * 0.64), th);
      ctx.globalAlpha = 1;
    }
    const X = (a) => b.x0 + (a - from + 0.5) * step;
    // today
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(X(now) - 0.35 * u, ty - 3 * u, 0.7 * u, th + 6 * u);
    text(ctx, "Today", X(now), ty + th + 9 * u, { size: 3.8 * u, color: COLORS.paper, align: "center" });
    chart.labels.forEach((label, i) => {
      const x = X(Math.min(to, Math.max(from, ages[i])));
      dot(ctx, x, ty - 5 * u, u * 0.8, i === 0 ? COLORS.amber : COLORS.paper, false);
      const above = i % 2 === 0;
      const ly = above ? ty - 10 * u : ty + th + 17 * u;
      text(ctx, `${label} ${Math.round(ages[i])}`, x, ly, { size: 3.8 * u, color: i === 0 ? COLORS.amber : COLORS.dusk, align: x > b.x1 - 15 * u ? "right" : x < b.x0 + 15 * u ? "left" : "center" });
    });
    text(ctx, String(from), b.x0, b.y1, { size: 3.6 * u, color: COLORS.dusk });
    text(ctx, String(to), b.x1, b.y1, { size: 3.6 * u, color: COLORS.dusk, align: "right" });
  },
};

// Drawing helpers --------------------------------------------------------------------------
function text(ctx, s, x, y, { size, weight = 400, color, align = "left", max, spacing = 0 }) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  if ("letterSpacing" in ctx) ctx.letterSpacing = spacing ? `${(spacing * size).toFixed(1)}px` : "0px";
  if (max) ctx.fillText(String(s), x, y, max);
  else ctx.fillText(String(s), x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

function curve(ctx, pts, { color, width, dash }) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const s of monotoneSegments(pts)) ctx.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.x, s.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash?.(dash || []);
  ctx.stroke();
  ctx.setLineDash?.([]);
  ctx.lineCap = "butt";
}

function dot(ctx, x, y, u, fill = COLORS.paper, ring = true) {
  ctx.beginPath();
  ctx.arc(x, y, (ring ? 1.9 : 1.6) * u, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (ring) {
    ctx.lineWidth = 0.8 * u;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();
  }
}

function dashedV(ctx, x, y0, y1, u) {
  ctx.strokeStyle = COLORS.dusk;
  ctx.lineWidth = 0.4 * u;
  ctx.setLineDash?.([1.4 * u, 1.2 * u]);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  ctx.setLineDash?.([]);
}

function legend(ctx, items, x, y, u, align = "left") {
  ctx.font = `400 ${3.8 * u}px ${FONT}`;
  const widths = items.map(([label]) => ctx.measureText(String(label)).width + 4.5 * u);
  let cx = align === "right" ? x - widths.reduce((s, w) => s + w + 4 * u, -4 * u) : x;
  items.forEach(([label, color], i) => {
    dot(ctx, cx + 1.2 * u, y - 1.2 * u, u * 0.6, color, false);
    text(ctx, String(label), cx + 3.6 * u, y, { size: 3.8 * u, color: COLORS.dusk });
    cx += widths[i] + 4 * u;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
