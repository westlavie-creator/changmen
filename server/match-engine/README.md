# @changmen/match-engine

跨平台 **赛事合并算法**（`matchMerge` 核心）：`client_match` id 分配、平台行归并、开赛时间容差、手动 merge key。

## 使用方

| 包 | 关系 |
|----|------|
| `server/matcher` | 30s 循环调用 `match_merge` |
| `server/team-resolver` | 队名 canonical（matcher 动态注入） |
| `@changmen/shared` | catalog、时间工具 |

## 目录

| 路径 | 内容 |
|------|------|
| `merge/match_merge.js` | 主合并逻辑 |
| `merge/match_lifecycle.js` | 生命周期 / 过期 |
| `ids/client_match_ids.js` | id 复用与关联 |
| `teams/` | 队名 key、OB canonical、别名 JSON |
| [`profiles/`](profiles/README.md) | 运动 profile 壳（`esport` / `baseball` 规划；**运行时尚未接线**） |

## 测试

```bat
npm test --prefix server/match-engine
```

相关：[server/matcher/README.md](../matcher/README.md) · [docs/CATALOG.md](../../docs/CATALOG.md)（`matcherProfile`）
