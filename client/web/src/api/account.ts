import { post, postForm, unwrap } from "@/api/client";
import type { AccountRecord, CreateTagPlatformResult, UpdateBalanceResult } from "@/types/account";
import { formatPbDateTime } from "@/shared/format";
import type { MoneyLogRow, PageResult, TagPlatformRow } from "@/types/esport";

export async function getAccounts(): Promise<AccountRecord[]> {
  const res = await post<AccountRecord[]>("Client_GetAccounts", {});
  if (res.success !== 1 || !Array.isArray(res.info)) return [];
  return res.info;
}

export async function saveAccounts(accounts: AccountRecord[]): Promise<boolean> {
  const res = await post<boolean>("Client_SaveAccounts", {
    accounts: JSON.stringify(accounts),
  });
  return res.success === 1;
}

/** [A8 可证实] Vt.updateBalance：balance 未定义或无 playerId 时不请求；errorTip:false */
export async function updateBalance(
  playerId: number,
  balance?: number,
): Promise<UpdateBalanceResult | undefined> {
  if (balance === undefined || !playerId) return undefined;
  const res = await postForm<UpdateBalanceResult>(
    "Client_UpdateBalance",
    { playerId: String(playerId), balance: String(balance) },
    "",
    { errorTip: false },
  );
  return res.success === 1 && res.info ? res.info : undefined;
}

export async function deletePlayer(playerId: number, description = "") {
  await post<unknown>("Client_DeletePlayer", { playerId, description });
}

export async function saveMoneyLog(body: Record<string, unknown>) {
  const payload = { ...body };
  if (typeof payload.createAt === "number") {
    payload.createAt = formatPbDateTime(new Date(payload.createAt));
  }
  try {
    await unwrap(await post<unknown>("Client_SaveMoneyLog", payload));
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

export async function getMoneyLog(logId: number) {
  return unwrap(await post<MoneyLogRow>("Client_GetMoneyLog", { logId }));
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
