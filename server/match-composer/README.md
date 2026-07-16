# @changmen/match-composer

从零合场 + 主客投影 matcher。**并列验证包**；默认 dry-run。

## 管线

```
platform_matches / bets / timers / client_matches / overrides
  → clusterByGbThenName（自研）
  → resolveIds（match-engine/ids，非 merge）
  → orientationLock（PM→OB→RAY）
  → projectSources（I1 / force_aligned）
  → liveShape（Round / promote / trim / gate / strip）
  → writeClientMatches（MATCH_COMPOSER_WRITE=1）
```

## 命令

| 命令 | 说明 |
|------|------|
| `npm run composer:test` | 单测 + 禁止 merge import |
| `npm run composer:once` | 干跑一次（加 `--write` 或环境变量才写） |
| `npm run composer:diff` | vs 当前 RDS |
| `npm run composer:start` | 循环（默认不写库） |
| `npm run composer:ui` | 对照页 http://localhost:4568 ：左 RDS / 右纯场馆模拟 |

## 查看页（composer:ui）

- **左栏**：直接读 RDS `client_matches`（已落库合并结果）
- **右栏**：`fromVenuesOnly` 纯场馆模拟合场（忽略 seed / sticky / binding）
- 按馆 `sourceMatchId` 重叠配对，标记「两侧都有 / 仅左 / 仅右」
- **禁止写库**；API：`GET /api/compare`

## 环境变量

见 [docs/REPLACE.md](./docs/REPLACE.md)。关键：`MATCH_COMPOSER_WRITE`、`MATCHER_WRITER=composer`（挂在 matcher 写路径，默认关）。
