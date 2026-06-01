import type { PlatformPlugin } from "@/platforms/types";
import { startSabaCollector } from "./collect";
import { sabaProvider } from "./bet";

export const sabaPlugin: PlatformPlugin = {
  id: "SABA",
  collector: startSabaCollector,
  provider: sabaProvider,
};
