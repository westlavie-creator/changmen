import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { clientMatchWriteRow, gbTeamIdForWrite } from "../src/write_payload.js";

describe("gbTeamIdForWrite / production lock safety", () => {
  it("undefined without clear flag → null (SQL keeps old lock)", () => {
    assert.equal(gbTeamIdForWrite({ HomeGbTeamId: undefined }, "home"), null);
    assert.equal(gbTeamIdForWrite({}, "away"), null);
  });

  it("_clearGbLock → 0 sentinel (SQL clears)", () => {
    assert.equal(gbTeamIdForWrite({ _clearGbLock: true, HomeGbTeamId: undefined }, "home"), 0);
    assert.equal(gbTeamIdForWrite({ _clearGbLock: true, AwayGbTeamId: "100297" }, "away"), 0);
  });

  it("normal ids pass through", () => {
    assert.equal(gbTeamIdForWrite({ HomeGbTeamId: "100631" }, "home"), "100631");
  });

  it("clientMatchWriteRow encodes clear vs keep", () => {
    const cleared = clientMatchWriteRow({
      ID: 1,
      Title: "a vs b",
      Matchs: {},
      Bets: [],
      Reverse: [],
      _clearGbLock: true,
    }, 123);
    assert.equal(cleared.home_gb_team_id, 0);
    assert.equal(cleared.away_gb_team_id, 0);

    const keep = clientMatchWriteRow({
      ID: 2,
      Title: "a vs b",
      Matchs: {},
      Bets: [],
      Reverse: [],
      HomeGbTeamId: "100631",
      AwayGbTeamId: "100297",
    }, 123);
    assert.equal(keep.home_gb_team_id, "100631");

    const legacyFail = clientMatchWriteRow({
      ID: 3,
      Title: "a vs b",
      Matchs: { IA: "1" },
      Bets: [],
      Reverse: [],
      // finalize 失败未写 gb — 必须 null 保留旧锁，禁止 0
    }, 123);
    assert.equal(legacyFail.home_gb_team_id, null);
    assert.equal(legacyFail.away_gb_team_id, null);
  });
});
