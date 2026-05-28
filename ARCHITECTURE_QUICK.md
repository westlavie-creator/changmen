# 架构速览（多用户 / 运行边界）

## 1) 本项目谁在跑（运行 vs 参考）
- **运行（生产/多用户部署时）**：`changmen/`（后端 + 新控制台 + Chrome 扩展）
- **参考（只读对照/逆向）**：`A8/`、`pingtai_offical/`

> 规则：`A8/`、`pingtai_offical/` 仅用于“看怎么写/比对行为”，不参与本项目运行。

## 2) 浏览器请求到哪里
多用户架构下：**浏览器只连你的后端服务器**（由 `changmen/gamebet_backend/` 提供 `/esport/*`、`/v4.0/*`、静态 `/app/` 等）。

## 3) 本地开发端口（容易混淆）
- `3456`：`gamebet_backend`（后端 + 静态入口）
- `5174`：Vite dev 壳（新控制台热更新），通过 Vite 的 `/esport`、`/api` 等代理转发到后端（`3456`）

## 4) 场馆 HTTP 客户端（对齐 A8）
- **采集直连**：`shared/http.ts` → `shared/a8Axios.ts`（**Axios + XHR**，对齐 A8 `Rr.get`）
- **账号下注/余额**：`shared/platformHttp.ts`（同上；有 `proxyId` 时走 `/esport/http-relay`）
- **未走 Axios 的路径**：PB/Stake 等需 **Chrome 扩展** 代发时仍用扩展协议（对齐 A8 `Cr.http` → `Zn`）

## 5) CORS / 中继
- 当账号 **`proxyId` 存在** 时：浏览器只请求本后端 `/esport/http-relay`，由 Node 代打场馆（`x-proxy-url`）
- 无 `proxyId` 时：浏览器 **Axios 直连** 场馆 gateway（仍可能 CORS / 506，与网络环境有关）

入口：`platformHttp.ts`、`collectors/*/http.ts`

