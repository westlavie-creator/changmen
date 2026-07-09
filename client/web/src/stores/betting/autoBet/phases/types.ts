import type { BetOption } from "@/models/betOption";
import type { BetResult } from "@/models/betResult";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ArbExecutionTrace } from "@/stores/betting/autoBet/arbExecutionTrace";
import type { UserConfig } from "@/types/userConfig";

export interface ArbBetReady {
  legA: BetOption;
  legB: BetOption;
  /** 本腿自动下单账号（9999 侧无） */
  accountA?: PlatformAccount;
  accountB?: PlatformAccount;
  /** 预检账号（9999 单边时本侧用 9999 账号仅预检） */
  checkAccountA?: PlatformAccount;
  checkAccountB?: PlatformAccount;
  implied: number;
  betBothLegs: boolean;
  /** 比例 9999 触发：本侧仅预检，对侧 live 腿真下单 */
  singleLegByRate: boolean;
  linkId: number;
}

export interface ArbBetChecked extends ArbBetReady {
  waitSec: number;
}

/**
 * place 阶段回传编排层的腿态（与场馆 settle 解耦）。
 * 场馆 filled/rejected/pending_confirm 仍由 settleArbLeg 判定。
 */
export type ArbLegPlaceOutcome =
  | "filled_pending_settle"
  | "api_failed"
  | "not_attempted";

export interface ArbBetPlaced extends ArbBetChecked {
  resultA?: BetResult;
  resultB?: BetResult;
  /** 有下单账号的腿必填；9999 无账号侧为 not_attempted */
  placeOutcomeA: ArbLegPlaceOutcome;
  placeOutcomeB: ArbLegPlaceOutcome;
}

/** 由 result + 是否发起下单推导 place 腿态 */
export function resolveArbLegPlaceOutcome(
  attempted: boolean,
  result?: BetResult,
): ArbLegPlaceOutcome {
  if (!attempted)
    return "not_attempted";
  if (result?.success)
    return "filled_pending_settle";
  return "api_failed";
}

export interface ArbBetAttemptParams {
  match: ViewMatch;
  bet: ViewBet;
  config: UserConfig;
  setMessage: (msg: string) => void;
  /** [changmen 扩展] 套利执行进度；由 prepare 在检测到腿后懒创建 */
  trace?: ArbExecutionTrace;
}
