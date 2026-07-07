/** 刷新循环写入 RDS 时可忽略的 volatile 字段（余额已由 Client_UpdateBalance 落库） */
const VOLATILE_ACCOUNT_KEYS = new Set([
  "balance",
  "Balance",
  "totalBalance",
  "TotalBalance",
  "updateTime",
  "UpdateTime",
  "unsettle",
  "winBalance",
  "totalProfit",
  "today",
  "todayOrder",
  "orderCount",
  "loadingBalance",
  "active",
  "currency",
  "Currency",
]);

function accountIdOf(row: Record<string, unknown>): number {
  return Number(row.accountId ?? row.AccountId) || 0;
}

function accountPersistSlice(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== "object")
    return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    if (!VOLATILE_ACCOUNT_KEYS.has(key))
      out[key] = value;
  }
  return out;
}

function stablePersistJson(rows: Record<string, unknown>[]): string {
  const sorted = [...rows].sort((a, b) => accountIdOf(a) - accountIdOf(b));
  return JSON.stringify(sorted);
}

/** players.account_data 持久化：仅比较非 volatile 字段 */
export function accountsPersistUnchanged(before: unknown[], after: unknown[]): boolean {
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length)
    return false;
  const prev = before.map(accountPersistSlice);
  const next = after.map(accountPersistSlice);
  return stablePersistJson(prev) === stablePersistJson(next);
}
