# HG（皇冠）采集

## 入口

`hg/index.ts` → `startHgCollector()`

## 说明

**无标准电竞 `saveMatch` / `saveBets` 采集流。**

对齐：

- 后端 `hg_feed.js` — 跟单/余额，非列表采集
- A8 **`SQ`** — 跟单下注循环，不是 EZe 类 Socket 落库

## 当前实现

每 60s 若平台启用则 `console.debug` 提示：

> 无独立赔率采集；请通过插件跟单或账号余额接口使用

## 跟单相关代码

| 路径 | 说明 |
|------|------|
| `hg/core.ts` | HG 业务辅助 |
| `hg/followLoop.ts` | 跟单循环（服务层也可能引用 `services/hgFollowLoop`） |

如需 HG 赛事列表，须另接皇冠 API 或 A8 插件通道，不在本 collector 范围内。
