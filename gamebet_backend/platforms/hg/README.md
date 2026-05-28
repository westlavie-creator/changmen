# HG 平台（皇冠）

A8 采集模式：**插件 HTTP**（`transform.php`），偏账户/订单适配。

## 数据流

```text
POST {gateway}/transform.php?ver={ver}
  p=get_member_data  → 余额
  p=memSet           → 欧赔偏好（首次）
```

## 启用

```powershell
$env:ENABLE_HG = "1"
$env:HG_GATEWAY = "https://..."
$env:HG_TOKEN = '{"uid":"...","ver":"..."}'
npm run web
```

CLI 查余额：

```powershell
npm run hg:balance
```

页面：`http://localhost:3456/platforms/hg/`

## 说明

皇冠在 A8 中**无标准电竞实时赔率流**；本 Feed 提供账户轮询与订单适配占位，比赛列表为空属预期行为。
