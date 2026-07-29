# @changmen/match-composer

从零合场 + 主客投影。**生产写路径**经 `MATCHER_WRITER=composer`（默认）挂在 esport 内嵌 `matchMergeOnce`；独立 `composer:start` 默认 dry-run，且在 composer 写者下禁止 WRITE。

## 管线

```
platform_matches / bets / timers / client_matches / overrides
  → clusterByGbThenName（自研）
    → resolveIds（match-engine/ids，非 merge）
    → orientationLock（PM→OB→RAY）
    → projectSources（I1 / force_aligned）
    → liveShape（Round / promote / trim / gate / strip）
    → writeClientMatches（仅 embedded viaMatcherWriter，或 FORCE / 显式 legacy 独立 WRITE）
```

## 命令

| 命令 | 说明 |
|------|------|
| `npm run composer:test` | 单测 + 禁止 merge import |
| `npm run composer:once` | 干跑一次（默认不写库） |
| `npm run composer:once -- --write` | 独立写库：默认 `MATCHER_WRITER=composer` 下会被拒；须 `MATCH_COMPOSER_FORCE_WRITE=1` 或显式 `MATCHER_WRITER=legacy` |
| `npm run composer:diff` | vs 当前 RDS |
| `npm run composer:start` | 循环（默认不写库） |
| `npm run composer:ui` | 对照页 http://localhost:4568 ：左 RDS / 右纯场馆模拟 |

## 查看页（composer:ui）

- **左栏**：直接读 RDS `client_matches`（已落库合并结果）
- **右栏**：`fromVenuesOnly` 纯场馆模拟合场（忽略 seed / sticky / binding）
- 按馆 `sourceMatchId` 重叠配对，标记「两侧都有 / 仅左 / 仅右」
- **禁止写库**；API：`GET /api/compare`

## 环境变量

见 [docs/REPLACE.md](./docs/REPLACE.md)。关键：`MATCHER_WRITER=composer`（生产默认，embedded）；`MATCH_COMPOSER_WRITE`（独立 loop，默认关且与 embedded 互斥）。
