import type { PlatformAdapter } from "@/platforms/contract";
import { startImCollector } from "./collect";
import { imProvider } from "./bet";

export const imAdapter: PlatformAdapter = {
  id: "IM",
  collector: startImCollector,
  provider: imProvider,
};
