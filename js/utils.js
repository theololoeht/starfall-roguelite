// ===== 数学 / 随机工具 =====
const TAU = Math.PI * 2;

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
// 点到线段的最短距离（激光贯穿判定）
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = clamp(t, 0, 1);
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}
// a-b 的有符号角差，范围 [-PI, PI]
function angDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function weightedPick(entries, weightOf = x => x.weight ?? 1) {
  if (!entries.length) return null;
  const total = entries.reduce((sum, item) => sum + Math.max(0, weightOf(item)), 0);
  if (total <= 0) return entries[0];
  let cursor = Math.random() * total;
  for (const item of entries) {
    cursor -= Math.max(0, weightOf(item));
    if (cursor <= 0) return item;
  }
  return entries[entries.length - 1];
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
// '#rrggbb' + alpha → 'rgba(...)'
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
