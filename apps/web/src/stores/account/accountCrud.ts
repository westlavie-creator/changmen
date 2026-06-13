import {
  createTagPlatform,
  deletePlayer,
  getAccounts,
  getTagPlatforms,
  saveAccounts,
  saveMoneyLog,
} from "@/api/esport";
import { PlatformAccount } from "@/models/platformAccount";
import type { AccountRecord, CreateTagPlatformResult } from "@/types/account";
import { normalizeAccountMultiplyField } from "@changmen/shared/account_multiply.mjs";
import { refreshAccountBalance, refreshAllFromVenues, startBalanceRefreshLoop } from "@/stores/account/balanceRefresh";
import { syncModifyHeaderRules } from "@/stores/account/modifyHeaderSync";
import type { AccountStoreContext } from "@/stores/account/context";

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
  store.tagPlatforms = rows.map((r) => ({
    ID: r.ID ?? r.Id,
    Name: r.Name ?? r.Platform ?? "",
  }));
}

export async function loadAccounts(store: AccountStoreContext, refreshBalances = false) {
  store.loading = true;
  try {
    await loadTagPlatforms(store);
    const list = await getAccounts();
    store.accounts = list
      .filter((row) => row.accountId)
      .map((row) => {
        const acc = new PlatformAccount(row);
        if (!acc.platformName && acc.platformId) {
          acc.platformName = store.getPlatformName(acc.platformId, acc.platformName);
        }
        return acc;
      });
    store.loaded = true;
    if (refreshBalances) {
      await refreshAllFromVenues(store);
      startBalanceRefreshLoop(store);
    }
  } finally {
    store.loading = false;
  }
}

export async function persistAccounts(store: AccountStoreContext) {
  const payload = store.accounts
    .filter((a) => a.accountId)
    .map((a) => normalizeAccountMultiplyField(a.toJSON()));
  const ok = await saveAccounts(payload);
  if (!ok) throw new Error("账号保存失败，请检查登录状态或稍后重试");
  await syncModifyHeaderRules(store.accounts);
  return ok;
}

export async function upsertAccount(store: AccountStoreContext, record: Partial<AccountRecord>) {
  const existing = store.findAccount(record.accountId);
  if (existing) {
    existing.applyPatch(record);
  } else if (record.accountId) {
    store.accounts.push(new PlatformAccount(record as AccountRecord));
  }
  await persistAccounts(store);
}

export async function createAccount(store: AccountStoreContext, record: Partial<AccountRecord>) {
  await upsertAccount(store, record);
  const acc = store.findAccount(record.accountId);
  if (acc) {
    await refreshAccountBalance(store, acc);
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
  await createAccount(store, {
    ...form,
    accountId: created.playerId,
    playerName: created.playerName,
    platformId: created.platformId,
    platformName: form.platformName || created.platformName,
    pause: form.pause ?? false,
    balance: undefined,
    updateTime: Date.now(),
  });
  await loadTagPlatforms(store);
  return created;
}

export async function deleteAccount(store: AccountStoreContext, accountId: number) {
  await deletePlayer(accountId);
  store.accounts = store.accounts.filter((a) => a.accountId !== accountId);
  await persistAccounts(store);
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
