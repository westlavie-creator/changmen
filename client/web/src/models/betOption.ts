import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";
import { saveUserLog } from "@/api/chat";
import { toFixed } from "@/shared/format";
import { useAccountStore } from "@/stores/accountStore";
import { useOddsStore } from "@/stores/oddsStore";

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
      this.betMoney = Math.round(Number(betMoneyOrTarget) || 0);
    }
  }

  /** [A8 可证实] bundle `Ap.updateOdds`：只写 fo/Xn，不改 e.odds / e.newOdds */
  updateOdds(next: number) {
    const oddsStore = useOddsStore();
    oddsStore.save(this.type, {
      id: this.itemId,
      odds: Number(toFixed(next)),
      isLock: false,
      betId: this.betId,
      time: Date.now(),
    });
  }

  /** [A8 可证实] bundle `Ap.saveLog` */
  saveLog(account: PlatformAccount) {
    const accountStore = useAccountStore();
    const platformLabel = accountStore.getPlatformName(
      account.platformId,
      account.platformName,
    );
    const title = `[${this.type}](${platformLabel},${account.playerName}) 请求盘口数据 => ${!!this.data} / 耗时${Date.now() - this.startTime}ms / ${this.odds}:${this.newOdds || "N/A"}`;
    void saveUserLog(title, {
      options: {
        type: this.type,
        match: this.match?.title,
        matchId: this.matchId,
        bet: this.bet?.getBetName(),
        betId: this.betId,
        target: this.target,
        itemId: this.itemId,
        odds: this.odds,
        newOdds: this.newOdds,
        betMoney: this.betMoney,
        betCount: this.betCount,
        config: this.config,
        loseOrder: this.loseOrder,
      },
      checkError: this.checkError,
      response: this.response,
      request: this.request,
      data: this.data,
    });
  }
}

export function opponentSide(side: BetSide): BetSide {
  return side === "Home" ? "Away" : "Home";
}
