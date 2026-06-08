# OB

平台脚本已迁入 `platform_adapter/ob/`。

| 目录 | 内容 |
|------|------|
| `frontend/` | 浏览器采集 + 下注（TypeScript） |
| `backend/` | Node Feed、session、relay、运维脚本 |
| `backend/docs/` | 盘口/状态映射文档 |
| `backend/data/` | game_ids、odd_type_ids 等静态数据 |

Legacy 路径 `gamebet_backend/platforms/ob/ob_*.js` 与 `relays/ob_relay_core.js` 保留 thin re-export，便于过渡。
