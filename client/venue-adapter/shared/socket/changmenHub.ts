import { reportVenueWsStatus } from "@changmen/venue-adapter/shared/venueWsStatus";
import { io, type Socket } from "socket.io-client";

/** 与 server/realtime-hub/channels.js PM_SPORT_CHANNEL 一致 */
export const PM_SPORT_CHANNEL = "Polymarket:PmSport";

type ChannelHandler = (message: unknown) => void;

let socket: Socket | null = null;
let refCount = 0;
let connecting: Promise<boolean> | null = null;
const handlers = new Map<string, Set<ChannelHandler>>();

function hubOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin)
    return window.location.origin;
  return "http://127.0.0.1:3560";
}

function socketToken(): string {
  if (typeof localStorage === "undefined")
    return "";
  return localStorage.getItem("app:token") ?? localStorage.getItem("token") ?? "";
}

function dispatchChannel(channel: string, message: unknown) {
  const set = handlers.get(channel);
  if (!set)
    return;
  for (const fn of set)
    fn(message);
}

async function connectSocket(): Promise<boolean> {
  if (socket?.connected) {
    reportVenueWsStatus("cm-hub", "connected");
    return true;
  }
  if (connecting)
    return connecting;

  const token = socketToken();
  if (!token) {
    reportVenueWsStatus("cm-hub", "disconnected");
    return false;
  }

  reportVenueWsStatus("cm-hub", "connecting");
  connecting = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled)
        return;
      settled = true;
      connecting = null;
      resolve(ok);
    };

    socket?.removeAllListeners();
    socket?.disconnect();

    socket = io(hubOrigin(), {
      path: "/esport/realtime/socket.io",
      transports: ["websocket"],
      withCredentials: true,
      auth: { token },
      extraHeaders: {
        Origin: typeof window !== "undefined" ? window.location.origin : "",
        token,
      },
    });

    socket.on("connect", () => {
      reportVenueWsStatus("cm-hub", "connected");
      finish(true);
    });

    socket.on("chat message", (raw: unknown) => {
      try {
        const packet = (typeof raw === "string" ? JSON.parse(raw) : raw) as {
          channel?: string;
          message?: unknown;
        };
        if (packet.channel)
          dispatchChannel(packet.channel, packet.message ?? packet);
      }
      catch {
        /* ignore malformed */
      }
    });

    socket.on("connect_error", () => {
      reportVenueWsStatus("cm-hub", "error");
      finish(false);
    });
    socket.on("disconnect", () => {
      if (refCount <= 0)
        reportVenueWsStatus("cm-hub", "disconnected");
    });
    setTimeout(() => {
      if (!socket?.connected)
        reportVenueWsStatus("cm-hub", "error");
      finish(Boolean(socket?.connected));
    }, 10_000);
  });

  return connecting;
}

/** 订阅 changmen 实时频道（对齐 A8 hub.subscribeA8Channel） */
export async function subscribeChangmenChannel(
  channel: string,
  handler: ChannelHandler,
): Promise<() => void> {
  refCount += 1;

  let set = handlers.get(channel);
  if (!set) {
    set = new Set();
    handlers.set(channel, set);
  }
  set.add(handler);

  await connectSocket();

  return () => {
    set?.delete(handler);
    if (set && set.size === 0)
      handlers.delete(channel);
    refCount -= 1;
    if (refCount <= 0) {
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;
      reportVenueWsStatus("cm-hub", "disconnected");
    }
  };
}
