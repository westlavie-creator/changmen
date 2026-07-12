import {
  POLYMARKET_CLOB_API,
  POLYMARKET_MARKET_WS,
} from "./api";

export const PM_OFFICIAL_PROBE_TIMEOUT_MS = 5_000;

export type PolymarketOfficialProbeResult = {
  reachable: boolean;
  httpOk: boolean;
  marketWsOk: boolean;
};

export async function probePolymarketOfficialHttp(
  timeoutMs = PM_OFFICIAL_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  if (typeof fetch !== "function")
    return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${POLYMARKET_CLOB_API}/time`, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    return res.ok;
  }
  catch {
    return false;
  }
  finally {
    clearTimeout(timer);
  }
}

export function probePolymarketOfficialMarketWs(
  timeoutMs = PM_OFFICIAL_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  if (typeof WebSocket !== "function")
    return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    let ws: WebSocket | null = null;

    const finish = (ok: boolean) => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      try {
        ws?.close();
      }
      catch {
        /* ignore */
      }
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      ws = new WebSocket(POLYMARKET_MARKET_WS);
    }
    catch {
      finish(false);
      return;
    }

    ws.onopen = () => finish(true);
    ws.onerror = () => finish(false);
    ws.onclose = () => finish(false);
  });
}

/** 官方 Market WS 可达；httpOk 仅作诊断（页面内 fetch 仍受 CORS 约束，不用于切换 HTTP direct） */
export async function probePolymarketOfficialReachable(
  timeoutMs = PM_OFFICIAL_PROBE_TIMEOUT_MS,
): Promise<PolymarketOfficialProbeResult> {
  const [httpOk, marketWsOk] = await Promise.all([
    probePolymarketOfficialHttp(timeoutMs),
    probePolymarketOfficialMarketWs(timeoutMs),
  ]);
  return {
    reachable: marketWsOk,
    httpOk,
    marketWsOk,
  };
}
