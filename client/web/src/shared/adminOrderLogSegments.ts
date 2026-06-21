import type { AdminOrderLogEntry, AdminOrderLogLogSegment } from "@/types/admin";

export function extractLogAccountLabel(title: string) {
  const m = String(title || "").match(/^\[([^\]]+)\]\(([^,]+),([^)]+)\)/);
  if (!m)
    return null;
  const provider = m[1]!;
  const platformName = m[2]!.trim();
  const playerName = m[3]!.trim();
  return {
    provider,
    platformName,
    playerName,
    label: `${provider} · ${platformName} / ${playerName}`,
  };
}

/** 按预检切分轮次（与 backend buildLogSegments 一致） */
export function buildLogSegments(logs: AdminOrderLogEntry[]): AdminOrderLogLogSegment[] {
  const sorted = [...logs].sort((a, b) => a.createAt - b.createAt);
  if (!sorted.length)
    return [];

  const segments: AdminOrderLogLogSegment[] = [];
  let current: AdminOrderLogLogSegment | null = null;

  const flush = () => {
    if (current?.logs.length) {
      segments.push(current);
      current = null;
    }
  };

  for (const log of sorted) {
    if (log.kind === "check") {
      flush();
      const parsed = extractLogAccountLabel(log.title);
      current = {
        key: `seg-${log.id ?? log.createAt}`,
        accountLabel: log.accountLabel || parsed?.label || null,
        provider: log.provider || parsed?.provider || null,
        isMakeUp: Boolean(log.loseOrder),
        logs: [log],
      };
    }
    else if (current) {
      current.logs.push(log);
    }
    else {
      flush();
      const parsed = extractLogAccountLabel(log.title);
      current = {
        key: `seg-${log.id ?? log.createAt}`,
        accountLabel: log.accountLabel || parsed?.label || null,
        provider: log.provider || parsed?.provider || null,
        isMakeUp: Boolean(log.loseOrder),
        logs: [log],
      };
    }
  }
  flush();
  return segments;
}

export function attemptLogSegments(
  attempt: { logs: AdminOrderLogEntry[]; logSegments?: AdminOrderLogLogSegment[] },
): AdminOrderLogLogSegment[] {
  if (attempt.logSegments?.length)
    return attempt.logSegments;
  const built = buildLogSegments(attempt.logs);
  return built.length ? built : attempt.logs.length ? [{ key: "flat", accountLabel: null, provider: null, isMakeUp: false, logs: attempt.logs }] : [];
}
