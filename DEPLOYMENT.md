# 部署说明（多用户/生产视角）

本文档描述 **生产部署** 时的推荐形态与配置原则，避免把本地开发假设（如 `localhost:3456`、Vite `5174`）带入线上。

## 1) 运行边界（必须统一认知）

- **运行系统**：`changmen/`（后端 + 新控制台 + 可选 Chrome 扩展）
- **只读参考**：`A8/`、`pingtai_offical/`（不参与运行，不应被 import）
- **生产目标**：用户通过浏览器访问你的域名（或内网域名），浏览器只请求你的后端；后端代表用户去请求各场馆网关/第三方服务。

## 2) 端口与入口（生产 vs 本地开发）

### 生产推荐

- **单域名单入口**：`https://<your-domain>/`
  - 静态控制台：`/app/`（由后端托管构建产物）
  - API：`/esport/*`、`/api/*`、`/v4.0/*`、`/common/*`（由后端提供/转发）
  - WS：`/esport/ws/*`（由后端代理）

> 生产环境不应出现对 `127.0.0.1` 或用户本机 `localhost` 的依赖。

### 本地开发（仅供开发）

- `3456`：后端 `gamebet_backend`（同时托管 `/app/` 等静态入口）
- `5174`：Vite dev（仅开发热更新；通过 Vite proxy 转发到 `3456`）

## 3) 推荐部署拓扑

```text
Browser (multi-user)
  └── HTTPS -> Reverse Proxy (Nginx/Caddy)
        └── http://127.0.0.1:<PORT> -> Node backend (changmen/gamebet_backend)
              ├── serves /app/ (built frontend)
              ├── serves /esport/* /api/* /v4.0/* (API)
              ├── serves /esport/ws/* (WS relay)
              └── server-side fetch -> venues (OB/RAY/...)
```

## 4) CORS 与中继（强烈建议生产默认走后端）

### 为什么

- 浏览器直连场馆网关天然容易遇到 CORS / 预检失败 / 反爬差异。
- 多用户系统下，**后端统一出口**更利于：
  - 可观测性（日志/追踪/告警）
  - 稳定性（重试/超时一致）
  - 安全（脱敏/白名单/限流）

### 当前代码中的关键点

- 新控制台投注/余额请求：`changmen/gamebet_frontend/app/src/shared/platformHttp.ts`
  - **账号存在 `proxyId`** 时：会请求后端中继 `/esport/http-relay`，并在请求头带 `x-proxy-url` 指向真实场馆 URL
  - **无 `proxyId`** 时：会 `fetch(targetUrl)` 直连场馆（更容易 CORS）

### 生产建议（目标态）

- 逐步迁移为：**场馆 HTTP 默认都走后端**（不与 socks 代理绑定）。
- `proxyId` 的语义建议拆分为：
  - “是否走后端中继”（relayMode）
  - “是否使用上游 socks/http 代理”（upstreamProxy）

## 5) 配置管理建议（多用户）

- **不要把生产后端地址写死在前端默认值里**。
  - 推荐：前端所有 API 都走同源相对路径（`/esport/...`）
- 用户配置（代理列表、账号、token）建议以“后端存储 + 前端展示”为主。

## 6) 上线自检清单（建议作为验收）

- **网络**
  - [ ] 浏览器 Network 中不存在 `127.0.0.1`/`localhost` 作为请求目标（除非用户本机就是服务器）
  - [ ] `/app/` 静态资源从同源域名加载
- **CORS**
  - [ ] OB/RAY 等余额刷新不依赖浏览器直连场馆（或明确接受该风险）
- **安全**
  - [ ] 中继接口对 `x-proxy-url` 做白名单/前缀限制（见 `SECURITY_NOTES.md`）
  - [ ] 日志中对 token/凭证做脱敏

