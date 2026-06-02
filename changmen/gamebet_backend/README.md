# gamebet_backend — 本地 Node 服务

替代 `api.a8.to`、WS 中继、可选 Node Feed 与开发仪表盘。**A8 复刻 UI 在 `gamebet_frontend/`**，由本服务托管 `/console/` 静态文件。

## 与 A8 的关系（必读）

**本目录 API 与存储不是 A8 官方后端的拷贝**，而是根据 A8 **浏览器前端** bundle 中的 `Client_*` / `API_SaveMatch` 等调用 **反推** 的实现。

- **Parity 基线**：A8 前端可证实行为（见 [../gamebet_frontend/app/docs/README.md](../gamebet_frontend/app/docs/README.md#项目共识)）。
- **changmen 推测**：`data/esport/*.json`、`match_merge.js`、`client_matchs` 预合并等。
- **changmen 扩展**：`FeedHub`、`ObFeed`、`ESPORT_BRIDGE`、仪表盘 `/`、`/platforms/`。

> 上级说明：[../readme.md](../readme.md#项目共识)

## 仓库布局

```text
changmen/                     # 本项目根（npm / .bat 均在此目录执行）
├── gamebet_frontend/         # A8 复刻（浏览器侧）
│   ├── vendor/ui-bundle/     # 参考 bundle
│   ├── console/              # patch 输出
│   └── patch-ui-bundle.js
├── gamebet_chromeplug/       # Chrome 插件（Gamebet 协议）
├── gamebet_backend/          # 本目录
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

## 目录结构（gamebet_backend 内）

```text
gamebet_backend/
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
npm install --prefix gamebet_backend
npm run web

# 或仅 gamebet_backend
cd gamebet_backend
npm install
npm run web
```

- `http://localhost:3456/` — 聚合视图（Node Feed，非 A8 控制台）
- `http://localhost:3456/platforms/` — 分平台
- `http://localhost:3456/console/` — A8 控制台（静态来自 `gamebet_frontend/console/`）

### Changmen 数据分工（新控制台 `/app/`）

**先选部署模式**（见 [../readme.md](../readme.md#项目共识)）：

| 模式 | 比赛列表 | 赔率 / 盘口 id |
|------|----------|----------------|
| **P — A8 Parity** | 浏览器 `API_SaveMatch` | 浏览器 `API_SaveBet` + `oddsStore` |
| **D — 双轨（dev 默认）** | Node `FeedHub` → bridge → `matches.json` | 浏览器 `API_SaveBet` + `oddsStore` |

模式 D 下：`backend.bat` / `dev.bat` 默认 `ESPORT_BRIDGE=1`，否则 `matches.json` 不会由 Node 回填。
模式 P（OB 复刻验收）：建议 `ESPORT_BRIDGE=0`、`ENABLE_OB=0`（仅关 Node ObFeed）；**浏览器 MQTT relay 默认仍开**（`ENABLE_OB_MQTT_RELAY` 未设时）。见 [../gamebet_frontend/app/docs/A8_OB_REPLICATE_PLAN.md](../gamebet_frontend/app/docs/A8_OB_REPLICATE_PLAN.md)。

### 其他入口

| 路径 | 数据来源 | 说明 |
|------|----------|------|
| `/app/` | 模式 D：Node bridge → `matches.json`；模式 P：浏览器 `saveMatch` | 见 [A8_OB_REPLICATE_PLAN.md](../gamebet_frontend/app/docs/A8_OB_REPLICATE_PLAN.md) |
| `/console/` | 浏览器 `SaveMatch` + `SaveBet`（旧 bundle） | 对齐 A8 原版，与上表分工不同 |
| `/`、`/platforms/` | `FeedHub` → `/api/snapshot`、WebSocket | 调试页；是否写 store 仍看 `ESPORT_BRIDGE` |

环境变量（可选）：

| 变量 | 默认（`backend.bat`） | 说明 |
|------|----------------------|------|
| `ESPORT_BRIDGE` | **`1`** | Node Feed 同步写入 `matches.json`（比赛列表）；设为 `0` 则仅 snapshot 调试、不写 store |
| `ESPORT_BRIDGE_MS` | `3000` | bridge 防抖间隔（毫秒） |
| `ENABLE_OB` | 开启 | 设为 `0` 关闭 **Node ObFeed**（不影响 `/esport/ws/OB` relay） |
| `ENABLE_OB_MQTT_RELAY` | 开启 | 设为 `0` 关闭浏览器 OB MQTT relay |
| `OB_FEED_MODE` | （未设） | 设为 `a8` 时 ObFeed 单源 index + 1500ms stage（模式 D 调试向 UMe 靠拢） |
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
| `A8_AUTH` | 开启 | 设为 `0` 时主站用本地 `users.json`（`backend.bat` 默认 `0`） |
| `A8_V4_URL` | `https://api.a8.to/v4.0` | v4 上游（Node 透明代理，无 mock） |
| `AGGREGATE_GAME_CODES` | 全部 5 项 | 逗号分隔子集，如 `cs2,lol` |

### 平博信用盘 v4（新控制台 `/app/`）

**第一步** `POST /v4.0/user/account/login` 已在本地联调通过（2026-05-26）。
新控制台不依赖 `patch-ui-bundle.js`；前端默认同源 `/v4.0/`（Vite 5174 亦代理到本服务）。

完整说明见 [gamebet_frontend/app/docs/CREDIT_PLATE.md](../gamebet_frontend/app/docs/CREDIT_PLATE.md)。

| 路径 | 说明 |
|------|------|
| `GET /api/a8/defaults` | 登录页预填 A8 账号（`integrations/a8/constants.js`） |
| `GET /api/a8/credit-plate-user` | 平博 v4 用的 `userName`（非本地 `admin`） |
| `POST /v4.0/*` | `v4_router.js` → `api.a8.to`（仅代理，无 mock） |

### 旧控制台 `/console/`（写死 A8 账号，对齐 bundle RMe）

账号密码写在 `gamebet_backend/integrations/a8/constants.js`（默认 `TJ01` / `a123456`）。
修改后执行 `npm run patch:ui` 并重启 `npm run web`。仅 legacy bundle 的「平博体育」依赖 patch 后的 v4 基址。

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
- TF：[platforms/tf/README.md](./platforms/tf/README.md)；A8 全链路说明见 [collectors/docs/A8_TF_LOGIC_PARITY.md](../gamebet_frontend/app/src/collectors/docs/A8_TF_LOGIC_PARITY.md)

## 新增平台

1. 在 `platforms/<id>/` 实现 Feed（`start/stop/on/getSnapshot`）
2. 在 `shared/platform_registry.js` 注册（`server.js` 自动加载）
3. 运行 `npm run gen:platform-pages` 生成分平台页面
4. 更新平台 README
