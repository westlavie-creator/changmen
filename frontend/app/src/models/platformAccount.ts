import type { AccountRecord, AccountCurrency } from "@/types/account";
import type { PlatformId } from "@/types/esport";
import { ALL_PLATFORMS } from "@/types/userConfig";

const DEFAULT_GAMES = ["英雄联盟", "DOTA2", "CS:GO", "王者荣耀", "无畏契约"];

/** 对齐 A8 bundle `uv`（单平台投注账号） */
export class PlatformAccount implements AccountRecord {
  accountId: number;
  platformId?: number;
  platformName?: string;
  playerName: string;
  provider: PlatformId;
  proxyId?: number;
  gateway?: string;
  token?: string;
  referer?: string;
  userAgent?: string;
  cookie?: string;
  balance?: number;
  credit?: number;
  currency: AccountCurrency | string;
  updateTime: number;
  loadingBalance = false;
  balanceError: string | null = null;
  active = false;
  today = 0;
  orderCount = 0;
  unsettle = 0;
  maxBalance = 0;
  maxBalanceOdds = 2;
  minOdds = 0;
  maxOdds = 0;
  minDefault = 0;
  maxDefault = 0;
  totalProfit?: number;
  maxProfit?: number;
  maxOrder = 0;
  todayOrder = 0;
  description?: string;
  maxWinBalance = 0;
  winBalance = 0;
  markupOnly = false;
  noMarkup = false;
  pause = false;
  realName?: string;
  mobile?: string;
  city?: string;
  rateConfig: AccountRecord["rateConfig"] = [];
  profit = 0;
  maxBetCount = 0;
  game: AccountRecord["game"] = {};
  workTimes?: string[];
  lastOdds?: boolean;
  multiply = 1;

  constructor(raw: Partial<AccountRecord>) {
    this.accountId = Number(raw.accountId) || 0;
    this.platformId = raw.platformId;
    this.platformName = raw.platformName;
    this.playerName = raw.playerName || "";
    this.provider = (raw.provider as PlatformId) || "OB";
    Object.assign(this, raw);
    this.credit = raw.credit ?? 0;
    this.currency = raw.currency ?? "CNY";
    this.updateTime = raw.updateTime ?? 0;
    this.today = raw.today ?? 0;
    this.orderCount = raw.orderCount ?? 0;
    this.unsettle = raw.unsettle ?? 0;
    for (const g of DEFAULT_GAMES) {
      if (!this.game?.[g]) {
        this.game = { ...this.game, [g]: { betCount: 0, profit: 0, odds: [] } };
      }
    }
  }

  getBalance(): number | undefined {
    return this.balance;
  }

  getBetMoney(amount: number, odds: number) {
    let money = Math.round(amount);
    if (!this.rateConfig?.length) return money;
    const row = this.rateConfig.find(
      (r) =>
        (r.minOdds === 0 || r.minOdds <= odds) && (r.maxOdds === 0 || r.maxOdds >= odds),
    );
    const rate = row?.rate ?? 1;
    return money < 1 ? money : Math.floor(money * (rate || 1));
  }

  getMinOdds() {
    const extra =
      this.maxBalance && (this.balance ?? 0) >= this.maxBalance ? this.maxBalanceOdds : 0;
    return Math.max(this.minOdds, extra);
  }

  getMaxOdds() {
    return this.maxOdds === 0 ? 99 : this.maxOdds;
  }

  checkOdds(odds: number, _gameId?: number) {
    return this.getMinOdds() <= odds && this.getMaxOdds() >= odds;
  }

  isPause(): string | false {
    if (this.pause) return "手动设定账号暂停";
    if (this.maxOrder && this.todayOrder >= this.maxOrder) {
      return `当日订单 ${this.todayOrder} 笔，超过设定 ${this.maxOrder}`;
    }
    if (this.maxProfit && this.totalProfit && this.totalProfit >= this.maxProfit) {
      return `整体盈利 ${this.totalProfit}，超过设定 ${this.maxProfit}`;
    }
    if (this.maxWinBalance && this.winBalance && this.winBalance >= this.maxWinBalance) {
      return `盈利余额 ${this.winBalance}，超过设定 ${this.maxWinBalance}`;
    }
    return false;
  }

  applyPatch(patch: Partial<AccountRecord> & { balanceError?: string | null }) {
    const { balanceError, balance, ...rest } = patch;
    Object.assign(this, rest);
    if (balance !== undefined) {
      this.balance = balance == null ? undefined : Number(balance);
    }
    if (balanceError !== undefined) {
      this.balanceError = balanceError;
    }
  }

  toJSON(): AccountRecord {
    const { loadingBalance: _lb, balanceError: _be, ...rest } = this;
    return JSON.parse(JSON.stringify(rest)) as AccountRecord;
  }

  static sortByProvider(a: PlatformAccount, b: PlatformAccount) {
    const ia = ALL_PLATFORMS.indexOf(a.provider);
    const ib = ALL_PLATFORMS.indexOf(b.provider);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  }
}
