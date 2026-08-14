/**
 * Phase B1：同 rotNum sibling 的地图盘拼进 Sources.PB；Matchs.PB 仍为主 event.id。
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";
import { clusterByGbThenName } from "../compose/cluster/merge_clusters.js";
import { resolveIdsDryRun } from "../compose/ids/resolve_ids.js";
import {
  listPbEventIdsForProjection,
} from "../compose/normalize/pb_rotnum_collapse.js";
import { projectList } from "../compose/sides/project_sources.js";
import {
  collectPeriods,
  resolveMatchStructure,
} from "../compose/structure/resolve_structure.js";
import { installPlugin, pmOb, pmPb } from "./fixtures.mjs";

const LIVE_ID = "1633928872";
const PRE_ID = "1633895060";
const ROT = "31832";

function pbLive(extra = {}) {
  return { ...pmPb, SourceMatchID: LIVE_ID, RotNum: ROT, ...extra };
}

function pbPrematch(extra = {}) {
  return { ...pmPb, SourceMatchID: PRE_ID, RotNum: ROT, ...extra };
}

function stitchMatches() {
  return {
    OB: { ob1: pmOb },
    PB: {
      [LIVE_ID]: pbLive(),
      [PRE_ID]: pbPrematch(),
    },
  };
}

/** live 有 Map0；prematch 有 Map2/3（未开图） */
function stitchBets() {
  return {
    [`PB:${LIVE_ID}`]: [{
      Map: 0,
      BetName: "Match Winner",
      SourceBetID: `${LIVE_ID}:0`,
      SourceHomeID: `${LIVE_ID}|0|1|0|0|0|0`,
      SourceAwayID: `${LIVE_ID}|0|1|1|0|0|1`,
      HomeOdds: 1.8,
      AwayOdds: 2.0,
      Status: "Normal",
    }],
    [`PB:${PRE_ID}`]: [
      {
        Map: 2,
        BetName: "Match Winner",
        SourceBetID: `${PRE_ID}:2`,
        SourceHomeID: `${PRE_ID}|2|1|0|0|0|0`,
        SourceAwayID: `${PRE_ID}|2|1|1|0|0|1`,
        HomeOdds: 1.9,
        AwayOdds: 1.95,
        Status: "Normal",
      },
      {
        Map: 3,
        BetName: "Match Winner",
        SourceBetID: `${PRE_ID}:3`,
        SourceHomeID: `${PRE_ID}|3|1|0|0|0|0`,
        SourceAwayID: `${PRE_ID}|3|1|1|0|0|1`,
        HomeOdds: 1.7,
        AwayOdds: 2.1,
        Status: "Normal",
      },
    ],
    "OB:ob1": [{
      Map: 0,
      BetName: "[全场]-获胜",
      SourceBetID: "ob-m0",
      SourceHomeID: "oid-nip",
      SourceAwayID: "oid-k27",
      HomeOdds: 1.85,
      AwayOdds: 2.05,
      Status: "Normal",
    }],
  };
}

afterEach(() => {
  delete process.env.COMPOSER_PB_ROTNUM_COLLAPSE;
});

describe("PB rotNum stitch (Phase B1)", () => {
  it("listPbEventIdsForProjection = primary + siblings", () => {
    const matches = stitchMatches();
    const row = {
      Matchs: { PB: LIVE_ID },
      _pbSiblingSourceMatchIds: [PRE_ID],
    };
    assert.deepEqual(
      listPbEventIdsForProjection(row, matches).sort(),
      [LIVE_ID, PRE_ID].sort(),
    );
  });

  it("collectPeriods includes sibling maps", () => {
    installPlugin();
    const matches = stitchMatches();
    const bets = stitchBets();
    const row = {
      Matchs: { OB: "ob1", PB: LIVE_ID },
      _pbSiblingSourceMatchIds: [PRE_ID],
    };
    assert.deepEqual(collectPeriods(row, bets, 0, matches), [0, 2, 3]);
  });

  it("project stitches sibling map Sources; Matchs.PB stays primary", () => {
    installPlugin();
    const matches = stitchMatches();
    const bets = stitchBets();
    let list = clusterByGbThenName(matches, [], {
      pbRotnumCollapse: true,
      bets,
    });
    assert.equal(list.length, 1);
    assert.equal(list[0].Matchs.PB, LIVE_ID);
    let info = resolveIdsDryRun(list, { matches, existingClientRows: [] });
    resolveMatchStructure(info, { matches, timers: {}, bets });
    assert.deepEqual(info[0]._periods, [0, 2, 3]);
    projectList(info, { matches, bets, existingClientRows: [] });

    assert.equal(info[0].Matchs.PB, LIVE_ID);

    const map0 = info[0].Bets.find(b => Number(b.Map) === 0);
    assert.ok(map0?.Sources?.PB);
    assert.equal(map0.Sources.PB.BetID, `${LIVE_ID}:0`);
    assert.equal(map0.Sources.PB.HomeID, `${LIVE_ID}|0|1|0|0|0|0`);

    const map2 = info[0].Bets.find(b => Number(b.Map) === 2);
    assert.ok(map2?.Sources?.PB, "Map2 should come from prematch sibling");
    assert.equal(map2.Sources.PB.BetID, `${PRE_ID}:2`);
    assert.equal(map2.Sources.PB.HomeID, `${PRE_ID}|2|1|0|0|0|0`);

    const map3 = info[0].Bets.find(b => Number(b.Map) === 3);
    assert.ok(map3?.Sources?.PB);
    assert.equal(map3.Sources.PB.BetID, `${PRE_ID}:3`);
  });

  it("COMPOSER_PB_ROTNUM_COLLAPSE=0 disables sibling periods", () => {
    process.env.COMPOSER_PB_ROTNUM_COLLAPSE = "0";
    installPlugin();
    const matches = stitchMatches();
    const bets = stitchBets();
    const row = {
      Matchs: { OB: "ob1", PB: LIVE_ID },
      _pbSiblingSourceMatchIds: [PRE_ID],
    };
    assert.deepEqual(collectPeriods(row, bets, 0, matches), [0]);
  });
});
