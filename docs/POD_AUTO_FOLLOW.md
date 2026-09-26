# POD 足球自动跟单

## 业务链路

```text
POD Dropping Odds
  → Chrome 扩展冻结 alertId
  → changmen 足球页对场、对盘、读取实时价
  → 冷票 / EV / 账号 / 当日风控
  → 服务端按 用户 + alertId + 场馆 + playerId 永久认领
  → 浏览器调用场馆下注
  → 先写执行结果，再保存足球订单
```

自动跟单只运行在足球页，不进入电竞 `mainBetLoop`，不写电竞 `fo` 或 `orders`。OB 足球订单写 `football_orders`；Polymarket 足球订单沿用统一订单存储，但以 `football-pod-auto` 标记并由足球订单接口读取。

## 幂等与故障语义

表 `pod_bet_executions` 的唯一键为 `(user_id, alert_id, venue, player_id)`。场馆请求发出前必须先调用 `Client_ReservePodBet`；只有 `acquired=true` 的页面可以提交。页面刷新、多标签页、多设备和插件重连都不能绕过该唯一键。

执行状态：

| 状态 | 含义 | 自动重试 |
|------|------|----------|
| `reserved` | 已认领，尚未保存最终结果；也包括提交期间页面退出 | 禁止 |
| `accepted` | 场馆明确受理 | 禁止 |
| `failed` | 场馆明确拒绝或提交前确定失败 | 禁止 |
| `unknown` | 请求可能已经送达，但未取得明确响应 | 禁止 |

`unknown` 和长期 `reserved` 必须先到场馆订单记录核实，不能通过删除执行记录直接重试。手工下注不走自动认领接口，由操作者自行确认。

服务端认领前校验 `playerId` 属于当前登录用户，并校验账号场馆与请求场馆一致；数据库或归属查询失败时拒绝认领。

## 启动恢复

POD 面板挂载后先恢复账号、足球订单和统一订单。三项没有全部完成前，状态显示“恢复订单 · 自动暂停”，不会执行自动下注。恢复完成后才允许事件驱动的串行 runner 消费新警报。

扩展后台被 Chrome 回收后，changmen 重新连接时会向已打开的 POD 页主动索取完整快照；相同 `alertId` 即使重新出现，也会被服务端执行记录拦截。

## 部署顺序

1. 先部署后端和数据库代码。
2. 在 `server/backend` 执行 `node scripts/apply-rds-schema.mjs`，确认迁移 `042_pod_bet_executions.sql` 成功。
3. 重启后端。
4. 构建并部署前端，同时发布 Chrome 扩展。
5. 首次上线保持“自动下注”关闭，先验证手动跟单与执行记录接口。

若前端先于后端发布，执行权申请会失败并停止该次自动下注，不会绕过服务端直接下注。

## 验收

- 同一用户、警报、场馆和账号并发申请时只有一个请求取得执行权。
- 账号不属于当前用户或场馆不一致时，场馆下注函数不会被调用。
- 明确受理先记录为 `accepted`，再保存足球订单。
- 明确拒绝记录为 `failed`；提交阶段断线或超时记录为 `unknown`。
- 页面刷新、多个标签页、扩展后台重启后，同一执行不再次调用场馆。
- 自动跟单关闭时，不产生执行记录或场馆请求。

相关自动化测试：`podAutoPipeline.integration.test.ts`、`podFollowPlace.execution.test.ts`、`podPmFollowPlace.execution.test.ts`、`pod_bet_execution.test.js`、`pod_bet_execution.smoke.test.mjs`。
