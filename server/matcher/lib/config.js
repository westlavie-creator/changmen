/**
 * Matcher 配置唯一入口。
 * - 部署参数：可从 env 覆盖（端口、间隔等）
 * - 业务行为：代码常量，改此处并发版；勿用 env 开关
 */

import { applyMatcherBehaviorConfig } from "@changmen/match-engine";

const DEFAULT_MATCHER_INTERVAL_MS = 30_000;
const DEFAULT_UI_PORT = 4567;
const DEFAULT_CLIENT_MATCH_ARCHIVE_INTERVAL_MS = 60 * 60 * 1000;

/** @type {const} */
const DEFAULT_BEHAVIOR = {
  /** 是否将 provisional（队名合并）场次写入 client_matches */
  publishProvisional: false,
  /** true 时仅发布 verified 场次（更严，推荐） */
  publishTierVerifiedOnly: true,
  /** 未匹配平台按 client_matches.matchs.OB 槽位对齐（legacy，Event-first 下可忽略） */
  obSpineAlign: true,
  /** 已废弃：合并在 auto-bind mergeHints 内 */
  obSpineMerge: false,
  /** 双写 match_events / event_bindings */
  eventRegistry: true,
  /** 每轮 event_bindings → platform_matches 回写 */
  registryReconcile: true,
  /** client_matches 从真相表组装（Event-first 主路径） */
  registryMaterialize: true,
};

let behavior = { ...DEFAULT_BEHAVIOR };

export const MATCHER_INTERVAL_MS = Number(
  process.env.MATCHER_INTERVAL_MS || DEFAULT_MATCHER_INTERVAL_MS,
);

export const MATCHER_CLIENT_MATCH_ARCHIVE_INTERVAL_MS = Number(
  process.env.MATCHER_CLIENT_MATCH_ARCHIVE_INTERVAL_MS
  || process.env.MATCHER_PRUNE_INTERVAL_MS
  || DEFAULT_CLIENT_MATCH_ARCHIVE_INTERVAL_MS,
);

export const MATCHER_UI_PORT = Number(
  process.env.MATCHER_UI_PORT || process.env.PIPEI_PORT || DEFAULT_UI_PORT,
);

/** 仅开发显式开启；须 NODE_ENV=development|test，生产或未设置 NODE_ENV 时永远无效 */
export function isMatcherSkipAuthEnabled() {
  if (String(process.env.MATCHER_SKIP_AUTH || "").trim() !== "1")
    return false;
  const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
  return nodeEnv === "development" || nodeEnv === "test";
}

export function getMatcherBehavior() {
  return { ...behavior };
}

/** 单测覆盖行为；生产勿调用 */
export function setMatcherBehaviorForTest(overrides = {}) {
  behavior = { ...behavior, ...overrides };
  syncBehaviorToMatchEngine();
}

/** 单测恢复默认 */
export function resetMatcherBehaviorForTest() {
  behavior = { ...DEFAULT_BEHAVIOR };
  syncBehaviorToMatchEngine();
}

export function syncBehaviorToMatchEngine() {
  applyMatcherBehaviorConfig({
    obSpineMerge: behavior.obSpineMerge,
    eventRegistry: behavior.eventRegistry,
    registryMaterialize: behavior.registryMaterialize,
  });
}

export const isPublishProvisionalEnabled = () => behavior.publishProvisional;
export const isPublishTierVerifiedOnly = () => behavior.publishTierVerifiedOnly;
export const isObSpineAlignEnabled = () => behavior.obSpineAlign;
export const isObSpineMergeEnabled = () => behavior.obSpineMerge;
export const isEventRegistryEnabled = () => behavior.eventRegistry;
export const isRegistryReconcileEnabled = () => behavior.eventRegistry && behavior.registryReconcile;
export const isRegistryMaterializeEnabled = () => behavior.eventRegistry && behavior.registryMaterialize;

export function publishFilterLabel() {
  if (isPublishTierVerifiedOnly())
    return "verified-only";
  if (!isPublishProvisionalEnabled())
    return "no-provisional";
  return "default";
}

syncBehaviorToMatchEngine();
