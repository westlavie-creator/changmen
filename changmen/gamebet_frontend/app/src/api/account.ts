import { post, unwrap } from "@/api/client";
import type { AccountRecord, CreateTagPlatformResult, UpdateBalanceResult } from "@/types/account";
import type { MoneyLogRow, PageResult, TagPlatformRow } from "@/types/esport";

export async function updateBalance(playerId: number, balance: number) {
  return unwrap(
    await post<UpdateBalanceResult>("Client_UpdateBalance", { playerId, balance }),
  );
}

/** @deprecated 余额刷新已改为 A8 方案（浏览器 Provider + Client_UpdateBalance），保留仅供调试 */
export async function refreshAccountBalance(playerId: number) {
  const row = unwrap(
    await post<AccountRecord & { balanceError?: string | null }>("Client_RefreshAccountBalance", {
      playerId,
    }),
  );
  return {
    balance: row.balanceError ? undefined : row.balance,
    currency: row.currency,
    account: row,
    balanceError: row.balanceError ?? null,
  };
}

export async function deletePlayer(playerId: number, description = "") {
  await post<unknown>("Client_DeletePlayer", { playerId, description });
}

export async function saveMoneyLog(body: Record<string, unknown>) {
  try {
    await unwrap(await post<unknown>("Client_SaveMoneyLog", body));
    return true;
  } catch {
    return false;
  }
}

export async function deleteMoneyLog(body: Record<string, unknown>) {
  return unwrap(await post<unknown>("Client_DeleteMoneyLog", body));
}

export async function getMoneyLogs(body: Record<string, unknown> = {}) {
  return unwrap(await post<PageResult<MoneyLogRow>>("Client_GetMoneyLogs", body));
}

export async function getMoneyLog(body: Record<string, unknown>) {
  return unwrap(await post<MoneyLogRow>("Client_GetMoneyLog", body));
}

export async function createTagPlatform(platformName: string, playerName: string) {
  return unwrap(
    await post<CreateTagPlatformResult>("Client_CreateTagPlatform", {
      platform: platformName,
      playerName,
    }),
  );
}

export async function getTagPlatforms() {
  return unwrap(await post<TagPlatformRow[]>("Client_GetTagPlatforms"));
}
