import type {
  ArbProgressLegMeta,
  ArbProgressOutcome,
  ArbProgressPayload,
  ArbProgressPolymarketMeta,
} from "@/stores/betting/autoBet/arbExecutionTrace";
import { arbProfitRate, toFixed } from "@/shared/format";

const STAGE_ICON: Record<string, string> = {
  发现: "💡",
  检测: "🔍",
  选号: "👤",
  模式: "⚙️",
  预检: "🔎",
  下单: "📤",
  重试: "🔄",
  拒单: "⏱",
  补单: "➕",
  绑单: "🔗",
};

const OUTCOME_TITLE: Record<ArbProgressOutcome, { emoji: string; text: string }> = {
  success: { emoji: "✅", text: "套利执行成功" },
  partial: { emoji: "⚠️", text: "套利执行部分成功" },
  fail: { emoji: "🔴", text: "套利执行失败" },
  skip: { emoji: "⏭", text: "套利执行跳过" },
};

const CAP_SOURCE_LABEL: Record<ArbProgressPolymarketMeta["capSource"], string> = {
  clob: "fo clob",
  odds: "1/赔率",
  locked: "已锁定",
};

/** 时间线里省略已在分段正文中展示的 stage */
const TIMELINE_SKIP_STAGES = new Set(["发现", "检测", "预检"]);

const BET_RESULT_MARKERS = /[✅❌⏳]|未下单/;

function formatElapsed(at: number, startedAt: number): string {
  const sec = Math.max(0, Math.floor((at - startedAt) / 1000));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatTotalElapsed(payload: ArbProgressPayload): string {
  const endAt = payload.events.length
    ? payload.events[payload.events.length - 1].at
    : payload.startedAt;
  const sec = Math.max(0, (endAt - payload.startedAt) / 1000);
  return sec < 10 ? sec.toFixed(1) : String(Math.round(sec));
}

function shortenDetail(text: string, max = 96): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max)
    return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

function formatLegSideLabel(leg: ArbProgressLegMeta): string {
  const sideLabel = leg.side === "A" ? "主腿" : "客腿";
  return `${sideLabel} · ${leg.platform} · ${leg.target}`;
}

function formatPrecheckStatus(leg: ArbProgressLegMeta): string {
  if (!leg.precheck)
    return "—";
  if (leg.precheck.ok)
    return "✅ 通过";
  return `❌ ${leg.precheck.error || "未通过"}`;
}

function formatPolymarketLines(pm: ArbProgressPolymarketMeta): string[] {
  const lines = [
    `token：${pm.tokenShort}`,
    `检测赔率：${toFixed(pm.detectionOdds, 3)}`,
    `检测上限：${toFixed(pm.detectionMaxPrice, 4)}（${CAP_SOURCE_LABEL[pm.capSource]}）`,
  ];
  if (pm.foClobPrice != null && Math.abs(pm.foClobPrice - pm.detectionMaxPrice) > 1e-6) {
    lines.push(`fo clob：${toFixed(pm.foClobPrice, 4)}`);
  }
  if (pm.bookPrice != null) {
    lines.push(`盘口 ask：${toFixed(pm.bookPrice, 4)}（≈${toFixed(1 / pm.bookPrice, 3)}）`);
  }
  if (pm.apiBetMoney != null) {
    lines.push(`API 金额：${toFixed(pm.apiBetMoney, 2)} USDC`);
  }
  return lines;
}

function formatDetectionSection(payload: ArbProgressPayload): string[] {
  const legs = payload.meta?.legs;
  const { homeLine, awayLine, implied } = payload.meta ?? {};
  if (!legs?.length && !homeLine && !awayLine)
    return [];

  const lines = ["<b>【套利检测】</b>"];
  if (implied != null)
    lines.push(`利润 ${arbProfitRate(implied)}`);

  if (legs?.length) {
    for (const leg of legs) {
      lines.push(`${formatLegSideLabel(leg)}：${leg.betMoney} @ ${toFixed(leg.odds, 3)}`);
    }
  }
  else {
    if (homeLine)
      lines.push(`主腿：${homeLine}`);
    if (awayLine)
      lines.push(`客腿：${awayLine}`);
  }
  return lines;
}

function formatPrecheckSection(payload: ArbProgressPayload): string[] {
  const legs = payload.meta?.legs?.filter(leg => leg.precheck);
  if (!legs?.length)
    return [];

  const lines = ["<b>【预检】</b>"];
  for (const leg of legs) {
    lines.push(`${formatLegSideLabel(leg)}：${formatPrecheckStatus(leg)}`);
    if (leg.precheck?.polymarket) {
      for (const pmLine of formatPolymarketLines(leg.precheck.polymarket))
        lines.push(`  ${pmLine}`);
    }
    if (leg.account)
      lines.push(`  账号：${leg.account}`);
  }
  return lines;
}

function isBetResultDetail(detail: string): boolean {
  return BET_RESULT_MARKERS.test(detail);
}

function formatBetSection(payload: ArbProgressPayload): string[] {
  const betEvents = payload.events.filter(
    ev => ev.stage === "下单" && isBetResultDetail(ev.detail),
  );
  const lastBet = betEvents[betEvents.length - 1];
  if (!lastBet)
    return [];

  const lines = ["<b>【下注】</b>"];
  for (const part of lastBet.detail.split(" · ")) {
    const trimmed = part.trim();
    if (trimmed)
      lines.push(trimmed);
  }
  return lines;
}

function shouldSkipTimelineEvent(payload: ArbProgressPayload, stage: string, detail: string): boolean {
  if (TIMELINE_SKIP_STAGES.has(stage))
    return true;
  if (stage === "下单" && isBetResultDetail(detail))
    return true;
  if (stage === "预检" && payload.meta?.legs?.some(leg => leg.precheck))
    return true;
  return false;
}

function formatTimeline(payload: ArbProgressPayload): string[] {
  const lines: string[] = [];
  for (const ev of payload.events) {
    if (shouldSkipTimelineEvent(payload, ev.stage, ev.detail))
      continue;
    const icon = STAGE_ICON[ev.stage] ?? "·";
    const detail = shortenDetail(ev.detail);
    lines.push(
      `${formatElapsed(ev.at, payload.startedAt)} ${icon} ${ev.stage}${detail ? ` · ${detail}` : ""}`,
    );
  }
  return lines;
}

/** HTML 正文（由 messageStore.arbProgressMessage 入队） */
export function formatArbProgressTelegramBody(payload: ArbProgressPayload): string {
  const { emoji, text } = OUTCOME_TITLE[payload.outcome];
  const titleHtml = `<b>${emoji} ${text}</b>`;

  const headerParts = [
    titleHtml,
    `${payload.matchTitle} / ${payload.betName}`,
  ];

  if (payload.summary) {
    const summaryHtml = payload.outcome === "fail" || payload.outcome === "partial"
      ? `<b>${shortenDetail(payload.summary, 200)}</b>`
      : `<i>${shortenDetail(payload.summary, 200)}</i>`;
    headerParts.push(summaryHtml);
  }

  const detectionSection = formatDetectionSection(payload);
  const precheckSection = formatPrecheckSection(payload);
  const betSection = formatBetSection(payload);
  const timeline = formatTimeline(payload);

  const lines = [...headerParts];
  if (detectionSection.length) {
    lines.push("", ...detectionSection);
  }
  if (precheckSection.length) {
    lines.push("", ...precheckSection);
  }
  if (betSection.length) {
    lines.push("", ...betSection);
  }
  if (timeline.length) {
    lines.push(
      "",
      "<b>【执行过程】</b>",
      "<blockquote>",
      ...timeline,
      `— 耗时 ${formatTotalElapsed(payload)}s —`,
      "</blockquote>",
    );
  }
  return lines.join("\n");
}
