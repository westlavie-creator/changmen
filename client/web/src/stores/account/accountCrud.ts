import type { AccountStoreContext } from "@/stores/account/context";
import type { AccountRecord, CreateTagPlatformIdentity } from "@/types/account";
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
    const { warmAllPolymarketUserWs } = await import("@changmen/venue-adapter/polymarket/userWs");
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

function readVenueMemberId(row: { venueMemberId?: string; venueId?: string } | null | undefined): string {
  const v = row?.venueMemberId ?? (row as { venueId?: string } | undefined)?.venueId;
  return v != null ? String(v).trim() : "";
}

/** [A8 可证实] AccountInfoView.save → Ut.createTagPlatform */
export async function createTagPlatformForAccount(
  platformName: string,
  identity: CreateTagPlatformIdentity,
) {
  const created = await createTagPlatform(platformName, identity);
  if (!created?.playerId) {
    throw new Error("CreateTagPlatform 未返回 playerId");
  }
  return created;
}

/** [A8 可证实] Io.createAccount：find(accountId) → update，否则 push；再 SaveData + 刷新 */
export async function createAccount(
  store: AccountStoreContext,
  record: AccountRecord,
) {
  if (!record.accountId) {
    throw new Error("accountId 必须来自 CreateTagPlatform 返回的 playerId");
  }
  const byId = store.findAccount(record.accountId);
  if (byId) {
    byId.applyPatch(record);
  }
  else {
    // [changmen 扩展] CreateTagPlatform 复用失败时可能返回新 playerId；
    // 同 provider+venueMemberId 或 platform+playerName 已存在则原地更新。
    const platformName = String(record.platformName || "").trim();
    const playerName = String(record.playerName || "").trim();
    const provider = String(record.provider || "").trim();
    const venueMemberId = readVenueMemberId(record);
    const byVenue = venueMemberId && provider
      ? store.accounts.find(
          a =>
            String(a.provider || "").trim() === provider
            && readVenueMemberId(a) === venueMemberId,
        )
      : undefined;
    const byName = !byVenue && platformName && playerName
      ? store.accounts.find(
          a =>
            String(a.platformName || "").trim() === platformName
            && String(a.playerName || "").trim() === playerName,
        )
      : undefined;
    const existing = byVenue || byName;
    if (existing) {
      const { accountId: _discardNewId, ...patch } = record;
      existing.applyPatch(patch);
    }
    else {
      store.accounts.push(new PlatformAccount(record));
    }
  }
  await persistAccounts(store);
  const acc
    = store.findAccount(record.accountId)
      ?? (record.venueMemberId && record.provider
        ? store.accounts.find(
            a =>
              String(a.provider || "").trim() === String(record.provider || "").trim()
              && readVenueMemberId(a) === readVenueMemberId(record),
          )
        : undefined)
      ?? store.accounts.find(
        a =>
          String(a.platformName || "").trim() === String(record.platformName || "").trim()
          && String(a.playerName || "").trim() === String(record.playerName || "").trim(),
      );
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
    venueMemberId?: string;
  },
) {
  const identity: CreateTagPlatformIdentity = form.venueMemberId
    ? {
        playerName: form.playerName,
        venueMemberId: form.venueMemberId,
        provider: form.provider,
      }
    : form.playerName;
  const created = await createTagPlatformForAccount(form.platformName, identity);
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
