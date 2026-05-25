import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import type { PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";
import { useOddsStore } from "@/stores/oddsStore";
import { toFixed } from "@/utils/format";

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
      this.betMoney = Math.round(Number(betMoneyOrTarget) || 0);
      this.target = (targetOrOdds as BetSide) || "Home";
      this.odds = Number(oddsArg) || 0;
    } else {
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
      this.betMoney = Math.round(Number(betMoneyOrTarget) || 0);
    }
  }

  updateOdds(next: number) {
    if (!next) return;
    this.newOdds = Number(toFixed(next));
    this.odds = this.newOdds;
    if (this.item) {
      const oddsStore = useOddsStore();
      oddsStore.save(this.type, {
        id: this.itemId,
        odds: this.newOdds,
        isLock: false,
        betId: this.betId,
        time: Date.now(),
      });
    }
  }
}

export function opponentSide(side: BetSide): BetSide {
  return side === "Home" ? "Away" : "Home";
}
