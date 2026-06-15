import { BetOption } from "@/models/betOption";
import { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import type { AccountStoreContext } from "@/stores/account/context";
import { useConfigStore } from "@/stores/configStore";

export function getProviders(store: AccountStoreContext, minBetMoney?: number) {
  const config = useConfigStore().config;
  const threshold = minBetMoney ?? config.betMoney;
  const map = new Map<PlatformId, PlatformAccount[]>();
  for (const acc of store.accounts) {
    const bal = acc.getBalance();
    if (bal === undefined || bal < threshold) continue;
    if (!map.has(acc.provider)) map.set(acc.provider, []);
    map.get(acc.provider)!.push(acc);
  }
  return map;
}

export function pickAccount(
  store: AccountStoreContext,
  provider: PlatformId,
  betMoney: number,
  excludeAccountIds: number[] = [],
  filter?: (acc: PlatformAccount) => boolean,
  options?: BetOption[],
) {
  if (!provider) return undefined;
  const candidates = store.accounts.filter((acc) => {
    if (excludeAccountIds.includes(acc.accountId)) return false;
    if (acc.maxOrder && acc.todayOrder && acc.todayOrder >= acc.maxOrder) return false;
    const bal = acc.getBalance();
    if (bal === undefined) return false;
    if (filter && !filter(acc)) return false;
    return acc.provider === provider && bal >= betMoney;
  });
  if (!candidates.length) return undefined;
  if (candidates.length === 1) return candidates[0];

  const gameName = options?.[0]?.match?.game;
  const configProfit = useConfigStore().config.profit;
  if (options?.length === 2 && candidates.some((a) => a.profit !== 0 || !!(gameName && a.game?.[gameName]?.profit))) {
    const implied = 1 / options.reduce((sum, o) => sum + 1 / o.odds, 0);
    const sorted = candidates
      .filter((a) => {
        if (!a.profit && !(gameName && a.game?.[gameName]?.profit)) return true;
        const floor = PlatformAccount.profitFloorForGame(a, gameName, configProfit);
        return implied >= floor;
      })
      .sort((a, b) => {
        const av = PlatformAccount.profitFloorForGame(a, gameName, configProfit);
        const bv = PlatformAccount.profitFloorForGame(b, gameName, configProfit);
        return av - bv;
      });
    if (sorted.length) return sorted[0];
  }

  const idx = store.providerPickIndex.get(provider) ?? 0;
  store.providerPickIndex.set(provider, idx + 1);
  return candidates[idx % candidates.length];
}
