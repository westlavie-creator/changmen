import {
  explainNotExecutable,
  type ArbMarketWatchContext,
} from "@/extensions/arbMarketWatch/marketWatchContext";
import type { ArbMarketWatchGroup } from "@/extensions/arbMarketWatch/watchSinks";
import { sameOpportunityLegs } from "@/extensions/arbMarketWatch/watchSinks";
import type { ArbOpportunity } from "@/extensions/arbOpportunity/types";
import { arbProfitRate, formatDate, percent, toFixed } from "@/shared/format";

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

function formatOddsCell(odds: number): string {
  return odds > 0 ? toFixed(odds, 3) : "—";
}

function formatMatchHeader(group: ArbMarketWatchGroup): string[] {
  const ctx = group.context;
  const lines: string[] = ["<b>🔶 套利机会</b>"];

  if (ctx?.game) {
    lines.push(`[${ctx.game}] ${ctx.homeName} vs ${ctx.awayName}`);
  } else {
    lines.push(group.matchTitle);
  }

  const meta: string[] = [`盘口：${group.betName}`];
  if (ctx?.bo && ctx.bo > 0) meta.push(`BO${ctx.bo}`);
  if (ctx?.isLiveBet) meta.push("进行中");
  else if (ctx?.liveRound && ctx.betRound > 0 && ctx.liveRound !== ctx.betRound) {
    meta.push(`当前第${ctx.liveRound}局`);
  }
  lines.push(meta.join(" | "));

  if (ctx?.startAt) {
    lines.push(`开赛：${formatDate(ctx.startAt)}`);
  }

  const opp = group.fullMarket ?? group.funded;
  if (opp) {
    lines.push(`赛事#${opp.matchId} · 盘口#${opp.betId}`);
  }

  if (ctx?.linkedPlatforms.length) {
    lines.push(`已关联：${ctx.linkedPlatforms.join(" / ")}`);
  }

  return lines;
}

function formatPlatformOddsBlock(ctx: ArbMarketWatchContext): string[] {
  if (!ctx.platformOdds.length) return [];
  const lines = ["", "<b>各平台赔率</b>"];
  for (const row of ctx.platformOdds) {
    const mark = row.hasAccount ? "✓" : "·";
    lines.push(
      `${row.platform.padEnd(4)} 主${formatOddsCell(row.homeOdds)} / 客${formatOddsCell(row.awayOdds)} ${mark}`,
    );
  }
  lines.push("（✓=当前有可下单账号）");
  return lines;
}

function formatThresholdBlock(ctx: ArbMarketWatchContext): string[] {
  return [
    "",
    `门槛：利润≥${percent(ctx.minProfit - 1, 1)} · 最高${percent(ctx.maxProfit - 1, 1)} · 最低赔率≥${toFixed(ctx.minOdds, 2)}`,
  ];
}

function formatAppearedBody(group: Extract<ArbMarketWatchGroup, { kind: "appeared" }>): string {
  const lines = formatMatchHeader(group);
  const { fullMarket, funded, context } = group;

  if (context) {
    lines.push(...formatPlatformOddsBlock(context));
  }

  const bettingOff = context?.bettingEnabled === false;

  if (fullMarket && funded && sameOpportunityLegs(fullMarket, funded) && !bettingOff) {
    lines.push("", "<b>可下单套利</b>");
    lines.push(formatLegLine(fullMarket));
    lines.push(formatProfitLine(fullMarket));
    lines.push("账号可下单：是");
    if (context) lines.push(...formatThresholdBlock(context));
    return lines.join("\n");
  }

  if (fullMarket) {
    lines.push("", "<b>理论最优</b>");
    lines.push(formatLegLine(fullMarket));
    lines.push(formatProfitLine(fullMarket));
  }

  if (bettingOff) {
    lines.push("", "<b>可执行</b>：无");
    lines.push("原因：未开启投注");
  } else if (funded) {
    lines.push("", "<b>可执行</b>");
    lines.push(formatLegLine(funded));
    lines.push(formatProfitLine(funded));
  } else if (fullMarket) {
    lines.push("", "<b>可执行</b>：无");
    if (context) {
      lines.push(`原因：${explainNotExecutable(fullMarket, context)}`);
    } else {
      lines.push("原因：当前账号无法覆盖理论最优腿");
    }
  }

  if (context) lines.push(...formatThresholdBlock(context));
  return lines.join("\n");
}

function formatGoneBody(group: Extract<ArbMarketWatchGroup, { kind: "gone" }>): string {
  const ctx = group.context;
  const lines = ["<b>⚪ 套利机会结束</b>"];

  if (ctx?.game) {
    lines.push(`[${ctx.game}] ${ctx.homeName} vs ${ctx.awayName}`);
  } else {
    lines.push(group.matchTitle);
  }
  lines.push(`盘口：${group.betName}`);

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
