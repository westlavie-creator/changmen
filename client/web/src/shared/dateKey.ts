/** 本地自然日 YYYY-MM-DD */

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftDateKey(key: string, deltaDays: number) {
  const parts = String(key || todayKey()).split("-").map(Number);
  if (parts.length < 3) return todayKey();
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return todayKey(dt);
}
