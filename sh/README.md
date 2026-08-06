# Ubuntu / Linux 本机脚本

对应 Windows 的 `BAT\`。在**仓库根目录**执行，例如：

```bash
./sh/dev.sh
# 或
bash sh/dev-esport.sh
```

首次请确保已装 Node（nvm）并能运行 `npm`。新开终端一般会自动加载 nvm。

## 日常开发

| 脚本 | 作用 |
|------|------|
| **`dev-esport.sh`** | 电竞：后端 `:3456` + Vite `:5174`（Linux 默认） |
| `dev-esport.sh parity` | 同上 + `matcher:ui`（matchMerge 已内嵌 backend） |
| **`dev-football.sh`** | 足球：同级仓库 `../changmen-football` → `:3457` |
| **`dev.sh`** | 兼容入口 → 等同 `dev-esport.sh`；`dev.sh football` → 足球 |
| **`backend.sh`** | 仅电竞后端 |
| **`football-backend.sh`** | 仅足球进程 |
| **`setup-dev-env.sh`** | 首次：从 `.env.example` 复制 `server/backend/.env` |

默认**后台启动**（写日志到 `/tmp/changmen-dev/`），并尝试用浏览器打开 Vite 页。  
从 Cursor 终端运行时不要依赖 `gnome-terminal`（常因无法打开显示而失败）。需要GUI窗口时：`CHANGMEN_USE_TERM=1 ./sh/dev.sh`。

停止服务：`./sh/stop-dev.sh`

## 部署

| 脚本 | 作用 |
|------|------|
| **`deploy-hongkong.sh`** | 香港紧急备用（日常走 GHA push `master`） |
| `deploy-server.sh` | → `deploy-hongkong.sh`（遗留别名） |
| **`setup-caddy.sh`** | 上传 `deploy/Caddyfile` 并应用 |
| **`push-git.sh`** | 本机 git commit + push |
| **`sync-telegram-env.sh`** | 同步 Telegram 配置到 VPS |

复制 `deploy-server.local.sh.example` → `deploy-server.local.sh` 可覆盖 `DEPLOY_HOST`、`SSH_IDENTITY` 等。  
核心逻辑在 `deploy-server-core.sh`。

## 端口对照

| | Windows (`BAT`) | Ubuntu (`sh`) |
|--|-----------------|---------------|
| 后端 | 3700 | **3456** |
| Vite | 5274 | **5174** |
| 足球 | 3457 | 3457 |

（与 `server.js` / `vite.config.ts` 的 platform 默认一致。）
