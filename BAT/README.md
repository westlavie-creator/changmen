# Windows 批处理

在 **`changmen/`** 下执行。`.bat` 须为 CRLF（见根目录 `.gitattributes`）。

| 脚本 | 作用 |
|------|------|
| **`dev.bat`** | 后端 `:3560` + Vite `:5174`（日常开发） |
| `dev.bat parity` | 同上，并自动起 `matcher:loop` |
| **`backend.bat`** | 仅后端（调 API / 不启 Vite 时） |
| **`setup-dev-env.bat`** | 首次：复制 `server/backend/.env` |
| **`deploy-server.bat`** | 部署 VPS（可选 `deploy-server.local.bat`） |
| **`push-git.bat`** | 本机 `git add` + commit + push（部署前常用） |

其余用 npm（在 `changmen/` 下）：

| 命令 | 作用 |
|------|------|
| `npm run matcher:loop` | 合并 client_matches |
| `npm run matcher:ui` | Matcher 面板 `:4567` |
| `npm run chromeplug:pack` | 打包 Chrome 插件 zip |
| `npm run app:dev` | 仅 Vite |
| `npm run web` | 仅后端（同 backend.bat） |

PM2：`changmen/ecosystem.config.cjs`。详见 [../scripts/README.md](../scripts/README.md)。

**本地清理**：若仍存在空目录 `changmen/apps/`（`backend`、`web` 子目录被进程占用），请先关闭所有 dev/backend 窗口与 Cursor 终端，再 `rmdir /s /q apps`。
