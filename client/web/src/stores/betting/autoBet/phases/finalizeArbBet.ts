import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import { applyArbMakeUpFromRejects } from "@/stores/betting/autoBet/arbMakeUpFromRejects";
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
  );

  logArbFinalizeTraceEvents(params.trace, linkId, placed, settle, makeup, bet.id);
  markArbSuccessLegs(bet, placed, settle);
  refreshOrderListAfterBind();

  const outcome = syncArbFinalizeActiveBet(bet.id, placed, settle, makeup);
  finishArbExecutionTrace(params, placed, settle, outcome);
  sendArbBettingMessageIfNeeded(params, placed, settle);
}
