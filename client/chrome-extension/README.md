# Gamebet Chrome 扩展（复刻 A8 插件）

changmen 前端通过 `chrome-plugin/bridge.ts` 与扩展通信，协议对齐 A8 的 `Zn`（`GET` / `POST` / `getStore` / `setStore` / `setTab` / `version` / `proxy`）。

Mode P 启动：`BAT\dev.bat parity` 或 `BAT\dev.bat`（浏览器 + 插件）。

## 固定扩展 ID

```
mogfpjihgoghabicofkbcmcidlcoofee
```

与 `client/web/src/config/gamebetExtension.ts` 中 `GAMEBET_EXTENSION_ID_DEFAULT` 一致。

## 安装

### Chrome / Edge（浏览器模式）

1. Chrome 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择本目录 `changmen/client/chrome-extension`
4. 确认扩展 ID 为 `mogfpjihgoghabicofkbcmcidlcoofee`
5. 启动 changmen 前端（`client/web`），PB / Stake / v4 等会经扩展代发 HTTP
6. Stake：在同一 Chrome 配置文件中打开 `stake.com`，扩展会自动 `setTab`

## 功能（与 A8 一致）

| 能力 | 说明 |
|------|------|
| **跨域 HTTP** | 页面 `chrome.runtime.sendMessage` → 扩展 background 用 **axios** 代发（与 A8 `ht.request` 一致） |
| **标签页代发** | 带 `options.tabId` 时转发到 Stake 等标签页的 content script（GraphQL + WebSocket） |
| **凭证采集** | 在 PB / OB / RAY / IM 等站点登录后，页面顶部浮动图标 → 复制 Base64 凭证到 changmen 账号 |
| **ModifyHeader** | 外部页面经 `setStore` 写入 `{ key: "ModifyHeader", data: [{ UrlPattern, UserAgent }] }`，background 用 DNR 改写 UA |
| **Stake WS 重连** | graphql-transport-ws 断线自动重连 + ping |
| **Stake tabId** | 打开 `stake.com` 后自动 `setTab`，供采集/下注使用 |
| **Polymarket 凭证采集** | 登录 `polymarket.com` 后按需读取 storage 中可见的 API 凭证片段、钱包/资金地址，右上角图标复制到 changmen 账号 |

当前版本 **1.2.3**：content / background 均已可读化打包，协议对齐 A8 2.0.149；使用 `storage.local`（无 sync）。

## 目录结构

```
client/chrome-extension/
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
cd changmen/client/chrome-extension
npm run build               # 打包 background.js、content.js、version.json
npm run pack                # build + 生成 dist/gamebet-chromeplug-v*.zip（发给朋友）
npm run icons               # 重新生成占位图标
```

仓库根目录也可：`npm run chromeplug:pack`（输出在 `changmen/dist/`）。

Windows：在仓库根目录执行 `npm run chromeplug:pack`，或双击 `BAT\dev.bat` 后于 `changmen/` 运行该命令。

前端启动时会调用 `initGamebetExtension()`（`pluginBridge.ts`），将扩展版本写入 `localStorage.extensionVersion`，侧边栏 `ExtensionsBadge` 会显示该版本。

修改 `src/content/` 或 `src/background/` 后执行 `npm run build`。不再依赖 minified A8 bundle。

## 与 A8 官方插件区别

| 项 | A8 官方 | client/chrome-extension |
|----|---------|-------------------|
| 扩展 ID | `phnhdoaolljdeohmagpngbijbjbiecde` | `mogfpjihgoghabicofkbcmcidlcoofee` |
| 名称 | 电竞预测大师 | gamebet |
| 协议 | 相同 | 相同（含 ModifyHeader / setStore） |

可与 A8 官方插件**同时安装**，互不冲突。

## PB 使用提示

1. 浏览器登录 PB 站点（如 `*/compact/sports/*` 或 `*/esports-hub/*`）
2. 点击顶部浮动图标 →「确认」复制 Base64
3. 在 changmen 账号编辑里粘贴凭证

凭证格式见后端 `account/clipboard_credential.js`。

## Polymarket 使用提示

1. 浏览器登录 `polymarket.com`
2. 手动打开账户页或交易页，让网页把账户相关信息写入本地 storage
3. 点击顶部浮动图标 → 复制 `数据` 或 `token` 到 changmen 账号设置

说明：为避免影响 Polymarket 登录，插件不再改写网页 `fetch`/XHR；官方 CLOB API 的 `secret` 不一定会出现在 storage 里，缺失时需要通过官方 API/SDK 生成后手动填入账号 Token。
