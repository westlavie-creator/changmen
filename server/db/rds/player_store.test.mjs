import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  batchSavePlayerAccountRecords,
  batchUpdatePlayerDisplayNames,
  fetchPlayersByIds,
  saveAccountRecordsForOwner,
} from "./player_store.js";

const queryMock = vi.fn();

vi.mock("./common.js", () => ({
  getPgPool: () => ({ query: queryMock }),
  _jsonb: (val, fallback) => JSON.stringify(val ?? fallback ?? null),
}));

describe("player_store batch SQL", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [], rowCount: 2 });
  });

  it("fetchPlayersByIds uses ANY($1::bigint[])", async () => {
    await fetchPlayersByIds([7, 8]);
    expect(queryMock).toHaveBeenCalledOnce();
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/id = ANY\(\$1::bigint\[\]\)/);
    expect(params).toEqual([[7, 8]]);
  });

  it("batchUpdatePlayerDisplayNames uses unnest", async () => {
    await batchUpdatePlayerDisplayNames("user-1", [
      { playerId: 7, platformName: "A" },
      { playerId: 8, platformName: "B" },
    ]);
    expect(queryMock).toHaveBeenCalledOnce();
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/unnest\(\$1::bigint\[\], \$2::text\[\]\)/);
    expect(params[0]).toEqual([7, 8]);
    expect(params[1]).toEqual(["A", "B"]);
    expect(params[3]).toBe("user-1");
  });

  it("batchSavePlayerAccountRecords uses unnest jsonb[]", async () => {
    await batchSavePlayerAccountRecords("user-1", [
      {
        accountId: 7,
        platformName: "OB-1",
        playerName: "u1",
        provider: "OB",
        venueMemberId: "610738",
        credit: 0,
        balance: 100,
        token: "x",
      },
    ]);
    expect(queryMock).toHaveBeenCalledTimes(2);
    const [sql, params] = queryMock.mock.calls[1];
    expect(sql).toMatch(/\$9::jsonb\[\]/);
    expect(sql).toMatch(/venue_account_key/);
    expect(params[0]).toEqual([7]);
    expect(params[11]).toBe("user-1");
    expect(params[8][0]).toMatchObject({ token: "x" });
  });

  it("saveAccountRecordsForOwner delegates to batch save", async () => {
    await saveAccountRecordsForOwner("user-1", [{ accountId: 7, provider: "OB", balance: 1 }]);
    expect(queryMock.mock.calls.some(([sql]) => /unnest\(/.test(sql))).toBe(true);
  });
});
