# Gamebet Chrome 扩展（复刻 A8 插件）

changmen 前端通过 `pluginBridge.ts` 与扩展通信，协议对齐 A8 的 `Zn`（`GET` / `POST` / `getStore` / `setStore` / `setTab` / `version` / `proxy`）。

## 固定扩展 ID

```
mogfpjihgoghabicofkbcmcidlcoofee
```

与 `gamebet_frontend/app/src/config/gamebetExtension.ts` 中 `GAMEBET_EXTENSION_ID_DEFAULT` 一致。

## 安装

1. Chrome 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择本目录 `changmen/gamebet_chromeplug`
4. 确认扩展 ID 为 `mogfpjihgoghabicofkbcmcidlcoofee`
5. 启动 changmen 前端（`gamebet_frontend/app`），PB / Stake / v4 等会经扩展代发 HTTP

## 功能（与 A8 一致）

| 能力 | 说明 |
|------|------|
| **跨域 HTTP** | 页面 `chrome.runtime.sendMessage` → 扩展 background 用 **axios** 代发（与 A8 `ht.request` 一致） |
| **标签页代发** | 带 `options.tabId` 时转发到 Stake 等标签页的 content script（GraphQL + WebSocket） |
| **凭证采集** | 在 PB / OB / RAY / IM 等站点登录后，页面顶部浮动图标 → 复制 Base64 凭证到 changmen 账号 |
| **ModifyHeader** | 外部页面经 `setStore` 写入 `{ key: "ModifyHeader", data: [{ UrlPattern, UserAgent }] }`，background 用 DNR 改写 UA |
| **Stake WS 重连** | graphql-transport-ws 断线自动重连 + ping |
| **Stake tabId** | 打开 `stake.com` 后自动 `setTab`，供采集/下注使用 |

当前版本 **1.2.0**：content / background 均已可读化打包，协议对齐 A8 2.0.149。

## 目录结构

```
gamebet_chromeplug/
  manifest.json       # MV3，含固定公钥 key
  background.js         # esbuild 打包（源文件 src/background/）
  content.js            # esbuild 打包的可读 content（源文件 src/content/）
  legacy/               # A8 原始 bundle 备份（content.a8.bundle.js）
  src/background/       # background + ModifyHeader（DNR）
  src/content/          # content 可读实现（见 src/content/README.md）
  vendor/               # socket.io 等第三方 bundle（Stake 桥接用）
  scripts/build.mjs     # 同步 src → 根目录 + version.json
  assets/               # 图标与 content 样式
  popup.html            # 查看版本与扩展 ID
```

## 开发

```bash
cd changmen/gamebet_chromeplug
npm run build               # 打包 background.js、content.js、version.json
npm run icons               # 重新生成占位图标
```

前端启动时会调用 `initGamebetExtension()`（`pluginBridge.ts`），将扩展版本写入 `localStorage.extensionVersion`，侧边栏 `ExtensionsBadge` 会显示该版本。

修改 `src/content/` 或 `src/background/` 后执行 `npm run build`。不再依赖 minified A8 bundle。

## 与 A8 官方插件区别

| 项 | A8 官方 | gamebet_chromeplug |
|----|---------|-------------------|
| 扩展 ID | `phnhdoaolljdeohmagpngbijbjbiecde` | `mogfpjihgoghabicofkbcmcidlcoofee` |
| 名称 | 电竞预测大师 | Gamebet 采集助手 |
| 协议 | 相同 | 相同（含 ModifyHeader / setStore） |

可与 A8 官方插件**同时安装**，互不冲突。

## PB 使用提示

1. 浏览器登录 PB 站点（如 `*/compact/sports/*` 或 `*/esports-hub/*`）
2. 点击顶部浮动图标 →「确认」复制 Base64
3. 在 changmen 账号编辑里粘贴凭证

凭证格式见后端 `account/clipboard_credential.js`。
