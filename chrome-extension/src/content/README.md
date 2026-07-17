# Content Script（可读实现）

已由 `scripts/build.mjs` 通过 esbuild 打包为根目录 `content.js`，替代 A8 legacy bundle。

## 模块

| 文件 | 职责 |
|------|------|
| `index.js` | 入口：tab 代理、Stake 初始化、平台探测与采集 UI |
| `platforms.js` | 平台 ID 枚举 |
| `utils.js` | sleep、UUID、cookie、tab 内 fetch POST |
| `collect-ui.js` | 浮动图标 + 凭证复制面板 |
| `providers.js` | OB/RAY/IM/TF/IA/SABA/PB/IMT/HGA/HG/Stake/Dex/Polymarket 的 Check/GetConfig |
| `hga-poll.js` | HGA 注单轮询上报（对齐 A8 `Ie`） |
| `tab-proxy.js` | 带 `options.tabId` 的消息转发到 Stake handler |
| `stake/init.js` | stake.com：setTab + GraphQL WS + A8 Socket.IO |
| `stake/subscription.js` | 订阅管理与赔率增量格式 |
| `stake/graphql-ws.js` | graphql-transport-ws 客户端（断线重连 + ping） |
| `stake/a8-bridge.js` | A8 聚合已移除；no-op |
| `polymarket/init.js` | polymarket.com：按需读取 storage 中可见凭证并生成复制配置 |
| `config.js` | Stake lockdownToken 等（A8 WS 已清空） |
