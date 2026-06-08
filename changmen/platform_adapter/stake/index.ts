import type { PlatformAdapter } from "@platform/contract";
import { stakeProvider } from "./frontend/bet";
import { startStakeCollector } from "./frontend/collect";

export { stakeProvider, startStakeCollector };
export * from "./frontend/bet";
export * from "./frontend/collect";
export * from "./frontend/tabId";

export const stakeAdapter: PlatformAdapter = {
  id: "Stake",
  collector: startStakeCollector,
  provider: stakeProvider,
};
