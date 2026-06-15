# 新平台模板

新平台落在 `client/platform-adapter/{dir}/`（dir 见 manifest）。

## 步骤

1. `registry/manifest.json` — 注册平台
2. `registry/adapters.ts` — 导出 adapter
3. `index.ts` — 实现 `PlatformAdapter`
4. `collect.ts` / `bet.ts` — 浏览器采集与下注
5. `devtools/platform-probes/{dir}/` — Node 探针（`requirePlatform` 第二段 `"node"`）
6. 可选 `shared/` — 与 platform-probes 共用的 save_bets / parse

## 目录

```
{dir}/
├── index.ts
├── collect.ts
├── bet.ts
└── shared/          # 可选

devtools/platform-probes/{dir}/
├── session.js
└── ...
```

生产采集在 `{dir}/` 根下，不经独立 Feed / WS relay。
