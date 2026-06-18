import type { ArbProgressOutcome, ArbProgressPayload } from "@/stores/betting/autoBet/arbExecutionTrace";
import { arbProfitRate } from "@/shared/format";

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
