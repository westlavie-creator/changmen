import type { AccountRecord, AccountCurrency } from "@/types/account";
import type { PlatformId } from "@/types/esport";
import { ALL_PLATFORMS } from "@/types/userConfig";
import { readGameBetCount } from "@/shared/bettingSession";
import { resolveAccountMultiply } from "@changmen/shared/account_multiply.mjs";

/** [changmen 扩展] rateConfig.rate === 9999 表示该赔率区间不参与投注 */
const RATE_SKIP = 9999;

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
  /** 对齐 A8 uv：连续接口异常计数（如 redis:nil） */
  errorCount = 0;

  constructor(raw: Partial<AccountRecord>) {
    this.accountId = Number(raw.accountId) || 0;
    this.platformId = raw.platformId;
    this.platformName = raw.platformName;
    this.playerName = raw.playerName || "";
    this.provider = (raw.provider as PlatformId) || "OB";
    // A8 uv 构造/update 均不恢复 balance，仅 updateBalance() 成功后才有值
    const { balance: _storedBalance, ...rest } = raw;
    Object.assign(this, rest);
    this.balance = undefined;
    this.credit = raw.credit ?? 0;
    this.currency = raw.currency ?? "CNY";
    this.updateTime = raw.updateTime ?? 0;
    this.today = raw.today ?? 0;
    this.orderCount = raw.orderCount ?? 0;
    this.unsettle = raw.unsettle ?? 0;
    this.multiply = resolveAccountMultiply(this.provider, raw.multiply);
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
    if (rate === RATE_SKIP) return 0;
    return money < 1 ? money : Math.floor(money * rate);
  }

  /** 比例 9999 时不选该账号（套利变单边） */
  canBetAtOdds(odds: number): boolean {
    if (!this.rateConfig?.length) return true;
    const row = this.rateConfig.find(
      (r) =>
        (r.minOdds === 0 || r.minOdds <= odds) && (r.maxOdds === 0 || r.maxOdds >= odds),
    );
    return (row?.rate ?? 1) !== RATE_SKIP;
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

  /** 对齐 A8 `uv.isPause`：当前小时是否落在任一 workTimes 区间（格式 `9-18`） */
  static isWithinWorkTimes(workTimes: string[] | undefined): boolean {
    if (!workTimes?.length) return true;
    const hour = new Date().getHours();
    let inRange = false;
    for (const slot of workTimes) {
      const [startRaw, endRaw] = slot.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (Number.isNaN(start) || Number.isNaN(end)) continue;
      if (start <= hour && hour <= end) {
        inRange = true;
        break;
      }
    }
    return inRange;
  }

  /** 账号游戏配置：赔率区间 `min-max` 列表 */
  static passesGameOddsRanges(ranges: string[] | undefined, odds: number): boolean {
    if (!ranges?.length) return true;
    return ranges.some((raw) => {
      const [lo, hi] = raw.split("-").map((x) => Number(x));
      return !Number.isNaN(lo) && !Number.isNaN(hi) && lo <= odds && odds <= hi;
    });
  }

  /** 该游戏最低利润要求：游戏级 > 账号级 > 全局默认 */
  static profitFloorForGame(
    account: PlatformAccount,
    gameName: string | undefined,
    configProfit: number,
  ): number {
    const gameProfit = gameName ? account.game?.[gameName]?.profit : 0;
    if (gameProfit) return gameProfit;
    if (account.profit) return account.profit;
    return configProfit;
  }

  /** 对齐 A8 账号编辑「游戏配置」：利润 / 订单数 / 赔率区间 */
  passesGameSettings(gameName: string, odds: number, implied?: number): boolean {
    const row = this.game?.[gameName];
    if (!row) return true;
    if (row.profit && implied != null && implied < row.profit) return false;
    if (row.betCount && readGameBetCount(this.accountId, gameName) >= row.betCount) {
      return false;
    }
    if (!PlatformAccount.passesGameOddsRanges(row.odds, odds)) return false;
    return true;
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
    if (this.workTimes?.length && !PlatformAccount.isWithinWorkTimes(this.workTimes)) {
      return "不在工作时间";
    }
    return false;
  }

  /** 对齐 A8 uv.logout：清空会话，停止使用该账号下单 */
  logout() {
    this.balance = undefined;
    this.token = undefined;
    this.errorCount = 0;
  }

  applyPatch(patch: Partial<AccountRecord> & { balanceError?: string | null }) {
    const { balanceError, balance, rateConfig, game, workTimes, ...rest } = patch;
    Object.assign(this, rest);
    if (rateConfig !== undefined) {
      this.rateConfig = rateConfig.map((r) => ({
        minOdds: Number(r.minOdds) || 0,
        maxOdds: Number(r.maxOdds) || 0,
        rate: Number(r.rate),
      }));
    }
    if (game !== undefined) {
      this.game = JSON.parse(JSON.stringify(game));
    }
    if (workTimes !== undefined) {
      this.workTimes = [...workTimes];
    }
    if (balance !== undefined) {
      this.balance = balance == null ? undefined : Number(balance);
    }
    if (balanceError !== undefined) {
      this.balanceError = balanceError;
    }
    if (rest.multiply !== undefined) {
      this.multiply = resolveAccountMultiply(this.provider, rest.multiply);
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
