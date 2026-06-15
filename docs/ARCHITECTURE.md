# changmen 架构

单一架构文档入口。命令与日常开发见 [../CLAUDE.md](../CLAUDE.md)。

## 目标目录（monorepo，档 B）

```
changmen/
├── client/
│   ├── web/                     # Vue 控制台
│   ├── chrome-extension/        # MV3 扩展
│   └── platform-adapter/        # @changmen/platform-adapter
├── server/
│   ├── backend/                 # HTTP API、代理、静态托管
│   ├── matcher/                 # 调度循环 + 人工关联 UI
│   ├── db/                      # @changmen/db
│   ├── match-engine/            # @changmen/match-engine
│   ├── platform-node/           # @changmen/platform-node
│   └── team-resolver/           # @changmen/team-resolver
├── packages/
│   ├── shared/                  # @changmen/shared
│   └── api-contract/            # HTTP 契约
└── docs/
```

## 迁移进度

| 阶段 | 内容 | 状态 |
|------|------|------|
| 1–15 | 见历史（`packages/*` + `apps/*` 阶段） | ✅ 完成 |
| 16 | **档 B**：`client/` + `server/` 物理分区；`apps/` 退役 | ✅ 完成 |

旧路径 `platform_adapter/`、`gamebet_*` 仅出现在历史章节或迁移对照中；**以本表与代码 `package.json` / `adapter_paths` 为准**。

## 依赖方向

```
client/web ──@platform──► client/platform-adapter
client/web ──HTTP───────► server/backend
client/web ──@changmen/api-contract──► HTTP 路径与 DTO
server/backend ──@changmen/api-contract──► EsportAction
client/chrome-extension ─（代理/凭证）─► 各平台源站

client/platform-adapter ──采集上报──► server/backend (API_SaveMatch/SaveBet)
server/backend ──读写────► server/db (@changmen/db)
server/matcher ──rebuild──► @changmen/match-engine + @changmen/shared
server/matcher ──队名────► @changmen/team-resolver（workspace 依赖，可选）
server/team-resolver ──requirePlatform──► @changmen/platform-adapter/loader

server/backend ──requirePlatform──► client/platform-adapter（monorepo 默认）
server/backend ──可选拷贝──► server/backend/platform_adapter（瘦包 / GAMEBET_ADAPTER_ROOT）
```

## packages 说明

### `packages/shared` (`@changmen/shared`)

跨进程共享：游戏/玩法 catalog、赔率格式化、IM 解析、A8 时间窗规则。  
数据层与路径解析见 `@changmen/db`（`paths.js`、`load_env.js`）。  
npm workspace 成员；通过 `@changmen/shared` 包名引用。

### `client/platform-adapter` (`@changmen/platform-adapter`)

各平台采集与下注的 canonical 源码。前端通过 Vite 别名 `@platform` → `client/platform-adapter`。

**目录语义**：`{platform}/frontend/` 为浏览器采集；`@changmen/platform-node`（`server/platform-node/node/{platform}/`）为 Node 库 + CLI。详见 [platform-adapter/README.md](../client/platform-adapter/README.md) 与 [platform-node/README.md](../server/platform-node/README.md)。

各平台 CLI 采集脚本定义在本包 `package.json`；`server/backend` 通过 `npm run <script> --workspace=@changmen/platform-adapter` 转发。

**服务端解析顺序**（`loader/adapter_paths.mjs`）：

1. `GAMEBET_ADAPTER_ROOT`（瘦包显式指定）
2. `client/platform-adapter`（**标准 monorepo**，无需拷贝）
3. `server/backend/platform_adapter`（`npm run sync:platform-adapter` 生成，已 gitignore）

### `server/team-resolver` (`@changmen/team-resolver`)

队名规范化插件；matcher `rebuild` 与 UI `merge_mode` 动态加载 `team_db.js`。  
爬虫脚本在 `scrapers/`，环境变量通过 `@changmen/db/load_env` 加载。

### `server/match-engine` (`@changmen/match-engine`)

`match_merge`、`bet_builder`、`im_enrich`、队名工具、`client_match_ids` 与 vitest/node:test 套件。  
`server/matcher` 通过 `@changmen/match-engine` workspace 依赖引用；测试：`npm run test --prefix server/match-engine`。

## client / server 说明

| 路径 | 职责 |
|------|------|
| `server/backend` | `server.js`、`/esport/*` API、HTTP 代理、静态资源 |
| `server/matcher` | 30s rebuild、matcher UI、`/matcher/*` |
| `client/web` | Vue 3 + Vite，端口 5174（开发） |
| `client/chrome-extension` | MV3 跨域代理与凭证捕获 |

## 数据流（不变）

```
浏览器/插件 (platform-adapter) → API_SaveMatch/SaveBet → backend → RDS platform_*
matcher rebuild → client_matches → Client_GetMatchs → web
```

## 团队边界（单仓）

客户端 / 服务端目录归属、禁止的跨包 import、HTTP 集成面见 [TEAM_BOUNDARIES.md](./TEAM_BOUNDARIES.md)。本地校验：`npm run check:boundaries`。

## 相关文档

- [TEAM_BOUNDARIES.md](./TEAM_BOUNDARIES.md) — 两团队 monorepo 边界
- [../CLAUDE.md](../CLAUDE.md) — 命令、表结构、采集间隔
- [../server/backend/GAMES.md](../server/backend/GAMES.md) — 游戏 catalog
- [../server/backend/MARKETS.md](../server/backend/MARKETS.md) — 玩法选盘
- [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md) — 生产部署
