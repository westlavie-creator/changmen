import type { PlatformAdapter } from "../contract";
import { startSxBetCollector } from "./collect";

export { startSxBetCollector };
export * from "./api";
export * from "./collect";
export * from "./parse";

export const sxbetAdapter: PlatformAdapter = {
  id: "SXBet",
  collector: startSxBetCollector,
};
