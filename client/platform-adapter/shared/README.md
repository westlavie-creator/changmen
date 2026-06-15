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
| **`client/platform-adapter/{platform}/shared/`** | 单平台，**仅浏览器** | `ob/shared/save_bets.ts`、`ray/shared/match_stage.ts` |
| **`devtools/platform-probes/{platform}/shared/`** | 单平台，**仅探针/CLI** | `ray/shared/save_bets.js`（CJS，与浏览器 `.ts` 逻辑对齐） |

浏览器与探针若需相同业务逻辑，各自维护一份（TS 为生产 canonical；探针 CJS 供 `core.js`/CLI）。不要从探针 `import @changmen/platform-adapter`。
