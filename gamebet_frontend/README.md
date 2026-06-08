# gamebet_frontend（A8 复刻 + Changmen 新控制台）

浏览器侧：参考 bundle、patch 旧控制台 `/console/`；**新控制台 `/app/` 的职责以赔率为准**。

## Changmen 分工（`/app/`）

| 职责 | 负责方 | 接口 / 状态 |
|------|--------|-------------|
| 比赛列表 | **后端** Node Feed + `ESPORT_BRIDGE` | `Client_GetMatchs` ← `matches.json` |
| 赔率采集 | **前端** `collectors/*` | `API_SaveBet` → `bets.json`；页面缓存对齐 A8 `fo`（`oddsStore`） |

前端采集器仍会连接平台源站（OB MQTT、RAY WS 等）拉赔率；**不应**再依赖前端 `API_SaveMatch` 作为列表主数据源（后端已写 `matches.json`）。

> 术语约定：用户中心「赛事采集」开关 = 是否**回传**到后端（`Client_SaveMatch` / `Client_SaveBets`），不是是否连接平台或是否在内存里更新 `oddsStore`。

Chrome 扩展见仓库根目录 [`gamebet_chromeplug/`](../gamebet_chromeplug/)。

## 目录

| 路径 | 说明 |
|------|------|
| `app/` | **新控制台**（Vue3 源码，逐步替代 bundle）→ `/app/` |
| `vendor/ui-bundle/` | A8 参考 bundle（只读，勿改） |
| `console/` | `npm run patch:ui` 输出，`/console/` 加载 |
| `extension/` | 旧版插件副本（请用根目录 `gamebet_chromeplug/`） |
| `patch-ui-bundle.js` | 域名 → 本地 gamebet_backend、WS relay、可选 PB Node 模式 |
| `MIGRATION.md` | 脱离 bundle 分阶段对照表 |
| `app/docs/README.md` | **文档索引**（基线、走查、8 平台） |
| `app/docs/CREDIT_PLATE.md` | 平博信用盘 v4（主站登录 vs v4、本地 `/v4.0` 代理） |
| `VENDOR_UI_REFERENCE.md` | **仅** `/console/`：vendor bundle 与 patch 说明 |

## 常用命令

在仓库根目录：

```bash
npm run patch:ui    # 生成 gamebet_frontend/console/index.js
npm run app:install # 首次：安装 gamebet_frontend/app 依赖
npm run app:build   # 构建新控制台 → gamebet_backend 托管 /app/
npm run app:dev     # 开发：http://localhost:5174/app/
npm run web         # 启动 gamebet_backend
```

- 新控制台：`http://localhost:3456/app/`（`npm run app:build` 后）
- 旧控制台：`http://localhost:3456/console/`（需加载 `gamebet_chromeplug/`）

详见 [MIGRATION.md](./MIGRATION.md)。

## 与 gamebet_backend 的关系

- 前端 HTTP 调 `/esport/*`、`/common/*` → **gamebet_backend** `esport-api`
- WS 调 `/esport/ws/*` → **gamebet_backend** `proxy`（浏览器直连平台的隧道，非 Node Feed）
- 样式 `/esport2/assets/*` 由 **gamebet_backend** `public/esport2/` 提供；首次或缺图时执行 `npm run sync:a8-assets --prefix gamebet_backend`（从 A8 CDN 拉取，Font Awesome 走 FA 4.7 官方源）
