import { getCollectPlatform } from "@/api/esport";
import { OB_DEMO_LOGIN_URL } from "@/api/v4";
import { directGet } from "@/shared/http";
import { PLATFORMS } from "@/shared/platform";

export type ObMqttConnectConfig = {
  url: string;
  token: string;
};

function decodeBase64Json(value: string): Record<string, unknown> {
  const decoded = decodeURIComponent(String(value));
  return JSON.parse(atob(decoded)) as Record<string, unknown>;
}

/** 对齐 `@changmen/platform-node/ob/core.js` parseObEntryUrl */
function parseObEntryUrl(rawUrl: string): { token: string; mqttEndpoints: string[] } {
  const url = new URL(rawUrl);
  const addrRaw = url.searchParams.get("addr") || "";
  const addr = addrRaw ? decodeBase64Json(addrRaw) : {};
  const mqtt = Array.isArray((addr as { mqtt?: unknown }).mqtt)
    ? ((addr as { mqtt: unknown[] }).mqtt.map(String).filter(Boolean))
    : [];
  return {
    token: url.searchParams.get("token") || "",
    mqttEndpoints: mqtt,
  };
}

/**
 * 浏览器直连 OB 源站 MQTT（username = platform token，与 ObRelayCore upstream 一致）。
 * mqtt wss 来自试玩 login 的 pc.addr.mqtt；token 优先 Client_GetCollectPlatform。
 */
export async function resolveObMqttConnectConfig(): Promise<ObMqttConnectConfig | null> {
  const platform = await getCollectPlatform(PLATFORMS.OB);
  let token = String(platform?.Token || "").trim();

  let mqttEndpoints: string[] = [];
  try {
    const body = await directGet<{ status?: string; data?: { pc?: string; token?: string } }>(
      OB_DEMO_LOGIN_URL,
      {},
    );
    if (body?.data?.pc) {
      const entry = parseObEntryUrl(body.data.pc);
      mqttEndpoints = entry.mqttEndpoints;
      if (!token && entry.token) token = entry.token;
    }
    if (!token && body?.data?.token) token = String(body.data.token);
  } catch (err) {
    console.warn("[OB MQTT] resolve mqtt endpoints failed", err);
  }

  const url = mqttEndpoints[0];
  if (!url || !token) return null;
  return { url, token };
}
