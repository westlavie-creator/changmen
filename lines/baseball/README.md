# lines/baseball — 棒球产品线 manifest

**状态**：B1 active（业务代码在 [baseball/web/](../../baseball/web/)）

与 [lines/esport/](../esport/) 同形状的 `line.json`；落地路线见 [docs/SPORTS_PRODUCT_LINES.md](../../docs/SPORTS_PRODUCT_LINES.md) §4。

当前要点（**本地优先，无服务端**）：

- 代码：`baseball/web/`（Vite + Vue，直连 Gamma/CLOB）
- manifest：`lines/baseball/line.json` → `components.web`
- **无** `components.api` / collector / PM2（后期 VPS 联动再补）
- Catalog：`sport_catalog.json` → `code: baseball`（B2 起用）
