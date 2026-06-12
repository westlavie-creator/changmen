/** 对齐 console `mr.test`：Axios 经本地 PROXY 中继访问 `/IP` */
import { a8Axios } from "@/shared/a8Axios";

const RELAY_PATH = "/esport/http-relay";
const DEFAULT_PROXY_BASE = "http://127.0.0.1:3456";

function proxyRelayEntry(): string {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem("PROXY")?.trim() : "";
  const base = (raw || DEFAULT_PROXY_BASE).replace(/\/$/, "");
  if (base.endsWith(RELAY_PATH)) return base;
  return `${base}${RELAY_PATH}`;
}

export type ProxyTestResult = {
  delay: number;
  ip?: string;
  address?: string;
};

export async function testProxyUrl(proxyUrl: string): Promise<ProxyTestResult | undefined> {
  const started = Date.now();
  try {
    const res = await a8Axios.get<{ info?: { IP?: string; Address?: string } }>(
      proxyRelayEntry(),
      {
        headers: {
          "x-proxy": proxyUrl,
          "x-proxy-url": "/IP",
        },
      },
    );
    if (res.status !== 200 || !res.data?.info) return undefined;
    return {
      delay: Date.now() - started,
      ip: res.data.info.IP,
      address: res.data.info.Address,
    };
  } catch {
    return undefined;
  }
}
