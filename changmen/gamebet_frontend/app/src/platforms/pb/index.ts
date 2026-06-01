import type { PlatformAdapter } from "@/platforms/contract";
import { startPbCollector } from "./collect";
import { pbProvider } from "./bet";

export const pbAdapter: PlatformAdapter = {
  id: "PB",
  collector: startPbCollector,
  provider: pbProvider,
};
