import type { PlatformAdapter } from "@platform/contract";
import { rayProvider } from "./frontend/bet";
import { startRayCollector } from "./frontend/collect";

export { rayProvider, startRayCollector };
export * from "./frontend/bet";
export * from "./frontend/collect";

export const rayAdapter: PlatformAdapter = {
  id: "RAY",
  collector: startRayCollector,
  provider: rayProvider,
};
