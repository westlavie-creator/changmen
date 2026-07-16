export { projectMergeOnce } from "./ops/project_merge_once.js";
export { runProjectorOnce, startProjectorLoop } from "./loop.js";
export {
  applyOverride,
  betHasOdds,
  normalizeOverrideMode,
  projectPlatformSource,
  projectClientMatchSides,
  reprojectClientMatchList,
} from "./src/project_side_sources.js";
export {
  LOCK_ANCHOR_PLATFORMS,
  isStickyOrientationEnabled,
  listAvailableLockAnchors,
  pickLockFromAnchors,
  resolveOrientationLock,
  sameTeamPair,
  sideModeAgainstLock,
} from "./src/orientation_lock.js";
export {
  checkHomeSlotConsistency,
  checkNotSamePhysicalSide,
  checkReverseSubsetOfSources,
  checkSourcesMatchLockTeams,
  checkUnlockedEmpty,
  resolveOidToGb,
} from "./src/invariants.js";
export { assertProjectorMayWrite } from "./lib/write_guard.js";
