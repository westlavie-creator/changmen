import { pickArbLegs } from "@/domain/arbitrage/pickArbLegs";
import { providerKeysFromBetItems, resolveArbProviderKeys } from "@/domain/betting";
import { evaluateArbOrderEligibility } from "@/extensions/arbBet/eligibility";
import { sendArbOpportunityTelegram, type ArbOpportunityNotifyResult } from "@/extensions/arbBet/telegramMessage";
import type { ViewBet, ViewMatch } from "@/models/match";
import { isA8StrictMode } from "@/shared/a8Strict";
import { getProviders } from "@/stores/account/accountPicker";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useUserStore } from "@/stores/userStore";

/** [changmen 扩展] 全盘口机会雷达节流（原 telegramScan；A8 无此能力） */
export const OPPORTUNITY_SCAN_INTERVAL_MS = 5000;

let lastOpportunityScanAt: number | null = null;

/** 本轮主循环是否应做全盘口机会扫描（5s 节流 + 严格 A8 / Telegram 门控） */
export function shouldRunOpportunityScan(
  minIntervalMs = OPPORTUNITY_SCAN_INTERVAL_MS,
): boolean {
  if (isA8StrictMode()) return false;

  const user = useUserStore();
  if (!user.message?.telegramId?.trim()) return false;

  const now = Date.now();
  if (
    lastOpportunityScanAt !== null &&
    now - lastOpportunityScanAt < minIntervalMs
  ) {
    return false;
  }
  lastOpportunityScanAt = now;
  return true;
}

/** 单盘口：display 腿扫描 + 可下单评估 + Telegram（调用方保证本轮已开启机会扫描） */
export function notifyArbOpportunityForBet(
  match: ViewMatch,
  bet: ViewBet,
): ArbOpportunityNotifyResult | null {
  const configStore = useConfigStore();
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();
  const matchStore = useMatchStore();
  const config = configStore.config;

  const providerKeys = providerKeysFromBetItems(bet);
  const legs = pickArbLegs(
    bet,
    config,
    providerKeys,
    accountStore.accounts,
    match.game,
  );
  if (!legs) return null;

  const autoProviderKeys = resolveArbProviderKeys("auto", {
    accountProviderKeys: getProviders(accountStore).keys(),
  });
  const autoLegs = pickArbLegs(
    bet,
    config,
    autoProviderKeys,
    accountStore.accounts,
    match.game,
  );

  const eligibility = evaluateArbOrderEligibility({
    match,
    bet,
    legs,
    config,
    accounts: accountStore.accounts,
    autoProviderKeys,
    loseOrderPending: loseStore.orders.has(bet.id),
    getBetTarget: (provider, betId) => matchStore.getBetTarget(provider, betId),
  });

  return sendArbOpportunityTelegram(match, bet, legs, eligibility, {
    autoProviderKeys,
    autoLegs: autoLegs ?? null,
  });
}

/** @internal 测试重置节流时钟 */
export function resetOpportunityScanThrottleForTest(): void {
  lastOpportunityScanAt = null;
}
