import type { PlatformAdapter } from "@changmen/venue-adapter/contract";
import { predictFunProvider } from "./bet";
import { startPredictFunCollector } from "./collect";

export { startPredictFunCollector };
export * from "./api";
export * from "./auth";
export * from "./bet";
export * from "./collect";
export * from "./credentials";
export * from "./masterAccount";
export * from "./marketIndex";
export * from "./pfDetection";
export * from "./transport";
export * from "./wsConfig";

export const predictFunAdapter: PlatformAdapter = {
  id: "PredictFun",
  collector: startPredictFunCollector,
  provider: predictFunProvider,
};
