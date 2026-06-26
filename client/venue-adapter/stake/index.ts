import type { PlatformAdapter } from "@venue/contract";
import { stakeProvider } from "./bet";
import { startStakeCollector } from "./collect";

export { stakeProvider, startStakeCollector };
export * from "./bet";
export * from "./collect";
export * from "./tabId";

export const stakeAdapter: PlatformAdapter = {
  id: "Stake",
  collector: startStakeCollector,
  provider: stakeProvider,
};
