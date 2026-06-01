import type { PlatformPlugin } from "@/platforms/types";
import { startImCollector } from "./collect";
import { imProvider } from "./bet";

export const imPlugin: PlatformPlugin = {
  id: "IM",
  collector: startImCollector,
  provider: imProvider,
};
