import type { PlatformAdapter } from "@venue/contract";
import { polymarketProvider } from "./bet";
import { startPolymarketCollector } from "./collect";

export { startPolymarketCollector };
export * from "./api";
export * from "./bet";
export * from "./orderStatus";
export * from "./collect";
export * from "./parse";
export * from "./pmSportGuard";
export * from "./pmSportGamma";
export * from "./pmMarketGuard";
export * from "./pmBetGuard";
export * from "./ws";
export * from "./userWs";
export * from "./sell";

export const polymarketAdapter: PlatformAdapter = {
  id: "Polymarket",
  collector: startPolymarketCollector,
  provider: polymarketProvider,
};
