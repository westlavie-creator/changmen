import type { PlatformAdapter } from "@platform/contract";
import { iaProvider } from "./frontend/bet";
import { startIaCollector } from "./frontend/collect";

export { iaProvider, startIaCollector };
export * from "./frontend/bet";
export * from "./frontend/collect";

export const iaAdapter: PlatformAdapter = {
  id: "IA",
  collector: startIaCollector,
  provider: iaProvider,
};
