import type { PlatformPlugin } from "@/platforms/types";
import { startTfCollector } from "./collect";
import { tfProvider } from "./bet";

export const tfPlugin: PlatformPlugin = {
  id: "TF",
  collector: startTfCollector,
  provider: tfProvider,
};
