import { io, type Socket } from "socket.io-client";

/** 对齐 gamebet_backend/shared/a8_socket.js / A8 yZe */
export const DEFAULT_A8_WS = "https://47.115.75.57";

type ChannelHandler = (message: unknown) => void;

let socket: Socket | null = null;
let refCount = 0;
let connecting: Promise<boolean> | null = null;
const handlers = new Map<string, Set<ChannelHandler>>();
const joinedRooms = new Set<string>();

function socketToken(): string {
  return localStorage.getItem("token") ?? "";
}

function ensureRooms() {
  if (!socket?.connected) return;
  for (const room of joinedRooms) {
    socket.emit("join room", room);
  }
}

function dispatchChannel(channel: string, message: unknown) {
  const set = handlers.get(channel);
  if (!set) return;
  for (const fn of set) fn(message);
}

async function connectSocket(): Promise<boolean> {
  if (socket?.connected) return true;
  if (connecting) return connecting;

  connecting = new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      connecting = null;
      resolve(ok);
    };

    socket?.removeAllListeners();
    socket?.disconnect();

    socket = io(DEFAULT_A8_WS, {
      transports: ["websocket"],
      withCredentials: true,
      extraHeaders: {
        Origin: `https://${location.hostname}`,
        token: socketToken(),
      },
    });

    socket.on("connect", () => {
      ensureRooms();
      finish(true);
    });

    socket.on("chat message", (raw: string) => {
      try {
        const packet = JSON.parse(raw) as { channel?: string; message?: unknown };
        if (packet.channel) dispatchChannel(packet.channel, packet.message ?? packet);
      } catch {
        /* ignore malformed */
      }
    });

    socket.on("connect_error", () => finish(false));
    setTimeout(() => finish(Boolean(socket?.connected)), 10_000);
  });

  return connecting;
}

export async function subscribeA8Channel(
  channel: string,
  handler: ChannelHandler,
): Promise<() => void> {
  refCount += 1;
  joinedRooms.add(channel.split(":")[0]!);

  let set = handlers.get(channel);
  if (!set) {
    set = new Set();
    handlers.set(channel, set);
  }
  set.add(handler);

  await connectSocket();
  ensureRooms();

  return () => {
    set?.delete(handler);
    if (set && set.size === 0) handlers.delete(channel);
    refCount -= 1;
    if (refCount <= 0) {
      socket?.removeAllListeners();
      socket?.disconnect();
      socket = null;
      joinedRooms.clear();
    }
  };
}
