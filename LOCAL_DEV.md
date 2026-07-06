# 本机开发布局

GitHub 仓库 **仅含本目录内容**（`client/`、`server/`、`deploy/` 等）。

以下目录**不进 Git**，可放在 clone 同级或仓库内（已在 `.gitignore`）：

| 目录 | 用途 |
|------|------|
| `A8/` | A8 只读参考 |
| `pingtai_offical/` | 平台官网抓包参考 |
| `BAT/` | Windows 部署/开发批处理（`deploy-shanghai.bat` 等） |

`BAT\` 脚本会自动检测：仓库根即应用根（`package.json` 在根目录），或旧布局 `../changmen/`。
