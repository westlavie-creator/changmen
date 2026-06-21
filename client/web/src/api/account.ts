import type { AccountRecord, CreateTagPlatformResult, UpdateBalanceResult } from "@/types/account";
import type { MoneyLogRow, PageResult, TagPlatformRow } from "@/types/esport";
import { normalizeAccountMultiplyField } from "@changmen/shared/account_multiply.mjs";
import { post, unwrap } from "@/api/client";
import { ACCOUNT_KEY, getData, saveData, updateBalance as vtUpdateBalance } from "@/api/vt";
import { formatPbDateTime } from "@/shared/format";

/** [A8 可证实] Io.loadAccounts → Vt.getData("ACCOUNT") */
export async function getAccounts(): Promise<AccountRecord[]> {
  const rows = (await getData<AccountRecord[]>(ACCOUNT_KEY)) ?? [];
  if (!Array.isArray(rows))
    return [];
  return rows.filter(row => row.accountId);
}

/** [A8 可证实] Io.saveAccounts → Vt.saveData("ACCOUNT", JSON.stringify(...)) */
export async function saveAccounts(accounts: AccountRecord[]): Promise<boolean> {
  const payload = accounts
    .filter(a => a.accountId)
    .map(a => normalizeAccountMultiplyField(a));
  return saveData(ACCOUNT_KEY, JSON.stringify(payload));
}

/** [A8 可证实] Vt.updateBalance → Client_UpdateBalance */
export async function updateBalance(
  playerId: number,
  balance?: number,
): Promise<UpdateBalanceResult | undefined> {
  return vtUpdateBalance(playerId, balance);
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
  }
  catch {
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
