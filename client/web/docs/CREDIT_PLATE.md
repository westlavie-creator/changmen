# 平博信用盘（A8 v4）— 新控制台 `/`

> **状态（2026-05-29）**：两步 v4 已在本地经 `/v4.0/` 代理 E2E 通过（`npm run test:v4`，需 backend `3456`）。  
> UI 确认框见 `src/api/v4.ts` 中 `fetchPbPlayUrl` / `enterCreditPlate`。

实现文件：`src/api/v4.ts` · 入口 UI：`CollectConfigPanel.vue`「平博体育」。

## 与主站登录是两回事

| 用途 | 接口 | 账号 | 密码 |
|------|------|------|------|
| **主站登录**（进控制台） | `POST /esport/Client_Login` | 如 `admin` 或 `TJ01` | 登录页密码；`A8_AUTH=0` 时仅认 `users.json` |
| **平博信用盘 v4**（点「平博体育」） | `POST /v4.0/user/account/login` | **A8 账号名**（默认 `TJ01`，见 `server/backend/core/integrations/a8/constants.js`） | 固定 **`a123456`**（对齐 A8 bundle `RMe`） |

用 `admin` 登录主站后点平博，**不会**把 `admin` 传给 v4；前端经 `/api/a8/credit-plate-user` 或 `GetUserInfo.CreditPlateUserName` 解析为 `TJ01`。

## 流程（对齐 A8 UserCollectView）

1. **v4 登录** — `POST /v4.0/user/account/login` → `info.token`（**已验证**）
2. **进游戏** — `POST /v4.0/game/play/Login` → `info.Url`（**路径与 A8 一致，无需改成别的 URL**）
3. **确认框** — `ElMessageBox.confirm`「进入游戏」→ **仅** `window.open(Url)`（与 A8 一致，**此处不会再发 HTTP/API**；v4 请求只在点「平博体育」时出现）

**Network 对照**

| 操作 | 应看到的请求 |
|------|----------------|
| 点「平博体育」 | `POST /v4.0/user/account/login`、`POST /v4.0/game/play/Login`（及可能的 `GET /api/a8/credit-plate-user`） |
| 点确认框「进入游戏」 | 无 XHR；可能有 **Doc** 类型导航到平博 SSO URL（弹窗被拦则什么都没有） |

### 第二步要不要改 URL？

**不用改。** 与第一步相同：

- 开发（Vite）：`http://localhost:5274/`（Win）或 `5174` → 可选 `/v4.0/` 代理 → backend（Win `3560` / 其它 `3456`）
- 生产/3456：同源 `/v4.0/game/play/Login`

A8 bundle 同样是 `i("game/play/Login", { gameId: 3 })`，注意路径里 **`Login` 大写 L**，不要写成 `login`。

| 项 | 要求 |
|----|------|
| Method | `POST` |
| Header `token` | **第一步返回的 token**（不是主站 `/esport` 的 token） |
| Header `x-forwarded-site` | `game.haijings.vip` |
| Body | `gameId=3`（`application/x-www-form-urlencoded`） |

实现见 `src/api/v4.ts` 中 `fetchPbPlayUrl`：先 `user/account/login`，再 `game/play/Login`，token 通过第二次 `v4Post` 的 header 传入。

### 常见失败原因

| 现象 | 原因 | 处理 |
|------|------|------|
| `success:0` + `A8CloudflareBlocked` | 本机 Node 访问 `api.a8.to` 被 Cloudflare 403 | 换网络/VPN，或 `VITE_V4_DIRECT=1` 浏览器直连 |
| `success:0` / 无 `Url` | A8 返回失败或账号无效 | 检查 `a8_constants.js` 中 `TJ01` / `a123456` |
| 403 / 非 JSON | 上游非 A8 JSON | 同上 |

**无 mock**：`v4_router.js` 仅透明代理 `api.a8.to`，不返回 stub token、不用 `platforms.json` gateway 顶替 SSO。

OB / SABA 为试玩分支，不走上述 v4 登录。

## 本地开发请求路径

| 访问方式 | v4 请求 URL | 说明 |
|----------|-------------|------|
| `http://localhost:5274/` 或 `5174`（Vite） | **`https://api.a8.to/v4.0/...`** | **默认**；与 A8 官方 bundle 一致，**浏览器直连**（真 SSO，目标页可登录） |
| 可选 Node 代理 | 同源 `/v4.0/...`（Vite dev） | 仅当 `.env.local` 设 `VITE_V4_PROXY=1`；易被 Cloudflare 403 |
| `http://localhost:3456/`（构建产物） | 同源 `/v4.0/...` | 由 backend `v4_router.js` 转发（部署环境用） |

本地 dev **不必** 为 v4 启动 backend（主站 `/esport` 仍要 3456）。`vite.config.ts` 的 `/v4.0` 代理仅在使用 `VITE_V4_PROXY=1` 时用到。

### Backend

`server/backend/core/esport-api/v4_router.js` 只做 **POST/GET 转发** 到 `A8_V4_URL`（默认 `https://api.a8.to/v4.0`）。`user/account/login` 的 body 由服务端用 `a8_constants.js` 账号重写后转发。

## 辅助 API

| 路径 | 说明 |
|------|------|
| `GET /api/a8/defaults` | 登录页预填 `TJ01` / `a123456` |
| `GET /api/a8/credit-plate-user` | 平博 v4 用的 `userName`（带 `token` 头时读 `setting.a8UserName`） |
| `Client_GetUserInfo` | 响应含 `CreditPlateUserName` |

## 自动化 E2E（两步）

```bash
# 先启动 server/backend（默认 3456）
cd changmen/client/web
npm run test:v4
```

成功输出含 `[v4-test] PASS` 与平博 SSO `Url` 前缀；失败常见为 Cloudflare（`A8CloudflareBlocked`）或 `a8_constants.js` 账号无效。

## 如何确认「第一步成功」

开发者工具 → Network：

- localhost 上 URL 应为 **`https://api.a8.to/v4.0/user/account/login`**（浏览器直连）；若仍是 `/v4.0/` 说明走了 Node 代理（检查是否设了 `VITE_V4_PROXY=1`）
- Payload：`userName=TJ01`（或你的 A8 账号）、`password=a123456`
- 响应 JSON：`success: 1`，`info.token` 非空

## v4 与主站关系

- **控制台 `/`**：平博 v4 逻辑在 `src/api/v4.ts`；本地 dev 默认 **`/v4.0/`** 代理到 `server/backend`。

## 相关文档

- [MIGRATION.md](../MIGRATION.md) — 迁移总表
- [ARCHITECTURE.md](../src/ARCHITECTURE.md) — `api/v4.ts` 在架构中的位置
- [server/backend/README.md](../../backend/README.md) — `A8_V4_*` 环境变量
- [devtools/platform-probes/pb/docs/README.md](../../../devtools/platform-probes/pb/docs/README.md) — PB 采集（与 v4 信用盘入口无关）
