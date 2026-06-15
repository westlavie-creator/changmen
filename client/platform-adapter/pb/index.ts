import type { PlatformAdapter } from "@platform/contract";
import { pbProvider } from "./bet";
import { startPbCollector } from "./collect";

export { pbProvider, startPbCollector };
export * from "./auth";
export * from "./bet";
export * from "./collect";

export const pbAdapter: PlatformAdapter = {
  id: "PB",
  collector: startPbCollector,
  provider: pbProvider,
};
