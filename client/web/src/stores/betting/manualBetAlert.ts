import type { BetSide, ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import { toFixed } from "@changmen/client-core/shared/format";

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 多行场馆错误（PM 诊断、盘口对比等） */
function formatStructuredBetAlertInner(message: string): string {
  const lines = message.split(/\r?\n/);
  return lines.map((line, index) => {
    const text = escapeHtml(line);
    if (!line.trim())
      return `<div class="poly-bet-alert__gap"></div>`;
    if (index === 0)
      return `<div class="poly-bet-alert__reason">${text}</div>`;
    if (/^【.+】$/.test(line))
      return `<div class="poly-bet-alert__section">${text}</div>`;
    if (/^\d+\.\s/.test(line))
      return `<div class="poly-bet-alert__ask">${text}</div>`;
    if (line.includes("tokenId"))
      return `<div class="poly-bet-alert__row poly-bet-alert__mono">${text}</div>`;
    return `<div class="poly-bet-alert__row">${text}</div>`;
  }).join("");
}

export function formatStructuredBetAlertHtml(message: string): string {
  return `<div class="poly-bet-alert">${formatStructuredBetAlertInner(message)}</div>`;
}

export function buildManualBetContextLines(
  match: ViewMatch,
  bet: ViewBet,
  item: ViewBetItem,
  side: BetSide,
  odds: number,
  amount?: number,
): string[] {
  const team = side === "Home" ? bet.homeName : bet.awayName;
  const oddsText = odds > 0 ? toFixed(odds, 3) : "—";
  const lines = [
    match.title,
    `盘口：${bet.getBetName()}`,
    `平台：${item.type}`,
    `选项：${team} @ ${oddsText}`,
  ];
  if (amount !== undefined && Number.isFinite(amount) && amount > 0)
    lines.push(`金额：${amount}`);
  return lines;
}

function shouldUseStructuredBetAlert(reason: string, platform: string): boolean {
  if (platform === "Polymarket")
    return true;
  return reason.includes("\n") || reason.includes("【");
}

export function buildManualBetCheckFailureHtml(
  match: ViewMatch,
  bet: ViewBet,
  item: ViewBetItem,
  side: BetSide,
  odds: number,
  amount: number,
  checkError: string | undefined,
): string {
  const reason = String(checkError ?? "").trim() || "场馆未返回可用盘口，请稍后重试";
  const contextLines = buildManualBetContextLines(match, bet, item, side, odds, amount);
  const contextHtml = contextLines.map(line =>
    `<div class="manual-bet-alert__meta">${escapeHtml(line)}</div>`,
  ).join("");

  const reasonHtml = shouldUseStructuredBetAlert(reason, String(item.type))
    ? formatStructuredBetAlertInner(reason)
    : `<div class="poly-bet-alert__reason">${escapeHtml(reason)}</div>`;

  return `<div class="poly-bet-alert manual-bet-alert">${contextHtml}<div class="manual-bet-alert__divider"></div>${reasonHtml}</div>`;
}

export function buildManualBetOrderFailureHtml(message: string): string {
  return formatStructuredBetAlertHtml(message);
}
