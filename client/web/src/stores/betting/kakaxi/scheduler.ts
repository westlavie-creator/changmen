import { executeArbBet } from "@/stores/betting/autoBet/executeArbBet";
import {
  dequeueKakaxiBet,
  kakaxiQueueSize,
} from "@/stores/betting/kakaxi/queue";
import { kakaxiBetKey } from "@/stores/betting/kakaxi/types";
import { useConfigStore } from "@/stores/configStore";
import { useMatchStore } from "@/stores/matchStore";

export interface KakaxiSchedulerContext {
  setMessage: (msg: string) => void;
}

let inFlightKey: string | null = null;

export function getKakaxiInFlightKey(): string | null {
  return inFlightKey;
}

/** 消费队首一条：await executeArbBet（串行，扩展层防重入） */
export async function processNextKakaxiBet(ctx: KakaxiSchedulerContext): Promise<boolean> {
  if (inFlightKey) return false;

  const item = dequeueKakaxiBet();
  if (!item) return false;

  const configStore = useConfigStore();
  const config = configStore.config;
  if (!config.betting) return false;

  const matchStore = useMatchStore();
  const match = matchStore.matchs.find((m) => m.id === item.matchId);
  const bet = match?.bets.find((b) => b.id === item.betId);
  if (!match || !bet) return false;

  const key = kakaxiBetKey(item.matchId, item.betId);
  inFlightKey = key;
  try {
    await executeArbBet({ match, bet, config, setMessage: ctx.setMessage });
    return true;
  } finally {
    inFlightKey = null;
  }
}

/** 排空当前队列（仍保持单条串行 executeArbBet） */
export async function drainKakaxiScheduler(ctx: KakaxiSchedulerContext): Promise<number> {
  let processed = 0;
  while (kakaxiQueueSize() > 0) {
    const ran = await processNextKakaxiBet(ctx);
    if (!ran) break;
    processed += 1;
  }
  return processed;
}

export function resetKakaxiScheduler(): void {
  inFlightKey = null;
}
