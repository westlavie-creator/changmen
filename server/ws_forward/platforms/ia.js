/** IA 官网 Socket.IO [pingtai_offical IA/index-07cde062.js 可证实] */
export const IA_OFFICIAL_WS = "wss://socket.ajj123.net";
export const IA_OFFICIAL_WS_PATH = "/socket.io";

/** A8 `wQe` 内联 gateway；CHANGMEN 上游仅连官方，用此 Origin */
export const IA_DEFAULT_GATEWAY = "https://ilustre-analytics.org";

/** @type {import('../core/types.js').PlatformForwardDefinition} */
export const iaForwardDefinition = {
  id: "IA",
  browserPath: "/esport/ws-forward/IA",
  buildUpstream(gateway = IA_DEFAULT_GATEWAY) {
    const origin = String(gateway || IA_DEFAULT_GATEWAY).replace(/\/+$/, "");
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
