"use strict";

const $ = (id) => document.getElementById(id);
let tickTimer = null;

function send(type) {
  return chrome.runtime.sendMessage({ type });
}

function log(message) {
  $("log").textContent = message || "";
}

function formatRemaining(ms) {
  if (!ms || ms <= 0) return "—";
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

async function refresh() {
  const res = await send("arch-scan-status");
  if (!res || !res.ok) {
    log(res && res.error ? res.error : "无法读取状态");
    return;
  }

  const running = res.config.enabled;
  $("enabled").textContent = running
    ? res.config.mode === "a8-30min"
      ? "A8 30 分钟采集中"
      : "采集中"
    : "已停止";
  $("records").textContent = String(res.summary.recordCount || 0);
  $("remaining").textContent = running && res.remainingMs ? formatRemaining(res.remainingMs) : "—";
  $("current").textContent = res.currentTabUrl || "（无活动标签）";
}

function startTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(refresh, 1000);
}

$("startA8").addEventListener("click", async () => {
  const ok = confirm(
    "将清空旧记录并开始 30 分钟全量采集（含 A8 页面 + 插件跨域请求）。\n\n确认后请刷新 A8 控制台页面（F5）。\n\n继续？"
  );
  if (!ok) return;
  const res = await send("arch-scan-start-a8-30min");
  if (res.ok) {
    log(`${res.hint}\n\n开始时间: ${res.config.startedAt}\n预计结束: ${res.config.endsAt}`);
    startTick();
  } else {
    log(res.error || "启动失败");
  }
  await refresh();
});

$("finish").addEventListener("click", async () => {
  const res = await send("arch-scan-finish-now");
  log(
    res.ok
      ? `已结束并导出。文件: ${res.exportResult?.filename || "见下载目录"}，共 ${res.exportResult?.count ?? "?"} 条。`
      : res.error || "结束失败"
  );
  await refresh();
});

$("start").addEventListener("click", async () => {
  const res = await send("arch-scan-start-current-origin");
  log(res.ok ? `已开始采集当前站点。\n匹配规则: ${res.pattern}\n请刷新目标页面。` : res.error);
  await refresh();
});

$("stop").addEventListener("click", async () => {
  const res = await send("arch-scan-stop");
  log(res.ok ? "已停止采集（未自动导出）。" : res.error);
  await refresh();
});

$("clear").addEventListener("click", async () => {
  if (!confirm("确定清空所有已采集记录？")) return;
  const res = await send("arch-scan-clear");
  log(res.ok ? "已清空。" : res.error);
  await refresh();
});

$("export").addEventListener("click", async () => {
  const res = await send("arch-scan-export");
  log(res.ok ? `已导出 ${res.count} 条记录到下载目录。` : res.error);
  await refresh();
});

refresh();
startTick();
