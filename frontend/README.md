# Frontend（A8 复刻）

浏览器侧：参考 bundle、patch 后的控制台、Chrome 扩展。与 A8 原版一致，**采集与 `fo()` 均在浏览器内完成**。

## 目录

| 路径 | 说明 |
|------|------|
| `app/` | **新控制台**（Vue3 源码，逐步替代 bundle）→ `/app/` |
| `vendor/ui-bundle/` | A8 参考 bundle（只读，勿改） |
| `console/` | `npm run patch:ui` 输出，`/console/` 加载 |
| `extension/` | Chrome 插件（原 `plug/`，跨域请求 `Yn`） |
| `patch-ui-bundle.js` | 域名 → 本地 backend、WS relay、可选 PB Node 模式 |
| `MIGRATION.md` | 脱离 bundle 分阶段对照表 |
| `VENDOR_UI_REFERENCE.md` | bundle 与 patch 对照说明 |

## 常用命令

在仓库根目录：

```bash
npm run patch:ui    # 生成 frontend/console/index.js
npm run app:install # 首次：安装 frontend/app 依赖
npm run app:build   # 构建新控制台 → backend 托管 /app/
npm run app:dev     # 开发：http://localhost:5174/app/
npm run web         # 启动 backend
```

- 新控制台：`http://localhost:3456/app/`（`npm run app:build` 后）
- 旧控制台：`http://localhost:3456/console/`（需加载 `extension/`）

详见 [MIGRATION.md](./MIGRATION.md)。

## 与 backend 的关系

- 前端 HTTP 调 `/esport/*`、`/common/*` → **backend** `esport-api`
- WS 调 `/esport/ws/*` → **backend** `proxy`（浏览器直连平台的隧道，非 Node Feed）
- 样式 stub `/esport2/assets/*` 由 **backend** `public/esport2/` 提供
