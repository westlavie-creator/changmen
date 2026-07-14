# lines/football — 足球产品线 manifest

**状态**：active（主控台只读 MVP）

方案见 [docs/ARB_MULTI_SPORT.md](../../docs/ARB_MULTI_SPORT.md)。

## 正式入口（唯一）

| 项 | 位置 |
|----|------|
| UI | 主控台 `client/web` → HomeView「足球」Tab |
| API | `Client_GetFootballMatchs`（`server/backend`） |
| Store | `client/web/src/stores/footballStore.ts` |
| 数据 | 服务端拉 Polymarket Gamma soccer → `ClientMatchDto[]` |

**不写**电竞 `client_matches` / matcher；**不进** `matchStore` 套利主循环。  
**不建** `football/web` 独立站。
