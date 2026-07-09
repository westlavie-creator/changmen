import type { UserConfig } from "@/types/userConfig";
import { MIN_EDGE } from "@/extensions/valueBet/evConfig";

/**
 * [changmen 扩展] 第一期：正 EV 固定建议注码（只读展示，不下单）。
 * edge < MIN_EDGE 时不展示金额；valueBetMoney<=0 时只展示 edge%。
 */
export function valueBetSuggestedStake(
  edge: number,
  valueBetMoney: number | undefined | null,
): number | null {
  if (!(Number.isFinite(edge) && edge >= MIN_EDGE))
    return null;
  const stake = Number(valueBetMoney);
  if (!Number.isFinite(stake) || stake <= 0)
    return null;
  return Math.round(stake);
}

export function formatValueBetLabel(
  edge: number,
  valueBetMoney: number | undefined | null,
): string | undefined {
  if (!(Number.isFinite(edge) && edge > 0))
    return undefined;
  const pct = `+${(edge * 100).toFixed(1)}%`;
  const stake = valueBetSuggestedStake(edge, valueBetMoney);
  if (stake == null)
    return pct;
  return `${pct} ¥${stake}`;
}

export function readValueBetMoney(config: Pick<UserConfig, "valueBetMoney"> | null | undefined): number {
  const n = Number(config?.valueBetMoney);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 100;
}
