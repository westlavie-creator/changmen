import { executeArbBet } from "@/stores/betting/autoBet/executeArbBet";
import { useConfigStore } from "@/stores/configStore";
import { useMatchStore } from "@/stores/matchStore";

export interface A8ArbRoundContext {
  setMessage: (msg: string) => void;
}

/** [A8 可证实] 主循环单轮套利段：遍历全部盘口 → executeArbBet */
export async function runA8ArbRound(ctx: A8ArbRoundContext): Promise<void> {
  const configStore = useConfigStore();
  const matchStore = useMatchStore();
  const config = configStore.config;
  const { setMessage } = ctx;

  if (!config.betting) return;

  for (const match of matchStore.matchs) {
    for (const bet of match.bets) {
      await executeArbBet({ match, bet, config, setMessage });
    }
  }
}
