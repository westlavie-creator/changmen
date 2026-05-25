# backend — 本地 Node 服务

替代 `api.a8.to`、WS 中继、可选 Node Feed 与开发仪表盘。**A8 复刻 UI 在 `frontend/`**，由本服务托管 `/console/` 静态文件。

> 与第三方聚合平台 A8 的关系见仓库根目录 `readme.md`（A8 仅作借鉴，**不引用** `A8/index.js`）。

## 仓库布局

```text
gamebet/
├── frontend/                 # A8 复刻（浏览器侧）
│   ├── vendor/ui-bundle/     # 参考 bundle
│   ├── console/              # patch 输出
│   ├── extension/            # Chrome 插件
│   └── patch-ui-bundle.js
├── backend/                  # 本目录
│   ├── server.js
│   ├── public/               # 仪表盘 /、/platforms/、/esport2/ stub
│   ├── esport-api/
│   ├── proxy/
│   ├── platforms/
│   ├── shared/
│   ├── account/
│   └── data/
└── package.json              # 根目录 npm run web
```

## 目录结构（backend 内）

```text
backend/
├── package.json
├── server.js
├── restart.js
├── gen_platform_pages.js
├── public/index.html         # 聚合视图
├── public/platforms/         # 各平台独立展示页
├── shared/
│   ├── feed_hub.js
│   ├── platform_registry.js
│   ├── game_catalog.js
│   └── ...
└── platforms/
    ├── ob/
    ├── ray/
    └── ...
```

## 启动

```bash
# 仓库根目录（推荐）
npm install --prefix backend
npm run web

# 或仅 backend
cd backend
npm install
npm run web
```

- `http://localhost:3456/` — 聚合视图（Node Feed，非 A8 控制台）
- `http://localhost:3456/platforms/` — 分平台
- `http://localhost:3456/console/` — A8 控制台（静态来自 `frontend/console/`）

### 纯 A8 模式 vs 仪表盘模式（默认纯 A8）

| 路径 | 数据来源 | 说明 |
|------|----------|------|
| `/console/` | 浏览器采集 → `fo()` + `API_SaveMatch/SaveBet` → `Client_GetMatchs` | 与 A8 一致，**默认走这条** |
| `/`、`/platforms/` | Node `FeedHub` → `/api/snapshot`、WebSocket | 本地调试/聚合页，**不写** esport store |
| Node → store | 仅当 `ESPORT_BRIDGE=1` | 可选；会与浏览器 SaveMatch 并存，非 A8 原版行为 |

控制台要看到实时赔率：打开 `/console/`，保持浏览器采集器（NMe、bQe、bQ 等）运行；**不要**默认依赖 Node 写 `matches.json`。

环境变量（可选）：

| 变量 | 默认 | 说明 |
|------|------|------|
| `ESPORT_BRIDGE` | **关闭** | 设为 `1` 时 Node Feed 同步写入 `matches.json`（供无浏览器或 PB Node 模式） |
| `ESPORT_BRIDGE_MS` | `3000` | bridge 防抖间隔（毫秒） |
| `ENABLE_OB` | 开启 | 设为 `0` 关闭 OB |
| `OB_LOGIN_URL` | 见 OB 文档 | 覆盖 OB 登录地址 |
| `ENABLE_RAY` | 开启 | 设为 `0` 关闭 RAY |
| `RAY_WS` | 开启 | 设为 `0` 仅 HTTP 轮询（不连 cfsocket） |
| `ENABLE_PB` | 关闭 | 设为 `1` 开启平博 Node 采集（凭证见 `platforms/pb/README.md`） |
| `ENABLE_PB_NODE` | 关闭 | 设为 `1` 后 patch 禁用 bQ、Yn 改走 `/esport/pb/proxy` |
| `ENABLE_TF=1` | 关闭 | 启动 TF Feed（需 `TF_GATEWAY` + `TF_TOKEN`） |
| `ENABLE_IA=1` | 关闭 | 启动 IA Feed（需 `IA_GATEWAY` + `IA_TOKEN`） |
| `ENABLE_IMT=1` | 关闭 | 启动 IMT Feed（需 `IMT_GATEWAY` + `IMT_TOKEN` base64） |
| `ENABLE_IM=1` | 关闭 | IM 聚合 WS（`A8_WS_URL` / `A8_SOCKET_TOKEN`） |
| `ENABLE_XBET=1` | 关闭 | XBet 聚合 WS |
| `ENABLE_STAKE=1` | 关闭 | Stake（`STAKE_ACCESS_TOKEN` + 可选 A8 WS） |
| `ENABLE_SABA=1` | 关闭 | 沙巴（`SABA_GATEWAY` + `SABA_TOKEN`） |
| `ENABLE_HG=1` | 关闭 | 皇冠账户（`HG_GATEWAY` + `HG_TOKEN` JSON） |
| `A8_WS_URL` | `https://47.115.75.57` | IM / XBet / Stake 聚合 Socket.IO |
| `PORT` | `3456` | 仪表盘端口 |
| `A8_AUTH` | 开启 | 设为 `0` 时控制台用本地 `users.json`；默认走 **A8 账号密码** 登录 |
| `A8_V4_URL` | `https://api.a8.to/v4.0` | 平博 SSO / 控制台 A8 登录 |
| `AGGREGATE_GAME_CODES` | 全部 5 项 | 逗号分隔子集，如 `cs2,lol` |

### 控制台登录（方案 A：写死 A8 账号，对齐 bundle RMe）

与 A8 相同，账号密码写在 `backend/shared/a8_constants.js`：

```javascript
A8_USER: "test",
A8_PASSWORD: "a123456",  // 对齐 bundle RMe
```

修改后执行 `npm run patch:ui` 并重启 `npm run web`。控制台登录与「平博体育」均使用该账号向 A8 取 SSO。

聚合游戏列表见 [GAMES.md](./GAMES.md)。选盘规则见 [MARKETS.md](./MARKETS.md)。

## API

| 路径 | 说明 |
|------|------|
| `GET /api/markets` | 聚合玩法 / 选盘规则摘要 |
| `GET /api/games` | 聚合游戏类型及各地平台 ID |
| `GET /api/platforms` | 全平台注册表 + 运行状态 |
| `GET /api/snapshot` | 全平台 snapshot |
| `GET|POST /esport/pb/proxy?url=…` | PB HTTP 代理（仅 `ENABLE_PB_NODE=1` 时控制台使用） |
| `GET /api/snapshot/RAY` | 单平台 |
| `WS /ws` | 实时推送 |

## 平台文档

- OB：[platforms/ob/README.md](./platforms/ob/README.md)（含登录 URL 配置）、[STATUS_MAPPING.md](./platforms/ob/STATUS_MAPPING.md)
- RAY：[platforms/ray/README.md](./platforms/ray/README.md)

## 新增平台

1. 在 `platforms/<id>/` 实现 Feed（`start/stop/on/getSnapshot`）
2. 在 `shared/platform_registry.js` 注册（`server.js` 自动加载）
3. 运行 `npm run gen:platform-pages` 生成分平台页面
4. 更新平台 README
