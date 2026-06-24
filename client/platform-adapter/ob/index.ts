import type { PlatformAdapter } from "@platform/contract";
import { obProvider } from "./bet";
import { startObCollector } from "./collect";

export { obProvider, startObCollector };
export * from "./bet";
export * from "./collect";
export { getObMqttSourceMode, toggleObMqttSourceModeAndReconnect } from "./mqtt";
export type { ObMqttSourceMode } from "./mqtt";

export const obAdapter: PlatformAdapter = {
  id: "OB",
  collector: startObCollector,
  provider: obProvider,
};
