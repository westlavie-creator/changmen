import type { PlatformAdapter } from "@changmen/venue-adapter/contract";
import { startLimitlessCollector } from "./collect";

export { startLimitlessCollector };
export * from "./api";
export * from "./collect";
export * from "./parse";
export * from "./transport";
export * from "./ws";

export const limitlessAdapter: PlatformAdapter = {
  id: "Limitless",
  collector: startLimitlessCollector,
};
