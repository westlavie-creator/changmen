# lines/baseball — 棒球产品线 manifest

**状态**：active（主控台只读 MVP）

与 [lines/esport/](../esport/) 同形状的 `line.json`；方案见 [docs/ARB_MULTI_SPORT.md](../../docs/ARB_MULTI_SPORT.md)。

## 正式入口（唯一）

| 项 | 位置 |
|----|------|
| UI | 主控台 `client/web` → HomeView「棒球」Tab |
| API | `Client_GetBaseballMatchs`（`server/backend`） |
| Store | `client/web/src/stores/baseballStore.ts` |
| 数据 | 服务端拉 Polymarket Gamma MLB → `ClientMatchDto[]` |

**不写**电竞 `client_matches` / matcher；**不进** `matchStore` 套利主循环。

独立站 `baseball/web`（端口 3458）已归档，见 `devtools/archive/baseball-web-b1/`。

## 后续

- 分表 + Save* 上报、匹配、套利 → [ARB_MULTI_SPORT.md](../../docs/ARB_MULTI_SPORT.md) 「后续」
