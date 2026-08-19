import type { UserConfig } from "@/types/userConfig";
import { MIN_EDGE } from "@/extensions/valueBet/evConfig";

/**
 * [changmen 扩展] 第一期：正 EV 固定建议注码（只读展示，不下单）。
 * edge < minEdge 时不展示金额；valueBetMoney<=0 时只展示 edge%。
 */
export function valueBetSuggestedStake(
  edge: number,
  valueBetMoney: number | undefined | null,
  minEdge = MIN_EDGE,
): number | null {
  if (!(Number.isFinite(edge) && edge >= minEdge))
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

/** 自动/确认下单注码：正EV金额，可选十位取整。≤0 表示未配置。 */
export function resolveValueBetStake(
  config: Pick<UserConfig, "valueBetMoney" | "tenNumber"> | null | undefined,
): number {
  let stake = readValueBetMoney(config);
  if (stake <= 0)
    return 0;
  if (config?.tenNumber)
    stake = Math.round(stake / 10) * 10;
  return stake > 0 ? stake : 0;
}
