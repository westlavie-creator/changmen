/**
 * [Polymarket 可证实] CLOB heartbeat：约 10s 无有效心跳会取消该用户全部 open 订单。
 * 自动 GTC 止盈卖单必须维持心跳，否则挂单会很快被清掉。
 * @see https://docs.polymarket.com/trading/orders/overview
 * SDK path: POST /v1/heartbeats  body `{ heartbeat_id }`
 */
import type { PlatformAccount } from "@changmen/client-core/models/platformAccount";
import { POLYMARKET_CLOB_API } from "./api";
import {
  buildL2Headers,
  parseTokenConfig,
  resolveApiCreds,
} from "./l2Auth";
import { polymarketPluginPost } from "./transport";

const HEARTBEAT_PATH = "/v1/heartbeats";
/** 官方建议约 5s 一次（超时约 10s + 5s buffer） */
export const POLYMARKET_HEARTBEAT_INTERVAL_MS = 5_000;

interface HeartbeatSession {
  account: PlatformAccount;
  heartbeatId: string;
  timer: ReturnType<typeof setInterval> | null;
  inFlight: boolean;
  startedAt: number;
}

const sessions = new Map<number, HeartbeatSession>();

function accountKey(account: PlatformAccount): number | null {
  const id = account.accountId;
  return id == null ? null : Number(id);
}

function extractHeartbeatId(raw: unknown): string {
  if (!raw || typeof raw !== "object")
    return "";
  const row = raw as Record<string, unknown>;
  const id = row.heartbeat_id ?? row.heartbeatId;
  return id == null ? "" : String(id);
}

function extractErrorHeartbeatId(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  // 400 时常在 JSON 里带回正确 heartbeat_id
  try {
    const jsonStart = msg.indexOf("{");
    if (jsonStart >= 0) {
      const parsed = JSON.parse(msg.slice(jsonStart)) as Record<string, unknown>;
      const id = extractHeartbeatId(parsed);
      if (id)
        return id;
    }
  }
  catch { /* ignore */ }
  const m = msg.match(/heartbeat_id["']?\s*[:=]\s*["']?([A-Za-z0-9_-]+)/i);
  return m?.[1] ?? "";
}

async function postHeartbeatOnce(
  account: PlatformAccount,
  heartbeatId: string,
): Promise<string> {
  const config = parseTokenConfig(account.token);
  const creds = resolveApiCreds(config);
  if (!creds.address || !creds.apiKey || !creds.secret || !creds.passphrase)
    throw new Error("Polymarket heartbeat 缺少 L2 凭证");

  const gateway = account.gateway || POLYMARKET_CLOB_API;
  const bodyObj = { heartbeat_id: heartbeatId };
  const bodyStr = JSON.stringify(bodyObj);
  const headers = await buildL2Headers(
    creds.address,
    creds.apiKey,
    creds.secret,
    creds.passphrase,
    "POST",
    HEARTBEAT_PATH,
    bodyStr,
  );

  try {
    const res = await polymarketPluginPost<Record<string, unknown>>(
      `${gateway}${HEARTBEAT_PATH}`,
      bodyObj,
      { headers },
    );
    return extractHeartbeatId(res) || heartbeatId;
  }
  catch (err) {
    const recovered = extractErrorHeartbeatId(err);
    if (recovered) {
      const retryBody = { heartbeat_id: recovered };
      const retryStr = JSON.stringify(retryBody);
      const retryHeaders = await buildL2Headers(
        creds.address,
        creds.apiKey,
        creds.secret,
        creds.passphrase,
        "POST",
        HEARTBEAT_PATH,
        retryStr,
      );
      const res = await polymarketPluginPost<Record<string, unknown>>(
        `${gateway}${HEARTBEAT_PATH}`,
        retryBody,
        { headers: retryHeaders },
      );
      return extractHeartbeatId(res) || recovered;
    }
    throw err;
  }
}

async function tickSession(key: number): Promise<void> {
  const session = sessions.get(key);
  if (!session || session.inFlight)
    return;
  session.inFlight = true;
  try {
    session.heartbeatId = await postHeartbeatOnce(session.account, session.heartbeatId);
  }
  catch (err) {
    console.warn(
      `[Polymarket] heartbeat failed account=${key}:`,
      err instanceof Error ? err.message : err,
    );
  }
  finally {
    session.inFlight = false;
  }
}

/** 为账号启动心跳（幂等）。挂 GTC 卖单前应调用。 */
export function ensurePolymarketHeartbeat(account: PlatformAccount): void {
  const key = accountKey(account);
  if (key == null)
    return;

  const existing = sessions.get(key);
  if (existing) {
    existing.account = account;
    return;
  }

  const session: HeartbeatSession = {
    account,
    heartbeatId: "",
    timer: null,
    inFlight: false,
    startedAt: Date.now(),
  };
  sessions.set(key, session);

  // 立刻打一枪，再进入周期
  void tickSession(key);
  session.timer = setInterval(() => {
    void tickSession(key);
  }, POLYMARKET_HEARTBEAT_INTERVAL_MS);
}

export function stopPolymarketHeartbeat(accountId: number): void {
  const session = sessions.get(accountId);
  if (!session)
    return;
  if (session.timer != null)
    clearInterval(session.timer);
  sessions.delete(accountId);
}

export function stopAllPolymarketHeartbeats(): void {
  for (const id of [...sessions.keys()])
    stopPolymarketHeartbeat(id);
}

/** 测试用 */
export function getPolymarketHeartbeatAccountIdsForTests(): number[] {
  return [...sessions.keys()];
}
