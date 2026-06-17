import { BetOption } from "@/models/betOption";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import { BetResult } from "@/models/betResult";
import type { UserConfig } from "@/types/userConfig";
import type { ArbFlowTrace } from "@/extensions/arbBet/betTrace";

export interface ArbBetReady {
  legA: BetOption;
  legB: BetOption;
  accountA?: PlatformAccount;
  accountB?: PlatformAccount;
  implied: number;
  trace: ArbFlowTrace;
  betBothLegs: boolean;
  linkId: number;
  strictA8: boolean;
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
