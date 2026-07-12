# @changmen/team-resolver

电竞 **队名解析**：平台队名 → canonical team id（PandaScore / Liquipedia / 本地缓存）。

## 使用方

| 包 | 关系 |
|----|------|
| `server/matcher` | `matchMerge` 前队名归一（`requirePlatform` 加载 `team_db.js`） |
| `server/match-engine` | `resolveCanonicalTeamName` 等工具 |

## 目录

| 路径 | 内容 |
|------|------|
| `index.js` | `resolve(teamName, gameCode)` 主入口 |
| `team_db.js` | matcher 用的 DB 插件面 |
| `providers/` | PandaScore、Liquipedia |
| `scrapers/` | RAY / OB / PB 队名爬取（`npm run scrape:*`） |
| `cache/` | 本地 TTL 缓存 |

## 命令

```bat
cd server/team-resolver
npm run scrape:ray:dry
npm test
```

环境：`PANDASCORE_TOKEN`（可选）。`.env` 经 `@changmen/storage/load_env.js` 加载。

相关：[server/match-engine/README.md](../match-engine/README.md)
