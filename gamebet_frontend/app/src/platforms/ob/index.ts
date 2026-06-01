import type { PlatformAdapter } from "@/platforms/contract";
import { startObCollector } from "./collect";
import { obProvider } from "./bet";

export const obAdapter: PlatformAdapter = {
  id: "OB",
  collector: startObCollector,
  provider: obProvider,
};
