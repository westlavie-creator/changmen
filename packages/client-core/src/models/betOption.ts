import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "./match";
import type { PlatformAccount } from "./platformAccount";
import type { PlatformId } from "@changmen/api-contract";
import type { UserConfig } from "../types/userConfig";
import { saveBetOptionLog } from "../bridge/bettingLog";
import { writeVenueOdds } from "../bridge/oddsAccess";

/** 整数 CNY 保持整数；带小数的 PM USDC 等保留 2 位 */
function normalizeOptionStake(value: unknown): number {
  const n = Number(value) || 0;
  const rounded = Math.round(n);
  if (Math.abs(n - rounded) < 1e-6)
    return rounded;
  return Math.round(n * 100) / 100;
}

/** 对齐 A8 bundle `Tp` */
export class BetOption {
  type: PlatformId;
  match?: ViewMatch;
  bet?: ViewBet;
  item?: ViewBetItem;
  target: BetSide;
  matchId: string;
  betId: string;
  itemId: string;
  odds: number;
  newOdds?: number;
  betMoney: number;
  betCount = 0;
  config?: UserConfig;
  loseOrder = false;
  /** 套利/jb 由 finalize/processLoseOrders 做 PM 拒单检测；跳过 placeBet 内后台轮询 */
  deferPmSettlement = false;
  data: Record<string, unknown> | null = null;
  checkError?: string;
  orderIndex = 0;
  request?: unknown;
  response?: unknown;
  startTime: number;

  constructor(
    matchOrType: ViewMatch | PlatformId,
    betOrMatchId: ViewBet | string,
    itemOrBetId: ViewBetItem | string,
    targetOrItemId: BetSide | string,
    betMoneyOrTarget?: number | BetSide,
    targetOrOdds?: BetSide | number,
    oddsArg?: number,
  ) {
    this.startTime = Date.now();
    if (typeof matchOrType === "string") {
      this.type = matchOrType;
      this.matchId = String(betOrMatchId);
      this.betId = String(itemOrBetId);
      this.itemId = String(targetOrItemId);
      this.betMoney = normalizeOptionStake(betMoneyOrTarget);
      this.target = (targetOrOdds as BetSide) || "Home";
      this.odds = Number(oddsArg) || 0;
    }
    else {
      const match = matchOrType;
      const bet = betOrMatchId as ViewBet;
      const item = itemOrBetId as ViewBetItem;
      const target = targetOrItemId as BetSide;
      this.type = item.type;
      this.match = match;
      this.bet = bet;
      this.item = item;
      this.target = target;
      this.matchId = item.matchId;
      this.betId = item.betId;
      this.itemId = item.getItemId(target);
      this.odds = item.getOdds(target);
      this.betMoney = normalizeOptionStake(betMoneyOrTarget);
    }
  }

  /** [A8 可证实] bundle `Ap.updateOdds`：只写 fo/Xn，不改 e.odds / e.newOdds */
  updateOdds(next: number) {
    writeVenueOdds(this.type, {
      id: this.itemId,
      odds: next,
      isLock: false,
      betId: this.betId,
      time: Date.now(),
    });
  }

  /** [A8 可证实] bundle `Ap.saveLog` */
  saveLog(account: PlatformAccount) {
    saveBetOptionLog(this, account);
  }
}

export function opponentSide(side: BetSide): BetSide {
  return side === "Home" ? "Away" : "Home";
}
