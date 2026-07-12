import type { ArbMarketWatchContext } from "@/extensions/arbMarketWatch/marketWatchContext";
import type { ArbMarketWatchGroup } from "@/extensions/arbMarketWatch/watchSinks";
import type { ArbOpportunity } from "@changmen/arb-core/opportunity/types";
import {

  explainNotExecutable,
} from "@/extensions/arbMarketWatch/marketWatchContext";
import { sameOpportunityLegs } from "@/extensions/arbMarketWatch/watchSinks";
import { arbProfitRate, toFixed } from "@/shared/format";

function formatLegCompact(opp: ArbOpportunity): string {
  return `${opp.homePlatform}@${toFixed(opp.homeOdds, 3)}(主) ↔ ${opp.awayPlatform}@${toFixed(opp.awayOdds, 3)}(客)`;
}

function formatMatchLine(group: ArbMarketWatchGroup): string {
  const ctx = group.context;
  if (ctx?.game) {
    return `[${ctx.game}] ${ctx.homeName} vs ${ctx.awayName} · ${group.betName}`;
  }
  return `${group.matchTitle} · ${group.betName}`;
}

function formatExecutableStatus(
  fullMarket: ArbOpportunity | undefined,
  funded: ArbOpportunity | undefined,
  context: ArbMarketWatchContext | undefined,
): string {
  if (!fullMarket)
    return "可执行：—";

  const bettingOff = context?.bettingEnabled === false;
  if (bettingOff)
    return "可执行：未开启投注";

  if (funded && sameOpportunityLegs(fullMarket, funded)) {
    return "可执行：是";
  }

  if (funded) {
    return `可执行：${formatLegCompact(funded)} · ${arbProfitRate(funded.implied)}`;
  }

  const reason = context
    ? explainNotExecutable(fullMarket, context)
    : "当前账号无法覆盖理论最优腿";
  return `可执行：无（${reason}）`;
}

function formatAppearedBody(group: Extract<ArbMarketWatchGroup, { kind: "appeared" }>): string {
  const { fullMarket, funded, context } = group;
  const opp = fullMarket ?? funded;
  if (!opp)
    return `<b>🔶 套利机会</b>\n${formatMatchLine(group)}`;

  const lines = [
    "<b>🔶 套利机会</b>",
    formatMatchLine(group),
    `${formatLegCompact(opp)} · ${arbProfitRate(opp.implied)}`,
    formatExecutableStatus(fullMarket, funded, context),
  ];
  return lines.join("\n");
}

function formatGoneBody(group: Extract<ArbMarketWatchGroup, { kind: "gone" }>): string {
  return ["<b>⚪ 套利机会结束</b>", formatMatchLine(group)].join("\n");
}

/** HTML 正文（由 messageStore.marketWatchMessage 入队） */
export function formatMarketWatchGroup(group: ArbMarketWatchGroup): string {
  return group.kind === "appeared" ? formatAppearedBody(group) : formatGoneBody(group);
}
