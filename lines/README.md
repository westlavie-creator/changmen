# lines/ — 产品线锚点

changmen 按 **平台层 → 能力层 → 产品线层** 组织；本目录是产品线层的对称入口（manifest，非业务代码搬迁）。

| 层 | 位置 | 说明 |
|----|------|------|
| 平台层 | 仓库根 `packages/`、`client/venue-adapter/`、`server/backend/`… | 所有业务线共用 |
| 能力层 | `client/web/src/extensions/`、`server/value-bet/`、`server/matcher/`… | 可复用引擎，被多条线引用 |
| 产品线层 | `lines/{code}/` | 每条业务线一个目录 + `line.json` |

**完整说明** → [docs/SPORTS_PRODUCT_LINES.md](../docs/SPORTS_PRODUCT_LINES.md)  
**Catalog** → [docs/CATALOG.md](../docs/CATALOG.md)（`sport_catalog.linePath`）

| 目录 | 状态 | kind |
|------|------|------|
| [esport/](esport/) | active | `sport` |
| [baseball/](baseball/) | planned | `sport` |

电竞实现仍在仓库根；`line.json` 的 `components` 指向实际路径。新非运动业务线将来同形状增 `lines/{code}/`。
