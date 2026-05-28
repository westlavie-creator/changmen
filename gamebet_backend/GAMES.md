# 聚合游戏类型（跨平台）

本项目**只聚合** [`shared/game_catalog.json`](./shared/game_catalog.json) 中登记的游戏。同一游戏在不同平台的 **native `game_id` 不同**，通过统一 **`code`** 对齐。

## 当前列表

| code | 中文名 | OB game_id | RAY game_id |
|------|--------|------------|-------------|
| `cs2` | CS2 | `257578064923863` | `140` |
| `kog` | 王者荣耀 | `257561197207055` | `74` |
| `valorant` | 无畏契约 | `271192272576750` | `37197927` |
| `lol` | 英雄联盟 | `257154660915053` | `70` |
| `dota2` | DOTA2 | `257289795134339` | `151` |

TF 等平台接入后，在 `game_catalog.json` 的 `platforms` 下补充对应 ID 即可。

## 行为

- **OB Feed**：拉 `game_id=0` 全量 index 后，按 catalog 中 OB ID **过滤**比赛。
- **RAY Feed**：默认仅请求 catalog 中 RAY ID（可通过 `RAY_GAME_IDS` 覆盖）。
- **Snapshot**：每场比赛带统一 `gameCode` / `gameName`（来自 catalog，非各平台本地 catalog）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `AGGREGATE_GAME_CODES` | 逗号分隔子集，如 `cs2,lol`；不设或 `*` = catalog 全部 5 项 |
| `RAY_GAME_IDS` | 仍可直接指定 RAY native ID；**未设时**使用 catalog 中 RAY ID |

## API

```
GET /api/games
```

返回当前启用的聚合游戏及各地平台 ID。

## 扩展新游戏

1. 在各平台确认 native `game_id`（OB 见 `collect_game_ids.js`，RAY 见 `fetch_ray_match.js`）。
2. 编辑 `shared/game_catalog.json` 增加一项（`code`、`name`、`platforms`）。
3. 无需改 Feed 过滤逻辑。

## 代码

- 配置：[`shared/game_catalog.json`](./shared/game_catalog.json)
- 工具：[`shared/game_catalog.js`](./shared/game_catalog.js)
- 平台本地 ID 参考（不全量聚合）：`platforms/ob/ob_game_ids.json`、`platforms/ray/ray_game_ids.json`
