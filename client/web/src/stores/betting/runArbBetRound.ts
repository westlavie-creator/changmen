import { shouldRunOpportunityScan } from "@/extensions/arbBet/arbOpportunityScan";
import { processArbBet } from "@/extensions/arbBet/processArbBet";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";

export interface ArbBetRoundContext {
  setMessage: (msg: string) => void;
  processLoseOrders: () => Promise<void>;
}

/**
 * 主循环单轮：遍历盘口 → 机会通知（changmen 扩展，5s 节流）→ A8 自动下单（config.betting）。
 */
export async function runArbBetRound(ctx: ArbBetRoundContext): Promise<void> {
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

  const notifyOpportunity = shouldRunOpportunityScan();

  for (const match of matchStore.matchs) {
    for (const bet of match.bets) {
      await processArbBet({ match, bet, config, setMessage, notifyOpportunity });
    }
  }

  if (loseStore.orders.size && config.makeUp && config.betting) {
    await processLoseOrders();
  }
}
