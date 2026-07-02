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

前端 Vite 别名：`@venue` → 本目录（见 `client/web/vite.config.ts`）。

## 测试

```bat
cd changmen
npm run test:adapter --workspace=@changmen/backend
```
