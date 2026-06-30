import assert from "node:assert/strict";
import test from "node:test";
import {
  gammaEventToSportMessage,
  parseTeamsFromGammaTitle,
} from "./gamma_map.js";
import { buildPmSportSnapshot } from "./parse_sport.js";

test("parseTeamsFromGammaTitle", () => {
  const row = parseTeamsFromGammaTitle(
    "Valorant: Misa Esports vs Team Liquid Academy (BO3) - VCL",
  );
  assert.equal(row.home, "Misa Esports");
  assert.equal(row.away, "Team Liquid Academy");
});

test("gammaEventToSportMessage maps live score without inferring map winners", () => {
  const event = {
    gameId: 1534520,
    slug: "val-mis-tla",
    title: "Valorant: Misa Esports vs Team Liquid Academy (BO3)",
    score: "0-0|1-1|Bo3",
    period: "3/3",
    live: true,
    ended: false,
    resolutionSource: "https://www.twitch.tv/valorant_tur",
    markets: [
      {
        sportsMarketType: "child_moneyline",
        groupItemTitle: "Map 1 Winner",
        outcomes: "[\"Misa Esports\", \"Team Liquid Academy\"]",
        outcomePrices: "[\"0.0005\", \"0.9995\"]",
      },
    ],
  };
  const msg = gammaEventToSportMessage(event);
  assert.equal(msg?.status, "running");
  assert.equal(msg?.maps, undefined);
  const snap = buildPmSportSnapshot(msg);
  assert.match(snap.label || "", /进行中 · 3\/3 · 1-1/);
  assert.match(snap.label || "", /来源 twitch\.tv/);
  assert.equal(snap.label?.includes("图1"), false);
});
