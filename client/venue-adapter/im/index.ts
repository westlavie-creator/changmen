import type { PlatformAdapter } from "../contract";
import { imProvider } from "./bet";
import { startImCollector } from "./collect";

export { imProvider, startImCollector };
export * from "./bet";
export * from "./collect";
export * from "./parse";

export const imAdapter: PlatformAdapter = {
  id: "IM",
  collector: startImCollector,
  provider: imProvider,
};
