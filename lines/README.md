# lines/ — 产品线锚点

changmen 按 **平台层 → 能力层 → 产品线层** 组织；本目录是产品线层的对称入口（manifest，非业务代码搬迁）。

| 层 | 位置 | 说明 |
|----|------|------|
| 平台层 | 仓库根 `packages/`、`client/venue-adapter/`、`server/backend/`… | 所有业务线共用 |
| 能力层 | `client/web/src/extensions/`、`server/value-bet/`、`server/matcher/`… | 可复用引擎，被多条线引用 |
| 产品线层 | `lines/{code}/`（manifest）+ `changmen/{code}/`（新业务代码） | 每条业务线：`line.json` 指代码目录 |

**完整说明** → [docs/SPORTS_PRODUCT_LINES.md](../docs/SPORTS_PRODUCT_LINES.md)  
**Catalog** → [docs/CATALOG.md](../docs/CATALOG.md)（`sport_catalog.linePath`）

| 目录 | 状态 | kind |
|------|------|------|
| [esport/](esport/) | active | `sport` |
| [baseball/](baseball/) | active（B1 本地只读） | `sport` |

`line.json` 可选字段：`sharedPackages`（workspace 依赖，见 [PATH_REGISTRY.md](../docs/PATH_REGISTRY.md)）。

电竞实现仍在仓库根（`client/web/` 等）；`lines/esport/line.json` 映射实际路径。**新业务线**在仓库根新建 `changmen/{code}/`（如 [baseball/](../baseball/)），`lines/{code}/line.json` 的 `components` 指向该目录。

**生产 PM2（当前）**：`changmen-esport` + `changmen-pm-sports`；`changmen-predictfun-collector` 在 ecosystem 中注册但**默认不启动**（见 [deploy/README.md](../deploy/README.md)）。
