import type { ViewBet, ViewMatch } from "@/models/match";
import type { UserConfig } from "@/types/userConfig";
import { beginArbExecutionTrace } from "@/extensions/notify/arbProgressConfig";
import { checkArbLegs } from "@/stores/betting/autoBet/phases/checkArbLegs";
import type { ArbBetAttemptParams } from "@/stores/betting/autoBet/phases/types";
import { finalizeArbBet } from "@/stores/betting/autoBet/phases/finalizeArbBet";
import { placeArbLegs } from "@/stores/betting/autoBet/phases/placeArbLegs";
import { prepareArbAttempt } from "@/stores/betting/autoBet/phases/prepareArbAttempt";

/** 单场单 bet 行的自动套利执行（选号 → 预检 → 下单 → 拒单/绑单/补单/收尾） */
export async function executeArbBet(params: {
  match: ViewMatch;
  bet: ViewBet;
  config: UserConfig;
  setMessage: (msg: string) => void;
}): Promise<void> {
  const attempt: ArbBetAttemptParams = { ...params };
  beginArbExecutionTrace(attempt);

  const ready = await prepareArbAttempt(attempt);
  if (!ready) return;

  const checked = await checkArbLegs(attempt, ready);
  if (!checked) return;

  const placed = await placeArbLegs(attempt, checked);
  if (!placed) return;

  await finalizeArbBet(attempt, placed);
}
