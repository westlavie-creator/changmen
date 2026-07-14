# lines/ — 产品线锚点

changmen 按 **平台层 → 能力层 → 产品线层** 组织；本目录是产品线层的对称入口（manifest，非业务代码搬迁）。

| 层 | 位置 | 说明 |
|----|------|------|
| 平台层 | 仓库根 `packages/`、`client/venue-adapter/`、`server/backend/`… | 所有业务线共用 |
| 能力层 | `client/web/src/extensions/`、`server/value-bet/`、`server/matcher/`… | 可复用引擎，被多条线引用 |
| 产品线层 | `lines/{code}/`（manifest） | `line.json` 指主控台挂载点；新运动不另起平行站 |

**完整说明** → [docs/SPORTS_PRODUCT_LINES.md](../docs/SPORTS_PRODUCT_LINES.md)  
**Catalog** → [docs/CATALOG.md](../docs/CATALOG.md)（`sport_catalog.linePath`）

| 目录 | 状态 | kind |
|------|------|------|
| [esport/](esport/) | active | `sport` |
| [baseball/](baseball/) | active（主控台棒球 Tab） | `sport` |
| [football/](football/) | active（主控台足球 Tab） | `sport` |

`line.json` 可选字段：`sharedPackages`（workspace 依赖，见 [PATH_REGISTRY.md](../docs/PATH_REGISTRY.md)）。

电竞实现仍在仓库根；`lines/esport/line.json` 映射实际路径。**新运动**挂主控台 Tab + 独立 API，`lines/{code}/line.json` 指向 `client/web` / `server/backend`。

**生产 PM2（当前）**：`changmen-esport` + `changmen-pm-sports`；`changmen-predictfun-collector` 在 ecosystem 中注册但**默认不启动**（见 [deploy/README.md](../deploy/README.md)）。
