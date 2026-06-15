#!/usr/bin/env node

/**
 * 校验 RAY SaveBet 行 Map 分布（对比 live odds API）。
 * Usage: node verify_save_bets.js [matchId]
 */

import { login, fetchOdds } from "../session.js";
import { groupRayOddsToSaveBets } from "../shared/save_bets.js";

async function main() {
  const { buildBetsForMatch } = await import(
    "../../../../match-engine/merge/bet_builder.js"
  );
  const matchId = process.argv[2];
  if (!matchId) {
    console.error("Usage: node verify_save_bets.js <matchId>");
    process.exit(1);
  }
  const session = await login();
  const payload = await fetchOdds(session, matchId);
  const bets = groupRayOddsToSaveBets(payload, /^获胜者$/);
  const stored = {
    [`RAY:${matchId}`]: { provider: "RAY", matchId, bets },
  };
  const src = (p, b) => ({
    Type: p,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID),
    AwayID: String(b.SourceAwayID),
    HomeOdds: b.HomeOdds,
    AwayOdds: b.AwayOdds,
    Status: b.Status,
  });
  const clientBets = buildBetsForMatch("RAY", matchId, 0, stored, src, "cs2");

  console.log(
    JSON.stringify(
      {
        matchId,
        saveBetRows: bets.map((b) => ({ Map: b.Map, BetName: b.BetName, SourceBetID: b.SourceBetID })),
        clientMatchBets: clientBets.map((b) => ({ Map: b.Map, Name: b.Name })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
