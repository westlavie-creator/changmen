# archive/

已完成的一次性 codemod / 离线分析脚本。**不在** `package.json` 中引用。

| 脚本 | 用途 |
|------|------|
| `migrate-venue-*.mjs` | venue-adapter 迁到 `@changmen/client-core` 时的 import 替换 |
| `migrate-platforms-import.mjs` | platforms import 路径迁移 |
| `analyze-venue-cycles.mjs` | 依赖环离线分析 |

运行（若需重放）：在 `client/web` 下 `node scripts/archive/<name>.mjs`。

常驻脚本（dev/build/test）留在 `scripts/` 根目录。
