import type { PlatformAdapter } from "../contract";
import { tfProvider } from "./bet";
import { startTfCollector } from "./collect";

export { tfProvider, startTfCollector };
export * from "./auth";
export * from "./bet";
export * from "./collect";

export const tfAdapter: PlatformAdapter = {
  id: "TF",
  collector: startTfCollector,
  provider: tfProvider,
};
