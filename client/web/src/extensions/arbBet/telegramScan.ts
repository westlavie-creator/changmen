import { pickArbLegs } from "@/domain/arbitrage/pickArbLegs";
import { providerKeysFromBetItems } from "@/domain/betting/providerKeys";
import { evaluateArbOrderEligibility } from "@/extensions/arbBet/eligibility";
import { sendArbOpportunityTelegram } from "@/extensions/arbBet/telegramMessage";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useUserStore } from "@/stores/userStore";
import { getProviders } from "@/stores/account/accountPicker";
import { resolveArbProviderKeys } from "@/domain/betting";

let lastScanAt = 0;

/** 赔率刷新后扫描全盘口套利腿并推 Telegram（5s 节流） */
export function onOddsRefreshed(minIntervalMs = 5000) {
  const now = Date.now();
  if (now - lastScanAt < minIntervalMs) return;
  lastScanAt = now;

  const user = useUserStore();
  if (!user.message?.telegramId?.trim()) return;

  const matchStore = useMatchStore();
  const configStore = useConfigStore();
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();
  const config = configStore.config;
  const autoProviderKeys = resolveArbProviderKeys("auto", {
    accountProviderKeys: getProviders(accountStore).keys(),
  });

  for (const match of matchStore.matchs) {
    for (const bet of match.bets) {
      const providerKeys = providerKeysFromBetItems(bet);
      const legs = pickArbLegs(
        bet,
        config,
        providerKeys,
        accountStore.accounts,
        match.game,
      );
      if (!legs) continue;
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
      sendArbOpportunityTelegram(match, bet, legs, eligibility);
    }
  }
}
