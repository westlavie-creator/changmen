# polymarket-esports (`@changmen/polymarket-esports-collector`)

VPS 守护进程：Polymarket **Gamma + CLOB /prices** →（可选）`platform_*` + 本机 `polymarket_market_index.json`。

对齐官方文档：

- [events/keyset](https://docs.polymarket.com/api-reference/events/list-events-keyset-pagination)（cursor，非 offset）
- [GET /sports](https://docs.polymarket.com/api-reference/sports/get-sports-metadata-information)
- [GET /sports/market-types](https://docs.polymarket.com/api-reference/sports/get-valid-sports-market-types)
- [POST /prices](https://docs.polymarket.com/api-reference/market-data/get-market-prices-request-body)（`side: SELL` = 买入 ask）
- 实时顶价仍走 Market WS（浏览器 / hub），**不**用本进程 HTTP 当实时源

## 迁移节奏

| 阶段 | 浏览器 | VPS collector |
|------|--------|----------------|
| **已切流（当前）** | 仅 Index → Market WS → fo（无 Gamma/`Save*`） | **live** 写 `platform_*` + MarketIndex |
| **旁路** | 同上 | `POLYMARKET_COLLECTOR_WRITE_PLATFORM=0` → shadow |

## 采集逻辑（一轮）

1. `GET /sports` → 电竞 `series_id`（缓存 1h）
2. `GET /sports/market-types` → 与 `moneyline`/`child_moneyline` 求交（缓存 6h；可用 env 追加类型）
3. `GET /events/keyset`（时间窗过去 6h～未来 1h，`after_cursor` 翻页）
4. 规范化类型（**无默认 moneyline**）→ allowlist → 双 token / 可解析 / 时间窗
5. `POST /prices` `SELL` 种子价
6. **按 SourceMatchID 整场截断**（默认最多 400 盘，不拆半场）
7. **默认 live**：写 `platform_*` + index；`WRITE_PLATFORM=0` 仅写 index

## 运行

| 环境 | 命令 |
|------|------|
| 开发 | `npm run polymarket-collector` |
| 生产 PM2 | `changmen-polymarket-collector` |

| 变量 | 默认 | 说明 |
|------|------|------|
| `POLYMARKET_COLLECTOR_INTERVAL_MS` | `60000` | 周期 |
| `POLYMARKET_COLLECTOR_WRITE_PLATFORM` | `1`（live） | `0`/`false` 关闭写库改 shadow |
| `POLYMARKET_COLLECTOR_EXTRA_MARKET_TYPES` | 空 | 逗号分隔额外类型（须在官方 list 内，如 `esports_match_result`） |

## 安全写库（live）

| 情况 | 行为 |
|------|------|
| HTTP 抛错 | 本轮不写 |
| 有 typed ML 但解析全失败 | skip，不 clear |
| 窗口内无 ML | 允许 clear + 空 index |

索引：[collectors/README.md](../README.md) · [PRODUCTION_DEPLOYMENT.md](../../../PRODUCTION_DEPLOYMENT.md)
