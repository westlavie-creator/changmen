/** [changmen 扩展] 内存环形缓冲：executeArbBet 各 phase 耗时与中止点（不改变执行逻辑） */

export type ArbAttemptPhase = "prepare" | "check" | "place" | "finalize";

export type ArbAttemptStopReason
  = | "complete"
    | "skip_prepare"
    | "skip_check";

export interface ArbAttemptMetricEntry {
  at: number;
  matchId: number;
  betId: number;
  phaseMs: Partial<Record<ArbAttemptPhase, number>>;
  stop: ArbAttemptStopReason;
}

export interface ArbAttemptMetricsSummary {
  total: number;
  byStop: Record<ArbAttemptStopReason, number>;
  avgPhaseMs: Partial<Record<ArbAttemptPhase, number>>;
}

const MAX_ENTRIES = 200;
const entries: ArbAttemptMetricEntry[] = [];

export function recordArbAttemptMetric(entry: ArbAttemptMetricEntry): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES);
  }
}

export function getArbAttemptMetrics(): readonly ArbAttemptMetricEntry[] {
  return entries;
}

export function clearArbAttemptMetrics(): void {
  entries.length = 0;
}

export function summarizeArbAttemptMetrics(): ArbAttemptMetricsSummary {
  const byStop: Record<ArbAttemptStopReason, number> = {
    complete: 0,
    skip_prepare: 0,
    skip_check: 0,
  };
  const phaseTotals: Partial<Record<ArbAttemptPhase, number>> = {};
  const phaseCounts: Partial<Record<ArbAttemptPhase, number>> = {};

  for (const row of entries) {
    byStop[row.stop] += 1;
    for (const phase of ["prepare", "check", "place", "finalize"] as const) {
      const ms = row.phaseMs[phase];
      if (ms == null)
        continue;
      phaseTotals[phase] = (phaseTotals[phase] ?? 0) + ms;
      phaseCounts[phase] = (phaseCounts[phase] ?? 0) + 1;
    }
  }

  const avgPhaseMs: Partial<Record<ArbAttemptPhase, number>> = {};
  for (const phase of ["prepare", "check", "place", "finalize"] as const) {
    const count = phaseCounts[phase];
    if (count)
      avgPhaseMs[phase] = Math.round((phaseTotals[phase] ?? 0) / count);
  }

  return { total: entries.length, byStop, avgPhaseMs };
}
