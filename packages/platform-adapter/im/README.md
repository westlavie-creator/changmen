# 平台脚本目录（待迁入）

阶段 2 起将迁入：

- `frontend/`、`backend/` — canonical 源码在本包（自 legacy `apps/web/src/platforms/im/`、`apps/backend/platforms/im/` 迁入）
- `backend/relay.js` — 若有 relay（见 manifest `backendRelay`）

当前实现仍在 legacy 路径；`registry/paths.js` 会优先读本目录。
