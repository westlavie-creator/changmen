# server/collectors/

VPS **守护进程级采集** 归集目录（浏览器采集仍在 `client/venue-adapter/`）。

## 包

| 包 | 路径 | 职责 |
|----|------|------|
| `@changmen/polymarket-sports` | [polymarket-sports/](polymarket-sports/README.md) | PM Sports WS → `client_matches.pm_sport` |
| `@changmen/polymarket-esports-collector` | [polymarket-esports/](polymarket-esports/README.md) | PM Gamma+/prices → `platform_*` + market index |
| `@changmen/predictfun-collector` | [predictfun-collector/](predictfun-collector/README.md) | Predict.fun REST → `platform_*` |

根目录 `npm run pm-sports` / `polymarket-collector` / `predictfun-collector`；PM2 见 `deploy/ecosystem.config.cjs`。

## 约定

| 项 | 规则 |
|----|------|
| 写入 | `platform_matches` / `platform_bets`，或 `pm_sport` 列 |
| parse（A8 馆） | 浏览器 `client/venue-adapter/{platform}/` 仍为采集权威 |
| parse（PM/PF） | **Discovery 权威在本目录 collector**（`*/parse.js`）；浏览器只留报价工具，不镜像 `build*MappedMarket` |
| PM2 | `deploy/ecosystem.config.cjs` |
| 新运动 collector | 新建 workspace 于本目录（如未来 `mlb-gamma-collector`） |
| 新 VPS 电竞馆 | `collectionMode: vps_http_ws` + 本目录 collector；清单见 [docs/ADD_PLATFORM_CHECKLIST.md](../../docs/ADD_PLATFORM_CHECKLIST.md) §C |

详见 [docs/SPORTS_PRODUCT_LINES.md](../../docs/SPORTS_PRODUCT_LINES.md) §5。
