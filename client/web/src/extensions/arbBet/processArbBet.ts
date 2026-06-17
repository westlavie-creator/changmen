import type { ViewBet, ViewMatch } from "@/models/match";
import type { UserConfig } from "@/types/userConfig";
import {
  hasOpportunityPending,
  markOpportunityPending,
} from "@/extensions/arbBet/arbOpportunityLink";
import { notifyArbOpportunityForBet } from "@/extensions/arbBet/arbOpportunityScan";
import { executeArbBet } from "@/stores/betting/autoBet/executeArbBet";
import { useMessageStore } from "@/stores/messageStore";

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
    const opp = notifyArbOpportunityForBet(match, bet);
    if (opp?.sent && opp.canOrder && config.betting) {
      markOpportunityPending(match.id, bet.id);
    }
  }

  if (!config.betting) return;

  await executeArbBet({ match, bet, config, setMessage });

  if (hasOpportunityPending(match.id, bet.id)) {
    useMessageStore().arbExecutionFollowUpMessage(
      match,
      bet,
      "本轮已尝试执行，未见成功下单推送（执行腿可能与展示腿不一致，或利润/账号不满足）",
    );
  }
}
