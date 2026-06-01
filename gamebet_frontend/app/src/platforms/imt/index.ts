import type { PlatformAdapter } from "@/platforms/contract";
import { startImtCollector } from "./collect";
import { imtProvider } from "./bet";

export const imtAdapter: PlatformAdapter = {
  id: "IMT",
  collector: startImtCollector,
  provider: imtProvider,
};
