# A8 脚本 + 插件架构复刻计划

对照基线：`A8/A8frontendscipts/2.0.1/index.js` + `A8/A8chromeplug/2.0.149`�? 
changmen 实现：`client/web` + `client/venue-adapter/{platform}/` + `chrome-extension` + `@/chrome-plugin/bridge.ts`（A8 `Zn`）�?
最后更新：2026-06-11

---

## 目标架构

```
浏览器托管页（脚本）          Chrome 插件（Zn�?├── client/venue-adapter 采集     ├── GET/POST 跨域
├── oddsStore fo              ├── tabId / Stake content
├── collectStore 回传门控     ├── 11 站凭证浮�?└── *Provider 下注            └── ModifyHeader UA
         �?                             �?         └──────────┬───────────────────�?                    �?         server/backend Client_* / API_*
                    �?         server/match/matcher �?client_matches
                    �?         Client_GetMatchs（前端只读列表）
```

**Parity 唯一基线**：浏览器 `saveMatch`/`saveBets` + 插件 + matcher �?`Client_GetMatchs`�? 
**已删�?*�?026-06）：Node FeedHub、`ESPORT_BRIDGE`、服务端平台 Feed 采集�? 
**非基�?*：[changmen 扩展] matcher、`http-relay` �?PB 主路径、WS relay 隧道�?
生产部署�?[../../../../../PRODUCTION_DEPLOYMENT.md](../../../../../PRODUCTION_DEPLOYMENT.md)�?
---

## 启动脚本（开发联调）

| 脚本 | 组成 |
|------|------|
| `BAT\dev.bat parity` | Web 后端 + Vite + matcher（推�?parity 验收�?|
| `BAT\dev.bat` / `BAT\dev.bat` | 日常开发（浏览�?+ 插件 + matcher�?|

插件准备�?
```bat
cd changmen\apps\chrome-extension
npm run build
```

Chrome：加载已解压 `chrome-extension`（ID `mogfpjihgoghabicofkbcmcidlcoofee`）�?
---

## 三模式采�?
| 模式 | 平台 | 脚本 | 插件 |
|------|------|------|------|
| A 场馆 HTTP/WS | OB、RAY、TF、IA、IMT | 直连 / 后端 WS relay | 凭证浮窗（可选） |
| B A8 Socket | IM、XBet、Stake 实时 | `@venue/shared/socket/*` | Stake 需 tabId |
| C 插件 HTTP | PB、Stake GraphQL | `a8PluginGet/Post` | **必须** |

CollectConfig：只门控 `saveMatch`/`saveBets`�?*�?*停采集器�?
---

## 进度

### 已完�?
| �?| 说明 |
|----|------|
| `client/venue-adapter` 迁移 | 11 平台 collect/bet + registry |
| 插件协议 | `bridge.ts` = Zn |
| 开发脚�?| `BAT\dev.bat parity`、`BAT\dev.bat` + matcher |
| 架构冻结 M1 | 删除 FeedHub；[PRODUCTION_DEPLOYMENT.md](../../../../../PRODUCTION_DEPLOYMENT.md) |
| PB fail-fast | 无扩展且�?SOCKS �?`PB_PLUGIN_REQUIRED_MSG` |
| Stake 提示 | 无扩�?/ �?tabId �?`notifyCollectError` |
| IA �?token | `ia/backend/collect_credentials.js` + `Client_GetCollectPlatform` |

### 进行中（阶段 2 联调�?
按顺�?Mode P 走查：[A8_WALKTHROUGH_CHECKLIST.md](./A8_WALKTHROUGH_CHECKLIST.md)

1. OB �?2. IM �?3. RAY �?4. TF �?5. IMT �?6. IA �?7. PB �?8. STAKE

每平�?Network 验收�?[A8_REPLICATE_8_PLATFORMS.md](./A8_REPLICATE_8_PLATFORMS.md)�?
### 待办

| 优先�?| 任务 |
|--------|------|
| P1 | 8 平台 Mode P 实机 E2E（需账号/扩展�?|
| P1 | `A8_WALKTHROUGH_CHECKLIST` B4 同屏 UI 走查 |
| P2 | 生产首次部署（域名、`db push`、matcher 进程）�?�?PRODUCTION_DEPLOYMENT |
| P2 | 文档：`A8_COMPARE_ALL_PLATFORMS` 路径�?`client/venue-adapter` |
| P3 | HG 跟单（无 saveMatch，非 8 平台 parity 核心�?|

---

## 代码索引

| 能力 | 路径 |
|------|------|
| 插件�?| `src/chrome-plugin/bridge.ts` |
| 采集注册 | `src/runtime/collectors.ts` �?`@venue/registry` |
| A8 Socket | `client/venue-adapter/shared/socket/hub.ts` |
| 平台实现 | `client/venue-adapter/{ob,im,ray,...}/` |
| 插件源码 | `chrome-extension/src/` |
| Matcher | `server/match/matcher/loop.js`???? `changmen-esport`? |

平台明细：[A8_REPLICATE_8_PLATFORMS.md](./A8_REPLICATE_8_PLATFORMS.md)

---

## 标签约定

| 标签 | 含义 |
|------|------|
| [A8 可证实] | bundle 或抓包直接可�?|
| [changmen 推测] | �?API 形状反推 |
| [changmen 扩展] | A8 不存在（matcher、http-relay 主路径、WS relay 等） |
