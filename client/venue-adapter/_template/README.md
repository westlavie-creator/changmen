# 新平台模板

新平台落在 `client/venue-adapter/{dir}/`（dir 见 manifest）。

## 步骤

1. `registry/manifest.json` — 注册平台
2. `registry/adapters.ts` — 导出 adapter
3. `index.ts` — 实现 `PlatformAdapter`
4. `collect.ts` / `bet.ts` — 浏览器采集与下注
5. `devtools/platform-probes/{dir}/` — Node 探针（`requirePlatform` 第二段 `"node"`）
6. 可选 `shared/` — 浏览器内部共用（save_bets / parse）；探针侧放 `devtools/platform-probes/{dir}/shared/`

## 目录

```
{dir}/
├── index.ts
├── collect.ts
├── bet.ts
└── shared/          # 可选，仅浏览器

devtools/platform-probes/{dir}/
├── session.js
├── shared/          # 可选，仅探针/CLI
└── ...
```

生产采集在 `{dir}/` 根下，不经独立 Feed / WS relay。
