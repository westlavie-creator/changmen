import { armKakaxiScheduler, drainKakaxiScheduler } from "@/stores/betting/kakaxi/scheduler";

export interface KakaxiArbRoundContext {
  setMessage: (msg: string) => void;
}

/** kakaxi 模式主循环套利段：消费队列 → executeArbBet（不全表遍历） */
export async function runKakaxiArbRound(ctx: KakaxiArbRoundContext): Promise<void> {
  armKakaxiScheduler();
  await drainKakaxiScheduler(ctx);
}
