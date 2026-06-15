import { resolveArbProviderKeys } from "@/domain/betting";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { executeArbBet } from "@/stores/betting/autoBet/executeArbBet";

export interface AutoBetTickContext {
  setMessage: (msg: string) => void;
  processLoseOrders: () => Promise<void>;
}

/** [A8 可证实] 自动投注主循环体（Vg + Io + jb）；config.betting 为 true 时由 runTick 调用 */
export async function runAutoBetTick(ctx: AutoBetTickContext): Promise<void> {
  const configStore = useConfigStore();
  const matchStore = useMatchStore();
  const accountStore = useAccountStore();
  const loseStore = useLoseOrderStore();
  const { setMessage, processLoseOrders } = ctx;

  loseStore.ensureOrdersMap();
  loseStore.removeOrders(matchStore.matchs.flatMap((m) => m.bets.map((b) => b.id)));

  const config = configStore.config;
  if (config.minMoney && config.maxMoney) {
    config.betMoney =
      Math.floor(Math.random() * (config.maxMoney - config.minMoney + 1)) + config.minMoney;
  }

  const providerKeys = resolveArbProviderKeys("auto", {
    accountProviderKeys: accountStore.getProviders().keys(),
  });
  if (!providerKeys.length) return;

  for (const match of matchStore.matchs) {
    for (const bet of match.bets) {
      await executeArbBet({ match, bet, config, providerKeys, setMessage });
    }
  }

  if (loseStore.orders.size && config.makeUp) {
    await processLoseOrders();
  }
}
