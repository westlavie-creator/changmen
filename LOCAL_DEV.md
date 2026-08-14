# 本机开发布局

GitHub 仓库 **仅含本目录内容**（`client/`、`server/`、`deploy/` 等）。

以下目录**不进 Git**，可放在 clone 同级或仓库内（已在 `.gitignore`）：

| 目录 | 用途 |
|------|------|
| `A8/` | A8 只读参考 |
| `pingtai_offical/` | 平台官网抓包参考 |
| `BAT/` | Windows 部署/开发批处理（`deploy-shanghai.bat` 等） |
| `sh/` | Ubuntu/Linux 本机脚本（对应 `BAT\`，见 [sh/README.md](./sh/README.md)） |

`BAT\` / `sh/` 会自动检测：仓库根即应用根（`package.json` 在根目录），或旧布局 `../changmen/`。

## 两种拓扑

| 模式 | 命令 | 本机起什么 | API 指哪 |
|------|------|------------|----------|
| **A · remote（日常改 UI）** | `./sh/dev-esport.sh remote` | 只 Vite + 扩展 | VPS（`VITE_API_PROXY`） |
| **B · 全栈（改 backend/合场）** | `./sh/dev-esport.sh` | backend + Vite | 本机 `:3456` |

**A 推荐默认：** Index / 合场 / PM-M 与线上一致；不起本机 backend，避免与 VPS **双 matcher**。  
生产有 **mTLS**：在 `client/web/.env.local` 配 `VITE_API_PROXY_TLS_CERT/KEY`（CN = 登录用户名）。写生产请谨慎。

**B 时：** 本机 backend **不要**连生产 RDS 跑 embedded matcher（用独立库，或明确停 VPS 写）。本机全栈若仍要真 Index，可用 `npm run sync:market-indexes`。

配置模板：`client/web/.env.example`；本机覆盖：`client/web/.env.local`（gitignore）。

Ubuntu 日常：

```bash
./sh/setup-dev-env.sh          # 首次
./sh/dev-esport.sh remote      # 改 UI / 适配器
# ./sh/dev-esport.sh           # 改 backend 时
```
