import type { PlatformAdapter } from "@/platforms/contract";
import { startTfCollector } from "./collect";
import { tfProvider } from "./bet";

export const tfAdapter: PlatformAdapter = {
  id: "TF",
  collector: startTfCollector,
  provider: tfProvider,
};
