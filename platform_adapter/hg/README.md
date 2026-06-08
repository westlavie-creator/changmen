# 平台脚本目录（待迁入）

阶段 2 起将迁入：

- `frontend/` — 自 `gamebet_frontend/app/src/platforms/hg/`
- `backend/` — 自 `gamebet_backend/platforms/hg/`
- `backend/relay.js` — 若有 relay（见 manifest `backendRelay`）

当前实现仍在 legacy 路径；`registry/paths.js` 会优先读本目录。
