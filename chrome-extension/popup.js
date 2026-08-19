const ENABLED_KEY = "pbWsObserveEnabled";
const STATUS_KEY = "pbWsObserve";

document.getElementById("ver").textContent = chrome.runtime.getManifest().version;

const toggle = document.getElementById("pbWs");
const statusEl = document.getElementById("pbStatus");
const subsEl = document.getElementById("pbSubs");

function mark(ok) {
  return ok ? '<span class="ok">✓</span>' : '<span class="miss">✗</span>';
}

function isWsLive(s) {
  if (s.phase === "ws_closed" || s.phase === "off" || s.phase === "hook_stop") return false;
  if (Number(s.readyState) === 3) return false;
  if (s.connected === true || Number(s.readyState) === 1 || s.phase === "connected") return true;
  const t = String(s.lastType || "");
  return Number(s.frameCount) > 0 && /^(CONNECTED|PING|PONG|UPDATE_|FULL_)/.test(t);
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
  const live = isWsLive(s);
  const boardN = Array.isArray(s.latestOdds) ? s.latestOdds.length : 0;
  const wsClosed = Number(s.readyState) === 3 || s.phase === "ws_closed";
  const head = live
    ? "已 CONNECTED"
    : wsClosed
      ? "WS 已断开"
      : "连接中…";
  const parts = [
    head,
    s.phase ? `phase=${s.phase}` : null,
    s.readyState != null ? `rs=${s.readyState}` : null,
    s.frameCount != null ? `帧=${s.frameCount}` : null,
    s.lastType ? `last=${s.lastType}` : null,
    boardN ? `盘=${boardN}` : null,
    s.lastError ? `err=${s.lastError}` : null,
  ].filter(Boolean);
  statusEl.className = s.lastError || wsClosed ? "status err" : live ? "status ok" : "status";
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
  chrome.runtime.sendMessage({ type: "pbWsObserveGet" }, (res) => {
    if (chrome.runtime.lastError) {
      chrome.storage.local.get([ENABLED_KEY, STATUS_KEY], renderStatus);
      return;
    }
    const payload = res?.response && typeof res.response === "object" ? res.response : res;
    renderStatus({
      [ENABLED_KEY]: payload?.enabled !== false,
      [STATUS_KEY]: payload?.observe || {},
    });
  });
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
