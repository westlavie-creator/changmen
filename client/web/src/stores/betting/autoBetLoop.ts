import { runArbBetRound, type ArbBetRoundContext } from "@/stores/betting/runArbBetRound";

export type AutoBetTickContext = ArbBetRoundContext;

/** @deprecated 使用 runArbBetRound；保留别名供旧调用与测试 */
export async function runAutoBetTick(ctx: AutoBetTickContext): Promise<void> {
  await runArbBetRound(ctx);
}
