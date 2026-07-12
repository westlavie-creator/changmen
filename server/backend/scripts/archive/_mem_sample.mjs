#!/usr/bin/env node
/** Sample changmen-esport RSS every N seconds (run on VPS). */
import { execSync } from "node:child_process";

const intervalMs = Number(process.env.SAMPLE_MS || 30_000);
const samples = Number(process.env.SAMPLES || 8);

for (let i = 0; i < samples; i++) {
  const ts = new Date().toISOString();
  let pm2 = "";
  let health = "";
  try {
    pm2 = execSync("pm2 jlist", { encoding: "utf8" });
    const list = JSON.parse(pm2);
    const p = list.find(x => x.name === "changmen-esport");
    if (p) {
      const rss = Math.round((p.monit?.memory || 0) / 1024 / 1024);
      const heap = p.pm2_env?.axm_monitor?.["Used Heap Size"] || "?";
      console.log(`${ts} rss=${rss}MB heap=${heap} uptime=${Math.round((Date.now() - p.pm2_env.pm_uptime) / 1000)}s`);
    }
  }
  catch (err) {
    console.log(ts, "sample err", err.message);
  }
  try {
    health = execSync('curl -sS -m 8 http://127.0.0.1:3456/health', { encoding: "utf8" });
    const j = JSON.parse(health);
    console.log(`  api=${j.esportApi?.counter} rss_health=${j.memory?.rss} heap=${j.memory?.heapUsed} pool=${j.db?.pool?.total}`);
  }
  catch {
    console.log("  health timeout");
  }
  if (i + 1 < samples)
    await new Promise(r => setTimeout(r, intervalMs));
}
