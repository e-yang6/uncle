// Plain text helpers (no three.js, so they run under node --test).

// Greedy word wrap. measure(text) returns a width in the same unit as maxWidth.
export function wrapLines(text, maxWidth, measure, maxLines = 3) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(lines.length - maxLines); // keep the end: the newest words matter most
    kept[0] = `…${kept[0]}`;
    return kept;
  }
  return lines;
}
