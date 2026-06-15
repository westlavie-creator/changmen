# @changmen/api-contract

客户端与服务端的 **HTTP 契约包**：action 名称、DTO 类型、URL 拼装。

## 使用方

| 包 | 用途 |
|----|------|
| `client/web` | `post()`、`VITE_API_BASE`、类型 |
| `server/backend` | `EsportAction` 与 router 对齐 |
| 脚本 | `urls.mjs` 拼联调 URL |

## 导出

| 路径 | 内容 |
|------|------|
| `@changmen/api-contract` | 类型 + action 常量 |
| `@changmen/api-contract/urls` | `buildEsportUrl`、`buildHttpRelayUrl` |
| `@changmen/api-contract/openapi.yaml` | OpenAPI 3 索引 |

## 版本

`0.1.0` — monorepo workspace `*`；拆仓后按 semver 发版，破坏性 DTO 变更升 major。

## 校验

```bat
node packages/api-contract/urls.test.mjs
```
