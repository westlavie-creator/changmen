import type { PlatformAdapter } from "@venue/contract";
import { rayProvider } from "./bet";
import { startRayCollector } from "./collect";

export { rayProvider, startRayCollector };
export * from "./bet";
export * from "./collect";

export const rayAdapter: PlatformAdapter = {
  id: "RAY",
  collector: startRayCollector,
  provider: rayProvider,
};
