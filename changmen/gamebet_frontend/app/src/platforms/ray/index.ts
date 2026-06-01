import type { PlatformPlugin } from "@/platforms/types";
import { startRayCollector } from "./collect";
import { rayProvider } from "./bet";

export const rayPlugin: PlatformPlugin = {
  id: "RAY",
  collector: startRayCollector,
  provider: rayProvider,
};
