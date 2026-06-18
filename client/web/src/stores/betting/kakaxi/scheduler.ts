import { executeArbBet } from "@/stores/betting/autoBet/executeArbBet";
import {
  dequeueKakaxiBet,
  kakaxiQueueSize,
} from "@/stores/betting/kakaxi/queue";
import {
  KAKAXI_DRAIN_MAX_BETS,
  KAKAXI_DRAIN_MAX_MS,
} from "@/stores/betting/kakaxi/config";
import { passesKakaxiPreExecuteGate } from "@/stores/betting/kakaxi/preExecuteGate";
import { kakaxiBetKey } from "@/stores/betting/kakaxi/types";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useMatchStore } from "@/stores/matchStore";

export interface KakaxiSchedulerContext {
  setMessage: (msg: string) => void;
}

export interface KakaxiDrainOptions {
  maxBets?: number;
  maxMs?: number;
}

let inFlightKey: string | null = null;

export function getKakaxiInFlightKey(): string | null {
  return inFlightKey;
}

/** 消费队首一条：预检闸门 → await executeArbBet（串行，扩展层防重入） */
export async function processNextKakaxiBet(ctx: KakaxiSchedulerContext): Promise<boolean> {
  if (inFlightKey) return false;

  const item = dequeueKakaxiBet();
  if (!item) return false;

  const configStore = useConfigStore();
  const config = configStore.config;
  if (!config.betting) return false;

  const matchStore = useMatchStore();
  const accountStore = useAccountStore();
  const match = matchStore.matchs.find((m) => m.id === item.matchId);
  const bet = match?.bets.find((b) => b.id === item.betId);
  if (!match || !bet) return false;

  const gate = passesKakaxiPreExecuteGate({
    match,
    bet,
    item,
    config,
    providerKeys: [...accountStore.getProviders().keys()],
    accounts: accountStore.accounts,
  });
  if (!gate.ok) return false;

  const key = kakaxiBetKey(item.matchId, item.betId);
  inFlightKey = key;
  try {
    await executeArbBet({ match, bet, config, setMessage: ctx.setMessage });
    return true;
  } finally {
    inFlightKey = null;
  }
}

/** 按预算消费队列（仍单条串行 executeArbBet；避免单轮挡住 makeUp） */
export async function drainKakaxiScheduler(
  ctx: KakaxiSchedulerContext,
  options: KakaxiDrainOptions = {},
): Promise<number> {
  const maxBets = options.maxBets ?? KAKAXI_DRAIN_MAX_BETS;
  const maxMs = options.maxMs ?? KAKAXI_DRAIN_MAX_MS;
  const startedAt = Date.now();
  let processed = 0;

  while (kakaxiQueueSize() > 0 && processed < maxBets && Date.now() - startedAt < maxMs) {
    const ran = await processNextKakaxiBet(ctx);
    if (!ran) {
      if (kakaxiQueueSize() === 0) break;
      continue;
    }
    processed += 1;
  }

  return processed;
}

export function resetKakaxiScheduler(): void {
  inFlightKey = null;
}
