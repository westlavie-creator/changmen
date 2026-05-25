import type { LoseOrderRecord } from "@/types/order";
import type { BetSide } from "@/models/match";
import { toFixed } from "@/utils/format";

/** 对齐 A8 bundle `eb`（补单队列项） */
export class LoseOrder implements LoseOrderRecord {
  accountId: number;
  matchId: number;
  betId: number;
  target: BetSide;
  betMoney: number;
  betOdds: number;
  match: string;
  bet: string;
  linkId: number;
  createAt: number;
  isCreateOrder: boolean;
  betCount: number;

  constructor(raw: Partial<LoseOrderRecord>) {
    this.accountId = Number(raw.accountId) || 0;
    this.matchId = Number(raw.matchId) || 0;
    this.betId = Number(raw.betId) || 0;
    this.target = (raw.target as BetSide) || "Home";
    this.betMoney = Number(raw.betMoney) || 0;
    this.betOdds = Number(raw.betOdds) || 0;
    this.match = raw.match || "";
    this.bet = raw.bet || "";
    this.linkId = Number(raw.linkId) || 0;
    this.createAt = Number(raw.createAt) || Date.now();
    this.isCreateOrder = Boolean(raw.isCreateOrder);
    this.betCount = Number(raw.betCount) || 1;
  }

  getBetMoney(odds: number) {
    if (!odds) return 0;
    return Math.round((this.betMoney * this.betOdds) / odds);
  }

  getOdds(makeProfit = 1.01) {
    if (this.isCreateOrder) return Number(this.betOdds);
    const p = makeProfit || 1.01;
    const implied = 1 / (1 / p - 1 / this.betOdds);
    return Number(toFixed(implied));
  }

  toJSON(): LoseOrderRecord {
    return {
      accountId: this.accountId,
      matchId: this.matchId,
      betId: this.betId,
      target: this.target,
      betMoney: this.betMoney,
      betOdds: this.betOdds,
      match: this.match,
      bet: this.bet,
      linkId: this.linkId,
      createAt: this.createAt,
      isCreateOrder: this.isCreateOrder,
      betCount: this.betCount,
    };
  }
}
