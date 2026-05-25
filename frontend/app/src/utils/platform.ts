import type { PlatformId } from "@/types/esport";

export const PLATFORMS = {
  OB: "OB",
  RAY: "RAY",
  TF: "TF",
  IA: "IA",
  IM: "IM",
  SABA: "SABA",
  XBet: "XBet",
  PB: "PB",
  IMT: "IMT",
  HG: "HG",
  Stake: "Stake",
} as const satisfies Record<string, PlatformId>;

/** OB MQTT 下游凭据（与 backend/proxy/ob_mqtt_relay.js 一致） */
export const OB_MQTT_USER = "admin";
export const OB_MQTT_PASS = "Qazqaz123...";

export function relayWsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}
