# changmen 投注账号后端

A8 仅有 `index.js` 可见，**A8 服务端为黑盒**。changmen 后端为自有设计，只需满足 **Client_* 线协议**（与 bundle 里的调用/响应一致）。

## 三层别混

| 层 | 可知内容 |
|----|----------|
| **A8 前端** `[A8 可证实]` | `Client_GetData` / `SaveData` key=`ACCOUNT` 传递 **JSON 数组**；元素含 `accountId`、provider、gateway、token 等 |
| **A8 服务端** | 不可见 |
| **changmen 服务端** `[changmen 实现]` | 见下「存储」 |

## 存储（players 唯一真相）

```text
players
  id                    ← wire accountId / CreateTagPlatform playerId
  owner_user_id         ← profiles.id，每用户隔离
  platform_id / platform_name / player_name
  provider              ← 场馆 adapter 键
  venue_member_id       ← [changmen 扩展] 场馆会员 ID（与 account_data.venueMemberId 同步）
  credit / total_balance
  account_data jsonb    ← 凭证 gateway/token、限额 rateConfig、game 等其余线协议字段

profiles.accounts jsonb ← 已弃写；部署时从 jsonb backfill 到 players 后运行时不再读写
```

对外 `Client_GetData(ACCOUNT)` / `Client_SaveData(ACCOUNT)` 仍返回/接收完整 JSON 数组；后端在读写时与 `players` 行互转（`server/db/player_account_record.js`）。

## 模型关系

```text
users / profiles
  └── betting_config / preferences（与账号无关）

players (每用户隔离，唯一真相)
  owner_user_id   uuid NOT NULL（活跃行）→ profiles.id
  account_data    凭证 + 投注配置
  UNIQUE (owner_user_id, platform_id, player_name) WHERE deleted_at IS NULL
  UNIQUE (owner_user_id, provider, venue_member_id) WHERE deleted_at IS NULL AND venue_member_id <> '' AND provider <> ''

orders / money_logs
  user_id + player_id
```

## Client_* 合约（前端 index.js 不变）

| API | changmen 后端职责 |
|-----|-------------------|
| `Client_CreateTagPlatform` | 当前用户下创建/复用 player，返回 `{ playerId, ... }` |
| `Client_GetData` / `SaveData` key=`ACCOUNT` | 读/写 **players**（组装/拆解线协议 JSON）；禁止空列表覆盖 |
| `Client_UpdateBalance` | 仅本人 player |
| `Client_DeletePlayer` | 软删 player + 从内存账号列表移除 |
| `Client_SaveOrder` / `SaveMoneyLog` | 仅本人 player_id |

## 运维

```bat
cd changmen\server\backend
node scripts\ops\migrations\migrate-players-owner-user-id.mjs
node scripts\ops\migrations\finalize-players-owner-user-id.mjs
npm run db:apply   rem 含 028 account_data 列
node scripts\ops\migrations\migrate-accounts-jsonb-to-players.mjs
node scripts\audit-accounts-full.mjs
```

部署脚本顺序：backup（players 快照）→ owner 回填 → apply 028 → jsonb→players backfill → pm2 restart。

手动改 RDS 后 `loadProfileById(uid)` 或 pm2 restart `changmen-esport` 刷新内存账号缓存。
