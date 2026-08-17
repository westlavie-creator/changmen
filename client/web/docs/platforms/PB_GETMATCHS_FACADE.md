# PB：`Client_GetMatchs` 对外单 event 假象（方案备忘）

> **状态：** 方案备忘；核心方向仍有效。  
> **标签：** `[changmen 扩展]` — A8 不以 `rotNum` 合场；A8 服务端不可见。  
> **相关：** [PB_ROTNUM_GROUPING.md](./PB_ROTNUM_GROUPING.md)、compose `pb_rotnum_collapse.js` / B1 `project_sources.js`、[PB_WS.md](./PB_WS.md)、[PB.md](./PB.md)（`LineID`）

## 1. 问题

平博官方在同一 **`rotNum`**（逻辑对阵）下常挂 **多条 `event.id`**（例如 live 一条有全场/当前图，prematch 残留一条有未开图）。

合场侧 `Matchs` 每馆只有 **一个槽位**。若：

- `Matchs.PB` 钉死过期 event，而某 Map 的价在 sibling 上；或  
- UI / WS 影子用 `Matchs.PB` 做 period 级查找、甚至 rot 互拷赔率，

就会出现「合场有 PB、某图无盘 / 价错 / 旁显错」——下午 WS 映射类问题多属此类，**不是** GetMatchs 缺一个 `EventID` 字段就能根治。

交易主键从未变过：**`event.id` 嵌在 `Sources.PB.HomeID` / `BetID` 里**；官网下单另要 **`lineId`**（现可由 `Sources.PB.LineID` 下发，旧前端仍用本机 cache）。官网不认 `rotNum`。

## 2. 推荐方案（门内消化）——**方向不变**

**原则：多 event / rot 只在采集与 matcher 内部消化；`Client_GetMatchs` 对前端继续假装「PB 只有一个 event」。**

| 层 | 是否感知 rot / 多 event | 职责 |
|----|-------------------------|------|
| 采集 / `platform_matches` | 是 | 按物理 `event.id` 落库；带 `rotNum` |
| matcher compose | 是 | 同 rot 认一场；选 primary；按 Map 从正确 event **投影**进 `Sources.PB` |
| **`Client_GetMatchs`** | **否**（业务上） | `Matchs.PB` 仍= primary event；**不**加 `Ext` / 每盘 `EventID` / 不改槽位=rot |
| 前端取价 / 下单 / WS 旁显 | **否**（业务上） | 只认该行 `Sources.PB`（`HomeID`/`AwayID`/`BetID`/`LineID`） |

### 2.0 与已落地 `LineID` 的关系（2026-08-16）

| 项 | 结论 |
|----|------|
| 要不要改「门内假象」总原则 | **不用。** `LineID` 是 Sources 上的交易补全，不是把 rot 暴露给 Client |
| `Matchs.PB` = rot / 每盘 `EventID` / `Ext.PB` | **仍不采用** |
| GetMatchs 形状 | 仍无新**必填**；可选 `Sources.PB.LineID`（旧前端忽略） |
| 假象是否更完整 | **是。** 一行 Sources 可自洽下单（选项 + 线号），更不依赖「本机刚采过」 |
| 仍未解决的 | primary 选举、B1 投影、WS 旁显禁止 rot/`Matchs.PB` 猜价 |

### 2.1 对外形状（示意；`LineID` 可选）

```json
{
  "ID": 1721,
  "Title": "KRÜ Esports vs BESTIA",
  "Matchs": {
    "OB": "…",
    "PB": "1633896380"
  },
  "Bets": [
    {
      "Map": 0,
      "Sources": {
        "PB": {
          "Type": "PB",
          "BetID": "1633896380:0",
          "HomeID": "1633896380|0|1|0|0|0|0",
          "AwayID": "1633896380|0|1|1|0|0|0",
          "LineID": 123456789,
          "HomeOdds": 1.85,
          "AwayOdds": 1.95,
          "Status": "Normal"
        }
      }
    },
    {
      "Map": 2,
      "Sources": {
        "PB": {
          "Type": "PB",
          "BetID": "1633801688:2",
          "HomeID": "1633801688|2|1|0|0|0|0",
          "AwayID": "1633801688|2|1|1|0|0|0",
          "LineID": 987654321,
          "HomeOdds": 1.75,
          "AwayOdds": 2.05,
          "Status": "Normal"
        }
      }
    }
  ]
}
```

要点：

- **`Matchs.PB`**：合场锚点 = **primary `event.id`**（仍在 `Matchs` 里，语义不变）。  
- **`Bets[].Sources.PB`**：某一盘的价与下单键；`HomeID` 前缀可以是 sibling（B1 投影结果）。前端**不必**理解「为什么和 `Matchs.PB` 不同」。  
- **可选** `LineID`：与该行 `BetID`/`HomeID` 同属一盘；**不加** 顶层 `Ext.PB`、**不加** 显式 `EventID`（需要时从 `HomeID` 前缀取）。  
- rot 兄弟列表留在 **matcher UI / RDS / 诊断脚本**，不进 Client 契约。

### 2.2 门内必须做好的三件事

1. **合场：** 同 `rotNum`（建议校验 `source_game_id`）→ 一个 `client_matches`；`Matchs.PB` = primary。规则见 [PB_ROTNUM_GROUPING.md](./PB_ROTNUM_GROUPING.md) 与 `pb_rotnum_collapse.js`。  
2. **投影：** 每个 Map 的 `Sources.PB` 来自「真正有该盘的那个 event」（B1 / `project_sources.js`），含该腿的 `LineID`。主 event 缺盘时用 sibling 的 `HomeID`/`BetID`/`LineID`，**不要**把 sibling 价写到主 event 的 fo 键上。  
3. **客户端铁律：** 取价、下单、WS 旁显 → **只跟该行 `Sources.PB`**；禁止用 `Matchs.PB` 做 period 级 fo/影子查找；禁止同 rot 赔率互拷。旁显建议**不要**再用 `matchId`（≈`Matchs.PB`）回退。

### 2.3 出错时修哪里

| 现象 | 优先查 |
|------|--------|
| 某 Map 无 `Sources.PB` | `platform_bets` 是否有该 event×map；B1 是否投上 |
| `Matchs.PB` 过期、live 在 sibling | primary 选举 / 换绑，不是改 GetMatchs 字段 |
| 主价对、`ws` 旁显错 | 旁显是否用了 `Matchs.PB` 或 rot 别名（应精确 `eventId\|period\|side`） |
| 下单查线失败 | 该行 `Sources.LineID` 或本机 `lineCache(BetID)`；是否与 `HomeID`/`BetID` 同腿 |

## 3. 明确不采用（或仅作更后备选）

| 方案 | 为何先不做 |
|------|------------|
| `Matchs.PB` 改存 `rotNum`，每盘加 `EventID` | 破坏合场锚点语义与前端习惯；下单仍要物理 event，字段叠床架屋 |
| GetMatchs 加 `Ext.PB`（rot + eventIds） | 破坏小，但契约变胖；观测可放 matcher |
| 客户端 rot 别名把 sibling 价写进 `Matchs.PB` 键 | 已证实会错价 |

若将来调试强依赖「同 rot 兄弟列表在 Client 可见」，再议旁路元数据；**默认仍不进 GetMatchs。**

## 4. 与下注的关系

- PB `checkBet` / buy：`oddsId`≈`HomeID` + `lineId`。  
- **新前端：** 优先 `Sources.LineID`；无则本机 `lineCache(BetID)`。  
- **旧前端：** 忽略 `LineID`，仍只走 cache → 不受影响。  
- 本方案**不**把 PB 从 `Matchs` 挪出；点单键须 = 当前行 `Sources.PB`（与 B1 投影一致）。

## 5. 验收口径（拍板后）

- [x] 可选 `Sources.PB.LineID` 已落地（迁移 `039`；旧前端可忽略）  
- [x] WS 旁显：精确 `HomeID`/`AwayID`（S1）；对不上宁可空；无 `Matchs.PB`/rot 回退  
- [x] 同 rot 多 event：B1 投影补盘；sibling Map 带 `HomeID`/`BetID`/`LineID`（S2）  
- [ ] GetMatchs：**无**新必填；`Matchs.PB` 仍为 event id 字符串。  
- [ ] 主站取价 / 下单路径不出现「用 `Matchs.PB` 拼 period 键」或 rot 互拷。  
- [ ] rot 诊断仍走 matcher UI / `diag-pb-rotnum.mjs`。

## 6. 修订记录

| 日期 | 说明 |
|------|------|
| 2026-08-16 | 初稿：门内消化 + GetMatchs 单 event 假象 |
| 2026-08-16 | 复盘：落地 `LineID` 后**不改**假象总原则；示意/下注/验收补上可选 `LineID`；旁显忌 `Matchs.PB` 回退 |
| 2026-08-16 | 拆成彼此独立的步骤 S0–S4（可单步上线，不依赖未完成后续步） |
| 2026-08-16 | **S1 完成**：`resolvePbWsShadow` 仅 oddId；`BetRow` 不再传 `matchId` |
| 2026-08-16 | **S2 完成**：确认 B1 投影 + sibling `LineID` 进 Sources（`pb_rotnum_stitch` 验收） |

## 7. 分步实施（步骤间彼此独立）

**独立定义：** 任一步单独合并上线后，系统仍正确可用；不做下一步也不会半残。后续步只是「更好」，不是「补洞才能跑」。  
**不做的：** `Matchs.PB`=rot、`Ext.PB`、每盘 `EventID`、rot 互拷——任何一步都不要夹带这些。

| 步 | 内容 | 改哪里 | 不做也怎样 | 单独验收 | 状态 |
|----|------|--------|------------|----------|------|
| **S0** | 可选 `Sources.LineID` + 新前端优先读、旧前端 cache | 采集 / RDS `039` / 投影 / `checkBet` | 旧前端完全不受影响 | 有 `LineID` 时可无 cache 预检；无字段时仍走 cache | ✅ |
| **S1** | 客户端「不错映」：旁显只认该行 `HomeID`/`AwayID`；去掉 `matchId`/`Matchs.PB` 回退与 rot 别名 | 仅前端 `wsShadowOdds` / `BetRow` | 对不上键时旁显变空；主价 fo / 下注不变 | 同 rot 异 event **不得**错 `ws`；可空 | ✅ |
| **S2** | B1 投影：每 Map 的 `Sources.PB`（含 `LineID`）来自真正有盘的 event | 仅 matcher compose | 未做则仍可能某图无 PB 格；有格的盘照常可下 | 同 rot 拆盘场：有盘的 Map 均有 `Sources.PB`，且 `HomeID` 前缀=`BetID` 的 event | ✅ |
| **S3** | primary 选举/换绑：`Matchs.PB` 更贴近 live/当前图 | 仅 matcher collapse / 换绑 | 未做则锚点可能偏旧，但 S2 仍可把地图投进 Sources | live 出现后 `Matchs.PB` 合理；不要求改 Client 字段 | 待做 |
| **S4** | 观测只放门内：matcher UI / `diag-pb-rotnum` | 仅工具/UI | 纯诊断，零业务依赖 | 能列出同 rot 的 event 与 map 覆盖 | 待做 |

### 独立性示意

```text
S0 ─── 交易键补全（✅）     ← 不依赖 S1–S4
S1 ─── 前端不错映（✅）     ← 不依赖 S2/S3；即使投影仍差，也只是少旁显而非错旁显
S2 ─── 投影补盘（✅）       ← B1 + LineID 已验收；默认 COMPOSER_PB_ROTNUM_COLLAPSE=1
S3 ─── 锚点选对               ← 不依赖 S1；与 S2 可并行，互不阻塞发布
S4 ─── 诊断                   ← 任意时刻可做
```

### 建议顺序（仅为省事，非硬依赖）

1. ~~**S1**（最快止血错 `ws`）~~ ✅  
2. ~~**S2**（用户可见盘变全）~~ ✅（B1 原已有；补 LineID 验收）
3. **S3**（锚点少踩坑）  
4. **S4**（需要时）  

S0 / S1 / S2 已完。
