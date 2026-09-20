# Stake

GraphQL 下单 / 余额 / 订单 + 赛事 GraphQL 采集 + 插件 GraphQL WS 实时赔率。

实时赔率对齐 A8 `xn.send` → `join room Stake` → `LHe` 写 fo；传输层用扩展 `stake-odds` 端口，**不连** A8 聚合机 `47.115.75.57`。

| 目录 | 用途 |
|------|------|
| 根目录 `collect.ts` / `bet.ts` / `graphql.ts` / `pluginApi.ts` 等 | **浏览器采集与下注**（主链路，经 Chrome 扩展 GraphQL） |
| `devtools/platform-probes/stake/` | 可选 Node 探针 CLI |

生产代码在平台根目录，不在 `frontend/`。

**前置**：安装 Chrome 扩展、登录 stake.com；下注账号 token 用插件「数据」粘贴（`GetConfig` 的 session cookie，对齐 A8）。

```bat
cd changmen/devtools/platform-probes
npm run stake:sports
```

详见 `devtools/platform-probes/stake/docs/README.md`。
