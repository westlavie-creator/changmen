import type { ArbBetAttemptParams } from "@/stores/betting/autoBet/phases/types";
import {
  createArbExecutionTrace,
  type ArbExecutionTrace,
  type ArbProgressPayload,
} from "@/stores/betting/autoBet/arbExecutionTrace";
import { useMessageStore } from "@/stores/messageStore";
import { useUserStore } from "@/stores/userStore";

/** [changmen 扩展] 是否发送套利执行进度 Telegram */
export function shouldSendArbProgress(): boolean {
  const user = useUserStore();
  if (!user.message?.telegramId?.trim()) return false;
  return user.message.notifyArbProgress === true;
}

/** 单次 executeArbBet 开头创建 trace（需已开启投注且 notifyArbProgress） */
export function beginArbExecutionTrace(params: ArbBetAttemptParams): ArbExecutionTrace | undefined {
  if (params.trace) return params.trace;
  if (!shouldSendArbProgress()) return undefined;

  const trace = createArbExecutionTrace(params.match, params.bet, undefined, (payload) => {
    useMessageStore().arbProgressMessage(payload);
  });
  params.trace = trace;
  return trace;
}

/** 检测到套利腿后写入 meta（供报告头展示利润/赔率） */
export function setArbExecutionTraceMeta(
  trace: ArbExecutionTrace | undefined,
  meta: NonNullable<ArbProgressPayload["meta"]>,
): void {
  trace?.setMeta(meta);
}
