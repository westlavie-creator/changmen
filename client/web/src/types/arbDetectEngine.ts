/** [changmen 扩展] 套利调度模式（配置键 arbDetectEngine；执行共用 executeArbBet） */
export type ArbDetectEngine = "a8" | "kakaxi";

export const ARB_DETECT_ENGINES: ArbDetectEngine[] = ["a8", "kakaxi"];

/** kakaxi 调度可在扩展页选用 */
export const KAKAXI_ARB_DETECT_ENABLED = true;

export interface ArbDetectEngineConfig {
  arbDetectEngine?: ArbDetectEngine;
}

export function resolveArbDetectEngine(config: ArbDetectEngineConfig): ArbDetectEngine {
  return config.arbDetectEngine === "kakaxi" ? "kakaxi" : "a8";
}

/** A8 调度：每 bet 试单，选腿在 executeArbBet 内完成 */
export function usesA8ArbDetectEngine(config: ArbDetectEngineConfig): boolean {
  return resolveArbDetectEngine(config) === "a8";
}

/** kakaxi 调度：队列 + detectFeed → executeArbBet */
export function usesKakaxiArbDetectEngine(config: ArbDetectEngineConfig): boolean {
  return resolveArbDetectEngine(config) === "kakaxi" && KAKAXI_ARB_DETECT_ENABLED;
}

export function isKakaxiArbDetectSelectable(): boolean {
  return KAKAXI_ARB_DETECT_ENABLED;
}

/** @deprecated 使用 ArbDetectEngine */
export type ArbExecutionMode = ArbDetectEngine;

/** @deprecated 使用 resolveArbDetectEngine */
export const resolveArbExecutionMode = resolveArbDetectEngine;

/** @deprecated 使用 usesA8ArbDetectEngine */
export const isA8ExecutionMode = usesA8ArbDetectEngine;

/** @deprecated 使用 usesKakaxiArbDetectEngine */
export const isKakaxiExecutionMode = usesKakaxiArbDetectEngine;
