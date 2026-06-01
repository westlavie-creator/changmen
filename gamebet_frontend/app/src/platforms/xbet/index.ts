import type { PlatformPlugin } from "@/platforms/types";
import { startXbetCollector } from "./collect";

export const xbetPlugin: PlatformPlugin = {
  id: "XBet",
  collector: startXbetCollector,
};
