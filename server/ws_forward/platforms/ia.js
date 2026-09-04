/** IA 官网 Socket.IO [pingtai_offical IA/index-07cde062.js 可证实] */
export const IA_OFFICIAL_WS = "wss://socket.ajj123.net";
export const IA_OFFICIAL_WS_PATH = "/socket.io";

/** 官网页 host；apex `ilustre-analytics.org` 无 DNS，且官网 WS 拒 apex Origin */
export const IA_DEFAULT_GATEWAY = "https://pc.ilustre-analytics.org";

const IA_LEGACY_APEX = "https://ilustre-analytics.org";

export function normalizeIaGateway(gateway) {
  const origin = String(gateway || IA_DEFAULT_GATEWAY).replace(/\/+$/, "");
  if (!origin || origin === IA_LEGACY_APEX) return IA_DEFAULT_GATEWAY;
  return origin;
}

/** @type {import('../core/types.js').SocketIoForwardDefinition} */
export const iaForwardDefinition = {
  id: "IA",
  transport: "socket.io",
  browserPath: "/esport/ws-forward/IA",
  buildUpstream(gateway = IA_DEFAULT_GATEWAY) {
    const origin = normalizeIaGateway(gateway);
    return {
      url: IA_OFFICIAL_WS,
      options: {
        path: IA_OFFICIAL_WS_PATH,
        transports: ["websocket"],
        reconnection: false,
        extraHeaders: { Origin: origin },
        auth: { token: "123" },
      },
    };
  },
};
