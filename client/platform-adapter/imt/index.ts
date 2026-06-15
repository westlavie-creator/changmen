import type { PlatformAdapter } from "@platform/contract";
import { imtProvider } from "./bet";
import { startImtCollector } from "./collect";

export { imtProvider, startImtCollector };
export * from "./bet";
export * from "./collect";

export const imtAdapter: PlatformAdapter = {
  id: "IMT",
  collector: startImtCollector,
  provider: imtProvider,
};
