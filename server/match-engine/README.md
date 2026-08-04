# @changmen/match-engine

composer / matcher 共用的轻量工具包：`client_match` ID 分配、队名键、平台优先级与开赛时间容差。旧 `merge/` 合并管线已下线。

## 使用方

| 包 | 关系 |
|----|------|
| `server/match-composer` | 合场时复用 teams / ids |
| `server/matcher` | align、人工关联与 UI 复用 teams / ids / time windows |
| `server/team-resolver` | 队名 canonical（matcher 动态注入） |
| `@changmen/shared` | catalog、时间工具 |

## 目录

| 路径 | 内容 |
|------|------|
| `ids/client_match_ids.js` | id 复用与关联 |
| `teams/` | 队名 key、OB canonical、别名 JSON |
| `time_windows.js` | composer / align 共用开赛时间容差 |
| [`profiles/`](profiles/README.md) | 运动 profile 壳（`esport` / `baseball` 规划；**运行时尚未接线**） |

## 测试

```bat
npm test --prefix server/match-engine
```

相关：[server/matcher/README.md](../matcher/README.md) · [docs/CATALOG.md](../../docs/CATALOG.md)（`matcherProfile`）
