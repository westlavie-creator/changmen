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
  // [A8 可证实] minMoney!==0 && maxMoney!==0（0 是合法下限，不能用 truthy 判断）
  if (config.minMoney !== 0 && config.maxMoney !== 0) {
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
