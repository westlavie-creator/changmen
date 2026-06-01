import type { PlatformPlugin } from "@/platforms/types";
import { startStakeCollector } from "./collect";
import { stakeProvider } from "./bet";

export const stakePlugin: PlatformPlugin = {
  id: "Stake",
  collector: startStakeCollector,
  provider: stakeProvider,
};
