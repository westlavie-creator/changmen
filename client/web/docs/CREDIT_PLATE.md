# 信用盘 / v4

> **状态（2026-07）**：经 `api.a8.to` 的平博/TF/IM v4 信用盘**已停用**。  
> `/v4.0/*` 固定返回 `V4Disabled`；前端仅保留 **OB / SABA 官方试玩**（不经 A8）。

实现：`client/web/src/api/v4.ts` · 后端：`server/backend/core/esport-api/v4_router.js`。

## 当前入口

| 平台 | 行为 |
|------|------|
| OB | 直连官方试玩登录 URL（`djtop-capi…`） |
| SABA | 打开 sabab2b 试玩页 |
| PB / TF / IM | 提示「信用盘 v4 已停用」 |

## 自动化

```bash
cd changmen/client/web
npm run test:v4
```

断言 `/v4.0/` 返回 `V4Disabled`，**不会**请求 `api.a8.to`。
