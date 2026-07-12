# match-engine/profiles

按 `sport_catalog.matcherProfile` 命名的合并配置锚点（`{name}.js`）。

| 文件 | sport | 状态 |
|------|-------|------|
| [esport.js](./esport.js) | `esport` | active — 当前默认 Map/Bo 合并（re-export 根 `index.js`） |
| `baseball.js` | `baseball` | 规划 — 无 Map/promote，见 [CATALOG.md](../../docs/CATALOG.md) |

**运行时**：matcher 尚未按 profile 动态加载；电竞仍直接 `import` `@changmen/match-engine`。接线后 `matcherProfile: esport` → 本目录 `esport.js`。

Catalog：[docs/CATALOG.md](../../docs/CATALOG.md) · 产品线：[lines/esport/line.json](../../lines/esport/line.json)
