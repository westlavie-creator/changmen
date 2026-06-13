import { pickArbLegs } from "@/shared/arbitrage";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useMatchStore } from "@/stores/matchStore";
import { useMessageStore } from "@/stores/messageStore";
import { useUserStore } from "@/stores/userStore";

import type { PlatformId } from "@/types/esport";

let lastScanAt = 0;

/** 与 BetRow 红线一致：用盘口上全部平台参与检测，不依赖账号余额/getProviders */
export function providerKeysForArbNotify(bet: {
  items: { type: PlatformId }[];
}): PlatformId[] {
  return bet.items.map((item) => item.type);
}

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
  const messageStore = useMessageStore();
  const config = configStore.config;

  for (const match of matchStore.matchs) {
    for (const bet of match.bets) {
      const providerKeys = providerKeysForArbNotify(bet);
      const legs = pickArbLegs(
        bet,
        config,
        providerKeys,
        accountStore.accounts,
        match.game,
      );
      if (legs) messageStore.arbOpportunityMessage(match, bet, legs);
    }
  }
}
