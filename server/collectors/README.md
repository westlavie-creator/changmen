# server/collectors/

VPS **守护进程级采集** 归集目录（浏览器采集仍在 `client/venue-adapter/`）。

## 包

| 包 | 路径 | 职责 |
|----|------|------|
| `@changmen/polymarket-sports` | [polymarket-sports/](polymarket-sports/) | PM Sports WS → `client_matches.pm_sport` |
| `@changmen/predictfun-collector` | [predictfun-collector/](predictfun-collector/) | Predict.fun REST → `platform_*` |

根目录 `npm run pm-sports` / `predictfun-collector` 不变；PM2 见 `deploy/ecosystem.config.cjs`。

## 约定

| 项 | 规则 |
|----|------|
| 写入 | `platform_matches` / `platform_bets`，或 `pm_sport` 列 |
| parse | canonical 在 `client/venue-adapter/{platform}/`；daemon 薄封装 |
| PM2 | `deploy/ecosystem.config.cjs` |
| 新运动 collector | 新建 workspace 于本目录（如未来 `mlb-gamma-collector`） |

详见 [docs/SPORTS_PRODUCT_LINES.md](../../docs/SPORTS_PRODUCT_LINES.md) §5。
