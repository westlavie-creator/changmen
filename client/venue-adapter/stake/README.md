# Stake

GraphQL 下单 / 余额 / 订单 + 赛事 GraphQL 采集 + A8 Socket 赔率频道。

| 目录 | 用途 |
|------|------|
| 根目录 `collect.ts` / `bet.ts` / `graphql.ts` / `pluginApi.ts` 等 | **浏览器采集与下注**（主链路，经 Chrome 扩展 GraphQL） |
| `devtools/platform-probes/stake/` | 可选 Node 探针 CLI |

生产代码在平台根目录，不在 `frontend/`。

**前置**：安装 Chrome 扩展、登录 stake.com；采集账号需配置 `token`（x-access-token）与 `gateway`。

```bat
cd changmen/devtools/platform-probes
npm run stake:sports
```

详见 `devtools/platform-probes/stake/docs/README.md`。
