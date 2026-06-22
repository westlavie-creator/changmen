import type { PlatformAdapter } from "@platform/contract";
import { dexProvider } from "./bet";
import { startDexCollector } from "./collect";

export { dexProvider, startDexCollector };
export * from "./bet";
export * from "./collect";

export const dexAdapter: PlatformAdapter = {
  id: "Dex",
  collector: startDexCollector,
  provider: dexProvider,
};
