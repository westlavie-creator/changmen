import { accountsFundingReady } from "@/stores/account/accountPicker";
import { useAccountStore } from "@/stores/accountStore";
import { runA8ArbRound } from "@/stores/betting/a8/runA8ArbRound";
import { runKakaxiArbRound } from "@/stores/betting/kakaxi/runKakaxiArbRound";
import { useConfigStore } from "@/stores/configStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { usesKakaxiArbDetectEngine } from "@/types/arbDetectEngine";

export interface ArbBetRoundContext {
  setMessage: (msg: string) => void;
  processLoseOrders: () => Promise<void>;
}

/** 主循环单轮：按执行模式调度套利 + 补单 */
export async function runArbBetRound(ctx: ArbBetRoundContext): Promise<void> {
  const configStore = useConfigStore();
  const loseStore = useLoseOrderStore();
  const { setMessage, processLoseOrders } = ctx;

  const config = configStore.config;

  if (config.betting) {
    if (!accountsFundingReady(useAccountStore()))
      return;

    if (usesKakaxiArbDetectEngine(config)) {
      await runKakaxiArbRound({ setMessage });
    }
    else {
      await runA8ArbRound({ setMessage });
    }
  }

  if (loseStore.orders.size && config.makeUp) {
    await processLoseOrders();
  }
}
