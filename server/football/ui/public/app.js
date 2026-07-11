const POLL_MS = 30_000;

const leagueSelect = document.getElementById("leagueSelect");
const statusSelect = document.getElementById("statusSelect");
const searchInput = document.getElementById("searchInput");
const matchList = document.getElementById("matchList");
const messageEl = document.getElementById("message");
const statusBadge = document.getElementById("statusBadge");

let searchTimer = null;

function esportConsoleUrl() {
  const host = location.hostname;
  const port = location.port;
  if ((host === "localhost" || host === "127.0.0.1") && port === "3457")
    return "http://localhost:5274/";
  return "/";
}

function readToken() {
  try {
    const ls = localStorage.getItem("app:token");
    if (ls)
      return ls;
  }
  catch {
    /* ignore */
  }
  const m = document.cookie.match(/(?:^|; )app_token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function authHeaders() {
  const token = readToken();
  return token ? { token } : {};
}

async function apiGet(path) {
  const res = await fetch(path, { headers: { ...authHeaders(), accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    messageEl.textContent = "请先登录后再访问足球页。";
    messageEl.innerHTML += ` <a href="${esportConsoleUrl()}" style="color:#93c5fd">电竞控制台</a>`;
    statusBadge.textContent = "未登录";
    statusBadge.className = "badge err";
    throw new Error("unauthorized");
  }
  if (!res.ok || data.ok === false)
    throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function fmtTime(ms) {
  if (!ms)
    return "—";
  const d = new Date(ms);
  return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status) {
  switch (status) {
    case "live": return "进行中";
    case "finished": return "已结束";
    case "scheduled": return "未开始";
    case "postponed": return "延期";
    case "canceled": return "取消";
    default: return status || "—";
  }
}

function statusClass(status) {
  if (status === "live")
    return "status-live";
  if (status === "finished")
    return "status-finished";
  return "status-scheduled";
}

function renderMatch(m) {
  const scoreText = m.Score
    ? `${m.Score.home}-${m.Score.away}`
    : "vs";
  const homeOdds = m.Odds?.home || 0;
  const awayOdds = m.Odds?.away || 0;
  const card = document.createElement("article");
  card.className = "card";
  card.innerHTML = `
    <div class="card-head">
      <span class="league">${escapeHtml(m.LeagueName || m.League)}</span>
      <span class="time">${fmtTime(m.StartTime)}</span>
    </div>
    <div class="teams">
      <div class="team home">${escapeHtml(m.HomeTeam)}</div>
      <div class="score">${escapeHtml(scoreText)}</div>
      <div class="team away">${escapeHtml(m.AwayTeam)}</div>
    </div>
    <div class="meta">
      <span class="${statusClass(m.Status)}">${statusLabel(m.Status)}</span>
      <span>${m.Period ? escapeHtml(m.Period) : ""}</span>
    </div>
    <div class="odds">
      <div class="odd ${homeOdds ? "" : "locked"}">
        <div class="odd-label">主胜</div>
        <div class="odd-value">${homeOdds ? homeOdds.toFixed(2) : "—"}</div>
      </div>
      ${m.Odds?.draw ? `<div class="odd">
        <div class="odd-label">平局</div>
        <div class="odd-value">${m.Odds.draw.toFixed(2)}</div>
      </div>` : ""}
      <div class="odd ${awayOdds ? "" : "locked"}">
        <div class="odd-label">客胜</div>
        <div class="odd-value">${awayOdds ? awayOdds.toFixed(2) : "—"}</div>
      </div>
    </div>
  `;
  return card;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function loadLeagues() {
  const data = await apiGet("/football/api/leagues");
  const current = leagueSelect.value;
  leagueSelect.innerHTML = '<option value="">全部联赛</option>';
  for (const l of data.list || []) {
    const opt = document.createElement("option");
    opt.value = l.sport;
    opt.textContent = `${l.name} (${l.matchCount ?? 0})`;
    leagueSelect.appendChild(opt);
  }
  if (current)
    leagueSelect.value = current;
}

async function loadMatches() {
  const params = new URLSearchParams();
  if (leagueSelect.value)
    params.set("league", leagueSelect.value);
  if (statusSelect.value)
    params.set("status", statusSelect.value);
  if (searchInput.value.trim())
    params.set("q", searchInput.value.trim());
  params.set("pageSize", "100");

  const data = await apiGet(`/football/api/matches?${params.toString()}`);
  matchList.innerHTML = "";
  if (!data.list?.length) {
    messageEl.textContent = "暂无比赛（可调整筛选或稍后刷新）";
    messageEl.style.display = "block";
  }
  else {
    messageEl.style.display = "none";
    for (const m of data.list)
      matchList.appendChild(renderMatch(m));
  }

  const built = data.builtAt ? new Date(data.builtAt).toLocaleTimeString("zh-CN") : "—";
  statusBadge.textContent = `${data.total} 场 · 更新 ${built}`;
  statusBadge.className = "badge ok";
}

async function refreshAll() {
  try {
    await loadLeagues();
    await loadMatches();
  }
  catch (err) {
    if (err.message !== "unauthorized") {
      messageEl.textContent = `加载失败：${err.message}`;
      messageEl.style.display = "block";
      statusBadge.textContent = "加载失败";
      statusBadge.className = "badge err";
    }
  }
}

leagueSelect.addEventListener("change", () => void loadMatches());
statusSelect.addEventListener("change", () => void loadMatches());
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadMatches(), 300);
});

void refreshAll();
setInterval(() => void refreshAll(), POLL_MS);

const esportLink = document.getElementById("esportLink");
if (esportLink)
  esportLink.href = esportConsoleUrl();
