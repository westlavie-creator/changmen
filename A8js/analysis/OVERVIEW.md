# A8js/index.js 逆向拆解说明

## 结论

`A8js/index.js` 是一个 Vite/Vue 前端打包产物，包含 UI 框架、第三方库、业务 API、浏览器插件桥、实时赔率缓存、平台采集器、下单/订单处理等逻辑。由于没有 sourcemap，本次产物不是“还原原始源码”，而是把压缩 bundle 变成可读、可检索、可继续拆分的逆向工作台。

## 已生成产物

| 文件 | 用途 |
| --- | --- |
| `index.pretty.js` | 轻量可读化后的完整 bundle，适合全文搜索和上下文阅读 |
| `README.md` | 自动生成的关键词/API/URL/平台索引 |
| `signals.json` | 机器可读的信号索引，后续可继续脚本处理 |
| `domains.json` | 业务域切片命中情况 |
| `slices/*.js` | 按业务域截取的上下文片段 |
| `../tools/analyze-a8js.js` | 生成这些分析产物的本地脚本 |

## 业务域拆分

### 1. 应用启动与插件检测

切片：`slices/00-bootstrap.js`

这里能看到 Vue 应用 mount、插件检测、版本提示、缺插件时的提示页。原始 bundle 最后会访问远程 `https://api.a8.to/esport2/assets/version.json`，并通过 `Yn.init()` 检查 Chrome 插件。

对本项目的意义：`scripts/patch-ui-bundle.js` 已经在改这个区域，让 UI 先 mount，再把远程接口替换成本地服务。

### 2. Chrome 插件通信桥

切片：`slices/01-plugin-bridge.js`

核心线索是 `chrome.runtime.sendMessage`、`getStore`、`setStore`、`GET`、`POST`。A8 前端把部分跨域请求和平台上下文请求交给插件执行，插件则负责代发请求、保存 storage、读取平台登录态。

对本项目的意义：`plug/` 和本地 collector 插件可以对齐这里的消息契约。后续如果某个平台网页端请求必须靠插件上下文执行，应优先复刻这个桥。

### 3. A8 API 客户端

切片：`slices/02-local-api-client.js`

关键动作包括：

- `Client_Login`
- `Client_GetUserInfo`
- `Client_GetCollectPlatform`
- `Client_GetGames`
- `Client_GetMatchs`
- `Client_SaveOrder`
- `API_UpdatePlatform`
- `API_SaveMatch`
- `API_SaveBet`
- `API_SaveLiveTimer`

对本项目的意义：这些就是 `scripts/esport-api/router.js` 要兼容的接口面。现在本地 API 已经覆盖了大部分核心动作。

### 4. 实时赔率缓存

切片：`slices/03-odds-cache.js`

核心线索是 `fo()` 和 `new Jn(...)`。业务上可以理解为：

```text
platform -> oddsId -> { id, betId, odds, isLock, time }
```

各平台采集器收到赔率快照或 WS 增量后，先写入这个缓存；页面展示和自动判断再读取缓存。

对本项目的意义：`scripts/shared/feed_hub.js` + 各平台 Feed 的 `odds` / `byMatch`，就是本地版本的同类抽象。

### 5. OB 平台

切片：`slices/10-ob.js`

入口大约在 `const IMe = Xt.OB`。可见默认 demo login URL、`game/index`、`game/view`、`game/getTimer`、平台配置同步、赔率缓存写入等逻辑。

对本项目的意义：当前 `scripts/platforms/ob/` 已经复刻得最完整，后续应继续用这里验证盘口状态、MQTT topic、下单参数。

### 6. RAY 平台

切片：`slices/11-ray.js`

线索包括 `Xt.RAY`、`365raylinks`、订单号、赔率状态和平台配置。RAY 逻辑同时包含 HTTP 快照与实时推送。

对本项目的意义：当前 `scripts/platforms/ray/` 已有独立实现。可继续用该切片确认 `获胜者` 盘口、状态码和订单结构。

### 7. TF 平台

切片：`slices/12-tf.js`

线索包括 `Xt.TF`、`api-v4`、`auth_token`、`/esport/ws/TF`。这个区域应作为后续接入 TF 的主参考。

对本项目的意义：`scripts/platforms/tf/README.md` 里的待办可以按这里拆 session/core/feed。

### 8. SABA / IMT / XBet / Stake

切片：

- `slices/13-saba.js`
- `slices/14-imt.js`
- `slices/15-xbet-stake.js`

这些不是当前本项目最核心的平台，但很有参考价值：

- SABA：可见 `ESports/43/ALL`、`Moneyline`、`bettype:[20,9001]`
- IMT：可见 `GetAllLiveEvents`、`getAllLiveEventsDelta`、`BetTypes:[283]`
- XBet / Stake：更偏聚合推送通道和比分/赔率更新

建议等 OB/RAY/TF 稳定后再推进。

### 9. 下单/订单/余额

切片：`slices/20-betting.js`

这里包含 `checkBet`、`Client_SaveOrder`、余额更新、订单消息等逻辑。它是风险最高的一块，因为展示赔率和真实下单可用性之间可能存在延迟、锁盘、盘口变更、赔率变更。

对本项目的意义：`scripts/shared/bet_engine.js` 目前只接 OB，而且强制 `placeBet` 前必须有 `checkBet` payload，这个方向是对的。

## 推荐后续工作

1. 先围绕 `10-ob.js` 和现有 `scripts/platforms/ob/` 做字段对照表：登录、game index、game view、MQTT、下注参数。
2. 对 `12-tf.js` 做二次精读，提取 TF 的 HTTP API、WS 地址、token 来源、盘口格式。
3. 把 `03-odds-cache.js` 中 `fo/Jn` 的真实字段名整理成一份“前端赔率缓存契约”。
4. 把 `20-betting.js` 的下单前检查、下单、订单保存、余额刷新拆成流程图，再决定本地是否实现实盘动作。
5. 后续如果需要更高质量反混淆，可在当前 `index.pretty.js` 基础上做“人工命名版切片”，不要直接改原 bundle。

