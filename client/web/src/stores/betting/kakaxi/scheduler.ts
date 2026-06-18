import { executeArbBet } from "@/stores/betting/autoBet/executeArbBet";
import {
  dequeueKakaxiBetExcludingPlatforms,
  enqueueKakaxiBet,
  kakaxiQueueSize,
} from "@/stores/betting/kakaxi/queue";
import {
  KAKAXI_DRAIN_MAX_BETS,
  KAKAXI_DRAIN_MAX_MS,
  KAKAXI_MAX_PARALLEL_EXECUTES,
} from "@/stores/betting/kakaxi/config";
import {
  kakaxiQueuedBetPlatforms,
  platformsConflict,
  resolveKakaxiQueuedBetPlatforms,
} from "@/stores/betting/kakaxi/platformResolve";
import { passesKakaxiPreExecuteGate } from "@/stores/betting/kakaxi/preExecuteGate";
import { kakaxiBetKey, type KakaxiQueuedBet } from "@/stores/betting/kakaxi/types";
import type { PlatformId } from "@/types/esport";
import { useAccountStore } from "@/stores/accountStore";
import { useConfigStore } from "@/stores/configStore";
import { useMatchStore } from "@/stores/matchStore";

export interface KakaxiSchedulerContext {
  setMessage: (msg: string) => void;
}

export interface KakaxiDrainOptions {
  maxBets?: number;
  maxMs?: number;
  maxParallel?: number;
}

const inFlightPlatforms = new Set<PlatformId>();
const inFlightBetKeys = new Set<string>();

export function getKakaxiInFlightPlatforms(): ReadonlySet<PlatformId> {
  return inFlightPlatforms;
}

/** @deprecated 并行调度下仅反映单槽兼容；请用 getKakaxiInFlightPlatforms */
export function getKakaxiInFlightKey(): string | null {
  const first = inFlightBetKeys.values().next().value;
  return first ?? null;
}

function resolvePlatformsForQueueItem(item: KakaxiQueuedBet): PlatformId[] | undefined {
  const stored = kakaxiQueuedBetPlatforms(item);
  if (stored) return stored;

  const configStore = useConfigStore();
  const accountStore = useAccountStore();
  const matchStore = useMatchStore();
  const match = matchStore.matchs.find((m) => m.id === item.matchId);
  const bet = match?.bets.find((b) => b.id === item.betId);
  if (!match || !bet) return undefined;

  return resolveKakaxiQueuedBetPlatforms(
    item,
    match,
    bet,
    configStore.config,
    [...accountStore.getProviders().keys()],
    accountStore.accounts,
  );
}

/** 执行已出队条目：预检闸门 → await executeArbBet（按 platform 占槽） */
export async function executeKakaxiQueuedBet(
  ctx: KakaxiSchedulerContext,
  item: KakaxiQueuedBet,
): Promise<boolean> {
  const configStore = useConfigStore();
  const config = configStore.config;
  if (!config.betting) return false;

  const matchStore = useMatchStore();
  const accountStore = useAccountStore();
  const match = matchStore.matchs.find((m) => m.id === item.matchId);
  const bet = match?.bets.find((b) => b.id === item.betId);
  if (!match || !bet) return false;

  const providerKeys = [...accountStore.getProviders().keys()] as PlatformId[];
  const platforms = resolveKakaxiQueuedBetPlatforms(
    item,
    match,
    bet,
    config,
    providerKeys,
    accountStore.accounts,
  );
  if (!platforms?.length) return false;

  const betKey = kakaxiBetKey(item.matchId, item.betId);
  if (inFlightBetKeys.has(betKey) || platformsConflict(platforms, inFlightPlatforms)) {
    return false;
  }

  const gate = passesKakaxiPreExecuteGate({
    match,
    bet,
    item,
    config,
    providerKeys,
    accounts: accountStore.accounts,
  });
  if (!gate.ok) return false;

  for (const platform of platforms) inFlightPlatforms.add(platform);
  inFlightBetKeys.add(betKey);

  try {
    await executeArbBet({ match, bet, config, setMessage: ctx.setMessage });
    return true;
  } finally {
    for (const platform of platforms) inFlightPlatforms.delete(platform);
    inFlightBetKeys.delete(betKey);
  }
}

/** 消费队首一条（兼容单条串行调用） */
export async function processNextKakaxiBet(ctx: KakaxiSchedulerContext): Promise<boolean> {
  const item = dequeueKakaxiBetExcludingPlatforms(
    inFlightPlatforms,
    resolvePlatformsForQueueItem,
  );
  if (!item) return false;
  return executeKakaxiQueuedBet(ctx, item);
}

/** 按预算 + platform 互斥并行消费队列 */
export async function drainKakaxiScheduler(
  ctx: KakaxiSchedulerContext,
  options: KakaxiDrainOptions = {},
): Promise<number> {
  const maxBets = options.maxBets ?? KAKAXI_DRAIN_MAX_BETS;
  const maxMs = options.maxMs ?? KAKAXI_DRAIN_MAX_MS;
  const maxParallel = options.maxParallel ?? KAKAXI_MAX_PARALLEL_EXECUTES;
  const startedAt = Date.now();
  let processed = 0;

  while (
    kakaxiQueueSize() > 0 &&
    processed < maxBets &&
    Date.now() - startedAt < maxMs
  ) {
    const waveBusy = new Set(inFlightPlatforms);
    const wave: Promise<boolean>[] = [];

    while (
      wave.length < maxParallel &&
      processed + wave.length < maxBets &&
      Date.now() - startedAt < maxMs
    ) {
      const item = dequeueKakaxiBetExcludingPlatforms(waveBusy, (queued) => {
        const resolved = resolvePlatformsForQueueItem(queued);
        if (resolved && (!queued.homePlatform || !queued.awayPlatform)) {
          queued.homePlatform = resolved[0];
          queued.awayPlatform = resolved[1];
        }
        return resolved;
      });
      if (!item) break;

      const platforms = kakaxiQueuedBetPlatforms(item);
      if (!platforms?.length) {
        enqueueKakaxiBet(item);
        break;
      }

      for (const platform of platforms) waveBusy.add(platform);
      wave.push(executeKakaxiQueuedBet(ctx, item));
    }

    if (!wave.length) break;

    const results = await Promise.all(wave);
    processed += results.filter(Boolean).length;
  }

  return processed;
}

export function resetKakaxiScheduler(): void {
  inFlightPlatforms.clear();
  inFlightBetKeys.clear();
}
