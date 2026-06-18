import type { UserConfig } from "@/types/userConfig";
import {
  resolveArbDetectEngine,
  usesA8ArbDetectEngine,
  usesKakaxiArbDetectEngine,
  type ArbDetectEngine,
} from "@/extensions/arbOpportunity/arbDetectEngine";

/** 套利执行调度模式（配置键仍为 arbDetectEngine） */
export type ArbExecutionMode = ArbDetectEngine;

export function resolveArbExecutionMode(
  config: Pick<UserConfig, "arbDetectEngine">,
): ArbExecutionMode {
  return resolveArbDetectEngine(config);
}

export function isA8ExecutionMode(config: Pick<UserConfig, "arbDetectEngine">): boolean {
  return usesA8ArbDetectEngine(config);
}

export function isKakaxiExecutionMode(config: Pick<UserConfig, "arbDetectEngine">): boolean {
  return usesKakaxiArbDetectEngine(config);
}
