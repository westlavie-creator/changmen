# changmen 架构

单一架构文档入口。命令与日常开发见 [../CLAUDE.md](../CLAUDE.md)。

## 目标目录（monorepo）

```
changmen/
├── packages/                    # 可复用库（无独立进程）
│   ├── shared/                  # @changmen/shared — catalog、odds、im_parse、match_time
│   ├── db/                      # @changmen/db — 数据层唯一入口
│   ├── platform-adapter/        # @changmen/platform-adapter — 各平台 frontend/backend + registry
│   ├── match-engine/            # @changmen/match-engine — 跨平台合并核心
│   └── team-resolver/           # @changmen/team-resolver — 队名 canonical 映射 + 爬虫
├── apps/                        # 可运行应用
│   ├── backend/                 # HTTP API、代理、静态托管（原 gamebet_backend）
│   ├── matcher/                 # 调度循环 + 人工关联 UI（原 gamebet_matcher）
│   ├── web/                     # Vue 控制台（原 gamebet_frontend）
│   └── chrome-extension/        # MV3 扩展（原 gamebet_chromeplug）
└── docs/                        # 架构与设计文档（本目录）
```

## 迁移进度

| 阶段 | 内容 | 状态 |
|------|------|------|
| 1 | `shared` → `packages/shared` | ✅ 完成 |
| 2 | `platform_adapter` → `packages/platform-adapter` | ✅ 完成 |
| 3 | `team-resolver` → `packages/team-resolver`（`@changmen/team-resolver`） | ✅ 完成 |
| 4 | `gamebet_matcher/engine` → `packages/match-engine` | ✅ 完成 |
| 5 | 包名统一 `@changmen/*`（backend / matcher / web / chrome-extension / team-resolver） | ✅ 完成 |
| 5 | `gamebet_*` → `apps/*` 重命名 | ✅ 完成 |
| 6 | 根脚本 / `*.bat` / 部署文档统一到 `apps/` 路径 | ✅ 已完成（`BAT/` 集中实现；含 `apps/web/docs/*` 路径更新） |
| 7 | `packages/shared/db` → `packages/db`（`@changmen/db`） | ✅ 完成 |
| 8 | `@changmen/shared` / `@changmen/match-engine` workspace 依赖与 exports | ✅ 完成 |
| 9 | platform loader 迁入 `@changmen/platform-adapter`；team-resolver 不再依赖 apps/backend | ✅ 完成 |
| 10 | 存储路径与环境加载迁入 `@changmen/db`（`paths` / `load_env.cjs`） | ✅ 完成 |
| 11 | web 对齐 `@changmen/shared`（赔率/时间窗 re-export，workspace 解析） | ✅ 完成 |
| 12 | platform-adapter 路径收敛；`platforms.json` 迁入 `@changmen/db` | ✅ 完成 |
| 13 | backend 依赖瘦身（`pg`/`supabase` 经 `@changmen/db`）；平台采集脚本迁入 `@changmen/platform-adapter` | ✅ 完成 |
| 14 | 生产 `platform_adapter` 瘦包同步脚本 + 部署文档；monorepo 默认直接用 workspace 包 | ✅ 完成 |
| 15 | 文档路径口径统一（`packages/platform-adapter` / `@platform`） | ✅ 完成 |

旧路径 `platform_adapter/`、`gamebet_*` 仅出现在历史章节或迁移对照中；**以本表与代码 `package.json` / `adapter_paths` 为准**。

## 依赖方向

```
apps/web ──@platform──► packages/platform-adapter
apps/web ──HTTP───────► apps/backend
apps/chrome-extension ─（代理/凭证）─► 各平台源站

packages/platform-adapter ──采集上报──► apps/backend (API_SaveMatch/SaveBet)
apps/backend ──读写────► packages/db (@changmen/db)
apps/matcher ──rebuild──► @changmen/match-engine + @changmen/shared
apps/matcher ──队名────► @changmen/team-resolver（workspace 依赖，可选）
packages/team-resolver ──requirePlatform──► @changmen/platform-adapter/loader

apps/backend ──requirePlatform──► packages/platform-adapter（monorepo 默认）
apps/backend ──可选拷贝──► apps/backend/platform_adapter（瘦包 / GAMEBET_ADAPTER_ROOT）
```

## packages 说明

### `packages/shared` (`@changmen/shared`)

跨进程共享：游戏/玩法 catalog、赔率格式化、IM 解析、A8 时间窗规则。  
数据层与路径解析见 `@changmen/db`（`paths.js`、`load_env.js`）。  
npm workspace 成员；通过 `@changmen/shared` 包名引用。

### `packages/platform-adapter` (`@changmen/platform-adapter`)

各平台采集与下注的 canonical 源码。前端通过 Vite 别名 `@platform` → `packages/platform-adapter`。

各平台 CLI 采集脚本定义在本包 `package.json`（`ob:*`、`ray:*`、`pb:*` 等）；`apps/backend` 通过 `npm run <script> --workspace=@changmen/platform-adapter` 转发。

**服务端解析顺序**（`loader/adapter_paths.mjs`）：

1. `GAMEBET_ADAPTER_ROOT`（瘦包显式指定）
2. `packages/platform-adapter`（**标准 monorepo / VPS 部署**，无需拷贝）
3. `apps/backend/platform_adapter`（`npm run sync:platform-adapter` 生成，已 gitignore）
4. 遗留 `changmen/platform_adapter`

### `packages/team-resolver` (`@changmen/team-resolver`)

队名规范化插件；matcher `rebuild` 与 UI `merge_mode` 动态加载 `supabase_db.js`。  
爬虫脚本在 `scrapers/`，环境变量通过 `@changmen/db/load_env` 加载。

### `packages/match-engine` (`@changmen/match-engine`)

`match_merge`、`bet_builder`、`im_enrich`、队名工具、`client_match_ids` 与 vitest/node:test 套件。  
`apps/matcher` 通过 `@changmen/match-engine` workspace 依赖引用；测试：`npm run test --prefix packages/match-engine`。

## apps 说明

| 路径 | 职责 |
|------|------|
| `apps/backend` | `server.js`、`/esport/*` API、HTTP 代理、静态资源 |
| `apps/matcher` | 30s rebuild、matcher UI、`/matcher/*` |
| `apps/web` | Vue 3 + Vite，端口 5174（开发） |
| `apps/chrome-extension` | MV3 跨域代理与凭证捕获 |

## 数据流（不变）

```
浏览器/插件 (platform-adapter) → API_SaveMatch/SaveBet → backend → Supabase platform_*
matcher rebuild → client_matches → Client_GetMatchs → web
```

## 相关文档

- [../CLAUDE.md](../CLAUDE.md) — 命令、表结构、采集间隔
- [../apps/backend/GAMES.md](../apps/backend/GAMES.md) — 游戏 catalog
- [../apps/backend/MARKETS.md](../apps/backend/MARKETS.md) — 玩法选盘
- [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md) — 生产部署
