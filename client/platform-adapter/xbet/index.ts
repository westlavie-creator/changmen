import type { PlatformAdapter } from "@platform/contract";
import { startXbetCollector } from "./frontend/collect";

export { startXbetCollector };
export * from "./frontend/collect";

export const xbetAdapter: PlatformAdapter = {
  id: "XBet",
  collector: startXbetCollector,
};
