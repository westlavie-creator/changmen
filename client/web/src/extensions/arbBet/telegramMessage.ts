import type { ViewBet, ViewMatch } from "@/models/match";
import type { ArbLegs } from "@/domain/arbitrage/pickArbLegs";
import { arbProfitRate, percent } from "@/shared/format";
import { NOTIFY_TYPES } from "@/types/notifyTypes";
import { useMessageStore } from "@/stores/messageStore";
import { useUserStore } from "@/stores/userStore";
import type { ArbOrderEligibility } from "@/extensions/arbBet/eligibility";
import { assessValueBet, formatValueBetTelegramLine } from "@/extensions/arbBet/valueBet";

function htmlTitle(text: string) {
  return `<b>${text}</b>`;
}

/** A8 仅在下注成功后推单群；changmen 在发现套利腿时推个人 Telegram */
export function sendArbOpportunityTelegram(
  match: ViewMatch,
  bet: ViewBet,
  legs: ArbLegs,
  eligibility: ArbOrderEligibility,
) {
  const user = useUserStore();
  if (!user.message?.telegramId?.trim()) return;

  const messageStore = useMessageStore();
  const idx = NOTIFY_TYPES.indexOf("OrderNotify");
  const key = `${match.id}:${bet.id}:${legs.homeItem.type}:${legs.awayItem.type}`;
  if (!messageStore.shouldNotify(idx, key, 600)) return;

  const value = assessValueBet(bet.id, legs);
  const statusLine = eligibility.canOrder
    ? "🟢 <b>可自动下单</b>"
    : "🔴 <b>无法自动下单</b>";
  const reasonLines = eligibility.canOrder
    ? eligibility.reasons.map((r) => `⚠️ ${r}`)
    : eligibility.reasons.map((r) => `• ${r}`);
  const body = [
    htmlTitle("套利机会"),
    match.title,
    bet.getBetName(),
    statusLine,
    ...reasonLines,
    "<blockquote>",
    `${legs.homeItem.type} 主胜 @ ${legs.homeOdds}`,
    `${legs.awayItem.type} 客胜 @ ${legs.awayOdds}`,
    `对冲 ${percent(legs.implied)} / 利润 ${arbProfitRate(legs.implied)}`,
    formatValueBetTelegramLine(value),
    "</blockquote>",
  ].join("\n");
  messageStore.enqueueTelegram(body);
}
