import { PLATFORMS } from "@changmen/venue-adapter/shared/platforms";

export { PLATFORMS };
export type { PlatformMeta } from "./meta";
export {
  ALL_PLATFORMS,
  PLATFORM_REGISTRY,
  betPlatformIds,
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
