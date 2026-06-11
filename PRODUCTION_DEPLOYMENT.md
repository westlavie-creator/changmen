# 生产部署 Checklist（M1 — 架构冻结）

changmen 是 **客户端 + 服务端** 系统。`localhost` 与 `.bat` 仅用于开发联调；生产环境客户端连**远程 API**，服务端与 Supabase 跑在服务器/云上。

最后更新：2026-06-11

---

## 1. 架构（冻结）

```text
┌─────────────────────────────────────────────────────────┐
│ 客户端（每台操作员机器）                                   │
│  Vue /app/ + Chrome 插件                                 │
│  platform_adapter 采集 → API_SaveMatch / API_SaveBet     │
│  oddsStore（内存 fo）· 下注 Provider · CollectConfig 门控  │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS / WSS（/esport/*）
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 服务端（一台或多实例）                                     │
│  gamebet_backend  — esport-api、WS relay、静态 /app/     │
│  gamebet_matcher   — 循环写 client_matches               │
│  Supabase          — platform_* / client_matches / orders  │
└─────────────────────────────────────────────────────────┘
```

**已删除、不再部署**：Node FeedHub、`ESPORT_BRIDGE`、服务端直连平台拉列表/赔率。采集**只在客户端**。

Parity 唯一基线：浏览器 `saveMatch` / `saveBet` + 插件 + matcher → `Client_GetMatchs`。

---

## 2. 推荐拓扑：同源部署

前端 API 使用相对路径（`/esport/...`、`/esport/ws/...`），**推荐** API 与 `/app/` 同一 origin：

| 路径 | 服务 |
|------|------|
| `https://your-domain.com/app/` | 静态前端（`app:build` 产物） |
| `https://your-domain.com/esport/*` | gamebet_backend |
| `wss://your-domain.com/esport/ws/*` | WS relay（OB/RAY/TF/IA） |
| `https://your-domain.com/v4.0/*` | 平博 v4 透明代理（可选） |

Nginx / Caddy 反代示例要点：

- `proxy_http_version 1.1` + `Upgrade` / `Connection` 用于 WebSocket
- 静态 `/app/` 指向 `gamebet_frontend/app/dist/` 或由 Node 托管

**分离域名**（如 `app.example.com` + `api.example.com`）需额外网关把 `/esport` 代理到 API，或改前端为绝对 base URL（当前未内置 `VITE_API_BASE`，M2 前优先同源）。

---

## 3. 服务端部署步骤

### 3.1 依赖与环境

```bash
cd changmen
npm install
npm install --prefix gamebet_backend
npm install --prefix gamebet_matcher
```

| 变量 | 生产 | 说明 |
|------|------|------|
| `SUPABASE_URL` | **必填** | Supabase 项目 URL |
| `SUPABASE_SERVICE_KEY` | **必填** | 写库（绕过 RLS） |
| `PORT` | `3456` 或反代端口 | HTTP 监听 |
| `A8_AUTH` | **`1`（默认）** | Supabase 登录；勿用 `users.json` |
| `A8_V4_URL` | `https://api.a8.to/v4.0` | v4 上游 |
| `NODE_ENV` | `production` | 常规 Node 约定 |

Relay（按需，默认多数开启）：

| 变量 | 默认 | 说明 |
|------|------|------|
| `ENABLE_OB_MQTT_RELAY` | 开 | 客户端 OB MQTT 隧道 |
| `ENABLE_RAY` | 开 | RAY WS relay |
| `ENABLE_TF` | 关 | 需 TF 时设 `1` |
| `ENABLE_IA_RELAY` | 开 | IA Socket.IO relay |

**不要设置**（已移除）：`ESPORT_BRIDGE`、`ENABLE_FEED_HUB`、`ENABLE_OB`（Feed 采集）。

### 3.2 数据库

```bash
cd changmen/gamebet_backend
npx supabase db push
```

确认 pg_cron 清理任务已应用（见根目录 `CLAUDE.md` — `prune-stale-*`）。

### 3.3 构建并托管前端

```bash
cd changmen
npm run app:build
```

产物在 `gamebet_frontend/app/dist/`；Web Host 启动时会托管 `/app/`（见 `host/web/index.js`）。

### 3.4 进程

至少两个长期进程：

```bash
# 1) API + 静态 + relay
cd changmen/gamebet_backend && npm run web

# 2) 赛事合并（写 client_matches）
cd changmen && npm run matcher:loop
```

生产建议用 systemd / pm2 / Docker Compose 托管，并配置重启策略。

### 3.5 健康检查

| 检查 | 期望 |
|------|------|
| `GET /api/games` | 200 + JSON |
| `GET /api/proxy/status` | relay 状态 |
| `POST /esport/Client_GetMatchs`（带 JWT） | 200 或业务码 |

---

## 4. 客户端部署步骤

### 4.1 访问方式

- **浏览器**：打开 `https://your-domain.com/app/`，登录 Supabase 用户
- **Chrome 插件**：操作员在 Chrome/Edge 安装 `gamebet_chromeplug`（见 4.2）。PB / Stake 采集与 v4 代发**依赖插件**。

### 4.2 Chrome 插件

```bash
cd changmen/gamebet_chromeplug
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
| P0 | Supabase：`service_role` 仅服务端；客户端 JWT 只读 |
| P1 | 日志脱敏 token / cookie |
| P1 | HTTPS 全站（含 WSS） |

---

## 6. 开发联调 vs 生产（对照）

| 项 | 开发 | 生产 |
|----|------|------|
| API 地址 | `localhost:3456` 或 Vite `:5174` + proxy | `https://your-domain.com` |
| 启动 | `parity-dev.bat` / `dev-web.bat` + matcher | `web` + `matcher:loop` |
| 认证 | 可 `A8_AUTH=0` + TJ01 | Supabase 真实用户 |
| 采集 | 本机浏览器 + 插件 | 各操作员客户端上报同一 Supabase |
| Node Feed | **不存在** | **不存在** |

---

## 7. M1 完成标准

- [x] 服务端已删除 FeedHub / `ESPORT_BRIDGE` 代码路径
- [x] 文档统一「客户端采集 + 服务端聚合」表述
- [x] 本文档定义生产拓扑与环境变量
- [ ] 选定生产域名并完成首次 `db push` + 双进程部署
- [ ] 至少一台客户端连远程 API 登录成功

M1 签字后进入 **M2**（OB/RAY/IM 采集 E2E），见 [gamebet_frontend/app/docs/A8_WALKTHROUGH_CHECKLIST.md](./gamebet_frontend/app/docs/A8_WALKTHROUGH_CHECKLIST.md)。

---

## 8. 相关文档

| 文档 | 内容 |
|------|------|
| [readme.md](./readme.md) | 项目共识、目录 |
| [CLAUDE.md](./CLAUDE.md) | 开发命令、Supabase 表 |
| [gamebet_backend/README.md](./gamebet_backend/README.md) | API、relay 环境变量 |
| [scripts/README.md](./scripts/README.md) | `.bat` 脚本说明 |
