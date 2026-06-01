import type { PlatformPlugin } from "@/platforms/types";
import { startPbCollector } from "./collect";
import { pbProvider } from "./bet";

export const pbPlugin: PlatformPlugin = {
  id: "PB",
  collector: startPbCollector,
  provider: pbProvider,
};
