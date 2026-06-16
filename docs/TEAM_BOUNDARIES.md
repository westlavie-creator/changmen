# 团队边界（单仓阶段 0）

changmen 仍为 **一个 monorepo**，通过目录归属、CODEOWNERS 与 `check-team-boundaries` 让**客户端团队**与**服务端团队**可各自维护，减少跨团队改坏对方代码。

完整两仓 / 契约包路线见本文末尾「后续阶段」。

## 团队与目录

| 团队 | 拥有目录 | 职责 |
|------|----------|------|
| **客户端** | `client/web/`、`client/chrome-extension/`、`client/platform-adapter/` | UI、采集、下注、插件、各平台适配源码 |
| **服务端** | `server/backend/`、`server/matcher/`、`server/db/`、`server/match-engine/`、`server/team-resolver/` | API、合并、RDS、代理/余额、运维脚本 |
| **开发工具** | `devtools/platform-probes/` | 可选：直连各平台探针 CLI（非主链路） |

已移除的遗留目录（勿再创建）：`server/platform-node`、`server/platform-probes`、`client/platform-adapter/node/`、`client/platform-adapter/{platform}/backend/`。探针源码仅在 `devtools/platform-probes/`；瘦包同步产物为 `server/backend/platform_node/` 与 `server/backend/platform_adapter/`。
| **共同协商** | `packages/shared/`、`packages/api-contract/`、`docs/TEAM_BOUNDARIES.md`、`.github/CODEOWNERS` | 跨端工具、catalog、HTTP 契约 |

`client/platform-adapter` 内的 `loader/`、`registry/`、`scripts/` 属**适配器基础设施**（`reqS` / `backendRequire` 在 `loader/adapter_paths.mjs`）；各平台 `{platform}/shared/` 为**浏览器采集**内部模块（collect / markets / parse 共用），**不同步**到瘦包。

`devtools/platform-probes/{platform}/shared/` 为**探针/CLI** 内部模块（如 RAY 的 CJS `save_bets.js`），与浏览器 `shared/` 分离，由探针包 `sync:backend-bundle` 打入 `server/backend/platform_node/`。

服务端通过 `requirePlatform(..., "node")` 加载探针；**不得**引用各平台根目录下的采集/下注 ts（`client/platform-adapter/{platform}/shared/` 亦不在瘦包内）。

## 唯一集成面（HTTP）

客户端 **只** 通过 HTTP 使用服务端能力（禁止在 `client/web/src` 里 `import` 服务端或 DB 包）：

| 方向 | 端点（示例） | 说明 |
|------|----------------|------|
| 上报 | `POST /esport/API_SaveMatch` | 平台原始比赛 |
| 上报 | `POST /esport/API_SaveBet` | 平台原始赔率 |
| 上报 | `POST /esport/API_SaveLiveTimer` | OB 局数/计时 |
| 拉取 | `POST /esport/Client_GetMatchs` | 合并后比赛列表（真相源） |
| 拉取 | `POST /esport/Client_GetData` | KV / 配置 |
| 辅助 | `POST /esport/http-relay` | 插件/跨域代发 |
| 鉴权 | `POST /esport/*`（带 `token` 头） | JWT 会话 |

实现参考：`client/web/src/api/`、`@changmen/api-contract`。改响应形状须升契约包版本并通知对方团队。

### `@changmen/api-contract`（阶段 1）

| 导出 | 用途 |
|------|------|
| `EsportAction`、`ESPORT_ACTIONS` | 与 `router.ts` 同步的 action 名 |
| `ClientMatchDto` 等 | 共享 DTO |
| `buildEsportUrl` / `buildHttpRelayUrl` | 前端 `VITE_API_BASE`、脚本联调 URL |
| `openapi.yaml` | OpenAPI 索引 |

分离部署（**可选**）时前端设置 `VITE_API_BASE=https://api.example.com`（见 `client/web/.env.example`）。单机同源 `http://IP/` 时未设置即可，仍用相对路径 `/esport/...`。

## 允许 / 禁止的源码依赖

### 客户端（`client/web/src`、`client/chrome-extension/src`）

| 允许 | 禁止 |
|------|------|
| `@platform/*` → `client/platform-adapter` | `@changmen/db`、`@changmen/match-engine`、`@changmen/platform-probes` |
| `@changmen/shared`（展示、时间窗、账号倍数等） | `server/backend`、`server/matcher` 任意路径 |
| `@changmen/api-contract` | |
| `@/` 应用内模块 | |

`client/web/scripts/`：允许 `@changmen/match-engine` 做离线 parity 测试；仍禁止 `@changmen/db` 与直接引用 backend。

### 各平台 `client/platform-adapter/{platform}/`（根目录 ts，不含 `shared/`、`scripts/`）

| 允许 | 禁止 |
|------|------|
| `@platform/contract`、`@platform/shared`、同平台 `shared/` | `@changmen/db`、`client/web`、`server/backend` |
| `@changmen/shared` | `@changmen/platform-probes`、`@changmen/match-engine` |

### 服务端（`server/backend`、`server/matcher`）

| 允许 | 禁止 |
|------|------|
| `@changmen/db`、`@changmen/match-engine`、`@changmen/shared` | `client/platform-adapter/*/`（平台根目录 ts 与 `shared/`） |
| `@changmen/platform-adapter/loader`、`registry`、`requirePlatform` → **node** | `client/web/src/**` |
| `@changmen/platform-probes` | |

### 探针（`devtools/platform-probes`）

| 允许 | 禁止 |
|------|------|
| `@changmen/shared`、`@changmen/db` | `@changmen/platform-adapter`（含各平台 `shared/`） |
| 同平台 `shared/`、`core.js`、CLI 脚本 | `client/web`、`client/platform-adapter/{platform}/` 根目录 ts |

## 本地校验

```bat
cd changmen
npm run check:boundaries
```

CI 在 `npm test` 前执行。违规时根据报错移除跨边界 `import`，或把共享逻辑下沉到 `packages/shared` 并经双方评审。

## CODEOWNERS

将 `docs/CODEOWNERS.example` 复制为仓库根 `.github/CODEOWNERS`，把占位符换成真实 GitHub 用户或 team slug：

```bat
copy changmen\docs\CODEOWNERS.example .github\CODEOWNERS
```

## 开发习惯

1. **客户端**改采集/下注 → 只动 `platform-adapter` + `client/web`；用 Save* API 验证，不直连 RDS。
2. **服务端**改合并/表结构 → `matcher` + `db` + backend 路由；用 `Client_GetMatchs` 契约测试或 web 冒烟验证。
3. **`packages/shared`** 变更：谁改谁提 PR，另一方扫一眼受影响 API 字段/展示。
4. 生产发版解耦：前端 `app:build` 更新 `dist`、后端 `pm2 restart` 互不影响；单机单 IP 用 Caddy 即可，**不必**双域名。见 [PRODUCTION_DEPLOYMENT.md §2.1](../PRODUCTION_DEPLOYMENT.md#21-两团队独立发版单-ip--caddy)。

## 后续阶段（未实施）

| 阶段 | 内容 |
|------|------|
| 1 | `@changmen/api-contract`（OpenAPI + TS 类型）、`VITE_API_BASE` | ✅ 完成（monorepo workspace） |
| 2 | `packages/client-shared` 从 `shared` 拆出并 semver |
| 3 | `changmen-client` / `changmen-server` 双仓库 |
