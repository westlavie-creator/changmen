# Windows 批处理脚本

`.bat` 必须使用 **CRLF** 换行；若只有 LF，`cmd` 会误解析（例如报 `'elayedExpansion'` 或 `'t' 不是内部或外部命令`）。仓库根目录 `.gitattributes` 已强制 `*.bat` 为 CRLF。

在 `changmen/` 目录下执行：

```bat
cd changmen
BAT\dev.bat
BAT\setup-dev-env.bat
```

说明见 [../scripts/README.md](../scripts/README.md)。

| 脚本 | 作用 |
|------|------|
| `dev.bat` | 后端 + Vite（推荐日常开发） |
| `dev-web.bat` / `dev_web.bat` | 同 `dev.bat` |
| `parity-dev.bat` | 后端 + Vite + matcher 循环 |
| `backend.bat` | 仅后端 |
| `dev-vite.bat` | 仅 Vite |
| `matcher-loop.bat` | matcher 合并循环 |
| `matcher-ui.bat` | matcher 人工面板（:4567） |
| `setup-dev-env.bat` | 首次复制 `apps/backend/.env` |
| `pack-chromeplug.bat` | 打包 Chrome 插件 zip |
| `push-git.bat` | git commit + push |
| `deploy-server.bat` | 部署 VPS（可选 `deploy-server.local.bat`） |
| `ecosystem.config.cjs` | PM2 进程清单（见文件头注释） |

部署本地配置：复制 `deploy-server.local.bat.example` 为同目录下的 `deploy-server.local.bat`。
