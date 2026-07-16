# @changmen/match-projector

与 `server/matcher` **并列** 的主客投影进程。合场骨架仍复用 matcher 的 `computeMatchMergeList`，随后用本包规则 **重算** `Title` / gb 锁 / `Sources` / `Reverse` 并（可选）写回 `client_matches`。

## 相对旧 matcher 的规则

| 项 | 行为 |
|----|------|
| 建锁 | 仅 `Polymarket → OB → RAY`；**禁止** gb id min/max；**不采信**旧 finalize 写在 row 上的 gb |
| 陆续到齐 | 后到的更高优先级锚点会 **upgrade** 左右（修 RAY/OB 先到后到）；锚点闪断时 `existing-gap` sticky |
| RDS 锁 | 队对对不上 → reanchor；同队对默认跟最高锚点朝向；`STICKY_ORIENTATION=1` 才保留翻转 sticky |
| 投影 | `needSwap` 由队伍 venue→gb 相对锁决定；`Sources = swap/raw` |
| I1 | `Sources.HomeID/AwayID` 必须等于投影后的 raw 两侧（不用 odds→gb） |
| `force_aligned` | `reversed` 时忽略；`ambiguous` 时**仍省略**（禁止强行出盘） |
| Promote | 局盘无 native 时从已投影 Map0 回填，禁止二次 swap |
| Reverse | 必填数组；仅含实际写出 Sources 且做过 swap 的平台 |
| 写库互斥 | matcher 心跳活跃时拒绝 WRITE（`FORCE_WRITE=1` 危险覆盖） |

## 命令

```bat
REM 单测
npm test --prefix server/match-projector

REM 单次 dry-run（不写库）
npm run once --prefix server/match-projector

REM 与当前 RDS client_matches 对比
npm run diff --prefix server/match-projector
npm run diff --prefix server/match-projector -- --id=1189

REM 强制按锚点重锚左右（默认同 dry-run）
npm run reanchor --prefix server/match-projector

REM 循环（默认仍 dry-run）
npm start --prefix server/match-projector

REM 真正写库（先停旧 matcher）
set MATCH_PROJECTOR_WRITE=1
npm run once --prefix server/match-projector -- --write
```

根目录也可：

```bat
npm run projector:once
npm run projector:diff
npm run projector:start
npm run projector:test
```

## 测试覆盖（接替前必绿）

```bat
npm run projector:test
```

覆盖：锁锚点优先级、污染 row gb、sticky/重锚、force_aligned/ambiguous、
Map promote、无锁清盘、NiP 事故回归、Home+Away 对冲组合属性、写库互斥。

不变式见 `src/invariants.js`（I1、Reverse⊆Sources、同边探测）。

## 接替旧 matcher（推荐）

见 [docs/REPLACE_MATCHER.md](./docs/REPLACE_MATCHER.md)。

```bat
REM backend .env：写路径自动投影（UI/Timer/loop 全覆盖）
MATCHER_SIDE_ENGINE=projector
```

独立 `MATCH_PROJECTOR_WRITE` 循环仅用于对照；生产勿与 legacy 双写。

## 切流清单

1. `npm run projector:test` 全绿
2. `npm run projector:diff` 抽查关键场
3. `.env` 设 `MATCHER_SIDE_ENGINE=projector`，重启 backend
4. 日志出现 `sideEngine=projector`，观察 GetMatchs / 下注主客
5. （可选）对照期保留独立 dry-run diff，**不要**再开 WRITE 循环

## 仍未改（引擎开启后也需知情）

- 连线 UI 仍写 `force_aligned`（投影侧已挡毒）；「强制正向」语义变更
- `swap-gb` 默认会被最高锚点 `upgrade`（除非 `STICKY_ORIENTATION=1`）
- 合场/归档/对齐仍在旧 matcher 骨架
