import type { PlatformAdapter } from "@venue/contract";
import { startPredictFunCollector } from "./collect";

export { startPredictFunCollector };
export * from "./api";
export * from "./collect";
export * from "./parse";
export * from "./ws";

export const predictFunAdapter: PlatformAdapter = {
  id: "PredictFun",
  collector: startPredictFunCollector,
};
