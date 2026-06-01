import type { PlatformAdapter } from "@/platforms/contract";
import { startSabaCollector } from "./collect";
import { sabaProvider } from "./bet";

export const sabaAdapter: PlatformAdapter = {
  id: "SABA",
  collector: startSabaCollector,
  provider: sabaProvider,
};
