import type { PlatformAccount } from "@/models/platformAccount";
import type { AccountStoreContext } from "@/stores/account/context";
import type { AccountBalanceResult } from "@venue/contract";
import { updateBalance } from "@/api/vt";
import { getAdapter } from "@/runtime/venueAdapters";
import { Currency } from "@/shared/currency";
import { syncModifyHeaderRules } from "@/stores/account/modifyHeaderSync";

function a8RefreshDelayMs() {
  return 120_000 + Math.random() * 60_000;
}

function a8Wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** [A8 可证实] Vt.saveLog：失败不阻断 Io.f */
function saveAccountRefreshLog(title: string, lines: string[]) {
  void import("@/api/chat")
    .then(({ saveUserLog }) => saveUserLog(title, lines))
    .catch(() => {});
}

/** PM 已存账号：vps 走 Pm_RefreshBalance；extension/direct 走 Provider.getBalance（插件代发） */
async function fetchVenueBalance(account: PlatformAccount): Promise<AccountBalanceResult | undefined> {
  const providerId = String(account.provider ?? "").toLowerCase();
  if (providerId === "polymarket" && account.accountId) {
    const { isPmVpsHttpMode } = await import("@venue/polymarket/pmTransportMode");
    if (isPmVpsHttpMode()) {
      const { refreshPmBalance } = await import("@/api/account");
      const info = await refreshPmBalance(account.accountId);
      if (!info || info.balance == null)
        return undefined;
      return {
        balance: Number(info.balance),
        currency: info.currency ?? Currency.USDT,
      };
    }
  }
  const provider = getAdapter(account.provider)?.provider;
  return provider?.getBalance?.(account);
}

/** 对齐 A8 uv.updateBalance：成功写 balance；失败 balance=undefined（TOKEN ERROR 由 CSS 展示） */
export async function refreshAccountBalance(
  _store: AccountStoreContext,
  account: PlatformAccount,
): Promise<void> {
  account.loadingBalance = true;
  try {
    const result = await fetchVenueBalance(account);
    if (result) {
      account.balance = result.balance;
      account.currency = result.currency ?? Currency.CNY;
      account.updateTime = Date.now();
      // [changmen 扩展] venueMemberId / venueAccountName 仅账号保存时写入，Io.f 余额刷新不改写（对齐 A8 uv.updateBalance）

      const info = await updateBalance(account.accountId, account.balance);
      if (info) {
        account.totalProfit = info.total - (account.credit ?? 0);
        if (info.platformId)
          account.platformId = info.platformId;
        if (info.platformName)
          account.platformName = info.platformName;
      }
      try {
        const { useMessageStore } = await import("@/stores/messageStore");
        const msg = useMessageStore();
        msg.balanceMessage(account);
        msg.profitMessage(account);
      }
      catch {
        /* 消息队列未启动时不阻断余额刷新 */
      }
    }
    else {
      account.balance = undefined;
    }
  }
  catch {
    account.balance = undefined;
  }
  finally {
    account.loadingBalance = false;
  }
}

/**
 * [A8 可证实] Io.f：逐账号 updateBalance → updateOrders（跳过 active）
 * finally：E() → u() → Vt.saveLog →（continuous）ModifyHeader → wait → f(_)
 */
export async function refreshAllFromVenues(
  store: AccountStoreContext,
  continuous = false,
): Promise<void> {
  const lines: string[] = [];
  const startedAt = Date.now();

  try {
    for (const acc of store.accounts) {
      lines.push(`开始加载账户：${acc.platformName} / ${acc.playerName} / ${acc.provider}`);
      if (acc.active) {
        lines.push("账号正在投注中，停止加载");
        continue;
      }
      try {
        let step = Date.now();
        await acc.updateBalance();
        lines.push(`读取余额：${Date.now() - step}ms`);
        step = Date.now();
        await acc.updateOrders();
        lines.push(`读取订单：${Date.now() - step}ms`);
      }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lines.push(`发生错误：${msg}`);
      }
    }
  }
  finally {
    let step = Date.now();
    try {
      const { useOrderStore } = await import("@/stores/orderStore");
      await useOrderStore().fetchOrders();
      lines.push(`加载本地订单：${Date.now() - step}ms`);
    }
    catch {
      lines.push(`加载本地订单：${Date.now() - step}ms（失败）`);
    }

    step = Date.now();
    try {
      await store.saveAccounts();
      lines.push(`保存账号：${Date.now() - step}ms`);
    }
    catch {
      lines.push(`保存账号：${Date.now() - step}ms（失败）`);
    }

    saveAccountRefreshLog(`加载账号信息，总耗时:${Date.now() - startedAt}ms`, lines);

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
