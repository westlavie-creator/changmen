export { isComposerWriteEnabled } from "./lib/config.js";
export { assertComposerMayWrite } from "./lib/write_guard.js";
export { runComposerOnce, startComposerLoop } from "./loop.js";
export { composeOnce } from "./ops/compose_once.js";
export { applyPlatformBindings, clusterByGbThenName } from "./src/cluster/merge_clusters.js";
export {
  checkBetsWithinPeriods,
  checkHomeSlotConsistency,
  checkNotSamePhysicalSide,
  checkReverseSubsetOfSources,
  checkSourcesMatchLockTeams,
  checkUnlockedEmpty,
} from "./src/invariants.js";
export { filterActiveClientMatches, isClientMatchEnded } from "./src/shape/ended_filter.js";
export { applyLiveShape, filterMultiPlatform } from "./src/shape/live_shape.js";
export {
  LOCK_ANCHOR_PLATFORMS,
  pickLockFromAnchors,
  resolveOrientationLock,
  sideModeAgainstLock,
} from "./src/sides/orientation_lock.js";
export { projectClientMatchSides, projectList, projectPlatformSource } from "./src/sides/project_sources.js";
export {
  collectPeriods,
  resolveMatchStructure,
  resolveRowBo,
  resolveRowStructure,
} from "./src/structure/resolve_structure.js";
export { clientMatchWriteRow, gbTeamIdForWrite } from "./src/write_payload.js";
