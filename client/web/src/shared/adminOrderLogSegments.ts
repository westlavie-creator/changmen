import type { AdminOrderLogEntry, AdminOrderLogLegSection, AdminOrderLogLogSegment } from "@/types/admin";

function logIdentity(log: AdminOrderLogEntry): string {
  return String(log.id ?? `${log.createAt}:${log.title}:${log.summary}`);
}

/**
 * 后端已经用 linkId/orderId/账号/时序完成腿与轮次关联；前端只过滤掉安全校验
 * 判定为无关的日志，不再把无 target 的下注结果重新猜到另一条腿。
 */
export function filterBackendLegSections(
  legs: AdminOrderLogLegSection[] | undefined,
  relatedLogs: AdminOrderLogEntry[],
): AdminOrderLogLegSection[] | null {
  if (!legs?.length)
    return null;
  const allowed = new Set(relatedLogs.map(logIdentity));
  return legs.map(leg => ({
    ...leg,
    attempts: leg.attempts
      .map((attempt) => {
        const logs = attempt.logs.filter(log => allowed.has(logIdentity(log)));
        const logSegments = attempt.logSegments
          ?.map(segment => ({
            ...segment,
            logs: segment.logs.filter(log => allowed.has(logIdentity(log))),
          }))
          .filter(segment => segment.logs.length > 0);
        return { ...attempt, logs, logSegments };
      })
      .filter(attempt => Boolean(
        attempt.order
        || attempt.logs.length
        || attempt.logSegments?.some(segment => segment.logs.length),
      )),
  }));
}

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
    // 补单入队是独立编排事件，不能粘到前一轮“预检 → 下单”上。
    // 否则前一腿的下注失败会被 isQueue 覆盖，首轮套利就会少一条腿。
    if (log.kind === "makeup_queue") {
      flush();
      current = {
        key: `seg-${log.id ?? log.createAt}`,
        accountLabel: null,
        provider: null,
        isMakeUp: false,
        logs: [log],
      };
      flush();
    }
    else if (log.kind === "check") {
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
