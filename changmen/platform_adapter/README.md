# platform_adapter

各平台脚本统一目录（按平台名小写分文件夹）。

## 迁移进度

| 阶段 | 状态 | 内容 |
|------|------|------|
| 0–1 | ✅ | `registry/`、`contract/`、Vite `@platform/*` alias |
| 2–3 | ✅ | 11 平台 `frontend/` + `backend/`（含 OB/RAY/TF/IA relay） |
| Electron | ✅ | `electron-builder.yml` 打入 asar；`core/shared/adapter_paths.js` 双布局解析 |
| B | ✅ | 后端业务代码经 `requirePlatform` / `requirePlatformRelay` 引用，不再硬编码 `platforms/`、`relays/` |
| C | ✅ | `shared/` 采集基础设施（collectNotify、collectSession、socket/*） |
| D | 待做 | 删除 `gamebet_backend/platforms/`、`relays/` 及前端 legacy shim |
| E | 待做 | CI 挂 `changmen/npm test` |

已接入平台（manifest 顺序）：OB、IM、RAY、TF、IA、SABA、XBet、PB、IMT、HG、Stake。

## 目录约定

```
platform_adapter/
├── registry/          # manifest.json + adapters.ts + feeds.js + paths.js
├── contract/          # PlatformAdapter / PlatformProvider 契约
├── shared/            # 跨平台采集：collectNotify、collectSession、socket/*
├── _template/         # 新平台脚手架
└── {platform}/        # 小写：ob、ray、xbet …
    ├── index.ts       # 前端 adapter 入口（re-export frontend/*）
    ├── meta.ts
    ├── frontend/      # 浏览器采集 + 下注（TypeScript）
    └── backend/       # Node Feed + session + core + relay（JavaScript）
        ├── feed.js
        ├── session.js
        ├── core.js
        ├── relay.js   # 仅 OB/RAY/TF/IA
        └── _require.js
```

## 引用方式

### 前端

```ts
import { platformAdapters } from "@platform/registry";
import { obProvider } from "@platform/ob";
```

`gamebet_frontend/app/src/platforms/shared/` 仍保留 **shim**（re-export `@platform/shared/*`），阶段 D 删除。

Vitest 已包含 `platform_adapter/**/frontend/**/*.test.ts`（随 `gamebet_frontend/app` 的 `npm test` 运行）。

### 后端

**推荐**（阶段 B 后统一用法）：

```js
const { requirePlatform, requirePlatformFeed, requirePlatformRelay } = require("../core/shared/adapter_paths.js");

const { obGet } = requirePlatform("OB", "backend", "session.js");
const { ObFeed } = requirePlatformFeed("OB");
const { ObRelayCore } = requirePlatformRelay("OB");
```

路径解析：

- 开发：`changmen/platform_adapter/`（与 `gamebet_backend` 同级）
- Electron asar：`gamebet_backend/platform_adapter/`（builder 从 `../platform_adapter` 复制，排除 frontend 与 `*.ts`）

底层 registry：`adapterRequire("registry", "paths.js")` 的 `resolvePlatformFile` / `resolveBackendFeedModule`。

Legacy shim（阶段 D 删除）：`gamebet_backend/platforms/*`、`relays/*` 一行转发到 `platform_adapter`。

### 后端 Node 依赖

`platform_adapter/*/backend/_require.js` → `platform_adapter/backend/_paths.js`，从 `gamebet_backend/node_modules` 解析 npm 包（如 `mqtt`）。

### 前端 Vite 依赖

`platform_adapter` 内 TS 若直接 import npm 包，需在 `vite.config.ts` / `tsconfig.app.json` 配置 alias（如 `mqtt`、`socket.io-client`）。

## 测试

```bat
cd changmen
npm test                              # 后端 vitest + adapter 冒烟 + 前端 vitest

cd gamebet_backend
npm run test:adapter                  # ob-feed-mode + packaged layout 模拟
npm run test:packaged-adapter         # 仅 layout 冒烟

cd gamebet_frontend/app
npm run test:ob-provider              # OB provider 契约（读 platform_adapter/ob/frontend）
```

Electron 打包后验证：

```bat
cd gamebet_backend
npm run electron:portable             # → dist_electron/GameBet-portable.zip
node scripts/verify-electron-unpacked.js
```

## 新增平台

1. 复制 `_template/` → `{platform}/`
2. 在 `registry/manifest.json` 增加一条（含 `backendFeed`、`envEnable` 等）
3. 在 `registry/adapters.ts` 注册 adapter
4. 实现 `frontend/`、`backend/feed.js`；需 relay 则加 `backend/relay.js` 并在 manifest 填 `backendRelay`
5. 在 `gamebet_backend/package.json` 增加调试 npm script（可选）
6. 跑 `changmen/npm test`
