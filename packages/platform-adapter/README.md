# @changmen/platform-adapter

各平台脚本统一目录（`packages/platform-adapter/`，按平台名小写分文件夹）。Vite 别名 `@platform` 指向本包。

## 迁移进度

| 阶段 | 状态 | 内容 |
|------|------|------|
| 0–1 | ✅ | `registry/`、`contract/`、Vite `@platform/*` alias |
| 2–3 | ✅ | 11 平台 `frontend/` + `backend/` |
| B | ✅ | 后端业务代码经 `requirePlatform` 引用，不再硬编码 `platforms/`、`relays/` |
| C | ✅ | `shared/` 采集基础设施（collectNotify、collectSession、socket/*） |
| D | ✅ | 删除 legacy `apps/backend/platforms/`、`relays/` 及前端 shim |
| E | ✅ | CI 挂 `changmen/npm test`（`.github/workflows/changmen-test.yml`） |
| C0 | ✅ | `registry/`、`backend/_paths.js` 迁 ESM；各平台 backend 仍 CJS（经 `_paths.cjs`） |
| C1 | ✅ | RAY `backend/` 全量 ESM |
| C2 | ✅ | OB `backend/` 全量 ESM（含 scripts） |
| C3 | ✅ | TF `backend/` 全量 ESM（含 scripts） |
| C4 | ✅ | IA `backend/` 全量 ESM（含 scripts） |
| C5 | ✅ | PB `backend/` 全量 ESM（含 scripts） |
| WS relay | ✅ 已退役 | 浏览器直连；本机仅 HTTP 代理 |

已接入平台（manifest 顺序）：OB、IM、RAY、TF、IA、SABA、XBet、PB、IMT、HG、Stake。

## 目录约定

```
packages/platform-adapter/
├── registry/          # manifest.json + adapters.ts + feeds.js + paths.js
├── contract/          # PlatformAdapter / PlatformProvider 契约
├── shared/            # 跨平台采集：collectNotify、collectSession、socket/*
├── _template/         # 新平台脚手架
└── {platform}/        # 小写：ob、ray、xbet …
    ├── index.ts       # 前端 adapter 入口（re-export frontend/*）
    ├── meta.ts
    ├── frontend/      # 浏览器采集 + 下注（TypeScript）
    └── backend/       # Node session + core（JavaScript）
        ├── session.js
        ├── core.js
        └── package.json   # 已迁 ESM 的平台含 `"type": "module"`
```

## 引用方式

### 前端

```ts
import { platformAdapters } from "@platform/registry";
import { obProvider } from "@platform/ob";
import type { VenueOrder } from "@platform/contract";
```

Vitest 已包含 `packages/platform-adapter/**/frontend/**/*.test.ts`（随 `apps/web` 的 `npm test` 运行）。

### 后端

**推荐**（host 已为 ESM）：

```js
import {
  initAdapterRegistry,
  requirePlatform,
} from "../core/shared/adapter_paths.js";

await initAdapterRegistry();

const { obGet } = requirePlatform("OB", "backend", "session.js");
```

路径解析：monorepo 默认为 `changmen/packages/platform-adapter/`（`@changmen/platform-adapter`）。瘦包可 `npm run sync:backend-bundle` 同步到 `apps/backend/platform_adapter/`；见 [PRODUCTION_DEPLOYMENT.md](../../PRODUCTION_DEPLOYMENT.md) §3.4。

底层 registry（ESM）：`adapterRequire("registry", "paths.js")` 的 `resolvePlatformFile`（须先 `await initAdapterRegistry()`）。

### 后端 Node 依赖

已迁 ESM 的平台（RAY、OB、TF、IA、PB）：`import { backendRequire } from "../../backend/_paths.js"`。

未迁平台：`{platform}/backend/_require.js` → `backend/_paths.cjs`，从 workspace `node_modules` 解析 npm 包（如 `mqtt`）。

### 前端 Vite 依赖

本包内 TS 若直接 import npm 包，需在 `apps/web/vite.config.ts` / `tsconfig.app.json` 配置 alias（如 `mqtt`、`socket.io-client`）。

## 测试

```bat
cd changmen
npm test                              # 后端 vitest + adapter 冒烟 + 前端 vitest

npm run test:adapter --workspace=@changmen/backend
npm run test:packaged-adapter --workspace=@changmen/backend

cd apps/web
npm run test:ob-provider              # OB provider 契约（读 packages/platform-adapter/ob/frontend）
```

## 新增平台

1. 复制 `_template/` → `{platform}/`
2. 在 `registry/manifest.json` 增加一条
3. 在 `registry/adapters.ts` 注册 adapter
4. 实现 `frontend/` 与 `backend/session.js`、`core.js`
5. 在本包 `package.json` 或 `apps/backend` 增加调试 npm script（可选，推荐 workspace 转发）
6. 跑 `changmen/npm test`
