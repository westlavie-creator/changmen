import { executeArbBet } from "@/stores/betting/autoBet/executeArbBet";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";

export interface ArbBetRoundContext {
  setMessage: (msg: string) => void;
  processLoseOrders: () => Promise<void>;
}

/** 主循环单轮：遍历盘口 → A8 自动下单（config.betting） */
export async function runArbBetRound(ctx: ArbBetRoundContext): Promise<void> {
  const configStore = useConfigStore();
  const matchStore = useMatchStore();
  const loseStore = useLoseOrderStore();
  const { setMessage, processLoseOrders } = ctx;

  const config = configStore.config;

  if (config.betting) {
    for (const match of matchStore.matchs) {
      for (const bet of match.bets) {
        await executeArbBet({ match, bet, config, setMessage });
      }
    }
  }

  if (loseStore.orders.size && config.makeUp) {
    await processLoseOrders();
  }
}
