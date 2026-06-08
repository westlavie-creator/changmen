import type { PlatformAdapter } from "@platform/contract";
import { sabaProvider } from "./frontend/bet";
import { startSabaCollector } from "./frontend/collect";

export { sabaProvider, startSabaCollector };
export * from "./frontend/bet";
export * from "./frontend/collect";

export const sabaAdapter: PlatformAdapter = {
  id: "SABA",
  collector: startSabaCollector,
  provider: sabaProvider,
};
