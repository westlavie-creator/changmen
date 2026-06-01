import type { PlatformAdapter } from "@/platforms/contract";
import { startHgCollector } from "./collect";
import { hgProvider } from "./bet";

export const hgAdapter: PlatformAdapter = {
  id: "HG",
  collector: startHgCollector,
  provider: hgProvider,
};
