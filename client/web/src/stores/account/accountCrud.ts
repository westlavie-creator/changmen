import type { AccountStoreContext } from "@/stores/account/context";
import type { AccountRecord, CreateTagPlatformResult } from "@/types/account";
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

export async function persistAccounts(store: AccountStoreContext) {
  const payload = store.accounts
    .filter(a => a.accountId)
    .map(a => normalizeAccountMultiplyField(a.toJSON()));
  const ok = await saveAccounts(payload);
  if (!ok)
    throw new Error("账号保存失败，请检查登录状态或稍后重试");
  return ok;
}

/** [A8 可证实] Io.createAccount：accountId 仅来自 CreateTagPlatform.playerId */
async function createAccountFromPlayerId(
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
  const created: CreateTagPlatformResult = await createTagPlatform(
    form.platformName,
    form.playerName,
  );
  if (!created?.playerId) {
    throw new Error("CreateTagPlatform 未返回 playerId");
  }
  await createAccountFromPlayerId(store, {
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
