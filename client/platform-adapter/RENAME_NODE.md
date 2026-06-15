# 平台 Node 库目录迁移记录

| 阶段 | 路径 |
|------|------|
| 原 | `{platform}/backend/` |
| 中 | `platform-adapter/node/{platform}/` |
| **现** | **`packages/platform-node/{platform}/`**（与 `@changmen/platform-adapter` 并列） |

`requirePlatform(id, "node", …)` 不变，由 `registry/paths.js` 的 `getPlatformNodeRoot()` 解析。

瘦包：`npm run sync:platform-adapter` 同步 `platform_adapter` + `platform_node` 两个目录。
