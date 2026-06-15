# 新平台模板

新平台落在 `client/platform-adapter/{dir}/`（dir 见 manifest）。

## 步骤

1. `registry/manifest.json` — 注册平台
2. `registry/adapters.ts` — 导出 adapter
3. `frontend/index.ts` — 实现 `PlatformAdapter`
4. `frontend/collect.ts` / `frontend/bet.ts` — 浏览器采集
5. `node/{dir}/session.js`、`node/{dir}/core.js` — Node 库 / CLI（`requirePlatform` 第二段 `"node"`）
6. 可选 `shared/` — 与 Node 共用的 save_bets / parse

## 目录

```
{dir}/
├── meta.ts
├── index.ts
├── frontend/
│   ├── index.ts
│   ├── collect.ts
│   └── bet.ts
└── shared/          # 可选

node/{dir}/          # 与 {dir}/ 平级，在包根 node/ 下
├── session.js
├── core.js
└── scripts/
    └── fetch_*.js
```

生产路径在 `frontend/`，不经独立 Feed / WS relay。