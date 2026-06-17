import type { ViewBet, ViewMatch } from "@/models/match";
import { arbProfitRate } from "@/shared/format";

/** [changmen 扩展] 套利执行进度追踪结果 */
export type ArbProgressOutcome = "success" | "partial" | "fail" | "skip";

export interface ArbProgressEvent {
  at: number;
  stage: string;
  detail: string;
}

export interface ArbProgressPayload {
  id: string;
  matchId: number;
  betId: number;
  matchTitle: string;
  betName: string;
  startedAt: number;
  events: ArbProgressEvent[];
  outcome: ArbProgressOutcome;
  summary: string;
  meta?: {
    implied?: number;
    homeLine?: string;
    awayLine?: string;
  };
}

export interface ArbExecutionTrace {
  readonly id: string;
  event(stage: string, detail: string): void;
  setMeta(meta: ArbProgressPayload["meta"]): void;
  finish(outcome: ArbProgressOutcome, summary?: string): void;
}

function formatElapsed(at: number, startedAt: number): string {
  const sec = Math.max(0, Math.floor((at - startedAt) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** HTML 正文（由 messageStore.arbProgressMessage 入队） */
export function formatArbProgressTelegramBody(payload: ArbProgressPayload): string {
  const titleByOutcome: Record<ArbProgressOutcome, string> = {
    success: "套利执行成功",
    partial: "套利执行部分成功",
    fail: "套利执行失败",
    skip: "套利执行跳过",
  };
  const urgent = payload.outcome === "fail";
  const title = titleByOutcome[payload.outcome];
  const titleHtml = urgent ? `<b>🔴 ${title}</b>` : `<b>${title}</b>`;
  const lines = [
    titleHtml,
    `${payload.matchTitle} / ${payload.betName}`,
    payload.summary ? `<i>${payload.summary}</i>` : "",
    payload.meta?.implied != null
      ? `对冲利润 ${arbProfitRate(payload.meta.implied)}`
      : "",
    payload.meta?.homeLine && payload.meta?.awayLine
      ? `${payload.meta.homeLine} | ${payload.meta.awayLine}`
      : "",
    "<blockquote>",
  ].filter(Boolean);

  for (const ev of payload.events) {
    lines.push(`├ ${formatElapsed(ev.at, payload.startedAt)} ${ev.stage} ${ev.detail}`);
  }
  lines.push("</blockquote>");
  return lines.join("\n");
}

export function createArbExecutionTrace(
  match: ViewMatch,
  bet: ViewBet,
  meta?: ArbProgressPayload["meta"],
  deliver?: (payload: ArbProgressPayload) => void,
): ArbExecutionTrace {
  const events: ArbProgressEvent[] = [];
  const startedAt = Date.now();
  const id = `${match.id}:${bet.id}:${startedAt}`;
  let finished = false;
  let metaRef = meta;

  const trace: ArbExecutionTrace = {
    id,
    event(stage, detail) {
      if (finished) return;
      events.push({ at: Date.now(), stage, detail });
    },
    setMeta(next) {
      if (finished) return;
      metaRef = next;
      if (next?.implied != null && !events.some((e) => e.stage === "发现")) {
        events.push({
          at: Date.now(),
          stage: "发现",
          detail: `利润 ${arbProfitRate(next.implied)}`,
        });
      }
    },
    finish(outcome, summary = "") {
      if (finished) return;
      finished = true;
      deliver?.({
        id,
        matchId: match.id,
        betId: bet.id,
        matchTitle: match.title,
        betName: bet.getBetName(),
        startedAt,
        events: [...events],
        outcome,
        summary,
        meta: metaRef,
      });
    },
  };

  if (metaRef?.implied != null) {
    trace.event("发现", `利润 ${arbProfitRate(metaRef.implied)}`);
  }
  return trace;
}
