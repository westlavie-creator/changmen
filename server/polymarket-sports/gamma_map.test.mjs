import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchGammaEventByGameId,
  gammaEventToSportMessage,
  parseMapsFromGammaMarkets,
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

test("gammaEventToSportMessage maps live score", () => {
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
      {
        sportsMarketType: "child_moneyline",
        groupItemTitle: "Map 2 Winner",
        outcomes: "[\"Misa Esports\", \"Team Liquid Academy\"]",
        outcomePrices: "[\"0.9995\", \"0.0005\"]",
      },
    ],
  };
  const msg = gammaEventToSportMessage(event);
  assert.equal(msg?.status, "running");
  assert.equal(msg?.homeTeam, "Misa Esports");
  assert.equal(msg?.resolutionSource, "https://www.twitch.tv/valorant_tur");
  assert.equal(msg?.maps?.length, 2);
  assert.equal(msg?.maps?.[0]?.winner, "away");
  assert.equal(msg?.maps?.[1]?.winner, "home");
  const snap = buildPmSportSnapshot(msg);
  assert.match(snap.label || "", /图1客·图2主/);
  assert.match(snap.label || "", /来源 twitch\.tv/);
});

test("parseMapsFromGammaMarkets skips undecided map", () => {
  const maps = parseMapsFromGammaMarkets({
    markets: [
      {
        sportsMarketType: "child_moneyline",
        groupItemTitle: "Map 3 Winner",
        outcomes: "[\"A\", \"B\"]",
        outcomePrices: "[\"0.48\", \"0.52\"]",
      },
    ],
  }, "A", "B");
  assert.equal(maps.length, 0);
});

test("fetchGammaEventByGameId uses game_id filter", async () => {
  const row = await fetchGammaEventByGameId(1534520);
  assert.equal(row?.id, "636844");
  assert.equal(row?.slug, "val-mis-tla-2026-06-29");
});
