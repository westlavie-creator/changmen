# 启动脚本

在 `changmen/` 目录下执行。

| 脚本 | 作用 |
|------|------|
| **`dev.bat`** | **推荐**：同时打开 Backend 3456 + Vite 5174（两个窗口；`SKIP_APP_BUILD=1` 跳过每次 build `/app/`） |
| **`parity-dev.bat`** | 模式 P（`ESPORT_BRIDGE=0`、`ENABLE_OB=0`）+ 双窗口 |
| **`backend.bat`** | 仅后端（写 `matches.json` 需默认 `ESPORT_BRIDGE=1`）；会跑 `app:build` 除非 `SKIP_APP_BUILD=1` |

旧名称仍可用（一行转调）：`start-dev.bat` → `dev.bat`，`start-web.bat` → **`backend.bat`（只有后端，没有 Vite）**。

仅前端热更新：先 `backend.bat`，再在仓库根执行 `npm run app:dev`。

## 环境变量（`backend.bat` 已内置）

| 变量 | 默认 | 说明 |
|------|------|------|
| `ESPORT_BRIDGE` | `1` | Node Feed 写入 `data/esport/matches.json` |
| `A8_AUTH` | `0` | 本地 `admin` 登录；真 A8 主站设 `1` |
| `SKIP_APP_BUILD` | 未设 | 设 `1` 跳过 `/app/` 构建 |
| `PATCH_CONSOLE` | 未设 | 设 `1` 额外 patch 旧 `/console/` bundle |

## URL

- 开发：`http://localhost:5174/app/`（Vite）
- 构建后：`http://localhost:3456/app/`
- Feed 调试：`http://localhost:3456/feed/`

架构说明见 [readme.md](../readme.md)。
