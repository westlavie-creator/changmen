import { IA_A8_COLLECT } from "./a8Collect";

/** A8 `bQe` / `_Qe` [A8 可证实]：IA Socket.IO 聚合入口 */
export const IA_A8_WS = "wss://47.115.75.57";

export const IA_WS_PATH = "/esport/ws/IA";

/** A8 `wQe` 内联 `t.gateway` */
export const IA_DEFAULT_GATEWAY = IA_A8_COLLECT.gateway;

export const IA_ROOM_JOIN = { room_type: "room_type_index_content_push" } as const;
