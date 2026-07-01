/**
 * match-engine 侧 matcher 行为开关（由 @changmen/matcher/lib/config.js 同步，测试可覆盖）。
 * 勿从 process.env 读取业务开关。
 */

const DEFAULT_BEHAVIOR = {
  obSpineMerge: false,
  eventRegistry: true,
  registryMaterialize: false,
};

let behavior = { ...DEFAULT_BEHAVIOR };

function applyMatcherBehaviorConfig(overrides = {}) {
  if (typeof overrides.obSpineMerge === "boolean")
    behavior.obSpineMerge = overrides.obSpineMerge;
  if (typeof overrides.eventRegistry === "boolean")
    behavior.eventRegistry = overrides.eventRegistry;
  if (typeof overrides.registryMaterialize === "boolean")
    behavior.registryMaterialize = overrides.registryMaterialize;
}

function resetMatcherBehaviorConfig() {
  behavior = { ...DEFAULT_BEHAVIOR };
}

function isObSpineMergeEnabled() {
  return behavior.obSpineMerge;
}

function isEventRegistryEnabled() {
  return behavior.eventRegistry;
}

function isRegistryMaterializeEnabled() {
  return behavior.eventRegistry && behavior.registryMaterialize;
}

export {
  applyMatcherBehaviorConfig,
  isEventRegistryEnabled,
  isObSpineMergeEnabled,
  isRegistryMaterializeEnabled,
  resetMatcherBehaviorConfig,
};
