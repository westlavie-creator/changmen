# gamebet_frontend（客户端 — Vue 控制台）

浏览器/Electron 侧：新控制台 `/app/` 为主；旧 bundle `/console/` 仅对照。

## 分工（`/app/`）

| 职责 | 负责方 | 接口 / 状态 |
|------|--------|-------------|
| 比赛列表 | **客户端** 采集 + **服务端** matcher | `API_SaveMatch` → `client_matches` → `Client_GetMatchs` |
| 赔率 | **客户端** 采集 + `oddsStore` | `API_SaveBet`；内存 fo（对齐 A8） |

服务端**不**跑平台 Feed 拉数（FeedHub 已删除）。列表来自客户端上报 + matcher 合并。

> 术语：用户中心「赛事采集」开关 = 是否**回传** `SaveMatch`/`SaveBet`，不是是否连接平台或更新 `oddsStore`。

Chrome 扩展见 [`gamebet_chromeplug/`](../gamebet_chromeplug/)。

生产部署（同源 `/app/` + 远程 API）：[../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)

## 目录

| 路径 | 说明 |
|------|------|
| `app/` | **新控制台**（Vue3）→ `/app/` |
| `vendor/ui-bundle/` | A8 参考 bundle（只读） |
| `console/` | `npm run patch:ui` 输出，`/console/` |
| `patch-ui-bundle.js` | 旧控制台 patch（域名 → 本地 API、WS relay） |
| `MIGRATION.md` | 脱离 bundle 阶段表 |
| `app/docs/README.md` | 文档索引 |

## 常用命令

在 `changmen/` 目录：

```bash
npm run app:build   # 构建 → app/dist/，由服务端托管 /app/
npm run app:dev     # 开发 http://localhost:5174/app/（VITE_API_PROXY → 3456）
npm run web         # 启动服务端
```

## 与 gamebet_backend 的关系

- HTTP：`/esport/*`、`/common/*` → 服务端 `esport-api`
- WS：`/esport/ws/*` → 服务端 relay（供客户端连平台，非 Node Feed）
- 样式 `/esport2/assets/*` → 服务端 `public/esport2/`
