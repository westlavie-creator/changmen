# A8 对外通信采集器（Chrome 插件）

在**已登录 A8 的生产环境浏览器**中加载本插件，运行约 **30 分钟**，按 **域名** 本地记录对外通信：

- **A8 域**：`api.a8.to`、`*.a8.to`、`47.115.75.57`（WS 中继）
- **平台域**：运行时自动发现的所有非 A8 域名（OB/RAY/PB 等 gateway，含插件代发 HTTP）

**数据仅保存在本机**，不会上传。

## 安装

1. Chrome → `chrome://extensions` → 开发者模式 → **加载已解压的扩展程序**
2. 选择目录：`gamebet_frontend/a8-capture-extension`
3. 建议同时启用 Gamebet 插件（`gamebet_chromeplug`）

## 30 分钟采集流程

1. 登录 `https://api.a8.to/esport2/#/`
2. 点击插件 → **「开始 A8 采集（30 分钟）」**
3. **刷新页面（F5）**
4. 保持打开约 30 分钟；到期自动导出 JSON

## 报告怎么看（按域名）

导出 JSON 的 **`analysis.byDomain`** 是主入口：

| 字段 | 含义 |
|------|------|
| `byDomain.a8` | 所有打到 A8 / 中继的请求与 WS，按 host、path 统计 |
| `byDomain.platform` | 所有平台域（动态发现），按 host、path 统计 |
| `byDomain.platformHostsDiscovered` | 本次出现的平台域名清单（含 OB/RAY/PB 种子标注） |
| `byDomain.a8.samples` / `platform.samples` | 各域最近请求样本（含解析后的 form body） |

每条 `records[]` 还带：

- `domainBucket`: `a8` | `platform` | `noise`
- `domainHost`: 目标主机
- `endpoint`: 如 `POST /esport/API_SaveMatch`

### 与旧版区别

- 不再用 `SaveMatch` 等 API 名做主筛选
- **A8 域看 `api.a8.to` 下全部 HTTP** 即可覆盖 SaveMatch / SaveBet / GetMatchs
- **平台域看 `platform.hosts`** 即可覆盖 OB/RAY/PB 直连

## 采集范围

| 入库 | 不入库（噪声） |
|------|----------------|
| `api.a8.to`、`47.115.75.57` | `google.com`、`gstatic.com` 等 CDN |
| 运行时发现的任意平台 gateway | `localhost` |
| WS / 插件 `webRequest` / `chrome.runtime` 消息 | |
| storage 快照 | |

平台 gateway 因账号而异，**不依赖固定列表**；`PLATFORM_SEED_HINTS` 仅作报告标注。

## 修改域名配置

编辑 `domains.js`：

- `A8_HOST_EXACT` / `A8_HOST_SUFFIXES` — A8 固定域
- `PLATFORM_SEED_HINTS` — 已知平台标注（可选）
- `NOISE_HOST_SUFFIXES` — 可忽略的 CDN

改完后在 `chrome://extensions` 重新加载插件。

## 注意

- 导出 JSON 可能含 token、完整请求体，请勿直接外传
- 必须在开始后 **刷新 A8 页面**，否则漏掉启动阶段 WebSocket

## HAR 导出 + 摘要脚本

若更习惯 DevTools Network → **Save all as HAR with content**：

1. Network 勾选 **Preserve log**，登录后刷新，跑满约 30 分钟再导出 HAR
2. 在本目录运行：

```powershell
node har-to-summary.js "C:\path\to\export.har" --out a8-har-summary.json
```

输出 `byDomain` 结构与插件 `analysis.byDomain` 对齐，便于两份报告对比。

**HAR 局限**：不含配套插件 background 代发的平台 HTTP；若 `byDomain.platform` 为空而插件报告有数据，属正常。完整分析建议 **HAR + 插件** 各一份，或只用插件。
