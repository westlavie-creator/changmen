/** 对齐 A8 bundle `pt` 常用格式化 */

export function formatDate(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
}

export function formatDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatSecond(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function toFixed(n: number, digits = 3, mode: "round" | "floor" = "round"): string {
  const f = 10 ** digits;
  const v = mode === "floor" ? Math.floor(n * f) / f : Math.round(n * f) / f;
  return v.toFixed(digits);
}

export function percent(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "N/A";
  return `${(n * 100).toFixed(digits)}%`;
}

export function arbPercent(homeOdds: number, awayOdds: number): string {
  if (!homeOdds || !awayOdds) return "N/A";
  return percent(1 / (1 / homeOdds + 1 / awayOdds));
}
