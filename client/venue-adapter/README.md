# @changmen/venue-adapter

各平台**浏览器**适配器：`{platform}/`、registry、loader。

可选探针 CLI 在 [`@changmen/platform-probes`](../../devtools/platform-probes/README.md)（日常可不使用）。

历史路径 `server/platform-node`、`platform-adapter/`、`platform-adapter/{platform}/backend/` 已删除；Node 探针与会话模块仅在 `devtools/platform-probes/`（经 `requirePlatform(id, "node", …)` 加载）。

## 目录

```
client/venue-adapter/
├── registry/ manifest.json、adapters.ts
├── loader/   adapter_paths（requirePlatform、reqS）
├── shared/   跨平台采集工具（collectSession、socket/…）
└── {platform}/          collect.ts、bet.ts 等（+ 可选 shared/、scripts/）
```

前端通过 workspace 包名 **`@changmen/venue-adapter`** 引用（见 `client/web/vite.config.ts` alias，根路径来自 `CHANGMEN_LAYOUT`）。

浏览器子路径经 `@changmen/venue-adapter` 的 `package.json` `exports`（`"./*": "./*"`）解析；`client/web` 为 workspace 消费者，**不再**把本目录列入 `tsconfig.app.json` `include`。

核对 web 使用的子路径：

```bat
npm run list:web-imports --workspace=@changmen/venue-adapter
npm run check:web-imports --workspace=@changmen/venue-adapter
```

`package.json` `exports` 由扫描生成（勿手改）：

```bat
npm run sync:exports --workspace=@changmen/venue-adapter
npm run check:exports --workspace=@changmen/venue-adapter
```

**web 深路径（仅 vitest mock）**：`polymarket/orderSettlement`、`polymarket/settlementJob`、`polymarket/orders`、`shared/rejectWait`。

**web 运行时单点深路径**：`registry/adapters`（`runtime/venueAdapters.ts`，避免 `registry` barrel 拉起全平台图）。

`PLATFORMS` 常量从 `@changmen/venue-adapter/shared` 导入；`ALL_PLATFORMS` / manifest 元数据从 `@changmen/venue-adapter/registry`。

## 测试

```bat
cd changmen
npm run test:adapter --workspace=@changmen/backend
```
