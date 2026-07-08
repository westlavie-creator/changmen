import type { ViewBet } from "@/models/match";
import type { ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import type { ArbLegSettleSnapshot } from "@/stores/betting/autoBet/phases/settleBothArbLegs";
import { markSuccessfulBet } from "@/stores/betting/successMarkers";

/** 场馆未拒单的成功腿写入 BETACCOUNT / BETCOUNT（对齐 A8，不含 pendingConfirm 门控） */
export function markArbSuccessLegs(
  bet: ViewBet,
  placed: ArbBetPlaced,
  settle: ArbLegSettleSnapshot,
): void {
  const { legA, legB, accountA, accountB, resultA, resultB } = placed;
  if (resultA?.success && !settle.rejectA && accountA)
    markSuccessfulBet(accountA, bet.id, legA.target, legA.odds);
  if (resultB?.success && !settle.rejectB && accountB)
    markSuccessfulBet(accountB, bet.id, legB.target, legB.odds);
}
