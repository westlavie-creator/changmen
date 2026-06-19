import { listPlatformForwards } from "../platforms/registry.js";
import { attachSocketIoForwards, closeSocketIoForwards } from "./socketio_forward.js";
import { attachRawWsForwards, closeRawWsForwards } from "./raw_ws_forward.js";

/**
 * @param {import("node:http").Server} httpServer
 */
export function attachForwardEngine(httpServer) {
  const all = listPlatformForwards();
  attachSocketIoForwards(
    httpServer,
    all.filter((d) => d.transport === "socket.io"),
  );
  attachRawWsForwards(
    httpServer,
    all.filter((d) => d.transport === "raw-ws"),
  );
}

export function closeForwardEngine() {
  closeSocketIoForwards();
  closeRawWsForwards();
}
