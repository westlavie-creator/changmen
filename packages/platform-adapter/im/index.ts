import type { PlatformAdapter } from "@platform/contract";
import { imProvider } from "./frontend/bet";
import { startImCollector } from "./frontend/collect";

export { imProvider, startImCollector };
export * from "./frontend/bet";
export * from "./frontend/collect";
export * from "./frontend/parse";

export const imAdapter: PlatformAdapter = {
  id: "IM",
  collector: startImCollector,
  provider: imProvider,
};
