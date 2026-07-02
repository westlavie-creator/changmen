# @changmen/platform-probes

**可选**探针包：各平台直连场馆的 Node session/core、调试 CLI。**不是** changmen 主链路（生产采集在 `client/venue-adapter/{platform}/`）。

位于 `changmen/devtools/platform-probes/`（开发工具，非 `server/` 运行时）。

各平台探针专用模块在 `devtools/platform-probes/{platform}/shared/`（与浏览器 `venue-adapter/{platform}/shared/` 分离）。OB 锁盘观察 fixture 工具：`client/venue-adapter/ob/shared/lock_decision.ts` + `npm run ob:lock-observe`。

`requirePlatform("OB", "node", "session.js")` → `devtools/platform-probes/ob/session.js`。

## 何时用

- 需要直连 OB/RAY 等抓 `game/view`、MQTT 样本
- 运维脚本、catalog 探针、`ob:hybrid` 对照

日常开发 **不必** 安装或启动本包。

## CLI

```bat
cd changmen/devtools/platform-probes
npm run ob:view -- --match <id>
```

或从 backend：`npm run ob:view --workspace=@changmen/backend`。

## 瘦包同步

```bat
npm run sync:backend-bundle --workspace=@changmen/platform-probes
# → server/backend/platform_node（部署目录名保持历史兼容）
```

与 `venue-adapter` 的 sync 成对使用（`server/backend/platform_adapter`）。

## 环境变量

| 变量 | 说明 |
|------|------|
| `GAMEBET_PLATFORM_PROBES_ROOT` | 覆盖探针包根目录 |
| `GAMEBET_NODE_ROOT` | 同上（历史别名） |
