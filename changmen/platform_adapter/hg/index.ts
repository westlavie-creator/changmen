import type { PlatformAdapter } from "@platform/contract";
import { hgProvider } from "./frontend/bet";
import { startHgCollector } from "./frontend/collect";

export { hgProvider, startHgCollector };
export * from "./frontend/bet";
export * from "./frontend/collect";
export * from "./frontend/follow";

export const hgAdapter: PlatformAdapter = {
  id: "HG",
  collector: startHgCollector,
  provider: hgProvider,
};
