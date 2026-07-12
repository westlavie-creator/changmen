# scripts/deploy/

本机 → 香港 VPS 的 **Node/BAT 部署入口**（整仓 tarball + 本地 `dist`）。VPS 上增量步骤见 [`deploy/scripts/`](../../deploy/scripts/)（bash）。

## 脚本

| 文件 | 用途 |
|------|------|
| **`deploy202.bat`** | 本机 `app:build` + 打包 dist → 部署 **47.57.10.202** |
| `deploy-hk-remaining.mjs` | 通用 HK 部署（默认 214 + 57；可传 host 列表） |
| `deploy-hk-fast.mjs` | 仅变更源文件 + GHA dist（小 tarball） |
| `emergency-deploy-hk.mjs` | 紧急：用 GHA dist artifact，跳过本机 build |
| `sync-predictfun-key-remote.mjs` | 从本机 `.env` 同步 `PREDICT_FUN_API_KEY` 到 VPS |

## 常用命令

```bat
REM 202 生产（推荐）
scripts\deploy\deploy202.bat

REM 166 测试机（需已有 dist 或加 --build）
node scripts/deploy/deploy-hk-remaining.mjs 47.82.100.166 --build

REM 仅同步 Predict.fun key + probe upstream
node scripts/deploy/sync-predictfun-key-remote.mjs 47.82.100.166
```

SSH 密钥默认：`%USERPROFILE%\.ssh\id_ed25519_gamebet`。远程目录：`/root/changmen`。

仓级脚本索引：[scripts/README.md](../README.md) · 生产说明：[PRODUCTION_DEPLOYMENT.md](../../PRODUCTION_DEPLOYMENT.md)
