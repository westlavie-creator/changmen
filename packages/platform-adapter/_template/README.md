# 新平台脚手架

复制本目录到 `packages/platform-adapter/{dir}/`（dir 为小写平台名）。

## 必做

1. `registry/manifest.json` — 增加平台条目
2. `registry/adapters.ts` — 注册 adapter
3. `frontend/index.ts` — 导出 `PlatformAdapter`
4. `frontend/collect.ts` / `frontend/bet.ts` — 按能力实现
5. （可选）`backend/relay.js` — WS relay（OB/RAY/TF/IA）

## 文件清单

```
{dir}/
├── meta.ts
├── frontend/
│   ├── index.ts
│   ├── collect.ts
│   └── bet.ts
└── backend/
    ├── feed.js
    └── relay.js   # 仅 OB/RAY/TF/IA 类 WS relay 平台
```
