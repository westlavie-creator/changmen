export { composeOnce } from "./compose/compose_once.js";
export { runComposerOnce, startComposerLoop } from "./compose/loop.js";
export { startMatcherLoop } from "./loop.js";
export { clusterByGbThenName, applyPlatformBindings } from "./compose/cluster/merge_clusters.js";
export { projectList, projectClientMatchSides, projectPlatformSource } from "./compose/sides/project_sources.js";
export {
  LOCK_ANCHOR_PLATFORMS,
  resolveOrientationLock,
  sideModeAgainstLock,
  pickLockFromAnchors,
} from "./compose/sides/orientation_lock.js";
export {
  checkHomeSlotConsistency,
  checkNotSamePhysicalSide,
  checkReverseSubsetOfSources,
  checkSourcesMatchLockTeams,
  checkUnlockedEmpty,
} from "./compose/invariants.js";
export { clientMatchWriteRow, gbTeamIdForWrite } from "./compose/write_payload.js";
export { assertComposerMayWrite } from "./lib/write_guard.js";
export { isComposerWriteEnabled } from "./lib/config.js";
export { filterActiveClientMatches, isClientMatchEnded } from "./compose/shape/ended_filter.js";
export { filterMultiPlatform, applyLiveShape } from "./compose/shape/live_shape.js";
