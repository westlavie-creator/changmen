import type { ViewBet, ViewMatch } from "@/models/match";
import type { ArbLegs } from "@/domain/arbitrage/pickArbLegs";
import type { ArbOrderEligibility } from "@/extensions/arbBet/eligibility";
import { useMessageStore } from "@/stores/messageStore";

/** [changmen 扩展] 发现套利腿时推个人 Telegram（入口统一在 messageStore） */
export function sendArbOpportunityTelegram(
  match: ViewMatch,
  bet: ViewBet,
  legs: ArbLegs,
  eligibility: ArbOrderEligibility,
) {
  useMessageStore().arbOpportunityMessage(match, bet, legs, eligibility);
}
