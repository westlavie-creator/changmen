import type { ViewBet, ViewMatch } from "@/models/match";
import type { ArbAttemptPhase } from "@/stores/betting/autoBet/arbAttemptMetrics";
import type { ArbBetAttemptParams } from "@/stores/betting/autoBet/phases/types";
import type { UserConfig } from "@/types/userConfig";
import {

  recordArbAttemptMetric,
} from "@/stores/betting/autoBet/arbAttemptMetrics";
import { checkArbLegs } from "@/stores/betting/autoBet/phases/checkArbLegs";
import { finalizeArbBet } from "@/stores/betting/autoBet/phases/finalizeArbBet";
import { placeArbLegs } from "@/stores/betting/autoBet/phases/placeArbLegs";
import { prepareArbAttempt } from "@/stores/betting/autoBet/phases/prepareArbAttempt";

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const startedAt = performance.now();
  const value = await run();
  return { value, ms: Math.round(performance.now() - startedAt) };
}

/** 单场单 bet 行的自动套利执行（选号 → 预检 → 下单 → 拒单/绑单/补单/收尾） */
export async function executeArbBet(params: {
  match: ViewMatch;
  bet: ViewBet;
  config: UserConfig;
  setMessage: (msg: string) => void;
}): Promise<void> {
  const attempt: ArbBetAttemptParams = { ...params };

  const phaseMsMap: Partial<Record<ArbAttemptPhase, number>> = {};
  const base = { at: Date.now(), matchId: params.match.id, betId: params.bet.id };

  const prepared = await timed(() => prepareArbAttempt(attempt));
  phaseMsMap.prepare = prepared.ms;
  const ready = prepared.value;
  if (!ready) {
    recordArbAttemptMetric({ ...base, phaseMs: phaseMsMap, stop: "skip_prepare" });
    return;
  }

  const checked = await timed(() => checkArbLegs(attempt, ready));
  phaseMsMap.check = checked.ms;
  const checkedValue = checked.value;
  if (!checkedValue) {
    recordArbAttemptMetric({ ...base, phaseMs: phaseMsMap, stop: "skip_check" });
    return;
  }

  const placed = await timed(() => placeArbLegs(attempt, checkedValue));
  phaseMsMap.place = placed.ms;
  const placedValue = placed.value;
  if (!placedValue) {
    recordArbAttemptMetric({ ...base, phaseMs: phaseMsMap, stop: "skip_place" });
    return;
  }

  const finalized = await timed(() => finalizeArbBet(attempt, placedValue));
  phaseMsMap.finalize = finalized.ms;
  recordArbAttemptMetric({ ...base, phaseMs: phaseMsMap, stop: "complete" });
}
