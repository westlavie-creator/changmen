import type { ViewBet, ViewMatch } from "@/models/match";
import { arbProfitRate } from "@/shared/format";
import { isA8StrictMode } from "@/shared/a8Strict";

/** [changmen 扩展] 套利执行链路追踪；严格 A8 模式下为 no-op */
export type ArbFlowOutcome = "fail" | "partial" | "skip";

export interface ArbFlowEvent {
  at: number;
  stage: string;
  detail: string;
}

export interface ArbFlowPayload {
  id: string;
  matchTitle: string;
  betName: string;
  startedAt: number;
  events: ArbFlowEvent[];
  outcome: ArbFlowOutcome;
  summary: string;
  meta?: {
    implied?: number;
    homeLine?: string;
    awayLine?: string;
  };
}

export interface ArbFlowTrace {
  readonly id: string;
  event(stage: string, detail: string): void;
  finish(outcome: ArbFlowOutcome, summary?: string): void;
}

const noopTrace: ArbFlowTrace = {
  id: "",
  event() {},
  finish() {},
};

function formatTime(at: number, startedAt: number): string {
  const sec = Math.max(0, Math.floor((at - startedAt) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/** HTML 正文（由 messageStore.arbFlowMessage 入队） */
export function formatArbFlowTelegramBody(payload: ArbFlowPayload): string {
  const urgent = payload.outcome === "fail";
  const title =
    payload.outcome === "fail"
      ? "套利下单失败"
      : payload.outcome === "partial"
        ? "套利下单部分成功"
        : "套利执行跳过";
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
    lines.push(`├ ${formatTime(ev.at, payload.startedAt)} ${ev.stage} ${ev.detail}`);
  }
  lines.push("</blockquote>");
  return lines.join("\n");
}

export function createArbFlowTrace(
  match: ViewMatch,
  bet: ViewBet,
  meta?: ArbFlowPayload["meta"],
): ArbFlowTrace {
  if (isA8StrictMode()) return noopTrace;

  const events: ArbFlowEvent[] = [];
  const startedAt = Date.now();
  const id = `${match.id}:${bet.id}:${startedAt}`;
  let finished = false;

  const trace: ArbFlowTrace = {
    id,
    event(stage, detail) {
      if (finished) return;
      events.push({ at: Date.now(), stage, detail });
    },
    finish(outcome, summary = "") {
      if (finished) return;
      finished = true;
      void import("@/stores/messageStore").then(({ useMessageStore }) => {
        useMessageStore().arbFlowMessage({
          id,
          matchTitle: match.title,
          betName: bet.getBetName(),
          startedAt,
          events: [...events],
          outcome,
          summary,
          meta,
        });
      });
    },
  };

  if (meta?.implied != null) {
    trace.event("发现", `利润 ${arbProfitRate(meta.implied)}`);
  }
  return trace;
}
