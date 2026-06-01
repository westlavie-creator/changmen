import type { PlatformPlugin } from "@/platforms/types";
import { startObCollector } from "./collect";
import { obProvider } from "./bet";

export const obPlugin: PlatformPlugin = {
  id: "OB",
  collector: startObCollector,
  provider: obProvider,
};
