# RAY 采集

> **A8 对照**（Token / 采集 / 下注）：见 [A8_COMPARE_OB_RAY.md](./A8_COMPARE_OB_RAY.md#ray-平台)。

## 入口

`ray/index.ts` → `startRayCollector()`

## 双通道

| 通道 | 间隔 | 作用 |
|------|------|------|
| HTTP `match` 列表 | 30s | `saveMatch` + 每场 `loadRayBets` → `saveBets` |
| SocketCluster `/esport/ws/RAY` 频道 `match` | 实时 | `source === "odds"` 时更新 `oddsStore` |

浏览器 WS 连当前站点 `/esport/ws/RAY` → 后端 `ray_sc_relay` → RAY 源站 `cfsocket.365raylinks.com`（A8 原版为浏览器直连 `47.115.75.57`）。

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
| **采集** | `getCollectPlatform("RAY")`；后端强制 `ray_a8_collect.js` 与 bundle 相同 JWT | 插件内写死，**不**调 `Client_GetCollectPlatform` |
| **下注** | 剪贴板 → `ACCOUNT` → `rayProvider` | 同左 |

缺失 `Gateway`/`Token` 时采集跳过并 `console.warn`。

## 子模块

| 文件 | 说明 |
|------|------|
| `ray/http.ts` | 采集 GET（直连 gateway） |
| `ray/paths.ts` | API 路径 `/v2/...` |
| `ray/index.ts` | 轮询 + SocketCluster 消费 |

后端：`gamebet_backend/shared/ray_a8_collect.js`、`proxy/ray_sc_relay.js`。
