import { describe, expect, it } from "vitest";
import { runPmFootballDiscoveryCycle } from "./loop.js";

describe("runPmFootballDiscoveryCycle", () => {
  it("publishes a non-empty football snapshot", async () => {
    const writes = [];
    const result = await runPmFootballDiscoveryCycle({
      fetchRows: async () => [{ ID: 1, Title: "A vs B" }],
      readSnapshot: () => null,
      writeSnapshot: (rows, at) => writes.push({ rows, at }),
      now: () => 123,
    });
    expect(result).toEqual({ skipped: false, matches: 1, publishedAt: 123 });
    expect(writes).toEqual([{ rows: [{ ID: 1, Title: "A vs B" }], at: 123 }]);
  });

  it("does not replace an existing snapshot with an empty refresh", async () => {
    const prior = { at: 99, rows: [{ ID: 7, Title: "Old" }] };
    const writes = [];
    const result = await runPmFootballDiscoveryCycle({
      fetchRows: async () => [],
      readSnapshot: () => prior,
      writeSnapshot: (rows, at) => writes.push({ rows, at }),
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("empty-refresh");
    expect(writes).toEqual([{ rows: prior.rows, at: 99 }]);
  });

  it("publishes an empty first snapshot", async () => {
    const writes = [];
    const result = await runPmFootballDiscoveryCycle({
      fetchRows: async () => [],
      readSnapshot: () => null,
      writeSnapshot: (rows, at) => writes.push({ rows, at }),
      now: () => 456,
    });
    expect(result).toEqual({ skipped: false, matches: 0, publishedAt: 456 });
    expect(writes).toEqual([{ rows: [], at: 456 }]);
  });

  it("keeps the existing snapshot untouched when the live refresh fails", async () => {
    const writes = [];
    await expect(runPmFootballDiscoveryCycle({
      fetchRows: async () => {
        throw new Error("upstream unavailable");
      },
      readSnapshot: () => ({ at: 99, rows: [{ ID: 7, Title: "Old" }] }),
      writeSnapshot: (rows, at) => writes.push({ rows, at }),
    })).rejects.toThrow("upstream unavailable");
    expect(writes).toEqual([]);
  });
});
