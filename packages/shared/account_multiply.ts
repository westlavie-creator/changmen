/** 全平台乘网默认值（PB 等乘网场馆） */
export const DEFAULT_MULTIPLY = 1;

/** @deprecated 使用 DEFAULT_MULTIPLY */
export const PB_MULTIPLY_DEFAULT = DEFAULT_MULTIPLY;

export function isPolymarketProvider(provider: unknown): boolean {
  return String(provider ?? "").trim().toLowerCase() === "polymarket";
}

export function isMultiplyProvider(provider: unknown): boolean {
  const p = String(provider ?? "")
    .trim()
    .toUpperCase();
  return p === "PB";
}

/** @deprecated 使用 isMultiplyProvider */
export function isPbProvider(provider: unknown): boolean {
  return isMultiplyProvider(provider);
}

export function accountMultiplyScale(multiply: unknown): number {
  return Math.max(1, Number(multiply) || 1);
}

/** PB 乘网换算后提交场馆的最小 stake（对齐 A8 PZe.checkBet） */
export const PB_MIN_VENUE_STAKE = 7;

/** Polymarket 乘网换算后提交 CLOB 的最小 USDC */
export const POLYMARKET_MIN_VENUE_STAKE = 1;

/** 展示口径 betMoney → 场馆 API 实际金额（对齐 A8 PB PZe.checkBet） */
export function venueStakeFromBetMoney(
  betMoney: number,
  multiply: unknown,
  minStake = PB_MIN_VENUE_STAKE,
): number {
  return Math.max(minStake, Math.floor(Number(betMoney) / accountMultiplyScale(multiply)));
}

export function scaleVenueMoney(raw: number, multiply: unknown): number {
  return raw * accountMultiplyScale(multiply);
}

/**
 * 解析账号乘网：缺失或无效 → 1；有效值 ≥1 原样保留。
 */
export function resolveAccountMultiply(provider: unknown, rawMultiply: unknown): number {
  if (isPolymarketProvider(provider))
    return DEFAULT_MULTIPLY;
  const n = Number(rawMultiply);
  if (Number.isFinite(n) && n >= 1)
    return n;
  return DEFAULT_MULTIPLY;
}

export function accountProviderKey(row: unknown): string {
  if (!row || typeof row !== "object")
    return "";
  const r = row as Record<string, unknown>;
  return (r.provider ?? r.Provider ?? r.platform ?? r.Platform ?? "") as string;
}

/** 单条账号行：仅在乘网平台缺省/legacy 或非乘网平台无效值时写入 multiply */
export function normalizeAccountMultiplyField<T>(row: T): T {
  if (!row || typeof row !== "object")
    return row;
  const r = row as Record<string, unknown>;
  const provider = accountProviderKey(row);
  const raw = r.multiply ?? r.Multiply;
  const hasStored = raw !== undefined && raw !== null && raw !== "";
  const next = resolveAccountMultiply(provider, raw);
  const prev = hasStored ? Number(raw) : undefined;

  if (isPolymarketProvider(provider)) {
    if (!hasStored || prev !== DEFAULT_MULTIPLY) {
      if (r.multiply === DEFAULT_MULTIPLY && !r.Multiply)
        return row;
      return { ...r, multiply: DEFAULT_MULTIPLY } as T;
    }
    return row;
  }

  if (isMultiplyProvider(provider)) {
    if (!hasStored || !Number.isFinite(prev) || (prev as number) < 1) {
      if (r.multiply === next && !r.Multiply)
        return row;
      return { ...r, multiply: next } as T;
    }
    return row;
  }

  if (!hasStored)
    return row;
  if (Number.isFinite(prev) && prev === next && r.multiply === next)
    return row;
  return { ...r, multiply: next } as T;
}

export function normalizeAccountList(accounts: unknown): unknown[] {
  if (!Array.isArray(accounts))
    return [];
  return accounts.map(row => normalizeAccountMultiplyField(row));
}

/** 保存账号时保留已存乘网，禁止客户端/API 篡改（对齐 A8 multiply 字段 readonly） */
export function preserveStoredAccountMultiply<T>(
  incoming: T,
  existing: Record<string, unknown> | null | undefined,
): T {
  if (!incoming || typeof incoming !== "object")
    return incoming;
  if (!existing || typeof existing !== "object")
    return incoming;
  const raw = existing.multiply ?? existing.Multiply;
  if (raw === undefined || raw === null || raw === "")
    return incoming;
  const n = Number(raw);
  if (!Number.isFinite(n))
    return incoming;
  const row = incoming as Record<string, unknown>;
  if (row.multiply === n)
    return incoming;
  return { ...row, multiply: n } as T;
}

/** 乘网归一化后是否需要回写 profiles.accounts */
export function accountsMultiplyNeedsPersist(
  before: unknown[],
  after: unknown[],
): boolean {
  if (!Array.isArray(before) || !Array.isArray(after))
    return false;
  if (before.length !== after.length)
    return true;
  for (let i = 0; i < before.length; i++) {
    const bRow = before[i] as Record<string, unknown> | null | undefined;
    const aRow = after[i] as Record<string, unknown> | null | undefined;
    const b = Number(bRow?.multiply ?? bRow?.Multiply);
    const a = Number(aRow?.multiply);
    if (!Number.isFinite(b) && !Number.isFinite(a))
      continue;
    if (b !== a)
      return true;
  }
  return false;
}
