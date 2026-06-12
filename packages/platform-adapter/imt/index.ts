import type { PlatformAdapter } from "@platform/contract";
import { imtProvider } from "./frontend/bet";
import { startImtCollector } from "./frontend/collect";

export { imtProvider, startImtCollector };
export * from "./frontend/bet";
export * from "./frontend/collect";

export const imtAdapter: PlatformAdapter = {
  id: "IMT",
  collector: startImtCollector,
  provider: imtProvider,
};
