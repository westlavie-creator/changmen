import { updateBalance } from "@/api/esport";
import type { PlatformAccount } from "@/models/platformAccount";
import { getProvider } from "@/runtime/providers";
import { Currency } from "@/shared/currency";
import type { AccountStoreContext } from "@/stores/account/context";
import { syncModifyHeaderRules } from "@/stores/account/modifyHeaderSync";
import { updateVenueOrders } from "@/stores/account/venueOrders";

/** 对齐 A8 uv.updateBalance：成功写 balance；失败 balance=undefined（TOKEN ERROR 由 CSS 展示） */
export async function refreshAccountBalance(
  store: AccountStoreContext,
  account: PlatformAccount,
): Promise<boolean> {
  account.loadingBalance = true;
  try {
    const provider = getProvider(account);
    const result = await provider?.getBalance?.(account);
    if (result) {
      account.balance = result.balance;
      account.currency = result.currency ?? Currency.CNY;
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
      try {
        const { useMessageStore } = await import("@/stores/messageStore");
        const msg = useMessageStore();
        msg.balanceMessage(account);
        msg.profitMessage(account);
      } catch {
        /* 消息队列未启动时不阻断余额刷新 */
      }
      return true;
    }
    account.balance = undefined;
    return false;
  } catch {
    account.balance = undefined;
    return false;
  } finally {
    account.loadingBalance = false;
  }
}

/** A8 Io.f：逐账号 updateBalance → updateOrders（跳过投注中）→ 保存 → 拉本地订单汇总 */
export async function refreshAllFromVenues(store: AccountStoreContext) {
  for (const acc of store.accounts) {
    if (acc.active) continue;
    try {
      await refreshAccountBalance(store, acc);
      await updateVenueOrders(acc);
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
  await syncModifyHeaderRules(store.accounts);
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
