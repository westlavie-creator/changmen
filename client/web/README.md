# client/web（客户端 — Vue 控制台）

浏览器/Electron 侧：新控制台 `/` 为主；旧 bundle `/console/` 仅对照。

## 分工

| 职责 | 负责方 | 接口 / 状态 |
|------|--------|-------------|
| 比赛列表 | **客户端** 采集 + **服务端** matcher | `API_SaveMatch` → `client_matches` → `Client_GetMatchs` |
| 赔率 | **客户端** 采集 + `oddsStore` | `API_SaveBet`；内存 fo（对齐 A8） |

服务端**不**跑平台 Feed 拉数（FeedHub 已删除）。列表来自客户端上报 + matcher 合并。

> 术语：用户中心「赛事采集」开关 = 是否**回传** `SaveMatch`/`SaveBet`，不是是否连接平台或更新 `oddsStore`。

Chrome 扩展见 [`client/chrome-extension/`](../chrome-extension/)。

生产部署（同源 `/` + 远程 API）：[../../PRODUCTION_DEPLOYMENT.md](../../PRODUCTION_DEPLOYMENT.md)

## 目录

| 路径 | 说明 |
|------|------|
| `src/` | **新控制台**（Vue3）源码 |
| `dist/` | 构建产物，由服务端托管在 `/` |
| `vendor/ui-bundle/` | A8 参考 bundle（只读） |
| `console/` | `npm run patch:ui` 输出，`/console/` |
| `patch-ui-bundle.js` | 旧控制台 patch（域名 → 本地 API、WS relay） |
| `MIGRATION.md` | 脱离 bundle 阶段表 |
| `docs/README.md` | 文档索引 |

平台采集源码在 **`client/platform-adapter/`**（Vite 别名 `@platform`），不在 `src/` 下。

## 常用命令

在 `changmen/` 目录：

```bash
npm run app:build   # 构建 → dist/，由服务端托管 /
npm run app:dev     # 开发 http://localhost:5174/（proxy → 3560）
BAT\dev.bat         # 后端 + Vite 一键启动
```

## 与 server/backend 的关系

- HTTP：`/esport/*`、`/common/*` → 服务端 `esport-api`
- 浏览器采集经 `@platform` 上报 `API_SaveMatch` / `API_SaveBet`；WS 由浏览器直连平台或 A8 聚合机
- 样式 `/esport2/assets/*` → 服务端 `public/esport2/`
