# Gamebet 浏览器扩展（gamebet_chromeplug）

自 `A8plug` 完整拷贝，协议与 A8「电竞预测大师」一致（`POST` / `GET` / `getStore` 等），使用 **独立固定公钥**，与官方 A8 扩展可同时安装。

## 固定扩展 ID

```
mogfpjihgoghabicofkbcmcidlcoofee
```

见 `extension-id.json`。前端默认使用该 ID，也可通过 `VITE_GAMEBET_EXTENSION_ID` 覆盖。

## 安装（开发）

1. Chrome 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择本目录 `gamebet_chromeplug`
4. 确认扩展 ID 为 `mogfpjihgoghabicofkbcmcidlcoofee`
5. 启动 gamebet 前端（`gamebet_frontend/app`），信用盘 v4 等会优先经本扩展代发 HTTP

## 与 A8 官方插件区别

| 项 | A8 官方 | gamebet_chromeplug |
|----|---------|-------------------|
| 扩展 ID | `phnhdoaolljdeohmagpngbijbjbiecde` | `mogfpjihgoghabicofkbcmcidlcoofee` |
| manifest `key` | A8 公钥 | Gamebet 新公钥（见 `manifest.json`） |
| 显示名称 | 电竞预测大师 | Gamebet 采集助手 |

`background.js` / `content.js` 当前与 A8 拷贝一致，未改消息协议。

## 私钥（可选）

首次生成时可能在目录下存在 `key.pem`（用于将来打包 CRX / 商店更新）。**勿提交到 git**（已在仓库 `.gitignore` 忽略）。仅 `manifest.json` 中的公钥 `key` 字段即可保证解压安装的扩展 ID 固定。

## 生产域名（待定）

`externally_connectable` 仍为 `http(s)://*/*`，与 A8 相同。生产域名确定后可在阶段 B 收紧为仅允许 gamebet 前端域名。
