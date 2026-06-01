import { defineStore } from "pinia";
import {
  createTagPlatform,
  deletePlayer,
  getClientDataArray,
  getTagPlatforms,
  saveClientData,
  saveMoneyLog,
  updateBalance,
} from "@/api/esport";
import { PlatformAccount } from "@/models/platformAccount";
import type { AccountRecord, CreateTagPlatformResult } from "@/types/account";
import type { TagPlatformRow } from "@/types/esport";
import type { PlatformId } from "@/types/esport";
import { BetOption } from "@/models/betOption";
import { BetResult } from "@/models/betResult";
import { saveOrders } from "@/api/order";
import { getProvider } from "@/runtime/providers";
import { useConfigStore } from "@/stores/configStore";

const ACCOUNT_KEY = "ACCOUNT";

/** 对齐 A8 Pinia `Io` */
export const useAccountStore = defineStore("account", {
  state: () => ({
    accounts: [] as PlatformAccount[],
    tagPlatforms: [] as TagPlatformRow[],
    loaded: false,
    loading: false,
    /** A8 Io.f 后台轮询：120s + 随机 60s */
    balanceRefreshRunning: false,
    balanceRefreshTimer: null as ReturnType<typeof setTimeout> | null,
    providerPickIndex: new Map<PlatformId, number>(),
    editDialogOpen: false,
    editDialogAccount: undefined as PlatformAccount | undefined,
  }),

  getters: {
    sortedAccounts: (s) => [...s.accounts].sort(PlatformAccount.sortByProvider),

    totalBalance: (s) =>
      s.accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0),

    totalToday: (s) => s.accounts.reduce((sum, a) => sum + (a.today ?? 0), 0),

    totalOrders: (s) => s.accounts.reduce((sum, a) => sum + (a.orderCount ?? 0), 0),

    getPlatformName: (s) => (platformId?: number, fallback = "") => {
      if (!platformId) return fallback;
      const row = s.tagPlatforms.find(
        (p) => p.ID === platformId || p.Id === platformId,
      );
      return row?.Name || row?.Platform || fallback;
    },
  },

  actions: {
    findAccount(accountId?: number) {
      if (!accountId) return undefined;
      return this.accounts.find((a) => a.accountId === accountId);
    },

    openCreateAccount() {
      this.editDialogAccount = undefined;
      this.editDialogOpen = true;
    },

    openEditAccount(account: PlatformAccount) {
      this.editDialogAccount = account;
      this.editDialogOpen = true;
    },

    closeAccountDialog() {
      this.editDialogOpen = false;
      this.editDialogAccount = undefined;
    },

    async loadTagPlatforms() {
      const rows = await getTagPlatforms();
      this.tagPlatforms = rows.map((r) => ({
        ID: r.ID ?? r.Id,
        Name: r.Name ?? r.Platform ?? "",
      }));
    },

    async loadAccounts(refreshBalances = false) {
      this.loading = true;
      try {
        await this.loadTagPlatforms();
        const list = await getClientDataArray<AccountRecord>(ACCOUNT_KEY);
        this.accounts = list
          .filter((row) => row.accountId)
          .map((row) => {
            const acc = new PlatformAccount(row);
            if (!acc.platformName && acc.platformId) {
              acc.platformName = this.getPlatformName(acc.platformId, acc.platformName);
            }
            return acc;
          });
        this.loaded = true;
        if (refreshBalances) {
          await this.refreshAllFromVenues();
          this.startBalanceRefreshLoop();
        }
      } finally {
        this.loading = false;
      }
    },

    async saveAccounts() {
      const payload = this.accounts
        .filter((a) => a.accountId)
        .map((a) => a.toJSON());
      await saveClientData(ACCOUNT_KEY, JSON.stringify(payload));
    },

    async upsertAccount(record: Partial<AccountRecord>) {
      const existing = this.findAccount(record.accountId);
      if (existing) {
        existing.applyPatch(record);
      } else if (record.accountId) {
        this.accounts.push(new PlatformAccount(record as AccountRecord));
      }
      await this.saveAccounts();
    },

    async createAccount(record: Partial<AccountRecord>) {
      await this.upsertAccount(record);
      const acc = this.findAccount(record.accountId);
      if (acc) {
        await accRefresh.call(this, acc);
      }
    },

    async createFromTagPlatform(form: Partial<import("@/types/account").AccountRecord> & {
      platformName: string;
      playerName: string;
      provider: AccountRecord["provider"];
    }) {
      const created: CreateTagPlatformResult = await createTagPlatform(
        form.platformName,
        form.playerName,
      );
      await this.createAccount({
        ...form,
        accountId: created.playerId,
        playerName: created.playerName,
        platformId: created.platformId,
        platformName: form.platformName || created.platformName,
        pause: form.pause ?? false,
        balance: undefined,
        updateTime: Date.now(),
      });
      await this.loadTagPlatforms();
      return created;
    },

    async deleteAccount(accountId: number) {
      await deletePlayer(accountId);
      this.accounts = this.accounts.filter((a) => a.accountId !== accountId);
      await this.saveAccounts();
    },

    async refreshBalance(account: PlatformAccount) {
      return accRefresh.call(this, account);
    },

    /** A8 Io.f：逐账号刷余额（跳过投注中）→ 保存 → 拉本地订单汇总 */
    async refreshAllFromVenues() {
      for (const acc of this.accounts) {
        if (acc.active) continue;
        try {
          await accRefresh.call(this, acc);
        } catch {
          /* 单账号失败不阻断 */
        }
      }
      await this.saveAccounts();
      try {
        const { useOrderStore } = await import("@/stores/orderStore");
        await useOrderStore().fetchOrders();
      } catch {
        /* 订单拉取失败不阻断余额结果 */
      }
    },

    async refreshAllBalances() {
      await this.refreshAllFromVenues();
    },

    /** A8 主界面 loadAccounts(true) 后启动；间隔 120s + random(0–60s) */
    startBalanceRefreshLoop() {
      if (this.balanceRefreshRunning) return;
      this.balanceRefreshRunning = true;
      this.scheduleBalanceRefreshCycle();
    },

    stopBalanceRefreshLoop() {
      this.balanceRefreshRunning = false;
      if (this.balanceRefreshTimer) {
        clearTimeout(this.balanceRefreshTimer);
        this.balanceRefreshTimer = null;
      }
    },

    scheduleBalanceRefreshCycle() {
      if (!this.balanceRefreshRunning) return;
      if (this.balanceRefreshTimer) clearTimeout(this.balanceRefreshTimer);
      const delayMs = 120_000 + Math.random() * 60_000;
      this.balanceRefreshTimer = setTimeout(() => {
        void this.runBalanceRefreshCycle();
      }, delayMs);
    },

    async runBalanceRefreshCycle() {
      if (!this.balanceRefreshRunning) return;
      try {
        await this.refreshAllFromVenues();
      } finally {
        this.scheduleBalanceRefreshCycle();
      }
    },

    async saveMoneyLogForAccount(
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
        const acc = this.findAccount(accountId);
        if (acc) {
          acc.credit = (acc.credit ?? 0) + money;
          await this.saveAccounts();
        }
      }
      return ok;
    },

    getProviders(minBetMoney?: number) {
      const config = useConfigStore().config;
      const threshold = minBetMoney ?? config.betMoney;
      const map = new Map<PlatformId, PlatformAccount[]>();
      for (const acc of this.accounts) {
        const bal = acc.getBalance();
        if (bal === undefined || bal < threshold) continue;
        if (!map.has(acc.provider)) map.set(acc.provider, []);
        map.get(acc.provider)!.push(acc);
      }
      return map;
    },

    getAccount(
      provider: PlatformId,
      betMoney: number,
      excludeAccountIds: number[] = [],
      filter?: (acc: PlatformAccount) => boolean,
      options?: BetOption[],
    ) {
      if (!provider) return undefined;
      const candidates = this.accounts.filter((acc) => {
        if (excludeAccountIds.includes(acc.accountId)) return false;
        if (acc.maxOrder && acc.todayOrder && acc.todayOrder >= acc.maxOrder) return false;
        const bal = acc.getBalance();
        if (bal === undefined) return false;
        if (filter && !filter(acc)) return false;
        return acc.provider === provider && bal >= betMoney;
      });
      if (!candidates.length) return undefined;
      if (candidates.length === 1) return candidates[0];

      if (options?.length === 2 && candidates.some((a) => a.profit !== 0)) {
        const implied = 1 / options.reduce((sum, o) => sum + 1 / o.odds, 0);
        const sorted = candidates
          .filter((a) => a.profit === 0 || a.profit >= implied)
          .sort((a, b) => {
            const av = a.profit === 0 ? useConfigStore().config.profit : a.profit;
            const bv = b.profit === 0 ? useConfigStore().config.profit : b.profit;
            return av - bv;
          });
        if (sorted.length) return sorted[0];
      }

      const idx = this.providerPickIndex.get(provider) ?? 0;
      this.providerPickIndex.set(provider, idx + 1);
      return candidates[idx % candidates.length];
    },

    async checkBetting(account: PlatformAccount | undefined, option: BetOption) {
      if (!account) {
        option.checkError = `场馆${option.type}没有可用账号`;
        return option;
      }
      const provider = getProvider(account);
      if (!provider) {
        option.checkError = `场馆${option.type}不被支持`;
        return option;
      }
      try {
        option.betMoney = account.getBetMoney(option.betMoney, option.odds);
        return await provider.checkBet(account, option);
      } catch (e) {
        option.checkError = e instanceof Error ? e.message : String(e);
        return option;
      }
    },

    async betting(account: PlatformAccount | undefined, option: BetOption, toastSeconds = 10) {
      if (!account) return new BetResult(option.type, false, "无可用账号");
      const provider = getProvider(account);
      if (!provider) return new BetResult(option.type, false, "平台不支持");
      void toastSeconds;
      try {
        if (!option.data) {
          option = await this.checkBetting(account, option);
        }
        if (!option.data) {
          return new BetResult(option.type, false, option.checkError || "预检失败");
        }
        return await provider.betting(account, option);
      } catch (e) {
        return new BetResult(
          account.provider,
          false,
          e instanceof Error ? e.message : String(e),
          option.data,
        );
      }
    },
  },
});

/** 对齐 A8 uv.updateBalance：浏览器 Provider 拉场馆 → Client_UpdateBalance 落库 */
async function accRefresh(this: ReturnType<typeof useAccountStore>, account: PlatformAccount) {
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
    await this.saveAccounts();
    await accUpdateOrders.call(this, account);
    return true;
  } catch (e) {
    account.balance = undefined;
    account.balanceError = normalizeBalanceError(e, account);
    return false;
  } finally {
    account.loadingBalance = false;
  }
}

/** 对齐 A8 `uv.updateOrders` + `Vt.saveOrders` */
async function accUpdateOrders(
  this: ReturnType<typeof useAccountStore>,
  account: PlatformAccount,
) {
  const provider = getProvider(account);
  if (!provider?.getOrders) return;
  try {
    const orders = await provider.getOrders(account);
    account.unsettle = orders.filter((o) => o.status === "none").length;
    const unsettledExposure = orders
      .filter((o) => o.status === "none")
      .reduce((sum, o) => sum + o.odds * o.betMoney, 0);
    account.winBalance = (account.balance ?? 0) + unsettledExposure;
    await saveOrders(account, orders);
  } catch (err) {
    console.warn(`[${account.provider}] updateOrders`, err);
  }
}

function balanceUsesBackendRelay(account: PlatformAccount): boolean {
  return Boolean(account.proxyId);
}

function isBackendRelayErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return /3456|http-relay|127\.0\.0\.1|后端未连接|start-web|start-dev/.test(lower);
}

function isVenueNetworkError(message: string): boolean {
  const lower = message.toLowerCase();
  return /failed to fetch|networkerror|network error|econnrefused|load failed|net::err_/.test(
    lower,
  );
}

function normalizeBalanceError(err: unknown, account: PlatformAccount): string {
  const raw = err instanceof Error ? err.message : String(err || "");
  let message = raw.trim();
  if (message.startsWith("{")) {
    try {
      const parsed = JSON.parse(message) as { error?: string; hint?: string; msg?: string };
      message = parsed.msg || parsed.error || message;
      if (parsed.hint && parsed.error === "RAY not configured") {
        return "token error";
      }
    } catch {
      /* keep raw */
    }
  }
  const lower = message.toLowerCase();
  if (isVenueNetworkError(message)) {
    if (balanceUsesBackendRelay(account) || isBackendRelayErrorMessage(message)) {
      return "本机 HTTP 代理未连接，请先运行 npm run web（3456）";
    }
    return `无法连接 ${account.provider} 场馆，请检查 gateway、Token；浏览器直连时还可能是跨域 (CORS) 被拦截`;
  }
  if (/ray not configured/.test(lower)) {
    return "token error";
  }
  if (!message || /token|auth|401|403|login|credential|请先登录/.test(lower)) {
    return "token error";
  }
  return message;
}
