# PB 平台（平博 / Pinnacle 电竞）



后端轮询平博 **电竞 euro odds** 接口（`sportId=12`），解析逻辑对齐 A8 bundle 中的 `PZe` / `L7` / `P0`。



## 推荐流程（与 OB 对齐：插件采凭证 + Node Feed）



```text
平博页登录 → A8 插件图标 → 复制弹窗里的 data（Base64）
    → import-platform 写入 platforms.json
    → 打开 /console/ → 浏览器 bQ 写 fo() + SaveMatch（纯 A8，默认）

可选 Node 侧：
    ENABLE_PB=1 → PbFeed 轮询 → /api/snapshot（仪表盘）
    ESPORT_BRIDGE=1 →  additionally 写入 matches.json
    ENABLE_PB_NODE=1 + patch:ui → 关 bQ，PB 走 /esport/pb/proxy
```



### 1. 插件采集凭证



1. 在平博电竞页登录（URL 含 `/esports-hub/` 或 `/compact/sports/`）

2. 点击 A8 第三方插件图标，复制 **`data` 字段**（整段 Base64，不是 gateway/token 单独字段）

3. 可先校验：`npm run account:cli -- parse-credential <base64>`



### 2. 导入 platforms.json



```bash

cd scripts

npm run account:import-platform -- "<粘贴的 base64>" --sync-store

```



- 写入 `scripts/data/esport/platforms.json` 的 `PB` 段（gateway、token、referer、games）

- `--sync-store` 可选：立即同步到 esport store，供控制台 `Client_GetCollectPlatform` 使用



### 3. 启动 Node 采集（与 OB 相同）



```bash

set ENABLE_PB=1

npm run web

# → http://localhost:3456/console/

```



PbFeed 每 5s 拉盘并写入 store；控制台 PB 余额/下单仍通过 **Chrome 插件 Yn** 代发（需安装插件并在平博页保持登录）。



## 数据流



```text

Node: GET {gateway}/sports-service/sv/euro/odds?sportId=12&...

Node: POST {gateway}/member-service/v2/account-balance

浏览器: bQ 轮询 + Yn GET/POST（插件 background 代发）

```



凭证：`token` 为插件同款 JSON 字符串（含 `x-app-data`、`custid_515`、`v-hucode`）。



## 配置



### 环境变量



| 变量 | 说明 |

|------|------|

| `ENABLE_PB` | 设为 `1` 在 Dashboard 启用 PbFeed（默认关闭） |

| `PB_GATEWAY` / `PB_TOKEN` | 可选，替代 platforms.json |

| `PB_COOKIE` / `PB_REFERER` / `PB_USER_AGENT` | 可选 |

| `PB_GAME_SLUGS` | 可选 slug 过滤 |

| `PB_SYNC_MS` | Feed 间隔，默认 5000 |

| `ENABLE_PB_NODE` | 设为 `1` 后 patch 禁用 bQ、Yn 改走 `/esport/pb/proxy`（高级/无插件场景） |

| `A8_V4_URL` | 控制台「平博体育」v4 代理目标，默认 `https://api.a8.to/v4.0` |

| `A8_V4_USER` / `A8_V4_PASSWORD` | 本地控制台用户与 A8 不一致时，用此账号代登 v4（密码默认 `a123456`） |

| `A8_V4_LOCAL` | 设为 `1` 时不代理 A8，仅本地 stub（调试用） |

| `A8_V4_PB_FALLBACK` | 默认开启；A8 不可用或返回空 Url 时，用 `PB_PLAY_URL` 或 platforms.json 的 gateway 打开平博页 |

| `PB_PLAY_URL` | 可选，覆盖平博 SSO 跳转地址 |



### 控制台「平博体育」（方案 A：A8 账号）

默认 **控制台登录与平博 SSO 均走 A8 真实账号**（不再使用本地 `admin` + 写死 `a123456`）。

```bash
cd scripts
npm run account:set-a8 -- <A8用户名> <A8密码>
npm run web
```

在 `http://localhost:3456/console/` 用 **同一 A8 用户名和密码** 登录，再点「平博体育」即可从 A8 获取 SSO 链接。

| 变量 | 说明 |
|------|------|
| `A8_AUTH` | 默认开启；设为 `0` 退回本地 `users.json` 登录 |
| `A8_V4_URL` | v4 代理地址，默认 `https://api.a8.to/v4.0` |
| `A8_V4_PB_FALLBACK` | 方案 A 下默认关闭；仅无 A8 时设 `1` 才降级打开 gateway |

配置文件：`scripts/data/esport/a8_config.json`（可参考 `a8_config.example.json`）。



### platforms.json 示例



```json

"PB": {

  "gateway": "https://www.example.com",

  "token": "{\"x-app-data\":\"...\",\"custid_515\":\"...\",\"v-hucode\":\"...\"}",

  "referer": "https://www.example.com",

  "cookie": "",

  "betName": ".*",

  "games": ["cs2", "valorant", "league-of-legends", "dota-2", "king-of-glory"],

  "provider": "PB",

  "updatedAt": 1779649009487

}

```



`games` 与 `game_catalog.json` 中 `platforms.PB` 对应。



## CLI



```bash

cd scripts

npm run account:import-platform -- "<base64>" --sync-store

npm run pb:odds

npm run pb:match -- 1631272511

npm run pb:balance

```



## 与 A8 对齐



| 项 | A8 bundle | 本地（默认） |

|----|-----------|--------------|

| 凭证采集 | 插件 GetConfig → data | 同上，手动粘贴 → import-platform |

| 赔率采集 | `bQ` → euro/odds | **PbFeed** + 可选浏览器 `bQ` |

| 请求头 | `P0()` | `buildAuthHeaders` |

| 解析 | `PZe` | `parseEuroOddsPayload` |

| 写入 store | `API_SaveMatch` / `API_SaveBet`（浏览器 bQ） | `ESPORT_BRIDGE=1` 时 feed_bridge + PbFeed |

| 余额/下单 | 插件 `Yn` | 插件 `Yn`（`ENABLE_PB_NODE=1` 时改 proxy） |



token 过期后：重新在平博页点插件 → 复制 data → 再执行 `import-platform`。

