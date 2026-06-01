import type { PlatformAdapter } from "@/platforms/contract";
import { startStakeCollector } from "./collect";
import { stakeProvider } from "./bet";

export const stakeAdapter: PlatformAdapter = {
  id: "Stake",
  collector: startStakeCollector,
  provider: stakeProvider,
};
