/**
 * 订单日键（本地日历日 YYYY-MM-DD）。
 * 由 order_store.js re-export。
 */
export function toDateKey(ts) {
  const d = new Date(Number(ts) || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
