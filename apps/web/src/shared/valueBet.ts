import type { ArbLegs } from "@/shared/arbitrage";
import { percent } from "@/shared/format";
import { useMatchStore } from "@/stores/matchStore";
import type { BetSide, ViewBetItem } from "@/models/match";
import type { PlatformId } from "@/types/esport";

export interface ValueBetLeg {
  side: BetSide;
  platform: PlatformId;
  currentOdds: number;
  defaultOdds: number;
  /** 相对初赔去水公允胜率：fairP * currentOdds - 1 */
  ev: number;
  isValue: boolean;
}

export interface ValueBetAssessment {
  ok: boolean;
  isValue: boolean;
  legs: ValueBetLeg[];
  summary: string;
}

/** 初赔去水 → 公允胜率（与 winRate.ts / BetRow 初赔行同一基准） */
export function fairProbFromDefault(defaultHome: number, defaultAway: number) {
  const invH = 1 / defaultHome;
  const invA = 1 / defaultAway;
  const sum = invH + invA;
  return { pHome: invH / sum, pAway: invA / sum };
}

function legEv(fairP: number, currentOdds: number) {
  return fairP * currentOdds - 1;
}

export interface ValueBetLegsInput {
  homeItem: Pick<ViewBetItem, "type">;
  awayItem: Pick<ViewBetItem, "type">;
  homeOdds: number;
  awayOdds: number;
}

/**
 * 价值下注：相对初赔公允线，至少一腿 EV &gt; 0（现赔优于初赔隐含公允，不只是跨平台机械套利）。
 * [changmen 扩展] A8 bundle 无同名能力；初赔语义对齐 winRate / BetRow。
 */
export function assessValueBetFromDefaultOdds(
  defaultHome: number,
  defaultAway: number,
  legs: ValueBetLegsInput,
): ValueBetAssessment {
  if (!defaultHome || !defaultAway) {
    return {
      ok: false,
      isValue: false,
      legs: [],
      summary: "价值下注：初赔未齐，无法判断",
    };
  }

  const { pHome, pAway } = fairProbFromDefault(defaultHome, defaultAway);
  const rows: ValueBetLeg[] = [
    {
      side: "Home",
      platform: legs.homeItem.type,
      currentOdds: legs.homeOdds,
      defaultOdds: defaultHome,
      ev: legEv(pHome, legs.homeOdds),
      isValue: legEv(pHome, legs.homeOdds) > 0,
    },
    {
      side: "Away",
      platform: legs.awayItem.type,
      currentOdds: legs.awayOdds,
      defaultOdds: defaultAway,
      ev: legEv(pAway, legs.awayOdds),
      isValue: legEv(pAway, legs.awayOdds) > 0,
    },
  ];

  const valueLegs = rows.filter((r) => r.isValue);
  const isValue = valueLegs.length > 0;
  let summary: string;
  if (!isValue) {
    summary = "价值下注：否（相对初赔公允线，两腿均无正 EV）";
  } else {
    const detail = valueLegs
      .map((r) => {
        const sideLabel = r.side === "Home" ? "主" : "客";
        return `${sideLabel} ${r.platform} EV +${percent(r.ev)}（初 ${r.defaultOdds}→现 ${r.currentOdds}）`;
      })
      .join("；");
    summary = `价值下注：是（${detail}）`;
  }

  return { ok: true, isValue, legs: rows, summary };
}

export function assessValueBet(betId: number, legs: ArbLegs): ValueBetAssessment {
  const matchStore = useMatchStore();
  return assessValueBetFromDefaultOdds(
    matchStore.getDefaultOdds(betId, "Home"),
    matchStore.getDefaultOdds(betId, "Away"),
    legs,
  );
}

export function formatValueBetTelegramLine(assessment: ValueBetAssessment): string {
  return assessment.summary;
}
