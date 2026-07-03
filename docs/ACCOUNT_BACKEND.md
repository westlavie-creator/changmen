# changmen 投注账号后端

A8 仅有 `index.js` 可见，**A8 服务端为黑盒**。changmen 后端为自有设计，只需满足 **Client_* 线协议**（与 bundle 里的调用/响应一致）。

## 三层别混

| 层 | 可知内容 |
|----|----------|
| **A8 前端** `[A8 可证实]` | `Client_GetData` / `SaveData` key=`ACCOUNT` 传递 **JSON 数组**；元素含 `accountId`、provider、gateway、token 等 |
| **A8 服务端** | 不可见；是否 jsonb、是否分表 — **未知** |
| **changmen 服务端** `[changmen 实现]` | 见下「存储」 |

## 存储（changmen 自有，非 A8 后端复刻）

```text
profiles.accounts (jsonb)
  ← changmen 把 Client_SaveData(ACCOUNT) 的 JSON 数组原样写入
  ← 凭证 gateway/token 在此；因 index.js 把它们放在 SaveData 载荷里

players
  id, owner_user_id, platform_id, player_name, …
  ← CreateTagPlatform 分配 playerId；每用户隔离（owner_user_id）

tag_platforms
  ← 标签平台名
```

对外 `accountId` 仍是 `players.id`（bigint），与 index.js 一致。

## 模型关系

```text
users / profiles
  └── accounts[] (jsonb)     changmen 持久化层；线协议 = A8 前端 JSON 数组

players (每用户隔离)
  owner_user_id   uuid NOT NULL（活跃行）→ profiles.id
  UNIQUE (owner_user_id, platform_id, player_name) WHERE deleted_at IS NULL

orders / money_logs
  user_id + player_id
```

早期 changmen 曾用「全局 player + profile 引用」猜 A8 服务端；现已改为 **owner_user_id 强制归属**。

## Client_* 合约（前端 index.js 不变）

| API | changmen 后端职责 |
|-----|-------------------|
| `Client_CreateTagPlatform` | 当前用户下创建/复用 player，返回 `{ playerId, ... }` |
| `Client_GetData` / `SaveData` key=`ACCOUNT` | 读写 `profiles.accounts` jsonb；Save 校验归属 + 禁止空覆盖 |
| `Client_UpdateBalance` | 仅本人 player |
| `Client_DeletePlayer` | 软删 player + 从 profile 移除 |
| `Client_SaveOrder` / `SaveMoneyLog` | 仅本人 player_id |

## 运维

```bat
cd changmen\server\backend
node scripts/migrate-players-owner-user-id.mjs
node scripts/finalize-players-owner-user-id.mjs
npm run db:apply   rem 含 027 约束
node scripts/audit-accounts-full.mjs
```

脚本改 `profiles.accounts` 后必须 `loadProfileById(uid)` 或 pm2 restart `gamebet-web`。
