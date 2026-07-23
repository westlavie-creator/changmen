import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import { applyArbMakeUpFromRejects } from "@/stores/betting/autoBet/arbMakeUpFromRejects";
import { maybeArbFailAutoSellAfterFinalize } from "@/extensions/arbBet/arbFailAutoSell";
import {
  finishArbExecutionTrace,
  logArbFinalizeTraceEvents,
  sendArbBettingMessageIfNeeded,
} from "@/stores/betting/autoBet/phases/finalizeArbMessaging";
import { markArbSuccessLegs } from "@/stores/betting/autoBet/phases/finalizeArbMarkers";
import { settleBothArbLegs } from "@/stores/betting/autoBet/phases/settleBothArbLegs";
import { syncArbFinalizeActiveBet } from "@/stores/betting/autoBet/phases/syncArbFinalizeUi";
import { refreshOrderListAfterBind } from "@/stores/betting/arbOrderBind";

/** 套利收尾编排：settle → makeup → mark → notify（顺序对齐 A8 bundle） */
export async function finalizeArbBet(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
): Promise<void> {
  const { bet } = params;
  const { linkId } = placed;

  const settle = await settleBothArbLegs(params, placed);

  const makeup = await applyArbMakeUpFromRejects(
    params,
    placed,
    settle.rejectA,
    settle.rejectB,
    {
      ordersA: settle.ordersA,
      ordersB: settle.ordersB,
    },
    {
      pendingConfirmA: settle.pendingConfirmA,
      pendingConfirmB: settle.pendingConfirmB,
    },
  );

  logArbFinalizeTraceEvents(params.trace, linkId, placed, settle, makeup, bet.id);
  markArbSuccessLegs(bet, placed, settle);
  refreshOrderListAfterBind();

  const outcome = syncArbFinalizeActiveBet(bet.id, placed, settle, makeup);
  finishArbExecutionTrace(params, placed, settle, outcome);
  sendArbBettingMessageIfNeeded(params, placed, settle);

  // [changmen 扩展] 放在 A8 收尾之后：减仓失败/超时不得打断 mark / notify
  try {
    await maybeArbFailAutoSellAfterFinalize({
      placed,
      settle,
      makeup,
      setMessage: params.setMessage,
    });
  }
  catch {
    /* ignore */
  }
}
