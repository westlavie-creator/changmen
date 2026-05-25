"use strict";

const $ = id => document.getElementById(id);

function send(type) {
  return chrome.runtime.sendMessage({ type });
}

function log(message) {
  $("log").textContent = message || "";
}

async function refresh() {
  const res = await send("arch-scan-status");
  if (!res || !res.ok) {
    log(res && res.error || "status failed");
    return;
  }
  $("enabled").textContent = res.config.enabled ? "running" : "stopped";
  $("records").textContent = String(res.summary.recordCount || 0);
  $("current").textContent = res.currentTabUrl || "N/A";
}

$("start").addEventListener("click", async () => {
  const res = await send("arch-scan-start-current-origin");
  log(res.ok ? `Started for: ${res.pattern}\nRefresh the target page now.` : res.error);
  await refresh();
});

$("startAll").addEventListener("click", async () => {
  const ok = confirm("This records matching metadata on every site in this Chrome profile. Use only in a dedicated test profile. Continue?");
  if (!ok) return;
  const res = await send("arch-scan-start-all");
  log(res.ok ? "Started for all sites. Use a dedicated browser profile." : res.error);
  await refresh();
});

$("stop").addEventListener("click", async () => {
  const res = await send("arch-scan-stop");
  log(res.ok ? "Stopped." : res.error);
  await refresh();
});

$("clear").addEventListener("click", async () => {
  const ok = confirm("Clear all stored scan records?");
  if (!ok) return;
  const res = await send("arch-scan-clear");
  log(res.ok ? "Cleared." : res.error);
  await refresh();
});

$("export").addEventListener("click", async () => {
  const res = await send("arch-scan-export");
  log(res.ok ? `Exported ${res.count} records.` : res.error);
  await refresh();
});

refresh();
