import type { PlatformAdapter } from "@platform/contract";
import { polymarketProvider } from "./bet";
import { startPolymarketCollector } from "./collect";

export { startPolymarketCollector };
export * from "./api";
export * from "./bet";
export * from "./collect";
export * from "./parse";
export * from "./ws";

export const polymarketAdapter: PlatformAdapter = {
  id: "Polymarket",
  collector: startPolymarketCollector,
  provider: polymarketProvider,
};
