import type { ArbMarketWatchGroup } from "@/extensions/arbMarketWatch/watchSinks";
import { sameOpportunityLegs } from "@/extensions/arbMarketWatch/watchSinks";
import type { ArbOpportunity } from "@/extensions/arbOpportunity/types";
import { arbProfitRate, toFixed } from "@/shared/format";

function formatLegLine(opp: ArbOpportunity): string {
  return `${opp.homePlatform}@${toFixed(opp.homeOdds, 3)} (主) ↔ ${opp.awayPlatform}@${toFixed(opp.awayOdds, 3)} (客)`;
}

function formatLegLineShort(opp: ArbOpportunity): string {
  return `${opp.homePlatform}@${toFixed(opp.homeOdds, 3)} ↔ ${opp.awayPlatform}@${toFixed(opp.awayOdds, 3)}`;
}

function formatProfitLine(opp: ArbOpportunity): string {
  const profitMoney = toFixed(opp.implied * 100 - 100, 2);
  return `利润：${arbProfitRate(opp.implied)}（投100约赚${profitMoney}元）`;
}

function formatAppearedBody(group: Extract<ArbMarketWatchGroup, { kind: "appeared" }>): string {
  const lines = ["<b>🔶 套利机会</b>", `${group.matchTitle} / ${group.betName}`];
  const { fullMarket, funded } = group;

  if (fullMarket && funded && sameOpportunityLegs(fullMarket, funded)) {
    lines.push(formatLegLine(fullMarket));
    lines.push(formatProfitLine(fullMarket));
    lines.push("账号可下单：是");
    return lines.join("\n");
  }

  if (fullMarket) {
    lines.push("", "理论最优：" + formatLegLine(fullMarket));
    lines.push(formatProfitLine(fullMarket));
  }

  if (funded) {
    lines.push("", "可执行：" + formatLegLine(funded));
    lines.push(formatProfitLine(funded));
  } else if (fullMarket) {
    lines.push("", "可执行：无（当前账号无法覆盖理论最优腿）");
  }

  return lines.join("\n");
}

function formatGoneBody(group: Extract<ArbMarketWatchGroup, { kind: "gone" }>): string {
  const lines = ["<b>⚪ 套利机会结束</b>", `${group.matchTitle} / ${group.betName}`];
  const { fullMarket, funded } = group;

  if (fullMarket && funded && sameOpportunityLegs(fullMarket, funded)) {
    lines.push(formatLegLineShort(fullMarket));
    return lines.join("\n");
  }

  if (fullMarket) {
    lines.push("理论：" + formatLegLineShort(fullMarket));
  }
  if (funded) {
    lines.push("可执行：" + formatLegLineShort(funded));
  }

  return lines.join("\n");
}

/** HTML 正文（由 messageStore.marketWatchMessage 入队） */
export function formatMarketWatchGroup(group: ArbMarketWatchGroup): string {
  return group.kind === "appeared" ? formatAppearedBody(group) : formatGoneBody(group);
}
