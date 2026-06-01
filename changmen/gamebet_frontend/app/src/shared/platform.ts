export { PLATFORMS } from "@/platforms/registry";

/** OB MQTT 下游凭据（与 gamebet_backend/proxy/ob_mqtt_relay.js 一致） */
export const OB_MQTT_USER = "admin";
export const OB_MQTT_PASS = "Qazqaz123...";

/** Dev 直连 backend 3456（绕过 Vite ws 代理）；host 与页面一致（localhost 对 localhost） */
export function relayWsUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (import.meta.env.DEV) {
    let port = "3456";
    try {
      const base = String(import.meta.env.VITE_API_PROXY || "http://127.0.0.1:3456");
      port = new URL(base).port || "3456";
    } catch {
      /* keep 3456 */
    }
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const host = location.hostname || "127.0.0.1";
    return `${proto}//${host}:${port}${p}`;
  }
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}${p}`;
}
