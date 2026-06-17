import type { ViewBet, ViewMatch } from "@/models/match";
import type { ArbLegs } from "@/domain/arbitrage/pickArbLegs";
import type { ArbOrderEligibility } from "@/extensions/arbBet/eligibility";
import type { PlatformId } from "@/types/esport";
import { useMessageStore } from "@/stores/messageStore";

export interface ArbOpportunityNotifyMeta {
  autoProviderKeys: PlatformId[];
  autoLegs: ArbLegs | null;
}

export interface ArbOpportunityNotifyResult {
  sent: boolean;
  canOrder: boolean;
}

/** [changmen 扩展] 发现套利腿时推个人 Telegram（入口统一在 messageStore） */
export function sendArbOpportunityTelegram(
  match: ViewMatch,
  bet: ViewBet,
  legs: ArbLegs,
  eligibility: ArbOrderEligibility,
  meta: ArbOpportunityNotifyMeta,
): ArbOpportunityNotifyResult {
  const sent = useMessageStore().arbOpportunityMessage(match, bet, legs, eligibility, meta);
  return { sent, canOrder: eligibility.canOrder };
}
