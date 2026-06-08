# shared

跨平台采集基础设施（canonical 源码）：

| 模块 | 用途 |
|------|------|
| `collectNotify.ts` | 采集错误 → messageStore / Telegram |
| `collectSession.ts` | PB/IMT 等 gateway+token 会话解析 |
| `socket/hub.ts` | A8 Socket.IO 聚合连接 |
| `socket/collector.ts` | IM / XBet / Stake 等 A8 频道采集循环 |
| `socket/accumulator.ts` | A8 bets 消息 → fo + saveMatch/saveBets 载荷 |

前端引用：`import { … } from "@platform/shared/collectNotify"` 等。

`gamebet_frontend/app/src/platforms/shared/` 保留 **shim**（re-export），阶段 D 删除。
