# gamebet 仓库说明

新对话窗口建议先看：`ARCHITECTURE_QUICK.md`（运行/参考边界 + 端口 + 关键 CORS 中转点）。

本仓库用于电竞赔率聚合相关开发与参考材料。顶层目录职责如下，**请勿混淆**。

## 目录一览

| 目录 | 性质 | 说明 |
|------|------|------|
| **[`changmen/`](./changmen/)** | **主项目（可改）** | 当前 **gamebet** 的全部实现：本地后端、Vue 控制台、Chrome 扩展、脚本与数据 |
| **[`A8/`](./A8/)** | **只读参考** | 第三方 **A8 系统** 的前端材料，仅供对照与逆向，**禁止修改** |
| **[`pingtai_offical/`](./pingtai_offical/)** | **只读参考** | 各电竞**平台官网**的前端实现、抓包与页面片段，供分析接口与行为 |

```text
gamebet/
├── changmen/              ← 在这里开发、运行、提交业务代码
│   ├── gamebet_backend/
│   ├── gamebet_frontend/
│   ├── gamebet_chromeplug/
│   └── readme.md          ← 项目详细说明与启动方式
├── A8/                    ← 勿改
│   ├── A8frontendscipts/  # A8 控制台前端 bundle
│   └── A8chromeplug/      # A8 官方浏览器插件
├── pingtai_offical/       ← 勿改（除非明确在做官网对照采集）
│   └── ob/                # 示例：OB 官网相关脚本与页面
├── package.json           # 将 npm 命令转发到 changmen/
└── README.md              # 本文件
```

---

## `A8/` — A8 系统前端（只读）

存放从 A8 拷贝的**原始前端**与**官方浏览器插件**，用于理解 A8 的采集、下注、插件协议等，**不是**本项目的运行代码。

| 子目录 | 内容 |
|--------|------|
| `A8frontendscipts/` | A8 控制台前端打包脚本（如 `index.js`） |
| `A8chromeplug/` | A8 官方 Chrome 扩展（如 `2.0.149/`） |

**约定：**

- 永远 **只读**，不要改、不要删、不要从这里 `import` 到 `changmen`。
- 本项目的可运行插件在 **`changmen/gamebet_chromeplug/`**（独立扩展 ID，可与 A8 官方插件并存）。
- 本项目的可运行前端在 **`changmen/gamebet_frontend/`**。

---

## `changmen/` — gamebet 主项目

所有日常开发、构建、启动都在此目录进行。

```bash
cd changmen
npm install --prefix gamebet_backend
npm install --prefix gamebet_frontend/app

npm run web          # 本地服务 http://localhost:3456
npm run app:dev      # 开发控制台 http://localhost:5174/app/
```

也可在仓库根目录执行 `npm run web`（根目录 `package.json` 会转发到 `changmen`）。  
**`.bat` 启动脚本** 仅位于 `changmen/`（如 `start-dev.bat`）。

详细文档见 [`changmen/readme.md`](./changmen/readme.md)。

---

## `pingtai_offical/` — 各平台官网实现（参考）

存放各博彩 / 电竞**平台官网**侧的前端资源或抓包结果（例如 OB 的 `pc_index.html`、打包 JS、登录响应样例等），用于对照官方页面的请求、路由与数据结构。

**约定：**

- 默认 **只读参考**；需要更新抓包时再按需替换，不要与 `changmen` 业务代码混放。
- 与 `A8/` 无关：A8 是聚合方前端，`pingtai_offical` 是**各平台源站**前端。

---

## 快速对照

| 你想… | 去这里 |
|--------|--------|
| 改后端 API、采集、数据 | `changmen/gamebet_backend/` |
| 改 Vue 控制台 | `changmen/gamebet_frontend/app/` |
| 装 Gamebet 浏览器插件 | `changmen/gamebet_chromeplug/` |
| 看 A8 原版怎么写的 | `A8/`（只看不改） |
| OB / RAY 与 A8 对照（Token、采集、下注） | [`changmen/gamebet_frontend/app/src/collectors/docs/A8_COMPARE_OB_RAY.md`](./changmen/gamebet_frontend/app/src/collectors/docs/A8_COMPARE_OB_RAY.md) |
| 看 OB 等官网页面怎么写的 | `pingtai_offical/` |
