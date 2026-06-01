import type { PlatformAdapter } from "@/platforms/contract";
import { startIaCollector } from "./collect";
import { iaProvider } from "./bet";

export const iaAdapter: PlatformAdapter = {
  id: "IA",
  collector: startIaCollector,
  provider: iaProvider,
};
