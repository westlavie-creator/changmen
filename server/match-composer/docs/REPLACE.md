# 用 match-composer 接替旧 Matcher 写路径

## 目标

`@changmen/match-composer` 从零实现：**聚类 + ID/绑定 + 主客锁/投影 + live 形状 + 写库**，**不**调用 `match-engine/merge` 的 `buildClientMatchList` / `finalize*` / `reconcile*`。

浏览器继续零校验；`Client_GetMatchs` 仍只读 `client_matches`。

## 生产姿态（已切流）

生产唯一 writer = **`changmen-esport` 内嵌** `matchMergeOnce` → `composeOnce`（`MATCHER_WRITER=composer`，代码默认亦为 composer）。

| 开关 | 生产 | 含义 |
|------|------|------|
| `MATCHER_WRITER` | `composer`（默认） | embedded 写路径整段交给 composer |
| `MATCH_COMPOSER_WRITE` | 关 | 独立 `composer:start` 写库；**composer 默认下被 write_guard 拒绝**（防双写） |
| `MATCHER_SIDE_ENGINE` | 勿开 | 仅 `MATCHER_WRITER=legacy` 时有效；composer 下忽略 |

独立 `match-composer` / `match-projector` **不进**默认 PM2。回滚：显式 `MATCHER_WRITER=legacy` 并重启 esport。

## 管线完备性（相对 legacy）

| 能力 | 状态 |
|------|------|
| alignUnmatched（后到馆挂已有场） | ✅ |
| autoRegisterTeams + OB name sync | ✅ |
| merge_key `match:id:` / `match:name:` | ✅ |
| 主客锁 PM→OB→RAY + force_aligned 规则 | ✅ |
| ended 过滤 / strip 后多馆门槛 | ✅（**live Round>0 允许暂留单馆**，防源抖动误归档） |
| InitialOdds + 决胜局 promote + OB gate | ✅ |
| backfill platform_matches.match_id | ✅ |
| 人工绑定同队对校验 | ✅ |
| 写互斥（挡独立 projector / 独立 composer；viaMatcherWriter 仅跳过本进程 matcher HB） | ✅ |
| 空合场：仅当本拍覆盖全部 previous active 且全 ended | ✅ |
| 同队时间拆桶 MergeKey 加 `@startMs` | ✅ |
| insert stub 仅对存活行（滤后） | ✅ |
| 独立 loop in-flight 互斥 | ✅ |
| 同 ID 双行合并（binding stub + 自动簇） | ✅ |
| snapshot：align 瘦行 + 全量 clientRows（sticky/pm_sport） | ✅ |

## 并列验证（不写库）

```bat
npm run composer:test
npm run composer:diff
npm run composer:diff -- --id=1189
npm run composer:once
```

对照指标：Title / `home_gb_team_id`·`away_gb_team_id` / Reverse / Sources HomeID。

## 运维要点

- 日志应持续出现 `[matchMerge] writer=composer …`（随 esport，无独立 composer PM2）。
- `MATCHER_WRITER=composer`（viaMatcherWriter）跳过**本进程** matcher 心跳，仍拒绝**其它 pid** matcher / projector WRITE / 其它 composer WRITE。
- 独立 `MATCH_COMPOSER_WRITE=1` 循环在默认 composer 下会被拒；dry-run 保持 `MATCH_COMPOSER_WRITE=0`。
- 危险旁路：`MATCH_COMPOSER_FORCE_WRITE=1` / `MATCH_PROJECTOR_FORCE_WRITE=1` 仅应急。
- 若生产曾开主客 sticky，设 `MATCH_COMPOSER_STICKY_ORIENTATION=1`（兼容 `MATCH_PROJECTOR_STICKY_ORIENTATION=1`）。

## 红线回顾

- 锁锚点仅 `Polymarket → OB → RAY`；禁止 min/max 建锁。
- `force_aligned`：自动为 `reversed` 时忽略；`ambiguous` 仍 omit。
- 不信任脏 `row.HomeGbTeamId`；锁来自锚点 / RDS sticky（规则内 upgrade）。
- CI：`npm run check:no-merge-import --prefix server/match-composer`（`composer:test` 已含）。

## 与 match-projector 关系

`match-projector` 是过渡层（旧 merge + 覆写）。生产已 composer 后，projector **不得**独立 WRITE；包保留供 diff / 文档 / 显式 legacy 回滚。
