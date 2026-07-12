# baseball — 棒球产品线

**状态**：B1 进行中（`baseball/web` 本地只读 PM MLB 看板）

## 本地优先（当前阶段）

棒球线 **暂不建 `baseball/server`**，也 **不** 接 changmen 后端、RDS、matcher、PM2、VPS relay。

| 项 | 当前 | 后期（VPS 联动） |
|----|------|------------------|
| 前端 | `baseball/web` + `npm run baseball:dev` | 同源部署或独立子路径 |
| 数据 | 浏览器经 Vite dev proxy 直连 Gamma/CLOB | HK relay / 自建 proxy |
| 鉴权 | 无 | 可选 JWT（与电竞共用 secret） |
| 采集/合并 | 无 | `API_SaveMatch` + matcher |

开发只需本机 Node + 浏览器，**不需要** `BAT\dev.bat` 或 backend 进程。

## 约定

新业务线（棒球及以后的其他运动）在 **仓库根** 新建同名目录，例如：

```
changmen/
├── baseball/          ← 棒球代码（本目录）
├── {other-sport}/     ← 未来其他产品线
├── client/            ← 平台层（共享）
├── server/            ← 平台层 + 能力层（共享）
└── lines/
    └── baseball/      ← manifest 锚点（line.json，非代码）
```

- **代码**：`changmen/{code}/`（如 `baseball/`）
- **manifest**：`lines/{code}/line.json` 的 `components` 指向上述路径
- **不复制** `venue-adapter`、`packages`、`server/backend` 等平台层

电竞（默认线）仍在 `client/web/` 等共享路径；见 `lines/esport/line.json`。

详见 [docs/SPORTS_PRODUCT_LINES.md](../docs/SPORTS_PRODUCT_LINES.md)。

## 开发

```bat
npm install
npm run baseball:dev
```

浏览器打开 `http://localhost:3458/baseball/`（`BASEBALL_PORT` 可覆盖端口）。

B1 数据源：Polymarket Gamma `sport=mlb` + CLOB `/prices` + 浏览器直连 Sports WS `wss://sports-api.polymarket.com/ws`（`slug` / `gameId` 匹配比分）。
