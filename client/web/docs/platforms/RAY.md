# RAY 采集

> **A8 对照**（Token / 采集 / 下注）：见 [A8_COMPARE_OB_RAY.md](./A8_COMPARE_OB_RAY.md#ray-平台)。

## 入口

`ray/index.ts` → `startRayCollector()`

## 双通道

| 通道 | 间隔 | 作用 |
|------|------|------|
| HTTP `match` 列表 | 30s | `saveMatch` + 每场 `loadRayBets` → `saveBets` |
| SocketCluster 源站 | 实时 | `source === "odds"` 时更新 `oddsStore` |

浏览器 **直连** `wss://cfsocket.365raylinks.com/socketcluster/` 频道 `match`（`ray/realtime.ts`，A8 写死 JWT）。不经 `/esport/ws/RAY` relay。

## 开赛时间

```ts
const horizon = Date.now() + 3600_000;
start < horizon  // 毫秒
```

## 盘口

- 只采集赔率组名匹配 **`/^获胜者$/`** 的 market（`WIN_GROUP`）
- `rayStage(map)`：`final` → Map 0，否则数字地图号

## 队徽

静态 CDN：`https://statics.freestaticsasia.com` + `team_logo` 路径（`rayLogo`）。

## 凭证

| 用途 | changmen | A8 原版 |
|------|----------|---------|
| **采集** | [`a8Collect.ts`](./a8Collect.ts) 内联 `t`（与 `devtools/platform-probes/ray/collect_credentials.js` 同步）；**不**调 `Client_GetCollectPlatform` | 插件 `bQe` 内写死 gateway + JWT + games |
| **下注** | 剪贴板 → `ACCOUNT` → `rayProvider` | 同左 |

`Client_GetCollectPlatform(RAY)` 仍返回同一 JWT（供探针/其它工具）；采集器与 A8 一样只读内联对象。

## 子模块

| 文件 | 说明 |
|------|------|
| `ray/a8Collect.ts` | A8 `bQe` 写死 gateway/token/games/betName |
| `ray/scClient.ts` | SocketCluster；dev 经 backend relay（`3560` / `3456`） |
| `ray/http.ts` | 采集 GET（直连 gateway） |
| `ray/paths.ts` | API 路径 `/v2/...` |
| `ray/index.ts` | 轮询 + SC 消费 |

后端 Node 探针：`devtools/platform-probes/ray/collect_credentials.js`、`server/backend/proxy/ray_http_proxy.js`。
