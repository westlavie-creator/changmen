# @changmen/platform-adapter

各平台**浏览器**适配器：`{platform}/frontend`、registry、loader。

Node 库与 CLI 在并列包 [`@changmen/platform-node`](../platform-node/README.md)。

## 目录

```
client/platform-adapter/
├── registry/ manifest.json
├── loader/   adapter_paths（requirePlatform）
├── backend/  包级 _paths.js（npm 解析）
├── shared/   跨平台工具
└── {platform}/frontend/  (+ 可选 shared/)
```

## 测试

```bat
cd changmen
npm run test:adapter --workspace=@changmen/backend
```