# changmen 架构

单一架构文档入口。命令与日常开发见 [../CLAUDE.md](../CLAUDE.md)。

## 目标目录（monorepo）

```
changmen/
├── packages/                    # 可复用库（无独立进程）
│   ├── shared/                  # @changmen/shared — catalog、db、odds、im_parse、match_time
│   ├── platform-adapter/        # @changmen/platform-adapter — 各平台 frontend/backend + registry
│   ├── match-engine/            # @changmen/match-engine — 跨平台合并核心
│   └── team-resolver/           # 队名 canonical 映射 + 爬虫
├── apps/                        # 可运行应用（计划）
│   ├── backend/                 # 现 gamebet_backend — HTTP API、代理、静态托管
│   ├── matcher/                 # 现 gamebet_matcher — 调度循环 + 人工关联 UI（瘦身后）
│   ├── web/                     # 现 gamebet_frontend — Vue 控制台
│   └── chrome-extension/        # 现 gamebet_chromeplug
└── docs/                        # 架构与设计文档（本目录）
```

## 迁移进度

| 阶段 | 内容 | 状态 |
|------|------|------|
| 1 | `shared` → `packages/shared` | ✅ 完成 |
| 2 | `platform_adapter` → `packages/platform-adapter` | ✅ 完成 |
| 3 | `team-resolver` → `packages/team-resolver` | ✅ 完成 |
| 4 | `gamebet_matcher/engine` → `packages/match-engine` | ✅ 完成 |
| 5 | `gamebet_*` → `apps/*` 重命名 | ⏳ 待做 |
| 6 | 根脚本 / `*.bat` / 部署文档统一到 `apps/` 路径 | ⏳ 随阶段 5 |

旧路径在阶段 5 之前仍可能出现在历史文档中；**以代码里 `adapter_paths.js` / `package.json` 为准**。

## 依赖方向

```
apps/web ──@platform──► packages/platform-adapter
apps/web ──HTTP───────► apps/backend
apps/chrome-extension ─（代理/凭证）─► 各平台源站

packages/platform-adapter ──采集上报──► apps/backend (API_SaveMatch/SaveBet)
apps/backend ──读写────► packages/shared/db (Supabase)
apps/matcher ──rebuild──► packages/match-engine + packages/shared
apps/matcher ──队名────► packages/team-resolver（动态 import，可选）

apps/backend ──requirePlatform──► packages/platform-adapter（开发）
apps/backend ──platform_adapter/ 拷贝（生产打包，目录名暂保留）
```

## packages 说明

### `packages/shared` (`@changmen/shared`)

跨进程共享：游戏/玩法 catalog、Supabase 客户端、赔率格式化、IM 解析、A8 时间窗规则。  
npm workspace 成员；matcher/backend 通过相对路径或 workspace 引用。

### `packages/platform-adapter` (`@changmen/platform-adapter`)

各平台采集与下注的 canonical 源码。前端通过 Vite 别名 `@platform` 引用。  
后端通过 `gamebet_backend/core/shared/adapter_paths.js` 的 `getAdapterRoot()` 解析：

1. `gamebet_backend/platform_adapter`（部署拷贝）
2. `changmen/packages/platform-adapter`（开发）

### `packages/team-resolver`

队名规范化插件；matcher `rebuild` 与 UI `merge_mode` 动态加载 `supabase_db.js`。  
爬虫脚本在 `scrapers/`，依赖 backend `.env` 与 `adapter_paths`。

### `packages/match-engine` (`@changmen/match-engine`)

`match_merge`、`bet_builder`、`im_enrich`、队名工具、`client_match_ids` 与 vitest/node:test 套件。  
`gamebet_matcher`（未来 `apps/matcher`）通过 `../../packages/match-engine` 引用；测试：`npm run test --prefix packages/match-engine`。

## apps 说明（当前路径 → 目标）

| 当前 | 目标 | 职责 |
|------|------|------|
| `gamebet_backend` | `apps/backend` | `server.js`、`/esport/*` API、HTTP 代理、静态资源 |
| `gamebet_matcher` | `apps/matcher` | 30s rebuild、matcher UI、`/matcher/*` |
| `gamebet_frontend` | `apps/web` | Vue 3 + Vite，端口 5174（开发） |
| `gamebet_chromeplug` | `apps/chrome-extension` | MV3 跨域代理与凭证捕获 |

## 数据流（不变）

```
浏览器/插件 (platform-adapter) → API_SaveMatch/SaveBet → backend → Supabase platform_*
matcher rebuild → client_matches → Client_GetMatchs → web
```

## 相关文档

- [../CLAUDE.md](../CLAUDE.md) — 命令、表结构、采集间隔
- [../gamebet_backend/GAMES.md](../gamebet_backend/GAMES.md) — 游戏 catalog
- [../gamebet_backend/MARKETS.md](../gamebet_backend/MARKETS.md) — 玩法选盘
- [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md) — 生产部署
