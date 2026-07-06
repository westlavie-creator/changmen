# VPS 运行时环境变量模板

生产环境 **实际文件** 在 VPS 上：

| 文件 | 路径 |
|------|------|
| 后端 / RDS / JWT / Telegram | `server/backend/.env` |
| Matcher 独立模式（可选） | `server/matcher/.env` |

```bash
cp deploy/env/backend.env.example server/backend/.env
```
