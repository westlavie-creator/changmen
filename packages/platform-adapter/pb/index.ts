import type { PlatformAdapter } from "@platform/contract";
import { pbProvider } from "./frontend/bet";
import { startPbCollector } from "./frontend/collect";

export { pbProvider, startPbCollector };
export * from "./frontend/auth";
export * from "./frontend/bet";
export * from "./frontend/collect";

export const pbAdapter: PlatformAdapter = {
  id: "PB",
  collector: startPbCollector,
  provider: pbProvider,
};
