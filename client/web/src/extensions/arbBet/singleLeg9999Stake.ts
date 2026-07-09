import type { BetOption } from "@/models/betOption";
import type { UserConfig } from "@/types/userConfig";
import { readValueBetMoney } from "@/extensions/valueBet/valueBetStake";

/**
 * [changmen 扩展] 9999 单边真下单腿改用正 EV 固定金额（方案 A：预检腿不动）。
 * @returns 实际写入的金额；未改写时返回 null
 */
export function applyValueBetMoneyTo9999LiveLeg(params: {
  singleLegByRate: boolean;
  enabled: boolean;
  config: Pick<UserConfig, "valueBetMoney" | "tenNumber">;
  legA: BetOption;
  legB: BetOption;
  /** 有 live 下单账号的一侧 */
  liveSide: "A" | "B" | null;
}): number | null {
  const { singleLegByRate, enabled, config, legA, legB, liveSide } = params;
  if (!singleLegByRate || !enabled || !liveSide)
    return null;

  let stake = readValueBetMoney(config);
  if (stake <= 0)
    return null;
  if (config.tenNumber)
    stake = Math.round(stake / 10) * 10;
  if (stake <= 0)
    return null;

  if (liveSide === "A")
    legA.betMoney = stake;
  else
    legB.betMoney = stake;
  return stake;
}

/** 9999 时哪一侧有 live 下单账号（另一侧仅预检） */
export function resolve9999LiveSide(
  accountA: unknown,
  accountB: unknown,
): "A" | "B" | null {
  if (accountA && !accountB)
    return "A";
  if (accountB && !accountA)
    return "B";
  return null;
}
