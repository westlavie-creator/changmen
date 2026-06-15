import { spawnSync } from "node:child_process";

/** Windows 控制台默认 GBK，Node 输出 UTF-8 会乱码；须在同一控制台会话内 chcp 65001 */
export function ensureWinConsoleUtf8() {
  if (process.platform !== "win32") return;

  const chcp = `${process.env.SystemRoot || "C:\\Windows"}\\System32\\chcp.com`;
  try {
    // stdio:inherit — 子进程 chcp 才能改当前终端代码页（ignore 无效）
    spawnSync(chcp, ["65001"], { stdio: "inherit", windowsHide: true });
  } catch {
    /* ignore */
  }

  if (process.stdout?.setDefaultEncoding) {
    try {
      process.stdout.setDefaultEncoding("utf8");
    } catch {
      /* ignore */
    }
  }
  if (process.stderr?.setDefaultEncoding) {
    try {
      process.stderr.setDefaultEncoding("utf8");
    } catch {
      /* ignore */
    }
  }
}
