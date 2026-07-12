# @changmen/shared

**sport / game / market catalog** 与跨端小工具（赔率格式、比赛时间、`im_parse` 等）。配置 JSON 为单一事实来源，TS 模块做校验与浏览器/Node 双入口。

## 导出（节选）

| 路径 | 内容 |
|------|------|
| `@changmen/shared/catalog/sport_catalog` | 运动 taxonomy + `linePath` |
| `@changmen/shared/catalog/game_catalog` | 电竞等 game 元数据 |
| `@changmen/shared/catalog/market_catalog` | 盘口类型 |
| `@changmen/shared/odds_format` | 赔率展示/换算 |
| `@changmen/shared/time/match_time` | 开赛时间解析 |

完整 `exports` 见 [package.json](./package.json)。

## 使用方

| 包 | 典型用途 |
|----|----------|
| `client/web` | UI 标签、过滤、catalog 下拉 |
| `server/matcher` | 合并规则、队名归一 |
| `server/backend` | 平台同步、校验 |

## 扩展规则

新增 sport / game / market：**先改 JSON**，再补 TS 类型与文档。字段说明见 [docs/CATALOG.md](../../docs/CATALOG.md)；产品线锚点见 [lines/](../../lines/README.md)。

相关：[packages/README.md](../README.md)
