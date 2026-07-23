/** 本地自然日 YYYY-MM-DD */

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** UTC 自然日 YYYY-MM-DD（对齐 Polymarket 日榜） */
export function todayUtcKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function shiftDateKey(key: string, deltaDays: number) {
  const parts = String(key || todayKey()).split("-").map(Number);
  if (parts.length < 3)
    return todayKey();
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return todayKey(dt);
}

/** 以 UTC 日键偏移 N 天 */
export function shiftUtcDateKey(key: string, deltaDays: number) {
  const parts = String(key || todayUtcKey()).split("-").map(Number);
  if (parts.length < 3)
    return todayUtcKey();
  const [y, m, d] = parts;
  const ms = Date.UTC(y, m - 1, d) + deltaDays * 86400000;
  return todayUtcKey(new Date(ms));
}

/**
 * Polymarket 周奖励 epoch：周日 00:00 UTC 起。
 * 返回该周 [周日, 周六] 的 UTC 日键。
 */
export function utcWeekBounds(anchorKey = todayUtcKey()) {
  const parts = String(anchorKey).split("-").map(Number);
  const y = parts[0] || new Date().getUTCFullYear();
  const m = parts[1] || new Date().getUTCMonth() + 1;
  const d = parts[2] || new Date().getUTCDate();
  const anchorMs = Date.UTC(y, m - 1, d);
  const dow = new Date(anchorMs).getUTCDay();
  const startMs = anchorMs - dow * 86400000;
  const endInclusiveMs = startMs + 6 * 86400000;
  return {
    startKey: todayUtcKey(new Date(startMs)),
    endKey: todayUtcKey(new Date(endInclusiveMs)),
  };
}
