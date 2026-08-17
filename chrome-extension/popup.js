const ENABLED_KEY = "pbWsObserveEnabled";
const STATUS_KEY = "pbWsObserve";

document.getElementById("ver").textContent = chrome.runtime.getManifest().version;

const toggle = document.getElementById("pbWs");
const statusEl = document.getElementById("pbStatus");
const subsEl = document.getElementById("pbSubs");

function mark(ok) {
  return ok ? '<span class="ok">✓</span>' : '<span class="miss">✗</span>';
}

function renderStatus(bag) {
  const enabled = bag?.[ENABLED_KEY] !== false;
  const s = bag?.[STATUS_KEY] || {};
  toggle.checked = enabled;
  if (!enabled) {
    statusEl.className = "status";
    statusEl.textContent = "状态：已关闭";
    subsEl.innerHTML = "订阅：已关闭";
    return;
  }
  const parts = [
    s.connected ? "已 CONNECTED" : "连接中…",
    s.frameCount != null ? `帧=${s.frameCount}` : null,
    s.lastType ? `last=${s.lastType}` : null,
    s.lastError ? `err=${s.lastError}` : null,
  ].filter(Boolean);
  statusEl.className = s.lastError ? "status err" : s.connected ? "status ok" : "status";
  statusEl.textContent = `状态：${parts.join(" · ") || "等待 part888 页…"}`;

  const out = Array.isArray(s.subscribedOut) ? s.subscribedOut : [];
  const checklist = s.checklist || {};
  const required = Array.isArray(checklist.required) ? checklist.required : [];
  const reqLines = required.length
    ? required.map((r) => `${mark(r.ok)}${r.destination}`).join(" ")
    : "—";
  subsEl.innerHTML = `必查 ${reqLines}<br>SUBSCRIBE：${out.length ? out.join(", ") : "—"}`;
}

function refresh() {
  chrome.storage.local.get([ENABLED_KEY, STATUS_KEY], renderStatus);
}

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ [ENABLED_KEY]: toggle.checked === true }, refresh);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[ENABLED_KEY] || changes[STATUS_KEY]) refresh();
});

refresh();
setInterval(refresh, 1000);
