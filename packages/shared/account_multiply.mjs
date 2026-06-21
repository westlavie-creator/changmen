/** PB 平台乘网默认倍数（账号级配置，非 A8 bundle 硬编码） */
export const PB_MULTIPLY_DEFAULT = 10;

/** 非 PB 平台默认乘网 */
export const DEFAULT_MULTIPLY = 1;

export function isPbProvider(provider) {
  const p = String(provider ?? "")
    .trim()
    .toUpperCase();
  return p === "PB";
}

/**
 * 解析账号乘网：PB 缺失 / 无效 / 旧默认 1 → 10；其它平台无效 → 1。
 * 已显式设置且 >1 的值（含 PB 自定义倍数）原样保留。
 */
export function resolveAccountMultiply(provider, rawMultiply) {
  if (isPbProvider(provider)) {
    const n = Number(rawMultiply);
    if (!Number.isFinite(n) || n <= 1)
      return PB_MULTIPLY_DEFAULT;
    return n;
  }
  const n = Number(rawMultiply);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MULTIPLY;
}

export function accountProviderKey(row) {
  if (!row || typeof row !== "object")
    return "";
  return row.provider ?? row.Provider ?? row.platform ?? row.Platform ?? "";
}

/** 单条账号行：仅在 PB 缺省/legacy 或非 PB 无效值时写入 multiply */
export function normalizeAccountMultiplyField(row) {
  if (!row || typeof row !== "object")
    return row;
  const provider = accountProviderKey(row);
  const raw = row.multiply ?? row.Multiply;
  const hasStored = raw !== undefined && raw !== null && raw !== "";
  const next = resolveAccountMultiply(provider, raw);
  const prev = hasStored ? Number(raw) : undefined;

  if (isPbProvider(provider)) {
    if (!hasStored || !Number.isFinite(prev) || prev <= 1) {
      if (row.multiply === next && !row.Multiply)
        return row;
      return { ...row, multiply: next };
    }
    return row;
  }

  if (!hasStored)
    return row;
  if (Number.isFinite(prev) && prev === next && row.multiply === next)
    return row;
  return { ...row, multiply: next };
}

export function normalizeAccountList(accounts) {
  if (!Array.isArray(accounts))
    return [];
  return accounts.map(row => normalizeAccountMultiplyField(row));
}

/** 乘网归一化后是否需要回写 profiles.accounts */
export function accountsMultiplyNeedsPersist(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after))
    return false;
  if (before.length !== after.length)
    return true;
  for (let i = 0; i < before.length; i++) {
    const b = Number(before[i]?.multiply ?? before[i]?.Multiply);
    const a = Number(after[i]?.multiply);
    if (!Number.isFinite(b) && !Number.isFinite(a))
      continue;
    if (b !== a)
      return true;
  }
  return false;
}
