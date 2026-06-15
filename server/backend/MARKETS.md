# 聚合玩法 / 选盘规则（最终模型）

配置：[`packages/shared/catalog/market_catalog.json`](../../packages/shared/catalog/market_catalog.json)  
代码：[`packages/shared/catalog/market_catalog.mjs`](../../packages/shared/catalog/market_catalog.mjs) → `matchesMarketCode` / `resolveMarketCode`

## 与 A8 `index.js` 的关系（重要）

`A8/index.js` 是**前端打包产物**，里面混有两层逻辑，不要混为一谈：

| 层级 | A8 在做什么 | 数据形态 |
|------|-------------|----------|
| **页面 / Dashboard** | 读 A8 API、`fo` 缓存、聚合 WS | **已整理**：比赛、盘口名、主客赔率已对齐 |
| **浏览器插件采集**（bundle 内嵌） | 直连 OB/RAY 源站 HTTP，再 `saveBets` 上传 | **原始 API** → 本地用 `betName` 正则筛盘 |

**本项目 = 插件采集层 + 自建 Dashboard**，不连 A8 后台，因此：

- 规则必须写在 **`market_catalog`**，在 **`ob_core` / `ray_core`** 处理**源站原始字段**时生效。
- **不能**以 A8 页面里看到的 `BetName` / `getBetName()` 反推选盘规则——那是服务端整理后的结果。
- A8 里插件段的 `RegExp(betName)` 写法仅作**逆向参考**，真源是各平台 API 文档与实测样本。

## 判定模型（本项目）

对每个 **`market.code`**（如 `match_winner`），在对应平台源站数据上选盘：

```text
OB（已配置 gameOddTypes 的游戏，如 CS2）
    → odd_type_id + round 精确匹配
    → excludeIf / require @T1@T2

OB（未配置的游戏） / RAY
    → testOn 字段 + RegExp(betName)
    → excludeIf / require
    → 命中则 marketCode = match_winner
```

## 当前唯一聚合玩法：`match_winner`

### OB：优先 `odd_type_id`（玩法类型码）

OB `game/view` 每条盘口有两个 ID，不要混用：

| 字段 | 含义 | 示例 |
|------|------|------|
| `id` | 该场比赛该盘口的**实例 ID**（每场不同） | `5362358874808026` |
| `odd_type_id` | **玩法类型码**（同游戏同玩法固定） | CS2 全场获胜 `258531869137157` |

**CS2**（`game_id=257578064923863`，`gameCode=cs2`）：

| 范围 | `round` | `odd_type_id` | 典型 `cn_name` |
|------|---------|---------------|----------------|
| 全场获胜 | `0` | `258531869137157` | `全局 - 获胜` |
| 单局地图获胜 | `≥1` | `258790779782319` | `单局 - 获胜` |

**全部 OB 游戏**（`match_winner`，2026-05-24 源站实测）：

| gameCode | OB game_id | 全场 full | 地图 map |
|----------|------------|-----------|----------|
| cs2 | 257578064923863 | 258531869137157 | 258790779782319 |
| kog | 257561197207055 | 261696531557134 | 261868866992663 |
| valorant | 271192272576750 | 271248710253353 | 8033515352779661 |
| lol | 257154660915053 | 258672400990210 | 259107378151801 |
| dota2 | 257289795134339 | 258715881947201 | 259294666713360 |

刷新命令：`node scripts/platforms/ob/collect_odd_type_ids.js`（加 `--write` 写回 catalog）。

### RAY / 其它

| 平台 | testOn | betName | 附加规则 |
|------|--------|---------|----------|
| **RAY** | `group_name` | `^获胜者$` | 排除 status=4 |
| **TF** | `market_name` | `^获胜者$` | 待接入 |
| **IA** | `betKey` | 待接入 | 待接入 |

### OB betName 回退（非 CS2 或未配 odd_type 时）

| betKey 示例 | 是否命中 |
|-------------|----------|
| `[全场]-全局-获胜` / `全局 - 获胜` | 是 |
| `[地图1]-单局-获胜` | 是 |
| 含 `+` 的组合盘 | 否 |

## 与旧版配置的差异（已修正）

| 旧做法（有问题） | 现做法 |
|------------------|--------|
| OB 仅靠中文盘名猜测 | **CS2 用 odd_type_id**；其它游戏 betName 回退 |
| OB fallback「含获胜、不含+」 | 合并进 **betName + betKeyExcludeContains** |
| RAY/TF 分散文档 | 统一 **market.code + betName** |
| JSON 里写 openWhen 当主规则 | open/locked 仍在各平台 **MARKET_STATUS**（状态层，不是选盘层） |

## 代码入口

| 平台 | 调用 |
|------|------|
| OB | `ob_core.pickWinMarket` → `market_catalog.obPickWinMarket` |
| RAY | `ray_core.pickWinMarkets` → `market_catalog.rayIsAggregatedOddsRow` |
| 任意 | `resolveMarketCode('OB', { market, raw })` |

## 扩展

1. 在 `market_catalog.json` 为 OB 增加 `gameOddTypes.{gameCode}.full/map`（玩法类型码）。
2. 其它平台：指定 `testOn` + `betName` + `excludeIf`。

游戏类型（CS2、LOL…）仍见 [GAMES.md](./GAMES.md)。
