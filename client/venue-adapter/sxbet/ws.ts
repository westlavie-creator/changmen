import { Centrifuge, type Subscription } from "centrifuge";
import { getCollectPlatform } from "@changmen/client-core/bridge/clientApi";
import { reportVenueWsStatus } from "../shared/venueWsStatus";
import { PLATFORMS } from "../shared/platforms";
import {
  SXBET_WS,
  fetchSxRealtimeToken,
  type SxBestOddsWsUpdate,
} from "./api";
import { parseSxBetTokenConfig, resolveSxBetApiKey } from "./credentials";

const PLATFORM = PLATFORMS.SXBet;
const BEST_ODDS_CHANNEL = "best_odds:global";

export type SxBetWsStatus = "disconnected" | "connecting" | "connected" | "error";
type SxBetWsStatusListener = (status: SxBetWsStatus) => void;

let sxBetWsStatus: SxBetWsStatus = "disconnected";
const sxBetWsStatusListeners = new Set<SxBetWsStatusListener>();

function setSxBetWsStatus(status: SxBetWsStatus) {
  if (sxBetWsStatus === status)
    return;
  sxBetWsStatus = status;
  reportVenueWsStatus("sx-market", status);
  for (const fn of sxBetWsStatusListeners)
    fn(status);
}

export function getSxBetWsStatus(): SxBetWsStatus {
  return sxBetWsStatus;
}

export function onSxBetWsStatus(fn: SxBetWsStatusListener): () => void {
  sxBetWsStatusListeners.add(fn);
  return () => sxBetWsStatusListeners.delete(fn);
}

async function resolveCollectApiKey(): Promise<string> {
  try {
    const platform = await getCollectPlatform(PLATFORM);
    const fromToken = resolveSxBetApiKey(parseSxBetTokenConfig(platform?.Token));
    if (fromToken)
      return fromToken;
    // 兼容：Gateway 字段误填 apiKey
    const fromGateway = String(platform?.Gateway ?? "").trim();
    if (fromGateway && !fromGateway.startsWith("http"))
      return fromGateway;
  }
  catch {
    /* ignore */
  }
  return "";
}

export interface SxBetBestOddsWsHandle {
  /** 无 API key 时保持断开；有 key 时确保已连接 */
  ensureConnected(): Promise<boolean>;
  stop(): void;
}

/**
 * Centrifugo `best_odds:global` — 需账号 API key。
 * @see https://docs.sx.bet/developers/real-time
 */
export function startSxBetBestOddsWs(opts: {
  onUpdate: (update: SxBestOddsWsUpdate) => void;
}): SxBetBestOddsWsHandle {
  let stopped = false;
  let client: Centrifuge | null = null;
  let sub: Subscription | null = null;
  let connecting: Promise<boolean> | null = null;

  function detach() {
    try {
      sub?.unsubscribe();
    }
    catch { /* ignore */ }
    sub = null;
    try {
      client?.disconnect();
    }
    catch { /* ignore */ }
    client = null;
  }

  async function connect(): Promise<boolean> {
    if (stopped)
      return false;
    if (client)
      return sxBetWsStatus === "connected";

    const apiKey = await resolveCollectApiKey();
    if (!apiKey) {
      setSxBetWsStatus("disconnected");
      return false;
    }

    setSxBetWsStatus("connecting");
    const next = new Centrifuge(SXBET_WS, {
      getToken: () => fetchSxRealtimeToken(apiKey),
    });

    next.on("connected", () => {
      setSxBetWsStatus("connected");
    });
    next.on("disconnected", () => {
      if (!stopped)
        setSxBetWsStatus("error");
    });
    next.on("error", () => {
      if (!stopped)
        setSxBetWsStatus("error");
    });

    const subscription = next.newSubscription(BEST_ODDS_CHANNEL);
    subscription.on("publication", (ctx: { data?: unknown }) => {
      try {
        const raw = ctx?.data;
        const rows = Array.isArray(raw) ? raw : [raw];
        for (const row of rows) {
          if (row && typeof row === "object")
            opts.onUpdate(row as SxBestOddsWsUpdate);
        }
      }
      catch (err) {
        console.warn("[SXBet WS] publication handler error", err);
      }
    });
    subscription.subscribe();

    client = next;
    sub = subscription;
    next.connect();
    return true;
  }

  return {
    async ensureConnected() {
      if (stopped)
        return false;
      if (!connecting)
        connecting = connect().finally(() => { connecting = null; });
      return connecting;
    },
    stop() {
      stopped = true;
      detach();
      setSxBetWsStatus("disconnected");
    },
  };
}
