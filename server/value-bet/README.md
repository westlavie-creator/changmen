# value-bet — 正 EV 单边扫描

`@changmen/value-bet`：**[changmen 扩展]** 以 PB（平博）为 sharp 基准，扫描 `client_matches` 上其它软盘的正 EV 机会，写入 RDS `value_signals`。

## 进程

| 命令 | 作用 |
|------|------|
| `npm run value-bet` | 定时扫描循环（根目录 workspace） |
| `npm run value-bet:scan` | 单次扫描（`scripts/scan-once.mjs`） |

非 PM2 默认进程；按需手动或单独注册。配置见 `.env.example`（`VALUE_BET_*`）。

## 数据流

```text
RDS client_matches（matcher 写入）
    │
    ▼
engine/scanner.js — fair odds / edge
    │
    ▼
db/signal_store.js — value_signals 表
```

## 相关

- 服务端索引：[server/README.md](../README.md)
- 产品线能力：`lines/esport/line.json` → `value-scan`
- SQL：`db/migrations/010_value_signals.sql`
