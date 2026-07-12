# 路径登记表（I1）

> **目的**：monorepo 内关键目录只在本表 + `@changmen/storage/paths.js` 的 `CHANGMEN_LAYOUT` 登记一次。  
> **阶段 19 后**不大规模物理搬家；若必须挪目录，先改 `CHANGMEN_LAYOUT`，再按本表扫消费方。

相关：[ARCHITECTURE.md](./ARCHITECTURE.md) · [TEAM_BOUNDARIES.md](./TEAM_BOUNDARIES.md) · [SPORTS_PRODUCT_LINES.md](./SPORTS_PRODUCT_LINES.md)

---

## 1. Canonical 定义（改路径只改这里）

| 符号 | 定义位置 | 说明 |
|------|----------|------|
| `CHANGMEN_ROOT` | `server/storage/paths.js` | monorepo 根（向上查找 `server/backend`） |
| `CHANGMEN_LAYOUT` | 同上 | 各目录相对根的 **POSIX** 段 |
| `VENUE_ADAPTER_ROOT` | 同上 | `join(CHANGMEN_ROOT, layout.venueAdapter)` |
| `CLIENT_WEB_ROOT` | 同上 | `client/web` 绝对路径 |
| `PLATFORM_PROBES_ROOT` | 同上 | `devtools/platform-probes` |
| `BACKEND_ROOT` | 同上 | 可被 `CHANGMEN_BACKEND_ROOT` 覆盖 |

环境变量覆盖（瘦包 / 测试）：

| 变量 | 覆盖对象 |
|------|----------|
| `CHANGMEN_ADAPTER_ROOT` | venue-adapter 根（须含 `registry/manifest.json`） |
| `CHANGMEN_PLATFORM_PROBES_ROOT` | Node 探针根 |
| `CHANGMEN_BACKEND_ROOT` | backend 根 |

---

## 2. `CHANGMEN_LAYOUT` 一览

| 键 | 默认相对路径 | 用途 |
|----|--------------|------|
| `venueAdapter` | `client/venue-adapter` | 浏览器采集/下注 canonical |
| `clientWeb` | `client/web` | 电竞 Vue 控制台 |
| `clientChromeExtension` | `client/chrome-extension` | MV3 插件 |
| `platformProbes` | `devtools/platform-probes` | Node 探针 CLI |
| `packages` | `packages` | 跨端 TS 包 |
| `serverBackend` | `server/backend` | HTTP API |
| `serverMatcher` | `server/matcher` | matchMerge UI + 循环 |
| `serverDb` | `server/db` | RDS 入口 |
| `serverCollectors` | `server/collectors` | VPS daemon |
| `lines` | `lines` | 产品线 manifest |
| `baseball` | `baseball` | 棒球代码目录 |

产品线组件路径见 `lines/{code}/line.json` 的 `components`（与 layout 一致，不重复登记逻辑）。

---

## 3. 已接入 canonical 的消费方

| 消费方 | 用法 |
|--------|------|
| `client/venue-adapter/loader/adapter_paths.mjs` | `getAdapterRoot()` 优先 `VENUE_ADAPTER_ROOT` |
| `client/venue-adapter/registry/paths.js` | 开发态 `ADAPTER_ROOT`；探针 `PLATFORM_PROBES_ROOT` |
| `client/web/vite.config.ts` | `@changmen/venue-adapter` alias、`venueChunkName` |
| `scripts/check-team-boundaries.mjs` | 发现各平台浏览器根目录 |
| `@changmen/venue-adapter/package.json` | `exports["./*"]` 浏览器子路径（I2a） |
| `client/web/package.json` | workspace 依赖 `@changmen/venue-adapter` |

---

## 4. web 消费 venue-adapter（I2b 完成）

`client/web` 源码统一 `import` **`@changmen/venue-adapter/*`**（不再使用 `@venue` 别名）。

| 文件 | 写法 |
|------|------|
| `client/web/tsconfig.app.json` | `@changmen/venue-adapter/*` → `client/venue-adapter/*` |
| `client/web/vite.config.ts` | `@changmen/venue-adapter` → `VENUE_ADAPTER_ROOT` |
| 根 `package.json` workspaces | `"client/venue-adapter"` |
| `lines/esport/line.json` | `components.venueAdapter` |

`client/web` 消费 venue-adapter 时优先 **平台/域 barrel**（`polymarket`、`shared`、`adaptation`、`contract`、`registry`）；深路径清单见 `list:web-imports`；`--check` 校验仅允许 barrel + 文档化 mock 深路径。

`package.json` `exports` 由 `sync-package-exports.mjs` 扫描 web + 包内 import 生成（44 项）；`npm run check:exports --workspace=@changmen/venue-adapter` 防漂移。

`client/venue-adapter` **包内**统一 `@changmen/venue-adapter/*`（I3d 已移除 `@venue` 别名）。

---

## 5. 文档 / 注释中的路径

以下仅作说明，**不参与**构建解析；挪目录后批量替换即可：

- `docs/*`、`readme.md`、`server/**/README.md` 中的 `client/venue-adapter` 文字
- collector `parse_*.js` 头部注释「与 client/venue-adapter/… 对齐」

---

## 6. 产品线 `sharedPackages`（manifest）

`lines/*/line.json` 声明该线依赖的 workspace 包（不复制源码）：

| 线 | `sharedPackages` |
|----|------------------|
| esport | `@changmen/shared`、`@changmen/api-contract`、`@changmen/client-core`、`@changmen/arb-core`、`@changmen/venue-adapter` |
| baseball | `@changmen/client-core`、`@changmen/arb-core` |

`capabilities` 仍表示**功能**（如 `arbitrage`），与 npm 包名分开。

---

## 7. 校验

```bat
node server/storage/paths_smoke.test.mjs
npm run check:boundaries
```

---

## 8. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-13 | I3e：`exports` 白名单、`check:web-imports`、删 `shared/platform` shim |
| 2026-07-13 | I3d：venue-adapter 包内 `@venue/*` → `@changmen/venue-adapter/*`；web 移除 `@venue` alias |
| 2026-07-13 | I3c：删 web `client-core` shim，直连 `@changmen/client-core/*` |
| 2026-07-13 | I2b：web `@venue/*` → `@changmen/venue-adapter/*` |
| 2026-07-13 | I2a：`@changmen/venue-adapter` exports、web 去 tsconfig include |
| 2026-07-13 | I1：`CHANGMEN_LAYOUT`、PATH_REGISTRY、vite/boundaries/loader 接入 |
