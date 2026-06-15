import type { PlatformAdapter } from "@platform/contract";
import { startXbetCollector } from "./collect";

export { startXbetCollector };
export * from "./collect";

export const xbetAdapter: PlatformAdapter = {
  id: "XBet",
  collector: startXbetCollector,
};
