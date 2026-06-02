# OB 平台

OB 采集走 **登录 → API 网关 → HTTP 快照 + MQTT 增量**。状态字段对照见 [STATUS_MAPPING.md](./STATUS_MAPPING.md)。

## 配置

### 登录地址（可变更）

当前默认登录 URL（demo 商户）：

```
https://djtop-capi.v662n.com/cApi/v2/member/login?merchant=6107384714184464&demo=1
```

| 项 | 说明 |
|----|------|
| 代码默认值 | `ob_session.js` 中 `DEFAULT_LOGIN_URL` |
| 环境变量 | `OB_LOGIN_URL` — 覆盖上述默认地址（**后期换域名/merchant 时优先改这里**） |
| CLI 参数 | `node platforms/ob/fetch_ob_login.js "<完整 login url>"` |

登录成功返回 `token`，以及 `pc` / `h5` 入口 URL；从中解析 **API 网关**（`game/index`、`game/view`）与 **MQTT WebSocket** 地址。网关列表随登录响应变化，不在此硬编码。

> 该 login 域名、`merchant`、`demo` 参数均可能由运营侧调整；变更时更新 `OB_LOGIN_URL` 或 `DEFAULT_LOGIN_URL`，无需改业务逻辑。

## 数据流

```text
GET  member/login          →  token + pc/h5 入口
GET  {gateway}/game/index  →  比赛列表（定时 sync）
GET  {gateway}/game/view   →  单场盘口快照
GET  {gateway}/game/getTimer → 当前地图
MQTT {mqtt}/...            →  赔率/锁盘增量（源站网关，非 A8）
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `ENABLE_OB` | 设为 `0` 关闭 OB Feed（Dashboard 默认开启） |
| `OB_FEED_MODE` | 默认多源 index；设为 `a8` 时仅 `flag=1&day=1` + `stageDelayMs=1500`（对齐 UMe，仍属 [changmen 扩展]） |
| `OB_LOGIN_URL` | 登录完整 URL，见上文 |
| `OB_MQTT_URL` | 可选，覆盖 MQTT 地址（调试用，`fetch_ob_mqtt.js`） |

## 文件

| 文件 | 作用 |
|------|------|
| `ob_session.js` | 登录、网关探测、HTTP 请求 |
| `ob_core.js` | 归一化、MQTT topic、状态描述 |
| `ob_feed.js` | Dashboard Feed |
| `fetch_ob_login.js` | 调试登录 |
| `fetch_ob_view.js` / `fetch_ob_live.js` / `fetch_ob_mqtt.js` | CLI 调试 |

## 启动

```bash
cd scripts
npm run web
```

```bash
npm run ob:login
npm run ob:view -- --match <match_id> --stage 0
npm run ob:mqtt -- --match <match_id> --duration 60
```

## 相关文档

- [GAMES.md](../../GAMES.md) — **跨平台聚合游戏类型**
- [MARKETS.md](../../MARKETS.md) — **选盘规则**（OB 精确盘名 + fallback）
- [STATUS_MAPPING.md](./STATUS_MAPPING.md) — 比赛/地图/盘口状态来源
- [MARKET_STATUS.md](./MARKET_STATUS.md) — 盘口 locked 与 MQTT 映射
- [GAME_INDEX.md](./GAME_INDEX.md) / [GAME_IDS.md](./GAME_IDS.md) — game_id 与 index 结构
