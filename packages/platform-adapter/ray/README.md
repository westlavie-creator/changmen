# RAY 平台（雷竞技 / ray164.com）

脚本位于 `packages/platform-adapter/ray/`：

- `frontend/` — 浏览器采集与下注
- `backend/` — Feed、Session、SocketCluster、relay
- `backend/docs/` — 状态映射与运维说明

前台站点：[https://ray164.com/](https://ray164.com/)

## CLI

```bash
cd changmen/apps/backend
npm run ray:match
npm run ray:odds -- 38386601
npm run ray:ws
```

Legacy 路径 `platforms/ray/*.js` 仍为过渡 shim，指向本目录。
