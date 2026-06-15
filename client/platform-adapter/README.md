# @changmen/platform-adapter

各平台**浏览器**适配器：`{platform}/`、registry、loader。

可选探针 CLI 在 [`@changmen/platform-probes`](../../devtools/platform-probes/README.md)（日常可不使用）。

## 目录

```
client/platform-adapter/
├── registry/ manifest.json
├── loader/   adapter_paths（requirePlatform）
├── backend/  包级 _paths.js（npm 解析）
├── shared/   跨平台工具
└── {platform}/          collect.ts、bet.ts 等（+ 可选 shared/、scripts/）
```

## 测试

```bat
cd changmen
npm run test:adapter --workspace=@changmen/backend
```