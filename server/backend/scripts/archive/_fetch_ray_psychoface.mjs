#!/usr/bin/env node
import { requirePlatform } from "../core/shared/adapter_paths.js";
import { rayApiUrl } from "../core/shared/ray_paths.js";
const { getRayA8CollectCredentials } = requirePlatform("RAY", "node", "collect_credentials.js");
const { rayHeaders } = requirePlatform("RAY", "node", "session.js");

const cred = getRayA8CollectCredentials();
const url = `${rayApiUrl(cred.gateway, "match")}?match_type=2&page=1`;
const res = await fetch(url, { headers: rayHeaders(cred.token) });
const data = await res.json();
const list = data.result || [];
const hit = list.filter(r => (r.team||[]).some(t => /Psycho|ENJOY/i.test(String(t.team_name||''))));
console.log("RAY matches Psycho/ENJOY:", hit.map(r => ({
  id: r.id, game_id: r.game_id, start: r.start_time, status: r.status,
  teams: (r.team||[]).map(t => t.team_name),
})));

const oddsUrl = `${rayApiUrl(cred.gateway, "odds")}?match_id=38405081`;
const oddsRes = await fetch(oddsUrl, { headers: rayHeaders(cred.token) });
const oddsData = await oddsRes.json();
const odds = oddsData.result?.odds || [];
const win = odds.filter(o => o.group_name === '获胜者' && o.status !== 4);
console.log("\nodds match 38405081: total=", odds.length, "获胜者=", win.length);
console.log("live 获胜者:", win.filter(o => o.status === 1).slice(0,4).map(o => ({ stage: o.match_stage, name: o.name, odds: o.odds })));
