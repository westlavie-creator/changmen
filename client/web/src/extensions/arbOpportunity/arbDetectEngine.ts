import type { UserConfig } from "@/types/userConfig";

/** [changmen 扩展] 套利检测策略（执行始终走 A8 主循环 executeArbBet） */
export type ArbDetectEngine = "a8" | "kakaxi";

export const ARB_DETECT_ENGINES: ArbDetectEngine[] = ["a8", "kakaxi"];

/** kakaxi 检测引擎可在扩展页选用 */
export const KAKAXI_ARB_DETECT_ENABLED = true;

export function resolveArbDetectEngine(
  config: Pick<UserConfig, "arbDetectEngine">,
): ArbDetectEngine {
  return config.arbDetectEngine === "kakaxi" ? "kakaxi" : "a8";
}

/** A8 检测：每 bet 试单，选腿在 executeArbBet 内完成 */
export function usesA8ArbDetectEngine(
  config: Pick<UserConfig, "arbDetectEngine">,
): boolean {
  return resolveArbDetectEngine(config) === "a8";
}

/** kakaxi 检测：赔率事件发现机会后通知 A8 额外触发 executeArbBet */
export function usesKakaxiArbDetectEngine(
  config: Pick<UserConfig, "arbDetectEngine">,
): boolean {
  return resolveArbDetectEngine(config) === "kakaxi" && KAKAXI_ARB_DETECT_ENABLED;
}

export function isKakaxiArbDetectSelectable(): boolean {
  return KAKAXI_ARB_DETECT_ENABLED;
}
