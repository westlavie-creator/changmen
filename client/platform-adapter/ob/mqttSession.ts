import { getCollectPlatform } from "@/api/esport";
import { OB_DEMO_LOGIN_URL } from "@/api/v4";
import { directGet } from "@/shared/http";
import { PLATFORMS } from "@/shared/platform";
import { changmenHttpBaseToWs, resolveChangmenWsBase } from "@platform/shared/changmenWsBase";
import {
  OB_A8_MQTT_PASSWORD,
  OB_A8_MQTT_URL,
  OB_A8_MQTT_USERNAME,
  OB_WS_FORWARD_PATH,
} from "./mqttConfig";

export type ObMqttEndpointSource = "demo" | "changmen" | "a8";

export type ObMqttConnectConfig = {
  url: string;
  username: string;
  password?: string;
  source: ObMqttEndpointSource;
};

function decodeBase64Json(value: string): Record<string, unknown> {
  const decoded = decodeURIComponent(String(value));
  return JSON.parse(atob(decoded)) as Record<string, unknown>;
}

/** 对齐 `@changmen/platform-probes/ob/core.js` parseObEntryUrl */
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

/** A8 `yIe` [A8 可证实]：固定 admin / Qazqaz123...，与 platform token 无关 */
export function getObA8MqttConfig(): ObMqttConnectConfig {
  return {
    url: OB_A8_MQTT_URL,
    username: OB_A8_MQTT_USERNAME,
    password: OB_A8_MQTT_PASSWORD,
    source: "a8",
  };
}

/**
 * CHANGMEN：服务端透明中继到官方 demo MQTT（`?u=` 传官方 wss 地址）。
 * 浏览器 mqtt 选项与 demo 相同，仅 url 不同。
 */
export function getObChangmenMqttConfig(
  officialDemoUrl: string,
  username: string,
): ObMqttConnectConfig {
  const base = changmenHttpBaseToWs(resolveChangmenWsBase());
  const forwardUrl = `${base}${OB_WS_FORWARD_PATH}?u=${encodeURIComponent(officialDemoUrl)}`;
  return { url: forwardUrl, username, source: "changmen" };
}

/**
 * 试玩 login 返回的 OB 源站 MQTT（username = platform token）。
 * 每次调用都会重新请求 login，用于 A8 中继失败后的地址刷新。
 */
export async function fetchObDemoMqttConfig(): Promise<ObMqttConnectConfig | null> {
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
    console.warn("[OB MQTT] fetch demo mqtt endpoints failed", err);
    return null;
  }

  const url = mqttEndpoints[0];
  if (!url || !token) return null;
  return { url, username: token, source: "demo" };
}

/** @deprecated 使用 fetchObDemoMqttConfig */
export async function resolveObMqttConnectConfig(): Promise<ObMqttConnectConfig | null> {
  return fetchObDemoMqttConfig();
}
