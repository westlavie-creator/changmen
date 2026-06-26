import type { PlatformAdapter } from "@venue/contract";
import { hgProvider } from "./bet";
import { startHgCollector } from "./collect";

export { hgProvider, startHgCollector };
export * from "./bet";
export * from "./collect";
export * from "./follow";

export const hgAdapter: PlatformAdapter = {
  id: "HG",
  collector: startHgCollector,
  provider: hgProvider,
};
