# apps/matcher — 赛事合并

两个独立入口，生产通常只跑 **循环进程**；人工 UI 为开发/运维可选。

## 进程对照

| 入口 | 命令 / PM2 | 端口 | 作用 |
|------|------------|------|------|
| **合并循环** | `npm run matcher:loop` → `scripts/start-db.mjs` → `matcher.js` | 无 HTTP | 每 30s（可配）rebuild `client_matches` + 每小时 prune + dual 行数对账 |
| **人工 UI** | `npm run matcher:ui` → `ui/server.js` | `4567`（`MATCHER_UI_PORT`） | 拖线关联、画布；**非生产必需** |
| **主站桥接** | 随 `npm run web` 启动 | 同源 `/matcher/`、`/matcher/api/*` | backend `http_bridge.js` 把 API 转给 matcher Express |

Matcher 间隔/端口等环境变量由 `lib/config.js` 统一读取（勿在多处写 `process.env.MATCHER_*`）。

PM2（`ecosystem.config.cjs`）仅注册 **合并循环**（`gamebet-matcher`）。人工 UI 本地用 `BAT\matcher-ui.bat`。

## 依赖

- `packages/match-engine` — 合并算法
- `packages/db` — 读写 `platform_matches` / `client_matches` 等（`@changmen/db`）
- `@changmen/team-resolver` — 可选队名 canonical 插件

环境变量：与 backend 共用 `apps/backend/.env`（或 `matcher/.env`）。`GAMEBET_DB_SCRIPT` 与 backend 保持一致。

## 常用命令

```bash
cd changmen
npm run matcher:loop      # 后台循环
npm run matcher:ui        # 独立 UI http://localhost:4567
BAT\matcher-loop.bat
BAT\matcher-ui.bat
```

心跳文件：`apps/matcher/.matcher-heartbeat.json`（gitignore）。

更多：[../../docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md)、[../../scripts/README.md](../../scripts/README.md)。
