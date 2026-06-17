import { updateBalance } from "@/api/esport";
import type { PlatformAccount } from "@/models/platformAccount";
import { getProvider } from "@/runtime/providers";
import { Currency } from "@/shared/currency";
import type { AccountStoreContext } from "@/stores/account/context";
import { syncModifyHeaderRules } from "@/stores/account/modifyHeaderSync";
import { updateVenueOrders } from "@/stores/account/venueOrders";

function a8RefreshDelayMs() {
  return 120_000 + Math.random() * 60_000;
}

function a8Wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

/**
 * [A8 可证实] Io.f：逐账号 updateBalance → updateOrders（跳过 active）
 * finally：E() → u() →（continuous）ModifyHeader → wait → f(_)
 */
export async function refreshAllFromVenues(
  store: AccountStoreContext,
  continuous = false,
): Promise<void> {
  try {
    for (const acc of store.accounts) {
      if (acc.active) continue;
      try {
        await refreshAccountBalance(store, acc);
        await updateVenueOrders(acc);
      } catch {
        /* 单账号失败不阻断 */
      }
    }
  } finally {
    try {
      const { useOrderStore } = await import("@/stores/orderStore");
      await useOrderStore().fetchOrders();
    } catch {
      /* E() 失败不阻断 */
    }
    try {
      await store.saveAccounts();
    } catch {
      /* u() 失败不阻断 */
    }
    if (continuous && store.balanceRefreshRunning) {
      await syncModifyHeaderRules(store.accounts);
      await a8Wait(a8RefreshDelayMs());
      if (store.balanceRefreshRunning) {
        await refreshAllFromVenues(store, true);
      }
    }
  }
}

/** 对齐 A8 Io.f 连续轮询：由 loadAccounts(true) 置位，stopBalanceRefreshLoop 清位 */
export function startBalanceRefreshLoop(store: AccountStoreContext) {
  store.balanceRefreshRunning = true;
}

export function stopBalanceRefreshLoop(store: AccountStoreContext) {
  store.balanceRefreshRunning = false;
}
