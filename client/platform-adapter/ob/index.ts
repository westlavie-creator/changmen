import type { PlatformAdapter } from "@platform/contract";
import { obProvider } from "./frontend/bet";
import { startObCollector } from "./frontend/collect";

export { obProvider, startObCollector };
export * from "./frontend/bet";
export * from "./frontend/collect";

export const obAdapter: PlatformAdapter = {
  id: "OB",
  collector: startObCollector,
  provider: obProvider,
};
