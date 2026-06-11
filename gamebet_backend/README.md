# gamebet_backend — 服务端（Node）

替代 A8 的 `api.a8.to` 形态：**接收客户端上报**、提供 `Client_*` / `API_*`、WS relay（供客户端连平台）、托管前端静态资源。部署在服务器；开发时用 `localhost:3456` 联调。

**生产部署 checklist**：[../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)

## 与 A8 的关系（必读）

**本目录 API 与存储不是 A8 官方后端的拷贝**，而是根据 A8 **浏览器前端** bundle 中的 `Client_*` / `API_SaveMatch` 等调用 **反推** 的实现。

- **Parity 基线**：A8 前端可证实行为（见 [../gamebet_frontend/docs/README.md](../gamebet_frontend/docs/README.md#项目共识)）。
- **changmen 推测**：`data/esport/*.json`、`match_merge.js`、`client_matchs` 预合并等。
- **changmen 扩展**：matcher、`platform_sync` 启动登录、WS relay、`http-relay` 等。

> 上级说明：[../readme.md](../readme.md#项目共识)

## 仓库布局

```text
changmen/                     # 本项目根（npm / .bat 均在此目录执行）
├── gamebet_frontend/         # A8 复刻（浏览器侧）
├── gamebet_chromeplug/       # Chrome 插件（Gamebet 协议）
├── gamebet_backend/          # 本目录
└── package.json              # 根目录 npm run web
```

## 目录结构（gamebet_backend 内）

```text
gamebet_backend/
├── host/
│   └── web/                  # Web Host（node host/web/index.js）
│       ├── index.js          # HTTP + esport-api；进程内 WS relay
│       └── proxy/            # OB/RAY/TF/IA HTTP/WS relay
├── core/                     # Business Core
│   ├── esport-api/           # 路由/store/初赔/platform_sync
│   ├── account/              # 账号服务（场馆账号，非登录用户）
│   ├── db/                   # Supabase 客户端 + 内存缓存
│   ├── shared/               # adapter_paths / catalog / odds_format 等
│   └── integrations/         # A8 集成（constants / v4）
├── scripts/                  # 运维 / 调试脚本
├── supabase/                 # DB 迁移文件
├── public/                   # A8 esport2 静态资源
├── restart.js
└── package.json

平台 canonical 源码在 [`../platform_adapter/`](../platform_adapter/README.md)（经 `core/shared/adapter_paths.js` 加载 relay/探针）。
```

## 启动

| 方式 | 命令 | 说明 |
|------|------|------|
| **Web 后端** | `npm run web` | `host/web/index.js`，端口 3456 |

Windows 一键（在 `changmen/`）：`setup-dev-env.bat`（首次）→ `dev.bat` / `dev-web.bat`（等价）。Chrome 需加载 `gamebet_chromeplug`。

```bash
cd changmen/gamebet_backend
npm install
npm run web          # Web Host
```

- `http://localhost:3456/` — 新控制台（Vue）
- `http://localhost:3456/console/` — A8 控制台（静态来自 `gamebet_frontend/console/`）

### 数据分工（新控制台 `/`）

| 数据 | 来源 |
|------|------|
| 比赛列表 | 浏览器 `API_SaveMatch` → matcher → `client_matches` |
| 赔率 | 浏览器 `API_SaveBet` + 前端 `oddsStore` |
| 平台凭证 | `platform_sync` 启动写入 `platforms.json` |

**本机 WS 网关默认关闭**（`ENABLE_ESPORT_PROXY=1` 才启动 `/esport/ws/*`）；主前端直连各平台。见 [host/web/proxy/README.md](./host/web/proxy/README.md)。

### HTTP API（节选）

| 路径 | 说明 |
|------|------|
| `POST /esport/*` | 全部 `Client_*` / `API_*`（见 `core/esport-api/router.js`） |
| `GET /api/platforms` | manifest 平台元数据 |
| `GET /api/games` / `/api/markets` | 游戏/盘口 catalog |
| `GET /api/proxy/status` | WS relay 状态 |

环境变量（relay / 运维，节选）：

| 变量 | 默认 | 说明 |
|------|------|------|
| `ENABLE_ESPORT_PROXY` | 关 | 设为 `1` 开启本机 `/esport/ws/{OB,RAY,TF,IA}` 网关（遗留调试） |
| `ENABLE_OB_MQTT_RELAY` | 开* | 网关开启时生效；设为 `0` 关闭 OB 路径 |
| `ENABLE_RAY` | 开* | 网关开启时生效；设为 `0` 关闭 RAY 路径 |
| `ENABLE_TF` | 关 | 网关开启时；设为 `1` 开启 TF 路径 |
| `ENABLE_IA_RELAY` | 开* | 网关开启时生效；设为 `0` 关闭 IA 路径 |
| `ENABLE_PB_NODE` | 关 | 设为 `1` 后 patch 禁用 bQ、Yn 改走 `/esport/pb/proxy` |
| `OB_LOGIN_URL` | 见 OB 文档 | 覆盖 OB 登录地址 |
| `PORT` | `3456` | HTTP 端口 |
| `A8_AUTH` | 开启 | 设为 `0` 关闭部分 A8 集成默认；**登录**仍走 Supabase（`.env` 中 `SUPABASE_*`） |
| `A8_V4_URL` | `https://api.a8.to/v4.0` | v4 上游（Node 透明代理，无 mock） |

### 平博信用盘 v4（新控制台 `/`）

**第一步** `POST /v4.0/user/account/login` 已在本地联调通过（2026-05-26）。
新控制台不依赖 `patch-ui-bundle.js`；前端默认同源 `/v4.0/`（Vite 5174 亦代理到本服务）。

完整说明见 [gamebet_frontend/docs/CREDIT_PLATE.md](../gamebet_frontend/docs/CREDIT_PLATE.md)。

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
| `GET /api/proxy/status` | WS relay 状态 |
| `GET|POST /esport/pb/proxy?url=…` | PB HTTP 代理（`ENABLE_PB_NODE=1` 时控制台使用） |

## 平台文档

- OB：[../platform_adapter/ob/README.md](../platform_adapter/ob/README.md)、[STATUS_MAPPING.md](../platform_adapter/ob/backend/docs/STATUS_MAPPING.md)
- RAY：[../platform_adapter/ray/README.md](../platform_adapter/ray/README.md)
- TF：[../platform_adapter/tf/README.md](../platform_adapter/tf/README.md)；A8 全链路说明见 [A8_TF_LOGIC_PARITY.md](../gamebet_frontend/docs/platforms/A8_TF_LOGIC_PARITY.md)

## 新增平台

见 [../platform_adapter/README.md](../platform_adapter/README.md#新增平台)。
