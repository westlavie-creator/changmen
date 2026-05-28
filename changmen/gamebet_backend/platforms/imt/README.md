# IMT 平台

A8 采集模式：**HTTP 双轮询**（全量 60s + delta 1s）。

## 数据流

```text
POST {gateway}/mobilesitev2/api/Event/GetAllLiveEvents
POST {gateway}/mobilesitev2/api/Event/getAllLiveEventsDelta
```

请求头：`x-token`、`x-v`（token 为 base64 JSON，含 `tk`/`v`）、`x-sc`、`referer`、`user-agent` 等。

赔率 key：`{si}:{wsi}`（主客 si 707/708）。A8 仅采集 `gamenr>0` 的地图获胜盘。

## 环境变量

| 变量 | 说明 |
|------|------|
| `ENABLE_IMT=1` | 启用 IMT Feed |
| `IMT_GATEWAY` | 站点根 URL |
| `IMT_TOKEN` | base64 编码的 JSON 会话（含 `tk`、`v`） |
| `IMT_REFERER` | Referer，默认同 gateway |
| `IMT_USER_AGENT` | User-Agent |
| `IMT_X_SC` | `x-sc` 头（可选） |
| `IMT_SPORT_IDS` | SportId 列表，默认 `43`（电竞大类） |
| `IMT_FULL_MS` | 全量间隔，默认 60000 |
| `IMT_DELTA_MS` | delta 间隔，默认 1000 |

## 启动

```powershell
$env:ENABLE_IMT = "1"
$env:IMT_GATEWAY = "https://your-imt-host"
$env:IMT_TOKEN = "base64-json-token"
npm run web
```

CLI：`npm run imt:events`

页面：`http://localhost:3456/platforms/imt/`
