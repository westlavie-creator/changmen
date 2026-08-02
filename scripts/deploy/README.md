# scripts/deploy/

本机 → 香港 VPS 的 **Node/BAT 部署入口**（整仓 tarball + 本地 `dist`）。VPS 上增量步骤见 [`deploy/scripts/`](../../deploy/scripts/)（bash）。

## 脚本

| 文件 | 用途 |
|------|------|
| **`deploy202.bat`** | 紧急：本机 `app:build` + 打包 dist → **47.57.10.202**（日常用 GHA） |
| `deploy-hk-remaining.mjs` | 通用 HK 部署（可传 host；166 测试用此脚本） |
| `pack-git-repo.mjs` | `git archive` 打包 HEAD（本机部署与 GHA 共用，40MB 熔断） |
| `deploy-hk-fast.mjs` | 仅变更源文件 + GHA dist（小 tarball） |
| `emergency-deploy-hk.mjs` | 紧急：用 GHA dist artifact，跳过本机 build |

生产 **202** 日常：`push master` → [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)。env 同步见 [`scripts/sync/`](../sync/README.md)。

## 常用命令

```bat
REM 202 生产：git push origin master（GHA）；本机仅紧急
scripts\deploy\deploy202.bat

REM 166 测试机（需已有 dist 或加 --build）
node scripts/deploy/deploy-hk-remaining.mjs 47.82.100.166 --build
```

SSH 密钥默认：`%USERPROFILE%\.ssh\id_ed25519_gamebet`。远程目录：`/root/changmen`。

仓级脚本索引：[scripts/README.md](../README.md) · 生产说明：[PRODUCTION_DEPLOYMENT.md](../../PRODUCTION_DEPLOYMENT.md)
