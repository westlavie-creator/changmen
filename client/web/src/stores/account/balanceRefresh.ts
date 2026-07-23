import type { PlatformAccount } from "@/models/platformAccount";
import type { AccountStoreContext } from "@/stores/account/context";
import type { AccountBalanceResult } from "@changmen/venue-adapter/contract";
import { updateBalance } from "@/api/vt";
import { getAdapter } from "@/runtime/venueAdapters";
import { Currency } from "@/shared/currency";
import { syncModifyHeaderRules } from "@/stores/account/modifyHeaderSync";
import { resolveAccountCurrency } from "@changmen/shared/currency";

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

/**
 * [changmen 扩展] 场馆明确鉴权/会话失效文案。
 * 宁可漏判成「待刷新」，也不要把网络/HTTP 噪声误判成 TOKEN ERROR。
 */
export function isVenueAuthFailureMessage(msg: string): boolean {
  const m = String(msg || "").trim();
  if (!m)
    return false;
  if (/redis:\s*nil/i.test(m))
    return true;
  if (/token\s*error/i.test(m))
    return true;
  if (/MULTIPLE_LOGIN|UNAUTHOR/i.test(m))
    return true;
  if (/未登录|登录失效|token无效|token\s*invalid/i.test(m))
    return true;
  // PB 等短码：整段消息才算，避免命中 “Forbidden” 类 HTTP 正文
  if (/^(SESSION|LOGIN|UNAUTHORIZED|FORBIDDEN)$/i.test(m))
    return true;
  return false;
}

function noteAuthFailure(account: PlatformAccount, msg: string) {
  if (/redis:\s*nil/i.test(msg)) {
    account.errorCount += 1;
    if (account.errorCount >= 3)
      account.logout();
  }
  else {
    account.errorCount = 0;
  }
}

/**
 * PM 已存账号：一律 Pm_RefreshBalance（VPS 直连 CLOB）。
 * 不跟 PM_HTTP_MODE 走——extension 模式仍从用户本机出网，没翻墙会刷不出余额；
 * 保存前探测（无 accountId）仍走 Provider.getBalance。
 */
async function fetchVenueBalance(account: PlatformAccount): Promise<AccountBalanceResult | undefined> {
  const providerId = String(account.provider ?? "").toLowerCase();
  // PredictFun：余额以 RDS total_balance 为准，经 Pf_RefreshBalance 读取；禁止 Client_UpdateBalance
  if (providerId === "predictfun") {
    if (!account.accountId)
      return undefined;
    const { refreshPfBalance } = await import("@/api/account");
    const info = await refreshPfBalance(account.accountId);
    if (!info || info.balance == null)
      return undefined;
    if (info.totalProfit != null)
      account.totalProfit = Number(info.totalProfit) || 0;
    if (info.unsettle != null)
      account.unsettle = Number(info.unsettle) || 0;
    if (info.orderCount != null)
      account.orderCount = Number(info.orderCount) || 0;
    account.credit = 0;
    return {
      balance: Number(info.balance),
      currency: resolveAccountCurrency(account.provider, info.currency ?? account.currency),
    };
  }
  if (providerId === "polymarket" && account.accountId) {
    const { refreshPmBalance } = await import("@/api/account");
    const info = await refreshPmBalance(account.accountId);
    if (!info || info.balance == null)
      return undefined;
    return {
      balance: Number(info.balance),
      currency: info.currency ?? Currency.USDT,
    };
  }
  const provider = getAdapter(account.provider)?.provider;
  return provider?.getBalance?.(account);
}

function applyRefreshFailure(account: PlatformAccount, hadBalance: boolean, reason: string) {
  if (isVenueAuthFailureMessage(reason)) {
    account.balance = undefined;
    account.balanceStale = false;
    noteAuthFailure(account, reason);
    return;
  }
  if (hadBalance) {
    account.balanceStale = true;
    return;
  }
  account.balance = undefined;
  account.balanceStale = false;
}

/**
 * 对齐 A8 uv.updateBalance：成功写 balance。
 * [changmen 扩展] 瞬时失败保留上次余额并标 balanceStale；仅明确鉴权失败才硬 TOKEN ERROR。
 */
export async function refreshAccountBalance(
  _store: AccountStoreContext,
  account: PlatformAccount,
): Promise<void> {
  account.loadingBalance = true;
  const hadBalance = account.balance !== undefined;
  try {
    const result = await fetchVenueBalance(account);
    if (result) {
      account.balance = result.balance;
      account.currency = result.currency ?? Currency.CNY;
      account.updateTime = Date.now();
      account.balanceStale = false;
      account.errorCount = 0;
      // [changmen 扩展] venueMemberId / venueAccountName 仅账号保存时写入，Io.f 余额刷新不改写（对齐 A8 uv.updateBalance）

      const providerId = String(account.provider ?? "").toLowerCase();
      // PredictFun：RDS 已是真相；勿 Client_UpdateBalance 回写
      if (providerId === "predictfun") {
        try {
          const { useMessageStore } = await import("@/stores/messageStore");
          const msg = useMessageStore();
          msg.balanceMessage(account);
          msg.profitMessage(account);
        }
        catch {
          /* 消息队列未启动时不阻断余额刷新 */
        }
        return;
      }

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
      applyRefreshFailure(account, hadBalance, "balance unavailable");
    }
  }
  catch (err) {
    const reason = err instanceof Error ? err.message : String(err ?? "refresh failed");
    applyRefreshFailure(account, hadBalance, reason);
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
        lines.push("账号正在买入中，停止加载");
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
