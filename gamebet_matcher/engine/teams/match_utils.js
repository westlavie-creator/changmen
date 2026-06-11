"use strict";

function stableId(seed) {
  let h = 0;
  for (const c of String(seed)) h = (Math.imul(31, h) + c.charCodeAt(0)) >>> 0;
  return h || 1;
}

function formatTitle(home, away) {
  const h = String(home || "").trim();
  const a = String(away || "").trim();
  if (h && a) return `${h} vs ${a}`;
  return h || a || "Unknown";
}

function betKey(provider, sourceMatchId) {
  return `${provider}:${sourceMatchId}`;
}

function isPlaceholderTeamName(name) {
  const t = String(name || "").trim();
  return !t || t === "主队" || t === "客队" || t === "Unknown";
}

/** `Title` 形如「主队 vs 客队」→ { home, away } */
function parseTitleTeams(title) {
  const t = String(title || "").trim();
  if (!t.includes(" vs ")) return null;
  const parts = t.split(" vs ").map((s) => s.trim());
  if (parts.length < 2) return null;
  const [home, away] = parts;
  if (isPlaceholderTeamName(home) || isPlaceholderTeamName(away)) return null;
  return { home, away };
}

module.exports = { stableId, formatTitle, betKey, isPlaceholderTeamName, parseTitleTeams };
