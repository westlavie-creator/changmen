# 第三方 UI 参考 bundle（仅 `/console/`）

> **新控制台 `/`** 的对照基线是 `A8/A8frontendscipts/2.0.1`，见 [docs/README.md](./docs/README.md)。
> 本文档只描述旧 bundle + `patch-ui-bundle.js` 流程。

## 目录

| 路径 | 说明 |
|------|------|
| `apps/web/vendor/ui-bundle/index.js` | 第三方聚合前端打包产物（Vue 编译结果），**只读参考** |
| `apps/web/console/` | `npm run patch:ui` 生成的 patch 版本，由浏览器加载 |

## 使用方式

- **浏览器**：访问 `http://localhost:3456/console/`，加载 patch 后的 bundle
- **Node**：禁止 `require` / import `vendor/ui-bundle/index.js`
- **插件**：加载 `changmen/apps/chrome-extension/`（Chrome unpacked）

## 禁止连接的远程聚合基础设施

| 地址 | 说明 |
|------|------|
| 第三方远程 API 域名 | 聚合后台，本项目用自建 `/esport/` 替代 |
| 第三方 relay IP | WS 聚合，本项目用本地 `apps/backend/proxy` + `/esport/ws/*` |

各平台采集仍直连**源站**（OB gateway、365ray 等）。

## 本地 API

- `POST /esport/Client_*`、`POST /esport/API_*` → `apps/backend/core/esport-api/`
- `GET|POST /esport/pb/proxy?url=…` → `apps/backend/proxy/pb_http_proxy.js`（PB 余额/下单/注单，凭证来自 `PB_*` / `platforms.json`）
- `GET /esport2/version.json` → 静态 stub（`apps/backend/public/esport2/`）
- `WS /esport/ws/{OB,RAY,TF}` → `apps/backend/proxy/`

默认账号：`admin` / `admin`（首次启动写入 `apps/backend/data/esport/`）。

## 前端复刻原则

旧控制台 `/console/` UI **以 `vendor/ui-bundle/index.js` 为行为参考**，`patch-ui-bundle.js` 只做：

| 允许 patch | 禁止 patch |
|------------|------------|
| 聚合 API 域名 → `location.origin` + `/esport/` 等 | 改启动顺序（插件检测、mount 时机） |
| relay `47.115.75.57` → `127.0.0.1:3456`（WS/HTTP） | 改路由守卫、登录流程 |
| OB 试玩登录 URL 保持直连 `djtop-capi`（与 A8 一致，不经 `/api/ob/demo-login`） | 禁用/跳过 NMe、bQe 等浏览器采集器 |
| RAY/TF 的 `secure/port` 适配本地无 TLS | 改 DMe/NMe 采集逻辑 |
| 压缩产物语法 typo、`EXT_ID` 本地覆盖 | 改 fo()/套利/采集业务逻辑 |
| **PB Node 模式**（`ENABLE_PB_NODE=1` 可选）：去掉 `.use(bQ)`；`Yn` 走 `/esport/pb/proxy` | 默认与参考 bundle 一致：bQ + 插件 Yn |

### PB 默认 vs PB Node（可选）

**默认（纯 A8）**：控制台数据来自浏览器 `SaveMatch` + `fo()`。PB：插件凭证 + 浏览器 `bQ` + 插件 `Yn`。

**PB Node（可选）**：`ENABLE_PB_NODE=1` + 重新 `patch:ui`（仅旧 `/console/` bundle；新 `/` 不依赖 Node Feed）。

设 `ENABLE_PB_NODE=1` 并 `npm run patch:ui` 后：

| 项 | 参考 bundle / 默认 patch | PB Node |
|----|---------------------------|---------|
| 赔率采集 | 浏览器 `bQ` | 禁用 bQ，走 Node proxy |
| 余额/下单 | 插件 `Yn` | `/esport/pb/proxy` → Node |
| 凭证 | 插件 `data` → platforms.json | 同上 |

## 开发约定

1. 自写代码、路径、变量名中不使用第三方产品品牌字眼。
2. 新平台接入在 `packages/platform-adapter/{id}/` 实现；UI 契约按 bundle 内 `Client_*` / `API_*` 对齐。
3. 改 **`/console/`** 行为时先查 `vendor/ui-bundle`；改 **`/`** 时查 `A8/A8frontendscipts/2.0.1`。patch 默认只改地址类配置。
4. 禁止手改 `apps/web/console/index.js`，改 patch 后执行 `npm run patch:ui`。
