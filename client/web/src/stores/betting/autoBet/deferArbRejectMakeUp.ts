import { wait } from "@/shared/wait";
import { a8Tip } from "@/shared/a8Notify";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { useMatchStore } from "@/stores/matchStore";
import { applyArbMakeUpFromRejects } from "@/stores/betting/autoBet/arbMakeUpFromRejects";
import { syncVenueRejectFlags } from "@/stores/betting/autoBet/venueRejectSync";
import type { ArbBetAttemptParams, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";

/** 等待窗口结束后场馆才标拒单时，后台继续复检并入队补单 */
const DEFERRED_REJECT_POLL_SEC = 45;
const DEFERRED_REJECT_INTERVAL_SEC = 2;

/**
 * [changmen 扩展] 初检无拒单但双腿 API 均成功时，后台轮询至 DEFERRED_REJECT_POLL_SEC。
 * A8 仅 wait(q) 后拉单一次；迟发拒单会漏补单，此处兜底。
 */
export function scheduleDeferredArbRejectMakeUp(
  params: ArbBetAttemptParams,
  placed: ArbBetPlaced,
): void {
  const { matchId, betId } = { matchId: params.match.id, betId: params.bet.id };
  const { resultA, resultB, accountA, accountB, betBothLegs } = placed;
  if (!betBothLegs) return;
  if (!(resultA?.success && resultB?.success && accountA && accountB)) return;

  void (async () => {
    const loseStore = useLoseOrderStore();
    const matchStore = useMatchStore();
    const iterations = Math.ceil(DEFERRED_REJECT_POLL_SEC / DEFERRED_REJECT_INTERVAL_SEC);

    for (let i = 0; i < iterations; i++) {
      await wait(DEFERRED_REJECT_INTERVAL_SEC * 1000);
      if (loseStore.hasOrder(matchId, betId)) return;

      const match = matchStore.matchs.find((m) => m.id === matchId);
      const bet = match?.bets.find((b) => b.id === betId);
      if (!match || !bet) return;

      const { rejectA, rejectB } = await syncVenueRejectFlags(
        resultA,
        accountA,
        resultB,
        accountB,
      );
      if (!rejectA && !rejectB) continue;

      await applyArbMakeUpFromRejects(
        { ...params, match, bet },
        placed,
        rejectA,
        rejectB,
      );
      const rejectedLeg = rejectA ? placed.legA.type : placed.legB.type;
      a8Tip("拒单提醒", `${rejectedLeg} 延迟拒单，已尝试补单入队`, 3000);
      return;
    }
  })();
}
