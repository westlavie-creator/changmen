import type { PlatformPlugin } from "@/platforms/types";
import { startIaCollector } from "./collect";
import { iaProvider } from "./bet";

export const iaPlugin: PlatformPlugin = {
  id: "IA",
  collector: startIaCollector,
  provider: iaProvider,
};
