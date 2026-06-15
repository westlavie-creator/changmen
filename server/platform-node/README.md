# @changmen/platform-node

与 `@changmen/platform-adapter` **并列**：各平台 Node session/core、探测 CLI。

`requirePlatform("OB", "node", "session.js")` → `server/platform-node/ob/session.js`。

依赖 `@changmen/platform-adapter` 读取各平台 `shared/`（如 RAY save_bets）。

## CLI

```bat
cd changmen/server/platform-node
npm run ob:view -- --match <id>
```

或从 backend：`npm run ob:view --workspace=@changmen/backend`。

## 瘦包同步

```bat
npm run sync:backend-bundle --workspace=@changmen/platform-node
# → server/backend/platform_node
```

与 `platform-adapter` 的 sync 成对使用（`server/backend/platform_adapter`）。