# apps/backend — 服务端（Node）

替代 A8 的 `api.a8.to` 形态：**接收客户端上报**、提供 `Client_*` / `API_*`、各平台 HTTP 代理、托管前端静态资源。WebSocket 由浏览器直连源站，不经本机网关。部署在服务器；开发时 Windows 默认 `localhost:3560`（Hyper-V 保留段导致 3456 不可用），其他平台默认 `3456`。

**生产部署 checklist**：[../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)

## 与 A8 的关系（必读）

**本目录 API 与存储不是 A8 官方后端的拷贝**，而是根据 A8 **浏览器前端** bundle 中的 `Client_*` / `API_SaveMatch` 等调用 **反推** 的实现。

- **Parity 基线**：A8 前端可证实行为（见 [../web/docs/README.md](../web/docs/README.md#项目共识)）。
- **changmen 推测**：`data/esport/*.json`、`match_merge.js`、`client_matchs` 预合并等。
- **changmen 扩展**：matcher、`platform_sync` 启动登录、`http-relay`、PB/OB 等 HTTP 代理等。

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
├── server.js                 # HTTP 入口 + esport-api
├── http_routes.js            # /api/ 路由
├── static_files.js           # 静态托管
├── proxy/                    # 各平台 HTTP 代理（无 WS 网关）
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

平台 canonical 源码在 [`../platform_adapter/`](../platform_adapter/README.md)（经 `core/shared/adapter_paths.js` 加载 backend 探针）。
```

## 启动

| 方式 | 命令 | 说明 |
|------|------|------|
| **Web 后端** | `npm run web` | `server.js`，端口 **3560**（Win）/ `3456` |

Windows 一键（在 `changmen/`）：`setup-dev-env.bat`（首次）→ `dev.bat` / `dev-web.bat`（等价）。Chrome 需加载 `gamebet_chromeplug`。

```bash
cd changmen/gamebet_backend
npm install
npm run web          # Web Host
```

- `http://localhost:3560/` — 新控制台（Vue，Windows `dev.bat` / `backend.bat`）
- `http://localhost:3560/console/` — A8 控制台（静态来自 `gamebet_frontend/console/`）

### 数据分工（新控制台 `/`）

| 数据 | 来源 |
|------|------|
| 比赛列表 | 浏览器 `API_SaveMatch` → matcher → `client_matches` |
| 赔率 | 浏览器 `API_SaveBet` + 前端 `oddsStore` |
| 平台凭证 | `platform_sync` 启动写入 `platforms.json` |

实时 WebSocket 由浏览器直连各平台源站或 A8 聚合机；本机仅提供 HTTP 代理。见 [proxy/README.md](./proxy/README.md)。

### HTTP API（节选）

| 路径 | 说明 |
|------|------|
| `POST /esport/*` | 全部 `Client_*` / `API_*`（见 `core/esport-api/router.js`） |
| `GET /api/platforms` | manifest 平台元数据 |
| `GET /api/games` / `/api/markets` | 游戏/盘口 catalog |
| `GET /api/proxy/status` | 代理状态（`wsRelay: false`） |

环境变量（HTTP 代理 / 运维，节选）：

| 变量 | 默认 | 说明 |
|------|------|------|
| `ENABLE_PB_NODE` | 关 | 设为 `1` 后 patch 禁用 bQ、Yn 改走 `/esport/pb/proxy` |
| `OB_LOGIN_URL` | 见 OB 文档 | 覆盖 OB 登录地址 |
| `PORT` | `3560`（Win）/ `3456` | HTTP 端口 |
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

账号密码写在 `core/integrations/a8/constants.js`（默认 `TJ01` / `a123456`）。
修改后执行 `npm run patch:ui` 并重启 `npm run web`。仅 legacy bundle 的「平博体育」依赖 patch 后的 v4 基址。

聚合游戏列表见 [GAMES.md](./GAMES.md)。选盘规则见 [MARKETS.md](./MARKETS.md)。

## API

| 路径 | 说明 |
|------|------|
| `GET /api/markets` | 聚合玩法 / 选盘规则摘要 |
| `GET /api/games` | 聚合游戏类型及各地平台 ID |
| `GET /api/proxy/status` | 代理状态（`wsRelay: false`） |
| `GET|POST /esport/pb/proxy?url=…` | PB HTTP 代理（`ENABLE_PB_NODE=1` 时控制台使用） |

## 平台文档

- OB：[../platform_adapter/ob/README.md](../platform_adapter/ob/README.md)、[STATUS_MAPPING.md](../platform_adapter/ob/backend/docs/STATUS_MAPPING.md)
- RAY：[../platform_adapter/ray/README.md](../platform_adapter/ray/README.md)
- TF：[../platform_adapter/tf/README.md](../platform_adapter/tf/README.md)；A8 全链路说明见 [A8_TF_LOGIC_PARITY.md](../gamebet_frontend/docs/platforms/A8_TF_LOGIC_PARITY.md)

## 新增平台

见 [../platform_adapter/README.md](../platform_adapter/README.md#新增平台)。
