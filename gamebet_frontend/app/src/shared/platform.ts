export { PLATFORMS } from "@platform/registry";

/** 旧 OB relay 下游凭据（仅 backend ob_mqtt_relay / 冒烟脚本）；浏览器直连 OB 源站 MQTT 用 platform token */
export const OB_MQTT_USER = "admin";
export const OB_MQTT_PASS = "Qazqaz123...";

/** Dev 时 relayWsUrl 仅供遗留调试；OB/RAY/TF/IA 实时均为浏览器直连 */
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
