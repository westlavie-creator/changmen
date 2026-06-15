import { pickArbLegs, evaluateArbOrderEligibility } from "@/domain/arbitrage";
import { resolveArbProviderKeys } from "@/domain/betting";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { useMessageStore } from "@/stores/messageStore";
import { useUserStore } from "@/stores/userStore";
import { getProviders } from "@/stores/account/accountPicker";

let lastScanAt = 0;

/** 与 BetRow 红线一致：用盘口上全部平台参与检测，不依赖账号余额 */
export function scanArbTelegramNotifications(minIntervalMs = 5000) {
  const now = Date.now();
  if (now - lastScanAt < minIntervalMs) return;
  lastScanAt = now;

  const user = useUserStore();
  if (!user.message?.telegramId?.trim()) return;

  const matchStore = useMatchStore();
  const configStore = useConfigStore();
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();
  const messageStore = useMessageStore();
  const config = configStore.config;
  const autoProviderKeys = resolveArbProviderKeys("auto", {
    accountProviderKeys: getProviders(accountStore).keys(),
  });

  for (const match of matchStore.matchs) {
    for (const bet of match.bets) {
      const providerKeys = resolveArbProviderKeys("display", { bet });
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
      messageStore.arbOpportunityMessage(match, bet, legs, eligibility);
    }
  }
}
