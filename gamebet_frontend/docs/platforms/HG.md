# HG（皇冠）采集

## 入口

`hg/index.ts` → `startHgCollector()`

## 说明

**无标准电竞 `saveMatch` / `saveBets` 采集流。**

对齐：

- 后端 `hg_feed.js` — 账户余额轮询，非列表采集
- A8 **`SQ`** — 跟单下注循环，不是 EZe 类 Socket 落库

## 当前实现

采集开关启用且存在 `gateway` + `token` 的 HG 账号时，每 **60s** 调用 `accountStore.refreshBalance`（走 `hgProvider.getBalance` / `transform.php`）。

无 HG 账号时仅 `console.debug` 提示配置。

**不会**向 `oddsStore` 写入赛事赔率。

## 跟单相关代码

| 路径 | 说明 |
|------|------|
| `hg/core.ts` | HG 业务辅助 |
| `hg/followLoop.ts` | 跟单循环（`HomeView` 挂载） |
| `providers/hgProvider.ts` | 余额 / checkBet / betting |

如需 HG 赛事列表，须另接皇冠 API 或 A8 插件通道，不在本 collector 范围内。
