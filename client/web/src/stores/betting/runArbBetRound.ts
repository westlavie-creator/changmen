import { accountsFundingReady } from "@/stores/account/accountPicker";
import { useAccountStore } from "@/stores/accountStore";
import { runA8ArbRound } from "@/stores/betting/a8/runA8ArbRound";
import { peekPendingOrderBinds, processPendingOrderBinds } from "@/stores/betting/pendingOrderBind";
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
  const hasPending = peekPendingOrderBinds().length > 0;
  const needMakeUp = Boolean(config.makeUp && loseStore.orders.size);
  const needBetting = Boolean(config.betting && accountsFundingReady(useAccountStore()));

  if (!hasPending && !needMakeUp && !needBetting)
    return;

  // [changmen 扩展] 上一轮 Bind 失败的补绑（不依赖 betting 开关）
  if (hasPending)
    await processPendingOrderBinds();

  // [A8 可证实] 资金未就绪只跳过套利轮；补单在 makeUp 开启时仍消费队列
  if (needBetting)
    await runA8ArbRound({ setMessage });

  if (needMakeUp)
    await processLoseOrders();
}
