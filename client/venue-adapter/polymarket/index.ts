import type { PlatformAdapter } from "@venue/contract";
import { polymarketProvider } from "./bet";
import { startPolymarketCollector } from "./collect";

export { startPolymarketCollector };
export * from "./api";
export * from "./bet";
export * from "./orderStatus";
export * from "./orderSettlement";
export * from "./settlementJob";
export * from "./orderTypes";
export * from "./collect";
export * from "./parse";
export * from "./pmSportGuard";
export * from "./pmSportGamma";
export * from "./pmMarketGuard";
export * from "./pmBetGuard";
export * from "./pmDetection";
export * from "./pmStake";
export * from "./pmStoredOrders";
export * from "./ws";
export * from "./userWs";

export const polymarketAdapter: PlatformAdapter = {
  id: "Polymarket",
  collector: startPolymarketCollector,
  provider: polymarketProvider,
};
