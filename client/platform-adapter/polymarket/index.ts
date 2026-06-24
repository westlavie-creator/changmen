import type { PlatformAdapter } from "@platform/contract";
import { startPolymarketCollector } from "./collect";

export { startPolymarketCollector };
export * from "./api";
export * from "./collect";
export * from "./parse";

export const polymarketAdapter: PlatformAdapter = {
  id: "Polymarket",
  collector: startPolymarketCollector,
};
