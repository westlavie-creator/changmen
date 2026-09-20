import { describe, expect, test } from "vitest";
import {
  readFootballFollowAttempts,
  recordFootballFollowAttempt,
} from "@/runtime/footballFollowAttempt";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("football follow attempt log", () => {
  test("records and reads local attempt rows", () => {
    const storage = memoryStorage();
    const row = recordFootballFollowAttempt({
      ticketId: "t1",
      venue: "OB",
      status: "manual_click",
      odds: 1.92,
      stake: 100,
      at: 1000,
      selection: {
        matchKey: "OB:123",
        venue: "OB",
        sourceMatchId: "123",
        period: "full",
        marketCode: "totals",
        line: 2.5,
        side: "over",
        oddId: "oid-1",
        confidence: "exact",
      },
    }, storage);

    expect(row?.selectionKey).toContain("OB:123|OB|full|totals|2.5|over|oid-1|exact");
    expect(readFootballFollowAttempts(storage)).toHaveLength(1);
  });

  test("dedupes repeated status and reason in a short window", () => {
    const storage = memoryStorage();
    const first = recordFootballFollowAttempt({
      ticketId: "t1",
      venue: "OB",
      status: "blocked",
      reason: "锁盘",
      at: 1000,
    }, storage);
    const second = recordFootballFollowAttempt({
      ticketId: "t1",
      venue: "OB",
      status: "blocked",
      reason: "锁盘",
      at: 1200,
    }, storage);

    expect(second?.id).toBe(first?.id);
    expect(readFootballFollowAttempts(storage)).toHaveLength(1);
  });

  test("keeps only the newest 200 rows", () => {
    const storage = memoryStorage();
    for (let i = 0; i < 205; i++) {
      recordFootballFollowAttempt({
        ticketId: `t${i}`,
        venue: "OB",
        status: "failed",
        reason: `r${i}`,
        at: 1000 + i,
      }, storage);
    }

    const rows = readFootballFollowAttempts(storage);
    expect(rows).toHaveLength(200);
    expect(rows[0].ticketId).toBe("t204");
    expect(rows.at(-1)?.ticketId).toBe("t5");
  });

  test("storage failures are swallowed", () => {
    const badStorage = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("boom");
      },
    };

    expect(recordFootballFollowAttempt({
      ticketId: "t1",
      venue: "OB",
      status: "failed",
    }, badStorage)).toBeNull();
    expect(readFootballFollowAttempts(badStorage)).toEqual([]);
  });
});
