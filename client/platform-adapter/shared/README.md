# shared（跨平台）

**位置**：`client/platform-adapter/shared/`（canonical）

| 模块 | 用途 |
|------|------|
| `collectNotify.ts` | 采集错误 → messageStore / Telegram |
| `collectSession.ts` | PB/IMT 等 gateway+token 会话 |
| `socket/hub.ts` | A8 Socket.IO 公共频道 |
| `socket/collector.ts` | IM / XBet / Stake 的 A8 聚合采集 |
| `socket/accumulator.ts` | A8 bets 消息 → fo + saveMatch/saveBets |
| `directRealtimeStatus.ts` | 直连 WS/MQTT 状态 |

引用：`import { … } from "@platform/shared/collectNotify"`

## 与 `{platform}/shared/` 的区别

| 目录 | 范围 | 示例 |
|------|------|------|
| **`client/platform-adapter/shared/`** | 跨平台 | A8 socket、采集通知 |
| **`{platform}/shared/`** | 单平台，浏览器 + Node 探针共用 | `ob/shared/save_bets.ts` |

仅当 HTTP 解析 / SaveBet / MQTT 与 HTTP 逻辑需要被 `collect.ts` 与 `platform-probes` 共用时，才放在 `{platform}/shared/`。
