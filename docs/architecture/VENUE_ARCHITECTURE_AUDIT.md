# Venue Architecture Audit

> **Scope**: READ → TRACE → MAP → CLASSIFY → RECOMMEND only.  
> **Date**: 2026-09-19  
> **Method**: Full-repo symbol search + call-chain tracing. No production code changes.  
> **Principle under evaluation**: `CODE IS TRUTH` / `CONFIG CHOOSES HOW TO RUN`

---

# 1. Executive Summary

Changmen 当前 Venue 架构是 **manifest 主导的混合模型**，不是纯 Adapter-driven。

| 层 | 当前真实状态 |
|----|--------------|
| Catalog（存在哪些 Venue） | **`manifest.json` ≈ Catalog**（经 `ALL_PLATFORMS` / `PLATFORM_REGISTRY`）；同时还有 `PlatformId` enum、`shared/platforms.ts`、过期的 `client-core` ALL_PLATFORMS、Chrome 扩展枚举等多份拷贝 |
| Capability（能做什么） | **部分在 Adapter**（`collector` / `provider` 是否挂上）；**权威开关却在 manifest**（`collect` / `bet`） |
| Activation（当前启用） | **分散**：`manifest.collect/bet/implementation` + 用户 `CollectConfig` + **deploy/PM2**（VPS collector 启停） |
| Runtime Policy（在哪跑） | **主要是 `collectionMode`**（尤其 `vps_http_ws` 门控）；浏览器 collector 是否启动由 `collect:true ∩ adapter.collector` 决定 |
| Runtime Registry | `buildCollectorFactories()` + `getProvider()` — **manifest 过滤 + adapter 实现** 的混合 |

核心结论：

1. **你提出的分层方向大体成立**，尤其 `collectionMode` / VPS ownership / `pluginOnly` 的语义都支持「能力 ≠ 运行拓扑」。
2. **不能直接把 manifest 改成 activation-only**：`ALL_PLATFORMS` 目前 = manifest 全量 ID 列表，被账号 UI、用户配置、CollectConfig 初始化、扩展偏好等广泛消费；paused Venue 仍必须「存在」。
3. **最危险的重复/漂移已真实存在**：
   - `packages/client-core/src/types/platforms.ts` 的 `ALL_PLATFORMS` **缺少** Limitless / SXBet / Azuro / PredictFun
   - `pluginOnly` / `saveMatchIntervalMs` / `a8Channel` / `implementation` **几乎无运行时消费者**（或仅经无人消费的 `/api/platforms`）
   - `collect:false` 但 Adapter 仍挂 `collector`（SABA、IMT、Dex、Azuro）→ **代码能力与运行时启用已分叉**
   - PredictFun：manifest `collect:true` + `vps_http_ws`，但 **生产 VPS collector 由 deploy 脚本暂停**，与 manifest 不同步
4. **最小下一步不应新建四套配置**；应先锁定 Source of Truth，再 DERIVE，最后再谈 Catalog/Activation 拆分。

---

# 2. Current Architecture

## 2.1 组件图（现状）

```
packages/api-contract  PlatformId (zod enum)
        │
        ▼
client/venue-adapter/registry/manifest.json   ◄── 事实上的「超级配置」
        │
        ├── meta.ts → ALL_PLATFORMS / collect* / bet* / isVpsOwned* / browserSave*
        ├── feeds.js → listPlatforms() / isVpsOwned* (Node)
        ├── icons.ts → icon URL
        ├── paths.js → dir → requirePlatform 路径
        └── adapters.ts → PLATFORM_ADAPTERS + buildCollectorFactories()
                │
                ├── filter: collectPlatformIds() from manifest
                └── factory: adapter.collector / adapter.provider

client/web/src/runtime/collectors.ts  ← buildCollectorFactories()
client/web/src/runtime/providers.ts   ← getProvider / supportedBetProviders
server/backend store.js               ← feeds.isVpsOwnedPlatformCollect
server/collectors/*                   ← VPS discovery（与 manifest 无代码级强制绑定）
deploy/ecosystem*.cjs                 ← VPS 进程真正启停（activation 旁路）
```

## 2.2 两套「平台列表」

| 源 | 用途 | 与 manifest 同步？ |
|----|------|-------------------|
| `manifest.json` → `meta.ALL_PLATFORMS` | Web UI / CollectConfig / 账号排序默认 | **是**（权威） |
| `packages/api-contract` `PlatformId` | 类型/校验 | **是**（17 个全对齐） |
| `shared/platforms.ts` `PLATFORMS` | Adapter 内常量，避免 chunk 回引 registry | **是**（手动维护） |
| `packages/client-core/.../platforms.ts` `ALL_PLATFORMS` | `PlatformAccount.sortByProvider` | **否**（缺 4 馆） |
| `chrome-extension/.../platforms.js` | 扩展 content 探测 | **否**（缺 Limitless/PF/SXBet/Azuro/XBet；多 HGA） |
| `server/backend/scripts/check-collect-platforms.js` | 运维脚本硬编码 | **否**（旧列表） |

## 2.3 Adapter 契约（实际暴露）

`PlatformAdapter`（`client/venue-adapter/contract/index.ts`）：

```ts
{ id, meta?, collector?, provider? }
```

实测：**没有任何 Adapter 填充 `meta`**。`PlatformAdapterMeta` 与 manifest 字段重复，但死类型。

能力表达目前只有：

- `collector?: () => StopFn` — 浏览器侧采集循环工厂
- `provider?: PlatformProvider` — 余额/订单/checkBet/betting/resolveLegOutcome

**没有**一等公民字段表达：VPS discovery、plugin bridge、browser Save ownership、quote-only、order-only。

---

# 3. Actual Data Flow

## 3.1 Browser collector 启动链

```
sessionBoot → startCollectors()
  → buildCollectorFactories()
      → for id in collectPlatformIds()          // manifest.collect === true
          → getCollectorFactory(id)             // adapter.collector
          → map[id] = factory
  → syncCollector(platform, true, factory)      // 立即启动；CollectConfig 不启停
```

**CollectConfig 只门控 SaveMatch/SaveBets 上报**，不启停 collector（`collectStore` / `CollectConfigPanel` 注释与行为一致）。

## 3.2 Browser Save* 链

```
adapter collect loop → collectStore.saveMatch/saveBets
  → isVpsOwnedPlatformCollect? → false 早退
  → CollectConfig[platform]? → false 早退
  → api/match.saveMatchSource/saveBetSource
      → isVpsOwnedPlatformCollect? → false 早退
      → POST API_SaveMatch / API_SaveBet
          → store.js 再次 isVpsOwnedPlatformCollect → ignore
```

Authority：**`collectionMode === "vps_http_ws"`**（manifest），前后端三道门一致。

## 3.3 Bet / Provider 链

```
accountStore / betGateway → getProvider(account)
  → platformSupportsBet(provider)   // manifest.bet
  → adapter.provider
  → withA8ResolveLegOutcome(provider)
```

## 3.4 VPS discovery 链（与 browser 解耦）

```
PM2 (deploy/ecosystem) → server/collectors/{polymarket-esports|predictfun|sxbet}
  → 写 platform_matches / platform_bets / MarketIndex
  → matcher compose → client_matches
  → Client_GetMatchs → UI

浏览器 adapter（PM/PF）：Index sync → Market WS → fo；不 SaveMatch
```

**VPS 进程启停不读 manifest**。PredictFun collector 可在 deploy 被 delete，同时 manifest 仍 `collect:true` / `implementation:done`。

## 3.5 `/api/platforms` 链

```
http_routes.js → feeds.listPlatforms() → 返回 id/dir/label/collectionMode/Desc/implementation/streamMeta/collect/bet
```

**仓库内无 frontend / matcher UI 消费者**（全仓搜索未见调用 `/api/platforms`）。字段经此出口「理论上可读」，但运行时近乎未用。

---

# 4. Venue Truth Map

图例：

- **Browser Save** = `collect && collectionMode !== vps_http_ws`（会进 CollectConfig UI）
- **Runtime collector** = 是否进入 `buildCollectorFactories()`（需 `collect:true` 且 adapter 有 collector）
- **UI** = 出现在 `ALL_PLATFORMS` 驱动的账号/配置 UI（含 paused）

| Venue | manifest | adapter | collector 代码 | provider 代码 | collectionMode | pluginOnly | implementation | Runtime 启动 collector | Browser Save | VPS Collector 包 | 备注 |
|-------|----------|---------|----------------|---------------|----------------|------------|----------------|------------------------|--------------|------------------|------|
| OB | ✓ | ✓ | ✓ | ✓ | http_mqtt | — | done | ✓ | ✓ | — | 经典 browser |
| IM | ✓ | ✓ 空壳 | ✗ | ✗ | aggregator_ws | — | paused | ✗ | ✗ | — | 存在但停用 |
| RAY | ✓ | ✓ | ✓ | ✓ | http_ws | — | done | ✓ | ✓ | — | 经典 browser |
| TF | ✓ | ✓ 空壳 | ✗ | ✗ | http_ws | — | paused | ✗ | ✗ | — | |
| IA | ✓ | ✓ | ✓ | ✓ | http_ws | — | done | ✓ | ✓ | — | 描述含插件 HTTP，mode 非 plugin_* |
| SABA | ✓ | ✓ | ✓ | ✓ | parse_ws | — | done | **✗**（collect:false） | ✗ | — | **代码有采集，运行时未启** |
| XBet | ✓ | ✓ 空壳 | ✗ | ✗ | aggregator_ws | — | paused | ✗ | ✗ | — | |
| PB | ✓ | ✓ | ✓ | ✓ | http_poll | — | done | ✓ | ✓ | — | |
| IMT | ✓ | ✓ | ✓ | ✓ | http_poll | — | done | **✗**（collect:false） | ✗ | — | **同上；bet:true** |
| HG | ✓ | ✓ 空壳 | 文件有 collect 未挂 | ✗ | plugin_http | — | paused | ✗ | ✗ | — | |
| Stake | ✓ | ✓ | ✓ | ✓ | plugin_graphql_ws | true | done | ✓ | ✓ | — | 扩展 GraphQL + Save* |
| Dex | ✓ | ✓ | ✓ | ✓ | plugin_http | true | paused | ✗ | ✗ | — | adapter 仍挂能力；manifest 关 |
| Polymarket | ✓ | ✓ | ✓（报价） | ✓ | vps_http_ws | true | done | ✓（非 Save） | ✗ | polymarket-esports | Hybrid |
| Limitless | ✓ | ✓ | ✓ | ✗ | plugin_http_ws | true | done | ✓ | ✓ | — | collect only |
| SXBet | ✓ | ✓ 空壳 | ✗ | ✗ | vps_http_ws | — | paused | ✗ | ✗ | sxbet-collector（deploy 停） | VPS 门控仍生效 |
| Azuro | ✓ | ✓ | ✓ | ✗ | http_ws | — | paused | ✗ | ✗ | — | collector 挂着但 collect:false |
| PredictFun | ✓ | ✓ | ✓（报价） | ✓ | vps_http_ws | true | done | ✓（非 Save） | ✗ | predictfun-collector（**deploy 停**） | Hybrid；激活分叉 |

### 字段语义分类（PRIMARY）

| 字段 | PRIMARY CATEGORY | 实际兼职 |
|------|------------------|----------|
| `id` | A. Venue Identity | — |
| `dir` | A. Venue Identity / 路径映射 | E（Node require 路径） |
| `sort` | H. UI Metadata | 间接影响 ALL_PLATFORMS 顺序 → D/Activation 默认序 |
| `collect` | **D. Activation**（采集是否纳入 runtime） | 被误读为 B. Capability；VPS 馆表示「产品有采集」而非 Browser Save |
| `bet` | **D. Activation**（是否允许 getProvider） | 被误读为 B；与 `adapter.provider` 应对齐 |
| `collector`（adapter） | C. Implementation Existence | 有代码 ≠ 已启用 |
| `provider`（adapter） | C. Implementation Existence | 有代码 ≠ 已启用（还需 manifest.bet） |
| `collectionMode` | **E. Runtime / Deployment Topology**（+ G. Transport 描述） | 唯一驱动 VPS ownership；**不是** intrinsic capability |
| `pluginOnly` | **I. Legacy / 文档标注**（无运行时读） | 名字误导：≠「只能 Plugin」 |
| `implementation` | **D. Activation 标注**（paused/done） | 无运行时分支；与 adapter 空壳/collect false 人工同步 |
| `saveMatchIntervalMs` | **I. Dead / 未接线 Policy** | 采集间隔在各 collect.ts 硬编码 |
| `streamMeta` | H. UI Metadata（经 listPlatforms） | 无 UI 消费者 → 近死 |
| `collectionDesc` | H. UI Metadata | 同上 |
| `label` / `labelZh` | H. UI Metadata | 经 listPlatforms；Web 多用 id 字符串 |
| `icon` | H. UI Metadata | `icons.ts` → PlatformIcon |
| `a8Channel` | I. Legacy 标注 | 无运行时读 |

---

# 5. Manifest Field Audit

对每个字段按强制 12 问压缩回答（基于真实调用链）。

## 5.1 `id`

1. **谁读**：几乎所有 registry API、`PlatformId` 对齐、UI  
2. **何处**：`meta.ts`、`adapters.ts`、`paths.js`、全站  
3. **干什么**：Venue 主键  
4. **运行时必要**：是  
5. **Adapter 重复**：`adapter.id`  
6. **其他重复**：`api-contract`、`shared/platforms`、chrome、client-core  
7. **删除影响**：系统崩溃  
8–10. **可推导？**：目录名可猜，但 canonical casing（`XBet`/`PredictFun`）必须配置或单一权威  
11. **保留**：是  
12. **层**：Catalog / Identity（CODE 或单一 Catalog）

## 5.2 `dir`

1–3. `paths.js` / `platformDir` → `requirePlatform`、探针路径  
4. Node 侧必要；浏览器少用  
5. 可与文件夹名约定一致（现已基本一致）  
6. 无第二份  
7. 删除则 Node 加载路径回退 `id.toLowerCase()`（已有 fallback）  
8–9. **可从目录推导**（若强制约定）  
10. 否  
11. 可保留或 DERIVE  
12. Catalog 映射

## 5.3 `sort`

1–3. `PLATFORM_REGISTRY` 排序 → `ALL_PLATFORMS` 顺序 → 账号默认序 / UI  
4. UI/产品序，非采集必要  
5–6. 无  
7. 改变 UI/账号默认顺序  
8–10. 不可从代码推导（产品决策）  
11. **保留为 CONFIG**  
12. UI / Activation 默认序

## 5.4 `collect`

1–3. `collectPlatformIds` → `buildCollectorFactories`；`platformSupportsCollect`；CollectConfig 初始化遍历的是 ALL_PLATFORMS 而非 collect 列表；`browserSaveMatchPlatformIds` 需 collect∧¬vps  
4. **运行时必要**（浏览器 collector 是否注册）  
5. **与 `adapter.collector` 重复且会漂移**（DEV warn）  
6. 无第二权威，但 SABA/IMT 证明「有 collector 代码」≠ collect true  
7. 改 false → 停止该馆 browser collector 注册  
8. **不能**仅从 adapter 推导（有意关闭采集但保留 bet）  
9. adapter 只能证明「有实现」  
10. 否  
11. **保留，但应明确是 Activation，不是 Capability**  
12. Activation

## 5.5 `bet`

1–3. `platformSupportsBet` → `getProvider` 门控；`betPlatformIds` → `supportedBetProviders`、诊断扩展 UI  
4. 运行时必要（下注）  
5. 与 `adapter.provider` 重复（DEV warn）  
6. 无  
7. bet false → getProvider 恒 undefined，即使有 provider 代码  
8–9. 同 collect：关闭下注是配置决策  
11. 保留为 Activation  
12. Activation

## 5.6 `collectionMode`

1–3. **关键读路径**：`isVpsOwnedPlatformCollect` / `browserSaveMatchPlatformIds`（前后端）；`listPlatforms`；文档/checklist  
4. **`vps_http_ws` 分支是运行时必要**；其余取值（http_mqtt 等）**无代码分支**，仅描述  
5. Adapter 不表达 mode  
6. deploy/ecosystem 用进程名表达「是否真在跑 VPS」，另一套  
7. 若 PM/PF 改非 vps_http_ws → Browser Save 解禁 → **可抹局盘（高危）**  
8. 不可从 adapter 完整推导（同一馆可 hybrid）  
9. adapter.collector 存在只证明有浏览器循环，不证明谁写 platform_*  
10. **本身就是 Runtime Policy**  
11. **必须保留 `vps_http_ws`（或等价 ownership flag）**；其它 enum 值可降为文档/UI  
12. Runtime Policy / Ownership

### 取值实证

| Mode | 出现馆 | 代码是否分支 |
|------|--------|--------------|
| `http_mqtt` | OB | 否（仅描述） |
| `http_ws` | RAY, TF, IA, Azuro | 否 |
| `http_poll` | PB, IMT | 否 |
| `parse_ws` | SABA | 否 |
| `aggregator_ws` | IM, XBet | 否 |
| `plugin_http` | HG, Dex | 否 |
| `plugin_graphql_ws` | Stake | 否 |
| `plugin_http_ws` | Limitless | 否 |
| **`vps_http_ws`** | PM, PF, SXBet | **是**（Save* 门控） |

## 5.7 `collectionDesc`

1–3. 仅 `feeds.listPlatforms`  
4. 非运行时；且 `/api/platforms` 无仓内消费者  
5–6. 与 README 重复  
7. 删了几乎无行为变化  
8–10. 可从代码/README 写，不必双写  
11. 可迁文档或生成；暂留无害  
12. UI Metadata（弱）

## 5.8 `implementation`

1–3. 仅 `listPlatforms`  
4. **无** `implementation === "paused"` 运行时判断（全仓代码搜索确认）  
5. paused 馆用「空 adapter」或 `collect/bet:false` 实际停用  
6. deploy 脚本另停 VPS 进程  
7. 改 paused **alone 不改变行为**  
8–10. 不可自动等于「无代码」——Azuro/Dex 反例  
11. 若保留，必须定义为 Activation 标签并接线，或删除改用 collect/bet/adapter  
12. Activation 标注（当前未接线）

## 5.9 `pluginOnly`

1–3. **仅类型定义 + 文档**；**零运行时读**  
4. 否  
5. Stake/Limitless 行为在 collect 实现里硬编码依赖插件  
6. chrome-extension 独立平台表  
7. 删除 **零行为变化**  
8–10. 不能表示「只能 Plugin」——PM/PF 反例  
11. **不应作为能力开关**；若保留应改名表达「UI/扩展优先」或删除  
12. Legacy / docs hint

## 5.10 `saveMatchIntervalMs`

1–3. 仅类型 + manifest；**无读取**  
4. 否；真实间隔在各 `collect.ts`（如 Stake `LOOP_MS=30000`，Limitless `DISCOVERY_MS=60000`，PM Index `30000`）  
7. 删除无行为变化  
11. 删除或真正接线；现状是死字段  
12. Dead Collection Policy

## 5.11 `streamMeta`

1–3. 仅 listPlatforms  
4. 否  
7. 删无行为变化  
11. UI 装饰或删除  
12. UI Metadata（弱）

## 5.12 `label` / `labelZh` / `icon` / `a8Channel`

| 字段 | 消费者 | 结论 |
|------|--------|------|
| label/labelZh | listPlatforms only | 弱 UI；Web 多用 id |
| icon | `icons.ts` → PlatformIcon | **保留**；UI Metadata；Azuro 无 icon |
| a8Channel | 无运行时读 | Legacy 标注 |

---

# 6. Adapter Capability Audit

## 6.1 Adapter 实际暴露

| Venue | collector | provider | 额外（非契约） |
|-------|-----------|----------|----------------|
| OB/RAY/IA/PB/Stake | ✓ | ✓ | MQTT/WS 模式切换等 |
| SABA/IMT | ✓（未进 runtime） | ✓ | — |
| Limitless | ✓ | ✗ | plugin transport |
| Polymarket/PredictFun | ✓（报价/Index） | ✓ | quote hub、检测、资金路径 |
| Dex | ✓（未启） | ✓（bet:false 挡住） | — |
| Azuro | ✓（未启） | ✗ | — |
| IM/TF/XBet/HG/SXBet | ✗ | ✗ | 空壳；部分目录仍有旧 collect 文件 |

## 6.2 「adapter.collector !== undefined ⇒ 有 collection capability？」

**语义上接近 Implementation Existence，不是 Activation，也不是「会写 platform_*」。**

证据：

1. Runtime 还要 `manifest.collect === true` 才 `buildCollectorFactories`。  
2. PM/PF 的 collector **不** SaveMatch；capability 是「浏览器报价同步」，discovery 在 VPS。  
3. SABA/IMT 有 collector 且会调用 `saveMatch`，但因 collect:false **永不启动**。

## 6.3 「adapter.provider !== undefined ⇒ 有 betting capability？」

**同样：有实现 ≠ 已启用。**

`getProvider` 先查 `platformSupportsBet`（manifest.bet）。Dex 有 provider 但 bet:false → 运行时不可下注。

另：PredictFun/Polymarket 的「下单」远超 `PlatformProvider` 表面方法（vault、relayer、fee、house），**契约无法完整描述 Venue 能力**。

## 6.4 结论

**今天不能仅从 Adapter 推导「Venue 能做什么的产品真相」**，因为：

- Activation 在 manifest；  
- Ownership 在 collectionMode；  
- VPS 启停在 deploy；  
- 大量特殊能力在馆专属模块，不在 `PlatformAdapter`。

方向「Adapter 表达能力」成立，但需扩展契约或接受「能力 = 模块存在性探测」，且与 Activation 分离。

---

# 7. CollectionMode Audit

## 7.1 它是不是 Venue 能力？

**否。** 它是（或意图是）**Runtime / Deployment Topology + Transport 描述**。

唯一强制语义：

```ts
collectionMode === "vps_http_ws"  ⇒  VPS owns platform_* writes
```

其余字符串是人类可读标签，**没有 switch/case 消费**。

## 7.2 一个 Venue 能否同时具备 Browser Quote/Order + Plugin UI + VPS Discovery？

**能。Polymarket / PredictFun 即实证。**

| 能力面 | Polymarket | PredictFun |
|--------|------------|------------|
| VPS discovery → platform_* | ✓（PM 默认跑；PF deploy 可停） | ✓ 代码存在 |
| Browser collector → fo | ✓ Index + Market WS | ✓ 同构 |
| Browser SaveMatch | ✗ 门控 | ✗ 门控 |
| Provider bet/order | ✓ | ✓ |
| pluginOnly 标记 | true | true |
| Chrome 扩展 | 有 polymarket content | 扩展枚举**未列入** PredictFun |

因此 `collectionMode: vps_http_ws` + `pluginOnly: true` + browser `collector` + `provider` **同时成立** → collectionMode **绝非** intrinsic capability。

## 7.3 IA 的灰色地带

IA `collectionMode: http_ws`，`collectionDesc` 写「插件 HTTP」。Mode 未标 `plugin_*`，说明 **plugin_* 也不是强制分类枚举**，更多是文档约定。

---

# 8. pluginOnly Audit

## 8.1 `pluginOnly === true` 的 Venue

Stake, Dex, Polymarket, Limitless, PredictFun

## 8.2 逐馆

| Venue | 只能 Plugin？ | VPS collector？ | Browser Quote/Order？ | Browser Save？ | 实际含义 |
|-------|---------------|-----------------|----------------------|----------------|----------|
| Stake | 采集强依赖扩展 | 否 | Order ✓；采集经插件 | ✓（经插件拉数再 Save） | 扩展优先的 browser 馆 |
| Dex | 设计为插件 HTTP | 否 | 代码有，已 paused | 否（collect false） | paused |
| Limitless | 采集需扩展 | 否 | Quote/collect ✓；无 provider | ✓ | 扩展优先 collect-only |
| Polymarket | **否** | **是** | Quote+Order ✓ | **否**（VPS own） | **命名严重误导** |
| PredictFun | **否** | **是**（可停） | Quote+Order ✓ | **否** | **同上** |

## 8.3 字段应表达什么

不是「只能 Plugin」。

更接近：

- `transportHint: "prefers_extension"`（弱提示），或  
- 拆成真实策略：`discoveryOwner` / `quoteTransport` / `orderTransport`

**当前零运行时消费 → 改名/删除都不会立刻改行为**；风险在人类/AI 误读。

---

# 9. implementation / paused Audit

## 9.1 `paused` 是什么？

对照代码，**不是单一含义**：

| 模式 | 馆 | 含义 |
|------|----|------|
| 空 adapter + collect/bet false | IM, TF, XBet, HG, SXBet | 「产品暂停」：UI 仍见 ID，无运行时能力 |
| 有 collector 代码 + collect false | Azuro, Dex | 「实现还在，未激活」 |
| implementation done + deploy 停进程 | PredictFun VPS | **manifest 说 done，生产 collector 停** |
| implementation paused + vps_http_ws 仍门控 | SXBet | 暂停但仍禁止 Browser Save（正确保护） |

对应你的选项：

1. 不存在？ → **否**（仍在 ALL_PLATFORMS）  
2. 没有实现？ → **有时否**（Azuro/Dex 有代码）  
3. 已实现暂不启用？ → **部分是**  
4. 已实现暂停 collection？ → **部分是**（SABA/IMT 甚至 implementation=done）  
5. 其他 → **标签未接线；真实停用靠 collect/bet/空 adapter/PM2**

## 9.2 运行时判断

**不存在** `implementation === "paused"` 分支。

影响范围：仅 `/api/platforms` 响应字段 + 文档/运维心智。

## 9.3 风险

把 paused 当成「Catalog 删除」会破坏：历史订单、账号 provider、合场 Sources、用户 providerSortValue。

---

# 10. ALL_PLATFORMS Dependency Graph

## 10.1 真实来源

```
manifest.json
  → meta.ts PLATFORM_REGISTRY (sort)
  → ALL_PLATFORMS = map(id)
  → @changmen/venue-adapter/registry
  → client/web/src/types/userConfig.ts re-export
```

## 10.2 消费者（完整）

| 消费者 | 用途 |
|--------|------|
| `userConfig.createDefaultUserConfig` | `providerSortValue` 默认 = 全量 |
| `mergeProviderSortValue` | 用户排序缺馆则 append |
| `UserConfigPanel` / `userConfigFormState` | 平台多选、固定平台、拖拽排序 |
| `AccountEditPanel` | 账号 provider 选择列表 |
| `AdminAccountsView` | 按平台聚合 |
| `collectStore.init` | CollectConfig Map **对每个 ALL_PLATFORMS 建键**（默认 false） |
| `extensionPrefs` | allowed platforms 校验 |
| `UserDiagExtensionsTab` | 用 `betPlatformIds()` 而非 ALL（子集） |
| `CollectConfigPanel` | 用 `browserSaveMatchPlatformIds()`（子集） |

旁路重复列表：

- `packages/client-core/.../platforms.ts` — **过期**（账号排序）  
- chrome-extension `PLATFORMS` — **过期**  
- `check-collect-platforms.js` — **过期**

## 10.3 若把 manifest 改成「仅当前启用 Venue」

| 区域 | 后果 |
|------|------|
| UI 平台列表 / 账号选择 | paused/历史馆消失 → 无法选、排序丢、旧账号显示异常 |
| CollectConfig | 键集收缩；旧配置恢复行为变化 |
| extensionPrefs allowlist | 可能拒绝仍合法的历史 provider |
| Bet/Quote 页 | 依赖账户/合场数据多于 ALL_PLATFORMS，但排序/过滤会伤 |
| paused Venue | **从 Catalog 抹掉**（与「暂停≠不存在」冲突） |
| VPS ownership helpers | 若 SXBet 从 manifest 删除 → `isVpsOwned` 变 false → **Browser Save 解禁（灾难）** |
| Runtime | collect/bet false 馆本就不启；删条目影响更大的是 Catalog 语义 |
| Extension | 本已不同步，会更乱 |

**结论：manifest 今日 = Catalog ∪ 部分 Activation ∪ 部分 Runtime Policy。改成 activation-only 必须先拆出独立 Catalog，否则高危回归。**

---

# 11. Browser vs Plugin vs VPS Ownership

## 11.1 谁写 `platform_*`？

| Authority | 机制 |
|-----------|------|
| **Runtime ownership 标志** | `collectionMode === "vps_http_ws"` |
| 前端门控 | `meta.isVpsOwnedPlatformCollect` → match.ts / collectStore |
| 后端门控 | `feeds.isVpsOwnedPlatformCollect` → store.js ignore Save* |
| CollectConfig UI | `browserSaveMatchPlatformIds` 排除 VPS |

**不是** `pluginOnly`，**不是** `implementation`，**不是** adapter 形状。

## 11.2 分类

### Browser-owned（Save* 允许且 runtime collector 启）

OB, RAY, IA, PB, Stake, Limitless

### Plugin-transport but Browser-owned Save

Stake, Limitless（经扩展拉数，仍浏览器 Save*；属 Browser-owned 子类）

### VPS-owned（Save* 禁止）

Polymarket, PredictFun, SXBet（含 paused）

### Hybrid（VPS discovery + Browser quote/order）

Polymarket, PredictFun（设计如此）

### Collect 代码存在但未激活（既非 Browser Save UI，也不启 collector）

SABA, IMT（bet 仍可用）, Dex, Azuro

### Catalog-only / 空壳 paused

IM, TF, XBet, HG, SXBet（adapter 空）

## 11.3 VPS 馆是否允许 Browser SaveMatch/SaveBet？

**不允许。** 三道门。Authority = **Runtime Ownership Policy**（manifest `collectionMode`），不是 Capability。

## 11.4 该判断属于 Capability 还是 Runtime Ownership？

**Runtime Ownership / Policy。**  
Capability 应是「能否 discovery / 能否 quote / 能否 order」；Ownership 是「当前由谁写 platform_*」。

---

# 12. Fact Duplication Matrix

格式：FACT → SOURCE → SECONDARY → DERIVED → CONSUMER → DRIFT RISK

### Venue ID

- **SOURCE**: 应为单一 Catalog（现为 manifest + api-contract 双写）  
- **SECONDARY**: shared/platforms, client-core ALL, chrome PLATFORMS, scripts  
- **CONSUMER**: 全站  
- **DRIFT**: **HIGH**（client-core / chrome 已漂）

### Directory

- **SOURCE**: manifest.dir（或约定 = 文件夹）  
- **SECONDARY**: 无  
- **DRIFT**: LOW

### Sort

- **SOURCE**: manifest.sort（CONFIG）  
- **DERIVED**: ALL_PLATFORMS 顺序  
- **DRIFT**: LOW（单源）

### Collect capability（有没有采集实现）

- **SOURCE（应）**: `adapter.collector != null` 或 VPS 包存在  
- **DUPLICATE**: manifest.collect（实为 activation）  
- **DRIFT**: **HIGH**（SABA/IMT/Dex/Azuro）

### Bet capability

- **SOURCE（应）**: `adapter.provider != null`  
- **DUPLICATE**: manifest.bet  
- **DRIFT**: MEDIUM（Dex）

### Collector existence / Provider existence

- **SOURCE**: adapters.ts 注册  
- **SECONDARY**: DEV console.warn 对照 manifest  
- **DRIFT**: MEDIUM（仅 warn）

### Browser collector 是否运行

- **SOURCE**: buildCollectorFactories = collect∩adapter  
- **DRIFT**: 与「能力」混淆时 HIGH

### Plugin collector

- **SOURCE**: 各馆 collect 实现 + chrome-extension  
- **DUPLICATE**: pluginOnly（未接线）、collectionMode plugin_*（未分支）  
- **DRIFT**: HIGH（心智）；运行时靠实现

### VPS collector

- **SOURCE**: `server/collectors/*` + PM2  
- **DUPLICATE**: collectionMode vps_http_ws、docs  
- **DRIFT**: **HIGH**（PF：manifest done vs deploy 停）

### Collection mode

- **SOURCE**: manifest.collectionMode  
- **DERIVED**: isVpsOwned / browserSave lists  
- **DRIFT**: LOW（单源）；但非 vps 值无代码约束

### Browser Save ownership / VPS ownership

- **SOURCE**: collectionMode === vps_http_ws  
- **SECONDARY**: 注释/文档  
- **DRIFT**: LOW（实现一致）；删除/改 mode 则 CRITICAL

### Activation（用户 Save 开关）

- **SOURCE**: CollectConfig（RDS/profile）  
- **DERIVED view**: CollectConfigPanel（仅 browserSave 馆）  
- **DRIFT**: LOW

### Activation（馆级 collect/bet）

- **SOURCE**: manifest.collect/bet  
- **DRIFT**: 与 implementation/PM2 三角漂移 → HIGH

### Paused state

- **SOURCE（名义）**: implementation  
- **SOURCE（实际）**: 空 adapter + collect/bet + PM2  
- **DRIFT**: **HIGH**

### Collection interval

- **SOURCE**: 各 collect.ts 常量  
- **DUPLICATE**: saveMatchIntervalMs（死）  
- **DRIFT**: HIGH（字段撒谎）

### Stream protocol

- **SOURCE**: 实现代码  
- **DUPLICATE**: streamMeta（弱）  
- **DRIFT**: MEDIUM

### UI description / icon / label

- **SOURCE**: manifest  
- **DRIFT**: LOW–MED（Desc 无人用）

---

# 13. Current Architecture Problems

1. **manifest 身兼 Catalog + Activation + Runtime Policy + UI Meta** → AI/人无法判断改哪  
2. **`collect`/`bet` 被当成 capability，实际是 activation**；与 adapter 双源  
3. **`pluginOnly` 语义谎言**（PM/PF）且无运行时  
4. **`implementation` 未接线**；paused 靠手工三处同步  
5. **死字段**：saveMatchIntervalMs、a8Channel、近死的 Desc/streamMeta  
6. **列表多源漂移**：client-core ALL_PLATFORMS、chrome、check-collect 脚本  
7. **VPS activation 在 deploy，不在 manifest** → PredictFun 典型分叉  
8. **`PlatformAdapter.meta` 死类型**，契约声称与 manifest 对齐却从不填充  
9. **collectionMode 除 vps_http_ws 外无强制力** → 分类枚举过度承诺  
10. **SABA/IMT**：implementation=done、有 collector、collect=false → 「暂停采集保留下注」未文档化为正式 Activation 模式

---

# 14. Proposed Target Architecture

评估你提出的：

```
Catalog → Adapter → Activation → Runtime Policy → Runtime Registry
```

## 14.1 正确的部分

- Catalog ≠ Activation：paused 必须仍存在 → **正确且已被 ALL_PLATFORMS 依赖证明**  
- Adapter 表达能力：方向正确；今日已部分做到（collector/provider）  
- Runtime Policy 表达 where/how：`vps_http_ws` 门控已证明 ownership 属于 Policy  
- ONE FACT → ONE AUTHORITY：与当前最大痛点对齐

## 14.2 与现状冲突

- manifest 已是「胖 Catalog」；直接瘦成 `{id,dir,sort}` 会丢掉 **正在生效的** collect/bet/vps 门控，除非先迁移  
- Adapter 契约不足以表达 VPS discovery / plugin transport / hybrid  
- Activation 已有三处（manifest flags、CollectConfig、PM2）——再加 activation.json 可能变成第四处，除非合并  
- api-contract PlatformId 仍需与 Catalog 同步（类型层）

## 14.3 需要调整

- 不要四套平行 JSON；优先 **DERIVE**  
- `collectionMode` 全枚举 → 收敛为 **ownership + 可选 transport hint**  
- `pluginOnly` 改名或删除  
- VPS 启停应可被同一 Activation/Policy 描述（至少文档+校验，长期可读配置）

## 14.4–14.10 见 §15 / §18

---

# 15. Minimal Migration Plan

## OPTION A — 不改架构，只消最危险重复

**做什么**

1. 删除或生成对齐：`client-core` ALL_PLATFORMS ← 从 registry 导出/生成  
2. 给 chrome / check-collect 脚本加「与 manifest 对账」测试或生成  
3. DEV warn 升级为 CI 测试：adapter.collector ↔ manifest.collect；provider ↔ bet（允许显式 `activation.suppress` 注释列表：SABA/IMT）  
4. 文档标注：pluginOnly 无运行时；implementation 无运行时；saveMatchIntervalMs 死字段  
5. **不删字段**（避免无消费者假设误伤）

**改动量**：小（测试+1–2 处列表对齐）  
**风险**：低  
**收益**：立刻减少 AI 漏改  
**维护 / AI**：中等改善

## OPTION B — 小幅调整边界（推荐作为下一实施阶段）

**做什么**

1. **语义冻结（文档+类型注释，代码行为不变）**  
   - manifest = Catalog + Activation flags + Ownership mode  
   - `collect`/`bet` = Activation  
   - `collectionMode` 仅 `vps_http_ws` 为硬策略；其它为 hint  
2. **Ownership 显式化（可仍存在于 manifest）**  
   - 例如保留 `collectionMode` 或增加 `platformWriteOwner: "browser"|"vps"`（二选一，勿双写）  
3. **Capability 以 Adapter 为准**  
   - Runtime Registry：`enabledCollect = activation.collect && adapter.collector`（已是）  
   - 增加测试锁定 SABA/IMT 模式  
4. **Activation 与 Catalog 在同一文件分区**，而非新文件：  
   ```json
   { "id", "dir", "sort", "icon",
     "activation": { "collect": true, "bet": true },
     "runtime": { "platformWriteOwner": "vps" } }
   ```  
   （结构迁移可渐进；键 nested 非必须）  
5. **不把 manifest 改名为 activation.json**（见下）

**改动量**：中（类型/测试/少量读取重构）  
**风险**：中（若动 ownership 键）  
**收益**：心智清晰，AI 可定位  
**维护 / AI**：明显改善

## OPTION C — 完整 Adapter-driven

**做什么**

- Catalog 由 adapter 目录扫描或 `PLATFORM_ADAPTERS` 推导  
- Activation 独立文件  
- Runtime Policy 独立  
- 生成 Runtime Registry  

**改动量**：大（加载、打包、后端 feeds、扩展、deploy）  
**风险**：高（Catalog 收缩回归）  
**收益**：长期理论最优  
**维护 / AI**：稳态优；迁移期极差

## 比较（不打分）

| | A | B | C |
|--|---|---|---|
| 代码改动 | 最小 | 中等 | 大 |
| 风险 | 低 | 中（可控） | 高 |
| 收益 | 修漂移 | 定边界 | 架构统一 |
| 长期维护 | 仍靠纪律 | 边界清晰 | 最好（稳态） |
| AI Coding | 仍多源 | 单文件分区可找 | 扫描推导最友好 |

## 是否需要新 Catalog？

**短期不需要。** manifest 已充当 Catalog；缺的是语义分区与去重。

## Catalog 能否由 adapter directory 推导？

**技术上可以**（`PLATFORM_ADAPTERS` 已是全量注册），但：

- sort/icon/UI 仍要配置  
- paused 空壳仍要占位（否则历史馆消失）  
- api-contract enum 仍要更新  

故：**Adapter 可驱动「实现集」；Catalog 仍需显式 ID 列表（可与 adapters 对账）。**

## 是否需要 Activation 文件？

**不必须。** 今日 activation 已在 manifest.collect/bet + CollectConfig + PM2。  
新建 activation.json **仅当**同时从 manifest 删除这些字段并完成迁移；否则变成第四真相。

## manifest → activation.json？

**不建议。** 名字会诱导「只有启用馆」，与 ALL_PLATFORMS 风险正相反。更好：保留 manifest 作 Catalog，或改名 `venues.json` / `catalog.json`。

## 更简单方案？

**OPTION A + 对 B 的「语义冻结注释/测试」**，暂不 nested JSON。

---

# 16. Risks / Regression Points

| 回归点 | 触发 | 后果 |
|--------|------|------|
| 从 manifest 移除 paused 馆 | Catalog=Activation | 账号/排序/历史订单 UI 坏 |
| 改 PM/PF 的 collectionMode 离 vps_http_ws | 误「清理」 | Browser Save 解禁抹局盘 |
| 删 SXBet manifest 行但留订单 | 同上 | Save 门控失效 |
| 以为 pluginOnly 控制运行时 | 误改 | 无效果或误导修复 |
| 只改 manifest.collect 不改 adapter | — | DEV warn；行为按 collect |
| 只改 adapter 不改 collect | — | 新馆不启动 |
| 对齐 client-core 列表时改排序 | sortByProvider | 账号显示序变化（可接受） |
| 恢复 PF VPS collector | deploy only | 与浏览器报价并存；勿开 Browser Save |
| CI 强制 collect↔collector 且未豁免 SABA/IMT | 误测 | 假失败 |

---

# 17. Open Questions

1. **SABA/IMT `collect:false` 是否为有意产品决策**（只下注不合场采集）？还是历史遗漏？需产品确认。  
2. **`/api/platforms` 是否有仓外消费者**（运维面板、旧脚本）？若无，Desc/implementation/streamMeta 可标废弃。  
3. **PredictFun VPS collector 暂停是临时还是长期**？若长期，manifest.collect/implementation 是否应反映「discovery 停、报价仍开」？  
4. **IA 是否应标 plugin 类 mode**？行为与文档不一致。  
5. **Azuro/Dex**：保留挂载的 collector/provider 是否为「随时可开」策略？  
6. **Chrome 扩展是否要支持 PredictFun/Limitless 枚举**？现网依赖程度未在本次全部验证。  
7. **Account pause（账号级）与 Venue paused** 命名易混——文档是否要统一术语？

---

# 18. Final Recommendation

## 对目标分层图的裁决

**方向成立，但不要一次性拆成四套配置。**

当前已满足的部分：

- Catalog 存在（manifest 全量 ID，含 paused）  
- Runtime ownership 门控存在（vps_http_ws）  
- Runtime Registry 混合驱动已存在（manifest filter × adapter factory）

未满足的部分：

- Capability 权威仍被 manifest.collect/bet 抢走  
- Activation 分散且 `implementation` 未接线  
- 多份平台列表漂移  

## 若现在让 AI 团队继续维护：优先修什么？

1. **消灭列表漂移**（client-core ALL_PLATFORMS、chrome、scripts）——最高 ROI  
2. **写清并测试三条硬规则**：  
   - Catalog ⊇ 历史馆  
   - `vps_http_ws` ⇒ 禁止 Browser Save*  
   - Runtime collect = activation.collect ∧ adapter.collector  
3. **给 SABA/IMT/Dex/Azuro 的 collect↔adapter 分叉加显式豁免表**，避免 AI「帮你改成一致」破坏产品  
4. **禁止再增加死字段**；saveMatchIntervalMs / pluginOnly / implementation 要么接线要么标 DEPRECATED  
5. **不要**把 manifest 改成启用列表；**不要**新建并行 Catalog/Activation 文件直到字段迁完  

## CODE vs CONFIG vs DERIVE

| 必须 CODE | 必须 CONFIG | 应 DERIVE |
|-----------|-------------|-----------|
| Adapter collector/provider 实现 | sort, icon, label | ALL_PLATFORMS（← catalog ids） |
| VPS collector 实现 | Venue 级 collect/bet activation | browserSaveMatchPlatformIds |
| 馆专属业务（PM vault 等） | platformWriteOwner / vps_http_ws | isVpsOwnedPlatformCollect |
| | 用户 CollectConfig | buildCollectorFactories map |
| |（可选）UI Desc | betPlatformIds / collectPlatformIds |

## AI Coding 视角

当前为何 AI 常漏改：

- 同一事实最多四处（manifest、adapters、api-contract、chrome/client-core）  
- 字段名撒谎（pluginOnly、collect、implementation、saveMatchIntervalMs）  
- 「改新馆清单」文档要求改 manifest，但真实 VPS 启停在 deploy  
- Runtime 与 UI 用不同子集函数，AI 容易只用 ALL_PLATFORMS  

最适合 AI 的 SoT 结构：

1. **一个 Catalog 文件**（全量存在）  
2. **Adapter 代码即能力**（有无 collector/provider/VPS 包）  
3. **Activation 显式且少**（collect/bet/用户开关/PM2 对账测试）  
4. **所有列表由生成或测试锁定 DERIVE**  
5. **CI drift 测试** > 新抽象层  

---

## Acceptance Checklist（本审计）

- [x] 全仓库真实搜索完成  
- [x] manifest 字段消费者分析  
- [x] ALL_PLATFORMS 依赖链  
- [x] collectionMode / pluginOnly / implementation 语义  
- [x] Browser/Plugin/VPS ownership  
- [x] Adapter capability 来源  
- [x] Fact Duplication Matrix  
- [x] Polymarket / PredictFun  
- [x] ≥3 Browser（OB/RAY/PB）+ ≥2 Plugin（Stake/Limitless）  
- [x] 未改生产代码  
- [x] 最小迁移方案 A/B/C  
- [x] 回归点 / DERIVE-CONFIG-CODE  

---

# Phase 2 — Fact Ownership Design

> **Date**: 2026-09-19 (same day, second pass)  
> **Scope**: READ → TRACE → DESIGN only. No production code / no new config files / no field deletion.  
> **Correction to Phase 1**: `adapter.collector` + `manifest.collect=false` is **not automatically Drift**. It can be two different facts (Implementation vs Activation). Phase 1 §12 labeled several of these as HIGH drift; this phase reclassifies them.

---

# 19. Fact Ownership Model

## 19.1 Corrected mental model (proven against code)

```
Adapter (CODE)
  collector? / provider? / VPS package exists?
        ↓
  IMPLEMENTATION exists (capability-in-code)

Manifest flags (CONFIG / Product Activation)
  collect / bet
        ↓
  PRODUCT ENABLEMENT for browser runtime paths

collectionMode / ownership (RUNTIME POLICY)
  especially vps_http_ws
        ↓
  WHERE / HOW collection infrastructure runs
  (who may write platform_*)

CollectConfig (USER CONFIG)
        ↓
  whether SaveMatch/SaveBet are allowed for this user

deploy/PM2 (DEPLOYMENT ACTIVATION)
        ↓
  whether VPS daemon process is running
```

**This model holds** for Changmen today:

| Claim | Evidence |
|-------|----------|
| `adapter.collector` = implementation | SABA/IMT/Dex/Azuro: collector wired on adapter; `buildCollectorFactories` ignores them when `collect:false` |
| `manifest.collect` = enablement of **browser collector registration** | `collectPlatformIds()` → `buildCollectorFactories()` only |
| `collectionMode === vps_http_ws` = ownership topology | `isVpsOwnedPlatformCollect` gates Save* FE+BE; independent of collect/bet |
| Hybrid OK | PM/PF: collect true + vps_http_ws + browser collector (quote) + provider |

**Where it does NOT fully hold (nuance, not refutation):**

1. For VPS venues, `collect:true` does **not** mean “VPS discovery is running” — that is deploy. It means “register browser collector factory” (PM/PF quote loops).  
2. `implementation: paused` is **not** wired into the model; real pause uses empty adapter and/or collect/bet false and/or PM2.  
3. DEV warns in `adapters.ts` treat collect↔collector mismatch as error — that warn **embeds the wrong ontology** (treats dual-fact as drift).

## 19.2 CODE / CONFIG / RUNTIME / DERIVED

| Kind | Meaning | Examples |
|------|---------|----------|
| **CODE** | Exists only as implementation | `adapter.collector`, `adapter.provider`, `server/collectors/*`, chrome content handlers |
| **CONFIG** | Product/UI/catalog choices | Venue id list, sort, icon, label, `collect`, `bet`, user CollectConfig |
| **RUNTIME POLICY** | Where/how infra runs | `collectionMode` / VPS ownership; (deploy process enablement is **Deployment Activation**, adjacent) |
| **DERIVED** | Computed from above | `ALL_PLATFORMS`, `browserSaveMatchPlatformIds`, `isVpsOwned*`, `buildCollectorFactories` map, `betPlatformIds` |

## 19.3 VENUE FACT OWNERSHIP MATRIX

| Fact | 当前 Source | 应有 Source | Kind | 是否重复事实？ | 是否需要迁移？ |
|------|-------------|-------------|------|----------------|----------------|
| Venue ID | manifest + api-contract + shared/platforms + copies | **Catalog primary** = manifest id（或 adapters 对账）；api-contract 类型镜像 | CONFIG (+ type CODE) | 多份 ID 列表 = **真重复** | 对齐/生成 copies；勿删 Catalog |
| dir | manifest | Catalog 或约定 = 文件夹名 | CONFIG（可 DERIVE） | 弱 | 可选 DERIVE |
| sort | manifest | CONFIG | CONFIG | 否 | 否 |
| label / labelZh | manifest → listPlatforms | CONFIG / UI | CONFIG | 弱（Web 多用 id） | 可选 |
| icon | manifest → icons.ts | CONFIG | CONFIG | 否 | 否 |
| collector implementation | adapter.collector | **CODE** | CODE | 否 | 否 |
| provider implementation | adapter.provider | **CODE** | CODE | 否 | 否 |
| browser collection (impl) | adapter collect.ts | CODE | CODE | 否 | 否 |
| plugin collection (impl) | adapter + chrome-extension | CODE | CODE | 否 | 否 |
| VPS collection (impl) | server/collectors/* | CODE | CODE | 否 | 否 |
| quote (runtime) | adapter collector / hubs | CODE | CODE | 否 | 否 |
| order / betting (impl) | adapter.provider (+ 馆专属) | CODE | CODE | 否 | 否 |
| **collect enabled** (browser factory) | manifest.collect | **CONFIG Activation** | CONFIG | **≠** adapter.collector | **保留**；纠正“重复”叙事 |
| **bet enabled** | manifest.bet | **CONFIG Activation** | CONFIG | **≠** adapter.provider | **保留** |
| collectionMode | manifest | RUNTIME POLICY | RUNTIME | 否（唯一 vps 权威） | 语义冻结；勿当 capability |
| VPS ownership | collectionMode==vps_http_ws | RUNTIME POLICY | RUNTIME / DERIVED gate | 否 | 否 |
| Browser Save ownership | ¬vps ∧ product paths | DERIVE from ownership + collect | DERIVED | 否 | 否 |
| pluginOnly | manifest（无运行时读） | — | LEGACY | 文档重复 | RETIRE CANDIDATE |
| implementation | manifest → listPlatforms only | — | LEGACY 标注 | 与 activation 真重复心智 | RETIRE CANDIDATE 或降为文档 |
| paused (product) | 空 adapter + collect/bet false | Activation + CODE 形状 | CONFIG+CODE | implementation 字段多余 | 不新增状态机字段 |
| collection interval | collect.ts 常量 | CODE（或未来 POLICY） | CODE | saveMatchIntervalMs 死字段 | 死字段标废弃 |
| stream protocol | 实现代码 | CODE | CODE | streamMeta 弱重复 | 可选废弃 |
| collection description | manifest | docs / UI | CONFIG | 弱 | 可选 |
| UI visibility (platform list) | ALL_PLATFORMS ← manifest | Catalog DERIVE | DERIVED | client-core 旁路列表 = 真重复 | 修旁路 |
| user Save activation | CollectConfig | USER CONFIG | CONFIG | 否 | 否 |
| deploy process enabled | ecosystem + deploy script | DEPLOYMENT ACTIVATION | CONFIG(ops) | 与 manifest.collect **不同层** | 文档化边界；可选对账测试 |

### Capability ≠ Activation（硬规则）

```
Capability (CODE):     adapter.provider !== undefined
Activation (CONFIG):   manifest.bet === true
Runtime use:           getProvider ⇒ bet && provider
```

同理 collect：

```
Capability:  adapter.collector !== undefined
Activation:  manifest.collect === true
Runtime:     buildCollectorFactories ⇒ collect && collector
```

**删除 manifest.collect/bet 会破坏 Activation，不会“消除重复”。**

---

# 20. collect / bet Semantic Audit

## 20.1 Implementation vs Activation model — verdict

**成立。** SABA / IMT / Dex / Azuro 是正面证据，不是必须修掉的 drift。

| Venue | collector CODE | collect CONFIG | 运行时 browser collector | 解读 |
|-------|----------------|----------------|--------------------------|------|
| SABA | ✓ | false | 不启动 | 有实现，产品未开采集；bet 仍开 |
| IMT | ✓ | false | 不启动 | 同上 |
| Dex | ✓ | false | 不启动 | paused 产品；代码保留 |
| Azuro | ✓ | false | 不启动 | 同上 |
| OB | ✓ | true | 启动 | 实现+启用 |
| PM/PF | ✓ | true | 启动（报价，非 Save） | 实现+启用 browser 路径；Save 由 ownership 另控 |

Phase 1 DEV warn「未在 manifest 声明采集」把 **双事实** 误标成 **不一致**。正确 CI 应为：

- `collect:true` ⇒ `adapter.collector` 必须存在（激活不能没有实现）  
- `collect:false` ∧ `adapter.collector` ⇒ **允许**（未启用实现）  
- 可选：显式 allowlist 注释，防止 AI“帮你改成一致”

## 20.2 若删除 `manifest.collect`？

| # | 问题 | 答案 |
|---|------|------|
| 1 | Browser collector 如何知道启动哪些？ | 只能退化为「凡有 collector 就启」→ SABA/IMT/Dex/Azuro 被误启 |
| 2 | CollectConfig 如何知道哪些可采集？ | 今日 UI 用 `browserSaveMatchPlatformIds` = collect∧¬vps；删 collect 后需新 activation 源 |
| 3 | UI 如何知道哪些平台可配置 Save？ | 同上 |
| 4 | paused Venue 如何表达？ | 今日靠空 adapter 和/或 collect/bet false；删 collect 削弱一维 |
| 5 | 新写未启用 Venue？ | **必须**有 Activation=false；仅 CODE 不够 |
| 6 | 灰度启用？ | 改 collect true（+有 collector）即可；无需删代码 |
| 7 | VPS-only？ | ownership=`vps_http_ws`；collect 仍可 true（启 browser quote）或 false |
| 8 | Plugin-only？ | 仍是 CODE（plugin transport）+ collect activation；无独立 pluginOnly 运行时 |
| 9 | Hybrid？ | 已由 collect + vps ownership + provider 组合表达 |

## 20.3 方案比较（collect）

| 方案 | 含义 | 与当前代码 |
|------|------|------------|
| **A** adapter existence = enabled | 有 collector 就启用 | **不符合**（SABA/IMT 反例） |
| **B** adapter = capability；manifest.collect = activation | 双事实 | **符合当前** |
| **C** adapter capability metadata + 独立 activation 文件 | 显式拆文件 | 语义同 B；多一个 SoT 风险，非必须 |

**最符合当前代码：B。**

## 20.4 bet 审计

消费者：

- `platformSupportsBet` → `getProvider` **硬门控**  
- `betPlatformIds` → `supportedBetProviders`、诊断扩展 UI  
- DEV：`bet:true` 缺 provider 则 warn  

`platformSupportsCollect`：**仅定义/导出，无其他调用方**（collect 路径走 `collectPlatformIds`）。

| 方案 | 结论 |
|------|------|
| A provider existence = bet capability | 对（CODE） |
| B manifest.bet = activation | 对（CONFIG） |
| C 两者都保留 | **应对应当前** |
| D 其他 | 不需要第三字段 |

Dex：`provider` 存在 + `bet:false` → 下注路径关闭。  
SABA/IMT：`bet:true` + provider → 可下注；采集关闭。

**Capability ≠ Activation** 对 bet 同样成立。

## 20.5 两层用户相关开关（勿合并）

```
manifest.collect     → 是否注册 browser collector 工厂（产品级）
CollectConfig[id]    → 是否允许该用户 SaveMatch/SaveBet（用户级）
isVpsOwned           → 是否禁止 Save*（拓扑级，覆盖前两者的 Save）
```

VPS 馆：collector 可跑（fo）；CollectConfig UI 不展示；Save 三道门拒绝。

---

# 21. Catalog vs Activation vs Runtime Policy

## 21.1 collectionMode → COLLECTION TOPOLOGY

**不要再叫“能力”。**

| Topology（产品语言） | 判定（代码） | 代表 |
|----------------------|--------------|------|
| **Browser-owned Save** | ¬vps ∧ collect ∧ browser collector | OB, RAY, PB, IA |
| **Plugin-transport + Browser Save** | plugin 实现 + ¬vps + collect | Stake, Limitless |
| **VPS-owned platform_*** | collectionMode=vps_http_ws | PM, PF, SXBet |
| **Hybrid** | vps_http_ws + browser collector/provider | **PM, PF** |
| **Implemented but collect off** | collector CODE ∧ collect false | SABA, IMT, Dex, Azuro |

逐馆：

| Venue | Topology |
|-------|----------|
| Polymarket | Hybrid（VPS discovery + browser quote/order；Save 禁） |
| PredictFun | Hybrid（同上；**VPS discovery deploy 可另停**） |
| Stake | Plugin-transport Browser Save |
| Limitless | Plugin-transport Browser Save（无 bet） |
| IA | Browser Save（实现可走插件 HTTP，mode 仍 http_ws — hint 不准但不影响门控） |

### 是否拆 runtime topology + transport？

**现阶段不拆。**

理由：除 `vps_http_ws` 外，mode 字符串**无代码分支**；拆字段增加维护面，零行为收益。  
保留单一 `collectionMode`（或未来改名 `platformWriteOwner`）即可；`http_mqtt` 等当作 **文档/UI hint**。

## 21.2 manifest 三个模型 — 哪个符合真实使用？

| 模型 | 内容 | 符合度 |
|------|------|--------|
| **A Catalog**（id/dir/sort/label + 或许 flags） | ALL_PLATFORMS、UI、paused 存在 | **高（必要部分）** |
| **B Activation-only**（id/enabled/sort） | 破坏 Catalog；paused/历史馆 | **低（危险）** |
| **C Runtime Policy-only** | 丢掉 Catalog/UI | **低** |

**真实使用：manifest = A + 嵌入式 Activation + 嵌入式 Runtime Policy（胖文件）。**

这不是理论错误——对中等规模 monorepo，**单文件多区语义**可接受，前提是：

1. 字段语义写清（collect/bet ≠ capability）  
2. 不把整文件改成“仅启用列表”  
3. 列表旁路（client-core/chrome）用 DERIVE/对账消灭真重复  

### 最终裁决（迎合与否）

| 命题 | 裁决 |
|------|------|
| 「manifest 只应保存当前启用 Venue」 | **不成立**（被 ALL_PLATFORMS / paused / 账号 / CollectConfig 键集否定） |
| 「manifest 作为 Catalog 合理」 | **成立** |
| 「必须拆成 catalog.json + activation.json」 | **不必须**；语义分区优先于拆文件 |
| 「不需要 Catalog 文件，只靠 adapter 目录」 | **不成立**：paused 空壳、sort/icon、尚未挂满能力的 ID、api-contract 仍需显式存在集 |

**Changmen 需要手工维护的 Catalog（今日即 manifest 的 id 列表）。**  
Adapter registry 是 **实现集**，是 Catalog 的子集或对账对象，不能单独当 Catalog。

## 21.3 Catalog 三种方案（最少重复）

| 方案 | 新增 Venue 改几处 | paused / 未启用 | AI 漏改 | 结论 |
|------|-------------------|-----------------|---------|------|
| 1 manifest=Catalog | manifest + PlatformId + adapters +（条件）chrome/deploy | 易 | 中 | **现状最优核** |
| 2 adapters=Catalog | 仍要 PlatformId/UI meta；空壳 adapter 占位别扭 | 难 | 中高 | 不推荐独占 |
| 3 目录扫描生成 | 打包/Node/FE 复杂；空目录≠产品馆 | 难 | 低（若生成可靠） | 过度 |

**最少重复事实：方案 1 + 生成/对账 DERIVE 旁路列表。**

---

# 22. pluginOnly / implementation Retirement Analysis

## 22.1 pluginOnly

| 检查 | 结果 |
|------|------|
| 运行时读？ | **无**（仅 contract/meta 类型 + docs） |
| API consumer？ | listPlatforms **不输出** pluginOnly |
| 外部 consumer？ | 仓内无；无法证明仓外依赖该 JSON 字段 |
| UI hint？ | 未接线 |
| 可 DERIVE？ | 不能可靠 DERIVE（PM/PF 有扩展痕迹但非「only」） |
| 与 vps 并存？ | **语义冲突命名** |

**裁决：`RETIRE CANDIDATE`。**  
不在本阶段删除。退役条件：文档去引用 + 确认无仓外工具读 raw manifest 该键 + changelog。

字段若保留，语义应是历史标注，**禁止**写成架构开关。

## 22.2 implementation

| 检查 | 结果 |
|------|------|
| 运行时分支？ | **无** `=== "paused"` |
| 出口？ | 仅 `feeds.listPlatforms` → `/api/platforms`（仓内无 FE 消费者） |
| 与 collect/bet？ | 心智重叠；真实停用靠 CODE 形状 + activation flags |
| 万能状态？ | **是风险**（paused 掩盖多种情况） |

**不需要**新建 `absent|partial|ready` × `enabled|disabled` 字段机。

当前系统已用：

- CODE 形状（空 adapter vs 挂载）  
- CONFIG collect/bet  
- DEPLOY PM2  

**裁决：`implementation` = RETIRE CANDIDATE**（文档/运维标签）。  
若保留，禁止作为第三套 Activation。

### 馆状态对照（为何三处不同）

| Venue | CODE | manifest collect/bet | implementation | deploy |
|-------|------|----------------------|----------------|--------|
| IM/TF/XBet/HG | 空 adapter | false/false | paused | n/a |
| Dex/Azuro | 有 collector（±provider） | false | paused | n/a |
| SXBet | 空 adapter | false；仍 vps_http_ws | paused | collector **强制 delete** |
| PredictFun | browser collector+provider | true/true | **done** | **esports collector delete**；hub 仍启 |
| Polymarket | 全开 | true/true | done | collector **启** |

→ 证明 **Product Activation ≠ Deployment Activation**（见 §23）。

---

# 23. Deploy Activation vs Product Activation

## 23.1 PredictFun 案例

| 层 | 状态 | 表达什么 |
|----|------|----------|
| Product（manifest） | collect true, bet true, vps_http_ws, implementation done | 产品支持 Hybrid：browser 报价/下单路径启用；Save 仍禁 |
| Browser runtime | collector 启动 | Index → WS → fo |
| Deployment（deploy script） | `pm2 delete changmen-predictfun-collector` | **VPS discovery 进程不跑** |
| Collateral | market-hub / 体育 REST / 下注仍可 | 注释已写明 |

## 23.2 同一事实两个 SoT？还是两层 Activation？

**判定：两层不同事实（正确理解时），但今天文档/字段未分开命名 → AI 易当成同一事实冲突。**

| Activation 层 | 权威应属 | 控制对象 |
|---------------|----------|----------|
| **Product Activation** | manifest.collect / bet（+ ownership） | 浏览器工厂、下注门控、Save 策略 |
| **User Activation** | CollectConfig | 该用户是否 Save* |
| **Deployment Activation** | deploy/ecosystem / ops | VPS（或 hub）进程是否存在 |

PredictFun：Product 开 browser 路径 + Deploy 关 VPS discovery = **合法组合**，不是必须把 manifest 改成 paused。

## 23.3 最小解决方式（设计，不实施）

1. **文档/审计规则**：禁止用 `implementation` 或 `collect` 断言“VPS 进程在跑”。  
2. **对账测试（可选）**：`vps_http_ws ∧ collect:true` 馆 → 期望 PM2 名列表；允许显式 `deployOptional: true` 豁免（仍不建新文件也可写在测试 allowlist）。  
3. **不要**让 manifest 驱动 pm2（过重）；**不要**让 deploy 改写 manifest。

---

# 24. Target Minimal Architecture

## CURRENT（压缩）

```
manifest (Catalog ∪ Product Activation ∪ Runtime Policy ∪ dead UI fields)
   + PLATFORM_ADAPTERS (CODE impl)
   + CollectConfig (User Activation)
   + deploy/PM2 (Deployment Activation)
   + leaked copies (client-core / chrome / scripts)
```

## TARGET MINIMAL（只加概念，不加文件）

```
┌─────────────────────────────┐
│ Catalog (manifest ids…)     │  Venue exists (incl. paused)
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│ Adapter / VPS / Plugin CODE │  Implementation
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│ Product Activation          │  manifest.collect / manifest.bet
│ User Activation             │  CollectConfig
│ Deployment Activation       │  PM2 (VPS only)
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│ Runtime Policy              │  vps_http_ws ownership (collectionMode)
└──────────────┬──────────────┘
               ↓
┌─────────────────────────────┐
│ Derived Registries          │  ALL_*, browserSave*, factories, gates
└─────────────────────────────┘
```

**保留**：paused、未启用已实现、VPS-only、Browser、Plugin、Hybrid、UI list、CollectConfig、Provider、PlatformId。  
**减少**：旁路 Venue list、把 capability 当 activation 的叙事、死字段心智、deploy/manifest 误等同。

**不新建** catalog.json / activation.json / 新 Registry framework。

---

# 25. Derived Registry Model

| Derived Registry | 公式 | 今日实现 |
|------------------|------|----------|
| `ALL_VENUES` | Catalog.ids | `ALL_PLATFORMS` ← manifest |
| `ACTIVE_BROWSER_COLLECTORS` | collect∧adapter.collector | `buildCollectorFactories()` |
| `BETTABLE_VENUES` | bet∧（运行时再∧provider） | `betPlatformIds` + `getProvider` |
| `VPS_OWNED_VENUES` | collectionMode=vps_http_ws | `isVpsOwnedPlatformCollect` |
| `BROWSER_SAVE_VENUES` | collect∧¬vps | `browserSaveMatchPlatformIds` |
| `UI_VENUES` | ALL_VENUES（排序） | 同 ALL + sort |
| `EXTENSION_VENUES` | **FEATURE SET**（≠ ALL） | chrome `PLATFORMS` — **应保持投影，但对账** |
| `DEPLOYED_VPS_PROCESSES` | ops | ecosystem — **不对等于** collect |

### shared/platforms.ts 等分类

| 列表 | 角色 |
|------|------|
| manifest ids | **SOURCE Catalog** |
| api-contract PlatformId | **TYPE MIRROR**（须 ⊆/≈ Catalog；手维或生成） |
| shared/platforms.ts | **BOUNDARY PROJECTION**（adapter chunk 常量；应 = Catalog ids） |
| meta.ALL_PLATFORMS | **DERIVED** from manifest |
| client-core ALL_PLATFORMS | **LEGACY COPY（已漂）** → 应改为 re-export/生成 |
| chrome PLATFORMS | **FEATURE-SPECIFIC PROJECTION**（扩展探测集；**不必=ALL**，但 ID 必须合法 ⊆ Catalog） |
| check-collect-platforms.js | **LEGACY COPY** |

**正确目标不是「处处同一完整列表」，而是：**

- Global ID 单一 Catalog  
- Feature sets 显式投影且 ⊆ Catalog  
- 禁止 silently stale supersets/subsets without tests  

---

# 26. New Venue Change Surface

理想 `NEW_VENUE` 接入：

### 必改

1. **Catalog**：manifest 增 id（+dir/sort/icon；collect/bet；若 VPS 则 collectionMode）  
2. **Type**：api-contract `PlatformId`  
3. **CODE**：`client/venue-adapter/{dir}/` + `adapters.ts` 注册  
4. **常量投影**：`shared/platforms.ts`（或未来生成）

### 条件修改

| 条件 | 改什么 |
|------|--------|
| Browser/plugin Save 馆 | collect true；实现 collector |
| 下注 | bet true；provider |
| VPS discovery | `server/collectors/*` + ecosystem + deploy 策略 |
| 需扩展代发 | chrome-extension **该站** handlers + 可选列入 EXTENSION set |
| 合场规则 | identity/catalog 按需 |
| 代理白名单 | HTTP_RELAY 等按需 |

### 自动生成 / 对账（目标态）

- `ALL_PLATFORMS` / icons CSS / exports  
- CI：PlatformId ≡ manifest ids ≡ shared/platforms  
- CI：collect:true ⇒ collector；bet:true ⇒ provider  
- CI：chrome ids ⊆ Catalog  

### 不应该手改

- `runtime/collectors.ts` / `providers.ts`（已 registry 驱动）  
- `api/match.ts` / `store.js` 硬编码馆名（用 isVpsOwned*）  
- 为“整齐”把未启用馆的 collector 从 adapter 删掉  
- 假设改 manifest.collect 会启停 VPS PM2  

---

# 27. AI Coding Source-of-Truth Rules

1. **Venue 是否存在？** → Catalog（manifest id） / ALL_PLATFORMS  
2. **有没有实现？** → 只看 CODE（adapter / collectors / extension）  
3. **产品开没开 browser collect/bet？** → manifest.collect / bet  
4. **谁写 platform_*？** → collectionMode（vps_http_ws）  
5. **用户是否 Save？** → CollectConfig（且非 VPS）  
6. **VPS 进程在不在？** → deploy/PM2，不是 implementation 字段  
7. **pluginOnly / implementation / saveMatchIntervalMs** → 勿当运行时权威  
8. **改一处列表必须跑对账**；禁止手维第四份 ALL_PLATFORMS  
9. **Capability ≠ Activation**；禁止“有 collector 就改 collect:true”的自动整理  
10. **Hybrid 合法**：VPS ownership + browser collector + provider 可并存  

---

# 28. Migration Preconditions

在任何重构前必须满足：

1. [ ] 书面确认 SABA/IMT `collect:false` 为有意 Activation（非事故）  
2. [ ] 修复/替换 client-core 过期 ALL_PLATFORMS（真重复）  
3. [ ] chrome / scripts：定义为投影并加 ⊆ Catalog 测试  
4. [ ] 纠正 adapters.ts DEV warn 本体论（允许未启用实现）  
5. [ ] 文档冻结：collect/bet=Activation；collectionMode=Policy；implementation/pluginOnly=retire candidates  
6. [ ] PredictFun：文档写清 Product vs Deploy activation（无需改 manifest）  
7. [ ] `/api/platforms` 仓外消费者确认后再动 Desc/implementation/streamMeta  
8. [ ] **禁止**将 manifest 改为启用子集  
9. [ ] **禁止**未迁移 ownership 前重命名/拆分 collectionMode  
10. [ ] 拆 catalog/activation 文件 **非前置条件**；语义清晰 + 去旁路重复才是  

### Phase 2 一句话结论

> **manifest 作为 Catalog（含 paused）是合理且必要的；`collect`/`bet` 应保留为 Product Activation，与 Adapter Implementation 是不同事实；`collectionMode`（尤其 vps）是 Runtime Policy；deploy 是第三层 Deployment Activation。真重复在多份 Venue ID 列表与死字段心智，不在 collect↔collector 配对。**

---

# Phase 3 — Final Venue Source-of-Truth Contract

> **Date**: 2026-09-19 (third pass)  
> **Scope**: READ → TRACE → FINAL DESIGN. No production code, no new files, no field deletion, no refactor.  
> **Goal**: One contract Cursor/Codex can obey when touching Venues.

---

# 29. Final Venue Source-of-Truth Contract

## 29.1 Phase 2 model — freeze check

| # | Claim | Phase 3 re-check | Status |
|---|-------|------------------|--------|
| 1 | Adapter / collectors / extension = Implementation SoT | Unchanged; `PLATFORM_ADAPTERS` + `server/collectors/*` + chrome content | **FROZEN** |
| 2 | manifest.collect / bet = Product Activation (not capability) | Still only gate `buildCollectorFactories` / `getProvider`; SABA/IMT prove dual-fact | **FROZEN** |
| 3 | collectionMode (esp. vps_http_ws) = Runtime ownership | Still sole Save* ownership authority FE+BE | **FROZEN** |
| 4 | CollectConfig = User Save policy | Still gates Save after ownership; does not start collectors | **FROZEN** |
| 5 | deploy/PM2 = Deployment Activation | PredictFun/SXBet still deleted by deploy script independently of manifest | **FROZEN** |
| 6 | ALL_PLATFORMS etc. should be Derived Views | Web path already derives from manifest; client-core/chrome/scripts are **not** yet derived — they are copies/projections to fix later | **FROZEN as target**; copies remain debt |

No claim overturned. **Do not reopen.**

## 29.2 Master contract table

| Fact | PRIMARY SOURCE | Derived / Mirror / Projection (not SoT) |
|------|----------------|-----------------------------------------|
| Venue ID string | **manifest.json `id`** (Catalog) | api-contract `PlatformId` (TYPE MIRROR); shared/platforms keys (BOUNDARY); chrome keys (FEATURE) |
| Venue existence (incl. paused) | **manifest row exists** | `ALL_PLATFORMS` / `PLATFORM_REGISTRY` |
| Directory | **manifest.dir** | `paths.js` / `platformDir()` |
| Sort | **manifest.sort** | order of `ALL_PLATFORMS` |
| Label / labelZh | **manifest** | `listPlatforms()` |
| Icon | **manifest.icon** | `icons.ts`; `gen-platform-icons-css.mjs` output |
| Implementation (code exists) | **Adapter / VPS pkg / chrome code** | — |
| Collector implementation | **`adapter.collector`** (and/or VPS collector package) | — |
| Provider implementation | **`adapter.provider`** | — |
| Collect activation (product) | **manifest.collect** | `collectPlatformIds()`, `ACTIVE` browser collector set |
| Bet activation (product) | **manifest.bet** | `betPlatformIds()`, `supportedBetProviders()` |
| Collection topology / ownership | **manifest.collectionMode** | `isVpsOwnedPlatformCollect`, `browserSaveMatchPlatformIds` |
| VPS ownership | **collectionMode === `vps_http_ws`** | same gates |
| Browser Save ownership | **DERIVE**: collect ∧ ¬vps | `browserSaveMatchPlatformIds` |
| User Save activation | **CollectConfig** (per user) | CollectConfigPanel (UI of user config ∩ browser-save set) |
| Deployment activation | **deploy / ecosystem / PM2** | — |
| Platform wire type | **api-contract `PlatformId`** | zod `schemas.ts` enum (must match Catalog ids) |
| UI platform list | **DERIVE** Catalog | `ALL_PLATFORMS` from registry |
| Bet platform list | **DERIVE** bet activation | `betPlatformIds()` |
| Extension platform list | **chrome-extension `platforms.js`** as FEATURE projection | must remain ⊆/related to Catalog; **≠ ALL** |
| Runtime collector map | **DERIVE** collect ∧ adapter.collector | `buildCollectorFactories()` |
| Runtime provider resolve | **DERIVE** bet ∧ adapter.provider | `getProvider()` |

**ONE FACT → ONE PRIMARY SOURCE.** Everything else is DERIVE / TYPE MIRROR / BOUNDARY PROJECTION / FEATURE PROJECTION / LEGACY COPY.

---

# 30. Venue ID Authority Graph

```
                    ┌──────────────────────────────────────┐
                    │ PRIMARY VENUE CATALOG                │
                    │ client/venue-adapter/registry/       │
                    │   manifest.json  (id[+sort,…])       │
                    └──────────────────┬───────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          ↓                            ↓                            ↓
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│ TYPE MIRROR         │    │ RUNTIME DERIVATION  │    │ UI / PRODUCT META   │
│ api-contract        │    │ meta.ts:            │    │ (same manifest)     │
│   PlatformId        │    │  ALL_PLATFORMS      │    │ sort, label, icon,  │
│   zod enum          │    │  collect*/bet*      │    │ collect, bet,       │
│ EXTERNAL BOUNDARY   │    │  isVpsOwned*        │    │ collectionMode      │
│ CONTRACT            │    │  browserSave*       │    │                     │
└──────────┬──────────┘    └─────────────────────┘    └─────────────────────┘
           │
           │ satisfies / typed by
           ↓
┌─────────────────────┐
│ BOUNDARY PROJECTION │
│ shared/platforms.ts │  ← avoids venue chunk → registry cycle
│ PLATFORMS.OB = "OB" │
└─────────────────────┘

┌─────────────────────┐
│ LEGACY COPY (debt)  │
│ client-core         │  ← CANNOT import venue-adapter
│   ALL_PLATFORMS     │     (venue-adapter depends on client-core)
│ STALE vs Catalog    │
└─────────────────────┘

┌─────────────────────┐
│ FEATURE PROJECTION  │
│ chrome-extension    │  ← A8 probe set + changmen extras
│   platforms.js      │     includes HGA (not in Catalog);
│ NOT ALL_VENUES      │     omits Limitless/PF/SXBet/Azuro/XBet
└─────────────────────┘

┌─────────────────────┐
│ LEGACY / OPS COPY   │
│ check-collect-      │  ← hardcoded allowlist; should read
│   platforms.js      │     Catalog or stay explicit ops subset
└─────────────────────┘
```

### Package boundary (why dual hand-maintain exists)

```
api-contract  (zero deps — HTTP boundary)
     ↑
client-core   (models; uses PlatformId + local ALL_PLATFORMS)
     ↑
venue-adapter (depends on client-core + api-contract; owns manifest)
```

Therefore:

- **client-core must not import `@changmen/venue-adapter/registry`** (cycle).  
- **api-contract must not depend on venue-adapter** (boundary purity).  
- Catalog primary remains **manifest**; `PlatformId` is a **required TYPE MIRROR** kept in sync by humans + CI (or root codegen that writes into api-contract without a runtime import).

---

# 31. Manifest Final Role

## 31.1 Sufficient model (no new files)

```
manifest entry ≈ {
  id, dir, sort,          // Catalog
  label, labelZh, icon,   // UI metadata
  collect, bet,           // Product Activation
  collectionMode,         // Runtime Policy (hard: vps_http_ws)
  /* optional / weak / retire-candidate fields */
}

adapter ≈ {
  id,
  collector?,
  provider?
}
```

**Implementation → Adapter (and VPS/chrome CODE).**  
**Runtime topology → collectionMode.**  
**User Save → CollectConfig.**  
**Deploy → PM2.**

## 31.2 Facts that still fit

All live product facts needed by ALL_PLATFORMS, CollectConfig keys, Save gates, betting gates, UI lists fit this split **without** catalog.json / activation.json.

## 31.3 Residual issues (not solved by splitting files)

| Issue | Nature |
|-------|--------|
| Stale client-core / chrome / scripts lists | Copy discipline / CI — not “manifest too fat” |
| Dead fields (pluginOnly, implementation, saveMatchIntervalMs) | Retire candidates — splitting files does not fix |
| PlatformId ↔ manifest dual edit | Package boundary — need CI or codegen, not a second JSON |
| DEV warn treats collect=false∧collector as bad | Wrong assertion ontology |

**No fact fails to belong.** Therefore: **do not add catalog.json / activation.json.**

---

# 32. Platform List Derivation Strategy

## 32.1 Concepts (not files)

| Concept | Definition |
|---------|------------|
| **ALL_VENUES** | Catalog ids (manifest), sorted by `sort` |
| **ACTIVE_VENUES** (product) | Not a single flag — use **ACTIVE_COLLECT** / **ACTIVE_BET** |
| **ACTIVE_COLLECT** | `collect === true` |
| **ACTIVE_BET** | `bet === true` |
| **FEATURE_VENUES** | Per-feature projection (extension, credit-plate, value-bet soft list, …) |

## 32.2 How today’s sets should derive

| Set | Source | Derive rule |
|-----|--------|-------------|
| `ALL_PLATFORMS` | Catalog | `manifest.map(id)` sorted |
| Active browser collectors | Activation ∩ CODE | `collect ∧ adapter.collector` → factories |
| Bet platforms (product) | Activation | `bet === true` |
| Bet platforms (runtime usable) | Activation ∩ CODE | `bet ∧ adapter.provider` → `getProvider` |
| Browser Save platforms | Activation ∩ Policy | `collect ∧ mode ≠ vps_http_ws` |
| VPS-owned platforms | Policy | `mode === vps_http_ws` |
| Extension platforms | FEATURE | chrome `platforms.js` (manual projection ⊆/A8) |
| UI platform list | Catalog | = ALL_VENUES |
| User CollectConfig keys | Catalog | init Map for each ALL_VENUES; UI toggles only Browser Save set |

**What manifest “directly provides”:** Catalog rows + collect/bet + collectionMode + UI meta.  
**What must never be hand-edited as SoT:** derived arrays in web (`ALL_PLATFORMS` from registry is already correct); do not invent a second ALL in feature code.

---

# 33. New Venue Change Surface

## 33.1 Shared MUST CHANGE (all kinds)

| Touch | Role |
|-------|------|
| `registry/manifest.json` | Catalog + Product Activation + Policy + UI meta |
| `packages/api-contract` `PlatformId` (+ zod) | TYPE MIRROR |
| `shared/platforms.ts` | BOUNDARY PROJECTION |
| `registry/adapters.ts` | register `PlatformAdapter` |
| `client/venue-adapter/{dir}/` | Implementation |

## 33.2 By venue kind

### A. Browser Venue

| Class | Items |
|-------|-------|
| **MUST** | manifest (collect/bet/mode≠vps); adapter collect+provider as needed; PlatformId; shared/platforms; adapters.ts |
| **CONDITIONAL** | platform_sync / HTTP relay / identity catalog / probes |
| **AUTO DERIVED** | ALL_PLATFORMS, browserSave list, icons CSS (if icon), factories if collect |
| **SHOULD NOT** | runtime/collectors.ts hand-register; hardcode id in match.ts/store.js; chrome unless plugin needed; client-core ALL (fix via sync/CI, don’t “add only there”) |

### B. Plugin Venue

| Class | Items |
|-------|--------|
| **MUST** | same as Browser + chrome-extension handlers for that site |
| **CONDITIONAL** | add id to chrome `platforms.js` **FEATURE set** (not “all venues”) |
| **AUTO DERIVED** | same |
| **SHOULD NOT** | set `vps_http_ws` unless discovery is VPS-owned; treat pluginOnly as runtime switch |

### C. VPS Venue

| Class | Items |
|-------|--------|
| **MUST** | manifest `collectionMode: vps_http_ws`; `server/collectors/*`; deploy ecosystem + deploy policy; adapter at least for quote/order as product needs; PlatformId; shared/platforms; adapters.ts |
| **CONDITIONAL** | market-hub / ws_forward; collect true if browser quote loop needed |
| **AUTO DERIVED** | isVpsOwned*; browserSave excludes id |
| **SHOULD NOT** | enable Browser Save paths; hardcode venue name in Save gates |

### D. Hybrid (PM/PF pattern)

| Class | Items |
|-------|--------|
| **MUST** | VPS checklist **plus** browser collector (Index→WS→fo) **plus** provider if betting; collect true typically; vps_http_ws |
| **CONDITIONAL** | chrome if plugin transport for some calls; deploy may pause VPS discovery independently |
| **AUTO DERIVED** | Hybrid gates (Save blocked; collector still starts) |
| **SHOULD NOT** | assume pluginOnly means “no VPS”; assume collect true means “PM2 up” |

## 33.3 client-core

| Class | Guidance |
|-------|----------|
| **SHOULD NOT** treat as Catalog SoT | Fix by CI sync or moving ordered id array to api-contract later |
| **MUST NOT** import venue-adapter | Cycle |

---

# 34. Generated vs Manual Data

| Path | Worth generating? | Why |
|------|-------------------|-----|
| manifest → `ALL_PLATFORMS` (registry) | **Already derived in code** | Keep |
| manifest → icons CSS | **Already generated** (`gen-platform-icons-css.mjs`) | Keep |
| manifest → PlatformId / zod | **Optional later**; default **manual + CI** | api-contract zero-deps boundary; codegen OK only as root script writing files marked DO NOT EDIT |
| manifest → shared/platforms.ts | **Optional**; prefer **manual + CI** first | Small object; generation helps AI less than CI fail |
| manifest → client-core ALL | **Do not generate into client-core from venue-adapter import**; either CI assert vs manifest, or hoist ordered ids into api-contract | Cycle / layering |
| manifest → chrome platforms | **Do not auto = ALL** | FEATURE set; A8 order + HGA |
| adapter → capability sets | **Runtime derive only** (factories) | No file |
| collectionMode → VPS set | **Runtime derive** (`isVpsOwned*`) | No file |
| collect/bet → active sets | **Runtime derive** | No file |

### AI Coding rule for generation

Only introduce a generated file if:

1. Source is obvious (manifest)  
2. File header: DO NOT EDIT  
3. Documented npm script  
4. CI `--check`  

Otherwise: **manual mirror + CI assertion** beats half-baked codegen.

**Recommended next implementation (future, not this phase):** one CI test: `manifest.ids ≡ PlatformId enum ≡ shared/platforms keys ≡ registry ALL_PLATFORMS`; client-core array ≡ same set (order may follow manifest sort); chrome ids (except documented A8-only like HGA) ⊆ Catalog.

---

# 35. AI Venue Change Rules

**AI VENUE CHANGE RULES** (binding for Cursor/Codex):

1. **Missing venue in UI / sort / CollectConfig keys** → edit **manifest** (Catalog). Do **not** patch a local `ALL_PLATFORMS` copy as the fix.  
2. **Enable/disable browser collector registration** → edit **manifest.collect**. Do **not** delete/add `adapter.collector` to “turn off/on” product activation.  
3. **Enable/disable betting path** → edit **manifest.bet**. Do **not** remove `provider` solely to disable.  
4. **Change who writes `platform_*`** → edit **manifest.collectionMode** (`vps_http_ws` vs not). Do **not** hardcode venue names in `match.ts` / `store.js`.  
5. **User cannot Save / Save toggles** → **CollectConfig** / CollectConfigPanel. Do **not** change manifest for one user’s preference.  
6. **VPS process up/down** → **deploy / PM2**. Do **not** infer from `implementation` or assume `collect:true` means daemon runs.  
7. **`adapter.collector` present + `collect:false`** → **ALLOWED** (Implementation ≠ Activation). Do **not** “fix consistency” by flipping collect or deleting collector without product intent.  
8. **`collect:true` without collector** (or `bet:true` without provider) → **INVALID ACTIVATION** — add implementation or turn flag off.  
9. **Chrome platforms.js** → FEATURE projection; add only if extension must detect/proxy that site. Do **not** require parity with ALL_VENUES.  
10. **PlatformId** → when adding Catalog id, update TYPE MIRROR in api-contract in the **same change**. Do not leave zod/DTO stale.  
11. **shared/platforms.ts** → update BOUNDARY PROJECTION in the **same change** as Catalog id.  
12. **Do not hand-edit** `runtime/collectors.ts` / `providers.ts` venue maps — they re-export registry.  
13. **Do not treat** `pluginOnly` / `implementation` / `saveMatchIntervalMs` as runtime authorities.  
14. **Hybrid venues** may combine VPS ownership + browser collector + provider; that is normal.

### First place to look

| Intent | Go here first |
|--------|----------------|
| Venue exists? | manifest |
| What can it do in code? | adapter / server/collectors / chrome |
| Product enabled collect/bet? | manifest.collect / bet |
| Where does collection write? | collectionMode |
| User Save? | CollectConfig |
| Process running? | deploy |
| Type error on provider string? | api-contract PlatformId |

### Absolute do-not-touch-as-SoT

- client-core `ALL_PLATFORMS` (legacy copy)  
- Ad-hoc script platform arrays (unless intentional ops allowlist)  
- Derived helpers’ return values edited by changing call sites instead of sources  

---

# 36. DEV / CI Assertion Semantics

## 36.1 Current `adapters.ts` DEV block (as of audit)

| Check | Today | Correct semantics |
|-------|-------|-------------------|
| `collector && !collect` | `console.warn`「未在 manifest 声明采集」 | **ALLOWED** — should **not** warn as drift; optional info-level “inactive implementation” |
| `collect && !collector` | `console.warn` | **INVALID ACTIVATION** → should be **error** (DEV/CI) |
| `bet && !provider` | `console.warn` | **INVALID ACTIVATION** → should be **error** |
| `bet && provider` omitted when bet false | (no check) | **ALLOWED** — keep silent |
| `adapter` not in manifest | `console.warn` | **ERROR** — every adapter id must be in Catalog |
| (missing) Catalog id without adapter | — | Optional: warn for non-paused stubs; empty paused adapters are OK |

## 36.2 Recorded change list (do not implement now)

1. Reclassify `collector && !collect` from warn-as-drift → allow / downgrade.  
2. Promote `collect && !collector` and `bet && !provider` to failing CI test.  
3. Add CI: Catalog ids ≡ PlatformId ≡ shared/platforms.  
4. Add CI: client-core ALL_PLATFORMS set-equality with Catalog (fix staleness).  
5. Add CI: chrome ids except documented exceptions (e.g. HGA) ⊆ Catalog.  
6. Do **not** add CI that requires collect↔collector equality both ways.

---

# 37. Final Minimal Architecture

```
                 manifest.json
                      │
         ┌────────────┼────────────┐
         ↓            ↓            ↓
      Catalog   Product Act.   UI metadata
      (ids…)    collect/bet    sort/icon/…
         │            │
         └──────┬─────┘
                ↓
         Derived Registry
         (ALL_*, factories, gates)
                ↑
                │ filtered by
           Adapter CODE
           (collector?/provider?)
                │
         Implementation SoT

         collectionMode ──→ Runtime Ownership (platform_*)
         CollectConfig  ──→ User Save Policy
         deploy / PM2   ──→ Deployment Activation

         api-contract PlatformId ──→ TYPE MIRROR (boundary)
         shared/platforms        ──→ BOUNDARY PROJECTION
         chrome platforms.js     ──→ FEATURE PROJECTION
```

**Principle:** ONE FACT → ONE SOURCE; elsewhere DERIVE / MIRROR / PROJECTION.

---

# 38. Decision: Split Manifest or Not

## Decision

### **A. Do not split manifest.**

manifest continues to hold:

- Venue Catalog (including paused)  
- Product Activation (`collect` / `bet`)  
- UI metadata  
- Runtime policy field (`collectionMode`)

## Why not B (Catalog / Activation files)?

- No consumer conflict requires two files.  
- ALL_PLATFORMS, CollectConfig, ownership gates already work from one JSON.  
- Split would multiply AI touchpoints and sync failures without removing PlatformId dual-edit.  
- Real pain is **stale copies + wrong DEV ontology**, not file cohesion.

## Why not “Catalog = adapters only”?

- Paused empty adapters / sort / icon / activation flags still need a Catalog row.  
- Adapter registry is Implementation index, not product existence index.

## Final one-liner for AI

> **Venue Source of Truth = `manifest.json` for existence/activation/ownership/UI meta; Adapter (and VPS/chrome code) for implementation; CollectConfig for user Save; deploy for processes; everything named `ALL_*` / `*PlatformIds()` is derived or a typed/feature mirror — never a second Catalog.**

---

*End of Phase 3. Audit complete — stop.*

---

# Phase 4 — Implementation Guardrails (landed)

> Governance only: DEV/CI ontology + catalog consistency. No business-behavior change.

# 39. Implementation Guardrails

## RULES (AI / humans)

1. **新增 Venue**：先改 `manifest.json`（Catalog）。  
2. **实现能力**：改 Adapter / `server/collectors` / chrome（Implementation）。  
3. **启用 Browser collection**：改 `manifest.collect`（Product Activation）。  
4. **启用 betting**：改 `manifest.bet`。  
5. **改变 VPS ownership**：改 `collectionMode`（`vps_http_ws`）。  
6. **用户 Save**：CollectConfig / user policy — 勿改 manifest。  
7. **VPS daemon**：deploy / PM2 — 勿用 `collect`/`implementation` 推断进程。  
8. **勿直接改** `ALL_PLATFORMS` 作为修 UI 的手段；registry 的是 Derived；client-core 的是 Legacy Copy（须对齐 Catalog，CI 锁定）。  
9. **勿因** `adapter.collector` 存在就设 `collect=true`。  
10. **勿因** `adapter.provider` 存在就设 `bet=true`。  
11. **勿改 PlatformId「修 UI」**；PlatformId 是 TYPE MIRROR，与 Catalog 同 PR 更新。  
12. **列表不一致**：先找 SoT（manifest），再修 mirror/projection。

## Validation entrypoints

| Check | Command / location |
|-------|--------------------|
| Catalog ≡ PlatformId ≡ shared ≡ client-core | `npm run check:venue-catalog` |
| Activation ↔ Implementation ontology | `validateVenueTruth` + `venueTruth.test.ts` (via web vitest) |
| DEV invalid activation | `adapters.ts` → `console.error` on errors only |
| VPS ≠ Browser Save | existing `meta.browserSave.test.ts` + venueTruth tests |

## New Venue Change Surface (MUST / CONDITIONAL / DERIVED / NOT)

| 类型 | Adapter | manifest | PlatformId | shared/platforms | Extension | VPS collectors | deploy |
|------|---------|----------|------------|------------------|-----------|----------------|--------|
| Browser | MUST | MUST (collect/bet/mode≠vps) | MUST | MUST | NOT unless plugin | NOT | NOT |
| Plugin | MUST | MUST | MUST | MUST | CONDITIONAL (feature set) | NOT | NOT |
| VPS | MUST (quote/order as needed) | MUST (`vps_http_ws`) | MUST | MUST | CONDITIONAL | MUST | MUST (process policy) |
| Hybrid | MUST (browser collector+provider) | MUST (collect often true + vps) | MUST | MUST | CONDITIONAL | MUST | CONDITIONAL (discovery may pause ≠ product) |

**DERIVED (do not hand-author as SoT):** `ALL_PLATFORMS` (registry), `collectPlatformIds`, `betPlatformIds`, `browserSaveMatchPlatformIds`, `buildCollectorFactories`, icons CSS.

## What this phase deliberately did NOT do

- No catalog.json / activation.json  
- No field deletion (`pluginOnly`, `implementation`, …)  
- No collectionMode / Save* / betting / PM2 behavior changes  
- No client-core → venue-adapter dependency  

---

*End of Phase 4 guardrails.*
