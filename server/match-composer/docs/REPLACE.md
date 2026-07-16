# 用 match-composer 接替旧 Matcher 写路径

## 目标

`@changmen/match-composer` 从零实现：**聚类 + ID/绑定 + 主客锁/投影 + live 形状 + 写库**，**不**调用 `match-engine/merge` 的 `buildClientMatchList` / `finalize*` / `reconcile*`。

浏览器继续零校验；`Client_GetMatchs` 仍只读 `client_matches`。

## 默认安全姿态

| 开关 | 默认 | 含义 |
|------|------|------|
| `MATCH_COMPOSER_WRITE` | 关 | 独立 `composer:start` / `composer:once` 是否写库 |
| `MATCHER_WRITER` | `legacy` | backend embedded / matcher 循环写路径；`composer` 才整段交给 composer |
| `MATCHER_SIDE_ENGINE` | `legacy` | 仅 `MATCHER_WRITER=legacy` 时：`projector` 为旧 merge + 投影覆写 |

生产在 `composer:diff` + 对冲不变式全绿前，**不得**打开写路径。

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
| 写互斥（挡 projector / 其它 composer；viaMatcherWriter 仅跳过本进程 matcher HB） | ✅ |
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

## 切流清单（人工、逐步）

1. **staging / 生产副本**跑 `composer:diff`，关键场 id（含曾出问题场）Reverse/Sources 符合对冲不变式。
2. 停旧写路径：
   - 独立 matcher 进程停掉；或
   - embedded：确认 `MATCHER_WRITER` 尚未切 composer 前的心跳空窗。
3. 停 `MATCHER_SIDE_ENGINE=projector` 与独立 `MATCH_PROJECTOR_WRITE`（禁止双写）。
4. 打开**其一**（勿并行）：
   - `MATCHER_WRITER=composer`（推荐：挂在现有 `matchMergeOnce` / UI 连线触发）；或
   - `MATCH_COMPOSER_WRITE=1` + `npm run composer:start`（独立循环）。
5. 观察 `.composer-heartbeat.json` / 日志 `writer=composer`；抽样 `Client_GetMatchs` 与订单对冲腿。
6. 连线 UI 可改为直接调 `composeOnce`（现阶段经 `matchMergeOnce` 已转发）。
7. 稳定后：下线 `match-projector` WRITE；文档指向本包；再评估删除 `server/matcher` 合场写逻辑。

危险旁路：`MATCH_COMPOSER_FORCE_WRITE=1` 可绕过「matcher/projector 心跳仍活跃」互斥，仅应急。

`MATCHER_WRITER=composer`（viaMatcherWriter）会跳过**本进程** matcher 心跳，但仍拒绝**其它 pid** 的 matcher 心跳，避免遗留 legacy 进程双写。

若生产曾开主客 sticky，切流时设 `MATCH_COMPOSER_STICKY_ORIENTATION=1`（兼容 `MATCH_PROJECTOR_STICKY_ORIENTATION=1`）。

## 红线回顾

- 锁锚点仅 `Polymarket → OB → RAY`；禁止 min/max 建锁。
- `force_aligned`：自动为 `reversed` 时忽略；`ambiguous` 仍 omit。
- 不信任脏 `row.HomeGbTeamId`；锁来自锚点 / RDS sticky（规则内 upgrade）。
- CI：`npm run check:no-merge-import --prefix server/match-composer`（`composer:test` 已含）。

## 与 match-projector 关系

`match-projector` 是过渡层（旧 merge + 覆写）。composer 切流后，projector 仅保留文档指向本包，不再生产写库。
