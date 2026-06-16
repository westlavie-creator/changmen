import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { executeArbBet } from "@/stores/betting/autoBet/executeArbBet";

export interface AutoBetTickContext {
  setMessage: (msg: string) => void;
  processLoseOrders: () => Promise<void>;
}

/** [A8 可证实] 自动投注主循环体（Vg + Io + jb）；config.betting 时由 mainBetLoop 每轮调用 */
export async function runAutoBetTick(ctx: AutoBetTickContext): Promise<void> {
  const configStore = useConfigStore();
  const matchStore = useMatchStore();
  const loseStore = useLoseOrderStore();
  const { setMessage, processLoseOrders } = ctx;

  const config = configStore.config;
  if (config.minMoney && config.maxMoney) {
    config.betMoney =
      Math.floor(Math.random() * (config.maxMoney - config.minMoney + 1)) + config.minMoney;
  }

  for (const match of matchStore.matchs) {
    for (const bet of match.bets) {
      await executeArbBet({ match, bet, config, setMessage });
    }
  }

  if (loseStore.orders.size && config.makeUp) {
    await processLoseOrders();
  }
}
