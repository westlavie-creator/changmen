import { BetOption } from "@/models/betOption";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import { BetResult } from "@/models/betResult";
import type { UserConfig } from "@/types/userConfig";

export interface ArbBetReady {
  legA: BetOption;
  legB: BetOption;
  accountA?: PlatformAccount;
  accountB?: PlatformAccount;
  implied: number;
  betBothLegs: boolean;
  /** 比例 9999 触发：仅对侧 live 腿真下单 */
  singleLegByRate: boolean;
  linkId: number;
}

export interface ArbBetChecked extends ArbBetReady {
  waitSec: number;
}

export interface ArbBetPlaced extends ArbBetChecked {
  resultA?: BetResult;
  resultB?: BetResult;
}

export interface ArbBetAttemptParams {
  match: ViewMatch;
  bet: ViewBet;
  config: UserConfig;
  setMessage: (msg: string) => void;
}
