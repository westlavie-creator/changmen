import type { PlatformPlugin } from "@/platforms/types";
import { startImtCollector } from "./collect";
import { imtProvider } from "./bet";

export const imtPlugin: PlatformPlugin = {
  id: "IMT",
  collector: startImtCollector,
  provider: imtProvider,
};
