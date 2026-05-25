# 启动脚本说明（阶段 7）

| 脚本 | 作用 |
|------|------|
| `start-dev.bat` | **推荐**：后端 3456 + Vite 5174 双窗口 |
| `start-web.bat` | 仅后端；`preweb` 自动 `app:build` |
| `start-app-dev.bat` | 仅 Vite dev（需后端已启动） |
| `start-console.bat` | 兼容别名 → `start-web.bat` |

## 环境变量（后端 preweb）

| 变量 | 说明 |
|------|------|
| `SKIP_APP_BUILD=1` | 跳过 Vue 构建（纯 API 调试） |
| `PATCH_CONSOLE=1` | 额外 patch 旧 bundle 到 `/console/` |

## URL

- 新控制台：`http://localhost:5174/app/`（dev）或 `http://localhost:3456/app/`（生产构建）
- Feed 调试：`http://localhost:3456/feed/`
- 旧 bundle：`http://localhost:3456/console/`

详见根目录 [readme.md](../readme.md) 与 [frontend/MIGRATION.md](../frontend/MIGRATION.md)。
