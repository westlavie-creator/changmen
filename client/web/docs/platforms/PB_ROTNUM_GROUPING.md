# PB `rotNum` 归组规则（Step2）

> `[changmen 扩展]` — A8 不以 `rotNum` 合场；本文件供 changmen 后续按「逻辑赛事」匹配使用。  
> 交易主键仍是 **`event.id` → `SourceMatchID` / `source_match_id`**。

## 两层 ID

| 键 | 含义 | 用途 |
|----|------|------|
| **`rot_num` / `rotNum`** | 对阵/场次归组（官方 euro/odds 字段） | 认「一场系列赛」 |
| **`source_match_id` / `event.id`** | 可交易账本容器 | SaveBet、fo、下单、lineId |

同一 `rot_num` 下可有多条 event：进行中地图一条、未开地图一条等。

## 归组规则（Step3 合场前冻结）

1. **候选键：** `platform = PB` 且 `rot_num` 非空。  
2. **过滤：** 队名含 `(Kills)` 不进主归组（采集已跳过；同 rot 旁路盘用 `parentId` 指向主 event）。  
3. **校验：** 同 rot 内队名一致、`source_game_id` 一致；**同 rot 异队 = 硬伤（撞号）**。  
4. **主 event（启发式，Step3 再落代码）：** 优先含全场/进行中 map 的 live 账本；其余同 rot id 为 sibling。  
5. **作用域：** 若出现跨 game 同 rot，改为 `(source_game_id, rot_num)`；Step2 用撞号/异 game 检查决定。  
6. **禁止：** 把 `SourceMatchID` 直接改成 `rot_num`（会断下注）。

## Step2 验收

脚本：`server/backend/scripts/ops/diagnostics/diag-pb-rotnum.mjs`

```bash
cd server/backend
node scripts/ops/diagnostics/diag-pb-rotnum.mjs
node scripts/ops/diagnostics/diag-pb-rotnum.mjs --api
```

| 项 | 通过标准 |
|----|----------|
| RDS `rot_num` 覆盖率 | 新写入 ≥ 95% |
| 同 rot 异队 | 0 |
| 拆盘证据 | 同 rot ≥2 个 `source_match_id`，map 宜互补 |
| 开赛前后 | 同对阵 `rot_num` 不无故跳号 |

全过后再开 **Step3：合场按 rot 认一场**。

## 观测记录（2026-08-14）

- API：非 Kills 无空 rot；撞号 0；多组 live/prematch 同 rot、map 无重叠。  
- RDS：迁移 `038` 已上；采集未写 `RotNum` 前覆盖率 0%——需部署带 `RotNum` 的采集后再验收库内字段。
