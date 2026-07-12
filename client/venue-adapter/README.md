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
```

## 测试

```bat
cd changmen
npm run test:adapter --workspace=@changmen/backend
```
