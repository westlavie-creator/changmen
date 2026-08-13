# 合场演进（短计划）

- 更新：2026-08-13
- 原则：**一步只动一层；上线后行为对外可视为不变；下一步另开，不提前耦合**

## 正确逻辑

- 馆 `SaveMatch` → 只更新该馆（`platform_*`）
- changmen → 自己的比赛状态 + 与各馆 id 的映射
- `GetMatchs` → 只读投影  
- 比赛结束即结束，没有 ended→active

## 分步（互不影响）

每一步有**唯一改动面**。做完可单独合并/上线；不做下一步也不坏。

| 步 | 只改什么 | 明确不改 | 对外行为 | 做完标志 |
|----|----------|----------|----------|----------|
| **1** | 仅 `client_matches` **写库实现**（只应用本拍 upsert/end，去掉锁表扫活跃 id） | 不合场算法、不改 Save*、不改 GetMatchs | 应与现在一致 | 写路径变简单；测过不漏结束、不复活 |
| **2** | 仅 GetMatchs **读/缓存**（脏场或减负加载） | 不改写库、不合场、不改 Save* | 列表内容不变，可更快 | miss/尖刺下降 |
| **3** | 仅 **触发时机**：Save* 后入队「相关场」增量刷新（仍走现有 compose/写补丁） | 不改匹配算法核心、不改 API 形状 | 更及时；定时全量可先保留 | 增量能跟上馆变 |
| **4** | 仅 **changmen 状态表达**（lifecycle/事件，映射与投影分开） | 不顺便改馆写入、不改前端协议 | 语义更清晰 | 状态与代码同构 |

```text
步1 写库     ──独立──► 可停
步2 读取     ──独立──► 可停（不依赖步3/4）
步3 触发     ──建议在步1之后──► 可停（不依赖步4）
步4 状态模型 ──建议在步3之后──► 终态
```

- **步2 与步1 无强依赖**，可并行或先后，只要别在同一次提交里搅在一起。  
- **步3 依赖步1**（增量结果要能以补丁写出）。  
- **步4 依赖步3**（先有事件入口，再升状态机）。

## 协作规矩

1. 同一时间只做一个步。  
2. 该步 PR/提交只碰上表「只改什么」里的文件。  
3. 发现别的问题 → 记下来，不塞进当前步。

## 当前

下一步 = **步1**（只动写库）。执行方案见下；你点头再改代码。

## 步1 执行方案（具体）

### 要改掉的行为

今天 `_rdsWriteClientMatchesLifecycle`（`server/db/rds/client_matches_store.js`）在事务里：

1. `LOCK TABLE client_matches …`
2. `SELECT id … WHERE ended_at IS NULL`（全活跃 id）
3. 用「库里活跃 − 本拍活跃」**再算一遍**该结束的 id
4. 再和传入的 `markEndedIds` 合并后 `UPDATE`

compose 其实**已经**算好 `markEndedIds` 传进来了。步1 = 写库**只信传入的补丁**，不再自己扫表猜。

### 改后行为（同一文件为主）

事务内只做：

1. （可选）短事务 / 按需行锁，**不要整表锁 + 全扫活跃 id**
2. UPSERT `activeRows`、`endedRows`（已有：active 与 ended 同 id 时丢掉 active）
3. `UPDATE … ended_at` **仅**对传入的 `markEndedIds`
4. sticky SQL 保持不变（已 ended 不会被活跃 UPSERT 清掉）

### 调用约定（不改合场算法，只保证补丁完整）

| 调用方 | 步1要求 |
|--------|---------|
| `compose/io/write.js` → `writeClientMatchesAsync({ activeRows, endedRows, markEndedIds })` | 已传 `markEndedIds`，保持；写库侧以此为 end 权威 |
| 旧式 `writeClientMatches(rows数组)` | 仍用内存 `_lastWrittenIds` 生成 `markEndedIds`（现有 `_normalizeWritePayload`），**不**再靠锁内扫库 |

### 不动的范围

- `composeOnce` 聚类 / 打分 / ended 判定逻辑  
- SaveMatch / GetMatchs / 前端  
- `ended_at` sticky、空写保护  

### 建议提交内顺序

1. 改 `_rdsWriteClientMatchesLifecycle`：删锁内全扫差集；`markIds` = 仅 payload 的 `markEndedIds`（过滤掉仍在本拍 active 的）  
2. 同步收紧/去掉 `LOCK TABLE`（若去掉后并发仍安全：同进程 matchMerge 已有 in-flight；跨进程仍有 write_guard）  
3. 补单测：只标传入 end；同 id active+end → ended；未传入的活跃 id **不会**被写库层自行标 ended  
4. 跑 matcher compose 相关测试 + 该 store 测试  

### 风险与验收

- **风险**：若某调用方漏传 `markEndedIds`，可能少标结束（幽灵活跃）。生产主路径是 compose，已传。  
- **验收**：合场一轮后，该结束的场仍离开 GetMatchs；已结束场不会复活；相关测试绿。

点头后按此改，改完即停，不开步2。
