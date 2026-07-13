import { Server } from "socket.io";
import { REALTIME_SOCKET_PATH } from "./channels.js";
import { attachPubSubHandlers, emitPubSubMessage } from "./pubsub.js";
import { broadcastPmSportUpdate } from "./pm_sport_broadcast.js";

/** @type {import("socket.io").Server | null} */
let io = null;

/** @type {((channel: string, message: unknown) => void) | null} */
let emitChannel = null;

function requireToken(socket) {
  const token
    = (typeof socket.handshake.auth?.token === "string" && socket.handshake.auth.token)
      || (typeof socket.handshake.headers?.token === "string" && socket.handshake.headers.token)
      || "";
  return token.trim().length > 0;
}

/**
 * @param {import("node:http").Server} httpServer
 */
export function attachChangmenRealtimeHub(httpServer) {
  if (io)
    return io;

  io = new Server(httpServer, {
    path: REALTIME_SOCKET_PATH,
    transports: ["websocket"],
    cors: { origin: true, credentials: true },
    serveClient: false,
  });

  emitChannel = (channel, message) => {
    if (!io)
      return;
    emitPubSubMessage(io, channel, message);
  };

  io.on("connection", (socket) => {
    if (!requireToken(socket)) {
      socket.disconnect(true);
      return;
    }

    attachPubSubHandlers(socket);

    socket.on("join room", (room) => {
      const name = String(room || "").trim();
      if (name)
        socket.join(name);
    });
  });

  return io;
}

export function getChangmenRealtimeHub() {
  return io;
}

/**
 * @param {number} clientMatchId
 * @param {object} pmSport
 */
export async function pushPmSportToBrowsers(clientMatchId, pmSport) {
  if (!emitChannel)
    return false;
  return broadcastPmSportUpdate(emitChannel, clientMatchId, pmSport);
}

export function closeChangmenRealtimeHub() {
  io?.close();
  io = null;
  emitChannel = null;
}
