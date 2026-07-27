# changmen 客户端证书（mTLS）工具

无域名也能用：自建 CA → HTTPS（SAN=公网 IP）→ 强制客户端证书。  
**脚本进 git；私钥 / `.p12` 只在本机 `out/`（已 gitignore）。**

需要本机有 **openssl**，以及 **bash**（Git for Windows 的 Git Bash，或 WSL）。

## 最简单：双击 BAT

| 文件 | 作用 |
|------|------|
| **`menu.bat`** / **`证书工具.bat`** | 菜单：选 1～5（英文界面，避免 CMD 乱码） |
| `01-init-ca.bat` | 初始化根 CA |
| `02-issue-server.bat` | 签发服务端证（会问 IP） |
| `03-issue-client.bat` | 签发客户端 `.p12`（会问名称和密码） |
| `04-revoke-client.bat` | 吊销 |
| `05-print-upload-cmds.bat` | 打印上传命令 |

推荐：双击 `menu.bat` → 1 → 2 → 3 → 5。

用户可通过 HTTP 下载根证书（无需客户端证）：

- 说明页：`http://<IP>/setup/`
- 直链：`http://<IP>/setup/ca.crt`

## 或用 Git Bash（同样顺序）

```bash
cd certificate

bash 01-init-ca.sh
bash 02-issue-server.sh 47.57.10.202          # 换成你的 VPS IP
P12_PASSWORD='设一个密码' bash 03-issue-client.sh alice   # 给你自己 / 每个用户各跑一次

bash 05-print-upload-cmds.sh 47.57.10.202     # 打印 scp 命令，复制执行
```

然后：

1. 把 `Caddyfile.mtls.example` 里的 IP 改成你的，上传覆盖 `/etc/caddy/Caddyfile`
2. `caddy validate` + `systemctl reload caddy`
3. 云安全组放行 **443**

## 用户装什么

每人两个文件：

| 文件 | 装到哪 |
|------|--------|
| `out/ca.crt` | Windows「受信任的根证书颁发机构」 |
| `out/clients/<名字>.p12` | 「个人」（导入时输入你设的密码） |

浏览器打开 **`https://你的IP/`** → 选自己的证书 → 再登录（原账号密码）。

## 登录门（证书 + 插件）

生产 Gate：**有效客户端证书** 与 **Chrome 插件** 都具备才显示登录框，否则 `Coming soon`。

- 前端：`useCertGate` 调 `GET /api/client-cert-status`
- Caddy：用 `Caddyfile.dual.example`（`:443` 注入 `X-Changmen-Client-Cert`；`:80` 仅 `/setup` 装证引导，其余 308 → https）
- 本机 DEV：默认跳过证书门（`VITE_SKIP_CERT_GATE=0` 可强制检测）

## 脚本一览

| 脚本 | 作用 |
|------|------|
| `01-init-ca.sh` | 建根 CA |
| `02-issue-server.sh <IP>` | 服务端证（绑 IP） |
| `03-issue-client.sh <用户名>` | 客户端 `.p12` |
| `04-revoke-client.sh <用户名>` | 吊销并刷新 CRL |
| `05-print-upload-cmds.sh <IP>` | 打印上传命令 |
| `Caddyfile.mtls.example` | Caddy mTLS 模板 |

## 吊销

```bash
bash 04-revoke-client.sh alice
# 按提示把 out/crl/ca.crl 传到 VPS 后 reload caddy
```

## 注意

- 先在本机装好 CA + 自己的 p12，再 reload 生产 Caddy，否则会把自己锁在门外。
- `.p12` / `ca.key` 不要公开网盘明文传。
- 正式启用前 `deploy/Caddyfile` 仍是 HTTP；本目录模板是启用 mTLS 时用的副本。
