import type { PlatformAdapter } from "../contract";
import { polymarketProvider } from "./bet";
import { startPolymarketCollector } from "./collect";

export { startPolymarketCollector };
export * from "./api";
export * from "./bet";
export * from "./orderStatus";
export * from "./orderSettlement";
export * from "./orders";
export * from "./settlementJob";
export * from "./legOutcome";
export * from "./orderTypes";
export * from "./collect";
export * from "./parse";
export * from "./pmSportGuard";
export * from "./pmSportGamma";
export * from "./pmMarketGuard";
export * from "./pmBetGuard";
export * from "./pmDetection";
export * from "./pmStake";
export * from "./pmTickPrice";
export * from "./pmAutoExitSell";
export * from "./pmHeartbeat";
export * from "./pmStoredOrders";
export * from "./pmAutoTransport";
export * from "./pmOfficialReachability";
export * from "./ws";
export * from "./pmMarketWsMode";
export * from "./pmUserWsMode";
export * from "./pmLogicalPosition";
export * from "./pmTransportMode";
export * from "./credentials";
export * from "./depositWallet";
export * from "./relayer";
export * from "./userWs";
export * from "./sportQuoteHub";

export const polymarketAdapter: PlatformAdapter = {
  id: "Polymarket",
  collector: startPolymarketCollector,
  provider: polymarketProvider,
};
