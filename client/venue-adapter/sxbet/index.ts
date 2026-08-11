import type { PlatformAdapter } from "../contract";
import { sxbetProvider } from "./bet";
import { startSxBetCollector } from "./collect";

export { startSxBetCollector };
export * from "./api";
export * from "./bet";
export * from "./collect";
export * from "./credentials";
export * from "./legOutcome";
export * from "./marketIndex";
export * from "./orders";
export * from "./parse";
export * from "./ws";
export * from "./wsConfig";

export const sxbetAdapter: PlatformAdapter = {
  id: "SXBet",
  collector: startSxBetCollector,
  provider: sxbetProvider,
};
