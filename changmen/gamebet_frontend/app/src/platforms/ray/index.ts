import type { PlatformAdapter } from "@/platforms/contract";
import { startRayCollector } from "./collect";
import { rayProvider } from "./bet";

export const rayAdapter: PlatformAdapter = {
  id: "RAY",
  collector: startRayCollector,
  provider: rayProvider,
};
