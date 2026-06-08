import type { PlatformAdapter } from "@platform/contract";
import { tfProvider } from "./frontend/bet";
import { startTfCollector } from "./frontend/collect";

export { tfProvider, startTfCollector };
export * from "./frontend/auth";
export * from "./frontend/bet";
export * from "./frontend/collect";

export const tfAdapter: PlatformAdapter = {
  id: "TF",
  collector: startTfCollector,
  provider: tfProvider,
};
