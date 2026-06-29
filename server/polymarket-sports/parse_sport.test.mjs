import assert from "node:assert/strict";
import test from "node:test";
import {
  alignPmSportSnapshot,
  buildPmSportDisplayLine,
  buildPmSportLabel,
  buildPmSportSnapshot,
  formatElapsed,
  formatInMapScore,
  formatMapsWinners,
  formatResolutionSource,
  isPlaceholderInMapScore,
  parseEsportsScore,
  parsePeriodToCurrentMap,
} from "./parse_sport.js";

test("parseEsportsScore splits map score and bo", () => {
  const row = parseEsportsScore("000-000|2-0|Bo3");
  assert.deepEqual(row.mapScore, { home: 2, away: 0 });
  assert.equal(row.bo, 3);
});

test("parsePeriodToCurrentMap", () => {
  assert.equal(parsePeriodToCurrentMap("2/3"), 2);
  assert.equal(parsePeriodToCurrentMap(undefined), null);
});

test("buildPmSportSnapshot records map winner on score delta", () => {
  const first = buildPmSportSnapshot({
    gameId: 1,
    slug: "cs2-a-b",
    homeTeam: "A",
    awayTeam: "B",
    status: "running",
    live: true,
    ended: false,
    score: "000-000|0-0|Bo3",
    period: "1/3",
  });
  const second = buildPmSportSnapshot({
    gameId: 1,
    slug: "cs2-a-b",
    homeTeam: "A",
    awayTeam: "B",
    status: "running",
    live: true,
    ended: false,
    score: "000-000|1-0|Bo3",
    period: "2/3",
  }, first);
  assert.equal(second.maps.length, 1);
  assert.equal(second.maps[0].winner, "home");
  assert.equal(second.maps[0].winnerName, "A");
});

test("buildPmSportLabel finished", () => {
  assert.equal(
    buildPmSportLabel({ status: "finished", ended: true, mapScore: { home: 2, away: 0 } }),
    "已结束 · 2-0",
  );
});

test("formatInMapScore trims leading zeros", () => {
  assert.equal(formatInMapScore("012-010"), "12-10");
  assert.equal(formatInMapScore("000-000"), "0-0");
});

test("isPlaceholderInMapScore detects PM Gamma CS2 placeholder", () => {
  const liveMap2 = {
    live: true,
    currentMap: 2,
    mapScore: { home: 1, away: 0 },
  };
  assert.equal(isPlaceholderInMapScore("0-0", liveMap2), true);
  assert.equal(isPlaceholderInMapScore("000-000", liveMap2), true);
  assert.equal(isPlaceholderInMapScore("8-5", liveMap2), false);
  assert.equal(isPlaceholderInMapScore("0-0", { live: true, currentMap: 1, mapScore: { home: 0, away: 0 } }), false);
});

test("buildPmSportDisplayLine hides placeholder in-map on live map 2", () => {
  const line = buildPmSportDisplayLine({
    status: "running",
    live: true,
    ended: false,
    period: "2/3",
    currentMap: 2,
    mapScore: { home: 1, away: 0 },
    inMapScore: "0-0",
    maps: [{ map: 1, winner: "home" }],
  });
  assert.match(line, /进行中 · 2\/3 · 1-0/);
  assert.equal(line.includes("图内"), false);
});

test("formatMapsWinners compact line", () => {
  assert.equal(
    formatMapsWinners([{ map: 1, winner: "home" }, { map: 2, winner: "away" }]),
    "图1主·图2客",
  );
});

test("formatResolutionSource shortens URL", () => {
  assert.equal(
    formatResolutionSource("https://www.twitch.tv/valorant_tur"),
    "来源 twitch.tv/valorant_tur",
  );
});

test("buildPmSportDisplayLine single row", () => {
  const line = buildPmSportDisplayLine({
    status: "running",
    live: true,
    ended: false,
    period: "3/3",
    mapScore: { home: 1, away: 1 },
    inMapScore: "12-10",
    elapsed: "3720",
    maps: [{ map: 1, winner: "home" }, { map: 2, winner: "away" }],
    resolutionSource: "https://vlr.gg",
  });
  assert.match(line, /进行中 · 3\/3 · 1-1/);
  assert.match(line, /图内12-10/);
  assert.match(line, /已进行62:00/);
  assert.match(line, /图1主·图2客/);
  assert.match(line, /来源 vlr\.gg/);
  assert.equal(line.includes("\n"), false);
});

test("buildPmSportSnapshot sets full label", () => {
  const snap = buildPmSportSnapshot({
    gameId: 1,
    status: "running",
    live: true,
    ended: false,
    score: "12-10|1-1|Bo3",
    period: "3/3",
    elapsed: "120",
    resolutionSource: "https://vlr.gg",
    homeTeam: "A",
    awayTeam: "B",
    maps: [{ map: 1, winner: "home", winnerName: "A" }, { map: 2, winner: "away", winnerName: "B" }],
  });
  assert.equal(snap.inMapScore, "12-10");
  assert.equal(snap.resolutionSource, "https://vlr.gg");
  assert.match(snap.label, /图内12-10/);
  assert.match(snap.label, /图1主·图2客/);
});

test("alignPmSportSnapshot flips map score, in-map score, and map winners", () => {
  const raw = buildPmSportSnapshot({
    gameId: 1,
    status: "running",
    live: true,
    ended: false,
    score: "12-10|2-1|Bo3",
    period: "3/3",
    elapsed: "120",
    homeTeam: "PM-Home",
    awayTeam: "PM-Away",
    maps: [
      { map: 1, winner: "home", winnerName: "PM-Home" },
      { map: 2, winner: "away", winnerName: "PM-Away" },
    ],
  });
  const aligned = alignPmSportSnapshot(raw, true);
  assert.deepEqual(aligned.mapScore, { home: 1, away: 2 });
  assert.equal(aligned.inMapScore, "10-12");
  assert.equal(aligned.homeTeam, "PM-Away");
  assert.equal(aligned.awayTeam, "PM-Home");
  assert.equal(aligned.maps[0].winner, "away");
  assert.equal(aligned.maps[0].winnerName, "PM-Away");
  assert.equal(aligned.maps[1].winner, "home");
  assert.equal(aligned.maps[1].winnerName, "PM-Home");
  assert.match(aligned.label, /图1客·图2主/);
  assert.match(aligned.label, /图内10-12/);
});

test("alignPmSportSnapshot no-op when not reversed", () => {
  const raw = buildPmSportSnapshot({
    gameId: 1,
    status: "finished",
    ended: true,
    score: "000-000|2-0|Bo3",
    homeTeam: "A",
    awayTeam: "B",
  });
  assert.equal(alignPmSportSnapshot(raw, false), raw);
});

test("buildPmSportSnapshot derives maps when msg.maps absent", () => {
  const first = buildPmSportSnapshot({
    gameId: 1,
    status: "running",
    live: true,
    ended: false,
    score: "000-000|0-0|Bo3",
    period: "1/3",
    homeTeam: "A",
    awayTeam: "B",
  });
  const second = buildPmSportSnapshot({
    gameId: 1,
    status: "running",
    live: true,
    ended: false,
    score: "000-000|1-0|Bo3",
    period: "2/3",
    homeTeam: "A",
    awayTeam: "B",
  }, first);
  assert.equal(second.maps.length, 1);
  assert.equal(second.maps[0].winner, "home");
});
