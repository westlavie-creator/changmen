#!/usr/bin/env node
/** One-off: probe predict.fun mainnet categories via direct fetch (run on HK VPS). */
const apiKey = String(process.env.PREDICT_FUN_API_KEY || process.argv[2] || "").trim();
if (!apiKey) {
  console.error("usage: PREDICT_FUN_API_KEY=... node scripts/_probe_predict_mainnet.mjs");
  process.exit(1);
}

const base = process.env.PREDICT_FUN_API_BASE || "https://api.predict.fun";
const qs = new URLSearchParams({
  first: "50",
  status: "OPEN",
  marketVariant: "SPORTS_TEAM_MATCH",
});

let after;
const rows = [];
for (let page = 0; page < 5; page += 1) {
  const pageQs = new URLSearchParams(qs);
  if (after)
    pageQs.set("after", after);
  const res = await fetch(`${base}/v1/categories?${pageQs}`, {
    headers: { Accept: "application/json", "x-api-key": apiKey },
  });
  const text = await res.text();
  if (!res.ok) {
    console.log("status", res.status, text.slice(0, 400));
    process.exit(1);
  }
  const json = JSON.parse(text);
  const batch = Array.isArray(json?.data) ? json.data : [];
  rows.push(...batch);
  after = json?.cursor ? String(json.cursor) : undefined;
  if (!after || !batch.length)
    break;
}
console.log("categories_total", rows.length);
for (const row of rows.slice(0, 3)) {
  console.log("-", row.id, row.slug, (row.tags || []).map(t => t.name).join(","));
}

const esportRe = /\b(cs2|counter[- ]?strike|lol|league[- ]?of[- ]?legends|dota-?2|valorant|esport|esports|lck|lpl|lec|lcs|vct|blast|iem|esl)\b/i;
const esportRows = rows.filter((c) => {
  const tags = (c.tags || []).map(t => String(t.name || ""));
  if (tags.some(t => esportRe.test(t)))
    return true;
  const teams = c.teams || [];
  if (teams.some(t => esportRe.test(String(t.league || ""))))
    return true;
  const markets = c.markets || [];
  return markets.some(m => esportRe.test(String(m.team?.league || "")));
});
console.log("esport_total", esportRows.length);
for (const row of esportRows.slice(0, 8)) {
  const tagNames = (row.tags || []).map(t => t.name).join(",");
  const leagues = [...new Set((row.teams || []).map(t => t.league).filter(Boolean))].join(",");
  console.log(" esport", row.id, row.slug, "tags:", tagNames, "leagues:", leagues);
}
