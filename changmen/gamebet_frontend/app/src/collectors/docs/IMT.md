# IMT 采集

## 入口

`imt/index.ts` → `startImtCollector()`

## 流程

```text
resolveCollectSession(IMT)
  → POST Delta API（携带上次 delta 游标）
  → normalizeImtFullPayload
  → oddsStore 更新 + 每 60s saveMatch/saveBets
```

轮询 **1s**（高频增量）；落库节流 **60s**。

## 游戏

默认 `IMT_DEFAULT_SPORT_IDS`；可被 `getGames` 覆盖过滤。

## 响应

- `StatusCode` / `Message` 错误处理
- `dc[].v[].ws[]` — `si` / `wsi` / `o` 等赔率结构

## 子模块

| 文件 | 说明 |
|------|------|
| `imt/core.ts` | payload 归一、队徽 `imtTeamLogo` |
| `imt/http.ts` | POST |
| `imt/headers.ts` | 请求头 |

## 凭证

同 PB：`resolveCollectSession`，优先有余额账号。
