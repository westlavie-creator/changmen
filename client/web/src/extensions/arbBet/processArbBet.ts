import type { ViewBet, ViewMatch } from "@/models/match";
import type { UserConfig } from "@/types/userConfig";
import { notifyArbOpportunityForBet } from "@/extensions/arbBet/arbOpportunityScan";
import { executeArbBet } from "@/stores/betting/autoBet/executeArbBet";

export interface ProcessArbBetParams {
  match: ViewMatch;
  bet: ViewBet;
  config: UserConfig;
  setMessage: (msg: string) => void;
  /** 本轮主循环已开启 5s 节流的机会扫描 */
  notifyOpportunity: boolean;
}

/**
 * [changmen 扩展] 单盘口编排：机会通知（display 腿）→ A8 执行路径（auto 腿）。
 * 机会与 execute 同一顺序，避免异步 onOddsRefreshed 时序错位。
 */
export async function processArbBet(params: ProcessArbBetParams): Promise<void> {
  const { match, bet, config, setMessage, notifyOpportunity } = params;

  if (notifyOpportunity) {
    notifyArbOpportunityForBet(match, bet);
  }

  if (!config.betting) return;

  await executeArbBet({ match, bet, config, setMessage });
}
