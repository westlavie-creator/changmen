import { defineStore } from "pinia";
import { PlatformAccount } from "@/models/platformAccount";
import type { AccountRecord } from "@/types/account";
import type { PlatformId } from "@/types/esport";
import { BetOption } from "@/models/betOption";
import * as accountCrud from "@/stores/account/accountCrud";
import { getProviders, pickAccount } from "@/stores/account/accountPicker";
import * as balanceRefresh from "@/stores/account/balanceRefresh";
import { checkBetting, placeBet } from "@/stores/account/betGateway";
import * as venueOrders from "@/stores/account/venueOrders";

/** 对齐 A8 Pinia `Io` */
export const useAccountStore = defineStore("account", {
  state: () => ({
    accounts: [] as PlatformAccount[],
    tagPlatforms: [] as import("@/types/esport").TagPlatformRow[],
    loaded: false,
    loading: false,
    /** A8 Io.f 连续轮询开关（loadAccounts(true) 置位） */
    balanceRefreshRunning: false,
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
      const id = Number(accountId);
      return this.accounts.find((a) => Number(a.accountId) === id);
    },

    openCreateAccount() {
      accountCrud.openCreateAccount(this);
    },

    openEditAccount(account: PlatformAccount) {
      accountCrud.openEditAccount(this, account);
    },

    closeAccountDialog() {
      accountCrud.closeAccountDialog(this);
    },

    loadTagPlatforms() {
      return accountCrud.loadTagPlatforms(this);
    },

    loadAccounts(refreshBalances = false) {
      return accountCrud.loadAccounts(this, refreshBalances);
    },

    saveAccounts() {
      return accountCrud.persistAccounts(this);
    },

    createFromTagPlatform(
      form: Partial<AccountRecord> & {
        platformName: string;
        playerName: string;
        provider: AccountRecord["provider"];
      },
    ) {
      return accountCrud.createFromTagPlatform(this, form);
    },

    deleteAccount(accountId: number) {
      return accountCrud.deleteAccount(this, accountId);
    },

    refreshBalance(account: PlatformAccount) {
      return balanceRefresh.refreshAccountBalance(this, account);
    },

    updateVenueOrders(account: PlatformAccount) {
      return venueOrders.updateVenueOrders(account);
    },

    refreshAllFromVenues() {
      return balanceRefresh.refreshAllFromVenues(this, false);
    },

    refreshAllBalances() {
      return this.refreshAllFromVenues();
    },

    startBalanceRefreshLoop() {
      balanceRefresh.startBalanceRefreshLoop(this);
    },

    stopBalanceRefreshLoop() {
      balanceRefresh.stopBalanceRefreshLoop(this);
    },

    saveMoneyLogForAccount(
      accountId: number,
      money: number,
      type: "Recharge" | "Withdraw" | string,
      description = "",
    ) {
      return accountCrud.saveMoneyLogForAccount(this, accountId, money, type, description);
    },

    getProviders(minBetMoney?: number) {
      return getProviders(this, minBetMoney);
    },

    getAccount(
      provider: PlatformId,
      betMoney: number,
      excludeAccountIds: number[] = [],
      filter?: (acc: PlatformAccount) => boolean,
      options?: BetOption[],
    ) {
      return pickAccount(this, provider, betMoney, excludeAccountIds, filter, options);
    },

    checkBetting(account: PlatformAccount | undefined, option: BetOption) {
      return checkBetting(this, account, option);
    },

    betting(account: PlatformAccount | undefined, option: BetOption, toastSeconds = 10) {
      return placeBet(this, account, option, toastSeconds);
    },
  },
});
