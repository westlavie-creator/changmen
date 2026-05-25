"use strict";

const $ = id => document.getElementById(id);

function send(type) {
  return chrome.runtime.sendMessage({ type });
}

function log(message) {
  $("log").textContent = message || "";
}

function setText(id, value) {
  $(id).textContent = String(value == null ? "" : value);
}

async function refresh() {
  const res = await send("ob-collector-status");
  if (!res || !res.ok) {
    log(res && res.error || "status failed");
    return;
  }
  const summary = res.summary || {};
  setText("enabled", res.config.enabled ? "running" : "stopped");
  setText("current", res.currentTabUrl || "N/A");
  setText("matches", summary.matches || 0);
  setText("markets", summary.markets || 0);
  setText("odds", summary.currentOdds || 0);
  setText("updates", summary.realtimeUpdates || 0);
  setText("requests", summary.requests || 0);
  setText("ws", summary.websockets || 0);
}

$("start").addEventListener("click", async () => {
  const res = await send("ob-collector-start-current-origin");
  log(res.ok ? `Started for: ${res.pattern}\nRefresh the OB page now.` : res.error);
  await refresh();
});

$("startAll").addEventListener("click", async () => {
  const ok = confirm("This records OB-related metadata on every site in this Chrome profile. Use only in a dedicated test profile. Continue?");
  if (!ok) return;
  const res = await send("ob-collector-start-all");
  log(res.ok ? "Started for all sites. Refresh the OB page." : res.error);
  await refresh();
});

$("stop").addEventListener("click", async () => {
  const res = await send("ob-collector-stop");
  log(res.ok ? "Stopped." : res.error);
  await refresh();
});

$("clear").addEventListener("click", async () => {
  const ok = confirm("Clear all stored OB collector data?");
  if (!ok) return;
  const res = await send("ob-collector-clear");
  log(res.ok ? "Cleared." : res.error);
  await refresh();
});

$("export").addEventListener("click", async () => {
  const res = await send("ob-collector-export");
  log(res.ok ? `Exported.\n${JSON.stringify(res.summary, null, 2)}` : res.error);
  await refresh();
});

refresh();
