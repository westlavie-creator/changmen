# backend/public — 静态资源（磁盘布局）

HTTP 路径仍为 A8 兼容的 `/esport2/*`；`static_files.js` 通过 `paths.js` 映射到本目录。

| 磁盘 | URL | 用途 |
|------|-----|------|
| `assets/` | `/esport2/assets/*` | A8 `index.css` 引用的字体/图片；`login-carousel/` 为 changmen 登录轮播 |
| `extensions/` | `/esport2/extensions/*.zip` | Chrome 扩展发布包（`npm run chromeplug:pack`） |
| `version.json` | `/esport2/version.json` | 扩展版本（与 `assets/version.json` 签名包版本不同） |

同步 A8 资源：

```bash
cd changmen/server/backend && node scripts/sync-a8-esport2-assets.mjs
```

**勿**移动 `assets/` 根目录下 A8 哈希文件名 — `index.css` 与 `client/web` 样式中的 `url(/esport2/assets/…)` 依赖扁平路径。
