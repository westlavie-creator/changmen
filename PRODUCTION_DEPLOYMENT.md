# 生产部署 Checklist（M1 — 架构冻结）

changmen 是 **客户端 + 服务端** 系统。`localhost` 与 `.bat` 仅用于开发联调；生产环境客户端连**远程 API**，服务端与 RDS 跑在服务器/云上。

最后更新：2026-06-14

---

## 1. 架构（冻结）

```text
┌─────────────────────────────────────────────────────────┐
│ 客户端（每台操作员机器）                                   │
│  Vue / + Chrome 插件                                 │
│  client/platform-adapter 采集 → API_SaveMatch / API_SaveBet     │
│  oddsStore（内存 fo）· 下注 Provider · CollectConfig 门控  │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS（/esport/*）
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 服务端（一台或多实例）                                     │
│  server/backend    — esport-api、HTTP 代理、静态 /          │
│  server/matcher    — 循环写 client_matches                 │
│  polymarket-sports — Sports WS → client_matches.pm_sport   │
│  RDS (PostgreSQL)  — platform_* / client_matches / orders / users  │
└─────────────────────────────────────────────────────────┘
```

**已删除、不再部署**：Node FeedHub、`ESPORT_BRIDGE`、本机 WS 网关（OB MQTT / RAY SC / TF / IA relay）。各平台 WebSocket 由**浏览器直连**源站或 A8 聚合机。采集**只在客户端**。

Parity 唯一基线：浏览器 `saveMatch` / `saveBet` + 插件 + matcher → `Client_GetMatchs`。

---

## 2. 推荐拓扑：同源部署

前端 API 使用相对路径（`/esport/...`），**推荐** API 与 `/` 同一 origin。各平台 WebSocket 由浏览器直连源站或 A8 聚合机，不经本机 WS 网关。

| 路径 | 服务 |
|------|------|
| `https://your-domain.com/` | 静态前端（`app:build` 产物） |
| `https://your-domain.com/esport/*` | server/backend |
| `https://your-domain.com/v4.0/*` | 平博 v4 透明代理（可选） |

Nginx / Caddy 反代示例要点：
- 静态 `/` 指向 `client/web/dist/`（推荐由 Caddy `file_server` 托管），或由 `server/backend` 读 `dist` 托管

**分离域名**（可选，非默认）：如 `app.example.com` + `api.example.com` 时设置 `VITE_API_BASE` 并配 CORS，见 `client/web/.env.example`。单机单 IP、浏览器只访问 `http://IP/` 时**不需要**。

---

## 2.1 两团队独立发版（单 IP + Caddy）

目标：**前端团队与后端团队各改各的，发版时不必一起重启进程**。这与「双域名 / 跨域」无关；浏览器仍只访问同一 origin（如 `http://你的IP/`）。

### 生产上有几个「进程」

| 组件 | 生产形态 | 发版 / 重启 |
|------|----------|-------------|
| 前端（`client/web`） | **静态文件** `client/web/dist/`（不是常驻 Node 进程） | `npm run app:build` 后覆盖 `dist`；**一般不必** `pm2 restart` |
| API + 合并（`server/backend` + embedded matcher） | PM2：`gamebet-web`（`:3456`，`MATCHER_EMBEDDED=1`） | `pm2 restart gamebet-web --update-env` |
| Polymarket 赛程状态 | PM2：`gamebet-pm-sports`（Sports WS，写 `pm_sport`） | `pm2 restart gamebet-pm-sports --update-env` |
| 独立 matcher 回滚模式 | PM2：`gamebet-matcher`（默认不启用） | `MATCHER_STANDALONE=1 MATCHER_EMBEDDED=0 pm2 start ecosystem.config.cjs` |

开发联调才是两个进程：Vite（Win `5274` / 其它 `5174`）+ backend（Win `3560` / 其它 `3456`）（`BAT\dev.bat` 等），那是本地用，不是生产模型。

### 推荐拓扑（`scripts/Caddyfile`）

```text
浏览器 → http://IP:80 (Caddy)
           ├─ /、/assets/     → client/web/dist（前端团队 build）
           └─ /esport/* 等    → 127.0.0.1:3456 (PM2 gamebet-web)
```

- **前端发版**：`git pull` → `npm run app:build` → 更新 `dist/`（Caddy 直接读磁盘，无需 reload，更不必动 PM2）
- **后端发版**：`git pull` → `npm install`（若依赖变）→ `pm2 restart gamebet-web`（**不必**重新 `app:build`）

部署前把 Caddyfile 里 `root` 改成 VPS 上真实的 `.../changmen/client/web/dist` 路径。

### 简化拓扑（全反代到 3456）

若 Caddy 仅 `reverse_proxy 127.0.0.1:3456`，由 `server.js` 托管 `dist`，**独立发版仍然成立**：

- 前端只更新 `dist` → 通常可不 restart PM2（静态按请求读盘）
- 后端只 `pm2 restart gamebet-web` → 不必动 `dist`

Caddy 分流只是把「谁托管静态」从 Node 挪到 Caddy，职责更清晰；不是换一套产品架构。

### 团队分工（单仓）

| 团队 | 改什么 | 生产动作 |
|------|--------|----------|
| 客户端 | `client/web`、`platform-adapter`、`chrome-extension` | `app:build` → 更新 `dist` |
| 服务端 | `server/backend`、`matcher`、`server/db` 等 | `pm2 restart` 对应进程 |

集成只走 HTTP `/esport/*`（`@changmen/api-contract`），禁止跨团队 `import` 源码。见 [docs/TEAM_BOUNDARIES.md](./docs/TEAM_BOUNDARIES.md)。

---

## 3. 服务端部署步骤

### 3.1 依赖与环境

```bash
cd changmen
npm install          # workspaces: server/backend、server/matcher、packages/*
npm install  # 首次：安装全部 workspaces（含 client/web）
```

| 变量 | 生产 | 说明 |
|------|------|------|
| `DATABASE_URL` 或 `DATABASE_URL_PUBLIC` / `_INTERNAL` | **必填** | RDS 连接（`DATABASE_RDS_TARGET=auto` 内网优先） |
| `JWT_SECRET` | **必填** | 自签 JWT（至少 16 字符） |
| `JWT_ACCESS_TTL` | `7d` | access token 有效期 |
| `JWT_REFRESH_TTL` | `30d` | refresh token 有效期 |
| `GAMEBET_DB_SCRIPT` | `rds` | 数据层固定 RDS |
| `PORT` | `3456` 或反代端口 | HTTP 监听 |
| `A8_AUTH` | **`1`（默认）** | JWT 登录；勿用 `users.json` |
| `A8_V4_URL` | `https://api.a8.to/v4.0` | v4 上游 |
| `NODE_ENV` | `production` | 常规 Node 约定 |

HTTP 代理（按需，见 [server/backend/proxy/README.md](./server/backend/proxy/README.md)）：

| 变量 | 默认 | 说明 |
|------|------|------|
| `ENABLE_PB_NODE` | 关 | `1` 时 PB 走 `/esport/pb/proxy` |

**不要设置**（已移除）：`ESPORT_BRIDGE`、`ENABLE_FEED_HUB`、`ENABLE_OB`（Feed 采集）、`ENABLE_OB_MQTT_RELAY`、`ENABLE_RAY`、`ENABLE_TF`、`ENABLE_IA_RELAY`（WS relay 已退役）。

### 3.2 数据库

```bash
cd changmen/server/backend
node scripts/apply-rds-schema.mjs
```

过期 `client_matches` 由 `server/matcher` 每小时 archive（`server/db/archive_stale.js`，1 小时 `built_at` 阈值）。平台数据由 SaveMatch 快照生命周期负责，不再定时扫表。手动兜底：`node scripts/archive-stale-client-matches.mjs`。

### 3.3 构建并托管前端

```bash
cd changmen
npm run app:build
```

产物在 `client/web/dist/`。推荐由 Caddy 托管静态（见 §2.1）；若未分流，后端启动时也会托管 `/`（见 `server/backend/server.js`）。

### 3.4 进程

默认两个长期进程（推荐 PM2）：`gamebet-web`（内嵌 matcher）+ `gamebet-pm-sports`（Polymarket Sports WS）。

```bash
cd changmen
pm2 start ecosystem.config.cjs    # gamebet-web + gamebet-pm-sports
# 或手动：
MATCHER_EMBEDDED=1 npm run web
npm run pm-sports
```

`gamebet-pm-sports` 连 `wss://sports-api.polymarket.com/ws`，按 `platform_matches` 已有 Polymarket 行关联 `client_matches`，写入 `pm_sport`。**不替代**浏览器 CLOB WS 赔率采集。

`ecosystem.config.cjs` 默认注册 `gamebet-web` 与 `gamebet-pm-sports`，入口分别为 `server/backend/scripts/start-db.mjs` 与 `server/polymarket-sports/index.js`（`GAMEBET_DB_SCRIPT=rds`）。如需回滚到独立 matcher：

```bash
cd changmen
pm2 stop gamebet-web
MATCHER_STANDALONE=1 MATCHER_EMBEDDED=0 pm2 start ecosystem.config.cjs
pm2 restart gamebet-web gamebet-matcher --update-env
```

生产建议用 systemd / pm2 / Docker Compose 托管，并配置重启策略。

### 3.4 platform-adapter（Node 库 / CLI）

Node 探针在 **`@changmen/platform-probes`**（`devtools/platform-probes/`，瘦包同步为 `server/backend/platform_node`），与 `platform_adapter` 并列。**日常开发可不使用。**

**标准部署（整仓 `git pull` + `npm install`）**：后端经 workspace 直接使用 `client/platform-adapter`，**不需要**拷贝到 `server/backend/platform_adapter`。`scripts/deploy-server-remote.sh` 亦无需额外步骤。

**瘦包部署**（仅发布 `server/backend`、无 `packages/` 目录时）：

```bash
cd changmen
npm run sync:platform-adapter --workspace=@changmen/backend
# 或在 backend 目录：
# npm run sync:platform-adapter
```

将 `registry/`、`loader/` 等基础设施同步到 `server/backend/platform_adapter/`（跳过浏览器采集 ts）。`reqS` 经 `loader/adapter_paths.mjs` 解析 `@changmen/shared`。可选在进程环境设置 `GAMEBET_ADAPTER_ROOT` 指向该目录（否则解析顺序见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)）。

冒烟：`npm run test:adapter --workspace=@changmen/backend`（模拟瘦包布局）。

### 3.5 健康检查

| 检查 | 期望 |
|------|------|
| `GET /api/games` | 200 + JSON |
| `GET /api/proxy/status` | `{ enabled: false, wsRelay: false }`（WS 不经本机） |
| `POST /esport/Client_GetMatchs`（带 JWT） | 200 或业务码 |

---

## 4. 客户端部署步骤

### 4.1 访问方式

- **浏览器**：打开 `https://your-domain.com/`，登录 JWT 用户（`users` 表）
- **Chrome 插件**：操作员在 Chrome/Edge 安装 `client/chrome-extension`（见 4.2）。PB / Stake 采集与 v4 代发**依赖插件**。

### 4.2 Chrome 插件

```bash
cd changmen/client/chrome-extension
npm run build
```

操作员安装已解压扩展或企业策略分发。PB / Stake 采集与 v4 代发**依赖插件**。

可选：`VITE_GAMEBET_EXTENSION_ID` 与 manifest 一致。

### 4.3 开发专用变量（生产构建通常不设）

| 变量 | 用途 |
|------|------|
| `VITE_API_PROXY` | **仅 dev**：Vite 把 `/esport` 代理到本机 3456 |
| `VITE_V4_PROXY=1` | dev 时 v4 走本地 `/v4.0/` |
| `VITE_V4_DIRECT=1` | 仅在已放行 CORS 的域名使用 |

生产同源部署：**无需** `VITE_API_PROXY`；浏览器直接请求同 host 的 `/esport/*`。

### 4.4 平台账号

- 用户中心配置各平台 gateway/token（或插件凭证）
- `platform_sync` 在服务端启动时写 `platforms.json`（登录态种子）
- CollectConfig：显式开启才 `SaveMatch`/`SaveBet`（对齐 A8）

---

## 5. 安全（生产必读）

详见仓库根目录 [SECURITY_NOTES.md](../SECURITY_NOTES.md)。

| 优先级 | 项 |
|--------|-----|
| P0 | `x-proxy-url` relay：域名白名单 + 路径前缀 + 鉴权 + 审计 |
| P0 | 生产 `A8_AUTH=1`，禁用本地 `users.json` 免登 |
| P0 | `JWT_SECRET` 仅服务端；客户端只持 access/refresh token |
| P1 | 日志脱敏 token / cookie |
| P1 | HTTPS 全站（含 WSS） |

---

## 6. 开发联调 vs 生产（对照）

| 项 | 开发 | 生产 |
|----|------|------|
| API 地址 | 本机 backend 或 Vite dev + proxy（端口见 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)） | `https://your-domain.com` |
| 启动 | `BAT\dev.bat parity` / `BAT\dev.bat` + matcher | `web` + `matcher:loop` |
| 认证 | 可 `A8_AUTH=0` + TJ01 | JWT 真实用户（`users` + `profiles`） |
| 采集 | 本机浏览器 + 插件 | 各操作员客户端上报同一 RDS |
| Node Feed | **不存在** | **不存在** |

---

## 7. M1 完成标准

- [x] 服务端已删除 FeedHub / `ESPORT_BRIDGE` 代码路径
- [x] 文档统一「客户端采集 + 服务端聚合」表述
- [x] 本文档定义生产拓扑与环境变量
- [ ] 选定生产域名并完成首次 RDS schema + 双进程部署
- [ ] 至少一台客户端连远程 API 登录成功

M1 签字后进入 **M2**（OB/RAY/IM 采集 E2E），见 [client/web/docs/A8_WALKTHROUGH_CHECKLIST.md](./client/web/docs/A8_WALKTHROUGH_CHECKLIST.md)。

---

## 8. 相关文档

| 文档 | 内容 |
|------|------|
| [readme.md](./readme.md) | 项目共识、目录 |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | monorepo 布局、迁移阶段、adapter 解析 |
| [docs/TEAM_BOUNDARIES.md](./docs/TEAM_BOUNDARIES.md) | 两团队目录归属、独立发版 |
| [CLAUDE.md](./CLAUDE.md) | 开发命令、RDS 表 |
| [server/backend/README.md](./server/backend/README.md) | API、HTTP 代理环境变量 |
| [scripts/README.md](./scripts/README.md) | `.bat` 脚本说明 |
