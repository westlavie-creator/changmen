import type { ArbExecutionTrace, ArbProgressPayload } from "@/stores/betting/autoBet/arbExecutionTrace";
import type { ArbBetAttemptParams } from "@/stores/betting/autoBet/phases/types";
import {

  createArbExecutionTrace,
} from "@/stores/betting/autoBet/arbExecutionTrace";
import { useMessageStore } from "@/stores/messageStore";
import { useUserStore } from "@/stores/userStore";

/** [changmen 扩展] 是否发送套利执行进度 Telegram */
export function shouldSendArbProgress(): boolean {
  const user = useUserStore();
  if (!user.message?.telegramId?.trim())
    return false;
  return user.message.notifyArbProgress === true;
}

/** 单次 executeArbBet：仅当已选出可执行双腿后才创建 trace（扫描跳过不发 Telegram，对齐 A8 静默 continue） */
export function ensureArbExecutionTrace(params: ArbBetAttemptParams): ArbExecutionTrace | undefined {
  if (params.trace)
    return params.trace;
  if (!shouldSendArbProgress())
    return undefined;

  const trace = createArbExecutionTrace(params.match, params.bet, undefined, (payload) => {
    useMessageStore().arbProgressMessage(payload);
  });
  params.trace = trace;
  return trace;
}

/** @deprecated 请用 ensureArbExecutionTrace（选腿成功后懒创建） */
export function beginArbExecutionTrace(params: ArbBetAttemptParams): ArbExecutionTrace | undefined {
  return ensureArbExecutionTrace(params);
}

/** 检测到套利腿后写入 meta（供报告头展示利润/赔率） */
export function setArbExecutionTraceMeta(
  trace: ArbExecutionTrace | undefined,
  meta: NonNullable<ArbProgressPayload["meta"]>,
): void {
  trace?.setMeta(meta);
}
