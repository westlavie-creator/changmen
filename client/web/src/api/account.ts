import type { AccountRecord, CreateTagPlatformIdentity, CreateTagPlatformResult, UpdateBalanceResult } from "@changmen/client-core/types/account";
import type { MoneyLogRow, PageResult, TagPlatformRow } from "@/types/esport";
import { normalizeAccountMultiplyField } from "@changmen/shared/account_multiply";
import { post, unwrap } from "@/api/client";
import { ACCOUNT_KEY, getData, saveData, updateBalance as vtUpdateBalance } from "@/api/vt";
import { formatPbDateTime } from "@changmen/client-core/shared/format";

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
  await saveData(ACCOUNT_KEY, JSON.stringify(payload));
  return true;
}

/** [A8 可证实] Vt.updateBalance → Client_UpdateBalance */
export async function updateBalance(
  playerId: number,
  balance?: number,
): Promise<UpdateBalanceResult | undefined> {
  return vtUpdateBalance(playerId, balance);
}

/** [changmen 扩展] PM 余额：VPS 直连 CLOB，不经 http-relay */
export async function refreshPmBalance(
  playerId: number,
): Promise<AccountRecord | undefined> {
  const res = await post<AccountRecord>(
    "Pm_RefreshBalance",
    { playerId },
    "",
    { errorTip: false },
  );
  return res.success === 1 && res.info ? res.info : undefined;
}

/** [changmen 扩展] PF house：按 RDS 订单重算授信台账余额 */
export async function refreshPfBalance(
  playerId: number,
): Promise<AccountRecord | undefined> {
  const res = await post<AccountRecord>(
    "Pf_RefreshBalance",
    { playerId },
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

export async function createTagPlatform(
  platformName: string,
  identity: CreateTagPlatformIdentity,
) {
  const body = typeof identity === "string"
    ? { platform: platformName, playerName: identity }
    : {
        platform: platformName,
        playerName: identity.playerName,
        venueMemberId: identity.venueMemberId,
        provider: identity.provider,
      };
  return unwrap(
    await post<CreateTagPlatformResult>("Client_CreateTagPlatform", body),
  );
}

export async function getTagPlatforms() {
  return unwrap(await post<TagPlatformRow[]>("Client_GetTagPlatforms"));
}
