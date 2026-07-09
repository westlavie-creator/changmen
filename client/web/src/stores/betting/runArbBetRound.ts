import { accountsFundingReady } from "@/stores/account/accountPicker";
import { useAccountStore } from "@/stores/accountStore";
import { runA8ArbRound } from "@/stores/betting/a8/runA8ArbRound";
import { processPendingOrderBinds } from "@/stores/betting/pendingOrderBind";
import { useUserStore } from "@/stores/userStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";

export interface ArbBetRoundContext {
  setMessage: (msg: string) => void;
  processLoseOrders: () => Promise<void>;
}

/** 主循环单轮：按执行模式调度套利 + 补单 */
export async function runArbBetRound(ctx: ArbBetRoundContext): Promise<void> {
  const user = useUserStore();
  const loseStore = useLoseOrderStore();
  const { setMessage, processLoseOrders } = ctx;

  const config = user.config;

  // [changmen 扩展] 上一轮 Bind 失败的补绑（不依赖 betting 开关）
  await processPendingOrderBinds();

  // [A8 可证实] 资金未就绪只跳过套利轮；补单在 makeUp 开启时仍消费队列
  if (config.betting && accountsFundingReady(useAccountStore())) {
    await runA8ArbRound({ setMessage });
  }

  if (loseStore.orders.size && config.makeUp) {
    await processLoseOrders();
  }
}
