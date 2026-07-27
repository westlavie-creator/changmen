/**
 * 账号列表：合并本机钥 / 落库 DTO 投影
 */

import type { PlatformAccount } from "@/models/platformAccount";
import {
  extractPrivateKeyFromToken,
  isPolymarketProvider,
  mergePrivateKeyIntoToken,
  toPolymarketPersistToken,
} from "./tokenStrip";
import {
  getCachedPrivateKey,
  isPmVaultUnlocked,
  putPrivateKeyInVault,
} from "./session";

export function mergeVaultKeysIntoAccounts(
  accounts: PlatformAccount[],
  userId: string,
): { merged: number; pendingMigrate: number } {
  let merged = 0;
  let pendingMigrate = 0;
  if (!isPmVaultUnlocked(userId)) {
    for (const acc of accounts) {
      if (isPolymarketProvider(acc.provider) && extractPrivateKeyFromToken(acc.token))
        pendingMigrate += 1;
    }
    return { merged: 0, pendingMigrate };
  }
  for (const acc of accounts) {
    if (!isPolymarketProvider(acc.provider) || !acc.accountId)
      continue;
    const fromVault = getCachedPrivateKey(acc.accountId);
    const fromToken = extractPrivateKeyFromToken(acc.token);
    if (fromVault) {
      acc.token = mergePrivateKeyIntoToken(acc.token, fromVault);
      merged += 1;
    }
    else if (fromToken) {
      pendingMigrate += 1;
    }
  }
  return { merged, pendingMigrate };
}

/** 将 token 内遗留明文私钥迁入 vault（需已解锁） */
export async function migrateTokenPrivateKeysToVault(
  accounts: PlatformAccount[],
  userId: string,
): Promise<number> {
  if (!isPmVaultUnlocked(userId))
    return 0;
  let n = 0;
  for (const acc of accounts) {
    if (!isPolymarketProvider(acc.provider) || !acc.accountId)
      continue;
    const fromToken = extractPrivateKeyFromToken(acc.token);
    if (!fromToken)
      continue;
    if (!getCachedPrivateKey(acc.accountId)) {
      await putPrivateKeyInVault(userId, acc.accountId, fromToken);
      n += 1;
    }
    acc.token = mergePrivateKeyIntoToken(toPolymarketPersistToken(acc.token), fromToken);
  }
  return n;
}

/** 写回服务端前：投影为落库 DTO（不含私钥） */
export function stripPrivateKeysForPersist(accounts: Array<{ provider?: unknown; Provider?: unknown; token?: unknown; Token?: unknown }>): void {
  for (const row of accounts) {
    if (!isPolymarketProvider(row.provider ?? row.Provider))
      continue;
    if (typeof row.token === "string")
      row.token = toPolymarketPersistToken(row.token);
    if (typeof row.Token === "string")
      row.Token = toPolymarketPersistToken(row.Token);
  }
}
