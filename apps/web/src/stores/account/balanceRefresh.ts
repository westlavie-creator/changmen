import { updateBalance } from "@/api/esport";
import type { PlatformAccount } from "@/models/platformAccount";
import { getProvider } from "@/runtime/providers";
import { normalizeBalanceError } from "@/stores/account/balanceErrors";
import type { AccountStoreContext } from "@/stores/account/context";
import { refreshVenueOrdersQuiet } from "@/stores/account/venueOrders";

/** 对齐 A8 uv.updateBalance：浏览器 Provider 拉场馆 → Client_UpdateBalance 落库 */
export async function refreshAccountBalance(
  store: AccountStoreContext,
  account: PlatformAccount,
): Promise<boolean> {
  account.loadingBalance = true;
  account.balanceError = null;

  try {
    const provider = getProvider(account);
    if (!provider?.getBalance) {
      account.balance = undefined;
      account.balanceError = `${account.provider} 暂不支持客户端刷新余额`;
      return false;
    }
    if (!account.gateway || !account.token) {
      account.balance = undefined;
      account.balanceError = "token error";
      return false;
    }

    const result = await provider.getBalance(account);
    if (!result) {
      account.balance = undefined;
      account.balanceError = "token error";
      return false;
    }

    account.balance = result.balance;
    if (result.currency) account.currency = result.currency;
    account.balanceError = null;
    account.updateTime = Date.now();

    try {
      const info = await updateBalance(account.accountId, account.balance);
      if (info) {
        account.totalProfit = info.total - (account.credit ?? 0);
        if (info.platformId) account.platformId = info.platformId;
        if (info.platformName) account.platformName = info.platformName;
      }
    } catch {
      /* 余额已从场馆读到，落库失败不阻断展示 */
    }
    await store.saveAccounts();
    await refreshVenueOrdersQuiet(account);
    return true;
  } catch (e) {
    account.balance = undefined;
    account.balanceError = normalizeBalanceError(e, account);
    return false;
  } finally {
    account.loadingBalance = false;
  }
}

/** A8 Io.f：逐账号刷余额（跳过投注中）→ 保存 → 拉本地订单汇总 */
export async function refreshAllFromVenues(store: AccountStoreContext) {
  for (const acc of store.accounts) {
    if (acc.active) continue;
    try {
      await refreshAccountBalance(store, acc);
    } catch {
      /* 单账号失败不阻断 */
    }
  }
  await store.saveAccounts();
  try {
    const { useOrderStore } = await import("@/stores/orderStore");
    await useOrderStore().fetchOrders();
  } catch {
    /* 订单拉取失败不阻断余额结果 */
  }
}

export function startBalanceRefreshLoop(store: AccountStoreContext) {
  if (store.balanceRefreshRunning) return;
  store.balanceRefreshRunning = true;
  scheduleBalanceRefreshCycle(store);
}

export function stopBalanceRefreshLoop(store: AccountStoreContext) {
  store.balanceRefreshRunning = false;
  if (store.balanceRefreshTimer) {
    clearTimeout(store.balanceRefreshTimer);
    store.balanceRefreshTimer = null;
  }
}

export function scheduleBalanceRefreshCycle(store: AccountStoreContext) {
  if (!store.balanceRefreshRunning) return;
  if (store.balanceRefreshTimer) clearTimeout(store.balanceRefreshTimer);
  const delayMs = 120_000 + Math.random() * 60_000;
  store.balanceRefreshTimer = setTimeout(() => {
    void runBalanceRefreshCycle(store);
  }, delayMs);
}

export async function runBalanceRefreshCycle(store: AccountStoreContext) {
  if (!store.balanceRefreshRunning) return;
  try {
    await refreshAllFromVenues(store);
  } finally {
    scheduleBalanceRefreshCycle(store);
  }
}
