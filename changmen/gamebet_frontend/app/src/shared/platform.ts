export { PLATFORMS } from "@/platforms/registry";

/** OB MQTT 下游凭据（与 gamebet_backend/proxy/ob_mqtt_relay.js 一致） */
export const OB_MQTT_USER = "admin";
export const OB_MQTT_PASS = "Qazqaz123...";

export function relayWsUrl(path: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${path}`;
}
