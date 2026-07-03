# 账号模块（对齐 A8 前端 `Io()` / `uv`）

对标 A8 控制台「平台账号」**前端行为**（`index.js`）；A8 服务端不可见。changmen 用 RDS 实现 Client_* 线协议。

## 架构

```text
控制台 Vue (AccountView / AccountInfoView)   ← 行为对齐 index.js Io()
    ↕ Client_* API（线协议 [A8 可证实]）
core/esport-api/router.js
    ↕
core/account/account_service.js
    ├─ account_store.js     tag_platforms / players（owner_user_id）/ money_logs
    ├─ player_ownership.js  每用户 playerId 归属校验
    └─ balance_provider.js  PB、HG 等 getBalance
profiles.accounts (jsonb)   ← [changmen 实现] 持久化 SaveData(ACCOUNT) 的 JSON 数组
```

## 与 A8 对齐的 API

| API | 作用 |
|-----|------|
| `Client_GetData` / `Client_SaveData` | key=`ACCOUNT` 时读写 **JSON 数组**（bundle 直接 `.map`）；changmen 存于 `profiles.accounts` jsonb |
| `Client_CreateTagPlatform` | 创建标签平台 + player，返回 `{ playerId, playerName, platformId, platformName }` |
| `Client_GetTagPlatforms` | 返回 `[{ ID, Name }]` |
| `Client_UpdateBalance` | 更新 player 余额，返回 `{ total, platformId, platformName }` |
| `Client_DeletePlayer` | 删除 player 元数据并清理 ACCOUNT KV 中对应项 |
| `Client_GetMoneyLogs` / `Save` / `Delete` | 充提流水 |
| `Client_GetPlayerOrder` / `Client_SaveOrder` | 按 player 读写 RDS `orders` |

## 凭证导入（插件 → 控制台）

与 bundle 中 `AccountInfoView` 一致：剪贴板 **Base64(JSON)**：

```json
{
  "provider": "PB",
  "token": "{...}",
  "referer": "https://...",
  "gateway": ["https://www.example.com", "https://mirror.example.com"]
}
```

解析：`npm run account:cli -- parse-credential <base64>`

写入 Node Feed 凭证（与 OB 相同，插件 `data` 字段）：

```bash
npm run account:import-platform -- "<base64>" --sync-store
```

写入 `scripts/data/esport/platforms.json`，PB 配合 `ENABLE_PB=1` 启动 PbFeed。

## CLI

```bash
cd scripts
npm run account:tags
npm run account:create -- --platform 信用盘A --player user01
npm run account:list
npm run account:refresh
```

## 余额刷新

`balance_provider.js` 当前接入：

- **PB** — `pb_session.fetchBalance`
- **HG** — `hg_session.fetchBalance`

其他 provider 返回 `null`，控制台显示余额未知（与 A8 未配置凭证时行为一致）。后续可在 `balance_provider.js` 按场馆扩展。

## 数据文件

运行时目录 `server/backend/storage/`（见 [STORAGE.md](../../STORAGE.md)）：

- `profiles`（RDS）— `ACCOUNT`、CollectConfig 等（前端 `Client_SaveData`）
- `tag_platforms` / `players` — RDS 表（原 JSON 已废弃）
- `orders` / `money_logs` — RDS 表

## 控制台使用

1. `npm run web` 启动 Dashboard
2. 登录 `admin` / `admin`
3. 侧栏「账号」→ 新增 → 粘贴插件凭证 → 保存

需安装 `plug/` 扩展才能在真实站点采集凭证；PB/HG 也可手动填 `gateway`+`token` 后保存。
