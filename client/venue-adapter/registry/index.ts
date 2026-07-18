import { PLATFORMS } from "../shared/platforms";

export { PLATFORMS };
export type { PlatformMeta } from "./meta";
export {
  ALL_PLATFORMS,
  PLATFORM_REGISTRY,
  betPlatformIds,
  browserSaveMatchPlatformIds,
  collectPlatformIds,
  getPlatformMeta,
  platformDir,
  platformSupportsBet,
  platformSupportsCollect,
} from "./meta";

export {
  getPlatformIconFile,
  getPlatformIconUrl,
  platformIdsWithIcons,
  VENUE_ICON_PUBLIC_DIR,
} from "./icons";
