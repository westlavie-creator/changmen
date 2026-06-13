/**
 * 切换 GAMEBET_DB_SCRIPT（supabase | rds | dual），更新 apps/backend/.env。
 *
 * 用法：
 *   node changmen/scripts/switch-db-mode.mjs <mode> [--restart] [--status]
 *   npm run db:mode -- dual --restart   # 在 changmen 目录
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import dotenv from "dotenv";
import {
  DB_SCRIPT_MODES,
  describeDbScript,
  resolveDbScript,
} from "@changmen/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const changmenRoot = path.join(__dirname, "..");
const envPath = path.join(changmenRoot, "apps/backend/.env");

const args = process.argv.slice(2).filter((a) => a !== "--restart" && a !== "--status");
const doRestart = process.argv.includes("--restart");
const showStatus = process.argv.includes("--status") || args.length === 0;

function readEnvLines() {
  if (!fs.existsSync(envPath)) {
    console.error(`未找到 ${envPath}`);
    process.exit(1);
  }
  return fs.readFileSync(envPath, "utf8").split(/\n/);
}

function writeEnvMode(mode) {
  const lines = readEnvLines();
  const out = [];
  let hasScript = false;
  for (const line of lines) {
    if (/^\s*GAMEBET_DB_SCRIPT\s*=/.test(line)) {
      out.push(`GAMEBET_DB_SCRIPT=${mode}`);
      hasScript = true;
      continue;
    }
    if (/^\s*RDS_DUAL_WRITE\s*=/.test(line)) continue;
    if (mode === "rds" && /^\s*SUPABASE_(URL|KEY|SERVICE_KEY)\s*=/.test(line)) {
      out.push(`# ${line.trim()}  # rds 模式已停用`);
      continue;
    }
    out.push(line);
  }
  if (!hasScript) out.push(`GAMEBET_DB_SCRIPT=${mode}`);
  const text = out.join("\n").replace(/\n+$/, "") + "\n";
  fs.writeFileSync(envPath, text, "utf8");
}

function printStatus() {
  dotenv.config({ path: envPath });
  const script = resolveDbScript();
  console.log(`文件: ${envPath}`);
  console.log(`GAMEBET_DB_SCRIPT=${process.env.GAMEBET_DB_SCRIPT || "(未设置，默认 supabase)"}`);
  if (process.env.RDS_DUAL_WRITE) {
    console.log(`RDS_DUAL_WRITE=${process.env.RDS_DUAL_WRITE}（legacy，建议删掉改用 dual）`);
  }
  console.log(`生效模式: ${script} — ${describeDbScript(script)}`);
  console.log(`impl: ${script === "supabase" ? "impl_supabase" : "impl_rds"}`);
}

if (showStatus && args.length === 0) {
  printStatus();
  if (!doRestart) process.exit(0);
}

const mode = args[0]?.trim().toLowerCase();
if (!mode || !DB_SCRIPT_MODES.includes(mode)) {
  console.error(`用法: node scripts/switch-db-mode.mjs <${DB_SCRIPT_MODES.join("|")}> [--restart]`);
  console.error("  仅查看: node scripts/switch-db-mode.mjs --status");
  process.exit(1);
}

writeEnvMode(mode);
dotenv.config({ path: envPath, override: true });
console.log(`已设置 GAMEBET_DB_SCRIPT=${mode}（${describeDbScript(mode)}）`);
console.log(`已移除 RDS_DUAL_WRITE（请用 dual 代替双写）`);

if (doRestart) {
  try {
    execSync("pm2 restart gamebet-web gamebet-matcher", { stdio: "inherit" });
  } catch {
    console.warn("pm2 restart 失败（本地开发可手动 npm run web / matcher:loop）");
  }
} else {
  console.log("请执行: pm2 restart gamebet-web gamebet-matcher");
  console.log("或: npm run web / npm run matcher:loop");
}
