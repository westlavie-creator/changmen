# SABA 采集

## 入口

`saba/index.ts` → `startSabaCollector()`

## 流程

```text
resolveCollectSession(SABA)
  → fetchSabaEsportsPage (HTML，可 sessionStorage 缓存 SABA:CONTENT)
  → parseEsportsPage → buildSabaWsConfig
  → Socket.IO 连接沙巴 WS
  → 订阅赔率 / 解析 match & odds 行
  → normalizeSabaMatch / normalizeSabaOdds
  → saveMatch / saveBets + oddsStore
```

单次 WS 会话最长 **300s**（`WS_MAX_MS`），结束后重连；check-in 每 3s。

## 开赛时间（对齐 A8）

`saba/core.ts`：

```js
if (Number(row.kickofftime) > nowSec + 3600) return null;
```

## 核心模块

| 文件 | 作用 |
|------|------|
| `saba/core.ts` | 页面解析、WS 配置、马来盘转欧赔、match/odds 归一 |
| `saba/http.ts` | 拉电竞页面 |
| `saba/paths.ts` | URL 片段 |

## 凭证

`resolveCollectSession`，无 Gateway/Token 时 `odds.clean(SABA)` 并等待 60s。

## A8 对照

切片 `13-saba.js`：`TZe` 为下单 sportId 映射；列表过滤同上 3600s 规则。
