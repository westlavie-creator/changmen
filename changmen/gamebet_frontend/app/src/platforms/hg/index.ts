import type { PlatformPlugin } from "@/platforms/types";
import { startHgCollector } from "./collect";
import { hgProvider } from "./bet";

export const hgPlugin: PlatformPlugin = {
  id: "HG",
  collector: startHgCollector,
  provider: hgProvider,
};
