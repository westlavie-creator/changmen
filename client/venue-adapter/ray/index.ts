import type { PlatformAdapter } from "@changmen/venue-adapter/contract";
import { rayProvider } from "./bet";
import { startRayCollector } from "./collect";

export { rayProvider, startRayCollector };
export * from "./bet";
export * from "./collect";
export {
  cycleRayWsSourceModeAndReconnect,
  getRayWsSourceMode,
  rayWsSourceModeLabel,
} from "./collect";
export type { RayWsSourceMode } from "./collect";

export const rayAdapter: PlatformAdapter = {
  id: "RAY",
  collector: startRayCollector,
  provider: rayProvider,
};
