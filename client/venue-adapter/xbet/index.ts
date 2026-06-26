import type { PlatformAdapter } from "@venue/contract";
import { startXbetCollector } from "./collect";

export { startXbetCollector };
export * from "./collect";

export const xbetAdapter: PlatformAdapter = {
  id: "XBet",
  collector: startXbetCollector,
};
