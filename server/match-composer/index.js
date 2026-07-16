export { composeOnce } from "./ops/compose_once.js";
export { runComposerOnce, startComposerLoop } from "./loop.js";
export { clusterByGbThenName, applyPlatformBindings } from "./src/cluster/merge_clusters.js";
export { projectList, projectClientMatchSides, projectPlatformSource } from "./src/sides/project_sources.js";
export {
  LOCK_ANCHOR_PLATFORMS,
  resolveOrientationLock,
  sideModeAgainstLock,
  pickLockFromAnchors,
} from "./src/sides/orientation_lock.js";
export {
  checkHomeSlotConsistency,
  checkNotSamePhysicalSide,
  checkReverseSubsetOfSources,
  checkSourcesMatchLockTeams,
  checkUnlockedEmpty,
} from "./src/invariants.js";
export { clientMatchWriteRow, gbTeamIdForWrite } from "./src/write_payload.js";
export { assertComposerMayWrite } from "./lib/write_guard.js";
export { isComposerWriteEnabled } from "./lib/config.js";
export { filterActiveClientMatches, isClientMatchEnded } from "./src/shape/ended_filter.js";
export { filterMultiPlatform, applyLiveShape } from "./src/shape/live_shape.js";
