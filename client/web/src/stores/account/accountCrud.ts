import type { AccountStoreContext } from "@/stores/account/context";
import type { AccountRecord } from "@/types/account";
import type { TagPlatformRow } from "@/types/esport";
import { normalizeAccountMultiplyField } from "@changmen/shared/account_multiply";
import {
  createTagPlatform,
  deletePlayer,
  getAccounts,
  getTagPlatforms,
  saveAccounts,
  saveMoneyLog,
} from "@/api/esport";
import { PlatformAccount } from "@/models/platformAccount";
import { refreshAllFromVenues, startBalanceRefreshLoop } from "@/stores/account/balanceRefresh";

async function warmPolymarketUserWsFromAccounts(accounts: PlatformAccount[]) {
  try {
    const { warmAllPolymarketUserWs } = await import("@venue/polymarket/userWs");
    warmAllPolymarketUserWs(accounts);
  }
  catch {
    /* 无扩展 / 无凭证时跳过 */
  }
}

export function openCreateAccount(store: AccountStoreContext) {
  store.editDialogAccount = undefined;
  store.editDialogOpen = true;
}

export function openEditAccount(store: AccountStoreContext, account: PlatformAccount) {
  store.editDialogAccount = account;
  store.editDialogOpen = true;
}

export function closeAccountDialog(store: AccountStoreContext) {
  store.editDialogOpen = false;
  store.editDialogAccount = undefined;
}

export async function loadTagPlatforms(store: AccountStoreContext) {
  const rows = await getTagPlatforms();
  store.tagPlatforms = rows.map((r: TagPlatformRow) => ({
    ID: r.ID ?? r.Id,
    Name: r.Name ?? r.Platform ?? "",
  }));
}

export async function loadAccounts(store: AccountStoreContext, refreshBalances = false) {
  store.loading = true;
  try {
    if (refreshBalances)
      await loadTagPlatforms(store);
    const list = await getAccounts();
    store.accounts = list
      .filter(row => row.accountId)
      .map((row) => {
        const acc = new PlatformAccount(row);
        if (!acc.platformName && acc.platformId) {
          acc.platformName = store.getPlatformName(acc.platformId, acc.platformName);
        }
        return acc;
      });
    store.loaded = true;
    void warmPolymarketUserWsFromAccounts(store.accounts);
  }
  finally {
    store.loading = false;
  }
  if (refreshBalances) {
    startBalanceRefreshLoop(store);
    await refreshAllFromVenues(store, true);
    try {
      const { useOrderStore } = await import("@/stores/orderStore");
      await useOrderStore().fetchOrders();
    }
    catch {
      /* A8 l(_): await E() — continuous f 不返回时此处不可达 */
    }
  }
}

/** [A8 可证实] Io.u：filter(accountId) 后整包 Client_SaveData(ACCOUNT)，无空列表/admin 门控 */
export async function persistAccounts(store: AccountStoreContext) {
  const payload = store.accounts
    .filter(a => a.accountId)
    .map(a => normalizeAccountMultiplyField(a.toJSON()));
  return saveAccounts(payload);
}

/** [A8 可证实] AccountInfoView.save → Ut.createTagPlatform */
export async function createTagPlatformForAccount(
  platformName: string,
  playerName: string,
) {
  const created = await createTagPlatform(platformName, playerName);
  if (!created?.playerId) {
    throw new Error("CreateTagPlatform 未返回 playerId");
  }
  return created;
}

/** [A8 可证实] Io.createAccount：accountId 仅来自 CreateTagPlatform.playerId */
export async function createAccount(
  store: AccountStoreContext,
  record: AccountRecord,
) {
  if (!record.accountId) {
    throw new Error("accountId 必须来自 CreateTagPlatform 返回的 playerId");
  }
  const existing = store.findAccount(record.accountId);
  if (existing) {
    existing.applyPatch(record);
  }
  else {
    store.accounts.push(new PlatformAccount(record));
  }
  await persistAccounts(store);
  const acc = store.findAccount(record.accountId);
  if (acc) {
    await acc.updateBalance();
    await acc.updateOrders();
    void warmPolymarketUserWsFromAccounts(store.accounts);
  }
}

export async function createFromTagPlatform(
  store: AccountStoreContext,
  form: Partial<AccountRecord> & {
    platformName: string;
    playerName: string;
    provider: AccountRecord["provider"];
  },
) {
  const created = await createTagPlatformForAccount(form.platformName, form.playerName);
  await createAccount(store, {
    ...form,
    accountId: created.playerId,
    playerName: created.playerName,
    platformId: created.platformId,
    platformName: form.platformName || created.platformName,
    pause: form.pause ?? false,
    balance: undefined,
    updateTime: Date.now(),
  } as AccountRecord);
  await loadTagPlatforms(store);
  return created;
}

export async function deleteAccount(store: AccountStoreContext, accountId: number) {
  await deletePlayer(accountId);
  store.accounts = store.accounts.filter(a => a.accountId !== accountId);
  void persistAccounts(store);
}

export async function saveMoneyLogForAccount(
  store: AccountStoreContext,
  accountId: number,
  money: number,
  type: "Recharge" | "Withdraw" | string,
  description = "",
) {
  const ok = await saveMoneyLog({
    playerId: accountId,
    money,
    type,
    description,
  });
  if (ok && type === "Recharge") {
    const acc = store.findAccount(accountId);
    if (acc) {
      acc.credit = (acc.credit ?? 0) + money;
      await persistAccounts(store);
    }
  }
  return ok;
}
