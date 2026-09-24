# polymarket-football (`@changmen/polymarket-football-collector`)

VPS 独立守护进程：作为**不能直连 PM 用户的 fallback**，定时从 Polymarket
Gamma/CLOB 拉足球比赛与初始盘口，原子发布到
`storage/sport/soccer6/match_list.json`。生产 `changmen-esport` 设置
`PM_FOOTBALL_COLLECTOR_OWNED=1` 后只读该快照，不在用户请求内直连 Gamma。

浏览器若通过登录时的 PM 官方可达性探测，会直接从 PM Gamma/CLOB 拉比赛和初始盘口；
探测不可达或直连请求失败才使用此快照。足球实时盘口同理在 PM 官方 Market WS 与
独立 `PM-SPORT-MARKET` hub 之间选择，不复用电竞 WS 实例。

```text
Gamma + CLOB /prices
  → changmen-pm-football-collector（默认 30s）
  → storage/sport/soccer6/match_list.json
  → Client_GetFootballMatchs（fallback）
```

运行：仓库根 `npm run pm-football-collector`；生产 PM2 名
`changmen-pm-football-collector`。

环境变量：

- `PM_FOOTBALL_COLLECTOR_INTERVAL_MS`：采集间隔，默认 `30000`。
- `FOOTBALL_GAMMA_LIVE_BUDGET_MS`：单轮 Gamma 总预算，默认 `12000`。
- `ESPORT_DATA_DIR`：与 `changmen-esport` 共用的快照目录。

保护：网络错误保留旧快照；已有非空快照时，单轮空结果不会覆盖旧数据。
