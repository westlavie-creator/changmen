import type { PlatformAdapter } from "@/platforms/contract";
import { startXbetCollector } from "./collect";

export const xbetAdapter: PlatformAdapter = {
  id: "XBet",
  collector: startXbetCollector,
};
