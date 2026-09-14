/**
 * POD 英文队名 ↔ 板上/OB 常用简称。只扩写再打分，不代替联赛+时间窗。
 */
const TEAM_ALIAS: Record<string, string> = {
  "man utd": "manchester united",
  "man united": "manchester united",
  "manchester utd": "manchester united",
  "man city": "manchester city",
  "manchester city": "manchester city",
  "spurs": "tottenham",
  "tottenham hotspur": "tottenham",
  "wolves": "wolverhampton",
  "wolverhampton wanderers": "wolverhampton",
  "inter milan": "internazionale",
  "inter": "internazionale",
  "atletico madrid": "atletico",
  "atlético madrid": "atletico",
  "atleti": "atletico",
  "psg": "paris saint germain",
  "paris sg": "paris saint germain",
  "paris saint-germain": "paris saint germain",
  "bayern": "bayern munich",
  "fc bayern": "bayern munich",
  "bayern munchen": "bayern munich",
  "leverkusen": "bayer leverkusen",
  "gladbach": "borussia monchengladbach",
  "mgladbach": "borussia monchengladbach",
  "borussia mgladbach": "borussia monchengladbach",
  "koeln": "koln",
  "cologne": "koln",
  "sporting lisbon": "sporting",
  "sporting portugal": "sporting",
  "sporting cp": "sporting",
  "athletic bilbao": "athletic",
  "athletic club": "athletic",
  "real sociedad": "sociedad",
  "brighton": "brighton hove albion",
  "nottm forest": "nottingham forest",
  "nottingham": "nottingham forest",
  "west ham": "west ham united",
  "newcastle": "newcastle united",
  "leicester": "leicester city",
  "leeds": "leeds united",
  "sheff utd": "sheffield united",
  "sheffield utd": "sheffield united",
  "qpr": "queens park rangers",
  "red star": "crvena zvezda",
  "red star belgrade": "crvena zvezda",
  "olympiacos": "olympiakos",
  "olympiakus": "olympiakos",
  "ajax amsterdam": "ajax",
  "psv eindhoven": "psv",
  "porto": "fc porto",
  "benfica": "sl benfica",
  "sl benfica": "benfica",
  "roma": "as roma",
  "as roma": "roma",
  "ac milan": "milan",
  "napoli": "ssc napoli",
  "ssc napoli": "napoli",
  "juve": "juventus",
  "barca": "barcelona",
  "barça": "barcelona",
  "atletico": "atletico",
};

const TOKEN_ALIAS: Record<string, string> = {
  utd: "united",
  ath: "athletic",
};

function foldKey(raw: string): string {
  return String(raw || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function expandPodTeamName(raw: string): string {
  const key = foldKey(raw);
  if (!key)
    return String(raw || "").trim();
  return TEAM_ALIAS[key] || String(raw || "").trim();
}

export function aliasPodTeamTokens(tokens: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const mapped = TOKEN_ALIAS[token] || token;
    if (seen.has(mapped))
      continue;
    seen.add(mapped);
    out.push(mapped);
  }
  return out;
}
