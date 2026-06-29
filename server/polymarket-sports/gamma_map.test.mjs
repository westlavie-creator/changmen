import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchGammaEventByGameId,
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

test("gammaEventToSportMessage maps live score", () => {
  const msg = gammaEventToSportMessage({
    gameId: 1534520,
    slug: "val-mis-tla",
    title: "Valorant: Misa Esports vs Team Liquid Academy (BO3)",
    score: "0-0|1-1|Bo3",
    period: "3/3",
    live: true,
    ended: false,
    resolutionSource: "https://www.twitch.tv/valorant_tur",
  });
  assert.equal(msg?.status, "running");
  assert.equal(msg?.homeTeam, "Misa Esports");
  assert.equal(msg?.resolutionSource, "https://www.twitch.tv/valorant_tur");
  const snap = buildPmSportSnapshot(msg);
  assert.match(snap.label || "", /来源 twitch\.tv/);
});

test("fetchGammaEventByGameId uses game_id filter", async () => {
  const row = await fetchGammaEventByGameId(1534520);
  assert.equal(row?.id, "636844");
  assert.equal(row?.slug, "val-mis-tla-2026-06-29");
});
